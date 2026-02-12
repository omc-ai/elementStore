# ElementStore Docker Setup

> Part of [ElementStore](https://github.com/omc-ai/elementStore) — see main README for project overview.

Docker configuration for running ElementStore with PHP + Phalcon and CouchDB.

## Services

| Service | Description | Port |
|---------|-------------|------|
| `php` | PHP 8.3 + Phalcon 5.x API server | 8080 |
| `couchdb` | CouchDB 3.x document store | 5984 |
| `ws` | Node.js WebSocket server (real-time sync) | 19008 → 3100 |

## Quick Start

```bash
# Navigate to docker directory
cd backend/elementStore/docker

# Copy environment file
cp .env.example .env

# Start all services
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f
```

## Endpoints

- **API**: http://localhost:8080
  - Health: http://localhost:8080/health
  - Info: http://localhost:8080/info

- **CouchDB**: http://localhost:5984
  - Fauxton UI: http://localhost:5984/_utils
  - Default credentials: `admin` / `elementstore`

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TZ` | UTC | Timezone |
| `PHP_PORT` | 8080 | PHP API server port |
| `COUCHDB_PORT` | 5984 | CouchDB port |
| `COUCHDB_USER` | admin | CouchDB admin username |
| `COUCHDB_PASSWORD` | elementstore | CouchDB admin password |

### Storage Configuration

The PHP container uses `init-couchdb.json` which configures CouchDB as the storage backend:

```json
{
  "@storage": {
    "bootstrap": {
      "type": "couchdb",
      "server": "http://couchdb:5984",
      "username": "admin",
      "password": "elementstore"
    }
  }
}
```

To use JSON file storage instead, mount a different `@init.json`:

```yaml
volumes:
  - ./init-json.json:/var/www/elementStore/@init.json:ro
```

## Building Images

```bash
# Build PHP image
docker build -f Dockerfile.php -t elementstore-php .

# Build CouchDB image
docker build -f Dockerfile.couchdb -t elementstore-couchdb .

# Or build both via compose
docker-compose build
```

## Development

### Rebuild after code changes

```bash
# Rebuild and restart PHP container
docker-compose up -d --build php
```

### Access container shell

```bash
# PHP container
docker exec -it elementstore_php bash

# CouchDB container
docker exec -it elementstore_couchdb bash
```

### View logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f php
docker-compose logs -f couchdb
```

## Network

Services communicate on the `elementstore_network` bridge network:

- PHP can reach CouchDB at `http://couchdb:5984`
- Both services are accessible from host via mapped ports

## Volumes

| Volume | Purpose |
|--------|---------|
| `elementstore_data` | JSON storage (if using JsonStorageProvider) |
| `elementstore_couchdb_data` | CouchDB persistent data |

### Backup CouchDB data

```bash
# Export all databases
docker exec elementstore_couchdb \
  curl -X GET http://admin:elementstore@localhost:5984/_all_dbs

# Use CouchDB replication for backup
```

### Reset data

```bash
# Remove volumes (WARNING: deletes all data!)
docker-compose down -v
```

## Troubleshooting

### CouchDB not starting

Check if port 5984 is already in use:
```bash
lsof -i :5984
```

### PHP can't connect to CouchDB

Ensure CouchDB is healthy before PHP starts (configured in docker-compose.yml).
Check network connectivity:
```bash
docker exec elementstore_php curl http://couchdb:5984/_up
```

### Permission issues

Ensure data directories have proper permissions:
```bash
docker exec elementstore_php chown -R www-data:www-data /var/www/data
```

## WebSocket Server

The `ws` service (defined in `docker-compose.agura.yml`) provides real-time sync between ElementStore clients.

- **Internal**: `http://elementstore-ws:3100` (used by PHP to broadcast)
- **External**: port `19008` on host, or via nginx proxy at `/elementStore/ws`

The WS server is stateless — no persistence needed. It receives broadcast events from PHP via HTTP POST `/broadcast` and fans them out to subscribed WebSocket clients.

```bash
# Build and start the WS service
docker compose -f docker-compose.agura.yml up -d --build ws

# Check WS server health
curl http://localhost:19008/health

# Test with wscat
wscat -c ws://arc3d.master.local/elementStore/ws
```

## Compose Variants

| File | Use Case | Volume |
|---|---|---|
| `docker/docker-compose.yml` | Standalone development | Local bind mount |
| `docker-compose.agura.yml` | Local Agura integration | `agura_code` named volume |
| `docker-compose.staging.yml` | Staging server | `/var/www` bind mount |

The staging variant uses bind mounts because the staging server maps `/var/www` directly (not a Docker named volume).

The `ws` service is included in `docker-compose.agura.yml` and `docker-compose.staging.yml`. It uses the `elementstore-ws` network alias so PHP can reach it at `http://elementstore-ws:3100`.

## Production Considerations

1. **Change CouchDB credentials** in `.env`
2. **Enable CouchDB authentication**: Set `require_valid_user = true` in `couchdb-local.ini`
3. **Use HTTPS**: Add SSL termination via reverse proxy
4. **Backup strategy**: Set up CouchDB replication or regular dumps
5. **Resource limits**: Add memory/CPU limits in docker-compose.yml
