# ElementStore

> **Registry**: This project is registered in the [platform_root elementStore registry](../platform_root/README.md).
> **Registry ID**: `elementStore` (class: `@project`)
> **Registry data**: [`platform_root/db/elementStore/@project.json`](../platform_root/db/elementStore/@project.json)
> **Quick reference**: [`platform_root/docs/ELEMENTSTORE_REGISTRY_GUIDE.md`](../platform_root/docs/ELEMENTSTORE_REGISTRY_GUIDE.md)

**Repository**: https://github.com/omc-ai/elementStore

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
│    ↓              ↓ broadcast                        │
│  IStorageProvider  BroadcastService → WS Server      │
│    ↓                                   ↓ push        │
│  JSON / MongoDB / CouchDB        Subscribed clients  │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│  Browser (element-store.js + ws-client.js)           │
│    ElementStore ←→ AtomObj ←→ AtomProp               │
│    ElementStoreWS ←→ WebSocket (real-time sync)      │
│    AtomElement (DOM-bound objects via ui-element.js)  │
│    Syncs with REST API via XHR + WS for live updates │
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

### JavaScript Client (Browser)

Include the scripts and you get a live store connected to the API:

```html
<script src="admin/element-store.js"></script>
<script src="admin/ui-element.js"></script>
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

Open `admin/test.html` for an interactive demo.

### WebSocket Real-Time Sync

ElementStore includes a WebSocket server that pushes changes to all subscribed clients in real-time. When any client saves or deletes an object via the REST API, the change is broadcast to every other connected client.

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
      "email": "john@example.com",
      "_old": { "id": "john123", "class_id": "user", "name": "John", "email": "john@example.com" }
    }
  ]
}
```

- Each item IS the new object data (id, class_id, all fields)
- `_old` contains previous values (omitted for new objects)
- `_deleted: true` marks a deletion
- Multiple items can be delivered in a single message

**Connect and subscribe:**

```html
<script src="admin/element-store.js"></script>
<script src="admin/ws-client.js"></script>
```

```javascript
// Connect to WebSocket
var esws = new ElementStoreWS(store, 'ws://' + location.host + '/elementStore/ws');
esws.connect();

// Subscribe to all changes for a class
esws.subscribe('user');

// Subscribe to a specific object
esws.subscribeObject('user', 'john123');

// Listen for events — each item from the items array
esws.on('change', function(item) {
    console.log('Changed:', item.class_id, item.id, item._old);
});
esws.on('delete', function(item) {
    console.log('Deleted:', item.class_id, item.id);
});
```

**Sender echo suppression:** The saving client automatically sends its WS connection ID via `X-WS-Connection-Id` header. The WS server skips that connection when broadcasting, so the saver doesn't receive its own change back.

**Auto-reconnect:** The client reconnects automatically with exponential backoff (1s → 2s → 4s → max 30s) and re-subscribes to all tracked classes/objects.

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

## Documentation

| Document | Description |
|----------|-------------|
| [Migration Procedure](docs/MIGRATION_PROCEDURE.md) | How to migrate any project to ElementStore (`.es/` genesis files) |
| [Docker Setup](docker/README.md) | Docker service configuration and troubleshooting |

## Project Structure

```
elementStore/
├── index.php              # REST API router (Phalcon Micro)
├── autoload.php           # PSR-4 autoloader
├── @init.json             # Storage configuration (JSON provider)
├── @init.couchdb.json     # Storage configuration (CouchDB provider)
├── test.sh                # API test suite (curl-based)
├── package.json
├── docker-compose.agura.yml  # Agura platform integration compose
├── src/
│   ├── ClassModel.php     # Core orchestration layer
│   ├── ClassModel.v1.php  # Legacy v1 class model
│   ├── AtomObj.php        # Base object with extraData support
│   ├── Prop.php           # Property definition with validation
│   ├── ClassMeta.php      # Class definition metadata
│   ├── Constants.php      # System constants (types, editors, validators)
│   ├── BroadcastService.php       # WS broadcast (fire-and-forget POST)
│   ├── IStorageProvider.php       # Storage interface
│   ├── JsonStorageProvider.php    # JSON file storage
│   ├── MongoStorageProvider.php   # MongoDB storage
│   ├── CouchDbStorageProvider.php # CouchDB storage
│   ├── StorageException.php       # Typed exceptions
│   └── SystemClasses.php         # Bootstrap system class definitions
├── ws/                    # WebSocket real-time sync server (Node.js)
│   ├── server.js          # WS server + HTTP /broadcast endpoint
│   └── package.json
├── genesis/               # Seed data and initialization
│   ├── Genesis.php
│   ├── init.php
│   └── test.php
├── admin/                 # Admin UI and JavaScript client
│   ├── index.html         # Admin dashboard
│   ├── element-store.js   # JavaScript client (browser + Node.js)
│   ├── ws-client.js       # WebSocket client (ElementStoreWS)
│   ├── ui-element.js      # DOM-bound AtomElement extension
│   └── test.html          # Interactive browser demo
└── docker/                # Docker setup (PHP + CouchDB + WS)
    ├── docker-compose.yml
    ├── docker-compose.couchdb.yml  # CouchDB-specific compose
    ├── Dockerfile.php
    ├── Dockerfile.fpm             # PHP-FPM variant
    ├── Dockerfile.ws              # Node.js WS server
    ├── Dockerfile.couchdb
    ├── apache-vhost.conf          # Apache virtual host config
    ├── couchdb-local.ini          # CouchDB local settings
    ├── init-couchdb.json          # CouchDB initialization data
    ├── .env.example               # Environment template
    └── README.md
```

## License

MIT
