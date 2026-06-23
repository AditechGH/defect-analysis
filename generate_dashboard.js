const fs = require('fs');
const path = require('path');

const DATA_PATH = String.raw`C:\optimus-prime\mission\defect-analysis\dev_metrics.json`;
const OUT_PATH  = String.raw`C:\optimus-prime\mission\defect-analysis\defect_dashboard.html`;

const devData = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

// ─── helper functions ──────────────────────────────────────────────────────
const avg = arr => arr.length ? (arr.reduce((a,b)=>a+b,0)/arr.length) : null;
const fmt  = v => v === null || v === undefined ? '—' : (typeof v === 'number' ? v.toFixed(1) : v);
const fmtN = v => v === null || v === undefined ? '—' : v;

function priorityBadge(p) {
  const map = {
    'Blocker': '#dc2626', 'Urgent': '#ea580c', 'High': '#d97706',
    'Medium': '#2563eb', 'Low': '#16a34a'
  };
  const col = map[p] || '#6b7280';
  return `<span class="badge" style="background:${col}">${p}</span>`;
}

function statusBadge(s) {
  const map = {
    'Development Complete': '#16a34a',
    'Ready for Testing': '#2563eb',
    'In Testing': '#7c3aed',
    'Done': '#059669', 'Closed': '#059669', 'Resolved': '#059669',
    'In Development': '#f59e0b',
    'Ready For Sprint': '#64748b',
    'Blocked': '#dc2626',
  };
  const col = map[s] || '#64748b';
  return `<span class="badge" style="background:${col}">${s}</span>`;
}

function typeBadge(t) {
  const map = {
    'API / Backend':  '#6366f1',
    'UI / Frontend':  '#ec4899',
    'Security':       '#dc2626',
    'Validation':     '#f59e0b',
    'Data / CRUD':    '#0891b2',
    'Performance':    '#d97706',
    'Functional':     '#64748b',
  };
  const col = map[t] || '#64748b';
  return `<span class="badge" style="background:${col}">${t}</span>`;
}

// ─── aggregate per developer ──────────────────────────────────────────────
const devSummaries = [];
let totalIssues = 0;

for (const [devId, d] of Object.entries(devData)) {
  const issues = d.issues;
  totalIssues += issues.length;

  const byType   = {};
  const byPrio   = {};
  const byStatus = {};
  let bounceTotal = 0, bouncedCount = 0;
  const rftTimes = [], closeTimes = [];

  for (const i of issues) {
    byType[i.defectType]   = (byType[i.defectType]   || 0) + 1;
    byPrio[i.priority]     = (byPrio[i.priority]     || 0) + 1;
    byStatus[i.status]     = (byStatus[i.status]     || 0) + 1;
    if (i.bounces > 0) { bounceTotal += i.bounces; bouncedCount++; }
    if (i.timeToRftDays   !== null) rftTimes.push(i.timeToRftDays);
    if (i.timeToCloseDays !== null) closeTimes.push(i.timeToCloseDays);
  }

  const avgBounces = issues.length ? (issues.reduce((s,i)=>s+i.bounces,0)/issues.length) : 0;
  const avgRft     = avg(rftTimes);
  const avgClose   = avg(closeTimes);
  const maxBounce  = issues.length ? Math.max(...issues.map(i=>i.bounces)) : 0;
  const highestBounceIssue = issues.find(i => i.bounces === maxBounce);

  devSummaries.push({
    devId, name: d.name, email: d.email,
    total: issues.length,
    byType, byPrio, byStatus,
    avgBounces: +avgBounces.toFixed(1),
    maxBounce,
    highestBounceIssue,
    avgRftDays: avgRft !== null ? +avgRft.toFixed(1) : null,
    avgCloseDays: avgClose !== null ? +avgClose.toFixed(1) : null,
    issues,
  });
}

// ─── overall totals ───────────────────────────────────────────────────────
const allIssues = devSummaries.flatMap(d => d.issues.map(i => ({...i, devName: d.name})));
const overallByType   = {};
const overallByPrio   = {};
const overallByStatus = {};
let overallBounce = 0;
const overallRft = [], overallClose = [];

