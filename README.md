# ElementStore

> **Registry**: This project is registered in the [platform_root elementStore registry](../platform_root/README.md).
> **Registry ID**: `elementStore` (class: `@project`)
> **Registry data**: [`platform_root/db/elementStore/@project.json`](../platform_root/db/elementStore/@project.json)
> **Quick reference**: [`platform_root/docs/ELEMENTSTORE_REGISTRY_GUIDE.md`](../platform_root/docs/ELEMENTSTORE_REGISTRY_GUIDE.md)

**Repository**: https://github.com/omc-ai/elementStore

A schema-driven object store where **classes are objects too**. Define your data model at runtime through the same API you use to store data — no migrations, no code generation.

## Philosophy: Everything Is an Object

ElementStore is built on one principle: **the schema is data**.

Classes, properties, actions, events, editors, functions, storage configs, providers — they are all regular objects stored and managed through the same API. There is no separate "admin layer" or "migration tool". You define a `user` class by creating an object of class `@class`. You add a `name` property by creating an object of class `@prop`. You wire up an external API by creating `@action` and `@provider` objects.

This means:
- **Runtime schema evolution** — add/rename/remove classes and properties at any time, through the API
- **Self-describing** — query the schema the same way you query data
- **Composable** — actions, events, validators, and UI editors are objects that reference each other
- **Portable** — export your entire data model + data as JSON, seed it anywhere

## Data Flow

Every operation in ElementStore follows a single pipeline:

```
Input → Mapping → Execution → Mapping → Output
```

Whether it's an API call, a CLI command, an event handler, or a composite action — the shape is the same. Data enters, gets mapped to internal form, something executes, the result gets mapped back, and data leaves. Actions, endpoints, methods, services, providers, and storage all implement this same interface.

## Canonical Objects

An object can live in multiple stores (JSON file, CouchDB, MySQL, external API, browser memory). But it should have **one canonical identity** — a single `id` that is the source of truth. Other storage locations are links, caches, or projections of that canonical object.

This applies to everything, because everything is an object:
- **Classes** are objects (`@class`) — they exist in every store that loads them
- **Properties** are objects (`@prop`) — they travel with their class
- **Actions, editors, providers** — all objects, all portable across stores

When an object exists in multiple stores, the canonical store owns the authoritative version. Other stores hold references or synchronized copies.

## Editors: Objects Interact Through Properties

Every property has an **editor** — an `@editor` object that defines how the property presents itself on any user interface. This is not a UI concern bolted on after the fact; it is part of the property's identity.

When an object appears on screen, each property knows how to render itself: as a text field, a dropdown, a date picker, a code editor, a relation selector, a grid. The editor is the default interaction surface. Custom UIs can override, but every object is immediately usable through its property editors alone.

## Documentation Index

Detailed documentation lives in [`docs/`](docs/). The README covers philosophy and quick-start; the docs cover depth.

| Document | Description |
|----------|-------------|
| [Architecture](docs/ARCHITECTURE.md) | System architecture, layers, and component interaction |
| [Client Feature Registry](docs/CLIENT_FEATURE_REGISTRY.md) | Feature implementation status across all clients |
| [Element-Provider Binding](docs/ELEMENT_PROVIDER_BINDING.md) | How objects bind to external providers and APIs |
| [ES Directory Convention](docs/ES_DIRECTORY_CONVENTION.md) | `.es/` directory structure, file naming, namespacing |
| [Migration Procedure](docs/MIGRATION_PROCEDURE.md) | Procedures for schema and data migration |

## Integration Rules: Creating Classes and Properties

When integrating with ElementStore — whether building a new domain, adding a feature, or connecting an external system — follow this procedure:

1. **Define the class** — Create a `@class` object with `id`, `name`, `description`, and optionally `extends_id` for inheritance and `storage_id` for persistence
2. **Define properties** — Create `@prop` objects for each field. Each prop specifies `key`, `data_type`, validation (`required`, `validators[]`), UI behavior (`editor`, `display_order`, `group_name`), and security (`server_only`, `readonly`, `create_only`)
3. **Assign editors** — Every property should reference an `@editor`. Use built-in editors (text, textarea, select, date, code, relation, grid) or define custom ones
4. **Define actions** — If the class has operations, create `@action` objects and bind them as `data_type: function` props on the class
5. **Wire providers** — For external data sources, create `@provider` or `crud_provider` objects with field mappings
6. **Seed data** — Write a `.genesis.json` (nested, with inline props) or `.seed.json` (flat array) and load via `POST /genesis`
7. **Register as feature** — Track the work as `@feature` and `@app_feature` objects

**Rule**: If it can be declared as an object, declare it. Only write code when the schema cannot express what you need.

**Rule**: When a class requires functionality that doesn't exist yet, always search for a way to integrate it as a **generic mechanism** within the elementStore object model — not as a one-off solution. If the capability is missing and you don't have access to the elementStore core code to implement it generically, **notify the owner** to create the generic mechanism. The goal: every new capability becomes reusable infrastructure, not isolated custom code.

## Core Concepts

### System Classes (Meta-Objects)

Two system classes define the entire schema:

**`@class`** — defines a data class with its properties and behaviors:

```
name, description, extends_id, props[], storage_id, is_system, is_abstract, providers[], genesis_file
```

**`@prop`** — defines a property within a class:

```
key, data_type, is_array, label, description, required, readonly, create_only, default_value,
object_class_id[], object_class_strict, on_orphan,
editor, field_type, display_order, group_name, hidden,
validators[], options,
server_only, master_only
```

