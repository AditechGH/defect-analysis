"""
Extract sprint defect metrics from Jira JQL result files.
Maps developer account IDs to names, extracts issue data per developer.
"""
import json
import os
import re
from datetime import datetime, timezone

BASE = r"C:\Users\z00597ew\.claude\projects\C--optimus-prime-mission-defect-analysis\b593024f-81b5-4d1b-9525-4f972940486d\tool-results"

# Developer account ID -> name + email mapping
DEVELOPERS = {
    "712020:d9aa0306-1300-44fc-bd29-8abe306f07fe": {"name": "Abubakar Adamu",   "email": "abubakar.adamu.ext@brightlysoftware.com"},
    "712020:407d6248-323b-459e-a956-57d36e03a526": {"name": "Adinan Alhassan",   "email": "adinan.alhassan.ext@brightlysoftware.com"},
    "712020:f498aef4-0ecd-43b5-8627-6e8729712986": {"name": "Abenezer Bayu",     "email": "abenezer.bayu.ext@brightlysoftware.com"},
    "712020:4e753b4c-292f-43c1-aec8-346aa573fc63": {"name": "Emmy Bbaale",       "email": "emmy.bbaale.ext@siemens.com"},
    "712020:391f1fcb-67ae-4668-956c-0025cc785212": {"name": "Ojobe Ekpor",       "email": "ojobe.ekpor.ext@brightlysoftware.com"},
    "712020:9484d75f-f78a-4c62-86d5-e3202d55e129": {"name": "Kashish Goyal",     "email": "kashish.goyal.ext@siemens.com"},
    "712020:98376025-a295-45d3-8479-a6c4c617708b": {"name": "Michael Johnson",   "email": "michael.johnson.ext@brightlysoftware.com"},
    "712020:5a76440b-b20f-4c76-9fe0-e08db894a301": {"name": "Nilesh Pore",       "email": "nilesh.pore.ext@brightlysoftware.com"},
    "712020:9f4e93bd-1ced-489a-8034-3965e2ca3beb": {"name": "Touqeer Shakeel",   "email": "touqeer.shakeel.ext@brightlysoftware.com"},
    "712020:b8298392-2a8a-4bc9-ae32-87f56ff8eb8e": {"name": "Bhanu Teja",        "email": "bhanu.teja.ext@brightlysoftware.com"},
}

# Map file order to developer (same order as queries were fired)
FILE_TO_DEV = [
    "712020:d9aa0306-1300-44fc-bd29-8abe306f07fe",  # abubakar
    "712020:407d6248-323b-459e-a956-57d36e03a526",  # adinan
    "712020:f498aef4-0ecd-43b5-8627-6e8729712986",  # abenezer
    "712020:4e753b4c-292f-43c1-aec8-346aa573fc63",  # emmy
    "712020:391f1fcb-67ae-4668-956c-0025cc785212",  # ojobe
    "712020:9484d75f-f78a-4c62-86d5-e3202d55e129",  # kashish
    "712020:98376025-a295-45d3-8479-a6c4c617708b",  # michael
    "712020:5a76440b-b20f-4c76-9fe0-e08db894a301",  # nilesh
    "712020:9f4e93bd-1ced-489a-8034-3965e2ca3beb",  # touqeer
    "712020:b8298392-2a8a-4bc9-ae32-87f56ff8eb8e",  # bhanu
]

def parse_dt(s):
    if not s:
        return None
    s = re.sub(r'([+-]\d{2}):(\d{2})$', r'\1\2', s)
    for fmt in ('%Y-%m-%dT%H:%M:%S.%f%z', '%Y-%m-%dT%H:%M:%S%z'):
        try:
            return datetime.strptime(s, fmt)
        except:
            pass
    return None

def days_between(a, b):
    if a and b:
        delta = abs((b - a).total_seconds()) / 86400
        return round(delta, 1)
    return None

def classify_defect(summary):
    s = summary.lower()
    if any(x in s for x in ['api', 'server error', '500', 'graphql', 'endpoint']):
        return 'API / Backend'
    if any(x in s for x in ['security', 'permission', 'access', 'breach', 'privilege']):
        return 'Security'
    if any(x in s for x in ['ui', 'display', 'mismatch', 'label', 'button', 'scroll', 'pagination', 'layout', 'icon', 'dropdown', 'modal']):
        return 'UI / Frontend'
    if any(x in s for x in ['validation', 'mandatory', 'required', 'invalid', 'error message']):
        return 'Validation'
    if any(x in s for x in ['delete', 'unable to delete', 'not able to delete']):
        return 'Data / CRUD'
    if any(x in s for x in ['performance', 'slow', 'load']):
        return 'Performance'
    return 'Functional'

