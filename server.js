/**
 * CNF Defect Dashboard — real-time collaboration server
 * Serves the dashboard HTML and syncs edits across all connected clients via WebSocket.
 * Edit state is persisted to edits.json so changes survive server restarts.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { WebSocketServer } = require('ws');

function loadDotEnv(envPath) {
  try {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eqIdx = line.indexOf('=');
      if (eqIdx <= 0) continue;
      const key = line.slice(0, eqIdx).trim();
      const value = line.slice(eqIdx + 1).trim();
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // .env is optional.
  }
}

loadDotEnv(path.join(__dirname, '.env'));

const PORT = process.env.PORT || 3000;
const HTML_FILE = path.join(__dirname, 'defect_dashboard.html');
const STORE_FILE = path.join(__dirname, 'edits.json');
const JSONBIN_BASE = 'https://api.jsonbin.io/v3';
const JSONBIN_ID_FILE = path.join(__dirname, '.jsonbin-bin-id');
const JSONBIN_ACCESS_KEY =
  process.env.JSONBIN_ACCESS_KEY ||
  process.env['X-ACCESS-KEY'] ||
  process.env['X_ACCESS_KEY'] ||
  '';
const JSONBIN_COLLECTION_ID = process.env.JSONBIN_COLLECTION_ID || '';

let jsonBinId =
  process.env.JSONBIN_BIN_ID ||
  process.env.JSONBIN_BINID ||
  '';

if (!jsonBinId) {
  try {
    jsonBinId = fs.readFileSync(JSONBIN_ID_FILE, 'utf8').trim();
  } catch {
    jsonBinId = '';
  }
}

// ── Persistent edit store ─────────────────────────────────────────────────
function loadStore() {
  try { return JSON.parse(fs.readFileSync(STORE_FILE, 'utf8')); }
  catch { return {}; }
}
function saveStore(store) {
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2));
}
let editStore = loadStore();
console.log(`Loaded ${Object.keys(editStore).length} existing edits from edits.json`);

function writeJsonBinId(id) {
  try { fs.writeFileSync(JSONBIN_ID_FILE, String(id || '').trim(), 'utf8'); }
  catch { /* non-fatal */ }
}

function jsonBinRequest(method, endpointPath, payload = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpointPath, JSONBIN_BASE);
    const body = payload === null ? null : JSON.stringify(payload);

    const req = https.request(
      url,
      {
        method,
        headers: {
          'X-Access-Key': JSONBIN_ACCESS_KEY,
          'Content-Type': 'application/json',
          ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          let parsed = null;
          try { parsed = raw ? JSON.parse(raw) : null; }
          catch { parsed = raw; }

          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
            return;
          }
          const msg =
            (parsed && parsed.message) ||
            `JSONBin request failed (${res.statusCode})`;
          reject(new Error(msg));
        });
      }
    );

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function ensureJsonBinReady() {
  if (!JSONBIN_ACCESS_KEY) return false;

  if (!jsonBinId) {
    const createPath = JSONBIN_COLLECTION_ID
      ? `/b?collectionId=${encodeURIComponent(JSONBIN_COLLECTION_ID)}`
      : '/b';
    const created = await jsonBinRequest('POST', createPath, editStore);
    jsonBinId = created?.metadata?.id || created?.record?.id || '';
    if (!jsonBinId) throw new Error('JSONBin create succeeded but no bin id returned');
    writeJsonBinId(jsonBinId);
    console.log('Created JSONBin for edits persistence.');
    return true;
  }

  const remote = await jsonBinRequest('GET', `/b/${encodeURIComponent(jsonBinId)}/latest`);
  if (remote && typeof remote.record === 'object' && remote.record !== null) {
    editStore = remote.record;
    saveStore(editStore);
    console.log(`Loaded ${Object.keys(editStore).length} edits from JSONBin.`);
  }
  return true;
}

async function persistStore() {
  if (JSONBIN_ACCESS_KEY && jsonBinId) {
    await jsonBinRequest('PUT', `/b/${encodeURIComponent(jsonBinId)}`, editStore);
  }
  saveStore(editStore);
}

function sendJson(res, code, payload) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1e6) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

