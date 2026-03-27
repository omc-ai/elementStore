<?php
/**
 * ElementStore ClassModel
 *
 * Main orchestration layer for ElementStore. ClassModel is the "smart" layer
 * that handles validation, change detection, and coordinates storage operations.
 *
 * ARCHITECTURE OVERVIEW:
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  API Layer (index.php)                                                      │
 * │    ↓                                                                        │
 * │  ClassModel (smart - validation, change detection, orchestration)           │
 * │    ↓                                                                        │
 * │  IStorageProvider (dumb - raw CRUD operations)                              │
 * │    ↓                                                                        │
 * │  JSON files / MongoDB / CouchDB (persistence)                               │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * KEY CONCEPTS:
 * - Classes are objects too: stored in @class with class_id = @class
 * - Everything flows through setObject(), including class definitions
 * - Change detection happens BEFORE save, not after
 * - Renames are detected and propagated automatically
 * - Objects are returned as AtomObj instances (not raw arrays)
 *
 * USAGE:
 * ```php
 * // Boot from config file
 * $model = ClassModel::boot(__DIR__);
 *
 * // Or create with explicit storage
 * $model = new ClassModel(new JsonStorageProvider('/path/to/data'));
 *
 * // CRUD operations - returns AtomObj instances
 * $user = $model->setObject('user', ['name' => 'John']);
 * $user = $model->getObject('user', $user->id);
 * $users = $model->query('user', ['status' => 'active']);
 * $model->deleteObject('user', $user->id);
 * ```
 *
 * @package ElementStore
 */

namespace ElementStore;

/**
 * ClassModel - Main registry and orchestration layer
 */
class ClassModel
{
    /** @var IStorageProvider Storage backend */
    private IStorageProvider $storage;

    /** @var array<string, AtomObj> Object cache [class_id][id] => AtomObj */
    private array $objectCache = [];

    /** @var bool Has bootstrap been run */
    private bool $bootstrapped = false;

    /** @var string Base path for config files */
    private string $basePath;

    /** @var bool Auto-create classes when saving to unknown class */
    public bool $auto_create_class = false;

    /** @var bool Auto-add properties when saving object with unknown keys */
    public bool $auto_add_prop = false;

    /** @var mixed Current user ID (owner of objects) */
    private mixed $userId = null;

    /** @var array Current user roles — used for access-control checks (e.g. CLI action guard) */
    private array $userRoles = [];

    /** @var mixed Application ID for multi-tenant isolation */
    private mixed $appId = null;

    /** @var mixed Domain for multi-tenant isolation */
    private mixed $domain = null;

    /** @var mixed Tenant ID for tenant-scoped data routing and isolation */
    private mixed $tenantId = null;

    /** @var bool Enforce owner_id filtering on getObject */
    private bool $enforceOwnership = true;

    /** @var bool Allow custom IDs when creating objects (for seeding/testing) */
    private bool $allowCustomIds = false;

    /** @var bool Skip auth (set by system secret or dev mode bypass in index.php) */
    public bool $skipAuth = false;

    /** @var bool Cast object structure on read (normalize arrays, fill defaults) */
    private bool $castOnRead = true;

    /** @var bool Fill missing fields with default values on read */
    private bool $fillDefaults = true;

    /** @var bool Throw exception on breaking schema changes (e.g., object_class_id change) */
    private bool $strictSchemaChanges = false;

    /** @var \Phalcon\Di\DiInterface|null DI container */
    private ?\Phalcon\Di\DiInterface $di = null;

    /** @var array Genesis configuration from @init.json */
    private array $genesisConfig = ['mode' => 'local', 'url' => null, 'auto_load' => true];

    /** @var string Path to the .es/ directory */
    private string $esDir = '';

    /** @var GenesisLoader|null Genesis loader instance */
    private ?GenesisLoader $genesisLoader = null;


    // =========================================================================
    // CONSTRUCTOR & BOOT
    // =========================================================================

    /**
     * Create ClassModel with storage provider
     *
     * @param IStorageProvider             $storage  Storage backend
     * @param string                       $basePath Base path for config files
     * @param mixed                        $userId   Current user ID (will be set as owner_id on new objects)
     * @param \Phalcon\Di\DiInterface|null $di       DI container
     */
    public function __construct(
        IStorageProvider $storage,
        string $basePath = '',
        mixed $userId = null,
        ?\Phalcon\Di\DiInterface $di = null
    ) {
        $this->storage = $storage;
        $this->basePath = $basePath;
        $this->userId = $userId;
        // DI is optional - use default if available
        if ($di !== null) {
            $this->di = $di;
        } elseif (class_exists('\Phalcon\Di\Di')) {
            $this->di = \Phalcon\Di\Di::getDefault();
        }
    }

    /**
     * Boot ClassModel from @init.json configuration
     *
     * @param string $basePath Directory containing @init.json
     * @param mixed  $userId   Optional user ID for ownership
     *
     * @return self Configured ClassModel instance
     */
    public static function boot(string $basePath, mixed $userId = null): self
    {
        $initFile = $basePath . '/@init.json';
        $esDir = $basePath . '/' . Constants::ES_DIR;

        // Default storage config — .es/ is the default data directory
        $storageConfig = [
            'type' => 'json',
            'data_dir' => Constants::ES_DIR,
        ];

        // Default genesis config
        $genesisConfig = [
            'mode' => 'local',
            'url' => null,
            'auto_load' => true,
        ];

        // Load from @init.json if exists
        if (file_exists($initFile)) {
            $initData = json_decode(file_get_contents($initFile), true);
            if (isset($initData[Constants::K_STORAGE]['bootstrap'])) {
                $storageConfig = array_merge($storageConfig, $initData[Constants::K_STORAGE]['bootstrap']);
            }
            if (isset($initData['genesis'])) {
                $genesisConfig = array_merge($genesisConfig, $initData['genesis']);
            }
        }

        // Environment variable overrides for genesis config
        $envUrl = getenv(Constants::ENV_GENESIS_URL);
        if ($envUrl !== false && $envUrl !== '') {
            $genesisConfig['url'] = $envUrl;
        }
        $envMode = getenv(Constants::ENV_GENESIS_MODE);
        if ($envMode !== false && $envMode !== '') {
            $genesisConfig['mode'] = $envMode;
        }

        // Environment variable overrides for storage credentials
        $envCouchUser = getenv('COUCHDB_USER');
        if ($envCouchUser !== false && $envCouchUser !== '') {
            $storageConfig['username'] = $envCouchUser;
        }
        $envCouchPass = getenv('COUCHDB_PASSWORD');
        if ($envCouchPass !== false && $envCouchPass !== '') {
            $storageConfig['password'] = $envCouchPass;
        }
        $envCouchServer = getenv('COUCHDB_SERVER');
        if ($envCouchServer !== false && $envCouchServer !== '') {
            $storageConfig['server'] = $envCouchServer;
        }

        // Resolve relative paths — data_dir is relative to basePath
        if (isset($storageConfig['data_dir']) && !str_starts_with($storageConfig['data_dir'], '/')) {
            $storageConfig['data_dir'] = $basePath . '/' . $storageConfig['data_dir'];
        }

        // Resolve .es/ directory path
        $resolvedEsDir = $storageConfig['data_dir'];

        // Create storage provider based on type
        $storage = match ($storageConfig['type'] ?? 'json') {
            'mongo' => new MongoStorageProvider(
                $storageConfig['connection'] ?? 'mongodb://localhost:27017',
                $storageConfig['database'] ?? 'elementstore'
            ),
            'couchdb' => new CouchDbStorageProvider(
                $storageConfig['server'] ?? 'http://localhost:5984',
                $storageConfig['username'] ?? null,
                $storageConfig['password'] ?? null
            ),
            'composite' => self::createCompositeStorage($storageConfig, $basePath),
            default => new JsonStorageProvider($storageConfig['data_dir'])
        };

        $model = new self($storage, $basePath, $userId);
        $model->genesisConfig = $genesisConfig;
        $model->esDir = $resolvedEsDir;

        return $model;
    }

    /**
     * Create a CompositeStorageProvider from config
     *
     * Config format:
     *   type: "composite"
     *   read: [{ type: "couchdb", server: "...", ... }, ...]
     *   write: [{ type: "couchdb", ... }, { type: "json", dir: "/path" }]
     *   read_strategy: "fallback" | "merge"
     *   write_strategy: "sequential" | "parallel" | "best_effort"
     */
    private static function createCompositeStorage(array $config, string $basePath): CompositeStorageProvider
    {
        $readSources = [];
        foreach ($config['read'] ?? [] as $src) {
            $readSources[] = self::createSingleStorage($src, $basePath);
        }
        $writeTargets = [];
        foreach ($config['write'] ?? [] as $tgt) {
            $writeTargets[] = self::createSingleStorage($tgt, $basePath);
        }

        if (empty($readSources)) {
            throw new StorageException('Composite storage requires at least one read source', 'config_error');
        }
        if (empty($writeTargets)) {
            throw new StorageException('Composite storage requires at least one write target', 'config_error');
        }

        return new CompositeStorageProvider(
            $readSources,
            $writeTargets,
            $config['read_strategy'] ?? 'fallback',
            $config['write_strategy'] ?? 'sequential'
        );
    }

    /**
     * Create a single storage provider from a config block
     */
    private static function createSingleStorage(array $config, string $basePath): IStorageProvider
    {
        $type = $config['type'] ?? 'json';

        // Apply environment variable overrides for CouchDB credentials
        // This ensures @init.json default values can be safely overridden at deploy time
        if ($type === 'couchdb') {
            $envUser = getenv('COUCHDB_USER');
            if ($envUser !== false && $envUser !== '') {
                $config['username'] = $envUser;
            }
            $envPass = getenv('COUCHDB_PASSWORD');
            if ($envPass !== false && $envPass !== '') {
                $config['password'] = $envPass;
            }
            $envServer = getenv('COUCHDB_SERVER');
            if ($envServer !== false && $envServer !== '') {
                $config['server'] = $envServer;
            }
        }

        return match ($type) {
            'mongo' => new MongoStorageProvider(
                $config['connection'] ?? 'mongodb://localhost:27017',
                $config['database'] ?? 'elementstore'
            ),
            'couchdb' => new CouchDbStorageProvider(
                $config['server'] ?? 'http://localhost:5984',
                $config['username'] ?? null,
                $config['password'] ?? null
            ),
            'json' => new JsonStorageProvider(
                self::resolveDir($config['dir'] ?? Constants::ES_DIR, $basePath)
            ),
            'redis' => new RedisStorageProvider(
                $config['host'] ?? 'localhost',
                (int)($config['port'] ?? 6379),
                $config['prefix'] ?? 'es:',
                (int)($config['ttl'] ?? 0)
            ),
            'api' => new ApiStorageProvider($config),
            default => throw new StorageException("Unknown storage type: {$type}", 'config_error')
        };
    }

    /**
     * Resolve a directory path — absolute paths pass through, relative paths resolve from basePath
     */
    private static function resolveDir(string $dir, string $basePath): string
    {
        return str_starts_with($dir, '/') ? $dir : $basePath . '/' . $dir;
    }

    // =========================================================================
    // CONFIGURATION METHODS
    // =========================================================================

    /**
     * Get DI container
     */
    public function getDi(): ?\Phalcon\Di\DiInterface
    {
        if ($this->di !== null) {
            return $this->di;
        }
        if (class_exists('\Phalcon\Di\Di')) {
            return \Phalcon\Di\Di::getDefault();
        }
        return null;
    }

    /**
     * Set current user ID
     */
    public function setUserId(mixed $userId): self
    {
        $this->userId = $userId;
        return $this;
    }

    /**
     * Get current user ID
     */
    public function getUserId(): mixed
    {
        return $this->userId;
    }

    /**
     * Set current user roles — called after JWT verification to enable role-based guards
     *
     * @param array $roles Array of role strings (e.g. ['admin', 'viewer'])
     */
    public function setUserRoles(array $roles): self
    {
        $this->userRoles = $roles;
        return $this;
    }

    /**
     * Get current user roles
     */
    public function getUserRoles(): array
    {
        return $this->userRoles;
    }

