---
title: "Round Execution Logs"
acl:
  read: [owner, self]
  write: [self]
owner: "{owner_id}"
---

# Rounds

One file per loop iteration. Each round logs:
- Session ID
- Round number
- All actions taken
- Tasks touched and their status changes
- Questions answered
- Warnings/errors encountered
- Findings created
- Summary and completion status

Files named: `ROUND-{NNN}.md` (zero-padded, e.g., `ROUND-001.md`)