// ── HTTP server — serves only the dashboard ───────────────────────────────
const httpServer = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = reqUrl.pathname;

  if (req.method === 'GET' && pathname === '/api/edits') {
    return sendJson(res, 200, editStore);
  }

  if (req.method === 'PUT' && pathname.startsWith('/api/edits/')) {
    const key = decodeURIComponent(pathname.substring('/api/edits/'.length));
    if (!key) return sendJson(res, 400, { error: 'Missing edit key' });

    try {
      const data = await readJsonBody(req);
      editStore[key] = data;
      await persistStore();
      console.log(`Edit saved via API: ${key} (${data.assignee || '—'} | FF:${data.isFalseFlag})`);
      broadcastEdit(key, data);
      return sendJson(res, 200, { ok: true });
    } catch (err) {
      const msg = err && err.message ? err.message : 'Invalid JSON payload';
      return sendJson(res, 400, { error: msg });
    }
  }

  if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
    fs.readFile(HTML_FILE, 'utf8', (err, data) => {
      if (err) { res.writeHead(500); return res.end('Dashboard file not found'); }
      // Inject the WebSocket client script just before </body>
      const wsScript = `
<script>
// ── Real-time sync layer (injected by server) ─────────────────────────────
(function(){
  const WS_URL = location.origin.replace(/^http/, 'ws');
  let ws, reconnectTimer;

  function connect(){
    ws = new WebSocket(WS_URL);

    ws.onopen = function(){
      clearTimeout(reconnectTimer);
      showSyncStatus('🟢 Live');
      // Request current store on connect
      ws.send(JSON.stringify({ type: 'hello' }));
    };

    ws.onmessage = function(evt){
      const msg = JSON.parse(evt.data);

      if(msg.type === 'store'){
        // Full store dump on connect — apply all edits silently then refresh stats
        for(const [key, data] of Object.entries(msg.store)){
          if(typeof _applyToRows === 'function') _applyToRows(key, data);
        }
        if(typeof renumberRows    === 'function') renumberRows();
        if(typeof refreshAllStats === 'function') refreshAllStats();
        return;
      }

      if(msg.type === 'edit'){
        // Another client saved an edit — apply it live and refresh stats
        if(typeof _applyToRows    === 'function') _applyToRows(msg.key, msg.data);
        if(typeof renumberRows    === 'function') renumberRows();
        if(typeof refreshAllStats === 'function') refreshAllStats();
        showSyncStatus('🔄 Updated');
        setTimeout(()=>showSyncStatus('🟢 Live'), 1500);
        return;
      }
    };

    ws.onclose = function(){
      showSyncStatus('🔴 Disconnected — reconnecting…');
      reconnectTimer = setTimeout(connect, 3000);
    };

    ws.onerror = function(){ ws.close(); };
  }

  // Listen for the cnf:edit event fired by saveEdit() and broadcast via WS
  document.addEventListener('DOMContentLoaded', function(){
    document.addEventListener('cnf:edit', function(e){
      const { key, data } = e.detail;
      if(ws && ws.readyState === 1){
        ws.send(JSON.stringify({ type: 'edit', key, data }));
      }
    });
    connect();
  });

  function showSyncStatus(txt){
    let el = document.getElementById('sync-status');
    if(!el){
      el = document.createElement('div');
      el.id = 'sync-status';
      el.style.cssText = 'position:fixed;bottom:24px;right:20px;background:var(--surface);'+
        'border:1px solid var(--border);border-radius:8px;padding:6px 14px;'+
        'font-size:12px;color:var(--text2);z-index:999;box-shadow:var(--shadow);'+
        'transition:opacity .3s;font-family:inherit;';
      document.body.appendChild(el);
    }
    el.textContent = txt;
  }
})();
</script>`;
      const injected = data.replace('</body>', wsScript + '\n</body>');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(injected);
    });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

// ── WebSocket server ───────────────────────────────────────────────────────
const wss = new WebSocketServer({ server: httpServer });
const clients = new Set();

function broadcastEdit(key, data, excludeClient = null) {
  const payload = JSON.stringify({ type: 'edit', key, data });
  for (const client of clients) {
    if (client !== excludeClient && client.readyState === 1 /* OPEN */) {
      client.send(payload);
    }
  }
}

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log(`Client connected  (${clients.size} total)`);

  ws.on('message', async (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'hello') {
      // Send full current store to the newly connected client
      ws.send(JSON.stringify({ type: 'store', store: editStore }));
      return;
    }

    if (msg.type === 'edit' && msg.key && msg.data) {
      // Persist
      editStore[msg.key] = msg.data;
      try {
        await persistStore();
        console.log(`Edit saved: ${msg.key} (${msg.data.assignee || '—'} | FF:${msg.data.isFalseFlag})`);
        broadcastEdit(msg.key, msg.data, ws);
      } catch (err) {
        console.error('Failed to persist websocket edit:', err.message || err);
      }
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`Client disconnected (${clients.size} remaining)`);
  });
});

// ── Start ──────────────────────────────────────────────────────────────────
async function startServer() {
  if (JSONBIN_ACCESS_KEY) {
    try {
      await ensureJsonBinReady();
      console.log('JSONBin persistence is enabled.');
    } catch (err) {
      console.error('JSONBin initialization failed, falling back to local edits.json:', err.message || err);
    }
  } else {
    console.log('JSONBin key not found in .env; using local edits.json persistence.');
  }

  httpServer.listen(PORT, () => {
    console.log('');
    console.log('╔════════════════════════════════════════╗');
    console.log(`║  CNF Defect Dashboard                  ║`);
    console.log(`║  http://localhost:${PORT}                  ║`);
    console.log('╚════════════════════════════════════════╝');
    console.log('');
    console.log('Run this in a second terminal to get a public URL:');
    console.log(`  npx localtunnel --port ${PORT}`);
    console.log('');
  });
}

startServer().catch((err) => {
  console.error('Fatal startup error:', err.message || err);
  process.exitCode = 1;
});
