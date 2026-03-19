---
name: es
description: "ElementStore — query classes, objects, agents, features. Understands ES schema, can work offline from genesis files. Examples: /es, /es ai:agent, /es classes, /es agent:owner"
argument-hint: "[class_id | object_id | classes | features | agents | health | props <class>]"
---

# /es — ElementStore Command

You are handling the `/es` command for elementStore — a self-describing object store where classes are objects and everything is queryable via the same API.

**Arguments received:** `$ARGUMENTS`

## ElementStore Core Concepts

ElementStore is built on a simple foundation: **everything is an object, classes are objects too**.

### The Meta-Schema

| System Class | Purpose |
|-------------|---------|
| `@class` | Defines a data class — has `id`, `name`, `extends_id`, `props[]`, `storage_id` |
| `@prop` | Defines a property — has `key`, `data_type`, `is_array`, `options`, `flags`, `editor` |
| `@prop_string`, `@prop_number`, `@prop_boolean`, `@prop_datetime`, `@prop_object`, `@prop_relation` | Type-specific prop classes (extend @prop) |
| `@prop_flags` | Inline flags: `required`, `readonly`, `hidden`, `create_only`, `server_only`, `master_only` |
| `@editor` | UI editor definitions (text, textarea, select, grid, etc.) |
| `@action` | Executable actions: api, cli, function, event, composite, ui |
| `@storage` | Storage providers: json, couchdb, mysql, rest, api, composite |
| `@obj_ref` | Dynamic typed value — `ref` points to a @prop that defines the value's type |

### Data Types
`string`, `boolean`, `integer`, `float`, `datetime`, `object`, `relation`, `function`

### Key Patterns
- **Inheritance**: `extends_id` — child class inherits all parent props, can override/add
- **Relations**: `data_type: "relation"` + `object_class_id[]` — points to other objects
- **Nested objects**: `data_type: "object"` + `object_class_id` — inline sub-objects
- **Arrays**: `is_array: true|"indexed"|"assoc"` — collections
- **Flags**: `flags: {required: true, readonly: true}` — only truthy flags stored
- **Class selector**: When `options.values` is an object (not array), keys are labels, values are class_ids — changing the field switches the object's class

### Key Domain Classes

| Class | Purpose |
|-------|---------|
| `ai:agent` | AI agents with prompt, tools, domain, behavior |
| `ai:task` | Work items: name, status (open/in_progress/done), priority, agent_id |
| `ai:tool` | Tool definitions with type and allowed_actions class bindings |
| `ai:message` | Messages in conversations |
| `ai:conversation` | Conversation threads |
| `ai:question` | Questions between agents |
| `ai:decision` | Recorded decisions |
| `@feature` | Feature definitions |
| `@app_feature` | Per-app feature implementation status |
| `@app` | Registered applications |
| `mcp:server` | MCP server configurations |

### Object ID Convention
`namespace:name` — e.g. `agent:owner`, `feat:mcp_server`, `tool-mcp-store`

### REST API Endpoints
```
GET    /class                    — List all classes
GET    /class/{id}/props         — Get class props (with inheritance)
GET    /query/{class}?field=val  — Query with filters (_sort, _order, _limit, _offset)
GET    /store/{class}/{id}       — Get object
POST   /store/{class}            — Create object
PUT    /store/{class}/{id}       — Update object
DELETE /store/{class}/{id}       — Delete object
GET    /find/{id}                — Find by ID across all classes
POST   /action/{id}/execute      — Execute action
GET    /health                   — Health check
```

## How to Execute

### Step 1: Try MCP tools first
Use the elementStore MCP tools (`mcp__elementStore__es_*`) if available.

### Step 2: Fallback to REST API
If MCP tools aren't available, use curl:
```bash
curl -sf "$ES_URL/query/ai:agent?_limit=50"
curl -sf "$ES_URL/class/ai:task/props"
```

### Step 3: Fallback to genesis files
If the server is unreachable, read the genesis files directly:
```
.es/system.genesis.json     — System class definitions (@class, @prop, etc.)
.es/ai.genesis.json         — AI classes (agent, task, tool, message, etc.)
.es/core.genesis.json       — Core domain classes
.es/mcp.genesis.json        — MCP server classes
.es/*.seed.json             — Seed data (editors, functions, storage)
.es/@*.json                 — Persisted object data per class
```

Read genesis JSON to answer schema questions. The format is:
```json
{
  "classes": [
    { "id": "ns:class", "props": [{ "key": "field", "data_type": "string", ... }] }
  ],
  "seed": [ { "id": "obj:id", "class_id": "ns:class", ... } ]
}
```

## Routing

Parse `$ARGUMENTS` and determine the action:

### No arguments → Overview
1. Check health (MCP tool or curl)
2. List class count and namespace summary
3. Show quick reference of /es sub-commands

### `classes` → List all classes grouped by namespace
### `features` → Feature matrix (@feature × @app_feature)
### `agents` → Table of all ai:agent objects
### `tools` → List ai:tool objects with their allowed_actions bindings
### `health` → Server health check
### `props <class_id>` → Show class property schema as a table

### Argument contains `:` or starts with `@` (no spaces) → Class or Object
- If it looks like a class ID (namespace:noun, e.g. `ai:agent`, `@feature`):
  Query objects of that class, show as compact table
- If it looks like an object ID (has a specific pattern, e.g. `agent:owner`, `feat:mcp_server`):
  Try es_find first. If not found, try as class query.

### Free text → Search
Search class names/descriptions for matches. Suggest `/es <class_id>`.

## Output Style

- Compact markdown tables, no JSON walls
- Group by namespace when listing
- Counts in headers
- End with a contextual hint for the next action
