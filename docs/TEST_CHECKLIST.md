# elementStore Test Checklist

## 1. Storage Pipeline

### 1.1 @init.json Boot
- [ ] Boot from `@init.json` with `type: \"couchdb\"` -- `ClassModel::boot()` creates `StorageProvider` with CouchDB driver, returns a working model
- [ ] Boot from `@init.json` with `type: \"json\"` -- creates `JsonStorageProvider` pointing at `.es/` directory
- [ ] Boot with missing `@init.json` -- defaults to `type: \"json\"` with `dir: \".es\"`
- [ ] Boot with malformed `@init.json` (invalid JSON) -- defaults to JSON storage without crashing
- [ ] Boot saves the `@storage` bootstrap object into the store (`class_id: \"@storage\"`, `id: \"bootstrap\"`) -- object is queryable afterward
- [ ] Environment variable overrides (`COUCHDB_USER`, `COUCHDB_PASSWORD`, `COUCHDB_SERVER`) take precedence over `@init.json` values

### 1.2 CouchDB Driver
- [ ] `getobj(class, id)` on CouchDB returns the document if it exists, `null` if not found
- [ ] `setobj(class, data)` on CouchDB persists the document and returns it with `_rev` populated
- [ ] `delobj(class, id)` on CouchDB removes the document and returns `true`
- [ ] `query(class, filters)` on CouchDB returns matching documents using Mango selectors

### 1.3 JSON Genesis Fallback
- [ ] When CouchDB has no data for a class, `StorageProvider::getobj()` falls through to the JSON provider and returns data from `.es/*.genesis.json` files
- [ ] Fallback result is synced back to CouchDB when `method: \"sync\"` -- subsequent reads hit CouchDB directly
- [ ] When both CouchDB and JSON have data, CouchDB result is preferred (driver first)
- [ ] JSON provider builds an in-memory index on first access by scanning all `*.genesis.json` files
- [ ] Index is cached to `index.es.json` for faster subsequent boots

### 1.4 Sync-Back
- [ ] When `method: \"sync\"`, a genesis fallback result is written back to the primary driver (CouchDB) automatically
- [ ] Sync-back failure is non-critical -- the fallback result is still returned to the caller
- [ ] `setobj()` writes to the primary driver, then best-effort writes to all sub-providers that support `set` for the class

### 1.5 On-Demand Loading
- [ ] A class that has never been accessed loads from genesis files on first `getClass()` call
- [ ] Objects load on-demand without requiring an explicit init/bootstrap step
- [ ] The `init()` method is a no-op -- storage pipeline handles everything on demand

### 1.6 Action-Based Pipeline (supportsAction)
- [ ] `supportsAction(\"@class\", \"get\")` returns `true` when `@class` is listed with `[\"get\"]` in the provider's `classes` map
- [ ] `supportsAction(\"@class\", \"delete\")` returns `false` when `delete` is not in the provider's `classes` action list
- [ ] `supportsAction(\"my:class\", \"set\")` returns `true` when `@class` wildcard is declared (covers all classes)
- [ ] Empty `classes` map means the provider supports everything -- `supportsAction()` returns `true` for any class/action pair

## 2. Object Operations

### 2.1 getObject
- [ ] `getObject(class, id)` returns an `AtomObj` instance with all fields populated
- [ ] `getObject(class, id)` returns `null` when object does not exist (no exception)
- [ ] `getObject` with `castOnRead: true` normalizes arrays, casts types, and fills defaults from class definition
- [ ] `getObject` checks object cache first -- a second call for the same id returns the cached instance
- [ ] `getObject` on a non-system class enforces ownership -- returns `null` if `owner_id` does not match current user