These two classes bootstrap everything else. All other system classes (`@action`, `@event`, `@storage`, `@editor`, `@function`, `@provider`, `crud_provider`, `@seed`, `auth_config`, `auth_app`, `auth_machine`) are themselves defined as `@class` objects with `@prop` properties.

See the full system schema: [`genesis/data/system.genesis.json`](genesis/data/system.genesis.json)

### Data Types

`string` · `boolean` · `integer` · `float` · `datetime` · `object` · `relation` · `function`

### Property Features

- **Inheritance** — classes inherit props from parent via `extends_id`
- **Relations** — `data_type: relation` links objects across classes (one-to-one, one-to-many)
- **Nested objects** — `data_type: object` with optional `object_class_id`
- **Actions as props** — `data_type: function` + `object_class_id: ["@action"]` binds executable actions to a class
- **Validation** — `required`, `validators[]` (email, regex, range, unique, custom via `@function`)
- **UI hints** — `editor` (relation to `@editor`), `options`, `display_order`, `group_name`, `hidden`
- **Security** — `server_only` (stripped from API responses), `master_only` (admin-only), `readonly`, `create_only`
- **Defaults** — `default_value` applied on object creation
- **Orphan handling** — `on_orphan: keep|delete|nullify` when referenced object is deleted

### Actions & Events

**`@action`** — universal execution unit. The `type` field determines HOW it runs:

| Type | Runs on | Description |
|------|---------|-------------|
| `api` | Client + Server | HTTP call via `@provider` (method, endpoint, headers, request/response mapping) |
| `cli` | Server | Shell command with `{field}` placeholders |
| `function` | Client + Server | Named function in FunctionRegistry |
| `event` | Client + Server | EventBus dispatch with payload mapping |
| `composite` | Client + Server | Chain of sub-actions (sequential or parallel) |
| `ui` | Client | JavaScript handler `(scope) => result` |

Actions map data between objects and external systems using `request_mapping` and `response_mapping`. They can be bound to a class as properties (see [demo-actions.genesis.json](genesis/data/demo-actions.genesis.json) for a working example).

**`@event`** — reactive trigger with lifecycle hooks: `before_create`, `after_create`, `before_update`, `after_update`, `before_delete`, `after_delete`, `on_change`, `custom`.

### Providers

**`@provider`** — abstract base for external API integration (base_url, auth, field mapping, actions[]).

**`crud_provider`** — extends `@provider` with standard REST CRUD patterns (get_one, get_list, create_one, update_one, delete_one, pagination, filters).

See examples: [`genesis/data/accounting.genesis.json`](genesis/data/accounting.genesis.json) (full accounting domain with providers), [`genesis/data/es-database.genesis.json`](genesis/data/es-database.genesis.json) (CouchDB stats via @action)

### Storage

**`@storage`** — defines where and how class data is persisted:

| Type | Side | Description |
|------|------|-------------|
| `local` | Client | Browser memory only (no persistence) |
| `rest` | Client | ElementStore REST API |
| `api` | Client + Server | External API via `@provider` |
| `seed` | Client + Server | Read-only seed data |
| `composite` | Client + Server | Multi-source with read/write strategy (fallback/merge, sequential/parallel/best_effort) |
| `json` | Server | JSON file per class in `.es/` directory |
| `couchdb` | Server | CouchDB database per class |
| `mysql` | Server | MySQL table per class |

Each `@class` can set a `storage_id` pointing to a `@storage` object. When `save()` is called, storage is resolved by walking the class's `extends_id` chain. If no class in the chain has a `storage_id`, the store's default storage is used.

## Architecture

```
┌──────────────────────────────────────────────────────┐
│  REST API (index.php / Phalcon Micro)                │
│    ↓                                                 │
│  ClassModel (validation, change detection, schema)   │
│    ↓              ↓ broadcast                        │
│  IStorageProvider  BroadcastService → WS Server      │
│    ↓                                   ↓ push        │
│  JSON / MongoDB / CouchDB        Subscribed clients  │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│  TypeScript Client (@agura/es-client)                │
│    ElementStore ←→ AtomObj ←→ AtomProp               │
│    AtomStorage (REST + auth + JWT)                   │
│    ActionExecutor (api/function/event/composite/ui)  │
│    React hooks (useAtomObj, useWidgetBinding, ...)   │
│    WebSocket client (real-time sync)                 │
│    Admin UI (ag-grid, forms, visual editor)          │
└──────────────────────────────────────────────────────┘
```

## Quick Start

### Docker (Recommended)

```bash
cd docker
cp .env.example .env
docker-compose up -d
```

API available at `http://localhost:8080`.

### Agura Platform Integration

ElementStore runs as part of the `arc3d.dev.agura.tech` environment:

```bash
# Start on agura_default network (local)
docker compose -f docker-compose.agura.yml up -d

# Start on staging server (uses bind mount)
docker compose -f docker-compose.staging.yml up -d
```

| Environment | API | Admin UI | WebSocket |
|---|---|---|---|
| Standalone | `http://localhost:8080` | `http://localhost:8080/admin/` | `ws://localhost:19008` |
| Local (Agura) | `http://arc3d.master.local/elementStore` | `http://arc3d.master.local/elementStore/admin/` | `ws://arc3d.master.local/elementStore/ws` |
| Staging | `https://arc3d.dev.agura.tech/elementStore` | `https://arc3d.dev.agura.tech/elementStore/admin/` | `wss://arc3d.dev.agura.tech/elementStore/ws` |

