const fs = require('fs');
const path = require('path');

const DATA_PATH = String.raw`C:\optimus-prime\mission\defect-analysis\dev_metrics_corrected.json`;
const FF_PATH   = String.raw`C:\optimus-prime\mission\defect-analysis\false_flags.json`;
const OUT_PATH  = String.raw`C:\optimus-prime\mission\defect-analysis\defect_dashboard.html`;

const devData     = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
const falseFlags  = JSON.parse(fs.readFileSync(FF_PATH,   'utf8'));
const ffKeys      = new Set(falseFlags.map(f => f.key));

const avg  = arr => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : null;
const fmt  = v => v === null || v === undefined ? '—' : (typeof v === 'number' ? v.toFixed(1) : v);

function priorityBadge(p) {
  const map = { 'Blocker':'#dc2626','Urgent':'#ea580c','High':'#d97706','Medium':'#2563eb','Low':'#16a34a' };
  return `<span class="badge" style="background:${map[p]||'#6b7280'}">${p}</span>`;
}
function statusBadge(s) {
  const map = { 'Development Complete':'#16a34a','Ready for Testing':'#2563eb','In Testing':'#7c3aed',
    'Done':'#059669','Closed':'#059669','Resolved':'#059669','In Development':'#f59e0b',
    'Ready For Sprint':'#64748b','Blocked':'#dc2626' };
  return `<span class="badge" style="background:${map[s]||'#64748b'}">${s}</span>`;
}
function typeBadge(t) {
  const map = { 'API / Backend':'#6366f1','UI / Frontend':'#ec4899','Security':'#dc2626',
    'Validation':'#f59e0b','Data / CRUD':'#0891b2','Performance':'#d97706','Functional':'#64748b' };
  return `<span class="badge" style="background:${map[t]||'#64748b'}">${t}</span>`;
}
function ffBadge() { return `<span class="badge" style="background:#7c3aed;border:1px solid #a78bfa">⚑ False Flag</span>`; }

const typePalette   = { 'API / Backend':'#6366f1','UI / Frontend':'#ec4899','Security':'#dc2626','Validation':'#f59e0b','Data / CRUD':'#0891b2','Performance':'#d97706','Functional':'#94a3b8' };
const prioPalette   = { 'Blocker':'#dc2626','Urgent':'#ea580c','High':'#d97706','Medium':'#2563eb','Low':'#16a34a' };
const statusPalette = { 'Development Complete':'#16a34a','Ready for Testing':'#2563eb','In Testing':'#7c3aed','Done':'#059669','Closed':'#059669','Resolved':'#059669','In Development':'#f59e0b','Ready For Sprint':'#94a3b8','Blocked':'#dc2626' };

function barChart(data, total, palette) {
  return Object.entries(data).sort((a,b)=>b[1]-a[1]).map(([k,v]) => {
    const pct = total > 0 ? (v/total*100).toFixed(1) : 0;
    return `<div class="bar-row">
      <span class="bar-label">${k}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${palette[k]||'#64748b'}"></div></div>
      <span class="bar-val">${v} <small>(${pct}%)</small></span>
    </div>`;
  }).join('');
}

// ── Aggregate per developer ──────────────────────────────────────────────
const devSummaries = [];
let totalIssues = 0, totalRealIssues = 0, totalFFIssues = 0;

for (const [devId, d] of Object.entries(devData)) {
  const all    = d.issues;
  const real   = all.filter(i => !i.isFalseFlag);
  const ffs    = all.filter(i =>  i.isFalseFlag);
  totalIssues     += all.length;
  totalRealIssues += real.length;
  totalFFIssues   += ffs.length;

  const byType={}, byPrio={}, byStatus={};
  let maxBounce=0;
  for (const i of real) {
    byType[i.defectType]  = (byType[i.defectType]  ||0)+1;
    byPrio[i.priority]    = (byPrio[i.priority]    ||0)+1;
    byStatus[i.status]    = (byStatus[i.status]    ||0)+1;
    if (i.bounces > maxBounce) maxBounce = i.bounces;
  }

  const avgBounces   = real.length ? real.reduce((s,i)=>s+i.bounces,0)/real.length : 0;
  const rftTimes     = real.filter(i=>i.timeToRftDays   !==null).map(i=>i.timeToRftDays);
  const closeTimes   = real.filter(i=>i.timeToCloseDays !==null).map(i=>i.timeToCloseDays);
  const avgRft       = avg(rftTimes);
  const avgClose     = avg(closeTimes);
  const highBounce   = real.reduce((best,i) => i.bounces > (best?.bounces||0) ? i : best, null);

  devSummaries.push({
    devId, name: d.name, email: d.email,
    total: all.length, realCount: real.length, ffCount: ffs.length,
    byType, byPrio, byStatus,
    avgBounces: +avgBounces.toFixed(1),
    maxBounce,
    highBounce,
    avgRftDays:   avgRft   !== null ? +avgRft.toFixed(1)   : null,
    avgCloseDays: avgClose !== null ? +avgClose.toFixed(1) : null,
    issues: all,
    realIssues: real,
    ffIssues: ffs,
  });
}

