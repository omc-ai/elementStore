---
title: "Agent: {agent_id}"
agent_id: "{agent_id}"
es_class: "ai:agent"
es_id: "{agent_id}"
acl:
  read: [all]
  write: [self, owner]
  approve: [owner]
owner: "{owner_id}"
---

# {agent_id} — {Agent Name}

{Agent description and role.}

## Identity

- **ES Object**: `ai:agent` → `{agent_id}`
- **Model**: sonnet
- **Session Mode**: persistent
- **Can Create Agents**: yes

## Workspace Structure

| Directory | Purpose |
|-----------|---------|
| `prompt.md` | Self-maintained agent prompt |
| `skills.md` | Agent capabilities |
| `rounds/` | Round execution logs (one file per loop iteration) |
| `lobby/` | Private workspace — ideas, daily tasks, triage |
| `public/` | Data visible to all agents |
| `{project_id}/` | Project-specific workspace (same structure as lobby) |

## Active Session

Session ID is recorded in the latest round file under `rounds/`.