### 2.2 setObject
- [ ] `setObject(class, data)` creates a new object when no `id` is provided -- returns `AtomObj` with generated id
- [ ] `setObject(class, data)` updates an existing object when `id` matches an existing record -- merges old + new data
- [ ] `setObject` with a custom `id` on a non-system class when `allowCustomIds=false` throws `not_found`
- [ ] `setObject` runs validation against class schema before saving -- returns `validation_failed` on errors
- [ ] `setObject` stamps `owner_id`, `app_id`, `domain`, `tenant_id` on new non-system objects
- [ ] `setObject` creates a `@changes` version record linking to the saved object
- [ ] `setObject` detects no changes on update and returns the existing object without re-saving
- [ ] `setObject` rejects modification of `@state.readonly` objects (unless admin/system role)
- [ ] `setObject` rejects modification of system/seed classes without admin role
- [ ] Batch `setObjects()` saves valid items and reports errors for invalid ones -- returns `207` on partial success

### 2.3 deleteObject
- [ ] `deleteObject(class, id)` sets `@state.deleted = true` (soft delete) and returns `true`
- [ ] `deleteObject` on a non-existent object returns `false`
- [ ] `deleteObject` enforces ownership -- returns `false` if `owner_id` does not match current user
- [ ] `deleteObject` rejects deletion of `@state.readonly` objects (unless admin/system role)
- [ ] Soft-deleted objects are filtered out from `query()` by default
- [ ] Soft-deleted objects are returned when `@state.deleted` filter is explicitly set

### 2.4 query
- [ ] `query(class, filters)` returns array of `AtomObj` instances matching all filters
- [ ] `query` injects `class_id` filter automatically
- [ ] `query` supports `sort`, `sortDir`, `limit`, `offset` options
- [ ] `query` injects scope filters from class definition (non-privileged users only)
- [ ] `query` injects security filters (`owner_id`, `app_id`, `domain`, `tenant_id`) for non-system classes
- [ ] Admin/system roles bypass scope and security filters on query
- [ ] Default query limit is 100; hard max is 1000 for regular users, 10000 for admins

### 2.5 /me Resolver
- [ ] `GET /store/@user/me` returns the current user's `@user` object, matched by JWT `user_id`
- [ ] `GET /store/@user/me` auto-creates a `@user` object if none exists for the authenticated user
- [ ] `GET /store/@tenant/me` returns the tenant object matching the current `tenant_id`
- [ ] `GET /store/@app/me` returns the app object matching the current `app_id`
- [ ] `/me` returns `401` when no user is authenticated

## 3. Class System

### 3.1 @class Creation
- [ ] `POST /class` with `{id, name, props}` creates a new class definition -- returns `201`
- [ ] New class without explicit `keys` gets auto-added primary key `{fields: [\"id\"], auto_field: \"id\", auto_type: \"uuid\"}`
- [ ] Class creation requires admin role -- non-admin gets `403`
- [ ] System classes (`@`-prefixed) cannot be deleted -- `deleteClass` throws `forbidden`

### 3.2 Props
- [ ] Class with `props` array stores prop definitions; each prop gets `id: \"classId.key\"` on save
- [ ] Props in object format (`{key: {...}}`) are normalized to array format on save
- [ ] `getClassProps(classId)` returns `Prop[]` array with all defined properties including inherited ones
- [ ] Prop `class_id` is resolved from `data_type` using `@prop.data_type.options.values` map (e.g., `string -> @prop_string`)

### 3.3 Inheritance (extends_id)
- [ ] Child class with `extends_id` pointing to parent inherits all parent props via `getClassProps()`
- [ ] Child class props override parent props with the same `key`
- [ ] Inheritance walks the full `extends_id` chain (grandparent props are included)
- [ ] `@class` itself is excluded from inheritance (root meta-class)

## 4. Validation

### 4.1 Type Checking
- [ ] Integer prop rejects non-numeric value -- error `type` on the field path
- [ ] Float prop rejects non-numeric value
- [ ] Boolean prop accepts `true/false/0/1/\"true\"/\"false\"` and rejects other values
- [ ] Datetime prop rejects non-ISO-format strings (must match `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm:ss`)
- [ ] Object prop rejects non-array/non-object values
- [ ] String prop with `options.values` (enum list) rejects values not in the list (unless `allow_custom: true`)