// ── Overall ──────────────────────────────────────────────────────────────
const allRealIssues = devSummaries.flatMap(d => d.realIssues.map(i=>({...i,devName:d.name})));
const overallByType={}, overallByPrio={}, overallByStatus={};
let overallBounce=0;
const overallRft=[], overallClose=[];
for (const i of allRealIssues) {
  overallByType[i.defectType]  = (overallByType[i.defectType]  ||0)+1;
  overallByPrio[i.priority]    = (overallByPrio[i.priority]    ||0)+1;
  overallByStatus[i.status]    = (overallByStatus[i.status]    ||0)+1;
  overallBounce += i.bounces;
  if (i.timeToRftDays   !==null) overallRft.push(i.timeToRftDays);
  if (i.timeToCloseDays !==null) overallClose.push(i.timeToCloseDays);
}

// ── False flag by category ────────────────────────────────────────────────
const ffByCategory = {};
for (const ff of falseFlags) {
  if (!ffByCategory[ff.category]) ffByCategory[ff.category] = [];
  ffByCategory[ff.category].push(ff);
}
const ffByDev = {};
for (const ff of falseFlags) {
  if (!ffByDev[ff.assignedDeveloper]) ffByDev[ff.assignedDeveloper] = [];
  ffByDev[ff.assignedDeveloper].push(ff);
}

