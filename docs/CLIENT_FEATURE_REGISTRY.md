# ElementStore — Client Feature Registry

> **Canonical spec** — all clients must comply with every ✅ row.
> Updated: 2026-02-26

## Clients

| Short | Full name | Language | Location |
|-------|-----------|----------|----------|
| **Server** | elementStore PHP | PHP 7.4+ | `elementStore/src/` |
| **Admin** | element-store.js | JavaScript | `elementStore/admin/element-store.js` |
| **CWM-FE** | cwm-architect frontend | TypeScript | `cwm-architect/src/lib/elementStore/` |
| **CWM-BE** | cwm-architect backend | TypeScript | `cwm-architect/backend/src/services/elementStore/` |
| **Auth** | auth-service backend | TypeScript | `auth-service/backend/src/services/elementStore/` |
| **CLI** | es-cli.sh | Bash | `elementStore/util/es-cli.sh` |

---

## 1. Data Types

| Type | Canonical | Server | Admin (es.js) | CWM-FE | CWM-BE | Auth | Status |
|------|:---------:|:------:|:-------------:|:------:|:------:|:----:|--------|
| `string` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Done |
| `boolean` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Done |
| `integer` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Done |
| `float` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Done |
| `datetime` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Done |
| `object` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Done |
| `relation` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Done |
| `function` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Done |

> `datetime` is canonical for date-only, time-only, and full datetime. The **editor type** (date/time/datetime picker) controls display granularity.

---

## 2. System Classes (@-prefixed)

| Class ID | Description | Server genesis | Server PHP | Admin (es.js) | CWM-FE | Status |
|----------|-------------|:-:|:-:|:-:|:-:|--------|
| `@class` | Class definition (schema of schemas) | ✅ | ✅ | ✅ | ✅ | Done |
| `@prop` | Property definition (field schema) | ✅ | ✅ | ✅ | ✅ | Done |
| `@storage` | Storage provider config | ✅ | ✅ | ✅ | ✅ | Done |
| `@editor` | UI editor component definition | ✅ | ✅ | ✅ | ❌ | CWM-FE: add to seedData |
| `@action` | Universal execution unit (api/fn/event/composite) | ✅ | ✅ | ❌ | ✅ | Admin: add to seedData |
| `@event` | Event handler definition | ✅ | ✅ | ❌ | ❌ | Admin+CWM: add to seedData |
| `@function` | Reusable function (validator/transformer/computed) | ✅ | ✅ | ❌ | ❌ | Admin+CWM: add to seedData |
| `@provider` | External API provider (abstract) | ✅ | ✅ | ❌ | ❌ | Admin+CWM: add to seedData |
| `crud_provider` | CRUD REST provider (extends @provider) | ✅ | ❌ | ❌ | ❌ | Server PHP: add; clients: add |
| `auth_config` | Auth-service connection config | ✅ | ✅ | ❌ | ❌ | ✅ (auth) | — |
| `auth_app` | App registration credentials | ✅ | ✅ | ❌ | ❌ | ✅ (auth) | — |
| `auth_machine` | Machine/instance registration | ✅ | ✅ | ❌ | ❌ | ✅ (auth) | — |

---

## 3. Storage Types

| Type | Description | Server genesis | Server PHP | Admin (es.js) | CWM-FE | Status |
|------|-------------|:-:|:-:|:-:|:-:|--------|
| `local` | Browser localStorage | ✅ | — | ✅ | ✅ | Done |
| `rest` | ElementStore REST API | ✅ | ✅ | ✅ | ❌ | CWM: add as alias for api |
| `api` | External API via @provider | ✅ | ❌ | ❌ | ✅ | Server+Admin: add |
| `seed` | Read-only genesis data | ✅ | ❌ | ❌ | ✅ | Server+Admin: add |
| `composite` | Multi-source with strategies | ✅ | ❌ | ❌ | ✅ | Server+Admin: add |
| `couchdb` | CouchDB backend | ✅ | ✅ | — | — | Server-only |
| `mysql` | MySQL backend | ✅ | ✅ | — | — | Server-only |
| `json` | File-based JSON | ✅ | ✅ | — | — | Server-only |

### Composite Storage Fields

| Field | Description | Server genesis | CWM-FE | Admin | Status |
|-------|-------------|:-:|:-:|:-:|--------|
| `provider_id` | Link to @provider instance | ✅ | ✅ | ❌ | Admin: add |
| `read[]` | Ordered storage IDs to read from | ✅ | ✅ | ❌ | Admin: add |
| `write` | Storage ID to write to | ✅ | ✅ | ❌ | Admin: add |
| `read_strategy` | fallback / merge | ✅ | ✅ | ❌ | Admin: add |
| `write_strategy` | sequential / parallel / best_effort | ✅ | ✅ | ❌ | Admin: add |