### 4.2 Required Fields
- [ ] Prop with `flags.required: true` causes validation error when field is missing on create
- [ ] Required field with `null` or empty string value causes validation error
- [ ] Required field with `default_value` is auto-filled on create -- no error even if not provided

### 4.3 Unique Keys
- [ ] Name uniqueness check: two objects in the same class with the same `name` (case-insensitive) are rejected -- error `unique`
- [ ] Name uniqueness is skipped if class has explicit `keys` defined
- [ ] Custom key uniqueness: creating two objects with the same key field values throws `validation_failed`

### 4.4 @obj_ref Bypass
- [ ] Prop with `object_class_id: [\"@obj_ref\"]` bypasses type validation -- any value type is accepted
- [ ] Used for dynamic-typed fields like `default_value` on `@prop`

### 4.5 Child Class Validation
- [ ] Embedded array items are validated against the item's own `class_id` when it extends the target class
- [ ] If child class does not exist yet (bootstrap), the item is accepted as-is without nested validation
- [ ] Single embedded objects are validated against the primary target class

### 4.6 Inline Reference Detection
- [ ] Embedded object with only `id` and no required fields of the target class is treated as a reference (not validated)
- [ ] Embedded object with required fields present is treated as a full instance and validated

### 4.7 Max Nesting Depth
- [ ] Validation stops at depth 20 with error `MAX_DEPTH` to prevent infinite recursion

### 4.8 Custom Validators
- [ ] Email validator rejects invalid email format
- [ ] URL validator rejects invalid URL format
- [ ] Length validator enforces `min` and `max` on string length
- [ ] Range validator enforces `min` and `max` on numeric values
- [ ] Regex validator rejects values not matching the `pattern`
- [ ] String `options.min_length` / `options.max_length` enforces length constraints
- [ ] String `options.pattern` enforces regex match

## 5. Keys

### 5.1 Assoc Format
- [ ] Keys are defined as `{keyName: {fields: [...], auto_field, auto_type}}`
- [ ] Primary key on `id` with `auto_type: \"uuid\"` generates UUID for new objects automatically

### 5.2 Composite Keys
- [ ] Key with `fields: [\"field_a\", \"field_b\"]` checks uniqueness of the combined values
- [ ] Null key field values cause the uniqueness check to be skipped (partial key)

### 5.3 Scope-Scoped Uniqueness
- [ ] Key uniqueness check includes scope fields in the filter -- same key values in different scopes are allowed
- [ ] Two objects with the same key values but different `tenant_id` are both accepted

### 5.4 Auto-Inc Setter
- [ ] Prop with `setter: {id: \"auto_inc\", params: {prefix, start, step}}` generates incrementing values on create
- [ ] Auto-inc uses `@counter` objects for persistent state -- counter is created on first use
- [ ] Auto-inc respects scope -- counters are independent per scope combination
- [ ] Auto-inc retries on CouchDB conflict (optimistic locking) up to 5 attempts
- [ ] Auto-inc throws `generation_failed` after 5 failed attempts

## 6. Scope

### 6.1 @class.scope
- [ ] Class with `scope: [\"tenant_id\"]` auto-filters queries by `tenant_id` from session
- [ ] Class with `scope: []` (empty array) has global visibility (no scope filtering)
- [ ] Class with `scope: null` inherits scope from parent via `extends_id` chain
- [ ] Class with no scope found in entire chain defaults to global (no scope)

### 6.2 Auto-Fill from Session
- [ ] On create, scope fields are auto-filled from session context (`user_id`, `app_id`, `tenant_id`, `domain`)
- [ ] Auto-fill does not override if the user explicitly provides a scope value

### 6.3 Auto-Filter on Query
- [ ] Query for a scoped class automatically adds scope field filters from session
- [ ] Admin/system roles bypass scope filters -- they see all objects regardless of scope
- [ ] Non-privileged users cannot see objects outside their scope

