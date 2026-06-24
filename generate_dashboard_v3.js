/**
 * generate_dashboard_v3.js
 * Full dashboard generator with:
 *   1. Sequential row numbering
 *   2. Reassign defect to another developer (via Edit modal)
 *   3. Flag/unflag defect as false flag (via Edit modal)
 *   4. Edit summary, priority, type on the dashboard
 *   5. Light/dark theme toggle
 * All edits stored in localStorage — no server needed.
 */
const fs = require('fs');
const path = require('path');
const DATA = path.join(__dirname, 'dev_metrics_corrected.json');
const FF = path.join(__dirname, 'false_flags.json');
const OUT = path.join(__dirname, 'defect_dashboard.html');

const devData = JSON.parse(fs.readFileSync(DATA, 'utf8'));
const falseFlags = JSON.parse(fs.readFileSync(FF, 'utf8'));
const ffKeys = new Set(falseFlags.map(f => f.key));

// ── helpers ──────────────────────────────────────────────────────────────
const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
const fmt = v => v === null || v === undefined ? '—' : (typeof v === 'number' ? v.toFixed(1) : v);

function pBadge(p) {
  const m = { Blocker: '#dc2626', Urgent: '#ea580c', High: '#d97706', Medium: '#2563eb', Low: '#16a34a' };
  return `<span class="badge" style="background:${m[p] || '#6b7280'}">${p}</span>`;
}
function sBadge(s) {
  const m = {
    'Development Complete': '#16a34a', 'Ready for Testing': '#2563eb', 'In Testing': '#7c3aed',
    Done: '#059669', Closed: '#059669', Resolved: '#059669', 'In Development': '#f59e0b',
    'Ready For Sprint': '#64748b', Blocked: '#dc2626'
  };
  return `<span class="badge" style="background:${m[s] || '#64748b'}">${s}</span>`;
}
function tBadge(t) {
  const m = {
    'API / Backend': '#6366f1', 'UI / Frontend': '#ec4899', Security: '#dc2626',
    Validation: '#f59e0b', 'Data / CRUD': '#0891b2', Performance: '#d97706', Functional: '#64748b'
  };
  return `<span class="badge" style="background:${m[t] || '#64748b'}">${t}</span>`;
}

const typePalette = { 'API / Backend': '#6366f1', 'UI / Frontend': '#ec4899', Security: '#dc2626', Validation: '#f59e0b', 'Data / CRUD': '#0891b2', Performance: '#d97706', Functional: '#94a3b8' };
const prioPalette = { Blocker: '#dc2626', Urgent: '#ea580c', High: '#d97706', Medium: '#2563eb', Low: '#16a34a' };
const statusPalette = { 'Development Complete': '#16a34a', 'Ready for Testing': '#2563eb', 'In Testing': '#7c3aed', Done: '#059669', Closed: '#059669', Resolved: '#059669', 'In Development': '#f59e0b', 'Ready For Sprint': '#94a3b8', Blocked: '#dc2626' };

function barChart(data, total, palette) {
  return Object.entries(data).sort((a, b) => b[1] - a[1]).map(([k, v]) => {
    const pct = total > 0 ? (v / total * 100).toFixed(1) : 0;
    return `<div class="bar-row">
  <span class="bar-label">${k}</span>
  <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${palette[k] || '#64748b'}"></div></div>
  <span class="bar-val">${v} <small>(${pct}%)</small></span>
</div>`;
  }).join('');
}

// ── Aggregate ─────────────────────────────────────────────────────────────
const devSummaries = [];
let totalIssues = 0, totalReal = 0, totalFF = 0;

for (const [devId, d] of Object.entries(devData)) {
  const all = d.issues;
  const real = all.filter(i => !i.isFalseFlag);
  const ffs = all.filter(i => i.isFalseFlag);
  totalIssues += all.length; totalReal += real.length; totalFF += ffs.length;

  const byType = {}, byPrio = {}, byStatus = {};
  let maxBounce = 0;
  for (const i of real) {
    byType[i.defectType] = (byType[i.defectType] || 0) + 1;
    byPrio[i.priority] = (byPrio[i.priority] || 0) + 1;
    byStatus[i.status] = (byStatus[i.status] || 0) + 1;
    if (i.bounces > maxBounce) maxBounce = i.bounces;
  }
  const rftT = real.filter(i => i.timeToRftDays !== null).map(i => i.timeToRftDays);
  const closeT = real.filter(i => i.timeToCloseDays !== null).map(i => i.timeToCloseDays);
  const avgRft = avg(rftT), avgClose = avg(closeT);
  const avgBounces = real.length ? real.reduce((s, i) => s + i.bounces, 0) / real.length : 0;
  const highBounce = real.reduce((b, i) => i.bounces > (b?.bounces || 0) ? i : b, null);

  devSummaries.push({
    devId, name: d.name, email: d.email,
    total: all.length, realCount: real.length, ffCount: ffs.length,
    byType, byPrio, byStatus,
    avgBounces: +avgBounces.toFixed(1), maxBounce, highBounce,
    avgRftDays: avgRft !== null ? +avgRft.toFixed(1) : null,
    avgCloseDays: avgClose !== null ? +avgClose.toFixed(1) : null,
    issues: all, realIssues: real, ffIssues: ffs
  });
}

const allReal = devSummaries.flatMap(d => d.realIssues.map(i => ({ ...i, devName: d.name })));
const oType = {}, oPrio = {}, oStatus = {};
let oBounce = 0; const oRft = [], oClose = [];
for (const i of allReal) {
  oType[i.defectType] = (oType[i.defectType] || 0) + 1;
  oPrio[i.priority] = (oPrio[i.priority] || 0) + 1;
  oStatus[i.status] = (oStatus[i.status] || 0) + 1;
  oBounce += i.bounces;
  if (i.timeToRftDays !== null) oRft.push(i.timeToRftDays);
  if (i.timeToCloseDays !== null) oClose.push(i.timeToCloseDays);
}

const ffByCat = {}, ffByDev = {};
for (const ff of falseFlags) {
  (ffByCat[ff.category] || (ffByCat[ff.category] = [])).push(ff);
  (ffByDev[ff.assignedDeveloper] || (ffByDev[ff.assignedDeveloper] = [])).push(ff);
}