// ── Issue table rows ─────────────────────────────────────────────────────
function issueRows(issues) {
  return issues.map((i, idx) => {
    const isFF = i.isFalseFlag;
    return `<tr class="${idx%2===0?'row-even':'row-odd'}${isFF?' ff-row':''}">
      <td><a href="https://brightlysoftware.atlassian.net/browse/${i.key}" target="_blank" class="jira-link">${i.key}</a>${isFF?` ${ffBadge()}`:''}
      </td>
      <td class="summary-cell" title="${(i.summary||'').replace(/"/g,'&quot;').replace(/[<>]/g,'')}">${(i.summary||'').substring(0,75)}${(i.summary||'').length>75?'…':''}</td>
      <td>${typeBadge(i.defectType)}</td>
      <td>${priorityBadge(i.priority)}</td>
      <td>${statusBadge(i.status)}</td>
      <td>${i.reporterName||'—'}</td>
      <td>${fmt(i.timeToRftDays)}</td>
      <td>${fmt(i.timeToCloseDays)}</td>
      <td class="${i.bounces>=3?'bounce-high':i.bounces>=1?'bounce-mid':'bounce-low'}">${i.bounces}</td>
      <td>${i.commentCount}</td>
      ${isFF?`<td class="ff-reason-cell" title="${(i.falseFlagReason||'').replace(/[<>"]/g,' ')}">${i.falseFlagCategory||'—'}</td>`:'<td>—</td>'}
    </tr>`;
  }).join('');
}

// ── Developer card ────────────────────────────────────────────────────────
function devCard(ds, idx) {
  const initials = ds.name.split(' ').map(w=>w[0]).join('').toUpperCase().substring(0,2);
  const acs = ['#6366f1','#ec4899','#0891b2','#16a34a','#d97706','#7c3aed','#ea580c','#059669','#2563eb','#64748b'];
  const ac  = acs[idx % acs.length];
  return `
  <div class="dev-card" id="dev-${idx}">
    <div class="dev-header" onclick="toggleDev(${idx})">
      <div class="dev-avatar" style="background:${ac}">${initials}</div>
      <div class="dev-info">
        <h3>${ds.name}</h3>
        <span class="dev-email">${ds.email}</span>
      </div>
      <div class="dev-stats-inline">
        <div class="stat-pill"><span class="stat-num">${ds.realCount}</span><span class="stat-lbl">Real Defects</span></div>
        <div class="stat-pill" style="${ds.ffCount>0?'border-color:#7c3aed':''}"><span class="stat-num" style="${ds.ffCount>0?'color:#a78bfa':''}">${ds.ffCount}</span><span class="stat-lbl">False Flags</span></div>
        <div class="stat-pill"><span class="stat-num">${fmt(ds.avgBounces)}</span><span class="stat-lbl">Avg Bounces</span></div>
        <div class="stat-pill"><span class="stat-num">${ds.avgRftDays!==null?fmt(ds.avgRftDays)+'d':'—'}</span><span class="stat-lbl">Avg→RFT</span></div>
        <div class="stat-pill"><span class="stat-num">${ds.avgCloseDays!==null?fmt(ds.avgCloseDays)+'d':'—'}</span><span class="stat-lbl">Avg→Close</span></div>
        <div class="stat-pill"><span class="stat-num ${ds.maxBounce>=5?'text-red':ds.maxBounce>=3?'text-orange':''}">${ds.maxBounce}</span><span class="stat-lbl">Max Bounce</span></div>
      </div>
      <div class="chevron" id="chev-${idx}">▼</div>
    </div>
    <div class="dev-body" id="body-${idx}">
      ${ds.ffIssues.length>0?`
      <div class="ff-notice">
        <strong>⚑ ${ds.ffIssues.length} False Flag(s) Identified</strong> —
        ${ds.ffIssues.map(i=>`<a href="https://brightlysoftware.atlassian.net/browse/${i.key}" target="_blank" class="jira-link">${i.key}</a> (${i.falseFlagCategory})`).join(' · ')}
      </div>`:''}
      <div class="analysis-grid">
        <div class="analysis-section"><h4>Defect Types (real)</h4>${barChart(ds.byType, ds.realCount, typePalette)}</div>
        <div class="analysis-section"><h4>Priority Breakdown (real)</h4>${barChart(ds.byPrio, ds.realCount, prioPalette)}</div>
        <div class="analysis-section"><h4>Status Distribution</h4>${barChart(ds.byStatus, ds.realCount, statusPalette)}</div>
        ${ds.highBounce && ds.maxBounce>0?`
        <div class="analysis-section highlight-card">
          <h4>⚡ Highest Bounce Issue</h4>
          <p><a href="https://brightlysoftware.atlassian.net/browse/${ds.highBounce.key}" target="_blank" class="jira-link">${ds.highBounce.key}</a></p>
          <p class="small-text">${ds.highBounce.summary.substring(0,100)}</p>
          <p><strong>${ds.maxBounce} bounces</strong> · ${ds.highBounce.commentCount} comments · ${statusBadge(ds.highBounce.status)}</p>
        </div>`:''}
      </div>
      <div class="table-wrapper">
        <table class="issue-table">
          <thead><tr>
            <th>Key</th><th>Summary</th><th>Type</th><th>Priority</th>
            <th>Status</th><th>Reporter</th><th>→RFT (d)</th><th>→Close (d)</th>
            <th>Bounces</th><th>Cmts</th><th>False Flag</th>
          </tr></thead>
          <tbody>${issueRows(ds.issues)}</tbody>
        </table>
      </div>
    </div>
  </div>`;
}

const generatedAt = new Date().toLocaleString('en-GB',{dateStyle:'long',timeStyle:'short'});

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Sprint Defect Analysis Dashboard — CNF v2</title>
<style>
:root { --bg:#0f172a;--surface:#1e293b;--surface2:#273548;--border:#334155;--text:#e2e8f0;--text2:#94a3b8;--accent:#6366f1;--green:#22c55e;--red:#ef4444;--orange:#f97316;--purple:#a78bfa; }
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Segoe UI',system-ui,sans-serif;background:var(--bg);color:var(--text);font-size:14px;}
.page{max-width:1440px;margin:0 auto;padding:24px;}
header{text-align:center;padding:40px 0 32px;border-bottom:1px solid var(--border);margin-bottom:32px;}
header h1{font-size:2rem;font-weight:700;color:#f1f5f9;}
header p{color:var(--text2);margin-top:8px;}
.kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:14px;margin-bottom:32px;}
.kpi-card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;text-align:center;}
.kpi-card.ff-card{border-color:var(--purple);}
.kpi-num{font-size:1.9rem;font-weight:700;color:var(--accent);}
.kpi-num.purple{color:var(--purple);}
.kpi-lbl{font-size:11px;color:var(--text2);text-transform:uppercase;letter-spacing:.8px;margin-top:4px;}
h2.section-title{font-size:1.2rem;font-weight:600;margin:32px 0 16px;padding-bottom:8px;border-bottom:1px solid var(--border);}
.lb-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px;margin-bottom:32px;}
.lb-card{background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden;}
.lb-card h3{padding:12px 16px;font-size:.82rem;font-weight:600;background:var(--surface2);border-bottom:1px solid var(--border);color:var(--text2);text-transform:uppercase;letter-spacing:.6px;}
.lb-card table{width:100%;border-collapse:collapse;}
.lb-card td{padding:8px 12px;border-bottom:1px solid var(--border);}
.lb-card tr:last-child td{border-bottom:none;}
.rank{display:inline-block;width:22px;height:22px;border-radius:50%;font-size:11px;font-weight:700;text-align:center;line-height:22px;color:#fff;}
.chart-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:20px;margin-bottom:32px;}
.chart-card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px;}
.chart-card h3{font-size:.82rem;color:var(--text2);margin-bottom:14px;text-transform:uppercase;letter-spacing:.6px;}
.bar-row{display:flex;align-items:center;gap:10px;margin-bottom:8px;}
.bar-label{width:160px;font-size:12px;color:var(--text2);flex-shrink:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.bar-track{flex:1;height:10px;background:var(--surface2);border-radius:5px;overflow:hidden;}
.bar-fill{height:100%;border-radius:5px;transition:width .4s;}
.bar-val{width:90px;font-size:12px;color:var(--text2);text-align:right;flex-shrink:0;}
.bar-val small{font-size:10px;}
.dev-card{background:var(--surface);border:1px solid var(--border);border-radius:12px;margin-bottom:16px;overflow:hidden;}
.dev-header{display:flex;align-items:center;gap:14px;padding:14px 18px;cursor:pointer;transition:background .2s;user-select:none;}
.dev-header:hover{background:var(--surface2);}
.dev-avatar{width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;color:#fff;flex-shrink:0;}
.dev-info{flex:0 0 200px;}
.dev-info h3{font-size:.93rem;font-weight:600;}
.dev-email{font-size:11px;color:var(--text2);}
.dev-stats-inline{display:flex;gap:10px;flex:1;flex-wrap:wrap;}
.stat-pill{background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:6px 10px;text-align:center;min-width:68px;}
.stat-num{display:block;font-size:1.05rem;font-weight:700;color:var(--accent);}
.stat-lbl{display:block;font-size:10px;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;}
.text-red{color:var(--red)!important;}.text-orange{color:var(--orange)!important;}
.chevron{font-size:12px;color:var(--text2);margin-left:auto;transition:transform .3s;}
.chevron.open{transform:rotate(180deg);}
.dev-body{display:none;padding:0 18px 18px;}
.dev-body.open{display:block;}
.analysis-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px;margin:14px 0;}
.analysis-section{background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:13px;}
.analysis-section h4{font-size:.76rem;color:var(--text2);text-transform:uppercase;letter-spacing:.6px;margin-bottom:11px;}
.highlight-card{border-color:#f59e0b;}.highlight-card h4{color:#f59e0b;}
.small-text{font-size:12px;color:var(--text2);margin:4px 0;}
.ff-notice{background:rgba(124,58,237,.12);border:1px solid var(--purple);border-radius:8px;padding:10px 14px;margin:12px 0;font-size:13px;}
.ff-row{background:rgba(124,58,237,.07)!important;}
.ff-reason-cell{font-size:11px;color:var(--purple);max-width:140px;}
.table-wrapper{overflow-x:auto;margin-top:14px;}
.issue-table{width:100%;border-collapse:collapse;font-size:12px;}
.issue-table th{padding:8px 9px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--text2);border-bottom:1px solid var(--border);background:var(--surface2);position:sticky;top:0;}
.issue-table td{padding:7px 9px;border-bottom:1px solid rgba(51,65,85,.5);vertical-align:middle;}
.row-even{background:rgba(30,41,59,.3);}.row-odd{background:transparent;}
.summary-cell{max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.bounce-high{color:var(--red);font-weight:700;}.bounce-mid{color:var(--orange);font-weight:600;}.bounce-low{color:var(--text2);}
.badge{display:inline-block;padding:2px 7px;border-radius:12px;font-size:11px;font-weight:600;color:#fff;white-space:nowrap;}
.jira-link{color:#818cf8;text-decoration:none;font-weight:600;}.jira-link:hover{text-decoration:underline;}
.tab-bar{display:flex;gap:4px;margin-bottom:20px;border-bottom:1px solid var(--border);padding-bottom:0;}
.tab{padding:8px 16px;border-radius:8px 8px 0 0;cursor:pointer;font-size:13px;color:var(--text2);border:1px solid transparent;border-bottom:none;margin-bottom:-1px;transition:all .2s;}
.tab:hover{color:var(--text);background:var(--surface2);}
.tab.active{color:#fff;background:var(--surface);border-color:var(--border);border-bottom-color:var(--bg);}
.tab-panel{display:none;}.tab-panel.active{display:block;}
.search-bar{width:100%;padding:10px 16px;background:var(--surface);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;margin-bottom:20px;}
.search-bar:focus{outline:none;border-color:var(--accent);}
.search-bar::placeholder{color:var(--text2);}
footer{text-align:center;padding:32px 0 16px;color:var(--text2);font-size:12px;border-top:1px solid var(--border);margin-top:40px;}
.ff-category-card{background:var(--surface);border:1px solid var(--purple);border-radius:12px;padding:16px;margin-bottom:12px;}
.ff-category-card h3{color:var(--purple);font-size:.9rem;margin-bottom:10px;}
.ff-item{padding:8px 0;border-bottom:1px solid var(--border);}
.ff-item:last-child{border-bottom:none;}
.ff-item .ff-key{font-weight:700;color:#818cf8;}
.ff-evidence{font-size:11px;color:var(--text2);margin-top:3px;font-style:italic;}
</style>
</head>
<body><div class="page">

<header>
  <h1>🐞 Sprint Defect Analysis Dashboard</h1>
  <p>CNF Project · ${generatedAt} · ${totalIssues} total issues across 10 developers</p>
</header>

<div class="kpi-grid">
  <div class="kpi-card"><div class="kpi-num">${totalIssues}</div><div class="kpi-lbl">Total Issues</div></div>
  <div class="kpi-card"><div class="kpi-num">${totalRealIssues}</div><div class="kpi-lbl">Real Defects</div></div>
  <div class="kpi-card ff-card"><div class="kpi-num purple">${totalFFIssues}</div><div class="kpi-lbl">False Flags</div></div>
  <div class="kpi-card"><div class="kpi-num">10</div><div class="kpi-lbl">Developers</div></div>
  <div class="kpi-card"><div class="kpi-num">${allRealIssues.length>0?(overallBounce/allRealIssues.length).toFixed(1):'—'}</div><div class="kpi-lbl">Avg Bounces/Issue</div></div>
  <div class="kpi-card"><div class="kpi-num">${overallRft.length>0?avg(overallRft).toFixed(1):'—'}</div><div class="kpi-lbl">Avg Days → RFT</div></div>
  <div class="kpi-card"><div class="kpi-num">${overallClose.length>0?avg(overallClose).toFixed(1):'—'}</div><div class="kpi-lbl">Avg Days → Close</div></div>
  <div class="kpi-card"><div class="kpi-num">${overallByStatus['Development Complete']||0}</div><div class="kpi-lbl">Dev Complete</div></div>
  <div class="kpi-card"><div class="kpi-num">${(overallByStatus['Ready for Testing']||0)+(overallByStatus['In Testing']||0)}</div><div class="kpi-lbl">In Testing</div></div>
</div>

<div class="tab-bar">
  <div class="tab active" onclick="switchTab('overview')">📊 Overview</div>
  <div class="tab" onclick="switchTab('developers')">👥 Developer Detail</div>
  <div class="tab" onclick="switchTab('leaderboard')">🏆 Leaderboard</div>
  <div class="tab" onclick="switchTab('falseflags')">⚑ False Flags (${totalFFIssues})</div>
</div>

<!-- ── Overview ── -->
<div class="tab-panel active" id="tab-overview">
  <h2 class="section-title">Overall Defect Distribution (Real Defects Only)</h2>
  <div class="chart-grid">
    <div class="chart-card"><h3>By Defect Type</h3>${barChart(overallByType,totalRealIssues,typePalette)}</div>
    <div class="chart-card"><h3>By Priority</h3>${barChart(overallByPrio,totalRealIssues,prioPalette)}</div>
    <div class="chart-card"><h3>By Status</h3>${barChart(overallByStatus,totalRealIssues,statusPalette)}</div>
  </div>

  <h2 class="section-title">Developer Summary</h2>
  <div class="table-wrapper">
    <table class="issue-table">
      <thead><tr>
        <th>Developer</th><th>Email</th><th>Total</th><th>Real</th><th>False Flags</th>
        <th>Top Defect Type</th><th>Avg Bounces</th><th>Max Bounces</th>
        <th>Avg→RFT (d)</th><th>Avg→Close (d)</th><th>Blockers</th><th>Urgent</th>
      </tr></thead>
      <tbody>${devSummaries.sort((a,b)=>b.realCount-a.realCount).map((d,idx)=>{
        const topType = Object.entries(d.byType).sort((a,b)=>b[1]-a[1])[0];
        const blockers = d.byPrio['Blocker']||0, urgents = d.byPrio['Urgent']||0;
        return `<tr class="${idx%2===0?'row-even':'row-odd'}">
          <td><strong>${d.name}</strong></td>
          <td style="color:var(--text2);font-size:11px">${d.email}</td>
          <td style="text-align:center">${d.total}</td>
          <td style="text-align:center"><strong>${d.realCount}</strong></td>
          <td style="text-align:center" class="${d.ffCount>0?'bounce-mid':''}">${d.ffCount>0?`<span style="color:var(--purple)">${d.ffCount}</span>`:0}</td>
          <td>${topType?typeBadge(topType[0]):'—'}</td>
          <td style="text-align:center" class="${d.avgBounces>=3?'bounce-high':d.avgBounces>=1.5?'bounce-mid':'bounce-low'}">${fmt(d.avgBounces)}</td>
          <td style="text-align:center" class="${d.maxBounce>=5?'bounce-high':d.maxBounce>=3?'bounce-mid':'bounce-low'}">${d.maxBounce}</td>
          <td style="text-align:center">${d.avgRftDays!==null?fmt(d.avgRftDays):'—'}</td>
          <td style="text-align:center">${d.avgCloseDays!==null?fmt(d.avgCloseDays):'—'}</td>
          <td style="text-align:center" class="${blockers>0?'bounce-high':''}">${blockers}</td>
          <td style="text-align:center" class="${urgents>3?'bounce-mid':''}">${urgents}</td>
        </tr>`;}).join('')}
      </tbody>
    </table>
  </div>
</div>

<!-- ── Developer Detail ── -->
<div class="tab-panel" id="tab-developers">
  <input type="text" class="search-bar" placeholder="🔍 Filter by key, summary, status…" oninput="filterIssues(this.value)">
  ${devSummaries.sort((a,b)=>b.realCount-a.realCount).map((d,idx)=>devCard(d,idx)).join('')}
</div>

<!-- ── Leaderboard ── -->
<div class="tab-panel" id="tab-leaderboard">
  <h2 class="section-title">Performance Leaderboards (Real Defects Only)</h2>
  <div class="lb-grid">
    <div class="lb-card">
      <h3>🔢 Most Real Defects Assigned</h3>
      <table><tbody>
        ${[...devSummaries].sort((a,b)=>b.realCount-a.realCount).map((d,i)=>`
        <tr><td><span class="rank" style="background:${['#f59e0b','#94a3b8','#b45309','#64748b','#64748b'][Math.min(i,4)]}">${i+1}</span></td>
        <td>${d.name}</td><td><strong>${d.realCount}</strong></td></tr>`).join('')}
      </tbody></table>
    </div>
    <div class="lb-card">
      <h3>⚡ Avg Bounces (lower = better)</h3>
      <table><tbody>
        ${[...devSummaries].sort((a,b)=>a.avgBounces-b.avgBounces).map((d,i)=>`
        <tr><td><span class="rank" style="background:${i===0?'#16a34a':i===1?'#22c55e':'#64748b'}">${i+1}</span></td>
        <td>${d.name}</td>
        <td class="${d.avgBounces>=3?'bounce-high':d.avgBounces>=1.5?'bounce-mid':''}"><strong>${fmt(d.avgBounces)}</strong></td></tr>`).join('')}
      </tbody></table>
    </div>
    <div class="lb-card">
      <h3>⏱ Fastest to Ready for Testing</h3>
      <table><tbody>
        ${[...devSummaries].filter(d=>d.avgRftDays!==null).sort((a,b)=>a.avgRftDays-b.avgRftDays).map((d,i)=>`
        <tr><td><span class="rank" style="background:${i===0?'#16a34a':i===1?'#22c55e':'#64748b'}">${i+1}</span></td>
        <td>${d.name}</td><td><strong>${fmt(d.avgRftDays)} d</strong></td></tr>`).join('')}
        ${devSummaries.filter(d=>d.avgRftDays===null).map(d=>`
        <tr><td><span class="rank" style="background:#475569">—</span></td><td>${d.name}</td><td style="color:var(--text2)">No data</td></tr>`).join('')}
      </tbody></table>
    </div>
    <div class="lb-card">
      <h3>✅ Fastest to Close (avg)</h3>
      <table><tbody>
        ${[...devSummaries].filter(d=>d.avgCloseDays!==null).sort((a,b)=>a.avgCloseDays-b.avgCloseDays).map((d,i)=>`
        <tr><td><span class="rank" style="background:${i===0?'#16a34a':i===1?'#22c55e':'#64748b'}">${i+1}</span></td>
        <td>${d.name}</td><td><strong>${fmt(d.avgCloseDays)} d</strong></td></tr>`).join('')}
      </tbody></table>
    </div>
    <div class="lb-card">
      <h3>🚨 Most Blockers (real)</h3>
      <table><tbody>
        ${[...devSummaries].sort((a,b)=>(b.byPrio['Blocker']||0)-(a.byPrio['Blocker']||0)).map((d,i)=>`
        <tr><td><span class="rank" style="background:${(d.byPrio['Blocker']||0)>3?'#dc2626':'#64748b'}">${i+1}</span></td>
        <td>${d.name}</td>
        <td class="${(d.byPrio['Blocker']||0)>3?'bounce-high':''}"><strong>${d.byPrio['Blocker']||0}</strong></td></tr>`).join('')}
      </tbody></table>
    </div>
    <div class="lb-card">
      <h3>🔴 Max Single-Issue Bounces</h3>
      <table><tbody>
        ${[...devSummaries].sort((a,b)=>b.maxBounce-a.maxBounce).map((d,i)=>`
        <tr><td><span class="rank" style="background:${d.maxBounce>=8?'#dc2626':d.maxBounce>=5?'#ea580c':'#64748b'}">${i+1}</span></td>
        <td>${d.name}${d.highBounce?` <span style="color:var(--text2);font-size:11px">(${d.highBounce.key})</span>`:''}</td>
        <td class="${d.maxBounce>=8?'bounce-high':d.maxBounce>=5?'bounce-mid':''}"><strong>${d.maxBounce}</strong></td></tr>`).join('')}
      </tbody></table>
    </div>
  </div>

  <h2 class="section-title">All High-Bounce Issues (≥ 4 bounces, real defects only)</h2>
  <div class="table-wrapper">
    <table class="issue-table">
      <thead><tr><th>Key</th><th>Developer</th><th>Summary</th><th>Type</th><th>Priority</th><th>Status</th><th>Bounces</th><th>Comments</th></tr></thead>
      <tbody>
        ${allRealIssues.filter(i=>i.bounces>=4).sort((a,b)=>b.bounces-a.bounces).map((i,idx)=>`
        <tr class="${idx%2===0?'row-even':'row-odd'}">
          <td><a href="https://brightlysoftware.atlassian.net/browse/${i.key}" target="_blank" class="jira-link">${i.key}</a></td>
          <td>${i.devName}</td>
          <td class="summary-cell" title="${i.summary}">${i.summary.substring(0,75)}${i.summary.length>75?'…':''}</td>
          <td>${typeBadge(i.defectType)}</td><td>${priorityBadge(i.priority)}</td><td>${statusBadge(i.status)}</td>
          <td class="bounce-high">${i.bounces}</td><td>${i.commentCount}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>
