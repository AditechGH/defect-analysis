/**
 * Apply specific manual corrections to dev_metrics_corrected.json:
 * - CNF-54244: was under Adinan (appeared in his "was" query) → should be Emmy Bbaale
 *   Evidence: Changelog shows Emmy Bbaale did all development (moved to In Dev, Code Review,
 *   supplied fix builds). Adinan only did a PR review comment on 2026-04-22.
 */
const fs = require("fs");
const path = require("path");
const DATA = path.join(__dirname, "dev_metrics_corrected.json");

const data = JSON.parse(fs.readFileSync(DATA, "utf8"));

const ADINAN = "712020:407d6248-323b-459e-a956-57d36e03a526";
const EMMY = "712020:4e753b4c-292f-43c1-aec8-346aa573fc63";

// Move CNF-54244 from Adinan → Emmy
const key = "CNF-54244";

const adinanIssues = data[ADINAN].issues;
const issueIdx = adinanIssues.findIndex((i) => i.key === key);

if (issueIdx !== -1) {
  const issue = adinanIssues.splice(issueIdx, 1)[0];
  // Update assignee fields
  issue.assigneeId = EMMY;
  issue.assigneeName = "Emmy Bbaale";
  // Add to Emmy's list (avoid duplicates)
  if (!data[EMMY].issues.find((i) => i.key === key)) {
    data[EMMY].issues.push(issue);
  }
  data[ADINAN].total = data[ADINAN].issues.length;
  data[EMMY].total = data[EMMY].issues.length;
  console.log(`Moved ${key} from Adinan → Emmy`);
  console.log(`Adinan now: ${data[ADINAN].total} issues`);
  console.log(`Emmy now:   ${data[EMMY].total} issues`);
} else {
  console.log(`${key} not found under Adinan — checking Emmy's list...`);
  const inEmmy = data[EMMY].issues.find((i) => i.key === key);
  if (inEmmy) console.log(`Already under Emmy`);
}

fs.writeFileSync(DATA, JSON.stringify(data, null, 2));
console.log("Saved corrected metrics.");
