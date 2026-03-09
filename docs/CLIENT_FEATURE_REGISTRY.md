# ElementStore — Client Feature Registry

> **Canonical spec** — all clients must comply with every ✅ row.
> Updated: 2026-03-09
>
> **Source of truth**: Live server registry — query via `es-cli.sh`, never read `.es/*.json` directly.
> ```bash
> bash util/es-cli.sh list --class es:feature --url http://arc3d.master.local/elementStore
> bash util/es-cli.sh list --class es:app_feature --url http://arc3d.master.local/elementStore
> ```

## Clients

| Short | App ID | Full name | Language | Location |
|-------|--------|-----------|----------|----------|
| **Server** | `app:es-php-backend` | elementStore PHP | PHP 7.4+ | `elementStore/src/` |
| **@es-client** | `app:es-client-npm` | @agura/es-client | TypeScript | `elementStore/packages/es-client/` |
| **Admin** | `app:es-admin` | elementStore Admin UI | TS (IIFE) + JS | `elementStore/admin/` |

> `@es-client` is the **reference client implementation** — compiled to ESM (npm consumers) and IIFE bundle (`admin/dist/element-store.js`).
> Admin uses the IIFE build, so all core `feat:client_*` features are ✅ in Admin via the bundle.
> ~~cwm-architect frontend~~ and ~~cwm-architect backend~~ are **deprecated** — replaced by `@es-client`.

---

## 1. Data Types

| Type | Canonical | Server | @es-client | Admin | Status |
|------|:---------:|:------:|:----------:|:-----:|--------|
| `string` | ✅ | ✅ | ✅ | ✅ | Done |
| `boolean` | ✅ | ✅ | ✅ | ✅ | Done |
| `integer` | ✅ | ✅ | ✅ | ✅ | Done |
| `float` | ✅ | ✅ | ✅ | ✅ | Done |
| `datetime` | ✅ | ✅ | ✅ | ✅ | Done |
| `object` | ✅ | ✅ | ✅ | ✅ | Done |
| `relation` | ✅ | ✅ | ✅ | ✅ | Done |
| `function` | ✅ | ✅ | ✅ | ✅ | Done |

> `datetime` is canonical for date-only, time-only, and full datetime. The **editor type** (date/time/datetime picker) controls display granularity.

---

## 2. System Classes (@-prefixed)

| Class ID | Description | Server genesis | Server PHP | @es-client | Admin | Status |
|----------|-------------|:-:|:-:|:-:|:-:|--------|
| `@class` | Class definition (schema of schemas) | ✅ | ✅ | ✅ | ✅ | Done |
| `@prop` | Property definition (field schema) | ✅ | ✅ | ✅ | ✅ | Done |
| `@storage` | Storage provider config | ✅ | ✅ | ✅ | ✅ | Done |
| `@editor` | UI editor component definition | ✅ | ✅ | ✅ | ✅ | Done |
| `@action` | Universal execution unit (api/cli/fn/event/composite/ui) | ✅ | ✅ | ✅ | ✅ | Done |
| `@event` | Event handler definition | ✅ | ✅ | ✅ | ✅ | Done |
| `@function` | Reusable function (validator/transformer/computed) | ✅ | ✅ | ✅ | ✅ | Done |
| `@provider` | External API provider (abstract) | ✅ | ✅ | ✅ | ✅ | Done |
| `crud_provider` | CRUD REST provider (extends @provider) | ✅ | ✅ | ✅ | ✅ | Done |
| `auth_config` | Auth-service connection config | ✅ | ✅ | — | — | Server-only |
| `auth_app` | App registration credentials | ✅ | ✅ | — | — | Server-only |
| `auth_machine` | Machine/instance registration | ✅ | ✅ | — | — | Server-only |

---

## 3. Storage Types

| Type | Description | Server genesis | Server PHP | @es-client | Admin | Status |
|------|-------------|:-:|:-:|:-:|:-:|--------|
| `local` | Browser localStorage | ✅ | — | ✅ | ✅ | Done |
| `rest` / `api` | ElementStore REST API | ✅ | ✅ | ✅ | ✅ | Done |
| `seed` | Read-only genesis data | ✅ | — | ✅ | ✅ | Done |
| `composite` | Multi-source with strategies | ✅ | — | ✅ | partial | Admin: wire up |
| `couchdb` | CouchDB backend | ✅ | ✅ | — | — | Server-only |
| `mysql` | MySQL backend | ✅ | ✅ | — | — | Server-only |
| `json` | File-based JSON | ✅ | ✅ | — | — | Server-only |