// ── Issue table row ────────────────────────────────────────────────────────
let globalRowNum = 0;  // reset per devCard call — see devCard()
function issueRow(i, devName) {
  globalRowNum++;
  const n = globalRowNum;
  const isFF = i.isFalseFlag;
  const ffReason = isFF ? (falseFlags.find(f => f.key === i.key) || {}).reason || '' : '';
  const safeSummary = (i.summary || '').replace(/"/g, '&quot;').replace(/[<>]/g, '');
  const display80 = (i.summary || '').substring(0, 80) + ((i.summary || '').length > 80 ? '…' : '');
  return `<tr data-key="${i.key}" data-dev="${devName}" class="${n % 2 === 0 ? 'row-even' : 'row-odd'}${isFF ? ' ff-row' : ''}">
  <td class="num-col">${n}</td>
  <td class="key-cell"><a href="https://brightlysoftware.atlassian.net/browse/${i.key}" target="_blank" class="jira-link">${i.key}</a>${isFF ? ` <span class="edit-tag ff-tag">⚑</span>` : ''}</td>
  <td class="summary-cell" data-full="${safeSummary}" title="${safeSummary}">${display80}</td>
  <td class="type-cell">${tBadge(i.defectType)}</td>
  <td class="prio-cell">${pBadge(i.priority)}</td>
  <td>${sBadge(i.status)}</td>
  <td>${i.reporterName || '—'}</td>
  <td>${fmt(i.timeToRftDays)}</td>
  <td>${fmt(i.timeToCloseDays)}</td>
  <td class="${i.bounces >= 3 ? 'bounce-high' : i.bounces >= 1 ? 'bounce-mid' : 'bounce-low'}">${i.bounces}</td>
  <td>${i.commentCount}</td>
  <td class="ff-cell">${isFF ? `<span class="badge" style="background:#7c3aed">${(i.falseFlagCategory || 'Manual')}</span>` : '—'}</td>
  <td class="actions-cell"><button class="act-btn" onclick="openEdit(this)" title="Edit this defect">✏️ Edit</button></td>
</tr>`;
}

function issueTableHead() {
  return `<thead><tr>
  <th class="num-col">#</th>
  <th>Key</th><th>Summary</th><th>Type</th><th>Priority</th>
  <th>Status</th><th>Reporter</th><th>→RFT (d)</th><th>→Close (d)</th>
  <th>Bounces</th><th>Cmts</th><th>False Flag</th><th class="actions-col">Actions</th>
</tr></thead>`;
}

// ── Developer card ─────────────────────────────────────────────────────────
function devCard(ds, cardIdx) {
  const initials = ds.name.split(' ').map(w => w[0]).join('').toUpperCase().substring(0, 2);
  const acs = ['#6366f1', '#ec4899', '#0891b2', '#16a34a', '#d97706', '#7c3aed', '#ea580c', '#059669', '#2563eb', '#64748b'];
  const ac = acs[cardIdx % acs.length];

  const ffNotice = ds.ffIssues.length ? `
  <div class="ff-notice">
    <strong>⚑ ${ds.ffIssues.length} False Flag(s)</strong> —
    ${ds.ffIssues.map(i => `<a href="https://brightlysoftware.atlassian.net/browse/${i.key}" target="_blank" class="jira-link">${i.key}</a>`).join(' · ')}
  </div>` : '';

  const highCard = ds.highBounce && ds.maxBounce > 0 ? `
  <div class="analysis-section highlight-card">
    <h4>⚡ Highest Bounce Issue</h4>
    <p><a href="https://brightlysoftware.atlassian.net/browse/${ds.highBounce.key}" target="_blank" class="jira-link">${ds.highBounce.key}</a></p>
    <p class="small-text">${(ds.highBounce.summary || '').substring(0, 100)}</p>
    <p><strong>${ds.maxBounce} bounces</strong> · ${ds.highBounce.commentCount} comments · ${sBadge(ds.highBounce.status)}</p>
  </div>` : '';

  return `
<div class="dev-card" id="dev-${cardIdx}">
  <div class="dev-header" onclick="toggleDev(${cardIdx})">
    <div class="dev-avatar" style="background:${ac}">${initials}</div>
    <div class="dev-info">
      <h3>${ds.name}</h3>
      <span class="dev-email">${ds.email}</span>
    </div>
    <div class="dev-stats-inline">
      <div class="stat-pill"><span class="stat-num">${ds.realCount}</span><span class="stat-lbl">Real</span></div>
      <div class="stat-pill" ${ds.ffCount > 0 ? 'style="border-color:#7c3aed"' : ''}><span class="stat-num" ${ds.ffCount > 0 ? 'style="color:#a78bfa"' : ''}>${ds.ffCount}</span><span class="stat-lbl">False Flags</span></div>
      <div class="stat-pill"><span class="stat-num">${fmt(ds.avgBounces)}</span><span class="stat-lbl">Avg Bounces</span></div>
      <div class="stat-pill"><span class="stat-num">${ds.avgRftDays !== null ? fmt(ds.avgRftDays) + 'd' : '—'}</span><span class="stat-lbl">→RFT</span></div>
      <div class="stat-pill"><span class="stat-num">${ds.avgCloseDays !== null ? fmt(ds.avgCloseDays) + 'd' : '—'}</span><span class="stat-lbl">→Close</span></div>
      <div class="stat-pill"><span class="stat-num ${ds.maxBounce >= 5 ? 'text-red' : ds.maxBounce >= 3 ? 'text-orange' : ''}">${ds.maxBounce}</span><span class="stat-lbl">Max Bounce</span></div>
    </div>
    <div class="chevron" id="chev-${cardIdx}">▼</div>
  </div>
  <div class="dev-body" id="body-${cardIdx}">
    ${ffNotice}
    <div class="analysis-grid">
      <div class="analysis-section"><h4>Defect Types</h4>${barChart(ds.byType, ds.realCount, typePalette)}</div>
      <div class="analysis-section"><h4>Priority</h4>${barChart(ds.byPrio, ds.realCount, prioPalette)}</div>
      <div class="analysis-section"><h4>Status</h4>${barChart(ds.byStatus, ds.realCount, statusPalette)}</div>
      ${highCard}
    </div>
    <div class="table-wrapper">
      <table class="issue-table">
        ${issueTableHead()}
        <tbody>
          ${(globalRowNum = 0, ds.issues.map(i => issueRow(i, ds.name)).join('\n          '))}
        </tbody>
      </table>
    </div>
  </div>
</div>`;
}

// ── Leaderboard helper ─────────────────────────────────────────────────────
function lbCard(title, rows) {
  return `<div class="lb-card"><h3>${title}</h3><table><tbody>${rows}</tbody></table></div>`;
}
function lbRow(rank, name, val, valClass = '') {
  const rkColors = ['#f59e0b', '#94a3b8', '#b45309'];
  const bg = rank <= 3 ? rkColors[rank - 1] : '#64748b';
  return `<tr><td><span class="rank" style="background:${bg}">${rank}</span></td><td>${name}</td><td class="${valClass}"><strong>${val}</strong></td></tr>`;
}

// ── Overview summary table ─────────────────────────────────────────────────
function overviewRow(d, idx) {
  const topType = Object.entries(d.byType).sort((a, b) => b[1] - a[1])[0];
  const bl = d.byPrio['Blocker'] || 0, ur = d.byPrio['Urgent'] || 0;
  return `<tr class="${idx % 2 === 0 ? 'row-even' : 'row-odd'}">
  <td><strong>${d.name}</strong></td>
  <td style="color:var(--text2);font-size:11px">${d.email}</td>
  <td style="text-align:center">${d.total}</td>
  <td style="text-align:center"><strong>${d.realCount}</strong></td>
  <td style="text-align:center${d.ffCount > 0 ? ';color:var(--purple)' : ''}">${d.ffCount || 0}</td>
  <td>${topType ? tBadge(topType[0]) : '—'}</td>
  <td style="text-align:center" class="${d.avgBounces >= 3 ? 'bounce-high' : d.avgBounces >= 1.5 ? 'bounce-mid' : 'bounce-low'}">${fmt(d.avgBounces)}</td>
  <td style="text-align:center" class="${d.maxBounce >= 5 ? 'bounce-high' : d.maxBounce >= 3 ? 'bounce-mid' : 'bounce-low'}">${d.maxBounce}</td>
  <td style="text-align:center">${d.avgRftDays !== null ? fmt(d.avgRftDays) : '—'}</td>
  <td style="text-align:center">${d.avgCloseDays !== null ? fmt(d.avgCloseDays) : '—'}</td>
  <td style="text-align:center" class="${bl > 0 ? 'bounce-high' : ''}">${bl}</td>
  <td style="text-align:center" class="${ur > 3 ? 'bounce-mid' : ''}">${ur}</td>
</tr>`;
}

const generatedAt = new Date().toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' });

// ─────────────────────────────────────────────────────────────────────────
const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Sprint Defect Analysis Dashboard — CNF</title>
<style>
/* ── CSS variables: dark (default) & light ── */
:root {
  --bg:#0f172a; --surface:#1e293b; --surface2:#273548; --border:#334155;
  --text:#e2e8f0; --text2:#94a3b8; --accent:#6366f1; --green:#22c55e;
  --red:#ef4444; --orange:#f97316; --purple:#a78bfa;
  --row-even:rgba(30,41,59,.35); --row-odd:transparent;
  --td-border:rgba(51,65,85,.6); --ff-row-bg:rgba(124,58,237,.08);
  --shadow:0 2px 12px rgba(0,0,0,.4);
  --tab-text:#fff; --h1-color:#f1f5f9;
}
[data-theme="light"] {
  --bg:#f1f5f9; --surface:#ffffff; --surface2:#f8fafc; --border:#cbd5e1;
  --text:#0f172a; --text2:#64748b; --accent:#4f46e5; --green:#16a34a;
  --red:#dc2626; --orange:#ea580c; --purple:#7c3aed;
  --row-even:rgba(226,232,240,.5); --row-odd:transparent;
  --td-border:rgba(203,213,225,.8); --ff-row-bg:rgba(124,58,237,.06);
  --shadow:0 2px 12px rgba(0,0,0,.12);
  --tab-text:#0f172a; --h1-color:#1e293b;
}
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Segoe UI',system-ui,sans-serif;background:var(--bg);color:var(--text);font-size:14px;transition:background .25s,color .25s;}

/* ── layout ── */
.page{max-width:1440px;margin:0 auto;padding:24px;}
header{text-align:center;padding:40px 0 32px;border-bottom:1px solid var(--border);margin-bottom:32px;}
header h1{font-size:2rem;font-weight:700;color:var(--h1-color);}
header p{color:var(--text2);margin-top:8px;}

/* ── theme toggle ── */
.theme-toggle{position:fixed;top:16px;right:20px;z-index:1000;display:flex;align-items:center;gap:8px;
  background:var(--surface);border:1px solid var(--border);border-radius:999px;
  padding:6px 14px 6px 10px;cursor:pointer;font-size:13px;color:var(--text2);
  box-shadow:var(--shadow);transition:background .25s,border-color .25s,color .25s;}
.theme-toggle:hover{color:var(--text);border-color:var(--accent);}
.toggle-track{width:34px;height:18px;border-radius:9px;background:var(--border);position:relative;transition:background .25s;flex-shrink:0;}
.toggle-thumb{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:var(--text2);transition:transform .25s,background .25s;}
[data-theme="light"] .toggle-track{background:var(--accent);}
[data-theme="light"] .toggle-thumb{transform:translateX(16px);background:#fff;}

/* ── KPI grid ── */
.kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:14px;margin-bottom:32px;}
.kpi-card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;text-align:center;}
.kpi-card.ff-card{border-color:var(--purple);}
.kpi-num{font-size:1.9rem;font-weight:700;color:var(--accent);}
.kpi-num.purple{color:var(--purple);}
.kpi-lbl{font-size:11px;color:var(--text2);text-transform:uppercase;letter-spacing:.8px;margin-top:4px;}

/* ── section titles ── */
h2.section-title{font-size:1.2rem;font-weight:600;margin:32px 0 16px;padding-bottom:8px;border-bottom:1px solid var(--border);}

