<?php
/**
 * StorageProvider — unified storage with type-based driver and provider pipeline.
 *
 * Maps directly to the @storage class in elementStore.
 * One class handles single storage and pipeline (no separate Composite class).
 *
 * @init.json → new StorageProvider($config) → ready to use.
 */

namespace ElementStore;

class StorageProvider implements IStorageProvider
{
    private string $type;
    private IStorageProvider $driver;
    private array $providers = [];
    private string $method;
    private array $classes = [];

    /**
     * @param array  $config  @storage object: type, server, dir, auth, providers[], method
     * @param string $basePath Base path for resolving relative directories
     */
    public function __construct(array $config, string $basePath = '')
    {
        $this->type = $config['type'] ?? 'json';
        $this->method = $config['method'] ?? 'sync';
        $this->classes = $config['classes'] ?? [];

        // Create driver based on type
        $this->driver = self::createDriver($this->type, $config, $basePath);

        // Build sub-providers (recursive — each is a StorageProvider)
        foreach ($config['providers'] ?? [] as $provConfig) {
            if (is_array($provConfig)) {
                $this->providers[] = new self($provConfig, $basePath);
            }
        }
    }

    /**
     * Create a type-specific driver.
     */
    private static function createDriver(string $type, array $config, string $basePath): IStorageProvider
    {
        $auth = $config['auth'] ?? [];

        // Environment variable overrides for CouchDB
        if ($type === 'couchdb') {
            $envUser = getenv('COUCHDB_USER');
            if ($envUser !== false && $envUser !== '') $auth['username'] = $envUser;
            $envPass = getenv('COUCHDB_PASSWORD');
            if ($envPass !== false && $envPass !== '') $auth['password'] = $envPass;
            $envServer = getenv('COUCHDB_SERVER');
            if ($envServer !== false && $envServer !== '') $config['server'] = $envServer;
        }

        return match ($type) {
            'couchdb' => new CouchDbStorageProvider(
                $config['server'] ?? 'http://localhost:5984',
                $auth['username'] ?? null,
                $auth['password'] ?? null
            ),
            'json' => new JsonStorageProvider(
                self::resolveDir($config['dir'] ?? Constants::ES_DIR, $basePath)
            ),
            'mongo' => new MongoStorageProvider(
                $config['server'] ?? 'mongodb://localhost:27017',
                $config['database'] ?? 'elementstore'
            ),
            'redis' => new RedisStorageProvider(
                $config['server'] ?? 'localhost',
                (int)($config['port'] ?? 6379),
                $config['prefix'] ?? 'es:',
                (int)($config['ttl'] ?? 0)
            ),
            'api' => new ApiStorageProvider($config),
            'ws' => new WebSocketStorageProvider(),
            default => throw new StorageException("Unknown storage type: {$type}", 'config_error')
        };
    }

    private static function resolveDir(string $dir, string $basePath): string
    {
        if (str_starts_with($dir, '/')) return $dir;
        return $basePath ? ($basePath . '/' . $dir) : $dir;
    }

    /**
     * Check if this storage supports an action for a given class.
     * Walks up the class hierarchy: if "@class" is declared, all child classes are supported.
     * Empty classes = supports everything (no restriction).
     */
    public function supportsAction(string $class, string $action): bool
    {
        if (empty($this->classes)) return true;

        // Check exact class
        $actions = $this->classes[$class] ?? null;
        if ($actions !== null) {
            return is_array($actions) && in_array($action, $actions, true);
        }

        // Check @class (serves all classes)
        $actions = $this->classes[Constants::K_CLASS] ?? null;
        if ($actions !== null) {
            return is_array($actions) && in_array($action, $actions, true);
        }

        return false;
    }

    // ─── IStorageProvider Interface ──────────────────────────────

    public function getobj(string $class, mixed $id = null): array|null
    {
        // Try driver first
        try {
            $result = $this->driver->getobj($class, $id);
            if ($result !== null && (!is_array($result) || !empty($result))) {
                return $result;
            }
        } catch (\Throwable $e) {
            // Driver failed — fall through to providers
        }

        // Fallback: try each provider that supports "get" for this class
        foreach ($this->providers as $provider) {
            if (!$provider->supportsAction($class, 'get')) continue;
            try {
                $result = $provider->getobj($class, $id);
                if ($result !== null && (!is_array($result) || !empty($result))) {
                    // Sync: save through the pipeline (driver + providers that support set)
                    if ($this->method === 'sync' && $id !== null) {
                        try {
                            $this->setobj($class, $result);
                        } catch (\Throwable $e) {
                            // Sync-back failed — not critical
                        }
                    }
                    return $result;
                }
            } catch (\Throwable $e) {
                continue;
            }
        }

        return $id === null ? [] : null;
    }

    public function setobj(string $class, array $obj): array
    {
        // Write to driver (must succeed)
        $result = $this->driver->setobj($class, $obj);

        // Write to providers that support "set" for this class (best-effort)
        foreach ($this->providers as $provider) {
            if (!$provider->supportsAction($class, 'set')) continue;
            try {
                $provider->setobj($class, $result);
            } catch (\Throwable $e) {
                error_log("[StorageProvider] provider setobj failed for {$class}: " . $e->getMessage());
            }
        }

        return $result;
    }

    public function delobj(string $class, mixed $id): bool
    {
        $deleted = $this->driver->delobj($class, $id);

        // Delete from providers that support "delete" for this class
        foreach ($this->providers as $provider) {
            if (!$provider->supportsAction($class, 'delete')) continue;
            try {
                $provider->delobj($class, $id);
            } catch (\Throwable $e) {
                // Ignore
            }
        }

        return $deleted;
    }

    public function query(string $class, array $filters = [], array $options = []): array
    {
        // Query runs on driver first
        try {
            $results = $this->driver->query($class, $filters, $options);
            if (!empty($results)) return $results;
        } catch (\Throwable $e) {}

        // Fallback: try providers that support "query" for this class
        foreach ($this->providers as $provider) {
            if (!$provider->supportsAction($class, 'query')) continue;
            try {
                $results = $provider->query($class, $filters, $options);
                if (!empty($results)) return $results;
            } catch (\Throwable $e) {
                continue;
            }
        }

        return [];
    }

    // ─── Schema Operations ───────────────────────────────────────

    public function renameProp(string $classId, string $oldKey, string $newKey): int
    {
        $count = $this->driver->renameProp($classId, $oldKey, $newKey);
        foreach ($this->providers as $provider) {
            try { $provider->renameProp($classId, $oldKey, $newKey); } catch (\Throwable $e) {}
        }
        return $count;
    }

    public function renameClass(string $oldClassId, string $newClassId): int
    {
        $count = $this->driver->renameClass($oldClassId, $newClassId);
        foreach ($this->providers as $provider) {
            try { $provider->renameClass($oldClassId, $newClassId); } catch (\Throwable $e) {}
        }
        return $count;
    }

    // ─── Tenant ──────────────────────────────────────────────────

    public function setTenantId(?string $tenantId): void
    {
        if (method_exists($this->driver, 'setTenantId')) {
            $this->driver->setTenantId($tenantId);
        }
        foreach ($this->providers as $provider) {
            if (method_exists($provider, 'setTenantId')) {
                $provider->setTenantId($tenantId);
            }
        }
    }
}