### Composite Storage Fields

| Field | Description | Server genesis | @es-client | Admin | Status |
|-------|-------------|:-:|:-:|:-:|--------|
| `provider_id` | Link to @provider instance | ✅ | ✅ | partial | Admin: wire up |
| `read[]` | Ordered storage IDs to read from | ✅ | ✅ | partial | Admin: wire up |
| `write` | Storage ID to write to | ✅ | ✅ | partial | Admin: wire up |
| `read_strategy` | fallback / merge | ✅ | ✅ | partial | Admin: wire up |
| `write_strategy` | sequential / parallel / best_effort | ✅ | ✅ | partial | Admin: wire up |

---

## 4. Editor Names

| Editor ID | Data Types | Server seed | @es-client | Admin | Status |
|-----------|-----------|:-:|:-:|:-:|--------|
| `text` | string | ✅ | ✅ | ✅ | Done |
| `textarea` | string, function | ✅ | ✅ | ✅ | Done |
| `code` | string, function | ✅ | ✅ | ✅ | Done |
| `password` | string | ✅ | ✅ | ✅ | Done |
| `email` | string | ✅ | ✅ | ❌ | Admin: add |
| `url` | string | ✅ | ✅ | ❌ | Admin: add |
| `phone` | string | ✅ | ✅ | ❌ | Admin: add |
| `richtext` | string | ✅ | ✅ | ✅ | Done |
| `autocomplete` | string, relation | ✅ | ✅ | ✅ | Done |
| `javascript` | function | ✅ | ✅ | ❌ | Admin: add |
| `number` | integer, float | ✅ | ✅ | ✅ | Done |
| `slider` | integer, float | ✅ | ✅ | ✅ | Done |
| `currency` | integer, float | ✅ | ✅ | ✅ | Done |
| `toggle` | boolean | ✅ | ✅ | ✅ | Done |
| `checkbox` | boolean | ✅ | ✅ | ✅ | Done |
| `date` | datetime | ✅ | ✅ | ✅ | Done |
| `datetime` | datetime | ✅ | ✅ | ✅ | Done |
| `time` | datetime | ✅ | ✅ | ✅ | Done |
| `select` | string, integer, float, relation | ✅ | ✅ | ✅ | Done |
| `radio` | string, integer, float | ✅ | ✅ | ✅ | Done |
| `multiselect` | string, relation | ✅ | ✅ | ✅ | Done |
| `nested` | object | ✅ | ✅ | ❌ | Admin: add |
| `keyvalue` | object | ✅ | ✅ | ✅ | Done |
| `json` | object, string | ✅ | ✅ | ✅ | Done |
| `reference` | relation | ✅ | ✅ | ✅ | Done |
| `references` | relation | ✅ | ✅ | ✅ | Done |
| `color` | string | ✅ | ✅ | ✅ | Done |
| `file` | string | ✅ | ✅ | ✅ | Done |
| `image` | string | ✅ | ✅ | ✅ | Done |
| `function-picker` | function | ❌ | ✅ | ❌ | Server: add to seed |

---

## 5. @action Type System

| Action type | Description | Server PHP | @es-client | Admin | Status |
|-------------|-------------|:-:|:-:|:-:|--------|
| `api` | HTTP call to external provider | ✅ | ✅ | ✅ | Done |
| `cli` | Shell command with {field} placeholders | ✅ | — | — | Server-only |
| `function` | FunctionRegistry dispatch | ✅ | ✅ | ✅ | Done |
| `event` | EventBus event emit | ✅ | ✅ | ✅ | Done |
| `composite` | Chain of sub-actions | ✅ | ✅ | ✅ | Done |
| `ui` | JS handler (client-only) | no-op | no-op | ✅ | Done |

### @action Fields