for (const i of allIssues) {
  overallByType[i.defectType]   = (overallByType[i.defectType]   || 0) + 1;
  overallByPrio[i.priority]     = (overallByPrio[i.priority]     || 0) + 1;
  overallByStatus[i.status]     = (overallByStatus[i.status]     || 0) + 1;
  overallBounce += i.bounces;
  if (i.timeToRftDays   !== null) overallRft.push(i.timeToRftDays);
  if (i.timeToCloseDays !== null) overallClose.push(i.timeToCloseDays);
}

// ─── bar chart helper (inline SVG-style CSS bars) ────────────────────────
function barChart(data, total, palette) {
  const entries = Object.entries(data).sort((a,b)=>b[1]-a[1]);
  return entries.map(([k,v]) => {
    const pct = total > 0 ? (v/total*100).toFixed(1) : 0;
    return `<div class="bar-row">
      <span class="bar-label">${k}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${palette[k]||'#64748b'}"></div></div>
      <span class="bar-val">${v} <small>(${pct}%)</small></span>
    </div>`;
  }).join('');
}

const typePalette = {
  'API / Backend':'#6366f1','UI / Frontend':'#ec4899','Security':'#dc2626',
  'Validation':'#f59e0b','Data / CRUD':'#0891b2','Performance':'#d97706','Functional':'#94a3b8'
};
const prioPalette = {
  'Blocker':'#dc2626','Urgent':'#ea580c','High':'#d97706','Medium':'#2563eb','Low':'#16a34a'
};
const statusPalette = {
  'Development Complete':'#16a34a','Ready for Testing':'#2563eb','In Testing':'#7c3aed',
  'Done':'#059669','Closed':'#059669','Resolved':'#059669','In Development':'#f59e0b',
  'Ready For Sprint':'#94a3b8','Blocked':'#dc2626'
};

// ─── issue table rows ─────────────────────────────────────────────────────
function issueRows(issues) {
  return issues.map((i, idx) => `
    <tr class="${idx%2===0?'row-even':'row-odd'}">
      <td><a href="https://brightlysoftware.atlassian.net/browse/${i.key}" target="_blank" class="jira-link">${i.key}</a></td>
      <td class="summary-cell" title="${i.summary.replace(/"/g,'&quot;')}">${i.summary.substring(0,80)}${i.summary.length>80?'…':''}</td>
      <td>${typeBadge(i.defectType)}</td>
      <td>${priorityBadge(i.priority)}</td>
      <td>${statusBadge(i.status)}</td>
      <td>${i.reporterName}</td>
      <td>${fmt(i.timeToRftDays)}</td>
      <td>${fmt(i.timeToCloseDays)}</td>
      <td class="${i.bounces>=3?'bounce-high':i.bounces>=1?'bounce-mid':'bounce-low'}">${i.bounces}</td>
      <td>${i.commentCount}</td>
    </tr>`).join('');
}