---

## 4. Editor Names

| Editor ID | Data Types | Server seed | Admin (es.js) | CWM-FE | Status |
|-----------|-----------|:-:|:-:|:-:|--------|
| `text` | string | ✅ | ✅ | ✅ | Done |
| `textarea` | string, function | ✅ | ✅ | ✅ | Done |
| `code` | string, function | ✅ | ✅ | ✅ | Done |
| `password` | string | ✅ | ✅ | ✅ | Done |
| `email` | string | ✅ | ✅ | ❌ | CWM: add |
| `url` | string | ✅ | ✅ | ❌ | CWM: add |
| `phone` | string | ✅ | ✅ | ❌ | CWM: add |
| `richtext` | string | ✅ | ✅ | ✅ | Done |
| `autocomplete` | string, relation | ✅ | ✅ | ✅ | Done |
| `javascript` | function | ✅ | ✅ | ❌ | CWM: add |
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
| `nested` | object | ✅ | ✅ | ❌ | CWM: add |
| `keyvalue` | object | ✅ | ✅ | ✅ | Done |
| `json` | object, string | ✅ | ✅ | ✅ | Done |
| `reference` | relation | ✅ | ✅ | ✅ | Done |
| `references` | relation | ✅ | ✅ | ✅ | Done |
| `color` | string | ✅ | ✅ | ✅ | Done |
| `file` | string | ✅ | ✅ | ✅ | Done |
| `image` | string | ✅ | ✅ | ✅ | Done |
| `function-picker` | function | ❌ | ❌ | ✅ | Server: add to seed |

---

## 5. @action Type System

| Action type | Description | Server PHP | CWM-FE TS | Admin (es.js) | Status |
|-------------|-------------|:-:|:-:|:-:|--------|
| `api` | HTTP call to external provider | ✅ | ✅ | ❌ | Admin: add ActionExecutor |
| `function` | FunctionRegistry dispatch | ✅ | ✅ | ❌ | Admin: add |
| `event` | EventBus event emit | ✅ | ✅ | ❌ | Admin: add |
| `composite` | Chain of sub-actions | ✅ | ✅ | ❌ | Admin: add |
| `ui` | JS handler (client-only) | no-op | no-op | ❌ | Admin: add |

### @action Fields

| Field | Type | Group | Description |
|-------|------|-------|-------------|
| `name` | string | Core | Display name |
| `type` | string | Core | api / function / event / composite / ui |
| `group_name` | string | Core | Category for UI grouping |
| `params` | @prop[] | Core | Input parameters schema |
| `returns` | string | Core | object / list / void |
| `method` | string | API | GET / POST / PUT / PATCH / DELETE |
| `endpoint` | string | API | URL path (supports `{id}` substitution) |
| `headers` | object | API | Additional HTTP headers |
| `mapping` | object | API | API field → ES field mapping |
| `function` | string | Function | FunctionRegistry key |
| `event` | string | Event | EventBus event name |
| `payload` | object | Event | param → event_field mapping |
| `actions` | @action[] | Composite | Ordered sub-action IDs |
| `strategy` | string | Composite | sequential / parallel |
| `handler` | function | UI | JS handler code |
| `target_class_id` | @class | UI | Class this action applies to |
| `requires_selection` | boolean | UI | Needs selected object(s) |
| `bulk` | boolean | UI | Can apply to multiple objects |
| `confirm` | string | UI | Confirmation message |
| `icon` | string | UI | Icon name |

---

## 6. @provider System

| Field | Description | Server genesis | CWM-FE | Admin | Status |
|-------|-------------|:-:|:-:|:-:|--------|
| `name` | Provider display name | ✅ | ✅ | ❌ | Admin: add |
| `base_url` | Base URL (inherited via extends_id) | ✅ | ✅ | ❌ | Admin: add |
| `auth` | Auth config {type, token, ...} | ✅ | ✅ | ❌ | Admin: add |
| `id_field` | API field holding external ID | ✅ | ✅ | ❌ | Admin: add |
| `write_mode` | crud / actions_only | ✅ | ✅ | ❌ | Admin: add |
| `mapping` | Default field mapping | ✅ | ✅ | ❌ | Admin: add |
| `actions` | Available @action IDs | ✅ | ✅ | ❌ | Admin: add |
| `params` | Default query parameters | ✅ | ✅ | ❌ | Admin: add |

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

## 7. AtomObj — Method Parity