| Field | Type | Group | Description |
|-------|------|-------|-------------|
| `name` | string | Core | Display name |
| `type` | string | Core | api / cli / function / event / composite / ui |
| `group_name` | string | Core | Category for UI grouping |
| `target_class_id` | @class | Core | Class this action applies to |
| `params` | @prop[] | Core | Input parameters schema |
| `returns` | string | Core | object / list / void |
| `request_mapping` | object | Core | Source object field → request field mapping |
| `response_mapping` | object | Core | Response field → target object field mapping |
| `provider_id` | @provider | API | Provider (inherits base_url, auth) |
| `method` | string | API | GET / POST / PUT / PATCH / DELETE |
| `endpoint` | string | API | URL path (supports `{field}` substitution) |
| `headers` | object | API | Additional HTTP headers |
| `command` | string | CLI | Shell command with {field} placeholders |
| `working_dir` | string | CLI | Working directory for command |
| `function` | string | Function | FunctionRegistry key |
| `event` | string | Event | EventBus event name |
| `payload` | object | Event | param → event_field mapping |
| `actions` | @action[] | Composite | Ordered sub-action IDs |
| `strategy` | string | Composite | sequential / parallel |
| `handler` | function | UI | JS handler code |
| `requires_selection` | boolean | UI | Needs selected object(s) |
| `bulk` | boolean | UI | Can apply to multiple objects |
| `confirm` | string | UI | Confirmation message |
| `icon` | string | UI | Icon name |

---

## 6. @provider System

| Field | Description | Server genesis | @es-client | Admin | Status |
|-------|-------------|:-:|:-:|:-:|--------|
| `name` | Provider display name | ✅ | ✅ | ✅ | Done |
| `base_url` | Base URL (inherited via extends_id) | ✅ | ✅ | ✅ | Done |
| `auth` | Auth config {type, token, ...} | ✅ | ✅ | ✅ | Done |
| `id_field` | API field holding external ID | ✅ | ✅ | ✅ | Done |
| `write_mode` | crud / actions_only | ✅ | ✅ | ✅ | Done |
| `mapping` | Default field mapping | ✅ | ✅ | ✅ | Done |
| `actions` | Available @action IDs | ✅ | ✅ | ✅ | Done |
| `params` | Default query parameters | ✅ | ✅ | ✅ | Done |

### Provider Auth Types

| Auth type | Description |
|-----------|-------------|
| `bearer` | Authorization: Bearer {token} |
| `basic` | Authorization: Basic base64(user:pass) |
| `apikey` | Custom header with API key |
| `none` | No authentication |

### _links (Object-Level Provider Tracking)

Every object can carry `_links: { [storage_id]: external_id }` — server_only, hidden.
Managed by ActionExecutor, never set by clients.

---

## 7. filter_by — Cross-Field Object Picker Filter

> **feat:filter_by** — schema / class / scope: client

When an `object` or `relation` prop has `object_class_id` + `options.filter_by: { field, source }`, picker candidates are filtered:
`candidate[field]` must include/equal `thisObject[source]`.

**Example:** `@prop.editor` — `object_class_id: ["@editor"]` + `options.filter_by: { field: "data_types", source: "data_type" }` → only show `@editor` instances whose `data_types` includes this prop's `data_type`.

| Client | Stored in schema | Applied in picker UI | Status |
|--------|:---:|:---:|--------|
| Server PHP | ✅ | N/A | Done |
| @es-client | ✅ (`FilterBy` type) | ✅ (consumer responsibility) | Done |
| Admin | ✅ | ❌ `fields.js` ignores it | Add to `fields.js` picker |

**Schema:** `prop.options.filter_by: { field: string, source: string }`
**TypeScript:** `FilterBy` in `packages/es-client/src/types.ts`

---

## 8. AtomObj — Reactive Object Class

> **feat:client_atomobj** — core / object / scope: client

| Method / Property | Server PHP | @es-client | Admin | Status |
|---|:-:|:-:|:-:|--------|
| `constructor(classId, data)` | ✅ | ✅ | ✅ | Done |
| Proxy GET (data, methods, internals) | — | ✅ | ✅ | Done |
| Proxy SET (coercion, dirty, onChange) | — | ✅ | ✅ | Done |
| `data` (raw field store) | ✅ | ✅ | ✅ | Done |
| `_snapshot` (change tracking) | — | ✅ | ✅ | Done |
| `_related`, `_dirtyRelated`, `_belongsTo` | — | ✅ | ✅ | Done |
| `_onChange` (callback array) | — | ✅ | ✅ | Done |
| `getProps()` | ✅ | ✅ | ✅ | Done |
| `getPropDef(key)` | — | ✅ | ✅ | Done |
| `_applyDefaults()` | — | ✅ | ✅ | Done |
| `hasChanges()` / `getChanges()` | ✅ | ✅ | ✅ | Done |
| `save()` recursive children-first | — | ✅ | ✅ | Done |
| `addChild(prop, child)` / `removeChild()` | — | ✅ | ✅ | Done |
| `getDirtyObjects()` | — | ✅ | ✅ | Done |
| `validate()` type+required+options | ✅ | ✅ | ✅ | Done |
| `toJSON()` / `toArray()` / `toApiArray()` | ✅ | ✅ | ✅ | Done |
| `_syncRelationIds()` | — | ✅ | ✅ | Done |
| `update(updates)` batch setter | — | ✅ | ✅ | Done |
| `delete()` soft delete | — | ✅ | ✅ | Done |
| `subscribe(cb): unsubscribe` | — | ✅ | ✅ | Done |
| `extendsFrom(ancestorId)` | — | ✅ | ✅ | Done |
| `getInheritanceChain()` | — | ✅ | ✅ | Done |
| `getClassDefaults()` | — | ✅ | ✅ | Done |

