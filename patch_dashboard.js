/**
 * patch_dashboard.js
 * Adds three features to defect_dashboard.html:
 *   1. Sequential row numbering (#) on every issue table
 *   2. Reassign defect to another developer
 *   3. Flag / un-flag defect as false flag
 * All edits are stored in localStorage so changes persist across page refreshes.
 * No server required — fully self-contained.
 */
const fs   = require('fs');
const FILE = String.raw`C:\optimus-prime\mission\defect-analysis\defect_dashboard.html`;

let html = fs.readFileSync(FILE, 'utf8');

// ── 1. Add "#" column to every issue table header ─────────────────────────
// There are multiple <thead><tr> in the file — we only want the issue tables
// which always start with <th>Key</th>
html = html.replaceAll(
  '<th>Key</th><th>Summary</th><th>Type</th><th>Priority</th>\n            <th>Status</th><th>Reporter</th><th>→RFT (d)</th><th>→Close (d)</th>\n            <th>Bounces</th><th>Cmts</th><th>False Flag</th>',
  '<th class="num-col">#</th><th>Key</th><th>Summary</th><th>Type</th><th>Priority</th>\n            <th>Status</th><th>Reporter</th><th>→RFT (d)</th><th>→Close (d)</th>\n            <th>Bounces</th><th>Cmts</th><th>False Flag</th><th class="actions-col">Actions</th>'
);

// ── 2. Inject row number + Actions cell into every issue row ──────────────
// Each row starts with:
//   <tr class="row-even|row-odd[optionally ff-row]">
//   \n      <td><a href="...browse/CNF-XXXXX" ...>CNF-XXXXX</a>...
// We add a <td class="num-col">N</td> before the key cell and
// an Actions cell at the end, before </tr>
// We'll do this in JS inside the page (dynamic, works with localStorage overrides too)
// so we just need the skeleton cells injected and JS fills them.

// Regex: match every issue table row, inject cells
// Pattern: <tr class="row-even|row-odd[| ff-row...]*">\n      <td><a href="...browse/CNF-
html = html.replace(
  /(<tr class="(?:row-even|row-odd)[^"]*">\s*\n\s*<td><a href="https:\/\/brightlysoftware\.atlassian\.net\/browse\/(CNF-\d+)")/g,
  (match, prefix, key) =>
    `${prefix.replace(/<tr class="/, `<tr data-key="${key}" class="`)}`.replace(
      /(<tr data-key="[^"]*" class="[^"]*">\s*\n\s*)(<td><a)/,
      `$1<td class="num-col row-num">—</td>$2`
    )
);

// That approach is complex with nested replacements. Use a simpler two-pass:
// Pass A: tag every row with data-key
html = html.replace(
  /(<tr class="(row-even|row-odd(?:\s+ff-row)?)">\s*\n\s*<td>)(<a href="https:\/\/brightlysoftware\.atlassian\.net\/browse\/(CNF-\d+)")/g,
  (m, prefix, cls, _a, key) =>
    `<tr data-key="${key}" class="${cls}">\n      <td class="num-col row-num" id="rn-${key}">—</td>\n      <td>$3`.replace('$3', `<a href="https://brightlysoftware.atlassian.net/browse/${key}"`)
);

// Pass B: close each issue row by inserting the Actions cell before </tr>
// Find rows that have data-key and end with </tr>, adding the actions cell
html = html.replace(
  /(<td class="ff-reason-cell"[^>]*>[^<]*<\/td>\s*\n\s*<\/tr>)/g,
  (m) => m.replace('</tr>', `<td class="actions-col"><button class="act-btn" onclick="openEdit(this)">✏️ Edit</button></td>\n    </tr>`)
);