| Method / Property | Server PHP | Admin (es.js) | CWM-FE TS | Status |
|---|:-:|:-:|:-:|--------|
| `constructor(classId, data)` | ✅ | ✅ | ✅ | Done |
| Proxy GET (data, methods, internals) | — | ✅ | ✅ | Done |
| Proxy SET (coercion, dirty, onChange) | — | ✅ | ✅ | Done |
| `data` (raw field store) | ✅ | ✅ | ✅ | Done |
| `_snapshot` (change tracking) | — | ✅ | ✅ | Done |
| `_id` (local ID) | — | ✅ | ✅ | Done |
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
| `update(updates)` batch setter | — | ❌ | ✅ | Admin: add |
| `delete()` soft delete | — | ❌ | ✅ | Admin: add |
| `subscribe(cb): unsubscribe` | — | ❌ | ✅ | Admin: add |
| `extendsFrom(ancestorId)` | — | ❌ | ✅ | Admin: add |
| `getInheritanceChain()` | — | ❌ | ✅ | Admin: add |
| `getClassDefaults()` | — | ❌ | ✅ | Admin: add |

---

## 8. AtomProp — Method Parity

| Method / Property | Server PHP | Admin (es.js) | CWM-FE TS | Status |
|---|:-:|:-:|:-:|--------|
| `getPropValue()` type coercion | ✅ | ✅ | ✅ | Done |
| `setPropValue()` type validation | ✅ | ✅ | ✅ | Done |
| Computed `order_id` (index in parent) | — | ✅ | ✅ | Done |
| Static ID array → object resolution | — | ✅ | ✅ | Done |
| Dynamic relation (query by owner_id) | — | ❌ | ✅ | Admin: add |
| All prop fields as class properties | ✅ | ✅ | ✅ | Done |
| `isRelation()` / `isEmbeddedObject()` | ✅ | ❌ | ❌ | Admin+CWM: add |
| `isOwnershipRelation()` / `isReferenceRelation()` | ✅ | ❌ | ❌ | Admin+CWM: add |
| `shouldDeleteOnOrphan()` | ✅ | ❌ | ❌ | Admin+CWM: add |
| `getTargetClasses()` / `getPrimaryTargetClass()` | ✅ | ❌ | ❌ | Admin+CWM: add |
| `normalizeClassIds()` | ✅ | ✅ | ✅ | Done |

---

## 9. AtomStorage — Method Parity

| Method / Property | Admin (es.js) | CWM-FE TS | Status |
|---|:-:|:-:|--------|
| `url`, `type` fields | ✅ | ✅ | Done |
| `setAuth()`, `clearAuth()`, `restoreAuth()` | ✅ | ✅ | Done |
| `refreshAuth()` async | ✅ | ✅ | Done |
| `_syncRefreshAuth()` sync XHR | ✅ | ✅ | Done |
| `getToken()`, `authUrl`, `onAuthRequired` | ✅ | ✅ | Done |
| `type: 'composite'` + read[] + write | ❌ | ✅ | Admin: add |
| `type: 'seed'` read-only | ❌ | ✅ | Admin: add |
| `type: 'api'` async fetch | ❌ | ✅ | Admin: add |
| `setObject(obj)` via storage | ❌ | ✅ | Admin: add |
| `getObject(id)` via storage | ❌ | ✅ | Admin: add |
| `delObject(id)` via storage | ❌ | ✅ | Admin: add |
| `fetchList(classId)` | ❌ | ✅ | Admin: add |
| `_resolveCrudProvider()` / `_buildCrudUrl()` | ❌ | ✅ | Admin: add |
| `_getAuthHeaders()` | ❌ | ✅ | Admin: add |

---

## 10. AtomCollection — Method Parity

| Method / Property | Admin (es.js) | CWM-FE TS | Status |
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
| Proxy index access `collection[0]` | ❌ | ✅ | Admin: add |
| `[Symbol.iterator]` for…of | ❌ | ✅ | Admin: add |
| `snapshot()` safe array copy | ❌ | ✅ | Admin: add |

---

## 11. ElementStore — Method Parity

| Method / Property | Admin (es.js) | CWM-FE TS | Status |
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
| `add(raw)` local only | ❌ | ✅ | Admin: add |
| `seedInstance(raw)` read-only | ❌ | ✅ | Admin: add |
| `upsertObject(raw)` | ❌ | ✅ | Admin: add |
| `removeObject(id)` | ❌ | ✅ | Admin: add |
| `getElementsByClass(classId)` +subclasses | ❌ | ✅ | Admin: add |
| `getElementsByOwner(ownerId)` | ❌ | ✅ | Admin: add |
| `getInstances()` / `getClasses()` | ❌ | ✅ | Admin: add |
| `fetchObjects(classId)` | ❌ | ✅ | Admin: add |
| `subscribe(cb): unsubscribe` | ❌ | ✅ | Admin: add |
| `getResolvedDefaults(classId)` | ❌ | ✅ | Admin: add |
| `getInheritanceChain(classId)` | ❌ | ✅ | Admin: add |
| `classExtends(classId, baseId)` | ❌ | ✅ | Admin: add |
| `_version` monotonic counter | ❌ | ✅ | Admin: add |
| `getClassSafe(classId)` null-safe | ❌ | ✅ | Admin: add |