---

## 9. AtomProp — Property Class

> **feat:client_atomprop** — schema / class / scope: client

| Method / Property | Server PHP | @es-client | Admin | Status |
|---|:-:|:-:|:-:|--------|
| `getPropValue()` type coercion | ✅ | ✅ | ✅ | Done |
| `setPropValue()` type validation | ✅ | ✅ | ✅ | Done |
| Computed `order_id` (index in parent) | — | ✅ | ✅ | Done |
| Static ID array → object resolution | — | ✅ | ✅ | Done |
| Dynamic relation (query by owner_id) | — | ✅ | ✅ | Done |
| All prop fields as class properties | ✅ | ✅ | ✅ | Done |
| `isRelation()` / `isEmbeddedObject()` | ✅ | ✅ | ✅ | Done |
| `isOwnershipRelation()` / `isReferenceRelation()` | ✅ | ✅ | ✅ | Done |
| `shouldDeleteOnOrphan()` | ✅ | ✅ | ✅ | Done |
| `getTargetClasses()` / `getPrimaryTargetClass()` | ✅ | ✅ | ✅ | Done |
| `normalizeClassIds()` | ✅ | ✅ | ✅ | Done |

---

## 10. AtomStorage — Client Storage Adapter

> **feat:client_atomstorage** — system / storage / scope: client

| Method / Property | @es-client | Admin | Status |
|---|:-:|:-:|--------|
| `url`, `type` fields | ✅ | ✅ | Done |
| `setAuth()`, `clearAuth()`, `restoreAuth()` | ✅ | ✅ | Done |
| `refreshAuth()` async | ✅ | ✅ | Done |
| `_syncRefreshAuth()` sync XHR | ✅ | ✅ | Done |
| `getToken()`, `authUrl`, `onAuthRequired` | ✅ | ✅ | Done |
| `type: 'composite'` + read[] + write | ✅ | partial | Admin: wire up config |
| `type: 'seed'` read-only | ✅ | ✅ | Done |
| `type: 'api'` async fetch | ✅ | ✅ | Done |
| `setObject(obj)` via storage | ✅ | ✅ | Done |
| `getObject(id)` via storage | ✅ | ✅ | Done |
| `delObject(id)` via storage | ✅ | ✅ | Done |
| `fetchList(classId)` | ✅ | ✅ | Done |
| `_resolveCrudProvider()` / `_buildCrudUrl()` | ✅ | ✅ | Done |
| `_getAuthHeaders()` | ✅ | ✅ | Done |

---

## 11. AtomCollection — Reactive Array

> **feat:client_atomcollection** — core / object / scope: client

| Method / Property | @es-client | Admin | Status |
|---|:-:|:-:|--------|
| `get(key)`, `getById(id)` | ✅ | ✅ | Done |
| `find(filter)` | ✅ | ✅ | Done |
| `forEach(fn)`, `map(fn)` | ✅ | ✅ | Done |
| `add(obj)` | ✅ | ✅ | Done |
| `remove(key)`, `removeById(id)` | ✅ | ✅ | Done |
| `setItemIndex(item, newIndex)` | ✅ | ✅ | Done |
| `save()` | ✅ | ✅ | Done |
| `onAdd(fn)`, `onRemove(fn)` | ✅ | ✅ | Done |
| `length`, `toJSON()` | ✅ | ✅ | Done |
| Proxy index access `collection[0]` | ✅ | ✅ | Done |
| `[Symbol.iterator]` for…of | ✅ | ✅ | Done |
| `snapshot()` safe array copy | ✅ | ✅ | Done |

---

## 12. ElementStore — Client Store

> **feat:client_elementstore** — core / object / scope: client

