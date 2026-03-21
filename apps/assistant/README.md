---
title: "ASI — Multi-Agent Assistant Framework"
acl:
  read: [all]
  write: [owner]
  approve: [owner]
owner: "{owner_id}"
---

# ASI

Multi-agent assistant framework. Local MD files as human-readable interface, elementStore as data backbone.

## Structure

| Directory | Purpose |
|-----------|---------|
| `RULES.md` | Core loop rules — owner-only, read every iteration |
| `PROMPT.md` | Main agent prompt — owner-only, the recursive loop entry point |
| `.env` | External connection settings (ES_URL, etc.) |
| `procedures/` | Operational procedures — bootstrap defines how to create new ones |
| `{agent_id}/` | Agent workspace — prompt, skills, lobby, projects |
| `agent_template/` | Template for new agent workspaces |

## Participants

- **owner** — human owner, highest authority
- **assistant:owner** — primary assistant agent, runs the loop
- Additional agents can be created by the assistant

## Data Flow

```
asi/ (MD files) <--sync--> elementStore (data backbone)
     ^                          ^
     |                          |
  owner reads/writes      agent reads/writes
```

## Key Concepts

- Every file has ACL frontmatter
- Every action requires a procedure
- Every task must close
- elementStore is the source of truth for data objects
- MD files owned by owner (RULES, PROMPT) are authoritative as-is

## Setup

1. Copy this directory to your workspace (e.g., `asi/`)
2. Create `.env` with `ES_URL=http://your-elementstore-url`
3. Register the primary agent in elementStore as `ai:assistant`
4. Copy `agent_template/` to `{agent_id}/` for each new agent
5. Run `run.sh` to start the loop
