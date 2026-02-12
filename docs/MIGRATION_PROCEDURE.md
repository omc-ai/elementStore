# Migrating a Project to ElementStore

> **Audience**: AI agents and developers performing project migrations.
> This procedure defines how to analyze an existing project and produce ElementStore-compatible genesis files that describe its data model.

## Overview

Migration converts an existing project's data models (classes, relations, API endpoints) into ElementStore's schema format. The output is a `.es/` directory containing JSON genesis files that fully describe the project's structure.

## Output Structure

```
project-root/
└── .es/
    ├── genesis.json                    # Base class definitions (@class, @prop)
    ├── {namespace}.genesis.json        # Class definitions per namespace/module
    └── {class}.json                    # Initial seed data (objects) per class
```

### File Descriptions

| File | Purpose | Required |
|------|---------|----------|
| `genesis.json` | Base system classes (@class, @prop). Only needed if the project overrides or extends base ElementStore genesis definitions. Usually **not required** — inherited from base ElementStore. | No |
| `{namespace}.genesis.json` | Class definitions for a module/namespace. Each file contains an array of `@class` objects with their `props`. | Yes |
| `{class}.json` | Initial object data (seed records) for a specific class. Array of objects conforming to the class schema. | Optional |

---

## Procedure

### Phase 0: Check Existing Classes First (MANDATORY)

Before defining any new classes, **always** check what already exists — both in the project and in ElementStore.

#### 0.1 Check the Project's `.es/` Directory

If the project already has a `.es/` directory with genesis files, read them first. You may be updating an existing migration, not starting from scratch. Compare `_version` timestamps to understand what's current.

```bash
ls -la project-root/.es/
```

#### 0.2 Check ElementStore Genesis Directory

Read the existing genesis files in `elementStore/genesis/data/` to see what classes are already registered globally.

```bash
ls -la elementStore/genesis/data/
```

#### 0.3 Check Live ElementStore Classes

Query the running ElementStore to see all existing classes:

```bash
curl http://{elementstore_url}/class
```

#### 0.4 Stick to Existing Formats

**This is critical.** When you find existing classes in ElementStore that match concepts in the project being migrated, **use them as-is or extend them** — do not create parallel definitions.

Common classes that may already exist in ElementStore:

| Concept | Check for existing class |
|---------|------------------------|
| Projects | `@project`, `project` |
| Actions / Operations | `@action` |
| API endpoints / Services | `service`, `api_endpoint` |
| Repositories | `repository` |
| Users / Accounts | `user`, `account` |
| Configurations | `config`, `setting` |

**Rules:**
- If an ElementStore class covers 80%+ of your model, **extend it** (`extends_id`) instead of creating a new one
- If a project already defines a class, **reuse** the same `id` and `props` format
- Match naming conventions: if existing classes use `snake_case` IDs, follow that
- Match property patterns: if existing classes define `status` as an enum with `options.values`, do the same

---

### Phase 1: Discovery — Understand the Data Structure

Before creating any files, analyze the existing project to understand its data model.

#### 1.1 Identify the Base Model

Every project has a base model or entity — the central data structure everything else relates to.

**How to find it:**
- Check API responses — look at the most-returned or most-referenced entity
- Look for the main database models/entities/classes
- Read the project's ORM definitions, migrations, or schema files
- Check controller/route files to see what resources are exposed

```
Examples:
- E-commerce → Product is the base model
- CRM → Contact or Account
- CMS → Content or Page
- Task manager → Task
```

#### 1.2 Map All Models

For each model/entity in the project, document:

| Field | Description |
|-------|-------------|
| **Name** | Class name (e.g., `product`, `order`, `user`) |
| **Properties** | All fields with their types |
| **Relations** | How this model connects to others |
| **API endpoints** | How to CRUD this model via API |

#### 1.3 Identify Relations

Map every relationship between models:

| Relation Type | ElementStore Mapping |
|---------------|---------------------|
| One-to-one | `data_type: "relation"`, `object_class_id: ["target_class"]` |
| One-to-many | `data_type: "relation"`, `is_array: true`, `object_class_id: ["target_class"]` |
| Many-to-many | `data_type: "relation"`, `is_array: true` (on both sides) |
| Embedded/nested | `data_type: "object"`, `object_class_id: ["target_class"]` |

#### 1.4 Map API Endpoints

For each model, document the CRUD operations:

```
Model: {model_name}
  GET    /api/{model}          → List all objects
  GET    /api/{model}/{id}     → Get one object
  POST   /api/{model}          → Create object
  PUT    /api/{model}/{id}     → Update object
  DELETE /api/{model}/{id}     → Delete object

  # Additional endpoints (filters, actions, etc.)
  GET    /api/{model}?status=active  → Filtered query
  POST   /api/{model}/{id}/action    → Model action
```

---

### Phase 1.5: Present Summary and Get Approval (MANDATORY)

After discovery is complete, **stop and present a summary to the user before writing any files**. The user must choose which models to include in the migration.

#### 1.5.1 Build the Change Summary

Compare what was discovered in Phase 1 against what already exists (Phase 0). Categorize every model into one of these statuses:

| Status | Symbol | Meaning |
|--------|--------|---------|
| **NEW** | `[+]` | Model does not exist in ElementStore — will be created |
| **EXTEND** | `[^]` | Existing ElementStore class covers most of the model — will extend via `extends_id` |
| **UPDATE** | `[~]` | Model exists but project has newer/different props — will update (bump `_version`) |
| **MATCH** | `[=]` | Model exists and is identical — no action needed |
| **CONFLICT** | `[!]` | Model exists with incompatible structure — needs manual resolution |

#### 1.5.2 Present the Summary Table

Display a clear summary in this format:

```
=== Migration Summary: {project_name} ===

Discovered {N} models in project. Checked against ElementStore.

  [+] NEW      product         — 8 props, relations: category, tag
  [+] NEW      order           — 12 props, relations: product, customer, payment
  [+] NEW      order_item      — 5 props, relations: order, product
  [^] EXTEND   customer        — extends existing "user" class, +3 props (loyalty_tier, signup_source, notes)
  [~] UPDATE   category        — exists (v:1707753600), project adds 2 props (icon, sort_order)
  [=] MATCH    tag             — already in ElementStore, identical
  [!] CONFLICT payment_method  — ES has 4 props (string-based), project has 9 props (object-based)

---
Seed data files:
  category.json    — 12 records
  tag.json         — 8 records

---
API mappings detected:
  product     — REST (offset paginator, limit=25)
  order       — REST (page paginator, per_page=20)
  customer    — REST (cursor paginator)
  category    — REST (no pagination)
```

#### 1.5.3 Ask User to Select Models

After presenting the summary, ask the user to choose which models to include:

```
Which models do you want to migrate?

  [x] product         [+] NEW
  [x] order           [+] NEW
  [x] order_item      [+] NEW
  [x] customer        [^] EXTEND user
  [x] category        [~] UPDATE
  [ ] tag             [=] MATCH (no action needed)
  [ ] payment_method  [!] CONFLICT (needs manual resolution)

Options:
  a) All new/extend/update models (recommended)
  b) Select individually
  c) Skip — only generate seed data for existing classes
  d) Cancel migration
```

#### 1.5.4 Handle Conflicts

For any `[!] CONFLICT` models, present the differences clearly and ask how to resolve:

```
CONFLICT: payment_method

  ElementStore (v:1707000000):         Project:
  ─────────────────────────            ────────
  name        string (required)        name           string (required)
  type        string (enum)            type           string (enum)
  active      boolean                  active         boolean
  description string                   description    string
                                       provider       relation → payment_provider
                                       config         object (encrypted)
                                       fee_percent    float
                                       fee_fixed      float
                                       currencies     string[] (array)

  Options:
    a) Extend — create project-specific child class with extra props
    b) Update — add missing props to existing class (bumps _version)
    c) Replace — overwrite with project definition (CAUTION: affects other projects)
    d) Skip — do not migrate this model
```