| Method / Property | @es-client | Admin | Status |
|---|:-:|:-:|--------|
| `seed(data)` | ✅ | ✅ | Done |
| `setObject(obj)` create+persist | ✅ | ✅ | Done |
| `getObject(id, classId)` | ✅ | ✅ | Done |
| `getClass(classId)` | ✅ | ✅ | Done |
| `findPropDef(classId, key)` | ✅ | ✅ | Done |
| `collectClassProps(classId)` | ✅ | ✅ | Done |
| `resolveConstructor(classId)` | ✅ | ✅ | Done |
| `find(filter)` with $in | ✅ | ✅ | Done |
| `applyRemote(raw)` merge | ✅ | ✅ | Done |
| `saveDirty()` | ✅ | ✅ | Done |
| `fetchRemote(id, classId)` | ✅ | ✅ | Done |
| `saveRemote(obj, storage)` | ✅ | ✅ | Done |
| `_resolveStorage(classId)` | ✅ | ✅ | Done |
| `setToken(token)` | ✅ | ✅ | Done |
| `.objects` registry | ✅ | ✅ | Done |
| `.storage` default | ✅ | ✅ | Done |
| `add(raw)` local only | ✅ | ✅ | Done |
| `removeObject(id)` | ✅ | ✅ | Done |
| `getElementsByClass(classId)` +subclasses | ✅ | ✅ | Done |
| `getElementsByOwner(ownerId)` | ✅ | ✅ | Done |
| `subscribe(cb): unsubscribe` | ✅ | ✅ | Done |
| `getResolvedDefaults(classId)` | ✅ | ✅ | Done |
| `getInheritanceChain(classId)` | ✅ | ✅ | Done |
| `classExtends(classId, baseId)` | ✅ | ✅ | Done |
| `_version` monotonic counter | ✅ | ✅ | Done |
| `getClassSafe(classId)` null-safe | ✅ | ✅ | Done |

---

## 13. ActionExecutor — Client Dispatcher

> **feat:client_actionexecutor** — integration / actions / scope: client

| Method | Server PHP | @es-client | Admin | Status |
|--------|:-:|:-:|:-:|--------|
| `execute(action, params, context)` | ✅ | ✅ | ✅ | Done |
| `executeApi()` — HTTP call | ✅ cURL | ✅ fetch | ✅ | Done |
| `executeFunction()` — registry dispatch | ✅ | ✅ | ✅ | Done |
| `executeEvent()` — event bus | ✅ | ✅ | ✅ | Done |
| `executeComposite()` — chain | ✅ | ✅ | ✅ | Done |
| `buildUrl()` — {placeholder} substitution | ✅ | ✅ | ✅ | Done |
| `applyReverseMapping()` | ✅ | ✅ | ✅ | Done |
| `updateLinks()` — _links management | ✅ | ✅ | ✅ | Done |

---

## 14. Client Support Modules

> **feat:client_modules** — system / modules / scope: client

| Module | @es-client | Admin | Status |
|--------|:-:|:-:|--------|
| ClassRegistry (constructor map) | ✅ | ✅ | Done |
| FunctionRegistry (named fn lookup) | ✅ | ✅ | Done |
| GenesisConverter (nested→flat) | ✅ | ✅ | Done |
| ElementStoreClient (async HTTP) | ✅ | ✅ | Done |
| BroadcastService (WebSocket) | ✅ | ✅ | Done |
| React hooks (useAtomObj, useAtomObjs, useStoreFind, ...) | ✅ | — | ES-client only |
| useWidgetBinding | ✅ | — | ES-client only |

---

## 15. Server PHP — Unique Features

These exist only on the server and don't need client parity:

| Feature | Description |
|---------|-------------|
| `ClassModel` | Main orchestration: boot, security context, ownership enforcement |
| `IStorageProvider` | Storage abstraction (Json, Mongo, CouchDB providers) |
| `ClassMeta` | Class metadata caching and inheritance resolution |
| `Prop` class | Property definition with typed fields and helper methods |
| `EntityObj` | Audit fields (created_at, updated_at, created_by, updated_by) |
| `StorageException` | Storage-layer error handling |
| `SystemClasses` | Programmatic system class + editor definitions |
| `renameProp()` / `renameClass()` | Bulk schema migration operations |
| `auto_create_class` / `auto_add_prop` | Development convenience flags |
| `enforceOwnership` / `allowCustomIds` | Security configuration |
| Multi-tenancy via `owner_id`, `app_id`, `domain` | Server-side enforcement |

---

## 16. CLI (es-cli.sh) — Commands