</div>

<!-- ── False Flags Tab ── -->
<div class="tab-panel" id="tab-falseflags">
  <h2 class="section-title">⚑ False Flag Defects — ${totalFFIssues} Identified</h2>
  <p style="color:var(--text2);margin-bottom:20px;font-size:13px">
    A false flag is a defect raised by a tester that was determined to be <strong>not a real code bug</strong>:
    either the behaviour was already correct/by design, the issue could not be reproduced (environment-specific),
    or the tester was following incorrect procedure. These are distinct from defects that were fixed —
    those were excluded even if the tester later confirmed "working as expected" after receiving a fix build.
  </p>

  ${Object.entries(ffByCategory).map(([cat, items]) => `
  <div class="ff-category-card">
    <h3>${cat === 'Cannot Reproduce' ? '🔍' : cat === 'Tester Procedure Issue' ? '📋' : '✅'} ${cat} — ${items.length} issue(s)</h3>
    ${items.map(ff => `
    <div class="ff-item">
      <span class="ff-key"><a href="https://brightlysoftware.atlassian.net/browse/${ff.key}" target="_blank" class="jira-link">${ff.key}</a></span>
      ${priorityBadge(ff.priority)} ${typeBadge(ff.defectType)}
      <strong style="margin-left:8px">${ff.assignedDeveloper}</strong>
      <span style="color:var(--text2);margin-left:8px;font-size:12px">${ff.summary.substring(0,80)}${ff.summary.length>80?'…':''}</span>
      <div class="ff-evidence">"${ff.reason.substring(0,180)}${ff.reason.length>180?'…':''}"</div>
    </div>`).join('')}
  </div>`).join('')}

  <h2 class="section-title" style="margin-top:32px">False Flags by Developer</h2>
  <div class="lb-grid">
    ${Object.entries(ffByDev).sort((a,b)=>b[1].length-a[1].length).map(([dev,ffs])=>`
    <div class="lb-card" style="border-color:var(--purple)">
      <h3 style="color:var(--purple)">${dev} — ${ffs.length} false flag(s)</h3>
      <table><tbody>
        ${ffs.map(ff=>`
        <tr>
          <td><a href="https://brightlysoftware.atlassian.net/browse/${ff.key}" target="_blank" class="jira-link">${ff.key}</a></td>
          <td>${priorityBadge(ff.priority)}</td>
          <td style="font-size:11px;color:var(--text2)">${ff.category}</td>
        </tr>`).join('')}
      </tbody></table>
    </div>`).join('')}
  </div>

  <h2 class="section-title">All False Flag Issues</h2>
  <div class="table-wrapper">
    <table class="issue-table">
      <thead><tr><th>Key</th><th>Developer</th><th>Summary</th><th>Type</th><th>Priority</th><th>Category</th><th>Evidence</th></tr></thead>
      <tbody>
        ${falseFlags.map((ff,idx)=>`
        <tr class="${idx%2===0?'row-even':'row-odd'} ff-row">
          <td><a href="https://brightlysoftware.atlassian.net/browse/${ff.key}" target="_blank" class="jira-link">${ff.key}</a></td>
          <td>${ff.assignedDeveloper}</td>
          <td class="summary-cell" title="${ff.summary}">${ff.summary.substring(0,70)}${ff.summary.length>70?'…':''}</td>
          <td>${typeBadge(ff.defectType)}</td>
          <td>${priorityBadge(ff.priority)}</td>
          <td><span class="badge" style="background:#7c3aed">${ff.category}</span></td>
          <td style="font-size:11px;color:var(--text2);max-width:300px" title="${ff.reason.replace(/[<>"]/g,' ')}">${ff.reason.substring(0,100)}${ff.reason.length>100?'…':''}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>
</div>

<footer>Generated by Claude Code · CNF Sprint Defect Analysis · ${generatedAt} · Data from Jira (brightlysoftware.atlassian.net)</footer>
</div>

<script>
function switchTab(name){
  const ids=['overview','developers','leaderboard','falseflags'];
  document.querySelectorAll('.tab').forEach((t,i)=>t.classList.toggle('active',ids[i]===name));
  document.querySelectorAll('.tab-panel').forEach(p=>p.classList.toggle('active',p.id==='tab-'+name));
}
function toggleDev(idx){
  const body=document.getElementById('body-'+idx);
  const chev=document.getElementById('chev-'+idx);
  const open=body.classList.contains('open');
  body.classList.toggle('open',!open);
  chev.classList.toggle('open',!open);
}
function filterIssues(q){
  q=q.toLowerCase();
  document.querySelectorAll('#tab-developers .issue-table tbody tr').forEach(row=>{
    row.style.display=row.textContent.toLowerCase().includes(q)?'':'none';
  });
  if(q.length>1){
    document.querySelectorAll('.dev-body').forEach((body,idx)=>{
      const hasVis=[...body.querySelectorAll('tbody tr')].some(r=>r.style.display!=='none');
      if(hasVis&&!body.classList.contains('open'))toggleDev(idx);
    });
  }
}
</script>
</body></html>`;

fs.writeFileSync(OUT_PATH, html, 'utf8');
console.log('Dashboard → ' + OUT_PATH);
console.log('Size: ' + (fs.statSync(OUT_PATH).size/1024).toFixed(1) + ' KB');