---

## 12. ActionExecutor — Method Parity

| Method | Server PHP | CWM-FE TS | Admin (es.js) | Status |
|--------|:-:|:-:|:-:|--------|
| `execute(action, params, context)` | ✅ | ✅ | ❌ | Admin: add |
| `executeApi()` — HTTP call | ✅ cURL | ✅ fetch | ❌ | Admin: add |
| `executeFunction()` — registry dispatch | ✅ | ✅ | ❌ | Admin: add |
| `executeEvent()` — event bus | ✅ | ✅ | ❌ | Admin: add |
| `executeComposite()` — chain | ✅ | ✅ | ❌ | Admin: add |
| `buildUrl()` — {placeholder} substitution | ✅ | ✅ | ❌ | Admin: add |
| `applyReverseMapping()` | ✅ | ✅ | ❌ | Admin: add |
| `updateLinks()` — _links management | ✅ | ✅ | ❌ | Admin: add |

---

## 13. Additional Modules

| Module | Server PHP | Admin (es.js) | CWM-FE TS | Status |
|--------|:-:|:-:|:-:|--------|
| ClassRegistry (constructor map) | — | ✅ inline | ✅ separate file | Admin: extract to module |
| FunctionRegistry (named fn lookup) | — | ❌ | ✅ | Admin: add |
| GenesisConverter (nested→flat) | — | ❌ | ✅ | Admin: add |
| ActionExecutor | ✅ | ❌ | ✅ | Admin: add |
| BroadcastService (WebSocket) | ✅ | ✅ | ❌ | CWM: add if needed |
| AuthService (JWT/JWKS) | ✅ | ✅ | — | — |
| ElementStoreClient (async HTTP) | — | ❌ | ✅ | Admin: add |
| React hooks (useAtomObj, etc.) | — | — | ✅ | Framework-specific |
| useWidgetBinding | — | — | ✅ | Framework-specific |

---

## 14. Server PHP — Unique Features

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

## 15. CLI (es-cli.sh) — Commands

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

## 16. Seed Data Parity

| Seed entry | Server SystemClasses.php | editors.seed.json | Admin seedData | CWM seedData.ts | Status |
|---|:-:|:-:|:-:|:-:|--------|
| `@class` meta + 10 props | ✅ | — | ✅ | ✅ | Done |
| `@prop` meta + 20 props | ✅ | — | ✅ | ✅ | Done |
| `@storage` meta + 8 props | ✅ | — | ✅ | ✅ | Done |
| `@editor` meta + 7 props | ✅ | — | ✅ | ❌ | CWM: add |
| `@action` meta + 22 props | ✅ | — | ❌ | ❌ | Admin+CWM: add |
| `@event` meta + 8 props | ✅ | — | ❌ | ❌ | Admin+CWM: add |
| `@function` meta + 7 props | ✅ | — | ❌ | ❌ | Admin+CWM: add |
| `@provider` meta + 9 props | ✅ | — | ❌ | ❌ | Admin+CWM: add |
| 30 @editor instances | — | ✅ | ✅ | ❌ | CWM: load from genesis |
| `@storage:local` instance | — | — | ✅ | ✅ | Done |
| `@storage:api` instance | — | — | ❌ | ✅ | Admin: add |
| `@storage:seed` instance | — | — | ❌ | ✅ | Admin: add |

---

## Gap Summary (Verified 2026-02-26)

> Audited against actual source code, not assumptions.

### Server PHP — SystemClasses.php vs system.genesis.json (ALIGNED 2026-02-26)

**Constants:** ✅
- [x] `K_PROVIDER = '@provider'` added to Constants.php
- [x] `K_CRUD_PROVIDER = 'crud_provider'` added to Constants.php

**Class definitions:** ✅
- [x] `getFunctionClassDefinition()` — 7 props, matches genesis
- [x] `getProviderClassDefinition()` — 9 props, is_abstract=true, matches genesis
- [x] `getCrudProviderClassDefinition()` — 7 props, extends_id=@provider, matches genesis
- [ ] `getSeedFunctions()` — 13 system functions from functions.seed.json (deferred)

