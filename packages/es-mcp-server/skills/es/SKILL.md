---
name: es
description: "ElementStore — query classes, objects, agents, features. Uses server-side text tables. Examples: /es, /es ai:agent, /es classes, /es agent:owner"
argument-hint: "[class_id | object_id | classes | features | agents | health | props <class>]"
---

# /es — ElementStore Command

**Arguments:** `$ARGUMENTS`

## CRITICAL OUTPUT RULES

1. Run the curl/CLI command
2. Print the raw output DIRECTLY — no code blocks, no markdown formatting, no commentary
3. Do NOT add any text before or after the table unless there's an error
4. The server-rendered text table IS the final output — just show it as-is

## Execution

All queries use curl with text format headers. The server renders the table.

```
ES_URL="http://arc3d.master.local/elementStore"
```

## Routing

### No arguments → Overview
```bash
curl -sf "$ES_URL/health"
curl -sf "$ES_URL/query/ai:agent?_limit=20" -H "X-Response-Format: text" -H "X-Fields: id,title,is_active,model,run_count"
```

### `classes` → All classes
```bash
curl -sf "$ES_URL/class" -H "X-Response-Format: text" -H "X-Fields: id,name,description"
```

### `agents`
```bash
curl -sf "$ES_URL/query/ai:agent?_limit=50" -H "X-Response-Format: text" -H "X-Fields: id,title,is_active,model,domain,run_count"
```

### `features`
```bash
curl -sf "$ES_URL/query/@feature?_limit=200" -H "X-Response-Format: text" -H "X-Fields: id,name,category,scope"
```

### `tools`
```bash
curl -sf "$ES_URL/query/ai:tool?_limit=50" -H "X-Response-Format: text" -H "X-Fields: id,category,type,enabled"
```

### `health`
```bash
curl -sf "$ES_URL/health"
```

### `props <class_id>` — extract class_id after "props "
```bash
curl -sf "$ES_URL/class/<class_id>/props" -H "X-Response-Format: text" -H "X-Fields: key,data_type,is_array,description"
```

### Argument contains `:` or starts with `@` → class query or object lookup

Try as **class** first:
```bash
curl -sf "$ES_URL/query/<arg>?_limit=20" -H "X-Response-Format: text"
```

If empty or error, try as **object ID**:
```bash
curl -sf "$ES_URL/find/<arg>" -H "X-Response-Format: text"
```

### Free text → search classes
```bash
curl -sf "$ES_URL/class" -H "X-Response-Format: text" -H "X-Fields: id,name,description"
```
Then filter for matching term.
