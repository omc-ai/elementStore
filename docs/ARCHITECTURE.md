# ElementStore Architecture

This document describes the core architecture of the ElementStore JavaScript client (`element-store.js`), including the storage resolution system, object lifecycle, relation management, and multi-app design.

## Client Initialization Flow

Every client of ElementStore (master/server/admin/app) follows the same initialization sequence. This is the first thing any client must do before working with objects.

### Step 1: Create the Store

```javascript
var store = new ElementStore('root.store');
```

This creates the store and seeds core system definitions:
- `@class` — class definition (schema of schemas)
- `@prop` — property definition (field schemas)
- `@storage` — storage provider definition
- All `@class` props (`name`, `extends_id`, `storage_id`, `props`)
- All `@prop` props (`key`, `data_type`, `field_type`, `options`, etc.)
- All `@storage` props (`url`, `type`)
- Built-in `local` storage (memory-only, no remote persistence)

After this step, the store knows how to describe classes and properties but has no application-specific data.

### Step 2: Create and Attach Storage

```javascript
var storage = new AtomStorage({
    id: 'root.storage',
    class_id: '@storage',
    url: 'https://your-api.example.com/elementStore/api'
}, store);
store.storage = storage;
```

This connects the store to a remote API. The `url` is the base URL for all REST operations. Without this step, objects exist only in memory.

**Note on timing**: If `element-store.js` loads before the API URL is known (common in browser environments), create storage with an empty URL and set it later:

```javascript
// At load time (API_BASE not yet known)
var storage = new AtomStorage({ id: 'root.storage', class_id: '@storage', url: '' }, store);
store.storage = storage;

// Later, when API_BASE is available
store.storage.data.url = API_BASE;
```

### Step 3: Load Base Classes

Once storage is connected, the client loads all class definitions from the server:

```javascript
// Fetch all classes from the API
var classes = await fetch(API_BASE + '/store/@class').then(r => r.json());

// Seed each class into the store
classes.forEach(function(cls) {
    store.setObject(cls);
    // Also seed each class's props (if included)
    if (cls.props) {
        cls.props.forEach(function(prop) {
            prop.class_id = '@prop';
            prop.id = cls.id + '.' + prop.key;
            store.setObject(prop);
        });
    }
});
```

After this step, the store has the full schema. It can:
- Resolve prop definitions for any class (`store.collectClassProps(classId)`)
- Walk inheritance chains (`extends_id`)
- Resolve field types for editors
- Validate object data against class schemas

### Step 4: Work with Objects

The client can now create, load, edit, and save objects:

```javascript
// Load objects of a class
var invoices = await fetch(API_BASE + '/store/bl_invoice').then(r => r.json());

// Wrap in AtomObj for typed access, change tracking, validation
var invoice = store.setObject(invoices[0]);

// Edit through proxy (type coercion, validation)
invoice.total = '150.50';  // auto-coerced to float 150.5

// Validate (advisory, server is final authority)
var errors = invoice.validate();

// Save (resolves storage from class chain, persists via REST)
invoice.save();
```

### Initialization in the Admin UI

The admin UI (`admin/js/app.js`) follows this pattern:

```javascript
// element-store.js runs first:
//   store = new ElementStore('root.store')    → seeds core defs
//   storage = new AtomStorage(...)            → creates storage with empty URL

// app.js init():
function initStore() {
    store.storage.data.url = API_BASE;  // connect storage to API
}

async function init() {
    initStore();                         // Step 2: connect storage
    // Step 3 happens lazily: getClassMeta() seeds classes on first access
    // Step 4: user interacts with the admin UI
}
```

The admin uses lazy loading — classes are fetched and seeded into the store on demand via `getClassMeta()`, not all at once on startup.

### Summary Diagram

```
Client Startup:
  ┌─────────────────────────────────┐
  │  1. new ElementStore('root')    │  Seeds @class, @prop, @storage
  │  2. new AtomStorage(url)        │  Connects to API
  │     store.storage = storage     │
  │  3. Load @class objects from    │  Full schema available
  │     API → store.setObject()     │
  │  4. Load/create objects         │  Work with typed data
  └─────────────────────────────────┘

Storage Resolution (per class):
  obj.save()
    → _resolveStorage(class_id)
      → Walk extends_id chain for storage_id
      → Fallback: store.storage (default)
    → saveRemote(obj, resolvedStorage)
```

---

## Object Lifecycle

### setObject() — Local Only

`store.setObject(raw)` creates an `AtomObj` and registers it in `store.objects`. It does **not** persist to any remote storage. This is by design — objects live in memory until explicitly saved.

```javascript
var obj = store.setObject({ class_id: 'ui-button', text: 'Click me' });
// obj is now in store.objects[obj._id]
// Nothing saved remotely — obj exists only in memory
```

### save() — Persist via Resolved Storage

`obj.save()` persists the object to its class's resolved storage. It performs a cascading save: dirty children first, then the parent.

