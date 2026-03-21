---
title: "Bootstrap — Creating New Procedures"
category: framework
acl:
  read: [all]
  write: [owner]
  approve: [owner]
  execute: [all]
owner: "{owner_id}"
---

# Bootstrap: How to Create New Procedures

This procedure defines how agents create new procedures within the ASI framework.
Only the owner can modify this bootstrap procedure.

## Pre-Conditions

Before creating a new procedure:

1. **Check existing procedures**: Search `procedures/` AND query ES `@procedure` class.
2. **Check if the action is covered** by an existing procedure that could be extended.
3. **If a procedure exists** → use it. Do not create a duplicate.

## Procedure Template

Every new procedure MUST follow this structure:

```yaml
---
title: "{Procedure Name}"
category: "{category}"   # framework | development | investigation | maintenance | security
acl:
  read: [all]
  write: [{creator_agent_id}]
  approve: [owner]
  execute: [{who can run this}]
owner: "{owner_id}"
requires_approval: {true|false}  # does owner need to approve before first execution?
---
```

```markdown
# {Procedure Name}

## Purpose
{One sentence: what this procedure accomplishes}

## Pre-Conditions
{What must be true before starting}

## Steps
1. {Step 1}
2. {Step 2}
...

## Post-Conditions
{What must be true after completion}

## Verification
{How to confirm the procedure succeeded — rule 3}

## Rollback
{How to undo if something goes wrong}
```

## Approval Rules

| Category | Requires Owner Approval |
|----------|------------------------|
| framework | YES — always |
| security | YES — always |
| development | NO — agent can create and follow |
| investigation | NO — agent can create and follow |
| maintenance | NO — agent can create and follow |

## Creation Steps

1. Write the procedure file to `procedures/{name}.md` following the template above.
2. Register in elementStore:
   ```
   POST $ES_URL/store/@procedure
   {
     "id": "{name}",
     "name": "{Procedure Name}",
     "description": "{purpose}",
     "category": "{category}",
     "path": "procedures/{name}.md",
     "status": "active",
     "tags": ["{relevant}", "{tags}"]
   }
   ```
3. Update `procedures/README.md` — add entry to the index table.
4. If `requires_approval: true` → create `ai:question` to owner asking for approval before first use.
5. Log the creation in the current round file.

## Naming Convention

- Lowercase, kebab-case: `investigate-api-latency.md`
- Descriptive: name should tell you what it does without reading it
- No generic names like `procedure-1.md`