def extract_bounces_from_comments(comments, dev_ids):
    """Count dev→tester and tester→dev comment ping-pongs as proxy for bounces."""
    bounces = 0
    last_role = None
    for c in comments:
        author_id = c.get('author', {}).get('accountId', '')
        is_dev = author_id in dev_ids
        role = 'dev' if is_dev else 'tester'
        if last_role is not None and role != last_role:
            bounces += 1
        last_role = role
    return bounces

# Load all files sorted
files = sorted([f for f in os.listdir(BASE) if f.startswith('mcp-atlassian-searchJiraIssuesUsingJql-') and f.endswith('.txt')])
print(f"Found {len(files)} files")

dev_data = {}  # devId -> {issues: [...]}
for i, fname in enumerate(files):
    if i >= len(FILE_TO_DEV):
        break
    dev_id = FILE_TO_DEV[i]
    fpath = os.path.join(BASE, fname)
    with open(fpath, 'r', encoding='utf-8') as f:
        raw = f.read()
    arr = json.loads(raw)
    # The actual Jira data is in arr[1].text (arr[0] is the IMPORTANT notice)
    jira_json = arr[1]['text'] if len(arr) > 1 else arr[0]['text']
    obj = json.loads(jira_json)
    issues = obj.get('issues', [])
    dev_name = DEVELOPERS[dev_id]['name']
    print(f"\n{dev_name}: {len(issues)} issues")

    dev_issues = []
    all_dev_ids = set(DEVELOPERS.keys())

    for issue in issues:
        key = issue['key']
        flds = issue['fields']
        summary = flds.get('summary', '')
        created = parse_dt(flds.get('created'))
        updated = parse_dt(flds.get('updated'))
        resdate = parse_dt(flds.get('resolutiondate'))
        status = flds.get('status', {}).get('name', 'Unknown')
        priority = flds.get('priority', {}).get('name', 'Unknown')
        assignee_id = (flds.get('assignee') or {}).get('accountId', '')
        assignee_name = (flds.get('assignee') or {}).get('displayName', 'Unassigned')
        reporter_name = (flds.get('reporter') or {}).get('displayName', 'Unknown')

        comments = flds.get('comment', {}).get('comments', [])

        # Classify defect type
        defect_type = classify_defect(summary)

        # Time to first reassign: use updated as proxy when status changed (no full changelog here)
        # We'll estimate: if status is "Ready for Testing" or "Done", calc time
        is_in_testing_or_done = status in ('Ready for Testing', 'Done', 'Closed', 'Resolved', 'Verified', 'Fixed')
        time_to_rft = days_between(created, updated) if is_in_testing_or_done else None

        # Closure time
        time_to_close = days_between(created, resdate) if resdate else None

        # Bounces from comment patterns
        bounces = extract_bounces_from_comments(comments, all_dev_ids)

        dev_issues.append({
            'key': key,
            'summary': summary,
            'defect_type': defect_type,
            'priority': priority,
            'status': status,
            'created': created.isoformat() if created else None,
            'updated': updated.isoformat() if updated else None,
            'resolutiondate': resdate.isoformat() if resdate else None,
            'assignee_id': assignee_id,
            'assignee_name': assignee_name,
            'reporter_name': reporter_name,
            'time_to_rft_days': time_to_rft,
            'time_to_close_days': time_to_close,
            'bounces': bounces,
            'comment_count': len(comments),
        })
        print(f"  {key}: {status} | {priority} | bounces={bounces} | {defect_type}")

    dev_data[dev_id] = {
        'name': dev_name,
        'email': DEVELOPERS[dev_id]['email'],
        'issues': dev_issues,
        'total': len(dev_issues),
    }

# Save to JSON for dashboard generation
out_path = r"C:\optimus-prime\mission\defect-analysis\dev_metrics.json"
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(dev_data, f, indent=2, default=str)

print(f"\nSaved to {out_path}")

# Summary stats per developer
print("\n=== SUMMARY ===")
for dev_id, d in dev_data.items():
    issues = d['issues']
    total = len(issues)
    done = sum(1 for i in issues if i['status'] in ('Done', 'Closed', 'Resolved', 'Verified', 'Fixed'))
    bounces = [i['bounces'] for i in issues if i['bounces'] > 0]
    avg_bounces = round(sum(bounces)/len(bounces), 1) if bounces else 0
    rft_times = [i['time_to_rft_days'] for i in issues if i['time_to_rft_days'] is not None]
    avg_rft = round(sum(rft_times)/len(rft_times), 1) if rft_times else 'N/A'
    close_times = [i['time_to_close_days'] for i in issues if i['time_to_close_days'] is not None]
    avg_close = round(sum(close_times)/len(close_times), 1) if close_times else 'N/A'
    print(f"{d['name']:25s} | total={total:3d} | done={done:3d} | avg_bounces={avg_bounces} | avg_rft={avg_rft} days | avg_close={avg_close} days")