    /**
     * Set full security context (user, app, domain) — called from JWT parsing
     */
    public function setSecurityContext(mixed $userId, mixed $appId, mixed $domain): self
    {
        $this->userId = $userId;
        $this->appId = $appId;
        $this->domain = $domain;
        return $this;
    }

    /**
     * Set tenant ID for tenant-scoped routing
     *
     * When set, all reads filter by tenant_id and all new objects are stamped with tenant_id.
     * System classes (@class, @prop, etc.) are excluded from tenant filtering.
     */
    public function setTenantId(mixed $tenantId): self
    {
        $this->tenantId = $tenantId;
        // Propagate to storage provider if it supports tenant-scoped routing
        if (method_exists($this->storage, 'setTenantId')) {
            $this->storage->setTenantId($tenantId);
        }
        return $this;
    }

    /**
     * Get current tenant ID
     */
    public function getTenantId(): mixed
    {
        return $this->tenantId;
    }

    /**
     * Get current app ID
     */
    public function getAppId(): mixed
    {
        return $this->appId;
    }

    /**
     * Get current domain
     */
    public function getDomain(): mixed
    {
        return $this->domain;
    }

    /**
     * Enable/disable ownership enforcement
     */
    public function setEnforceOwnership(bool $enforce): self
    {
        $this->enforceOwnership = $enforce;
        return $this;
    }

    /**
     * Enable/disable custom IDs for creation
     */
    public function setAllowCustomIds(bool $allow): self
    {
        $this->allowCustomIds = $allow;
        return $this;
    }


    /**
     * Get the storage provider
     */
    public function getStorage(): IStorageProvider
    {
        return $this->storage;
    }

    // =========================================================================
    // SECURITY HELPERS
    // =========================================================================

    /**
     * Check if object data passes security access checks (owner_id, app_id, domain)
     * Returns false if any set security field mismatches the current context.
     *
     * @param array $data Object data from storage
     * @return bool True if access is allowed
     */
    private function checkSecurityAccess(array $data): bool
    {
        // Fail-safe: if no security context (userId null), deny access by default.
        // An authenticated context is required to pass ownership checks.
        if ($this->userId === null) {
            return false;
        }

        $objOwnerId = $data[Constants::F_OWNER_ID] ?? null;
        if ($objOwnerId !== null && $objOwnerId !== $this->userId) {
            return false;
        }

        if ($this->appId !== null) {
            $objAppId = $data[Constants::F_APP_ID] ?? null;
            if ($objAppId !== null && $objAppId !== $this->appId) {
                return false;
            }
        }
        if ($this->domain !== null) {
            $objDomain = $data[Constants::F_DOMAIN] ?? null;
            if ($objDomain !== null && $objDomain !== $this->domain) {
                return false;
            }
        }
        if ($this->tenantId !== null) {
            $objTenantId = $data[Constants::F_TENANT_ID] ?? null;
            if ($objTenantId !== null && $objTenantId !== $this->tenantId) {
                return false;
            }
        }
        return true;
    }

    /**
     * Inject security filters (owner_id, app_id, domain) into a query filter array
     *
     * @param array &$filters Filter array to modify
     */
    private function injectSecurityFilters(array &$filters): void
    {
        if ($this->userId !== null) {
            $filters[Constants::F_OWNER_ID] = $this->userId;
        }
        if ($this->appId !== null) {
            $filters[Constants::F_APP_ID] = $this->appId;
        }
        if ($this->domain !== null) {
            $filters[Constants::F_DOMAIN] = $this->domain;
        }
        if ($this->tenantId !== null) {
            $filters[Constants::F_TENANT_ID] = $this->tenantId;
        }
    }

    // =========================================================================
    // OBJECT OPERATIONS
    // =========================================================================

    /**
     * Get object by class and ID
     *
     * @param string $class_id Class identifier
     * @param mixed  $id       Object ID
     *
     * @return AtomObj|null Object or null if not found
     */
    public function getObject(string $class_id, mixed $id): ?AtomObj
    {
        if ($class_id === null || $id === null) {
            throw new StorageException('class_id and id are required', 'invalid_params');
        }

        // Check cache first
        $cached = $this->fromCache($class_id, $id);
        if ($cached !== null) {
            return $cached;
        }

        // Load from storage (no validation - data is trusted)
        $data = $this->storage->getobj($class_id, $id);
        if ($data === null) {
            return null;
        }

        // Check security access for non-system classes
        if (!$this->isSystemClass($class_id) && $this->enforceOwnership) {
            if (!$this->checkSecurityAccess($data)) {
                return null; // Security mismatch
            }
        }

        // Cast-on-read: normalize structure to match current class definition
        if ($this->castOnRead) {
            $data = $this->normalizeObjectData($class_id, $data);
        }

        // Factory creates AtomObj
        $obj = $this->factory($class_id, $data);

        // Cache and return
        $this->toCache($obj);
        return $obj;
    }

    /**
     * Save object (create or update)
     *
     * @param string $class_id Class identifier
     * @param array  $data     Object data to save
     *
     * @return AtomObj Saved object
     * @throws StorageException On validation failure or access denied
     */
    public function setObject(string $class_id, array $data): AtomObj
    {
        $t0 = microtime(true);
        $timings = [];

        $this->ensureBootstrap();
        $timings['bootstrap'] = round((microtime(true) - $t0) * 1000, 1);

        $t1 = microtime(true);
        $meta = $this->getClass($class_id);
        $timings['getClass'] = round((microtime(true) - $t1) * 1000, 1);

        $id = $data[Constants::F_ID] ?? null;
        $oldObj = null;
        $oldData = null;

        // If no ID provided, storage driver will generate one in setobj()

        // Step 1: Get old object if ID provided
        if ($id !== null) {
            $t1 = microtime(true);
            $oldData = $this->storage->getobj($class_id, $id);
            $timings['getOldObj'] = round((microtime(true) - $t1) * 1000, 1);

            // For non-system classes with custom IDs disabled, object must exist
            if ($oldData === null && !$this->isSystemClass($class_id) && !$this->allowCustomIds) {
                throw new StorageException(
                    "Cannot create object with custom ID. Object {$class_id}/{$id} does not exist.",
                    'not_found'
                );
            }

            // @state.readonly guard — sealed objects cannot be modified
            if ($oldData !== null) {
                $state = $oldData['@state'] ?? [];
                if (!empty($state['readonly'])) {
                    $canOverride = in_array('admin', $this->userRoles, true)
                        || in_array('system', $this->userRoles, true);
                    if (!$canOverride) {
                        throw new StorageException(
                            "Object is read-only (sealed). Cannot modify {$class_id}/{$id}.",
                            'forbidden'
                        );
                    }
                }
            }

            // Immutability guard: prevent modification of system/seed class definitions
            // Admin role can modify system classes (needed for genesis updates via ES API)
            if ($class_id === Constants::K_CLASS && $oldData !== null) {
                $canModifySystem = in_array('admin', $this->userRoles, true)
                    || in_array('system', $this->userRoles, true);
                if (!empty($oldData['is_system']) && !$canModifySystem) {
                    throw new StorageException(
                        "Cannot modify system class: {$id}. Admin or system role required.",
                        'forbidden'
                    );
                }
                if (!empty($oldData['is_seed']) && $this->isSystemClass((string)$id) && !$canModifySystem) {
                    throw new StorageException(
                        "Cannot modify seed system class: {$id}. Admin or system role required.",
                        'forbidden'
                    );
                }
            }

            // Verify security access on update
            if ($oldData !== null && $this->enforceOwnership && !$this->isSystemClass($class_id)) {
                if (!$this->checkSecurityAccess($oldData)) {
                    throw new StorageException(
                        "You don't have permission to modify this object.",
                        'forbidden'
                    );
                }
            }
        }

        // Step 2: Validate and build merged object
        if ($meta !== null) {
            $t1 = microtime(true);
            $result = $this->validate($class_id, $data, $oldData);
            $timings['validate'] = round((microtime(true) - $t1) * 1000, 1);
            if (!empty($result['errors'])) {
                throw new StorageException(
                    'Validation failed',
                    'validation_failed',
                    $result['errors']
                );
            }
            $data = $result['data'];
        } else {
            // No meta - simple merge
            if ($oldData !== null) {
                $data = array_merge($oldData, $data);
            }
        }

        // Step 2b: Check unique constraints
        if ($meta !== null) {
            $this->checkUniqueConstraints($class_id, $data, $meta);
        }

        // Step 2b-sys: Guard system class writes — only admins may create or modify @-prefixed classes
        if ($this->isSystemClass($class_id)) {
            if (!in_array('admin', $this->userRoles, true)) {
                error_log(
                    '[SECURITY] Blocked attempt to write system class without admin role.'
                    . ' user_id=' . ($this->userId ?? 'anonymous')
                    . ' class_id=' . $class_id
                );
                throw new StorageException(
                    'Admin role is required to create or modify system class definitions.',
                    'forbidden'
                );
            }
        }

        // Step 2c: Guard CLI-type @action objects — require admin role
        // CLI actions execute arbitrary shell commands; only admins may create or modify them.
        if ($class_id === Constants::K_ACTION) {
            // Use the effective type: incoming data may only set partial fields, so fall back to oldData
            $effectiveType = $data['type'] ?? ($oldData['type'] ?? null);
            if ($effectiveType === 'cli') {
                if (!in_array('admin', $this->userRoles, true)) {
                    error_log(
                        '[SECURITY] Blocked attempt to create/modify CLI @action without admin role.'
                        . ' user_id=' . ($this->userId ?? 'anonymous')
                        . ' action_id=' . ($data[Constants::F_ID] ?? 'new')
                    );
                    throw new StorageException(
                        'Admin role is required to create or modify CLI-type actions.',
                        'forbidden'
                    );
                }
            }
        }

        // Protect @state — server-managed, preserve from old data, strip user input
        $isSystemRole = in_array('system', $this->userRoles, true);
        if (!$isSystemRole) {
            // Non-system users: preserve old @state, ignore user input
            if ($oldData !== null && isset($oldData['@state'])) {
                $data['@state'] = $oldData['@state'];
            } else {
                unset($data['@state']);
            }
        }

        // Step 3: Stamp security fields for new objects (non-system classes)
        if ($oldData === null && !$this->isSystemClass($class_id)) {
            if ($this->userId !== null) {
                $data[Constants::F_OWNER_ID] = $this->userId;
            }
            if ($this->appId !== null) {
                $data[Constants::F_APP_ID] = $this->appId;
            }
            if ($this->domain !== null) {
                $data[Constants::F_DOMAIN] = $this->domain;
            }
            if ($this->tenantId !== null) {
                $data[Constants::F_TENANT_ID] = $this->tenantId;
            }
        }

        // Step 3b: Handle from_parent flags
        // On create: auto-populate from parent. On update: reject direct writes.
        if ($meta !== null) {
            $props = $this->getClassProps($class_id);
            $parentId = $data['primary_id'] ?? ($oldData['primary_id'] ?? null);
            $parentData = null;

            foreach ($props as $prop) {
                if (!$prop->isFromParent()) continue;
                $key = $prop->key;

                if ($oldData === null) {
                    // CREATE: auto-populate from parent object
                    if ($parentId !== null && !isset($data[$key])) {
                        if ($parentData === null) {
                            // Lazy-load parent — detect parent class from primary_id or same class
                            $parentData = $this->storage->getobj($class_id, $parentId);
                            if ($parentData === null) {
                                // Try finding parent in any class by ID
                                $parentData = $this->findObjectById($parentId);
                            }
                        }
                        if ($parentData !== null && isset($parentData[$key])) {
                            $data[$key] = $parentData[$key];
                        }
                    }
                } else {
                    // UPDATE: reject direct writes to from_parent fields
                    if (array_key_exists($key, $data) && isset($oldData[$key])) {
                        if ($data[$key] !== $oldData[$key]) {
                            // Silently keep old value — don't allow override
                            $data[$key] = $oldData[$key];
                        }
                    }
                }
            }
        }

        // Step 4: Detect changes
        $changes = $this->detectChanges($data, $oldData);

        // Step 5: No changes - return existing object
        if (empty($changes) && $oldData !== null) {
            return $this->factory($class_id, $oldData);
        }

        // Step 5b: Create @changes version record
        // Each save creates a @changes object with the full data + _old changed fields.
        // object.version = @changes ID (linked chain: _old.version = previous @changes ID)
        // Skipped if class has track_changes: false (e.g. @changes itself, logs)
        $metaArr = $meta ? $meta->toArray() : [];
        $trackChanges = ($metaArr['track_changes'] ?? true) && $class_id !== '@changes';
        if ($trackChanges) {
            $changeItem = $data;
            if ($oldData !== null) {
                $old = [];
                foreach ($oldData as $k => $v) {
                    if (!array_key_exists($k, $data) || $data[$k] !== $v) {
                        $old[$k] = $v;
                    }
                }
                if (!empty($old)) {
                    $changeItem['old_values'] = $old;
                }
            }

            try {
                // Compute schema_hash for @class changes (tracks schema evolution)
                $schemaHash = null;
                if ($class_id === Constants::K_CLASS && isset($data[Constants::F_PROPS])) {
                    $hashParts = [];
                    foreach ($data[Constants::F_PROPS] as $prop) {
                        if (is_array($prop) && isset($prop['key'])) {
                            $hashParts[] = $prop['key'] . ':' . ($prop['data_type'] ?? '') . ':' . ($prop['is_array'] ?? 'false');
                        }
                    }
                    sort($hashParts);
                    $schemaHash = md5(implode('|', $hashParts));
                }

                $changeRecord = [
                    Constants::F_CLASS_ID => '@changes',
                    'items' => [$changeItem],
                    'sender_id' => $this->userId ?? 'system',
                ];
                if ($schemaHash !== null) {
                    $changeRecord['schema_hash'] = $schemaHash;
                }

                $changeObj = $this->setObject('@changes', $changeRecord);
                $changeId = $changeObj->id ?? null;
                if ($changeId) {
                    // Store version in @state (server-managed object state)
                    $state = $data['@state'] ?? [];
                    $state['version'] = $changeId;
                    $data['@state'] = $state;
                }
            } catch (\Throwable $e) {
                error_log("[ES] @changes creation failed: " . $e->getMessage());
            }
        }

        // Step 6: Save and handle side effects
        $t1 = microtime(true);
        $savedData = $this->onChange($class_id, $data, $oldData, $changes);
        $timings['onChange'] = round((microtime(true) - $t1) * 1000, 1);

        // Step 7: Create AtomObj, clear changes, return
        $obj = $this->factory($class_id, $savedData);
        $obj->clearChanges();
        $obj->markSaved();

        // Update cache
        $this->toCache($obj);

        $timings['total'] = round((microtime(true) - $t0) * 1000, 1);
        error_log("[ES-TIMING] setObject {$class_id}/{$id}: " . json_encode($timings));

        return $obj;
    }