### 6.4 Scope Inheritance
- [ ] Child class inherits scope from parent class when own scope is `null`
- [ ] Child class with explicit `scope` overrides parent scope
- [ ] Circular `extends_id` chains are handled safely (visited set prevents infinite loop)

### 6.5 Scope Rejection on Update
- [ ] On update, changing a scope field value is silently rejected -- old value is preserved

## 7. Prop Features

### 7.1 Flags
- [ ] `flags.readonly: true` -- prop cannot be modified after creation (enforced by `create_only` guard)
- [ ] `flags.create_only: true` -- prop can only be set during creation, rejected on update
- [ ] `flags.server_only: true` -- prop is stripped from API responses (class/props endpoints)
- [ ] `flags.hidden: true` -- prop is marked hidden for UI (accessible via `isHidden()`)
- [ ] `flags.master_only: true` -- prop is visible only to master/admin role
- [ ] `flags.from_parent: true` -- on create, auto-populated from parent object; on update, direct writes rejected
- [ ] Legacy top-level flags (`required`, `readonly`, etc.) are normalized into `flags` object in Prop constructor

### 7.2 Setter
- [ ] Prop with `setter: {id: \"auto_inc\"}` generates auto-increment value on create only (skipped on update)
- [ ] Setter is skipped if the field already has a value in the input data

### 7.3 default_value
- [ ] Prop with `default_value` fills the field on create when no value is provided
- [ ] `default_value` is applied during `normalizeObjectData()` on read when `fillDefaults` is enabled
- [ ] Explicit `null` input overrides the default (not filled)

### 7.4 data_type to class_id Mapping
- [ ] Prop `data_type: \"string\"` resolves `class_id` to `@prop_string` using the `@prop.data_type.options.values` map
- [ ] Unknown `data_type` defaults `class_id` to `@prop`

### 7.5 is_array Modes
- [ ] `is_array: true` normalizes to `\"indexed\"` mode
- [ ] `is_array: \"assoc\"` enables key-value map mode
- [ ] `is_array: false` or `\"false\"` means scalar value
- [ ] Cast: scalar value for an `indexed` prop is wrapped in an array; single-element array for a scalar prop is unwrapped

### 7.6 from_parent Cascade
- [ ] When a parent object is updated, changed `from_parent` fields are cascaded to all children (objects with `primary_id` = parent id)

## 8. @storage

### 8.1 Type Field
- [ ] `type: \"couchdb\"` creates CouchDB driver
- [ ] `type: \"json\"` creates JSON file driver
- [ ] `type: \"mongo\"` creates MongoDB driver
- [ ] `type: \"redis\"` creates Redis driver
- [ ] `type: \"api\"` creates API storage driver
- [ ] `type: \"ws\"` creates WebSocket broadcast driver (not a data store)
- [ ] Unknown type throws `StorageException` with `config_error`

### 8.2 Providers Pipeline
- [ ] `providers` array in `@init.json` creates sub-providers (each a nested `StorageProvider`)
- [ ] `setobj` writes to primary driver then best-effort to all sub-providers that support `set`
- [ ] `delobj` deletes from primary driver then best-effort from sub-providers that support `delete`
- [ ] `query` tries primary driver first; if empty, falls through to sub-providers that support `query`
- [ ] Sub-provider failures are silently ignored (best-effort)

### 8.3 Method (sync/fallback)
- [ ] `method: \"sync\"` -- fallback results are synced back to primary driver
- [ ] Default method is `\"sync\"` when not specified

### 8.4 Classes Action Mapping
- [ ] Provider with `classes: {\"@class\": [\"get\", \"set\"]}` only participates in `get` and `set` for `@class`
- [ ] Provider with empty `classes` participates in all operations for all classes

## 9. WebSocket

