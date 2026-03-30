# CLAUDE.md — elementStore

Instructions for Claude Code when working in this repository.

## Rule: Reuse UI Components — No Ad-Hoc Widgets

**When building admin pages or UI elements, ALWAYS use existing shared components.**

- Dialogs → use the existing DraggableDialog/modal system with drag, resize, dock support
- Editors → use the generic editor (renderEditor) that reads class props
- Grids → use ag-grid with buildGridColumns from class meta
- Forms → use the prop-driven form rendering, not hand-built HTML inputs
- Buttons/actions → follow existing patterns from the toolbar/panel system

**NEVER create one-off HTML widgets, inline styles, or ad-hoc dialogs without asking first.** If a reusable component doesn't exist for the need, STOP and ask the owner:
- Which existing UI element to use
- Whether to create a new shared widget
- Or if ad-hoc is acceptable for this case

**Always check for existing components first.** If you cannot find what you need, ask the owner how to proceed.

## Rule: Declare Before You Code

**Before writing any code, check if the data structure, action, or function can be declared as elementStore classes and objects.**

- Need a data structure? → Define a `@class` with `@prop` definitions
- Need an operation? → Define an `@action` (type: api, cli, function, event, composite, ui)
- Need a validator/transformer? → Already within `@prop` options (validation rules, format, constraints)
- Need a provider/integration? → Define a `@provider` with action bindings

Only write code when the elementStore schema cannot express what you need (e.g., storage provider internals, protocol handling, rendering logic). The goal: **the store describes WHAT exists; code implements HOW it runs.**

## Rule: NEVER Write to CouchDB Directly

**All data mutations MUST go through the ElementStore API.** Direct CouchDB access (curl to port 5984, bulk_docs, _all_docs with writes) is STRICTLY FORBIDDEN for any write, update, or delete operation.

- **Allowed**: Read CouchDB directly for debugging (inspecting docs, checking _rev, verifying data)
- **Forbidden**: Writing, updating, or deleting docs via CouchDB API
- **Reason**: Direct writes bypass validation, scope enforcement, @state protection, key uniqueness, setters, @changes tracking, WebSocket broadcast, and genesis sync. Data written directly will be inconsistent.

If the ES API cannot perform an operation, that's a bug in the API — fix the API, don't bypass it.

## Rule: Object Operations Through the Store

**For creating, updating, reading, and querying objects and classes — ALWAYS use the live ElementStore server via `es-cli.sh` or the REST API.** This validates the full server pipeline on every operation. A failure is a signal that the pipeline is broken — fix the root cause, don't bypass it.

```bash
# Object operations — ALWAYS through the store
bash util/es-cli.sh list --class @feature --url $ES_URL
bash util/es-cli.sh get --id feat:my_feature --url $ES_URL
bash util/es-cli.sh set --data '{"id":"my:obj","class_id":"my:class","field":"value"}' --url $ES_URL
curl -sf "$ES_URL/query/@app_feature?_limit=200"
```

Reading and updating `.es/*.json` files directly is allowed for file-level operations (inspecting structure, fixing malformed JSON, scripting across files). But **object-level mutations** (changing field values, creating/deleting objects) must go through the store.

### es-cli.sh set syntax
The `set` command auto-detects payload format. For single objects, `class_id` **must be inside the JSON payload** (not via `--class`):
```bash
# Correct — class_id in payload
bash util/es-cli.sh set --data '{"id":"my:obj","class_id":"my:class","field":"value"}' --url $ES_URL

# Wrong — --class is not injected into inline --data
bash util/es-cli.sh set --class my:class --data '{"id":"my:obj","field":"value"}' --url $ES_URL
```

## Local Server

```
ES_URL=http://arc3d.master.local/elementStore
```

Always run `bash util/es-cli.sh health --url $ES_URL` first to confirm the server is up.

## Feature Registry — Quick Reference

Use `es-features.sh` to inspect the feature registry from the command line:

```bash
# Full catalog with descriptions and notes
bash util/es-features.sh

# Compact status matrix (feature × client)
bash util/es-features.sh matrix

# Summary stats per client
bash util/es-features.sh stats

# Gaps for a specific client
bash util/es-features.sh gaps app:es-admin

# Deep-dive on a single feature
bash util/es-features.sh detail feat:object_crud

# Filter by category
bash util/es-features.sh matrix --category core

# JSON output for scripting
bash util/es-features.sh stats --json

# Fetch from live API instead of local files
bash util/es-features.sh matrix --url $ES_URL
```

**Always use `es-features.sh` before planning or implementing features** — it shows current progress, gaps, and implementation notes across all clients.

## Syncing the Feature Registry

When a feature is implemented or its status changes:

1. **Update the live server** via `es-cli.sh set` (updates `@feature` / `@app_feature` objects)
2. **Sync `docs/CLIENT_FEATURE_REGISTRY.md`** from the live data — query via es-cli, then update the markdown

The JSON files in `.es/` will auto-update when the server persists the changes. Do not edit them manually.

## Core System Classes