// ── 3. Add CSS for new elements ────────────────────────────────────────────
const newCSS = `
/* ── Row numbering ── */
.num-col{width:36px;text-align:center;font-size:11px;color:var(--text2);font-variant-numeric:tabular-nums;flex-shrink:0;}
.issue-table th.num-col{width:36px;}

/* ── Actions column ── */
.actions-col{width:80px;text-align:center;white-space:nowrap;}
.act-btn{background:var(--surface2);border:1px solid var(--border);border-radius:6px;
  color:var(--text);font-size:11px;padding:3px 8px;cursor:pointer;transition:background .15s,border-color .15s;}
.act-btn:hover{background:var(--accent);border-color:var(--accent);color:#fff;}

/* ── Edit modal ── */
.modal-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:2000;
  align-items:center;justify-content:center;backdrop-filter:blur(3px);}
.modal-overlay.open{display:flex;}
.modal{background:var(--surface);border:1px solid var(--border);border-radius:16px;
  width:min(560px,94vw);max-height:90vh;overflow-y:auto;padding:28px 28px 24px;
  box-shadow:0 24px 64px rgba(0,0,0,.45);position:relative;}
.modal h2{font-size:1.05rem;font-weight:700;margin-bottom:4px;color:var(--text);}
.modal .modal-key{font-size:12px;color:var(--accent);font-weight:600;margin-bottom:18px;display:block;}
.modal-close{position:absolute;top:14px;right:16px;background:none;border:none;
  font-size:20px;cursor:pointer;color:var(--text2);line-height:1;padding:2px 6px;border-radius:6px;}
.modal-close:hover{background:var(--surface2);color:var(--text);}
.form-row{display:flex;flex-direction:column;gap:5px;margin-bottom:16px;}
.form-row label{font-size:12px;color:var(--text2);font-weight:600;text-transform:uppercase;letter-spacing:.5px;}
.form-row input,.form-row select,.form-row textarea{
  background:var(--surface2);border:1px solid var(--border);border-radius:8px;
  color:var(--text);font-size:13px;padding:8px 12px;width:100%;outline:none;
  transition:border-color .15s;font-family:inherit;}
.form-row input:focus,.form-row select:focus,.form-row textarea:focus{border-color:var(--accent);}
.form-row select option{background:var(--surface2);color:var(--text);}
.form-row textarea{resize:vertical;min-height:70px;}
.ff-toggle-row{display:flex;align-items:center;gap:12px;padding:10px 14px;
  background:var(--surface2);border:1px solid var(--border);border-radius:8px;margin-bottom:16px;}
.ff-toggle-row label{font-size:13px;color:var(--text);cursor:pointer;flex:1;}
.ff-toggle-row input[type=checkbox]{width:16px;height:16px;accent-color:var(--purple);cursor:pointer;}
.modal-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:20px;padding-top:16px;border-top:1px solid var(--border);}
.btn-save{background:var(--accent);border:none;border-radius:8px;color:#fff;
  font-size:13px;font-weight:600;padding:8px 22px;cursor:pointer;transition:opacity .15s;}
.btn-save:hover{opacity:.88;}
.btn-cancel{background:var(--surface2);border:1px solid var(--border);border-radius:8px;
  color:var(--text);font-size:13px;padding:8px 18px;cursor:pointer;transition:background .15s;}
.btn-cancel:hover{background:var(--border);}
.edit-tag{display:inline-block;background:var(--accent);color:#fff;font-size:10px;
  font-weight:700;padding:1px 5px;border-radius:4px;vertical-align:middle;margin-left:4px;letter-spacing:.4px;}
`;

html = html.replace('</style>', newCSS + '\n</style>');