### 9.1 Connect
- [ ] WS connection with valid JWT token is accepted -- receives `{event: \"connected\", user_id}`
- [ ] WS connection with invalid JWT is rejected with error `Invalid or expired token.`
- [ ] WS connection without token when `JWT_SECRET` is set is rejected with `Authentication required.`
- [ ] WS connection without token when `JWT_SECRET` is not set is allowed (dev mode) with `user_id: \"anonymous\"`
- [ ] Connection at global capacity (`MAX_CONNECTIONS`) is rejected with `Server at capacity.`
- [ ] Per-user connection limit (`MAX_CONNECTIONS_PER_USER`) is enforced

### 9.2 Subscribe
- [ ] `{action: \"subscribe\", class_id: \"user\"}` subscribes to all changes for class `user` -- receives `{event: \"subscribed\"}`
- [ ] `{action: \"subscribe\", id: \"user/john\"}` subscribes to a specific object -- receives confirmation
- [ ] `{action: \"subscribe\", scope_id: \"ws-1\"}` subscribes to a scope -- receives confirmation
- [ ] `{action: \"subscribe\", class_id: \"*\"}` subscribes to all classes (wildcard)
- [ ] `{action: \"subscribe\", class_id: \"user\", fetch: 10}` sends historical objects from ES API after subscribing
- [ ] `{action: \"subscribe\", class_id: \"user\", fetch: 10, since: \"2025-01-01T00:00:00\"}` filters historical fetch by `since`

### 9.3 Unsubscribe
- [ ] `{action: \"unsubscribe\", class_id: \"user\"}` removes class subscription -- receives `{event: \"unsubscribed\"}`
- [ ] `{action: \"unsubscribe\", id: \"user/john\"}` removes object subscription
- [ ] `{action: \"unsubscribe\", scope_id: \"ws-1\"}` removes scope subscription

### 9.4 Broadcast
- [ ] PHP `BroadcastService::send()` POSTs `{class_id: \"@changes\", items: [...]}` to WS server `/broadcast`
- [ ] WS server fans out the message to all class-level subscribers of matching `class_id`
- [ ] WS server fans out to object-level subscribers matching `class_id/object_id`
- [ ] WS server fans out to scope-level subscribers matching `_scope_id` on items
- [ ] Wildcard subscribers (`class_id: \"*\"`) receive all broadcast messages

### 9.5 Changes Format
- [ ] Change items contain full object data (`id`, `class_id`, all fields)
- [ ] Updated objects include `old_values` with previous field values
- [ ] Deleted objects include `_deleted: true`

### 9.6 Sender-Skip
- [ ] Broadcast skips all connections belonging to `senderUserId` -- the saving client does not receive its own echo
- [ ] `X-Sender-User-Id` header on `/broadcast` POST identifies the sender

### 9.7 Ping/Pong
- [ ] `{action: \"ping\"}` returns `{event: \"pong\"}` and updates `_lastActivity`

### 9.8 Broadcast Auth
- [ ] `/broadcast` POST with valid `Authorization: Bearer <WS_SECRET>` is accepted
- [ ] `/broadcast` POST without valid secret returns `401` when `WS_SECRET` is set
- [ ] `/broadcast` is allowed without auth when `WS_SECRET` is not configured (backward compat)

## 10. Admin Dashboard

### 10.1 Class List
- [ ] Dashboard loads and displays a list of all classes from `GET /class`
- [ ] Each class shows its `id` and `name`
- [ ] Clicking a class opens a tab with the object grid for that class

### 10.2 Object Grid
- [ ] ag-grid renders objects from `GET /query/{class}` with columns built from class props
- [ ] Grid supports sorting, column resizing, and row selection
- [ ] Grid pagination respects `_limit` and `_offset` parameters

### 10.3 Search (_q)
- [ ] Entering text in the search box adds `_q=<text>` to the query
- [ ] Free-text search matches any string field in objects (case-insensitive)
- [ ] Clearing search shows all objects again

### 10.4 Scope Selector
- [ ] Admin can set `X-Scope-Tenant`, `X-Scope-User`, `X-Scope-App` headers via UI
- [ ] Changing scope refreshes the grid with filtered results

