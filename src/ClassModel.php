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

    /** @var mixed Application ID for multi-tenant isolation */
    private mixed $appId = null;

    /** @var mixed Domain for multi-tenant isolation */
    private mixed $domain = null;

    /** @var bool Enforce owner_id filtering on getObject */
    private bool $enforceOwnership = true;

    /** @var bool Allow custom IDs when creating objects (for seeding/testing) */
    private bool $allowCustomIds = false;

    /** @var \Phalcon\Di\DiInterface|null DI container */
    private ?\Phalcon\Di\DiInterface $di = null;

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
        $dataDir = dirname($basePath) . '/data';

        // Default storage config
        $storageConfig = [
            'type' => 'json',
            'data_dir' => $dataDir,
        ];

        // Load from @init.json if exists
        if (file_exists($initFile)) {
            $initData = json_decode(file_get_contents($initFile), true);
            if (isset($initData[Constants::K_STORAGE]['bootstrap'])) {
                $storageConfig = array_merge($storageConfig, $initData[Constants::K_STORAGE]['bootstrap']);
            }
        }

        // Resolve relative paths
        if (isset($storageConfig['data_dir']) && !str_starts_with($storageConfig['data_dir'], '/')) {
            $storageConfig['data_dir'] = $basePath . '/' . $storageConfig['data_dir'];
        }

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
            default => new JsonStorageProvider($storageConfig['data_dir'])
        };

        return new self($storage, $basePath, $userId);
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
        if ($this->userId !== null) {
            $objOwnerId = $data[Constants::F_OWNER_ID] ?? null;
            if ($objOwnerId !== null && $objOwnerId !== $this->userId) {
                return false;
            }
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
        $this->ensureBootstrap();

        $meta = $this->getClass($class_id);
        $id = $data[Constants::F_ID] ?? null;
        $oldObj = null;
        $oldData = null;

        // Step 1: Get old object if ID provided
        if ($id !== null) {
            $oldData = $this->storage->getobj($class_id, $id);

            // For non-system classes with custom IDs disabled, object must exist
            if ($oldData === null && !$this->isSystemClass($class_id) && !$this->allowCustomIds) {
                throw new StorageException(
                    "Cannot create object with custom ID. Object {$class_id}/{$id} does not exist.",
                    'not_found'
                );
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
            $result = $this->validate($class_id, $data, $oldData);
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
        }

        // Step 4: Detect changes
        $changes = $this->detectChanges($data, $oldData);

        // Step 5: No changes - return existing object
        if (empty($changes) && $oldData !== null) {
            return $this->factory($class_id, $oldData);
        }

        // Step 6: Save and handle side effects
        $savedData = $this->onChange($class_id, $data, $oldData, $changes);

        // Step 7: Create AtomObj, clear changes, return
        $obj = $this->factory($class_id, $savedData);
        $obj->clearChanges();
        $obj->markSaved();

        // Update cache
        $this->toCache($obj);

        return $obj;
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
        // Verify security access before delete
        if (!$this->isSystemClass($class_id) && $this->enforceOwnership) {
            $obj = $this->storage->getobj($class_id, $id);
            if ($obj !== null && !$this->checkSecurityAccess($obj)) {
                return false; // Security mismatch
            }
        }

        // Remove from cache
        unset($this->objectCache[$class_id][$id]);

        return $this->storage->delobj($class_id, $id);
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
        if (!$this->isSystemClass($class_id) && $this->enforceOwnership) {
            $this->injectSecurityFilters($filters);
        }

        $results = $this->storage->query($class_id, $filters, $options);

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

        // Load from storage
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

        $data = $this->storage->query(Constants::K_CLASS, [
            Constants::F_CLASS_ID => Constants::K_CLASS
        ]);

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
        if ($meta->extends_id !== null && !str_starts_with($meta->extends_id, '@')) {
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
    private function validate(string $class_id, array $data, ?array $oldData = null): array
    {
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
                        if ($targetClass) {
                            $nestedResult = $this->validate($targetClass, $item, $oldItem);
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
                    $nestedResult = $this->validate($targetClass, $inputValue, $oldValue);
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
                } elseif ($prop->required) {
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
     * Validate a single property value
     */
    private function validateProperty(mixed $value, Prop $prop): array
    {
        $errors = [];
        $key = $prop->key;
        $label = $prop->getLabel();

        // Null/empty check
        if ($value === null || $value === '') {
            if ($prop->required) {
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
            Constants::DT_NUMBER, Constants::DT_FLOAT => !is_numeric($checkValue) ? "{$label} must be a number" : null,
            Constants::DT_BOOLEAN => (!is_bool($checkValue) && !in_array($checkValue, [0, 1, '0', '1'], true)) ? "{$label} must be a boolean" : null,
            Constants::DT_ENUM => $this->validateEnum($checkValue, $prop, $label),
            Constants::DT_OBJECT => (!is_array($checkValue) && !is_object($checkValue)) ? "{$label} must be an object" : null,
            Constants::DT_RELATION => $this->validateRelation($checkValue, $prop, $label),
            default => null,
        };
    }

    private function validateEnum(mixed $value, Prop $prop, string $label): ?string
    {
        // Check options array
        $options = array_column($prop->options ?? [], 'value');
        if (!empty($options) && !in_array($value, $options)) {
            return "{$label} must be one of: " . implode(', ', $options);
        }

        // Check enum_values array
        if (!empty($prop->enum_values) && !in_array($value, $prop->enum_values)) {
            return "{$label} must be one of: " . implode(', ', $prop->enum_values);
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

        if ($prop->is_array && is_array($value)) {
            return array_map(fn($v) => $this->castSingleValue($v, $prop->data_type), $value);
        }

        return $this->castSingleValue($value, $prop->data_type);
    }

    private function castSingleValue(mixed $value, string $dataType): mixed
    {
        if ($value === null) {
            return null;
        }

        return match ($dataType) {
            Constants::DT_NUMBER, Constants::DT_FLOAT => $this->castToNumber($value),
            Constants::DT_BOOLEAN => $this->castToBoolean($value),
            Constants::DT_STRING => is_scalar($value) ? (string)$value : $value,
            default => $value,
        };
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

        // Handle class meta changes (renames)
        if ($class_id === Constants::K_CLASS && !empty($changes)) {
            $this->handleClassMetaChanges($data, $oldData, $changes);
        }

        // Invalidate class cache if class was modified
        if ($class_id === Constants::K_CLASS) {
            unset($this->objectCache[Constants::K_CLASS][$data[Constants::F_ID]]);
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
     * Check if name is unique within class
     */
    private function isNameUnique(string $classId, string $name, mixed $excludeId): bool
    {
        $all = $this->storage->getobj($classId);
        if (!$all) {
            return true;
        }

        foreach ($all as $obj) {
            if ($excludeId !== null && ($obj[Constants::F_ID] ?? null) == $excludeId) {
                continue;
            }
            if (isset($obj[Constants::F_NAME]) && strtolower($obj[Constants::F_NAME]) === strtolower($name)) {
                return false;
            }
        }
        return true;
    }

    /**
     * Guess data type from PHP value
     */
    private function guessDataType(mixed $value): string
    {
        if (is_bool($value)) return Constants::DT_BOOLEAN;
        if (is_int($value)) return Constants::DT_NUMBER;
        if (is_float($value)) return Constants::DT_FLOAT;
        if (is_array($value)) return Constants::DT_OBJECT;
        return Constants::DT_STRING;
    }

    /**
     * Ensure system classes exist (lazy bootstrap)
     */
    private function ensureBootstrap(): void
    {
        if ($this->bootstrapped) {
            return;
        }

        // Check if @class exists - if not, create all system classes
        $classClass = $this->storage->getobj(Constants::K_CLASS, Constants::K_CLASS);
        if (!$classClass) {
            SystemClasses::createSystemClasses($this->storage);
        }

        // Check if @editor class exists (may be missing if added after initial bootstrap)
        $editorClass = $this->storage->getobj(Constants::K_CLASS, Constants::K_EDITOR);
        if (!$editorClass) {
            // Create just the @editor class
            $editorClassDef = SystemClasses::getEditorClassDefinition();
            $this->storage->setobj(Constants::K_CLASS, $editorClassDef);
        }

        // Check if seed editors exist
        $textEditor = $this->storage->getobj(Constants::K_EDITOR, 'text');
        if (!$textEditor) {
            $this->createSeedEditors();
        }

        $this->bootstrapped = true;
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
}