// ─── developer cards ──────────────────────────────────────────────────────
function devCard(ds, idx) {
  const initials = ds.name.split(' ').map(w=>w[0]).join('').toUpperCase().substring(0,2);
  const avatarColors = ['#6366f1','#ec4899','#0891b2','#16a34a','#d97706','#7c3aed','#ea580c','#059669','#2563eb','#64748b'];
  const ac = avatarColors[idx % avatarColors.length];

  return `
  <div class="dev-card" id="dev-${idx}">
    <div class="dev-header" onclick="toggleDev(${idx})">
      <div class="dev-avatar" style="background:${ac}">${initials}</div>
      <div class="dev-info">
        <h3>${ds.name}</h3>
        <span class="dev-email">${ds.email}</span>
      </div>
      <div class="dev-stats-inline">
        <div class="stat-pill"><span class="stat-num">${ds.total}</span><span class="stat-lbl">Defects</span></div>
        <div class="stat-pill"><span class="stat-num">${fmt(ds.avgBounces)}</span><span class="stat-lbl">Avg Bounces</span></div>
        <div class="stat-pill"><span class="stat-num">${ds.avgRftDays !== null ? fmt(ds.avgRftDays)+'d' : '—'}</span><span class="stat-lbl">Avg→RFT</span></div>
        <div class="stat-pill"><span class="stat-num">${ds.avgCloseDays !== null ? fmt(ds.avgCloseDays)+'d' : '—'}</span><span class="stat-lbl">Avg Close</span></div>
        <div class="stat-pill"><span class="stat-num ${ds.maxBounce>=5?'text-red':ds.maxBounce>=3?'text-orange':''}">${ds.maxBounce}</span><span class="stat-lbl">Max Bounces</span></div>
      </div>
      <div class="chevron" id="chev-${idx}">▼</div>
    </div>
    <div class="dev-body" id="body-${idx}">
      <div class="analysis-grid">
        <div class="analysis-section">
          <h4>Defect Types</h4>
          ${barChart(ds.byType, ds.total, typePalette)}
        </div>
        <div class="analysis-section">
          <h4>Priority Breakdown</h4>
          ${barChart(ds.byPrio, ds.total, prioPalette)}
        </div>
        <div class="analysis-section">
          <h4>Status Distribution</h4>
          ${barChart(ds.byStatus, ds.total, statusPalette)}
        </div>
        ${ds.highestBounceIssue && ds.maxBounce > 0 ? `
        <div class="analysis-section highlight-card">
          <h4>⚡ Highest Bounce Issue</h4>
          <p><a href="https://brightlysoftware.atlassian.net/browse/${ds.highestBounceIssue.key}" target="_blank" class="jira-link">${ds.highestBounceIssue.key}</a></p>
          <p class="small-text">${ds.highestBounceIssue.summary.substring(0,100)}</p>
          <p><strong>${ds.maxBounce} bounces</strong> · ${ds.highestBounceIssue.commentCount} comments · ${statusBadge(ds.highestBounceIssue.status)}</p>
        </div>` : ''}
      </div>

      <div class="table-wrapper">
        <table class="issue-table">
          <thead>
            <tr>
              <th>Key</th><th>Summary</th><th>Type</th><th>Priority</th>
              <th>Status</th><th>Reporter</th><th>→RFT (days)</th>
              <th>→Close (days)</th><th>Bounces</th><th>Comments</th>
            </tr>
          </thead>
          <tbody>${issueRows(ds.issues)}</tbody>
        </table>
      </div>
    </div>
  </div>`;
}

// ─── overall summary section ─────────────────────────────────────────────
const leaderboard = [...devSummaries].sort((a,b)=>b.total-a.total);
const mostBouncy = [...devSummaries].sort((a,b)=>b.avgBounces-a.avgBounces);
const fastestRft = [...devSummaries].filter(d=>d.avgRftDays!==null).sort((a,b)=>a.avgRftDays-b.avgRftDays);
const fastestClose = [...devSummaries].filter(d=>d.avgCloseDays!==null).sort((a,b)=>a.avgCloseDays-b.avgCloseDays);

function leaderRow(arr, field, fmt2, label, reversed) {
  return arr.slice(0,10).map((d,i) => {
    const val = typeof d[field] === 'number' ? d[field].toFixed(1) : (d[field] ?? '—');
    const rankColor = i===0 ? (reversed?'#dc2626':'#16a34a') : i===1 ? '#ea580c' : '#64748b';
    return `<tr>
      <td><span class="rank" style="background:${rankColor}">${i+1}</span></td>
      <td>${d.name}</td>
      <td><strong>${val}</strong></td>
    </tr>`;
  }).join('');
}

const allRftArr = devSummaries.filter(d=>d.avgRftDays!==null).sort((a,b)=>a.avgRftDays-b.avgRftDays);
const allCloseArr = devSummaries.filter(d=>d.avgCloseDays!==null).sort((a,b)=>a.avgCloseDays-b.avgCloseDays);
const allBounceArr = [...devSummaries].sort((a,b)=>a.avgBounces-b.avgBounces);

