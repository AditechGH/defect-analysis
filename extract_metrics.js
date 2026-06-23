const fs = require('fs');
const path = require('path');

const BASE = String.raw`C:\Users\z00597ew\.claude\projects\C--optimus-prime-mission-defect-analysis\b593024f-81b5-4d1b-9525-4f972940486d\tool-results`;

const DEVELOPERS = {
  "712020:d9aa0306-1300-44fc-bd29-8abe306f07fe": { name: "Abubakar Adamu",  email: "abubakar.adamu.ext@brightlysoftware.com" },
  "712020:407d6248-323b-459e-a956-57d36e03a526": { name: "Adinan Alhassan",  email: "adinan.alhassan.ext@brightlysoftware.com" },
  "712020:f498aef4-0ecd-43b5-8627-6e8729712986": { name: "Abenezer Bayu",    email: "abenezer.bayu.ext@brightlysoftware.com" },
  "712020:4e753b4c-292f-43c1-aec8-346aa573fc63": { name: "Emmy Bbaale",      email: "emmy.bbaale.ext@siemens.com" },
  "712020:391f1fcb-67ae-4668-956c-0025cc785212": { name: "Ojobe Ekpor",      email: "ojobe.ekpor.ext@brightlysoftware.com" },
  "712020:9484d75f-f78a-4c62-86d5-e3202d55e129": { name: "Kashish Goyal",    email: "kashish.goyal.ext@siemens.com" },
  "712020:98376025-a295-45d3-8479-a6c4c617708b": { name: "Michael Johnson",  email: "michael.johnson.ext@brightlysoftware.com" },
  "712020:5a76440b-b20f-4c76-9fe0-e08db894a301": { name: "Nilesh Pore",      email: "nilesh.pore.ext@brightlysoftware.com" },
  "712020:9f4e93bd-1ced-489a-8034-3965e2ca3beb": { name: "Touqeer Shakeel",  email: "touqeer.shakeel.ext@brightlysoftware.com" },
  "712020:b8298392-2a8a-4bc9-ae32-87f56ff8eb8e": { name: "Bhanu Teja",       email: "bhanu.teja.ext@brightlysoftware.com" },
};

// Order matches the query sequence
const FILE_TO_DEV = [
  "712020:d9aa0306-1300-44fc-bd29-8abe306f07fe",
  "712020:407d6248-323b-459e-a956-57d36e03a526",
  "712020:f498aef4-0ecd-43b5-8627-6e8729712986",
  "712020:4e753b4c-292f-43c1-aec8-346aa573fc63",
  "712020:391f1fcb-67ae-4668-956c-0025cc785212",
  "712020:9484d75f-f78a-4c62-86d5-e3202d55e129",
  "712020:98376025-a295-45d3-8479-a6c4c617708b",
  "712020:5a76440b-b20f-4c76-9fe0-e08db894a301",
  "712020:9f4e93bd-1ced-489a-8034-3965e2ca3beb",
  "712020:b8298392-2a8a-4bc9-ae32-87f56ff8eb8e",
];

const ALL_DEV_IDS = new Set(Object.keys(DEVELOPERS));

function daysBetween(a, b) {
  if (!a || !b) return null;
  return Math.abs((new Date(b) - new Date(a)) / 86400000);
}

function classifyDefect(summary) {
  const s = summary.toLowerCase();
  if (/security|permission|breach|privilege|access denied|unauthorized/.test(s)) return 'Security';
  if (/api|server error|500|graphql|endpoint|grpc|rest/.test(s)) return 'API / Backend';
  if (/ui |display|mismatch|label|button|scroll|pagination|layout|icon|dropdown|modal|dialog|screen|distort|tooltip|style|css/.test(s)) return 'UI / Frontend';
  if (/validation|mandatory|required|invalid|error message|character limit|max.?length/.test(s)) return 'Validation';
  if (/performance|slow|load/.test(s)) return 'Performance';
  if (/delete|unable to delete|not able to delete|remove/.test(s)) return 'Data / CRUD';
  return 'Functional';
}

function extractBounces(comments) {
  // Count direction changes between dev and non-dev (tester) authors
  let bounces = 0;
  let lastRole = null;
  for (const c of comments) {
    const authorId = (c.author || {}).accountId || '';
    const role = ALL_DEV_IDS.has(authorId) ? 'dev' : 'tester';
    if (lastRole !== null && role !== lastRole) bounces++;
    lastRole = role;
  }
  return bounces;
}

