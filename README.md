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
| Standalone | `ws://elementstore.master.local/ws` |

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

## AI Interaction Guide

> **For Claude and other AI agents working in this repository.**

ElementStore is self-describing — features, apps, and implementation status are stored as regular objects in the running server. **Always query the live server via `es-cli.sh`, never read `.es/*.json` files directly.** This validates the full recursive genesis→seed loading chain on every query.

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
bash util/es-cli.sh list --class es:feature --url $ES_URL

# Get a specific feature
bash util/es-cli.sh get --class es:feature --id feat:filter_by --url $ES_URL

# List all registered applications
bash util/es-cli.sh list --class es:app --url $ES_URL

# List implementation status for all apps × features
bash util/es-cli.sh list --class es:app_feature --url $ES_URL

# Filter: all features for a specific app
bash util/es-cli.sh list --class es:app_feature --filter application_id=app:es-admin --url $ES_URL

# Filter: all app statuses for a specific feature
bash util/es-cli.sh list --class es:app_feature --filter feature_id=feat:filter_by --url $ES_URL

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
  "class_id": "es:feature",
  "name": "filter_by — Cross-Field Object Picker Filter",
  "description": "When an object/relation prop has object_class_id + options.filter_by, picker candidates are filtered: candidate[field] includes/equals thisObject[source]",
  "category": "schema",
  "group": "prop",
  "scope": "client"
}'

# Update an app_feature status
bash util/es-cli.sh set --url $ES_URL --data '{
  "id": "af:es-admin:filter_by",
  "class_id": "es:app_feature",
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
