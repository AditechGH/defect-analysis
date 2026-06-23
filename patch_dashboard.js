/**
 * patch_dashboard.js
 * Post-processes defect_dashboard.html to add:
 *   1. CSS for row numbering, Edit button, and the slim modal
 *   2. The modal HTML (2 fields: Assigned Developer + Flag as False Flag)
 *   3. The full interactive JS layer, including live refreshAll() after every save
 *
 * Row markup (data-key, # cell, Edit button) is already emitted by generate_dashboard_v2.js,
 * so no regex row-injection is needed here.
 */
const fs = require("fs");
const path = require("path");
const FILE = path.join(__dirname, "defect_dashboard.html");

let html = fs.readFileSync(FILE, "utf8");

// ── 1. Inject CSS ──────────────────────────────────────────────────────────
const newCSS = `
/* ── Row numbering ── */
.num-col{width:32px;text-align:center;font-size:11px;color:var(--text2);font-variant-numeric:tabular-nums;}
.issue-table th.num-col{width:32px;}

/* ── Edit button ── */
.actions-col{width:40px;text-align:center;white-space:nowrap;}
.act-btn{background:none;border:1px solid var(--border);border-radius:6px;
  color:var(--text2);font-size:13px;padding:2px 6px;cursor:pointer;line-height:1.4;transition:all .15s;}
.act-btn:hover{background:var(--accent);border-color:var(--accent);color:#fff;}

/* ── Edit modal ── */
.modal-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:2000;
  align-items:center;justify-content:center;backdrop-filter:blur(3px);}
.modal-overlay.open{display:flex;}
.modal{background:var(--surface);border:1px solid var(--border);border-radius:16px;
  width:min(440px,94vw);padding:28px 28px 24px;
  box-shadow:0 24px 64px rgba(0,0,0,.45);position:relative;}
.modal h2{font-size:1rem;font-weight:700;margin-bottom:4px;}
.modal .modal-key{font-size:12px;color:var(--accent);font-weight:600;margin-bottom:20px;display:block;}
.modal-close{position:absolute;top:14px;right:16px;background:none;border:none;
  font-size:20px;cursor:pointer;color:var(--text2);line-height:1;padding:2px 6px;border-radius:6px;}
.modal-close:hover{background:var(--surface2);color:var(--text);}
.form-row{display:flex;flex-direction:column;gap:5px;margin-bottom:16px;}
.form-row label{font-size:12px;color:var(--text2);font-weight:600;text-transform:uppercase;letter-spacing:.5px;}
.form-row select{background:var(--surface2);border:1px solid var(--border);border-radius:8px;
  color:var(--text);font-size:13px;padding:8px 12px;width:100%;outline:none;transition:border-color .15s;font-family:inherit;}
.form-row select:focus{border-color:var(--accent);}
.form-row select option{background:var(--surface2);color:var(--text);}
.ff-toggle-row{display:flex;align-items:center;gap:12px;padding:10px 14px;
  background:var(--surface2);border:1px solid var(--border);border-radius:8px;margin-bottom:20px;}
.ff-toggle-row label{font-size:13px;color:var(--text);cursor:pointer;flex:1;}
.ff-toggle-row input[type=checkbox]{width:16px;height:16px;accent-color:var(--purple);cursor:pointer;}
.modal-actions{display:flex;gap:10px;justify-content:flex-end;padding-top:16px;border-top:1px solid var(--border);}
.btn-save{background:var(--accent);border:none;border-radius:8px;color:#fff;
  font-size:13px;font-weight:600;padding:8px 22px;cursor:pointer;transition:opacity .15s;}
.btn-save:hover{opacity:.88;}
.btn-cancel{background:var(--surface2);border:1px solid var(--border);border-radius:8px;
  color:var(--text);font-size:13px;padding:8px 18px;cursor:pointer;transition:background .15s;}
.btn-cancel:hover{background:var(--border);}
.reassign-badge{font-size:10px;}
`;
html = html.replace("</style>", newCSS + "\n</style>");