/* ── leaderboard ── */
.lb-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px;margin-bottom:32px;}
.lb-card{background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden;}
.lb-card h3{padding:12px 16px;font-size:.82rem;font-weight:600;background:var(--surface2);border-bottom:1px solid var(--border);color:var(--text2);text-transform:uppercase;letter-spacing:.6px;}
.lb-card table{width:100%;border-collapse:collapse;}
.lb-card td{padding:8px 12px;border-bottom:1px solid var(--border);}
.lb-card tr:last-child td{border-bottom:none;}
.rank{display:inline-block;width:22px;height:22px;border-radius:50%;font-size:11px;font-weight:700;text-align:center;line-height:22px;color:#fff;}

/* ── chart cards ── */
.chart-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:20px;margin-bottom:32px;}
.chart-card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px;}
.chart-card h3{font-size:.82rem;color:var(--text2);margin-bottom:14px;text-transform:uppercase;letter-spacing:.6px;}
.bar-row{display:flex;align-items:center;gap:10px;margin-bottom:8px;}
.bar-label{width:160px;font-size:12px;color:var(--text2);flex-shrink:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.bar-track{flex:1;height:10px;background:var(--surface2);border-radius:5px;overflow:hidden;}
.bar-fill{height:100%;border-radius:5px;}
.bar-val{width:90px;font-size:12px;color:var(--text2);text-align:right;flex-shrink:0;}
.bar-val small{font-size:10px;}

/* ── developer cards ── */
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
.text-red{color:var(--red)!important;} .text-orange{color:var(--orange)!important;}
.chevron{font-size:12px;color:var(--text2);margin-left:auto;transition:transform .3s;}
.chevron.open{transform:rotate(180deg);}
.dev-body{display:none;padding:0 18px 18px;}
.dev-body.open{display:block;}
.analysis-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px;margin:14px 0;}
.analysis-section{background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:13px;}
.analysis-section h4{font-size:.76rem;color:var(--text2);text-transform:uppercase;letter-spacing:.6px;margin-bottom:11px;}
.highlight-card{border-color:#f59e0b;} .highlight-card h4{color:#f59e0b;}
.small-text{font-size:12px;color:var(--text2);margin:4px 0;}
.ff-notice{background:rgba(124,58,237,.12);border:1px solid var(--purple);border-radius:8px;padding:10px 14px;margin:12px 0;font-size:13px;}

/* ── issue table ── */
.table-wrapper{overflow-x:auto;margin-top:14px;}
.issue-table{width:100%;border-collapse:collapse;font-size:12px;}
.issue-table th{padding:8px 9px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--text2);border-bottom:1px solid var(--border);background:var(--surface2);position:sticky;top:0;white-space:nowrap;}
.issue-table td{padding:7px 9px;border-bottom:1px solid var(--td-border);vertical-align:middle;}
.num-col{width:34px;text-align:center;color:var(--text2);font-variant-numeric:tabular-nums;}
.key-cell{white-space:nowrap;}
.summary-cell{max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.summary-cell.edited-cell{font-style:italic;}
.actions-col{width:76px;text-align:center;}
.actions-cell{text-align:center;white-space:nowrap;}
.row-even{background:var(--row-even);} .row-odd{background:var(--row-odd);}
.ff-row{background:var(--ff-row-bg)!important;}
.bounce-high{color:var(--red);font-weight:700;} .bounce-mid{color:var(--orange);font-weight:600;} .bounce-low{color:var(--text2);}

/* ── badges / tags ── */
.badge{display:inline-block;padding:2px 7px;border-radius:12px;font-size:11px;font-weight:600;color:#fff;white-space:nowrap;}
.jira-link{color:var(--accent);text-decoration:none;font-weight:600;}
.jira-link:hover{text-decoration:underline;}
.edit-tag{display:inline-block;font-size:10px;font-weight:700;padding:1px 5px;border-radius:4px;vertical-align:middle;margin-left:3px;letter-spacing:.3px;}
.ff-tag{background:var(--purple);color:#fff;}
.edited-tag{background:var(--accent);color:#fff;}
.reassign-tag{font-size:10px!important;padding:1px 5px!important;}
.act-btn{background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:11px;padding:3px 8px;cursor:pointer;transition:background .15s,border-color .15s;white-space:nowrap;}
.act-btn:hover{background:var(--accent);border-color:var(--accent);color:#fff;}

/* ── tabs ── */
.tab-bar{display:flex;gap:4px;margin-bottom:20px;border-bottom:1px solid var(--border);}
.tab{padding:8px 16px;border-radius:8px 8px 0 0;cursor:pointer;font-size:13px;color:var(--text2);border:1px solid transparent;border-bottom:none;margin-bottom:-1px;transition:all .2s;}
.tab:hover{color:var(--text);background:var(--surface2);}
.tab.active{color:var(--tab-text);background:var(--surface);border-color:var(--border);border-bottom-color:var(--bg);}
.tab-panel{display:none;} .tab-panel.active{display:block;}

@media (max-width:980px){
  .da-two-col{grid-template-columns:1fr;}
}

/* ── search bar ── */
.search-bar{width:100%;padding:10px 16px;background:var(--surface);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;margin-bottom:20px;}
.search-bar:focus{outline:none;border-color:var(--accent);}
.search-bar::placeholder{color:var(--text2);}

/* ── false flags ── */
.ff-category-card{background:var(--surface);border:1px solid var(--purple);border-radius:12px;padding:16px;margin-bottom:12px;}
.ff-category-card h3{color:var(--purple);font-size:.9rem;margin-bottom:10px;}
.ff-item{padding:8px 0;border-bottom:1px solid var(--border);}
.ff-item:last-child{border-bottom:none;}
.ff-evidence{font-size:11px;color:var(--text2);margin-top:3px;font-style:italic;}

/* ── defect analysis tab ── */
.da-intro{color:var(--text2);margin-bottom:16px;font-size:13px;line-height:1.45;}
.da-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:18px;}
.da-kpi{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px;}
.da-kpi .v{font-size:1.35rem;font-weight:700;color:var(--accent);line-height:1.1;}
.da-kpi .l{font-size:11px;color:var(--text2);text-transform:uppercase;letter-spacing:.6px;margin-top:4px;}
.da-two-col{display:grid;grid-template-columns:2fr 1fr;gap:16px;margin-top:10px;}
.da-card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px;}
.da-card h3{font-size:.82rem;color:var(--text2);margin-bottom:12px;text-transform:uppercase;letter-spacing:.6px;}
.da-list{margin:0;padding-left:18px;color:var(--text);font-size:13px;line-height:1.5;}
.da-list li{margin:6px 0;}
.da-note{font-size:12px;color:var(--text2);margin-top:10px;}

/* ── edit modal ── */
.modal-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:2000;align-items:center;justify-content:center;backdrop-filter:blur(3px);}
.modal-overlay.open{display:flex;}
.modal{background:var(--surface);border:1px solid var(--border);border-radius:16px;width:min(580px,95vw);max-height:92vh;overflow-y:auto;padding:28px;box-shadow:0 24px 64px rgba(0,0,0,.5);position:relative;}
.modal-close{position:absolute;top:14px;right:16px;background:none;border:none;font-size:22px;cursor:pointer;color:var(--text2);line-height:1;padding:2px 7px;border-radius:6px;}
.modal-close:hover{background:var(--surface2);color:var(--text);}
.modal h2{font-size:1.1rem;font-weight:700;margin-bottom:3px;color:var(--text);}
.modal .modal-sub{font-size:12px;color:var(--accent);font-weight:600;margin-bottom:20px;display:block;}
.form-row{display:flex;flex-direction:column;gap:5px;margin-bottom:15px;}
.form-row label{font-size:11px;color:var(--text2);font-weight:700;text-transform:uppercase;letter-spacing:.5px;}
.form-row input,.form-row select,.form-row textarea{background:var(--surface2);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;padding:8px 12px;width:100%;outline:none;transition:border-color .15s;font-family:inherit;}
.form-row input:focus,.form-row select:focus,.form-row textarea:focus{border-color:var(--accent);}
.form-row select option{background:var(--surface);}
.form-row textarea{resize:vertical;min-height:64px;}
.ff-toggle-row{display:flex;align-items:center;gap:12px;padding:10px 14px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;margin-bottom:14px;cursor:pointer;}
.ff-toggle-row:hover{border-color:var(--purple);}
.ff-toggle-row label{font-size:13px;color:var(--text);cursor:pointer;flex:1;}
.ff-toggle-row input[type=checkbox]{width:16px;height:16px;accent-color:var(--purple);cursor:pointer;flex-shrink:0;}
.modal-footer{display:flex;gap:10px;justify-content:flex-end;margin-top:20px;padding-top:16px;border-top:1px solid var(--border);}
.btn-save{background:var(--accent);border:none;border-radius:8px;color:#fff;font-size:13px;font-weight:600;padding:9px 22px;cursor:pointer;transition:opacity .15s;}
.btn-save:hover{opacity:.88;}
.btn-cancel{background:var(--surface2);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;padding:9px 18px;cursor:pointer;transition:background .15s;}
.btn-cancel:hover{background:var(--border);}
.toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(20px);background:var(--accent);color:#fff;border-radius:10px;padding:10px 22px;font-size:13px;font-weight:600;z-index:9999;opacity:0;transition:opacity .3s,transform .3s;pointer-events:none;}
.toast.show{opacity:1;transform:translateX(-50%) translateY(0);}

/* ── footer ── */
footer{text-align:center;padding:32px 0 16px;color:var(--text2);font-size:12px;border-top:1px solid var(--border);margin-top:40px;}
</style>
</head>
<body>

<!-- Theme toggle -->
<button class="theme-toggle" onclick="toggleTheme()" aria-label="Toggle theme">
  <span id="theme-icon">☀️</span>
  <div class="toggle-track"><div class="toggle-thumb"></div></div>
  <span id="theme-label">Light</span>
</button>

<div class="page">

<header>
  <h1>🐞 Sprint Defect Analysis Dashboard</h1>
  <p>CNF Project · ${generatedAt} · ${totalIssues} total issues across 10 developers</p>
</header>

<!-- KPIs -->
<div class="kpi-grid">
  <div class="kpi-card"><div class="kpi-num">${totalIssues}</div><div class="kpi-lbl">Total Issues</div></div>
  <div class="kpi-card"><div class="kpi-num">${totalReal}</div><div class="kpi-lbl">Real Defects</div></div>
  <div class="kpi-card ff-card"><div class="kpi-num purple">${totalFF}</div><div class="kpi-lbl">False Flags</div></div>
  <div class="kpi-card"><div class="kpi-num">10</div><div class="kpi-lbl">Developers</div></div>
  <div class="kpi-card"><div class="kpi-num">${allReal.length > 0 ? (oBounce / allReal.length).toFixed(1) : '—'}</div><div class="kpi-lbl">Avg Bounces/Issue</div></div>
  <div class="kpi-card"><div class="kpi-num">${oRft.length > 0 ? avg(oRft).toFixed(1) : '—'}</div><div class="kpi-lbl">Avg Days → RFT</div></div>
  <div class="kpi-card"><div class="kpi-num">${oClose.length > 0 ? avg(oClose).toFixed(1) : '—'}</div><div class="kpi-lbl">Avg Days → Close</div></div>
  <div class="kpi-card"><div class="kpi-num">${oStatus['Development Complete'] || 0}</div><div class="kpi-lbl">Dev Complete</div></div>
  <div class="kpi-card"><div class="kpi-num">${(oStatus['Ready for Testing'] || 0) + (oStatus['In Testing'] || 0)}</div><div class="kpi-lbl">In Testing</div></div>
</div>

<!-- Tabs -->
<div class="tab-bar">
  <div class="tab active" onclick="switchTab('overview')">📊 Overview</div>
  <div class="tab" onclick="switchTab('developers')">👥 Developer Detail</div>
  <div class="tab" onclick="switchTab('leaderboard')">🏆 Leaderboard</div>
  <div class="tab" onclick="switchTab('defectanalysis')">🧭 Defect Analysis</div>
  <div class="tab" onclick="switchTab('falseflags')">⚑ False Flags (${totalFF})</div>
</div>

<!-- ── Overview tab ── -->
<div class="tab-panel active" id="tab-overview">
  <h2 class="section-title">Overall Defect Distribution</h2>
  <div class="chart-grid">
    <div class="chart-card"><h3>By Defect Type</h3>${barChart(oType, totalReal, typePalette)}</div>
    <div class="chart-card"><h3>By Priority</h3>${barChart(oPrio, totalReal, prioPalette)}</div>
    <div class="chart-card"><h3>By Status</h3>${barChart(oStatus, totalReal, statusPalette)}</div>
  </div>
  <h2 class="section-title">Developer Summary</h2>
  <div class="table-wrapper">
    <table class="issue-table">
      <thead><tr>
        <th>Developer</th><th>Email</th><th>Total</th><th>Real</th><th style="color:var(--purple)">False Flags</th>
        <th>Top Type</th><th>Avg Bounces</th><th>Max Bounce</th><th>Avg→RFT</th><th>Avg→Close</th><th>Blockers</th><th>Urgent</th>
      </tr></thead>
      <tbody>${devSummaries.sort((a, b) => b.realCount - a.realCount).map((d, i) => overviewRow(d, i)).join('\n      ')}</tbody>
    </table>
  </div>
</div>

<!-- ── Developer detail tab ── -->
<div class="tab-panel" id="tab-developers">
  <input type="text" class="search-bar" id="devSearch" placeholder="🔍 Filter by key, summary, status, type…" oninput="filterIssues(this.value)">
  ${devSummaries.sort((a, b) => b.realCount - a.realCount).map((d, i) => devCard(d, i)).join('\n  ')}
</div>

<!-- ── Leaderboard tab ── -->
<div class="tab-panel" id="tab-leaderboard">
  <h2 class="section-title">Performance Leaderboards</h2>
  <div class="lb-grid" id="lb-cards-grid">
    ${lbCard('🔢 Most Real Defects',
  [...devSummaries].sort((a, b) => b.realCount - a.realCount).map((d, i) => lbRow(i + 1, d.name, d.realCount)).join(''))}
    ${lbCard('⚡ Avg Bounces (lower = better)',
    [...devSummaries].sort((a, b) => a.avgBounces - b.avgBounces).map((d, i) => lbRow(i + 1, d.name, fmt(d.avgBounces), d.avgBounces >= 3 ? 'bounce-high' : d.avgBounces >= 1.5 ? 'bounce-mid' : '')).join(''))}
    ${lbCard('⏱ Fastest to Ready for Testing',
      [...devSummaries].filter(d => d.avgRftDays !== null).sort((a, b) => a.avgRftDays - b.avgRftDays)
        .map((d, i) => lbRow(i + 1, d.name, fmt(d.avgRftDays) + ' d')).join('') +
      devSummaries.filter(d => d.avgRftDays === null).map(d => `<tr><td><span class="rank" style="background:#475569">—</span></td><td>${d.name}</td><td style="color:var(--text2)">No data</td></tr>`).join(''))}
    ${lbCard('✅ Fastest to Close',
        [...devSummaries].filter(d => d.avgCloseDays !== null).sort((a, b) => a.avgCloseDays - b.avgCloseDays)
          .map((d, i) => lbRow(i + 1, d.name, fmt(d.avgCloseDays) + ' d')).join(''))}
    ${lbCard('🚨 Most Blockers',
            [...devSummaries].sort((a, b) => (b.byPrio['Blocker'] || 0) - (a.byPrio['Blocker'] || 0))
              .map((d, i) => lbRow(i + 1, d.name, d.byPrio['Blocker'] || 0, (d.byPrio['Blocker'] || 0) > 3 ? 'bounce-high' : '')).join(''))}
    ${lbCard('🔴 Max Single-Issue Bounces',
                [...devSummaries].sort((a, b) => b.maxBounce - a.maxBounce)
                  .map((d, i) => lbRow(i + 1, `${d.name}${d.highBounce ? ` <span style="color:var(--text2);font-size:11px">(${d.highBounce.key})</span>` : ''}`, d.maxBounce, d.maxBounce >= 8 ? 'bounce-high' : d.maxBounce >= 5 ? 'bounce-mid' : '')).join(''))}
  </div>
  <h2 class="section-title">All High-Bounce Issues (≥ 4)</h2>
  <div class="table-wrapper">
    <table class="issue-table">
      <thead><tr><th>#</th><th>Key</th><th>Developer</th><th>Summary</th><th>Type</th><th>Priority</th><th>Status</th><th>Bounces</th><th>Cmts</th></tr></thead>
      <tbody>${allReal.filter(i => i.bounces >= 4).sort((a, b) => b.bounces - a.bounces).map((i, idx) => `
      <tr class="${idx % 2 === 0 ? 'row-even' : 'row-odd'}">
        <td class="num-col">${idx + 1}</td>
        <td><a href="https://brightlysoftware.atlassian.net/browse/${i.key}" target="_blank" class="jira-link">${i.key}</a></td>
        <td>${i.devName}</td>
        <td class="summary-cell" title="${i.summary}">${i.summary.substring(0, 70)}${i.summary.length > 70 ? '…' : ''}</td>
        <td>${tBadge(i.defectType)}</td><td>${pBadge(i.priority)}</td><td>${sBadge(i.status)}</td>
        <td class="bounce-high">${i.bounces}</td><td>${i.commentCount}</td>
      </tr>`).join('')}
      </tbody>
    </table>
  </div>
</div>

<!-- ── Defect analysis tab ── -->
<div class="tab-panel" id="tab-defectanalysis">
  <h2 class="section-title">Defect Classification and Prevention Report</h2>
  <p class="da-intro">
    Classification and prevention guidance generated from all live defect rows, including false flags raised by QA. This report updates after edits and reassignments so actions stay aligned with current data.
  </p>

  <div class="da-kpis">
    <div class="da-kpi"><div class="v" id="da-real-total">0</div><div class="l">Defects Analysed</div></div>
    <div class="da-kpi"><div class="v" id="da-ff-included">0</div><div class="l">False Flags Included</div></div>
    <div class="da-kpi"><div class="v" id="da-high-risk">0</div><div class="l">High-Risk (Blocker/Urgent)</div></div>
    <div class="da-kpi"><div class="v" id="da-bounce-risk">0</div><div class="l">High Bounce (>=3)</div></div>
    <div class="da-kpi"><div class="v" id="da-repeat-signals">0</div><div class="l">Repeat Failure Signals</div></div>
  </div>

  <div class="da-card">
    <h3>Defect Classification and Gates</h3>
    <div class="table-wrapper">
      <table class="issue-table">
        <thead>
          <tr>
            <th class="num-col">#</th>
            <th>Classification</th>
            <th>Count</th>
            <th>Share</th>
            <th>Recurring Signals</th>
            <th>Prevention Measures / Gates</th>
          </tr>
        </thead>
        <tbody id="da-type-rows"></tbody>
      </table>
    </div>
  </div>

  <div class="da-two-col">
    <div class="da-card">
      <h3>Top Recurring Defect Patterns</h3>
      <div class="table-wrapper">
        <table class="issue-table">
          <thead>
            <tr>
              <th class="num-col">#</th>
              <th>Pattern</th>
              <th>Hits</th>
              <th>Suggested Gate</th>
            </tr>
          </thead>
          <tbody id="da-pattern-rows"></tbody>
        </table>
      </div>
    </div>
    <div class="da-card">
      <h3>Immediate Quality Gates</h3>
      <ol class="da-list" id="da-gate-list"></ol>
      <p class="da-note">Tip: Apply these as Definition of Done checks in PR templates, test charters, and release readiness gates.</p>
    </div>
  </div>
</div>

<!-- ── False Flags tab ── -->
<div class="tab-panel" id="tab-falseflags">
  <h2 class="section-title">⚑ False Flag Defects — ${totalFF} Identified</h2>
  <p style="color:var(--text2);margin-bottom:20px;font-size:13px">
    Defects raised by testers that were determined <strong>not to be real code bugs</strong>:
    behaviour was already correct/by design, issue could not be reproduced (environment-specific),
    or tester used incorrect procedure. Issues where a fix build was delivered first are <em>excluded</em>.
  </p>
  <div id="ff-sections">${Object.entries(ffByCat).map(([cat, items]) => `
  <div class="ff-category-card" data-ff-cat="${cat}">
    <h3>${cat === 'Cannot Reproduce' ? '🔍' : cat === 'Tester Procedure Issue' ? '📋' : '✅'} ${cat} — ${items.length}</h3>
    ${items.map(ff => `
    <div class="ff-item" data-ff-key="${ff.key}" data-ff-dev="${ff.assignedDeveloper}" data-ff-cat="${cat}" data-ff-prio="${ff.priority}" data-ff-type="${ff.defectType}">
      <a href="https://brightlysoftware.atlassian.net/browse/${ff.key}" target="_blank" class="jira-link">${ff.key}</a>
      ${pBadge(ff.priority)} ${tBadge(ff.defectType)}
      <strong style="margin-left:8px">${ff.assignedDeveloper}</strong>
      <span style="color:var(--text2);margin-left:8px;font-size:12px">${ff.summary.substring(0, 80)}${ff.summary.length > 80 ? '…' : ''}</span>
      <div class="ff-evidence">"${ff.reason.substring(0, 180)}${ff.reason.length > 180 ? '…' : ''}"</div>
    </div>`).join('')}
  </div>`).join('')}
  </div>
  <h2 class="section-title" style="margin-top:32px">False Flags by Developer</h2>
  <div class="lb-grid" id="ff-by-dev-grid">
    ${Object.entries(ffByDev).sort((a, b) => b[1].length - a[1].length).map(([dev, ffs]) => `
    <div class="lb-card" style="border-color:var(--purple)">
      <h3 style="color:var(--purple)">${dev} — ${ffs.length}</h3>
      <table><tbody>${ffs.map(ff => `
      <tr><td><a href="https://brightlysoftware.atlassian.net/browse/${ff.key}" target="_blank" class="jira-link">${ff.key}</a></td>
      <td>${pBadge(ff.priority)}</td><td style="font-size:11px;color:var(--text2)">${ff.category}</td></tr>`).join('')}
      </tbody></table>
    </div>`).join('')}
  </div>
</div>

<!-- ── Edit / Reassign / False-Flag Modal ── -->
<div class="modal-overlay" id="editModal" onclick="closeEditOnBg(event)">
  <div class="modal" role="dialog" aria-modal="true">
    <button class="modal-close" onclick="closeEdit()" title="Close">×</button>
    <h2>Edit Defect</h2>
    <span class="modal-sub" id="modal-sub">CNF-XXXXX</span>

    <div class="form-row">
      <label>Assigned Developer</label>
      <select id="edit-assignee">
        ${devSummaries.map(d => `<option value="${d.name}">${d.name}</option>`).join('\n        ')}
      </select>
    </div>

    <div class="ff-toggle-row" onclick="document.getElementById('edit-ff').click()">
      <input type="checkbox" id="edit-ff" onclick="event.stopPropagation();toggleFFReason()">
      <label for="edit-ff" onclick="event.preventDefault()">⚑ Flag as False Flag <span style="color:var(--text2);font-size:12px;font-weight:400">(not a real code bug)</span></label>
    </div>

    <div class="form-row" id="ff-reason-row" style="display:none">
      <label>False Flag Category</label>
      <select id="edit-ff-cat">
        <option>Cannot Reproduce</option>
        <option>Working as Designed / Expected</option>
        <option>Tester Procedure Issue</option>
        <option>API Already Correct</option>
        <option>Environment / Config Issue</option>
        <option>Manual</option>
      </select>
    </div>

    <div class="form-row" id="ff-notes-row" style="display:none">
      <label>False Flag Evidence / Notes</label>
      <textarea id="edit-ff-notes" rows="2" placeholder="Why is this not a real bug?"></textarea>
    </div>

    <div class="modal-footer">
      <button class="btn-cancel" onclick="closeEdit()">Cancel</button>
      <button class="btn-save" onclick="saveEdit()">💾 Save Changes</button>
    </div>
  </div>
</div>

<!-- Toast notification -->
<div class="toast" id="toast"></div>

<footer>Generated by Claude Code · CNF Sprint Defect Analysis · ${generatedAt} · brightlysoftware.atlassian.net</footer>
</div><!-- /page -->

<script>
// ════════════════════════════════════════════════════════════════════════════
//  CNF Defect Dashboard — runtime
// ════════════════════════════════════════════════════════════════════════════

// ── colour maps ────────────────────────────────────────────────────────────
const PRIO_CLR  = {Blocker:'#dc2626',Urgent:'#ea580c',High:'#d97706',Medium:'#2563eb',Low:'#16a34a'};
const TYPE_CLR  = {'API / Backend':'#6366f1','UI / Frontend':'#ec4899',Security:'#dc2626',
  Validation:'#f59e0b','Data / CRUD':'#0891b2',Performance:'#d97706',Functional:'#94a3b8'};
const DEV_NAMES = ${JSON.stringify(devSummaries.map(d => d.name))};

// ── theme ──────────────────────────────────────────────────────────────────
(function(){ applyTheme(localStorage.getItem('cnf-theme')||'dark'); })();
function applyTheme(t){
  document.documentElement.setAttribute('data-theme',t==='light'?'light':'');
  const icon=document.getElementById('theme-icon'), lbl=document.getElementById('theme-label');
  if(icon) icon.textContent=t==='light'?'🌙':'☀️';
  if(lbl)  lbl.textContent =t==='light'?'Dark':'Light';
}
function toggleTheme(){
  const cur=document.documentElement.getAttribute('data-theme')==='light'?'light':'dark';
  const nxt=cur==='light'?'dark':'light';
  localStorage.setItem('cnf-theme',nxt);
  applyTheme(nxt);
}

// ── localStorage overrides ─────────────────────────────────────────────────
// Shape: { [cnfKey]: { summary, assignee, priority, defectType, isFalseFlag, ffCat, ffNotes, changeReason, _ts } }
function getOverrides(){ return JSON.parse(localStorage.getItem('cnf-overrides')||'{}'); }
function putOverrides(o){ localStorage.setItem('cnf-overrides',JSON.stringify(o)); }

// ── badge helpers ──────────────────────────────────────────────────────────
function mkBadge(val,map){ return \`<span class="badge" style="background:\${map[val]||'#64748b'}">\${val||'—'}</span>\`; }

// ── apply overrides on load ────────────────────────────────────────────────
function applyAllOverrides(){
  const ovr=getOverrides();
  for(const [key,data] of Object.entries(ovr)) _applyToRows(key,data);
  renumberRows();
  refreshAllStats();
}

// ── find a developer card's tbody by display name ──────────────────────────
function _devTbody(devName){
  for(const card of document.querySelectorAll('.dev-card')){
    const h3=card.querySelector('.dev-info h3');
    if(h3 && h3.textContent.trim()===devName){
      return card.querySelector('.issue-table tbody');
    }
  }
  return null;
}

function _applyToRows(key,data){
  // ── Reassignment: physically move the row to the target developer's table ──
  if(data.assignee){
    const existing=document.querySelector(\`tr[data-key="\${key}"]\`);
    if(existing){
      const currentCard=existing.closest('.dev-card');
      const currentDevName=currentCard?.querySelector('.dev-info h3')?.textContent?.trim()||'';
      if(currentDevName && currentDevName!==data.assignee){
        // Clone row, update data-dev, move to target tbody
        const targetTbody=_devTbody(data.assignee);
        if(targetTbody){
          // Remove every copy of this row from its current location
          document.querySelectorAll(\`tr[data-key="\${key}"]\`).forEach(r=>r.remove());
          // Clone from the removed node and insert into target
          const clone=existing.cloneNode(true);
          clone.dataset.dev=data.assignee;
          targetTbody.appendChild(clone);
        }
      }
    }
  }

  // ── Update cell contents for all copies of this row ───────────────────────
  document.querySelectorAll(\`tr[data-key="\${key}"]\`).forEach(row=>{
    const cells=[...row.cells];
    // col indices: 0=#  1=key  2=summary  3=type  4=priority  5=status
    //              6=reporter  7=rft  8=close  9=bounces  10=cmts  11=ff  12=actions

    // false-flag cell (col 11)
    if(cells[11]){
      cells[11].innerHTML = data.isFalseFlag
        ? \`<span class="badge" style="background:#7c3aed">\${data.ffCat||'Manual'}</span>\`
        : '—';
    }

    // row highlight
    row.classList.toggle('ff-row', !!data.isFalseFlag);

    // key cell tags (col 1)
    if(cells[1]){
      cells[1].querySelectorAll('.edit-tag,.reassign-tag').forEach(t=>t.remove());
      if(data.isFalseFlag) cells[1].innerHTML+=\` <span class="edit-tag ff-tag">⚑</span>\`;
      if(data._edited)     cells[1].innerHTML+=\` <span class="edit-tag edited-tag">✎</span>\`;
      const origDev=row.dataset.dev||row.dataset.origDev||'';
      if(data.assignee && data.assignee!==origDev){
        cells[1].innerHTML+=\` <span class="badge reassign-tag" style="background:#0891b2;font-size:10px" title="Reassigned → \${data.assignee}">↪ \${data.assignee.split(' ')[0]}</span>\`;
      }
    }
  });
}

// ── Recompute and repaint all KPIs, stat-pills, and overview table ─────────
function refreshAllStats(){
  // Gather live counts per developer card
  const devStats={};
  document.querySelectorAll('.dev-card').forEach(card=>{
    const devName=card.querySelector('.dev-info h3')?.textContent?.trim()||'';
    let total=0, real=0, ffs=0, bounceSum=0;
    let maxBounce=0, maxBounceKey='', rftSum=0, rftCount=0, closeSum=0, closeCount=0;
    let blockers=0;
    card.querySelectorAll('tr[data-key]').forEach(row=>{
      if(row.style.display==='none') return;
      total++;
      const isFF=row.classList.contains('ff-row');
      if(isFF) ffs++; else real++;
      // col 9 = bounces, col 7 = rft days, col 8 = close days, col 4 = priority badge
      const b=parseInt(row.cells[9]?.textContent||'0')||0;
      bounceSum+=b;
      if(!isFF){
        if(b>maxBounce){ maxBounce=b; maxBounceKey=row.dataset.key||''; }
        const rft=parseFloat(row.cells[7]?.textContent||'');
        if(!isNaN(rft)){ rftSum+=rft; rftCount++; }
        const cl=parseFloat(row.cells[8]?.textContent||'');
        if(!isNaN(cl)){ closeSum+=cl; closeCount++; }
        const prioText=row.cells[4]?.textContent?.trim()||'';
        if(prioText==='Blocker') blockers++;
      }
    });
    const avgBounces=total?+(bounceSum/total).toFixed(1):0;
    const avgRft=rftCount?+(rftSum/rftCount).toFixed(1):null;
    const avgClose=closeCount?+(closeSum/closeCount).toFixed(1):null;
    devStats[devName]={total,real,ffs,avgBounces,maxBounce,maxBounceKey,avgRft,avgClose,blockers};

    // Update stat-pills inside this card's header
    const pills=card.querySelectorAll('.stat-pill');
    if(pills[0]) pills[0].querySelector('.stat-num').textContent=real;
    if(pills[1]){
      pills[1].querySelector('.stat-num').textContent=ffs;
      pills[1].style.borderColor=ffs>0?'#7c3aed':'';
      pills[1].querySelector('.stat-num').style.color=ffs>0?'#a78bfa':'';
    }
    if(pills[2]) pills[2].querySelector('.stat-num').textContent=avgBounces;
  });

  // Update overview summary table cells
  document.querySelectorAll('#tab-overview .issue-table tbody tr').forEach(row=>{
    const devName=row.cells[0]?.querySelector('strong')?.textContent?.trim()||'';
    const s=devStats[devName];
    if(!s) return;
    if(row.cells[2]) row.cells[2].textContent=s.total;
    if(row.cells[3]) row.cells[3].innerHTML=\`<strong>\${s.real}</strong>\`;
    if(row.cells[4]){
      row.cells[4].textContent=s.ffs||0;
      row.cells[4].style.color=s.ffs>0?'var(--purple)':'';
    }
    if(row.cells[6]){
      row.cells[6].textContent=s.avgBounces;
      row.cells[6].className=s.avgBounces>=3?'bounce-high':s.avgBounces>=1.5?'bounce-mid':'bounce-low';
    }
  });

  // Update global KPI cards
  let grandTotal=0, grandReal=0, grandFF=0, grandBounce=0;
  for(const s of Object.values(devStats)){
    grandTotal+=s.total; grandReal+=s.real; grandFF+=s.ffs; grandBounce+=s.avgBounces*s.total;
  }
  const kpis=document.querySelectorAll('.kpi-card .kpi-num');
  if(kpis[0]) kpis[0].textContent=grandTotal;
  if(kpis[1]) kpis[1].textContent=grandReal;
  if(kpis[2]) kpis[2].textContent=grandFF;
  if(kpis[4] && grandTotal>0) kpis[4].textContent=(grandBounce/grandTotal).toFixed(1);

  // Update false-flags tab counter in the tab bar
  document.querySelectorAll('.tab').forEach(t=>{
    if(t.textContent.includes('False Flags')){
      t.textContent=\`⚑ False Flags (\${grandFF})\`;
    }
  });

  // Keep leaderboard and false-flags panels in sync
  refreshLeaderboard(devStats);
  refreshFalseFlags();
  refreshDefectAnalysis();
}

// ── Rebuild leaderboard cards from live devStats ───────────────────────────
function refreshLeaderboard(devStats){
  const grid=document.getElementById('lb-cards-grid');
  if(!grid) return;

  const rkClr=['#f59e0b','#94a3b8','#b45309'];
  function rank(bg,n){ return \`<span class="rank" style="background:\${bg}">\${n}</span>\`; }
  function lbRowHtml(i,name,val,cls=''){
    const bg=i<3?rkClr[i]:'#64748b';
    return \`<tr><td>\${rank(bg,i+1)}</td><td>\${name}</td><td class="\${cls}"><strong>\${val}</strong></td></tr>\`;
  }
  function card(title,rows){
    return \`<div class="lb-card"><h3>\${title}</h3><table><tbody>\${rows}</tbody></table></div>\`;
  }
  const fmt1=v=>v===null||v===undefined?'—':typeof v==='number'?v.toFixed(1):v;
  const entries=Object.entries(devStats);

  // 1 – Most Real Defects
  const byReal=[...entries].sort((a,b)=>b[1].real-a[1].real);
  const c1=card('🔢 Most Real Defects',
    byReal.map(([name,s],i)=>lbRowHtml(i,name,s.real)).join(''));

  // 2 – Avg Bounces (lower = better)
  const byBounce=[...entries].sort((a,b)=>a[1].avgBounces-b[1].avgBounces);
  const c2=card('⚡ Avg Bounces (lower = better)',
    byBounce.map(([name,s],i)=>lbRowHtml(i,name,fmt1(s.avgBounces),s.avgBounces>=3?'bounce-high':s.avgBounces>=1.5?'bounce-mid':'')).join(''));

  // 3 – Fastest to RFT
  const withRft=entries.filter(([,s])=>s.avgRft!==null).sort((a,b)=>a[1].avgRft-b[1].avgRft);
  const noRft =entries.filter(([,s])=>s.avgRft===null);
  const c3=card('⏱ Fastest to Ready for Testing',
    withRft.map(([name,s],i)=>lbRowHtml(i,name,fmt1(s.avgRft)+' d')).join('')+
    noRft.map(([name])=>\`<tr><td><span class="rank" style="background:#475569">—</span></td><td>\${name}</td><td style="color:var(--text2)">No data</td></tr>\`).join(''));

  // 4 – Fastest to Close
  const withClose=entries.filter(([,s])=>s.avgClose!==null).sort((a,b)=>a[1].avgClose-b[1].avgClose);
  const c4=card('✅ Fastest to Close',
    withClose.map(([name,s],i)=>lbRowHtml(i,name,fmt1(s.avgClose)+' d')).join(''));

  // 5 – Most Blockers
  const byBlockers=[...entries].sort((a,b)=>b[1].blockers-a[1].blockers);
  const c5=card('🚨 Most Blockers',
    byBlockers.map(([name,s],i)=>lbRowHtml(i,name,s.blockers,s.blockers>3?'bounce-high':'')).join(''));

  // 6 – Max Single-Issue Bounces
  const byMaxBounce=[...entries].sort((a,b)=>b[1].maxBounce-a[1].maxBounce);
  const c6=card('🔴 Max Single-Issue Bounces',
    byMaxBounce.map(([name,s],i)=>{
      const label=name+(s.maxBounceKey?\` <span style="color:var(--text2);font-size:11px">(\${s.maxBounceKey})</span>\`:'');
      return lbRowHtml(i,label,s.maxBounce,s.maxBounce>=8?'bounce-high':s.maxBounce>=5?'bounce-mid':'');
    }).join(''));

  grid.innerHTML=c1+c2+c3+c4+c5+c6;
}

// ── Rebuild false-flags sections from live ff-row state ────────────────────
// Evidence text is preserved via data attributes stamped at generation time.
function refreshFalseFlags(){
  const sections=document.getElementById('ff-sections');
  const byDevGrid=document.getElementById('ff-by-dev-grid');
  if(!sections || !byDevGrid) return;

  // Collect live false-flag rows from developer cards
  const ffByCat={}, ffByDev={};
  document.querySelectorAll('#tab-developers tr[data-key].ff-row').forEach(row=>{
    if(row.style.display==='none') return;
    const key   = row.dataset.key||'';
    const dev   = row.dataset.dev||row.closest('.dev-card')?.querySelector('.dev-info h3')?.textContent?.trim()||'';
    // Try to read category from ff-cell badge (col 11)
    const catEl = row.cells[11]?.querySelector('.badge');
    const cat   = catEl?.textContent?.trim()||'Manual';
    const prio  = row.cells[4]?.querySelector('.badge')?.textContent?.trim()||'';
    const type  = row.cells[3]?.querySelector('.badge')?.textContent?.trim()||'';
    const summary = row.cells[2]?.dataset?.full || row.cells[2]?.textContent?.trim()||'';

    // Recover evidence from the original ff-item element (it still exists in DOM,
    // just the category headings are rebuilt — keep items as-is, only update headers)
    const entry={key,dev,cat,prio,type,summary};
    (ffByCat[cat]||(ffByCat[cat]=[])).push(entry);
    (ffByDev[dev] ||(ffByDev[dev] =[])).push(entry);
  });

  // Rebuild category cards — preserve inner ff-item nodes (they have the evidence text),
  // only update the heading count and create/remove category blocks as needed.
  const catOrder=['Tester Procedure Issue','Working as Designed / Expected','Cannot Reproduce','API Already Correct','Environment / Config Issue','Manual'];
  const catIcon={
    'Cannot Reproduce':'🔍','Tester Procedure Issue':'📋',
    'API Already Correct':'🔧','Environment / Config Issue':'⚙️',
  };
  function catHdIcon(c){ return catIcon[c]||'✅'; }

  // Index existing ff-item nodes by key so we can reuse them
  const existingItems={};
  sections.querySelectorAll('.ff-item[data-ff-key]').forEach(el=>{
    existingItems[el.dataset.ffKey]=el;
  });

  // Build new category blocks, reusing preserved item nodes
  const allCats=[...new Set([...catOrder,...Object.keys(ffByCat)])].filter(c=>ffByCat[c]);
  sections.innerHTML=allCats.map(cat=>{
    const items=ffByCat[cat]||[];
    const itemsHtml=items.map(({key,dev,prio,type,summary})=>{
      if(existingItems[key]){
        // Reuse the original node — update dev name in case of reassignment
        const orig=existingItems[key];
        const devEl=orig.querySelector('strong');
        if(devEl) devEl.textContent=dev;
        return orig.outerHTML;
      }
      // Fallback for manually-flagged items with no original node
      const prioBg={Blocker:'#dc2626',Urgent:'#ea580c',High:'#d97706',Medium:'#2563eb',Low:'#16a34a'};
      const typeBg={'API / Backend':'#6366f1','UI / Frontend':'#ec4899',Security:'#dc2626',
        Validation:'#f59e0b','Data / CRUD':'#0891b2',Functional:'#94a3b8'};
      return \`<div class="ff-item" data-ff-key="\${key}" data-ff-dev="\${dev}" data-ff-cat="\${cat}">
        <a href="https://brightlysoftware.atlassian.net/browse/\${key}" target="_blank" class="jira-link">\${key}</a>
        <span class="badge" style="background:\${prioBg[prio]||'#64748b'}">\${prio}</span>
        <span class="badge" style="background:\${typeBg[type]||'#94a3b8'}">\${type}</span>
        <strong style="margin-left:8px">\${dev}</strong>
        <span style="color:var(--text2);margin-left:8px;font-size:12px">\${summary.substring(0,80)}\${summary.length>80?'…':''}</span>
      </div>\`;
    }).join('');
    return \`<div class="ff-category-card" data-ff-cat="\${cat}">
      <h3>\${catHdIcon(cat)} \${cat} — \${items.length}</h3>
      \${itemsHtml}
    </div>\`;
  }).join('');

  // Update false-flags-by-developer grid
  const prioBg={Blocker:'#dc2626',Urgent:'#ea580c',High:'#d97706',Medium:'#2563eb',Low:'#16a34a'};
  byDevGrid.innerHTML=Object.entries(ffByDev).sort((a,b)=>b[1].length-a[1].length).map(([dev,ffs])=>\`
    <div class="lb-card" style="border-color:var(--purple)">
      <h3 style="color:var(--purple)">\${dev} — \${ffs.length}</h3>
      <table><tbody>\${ffs.map(f=>\`
        <tr>
          <td><a href="https://brightlysoftware.atlassian.net/browse/\${f.key}" target="_blank" class="jira-link">\${f.key}</a></td>
          <td><span class="badge" style="background:\${prioBg[f.prio]||'#64748b'}">\${f.prio}</span></td>
          <td style="font-size:11px;color:var(--text2)">\${f.cat}</td>
        </tr>\`).join('')}
      </tbody></table>
    </div>\`).join('');

  // Update the section title count
  const titleEl=document.querySelector('#tab-falseflags h2.section-title');
  const total=Object.values(ffByCat).reduce((s,a)=>s+a.length,0);
  if(titleEl) titleEl.textContent=\`⚑ False Flag Defects — \${total} Identified\`;
}

// ── Defect analysis report (classification + prevention gates) ───────────
const TYPE_GATE_MAP={
  'Functional':'Add behavior-parity test packs against expected rules before merge; gate release on parity pass for modified workflows.',
  'UI / Frontend':'Add visual regression checks for key pages, responsive snapshots, and interaction smoke tests before story close.',
  'API / Backend':'Gate with contract tests and negative tests for each endpoint; enforce 4xx vs 5xx mapping checks in CI.',
  'Security':'Require permission-matrix tests in CI, add threat-model checklist in PR, and block release if any authz scenario fails.',
  'Validation':'Add boundary and invalid-input test suites, and enforce schema validation so invalid payloads fail fast with clear 4xx errors.',
  'Data / CRUD':'Run CRUD state transition tests with rollback checks and ensure delete/update rules match constraints before deploy.',
  'Performance':'Add baseline latency thresholds in CI with regression alerts and fail builds when p95 exceeds agreed budget.'
};

const PATTERN_RULES=[
  {name:'Permission / Access Control', regex:/(permission|access|unauthor|role|security|rights?)/i, gate:'Permission matrix automation for role x action scenarios'},
  {name:'Validation / Input Boundaries', regex:/(validation|required|mandatory|invalid|max|length|range|negative|character)/i, gate:'Boundary-value and invalid-input CI suite'},
  {name:'Error Handling / Server 500', regex:/(server error|internal server error|500|exception|dbcontext)/i, gate:'Error contract tests for deterministic 4xx/5xx mapping'},
  {name:'UI Parity / Display', regex:/(ui|display|label|button|screen|layout|modal|dropdown|pagination|scroll|icon|mismatch)/i, gate:'Visual regression and UX parity snapshots per module'},
  {name:'API Contract / Integration', regex:/(api|endpoint|graphql|rest|payload|response|not working|failing)/i, gate:'Provider-consumer contract tests and compatibility gate'},
  {name:'Workflow / State Transition', regex:/(save|delete|create|update|status|not able|unable|missing)/i, gate:'End-to-end state transition checks in test pipeline'}
];

function escHtml(v){
  return String(v||'')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

function refreshDefectAnalysis(){
  const rows=[...document.querySelectorAll('#tab-developers tr[data-key]')];
  if(!rows.length) return;

  const analysedRows=rows;
  const totalAnalysed=analysedRows.length;
  const ffIncluded=analysedRows.filter(r=>r.classList.contains('ff-row')).length;
  const byType={};
  const highRisk={count:0};
  const highBounce={count:0};
  const typeSignals={};
  const patternHits={};

  analysedRows.forEach(row=>{
    const type=(row.cells[3]?.textContent||'Unknown').trim();
    const prio=(row.cells[4]?.textContent||'').trim();
    const bounce=parseInt((row.cells[9]?.textContent||'0').trim(),10)||0;
    const summary=(row.cells[2]?.dataset?.full||row.cells[2]?.textContent||'').trim();

    byType[type]=(byType[type]||0)+1;
    if(prio==='Blocker'||prio==='Urgent') highRisk.count++;
    if(bounce>=3) highBounce.count++;

    const matched=PATTERN_RULES.filter(rule=>rule.regex.test(summary));
    matched.forEach(rule=>{
      patternHits[rule.name]=patternHits[rule.name]||{count:0,gate:rule.gate};
      patternHits[rule.name].count++;
      typeSignals[type]=typeSignals[type]||{};
      typeSignals[type][rule.name]=(typeSignals[type][rule.name]||0)+1;
    });
  });

  const sortedTypes=Object.entries(byType).sort((a,b)=>b[1]-a[1]);
  const typeRows=sortedTypes.map((entry,idx)=>{
    const type=entry[0];
    const count=entry[1];
    const pct=totalAnalysed?((count/totalAnalysed)*100).toFixed(1):'0.0';
    const signals=Object.entries(typeSignals[type]||{})
      .sort((a,b)=>b[1]-a[1])
      .slice(0,2)
      .map(([name,n])=>name+' ('+n+')')
      .join(' · ') || 'General regression mix';
    const gates=TYPE_GATE_MAP[type]||'Add targeted tests and release checks for this class before merge.';

    return '<tr class="'+(idx%2===0?'row-even':'row-odd')+'">'+
      '<td class="num-col">'+(idx+1)+'</td>'+
      '<td>'+escHtml(type)+'</td>'+
      '<td>'+count+'</td>'+
      '<td>'+pct+'%</td>'+
      '<td>'+escHtml(signals)+'</td>'+
      '<td>'+escHtml(gates)+'</td>'+
      '</tr>';
  }).join('');

  const sortedPatterns=Object.entries(patternHits)
    .sort((a,b)=>b[1].count-a[1].count)
    .slice(0,8);

  const patternRows=sortedPatterns.map((entry,idx)=>{
    const name=entry[0];
    const meta=entry[1];
    return '<tr class="'+(idx%2===0?'row-even':'row-odd')+'">'+
      '<td class="num-col">'+(idx+1)+'</td>'+
      '<td>'+escHtml(name)+'</td>'+
      '<td>'+meta.count+'</td>'+
      '<td>'+escHtml(meta.gate)+'</td>'+
      '</tr>';
  }).join('');

  const topType=sortedTypes[0]?.[0]||'Functional';
  const topPattern=sortedPatterns[0]?.[0]||'Validation / Input Boundaries';
  const gateList=[
    'Introduce mandatory pre-merge checks for '+topType+' defects using focused automated tests and reviewer checklist items.',
    'Create a CI quality gate for '+topPattern+' issues and fail build when new violations are introduced.',
    'Run a role and permission regression suite before release to prevent security and unauthorized workflow escapes.',
    'Enforce negative-path API and validation tests so bad inputs return clear client errors instead of server failures.',
    'Add parity test charters for high-change modules to catch behavior differences against enterprise expectations.'
  ];

  const typeBody=document.getElementById('da-type-rows');
  const patternBody=document.getElementById('da-pattern-rows');
  const gateListEl=document.getElementById('da-gate-list');
  if(typeBody) typeBody.innerHTML=typeRows;
  if(patternBody) patternBody.innerHTML=patternRows || '<tr><td class="num-col">1</td><td>General regression mix</td><td>0</td><td>Add module-level quality gates</td></tr>';
  if(gateListEl) gateListEl.innerHTML=gateList.map(g=>'<li>'+escHtml(g)+'</li>').join('');

  const repeatSignals=Object.values(patternHits).reduce((s,v)=>s+v.count,0);
  const setTxt=(id,val)=>{ const el=document.getElementById(id); if(el) el.textContent=String(val); };
  setTxt('da-real-total',totalAnalysed);
  setTxt('da-ff-included',ffIncluded);
  setTxt('da-high-risk',highRisk.count);
  setTxt('da-bounce-risk',highBounce.count);
  setTxt('da-repeat-signals',repeatSignals);
}

// ── row numbering ──────────────────────────────────────────────────────────
function renumberRows(){
  document.querySelectorAll('.issue-table tbody').forEach(tbody=>{
    let n=1;
    tbody.querySelectorAll('tr[data-key]').forEach(row=>{
      if(row.style.display==='none') return;
      if(row.cells[0]) row.cells[0].textContent=n++;
    });
  });
}

// ── tabs ───────────────────────────────────────────────────────────────────
function switchTab(name){
  const ids=['overview','developers','leaderboard','defectanalysis','falseflags'];
  document.querySelectorAll('.tab').forEach((t,i)=>t.classList.toggle('active',ids[i]===name));
  document.querySelectorAll('.tab-panel').forEach(p=>p.classList.toggle('active',p.id==='tab-'+name));
}

// ── accordion ──────────────────────────────────────────────────────────────
function toggleDev(idx){
  const body=document.getElementById('body-'+idx), chev=document.getElementById('chev-'+idx);
  const open=body.classList.contains('open');
  body.classList.toggle('open',!open);
  chev.classList.toggle('open',!open);
}

// ── search ─────────────────────────────────────────────────────────────────
function filterIssues(q){
  q=q.toLowerCase();
  document.querySelectorAll('#tab-developers .issue-table tbody tr[data-key]').forEach(row=>{
    row.style.display=row.textContent.toLowerCase().includes(q)?'':'none';
  });
  if(q.length>1){
    document.querySelectorAll('.dev-body').forEach((body,i)=>{
      const vis=[...body.querySelectorAll('tbody tr[data-key]')].some(r=>r.style.display!=='none');
      if(vis&&!body.classList.contains('open')) toggleDev(i);
    });
  }
  renumberRows();
}

// ── edit modal ─────────────────────────────────────────────────────────────
let _editKey=null;

function openEdit(btn){
  const row=btn.closest('tr[data-key]');
  if(!row) return;
  _editKey=row.dataset.key;

  const cells=[...row.cells];
  const ovr=getOverrides();
  const saved=ovr[_editKey]||{};

  document.getElementById('modal-sub').textContent=_editKey;

  // assignee — prefer saved override, else the row's original developer
  document.getElementById('edit-assignee').value = saved.assignee || row.dataset.dev || '';

  // false flag state
  const isFF = saved.isFalseFlag !== undefined ? saved.isFalseFlag : row.classList.contains('ff-row');
  document.getElementById('edit-ff').checked=isFF;
  document.getElementById('ff-reason-row').style.display=isFF?'block':'none';
  document.getElementById('ff-notes-row').style.display=isFF?'block':'none';
  document.getElementById('edit-ff-cat').value=saved.ffCat||'Manual';
  document.getElementById('edit-ff-notes').value=saved.ffNotes||'';

  document.getElementById('editModal').classList.add('open');
  setTimeout(()=>document.getElementById('edit-assignee').focus(),80);
}

function toggleFFReason(){
  const on=document.getElementById('edit-ff').checked;
  document.getElementById('ff-reason-row').style.display=on?'block':'none';
  document.getElementById('ff-notes-row').style.display=on?'block':'none';
}

function closeEdit(){
  document.getElementById('editModal').classList.remove('open');
  _editKey=null;
}
function closeEditOnBg(e){ if(e.target===document.getElementById('editModal')) closeEdit(); }
document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeEdit(); });

function saveEdit(){
  if(!_editKey) return;
  const key=_editKey;
  const ovr=getOverrides();
  const prev=ovr[key]||{};
  const newAssignee=document.getElementById('edit-assignee').value;
  const isFF=document.getElementById('edit-ff').checked;

  const saved={
    ...prev,
    assignee:    newAssignee,
    isFalseFlag: isFF,
    ffCat:       isFF ? document.getElementById('edit-ff-cat').value        : null,
    ffNotes:     isFF ? document.getElementById('edit-ff-notes').value.trim() : null,
    _edited:     true,
    _ts:         new Date().toISOString(),
  };
  ovr[key]=saved;
  putOverrides(ovr);
  _applyToRows(key, saved);
  renumberRows();
  refreshAllStats();
  // Emit event so the real-time sync layer can broadcast without coupling
  document.dispatchEvent(new CustomEvent('cnf:edit', { detail: { key, data: saved } }));
  closeEdit();

  // flash (use captured key, not _editKey which closeEdit() nulled)
  document.querySelectorAll(\`tr[data-key="\${key}"]\`).forEach(r=>{
    r.style.transition='background .1s';
    r.style.background='rgba(99,102,241,.3)';
    setTimeout(()=>r.style.background='',800);
  });

  // toast
  const origDev=document.querySelector(\`tr[data-key="\${key}"]\`)?.dataset?.dev||'';
  const toastMsg = newAssignee!==origDev
    ? \`✅ \${key} saved & reassigned → \${newAssignee}\`
    : \`✅ \${key} saved\`;
  showToast(toastMsg);
}

// ── toast ──────────────────────────────────────────────────────────────────
let _toastTimer=null;
function showToast(msg){
  const t=document.getElementById('toast');
  t.textContent=msg; t.classList.add('show');
  if(_toastTimer) clearTimeout(_toastTimer);
  _toastTimer=setTimeout(()=>t.classList.remove('show'),3200);
}

// ── init ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded',()=>{
  applyAllOverrides();
});
</script>
</body></html>`;

fs.writeFileSync(OUT, html, 'utf8');
const sz = (fs.statSync(OUT).size / 1024).toFixed(1);
console.log('Written → ' + OUT);
console.log('Size: ' + sz + ' KB');