    /**
     * Batch upsert — best-effort: save what passes validation, report errors for the rest.
     *
     * @param string $class_id Class identifier (all objects share this class)
     * @param array  $items    Array of object data arrays
     *
     * @return array ['results' => [...], 'summary' => ['total' => N, 'ok' => N, 'errors' => N]]
     */
    public function setObjects(string $class_id, array $items): array
    {
        $t0 = microtime(true);
        $results = [];
        $ok = 0;
        $errors = 0;

        foreach ($items as $item) {
            $id = $item[Constants::F_ID] ?? null;
            try {
                $obj = $this->setObject($class_id, $item);
                $results[] = [
                    'status' => 'ok',
                    'id'     => $obj->id,
                    'data'   => $obj->toApiArray(),
                ];
                $ok++;
            } catch (StorageException $e) {
                $results[] = [
                    'status'  => 'error',
                    'id'      => $id,
                    'error'   => $e->getMessage(),
                    'details' => $e->getErrors() ?: null,
                ];
                $errors++;
            } catch (\Exception $e) {
                $results[] = [
                    'status' => 'error',
                    'id'     => $id,
                    'error'  => $e->getMessage(),
                ];
                $errors++;
            }
        }

        $totalMs = round((microtime(true) - $t0) * 1000, 1);
        error_log("[ES-TIMING] setObjects {$class_id}: {$ok} ok, {$errors} errors, {$totalMs}ms");

        return [
            'results' => $results,
            'summary' => ['total' => count($items), 'ok' => $ok, 'errors' => $errors],
        ];
    }

    /**
     * Delete object by class and ID
     *
     * @param string $class_id Class identifier
     * @param mixed  $id       Object ID
     *
     * @return bool True if deleted, false if not found
     */
    public function deleteObject(string $class_id, mixed $id): bool
    {
        // Load existing data (for security check)
        $oldData = $this->storage->getobj($class_id, $id);
        if ($oldData === null) return false;

        // Verify security access before delete
        if (!$this->isSystemClass($class_id) && $this->enforceOwnership) {
            if (!$this->checkSecurityAccess($oldData)) {
                return false;
            }
        }

        // @state.readonly guard
        $state = $oldData['@state'] ?? [];
        if (!empty($state['readonly'])) {
            $canOverride = in_array('admin', $this->userRoles, true)
                || in_array('system', $this->userRoles, true);
            if (!$canOverride) return false;
        }

        // Soft delete: set @state.deleted = true (object stays in DB)
        // The @changes record serves as the deletion notification
        $oldData['@state'] = array_merge($state, ['deleted' => true]);
        try {
            $this->setObject($class_id, $oldData);
        } catch (\Throwable $e) {
            error_log("[ES] Soft delete failed for {$class_id}/{$id}: " . $e->getMessage());
            return false;
        }

        // Remove from cache
        unset($this->objectCache[$class_id][$id]);

        // Seed write-back on delete
        if ($this->genesisLoader !== null && $this->hasSeedWritePermission()) {
            $this->seedDeleteBack($class_id, $id);
        }

        return true;
    }

    /**
     * Query objects with filters
     *
     * @param string $class_id Class identifier
     * @param array  $filters  Key-value filters
     * @param array  $options  Query options (sort, sortDir, limit, offset)
     *
     * @return AtomObj[] Array of AtomObj instances
     */
    public function query(string $class_id, array $filters = [], array $options = []): array
    {
        $this->ensureBootstrap();

        // Add class_id filter
        $filters[Constants::F_CLASS_ID] = $class_id;

        // Add security filters for non-system classes
        // Admin/system roles bypass ownership filtering (see all objects)
        $isPrivileged = in_array('admin', $this->userRoles, true)
            || in_array('system', $this->userRoles, true);
        if (!$this->isSystemClass($class_id) && $this->enforceOwnership && !$isPrivileged) {
            $this->injectSecurityFilters($filters);
        }

        $results = $this->storage->query($class_id, $filters, $options);

        // Filter out @state.deleted objects (unless explicitly querying for them)
        $includeDeleted = $filters['@state.deleted'] ?? null;
        if ($includeDeleted === null) {
            $results = array_filter($results, function ($data) {
                $state = $data['@state'] ?? [];
                return empty($state['deleted']);
            });
            $results = array_values($results); // re-index
        }

        // Convert to AtomObj array
        return array_map(
            fn($data) => $this->factory($class_id, $data),
            $results
        );
    }

    // =========================================================================
    // RELATION OPERATIONS
    // =========================================================================

    /**
     * Get related objects for a parent object's relation property
     *
     * @param AtomObj $parentObj Parent object
     * @param string  $propKey   Relation property key on parent
     * @param string  $mode      'resolve' = fetch IDs from parent array in order,
     *                           'query' = full query on target class (security auto-filters)
     * @param array   $filters   Additional filters (for query mode)
     *
     * @return AtomObj[] Related objects
     */
    public function getRelated(AtomObj $parentObj, string $propKey, string $mode = 'resolve', array $filters = []): array
    {
        $classMeta = $this->getClass($parentObj->class_id);
        if (!$classMeta) {
            return [];
        }

        $propDef = $classMeta->getProp($propKey);
        if (!$propDef || !$propDef->hasTargetClasses()) {
            return [];
        }

        $targetClass = $propDef->getPrimaryTargetClass();
        if (!$targetClass) {
            return [];
        }

        if ($mode === 'query') {
            // Full query on target class — security auto-filters via query()
            return $this->query($targetClass, $filters);
        }

        // Default: resolve mode — read parent's ID array and fetch each in order
        $parentData = $parentObj->toArray();
        $ids = $parentData[$propKey] ?? [];

        if (!is_array($ids)) {
            // Single relation
            $obj = $this->getObject($targetClass, $ids);
            return $obj ? [$obj] : [];
        }

        // Fetch each ID preserving parent array order (security enforced per-object)
        $results = [];
        foreach ($ids as $refId) {
            $obj = $this->getObject($targetClass, $refId);
            if ($obj) {
                $results[] = $obj;
            }
        }
        return $results;
    }

    /**
     * Get related objects where owner_id = parent id
     *
     * @deprecated Use getRelated() instead. This method conflates owner_id (security)
     *             with parent-child relationships.
     *
     * @param string $class_id     Class of related objects
     * @param mixed  $owner_id     ID of parent object
     * @param string $relationName Name of relation (for future use)
     * @param array  $filters      Additional filters
     *
     * @return AtomObj[] Related objects
     */
    public function getObjectRelation(
        string $class_id,
        mixed $owner_id,
        string $relationName = '',
        array $filters = []
    ): array {
        $filters[Constants::F_OWNER_ID] = $owner_id;
        return $this->query($class_id, $filters);
    }

    // =========================================================================
    // CLASS OPERATIONS
    // =========================================================================

    /**
     * Get class metadata by ID
     *
     * @param string $class_id Class identifier
     *
     * @return ClassMeta|null Class metadata or null if not found
     */
    public function getClass(string $class_id): ?ClassMeta
    {
        $this->ensureBootstrap();

        // Check cache
        $cached = $this->fromCache(Constants::K_CLASS, $class_id);
        if ($cached instanceof ClassMeta) {
            return $cached;
        }

        // Load from storage (CompositeStorageProvider handles fallback chain)
        $data = $this->storage->getobj(Constants::K_CLASS, $class_id);
        if ($data === null) {
            // Auto create class if enabled
            if ($this->auto_create_class) {
                $data = [
                    Constants::F_ID => $class_id,
                    Constants::F_CLASS_ID => Constants::K_CLASS,
                    Constants::F_NAME => $class_id,
                    Constants::F_PROPS => [],
                ];
                $this->storage->setobj(Constants::K_CLASS, $data);
            } else {
                return null;
            }
        }

        // Create ClassMeta
        $meta = new ClassMeta(Constants::K_CLASS, $data, $this->getDi());

        // Cache and return
        $this->toCache($meta);

        return $meta;
    }

    /**
     * Get all class definitions
     *
     * @return ClassMeta[] Array of all class metadata
     */
    public function getAllClasses(): array
    {
        $this->ensureBootstrap();

        $data = $this->storage->getobj(Constants::K_CLASS);

        return array_map(
            fn($d) => new ClassMeta(Constants::K_CLASS, $d, $this->getDi()),
            $data ?? []
        );
    }

    /**
     * Get class properties including inherited ones
     *
     * @param string $class_id Class identifier
     *
     * @return Prop[] Array of Prop objects (includes inherited props)
     */
    public function getClassProps(string $class_id): array
    {
        $meta = $this->getClass($class_id);
        if ($meta === null) {
            return [];
        }

        $props = $meta->getProps();

        // Handle inheritance - merge parent props
        // Stop at system classes (@ prefix) — their props define class metadata, not object schemas
        if ($meta->extends_id !== null && $class_id !== Constants::K_CLASS) {
            $parentProps = $this->getClassProps($meta->extends_id);
            // Parent props first, then own props (own override parent)
            $propsByKey = [];
            foreach ($parentProps as $prop) {
                $propsByKey[$prop->key] = $prop;
            }
            foreach ($props as $prop) {
                $propsByKey[$prop->key] = $prop;
            }
            $props = array_values($propsByKey);
        }

        return $props;
    }