### 10.5 JSON Dialog
- [ ] Clicking an object row opens a JSON editor dialog showing the full object data
- [ ] Saving from the dialog sends `PUT /store/{class}/{id}` with the edited JSON
- [ ] Dialog supports drag, resize, and dock

### 10.6 Create / Edit / Delete
- [ ] Create button opens a prop-driven form; submitting sends `POST /store/{class}` -- new object appears in grid
- [ ] Edit updates the existing object via `PUT /store/{class}/{id}` -- grid refreshes
- [ ] Delete button sends `DELETE /store/{class}/{id}` -- object disappears from grid

## 11. API Endpoints

### 11.1 Health & Info
- [ ] `GET /health` returns `{status: \"ok\", service: \"elementStore\", init: {completed, last_run}}`
- [ ] `GET /info` returns endpoint documentation

### 11.2 Class Endpoints
- [ ] `GET /class` returns array of all class definitions with `server_only` props stripped
- [ ] `GET /class/{id}` returns single class definition or `404`
- [ ] `GET /class/{id}/props` returns props including inherited, filtering out `server_only`
- [ ] `POST /class` creates/updates class definition (admin only) -- returns `201`
- [ ] `DELETE /class/{id}` deletes class (admin only) -- returns `{deleted: true}` or `404`

### 11.3 Store Endpoints
- [ ] `GET /store/{class}` returns up to 500 objects (default limit)
- [ ] `GET /store/{class}/{id}` returns single object or `404`
- [ ] `GET /store/{class}/{id}/{prop}` returns property value; resolves relations automatically
- [ ] `POST /store/{class}` creates new object -- returns `201`
- [ ] `PUT /store/{class}/{id}` updates existing object
- [ ] `DELETE /store/{class}/{id}` soft-deletes object -- returns `{deleted: true}` or `404`
- [ ] `POST /store/{class}/_batch` batch upserts -- returns `200`/`207`/`400` based on results

### 11.4 Query Endpoint
- [ ] `GET /query/{class}?field=value` filters objects by field value
- [ ] `GET /query/{class}?_sort=name&_order=asc` sorts results
- [ ] `GET /query/{class}?_limit=10&_offset=20` paginates results
- [ ] `GET /query/{class}?_q=search` performs free-text search across all string fields
- [ ] Query returns pagination headers: `X-Pagination-Limit`, `X-Pagination-Offset`, `X-Pagination-Count`, `X-Pagination-Hard-Max`

### 11.5 Actions with ()
- [ ] `PUT /store/{class}/{id}/actionName()` executes the named action on the object
- [ ] Action params are passed as JSON body
- [ ] CLI-type actions require admin role
- [ ] Unknown action returns `not_found` error

### 11.6 Find
- [ ] `GET /find/{id}` searches across all non-system classes for object with matching id

### 11.7 Genesis Endpoints
- [ ] `POST /genesis` initializes genesis data (admin only)
- [ ] `GET /genesis` verifies genesis data integrity
- [ ] `GET /genesis/data` exports genesis data as JSON
- [ ] `POST /genesis/reload` reloads genesis from `.es/` directory (admin only)
- [ ] `GET /genesis/files` lists genesis/seed files in `.es/` directory

### 11.8 Other Endpoints
- [ ] `POST /init` initializes application (admin only, requires `ENABLE_INIT_ENDPOINT=true`)
- [ ] `POST /reset` resets all data (admin only, requires `ENABLE_RESET_ENDPOINT=true`)
- [ ] `POST /reset` with `RESET_CONFIRM_TOKEN` requires matching `confirm_token` in body
- [ ] `POST /export` exports all data as JSON (admin only)
- [ ] `POST /test` runs test scenarios from `test_data.json` (admin only)

