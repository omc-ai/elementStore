# ElementStore

A schema-driven object store where **classes are objects too**. Define your data model at runtime through the same API you use to store data — no migrations, no code generation.

## What Is It?

ElementStore is a self-describing data system built on one core idea: **everything is an object**, including the schema itself. Classes (`@class`), properties (`@prop`), and storage configuration (`@storage`) are all stored and managed as regular objects.

This means you can:
- Define a `user` class with properties like `name`, `email`, `role` — all through the API
- Inherit from existing classes via `extends_id`
- Rename a property or class, and all existing data updates automatically
- Query, filter, and sort objects with a simple REST interface
- Use it from the browser with the JavaScript client, or from the server via the PHP API

## Architecture

```
┌──────────────────────────────────────────────────────┐
│  REST API (index.php / Phalcon Micro)                │
│    ↓                                                 │
│  ClassModel (validation, change detection, schema)   │
│    ↓                                                 │
│  IStorageProvider (pluggable persistence)             │
│    ↓                                                 │
│  JSON files / MongoDB / CouchDB                      │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│  Browser (element-store.js)                          │
│    ElementStore ←→ AtomObj ←→ AtomProp               │
│    AtomElement (DOM-bound objects via ui-element.js)  │
│    Syncs with REST API via XHR                       │
└──────────────────────────────────────────────────────┘
```

## Core Concepts

### System Classes (Meta-Objects)

| Class | Purpose |
|-------|---------|
| `@class` | Class definitions — has `name`, `extends_id`, `props` |
| `@prop` | Property definitions — has `key`, `data_type`, `required`, `validators`, etc. |
| `@storage` | Storage configuration — has `type`, `url` |

### Data Types

`string`, `boolean`, `integer`, `float`, `object`, `relation`, `function`

### Property Features

- **Inheritance** — classes inherit props from parent via `extends_id`
- **Relations** — `data_type: relation` links objects across classes (one-to-one, one-to-many)
- **Nested objects** — `data_type: object` with optional `object_class_id`
- **Validation** — `required`, `validators` array (email, regex, range, unique, etc.)
- **UI hints** — `editor`, `options`, `display_order`, `group_name`, `hidden`
- **Defaults** — `default_value` applied on object creation

## Quick Start

### Docker (Recommended)

```bash
cd docker
cp .env.example .env
docker-compose up -d
```

API available at `http://localhost:8080`.

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

### JavaScript Client (Browser)

Include the scripts and you get a live store connected to the API:

```html
<script src="element-store.js"></script>
<script src="ui-element.js"></script>
```

```javascript
// store is auto-initialized and connected to the API
var user = store.getClass('user');
console.log(user.getProps());  // all prop definitions (including inherited)

// Create and save an object
var obj = new AtomObj({class_id: 'user', name: 'Alice'}, store);
obj.save();

// Objects are proxied — property access goes through type coercion
obj.name;    // → String (via AtomProp.getPropValue)
obj.name = 'Bob';
obj.save();

// Change tracking
obj.hasChanges();   // false (just saved)
obj.name = 'Carol';
obj.hasChanges();   // true
obj.getChanges();   // {name: 'Carol'}

// Relations resolve to actual objects
var order = store.getObject('order-1');
order.customer;     // → AtomObj (fetched via relation)

// Collections for array properties
var cls = store.getClass('user');
cls.props;          // → AtomCollection (iterable, filterable)
cls.props.get('email');  // → AtomProp by key

// DOM-bound elements (ui-element.js)
var el = new AtomObj({class_id: 'ui-element', x: 100, y: 50, width: 200, height: 100}, store);
el.bind(document.getElementById('my-div'));
el.syncToDom();     // pushes x/y/width/height to CSS
```

Open `test.html` for an interactive demo.

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

## Storage Providers

ElementStore ships with three storage backends:

| Provider | Best For | Config |
|----------|----------|--------|
| **JsonStorageProvider** | Development, small datasets | One JSON file per class in `data/` |
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

## Project Structure

```
elementStore/
├── index.php              # REST API router (Phalcon Micro)
├── autoload.php           # PSR-4 autoloader
├── @init.json             # Storage configuration
├── element-store.js       # JavaScript client (browser + Node.js)
├── ui-element.js          # DOM-bound AtomElement extension
├── test.html              # Interactive browser demo
├── test.sh                # API test suite (curl-based)
├── package.json
├── src/
│   ├── ClassModel.php     # Core orchestration layer
│   ├── AtomObj.php        # Base object with extraData support
│   ├── Prop.php           # Property definition with validation
│   ├── ClassMeta.php      # Class definition metadata
│   ├── Constants.php      # System constants (types, editors, validators)
│   ├── IStorageProvider.php       # Storage interface
│   ├── JsonStorageProvider.php    # JSON file storage
│   ├── MongoStorageProvider.php   # MongoDB storage
│   ├── CouchDbStorageProvider.php # CouchDB storage
│   ├── StorageException.php       # Typed exceptions
│   └── SystemClasses.php         # Bootstrap system class definitions
├── genesis/               # Seed data and initialization
│   ├── Genesis.php
│   ├── init.php
│   └── test.php
├── admin/                 # Admin UI
│   └── index.html
└── docker/                # Docker setup (PHP + CouchDB)
    ├── docker-compose.yml
    ├── Dockerfile.php
    ├── Dockerfile.couchdb
    └── README.md
```

## License

MIT