// Load result files
const allFiles = fs.readdirSync(BASE)
  .filter(f => f.startsWith('mcp-atlassian-searchJiraIssuesUsingJql-') && f.endsWith('.txt'))
  .sort();

console.log(`Found ${allFiles.length} files`);

const devData = {};
const seenKeys = new Set(); // dedupe issues that appear under multiple devs

for (let i = 0; i < allFiles.length && i < FILE_TO_DEV.length; i++) {
  const devId = FILE_TO_DEV[i];
  const fname = allFiles[i];
  const fpath = path.join(BASE, fname);
  const raw = fs.readFileSync(fpath, 'utf8');
  const arr = JSON.parse(raw);
  // arr[0] = IMPORTANT notice, arr[1] = actual Jira JSON
  const jiraText = arr.length > 1 ? arr[1].text : arr[0].text;
  const obj = JSON.parse(jiraText);
  const issues = obj.issues || [];

  const devInfo = DEVELOPERS[devId];
  console.log(`\n${devInfo.name}: ${issues.length} issues`);

  const devIssues = [];

  for (const issue of issues) {
    const key = issue.key;
    const flds = issue.fields;
    const summary = flds.summary || '';
    const created = flds.created;
    const updated = flds.updated;
    const resdate = flds.resolutiondate;
    const status = (flds.status || {}).name || 'Unknown';
    const priority = (flds.priority || {}).name || 'Unknown';
    const assigneeId = (flds.assignee || {}).accountId || '';
    const assigneeName = (flds.assignee || {}).displayName || 'Unassigned';
    const reporterName = (flds.reporter || {}).displayName || 'Unknown';
    const comments = ((flds.comment || {}).comments) || [];

    const defectType = classifyDefect(summary);

    // Time metrics
    const TESTING_STATUSES = new Set(['Ready for Testing', 'Done', 'Closed', 'Resolved', 'Verified', 'Fixed', 'In Testing']);
    const isInTestingOrDone = TESTING_STATUSES.has(status);
    const timeToRft = isInTestingOrDone ? daysBetween(created, updated) : null;
    const timeToClose = resdate ? daysBetween(created, resdate) : null;
    const bounces = extractBounces(comments);

    // Determine if this issue was truly assigned to this dev (current or historical)
    const isCurrentAssignee = assigneeId === devId;

    devIssues.push({
      key, summary, defectType, priority, status,
      created, updated, resolutiondate: resdate,
      assigneeId, assigneeName, reporterName,
      isCurrentAssignee,
      timeToRftDays: timeToRft ? +timeToRft.toFixed(1) : null,
      timeToCloseDays: timeToClose ? +timeToClose.toFixed(1) : null,
      bounces,
      commentCount: comments.length,
    });

    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      console.log(`  ${key}: ${status} | ${priority} | bounces=${bounces} | ${defectType}`);
    }
  }

  devData[devId] = {
    name: devInfo.name,
    email: devInfo.email,
    issues: devIssues,
    total: devIssues.length,
  };
}

// Compute summary stats
console.log('\n=== SUMMARY ===');
for (const [devId, d] of Object.entries(devData)) {
  const issues = d.issues;
  const total = issues.length;
  const done = issues.filter(i => ['Done','Closed','Resolved','Verified','Fixed'].includes(i.status)).length;
  const bounceVals = issues.filter(i => i.bounces > 0).map(i => i.bounces);
  const avgBounces = bounceVals.length ? (bounceVals.reduce((a,b)=>a+b,0)/bounceVals.length).toFixed(1) : 0;
  const rftTimes = issues.filter(i => i.timeToRftDays !== null).map(i => i.timeToRftDays);
  const avgRft = rftTimes.length ? (rftTimes.reduce((a,b)=>a+b,0)/rftTimes.length).toFixed(1) : 'N/A';
  const closeTimes = issues.filter(i => i.timeToCloseDays !== null).map(i => i.timeToCloseDays);
  const avgClose = closeTimes.length ? (closeTimes.reduce((a,b)=>a+b,0)/closeTimes.length).toFixed(1) : 'N/A';
  console.log(`${d.name.padEnd(25)} | total=${total.toString().padStart(3)} | done=${done.toString().padStart(3)} | avg_bounces=${avgBounces} | avg_rft=${avgRft} days | avg_close=${avgClose} days`);
}

// Save metrics JSON
const outPath = String.raw`C:\optimus-prime\mission\defect-analysis\dev_metrics.json`;
fs.writeFileSync(outPath, JSON.stringify(devData, null, 2));
console.log(`\nSaved to ${outPath}`);