#### 1.5.5 Rules for This Phase

- **Never skip this phase** — always present the summary and wait for user input
- Show prop counts and key relations to give the user enough context to decide
- Highlight conflicts prominently so they're not overlooked
- Default recommendation should be "all new/extend/update" — pre-select those
- If running non-interactively (CI/scripts), require a `--models=all` or `--models=product,order` flag

---

### Phase 2: Create the `.es/` Directory

Only proceed after the user has approved the model selection from Phase 1.5.

```bash
mkdir -p project-root/.es
```

---

### Phase 3: Genesis Files — Define the Classes

#### 3.1 `genesis.json` (Base — Usually Not Required)

Only create this file if the project needs to **override or extend** the base ElementStore system classes (`@class`, `@prop`). Most projects inherit these from ElementStore's built-in genesis.

If needed, the format is:

```json
{
  "version": "1.0.0",
  "description": "Base class overrides for {project_name}",
  "classes": [
    {
      "id": "@class",
      "class_id": "@class",
      "name": "Class",
      "props": [
        {"key": "custom_field", "label": "Custom Field", "data_type": "string"}
      ]
    }
  ]
}
```

#### 3.2 `{namespace}.genesis.json` — Class Definitions

Create one file per logical namespace or module. Each file contains an array of class definitions.

**Naming convention:**
- Single-module project: `models.genesis.json`
- Multi-module project: `{module}.genesis.json` (e.g., `commerce.genesis.json`, `auth.genesis.json`)

**Format:**

```json
{
  "version": "1.0.0",
  "namespace": "{namespace}",
  "source_project": "{project_name}",
  "description": "Class definitions for {module description}",
  "classes": [
    {
      "id": "product",
      "class_id": "@class",
      "name": "Product",
      "description": "A purchasable item in the catalog",
      "_version": 1707753600,
      "props": [
        {
          "key": "name",
          "label": "Name",
          "data_type": "string",
          "required": true,
          "display_order": 1
        },
        {
          "key": "price",
          "label": "Price",
          "data_type": "float",
          "required": true,
          "editor": "currency",
          "display_order": 2
        },
        {
          "key": "category",
          "label": "Category",
          "data_type": "relation",
          "object_class_id": ["category"],
          "display_order": 3
        },
        {
          "key": "tags",
          "label": "Tags",
          "data_type": "string",
          "is_array": true,
          "display_order": 4
        },
        {
          "key": "active",
          "label": "Active",
          "data_type": "boolean",
          "default_value": true,
          "display_order": 5
        }
      ]
    },
    {
      "id": "category",
      "class_id": "@class",
      "name": "Category",
      "description": "Product grouping",
      "props": [
        {
          "key": "name",
          "label": "Name",
          "data_type": "string",
          "required": true
        },
        {
          "key": "parent_id",
          "label": "Parent Category",
          "data_type": "relation",
          "object_class_id": ["category"]
        }
      ]
    }
  ],
  "api_mapping": {
    "product": {
      "get_one": "GET /api/products/{id}",
      "get_list": "GET /api/products",
      "set_one": "POST /api/products | PUT /api/products/{id}",
      "paginator": {
        "type": "offset",
        "params": {"limit": "_limit", "offset": "_offset"},
        "response": {"items_field": "data", "total_field": "total"},
        "defaults": {"limit": 25, "max_limit": 100}
      },
      "filters": ["category", "active", "price_min", "price_max"]
    },
    "category": {
      "get_one": "GET /api/categories/{id}",
      "get_list": "GET /api/categories",
      "set_one": "POST /api/categories | PUT /api/categories/{id}",
      "paginator": {"type": "none"}
    }
  }
}
```

#### Property Format Reference

Each property in `props` uses this structure:

```json
{
  "key": "field_name",          // Required. Field name in data
  "label": "Display Label",     // Display label for UI
  "description": "Help text",   // Help text
  "data_type": "string",        // Required. One of: string, boolean, float, integer, object, relation, unique, function
  "is_array": false,            // Multiple values (any type can be array)
  "required": false,            // Must have a value
  "readonly": false,            // Cannot edit after creation
  "hidden": false,              // Hide from UI
  "default_value": null,        // Default for new objects
  "display_order": 0,           // Sort order in forms
  "group_name": "General",      // Form section grouping

  // For enum-like strings:
  "options": {
    "type": "string_options",
    "values": ["active", "inactive", "archived"]
  },

  // For relation/object types:
  "object_class_id": ["target_class"],  // Target class(es)
  "object_class_strict": false,          // Only exact class, not children
  "on_orphan": "keep",                   // keep | delete | nullify

  // UI editor (reference to @editor or editor type string):
  "editor": "textarea",

  // Validators:
  "validators": [
    {"type": "email"},
    {"type": "regex", "pattern": "^[A-Z]{3}$"}
  ]
}
```

#### Type Mapping Cheat Sheet

| Source Type | ElementStore `data_type` | Notes |
|-------------|--------------------------|-------|
| `VARCHAR`, `TEXT`, `char` | `string` | |
| `INT`, `BIGINT`, `SMALLINT` | `integer` | |
| `FLOAT`, `DOUBLE`, `DECIMAL` | `float` | |
| `BOOLEAN`, `TINYINT(1)` | `boolean` | |
| `DATE`, `DATETIME`, `TIMESTAMP` | `string` | Use `editor: "date"` or `"datetime"` |
| `JSON`, `JSONB` | `object` | |
| `ENUM` | `string` | Use `options.values` for allowed values |
| Foreign key | `relation` | Set `object_class_id` |
| Embedded doc | `object` | Set `object_class_id` if typed |
| UUID / auto-increment | `unique` | |

---

### Phase 4: Seed Data — Initial Objects

For each class that needs initial/seed data, create `{class}.json`:

```json
[
  {
    "id": "cat-electronics",
    "class_id": "category",
    "name": "Electronics"
  },
  {
    "id": "cat-clothing",
    "class_id": "category",
    "name": "Clothing"
  }
]
```

**Rules for seed data:**
- Every object must have `class_id` matching its class
- `id` is optional (auto-generated if omitted), but recommended for seed data
- Only include data that should exist on first initialization (system defaults, reference data, etc.)

---

### Phase 5: API Mapping — Document Access Patterns

The `api_mapping` section in each genesis file documents how the original project accesses each model. This is critical for the migration agent to understand the integration points.

For each model, document:

| Operation | Description | Example |
|-----------|-------------|---------|
| `get_one` | Fetch a single object by ID | `GET /api/users/{id}` |
| `get_list` | Fetch a list/collection | `GET /api/users` |
| `set_one` | Create or update an object | `POST /api/users` or `PUT /api/users/{id}` |
| `paginator` | Pagination parameters and response format | See below |
| `filters` | Available query parameters | `["status", "role", "created_after"]` |
| `actions` | Custom operations | `POST /api/users/{id}/activate` |

#### Paginator

Always document how the API paginates list responses. Different projects use different patterns:

```json
"paginator": {
  "type": "offset",
  "params": {
    "limit": "_limit",
    "offset": "_offset"
  },
  "response": {
    "items_field": "data",
    "total_field": "total",
    "limit_field": "limit",
    "offset_field": "offset"
  },
  "defaults": {
    "limit": 25,
    "max_limit": 100
  }
}
```

Common paginator types:

| Type | Params | Description |
|------|--------|-------------|
| `offset` | `_limit`, `_offset` | Offset-based (most common). Skip N items, take M. |
| `page` | `page`, `per_page` | Page-based. Page 1, 2, 3... with fixed page size. |
| `cursor` | `cursor`, `limit` | Cursor-based. Use opaque token for next page. |
| `none` | — | API returns all results, no pagination. |

Example for a page-based API:

```json
"paginator": {
  "type": "page",
  "params": {
    "page": "page",
    "per_page": "per_page"
  },
  "response": {
    "items_field": "results",
    "total_field": "count",
    "total_pages_field": "total_pages",
    "current_page_field": "current_page"
  },
  "defaults": {
    "per_page": 20,
    "max_per_page": 100
  }
}
```

