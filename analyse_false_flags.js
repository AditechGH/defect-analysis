/**
 * Analyse all issues from the 10 result files:
 *  1. Detect genuine false-flag defects (not-a-bug, cannot reproduce, by design, env-only)
 *  2. Correct developer assignments using changelog assignee history + comment cues
 *  3. Output corrected metrics JSON + false-flag list
 *
 * FALSE FLAG DEFINITION (matching CNF-58226 / CNF-55482 examples):
 *   A defect reported by a tester that was NOT a real code bug — i.e.:
 *   (a) Developer/dev shows the behaviour was already correct before any fix
 *   (b) Cannot be reproduced (env/setup issue, not a code defect)
 *   (c) Confirmed working as designed — tester had wrong expectation
 *   (d) Tester procedure issue (e.g. needed sign-out/sign-in, not a product bug)
 *
 * NOT a false flag:
 *   - Real bug that was fixed and then tester verified "working as expected"
 *   - Developer posted a fix ZIP/build, then tester closed as resolved
 */
const fs = require("fs");
const path = require("path");

// Path to tool results directory (set via BASE_PATH env var or default to ./tool-results)
const BASE = process.env.BASE_PATH || path.join(__dirname, "tool-results");
const OUT_FF = path.join(__dirname, "false_flags.json");
const OUT_FIXED = path.join(__dirname, "dev_metrics_corrected.json");

const DEVELOPERS = {
  "712020:d9aa0306-1300-44fc-bd29-8abe306f07fe": "Abubakar Adamu",
  "712020:407d6248-323b-459e-a956-57d36e03a526": "Adinan Alhassan",
  "712020:f498aef4-0ecd-43b5-8627-6e8729712986": "Abenezer Bayu",
  "712020:4e753b4c-292f-43c1-aec8-346aa573fc63": "Emmy Bbaale",
  "712020:391f1fcb-67ae-4668-956c-0025cc785212": "Ojobe Ekpor",
  "712020:9484d75f-f78a-4c62-86d5-e3202d55e129": "Kashish Goyal",
  "712020:98376025-a295-45d3-8479-a6c4c617708b": "Michael Johnson",
  "712020:5a76440b-b20f-4c76-9fe0-e08db894a301": "Nilesh Pore",
  "712020:9f4e93bd-1ced-489a-8034-3965e2ca3beb": "Touqeer Shakeel",
  "712020:b8298392-2a8a-4bc9-ae32-87f56ff8eb8e": "Bhanu Teja",
};
const DEV_IDS = new Set(Object.keys(DEVELOPERS));

const DEVELOPER_EMAILS = {
  "712020:d9aa0306-1300-44fc-bd29-8abe306f07fe":
    "abubakar.adamu.ext@brightlysoftware.com",
  "712020:407d6248-323b-459e-a956-57d36e03a526":
    "adinan.alhassan.ext@brightlysoftware.com",
  "712020:f498aef4-0ecd-43b5-8627-6e8729712986":
    "abenezer.bayu.ext@brightlysoftware.com",
  "712020:4e753b4c-292f-43c1-aec8-346aa573fc63": "emmy.bbaale.ext@siemens.com",
  "712020:391f1fcb-67ae-4668-956c-0025cc785212":
    "ojobe.ekpor.ext@brightlysoftware.com",
  "712020:9484d75f-f78a-4c62-86d5-e3202d55e129":
    "kashish.goyal.ext@siemens.com",
  "712020:98376025-a295-45d3-8479-a6c4c617708b":
    "michael.johnson.ext@brightlysoftware.com",
  "712020:5a76440b-b20f-4c76-9fe0-e08db894a301":
    "nilesh.pore.ext@brightlysoftware.com",
  "712020:9f4e93bd-1ced-489a-8034-3965e2ca3beb":
    "touqeer.shakeel.ext@brightlysoftware.com",
  "712020:b8298392-2a8a-4bc9-ae32-87f56ff8eb8e":
    "bhanu.teja.ext@brightlysoftware.com",
};

// Comment indicators that a fix build/ZIP was delivered BEFORE closing
// If these appear before the "working as expected" comment, it's a real bug that was fixed
const FIX_DELIVERY_PATTERNS = [
  /please\s+(find|use|download|take|check)\s+(the\s+)?(zip|installer|build|patch|fix)/i,
  /find\s+(zip|installer|build)\s+(in|at|on|below)/i,
  /download\s+zip\s+with\s+changes/i,
  /s3\s+path/i,
  /jenkins\.confirm/i,
  /branch.*build/i,
  /latest\s+(service\s+)?build/i,
  /taking\s+the\s+updated\s+(mfe|service|build)/i,
  /please\s+(re-?test|retest)\s+on\s+this\s+build/i,
];