**Prop alignment:** ✅ All match genesis exactly
- [x] `@class`: 10 props (added is_abstract, providers, _links)
- [x] `@prop`: 21 props (reordered by group, added editor relation, validators, aligned display_order)
- [x] `@action`: 21 props (full rebuild: core + API + function + event + composite + UI groups)
- [x] `@event`: 8 props (expanded from 3: added description, target_class_id, trigger, handler, async, priority)
- [x] `@storage`: 8 props (added provider_id, read, write, read_strategy, write_strategy; expanded type options)
- [x] `@editor`: 9 props (added is_system, validator, component, render)
- [x] `@function`: 7 props (new)
- [x] `@provider`: 9 props (new, abstract)
- [x] `crud_provider`: 7 props (new, extends @provider)

**Remaining:**
- [ ] `getSeedFunctions()` — seed validator/transformer functions (not blocking)
- [x] Editor ID: `richtext` matches in both PHP and genesis (no mismatch)

> Note: auth_config, auth_app, auth_machine class definitions exist only in genesis — PHP creates them via AuthService bootstrap, not SystemClasses. This is by design.

---

### Admin (element-store.js) — ALIGNED 2026-02-26 (22 of 38 done)

**AtomObj (6 methods) — ✅ DONE:**
- [x] `update(updates)` — batch setter
- [ ] `delete()` — soft delete (deferred: needs server DELETE endpoint)
- [x] `subscribe(cb): unsubscribe` — reactive subscription
- [x] `extendsFrom(classId)` — check inheritance
- [x] `getInheritanceChain()` — walk extends_id
- [x] `getClassDefaults()` — merged defaults from ancestors

**AtomProp (8 helper methods) — ✅ DONE:**
- [x] `isRelation()` — data_type === 'relation' check
- [x] `isEmbeddedObject()` — data_type === 'object' + target classes
- [x] `isOwnershipRelation()` — single relation + cascade
- [x] `isReferenceRelation()` — array relation, many-to-many
- [x] `hasTargetClasses()` — check if target classes defined
- [x] `getTargetClasses()` — return object_class_id array
- [x] `getPrimaryTargetClass()` — first target class
- [x] `shouldDeleteOnOrphan()` — on_orphan === 'delete'

**AtomStorage (7 missing — only has auth management, no storage ops):**
- [ ] `setObject(obj)` — persist via storage type
- [ ] `getObject(id)` — load from storage type
- [ ] `delObject(id)` — delete via storage type
- [ ] `fetchList(classId)` — bulk fetch
- [ ] `type: 'composite'` support (read[]/write/strategies)
- [ ] `type: 'seed'` support (read-only fallback)
- [ ] `type: 'api'` / `type: 'crud'` support (provider routing)

**AtomCollection (3 methods) — ✅ DONE:**
- [ ] Proxy index access `collection[0]` (deferred: complex, low priority)
- [x] `[Symbol.iterator]` for `for...of`
- [x] `snapshot()` — safe array copy

**ElementStore (13 methods) — 9 DONE:**
- [ ] `add(raw)` — local only, no remote (existing setObject works)
- [ ] `seedInstance(raw)` — read-only seed (deferred)
- [ ] `upsertObject(raw)` — create or update (applyRemote handles this)
- [x] `removeObject(id)` — delete from registry
- [x] `getElementsByClass(classId)` — with subclass inclusion
- [x] `getElementsByOwner(ownerId)` — by owner_id
- [ ] `getInstances()` / `getClasses()` — bulk access (deferred)
- [x] `subscribe(cb): unsubscribe` — global reactivity
- [x] `getResolvedDefaults(classId)` — merged defaults
- [x] `getInheritanceChain(classId)` — walk extends_id
- [x] `classExtends(classId, baseId)` — check ancestry
- [x] `_version` — monotonic update counter
- [x] `getClassSafe(classId)` — null-safe

**Modules (4 missing):**
- [ ] ActionExecutor — action dispatcher
- [ ] FunctionRegistry — named function lookup
- [ ] GenesisConverter — nested→flat format conversion
- [ ] ElementStoreClient — async HTTP client (current uses sync XHR)

**Seed data — ✅ ALL DONE (aligned to genesis):**
- [x] @action class + 21 props
- [x] @event class + 8 props
- [x] @function class + 7 props
- [x] @provider class + 9 props (abstract)
- [x] crud_provider class + 7 props (extends @provider)
- [x] @class expanded: +is_abstract, +providers, +_links (10 props)
- [x] @prop rewritten: 21 props with groups (Type/Core/Options/Relation/UI/Validation/Security)
- [x] @storage expanded: +api/seed/composite types, +5 composite props (8 props)
- [x] @editor expanded: +is_system, +validator, +component, +render (9 props)

> Note: All XHR calls in element-store.js are synchronous. No async storage support exists. Remaining 16 items are deferred (modules + storage type routing + delete endpoint).

---

### CWM-FE (cwm-architect) — Verified gaps (3 categories, ~12 items)