    /**
     * Delete a class definition
     *
     * @param string $class_id Class identifier
     *
     * @return bool True if deleted
     */
    public function deleteClass(string $class_id): bool
    {
        $this->ensureBootstrap();

        // Immutability guard: system classes (@ prefix) can never be deleted
        if ($this->isSystemClass($class_id)) {
            throw new StorageException(
                "Cannot delete system class: {$class_id}",
                'forbidden'
            );
        }

        // Immutability guard: seed classes (is_seed or is_system flag) are protected
        $classData = $this->storage->getobj(Constants::K_CLASS, $class_id);
        if ($classData && (!empty($classData['is_seed']) || !empty($classData['is_system']))) {
            throw new StorageException(
                "Cannot delete seed/system class: {$class_id}",
                'forbidden'
            );
        }

        // Check if any objects exist — cannot delete class with data
        // Use merge_into action to transfer objects to another class first
        try {
            $objects = $this->storage->find($class_id, [], 1);
            if (!empty($objects)) {
                throw new StorageException(
                    "Cannot delete class '{$class_id}' — it has existing objects. Use merge_into(target_class) to transfer objects first.",
                    'has_objects'
                );
            }
        } catch (StorageException $e) {
            throw $e; // Re-throw our own exceptions
        } catch (\Throwable $e) {
            // Storage might not have this database yet — safe to delete
        }

        unset($this->objectCache[Constants::K_CLASS][$class_id]);
        return $this->deleteObject(Constants::K_CLASS, $class_id);
    }

    // =========================================================================
    // SYSTEM OPERATIONS
    // =========================================================================

    /**
     * Initialize system - create system classes if needed
     */
    public function init(): void
    {
        $this->ensureBootstrap();
    }

    /**
     * Reset all data - clears non-system objects, reloads seed data
     *
     * @return array Status information
     */
    public function reset(): array
    {
        $this->ensureBootstrap();

        $resetClasses = [];

        // Get all classes and clear non-system data
        $allClasses = $this->getAllClasses();
        foreach ($allClasses as $classMeta) {
            // Skip system classes
            if ($this->isSystemClass($classMeta->id)) {
                continue;
            }

            // Clear all objects of this class
            $existing = $this->storage->getobj($classMeta->id) ?? [];
            foreach ($existing as $obj) {
                $this->storage->delobj($classMeta->id, $obj[Constants::F_ID]);
            }
            $resetClasses[] = $classMeta->id;
        }

        // Clear cache
        $this->objectCache = [];

        // Load seed data if exists
        $seedFile = dirname($this->basePath) . '/data/seed_data.json';
        if (file_exists($seedFile)) {
            $seedData = json_decode(file_get_contents($seedFile), true);
            $this->loadSeedData($seedData);
        }

        return [
            'reset' => true,
            'classes' => $resetClasses,
            'timestamp' => date('c'),
        ];
    }

    /**
     * Load seed data from array
     *
     * @param array $seedData Seed data structure
     */
    private function loadSeedData(array $seedData): void
    {
        $oldAllowCustomIds = $this->allowCustomIds;
        $this->allowCustomIds = true;

        foreach ($seedData['classes'] ?? [] as $classData) {
            $this->storage->setobj(Constants::K_CLASS, $classData);
        }

        foreach ($seedData['data'] ?? [] as $classId => $objects) {
            foreach ($objects as $obj) {
                $obj[Constants::F_CLASS_ID] = $classId;
                $obj['is_seed'] = true;
                $this->storage->setobj($classId, $obj);
            }
        }

        $this->allowCustomIds = $oldAllowCustomIds;
    }

    // =========================================================================
    // FACTORY & CACHE
    // =========================================================================

    /**
     * Factory method to create object by class_id
     *
     * @param string $class_id Class identifier
     * @param array  $data     Object data
     *
     * @return AtomObj|ClassMeta|Prop
     */
    public function factory(string $class_id, array $data = []): AtomObj
    {
        return match ($class_id) {
            Constants::K_CLASS => new ClassMeta($class_id, $data, $this->getDi()),
            Constants::K_PROP => new Prop($class_id, $data, $this->getDi()),
            default => new AtomObj($class_id, $data, $this->getDi()),
        };
    }

    /**
     * Get object from cache
     */
    public function fromCache(string $class_id, mixed $id): ?AtomObj
    {
        return $this->objectCache[$class_id][$id] ?? null;
    }

    /**
     * Store object in cache
     */
    private function toCache(AtomObj $obj): void
    {
        if ($obj->id !== null) {
            $this->objectCache[$obj->class_id][$obj->id] = $obj;
        }
    }

    // =========================================================================
    // VALIDATION
    // =========================================================================

    /**
     * Validate data against class schema
     *
     * @param string     $class_id Class identifier
     * @param array      $data     Data to validate
     * @param array|null $oldData  Existing object data (for updates)
     *
     * @return array ['data' => validated data, 'errors' => validation errors]
     */
    private function validate(string $class_id, array $data, ?array $oldData = null, int $depth = 0): array
    {
        if ($depth > 20) {
            return ['data' => $data, 'errors' => [['path' => '', 'message' => 'Maximum nesting depth (20) exceeded during validation', 'code' => 'MAX_DEPTH']]];
        }

        $meta = $this->getClass($class_id);
        if ($meta === null) {
            return ['data' => $data, 'errors' => []];
        }

        $errors = [];
        $isNew = ($oldData === null);
        $result = $isNew ? [] : $oldData;

        // Get all props including inherited
        $props = $this->getClassProps($class_id);
        $propsMap = [];
        foreach ($props as $prop) {
            $propsMap[$prop->key] = $prop;
        }

        // Process each property
        foreach ($props as $prop) {
            $key = $prop->key;
            $hasInput = array_key_exists($key, $data);
            $hasOld = !$isNew && array_key_exists($key, $oldData);

            if ($hasInput) {
                $inputValue = $data[$key];
                $oldValue = $hasOld ? $oldData[$key] : null;

                // Cast the value
                $inputValue = $this->castValue($inputValue, $prop);

                // Handle array of embedded objects (check array FIRST before single object)
                if ($prop->isEmbeddedArray() && is_array($inputValue)) {
                    $mergedArray = [];
                    $oldArray = is_array($oldValue) ? $oldValue : [];

                    foreach ($inputValue as $i => $item) {
                        if (!is_array($item)) {
                            $mergedArray[] = $item;
                            continue;
                        }
                        // Find matching old item by id
                        $itemId = $item[Constants::F_ID] ?? null;
                        $oldItem = null;
                        if ($itemId !== null) {
                            foreach ($oldArray as $old) {
                                if (($old[Constants::F_ID] ?? null) === $itemId) {
                                    $oldItem = $old;
                                    break;
                                }
                            }
                        }
                        // Use primary target class for validation (first in array)
                        $targetClass = $prop->getPrimaryTargetClass();
                        if ($targetClass && !$this->isInlineReference($targetClass, $item)) {
                            $nestedResult = $this->validate($targetClass, $item, $oldItem, $depth + 1);
                            $mergedArray[] = $nestedResult['data'];
                            foreach ($nestedResult['errors'] as $err) {
                                $err['path'] = "{$key}[{$i}].{$err['path']}";
                                $errors[] = $err;
                            }
                        } else {
                            $mergedArray[] = $item;
                        }
                    }
                    $result[$key] = $mergedArray;
                    continue;
                }

                // Handle single embedded object
                if ($prop->isEmbeddedObject() && is_array($inputValue)) {
                    // Use primary target class for validation (first in array)
                    $targetClass = $prop->getPrimaryTargetClass();
                    // Skip validation for inline references (e.g. editor: {id: "textarea"})
                    if ($targetClass && $this->isInlineReference($targetClass, $inputValue)) {
                        $result[$key] = $inputValue;
                        continue;
                    }
                    $nestedResult = $this->validate($targetClass, $inputValue, $oldValue, $depth + 1);
                    $result[$key] = $nestedResult['data'];
                    foreach ($nestedResult['errors'] as $err) {
                        $err['path'] = "{$key}.{$err['path']}";
                        $errors[] = $err;
                    }
                    continue;
                }

                // Simple value
                $result[$key] = $inputValue;

                // Validate the value
                $propErrors = $this->validateProperty($inputValue, $prop);
                $errors = array_merge($errors, $propErrors);

            } elseif ($isNew) {
                // New object - apply default or check required
                if ($prop->default_value !== null) {
                    $result[$key] = $prop->default_value;
                } elseif ($prop->isRequired()) {
                    $errors[] = [
                        'path' => $key,
                        'message' => "{$key} is required",
                        'code' => Constants::VT_REQUIRED,
                    ];
                }
            }
        }

        // Copy system fields
        foreach ([Constants::F_ID, Constants::F_CLASS_ID] as $sysKey) {
            if (array_key_exists($sysKey, $data)) {
                $result[$sysKey] = $data[$sysKey];
            }
        }

        // Check unique name constraint
        if (isset($result[Constants::F_NAME])) {
            $id = $result[Constants::F_ID] ?? null;
            if (!$this->isNameUnique($class_id, $result[Constants::F_NAME], $id)) {
                $errors[] = [
                    'path' => Constants::F_NAME,
                    'message' => 'Name must be unique within class',
                    'code' => 'unique',
                ];
            }
        }

        return ['data' => $result, 'errors' => $errors];
    }

    /**
     * Check if an embedded object is an inline reference rather than a full instance.
     *
     * Inline references have an 'id' field but lack the required fields of the target class.
     * Example: a prop's editor field set to {id: "textarea"} is a reference to an @editor
     * object, NOT a full @editor instance (which requires name, data_types, etc.).
     *
     * @param string $targetClassId  The embedded object's target class (e.g. "@editor")
     * @param array  $data           The embedded object data
     * @return bool  True if this is a lightweight reference, not a full instance
     */
    private function isInlineReference(string $targetClassId, array $data): bool
    {
        // Must have an id to be a reference
        if (!isset($data[Constants::F_ID])) {
            return false;
        }

        // Get the target class's required fields
        $meta = $this->getClass($targetClassId);
        if ($meta === null) {
            return false;
        }

        $requiredProps = [];
        $targetProps = $this->getClassProps($targetClassId);
        foreach ($targetProps as $p) {
            if ($p->isRequired() && $p->key !== Constants::F_ID) {
                $requiredProps[] = $p->key;
            }
        }

        // If the object has none of the required fields, it's just a reference
        if (empty($requiredProps)) {
            return false;
        }

        foreach ($requiredProps as $reqKey) {
            if (array_key_exists($reqKey, $data)) {
                return false; // Has a required field — treat as full instance
            }
        }

        return true;
    }

    /**
     * Validate a single property value
     */
    private function validateProperty(mixed $value, Prop $prop): array
    {
        $errors = [];
        $key = $prop->key;
        $label = $prop->getLabel();

        // Null/empty check
        if ($value === null || $value === '') {
            if ($prop->isRequired()) {
                $errors[] = [
                    'path' => $key,
                    'message' => "{$label} is required",
                    'code' => Constants::VT_REQUIRED
                ];
            }
            return $errors;
        }

        // Type validation
        $typeError = $this->validateType($value, $prop);
        if ($typeError !== null) {
            $errors[] = ['path' => $key, 'message' => $typeError, 'code' => 'type'];
            return $errors;
        }

        // Custom validators
        foreach ($prop->validators ?? [] as $validator) {
            $validatorError = $this->runValidator($value, $validator, $prop);
            if ($validatorError !== null) {
                $errors[] = [
                    'path' => $key,
                    'message' => $validatorError,
                    'code' => $validator['type'] ?? 'validation_error',
                ];
            }
        }

        return $errors;
    }

    /**
     * Validate value type
     */
    private function validateType(mixed $value, Prop $prop): ?string
    {
        $label = $prop->getLabel();

        // Handle arrays
        if ($prop->is_array && !is_array($value)) {
            return "{$label} must be an array";
        }

        $checkValue = $prop->is_array ? ($value[0] ?? null) : $value;
        if ($checkValue === null) {
            return null;
        }

        return match ($prop->data_type) {
            Constants::DT_INTEGER => (!is_numeric($checkValue) || (int)$checkValue != $checkValue) ? "{$label} must be an integer" : null,
            Constants::DT_FLOAT => !is_numeric($checkValue) ? "{$label} must be a number" : null,
            Constants::DT_BOOLEAN => (!is_bool($checkValue) && !in_array($checkValue, [0, 1, '0', '1'], true)) ? "{$label} must be a boolean" : null,
            Constants::DT_DATETIME => $this->validateDatetime($checkValue, $label),
            Constants::DT_OBJECT => (!is_array($checkValue) && !is_object($checkValue)) ? "{$label} must be an object" : null,
            Constants::DT_RELATION => $this->validateRelation($checkValue, $prop, $label),
            Constants::DT_STRING => $this->validateStringOptions($checkValue, $prop, $label),
            default => null,
        };
    }

