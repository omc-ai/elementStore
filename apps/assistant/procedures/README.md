---
title: "Procedures Index"
acl:
  read: [all]
  write: [owner]
  approve: [owner]
owner: "{owner_id}"
---

# Procedures

Operational procedures for the ASI framework. Every agent action requires a procedure.

## Index

| Procedure | Category | Description |
|-----------|----------|-------------|
| [bootstrap.md](bootstrap.md) | framework | How to create new procedures |
| [cross-agent-communication.md](cross-agent-communication.md) | development | Tasks, questions, messages, and stop signals between agents |

## Rules

- Agents MUST find or create a procedure before any action.
- New procedures are created following `bootstrap.md`.
- All procedures are registered in elementStore as `@procedure`.
- Each procedure has its own ACL frontmatter.