// ─── build final HTML ─────────────────────────────────────────────────────
const generatedAt = new Date().toLocaleString('en-GB', {dateStyle:'long', timeStyle:'short'});

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sprint Defect Analysis Dashboard — CNF</title>
<style>
  :root {
    --bg: #0f172a; --surface: #1e293b; --surface2: #273548; --border: #334155;
    --text: #e2e8f0; --text2: #94a3b8; --accent: #6366f1; --green: #22c55e;
    --red: #ef4444; --orange: #f97316; --yellow: #eab308;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; background: var(--bg); color: var(--text); font-size: 14px; }

  /* ── layout ── */
  .page { max-width: 1400px; margin: 0 auto; padding: 24px; }
  header { text-align: center; padding: 40px 0 32px; border-bottom: 1px solid var(--border); margin-bottom: 32px; }
  header h1 { font-size: 2rem; font-weight: 700; color: #f1f5f9; }
  header p  { color: var(--text2); margin-top: 8px; }

  /* ── summary cards ── */
  .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 16px; margin-bottom: 32px; }
  .kpi-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 20px; text-align: center; }
  .kpi-card .kpi-num { font-size: 2rem; font-weight: 700; color: var(--accent); }
  .kpi-card .kpi-lbl { font-size: 11px; color: var(--text2); text-transform: uppercase; letter-spacing: .8px; margin-top: 4px; }

  /* ── section headings ── */
  h2.section-title { font-size: 1.2rem; font-weight: 600; margin: 32px 0 16px; padding-bottom: 8px; border-bottom: 1px solid var(--border); }

  /* ── leaderboard tables ── */
  .lb-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 20px; margin-bottom: 32px; }
  .lb-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
  .lb-card h3 { padding: 12px 16px; font-size: .85rem; font-weight: 600; background: var(--surface2); border-bottom: 1px solid var(--border); color: var(--text2); text-transform: uppercase; letter-spacing: .6px; }
  .lb-card table { width: 100%; border-collapse: collapse; }
  .lb-card td { padding: 8px 12px; border-bottom: 1px solid var(--border); }
  .lb-card tr:last-child td { border-bottom: none; }
  .rank { display: inline-block; width: 22px; height: 22px; border-radius: 50%; font-size: 11px; font-weight: 700; text-align: center; line-height: 22px; color: #fff; }

  /* ── overall chart section ── */
  .chart-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-bottom: 32px; }
  .chart-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 20px; }
  .chart-card h3 { font-size: .85rem; color: var(--text2); margin-bottom: 14px; text-transform: uppercase; letter-spacing: .6px; }

  /* ── bar chart ── */
  .bar-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
  .bar-label { width: 160px; font-size: 12px; color: var(--text2); flex-shrink: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bar-track { flex: 1; height: 10px; background: var(--surface2); border-radius: 5px; overflow: hidden; }
  .bar-fill  { height: 100%; border-radius: 5px; transition: width .4s; }
  .bar-val   { width: 90px; font-size: 12px; color: var(--text2); text-align: right; flex-shrink: 0; }
  .bar-val small { font-size: 10px; }

  /* ── developer cards ── */
  .dev-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; margin-bottom: 16px; overflow: hidden; }
  .dev-header { display: flex; align-items: center; gap: 16px; padding: 16px 20px; cursor: pointer; transition: background .2s; user-select: none; }
  .dev-header:hover { background: var(--surface2); }
  .dev-avatar { width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 16px; color: #fff; flex-shrink: 0; }
  .dev-info { flex: 0 0 200px; }
  .dev-info h3 { font-size: .95rem; font-weight: 600; }
  .dev-email { font-size: 11px; color: var(--text2); }
  .dev-stats-inline { display: flex; gap: 12px; flex: 1; flex-wrap: wrap; }
  .stat-pill { background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; padding: 6px 12px; text-align: center; min-width: 70px; }
  .stat-num { display: block; font-size: 1.1rem; font-weight: 700; color: var(--accent); }
  .stat-lbl { display: block; font-size: 10px; color: var(--text2); text-transform: uppercase; letter-spacing: .5px; }
  .text-red    { color: var(--red)    !important; }
  .text-orange { color: var(--orange) !important; }
  .chevron { font-size: 12px; color: var(--text2); margin-left: auto; transition: transform .3s; }
  .chevron.open { transform: rotate(180deg); }

  .dev-body { display: none; padding: 0 20px 20px; }
  .dev-body.open { display: block; }

  .analysis-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin: 16px 0; }
  .analysis-section { background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; padding: 14px; }
  .analysis-section h4 { font-size: .78rem; color: var(--text2); text-transform: uppercase; letter-spacing: .6px; margin-bottom: 12px; }
  .highlight-card { border-color: #f59e0b; }
  .highlight-card h4 { color: #f59e0b; }
  .small-text { font-size: 12px; color: var(--text2); margin: 4px 0; }

  /* ── issue table ── */
  .table-wrapper { overflow-x: auto; margin-top: 16px; }
  .issue-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .issue-table th { padding: 8px 10px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .5px; color: var(--text2); border-bottom: 1px solid var(--border); background: var(--surface2); position: sticky; top: 0; }
  .issue-table td { padding: 7px 10px; border-bottom: 1px solid rgba(51,65,85,.5); vertical-align: middle; }
  .row-even { background: rgba(30,41,59,.3); }
  .row-odd  { background: transparent; }
  .summary-cell { max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bounce-high { color: var(--red);    font-weight: 700; }
  .bounce-mid  { color: var(--orange); font-weight: 600; }
  .bounce-low  { color: var(--text2); }

  /* ── badge ── */
  .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; color: #fff; white-space: nowrap; }

  /* ── links ── */
  .jira-link { color: #818cf8; text-decoration: none; font-weight: 600; }
  .jira-link:hover { text-decoration: underline; }

  /* ── tabs ── */
  .tab-bar { display: flex; gap: 4px; margin-bottom: 20px; border-bottom: 1px solid var(--border); padding-bottom: 0; }
  .tab { padding: 8px 16px; border-radius: 8px 8px 0 0; cursor: pointer; font-size: 13px; color: var(--text2); border: 1px solid transparent; border-bottom: none; margin-bottom: -1px; transition: all .2s; }
  .tab:hover  { color: var(--text); background: var(--surface2); }
  .tab.active { color: #fff; background: var(--surface); border-color: var(--border); border-bottom-color: var(--bg); }
  .tab-panel { display: none; }
  .tab-panel.active { display: block; }

  /* ── footer ── */
  footer { text-align: center; padding: 32px 0 16px; color: var(--text2); font-size: 12px; border-top: 1px solid var(--border); margin-top: 40px; }

  /* ── search ── */
  .search-bar { width: 100%; padding: 10px 16px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; color: var(--text); font-size: 14px; margin-bottom: 20px; }
  .search-bar:focus { outline: none; border-color: var(--accent); }
  .search-bar::placeholder { color: var(--text2); }

  @media (max-width: 768px) {
    .dev-stats-inline { gap: 6px; }
    .stat-pill { min-width: 56px; padding: 4px 8px; }
    .dev-info { flex: 0 0 140px; }
  }
</style>
</head>
<body>
<div class="page">

<header>
  <h1>🐞 Sprint Defect Analysis Dashboard</h1>
  <p>CNF Project · ${generatedAt} · ${totalIssues} defects across 10 developers</p>
</header>

<!-- ── KPI Summary ── -->
<div class="kpi-grid">
  <div class="kpi-card"><div class="kpi-num">${totalIssues}</div><div class="kpi-lbl">Total Defects</div></div>
  <div class="kpi-card"><div class="kpi-num">10</div><div class="kpi-lbl">Developers</div></div>
  <div class="kpi-card"><div class="kpi-num">${(overallBounce / totalIssues).toFixed(1)}</div><div class="kpi-lbl">Avg Bounces / Issue</div></div>
  <div class="kpi-card"><div class="kpi-num">${overallRft.length > 0 ? avg(overallRft).toFixed(1) : '—'}</div><div class="kpi-lbl">Avg Days → RFT</div></div>
  <div class="kpi-card"><div class="kpi-num">${overallClose.length > 0 ? avg(overallClose).toFixed(1) : '—'}</div><div class="kpi-lbl">Avg Days → Close</div></div>
  <div class="kpi-card"><div class="kpi-num">${overallByStatus['Development Complete'] || 0}</div><div class="kpi-lbl">Dev Complete</div></div>
  <div class="kpi-card"><div class="kpi-num">${(overallByStatus['Ready for Testing'] || 0) + (overallByStatus['In Testing'] || 0)}</div><div class="kpi-lbl">In Testing</div></div>
  <div class="kpi-card"><div class="kpi-num">${(overallByStatus['Done'] || 0) + (overallByStatus['Closed'] || 0) + (overallByStatus['Resolved'] || 0)}</div><div class="kpi-lbl">Closed</div></div>
</div>

<!-- ── Tabs ── -->
<div class="tab-bar">
  <div class="tab active" onclick="switchTab('overview')">📊 Overview</div>
  <div class="tab" onclick="switchTab('developers')">👥 Developer Detail</div>
  <div class="tab" onclick="switchTab('leaderboard')">🏆 Leaderboard</div>
</div>

<!-- ── Overview Tab ── -->
<div class="tab-panel active" id="tab-overview">
  <h2 class="section-title">Overall Defect Distribution</h2>
  <div class="chart-grid">
    <div class="chart-card">
      <h3>By Defect Type</h3>
      ${barChart(overallByType, totalIssues, typePalette)}
    </div>
    <div class="chart-card">
      <h3>By Priority</h3>
      ${barChart(overallByPrio, totalIssues, prioPalette)}
    </div>
    <div class="chart-card">
      <h3>By Status</h3>
      ${barChart(overallByStatus, totalIssues, statusPalette)}
    </div>
  </div>

  <h2 class="section-title">Developer Summary</h2>
  <div class="table-wrapper">
    <table class="issue-table">
      <thead>
        <tr>
          <th>Developer</th>
          <th>Email</th>
          <th>Total Defects</th>
          <th>Top Defect Type</th>
          <th>Avg Bounces</th>
          <th>Max Bounces</th>
          <th>Avg → RFT (days)</th>
          <th>Avg → Close (days)</th>
          <th>Blockers</th>
          <th>Urgent</th>
        </tr>
      </thead>
      <tbody>
        ${devSummaries.sort((a,b)=>b.total-a.total).map((d, idx) => {
          const topType = Object.entries(d.byType).sort((a,b)=>b[1]-a[1])[0];
          const blockers = d.byPrio['Blocker'] || 0;
          const urgents  = d.byPrio['Urgent'] || 0;
          return `<tr class="${idx%2===0?'row-even':'row-odd'}">
            <td><strong>${d.name}</strong></td>
            <td style="color:var(--text2);font-size:11px">${d.email}</td>
            <td style="text-align:center"><strong>${d.total}</strong></td>
            <td>${topType ? typeBadge(topType[0]) : '—'}</td>
            <td style="text-align:center" class="${d.avgBounces>=3?'bounce-high':d.avgBounces>=1.5?'bounce-mid':'bounce-low'}">${fmt(d.avgBounces)}</td>
            <td style="text-align:center" class="${d.maxBounce>=5?'bounce-high':d.maxBounce>=3?'bounce-mid':'bounce-low'}">${d.maxBounce}</td>
            <td style="text-align:center">${d.avgRftDays !== null ? fmt(d.avgRftDays) : '—'}</td>
            <td style="text-align:center">${d.avgCloseDays !== null ? fmt(d.avgCloseDays) : '—'}</td>
            <td style="text-align:center" class="${blockers>0?'bounce-high':''}">${blockers}</td>
            <td style="text-align:center" class="${urgents>3?'bounce-mid':''}">${urgents}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>

  <h2 class="section-title" style="margin-top:32px">Defect Notes</h2>
  <div class="chart-card" style="margin-bottom:24px">
    <ul style="list-style:none;display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px;padding:4px 0">
      <li style="padding:10px;background:var(--surface2);border-radius:8px">📌 <strong>→RFT (days)</strong>: Estimated time from issue creation until it reached "Ready for Testing" or "Development Complete" status. Computed as days between created and last-updated when in a test-ready state.</li>
      <li style="padding:10px;background:var(--surface2);border-radius:8px">📌 <strong>→Close (days)</strong>: Days from issue creation to resolution date. Issues without a resolution date show —.</li>
      <li style="padding:10px;background:var(--surface2);border-radius:8px">📌 <strong>Bounces</strong>: Count of developer↔tester comment direction changes on each issue. A higher number means more back-and-forth cycles before resolution.</li>
      <li style="padding:10px;background:var(--surface2);border-radius:8px">📌 <strong>Defect Types</strong>: Classified from issue summary keywords — API/Backend, UI/Frontend, Security, Validation, Data/CRUD, Performance, Functional.</li>
    </ul>
  </div>
</div>

<!-- ── Developer Detail Tab ── -->
<div class="tab-panel" id="tab-developers">
  <input type="text" class="search-bar" placeholder="🔍 Filter issues by key, summary or status…" oninput="filterIssues(this.value)">
  ${devSummaries.sort((a,b)=>b.total-a.total).map((d, idx) => devCard(d, idx)).join('')}
</div>

<!-- ── Leaderboard Tab ── -->
<div class="tab-panel" id="tab-leaderboard">
  <h2 class="section-title">Performance Leaderboards</h2>
  <div class="lb-grid">
    <div class="lb-card">
      <h3>🔢 Most Defects Assigned</h3>
      <table>
        <tbody>
          ${[...devSummaries].sort((a,b)=>b.total-a.total).map((d,i)=>`
          <tr>
            <td><span class="rank" style="background:${['#f59e0b','#94a3b8','#b45309','#64748b','#64748b'][Math.min(i,4)]}">${i+1}</span></td>
            <td>${d.name}</td>
            <td><strong>${d.total}</strong></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>

    <div class="lb-card">
      <h3>⚡ Avg Bounces (lower = better)</h3>
      <table>
        <tbody>
          ${[...devSummaries].sort((a,b)=>a.avgBounces-b.avgBounces).map((d,i)=>`
          <tr>
            <td><span class="rank" style="background:${i===0?'#16a34a':i===1?'#22c55e':i<=4?'#64748b':'#94a3b8'}">${i+1}</span></td>
            <td>${d.name}</td>
            <td class="${d.avgBounces>=3?'bounce-high':d.avgBounces>=1.5?'bounce-mid':''}"><strong>${fmt(d.avgBounces)}</strong></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>

    <div class="lb-card">
      <h3>⏱ Fastest to Ready for Testing</h3>
      <table>
        <tbody>
          ${[...devSummaries].filter(d=>d.avgRftDays!==null).sort((a,b)=>a.avgRftDays-b.avgRftDays).map((d,i)=>`
          <tr>
            <td><span class="rank" style="background:${i===0?'#16a34a':i===1?'#22c55e':i<=4?'#64748b':'#94a3b8'}">${i+1}</span></td>
            <td>${d.name}</td>
            <td><strong>${fmt(d.avgRftDays)} days</strong></td>
          </tr>`).join('')}
          ${devSummaries.filter(d=>d.avgRftDays===null).map(d=>`
          <tr>
            <td><span class="rank" style="background:#475569">—</span></td>
            <td>${d.name}</td>
            <td style="color:var(--text2)">No data</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>

    <div class="lb-card">
      <h3>✅ Fastest to Close (avg)</h3>
      <table>
        <tbody>
          ${[...devSummaries].filter(d=>d.avgCloseDays!==null).sort((a,b)=>a.avgCloseDays-b.avgCloseDays).map((d,i)=>`
          <tr>
            <td><span class="rank" style="background:${i===0?'#16a34a':i===1?'#22c55e':i<=4?'#64748b':'#94a3b8'}">${i+1}</span></td>
            <td>${d.name}</td>
            <td><strong>${fmt(d.avgCloseDays)} days</strong></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>

    <div class="lb-card">
      <h3>🚨 Most Blockers Assigned</h3>
      <table>
        <tbody>
          ${[...devSummaries].sort((a,b)=>(b.byPrio['Blocker']||0)-(a.byPrio['Blocker']||0)).map((d,i)=>`
          <tr>
            <td><span class="rank" style="background:${(d.byPrio['Blocker']||0)>3?'#dc2626':'#64748b'}">${i+1}</span></td>
            <td>${d.name}</td>
            <td class="${(d.byPrio['Blocker']||0)>3?'bounce-high':''}"><strong>${d.byPrio['Blocker']||0}</strong></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>

    <div class="lb-card">
      <h3>🔴 Max Single-Issue Bounces</h3>
      <table>
        <tbody>
          ${[...devSummaries].sort((a,b)=>b.maxBounce-a.maxBounce).map((d,i)=>`
          <tr>
            <td><span class="rank" style="background:${d.maxBounce>=8?'#dc2626':d.maxBounce>=5?'#ea580c':'#64748b'}">${i+1}</span></td>
            <td>${d.name}${d.highestBounceIssue?` <span style="color:var(--text2);font-size:11px">(${d.highestBounceIssue.key})</span>`:''}</td>
            <td class="${d.maxBounce>=8?'bounce-high':d.maxBounce>=5?'bounce-mid':''}"><strong>${d.maxBounce}</strong></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>

  <h2 class="section-title">All Issues with High Bounces (≥ 4)</h2>
  <div class="table-wrapper">
    <table class="issue-table">
      <thead>
        <tr><th>Key</th><th>Developer</th><th>Summary</th><th>Type</th><th>Priority</th><th>Status</th><th>Bounces</th><th>Comments</th></tr>
      </thead>
      <tbody>
        ${allIssues.filter(i=>i.bounces>=4).sort((a,b)=>b.bounces-a.bounces).map((i,idx)=>`
        <tr class="${idx%2===0?'row-even':'row-odd'}">
          <td><a href="https://brightlysoftware.atlassian.net/browse/${i.key}" target="_blank" class="jira-link">${i.key}</a></td>
          <td>${i.devName}</td>
          <td class="summary-cell" title="${i.summary}">${i.summary.substring(0,80)}${i.summary.length>80?'…':''}</td>
          <td>${typeBadge(i.defectType)}</td>
          <td>${priorityBadge(i.priority)}</td>
          <td>${statusBadge(i.status)}</td>
          <td class="bounce-high">${i.bounces}</td>
          <td>${i.commentCount}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>
</div>

<footer>
  Generated by Claude Code · CNF Sprint Defect Analysis · ${generatedAt} · Data sourced from Jira (brightlysoftware.atlassian.net)
</footer>

</div><!-- /page -->

<script>
function switchTab(name) {
  document.querySelectorAll('.tab').forEach((t,i) => {
    const ids = ['overview','developers','leaderboard'];
    t.classList.toggle('active', ids[i] === name);
  });
  document.querySelectorAll('.tab-panel').forEach(p => {
    p.classList.toggle('active', p.id === 'tab-' + name);
  });
}

function toggleDev(idx) {
  const body = document.getElementById('body-'+idx);
  const chev = document.getElementById('chev-'+idx);
  const isOpen = body.classList.contains('open');
  body.classList.toggle('open', !isOpen);
  chev.classList.toggle('open', !isOpen);
}

function filterIssues(q) {
  q = q.toLowerCase();
  document.querySelectorAll('.issue-table tbody tr').forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(q) ? '' : 'none';
  });
  // Also open cards that have matching issues
  if (q.length > 1) {
    document.querySelectorAll('.dev-body').forEach((body, idx) => {
      const hasVisible = [...body.querySelectorAll('tbody tr')].some(r => r.style.display !== 'none');
      if (hasVisible && !body.classList.contains('open')) toggleDev(idx);
    });
  }
}
</script>
</body>
</html>`;

fs.writeFileSync(OUT_PATH, html, 'utf8');
console.log('Dashboard written to: ' + OUT_PATH);
console.log('File size: ' + (fs.statSync(OUT_PATH).size / 1024).toFixed(1) + ' KB');