    /**
     * Validate string with options.values constraint
     */
    private function validateStringOptions(mixed $value, Prop $prop, string $label): ?string
    {
        $options = $prop->options ?? [];
        $values = $options['values'] ?? [];

        if (!empty($values)) {
            $allowed = array_is_list($values) ? $values : array_keys($values);
            if (!in_array($value, $allowed)) {
                $allowCustom = $options['allow_custom'] ?? false;
                if (!$allowCustom) {
                    return "{$label} must be one of: " . implode(', ', $allowed);
                }
            }
        }

        // Check min_length / max_length
        if (is_string($value)) {
            $minLen = $options['min_length'] ?? null;
            $maxLen = $options['max_length'] ?? null;
            if ($minLen !== null && strlen($value) < $minLen) {
                return "{$label} minimum length is {$minLen}";
            }
            if ($maxLen !== null && strlen($value) > $maxLen) {
                return "{$label} maximum length is {$maxLen}";
            }

            // Check pattern
            $pattern = $options['pattern'] ?? null;
            if ($pattern !== null && !preg_match('/' . $pattern . '/', $value)) {
                return "{$label} does not match required pattern";
            }
        }

        return null;
    }

    /**
     * Validate datetime value
     */
    private function validateDatetime(mixed $value, string $label): ?string
    {
        if (!is_string($value)) {
            return "{$label} must be a datetime string";
        }
        // Accept ISO datetime formats
        if (!preg_match('/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/', $value)) {
            return "{$label} must be a valid datetime (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss)";
        }
        return null;
    }

    private function validateRelation(mixed $value, Prop $prop, string $label): ?string
    {
        if (!$prop->hasTargetClasses()) {
            return null;
        }

        $targetClasses = $prop->getTargetClasses();
        $related = null;

        // Try to find the object in any of the target classes
        foreach ($targetClasses as $targetClass) {
            $related = $this->storage->getobj($targetClass, $value);
            if ($related !== null) {
                break;
            }

            // If not found in target class and we accept child classes, search children
            if ($prop->acceptsChildClasses()) {
                $childClasses = $this->getChildClasses($targetClass);
                foreach ($childClasses as $childClass) {
                    $related = $this->storage->getobj($childClass, $value);
                    if ($related !== null) {
                        break 2; // Break both loops
                    }
                }
            }
        }

        if ($related === null) {
            $suffix = $prop->acceptsChildClasses() ? ' (or child class)' : '';
            $classesStr = implode(', ', $targetClasses);
            return "{$label} references non-existent object in [{$classesStr}]{$suffix}";
        }

        // Verify the class matches (when strict mode)
        if ($prop->object_class_strict) {
            $relatedClass = $related[Constants::F_CLASS_ID] ?? null;
            if ($relatedClass !== null && !in_array($relatedClass, $targetClasses, true)) {
                $classesStr = implode(', ', $targetClasses);
                return "{$label} must reference [{$classesStr}], not {$relatedClass}";
            }
        }

        return null;
    }

    /**
     * Run a custom validator
     */
    private function runValidator(mixed $value, array $validator, Prop $prop): ?string
    {
        $type = $validator['type'] ?? '';
        $message = $validator['message'] ?? null;

        return match ($type) {
            Constants::VT_EMAIL => !filter_var($value, FILTER_VALIDATE_EMAIL) ? ($message ?? 'Invalid email address') : null,
            Constants::VT_URL => !filter_var($value, FILTER_VALIDATE_URL) ? ($message ?? 'Invalid URL') : null,
            Constants::VT_LENGTH => $this->validateLength($value, $validator, $message),
            Constants::VT_RANGE => $this->validateRange($value, $validator, $message),
            Constants::VT_REGEX => $this->validateRegex($value, $validator, $message),
            Constants::VT_INTEGER => (!is_int($value) && !ctype_digit((string)$value)) ? ($message ?? 'Must be an integer') : null,
            Constants::VT_POSITIVE => ($value <= 0) ? ($message ?? 'Must be a positive number') : null,
            'min' => $this->validateMin($value, $validator, $message),
            'max' => $this->validateMax($value, $validator, $message),
            'minLength' => $this->validateMinLength($value, $validator, $message),
            'maxLength' => $this->validateMaxLength($value, $validator, $message),
            'enum' => $this->validateEnumValidator($value, $validator, $message, $prop),
            default => null,
        };
    }

    /**
     * Validate enum value from validator config
     */
    private function validateEnumValidator(mixed $value, array $validator, ?string $message, Prop $prop): ?string
    {
        $allowedValues = $validator['values'] ?? [];
        if (empty($allowedValues)) {
            return null;
        }
        if (!in_array($value, $allowedValues, false)) {
            $label = $prop->getLabel();
            return $message ?? "{$label} must be one of: " . implode(', ', $allowedValues);
        }
        return null;
    }

    private function validateLength(mixed $value, array $validator, ?string $message): ?string
    {
        $len = is_string($value) ? strlen($value) : (is_array($value) ? count($value) : 0);
        if (isset($validator['min']) && $len < $validator['min']) {
            return $message ?? "Minimum length is {$validator['min']}";
        }
        if (isset($validator['max']) && $len > $validator['max']) {
            return $message ?? "Maximum length is {$validator['max']}";
        }
        return null;
    }

    private function validateRange(mixed $value, array $validator, ?string $message): ?string
    {
        if (isset($validator['min']) && $value < $validator['min']) {
            return $message ?? "Minimum value is {$validator['min']}";
        }
        if (isset($validator['max']) && $value > $validator['max']) {
            return $message ?? "Maximum value is {$validator['max']}";
        }
        return null;
    }

    private function validateRegex(mixed $value, array $validator, ?string $message): ?string
    {
        if (!empty($validator['pattern']) && !preg_match($validator['pattern'], $value)) {
            return $message ?? 'Invalid format';
        }
        return null;
    }

    private function validateMin(mixed $value, array $validator, ?string $message): ?string
    {
        $min = $validator['value'] ?? $validator['min'] ?? null;
        if ($min !== null && is_numeric($value) && $value < $min) {
            return $message ?? "Minimum value is {$min}";
        }
        return null;
    }

    private function validateMax(mixed $value, array $validator, ?string $message): ?string
    {
        $max = $validator['value'] ?? $validator['max'] ?? null;
        if ($max !== null && is_numeric($value) && $value > $max) {
            return $message ?? "Maximum value is {$max}";
        }
        return null;
    }

    private function validateMinLength(mixed $value, array $validator, ?string $message): ?string
    {
        $min = $validator['value'] ?? $validator['min'] ?? null;
        if ($min !== null && is_string($value) && strlen($value) < $min) {
            return $message ?? "Minimum length is {$min}";
        }
        return null;
    }

    private function validateMaxLength(mixed $value, array $validator, ?string $message): ?string
    {
        $max = $validator['value'] ?? $validator['max'] ?? null;
        if ($max !== null && is_string($value) && strlen($value) > $max) {
            return $message ?? "Maximum length is {$max}";
        }
        return null;
    }

    /**
     * Cast value to proper type
     */
    private function castValue(mixed $value, Prop $prop): mixed
    {
        if ($value === null) {
            return null;
        }

        $arrayMode = $prop->getArrayMode();

        // Array/scalar normalization
        if ($arrayMode === Prop::ARRAY_INDEXED) {
            // Prop expects array
            if (!is_array($value)) {
                // Scalar → wrap in array
                $value = [$value];
            }
            return array_values(array_map(fn($v) => $this->castSingleValue($v, $prop), $value));
        }

        if ($arrayMode === Prop::ARRAY_ASSOC) {
            // Prop expects assoc map — keep as-is but cast values
            if (is_array($value)) {
                $result = [];
                foreach ($value as $k => $v) {
                    $result[$k] = $this->castSingleValue($v, $prop);
                }
                return $result;
            }
            return $value;
        }

        // Prop expects scalar
        if (is_array($value) && count($value) === 1 && array_is_list($value)) {
            // Single-element array → unwrap to scalar
            $value = $value[0];
        }

        return $this->castSingleValue($value, $prop);
    }

    private function castSingleValue(mixed $value, Prop $prop): mixed
    {
        if ($value === null) {
            return null;
        }

        $dataType = $prop->data_type;

        // Object cast_from_string: expand a string value into an object using a template
        // Template uses $value as placeholder for the original string
        if ($dataType === Constants::DT_OBJECT && is_string($value)) {
            $castTemplate = $prop->options['cast_from_string'] ?? null;
            if ($castTemplate && is_array($castTemplate)) {
                return $this->applyCastTemplate($castTemplate, $value);
            }
        }

        return match ($dataType) {
            Constants::DT_INTEGER => is_numeric($value) ? (int)$value : $value,
            Constants::DT_FLOAT => is_numeric($value) ? (float)$value : $value,
            Constants::DT_BOOLEAN => $this->castToBoolean($value),
            Constants::DT_STRING, Constants::DT_DATETIME => is_scalar($value) ? (string)$value : $value,
            default => $value,
        };
    }

    /**
     * Apply a cast_from_string template: replace $value placeholders with the actual string.
     * Example template: {"type": "json_file", "url": "$value"}
     * With input "data.json" → {"type": "json_file", "url": "data.json"}
     */
    private function applyCastTemplate(array $template, string $value): array
    {
        $result = [];
        foreach ($template as $k => $v) {
            if (is_string($v)) {
                $result[$k] = str_replace('$value', $value, $v);
            } elseif (is_array($v)) {
                $result[$k] = $this->applyCastTemplate($v, $value);
            } else {
                $result[$k] = $v;
            }
        }
        return $result;
    }

    private function castToNumber(mixed $value): mixed
    {
        if (is_string($value) && is_numeric($value)) {
            return str_contains($value, '.') ? (float)$value : (int)$value;
        }
        if (is_numeric($value)) {
            return $value + 0;
        }
        return $value;
    }

    private function castToBoolean(mixed $value): mixed
    {
        if (is_string($value)) {
            $lower = strtolower($value);
            if (in_array($lower, ['true', '1', 'yes', 'on'])) return true;
            if (in_array($lower, ['false', '0', 'no', 'off', ''])) return false;
        }
        if (is_numeric($value)) {
            return (bool)$value;
        }
        return $value;
    }

    // =========================================================================
    // CHANGE DETECTION & HANDLERS
    // =========================================================================

    /**
     * Detect changes between new and old data
     */
    private function detectChanges(array $data, ?array $oldData): array
    {
        if ($oldData === null) {
            return ['_new' => true];
        }

        $changes = [];
        foreach ($data as $key => $value) {
            if (!array_key_exists($key, $oldData) || $oldData[$key] !== $value) {
                $changes[$key] = [
                    'old' => $oldData[$key] ?? null,
                    'new' => $value,
                ];
            }
        }
        return $changes;
    }

    /**
     * Handle object change - save and process side effects
     */
    private function onChange(string $class_id, array $data, ?array $oldData, array $changes): array
    {
        // For class definitions, normalize props format and set prop IDs
        if ($class_id === Constants::K_CLASS) {
            $data = $this->normalizeClassData($data);
        }

        // Save the object
        $result = $this->storage->setobj($class_id, $data);

        // Broadcast: only classes with track_changes=false broadcast directly to WS.
        // Classes with track_changes=true (default) broadcast via their @changes record
        // which is created in Step 5b and goes through setObject('@changes') → here.
        $classMeta = $this->getClass($class_id);
        $classArr = $classMeta ? $classMeta->toArray() : [];
        $classTrackChanges = $classArr['track_changes'] ?? true;
        if (!$classTrackChanges) {
            BroadcastService::emitChange($result, $oldData, $this->userId);
        }
        EventDispatcher::dispatch($oldData ? 'after_update' : 'after_create', $class_id, $result, $oldData, $this->userId);

        // Cascade from_parent fields to children when parent is updated
        if ($oldData !== null && !empty($changes)) {
            $this->cascadeFromParentFields($class_id, $result, $changes);
        }

        // Handle class meta changes (renames)
        if ($class_id === Constants::K_CLASS && !empty($changes)) {
            $this->handleClassMetaChanges($data, $oldData, $changes);
        }

        // Invalidate class cache if class was modified
        if ($class_id === Constants::K_CLASS) {
            unset($this->objectCache[Constants::K_CLASS][$data[Constants::F_ID]]);
        }

        // Seed write-back: if genesis loader is active and user has permission,
        // save changes back to the genesis/seed file in .es/
        if ($this->genesisLoader !== null && $this->hasSeedWritePermission()) {
            $this->seedWriteBack($class_id, $data, $result);
        }

        return $result;
    }