```
obj.save()
  1. Save _dirtyRelated children (recursive, depth-first)
  2. _syncRelationIds() — rebuild data arrays from objects arrays
  3. Register in store.objects
  4. Resolve storage via _resolveStorage(class_id)
  5. If storage has a URL → saveRemote(obj, storage)
  6. Update _snapshot (marks object as clean)
```

If the resolved storage has no URL (e.g., `local` storage), step 5 is skipped — the object stays in memory only.

### applyRemote() — Merge External Data

`store.applyRemote(raw)` merges external data (from WebSocket broadcasts or API responses) into an existing object without marking it dirty. If the object doesn't exist, it creates it via `setObject()`.

## Storage Architecture

### The `storage_id` Property

Every `@class` can have a `storage_id` property that references an `@storage` object. This determines where instances of that class are persisted.

```javascript
// Seed data defines the property on @class itself
'@class.storage_id': {
    id: '@class.storage_id',
    class_id: '@prop',
    key: 'storage_id',
    data_type: 'relation',
    object_class_id: '@storage'
}
```

### Storage Resolution Chain

When `save()` needs to persist an object, it calls `store._resolveStorage(classId)` which walks the class inheritance chain:

```
_resolveStorage('ui-button')
  1. Check ui-button.storage_id → not set
  2. Walk extends_id → ui-element
  3. Check ui-element.storage_id → not set
  4. No more parents → fall back to store.storage (default)
```

The first class in the chain with a `storage_id` wins. If no class in the chain has one, the store-level default storage is used.

**Cycle protection**: The resolver tracks visited class IDs to prevent infinite loops in malformed extends_id chains.

### Built-in Storage Types

| Storage ID | Type | URL | Behavior |
|------------|------|-----|----------|
| `local` | `local` | (none) | Memory only — never persisted remotely |
| (store default) | (configured) | API base URL | Full REST persistence (POST/PUT) |

The `local` storage is defined in seed data:

```javascript
'local': { id: 'local', class_id: '@storage', type: 'local' }
```

### Setting Storage on a Class

To make a class use local-only storage:

```javascript
store.setObject({ id: 'my-temp-class', class_id: '@class', name: 'Temp', storage_id: 'local' });
// All instances of my-temp-class will only exist in memory
```

To point a class at a different API:

```javascript
store.setObject({ id: 'billing-api', class_id: '@storage', type: 'api', url: 'https://billing.example.com/api' });
store.setObject({ id: 'bl_invoice', class_id: '@class', name: 'Invoice', storage_id: 'billing-api' });
// Invoices save to the billing API, not the default elementStore API
```

### Storage Inheritance

Storage follows `extends_id`. If a parent class has `storage_id` set, all subclasses inherit it unless they override with their own `storage_id`.

```
@class: ui-element  (storage_id: 'local')
  └── ui-button     (no storage_id → inherits 'local' from ui-element)
  └── ui-dialog     (storage_id: 'remote-api' → overrides parent)
```

## Relation System

### Parent–Child Relations

Objects with array-relation properties (e.g., `children`) form parent–child trees. The relation system maintains bookkeeping across several internal structures:

| Structure | Purpose |
|-----------|---------|
| `parent.objects[propName]` | Array of child AtomObj references |
| `parent.data[propName]` | Array of child IDs (serializable) |
| `parent._related` | All objects related to this parent |
| `child._belongsTo` | All parents that reference this child |
| `parent._dirtyRelated` | Related objects with unsaved changes |

### addChild(propName, child)

Registers a child in an array-relation property with full bookkeeping:

```javascript
var design = store.setObject({ id: 'design-1', class_id: 'ui-design' });
var button = store.setObject({ class_id: 'ui-button', text: 'OK' });
design.addChild('children', button);
// design.objects.children → [button]
// design.data.children → [button._id]
// design._related → [button]
// button._belongsTo → [design]
// design._dirtyRelated → [button]
```

Duplicate detection prevents adding the same child twice.

### removeChild(propName, child)

Unlinks a child from all relation structures:

```javascript
design.removeChild('children', button);
// Removes from objects array, _related, _belongsTo, _dirtyRelated, and data array
```

### Moving Children Between Parents

When a child moves from one parent to another (e.g., a button dragged from the canvas into a dialog):

```javascript
design.removeChild('children', button);   // unlink from design
dialog.addChild('children', button);       // link to dialog
```

The child is now in the dialog's dirty tree, which is in the design's dirty tree — so `design.save()` still cascades correctly.

## Cascading Save

The cascade mechanism allows saving an entire object tree with a single call to the root's `save()`.

### How It Works

```
design.save()
  → for each child in design._dirtyRelated:
      → child.save() (recursive — saves grandchildren first)
        → child._syncRelationIds()
        → store.setObject(child) → saveRemote(child, resolvedStorage)
  → design._syncRelationIds() → rebuilds data.children from objects.children
  → store.setObject(design) → saveRemote(design, resolvedStorage)
```

