# `.es/` Directory Convention

> Standard layout for ElementStore genesis files — the canonical class definitions stored in the elementStore repository.

## Directory Structure

```
elementStore/
├── @init.json                     # Bootstrap @storage config
└── .es/
    ├── system.genesis.json        # System meta-classes (@class, @prop, @key, etc.)
    ├── core.genesis.json          # Core objects (core:atomObj, core:design, etc.)
    ├── ai.genesis.json            # AI classes (ai:agent, ai:task, etc.)
    ├── auth.genesis.json          # Auth classes (auth:role, auth:credential, etc.)
    ├── ui.genesis.json            # UI classes (ui:dialog, ui:button, etc.)
    ├── {namespace}.genesis.json   # Domain class definitions
    └── index.es.json              # Auto-generated index (class → file mapping)
```

## Canonical Source

Genesis files are the canonical class definitions, stored in the elementStore repository:
- **Repository**: `https://github.com/omc-ai/elementStore`
- **Path**: `.es/*.genesis.json`
- **Git-tracked**: Yes — class schemas are versioned

## Genesis File Format

```json
{
  "version": "2.0.0",
  "description": "Class definitions for this module",
  "classes": [
    {
      "id": "my_model",
      "class_id": "@class",
      "name": "My Model",
      "props": [
        {"key": "name", "label": "Name", "data_type": "string", "flags": {"required": true}}
      ]
    }
  ]
}
```

### System Genesis (`system.genesis.json`)

Defines all system meta-classes: `@class`, `@prop`, `@prop_*`, `@key`, `@state`, `@storage`, `@action`, `@event`, `@function`, `@options_*`, `@counter`, `@group`, etc.

### Domain Genesis (`{namespace}.genesis.json`)

Defines project-specific classes grouped by namespace (ai, auth, core, ui, infra, etc.).

## Bootstrap Flow

```
@init.json
  → Defines the bootstrap @storage object
  → type: couchdb (primary driver)
  → providers: [{ type: json, dir: .es }] (fallback)
  → method: sync

On first request:
  → getobj("@class", "@prop")
    → CouchDB: miss (empty)
    → JSON provider: reads from system.genesis.json via index
    → Found → sync back to CouchDB
    → Return class definition

  → Classes load on-demand, one at a time
  → query() returns only what's in CouchDB
  → getobj() falls back to genesis files
```

## `@init.json`

The bootstrap storage configuration. This is a `@storage` object loaded before the store exists:

```json
{
  "id": "bootstrap",
  "class_id": "@storage",
  "name": "Bootstrap Storage",
  "type": "couchdb",
  "server": "http://elementstore_couchdb:5984",
  "classes": {
    "@class": ["get", "set", "query", "delete"]
  },
  "providers": [
    {
      "id": "genesis_files",
      "class_id": "@storage",
      "name": "Genesis JSON Files",
      "type": "json",
      "dir": ".es",
      "classes": {
        "@class": ["get"]
      }
    }
  ],
  "method": "sync"
}
```

Key points:
- `classes` mapping defines which actions each provider supports per class
- JSON genesis provider only supports `get` (not query, set, delete)
- `method: sync` means: on fallback read hit, write back to primary (CouchDB)
- The bootstrap @storage object is saved to CouchDB on boot

## Index File (`index.es.json`)

Auto-generated on first access. Maps class IDs to their genesis file:

```json
{
  "map": {
    "@class/@prop": "system.genesis.json",
    "@class/ai:agent": "ai.genesis.json"
  },
  "class_files": {
    "@class": ["system.genesis.json", "ai.genesis.json", "core.genesis.json"]
  }
}
```

Rebuilt automatically if missing. Cached in memory per request.

## External Projects

External projects can provide their own genesis files:

```
my-app/
└── .es/
    └── myapp.genesis.json      # Class definitions
```

Load into ElementStore:
```bash
es push --from my-app/.es --to http://localhost/elementStore
```

## `.gitignore` Rules

```gitignore
# Track genesis files, ignore runtime data
.es/*.json
!.es/*.genesis.json
.es/index.es.json
.es/*/
```

## Related Files

| File | Description |
|------|-------------|
| `@init.json` | Bootstrap @storage configuration |
| `src/StorageProvider.php` | Unified storage: driver + provider pipeline |
| `src/JsonStorageProvider.php` | JSON genesis file reader with index |
| `src/CouchDbStorageProvider.php` | CouchDB storage driver |
| `src/ClassModel.php` | Core engine — getObject, setObject, validate |