The admin UI auto-detects its `API_BASE` from the URL path, so it works at any mount point.

### API Examples

```bash
# Health check
curl http://localhost:8080/health

# Create a class
curl -X POST http://localhost:8080/class \
  -H "Content-Type: application/json" \
  -d '{"id": "user", "name": "User"}'

# Add properties (prop id = class_id.key)
curl -X POST http://localhost:8080/class \
  -H "Content-Type: application/json" \
  -d '{"id": "user.name", "class_id": "@prop", "key": "name", "data_type": "string", "required": true}'

curl -X POST http://localhost:8080/class \
  -H "Content-Type: application/json" \
  -d '{"id": "user.email", "class_id": "@prop", "key": "email", "data_type": "string"}'

# Create an object
curl -X POST http://localhost:8080/store/user \
  -H "Content-Type: application/json" \
  -d '{"name": "John Doe", "email": "john@example.com"}'

# List all users
curl http://localhost:8080/store/user

# Query with filters
curl "http://localhost:8080/query/user?name=John+Doe&_sort=created_at&_order=desc&_limit=10"

# Get a specific object
curl http://localhost:8080/store/user/1

# Update
curl -X PUT http://localhost:8080/store/user/1 \
  -H "Content-Type: application/json" \
  -d '{"name": "Jane Doe"}'

# Delete
curl -X DELETE http://localhost:8080/store/user/1
```

## TypeScript Client (`@agura/es-client`)

The client package provides the full ElementStore object model in TypeScript. It ships as:
- **ESM** — for npm/bundler consumers (`import { ElementStore } from '@agura/es-client'`)
- **IIFE** — for browser `<script>` tag (`admin/dist/element-store.js`, exposes `window.*` globals)
- **React hooks** — optional, for React apps (`import { useAtomObj } from '@agura/es-client/react'`)

### Installation

```bash
# npm (from GitLab registry)
npm install @agura/es-client

# Or use the browser bundle directly
<script src="admin/dist/element-store.js"></script>
```

### ESM Usage

```typescript
import { ElementStore, AtomObj, AtomStorage } from '@agura/es-client';

const store = new ElementStore('my-store');
const storage = new AtomStorage({ id: 'api', class_id: '@storage', url: 'http://localhost:8080' }, store);
store.storage = storage;

// Seed genesis data
await store.seed(genesisData);

// Create objects — AtomObj is proxy-based, property access goes through type coercion
const user = store.setObject({ class_id: 'user', name: 'Alice', email: 'alice@example.com' });
user.name;           // → String (via AtomProp.getPropValue)
user.name = 'Bob';   // triggers onChange, marks dirty

// Change tracking
user.hasChanges();   // true
user.getChanges();   // { name: { old: 'Alice', new: 'Bob' } }

// Persist (cascade: saves dirty children first, then parent)
await user.save();

// Relations
const order = store.getObject('order-1');
order.customer;      // → AtomObj (resolved via relation)
order.lines;         // → AtomCollection (iterable, filterable)
order.lines.get('line-1');  // by key
order.lines[0];             // by index

// Query
const users = store.query('user', { role: 'admin' });
```

### Browser Usage (IIFE)

```html
<script src="admin/dist/element-store.js"></script>
<script src="admin/ws-client.js"></script>
<script>
  // Globals: store, storage, AtomObj, AtomCollection, AtomClass, AtomProp,
  //          AtomStorage, ElementStore, ActionExecutor, classRegistry,
  //          registerClass, flattenGenesis, generateLocalId,
  //          setJwtToken, getJwtToken, normalizeClassIds

  var user = store.setObject({ class_id: 'user', name: 'Alice' });
  user.save();
</script>
```

### React Hooks

```typescript
import { useAtomObj, useAtomObjs, useStoreFind, useStoreInitialized, useAtomObjProperty } from '@agura/es-client/react';
import { useWidgetBinding } from '@agura/es-client/react';

// Subscribe to object changes (re-renders on any property change)
const user = useAtomObj(store, 'user-1');

// Subscribe to multiple objects
const users = useAtomObjs(store, ['user-1', 'user-2']);

// Wait for store initialization
const ready = useStoreInitialized(store);

// Reactive queries
const admins = useStoreFind(store, { class_id: 'user', role: 'admin' });

// Single property subscription (re-renders only when that prop changes)
const name = useAtomObjProperty(store, 'user-1', 'name');

// Declarative property binding with transformers
const { values, set, setMany, element } = useWidgetBinding(store, 'widget-1', {
  label:  { key: 'name',  dir: 'sync' },
  color:  { key: 'theme', dir: 'read', toWidget: (v) => v?.primary ?? '#000' },
  hidden: { key: 'visible', dir: 'sync', toWidget: (v) => !v, toElement: (v) => !v },
});
```

### Authentication

The client handles JWT auth through `AtomStorage`:

```typescript
// Login
storage.setAuth({ token: 'jwt-token', refresh_token: '...' });

// Token is sent as Authorization: Bearer header on all requests
storage.getToken();      // → current JWT
storage.restoreAuth();   // restore from localStorage
storage.refreshAuth();   // refresh an expiring token
storage.clearAuth();     // logout
```

On the server side, `AuthService.php` validates JWT tokens using JWKS. Auth configuration is stored as an `auth_config` object. See [`genesis/data/auth.genesis.json`](genesis/data/auth.genesis.json) for the auth service integration model.

### Build

```bash
cd packages/es-client

npm run build           # ESM → dist/esm/
npm run build:browser   # IIFE → admin/dist/element-store.js
npm run dev             # Watch mode
npm run typecheck       # Type check without emitting
```

