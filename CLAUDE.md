# CLAUDE.md — elementStore

Instructions for Claude Code when working in this repository.

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
| `@app` | Registered applications (PHP backend, Admin UI, arch-fe, arch-be, ...) |

## Feature IDs — Naming Convention

```
feat:<group>_<name>        e.g. feat:filter_by, feat:client_atomobj
af:<app-short>:<feat-id>   e.g. af:es-admin:filter_by, af:arch-fe:filter_by
app:<slug>                 e.g. app:es-admin, app:es-php-backend, app:architect-frontend
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