### 11.9 Response Format
- [ ] Default response format is JSON (`application/json`)
- [ ] `Accept: text/plain` or `X-Response-Format: text` returns text-table format
- [ ] `X-Fields: id,name,status` filters returned fields

## 12. Auth

### 12.1 JWT Verification
- [ ] Valid JWT Bearer token in `Authorization` header is verified against cached RS256 public keys
- [ ] `user_id`, `app_id`, `domain` from JWT claims are injected into `ClassModel` security context
- [ ] Roles are extracted from `roles` (array) or `role` (single) JWT claims
- [ ] Expired JWT returns `401`
- [ ] Invalid JWT signature returns `401`

### 12.2 X-System-Secret
- [ ] `X-System-Secret` header matching `ES_SYSTEM_SECRET` env var grants admin+system roles
- [ ] System secret sets `userId` to `\"system\"` and `skipAuth = true`
- [ ] Invalid system secret has no effect -- falls through to JWT auth

### 12.3 Scope Override Headers
- [ ] Admin/system role can override tenant via `X-Scope-Tenant` header
- [ ] Admin/system role can override app via `X-Scope-App` header
- [ ] Admin/system role can override user via `X-Scope-User` header
- [ ] Non-admin users cannot use scope override headers (silently ignored)

### 12.4 Unauthenticated Mode
- [ ] `ES_ALLOW_UNAUTHENTICATED=true` grants admin+system roles to all requests
- [ ] Unauthenticated mode sets `userId` to `\"dev-admin\"`
- [ ] Without `ES_ALLOW_UNAUTHENTICATED` and no JWT, requests are denied with `401`

### 12.5 Admin Guard
- [ ] `adminGuard()` always enforces authentication even if `ES_ALLOW_UNAUTHENTICATED=true`
- [ ] Admin-only endpoints (`/class POST`, `/reset`, `/init`, `/genesis POST`) return `401`/`403` for non-admins

### 12.6 CORS
- [ ] OPTIONS preflight returns `200` with appropriate CORS headers
- [ ] `CORS_ALLOWED_ORIGINS` env var restricts allowed origins
- [ ] Dev mode (`ES_ENV=development`) allows any origin as fallback

### 12.7 Rate Limiting
- [ ] Rate limiter enforces `RATE_LIMIT_MAX` requests per `RATE_LIMIT_WINDOW` seconds per IP
- [ ] Exceeding rate limit returns `429` with `Retry-After` header
- [ ] Response includes `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` headers

## 13. Genesis

### 13.1 .es/ Files
- [ ] `*.genesis.json` files in `.es/` directory contain class definitions in `{classes: [...]}` format
- [ ] Each genesis file can contain multiple classes and their objects
- [ ] `system.genesis.json` contains core meta-schema (`@class`, `@prop`, `@prop_*`, `@editor`, etc.)

### 13.2 Index Building
- [ ] On first access, `JsonStorageProvider` scans all `*.genesis.json` files and builds `map[class/id] -> file`
- [ ] Index includes `class_files` map: `class_id -> [file1, file2, ...]`
- [ ] Index is cached to `index.es.json` for subsequent boots

### 13.3 On-Demand Loading
- [ ] Objects and classes are loaded from genesis files only when first requested (not eagerly)
- [ ] `getClass()` triggers load from genesis if not in CouchDB

### 13.4 Write-Back
- [ ] `setobj` in `JsonStorageProvider` writes changes back to the genesis file where the object was loaded from
- [ ] New objects in a class go to the first genesis file associated with that class, or `system.genesis.json`
- [ ] `sync_genesis` action re-saves the class to trigger pipeline write-back

## 14. Free Text Search

### 14.1 _q Parameter
- [ ] `GET /query/{class}?_q=text` filters results by matching `text` against any string field (case-insensitive, substring match)
- [ ] Free text search fetches up to `hardMax` from storage then filters in memory
- [ ] Results are trimmed back to the requested `_limit` after filtering
- [ ] Empty `_q` value is treated as no filter (returns all results)
- [ ] Non-string fields are not searched