| Command | Description | Status |
|---------|-------------|--------|
| `set` / `setObject` / `upsert` | Create/update objects | ✅ |
| `get` / `getObject` | Fetch single object | ✅ |
| `list` / `query` | List with filters and pagination | ✅ |
| `find` | Search by ID across all classes | ✅ |
| `push` | Bulk import with genesis support | ✅ |
| `pull` | Bulk export to files | ✅ |
| `classes` | List all class IDs | ✅ |
| `health` | Connectivity check | ✅ |

---

## 17. Seed Data Parity

| Seed entry | Server SystemClasses.php | editors.seed.json | Admin seed-data.js | @es-client | Status |
|---|:-:|:-:|:-:|:-:|--------|
| `@class` meta + 10 props | ✅ | — | ✅ | ✅ | Done |
| `@prop` meta + 21 props | ✅ | — | ✅ | ✅ | Done |
| `@storage` meta + 8 props | ✅ | — | ✅ | ✅ | Done |
| `@editor` meta + 9 props | ✅ | — | ✅ | ✅ | Done |
| `@action` meta + 25 props | ✅ | — | ✅ | ✅ | Done |
| `@event` meta + 8 props | ✅ | — | ✅ | ✅ | Done |
| `@function` meta + 7 props | ✅ | — | ✅ | ✅ | Done |
| `@provider` meta + 9 props | ✅ | — | ✅ | ✅ | Done |
| `crud_provider` meta + 7 props | ✅ | — | ✅ | ✅ | Done |
| 30 @editor instances | — | ✅ | ✅ | ❌ | @es-client: load from genesis |
| `@storage:local` instance | — | — | ✅ | ✅ | Done |

---

## Gap Summary (Updated 2026-03-09)

> Status verified by code audit of `packages/es-client/src/` and live registry queries.
> Query: `bash util/es-cli.sh list --class es:app_feature --filter application_id=<id> --url $ES_URL`

### Feature × Client Matrix (from live registry)

| Feature | Server PHP | @es-client | Admin |
|---------|:----------:|:----------:|:-----:|
| `feat:action_execution` | ✅ | ✅ | ✅ |
| `feat:auth_integration` | ✅ | ✅ | ✅ |
| `feat:batch_operations` | ✅ | ✅ | ✅ |
| `feat:class_crud` | ✅ | ✅ | ✅ |
| `feat:class_props` | ✅ | ✅ | ✅ |
| `feat:client_actionexecutor` | ✅ | ✅ | ✅ |
| `feat:client_atomcollection` | ❌ | ✅ | ✅ |
| `feat:client_atomobj` | ⚠️ partial | ✅ | ✅ |
| `feat:client_atomprop` | ✅ | ✅ | ✅ |
| `feat:client_atomstorage` | ⚠️ partial | ✅ | ✅ |
| `feat:client_elementstore` | ⚠️ partial | ✅ | ✅ |
| `feat:client_modules` | ⚠️ partial | ✅ | ✅ |
| `feat:client_proxy_storage` | ❌ | ✅ | ⚠️ partial |
| `feat:data_types` | ✅ | ✅ | ✅ |
| `feat:event_system` | ⚠️ partial | ✅ | ⚠️ partial |
| `feat:export_snapshots` | ✅ | — | ✅ |
| `feat:filter_by` | ✅ | ✅ | ❌ |
| `feat:find_cross_class` | ✅ | ✅ | ✅ |
| `feat:genesis_loading` | ✅ | ✅ | ✅ |
| `feat:health_check` | ✅ | ✅ | ✅ |
| `feat:object_crud` | ✅ | ✅ | ✅ |
| `feat:provider_integration` | ✅ | ✅ | ⚠️ partial |
| `feat:query_pagination` | ✅ | ✅ | ✅ |
| `feat:set_with_relation` | ⚠️ partial | ✅ | ✅ |
| `feat:storage_backends` | ✅ | ✅ | ✅ |

### Remaining Gaps to Action

| Gap | Client | Priority |
|-----|--------|----------|
| `feat:filter_by` — picker UI in `fields.js` ignores `options.filter_by` | Admin | **P1** |
| `feat:event_system` — EventBus not wired in Admin | Admin | P2 |
| `feat:provider_integration` — partial Admin wiring | Admin | P2 |
| `feat:client_proxy_storage` — ProxyStorage not wired as AtomStorage type | @es-client, Admin | P2 |
| `feat:set_with_relation` — PHP server cascade incomplete | Server | P2 |
| 30 @editor instances missing from @es-client seed | @es-client | P3 |
| `email`, `url`, `phone`, `nested`, `function-picker` editors | Admin + Server | P3 |