**EditorType union (5 missing editors):**
- [ ] `email` — email input with validation
- [ ] `url` — URL input with validation
- [ ] `phone` — phone number input
- [ ] `javascript` — JS code editor (default for function type)
- [ ] `nested` — class-driven nested object editor

**seedData.ts (5 missing system class definitions):**
- [ ] `@editor` meta class + prop definitions
- [ ] `@action` meta class + prop definitions
- [ ] `@event` meta class + prop definitions
- [ ] `@function` meta class + prop definitions
- [ ] `@provider` meta class + prop definitions

**AtomProp.ts (5 missing helper methods):**
- [ ] `isRelation()` — shorthand for data_type check
- [ ] `isEmbeddedObject()` — object + target classes check
- [ ] `isOwnershipRelation()` — single relation cascade
- [ ] `getTargetClasses()` — return object_class_id array
- [ ] `shouldDeleteOnOrphan()` — on_orphan check

**Already present (previously listed as gaps — VERIFIED WORKING):**
- [x] DataType union — canonical 8 types, no legacy
- [x] ActionDef, ProviderDef, ProviderAuth interfaces
- [x] ActionExecutor.ts — created this session
- [x] AtomObj: update(), delete(), subscribe(), extendsFrom(), getInheritanceChain()
- [x] AtomStorage: setObject(), getObject(), delObject(), fetchList(), all 5 storage types
- [x] ElementStore: getElementsByClass(), getElementsByOwner(), classExtends(), getClassSafe(), _version, subscribe()
- [x] AtomCollection: Proxy index access (partial), iteration support

---

### CWM-BE + Auth (types only):
- [x] ActionDef, ProviderDef, ProviderAuth types — synced this session

---

## Test Checklist

Tests to validate each feature via `es-cli.sh test`. Each test is a CLI operation against a running ElementStore instance.

### T1. Health & Connectivity

| # | Test | Command | Expected |
|---|------|---------|----------|
| T1.1 | Health endpoint responds | `es health` | HTTP 200, JSON with `ok: true` |
| T1.2 | Invalid URL fails gracefully | `es health --url http://localhost:1` | Non-zero exit, error message |
| T1.3 | Classes list returns system classes | `es classes` | Output contains `@class`, `@prop`, `@storage`, `@editor`, `@action`, `@event`, `@function`, `@provider` |

### T2. Data Types

| # | Test | Command | Expected |
|---|------|---------|----------|
| T2.1 | Create object with string prop | `es set --data '{"id":"t-str","class_id":"test_types","name":"hello"}'` | 200/201 |
| T2.2 | Create object with integer prop | `es set --data '{"id":"t-int","class_id":"test_types","count":42}'` | Stored as integer, not string |
| T2.3 | Create object with float prop | `es set --data '{"id":"t-flt","class_id":"test_types","price":9.99}'` | Stored as float |
| T2.4 | Create object with boolean prop | `es set --data '{"id":"t-bool","class_id":"test_types","active":true}'` | Stored as boolean |
| T2.5 | Create object with datetime prop | `es set --data '{"id":"t-dt","class_id":"test_types","created":"2026-01-01T00:00:00Z"}'` | Stored as string/datetime |
| T2.6 | Create object with object prop | `es set --data '{"id":"t-obj","class_id":"test_types","meta":{"key":"val"}}'` | Nested object preserved |
| T2.7 | Create object with relation prop | `es set --data '{"id":"t-rel","class_id":"test_types","parent_id":"t-str"}'` | Relation ID stored |
| T2.8 | Create object with array prop | `es set --data '{"id":"t-arr","class_id":"test_types","tags":["a","b","c"]}'` | Array preserved |

### T3. CRUD Operations

| # | Test | Command | Expected |
|---|------|---------|----------|
| T3.1 | Create object (POST) | `es set --class test_class --data '{"id":"crud-1","class_id":"test_class","name":"Test"}'` | 200/201 |
| T3.2 | Read object back (GET) | `es get --class test_class --id crud-1` | Returns object with `name=Test` |
| T3.3 | Update object (PUT) | `es set --data '{"id":"crud-1","class_id":"test_class","name":"Updated"}'` | 200, name changed |
| T3.4 | Read updated object | `es get --class test_class --id crud-1` | `name=Updated` |
| T3.5 | List objects of class | `es list --class test_class` | Array containing crud-1 |
| T3.6 | List with filter | `es list --class test_class --filter name=Updated` | Only matching objects |
| T3.7 | List with limit | `es list --class test_class --limit 1` | Array of length 1 |
| T3.8 | List with sort | `es list --class test_class --sort name --order asc` | Alphabetically sorted |
| T3.9 | Find by ID (cross-class) | `es find --id crud-1` | Returns object regardless of class |