## 15. Actions

### 15.1 validate_keys
- [ ] `validate_keys()` action scans all objects of a class and reports key constraint violations
- [ ] Returns `{valid: true}` when no keys are defined
- [ ] Returns violation details (object id, key name, duplicate values)

### 15.2 fix
- [ ] `fix()` action strips unknown fields, applies defaults, and casts types on all objects of a class
- [ ] Only CouchDB internal fields (`_id`, `_rev`) are exempt from stripping
- [ ] Returns count of fixed objects

### 15.3 sync_genesis
- [ ] `sync_genesis()` re-saves the class definition to trigger storage pipeline write-back to genesis files
- [ ] Returns `{synced: true, class_id: \"...\"}` on success

### 15.4 merge_into
- [ ] Object-level: merges source object props into target object (skipping system fields)
- [ ] Class-level: migrates all objects from source class to target class (updates `class_id`)
- [ ] Returns `{merged: true, target: {...}}` or migration summary

### 15.5 Action Execution Types
- [ ] `type: \"api\"` -- executes HTTP call to external provider via cURL
- [ ] `type: \"cli\"` -- executes shell command with `{field}` placeholder substitution (admin only)
- [ ] `type: \"function\"` -- invokes named function from function registry
- [ ] `type: \"event\"` -- dispatches event via event bus
- [ ] `type: \"composite\"` -- chains multiple actions (sequential or parallel)
- [ ] `type: \"ui\"` -- no-op on server (UI-only handlers)

### 15.6 Action Pipeline
- [ ] `input_mapping` renames/selects params before dispatch
- [ ] `output_mapping` renames/selects result keys after execution
- [ ] CLI-type `@action` creation/modification requires admin role

## 16. Normalize

### 16.1 normalizeClassData
- [ ] Props in object format (`{key: {...}}`) are converted to array format `[{key, ...}]`
- [ ] Each prop gets `id` set to `classId.key`
- [ ] Prop `class_id` is resolved from `data_type` using `@prop.data_type.options.values` map

### 16.2 class_id from data_type Options
- [ ] `data_type: \"string\"` resolves to `class_id: \"@prop_string\"` when map entry exists
- [ ] `data_type: \"number\"` resolves to `class_id: \"@prop_number\"`
- [ ] Unknown `data_type` defaults to `class_id: \"@prop\"`
- [ ] If `@prop` meta is not yet loaded (bootstrap), existing `class_id` is preserved

### 16.3 Prop Flags Enforcement
- [ ] Top-level boolean flags (`required`, `readonly`, `hidden`) are merged into `flags` object in Prop constructor
- [ ] Legacy `group_name` is removed
- [ ] `editor` string is normalized to `{id: \"string_value\"}`
- [ ] `object_class_id` string is normalized to array
- [ ] `is_array: true` is normalized to `\"indexed\"`

### 16.4 normalizeObjectData (cast on read)
- [ ] Scalar value for an indexed-array prop is wrapped in `[value]`
- [ ] Single-element array for a scalar prop is unwrapped to `value[0]`
- [ ] Integer prop value `\"42\"` is cast to `42`
- [ ] Boolean prop value `\"true\"` is cast to `true`
- [ ] Missing fields with `default_value` are filled in

### 16.5 Object cast_from_string
- [ ] When `data_type: \"object\"` prop has `options.cast_from_string` template, a string input value is expanded using the template with `$value` substitution

---

### Critical Files for Implementation
- /Users/asi/OrbStack/docker/volumes/agura_code/elementStore/src/ClassModel.php
- /Users/asi/OrbStack/docker/volumes/agura_code/elementStore/src/StorageProvider.php
- /Users/asi/OrbStack/docker/volumes/agura_code/elementStore/index.php
- /Users/asi/OrbStack/docker/volumes/agura_code/elementStore/ws/server.js
- /Users/asi/OrbStack/docker/volumes/agura_code/elementStore/src/JsonStorageProvider.php

**