// ── 4. Add modal HTML before </div> (end of .page) ────────────────────────
const modalHTML = `
<!-- ── Edit / Reassign / False-Flag Modal ── -->
<div class="modal-overlay" id="editModal" onclick="closeEditOnBg(event)">
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
    <button class="modal-close" onclick="closeEdit()" title="Close">×</button>
    <h2 id="modal-title">Edit Defect</h2>
    <span class="modal-key" id="modal-key-display"></span>

    <div class="form-row">
      <label>Summary</label>
      <textarea id="edit-summary" rows="3"></textarea>
    </div>

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

    <div class="form-row">
      <label>Priority</label>
      <select id="edit-priority">
        <option value="Blocker">Blocker</option>
        <option value="Urgent">Urgent</option>
        <option value="High">High</option>
        <option value="Medium">Medium</option>
        <option value="Low">Low</option>
      </select>
    </div>

    <div class="form-row">
      <label>Defect Type</label>
      <select id="edit-type">
        <option value="API / Backend">API / Backend</option>
        <option value="UI / Frontend">UI / Frontend</option>
        <option value="Security">Security</option>
        <option value="Validation">Validation</option>
        <option value="Data / CRUD">Data / CRUD</option>
        <option value="Performance">Performance</option>
        <option value="Functional">Functional</option>
      </select>
    </div>

    <div class="ff-toggle-row">
      <input type="checkbox" id="edit-ff" />
      <label for="edit-ff">⚑ Flag as False Flag (defect is not a real code bug)</label>
    </div>

    <div class="form-row" id="ff-reason-row" style="display:none">
      <label>False Flag Reason</label>
      <textarea id="edit-ff-reason" rows="2" placeholder="e.g. Cannot reproduce / Working as designed / Tester procedure issue…"></textarea>
    </div>

    <div class="form-row">
      <label>Notes / Change Reason <span style="font-weight:400;text-transform:none;letter-spacing:0">(optional)</span></label>
      <textarea id="edit-notes" rows="2" placeholder="Why is this being updated?"></textarea>
    </div>

    <div class="modal-actions">
      <button class="btn-cancel" onclick="closeEdit()">Cancel</button>
      <button class="btn-save" onclick="saveEdit()">Save Changes</button>
    </div>
  </div>
</div>
`;

html = html.replace('<footer>', modalHTML + '\n<footer>');