---

## Complete Example

For a simple blog project:

### `.es/blog.genesis.json`

```json
{
  "version": "1.0.0",
  "namespace": "blog",
  "description": "Blog platform data model",
  "classes": [
    {
      "id": "post",
      "class_id": "@class",
      "name": "Post",
      "description": "A blog post/article",
      "_version": 1707753600,
      "props": [
        {"key": "title", "label": "Title", "data_type": "string", "required": true, "display_order": 1},
        {"key": "slug", "label": "Slug", "data_type": "string", "required": true, "display_order": 2},
        {"key": "body", "label": "Body", "data_type": "string", "editor": "rich", "display_order": 3},
        {"key": "status", "label": "Status", "data_type": "string", "options": {"type": "string_options", "values": ["draft", "published", "archived"]}, "default_value": "draft", "display_order": 4},
        {"key": "author", "label": "Author", "data_type": "relation", "object_class_id": ["author"], "required": true, "display_order": 5},
        {"key": "tags", "label": "Tags", "data_type": "relation", "is_array": true, "object_class_id": ["tag"], "display_order": 6},
        {"key": "published_at", "label": "Published At", "data_type": "string", "editor": "datetime", "display_order": 7}
      ]
    },
    {
      "id": "author",
      "class_id": "@class",
      "name": "Author",
      "description": "Content author",
      "_version": 1707753600,
      "props": [
        {"key": "name", "label": "Name", "data_type": "string", "required": true, "display_order": 1},
        {"key": "email", "label": "Email", "data_type": "string", "display_order": 2},
        {"key": "bio", "label": "Bio", "data_type": "string", "editor": "textarea", "display_order": 3}
      ]
    },
    {
      "id": "tag",
      "class_id": "@class",
      "name": "Tag",
      "description": "Content tag for categorization",
      "_version": 1707753600,
      "props": [
        {"key": "name", "label": "Name", "data_type": "string", "required": true},
        {"key": "color", "label": "Color", "data_type": "string", "editor": "color"}
      ]
    }
  ],
  "api_mapping": {
    "post": {
      "get_one": "GET /api/posts/{id}",
      "get_list": "GET /api/posts",
      "set_one": "POST /api/posts | PUT /api/posts/{id}",
      "paginator": {
        "type": "offset",
        "params": {"limit": "_limit", "offset": "_offset"},
        "response": {"items_field": "data", "total_field": "total"},
        "defaults": {"limit": 25, "max_limit": 100}
      },
      "filters": ["status", "author", "tag"],
      "actions": ["POST /api/posts/{id}/publish"]
    },
    "author": {
      "get_one": "GET /api/authors/{id}",
      "get_list": "GET /api/authors",
      "set_one": "POST /api/authors | PUT /api/authors/{id}",
      "paginator": {"type": "none"}
    },
    "tag": {
      "get_one": "GET /api/tags/{id}",
      "get_list": "GET /api/tags",
      "set_one": "POST /api/tags | PUT /api/tags/{id}",
      "paginator": {"type": "none"}
    }
  }
}
```

### `.es/tag.json` (seed data)

```json
[
  {"id": "tag-tech", "class_id": "tag", "name": "Technology", "color": "#3498db"},
  {"id": "tag-design", "class_id": "tag", "name": "Design", "color": "#e74c3c"},
  {"id": "tag-tutorial", "class_id": "tag", "name": "Tutorial", "color": "#2ecc71"}
]
```

---

### Phase 6: Load Genesis Data to ElementStore

After creating the `.es/` genesis files, load them into a running ElementStore instance using the seed loader script.

#### Seed Loader Script

Each project's `.es/` directory should include a `load.sh` script:

```bash
#!/bin/bash
# .es/load.sh — Load genesis data from this project into ElementStore
#
# Usage:
#   ./load.sh                                           # Default URL
#   ./load.sh --url=http://localhost:8080                # Custom URL
#   ./load.sh --force                                   # Overwrite existing
#   ./load.sh --dry-run                                 # Show what would be loaded
#   ./load.sh --verify                                  # Verify loaded data

ES_DIR="$(cd "$(dirname "$0")" && pwd)"
API_URL="${ELEMENTSTORE_API_URL:-http://localhost/elementStore}"
FORCE=false
DRY_RUN=false
VERIFY=false

for arg in "$@"; do
  case $arg in
    --url=*) API_URL="${arg#*=}" ;;
    --force) FORCE=true ;;
    --dry-run) DRY_RUN=true ;;
    --verify) VERIFY=true ;;
  esac
done

echo "ElementStore Seed Loader"
echo "========================"
echo "Source: $ES_DIR"
echo "Target: $API_URL"
echo ""

# Check API is accessible
HEALTH=$(curl -s "$API_URL/health")
if [ $? -ne 0 ] || echo "$HEALTH" | grep -q '"error"'; then
  echo "ERROR: Cannot reach ElementStore at $API_URL"
  exit 1
fi
echo "API health: OK"

# Step 1: Load genesis files (class definitions)
echo ""
echo "--- Loading class definitions ---"
for genesis_file in "$ES_DIR"/*.genesis.json; do
  [ -f "$genesis_file" ] || continue
  filename=$(basename "$genesis_file")
  echo "  Processing: $filename"

  # Extract classes array and POST each one
  CLASSES=$(cat "$genesis_file" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for cls in data.get('classes', []):
    print(json.dumps(cls))
" 2>/dev/null)

  while IFS= read -r class_json; do
    [ -z "$class_json" ] && continue
    CLASS_ID=$(echo "$class_json" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")

    if [ "$DRY_RUN" = true ]; then
      echo "    [dry-run] Would load class: $CLASS_ID"
      continue
    fi

    # Check if class exists
    if [ "$FORCE" = false ]; then
      EXISTING=$(curl -s "$API_URL/class/$CLASS_ID")
      if echo "$EXISTING" | grep -q '"id"' && ! echo "$EXISTING" | grep -q '"error"'; then
        # Compare versions
        EXISTING_VER=$(echo "$EXISTING" | python3 -c "import json,sys; print(json.load(sys.stdin).get('_version', 0))" 2>/dev/null)
        NEW_VER=$(echo "$class_json" | python3 -c "import json,sys; print(json.load(sys.stdin).get('_version', 0))" 2>/dev/null)
        if [ "$NEW_VER" -le "$EXISTING_VER" ] 2>/dev/null; then
          echo "    SKIP $CLASS_ID (existing _version=$EXISTING_VER >= new _version=$NEW_VER)"
          continue
        fi
        echo "    UPDATE $CLASS_ID (_version: $EXISTING_VER → $NEW_VER)"
      fi
    fi

    RESULT=$(curl -s -X POST "$API_URL/class" \
      -H "Content-Type: application/json" \
      -d "$class_json")

    if echo "$RESULT" | grep -q '"error"'; then
      echo "    ERROR $CLASS_ID: $RESULT"
    else
      echo "    OK $CLASS_ID"
    fi
  done <<< "$CLASSES"
done

# Step 2: Load seed data (objects)
echo ""
echo "--- Loading seed data ---"
for data_file in "$ES_DIR"/*.json; do
  [ -f "$data_file" ] || continue
  filename=$(basename "$data_file")

  # Skip genesis files and load.sh config
  echo "$filename" | grep -q '\.genesis\.json$' && continue
  [ "$filename" = "genesis.json" ] && continue

  CLASS_ID="${filename%.json}"
  echo "  Processing: $filename (class: $CLASS_ID)"

  OBJECTS=$(cat "$data_file" | python3 -c "
import json, sys
data = json.load(sys.stdin)
items = data if isinstance(data, list) else [data]
for obj in items:
    print(json.dumps(obj))
" 2>/dev/null)

  while IFS= read -r obj_json; do
    [ -z "$obj_json" ] && continue
    OBJ_ID=$(echo "$obj_json" | python3 -c "import json,sys; print(json.load(sys.stdin).get('id', 'auto'))" 2>/dev/null)

    if [ "$DRY_RUN" = true ]; then
      echo "    [dry-run] Would load object: $CLASS_ID/$OBJ_ID"
      continue
    fi

    RESULT=$(curl -s -X POST "$API_URL/store/$CLASS_ID" \
      -H "Content-Type: application/json" \
      -H "X-Allow-Custom-Ids: true" \
      -d "$obj_json")

    if echo "$RESULT" | grep -q '"error"'; then
      echo "    ERROR $OBJ_ID: $RESULT"
    else
      echo "    OK $OBJ_ID"
    fi
  done <<< "$OBJECTS"
done

# Step 3: Verify if requested
if [ "$VERIFY" = true ]; then
  echo ""
  echo "--- Verification ---"
  for genesis_file in "$ES_DIR"/*.genesis.json; do
    [ -f "$genesis_file" ] || continue
    CLASSES=$(cat "$genesis_file" | python3 -c "
import json, sys
for cls in json.load(sys.stdin).get('classes', []):
    print(cls['id'])
" 2>/dev/null)

    while IFS= read -r class_id; do
      [ -z "$class_id" ] && continue
      RESULT=$(curl -s "$API_URL/class/$class_id")
      if echo "$RESULT" | grep -q '"id"' && ! echo "$RESULT" | grep -q '"error"'; then
        PROPS=$(echo "$RESULT" | python3 -c "import json,sys; print(len(json.load(sys.stdin).get('props',[])))" 2>/dev/null)
        echo "  OK $class_id ($PROPS props)"
      else
        echo "  MISSING $class_id"
      fi
    done <<< "$CLASSES"
  done
fi

echo ""
echo "Done."
```