    /**
     * Handle class meta changes - detect and execute renames
     */
    private function handleClassMetaChanges(array $newMeta, ?array $oldMeta, array $changes): void
    {
        if ($oldMeta === null) {
            return;
        }

        $targetClassId = $newMeta[Constants::F_ID];

        // Check for class rename
        if (isset($changes[Constants::F_ID])) {
            $oldClassId = $changes[Constants::F_ID]['old'];
            $newClassId = $changes[Constants::F_ID]['new'];
            if ($oldClassId && $newClassId && $oldClassId !== $newClassId) {
                $this->storage->renameClass($oldClassId, $newClassId);
            }
        }

        // Check for property renames
        if (isset($changes[Constants::F_PROPS])) {
            $oldProps = $oldMeta[Constants::F_PROPS] ?? [];
            $newProps = $newMeta[Constants::F_PROPS] ?? [];
            $propRenames = $this->detectPropRenames($oldProps, $newProps);
            foreach ($propRenames as $rename) {
                $this->storage->renameProp($targetClassId, $rename['old'], $rename['new']);
            }
        }
    }

    /**
     * Detect property renames by comparing old and new props
     */
    private function detectPropRenames(array $oldProps, array $newProps): array
    {
        $renames = [];
        $oldKeys = [];
        $newKeys = [];

        foreach ($oldProps as $p) {
            $key = is_array($p) ? ($p['key'] ?? null) : ($p->key ?? null);
            $type = is_array($p) ? ($p['data_type'] ?? 'string') : ($p->data_type ?? 'string');
            if ($key) $oldKeys[$key] = $type;
        }

        foreach ($newProps as $p) {
            $key = is_array($p) ? ($p['key'] ?? null) : ($p->key ?? null);
            $type = is_array($p) ? ($p['data_type'] ?? 'string') : ($p->data_type ?? 'string');
            if ($key) $newKeys[$key] = $type;
        }

        $removed = array_diff_key($oldKeys, $newKeys);
        $added = array_diff_key($newKeys, $oldKeys);

        foreach ($removed as $oldKey => $oldType) {
            foreach ($added as $newKey => $newType) {
                if ($oldType === $newType) {
                    $renames[] = ['old' => $oldKey, 'new' => $newKey];
                    unset($added[$newKey]);
                    break;
                }
            }
        }

        return $renames;
    }

    // =========================================================================
    // HELPERS
    // =========================================================================

    /**
     * Normalize class data:
     * - Convert props from object format to array format
     * - Set prop IDs as class_id.key
     *
     * Supports both formats:
     * - Object: {"props": {"name": {"key": "name", ...}}}
     * - Array:  {"props": [{"key": "name", ...}]}
     */
    private function normalizeClassData(array $data): array
    {
        $classId = $data[Constants::F_ID] ?? '';

        if (!isset($data[Constants::F_PROPS])) {
            return $data;
        }

        $props = $data[Constants::F_PROPS];

        // If props is an object/associative array (keys are prop names, not numeric)
        if (is_array($props) && !empty($props) && !array_is_list($props)) {
            // Convert object format to array format
            $propsArray = [];
            foreach ($props as $key => $propData) {
                if (is_array($propData)) {
                    // Ensure key is set
                    $propData['key'] = $propData['key'] ?? $key;
                    $propsArray[] = $propData;
                }
            }
            $props = $propsArray;
        }

        // Set prop IDs as class_id.key
        if (is_array($props) && $classId) {
            foreach ($props as &$prop) {
                if (is_array($prop) && isset($prop['key'])) {
                    $prop['id'] = $classId . '.' . $prop['key'];
                    $prop['class_id'] = Constants::K_PROP;
                }
            }
            unset($prop);
        }

        $data[Constants::F_PROPS] = $props;
        return $data;
    }

    /**
     * Check if class is a system class
     */
    private function isSystemClass(string $classId): bool
    {
        return str_starts_with($classId, '@');
    }

    /**
     * Check if name is unique within class.
     * Uses targeted Mango query (case-insensitive regex) instead of loading all docs.
     */
    private function isNameUnique(string $classId, string $name, mixed $excludeId): bool
    {
        // Build case-insensitive regex pattern for CouchDB Mango query
        $escaped = preg_quote($name, '/');
        $matches = $this->storage->query($classId, [
            Constants::F_NAME => ['$regex' => "(?i)^{$escaped}$"],
        ], ['limit' => 2]);

        if (empty($matches)) {
            return true;
        }

        foreach ($matches as $obj) {
            if ($excludeId !== null && ($obj[Constants::F_ID] ?? null) == $excludeId) {
                continue;
            }
            return false;
        }
        return true;
    }

    /**
     * Guess data type from PHP value
     */
    /**
     * Check unique constraints defined on a class.
     */
    private function checkUniqueConstraints(string $classId, array $data, ClassMeta $meta): void
    {
        $objectId = $data[Constants::F_ID] ?? null;

        // Collect all key definitions: from legacy 'unique' array + new 'keys' array
        $allKeys = [];
        $metaArr = $meta->toArray();

        // Legacy: unique[] constraints
        $constraints = $metaArr['unique'] ?? [];
        foreach ($constraints as $c) {
            if (!empty($c['fields'])) {
                $allKeys[] = ['fields' => $c['fields'], 'id' => $c['id'] ?? implode('+', $c['fields'])];
            }
        }

        // New: keys[] from @class
        $keys = $metaArr['keys'] ?? [];
        foreach ($keys as $k) {
            $fields = $k['fields'] ?? [];
            if (!empty($fields)) {
                $allKeys[] = ['fields' => $fields, 'id' => implode('+', $fields)];
            }
        }

        if (empty($allKeys)) return;

        foreach ($allKeys as $keyDef) {
            $fields = $keyDef['fields'];
            $keyId = $keyDef['id'];

            // Build filter from current data
            $filters = [];
            $skip = false;
            foreach ($fields as $field) {
                $value = $data[$field] ?? null;
                if ($value === null) { $skip = true; break; }
                $filters[$field] = $value;
            }
            if ($skip) continue;

            // Query for existing objects with same key values
            $matches = $this->storage->query($classId, $filters, ['limit' => 2]);
            foreach ($matches as $existing) {
                $existingId = $existing[Constants::F_ID] ?? null;
                // Skip self (on update)
                if ($objectId !== null && $existingId == $objectId) continue;
                $fieldList = implode(', ', $fields);
                throw new StorageException(
                    "Unique key '{$keyId}' violated on [{$fieldList}]",
                    'validation_failed',
                    [['path' => $fields[0], 'message' => "Duplicate value for key '{$keyId}'", 'code' => 'unique']]
                );
            }
        }
    }

    /**
     * Normalize object data against class definition on read.
     * - Casts values to correct types (array/scalar normalization)
     * - Fills missing fields with defaults (if fillDefaults enabled)
     * - Does NOT validate — only normalizes structure
     */
    private function normalizeObjectData(string $classId, array $data): array
    {
        $meta = $this->getClass($classId);
        if (!$meta) return $data;

        $props = $this->getClassProps($classId);
        if (empty($props)) return $data;

        foreach ($props as $prop) {
            $key = $prop->key;

            if (array_key_exists($key, $data)) {
                // Cast existing value to match prop definition
                $data[$key] = $this->castValue($data[$key], $prop);
            } elseif ($this->fillDefaults && $prop->default_value !== null) {
                // Fill missing field with default
                $data[$key] = $prop->default_value;
            }
        }

        return $data;
    }

    private function guessDataType(mixed $value): string
    {
        if (is_bool($value)) return Constants::DT_BOOLEAN;
        if (is_int($value)) return Constants::DT_INTEGER;
        if (is_float($value)) return Constants::DT_FLOAT;
        if (is_array($value)) return Constants::DT_OBJECT;
        return Constants::DT_STRING;
    }

    /**
     * Ensure system classes exist (lazy bootstrap)
     *
     * Uses GenesisLoader to load from .es/ directory (genesis-first approach).
     * Falls back to SystemClasses for backward compatibility when .es/ files
     * are not available.
     */
    private function ensureBootstrap(): void
    {
        if ($this->bootstrapped) {
            return;
        }

        // Initialize GenesisLoader if .es/ directory path is set
        if (!empty($this->esDir)) {
            $this->genesisLoader = new GenesisLoader(
                $this->storage,
                $this->esDir,
                $this->genesisConfig['url'] ?? null,
                $this->genesisConfig['mode'] ?? 'local'
            );

            // Set apps directory for auto-discovery (apps/*/.es/)
            $appsDir = $this->genesisConfig['apps_dir'] ?? 'apps';
            if (!str_starts_with($appsDir, '/')) {
                $appsDir = $this->basePath . '/' . $appsDir;
            }
            if (is_dir($appsDir)) {
                $this->genesisLoader->setAppsDir($appsDir);
            }
        }

        // Check if @class exists - if not, bootstrap from genesis or SystemClasses
        $classClass = $this->storage->getobj(Constants::K_CLASS, Constants::K_CLASS);
        if (!$classClass) {
            // Try genesis-first approach
            if ($this->genesisLoader !== null && ($this->genesisConfig['auto_load'] ?? true)) {
                $this->genesisLoader->load(true);
            } else {
                // Fallback: create from SystemClasses (backward compat)
                SystemClasses::createSystemClasses($this->storage);
            }
        }

        // Check if @editor class exists (may be missing if added after initial bootstrap)
        $editorClass = $this->storage->getobj(Constants::K_CLASS, Constants::K_EDITOR);
        if (!$editorClass) {
            $editorClassDef = SystemClasses::getEditorClassDefinition();
            $this->storage->setobj(Constants::K_CLASS, $editorClassDef);
        }

        // Check if @seed class exists (may be missing if added after initial bootstrap)
        $seedClass = $this->storage->getobj(Constants::K_CLASS, Constants::K_SEED);
        if (!$seedClass) {
            $seedClassDef = SystemClasses::getSeedClassDefinition();
            $this->storage->setobj(Constants::K_CLASS, $seedClassDef);
        }

        // Check if seed editors exist
        $textEditor = $this->storage->getobj(Constants::K_EDITOR, 'text');
        if (!$textEditor) {
            // Try loading from .es/ seed file first
            if ($this->genesisLoader !== null) {
                $seedFile = $this->esDir . '/editors' . Constants::SEED_SUFFIX;
                if (file_exists($seedFile)) {
                    $editors = json_decode(file_get_contents($seedFile), true);
                    if (is_array($editors)) {
                        foreach ($editors as $editor) {
                            $this->storage->setobj(Constants::K_EDITOR, $editor);
                        }
                    }
                } else {
                    $this->createSeedEditors();
                }
            } else {
                $this->createSeedEditors();
            }
        }

        $this->bootstrapped = true;
    }

    // =========================================================================
    // GENESIS & SEED WRITE-BACK
    // =========================================================================

    /**
     * Get the GenesisLoader instance (available after bootstrap)
     *
     * @return GenesisLoader|null
     */
    public function getGenesisLoader(): ?GenesisLoader
    {
        return $this->genesisLoader;
    }

    /**
     * Check if current user has seed write permission.
     *
     * Permission is granted if:
     * - No auth is configured (development mode — always allowed)
     * - Auth is enabled but allowCustomIds is set (seeding context)
     *
     * @return bool
     */
    private function hasSeedWritePermission(): bool
    {
        // If AuthService class doesn't exist or isn't enabled, allow (dev mode)
        if (!class_exists('\\ElementStore\\AuthService') || !AuthService::isEnabled()) {
            return true;
        }

        // In authenticated mode, seed write-back requires custom IDs flag or system/admin role
        if ($this->allowCustomIds) return true;
        if (in_array('system', $this->userRoles, true)) return true;
        if (in_array('admin', $this->userRoles, true)) return true;
        return false;
    }