## Genesis & Seed Data

ElementStore uses two file formats to define and load data:

**`.genesis.json`** — nested format, classes with inline props and seed references:

```json
{
  "version": "1.0.0",
  "namespace": "demo",
  "classes": [
    {
      "id": "demo:server",
      "class_id": "@class",
      "name": "Demo Server",
      "props": [
        {"key": "name", "data_type": "string", "required": true},
        {"key": "status", "data_type": "string"},
        {"key": "refresh", "data_type": "function", "object_class_id": ["@action"]}
      ]
    }
  ],
  "seed": [
    {"storage": "./demo-actions.seed.json"}
  ]
}
```

**`.seed.json`** — flat array of objects (any class):

```json
[
  {
    "id": "demo:server.refresh",
    "class_id": "@action",
    "name": "Refresh Status",
    "type": "api",
    "target_class_id": "demo:server",
    "method": "GET",
    "endpoint": "/service/server/{_link_id}",
    "response_mapping": {"power": "status", "cpu": "cpu_usage"}
  },
  {
    "id": "demo-srv-web01",
    "class_id": "demo:server",
    "name": "Web Server 01",
    "ip": "10.0.1.10",
    "status": "running"
  }
]
```

The `genesisConverter.flattenGenesis()` function (client-side) converts nested genesis to flat seed format.

### Genesis Libraries

Genesis files are **class libraries** — complete domain models you can include in your store. Load them via `POST /genesis` or place them in your `.es/` directory.

**Core (always loaded):**

| Library | File | Description |
|---------|------|-------------|
| System | [`system.genesis.json`](genesis/data/system.genesis.json) | Meta-schema: @class, @prop, @action, @event, @storage, @editor, @function, @provider, crud_provider, @seed, auth_* |
| Editors | [`editors.seed.json`](genesis/data/editors.seed.json) | Built-in UI editor instances (text, textarea, select, date, code, ...) |
| Functions | [`functions.seed.json`](genesis/data/functions.seed.json) | Built-in validator and transformer functions |

**Optional — include as needed:**

| Library | File | Classes | Shows |
|---------|------|---------|-------|
| Auth | [`auth.genesis.json`](genesis/data/auth.genesis.json) | auth_user, auth_role, auth_module, auth_permission, auth_app_registration, auth_refresh_token | Full RBAC model with roles, modules, and permissions |
| Accounting | [`accounting.genesis.json`](genesis/data/accounting.genesis.json) | acc_customer, acc_invoice, acc_product, acc_wallet, acc_balance, acc_agent, acc_charge_request, ... | Complex domain: relations, multi-currency, composite keys, providers |
| Demo Servers | [`demo-actions.genesis.json`](genesis/data/demo-actions.genesis.json) | demo:server + @action instances | Action props, provider binding, request/response mapping |
| ES Databases | [`es-database.genesis.json`](genesis/data/es-database.genesis.json) | es:database + @action instances | Self-monitoring: CouchDB stats synced via @action |

### The `.es/` Directory

Data is stored in the `.es/` directory. Each class gets a JSON file (e.g. `.es/@class.json`, `.es/user.json`). Namespaced classes use subdirectories (e.g. `acc:customer` → `.es/acc/acc.customer.json`). See [ES Directory Convention](docs/ES_DIRECTORY_CONVENTION.md).

## WebSocket Real-Time Sync

ElementStore includes a WebSocket server that pushes changes to all subscribed clients in real-time.

**How it works:**
1. Client A saves an object via REST API (PUT/POST)
2. PHP `ClassModel::onChange()` calls `BroadcastService::emitChange()` → HTTP POST to the WS server
3. WS server fans out the change to all clients subscribed to that class/object
4. Client B receives the message and calls `store.applyRemote()` for each item

**Message protocol (server → client):**

```json
{
  "type": "changes",
  "items": [
    {
      "id": "john123",
      "class_id": "user",
      "name": "John Updated",
      "_old": { "id": "john123", "class_id": "user", "name": "John" }
    }
  ]
}
```

- Each item IS the new object data (id, class_id, all fields)
- `_old` contains previous values (omitted for new objects)
- `_deleted: true` marks a deletion

**Connect and subscribe:**

```javascript
var esws = new ElementStoreWS(store, 'ws://' + location.host + '/elementStore/ws');
esws.connect();

esws.subscribe('user');                        // all changes for a class
esws.subscribeObject('user', 'john123');       // specific object

esws.on('change', function(item) { ... });
esws.on('delete', function(item) { ... });
```

**Sender echo suppression:** The saving client sends its WS connection ID via `X-WS-Connection-Id` header. The WS server skips that connection when broadcasting.

**Auto-reconnect:** Exponential backoff (1s → 2s → 4s → max 30s) with auto re-subscribe.

| Environment | WebSocket URL |
|---|---|
| Local (Agura) | `ws://arc3d.master.local/elementStore/ws` |
| Staging | `wss://arc3d.dev.agura.tech/elementStore/ws` |
| Standalone | `ws://arc3d.master.local/elementStore/ws` |

## REST API Reference

### Health & Info
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/info` | List all endpoints |

### Class Operations
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/class` | List all classes |
| GET | `/class/{id}` | Get class definition |
| GET | `/class/{id}/props` | Get class properties (includes inherited) |
| POST | `/class` | Create/update class |
| DELETE | `/class/{id}` | Delete class |