// ── 2. Inject modal HTML ───────────────────────────────────────────────────
const modalHTML = `
<!-- ── Edit Modal (2 fields only) ── -->
<div class="modal-overlay" id="editModal" onclick="closeEditOnBg(event)">
  <div class="modal" role="dialog" aria-modal="true">
    <button class="modal-close" onclick="closeEdit()" title="Close">×</button>
    <h2 id="modal-title">Edit Defect</h2>
    <span class="modal-key" id="modal-key-display"></span>

    <div class="form-row">
      <label>Assigned Developer</label>
      <select id="edit-assignee">
        <option value="Abubakar Adamu">Abubakar Adamu</option>
        <option value="Adinan Alhassan">Adinan Alhassan</option>
        <option value="Abenezer Bayu">Abenezer Bayu</option>
        <option value="Emmy Bbaale">Emmy Bbaale</option>
        <option value="Ojobe Ekpor">Ojobe Ekpor</option>
        <option value="Kashish Goyal">Kashish Goyal</option>
        <option value="Michael Johnson">Michael Johnson</option>
        <option value="Nilesh Pore">Nilesh Pore</option>
        <option value="Touqeer Shakeel">Touqeer Shakeel</option>
        <option value="Bhanu Teja">Bhanu Teja</option>
      </select>
    </div>

    <div class="ff-toggle-row">
      <input type="checkbox" id="edit-ff" />
      <label for="edit-ff">⚑ Flag as False Flag</label>
    </div>

    <div class="modal-actions">
      <button class="btn-cancel" onclick="closeEdit()">Cancel</button>
      <button class="btn-save" onclick="saveEdit()">Save</button>
    </div>
  </div>
</div>
`;
html = html.replace("<footer>", modalHTML + "\n<footer>");