### Example: Design with Nested Elements

```javascript
// Create tree
var design = store.setObject({ id: 'design-1', class_id: 'ui-design', name: 'My Layout' });
var dialog = store.setObject({ class_id: 'ui-dialog', title: 'Settings' });
var btn    = store.setObject({ class_id: 'ui-button', text: 'Save' });

design.addChild('children', dialog);
dialog.addChild('children', btn);

// Single save cascades through entire tree
design.save();
// Order: btn.save() → dialog.save() → design.save()
// Each save resolves its own class storage independently
```

### _syncRelationIds()

Before each object saves, `_syncRelationIds()` walks all relation properties and rebuilds the `data[propName]` arrays from the actual `objects[propName]` references. This ensures server IDs (assigned during save) replace any local temporary IDs.

## Multi-App Architecture

### The @app Class

ElementStore manages multiple applications. Each application is registered as an `@app` object:

```javascript
{
    id: 'billing',
    class_id: '@app',
    name: 'Billing',
    domain: 'omc',           // tenant/domain (optional)
    storage_id: 'billing-api' // where this app's data lives
}
```

Applications can be scoped by domain for multi-tenant support: `{app}/{domain}` (e.g., `billing/omc`, `billing/acme`).

### Per-App Storage Routing

Each application's classes can route to different storage backends through `storage_id`:

```
billing classes → billing-api (@storage with url: billing REST API)
architect classes → couchdb-store (@storage with url: CouchDB endpoint)
ui-element classes → local (@storage, memory only)
```

The admin UI can switch between applications, loading the appropriate class definitions and connecting to the correct storage.

### Class Scoping

System classes (`@class`, `@prop`, `@storage`) are shared across all applications — they are not scoped per app. Application-specific classes (like `bl_invoice`, `ui-dialog`) belong to their respective apps.

## Genesis: Seed and Reset

### What Genesis Is

Genesis files (`.es/genesis/*.json`) are the **canonical clean state** for an application's schema and seed data. They define classes, properties, storage configurations, and initial objects.

### Genesis Flow

```
1. LOAD (seed)
   Genesis JSON → POST /genesis → DB
   Classes, props, and seed objects are created in the database.
   This is a one-time operation per environment (or after reset).

2. WORK
   DB is the working copy. All changes go through the API.
   Schema can be modified at runtime (add classes, props, etc.).

3. EXPORT (snapshot)
   DB → export to .es/genesis/ format
   Creates a clean snapshot of the current state.
   This becomes the new canonical genesis for the next deployment.
```

Genesis is NOT loaded into memory each session. Once seeded to the database, the DB is authoritative. Genesis files are only used for:
- Initial setup of a new environment
- Resetting to a known clean state
- Version-controlled snapshots of the schema

### Genesis File Format

See [MIGRATION_PROCEDURE.md](MIGRATION_PROCEDURE.md) for the detailed `.es/genesis/` file format specification, including class definitions, property definitions, provider objects, and migration phases.

### Application Genesis

Each application has its own genesis data. When registering an application with ElementStore:

1. The app's genesis file is loaded once to the database
2. The genesis defines the app's `@storage` object (e.g., billing API URL)
3. Classes in the genesis reference that storage via `storage_id`
4. After loading, the DB manages all data — genesis is not re-read

```json
// billing.genesis.json (excerpt)
{
    "billing-api": {
        "id": "billing-api",
        "class_id": "@storage",
        "type": "api",
        "url": "https://api.billing.example.com"
    },
    "bl_invoice": {
        "id": "bl_invoice",
        "class_id": "@class",
        "name": "Invoice",
        "storage_id": "billing-api"
    }
}
```

## Change Tracking

### Snapshots

Every `AtomObj` maintains a `_snapshot` — a deep copy of `data` taken at creation or after the last save. `hasChanges()` compares current `data` against `_snapshot` to detect modifications.

### Dirty Propagation

When a property changes on an object, the change bubbles up through `_belongsTo`:

```
button.text = 'New Text'
  → button is dirty (data !== _snapshot)
  → dialog._dirtyRelated includes button
  → design._dirtyRelated includes dialog
```

This ensures `design.save()` knows which children need saving without scanning the entire tree.

## Class Registry

### registerClass(classId, JsClass)

Maps a `class_id` to a JavaScript class constructor. When `setObject()` or the `AtomObj` constructor encounters an object whose class (or ancestor class) has a registered constructor, it instantiates that class instead of plain `AtomObj`.

```javascript
registerClass('ui-element', AtomElement);
// Now any object with class_id 'ui-element' (or extending it) becomes an AtomElement
```

### Factory Resolution

The factory walks `extends_id` to find the most specific registered class:

```
setObject({ class_id: 'ui-button' })
  → check 'ui-button' → not registered
  → check extends_id 'ui-element' → AtomElement registered
  → new AtomElement(data, store)
```