Make it executable:
```bash
chmod +x .es/load.sh
```

**Usage:**
```bash
# Load to local ElementStore
.es/load.sh

# Load to staging
.es/load.sh --url=https://arc3d.dev.agura.tech/elementStore

# Preview what would be loaded
.es/load.sh --dry-run

# Force overwrite existing classes
.es/load.sh --force

# Load and verify
.es/load.sh --verify
```

---

### Phase 7: Sync to Central Genesis Directory

After the migration is complete and verified, copy the genesis files to the main ElementStore genesis directory so they're available to all projects.

#### Rules

1. **Never modify existing files** in `elementStore/genesis/data/` — other projects depend on them
2. **Add new files only** — one file per project namespace
3. **Use `_version` timestamps** to track changes over time
4. **Keep project `.es/` as the source of truth** — central genesis is a copy

#### Directory Structure

```
elementStore/
└── genesis/
    └── data/
        ├── blog.genesis.json           # From blog project
        ├── commerce.genesis.json       # From e-commerce project
        ├── crm.genesis.json            # From CRM project
        └── ...
```

#### Sync Procedure

```bash
# Copy project genesis to central (never overwrite without version check)
PROJECT_ES="project-root/.es"
CENTRAL_GENESIS="elementStore/genesis/data"

for file in "$PROJECT_ES"/*.genesis.json; do
  filename=$(basename "$file")
  target="$CENTRAL_GENESIS/$filename"

  if [ -f "$target" ]; then
    # File exists — compare _version timestamps
    echo "EXISTS: $filename — comparing versions..."
    # Agent should compare _version fields and only update if project version is newer
  else
    echo "NEW: $filename — copying to central genesis"
    cp "$file" "$target"
  fi
done
```

#### Version Tracking with `_version`

Every class definition **must** include a `_version` field — a Unix timestamp indicating when the class was last modified.

```json
{
  "id": "product",
  "class_id": "@class",
  "name": "Product",
  "_version": 1707753600,
  "props": [...]
}
```

**How `_version` works:**