### T4. Class System

| # | Test | Command | Expected |
|---|------|---------|----------|
| T4.1 | System classes exist | `es classes` | All 8 system classes present |
| T4.2 | @class has required props | `es get --class @class --id @class` | Has name, extends_id, props, _links |
| T4.3 | @prop has canonical data_type options | `es get --class @class --id @prop` | data_type prop has 8 canonical values |
| T4.4 | @storage has expanded type options | `es get --class @class --id @storage` | type values include local, rest, api, seed, composite |
| T4.5 | @action has type prop with 5 values | `es get --class @class --id @action` | type: api, function, event, composite, ui |
| T4.6 | @provider has id_field, write_mode | `es get --class @class --id @provider` | Props include id_field, write_mode, mapping, actions |
| T4.7 | crud_provider extends @provider | `es get --class @class --id crud_provider` | extends_id = @provider |
| T4.8 | Create custom class | `es set --data '{"id":"my_class","class_id":"@class","name":"My Class","props":[...]}'` | 200/201 |
| T4.9 | Custom class props inherited | Create child class with extends_id → verify props merge | Inherited + own props |

### T5. Inheritance

| # | Test | Command | Expected |
|---|------|---------|----------|
| T5.1 | Child class inherits parent props | Create `child` extending `parent` | child.collectClassProps includes parent props |
| T5.2 | Child can override parent prop | Set same key with different options | Child prop wins |
| T5.3 | Deep inheritance (3 levels) | A → B → C | C has props from A + B + C |
| T5.4 | crud_provider inherits @provider | GET crud_provider instance | Has base_url, auth from @provider |

### T6. Genesis Push

| # | Test | Command | Expected |
|---|------|---------|----------|
| T6.1 | Push system.genesis.json | `es push --from genesis/data/system.genesis.json` | All system classes created, PASS count > 0 |
| T6.2 | Push editors.seed.json | `es push --from genesis/data/editors.seed.json` | 30 editor objects created |
| T6.3 | Push functions.seed.json | `es push --from genesis/data/functions.seed.json` | Function objects created |
| T6.4 | Push auth.genesis.json | `es push --from genesis/data/auth.genesis.json` | auth_config, auth_app, auth_machine classes |
| T6.5 | Push with sub-genesis (recursive) | Push genesis with `seed[].storage` pointing to sub-genesis | Sub-genesis classes + data loaded |
| T6.6 | Push is idempotent | Push same genesis twice | No errors, same data |
| T6.7 | Dry-run shows plan | `es push --from genesis/data/system.genesis.json --dry-run` | Shows [dry-run] lines, no actual writes |

### T7. Pull / Export

| # | Test | Command | Expected |
|---|------|---------|----------|
| T7.1 | Pull single class to file | `es pull --class test_class --out /tmp/test.json` | File written with array |
| T7.2 | Pull all classes to directory | `es pull --all --out-dir /tmp/es-pull/` | One file per class |
| T7.3 | Pull round-trip (push → pull → diff) | Push data, pull back, compare | Data matches |

### T8. @action Definitions

| # | Test | Command | Expected |
|---|------|---------|----------|
| T8.1 | Create api-type action | Set @action with type=api, method, endpoint | Stored correctly |
| T8.2 | Create function-type action | Set @action with type=function, function key | Stored correctly |
| T8.3 | Create event-type action | Set @action with type=event, event name, payload | Stored correctly |
| T8.4 | Create composite action | Set @action with type=composite, actions[], strategy | Stored correctly |
| T8.5 | Action params schema stored | Set @action with params array of @prop objects | params array preserved |

### T9. @provider Definitions

| # | Test | Command | Expected |
|---|------|---------|----------|
| T9.1 | Create abstract provider | Set @provider with base_url, auth | Stored correctly |
| T9.2 | Create crud_provider instance | Set crud_provider extending @provider with endpoints | Inherits base_url, has get_one etc. |
| T9.3 | Provider auth object stored | Set @provider with auth={type:bearer, token:xxx} | Auth object preserved |
| T9.4 | Provider write_mode stored | Set @provider with write_mode=actions_only | Stored correctly |
| T9.5 | Provider with actions relation | Set @provider with actions=[action-id-1, action-id-2] | Relation array preserved |

### T10. @storage Expanded Types

| # | Test | Command | Expected |
|---|------|---------|----------|
| T10.1 | Storage type=api with provider_id | Set @storage with type=api, provider_id | Stored correctly |
| T10.2 | Storage type=composite with read/write | Set @storage with read[], write, strategies | All composite fields preserved |
| T10.3 | Storage type=seed (read-only marker) | Set @storage with type=seed | Stored correctly |
| T10.4 | Storage read_strategy options | Set fallback vs merge | Both accepted |
| T10.5 | Storage write_strategy options | Set sequential vs parallel vs best_effort | All three accepted |

