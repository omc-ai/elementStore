---
title: "ASI Core Rules"
acl:
  read: [all]
  write: [owner]
  approve: [owner]
owner: "{owner_id}"
---

# Core Rules

1. **Never create before checking what exists** — query elementStore for existing classes, objects, procedures before creating anything new. This applies at EVERY step.
2. **Never forget rule 1.**
3. **After completing any action, verify your changes** — read back files, query the store, confirm state.
4. **No action without a procedure** — find an existing procedure or create one via `procedures/bootstrap.md` before executing.
5. **Every task touched in a loop must have a status update.**
6. **All tasks must close** — no open-ended work. Daily tasks open and close within the day.
7. **Log warnings/errors to elementStore** — use `@log` class (level, message, source, context).
8. **Findings go to elementStore** — use `es:finding` class, not local files.

# Session Tracking

At the start of every session:
1. Record the session in elementStore as `ai:agent_session` with:
   - `session_id`: the Claude Code session ID
   - `agent_id`: your agent ID (e.g., `assistant:owner`)
   - `cwd`: current working directory
   - `status`: `active`
   - `started`: current timestamp
2. Write the session_id to your agent workspace README for cross-reference.
3. On session end, update status to `completed`.

# Loop Flow (Per Iteration)

```
1. Read this file (RULES.md)
2. Read PROMPT.md
3. Load .env for external connections
4. Create a new round log file: {agent_id}/rounds/ROUND-{NNN}.md
   - Record: session_id, timestamp, round_number
5. Scan all projects + lobby — collect open tasks
6. Check open ai:question objects directed to you
7. For each task/question:
   a. Find the relevant procedure
   b. If no procedure exists → create one via bootstrap
   c. Execute following the procedure
   d. Update task status
   e. Log action to round file
8. Log any warnings/errors encountered → round file + @log in ES
9. Log any findings discovered → round file + es:finding in ES
10. Verify all changes (rule 3)
11. Close round file (summary, tasks_touched, all_tasks_complete)
```

# Source of Truth

| File Type | Authority | Sync Direction |
|-----------|-----------|----------------|
| RULES.md, PROMPT.md, bootstrap.md | MD is authoritative | Not synced to ES |
| Agent prompt.md, skills.md | MD is authoritative | Agent self-maintains |
| Task/question/decision MD files | ES is authoritative | ES → MD (regenerate on conflict) |
| procedures/*.md (agent-created) | MD + ES both | Register in ES as @procedure |

# Error Handling

| Scenario | Behavior |
|----------|----------|
| ES unreachable | Log locally, retry once, skip iteration if still down |
| Procedure not found | Do not proceed — create via bootstrap first |
| MD/ES conflict | ES wins for data objects — regenerate MD from ES |
| Task sync failure | Keep status in MD, retry next iteration, log @log warning |

# Permission Model

Every MD file has ACL in YAML frontmatter:

```yaml
acl:
  read: [all]          # who can read
  write: [owner, self] # who can modify
  approve: [owner]     # who can approve changes
  execute: [self]      # who can act on this
  create: [owner, self]# who can create sub-items
owner: "{owner_id}"    # overrides any ACL
```

Identifiers:
- `owner` — human owner (highest authority)
- `agent:{id}` — specific agent
- `all` — any agent with workspace access
- `self` — the agent whose directory this file lives in (only valid inside `{agent_id}/` dirs)

Resolution: `owner` > explicit ACL > inherited from parent README.md

# Task Model

Tasks use composite key: `{docType}/{docID}`

| docType | Prefix | Purpose |
|---------|--------|---------|
| investigation | INV | Research tasks |
| feature | FT | Feature implementation |
| bugfix | BUG | Bug fixes |
| proc-task | PROC | Procedure creation |
| question | Q | Question resolution (MD projection of ai:question) |
| idea | IDEA | Owner ideas (lobby) |
| daily | DAILY | Daily tasks (lobby, close same day) |

Auto-increment tracked per docType in each project's `tasks.md`.

# Multi-Agent Rules

- Agents can read other agents' `public/` directories if ACL permits
- Agent-to-agent delegation via `ai:task` with `agent_id`
- Questions to agents via `ai:question.to_agents`
- The assistant can create new `ai:agent` objects
- Hierarchy: `owner` > requesting agent > executing agent
- Other agents can request tasks — the requesting agent is recorded in the task
