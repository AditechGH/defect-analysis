/**
 * CNF Defect Dashboard — real-time collaboration server
 * Serves the dashboard HTML and syncs edits across all connected clients via WebSocket.
 * Edit state is persisted to edits.json so changes survive server restarts.
 */
const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const { WebSocketServer } = require('ws');

const PORT      = process.env.PORT || 3000;
const HTML_FILE = path.join(__dirname, 'defect_dashboard.html');
const STORE_FILE= path.join(__dirname, 'edits.json');

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

// ── HTTP server — serves only the dashboard ───────────────────────────────
const httpServer = http.createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
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
        // Mirror into localStorage so offline behaviour still works
        try {
          const ovr = JSON.parse(localStorage.getItem('cnf-overrides')||'{}');
          ovr[msg.key] = msg.data;
          localStorage.setItem('cnf-overrides', JSON.stringify(ovr));
        } catch(e){}
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
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

// ── WebSocket server ───────────────────────────────────────────────────────
const wss = new WebSocketServer({ server: httpServer });
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log(`Client connected  (${clients.size} total)`);

  ws.on('message', (raw) => {
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
      saveStore(editStore);
      console.log(`Edit saved: ${msg.key} (${msg.data.assignee || '—'} | FF:${msg.data.isFalseFlag})`);

      // Broadcast to every OTHER client
      const payload = JSON.stringify({ type: 'edit', key: msg.key, data: msg.data });
      for (const client of clients) {
        if (client !== ws && client.readyState === 1 /* OPEN */) {
          client.send(payload);
        }
      }
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`Client disconnected (${clients.size} remaining)`);
  });
});

// ── Start ──────────────────────────────────────────────────────────────────
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