    /**
     * Write class/object changes back to genesis/seed files in .es/
     *
     * Triggered after onChange() when:
     * - Saving a @class definition that has a genesis_file field
     * - Saving an object whose class has a seed file mapping
     *
     * @param string $classId   Class being saved (e.g., "@class", "@editor")
     * @param array  $data      Input data
     * @param array  $savedData Saved result from storage
     */
    private function seedWriteBack(string $classId, array $data, array $savedData): void
    {
        // Case 1: Class definition change -> save to genesis file
        if ($classId === Constants::K_CLASS) {
            $genesisFile = $savedData[Constants::F_GENESIS_FILE] ?? null;
            $genesisDir = $savedData[Constants::F_GENESIS_DIR] ?? null;
            if ($genesisFile) {
                $this->genesisLoader->saveToGenesis(
                    $savedData[Constants::F_ID],
                    $genesisFile,
                    $savedData,
                    $genesisDir
                );
            }
            return;
        }

        // Case 2: Object on a seed class -> save to seed file
        $seedInfo = $this->resolveSeedFile($classId);
        if ($seedInfo !== null) {
            $this->genesisLoader->saveToSeed(
                $classId,
                $seedInfo['file'],
                $savedData,
                $seedInfo['dir']
            );
        }
    }

    /**
     * Delete object from its seed file (write-back on delete).
     *
     * @param string $classId  Class of the deleted object
     * @param string $objectId ID of the deleted object
     */
    private function seedDeleteBack(string $classId, string $objectId): void
    {
        $seedInfo = $this->resolveSeedFile($classId);
        if ($seedInfo !== null) {
            $this->genesisLoader->deleteFromSeed(
                $classId,
                $seedInfo['file'],
                $objectId,
                $seedInfo['dir']
            );
        }
    }

    /**
     * Resolve which seed file a class's objects should be saved to.
     *
     * Returns both the seed filename and the .es/ directory path.
     * Checks: 1) hardcoded system mappings, 2) GenesisLoader's dynamic seedFileMap.
     *
     * @param string $classId Class ID
     * @return array{file: string, dir: string}|null Seed file info or null
     */
    private function resolveSeedFile(string $classId): ?array
    {
        // Hardcoded system seed mappings (use own esDir)
        $systemFile = match ($classId) {
            Constants::K_EDITOR => 'editors' . Constants::SEED_SUFFIX,
            Constants::K_FUNCTION => 'functions' . Constants::SEED_SUFFIX,
            default => null,
        };

        if ($systemFile !== null) {
            return ['file' => $systemFile, 'dir' => $this->esDir];
        }

        // Check GenesisLoader's in-memory map (built from genesis seed sections)
        if ($this->genesisLoader !== null) {
            $map = $this->genesisLoader->getSeedFileMap();
            if (isset($map[$classId])) {
                return $map[$classId];
            }
        }

        // Fall back to persistent seed_file/genesis_dir on the class definition
        $classDef = $this->storage->getobj(Constants::K_CLASS, $classId);
        if ($classDef !== null) {
            $seedFile = $classDef[Constants::F_SEED_FILE] ?? null;
            $seedDir = $classDef[Constants::F_GENESIS_DIR] ?? null;
            if ($seedFile !== null && $seedDir !== null) {
                return ['file' => $seedFile, 'dir' => $seedDir];
            }
        }

        return null;
    }

    /**
     * Create seed editor definitions
     */
    private function createSeedEditors(): void
    {
        $seedEditors = SystemClasses::getSeedEditors();
        foreach ($seedEditors as $editor) {
            $this->storage->setobj(Constants::K_EDITOR, $editor);
        }
    }

    // =========================================================================
    // TEST & DEBUG
    // =========================================================================

    /**
     * Run test scenarios from test_data.json
     *
     * @return array Test results
     */
    public function runTests(): array
    {
        $testFile = dirname($this->basePath) . '/data/test_data.json';

        if (!file_exists($testFile)) {
            throw new StorageException('test_data.json not found', 'not_found');
        }

        $testData = json_decode(file_get_contents($testFile), true);
        $results = [];

        foreach ($testData['test_scenarios'] ?? [] as $scenario) {
            $name = $scenario['name'] ?? 'unnamed';
            $action = $scenario['action'] ?? '';
            $class = $scenario['class'] ?? '';
            $data = $scenario['data'] ?? [];
            $expectError = $scenario['expect_error'] ?? false;
            $expectedCode = $scenario['expected_code'] ?? null;

            $result = [
                'name' => $name,
                'action' => $action,
                'passed' => false,
                'error' => null,
            ];

            try {
                switch ($action) {
                    case 'create':
                    case 'update':
                        $this->setObject($class, $data);
                        $result['passed'] = !$expectError;
                        break;
                    case 'delete':
                        $this->deleteObject($class, $data[Constants::F_ID] ?? '');
                        $result['passed'] = !$expectError;
                        break;
                }
            } catch (StorageException $e) {
                $result['error'] = $e->getMessage();
                if ($expectError) {
                    if ($expectedCode && $e->getErrors()) {
                        $errorCodes = array_column($e->getErrors(), 'code');
                        $result['passed'] = in_array($expectedCode, $errorCodes);
                    } else {
                        $result['passed'] = true;
                    }
                }
            } catch (\Exception $e) {
                $result['error'] = $e->getMessage();
                $result['passed'] = $expectError;
            }

            $results[] = $result;
        }

        $passed = count(array_filter($results, fn($r) => $r['passed']));
        $total = count($results);

        return [
            'passed' => $passed,
            'total' => $total,
            'success' => $passed === $total,
            'results' => $results,
        ];
    }

    // =========================================================================
    // RELATION HELPERS
    // =========================================================================

    /**
     * Check if a class matches a target class (including child classes)
     *
     * @param string $targetClass  The expected class (e.g., "User")
     * @param string $actualClass  The actual class to check (e.g., "Customer")
     * @param bool   $strict       If true, only exact match; if false, accept children
     *
     * @return bool
     */
    public function isClassOrChild(string $targetClass, string $actualClass, bool $strict = false): bool
    {
        // Exact match
        if ($targetClass === $actualClass) {
            return true;
        }

        // If strict, no child classes allowed
        if ($strict) {
            return false;
        }

        // Check if actualClass inherits from targetClass
        $classMeta = $this->getClass($actualClass);
        while ($classMeta !== null && $classMeta->extends_id !== null) {
            if ($classMeta->extends_id === $targetClass) {
                return true;
            }
            $classMeta = $this->getClass($classMeta->extends_id);
        }

        return false;
    }

    /**
     * Get all child classes of a given class
     *
     * @param string $parentClass Parent class ID
     *
     * @return array Array of class IDs that extend the parent
     */
    public function getChildClasses(string $parentClass): array
    {
        $children = [];
        $allClasses = $this->getAllClasses();

        foreach ($allClasses as $class) {
            if ($this->isClassOrChild($parentClass, $class->id, false) && $class->id !== $parentClass) {
                $children[] = $class->id;
            }
        }

        return $children;
    }

    /**
     * Unlink related objects from a reference relation (many-to-many)
     * Handles orphan cleanup if configured
     *
     * @param string $class_id     Parent class
     * @param mixed  $id           Parent object ID
     * @param string $propKey      Relation property key
     * @param array  $relatedIds   IDs to unlink
     * @param bool   $deleteObjects Also delete the objects (not just unlink)
     *
     * @return array Result with unlinked and deleted counts
     */
    public function unlinkRelation(
        string $class_id,
        mixed $id,
        string $propKey,
        array $relatedIds,
        bool $deleteObjects = false
    ): array {
        $obj = $this->getObject($class_id, $id);
        if ($obj === null) {
            throw new StorageException("Object not found: {$class_id}/{$id}", 'not_found');
        }

        $meta = $this->getClass($class_id);
        $prop = $meta?->getProp($propKey);
        if ($prop === null || !$prop->isReferenceRelation()) {
            throw new StorageException("Property {$propKey} is not a reference relation", 'invalid_relation');
        }

        $currentIds = $obj->$propKey ?? [];
        if (!is_array($currentIds)) {
            $currentIds = [];
        }

        // Remove the IDs from the array
        $newIds = array_values(array_diff($currentIds, $relatedIds));
        $unlinked = array_intersect($currentIds, $relatedIds);

        // Update the parent object
        $this->setObject($class_id, [
            Constants::F_ID => $id,
            $propKey => $newIds,
        ]);

        $deleted = [];

        // Handle orphans or explicit delete
        // Use primary target class for delete operations
        $targetClass = $prop->getPrimaryTargetClass();
        foreach ($unlinked as $relatedId) {
            if ($deleteObjects && $targetClass) {
                // Explicit delete requested
                $this->deleteObject($targetClass, $relatedId);
                $deleted[] = $relatedId;
            } elseif ($prop->shouldDeleteOnOrphan() && $targetClass) {
                // Check if orphaned (no other references)
                if ($this->isOrphaned($targetClass, $relatedId)) {
                    $this->deleteObject($targetClass, $relatedId);
                    $deleted[] = $relatedId;
                }
            }
        }

        return [
            'unlinked' => count($unlinked),
            'deleted' => count($deleted),
            'remaining' => count($newIds),
        ];
    }

    /**
     * Check if an object is orphaned (no references from any parent)
     *
     * @param string $class_id Object class
     * @param mixed  $id       Object ID
     *
     * @return bool True if no references exist
     */
    public function isOrphaned(string $class_id, mixed $id): bool
    {
        // Find all classes that have reference relations to this class
        $allClasses = $this->getAllClasses();

        foreach ($allClasses as $classMeta) {
            foreach ($classMeta->getProps() as $prop) {
                if ($prop->isReferenceRelation() && $prop->hasTargetClasses()) {
                    // Check if any target class matches
                    $matchesClass = false;
                    foreach ($prop->getTargetClasses() as $targetClass) {
                        if ($this->isClassOrChild($targetClass, $class_id, $prop->object_class_strict)) {
                            $matchesClass = true;
                            break;
                        }
                    }

                    if ($matchesClass) {
                        // Query all objects of this class and check if any reference the target
                        $objects = $this->storage->query($classMeta->id, []);
                        foreach ($objects as $obj) {
                            $ids = $obj[$prop->key] ?? [];
                            if (is_array($ids) && in_array($id, $ids)) {
                                return false; // Found a reference
                            }
                        }
                    }
                }
            }
        }

        return true; // No references found
    }

    /**
     * Find all orphaned objects of a class
     *
     * @param string $class_id Class to check
     *
     * @return array Array of orphaned object IDs
     */
    public function findOrphans(string $class_id): array
    {
        $orphans = [];
        $objects = $this->query($class_id);

        foreach ($objects as $obj) {
            if ($this->isOrphaned($class_id, $obj->id)) {
                $orphans[] = $obj->id;
            }
        }

        return $orphans;
    }

    /**
     * Delete all orphaned objects of a class
     *
     * @param string $class_id Class to clean
     *
     * @return array Result with deleted count and IDs
     */
    public function cleanupOrphans(string $class_id): array
    {
        $orphans = $this->findOrphans($class_id);
        $deleted = [];

        foreach ($orphans as $id) {
            if ($this->deleteObject($class_id, $id)) {
                $deleted[] = $id;
            }
        }

        return [
            'class_id' => $class_id,
            'found' => count($orphans),
            'deleted' => count($deleted),
            'ids' => $deleted,
        ];
    }

    /**
     * Find an object by ID across all classes (used for parent resolution).
     * Checks the ID prefix to guess the class, or falls back to scanning.
     *
     * @param mixed $id Object ID
     * @return array|null Object data or null
     */
    private function findObjectById(mixed $id): ?array
    {
        if ($id === null) return null;
        $idStr = (string) $id;

        // If ID contains ':', the prefix before ':' might be the class
        if (str_contains($idStr, ':')) {
            $prefix = substr($idStr, 0, strpos($idStr, ':'));
            // Try common class patterns
            $candidates = [$prefix, "ai:$prefix", "es:$prefix", "core:$prefix"];
            foreach ($candidates as $cls) {
                $data = $this->storage->getobj($cls, $idStr);
                if ($data !== null) return $data;
            }
        }

        return null;
    }