### Object Operations
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/store/{class}` | List all objects of a class |
| GET | `/store/{class}/{id}` | Get object by ID |
| GET | `/store/{class}/{id}/{prop}` | Get property value (resolves relations) |
| PUT | `/store/{class}/{id}/{prop}` | Set single property |
| POST | `/store/{class}` | Create object |
| PUT | `/store/{class}/{id}` | Update object |
| DELETE | `/store/{class}/{id}` | Delete object |

### Query & Search
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/query/{class}?field=value` | Filter objects |
| GET | `/find/{id}` | Find object by ID across all classes |

Query parameters: `_sort`, `_order` (asc/desc), `_limit`, `_offset`

### Data Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/genesis` | Initialize seed data |
| GET | `/genesis` | Verify genesis data |
| POST | `/export` | Export all data |
| GET | `/exports` | List exports |
| POST | `/reset` | Reset all data |

## Server-Side (PHP)

### Core Classes

| Class | Purpose |
|-------|---------|
| `ClassModel` | Orchestration layer — validation, change detection, storage routing |
| `AtomObj` | Base object with `extraData`, magic `__get`/`__set`, change tracking |
| `Prop` | Property definition with fluent setters |
| `ClassMeta` | Class definition — `collectProps()`, `getStorage()`, `extendsClass()` |
| `AuthService` | JWT middleware — JWKS validation, user/app injection |
| `ActionExecutor` | Server-side action dispatch (api, cli, function, event, composite) |
| `GenesisLoader` | Parse `.genesis.json` and `.seed.json`, auto seed write-back |
| `BroadcastService` | Fire-and-forget HTTP POST to WS server |

### Storage Providers

| Provider | Best For | Config |
|----------|----------|--------|
| **JsonStorageProvider** | Development, small datasets | One JSON file per class in `.es/` |
| **MongoStorageProvider** | Production, large datasets | One collection per class |
| **CouchDbStorageProvider** | Document-oriented workflows | One database per class |

Configure via `@init.json`:

```json
{
  "@storage": {
    "bootstrap": {
      "type": "json"
    }
  }
}
```

## CLI Tools

ElementStore ships with command-line utilities in `util/`:

| Tool | Purpose |
|------|---------|
| `es-cli.sh` | Universal CLI — CRUD, push/pull, init, query, actions |
| `es-view.sh` | Data viewer — tables, cards, pivot matrices, raw JSON |
| `es-features.sh` | Feature registry catalog — status matrix, gaps, stats |
| `es-pull.sh` / `es-push.sh` | Sync data between local files and server |

### `es-cli.sh` Reference

The universal CLI for all ElementStore operations. Set `ES_URL` to avoid passing `--url` on every call:

```bash
export ES_URL="http://arc3d.master.local/elementStore"
alias es="bash /path/to/elementStore/util/es-cli.sh"
```

**Commands:**

| Command | Description |
|---------|-------------|
| `health` | Connectivity check |
| `classes` | List all class IDs |
| `get` | Fetch a single object |
| `list` / `query` | List/search objects with filters & pagination |
| `find` | Find object by ID across all classes |
| `set` / `upsert` | Create or update objects |
| `push` | Bulk import: storage → storage |
| `pull` | Bulk export: storage → storage |
| `init` / `reinit` | Load genesis from `.es/` directory (server-side reload) |
| `delete` | Delete objects or classes |
| `action` / `exec` | Execute action on object |

**CRUD operations:**

```bash
# Get one object
es get --class Customer --id 123

# List with filter and pagination
es list --class Customer --filter balCode=220 --limit 20 --sort fullName

# Create/update (inline JSON)
es set --class Customer --data '{"id":"123","fullName":"John Doe","email":"john@example.com"}'

# Create/update from file
es set --file customers.json

# Delete an object
es delete --class Customer --id 123
```

**Loading project data (`.es/` directory):**

```bash
# Push from a project's .es/ directory — auto-detects genesis + seed files
es push --from /path/to/billing.omc.co.il --to http://localhost/elementStore

# Same — .es/ auto-detection means these are equivalent:
es push --from /path/to/billing.omc.co.il/.es --to $ES_URL

# Server-side init (elementStore reads .es/ from its own filesystem)
es init --es-dir /var/www/billing.omc.co.il/.es --url $ES_URL --force

# Force overwrite existing classes
es push --from /path/to/project --to $ES_URL --force

# Dry run — show what would be loaded without making changes
es push --from /path/to/project --to $ES_URL --dry-run
```

The push command processes `*.genesis.json` files first (class definitions), then remaining `*.json` files (seed/provider objects). See [ES Directory Convention](docs/ES_DIRECTORY_CONVENTION.md).

**Pull (export) data:**

```bash
# Pull one class to a file
es pull --class Customer --from $ES_URL --to ./Customer.json

# Pull all classes into a directory
es pull --all --from $ES_URL --to-dir ./backup/
```

**Options reference:**

| Option | Description |
|--------|-------------|
| `--url <url>` | ElementStore API URL (or set `ES_URL`) |
| `--from <storage>` | Source (URL or file path) |
| `--to <storage>` | Target (URL or file path) |
| `--class <id>` | Target class |
| `--id <id>` | Object ID |
| `--data <json>` | Inline JSON payload |
| `--file <path>` | Read from JSON file |
| `--dir <path>` | Load all JSON files from directory |
| `--filter <k=v>` | Filter (repeatable) |
| `--limit <n>` | Max objects to return |
| `--offset <n>` | Skip first N objects |
| `--sort <field>` | Sort by field |
| `--order <asc/desc>` | Sort direction |
| `--force` | Overwrite existing on push/init |
| `--dry-run` | Preview without making changes |
| `--token <jwt>` | Bearer token (or set `ES_TOKEN`) |
| `-v` / `--verbose` | Show HTTP request/response details |