// ── 5. Replace the JS block ────────────────────────────────────────────────
const newScript = `
<script>
// ══════════════════════════════════════════════════════════════════════════
//  CNF Defect Dashboard — interactive layer
// ══════════════════════════════════════════════════════════════════════════

// ── Theme ─────────────────────────────────────────────────────────────────
(function(){
  var saved = localStorage.getItem('cnf-theme') || 'dark';
  applyTheme(saved);
})();
function applyTheme(theme){
  document.documentElement.setAttribute('data-theme', theme === 'light' ? 'light' : '');
  var icon  = document.getElementById('theme-icon');
  var label = document.getElementById('theme-label');
  if(icon)  icon.textContent  = theme === 'light' ? '🌙' : '☀️';
  if(label) label.textContent = theme === 'light' ? 'Dark' : 'Light';
}
function toggleTheme(){
  var current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  var next    = current === 'light' ? 'dark' : 'light';
  localStorage.setItem('cnf-theme', next);
  applyTheme(next);
}

// ── localStorage override store ───────────────────────────────────────────
// Format: { [key]: { summary, assignee, priority, defectType, isFalseFlag, ffReason, notes } }
function getOverrides(){ return JSON.parse(localStorage.getItem('cnf-overrides') || '{}'); }
function saveOverrides(obj){ localStorage.setItem('cnf-overrides', JSON.stringify(obj)); }

// ── Colour maps (badge colours) ───────────────────────────────────────────
const PRIO_CLR  = {Blocker:'#dc2626',Urgent:'#ea580c',High:'#d97706',Medium:'#2563eb',Low:'#16a34a'};
const TYPE_CLR  = {'API / Backend':'#6366f1','UI / Frontend':'#ec4899',Security:'#dc2626',
  Validation:'#f59e0b','Data / CRUD':'#0891b2',Performance:'#d97706',Functional:'#94a3b8'};
const STATUS_CLR = {'Development Complete':'#16a34a','Ready for Testing':'#2563eb',
  'In Testing':'#7c3aed',Done:'#059669',Closed:'#059669',Resolved:'#059669',
  'In Development':'#f59e0b','Ready For Sprint':'#64748b',Blocked:'#dc2626'};

function badge(val, map){ return \`<span class="badge" style="background:\${map[val]||'#64748b'}">\${val}</span>\`; }
function ffBadgeHTML(){ return \`<span class="badge" style="background:#7c3aed;border:1px solid #a78bfa">⚑ False Flag</span>\`; }

// ── Apply all overrides to the DOM on load ────────────────────────────────
function applyAllOverrides(){
  const ovr = getOverrides();
  // Number all rows first
  numberRows();
  for(const [key, data] of Object.entries(ovr)){
    applyOverrideToRow(key, data);
  }
}

// ── Number all visible issue rows globally ────────────────────────────────
function numberRows(){
  let n = 1;
  document.querySelectorAll('tr[data-key]').forEach(row => {
    const cell = row.querySelector('.row-num');
    if(cell) cell.textContent = n++;
  });
}

// ── Apply a single override to every DOM row for that key ─────────────────
function applyOverrideToRow(key, data){
  document.querySelectorAll(\`tr[data-key="\${key}"]\`).forEach(row => {
    // Summary cell (2nd td — after #)
    const cells = row.querySelectorAll('td');
    if(cells.length < 2) return;

    // summary cell = index 2 (0=#, 1=key+badge, 2=summary)
    const sumCell = cells[2];
    if(sumCell && data.summary !== undefined){
      const orig = sumCell.getAttribute('data-orig-summary') || sumCell.title;
      if(!sumCell.getAttribute('data-orig-summary')) sumCell.setAttribute('data-orig-summary', orig);
      const display = data.summary.substring(0,75) + (data.summary.length>75?'…':'');
      sumCell.textContent = display;
      sumCell.title = data.summary;
      sumCell.setAttribute('data-edited','1');
    }

    // type badge = index 3
    if(cells[3] && data.defectType) cells[3].innerHTML = badge(data.defectType, TYPE_CLR);

    // priority badge = index 4
    if(cells[4] && data.priority) cells[4].innerHTML = badge(data.priority, PRIO_CLR);

    // false flag cell = index 10 (0=#,1=key,2=sum,3=type,4=prio,5=status,6=reporter,7=rft,8=close,9=bounces,10=cmts? no...)
    // Actual column order: #, key, summary, type, priority, status, reporter, rft, close, bounces, cmts, false-flag, actions
    // Index:               0   1     2       3      4         5       6        7    8       9        10    11          12
    const ffCell = cells[11];
    if(ffCell){
      if(data.isFalseFlag){
        ffCell.innerHTML = \`<span class="badge" style="background:#7c3aed">⚑ \${data.ffCategory||'Manual'}</span>\`;
      } else {
        ffCell.innerHTML = '—';
      }
    }

    // key cell (index 1) — add/remove edited tag and ff class on row
    const keyCell = cells[1];
    if(keyCell){
      const existingTag = keyCell.querySelector('.edit-tag');
      if(existingTag) existingTag.remove();
      if(data._edited) keyCell.innerHTML += \` <span class="edit-tag">edited</span>\`;
    }

    // Row ff highlight
    if(data.isFalseFlag){
      row.classList.add('ff-row');
    } else {
      row.classList.remove('ff-row');
    }

    // Reassignment: update the "developer" section heading if moving rows is too complex
    // We do a simpler approach: show a reassigned banner on the row itself
    if(data.assignee){
      const reTag = row.querySelector('.reassign-tag');
      if(reTag) reTag.remove();
      // Insert after key cell if different from original
      const origDev = row.getAttribute('data-orig-dev') || '';
      if(origDev && origDev !== data.assignee){
        const td = cells[1];
        td.innerHTML += \` <span class="badge reassign-tag" style="background:#0891b2;font-size:10px" title="Reassigned to \${data.assignee}">↪ \${data.assignee.split(' ')[0]}</span>\`;
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

// ── Search/filter ─────────────────────────────────────────────────────────
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
  numberRows();
}

// ── Edit modal ────────────────────────────────────────────────────────────
let _currentEditKey = null;

function openEdit(btn){
  const row = btn.closest('tr[data-key]');
  if(!row) return;
  const key = row.dataset.key;
  _currentEditKey = key;

  const cells = row.querySelectorAll('td');
  // Read current values (may have been overridden)
  const ovr = getOverrides();
  const saved = ovr[key] || {};

  // Populate fields
  document.getElementById('modal-key-display').textContent = key;
  document.getElementById('modal-title').textContent = 'Edit Defect — ' + key;

  // Summary: prefer saved, else read from cell title attr
  const sumCell = cells[2];
  document.getElementById('edit-summary').value =
    saved.summary !== undefined ? saved.summary : (sumCell ? (sumCell.title || sumCell.textContent.trim()) : '');

  // Assignee: prefer saved, else read data-orig-dev on row or nearest section heading
  const origDev = row.getAttribute('data-orig-dev') || guessDevFromRow(row);
  document.getElementById('edit-assignee').value = saved.assignee || origDev;
  if(!row.getAttribute('data-orig-dev') && origDev) row.setAttribute('data-orig-dev', origDev);

  // Priority: read badge text
  const prioCell = cells[4];
  const prioText = saved.priority || (prioCell ? prioCell.querySelector('.badge')?.textContent?.trim() : '') || 'Medium';
  document.getElementById('edit-priority').value = prioText;

  // Type: read badge text
  const typeCell = cells[3];
  const typeText = saved.defectType || (typeCell ? typeCell.querySelector('.badge')?.textContent?.trim() : '') || 'Functional';
  document.getElementById('edit-type').value = typeText;

  // False flag
  const isFF = saved.isFalseFlag !== undefined
    ? saved.isFalseFlag
    : row.classList.contains('ff-row');
  document.getElementById('edit-ff').checked = isFF;
  document.getElementById('edit-ff-reason').value = saved.ffReason || '';
  document.getElementById('ff-reason-row').style.display = isFF ? 'block' : 'none';

  document.getElementById('edit-notes').value = saved.notes || '';

  document.getElementById('editModal').classList.add('open');
  document.getElementById('edit-summary').focus();
}

function guessDevFromRow(row){
  // Walk up to find the nearest dev-card and read the dev name from its header
  const card = row.closest('.dev-card');
  if(card){
    const h3 = card.querySelector('.dev-info h3');
    if(h3) return h3.textContent.trim();
  }
  return '';
}

document.getElementById('edit-ff').addEventListener('change', function(){
  document.getElementById('ff-reason-row').style.display = this.checked ? 'block' : 'none';
});

function closeEdit(){
  document.getElementById('editModal').classList.remove('open');
  _currentEditKey = null;
}
function closeEditOnBg(e){
  if(e.target === document.getElementById('editModal')) closeEdit();
}
document.addEventListener('keydown', e => { if(e.key === 'Escape') closeEdit(); });

function saveEdit(){
  if(!_currentEditKey) return;
  const key = _currentEditKey;
  const ovr = getOverrides();

  const data = {
    summary:     document.getElementById('edit-summary').value.trim(),
    assignee:    document.getElementById('edit-assignee').value,
    priority:    document.getElementById('edit-priority').value,
    defectType:  document.getElementById('edit-type').value,
    isFalseFlag: document.getElementById('edit-ff').checked,
    ffReason:    document.getElementById('edit-ff-reason').value.trim(),
    ffCategory:  document.getElementById('edit-ff').checked ? 'Manual' : null,
    notes:       document.getElementById('edit-notes').value.trim(),
    _edited:     true,
    _savedAt:    new Date().toISOString(),
  };

  ovr[key] = data;
  saveOverrides(ovr);
  applyOverrideToRow(key, data);
  numberRows();
  closeEdit();

  // Flash the saved row
  document.querySelectorAll(\`tr[data-key="\${key}"]\`).forEach(r => {
    r.style.transition = 'background .1s';
    r.style.background = 'rgba(99,102,241,.25)';
    setTimeout(() => { r.style.background = ''; }, 700);
  });
}

// ── On DOM ready ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Tag each row with the developer name from its parent card
  document.querySelectorAll('.dev-card').forEach(card => {
    const devName = card.querySelector('.dev-info h3')?.textContent?.trim() || '';
    card.querySelectorAll('tr[data-key]').forEach(row => {
      if(!row.getAttribute('data-orig-dev')) row.setAttribute('data-orig-dev', devName);
    });
  });
  applyAllOverrides();
});
</script>
`;

// Remove old script block and append new one
html = html.replace(/<script>[\s\S]*?<\/script>\s*<\/body><\/html>/, newScript + '\n</body></html>');

fs.writeFileSync(FILE, html, 'utf8');
const size = (fs.statSync(FILE).size / 1024).toFixed(1);
console.log(`Patched → ${FILE}`);
console.log(`Size: ${size} KB`);