    /**
     * Cascade from_parent field changes to child objects.
     * When a parent object is updated, find all children with primary_id = this object's ID,
     * and update their from_parent fields to match.
     *
     * @param string $class_id Parent's class
     * @param array  $data     Updated parent data
     * @param array  $changes  Changed fields
     */
    private function cascadeFromParentFields(string $class_id, array $data, array $changes): void
    {
        $parentId = $data[Constants::F_ID] ?? null;
        if ($parentId === null) return;

        // Find which from_parent fields changed
        $meta = $this->getClass($class_id);
        if ($meta === null) return;

        $props = $this->getClassProps($class_id);
        $changedParentFields = [];
        foreach ($props as $prop) {
            if (isset($changes[$prop->key])) {
                $changedParentFields[$prop->key] = $data[$prop->key] ?? null;
            }
        }

        if (empty($changedParentFields)) return;

        // Find children: objects of same class (or child classes) where primary_id = this ID
        try {
            $children = $this->storage->find($class_id, ['primary_id' => $parentId], 100);
        } catch (\Throwable $e) {
            return; // No primary_id field or no children — skip silently
        }

        if (empty($children)) return;

        // Get child class props to check which have from_parent flag
        foreach ($children as $child) {
            $childClassId = $child[Constants::F_CLASS_ID] ?? $class_id;
            $childProps = $this->getClassProps($childClassId);
            $updates = [];

            foreach ($childProps as $prop) {
                if ($prop->isFromParent() && isset($changedParentFields[$prop->key])) {
                    $currentVal = $child[$prop->key] ?? null;
                    $newVal = $changedParentFields[$prop->key];
                    if ($currentVal !== $newVal) {
                        $updates[$prop->key] = $newVal;
                    }
                }
            }

            if (!empty($updates)) {
                $childId = $child[Constants::F_ID];
                $updates[Constants::F_ID] = $childId;
                $updates[Constants::F_CLASS_ID] = $childClassId;
                // Direct storage update to avoid recursive validation
                $merged = array_merge($child, $updates);
                $this->storage->setobj($childClassId, $merged);
                BroadcastService::emitChange($merged, $child, $this->userId);
            }
        }
    }

    // =========================================================================
    // @ACTION EXECUTION — class methods and object methods
    // =========================================================================

    /**
     * Execute a class-level @action (no specific object).
     * Looks up the action by name on the class definition, then executes.
     *
     * @param string $class_id  Class to execute action on
     * @param string $actionName Action name (e.g. 'merge_into', 'validate_keys')
     * @param array  $params    Action parameters
     * @return array Result data
     */
    public function executeClassAction(string $class_id, string $actionName, array $params = []): array
    {
        $this->ensureBootstrap();

        // Find the @action object for this class + action name
        $actionDef = $this->findAction($class_id, $actionName);
        if ($actionDef === null) {
            // Check built-in actions
            return $this->executeBuiltinAction($class_id, null, $actionName, $params);
        }

        $executor = new ActionExecutor($this->storage, $this);
        return $executor->execute($actionDef, $params, ['class_id' => $class_id]);
    }

    /**
     * Execute an object-level @action.
     *
     * @param string $class_id  Class of the object
     * @param mixed  $id        Object ID
     * @param string $actionName Action name
     * @param array  $params    Action parameters
     * @return array Result data
     */
    public function executeObjectAction(string $class_id, mixed $id, string $actionName, array $params = []): array
    {
        $this->ensureBootstrap();

        $objData = $this->storage->getobj($class_id, $id);
        if ($objData === null) {
            throw new StorageException("Object not found: {$class_id}/{$id}", 'not_found');
        }

        $actionDef = $this->findAction($class_id, $actionName);
        if ($actionDef === null) {
            return $this->executeBuiltinAction($class_id, $id, $actionName, $params);
        }

        $executor = new ActionExecutor($this->storage, $this);
        return $executor->execute($actionDef, $params, $objData);
    }

    /**
     * Resolve /me — find or create the current user's object for a class.
     * Uses JWT payload to identify the user.
     *
     * @param string $class_id Class to resolve /me for
     * @return AtomObj|null The resolved object, or null if not authenticated
     */
    public function resolveMe(string $class_id): ?AtomObj
    {
        if ($this->userId === null) return null;

        // For @user: find by user_id key
        if ($class_id === '@user') {
            $results = $this->storage->query('@user', ['user_id' => $this->userId], ['limit' => 1]);
            if (!empty($results)) {
                return $this->factory('@user', $results[0]);
            }
            // Auto-create @user from JWT context
            $userData = [
                Constants::F_CLASS_ID => '@user',
                'user_id' => $this->userId,
                'role' => $this->userRoles[0] ?? 'user',
            ];
            if ($this->appId) $userData['app_id'] = $this->appId;
            if ($this->tenantId) $userData['tenant_id'] = $this->tenantId;
            return $this->setObject('@user', $userData);
        }

        // For @session: find by current session (JWT jti)
        if ($class_id === '@session') {
            // Session ID would come from JWT 'jti' claim — stored in a session context field
            return null; // TODO: implement session resolution from JWT jti
        }

        // For @tenant: find by current tenant_id
        if ($class_id === '@tenant') {
            if ($this->tenantId === null) return null;
            $obj = $this->getObject('@tenant', $this->tenantId);
            return $obj;
        }

        // For @app: find by current app_id
        if ($class_id === '@app') {
            if ($this->appId === null) return null;
            $obj = $this->getObject('@app', $this->appId);
            return $obj;
        }

        // Generic: find object where owner_id = current user
        $results = $this->storage->find($class_id, ['owner_id' => $this->userId], 1);
        if (!empty($results)) {
            return $this->factory($class_id, $results[0]);
        }
        return null;
    }

    /**
     * Find an @action definition for a class by action name.
     */
    private function findAction(string $class_id, string $actionName): ?array
    {
        // 1. Check class definition's actions[] array
        $meta = $this->getClass($class_id);
        if ($meta) {
            $metaArr = $meta->toArray();
            $actions = $metaArr['actions'] ?? [];
            foreach ($actions as $act) {
                if (is_array($act) && ($act['name'] ?? '') === $actionName) {
                    return $act;
                }
                // If actions[] contains IDs (strings), resolve them
                if (is_string($act)) {
                    $actData = $this->storage->getobj(Constants::K_ACTION, $act);
                    if ($actData && ($actData['name'] ?? '') === $actionName) {
                        return $actData;
                    }
                }
            }

            // 2. Check parent class (inheritance)
            $extendsId = $metaArr['extends_id'] ?? null;
            if ($extendsId) {
                $parentAction = $this->findAction($extendsId, $actionName);
                if ($parentAction) return $parentAction;
            }
        }

        // 3. Fallback: query @action objects by target_class_id
        try {
            $actions = $this->storage->find(Constants::K_ACTION, [
                'target_class_id' => $class_id,
                'name' => $actionName,
            ], 1);
            return !empty($actions) ? $actions[0] : null;
        } catch (\Throwable $e) {
            return null;
        }
    }

    /**
     * Execute built-in actions that don't need @action objects.
     * These are core operations available on all classes.
     */
    private function executeBuiltinAction(string $class_id, ?string $id, string $actionName, array $params): array
    {
        switch ($actionName) {
            case 'merge_into':
                return $this->actionMergeInto($class_id, $id, $params);
            case 'validate_keys':
                return $this->actionValidateKeys($class_id);
            case 'sync_genesis':
                return $this->actionSyncGenesis($class_id);
            default:
                throw new StorageException("Unknown action: {$actionName} on {$class_id}", 'not_found');
        }
    }

    /**
     * Built-in action: merge object or class into target.
     * Object-level: merge this object's data into target object.
     * Class-level: migrate all objects from this class to target class.
     */
    private function actionMergeInto(string $class_id, ?string $id, array $params): array
    {
        $targetClass = $params['target_class'] ?? null;
        $targetId = $params['target_id'] ?? null;

        if ($id !== null && $targetId !== null) {
            // Object merge: copy props from source to target
            $source = $this->storage->getobj($class_id, $id);
            $target = $this->storage->getobj($targetClass ?? $class_id, $targetId);
            if (!$source || !$target) {
                throw new StorageException("Source or target not found", 'not_found');
            }

            // Merge: source props into target, skip system fields
            $skipFields = [Constants::F_ID, Constants::F_CLASS_ID, 'created_at', 'updated_at', '@state', '_rev'];
            $merged = $target;
            foreach ($source as $k => $v) {
                if (!in_array($k, $skipFields) && !isset($target[$k])) {
                    $merged[$k] = $v;
                }
            }
            $saved = $this->setObject($targetClass ?? $class_id, $merged);
            return ['merged' => true, 'target' => $saved->toArray()];
        }

        if ($targetClass !== null) {
            // Class merge: migrate all objects from source class to target class
            $sourceObjects = $this->storage->query($class_id, [Constants::F_CLASS_ID => $class_id]);
            $migrated = 0;
            $errors = [];

            foreach ($sourceObjects as $obj) {
                $obj[Constants::F_CLASS_ID] = $targetClass;
                unset($obj['@state']); // Reset state for new class
                try {
                    $this->setObject($targetClass, $obj);
                    $migrated++;
                } catch (\Throwable $e) {
                    $errors[] = ['id' => $obj[Constants::F_ID] ?? '?', 'error' => $e->getMessage()];
                }
            }

            return [
                'merged' => true,
                'source_class' => $class_id,
                'target_class' => $targetClass,
                'migrated' => $migrated,
                'errors' => $errors,
            ];
        }

        throw new StorageException("merge_into requires target_class or target_id", 'validation_failed');
    }

    /**
     * Built-in action: validate all unique keys for a class.
     * Scans all objects and reports duplicates.
     */
    private function actionValidateKeys(string $class_id): array
    {
        $meta = $this->getClass($class_id);
        if (!$meta) {
            throw new StorageException("Class not found: {$class_id}", 'not_found');
        }
        $metaArr = $meta->toArray();
        $keys = $metaArr['keys'] ?? [];
        if (empty($keys)) {
            return ['valid' => true, 'message' => 'No keys defined on this class'];
        }

        $objects = $this->storage->query($class_id, [Constants::F_CLASS_ID => $class_id]);
        $violations = [];

        foreach ($keys as $keyDef) {
            $fields = $keyDef['fields'] ?? [];
            if (empty($fields)) continue;

            $seen = [];
            foreach ($objects as $obj) {
                $keyValue = implode('|', array_map(fn($f) => (string)($obj[$f] ?? ''), $fields));
                $objId = $obj[Constants::F_ID] ?? '?';
                if (isset($seen[$keyValue])) {
                    $violations[] = [
                        'key_fields' => $fields,
                        'value' => $keyValue,
                        'objects' => [$seen[$keyValue], $objId],
                    ];
                } else {
                    $seen[$keyValue] = $objId;
                }
            }
        }

        return [
            'valid' => empty($violations),
            'keys_checked' => count($keys),
            'objects_checked' => count($objects),
            'violations' => $violations,
        ];
    }

    /**
     * Built-in action: sync class definition to genesis file.
     */
    private function actionSyncGenesis(string $class_id): array
    {
        if ($this->genesisLoader === null) {
            throw new StorageException("GenesisLoader not available", 'not_available');
        }

        $classData = $this->storage->getobj(Constants::K_CLASS, $class_id);
        if (!$classData) {
            throw new StorageException("Class not found: {$class_id}", 'not_found');
        }

        $genesisFile = $classData[Constants::F_GENESIS_FILE] ?? null;
        $genesisDir = $classData[Constants::F_GENESIS_DIR] ?? null;

        if (!$genesisFile) {
            throw new StorageException("Class {$class_id} has no genesis_file set", 'not_configured');
        }

        $this->genesisLoader->saveToGenesis($class_id, $genesisFile, $classData, $genesisDir);
        return ['synced' => true, 'class_id' => $class_id, 'genesis_file' => $genesisFile];
    }
}