### T11. _links System

| # | Test | Command | Expected |
|---|------|---------|----------|
| T11.1 | _links field accepted on objects | Set object with `_links: {storage-1: ext-id}` | Stored on server |
| T11.2 | _links hidden from API (server_only) | GET object via API | _links NOT in response (if server_only enforced) |
| T11.3 | _links survives update | Update object, re-read | _links preserved |

### T12. Validation & Edge Cases

| # | Test | Command | Expected |
|---|------|---------|----------|
| T12.1 | Missing required field rejected | Set @class without name | Error response |
| T12.2 | Readonly field cannot be updated | Update is_system on existing class | Error or ignored |
| T12.3 | Create-only field locked after first save | Update extends_id on existing class | Error or ignored |
| T12.4 | Invalid class_id rejected | Set object with nonexistent class_id | Error (if auto_create_class=false) |
| T12.5 | Custom ID preserved | Set with X-Allow-Custom-Ids header | Object ID matches input |
| T12.6 | Unicode in field values | Set object with unicode name/description | Round-trips correctly |
| T12.7 | Large object (100+ fields) | Set object with many fields | All fields preserved |
| T12.8 | Empty array vs null | Set `tags: []` vs omitting tags | Empty array preserved, not null |

### T13. File Storage (es-cli local)

| # | Test | Command | Expected |
|---|------|---------|----------|
| T13.1 | Write to local JSON file | `es set --data '...' --to ./test.json` | File created with JSON array |
| T13.2 | Read from local JSON file | `es get --class x --id y --from ./test.json` | Object returned |
| T13.3 | Upsert into existing file | Set same ID twice to file | Updated in place, no duplicates |
| T13.4 | List from local file | `es list --class x --from ./test.json` | Filtered results |
| T13.5 | Push file to API | `es push --from ./test.json --to http://...` | Objects created via API |

### T14. Editor Seed Data

| # | Test | Command | Expected |
|---|------|---------|----------|
| T14.1 | All 30 editors exist | `es list --class @editor` | 30 objects |
| T14.2 | Each editor has data_types | Check every editor | data_types array non-empty |
| T14.3 | Default editors per type | Filter is_default=true | One default per data_type |
| T14.4 | Editor IDs match canonical list | Compare against registry | text, textarea, code, ... all present |

### T15. Auth Integration

| # | Test | Command | Expected |
|---|------|---------|----------|
| T15.1 | Token passed in header | `es get --token xxx ...` | Authorization: Bearer xxx sent |
| T15.2 | Request without token (if auth enabled) | `es get ...` without --token | 401 Unauthorized |
| T15.3 | auth_config class exists | `es get --class @class --id auth_config` | Class definition returned |

---

### T16. External Source Fetch (Provider Integration)

> Test a real or mocked external API fetch through @provider → @action → @storage pipeline.

| ID | Test | es-cli check |
|----|------|--------------|
| T16.1 | Configure a @provider with base_url pointing to a test API | `es set @provider test_api ...` |
| T16.2 | Create a @action (type=api) with GET endpoint on that provider | `es set @action fetch_items ...` |
| T16.3 | Create a @storage (type=api, provider_id=test_api) for a class | `es set @storage api_store ...` |
| T16.4 | Execute the action and verify response data maps to ES fields | `es action execute fetch_items` |
| T16.5 | Verify _links are created mapping storage_id → external ID | `es get <class_id> <id> | grep _links` |
| T16.6 | Test composite storage: read from API, write to local | `es set @storage composite_store ...` |
| T16.7 | Test error handling: provider returns 401/404/500 | `es action execute <bad_action>` |
| T16.8 | Test field mapping: API field names differ from ES field names | verify mapped fields |

---

## Notes for Future Design

- **T16 (External Source Fetch)**: Needs a mock API server or a test endpoint to run against. Consider using a lightweight HTTP server (e.g. json-server, or a simple PHP endpoint) that returns predictable data. This is critical for validating the full @provider → @action → @storage pipeline end-to-end.

---

## Test Summary by Priority

| Priority | Tests | What they cover |
|----------|-------|-----------------|
| **P0 — Must pass** | T1, T3, T4.1-T4.7, T6.1 | Basic connectivity, CRUD, system classes, genesis |
| **P1 — Core** | T2, T4.8-T4.9, T5, T6.2-T6.7, T7 | Data types, custom classes, inheritance, genesis push/pull |
| **P2 — New features** | T8, T9, T10, T11, T16 | @action, @provider, composite storage, _links, external fetch |
| **P3 — Edge cases** | T12, T13, T14, T15 | Validation, file storage, editors, auth |