| Class | Purpose |
|-------|---------|
| `@class` | Class definitions — the meta-schema. Has `extends_id` for inheritance. |
| `@prop` | Base property definition — inherited by `@prop_string`, `@prop_number`, `@prop_object`, `@prop_relation`, etc. |
| `@prop_*` | Child prop classes per data_type — each adds type-specific fields (options, object_class_id, etc.) via `extends_id: "@prop"` |
| `@prop_flags` | Inline boolean flags object: required, readonly, hidden, create_only, server_only, master_only |
| `@obj_ref` | Dynamic typed value — `ref` points to a @prop that defines the value's type/editor/validation. `ref="self"` = use the parent object's own @prop definition. Core pattern for context-dependent typing. |
| `@editor` | UI editor definitions (text, textarea, select, grid, etc.) |
| `@action` | Executable actions with typed dispatch (api, cli, function, event, composite, ui) |
| `@options_*` | Type-specific option classes: `@options_string`, `@options_number`, `@options_datetime`, `@options_object`, `@options_relation` |

## Core Patterns

### Class Selector via `options.values` (assoc map)
When a prop's `options.values` is an **object** (not array), it's a class selector. Keys are display values, values are class_ids. Changing the field value switches the object's `class_id` and re-renders with the new class's props.
```json
{"key": "data_type", "options": {"values": {"string": "@prop_string", "integer": "@prop_number"}}}
```
Array format = plain select. Object format = class selector. The editor detects the format and acts accordingly.

### Dynamic Typed Values via `@obj_ref`
When a field needs its type determined by context (not fixed), use `@obj_ref`:
```json
{"key": "default_value", "data_type": "object", "object_class_id": ["@obj_ref"], "options": {"ref": "self"}}
```
The editor resolves `ref`, reads the referenced @prop's data_type/options, and renders the value field accordingly. `ref="self"` means "use the @prop I belong to."

### Property Inheritance via `extends_id`
Child classes inherit all parent props and can override/add. `getClassProps()` walks the `extends_id` chain. System classes (`@` prefix) can inherit — only `@class` itself is excluded (root meta-class).

### Flags as Inline Object
Property behavior flags are stored as `flags: {required: true, readonly: true}` — an inline `@prop_flags` object. Only truthy flags are present. Access via `prop.flags?.required`.

## Key Data Classes

| Class | Purpose |
|-------|---------|
| `@feature` | Feature definitions (canonical list of ES capabilities) |
| `@app_feature` | Per-app implementation status (`progress`: implemented / partial / not_started) |
| `@app` | Registered applications (es-php-backend, es-admin, es-client-npm, ...) |
| `@provider` | External API provider base class (base_url, auth, mapping, write_mode) |
| `@cloudflare` | Cloudflare DNS/zone provider (extends @provider) — genesis: `.es/cloudflare.genesis.json` |
| `ai:agent` | AI team agent definition (name, prompt, tools, avatar) |
| `ai:task` | Work unit (status: open→assigned→in_progress→review→verified→done) |
| `ai:message` | Universal message (user_id, agent_id, to_agents[], content, status) |
| `es:finding` | Bug/issue report (name, description, severity, category, status) |

### Genesis Files (`.es/`)

| File | Domain |
|------|--------|
| `system.genesis.json` | Meta-schema: @class, @prop, @prop_*, @editor, @action, @event, @provider, @storage, @options_* |
| `ai.genesis.json` | AI team classes: ai:agent, ai:task, ai:message, ai:conversation |
| `apps.genesis.json` | App registry: @app, @app_feature, @feature |
| `cloudflare.genesis.json` | Cloudflare provider: @cloudflare, cloudflare:dns_record, cloudflare:zone |
| `cwm.genesis.json` | CloudWM/Kamatera provider — **duplicate of cloudwm.genesis.json** (open finding 8c79) |
| `cloudwm.genesis.json` | CloudWM/Kamatera provider — **duplicate of cwm.genesis.json** (open finding 8c79) |
| `core.genesis.json` | Visual building blocks: core:atomObj, core:baseElement, core:baseContainer |
| `es-core.genesis.json` | ES self-management: es:finding, es:plan |
| `infra.genesis.json` | Infrastructure: infra:vm, infra:network |
| `ui.genesis.json` | UI elements: ui:dialog, ui:canvas, ui:button |
| `auth.genesis.json` | Auth configuration classes |
| `events.genesis.json` | Event definitions |
| `signing.genesis.json` | Action signing and audit trail |
| `mcp.genesis.json` | MCP server classes |
| `accounting.genesis.json` | Accounting domain classes |
| `saas.genesis.json` | SaaS pricing tiers: saas:pricing_tier (Free, Pro, Enterprise) — arc3d.ai SaaS platform |

## Feature IDs — Naming Convention

```
feat:<group>_<name>        e.g. feat:filter_by, feat:client_atomobj
af:<app-short>:<feat-id>   e.g. af:es-admin:filter_by, af:es-client:filter_by
app:<slug>                 e.g. app:es-admin, app:es-php-backend, app:es-client-npm
```

## Rule: Feature-Driven Development

**Every feature MUST be tracked through `@feature` and `@app_feature` objects.**