// ── 3. Replace the JS block ────────────────────────────────────────────────
// Use lastIndexOf so we target only the original tiny switchTab/toggleDev script at the
// end of the page — not the window.CNF_RAW data block in <head>.
const newScript = `
<script>
// ══════════════════════════════════════════════════════════════════════════
//  CNF Defect Dashboard — interactive layer v3
// ══════════════════════════════════════════════════════════════════════════

// ── localStorage store ────────────────────────────────────────────────────
// Shape: { [CNF-key]: { assignee: string, isFalseFlag: bool } }
function getOverrides(){ return JSON.parse(localStorage.getItem('cnf-overrides') || '{}'); }
function saveOverrides(o){ localStorage.setItem('cnf-overrides', JSON.stringify(o)); }

// ── Badge helpers ─────────────────────────────────────────────────────────
const PRIO_CLR = {Blocker:'#dc2626',Urgent:'#ea580c',High:'#d97706',Medium:'#2563eb',Low:'#16a34a'};
const TYPE_CLR = {'API / Backend':'#6366f1','UI / Frontend':'#ec4899',Security:'#dc2626',
  Validation:'#f59e0b','Data / CRUD':'#0891b2',Performance:'#d97706',Functional:'#94a3b8'};
const STATUS_CLR = {'Development Complete':'#16a34a','Ready for Testing':'#2563eb',
  'In Testing':'#7c3aed',Done:'#059669',Closed:'#059669',Resolved:'#059669',
  'In Development':'#f59e0b','Ready For Sprint':'#64748b',Blocked:'#dc2626'};

function bdg(val, map){ return \`<span class="badge" style="background:\${map[val]||'#64748b'}">\${val}</span>\`; }
const _avg = arr => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : null;
const _fmt = v => v === null || v === undefined ? '—' : (typeof v === 'number' ? v.toFixed(1) : String(v));

// ── computeLiveStats ──────────────────────────────────────────────────────
// Merges window.CNF_RAW with localStorage overrides. Returns per-dev summaries + totals.
function computeLiveStats(){
  const raw = window.CNF_RAW || {};
  const ovr = getOverrides();

  const devSummaries = [];
  let totalIssues=0, totalReal=0, totalFF=0;
  const allReal=[];
  let overallBounceSum=0;
  const overallRft=[], overallClose=[];
  const overallByStatus={};

  for(const [, d] of Object.entries(raw)){
    const issues = d.issues.map(i => {
      const o = ovr[i.key];
      if(!o) return i;
      return { ...i,
        isFalseFlag: o.isFalseFlag !== undefined ? o.isFalseFlag : i.isFalseFlag,
      };
    });

    const real = issues.filter(i => !i.isFalseFlag);
    const ffs  = issues.filter(i =>  i.isFalseFlag);
    totalIssues += issues.length;
    totalReal   += real.length;
    totalFF     += ffs.length;

    const byType={}, byPrio={}, byStatus={};
    let maxBounce=0, highBounce=null;
    for(const i of real){
      byType[i.defectType]  = (byType[i.defectType] ||0)+1;
      byPrio[i.priority]    = (byPrio[i.priority]   ||0)+1;
      byStatus[i.status]    = (byStatus[i.status]   ||0)+1;
      overallByStatus[i.status] = (overallByStatus[i.status]||0)+1;
      overallBounceSum += i.bounces;
      if(i.timeToRftDays   != null) overallRft.push(i.timeToRftDays);
      if(i.timeToCloseDays != null) overallClose.push(i.timeToCloseDays);
      if(i.bounces > maxBounce){ maxBounce = i.bounces; highBounce = i; }
      allReal.push({...i, devName: d.name});
    }

    const rftT   = real.filter(i=>i.timeToRftDays   != null).map(i=>i.timeToRftDays);
    const closeT = real.filter(i=>i.timeToCloseDays != null).map(i=>i.timeToCloseDays);
    const avgB   = real.length ? real.reduce((s,i)=>s+i.bounces,0)/real.length : 0;

    devSummaries.push({
      devId: d.name, name: d.name, email: d.email,
      total: issues.length, realCount: real.length, ffCount: ffs.length,
      byType, byPrio, byStatus,
      avgBounces: +avgB.toFixed(1), maxBounce, highBounce,
      avgRftDays:   _avg(rftT)   !== null ? +_avg(rftT).toFixed(1)   : null,
      avgCloseDays: _avg(closeT) !== null ? +_avg(closeT).toFixed(1) : null,
    });
  }

  return { devSummaries, totalIssues, totalReal, totalFF, allReal,
           overallBounceSum, overallRft, overallClose, overallByStatus };
}

// ── refreshKpis ───────────────────────────────────────────────────────────
function refreshKpis(){
  const s = computeLiveStats();
  const set = (id, v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
  set('kpi-total',        s.totalIssues);
  set('kpi-real',         s.totalReal);
  set('kpi-ff',           s.totalFF);
  set('kpi-avg-bounces',  s.allReal.length > 0 ? (s.overallBounceSum/s.allReal.length).toFixed(1) : '—');
  set('kpi-avg-rft',      s.overallRft.length   > 0 ? _avg(s.overallRft).toFixed(1)   : '—');
  set('kpi-avg-close',    s.overallClose.length > 0 ? _avg(s.overallClose).toFixed(1) : '—');
  set('kpi-dev-complete', s.overallByStatus['Development Complete']||0);
  set('kpi-in-testing',   (s.overallByStatus['Ready for Testing']||0)+(s.overallByStatus['In Testing']||0));
  // Update False Flags tab label count
  document.querySelectorAll('.tab').forEach(t => {
    if(t.textContent.startsWith('⚑')) t.textContent = \`⚑ False Flags (\${s.totalFF})\`;
  });
}

// ── refreshLeaderboard ────────────────────────────────────────────────────
function refreshLeaderboard(){
  const { devSummaries } = computeLiveStats();
  const rankBg = i => ['#f59e0b','#94a3b8','#b45309','#64748b','#64748b'][Math.min(i,4)];
  const greenBg = i => i===0?'#16a34a':i===1?'#22c55e':'#64748b';

  const fill = (id, rows) => { const el=document.getElementById(id); if(el) el.innerHTML=rows; };

  fill('lb-most-defects-body',
    [...devSummaries].sort((a,b)=>b.realCount-a.realCount).map((d,i)=>
      \`<tr><td><span class="rank" style="background:\${rankBg(i)}">\${i+1}</span></td>
       <td>\${d.name}</td><td><strong>\${d.realCount}</strong></td></tr>\`).join(''));

  fill('lb-avg-bounces-body',
    [...devSummaries].sort((a,b)=>a.avgBounces-b.avgBounces).map((d,i)=>
      \`<tr><td><span class="rank" style="background:\${greenBg(i)}">\${i+1}</span></td>
       <td>\${d.name}</td>
       <td class="\${d.avgBounces>=3?'bounce-high':d.avgBounces>=1.5?'bounce-mid':''}"><strong>\${_fmt(d.avgBounces)}</strong></td></tr>\`).join(''));

  const withRft = [...devSummaries].filter(d=>d.avgRftDays!==null).sort((a,b)=>a.avgRftDays-b.avgRftDays);
  const noRft   = devSummaries.filter(d=>d.avgRftDays===null);
  fill('lb-fastest-rft-body',
    withRft.map((d,i)=>
      \`<tr><td><span class="rank" style="background:\${greenBg(i)}">\${i+1}</span></td>
       <td>\${d.name}</td><td><strong>\${_fmt(d.avgRftDays)} d</strong></td></tr>\`).join('') +
    noRft.map(d=>
      \`<tr><td><span class="rank" style="background:#475569">—</span></td>
       <td>\${d.name}</td><td style="color:var(--text2)">No data</td></tr>\`).join(''));

  fill('lb-fastest-close-body',
    [...devSummaries].filter(d=>d.avgCloseDays!==null).sort((a,b)=>a.avgCloseDays-b.avgCloseDays).map((d,i)=>
      \`<tr><td><span class="rank" style="background:\${greenBg(i)}">\${i+1}</span></td>
       <td>\${d.name}</td><td><strong>\${_fmt(d.avgCloseDays)} d</strong></td></tr>\`).join(''));

  fill('lb-most-blockers-body',
    [...devSummaries].sort((a,b)=>(b.byPrio['Blocker']||0)-(a.byPrio['Blocker']||0)).map((d,i)=>{
      const bl = d.byPrio['Blocker']||0;
      return \`<tr><td><span class="rank" style="background:\${bl>3?'#dc2626':'#64748b'}">\${i+1}</span></td>
              <td>\${d.name}</td><td class="\${bl>3?'bounce-high':''}"><strong>\${bl}</strong></td></tr>\`;
    }).join(''));

  fill('lb-max-bounces-body',
    [...devSummaries].sort((a,b)=>b.maxBounce-a.maxBounce).map((d,i)=>
      \`<tr><td><span class="rank" style="background:\${d.maxBounce>=8?'#dc2626':d.maxBounce>=5?'#ea580c':'#64748b'}">\${i+1}</span></td>
       <td>\${d.name}\${d.highBounce?\` <span style="color:var(--text2);font-size:11px">(\${d.highBounce.key})</span>\`:''}</td>
       <td class="\${d.maxBounce>=8?'bounce-high':d.maxBounce>=5?'bounce-mid':''}"><strong>\${d.maxBounce}</strong></td></tr>\`).join(''));
}

// ── refreshDevSummaryTable ────────────────────────────────────────────────
function refreshDevSummaryTable(){
  const tbody = document.getElementById('dev-summary-tbody');
  if(!tbody) return;
  const { devSummaries } = computeLiveStats();
  tbody.innerHTML = [...devSummaries].sort((a,b)=>b.realCount-a.realCount).map((d, idx) => {
    const topType  = Object.entries(d.byType).sort((a,b)=>b[1]-a[1])[0];
    const blockers = d.byPrio['Blocker']||0, urgents = d.byPrio['Urgent']||0;
    return \`<tr class="\${idx%2===0?'row-even':'row-odd'}">
      <td><strong>\${d.name}</strong></td>
      <td style="color:var(--text2);font-size:11px">\${d.email}</td>
      <td style="text-align:center">\${d.total}</td>
      <td style="text-align:center"><strong>\${d.realCount}</strong></td>
      <td style="text-align:center">\${d.ffCount>0?\`<span style="color:var(--purple)">\${d.ffCount}</span>\`:0}</td>
      <td>\${topType?bdg(topType[0],TYPE_CLR):'—'}</td>
      <td style="text-align:center" class="\${d.avgBounces>=3?'bounce-high':d.avgBounces>=1.5?'bounce-mid':'bounce-low'}">\${_fmt(d.avgBounces)}</td>
      <td style="text-align:center" class="\${d.maxBounce>=5?'bounce-high':d.maxBounce>=3?'bounce-mid':'bounce-low'}">\${d.maxBounce}</td>
      <td style="text-align:center">\${d.avgRftDays   !== null ? _fmt(d.avgRftDays)   : '—'}</td>
      <td style="text-align:center">\${d.avgCloseDays !== null ? _fmt(d.avgCloseDays) : '—'}</td>
      <td style="text-align:center" class="\${blockers>0?'bounce-high':''}">\${blockers}</td>
      <td style="text-align:center" class="\${urgents>3?'bounce-mid':''}">\${urgents}</td>
    </tr>\`;
  }).join('');
}

// ── refreshFalseFlags ─────────────────────────────────────────────────────
// Rebuilds the entire False Flags tab from CNF_FF_RAW + localStorage overrides.
// An issue is a false flag if: it was a false flag in CNF_FF_RAW (original data)
// OR the user flagged it via the modal (isFalseFlag=true in overrides).
// Conversely, a user can unflag an originally-false issue.
function refreshFalseFlags(){
  const container = document.getElementById('ff-tab-content');
  if(!container) return;

  const ovr    = getOverrides();
  const ffBase = window.CNF_FF_RAW || [];   // original false flags
  const raw    = window.CNF_RAW    || {};

  // Build the effective FF list: start from original, apply overrides
  // Map keyed by issue key for dedup
  const ffMap = {};

  // 1. Seed with original false flags
  for(const ff of ffBase){
    const o = ovr[ff.key];
    // If user has explicitly unflaged this, skip it
    if(o && o.isFalseFlag === false) continue;
    // Developer may have been reassigned
    const dev = (o && o.assignee) ? o.assignee : ff.assignedDeveloper;
    ffMap[ff.key] = { ...ff, assignedDeveloper: dev, _source: 'original' };
  }

  // 2. Add any issues user manually flagged that weren't originally false flags
  for(const [key, o] of Object.entries(ovr)){
    if(o.isFalseFlag !== true) continue;
    if(ffMap[key]) continue;   // already in map from original data
    // Find the issue in CNF_RAW to get summary, priority, defectType
    let found = null;
    for(const d of Object.values(raw)){
      const i = d.issues.find(x => x.key === key);
      if(i){ found = { ...i, assignedDeveloper: o.assignee || d.name,
                       category: 'Manual Flag', reason: o.ffReason || '' }; break; }
    }
    if(found) ffMap[key] = { ...found, _source: 'manual' };
  }

  const effectiveFFs = Object.values(ffMap);
  const total = effectiveFFs.length;

  if(total === 0){
    container.innerHTML = \`
      <h2 class="section-title">⚑ False Flag Defects — 0 Identified</h2>
      <p style="color:var(--text2);font-size:13px">No false flags have been identified or flagged.</p>\`;
    return;
  }

  // Group by category
  const byCat = {};
  for(const ff of effectiveFFs){
    const c = ff.category || 'Manual Flag';
    if(!byCat[c]) byCat[c] = [];
    byCat[c].push(ff);
  }

  // Group by developer
  const byDev = {};
  for(const ff of effectiveFFs){
    const dev = ff.assignedDeveloper || '—';
    if(!byDev[dev]) byDev[dev] = [];
    byDev[dev].push(ff);
  }

  const catIcon = c => c==='Cannot Reproduce'?'🔍':c==='Tester Procedure Issue'?'📋':c==='Manual Flag'?'✋':'✅';

  const catCards = Object.entries(byCat).map(([cat, items]) => \`
    <div class="ff-category-card">
      <h3>\${catIcon(cat)} \${cat} — \${items.length} issue(s)</h3>
      \${items.map(ff => \`
      <div class="ff-item">
        <span class="ff-key"><a href="https://brightlysoftware.atlassian.net/browse/\${ff.key}" target="_blank" class="jira-link">\${ff.key}</a></span>
        \${bdg(ff.priority, PRIO_CLR)} \${bdg(ff.defectType||ff.type||'Functional', TYPE_CLR)}
        <strong style="margin-left:8px">\${ff.assignedDeveloper}</strong>
        <span style="color:var(--text2);margin-left:8px;font-size:12px">\${(ff.summary||'').substring(0,80)}\${(ff.summary||'').length>80?'…':''}</span>
        \${ff.reason?\`<div class="ff-evidence">"\${ff.reason.substring(0,180)}\${ff.reason.length>180?'…':''}"</div>\`:''}
      </div>\`).join('')}
    </div>\`).join('');

  const devCards = Object.entries(byDev).sort((a,b)=>b[1].length-a[1].length).map(([dev,ffs]) => \`
    <div class="lb-card" style="border-color:var(--purple)">
      <h3 style="color:var(--purple)">\${dev} — \${ffs.length} false flag(s)</h3>
      <table><tbody>
        \${ffs.map(ff => \`
        <tr>
          <td><a href="https://brightlysoftware.atlassian.net/browse/\${ff.key}" target="_blank" class="jira-link">\${ff.key}</a></td>
          <td>\${bdg(ff.priority, PRIO_CLR)}</td>
          <td style="font-size:11px;color:var(--text2)">\${ff.category||'Manual Flag'}</td>
        </tr>\`).join('')}
      </tbody></table>
    </div>\`).join('');

  const allRows = effectiveFFs.map((ff,idx) => \`
    <tr class="\${idx%2===0?'row-even':'row-odd'} ff-row">
      <td><a href="https://brightlysoftware.atlassian.net/browse/\${ff.key}" target="_blank" class="jira-link">\${ff.key}</a></td>
      <td>\${ff.assignedDeveloper}</td>
      <td class="summary-cell" title="\${(ff.summary||'').replace(/"/g,'&quot;')}">\${(ff.summary||'').substring(0,70)}\${(ff.summary||'').length>70?'…':''}</td>
      <td>\${bdg(ff.defectType||'Functional', TYPE_CLR)}</td>
      <td>\${bdg(ff.priority, PRIO_CLR)}</td>
      <td><span class="badge" style="background:#7c3aed">\${ff.category||'Manual Flag'}</span></td>
      <td style="font-size:11px;color:var(--text2);max-width:300px" title="\${(ff.reason||'').replace(/[<>"]/g,' ')}">\${(ff.reason||'').substring(0,100)}\${(ff.reason||'').length>100?'…':''}</td>
    </tr>\`).join('');

  container.innerHTML = \`
    <h2 class="section-title">⚑ False Flag Defects — \${total} Identified</h2>
    <p style="color:var(--text2);margin-bottom:20px;font-size:13px">
      A false flag is a defect raised by a tester determined to be <strong>not a real code bug</strong>:
      behaviour was already correct/by design, the issue could not be reproduced, or the tester followed
      incorrect procedure. Use the ✏️ button on any row to flag or unflag an issue.
    </p>
    \${catCards}
    <h2 class="section-title" style="margin-top:32px">False Flags by Developer</h2>
    <div class="lb-grid">\${devCards}</div>
    <h2 class="section-title">All False Flag Issues</h2>
    <div class="table-wrapper">
      <table class="issue-table">
        <thead><tr><th>Key</th><th>Developer</th><th>Summary</th><th>Type</th><th>Priority</th><th>Category</th><th>Evidence</th></tr></thead>
        <tbody>\${allRows}</tbody>
      </table>
    </div>\`;
}

// ── refreshDevCards ───────────────────────────────────────────────────────
// Updates stat pills, FF notice banner, and bar charts inside each dev card.
function refreshDevCards(){
  const { devSummaries } = computeLiveStats();
  const byName = {};
  for(const d of devSummaries) byName[d.name] = d;

  // Bar chart helper (mirrors the server-side barChart() function)
  const PALETTE_TYPE  = {'API / Backend':'#6366f1','UI / Frontend':'#ec4899',Security:'#dc2626',
    Validation:'#f59e0b','Data / CRUD':'#0891b2',Performance:'#d97706',Functional:'#94a3b8'};
  const PALETTE_PRIO  = {Blocker:'#dc2626',Urgent:'#ea580c',High:'#d97706',Medium:'#2563eb',Low:'#16a34a'};
  const PALETTE_STAT  = {'Development Complete':'#16a34a','Ready for Testing':'#2563eb',
    'In Testing':'#7c3aed',Done:'#059669',Closed:'#059669',Resolved:'#059669',
    'In Development':'#f59e0b','Ready For Sprint':'#64748b',Blocked:'#dc2626'};

  function barChart(data, total, palette){
    return Object.entries(data).sort((a,b)=>b[1]-a[1]).map(([k,v])=>{
      const pct = total>0 ? (v/total*100).toFixed(1) : 0;
      return \`<div class="bar-row">
        <span class="bar-label">\${k}</span>
        <div class="bar-track"><div class="bar-fill" style="width:\${pct}%;background:\${palette[k]||'#64748b'}"></div></div>
        <span class="bar-val">\${v} <small>(\${pct}%)</small></span>
      </div>\`;
    }).join('');
  }

  document.querySelectorAll('.dev-card[data-dev]').forEach(card => {
    const d = byName[card.getAttribute('data-dev')];
    if(!d) return;

    // ── stat pills ──────────────────────────────────────────────────────────
    const pills = card.querySelectorAll('.dev-stats-inline .stat-num');
    // pill order (from the generator): Real Defects, False Flags, Avg Bounces, Avg→RFT, Avg→Close, Max Bounce
    if(pills[0]) pills[0].textContent = d.realCount;
    if(pills[1]){
      pills[1].textContent = d.ffCount;
      pills[1].style.color = d.ffCount > 0 ? '#a78bfa' : '';
      pills[1].closest('.stat-pill').style.borderColor = d.ffCount > 0 ? '#7c3aed' : '';
    }
    if(pills[2]) pills[2].textContent = _fmt(d.avgBounces);
    if(pills[3]) pills[3].textContent = d.avgRftDays   !== null ? _fmt(d.avgRftDays)   + 'd' : '—';
    if(pills[4]) pills[4].textContent = d.avgCloseDays !== null ? _fmt(d.avgCloseDays) + 'd' : '—';
    if(pills[5]){
      pills[5].textContent = d.maxBounce;
      pills[5].className   = 'stat-num' + (d.maxBounce>=5?' text-red':d.maxBounce>=3?' text-orange':'');
    }

    // ── FF notice banner ────────────────────────────────────────────────────
    const body    = card.querySelector('.dev-body');
    let ffNotice  = card.querySelector('.ff-notice');
    // Build live FF list for this developer from CNF_RAW + overrides
    const ovr = getOverrides();
    const raw = (window.CNF_RAW || {})[Object.keys(window.CNF_RAW||{}).find(k=>(window.CNF_RAW||{})[k].name===d.name)] || {};
    const ffIssues = (raw.issues||[]).filter(i=>{
      const o = ovr[i.key];
      return o ? (o.isFalseFlag !== undefined ? o.isFalseFlag : i.isFalseFlag) : i.isFalseFlag;
    });

    if(ffIssues.length > 0){
      const links = ffIssues.map(i=>\`<a href="https://brightlysoftware.atlassian.net/browse/\${i.key}" target="_blank" class="jira-link">\${i.key}</a>\`).join(' · ');
      const html  = \`<div class="ff-notice"><strong>⚑ \${ffIssues.length} False Flag(s) Identified</strong> — \${links}</div>\`;
      if(ffNotice) ffNotice.outerHTML = html;
      else body.insertAdjacentHTML('afterbegin', html);
    } else {
      if(ffNotice) ffNotice.remove();
    }

    // ── bar charts ──────────────────────────────────────────────────────────
    const sections = card.querySelectorAll('.analysis-section');
    if(sections[0]) sections[0].innerHTML = \`<h4>Defect Types (real)</h4>\${barChart(d.byType, d.realCount, PALETTE_TYPE)}\`;
    if(sections[1]) sections[1].innerHTML = \`<h4>Priority Breakdown (real)</h4>\${barChart(d.byPrio, d.realCount, PALETTE_PRIO)}\`;
    if(sections[2]) sections[2].innerHTML = \`<h4>Status Distribution</h4>\${barChart(d.byStatus, d.realCount, PALETTE_STAT)}\`;
  });
}

// ── refreshAll ────────────────────────────────────────────────────────────
function refreshAll(){
  refreshKpis();
  refreshLeaderboard();
  refreshDevSummaryTable();
  refreshDevCards();
  refreshFalseFlags();
  numberRows();
}

// ── Number all issue rows ─────────────────────────────────────────────────
function numberRows(){
  let n = 1;
  document.querySelectorAll('tr[data-key]').forEach(row => {
    const c = row.querySelector('.row-num');
    if(c) c.textContent = n++;
  });
}

// ── Apply overrides to the row DOM (reassign badge, FF highlight) ─────────
function applyOverrideToRow(key, data){
  document.querySelectorAll(\`tr[data-key="\${key}"]\`).forEach(row => {
    // FF row highlight
    row.classList.toggle('ff-row', !!data.isFalseFlag);

    // False flag column — col index depends on table; find by class
    const ffCell = row.querySelector('.ff-reason-cell') || [...row.querySelectorAll('td')][11];
    if(ffCell){
      ffCell.innerHTML = data.isFalseFlag
        ? \`<span class="badge" style="background:#7c3aed">⚑ Manual</span>\`
        : '—';
    }

    // Reassignment badge in key cell
    const cells = row.querySelectorAll('td');
    const keyCell = cells[1];  // index 1 = key (after # cell)
    if(keyCell && data.assignee){
      row.querySelectorAll('.reassign-badge').forEach(b=>b.remove());
      const origDev = row.getAttribute('data-orig-dev') || '';
      if(origDev && origDev !== data.assignee){
        keyCell.innerHTML += \` <span class="badge reassign-badge" style="background:#0891b2;font-size:10px" title="Reassigned to \${data.assignee}">↪\${data.assignee.split(' ')[0]}</span>\`;
      }
    }
  });
}

// ── Tabs ──────────────────────────────────────────────────────────────────
function switchTab(name){
  const ids=['overview','developers','leaderboard','falseflags'];
  document.querySelectorAll('.tab').forEach((t,i)=>t.classList.toggle('active',ids[i]===name));
  document.querySelectorAll('.tab-panel').forEach(p=>p.classList.toggle('active',p.id==='tab-'+name));
}

// ── Accordion ─────────────────────────────────────────────────────────────
function toggleDev(idx){
  const body=document.getElementById('body-'+idx);
  const chev=document.getElementById('chev-'+idx);
  const open=body.classList.contains('open');
  body.classList.toggle('open',!open);
  chev.classList.toggle('open',!open);
}

// ── Search ────────────────────────────────────────────────────────────────
function filterIssues(q){
  q=q.toLowerCase();
  document.querySelectorAll('#tab-developers .issue-table tbody tr').forEach(row=>{
    row.style.display=row.textContent.toLowerCase().includes(q)?'':'none';
  });
  if(q.length>1){
    document.querySelectorAll('.dev-body').forEach((body,idx)=>{
      const hasVis=[...body.querySelectorAll('tbody tr')].some(r=>r.style.display!=='none');
      if(hasVis&&!body.classList.contains('open')) toggleDev(idx);
    });
  }
  numberRows();
}

// ── Edit modal ────────────────────────────────────────────────────────────
let _editKey = null;

function openEdit(btn){
  const row = btn.closest('tr[data-key]');
  if(!row) return;
  _editKey = row.dataset.key;

  const ovr   = getOverrides();
  const saved = ovr[_editKey] || {};
  const origDev = row.getAttribute('data-orig-dev') || guessDevFromRow(row);

  document.getElementById('modal-key-display').textContent = _editKey;
  document.getElementById('modal-title').textContent = 'Edit Defect — ' + _editKey;
  document.getElementById('edit-assignee').value = saved.assignee || origDev || '';
  document.getElementById('edit-ff').checked =
    saved.isFalseFlag !== undefined ? saved.isFalseFlag : row.classList.contains('ff-row');

  document.getElementById('editModal').classList.add('open');
}

function guessDevFromRow(row){
  const card = row.closest('.dev-card');
  return card ? (card.querySelector('.dev-info h3')?.textContent?.trim() || '') : '';
}

function closeEdit(){
  document.getElementById('editModal').classList.remove('open');
  _editKey = null;
}
function closeEditOnBg(e){
  if(e.target===document.getElementById('editModal')) closeEdit();
}
document.addEventListener('keydown', e => { if(e.key==='Escape') closeEdit(); });

function saveEdit(){
  if(!_editKey) return;
  const key  = _editKey;
  const ovr  = getOverrides();
  const data = {
    assignee:    document.getElementById('edit-assignee').value,
    isFalseFlag: document.getElementById('edit-ff').checked,
    _savedAt:    new Date().toISOString(),
  };
  ovr[key] = data;
  saveOverrides(ovr);

  // Notify real-time layer so server persists to edits.json and broadcasts.
  document.dispatchEvent(new CustomEvent('cnf:edit', { detail: { key, data } }));

  applyOverrideToRow(key, data);
  closeEdit();
  refreshAll();

  // Flash row
  document.querySelectorAll(\`tr[data-key="\${key}"]\`).forEach(r => {
    r.style.transition='background .1s';
    r.style.background='rgba(99,102,241,.25)';
    setTimeout(()=>{ r.style.background=''; }, 700);
  });
}

// ── Apply all stored overrides to DOM rows (called on DOMContentLoaded) ───
function applyAllOverrides(){
  const ovr = getOverrides();
  for(const [key, data] of Object.entries(ovr)) applyOverrideToRow(key, data);
}

// ── Bootstrap ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  applyAllOverrides();
  refreshAll();
});
</script>
`;

const lastScriptPos = html.lastIndexOf("<script>");
if (lastScriptPos === -1)
  throw new Error("Could not find <script> block to replace");
html = html.substring(0, lastScriptPos) + newScript + "\n</body></html>";

fs.writeFileSync(FILE, html, "utf8");
const size = (fs.statSync(FILE).size / 1024).toFixed(1);
console.log(`Patched → ${FILE}`);
console.log(`Size: ${size} KB`);
