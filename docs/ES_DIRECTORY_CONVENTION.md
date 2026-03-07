# `.es/` Directory Convention

> Standard layout for ElementStore data directories — both in the ElementStore repo itself and in external projects that integrate with it.

## Directory Structure

```
project-root/
└── .es/
    ├── system.genesis.json        # Class definitions (schema registry) — git-tracked
    ├── editors.seed.json          # Seed object data — git-tracked
    ├── functions.seed.json        # Seed object data — git-tracked
    ├── {namespace}.genesis.json   # Domain class definitions — git-tracked
    ├── @class.json                # Runtime: class instance data — gitignored
    ├── @editor.json               # Runtime: editor instances — gitignored
    ├── user.json                  # Runtime: user objects — gitignored
    └── {namespace}/               # Namespace subdirectory — gitignored
        └── {namespace}.{class}.json  # Runtime: namespaced class data (full ID, : → .)
```

## File Types

| Suffix | Purpose | Git-tracked | Example |
|--------|---------|:-----------:|---------|
| `*.genesis.json` | Class definitions (schema registry) | Yes | `billing.genesis.json` |
| `*.seed.json` | Seed object data (editors, functions) | Yes | `editors.seed.json` |
| `*.json` (plain) | Runtime object data | No | `@class.json`, `user.json` |

## Namespace Subdirectories

Class IDs with a colon (`:`) map to subdirectories:

| Class ID | File Path |
|----------|-----------|
| `user` | `.es/user.json` |
| `@editor` | `.es/@editor.json` |
| `ui:button` | `.es/ui/ui.button.json` |
| `billing:invoice` | `.es/billing/billing.invoice.json` |

The colon (`:`) in class IDs is replaced with a dot (`.`) in filenames for cross-platform filesystem safety. The full class ID is preserved in the filename for clarity.

Subdirectories are created automatically by `JsonStorageProvider` when a namespaced class is first written.

## Genesis Files (Schema Registry)

Genesis files define class schemas. Format:

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
        {"key": "name", "label": "Name", "data_type": "string", "required": true}
      ]
    }
  ]
}
```

### System Genesis (`system.genesis.json`)

Loaded first at boot. Defines all system meta-classes: `@class`, `@prop`, `@editor`, `@storage`, `@action`, `@event`, `@function`, `@provider`, `crud_provider`, `@seed`, auth classes.

### Domain Genesis (`{namespace}.genesis.json`)

Loaded after system genesis. Defines project-specific classes. Each class gets stamped with `genesis_file` field for write-back tracking.

## Seed Files

Flat arrays of objects for a specific class:

```json
[
  {"id": "text", "class_id": "@editor", "name": "Text", ...},
  {"id": "textarea", "class_id": "@editor", "name": "Textarea", ...}
]
```

## Seed Write-Back

When a class or seed object is modified via the API and the user has `seed_write` permission, changes are automatically saved back to the source genesis/seed file in `.es/`.

**Conditions for write-back:**
1. GenesisLoader is active (`.es/` directory exists)
2. User has `seed_write` permission (or no auth is configured)
3. For class definitions: the class has a `genesis_file` field
4. For seed objects: the class is a known seed class (`@editor` → `editors.seed.json`, `@function` → `functions.seed.json`)

## Genesis Configuration

In `@init.json`:

```json
{
  "@storage": {
    "bootstrap": {
      "type": "json",
      "data_dir": ".es"
    }
  },
  "genesis": {
    "mode": "local",
    "url": null,
    "auto_load": true
  }
}
```

### Genesis Modes

| Mode | Read Source | Write Target |
|------|-----------|-------------|
| `local` | `.es/` directory on disk | `.es/` directory on disk |
| `remote` | Git raw URL (falls back to local) | `.es/` directory on disk |

### Environment Variable Overrides

| Variable | Overrides | Example |
|----------|-----------|---------|
| `ES_GENESIS_URL` | `genesis.url` | `https://raw.githubusercontent.com/org/repo/main` |
| `ES_GENESIS_MODE` | `genesis.mode` | `remote` |

## Boot Sequence

```
ClassModel::boot()
  → Read @init.json (storage + genesis config)
  → Create storage provider with .es/ as data directory
  → Create GenesisLoader

ensureBootstrap()
  → Check if @class exists in storage
  → If not:
    1. GenesisLoader loads system.genesis.json
    2. GenesisLoader loads *.seed.json files
    3. GenesisLoader loads remaining *.genesis.json files
  → Ready for API operations
```

## External Projects

External projects follow the same convention:

```
my-app/
└── .es/
    ├── myapp.genesis.json      # Class definitions
    ├── category.seed.json      # Seed data
    └── crud_provider.json      # Provider objects (seed data)
```

Load into ElementStore:
```bash
# Auto-detects .es/ subdirectory in my-app/
es push --from my-app --to http://localhost/elementStore

# Or reference the genesis file directly:
es push --from my-app/.es/myapp.genesis.json --to http://localhost/elementStore
```

Or via API:
```bash
curl -X POST http://localhost/elementStore/genesis/reload
```

## es-cli `.es/` Auto-Detection

When `--dir`, `--from`, or `--file` points to a directory that contains a `.es/` subdirectory, `es-cli` automatically uses the `.es/` subdirectory:

```bash
# These are equivalent:
es push --from /path/to/project --to http://localhost/elementStore
es push --from /path/to/project/.es --to http://localhost/elementStore

# Directory mode also auto-detects:
es push --dir /path/to/project --to http://localhost/elementStore
```

When a `.es/` directory is detected, genesis files (`*.genesis.json`) are processed first, which loads class definitions and their seed references. If no genesis files exist, all `*.json` files are processed.

## `.gitignore` Rules

```gitignore
# Track genesis/seed, ignore runtime
.es/*.json
!.es/*.genesis.json
!.es/*.seed.json
.es/*/
```

## Related Files

| File | Description |
|------|-------------|
| `src/GenesisLoader.php` | Direct genesis/seed file loader |
| `src/JsonStorageProvider.php` | JSON file storage with namespace support |
| `src/ClassModel.php` | Boot sequence and seed write-back |
| `src/Constants.php` | ES_DIR, NS_SEPARATOR, genesis constants |
| `genesis/Genesis.php` | Legacy HTTP-based genesis (uses .es/ with fallback) |
| `docs/MIGRATION_PROCEDURE.md` | Full migration guide |