Before implementing any feature:
1. Check if an `@feature` object exists for it. If not, create one.
2. Check if an `@app_feature` object exists for the target app. If not, create one with `progress: "in_progress"`.
3. Implement the feature.
4. Update the `@app_feature` object: set `progress` to `"implemented"` (or `"partial"`), update `implemented_in` with file paths, add `notes` if needed.

```bash
# Check existing feature
bash util/es-cli.sh get feat:my_feature --url $ES_URL

# Create feature
bash util/es-cli.sh set @feature '{"id":"feat:my_feature","name":"My Feature","category":"core","scope":"client"}' --url $ES_URL

# Start work — set progress to in_progress
bash util/es-cli.sh set @app_feature '{"id":"af:es-admin:my_feature","application_id":"app:es-admin","feature_id":"feat:my_feature","progress":"in_progress"}' --url $ES_URL

# Complete — set progress to implemented
bash util/es-cli.sh set @app_feature '{"id":"af:es-admin:my_feature","progress":"implemented","implemented_in":["admin/js/editor/fields.js:120-180"]}' --url $ES_URL
```

The `@app_feature.progress` field tracks lifecycle: `not_started` → `planned` → `in_progress` → `partial` → `implemented` → `tested`.

## Client Package (@es-client)

The reference client is the `@es-client` TypeScript package (`packages/es-client/`).

| Path | Description |
|------|-------------|
| `packages/es-client/src/` | TypeScript source |
| `admin/dist/element-store.js` | IIFE build (used by Admin UI) |
| `admin/dist/element-store-widgets.js` | Widget bundle |
| `@agura/es-client` | NPM package (ESM, for external consumers) |

The MCP server package (`packages/es-mcp-server/`) exposes elementStore as Claude Code tools. It auto-discovers classes and creates tools for CRUD operations. Install via `install.sh`.

The Admin UI (`admin/js/app.js`) imports from `admin/dist/element-store.js`. The compiled IIFE exposes `ElementStore`, `AtomStorage`, `AtomObj`, `AtomElement`, `AtomCollection` globally. Do NOT edit `admin/dist/*.js` files directly — build from TypeScript source.

## AI Agent Team

The elementStore hosts an active AI agent team. Agents use the store for all state — tasks, messages, findings.

### Key locations
- **Dashboard**: `apps/aic/aic2.html` — current AI Company dashboard (v2, WhatsApp-style per-agent channels, vanilla JS + WS)
- **Dashboard v1**: `apps/aic/index.html` — older dashboard version
- **Orchestrator**: `apps/aic/aic-daemon.sh` — spawns executor per agent
- **Executor**: `apps/aic/agent-run.sh` — runs Claude with agent prompt + task context
- **Prompts**: `apps/aic/prompts/` — per-agent system prompts (shared.md + role-specific)
- **Prompt improvements**: `apps/aic/apply-prompt-improvement.sh` — applies PROMPT_IMPROVE signals
- **Action executor**: `apps/aic/es-action-tool.sh` — agents call this to execute @action objects (`bash es-action-tool.sh <action_id> [json_params]`)
- **PM2 config**: `apps/aic/ecosystem.config.js` — process manager config for aic services

### Agent classes
| Class | Purpose |
|-------|---------|
| `ai:agent` | Agent definition (name, prompt, tools, avatar) |
| `ai:task` | Work units (status: open→assigned→in_progress→review→verified→done) |
| `ai:message` | Universal message unit (user_id, agent_id, to_agents[], results[], content, chunks[], status, references[]) |
| `ai:conversation` | Thread container (user_id, agent_id, project_ids[], task_id, title, status) |

### Agent Output Signals
Agents communicate outcomes via output signals parsed by the orchestrator (`agent-run.sh`):
- `TASK_COMPLETE: task:id` — marks task for review
- `VERIFIED: task:id` — reviewer approves
- `REJECTED: task:id` — reviewer rejects (retry)
- `CREATE_TASK: name | agent:id | P1` — creates new task
- `FINDING: description` — reports a bug or issue
- `PROMPT_IMPROVE: rationale | text` — proposes prompt improvement

### Rules for agent-authored changes
- Agents use output signals (above) for task lifecycle changes
- Agents write directly to elementStore via REST API (`curl POST/PUT $ES_URL/store/...`) for findings, messages, custom state
- Agents do NOT push to git — owner reviews and pushes
- Agents do NOT modify files outside the project directory
- Agents do NOT modify `env_override.php` or core PHP files

## Rule: No External Docs When Objects Can Describe It

**Do not create standalone documentation files for things that can be described as elementStore objects.**

ElementStore is self-describing. If information can be modeled as classes and objects, store it there — not in markdown files. Examples:
- Feature specs → `@feature` objects (not a features.md)
- App integration status → `@app_feature` objects (not a status.md)
- Editor definitions → `@editor` objects (not an editors.md)
- Action definitions → `@action` objects (not an actions.md)

Markdown docs (`docs/*.md`) are for:
- Architecture decisions and design rationale
- Procedures and how-to guides
- External integration guides (Docker, CI/CD)
- README overview and philosophy

If you find yourself writing a list of structured data in markdown, ask: **"Should this be a class?"**