### Feature Registry (`es-features.sh`)

The feature registry tracks 24 canonical capabilities across all clients. Use `es-features.sh` to inspect it:

```bash
# Full catalog grouped by category with descriptions and notes
bash util/es-features.sh

# Compact status matrix (feature x client)
bash util/es-features.sh matrix

# Summary stats per client (coverage %)
bash util/es-features.sh stats

# Show gaps for a specific client
bash util/es-features.sh gaps app:es-admin

# Deep-dive on a single feature (description, notes, per-client status)
bash util/es-features.sh detail feat:object_crud

# Filter by category or progress
bash util/es-features.sh matrix --category core
bash util/es-features.sh gaps --progress partial

# JSON output for scripting
bash util/es-features.sh stats --json

# Fetch from live API instead of local .es/ files
bash util/es-features.sh matrix --url http://arc3d.master.local/elementStore
```

By default reads from local `.es/` JSON files. Use `--url` or `--from-api` to query a running server.

## Rules for AI Agents

These rules apply to any AI (Claude, GPT, Copilot, AIC agents, or any LLM) working within or against the elementStore. They are non-negotiable.

### Rule 1: Search the Store Before Inventing

**Before creating ANY new class, property, object, constant, enum, config array, or data structure — search the store for what already exists.**

```bash
# Search for existing classes
curl -sf "$ES_URL/class" | jq -r '.[].id' | grep -i "<keyword>"

# Search for existing objects
curl -sf "$ES_URL/find/<suspected_id>"

# List objects of a class
curl -sf "$ES_URL/store/<class_id>"
```

If the data already exists as a class or object — **use it**. Do not duplicate it in code, config files, JSON arrays, or markdown. The store is the single source of truth.

**Examples of violations:**
- Hardcoding a list of environments when `@environment` objects exist
- Creating a `PROVIDERS` constant when `@provider` objects exist
- Writing an `agents.json` config when `ai:agent` objects are in the store
- Embedding port numbers in code when `@installation` has them

### Rule 2: Declare Before You Code

**If you need a new data structure, define it as an elementStore class — not as code.**

| You need... | Do this | Not this |
|---|---|---|
| A data structure | Create a `@class` with `@prop` definitions | Write a struct/interface/type in code |
| An operation | Create an `@action` object | Write a standalone function |
| A list of options | Use `@prop` with `options.values` | Hardcode an array |
| A configuration | Create objects of an existing class | Write a `.env` or config file |
| Validation rules | Use `@prop` validators and constraints | Write custom validation code |
| An integration | Create a `@provider` with action bindings | Write ad-hoc API client code |

Only write code when the elementStore schema genuinely cannot express what you need (storage provider internals, protocol handling, rendering logic).

### Rule 3: Understand Relations Before Adding Properties

**Every new class must declare its relations to existing classes.** Do not create isolated classes.

Before adding a class, answer:
1. Does it `extends_id` an existing class? (inheritance)
2. Does it have `relation` props pointing to other classes? (references)
3. Is there an existing class that should point to it? (reverse relations)
4. Does it belong under a namespace that already has conventions? (`ai:`, `es:`, `@`)

```json
{
  "id": "ai:agent_session",
  "extends_id": "@registry-item",
  "props": [
    {"key": "agent_id", "data_type": "relation", "relation": {"class_id": "ai:agent"}},
    {"key": "environment_id", "data_type": "relation", "relation": {"class_id": "@environment"}}
  ]
}
```

### Rule 4: Object Operations Go Through the Store

**All reads and writes of structured data go through the REST API or `es-cli.sh`.** Never bypass the store by editing `.es/*.json` files for object-level changes.

```bash
# Correct
curl -sf -X POST "$ES_URL/store/ai:task" -H 'Content-Type: application/json' \
  -d '{"id":"task:123","class_id":"ai:task","name":"Fix bug","status":"open"}'

# Wrong — editing the JSON file directly
echo '{"id":"task:123",...}' >> .es/ai/ai.task.json
```

Editing `.es/` files directly is only allowed for:
- Inspecting structure or debugging
- Fixing malformed JSON
- Bulk scripting across files (genesis/seed operations)

### Rule 5: No Standalone Docs for Structured Data

If data can be modeled as classes and objects, it belongs in the store — not in markdown, HTML, or config files.

| Belongs in the store | Belongs in markdown |
|---|---|
| Feature definitions → `@feature` | Architecture decisions and rationale |
| App status → `@app_feature` | Procedures and how-to guides |
| Environment config → `@environment` | Integration guides (Docker, CI/CD) |
| Agent definitions → `ai:agent` | Philosophy, overview, README |
| Editor definitions → `@editor` | These AI rules |
| Installation specs → `@installation` | |

**Test:** If you're about to write a list of structured items in a doc, stop and ask: *"Should this be a class?"*

### Rule 6: Feature-Driven Development

Every feature must be tracked through `@feature` and `@app_feature` objects.

1. Check if `@feature` exists for the capability. If not, create one.
2. Check if `@app_feature` exists for your target app. If not, create one with `progress: "in_progress"`.
3. Implement the feature.
4. Update `@app_feature` with `progress: "implemented"`, file paths in `implemented_in`, and `notes`.

### Rule 7: Respect Existing Naming Conventions