| Scenario | Action |
|----------|--------|
| Project `_version` > central `_version` | Project is newer — update central copy |
| Project `_version` < central `_version` | Central was updated by another project or manually — warn, do not overwrite |
| Project `_version` == central `_version` | In sync — no action needed |
| Central file doesn't exist | New class — copy to central |
| No `_version` field | Treat as `_version: 0` (oldest) |

**When to bump `_version`:**
- When adding/removing/renaming props
- When changing data types or validators
- When modifying class metadata (name, description, extends_id)
- Use current Unix timestamp: `date +%s`

**Do NOT bump `_version` for:**
- Seed data changes (objects, not classes)
- API mapping updates (documentation only)

---

## Agent Checklist

When performing a migration, follow this checklist:

- [ ] **0. Check existing** — Read project `.es/` dir, ElementStore genesis, and live classes
- [ ] **1. Discover** — Read API responses, ORM models, DB schema, or config files
- [ ] **2. Find the base model** — Identify the central entity everything relates to
- [ ] **3. Map all models** — List every model/entity with its properties
- [ ] **4. Map relations** — Document how models connect (1:1, 1:N, N:M, embedded)
- [ ] **5. Map API access** — For each model: get_one, get_list, set_one, paginator
- [ ] **6. Present summary** — Show NEW/EXTEND/UPDATE/MATCH/CONFLICT for each model, ask user to select
- [ ] **7. Resolve conflicts** — For any CONFLICT models, present options and get user decision
- [ ] **8. Create `.es/` directory** — Only after user approves model selection
- [ ] **9. Write genesis files** — One `{namespace}.genesis.json` per module (with `_version` timestamps)
- [ ] **10. Write seed data** — `{class}.json` for any initial/reference data
- [ ] **11. Create `load.sh`** — Seed loader script in `.es/`
- [ ] **12. Load to ElementStore** — Run `load.sh` to populate the running instance
- [ ] **13. Sync to central genesis** — Copy genesis files to `elementStore/genesis/data/` (new files only)
- [ ] **14. Validate** — Ensure all relations reference existing classes, types are correct
- [ ] **15. Document gaps** — Note any models that couldn't be fully mapped

---

## Inheritance

If the project has class hierarchies (e.g., `Vehicle → Car`, `Vehicle → Truck`), use `extends_id`:

```json
{
  "id": "vehicle",
  "class_id": "@class",
  "name": "Vehicle",
  "is_abstract": true,
  "props": [
    {"key": "make", "label": "Make", "data_type": "string", "required": true},
    {"key": "model", "label": "Model", "data_type": "string", "required": true},
    {"key": "year", "label": "Year", "data_type": "integer"}
  ]
}
```

```json
{
  "id": "car",
  "class_id": "@class",
  "name": "Car",
  "extends_id": "vehicle",
  "props": [
    {"key": "doors", "label": "Doors", "data_type": "integer", "default_value": 4},
    {"key": "trunk_size", "label": "Trunk Size (L)", "data_type": "float"}
  ]
}
```

Child classes inherit all parent props automatically. Only define additional or overridden props.

---

## Notes

- `genesis.json` (base) is rarely needed — only when extending `@class` or `@prop` with project-specific meta-properties
- Class IDs should be lowercase, short, and descriptive (e.g., `product`, `order_item`, `user`)
- Property keys should be `snake_case`
- Always include `display_order` for a predictable form layout
- Use `group_name` to organize properties into logical sections in the UI
- Relations use the target class `id`, not its name
- **Always include `_version`** (Unix timestamp) on every class definition
- **Always check existing classes first** — reuse and extend before creating new ones
- **Never modify existing genesis files** in the central directory — add new files only
- The project `.es/` directory is the **source of truth** — central genesis is a synchronized copy
- When in doubt about a class format, query the live ElementStore API: `GET /class/{id}`

## Related Files

| File | Description |
|------|-------------|
| `genesis/Genesis.php` | Core genesis initialization (system classes) |
| `genesis/init.php` | CLI script for genesis operations |
| `genesis/data/` | Central genesis directory for all project genesis files |
| `src/ClassModel.php` | Class model with validation and change detection |
| `src/Constants.php` | All data types, editor types, validator types |