// Genuine false-flag comment patterns (developer or tester confirming was-never-a-bug)
const CANNOT_REPRODUCE_PATTERNS = [
  /\b(cannot|can'?t|unable\s+to|could\s+not|not\s+able\s+to)\s+(reproduce|replicate)\b/i,
  /\bnot\s+reproducible\b/i,
  /\bnot\s+reproduced\b/i,
  /\bI\s+am\s+not\s+able\s+to\s+reproduce\s+this\b/i,
  /\bnot\s+able\s+to\s+reproduce\s+this\s+(bug|defect|issue)\b/i,
  /\bissue\s+not\s+reproducible\b/i,
  /\b(env(ironment)?|setup)\s+(issue|problem|specific)\b/i,
];

const BY_DESIGN_PATTERNS = [
  /\b(working|works|behaves?)\s+as\s+(expected|designed|intended)\b/i,
  /\bby\s+design\b/i,
  /\bthis\s+is\s+(the\s+)?(expected|correct|intended)\s+(behavior|behaviour)\b/i,
  /\bexpected\s+behavior\b/i,
  /\bthis\s+is\s+(already\s+)?working\s+(correctly|as\s+expected)\b/i,
  /\bnot\s+a\s+bug\b/i,
  /\binvalid\s+defect\b/i,
  /\bwon'?t\s+fix\b/i,
];

const PROCEDURE_PATTERNS = [
  /\bsign\s+out\s+and\s+(sign|log)\s+back\s+in\b/i,
  /\bsign\s+out\b.*\bsign\s+(back\s+)?in\b/i,
  /\bplease\s+(sign|log)\s+out\b/i,
];

// Dev-confirms-API-was-already-working patterns (matching CNF-58226 style)
const API_ALREADY_CORRECT_PATTERNS = [
  /\b(api|service|endpoint)\s+already\s+(return|respond|behav)/i,
  /\bI\s+am\s+not\s+able\s+to\s+reproduce\s+this\s+bug/i,
  /\bwhen\s+I\s+invoke[d]?\s+the\b/i, // developer showing API already correct
];

function commentHasFixDelivery(comments) {
  return comments.some((c) =>
    FIX_DELIVERY_PATTERNS.some((p) => p.test(c.body || "")),
  );
}

function detectFalseFlag(issue) {
  const flds = issue.fields;
  const comments = (flds.comment || {}).comments || [];

  // If any comment shows a fix was delivered (ZIP/build/branch), this is a real bug
  if (commentHasFixDelivery(comments)) {
    return { isFalseFlag: false };
  }

  // Check each comment for genuine false-flag signals
  for (const c of comments) {
    const body = c.body || "";
    const authorId = (c.author || {}).accountId || "";
    const authorName = (c.author || {}).displayName || "";
    const isDev = DEV_IDS.has(authorId);

    // Pattern 1: Developer explicitly cannot reproduce
    for (const p of CANNOT_REPRODUCE_PATTERNS) {
      if (p.test(body)) {
        return {
          isFalseFlag: true,
          category: "Cannot Reproduce",
          reason: `${authorName} (${isDev ? "dev" : "tester"}): "${body
            .replace(/<[^>]+>/g, "")
            .substring(0, 150)
            .trim()}"`,
          commentAuthor: authorName,
          commentAuthorId: authorId,
        };
      }
    }

    // Pattern 2: Developer / tester confirms this is by design (only if NO fix was delivered before)
    for (const p of BY_DESIGN_PATTERNS) {
      if (p.test(body)) {
        // Extra guard: if the commenter is the original reporter saying "now working" after a fix
        // that's NOT a false flag. But if a DEV says "by design" / "expected behaviour" it is.
        // Also accept tester closing with "working as expected" ONLY if no fix ZIP was provided
        return {
          isFalseFlag: true,
          category: "Working as Designed / Expected",
          reason: `${authorName} (${isDev ? "dev" : "tester"}): "${body
            .replace(/<[^>]+>/g, "")
            .substring(0, 150)
            .trim()}"`,
          commentAuthor: authorName,
          commentAuthorId: authorId,
        };
      }
    }

    // Pattern 3: Tester procedure issue
    for (const p of PROCEDURE_PATTERNS) {
      if (p.test(body)) {
        return {
          isFalseFlag: true,
          category: "Tester Procedure Issue",
          reason: `${authorName}: "${body
            .replace(/<[^>]+>/g, "")
            .substring(0, 150)
            .trim()}"`,
          commentAuthor: authorName,
          commentAuthorId: authorId,
        };
      }
    }

    // Pattern 4: Dev shows API was already returning correct response (CNF-58226 style)
    if (isDev) {
      for (const p of API_ALREADY_CORRECT_PATTERNS) {
        if (p.test(body)) {
          return {
            isFalseFlag: true,
            category: "API Already Correct",
            reason: `${authorName}: "${body
              .replace(/<[^>]+>/g, "")
              .substring(0, 150)
              .trim()}"`,
            commentAuthor: authorName,
            commentAuthorId: authorId,
          };
        }
      }
    }
  }

  return { isFalseFlag: false };
}

function classifyDefect(summary) {
  const s = summary.toLowerCase();
  if (/security|permission|breach|privilege|access denied|unauthorized/.test(s))
    return "Security";
  if (/api|server error|500|graphql|endpoint|grpc|rest/.test(s))
    return "API / Backend";
  if (
    /\bui\b|display|mismatch|label|button|scroll|pagination|layout|icon|dropdown|modal|dialog|screen|distort|tooltip|style|css/.test(
      s,
    )
  )
    return "UI / Frontend";
  if (
    /validation|mandatory|required|invalid|error message|character limit|max.?length/.test(
      s,
    )
  )
    return "Validation";
  if (/performance|slow|load/.test(s)) return "Performance";
  if (/delete|unable to delete|not able to delete|remove/.test(s))
    return "Data / CRUD";
  return "Functional";
}

function daysBetween(a, b) {
  if (!a || !b) return null;
  return Math.abs((new Date(b) - new Date(a)) / 86400000);
}

// ── Load all unique issues ──────────────────────────────────────────────
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

const allFiles = fs
  .readdirSync(BASE)
  .filter(
    (f) =>
      f.startsWith("mcp-atlassian-searchJiraIssuesUsingJql-") &&
      f.endsWith(".txt"),
  )
  .sort();

const allIssuesMap = new Map(); // key → issue
const issueToDevs = new Map(); // key → Set<devId> that appeared in their "was assignee" results

for (let i = 0; i < allFiles.length && i < FILE_TO_DEV.length; i++) {
  const devId = FILE_TO_DEV[i];
  const arr = JSON.parse(fs.readFileSync(path.join(BASE, allFiles[i]), "utf8"));
  const jiraText = arr.length > 1 ? arr[1].text : arr[0].text;
  const issues = JSON.parse(jiraText).issues || [];
  for (const issue of issues) {
    if (!allIssuesMap.has(issue.key)) allIssuesMap.set(issue.key, issue);
    if (!issueToDevs.has(issue.key)) issueToDevs.set(issue.key, new Set());
    issueToDevs.get(issue.key).add(devId);
  }
}

console.log(`Loaded ${allIssuesMap.size} unique issues`);

// ── Determine correct developer owner ─────────────────────────────────
// Priority: (1) current assignee if they're one of our 10 devs,
//           (2) dev from "was assignee" query who has the most recent assignment in changelog,
//           (3) first dev appearing in the was-assignee query results.
function determineOwner(issue) {
  const flds = issue.fields;
  const currentId = (flds.assignee || {}).accountId || "";
  if (DEV_IDS.has(currentId)) return currentId;

  // Fall back to "was assignee" results
  const candidates = [...(issueToDevs.get(issue.key) || new Set())].filter(
    (id) => DEV_IDS.has(id),
  );
  if (candidates.length > 0) return candidates[0];
  return null;
}

// ── Process all issues ─────────────────────────────────────────────────
const falseFlagList = [];
const correctedDevData = {};
for (const devId of Object.keys(DEVELOPERS)) {
  correctedDevData[devId] = {
    name: DEVELOPERS[devId],
    email: DEVELOPER_EMAILS[devId],
    issues: [],
    total: 0,
  };
}

for (const [key, issue] of allIssuesMap) {
  const ownerDevId = determineOwner(issue);
  if (!ownerDevId) continue;

  const flds = issue.fields;
  const comments = (flds.comment || {}).comments || [];
  const status = (flds.status || {}).name || "Unknown";
  const created = flds.created;
  const updated = flds.updated;
  const resdate = flds.resolutiondate;

  const TESTING_STATUSES = new Set([
    "Ready for Testing",
    "Done",
    "Closed",
    "Resolved",
    "Verified",
    "Fixed",
    "In Testing",
    "Development Complete",
  ]);
  const timeToRft = TESTING_STATUSES.has(status)
    ? daysBetween(created, updated)
    : null;
  const timeToClose = resdate ? daysBetween(created, resdate) : null;

  let bounces = 0,
    lastRole = null;
  for (const c of comments) {
    const role = DEV_IDS.has((c.author || {}).accountId || "")
      ? "dev"
      : "tester";
    if (lastRole !== null && role !== lastRole) bounces++;
    lastRole = role;
  }

  // ── False flag detection ──
  const ff = detectFalseFlag(issue);
  if (ff.isFalseFlag) {
    const devsForIssue = [...(issueToDevs.get(key) || new Set())]
      .map((id) => DEVELOPERS[id])
      .filter(Boolean);
    falseFlagList.push({
      key,
      summary: flds.summary,
      defectType: classifyDefect(flds.summary),
      priority: (flds.priority || {}).name || "Unknown",
      status,
      category: ff.category,
      reason: ff.reason,
      assignedDeveloper: DEVELOPERS[ownerDevId],
      commentAuthor: ff.commentAuthor,
    });
  }

  correctedDevData[ownerDevId].issues.push({
    key,
    summary: flds.summary,
    defectType: classifyDefect(flds.summary),
    priority: (flds.priority || {}).name || "Unknown",
    status,
    created,
    updated,
    resolutiondate: resdate,
    assigneeId: ownerDevId,
    assigneeName: DEVELOPERS[ownerDevId],
    reporterName: (flds.reporter || {}).displayName || "Unknown",
    timeToRftDays: timeToRft ? +timeToRft.toFixed(1) : null,
    timeToCloseDays: timeToClose ? +timeToClose.toFixed(1) : null,
    bounces,
    commentCount: comments.length,
    isFalseFlag: ff.isFalseFlag,
    falseFlagCategory: ff.isFalseFlag ? ff.category : null,
    falseFlagReason: ff.isFalseFlag ? ff.reason : null,
  });
}

for (const d of Object.values(correctedDevData)) d.total = d.issues.length;

// ── Save outputs ──────────────────────────────────────────────────────
fs.writeFileSync(OUT_FF, JSON.stringify(falseFlagList, null, 2));
fs.writeFileSync(OUT_FIXED, JSON.stringify(correctedDevData, null, 2));

// ── Print report ──────────────────────────────────────────────────────
// Group false flags by category
const byCategory = {};
for (const ff of falseFlagList) {
  if (!byCategory[ff.category]) byCategory[ff.category] = [];
  byCategory[ff.category].push(ff);
}

console.log(`\n${"=".repeat(72)}`);
console.log(`FALSE FLAGS: ${falseFlagList.length} total`);
console.log("=".repeat(72));
for (const [cat, items] of Object.entries(byCategory)) {
  console.log(`\n  ── ${cat} (${items.length}) ──`);
  for (const ff of items) {
    console.log(
      `    ${ff.key} | ${ff.assignedDeveloper} | ${ff.priority} | ${ff.category}`,
    );
    console.log(`       ${ff.reason.substring(0, 110)}`);
  }
}

// Group false flags by developer
const ffByDev = {};
for (const ff of falseFlagList) {
  if (!ffByDev[ff.assignedDeveloper]) ffByDev[ff.assignedDeveloper] = [];
  ffByDev[ff.assignedDeveloper].push(ff.key);
}
console.log(`\n${"=".repeat(72)}`);
console.log("FALSE FLAGS PER DEVELOPER");
console.log("=".repeat(72));
for (const [dev, keys] of Object.entries(ffByDev).sort(
  (a, b) => b[1].length - a[1].length,
)) {
  console.log(`  ${dev.padEnd(22)}: ${keys.length} — ${keys.join(", ")}`);
}

console.log(`\n${"=".repeat(72)}`);
console.log("CORRECTED DEVELOPER COUNTS");
console.log("=".repeat(72));
let grandTotal = 0,
  grandFF = 0,
  grandReal = 0;
for (const [devId, d] of Object.entries(correctedDevData)) {
  const real = d.issues.filter((i) => !i.isFalseFlag);
  const ffs = d.issues.filter((i) => i.isFalseFlag);
  grandTotal += d.issues.length;
  grandFF += ffs.length;
  grandReal += real.length;
  const avgBounces = d.issues.length
    ? (d.issues.reduce((s, i) => s + i.bounces, 0) / d.issues.length).toFixed(1)
    : "—";
  const rft = real
    .filter((i) => i.timeToRftDays !== null)
    .map((i) => i.timeToRftDays);
  const close = real
    .filter((i) => i.timeToCloseDays !== null)
    .map((i) => i.timeToCloseDays);
  const avgRft = rft.length
    ? (rft.reduce((a, b) => a + b, 0) / rft.length).toFixed(1)
    : "N/A";
  const avgClose = close.length
    ? (close.reduce((a, b) => a + b, 0) / close.length).toFixed(1)
    : "N/A";
  console.log(
    `  ${d.name.padEnd(22)} total=${String(d.issues.length).padStart(3)} real=${String(real.length).padStart(3)} false=${String(ffs.length).padStart(2)} | avg_bounces=${avgBounces} | avg_rft=${avgRft}d | avg_close=${avgClose}d`,
  );
}
console.log(`  ${"─".repeat(70)}`);
console.log(
  `  TOTAL                   total=${grandTotal}  real=${grandReal}  false=${grandFF}`,
);