| Prefix | Scope | Examples |
|---|---|---|
| `@` | System/meta classes | `@class`, `@prop`, `@environment`, `@installation` |
| `ai:` | AI Company domain | `ai:agent`, `ai:message`, `ai:task`, `ai:worker` |
| `es:` | elementStore internals | `es:finding`, `es:tenant`, `es:database` |
| `feat:` | Feature registry | `feat:object_crud`, `feat:filter_by` |
| `af:` | App-feature mapping | `af:es-admin:filter_by` |
| `app:` | Application registry | `app:es-admin`, `app:es-php-backend` |

New classes must follow the namespace of their domain. Do not invent new prefixes without checking existing ones.

### Rule 8: Genesis Files Are Class Libraries

When creating new classes, define them in `.genesis.json` files — not through ad-hoc API calls or code.

- Classes + props → `*.genesis.json` (nested format with inline props)
- Seed objects → `*.seed.json` (flat array of objects)
- Place in the relevant project's `.es/` directory
- Register in the project's genesis loader

This ensures classes are reproducible, versionable, and can be seeded on any environment.

### Rule 9: Check Platform Registry Classes First

The `platform_root` project defines cross-cutting classes used by all projects:

| Class | Purpose |
|---|---|
| `@project` | Project metadata (name, path, repos, ports) |
| `@environment` | Deployment environments (hostnames, IPs, SSL, deployed repos) |
| `@installation` | Installation specs (docker, services, ports, volumes) |
| `@repository` | Git repositories |
| `@registry-item` | Base class for registry objects (name, description, status, tags) |

**Before creating infrastructure-related classes, check if `platform_root` already has them.** These classes exist precisely so that every project and agent shares the same model for environments, installations, and projects — instead of each one inventing its own.

## AI Interaction Guide

> **For Claude and other AI agents working in this repository.**

ElementStore is self-describing — features, apps, and implementation status are stored as regular objects in the running server. **Always query the live server via `es-cli.sh`, never read `.es/*.json` files directly.** This validates the full recursive genesis→seed loading chain on every query.

**Before planning or implementing features**, run `bash util/es-features.sh matrix` to see current progress across all clients, or `bash util/es-features.sh gaps app:<target>` to identify what needs work.

### Setup

```bash
export ES_URL="http://arc3d.master.local/elementStore"
alias es="bash /path/to/elementStore/util/es-cli.sh"
```

Or use inline:
```bash
ES=bash\ util/es-cli.sh
```

### Registry Queries

```bash
# Health check — always run first
bash util/es-cli.sh health --url $ES_URL

# List all known features
bash util/es-cli.sh list --class @feature --url $ES_URL

# Get a specific feature
bash util/es-cli.sh get --class @feature --id feat:filter_by --url $ES_URL

# List all registered applications
bash util/es-cli.sh list --class @app --url $ES_URL

# List implementation status for all apps × features
bash util/es-cli.sh list --class @app_feature --url $ES_URL

# Filter: all features for a specific app
bash util/es-cli.sh list --class @app_feature --filter application_id=app:es-admin --url $ES_URL

# Filter: all app statuses for a specific feature
bash util/es-cli.sh list --class @app_feature --filter feature_id=feat:filter_by --url $ES_URL

# List system classes (the meta-schema)
bash util/es-cli.sh classes --url $ES_URL

# Get a system class definition
bash util/es-cli.sh get --class @class --id @prop --url $ES_URL
```

### Why Not Read `.es/*.json` Directly?

The `.es/` directory is local JSON storage — the raw persistence layer. When you read it directly:
- You bypass the server's genesis loading pipeline (recursive `.genesis.json` → `.seed.json` chain)
- You miss any data the server merged from seed files
- You skip type coercion, validation, and relation resolution

**Always query via es-cli** to test that the full server→genesis→seed path works end-to-end. If a query fails, it means the genesis pipeline is broken — a signal worth catching.

### Adding / Updating Features

When you implement a new feature or change an existing one, update the registry via the API:

```bash
# Add a new feature definition
bash util/es-cli.sh set --url $ES_URL --data '{
  "id": "feat:filter_by",
  "class_id": "@feature",
  "name": "filter_by — Cross-Field Object Picker Filter",
  "description": "When an object/relation prop has object_class_id + options.filter_by, picker candidates are filtered: candidate[field] includes/equals thisObject[source]",
  "category": "schema",
  "group": "prop",
  "scope": "client"
}'

# Update an app_feature status
bash util/es-cli.sh set --url $ES_URL --data '{
  "id": "af:es-admin:filter_by",
  "class_id": "@app_feature",
  "application_id": "app:es-admin",
  "feature_id": "feat:filter_by",
  "progress": "not_started"
}'
```

Then sync `docs/CLIENT_FEATURE_REGISTRY.md` from the live data (not from the JSON files).

---

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture](docs/ARCHITECTURE.md) | Storage resolution, object lifecycle, relation system, cascade save, multi-app design |
| [Client Feature Registry](docs/CLIENT_FEATURE_REGISTRY.md) | Feature checklist and implementation status |
| [Provider Binding](docs/ELEMENT_PROVIDER_BINDING.md) | Provider integration and action mapping |
| [ES Directory Convention](docs/ES_DIRECTORY_CONVENTION.md) | `.es/` directory naming and structure |
| [Migration Procedure](docs/MIGRATION_PROCEDURE.md) | How to migrate any project to ElementStore |
| [Docker Setup](docker/README.md) | Docker service configuration and troubleshooting |

## Project Structure

```
elementStore/
├── index.php                         # REST API router (Phalcon Micro)
├── autoload.php                      # PSR-4 autoloader
├── @init.json                        # Storage configuration
├── test.sh                           # API test suite (curl-based)
│
├── packages/es-client/               # @agura/es-client npm package
│   ├── package.json                  # v0.1.0 — ESM + IIFE builds
│   ├── tsup.config.ts                # tsup build config
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts                  # Barrel export (ESM entry)
│       ├── browser.ts                # IIFE entry (window.* globals)
│       ├── types.ts                  # Unified TypeScript types
│       ├── core/
│       │   ├── ElementStore.ts       # Main store — seed, query, find, subscribe
│       │   ├── AtomObj.ts            # Proxy-based reactive object — save, delete, change tracking
│       │   ├── AtomCollection.ts     # Array-like collection — get, find, add, remove
│       │   ├── AtomClass.ts          # Class definition — getProps() with inheritance
│       │   └── AtomProp.ts           # Property — getPropValue/setPropValue with type coercion
│       ├── storage/
│       │   ├── AtomStorage.ts        # REST storage adapter with JWT auth
│       │   └── ProxyStorage.ts       # Proxy storage (composite, provider-backed)
│       ├── actions/
│       │   └── ActionExecutor.ts     # Universal action dispatcher (api/function/event/composite/ui)
│       ├── modules/
│       │   ├── classRegistry.ts      # Class ID → JS constructor mapping
│       │   ├── genesisConverter.ts   # Flatten nested genesis → flat seed
│       │   └── ElementStoreClient.ts # Client initialization helper
│       └── react/
│           ├── index.ts              # React hooks barrel export
│           ├── useAtomObj.ts          # useAtomObj, useAtomObjs, useStoreFind, useStoreInitialized, useAtomObjProperty
│           └── useWidgetBinding.ts   # Declarative property binding with transformers
│
├── src/                              # PHP backend
│   ├── ClassModel.php                # Core orchestration layer
│   ├── AtomObj.php                   # Base object with extraData
│   ├── Prop.php                      # Property definition with validation
│   ├── ClassMeta.php                 # Class definition metadata
│   ├── Constants.php                 # System constants (K_*, F_*, DT_*, ET_*, VT_*)
│   ├── IStorageProvider.php          # Storage interface
│   ├── JsonStorageProvider.php       # JSON file storage
│   ├── MongoStorageProvider.php      # MongoDB storage
│   ├── CouchDbStorageProvider.php    # CouchDB storage
│   ├── BroadcastService.php          # WS broadcast (fire-and-forget)
│   ├── AuthService.php               # JWT middleware (JWKS validation)
│   ├── ActionExecutor.php            # Server-side action dispatcher
│   ├── GenesisLoader.php             # Genesis/seed file parser
│   ├── SystemClasses.php             # Bootstrap system class definitions
│   └── StorageException.php          # Typed exceptions
│
├── ws/                               # WebSocket server (Node.js)
│   ├── server.js                     # WS server + HTTP /broadcast endpoint
│   └── package.json
│
├── admin/                            # Admin UI
│   ├── index.html                    # Dashboard (ag-grid, select2, Bootstrap)
│   ├── ws-client.js                  # WebSocket client (ElementStoreWS)
│   ├── ui-element.js                 # DOM-bound AtomElement extension
│   ├── test.html                     # Interactive browser demo
│   ├── dist/
│   │   └── element-store.js          # IIFE bundle (built from packages/es-client)
│   └── js/
│       ├── app.js                    # Dashboard initialization + store setup
│       ├── api.js                    # HTTP client (fetch wrapper, API_BASE)
│       ├── auth.js                   # Login/logout UI
│       ├── actions.js                # Action execution UI
│       ├── grid.js                   # ag-grid data table wrapper
│       ├── search.js                 # Global search
│       ├── health.js                 # Health check polling
│       ├── tabs.js                   # Tab manager
│       ├── modal.js                  # Modal/dialog UI
│       ├── utils.js                  # Shared utilities
│       ├── seed-data.js              # Genesis + seed loading
│       ├── visual-designer.js        # Canvas editor (connectors, drag)
│       ├── editor/
│       │   ├── generic-editor.js     # Universal form builder
│       │   └── fields.js             # Field renderers by data type
│       └── panels/
│           ├── class-list.js         # Class browser panel
│           └── object-list.js        # Object data grid panel
│
├── genesis/                          # Seed data and initialization
│   ├── Genesis.php
│   ├── init.php
│   ├── test.php
│   └── data/                         # Genesis & seed files
│       ├── system.genesis.json       # System class definitions (the meta-schema)
│       ├── auth.genesis.json         # Auth service data model
│       ├── accounting.genesis.json    # Accounting class library
│       ├── demo-actions.genesis.json # Demo: actions + provider binding
│       ├── es-database.genesis.json  # Self-monitoring: CouchDB stats
│       ├── editors.seed.json         # Built-in UI editors
│       └── functions.seed.json       # Built-in validators/transformers
│
├── docker/                           # Docker setup
│   ├── docker-compose.yml
│   ├── docker-compose.couchdb.yml
│   ├── Dockerfile.php / .fpm / .ws / .couchdb
│   ├── apache-vhost.conf
│   ├── .env.example
│   └── README.md
│
├── docs/                             # Documentation
├── .es/                              # Data directory (JSON storage)
├── keys/                             # JWT signing keys
├── docker-compose.agura.yml          # Agura platform integration
└── .gitlab-ci.yml                    # CI/CD pipeline
```

## License

MIT
