<?php
/**
 * ElementStore Class Model
 * Core classes for object metadata and storage management.
 * ClassModel is the "smart" layer that handles validation, change detection,
 * and orchestrates storage operations.
 * ARCHITECTURE OVERVIEW:
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  API Layer (index.php)                                                      │
 * │    ↓                                                                        │
 * │  ClassModel (smart - validation, change detection, orchestration)           │
 * │    ↓                                                                        │
 * │  IStorageProvider (dumb - raw CRUD operations)                              │
 * │    ↓                                                                        │
 * │  JSON files / MongoDB / SQL (persistence)                                   │
 * └─────────────────────────────────────────────────────────────────────────────┘
 * SETOBJECT FLOW:
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  setObject(classId, obj)                                                    │
 * │    │                                                                        │
 * │    ├─→ Get old object (if ID provided)                                      │
 * │    ├─→ Apply defaults (for new objects)                                     │
 * │    ├─→ Validate against class meta                                          │
 * │    ├─→ detectChanges(obj, oldObj)                                           │
 * │    │     └─→ If no changes & oldObj exists → return oldObj (skip save)      │
 * │    │                                                                        │
 * │    └─→ onChange(classId, obj, oldObj, changes)                              │
 * │          │                                                                  │
 * │          ├─→ storage->setobj() ─────────────────────→ Save to storage       │
 * │          │                                                                  │
 * │          └─→ If classId == @class (meta changed):                           │
 * │                handleClassMetaChanges()                                     │
 * │                  ├─→ If class ID renamed → storage->renameClass()           │
 * │                  └─→ If prop keys renamed → storage->renameProp()           │
 * └─────────────────────────────────────────────────────────────────────────────┘
 * KEY CONCEPTS:
 * - Classes are objects too: stored in @class with class_id = @class
 * - Everything flows through setObject(), including class definitions
 * - Change detection happens BEFORE save, not after
 * - Renames are detected and propagated automatically
 *
 * @package ElementStore
 */

namespace ElementStore;

use Agura\Users\agrCst;

/**
 * AtomObj - Base class for all storable objects
 * Provides common fields and serialization for all ElementStore objects.
 * Both ClassMeta and Prop extend this base class.
 * Supports dynamic properties via __get/__set magic methods.
 * Defined properties are accessed directly, extra/unknown properties
 * are stored in $extraData and merged on serialization.
 * USAGE:
 * ```php
 * $obj = new AtomObj('user', ['id' => 1, 'name' => 'Test', 'custom' => 123]);
 * $obj->name;           // "Test" - from public property
 * $obj->custom;         // 123 - from extraData via __get
 * $obj->newField = 'x'; // stored in extraData via __set
 * $obj->toArray();      // merges public props with extraData
 * $obj->getModel()->getObject('user', 1); // access model via DI
 * ```
 */
class AtomObj implements \JsonSerializable {
    /** @var mixed Object ID (string or int) */
    public mixed $id = null;

    /** @var string|null Class identifier this object belongs to */
    public string $class_id = '';

    /** @var string|null Human-readable name */
    public ?string $name = null;

    /** @var mixed Owner/creator ID */
    public mixed $owner_id = null;

    /** @var array Storage for extra/dynamic properties */
    private array $extraData = [];

    /** @var \Phalcon\Di\DiInterface|null DI container */
    protected ?\Phalcon\Di\DiInterface $di = null;

    static protected array $reflectProps = [];

    /**
     * Create instance with class_id and optional data
     *
     * @param string|null                  $class_id Class identifier
     * @param array                        $props    Key-value data to initialize
     * @param \Phalcon\Di\DiInterface|null $di       DI container (null = use default)
     */
    public function __construct(?string $class_id = null, array $props = [], ?\Phalcon\Di\DiInterface $di = null) {
        $this->di = $di ?? \Phalcon\Di\Di::getDefault();
        $this->class_id = $class_id;
        $allowedNames = self::$reflectProps[static::class] ?? null;
        if ($allowedNames === null) {
            $reflect = new \ReflectionClass($this);
            $publicProps = $reflect->getProperties(\ReflectionProperty::IS_PUBLIC) ?? [];
            self::$reflectProps[static::class] = $allowedNames = array_map(fn($p) => $p->getName(), $publicProps);
        }
        foreach ($props as $key => $value) {
            if (in_array($key, $allowedNames)) {
                $this->$key = $value;
                unset($props[$key]);
            }
        }
}

    public static function factory($objData) {
        $class_id = $objData[F_CLASS_ID] ?? null;
        $id = $objData[F_ID] ?? null;
        $owner_id = $objData[F_OWNER_ID] ?? null;
        


    }

    /**
     * Get the DI container
     *
     * @return \Phalcon\Di\DiInterface|null
     */
    public function getDi(): ?\Phalcon\Di\DiInterface {
        return $this->di ?? \Phalcon\Di\Di::getDefault();
    }

    /**
     * Get the ClassModel from DI
     *
     * @return ClassModel|null
     */
    public function getModel(): ?ClassModel {
        $di = $this->getDi();
        return $di?->has('model') ? $di->get('model') : null;
    }

    /**
     * Magic getter for non-existent properties
     *
     * @param string $name Property name
     *
     * @return mixed Property value or null
     */
    public function __get(string $name): mixed {
        return $this->extraData[$name] ?? null;
    }

    /**
     * Magic setter for non-existent properties
     *
     * @param string $name  Property name
     * @param mixed  $value Property value
     */
    public function __set(string $name, mixed $value): void {
        $this->extraData[$name] = $value;
    }

    /**
     * Magic isset for non-existent properties
     *
     * @param string $name Property name
     *
     * @return bool
     */
    public function __isset(string $name): bool {
        return isset($this->extraData[$name]);
    }

    /**
     * Magic unset for non-existent properties
     *
     * @param string $name Property name
     */
    public function __unset(string $name): void {
        unset($this->extraData[$name]);
    }

    /**
     * Serialize to JSON-compatible array
     * Merges public properties with extraData.
     * Filters out null values to keep storage compact.
     *
     * @return array
     */
    public function jsonSerialize(): array {
        $vars = get_object_vars($this);
        unset($vars['extraData']);
        $merged = array_merge($vars, $this->extraData);
        return array_filter($merged, fn($v) => $v !== null);
    }

    /**
     * Convert to array (alias for jsonSerialize)
     *
     * @return array
     */
    public function toArray(): array {
        return $this->jsonSerialize();
    }

    /**
     * Create instance from array data
     *
     * @param array                        $data Key-value data (should include class_id)
     * @param \Phalcon\Di\DiInterface|null $di   DI container
     *
     * @return static New instance with data applied
     */
    public static function fromArray(array $data, ?\Phalcon\Di\DiInterface $di = null): static {
        $classId = $data['class_id'] ?? null;
        unset($data['class_id']);
        return new static($classId, $data, $di);
    }
}

class EntityObj extends AtomObj {

    /** @var string|null Creation timestamp */
    public ?string $created_at = null;

    /** @var string|null Last update timestamp */
    public ?string $updated_at = null;

    /** @var mixed Creator user ID */
    public mixed $created_by = null;

    /** @var mixed Last updater user ID */
    public mixed $updated_by = null;

    /** @var bool Is this a system object (protected from deletion) */
    public bool $is_system = false;

    /** @var bool Is this a seed/initial data object */
    public bool $is_seed = false;

}

/**
 * Prop - Property definition for a class
 * Defines a single property within a class, including its type,
 * validation rules, editor configuration, and display settings.
 */
class Prop extends EntityObj {

    public string $class_id = Constants::K_PROP;
    /**
     * Available editor types with descriptions
     */
    const EDITORS = [
        'text' => 'Single line text input',
        'textarea' => 'Multi-line text input',
        'number' => 'Numeric input with step',
        'slider' => 'Slider for numeric ranges',
        'toggle' => 'Boolean on/off toggle',
        'checkbox' => 'Boolean checkbox',
        'select' => 'Dropdown select from options',
        'multi-select' => 'Multiple selection from options',
        'date' => 'Date picker',
        'datetime' => 'Date and time picker',
        'color' => 'Color picker',
        'icon' => 'Icon selector',
        'code' => 'Code editor with syntax',
        'json' => 'JSON editor',
        'reference' => 'Reference to single object',
        'references' => 'Reference to multiple objects',
        'file' => 'File upload',
        'image' => 'Image upload with preview',
    ];

    // Property field constants
    const PF_KEY = 'key';
    const PF_NAME = 'name';
    const PF_LABEL = 'label';
    const PF_DESCRIPTION = 'description';
    const PF_DATA_TYPE = 'data_type';
    const PF_IS_ARRAY = 'is_array';
    const PF_OBJECT_CLASS_ID = 'object_class_id';
    const PF_OPTIONS = 'options';
    const PF_EDITOR = 'editor';
    const PF_VALIDATORS = 'validators';
    const PF_ENUM_VALUES = 'enum_values';
    const PF_REQUIRED = 'required';
    const PF_READONLY = 'readonly';
    const PF_DEFAULT_VALUE = 'default_value';
    const PF_DISPLAY_ORDER = 'display_order';
    const PF_GROUP_NAME = 'group_name';
    const PF_HIDDEN = 'hidden';

    /** @var string Property key (field name) */
    public string $key;

    /** @var string|null Display label */
    public ?string $label = null;

    /** @var string|null Description/help text */
    public ?string $description = null;

    /** @var string Data type (see Constants::DT_*) */
    public string $data_type = Constants::DT_STRING;

    /** @var bool Is this property an array of values */
    public bool $is_array = false;

    /** @var string|null For relations: target class ID */
    public ?string $object_class_id = null;

    /** @var array|null For enums: available options [{value, label}] */
    public ?array $options = null;

    /** @var array Editor configuration {type, ...options} */
    public array $editor = ['type' => 'text'];

    /** @var array Validation rules [{type, ...params}] */
    public array $validators = [];

    /** @var bool Is this field required */
    public bool $required = false;

    /** @var bool Is this field read-only */
    public bool $readonly = false;

    /** @var mixed Default value for new objects */
    public mixed $default_value = null;

    /** @var int Display order in forms/tables */
    public int $display_order = 0;

    /** @var string|null Group name for form sections */
    public ?string $group_name = null;

    /** @var bool Hide from default views */
    public bool $hidden = false;

    /** @var array|null Enum values for enum type */
    public ?array $enum_values = null;
}

/**
 * ClassMeta - Class definition (schema)
 * Defines a class with its properties, inheritance, and storage configuration.
 * Classes themselves are stored as objects in the @class class.
 */
class ClassMeta extends EntityObj {
    /** @var string|null Description of the class */
    public ?string $description = null;

    /** @var string|null Parent class ID for inheritance */
    public ?string $extends_id = null;

    /** @var array Property definitions (Prop objects or arrays) */
    public array $props = [];

    /** @var string|null Custom table name (for SQL storage) */
    public ?string $table_name = null;

    /**
     * Get a property definition by key
     *
     * @param string $key Property key
     *
     * @return Prop|null Property or null if not found
     */
    public function getProp(string $key): ?Prop {
        foreach ($this->props as $prop) {
            $propKey = $prop instanceof Prop ? $prop->key : ($prop['key'] ?? null);
            if ($propKey === $key) {
                return $prop instanceof Prop ? $prop : Prop::fromArray($prop);
            }
        }
        return null;
    }

    /**
     * Get all properties as Prop objects
     *
     * @return Prop[] Array of Prop objects
     */
    public function getProps(): array {
        return array_map(
            fn($p) => $p instanceof Prop ? $p : Prop::fromArray($p),
            $this->props
        );
    }

    /**
     * Factory method to create object for this class
     *
     * @param array|null $data Object data
     *
     * @return AtomObj Created object
     */
    public function factoryObject(?array $data = []): AtomObj {
        $model = $this->getModel();
        if ($model) {
            return $model->factory($this->id, $data);
        }
        // Fallback if no model available
        return new AtomObj($this->id, $data, $this->getDi());
    }
}

/**
 * ClassModel - Main registry and orchestration layer
 * Handles all object operations including validation, change detection,
 * and coordination with storage providers.
 * RESPONSIBILITIES:
 * - Bootstrap system classes on first use
 * - Validate objects against class metadata
 * - Detect changes between old and new objects
 * - Orchestrate rename operations when class/prop names change
 * - Manage class cache for performance
 * USAGE:
 * ```php
 * // Boot from config file
 * $model = ClassModel::boot(__DIR__);
 * // Or create with explicit storage
 * $model = new ClassModel(new JsonStorageProvider('/path/to/data'));
 * // CRUD operations
 * $user = $model->setObject('user', ['name' => 'John']);
 * $user = $model->getObject('user', $user['id']);
 * $users = $model->query('user', ['status' => 'active']);
 * $model->deleteObject('user', $user['id']);
 * ```
 */
class ClassModel {
    /** @var IStorageProvider Storage backend */
    private IStorageProvider $storage;

    /** @var array<string, ClassMeta> In-memory class cache */
//    private array $classCache = [];

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

    /** @var bool Enforce owner_id filtering on getObject */
    private bool $enforceOwnership = true;

    /** @var bool Allow custom IDs when creating objects (for seeding/testing) */
    private bool $allowCustomIds = false;

    /** @var \Phalcon\Di\DiInterface|null DI container */
    private ?\Phalcon\Di\DiInterface $di = null;


    /**
     * Create ClassModel with storage provider
     *
     * @param IStorageProvider             $storage  Storage backend
     * @param string                       $basePath Base path for config files
     * @param mixed                        $userId   Current user ID (will be set as owner_id on new objects)
     * @param \Phalcon\Di\DiInterface|null $di       DI container
     */
    public function __construct(IStorageProvider $storage, string $basePath = '', mixed $userId = null, ?\Phalcon\Di\DiInterface $di = null) {
        $this->storage = $storage;
        $this->basePath = $basePath;
        $this->userId = $userId;
        $this->di = $di ?? \Phalcon\Di\Di::getDefault();
    }

    /**
     * Get DI container
     *
     * @return \Phalcon\Di\DiInterface|null
     */
    public function getDi(): ?\Phalcon\Di\DiInterface {
        return $this->di ?? \Phalcon\Di\Di::getDefault();
    }

    /**
     * Set current user ID
     *
     * @param mixed $userId User ID
     *
     * @return self
     */
    public function setUserId(mixed $userId): self {
        $this->userId = $userId;
        return $this;
    }

    /**
     * Get current user ID
     *
     * @return mixed
     */
    public function getUserId(): mixed {
        return $this->userId;
    }

    /**
     * Enable/disable ownership enforcement
     * When enabled, getObject will filter by owner_id
     *
     * @param bool $enforce
     *
     * @return self
     */
    public function setEnforceOwnership(bool $enforce): self {
        $this->enforceOwnership = $enforce;
        return $this;
    }

    /**
     * Enable/disable custom IDs for creation
     * When enabled, allows creating objects with custom IDs (for seeding/testing).
     * When disabled (default), providing an ID to setObject requires the object to exist.
     *
     * @param bool $allow
     *
     * @return self
     */
    public function setAllowCustomIds(bool $allow): self {
        $this->allowCustomIds = $allow;
        return $this;
    }

    /**
     * Boot ClassModel from @init.json configuration
     * Reads storage configuration and creates appropriate provider.
     *
     * @param string $basePath Directory containing @init.json
     * @param mixed  $userId   Optional user ID for ownership
     *
     * @return self Configured ClassModel instance
     * @example
     * // @init.json format:
     * // {
     * //   "@storage": {
     * //     "bootstrap": {
     * //       "type": "json",
     * //       "data_dir": "../data"
     * //     }
     * //   }
     * // }
     * $model = ClassModel::boot('/path/to/elementStore', $currentUserId);
     */
    public static function boot(string $basePath, mixed $userId = null): self {
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

    /**
     * Ensure system classes exist (lazy bootstrap)
     * Creates @class, @prop, @action, @event if they don't exist.
     */
    private function ensureBootstrap(): void {
        if ($this->bootstrapped) {
            return;
        }

        // Check if @class exists, if not create system classes
        $classClass = $this->storage->getobj(Constants::K_CLASS, Constants::K_CLASS);
        if (!$classClass) {
            $this->createSystemClasses();
        }

        $this->bootstrapped = true;
    }

    /**
     * Create system classes (@class, @prop, @action, @event)
     * These are the meta-classes that define how other classes work.
     */
    private function createSystemClasses(): void {

        // @prop - Property definition class
        // Define all fields using array format
        $propProps = [
            [
                Prop::PF_KEY => Prop::PF_KEY,
                Prop::PF_LABEL => 'Key',
                Prop::PF_DESCRIPTION => 'Property key (field name)',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_REQUIRED => true,
                Prop::PF_DISPLAY_ORDER => 1,
            ],
            [
                Prop::PF_KEY => Prop::PF_NAME,
                Prop::PF_LABEL => 'Name',
                Prop::PF_DESCRIPTION => 'Display name',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_DISPLAY_ORDER => 2,
            ],
//            [
//                Prop::PF_KEY => Prop::PF_LABEL,
//                Prop::PF_LABEL => 'Label',
//                Prop::PF_DESCRIPTION => 'Form field label',
//                Prop::PF_DATA_TYPE => Constants::DT_STRING,
//                Prop::PF_DISPLAY_ORDER => 3,
//            ],
            [
                Prop::PF_KEY => Prop::PF_DESCRIPTION,
                Prop::PF_LABEL => 'Description',
                Prop::PF_DESCRIPTION => 'Help text for the field',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_EDITOR => ['type' => 'textarea'],
                Prop::PF_DISPLAY_ORDER => 4,
            ],
            [
                Prop::PF_KEY => Prop::PF_DATA_TYPE,
                Prop::PF_LABEL => 'Data Type',
                Prop::PF_DESCRIPTION => 'Value data type',
                Prop::PF_DATA_TYPE => Constants::DT_ENUM,
                Prop::PF_ENUM_VALUES => [
                    Constants::DT_STRING,
                    Constants::DT_NUMBER,
                    Constants::DT_FLOAT,
                    Constants::DT_BOOLEAN,
                    Constants::DT_DATE,
                    Constants::DT_DATETIME,
                    Constants::DT_ENUM,
                    Constants::DT_OBJECT,
                    Constants::DT_RELATION,
//                    Constants::DT_ARRAY,
                ],
                Prop::PF_DEFAULT_VALUE => Constants::DT_STRING,
                Prop::PF_DISPLAY_ORDER => 5,
            ],
            [
                Prop::PF_KEY => Prop::PF_IS_ARRAY,
                Prop::PF_LABEL => 'Is Array',
                Prop::PF_DESCRIPTION => 'Property holds array of values',
                Prop::PF_DATA_TYPE => Constants::DT_BOOLEAN,
                Prop::PF_DEFAULT_VALUE => false,
                Prop::PF_DISPLAY_ORDER => 6,
            ],
            [
                Prop::PF_KEY => Prop::PF_OBJECT_CLASS_ID,
                Prop::PF_LABEL => 'Related Class',
                Prop::PF_DESCRIPTION => 'Target class for relations/objects',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_DISPLAY_ORDER => 7,
            ],
            [
                Prop::PF_KEY => Prop::PF_OPTIONS,
                Prop::PF_LABEL => 'Options',
                Prop::PF_DESCRIPTION => 'Enum options [{value, label}]',
                Prop::PF_DATA_TYPE => Constants::DT_OBJECT,
                Prop::PF_IS_ARRAY => true,
                Prop::PF_DISPLAY_ORDER => 8,
            ],
            [
                Prop::PF_KEY => Prop::PF_EDITOR,
                Prop::PF_LABEL => 'Editor',
                Prop::PF_DESCRIPTION => 'Editor configuration {type, ...options}',
                Prop::PF_DATA_TYPE => Constants::DT_OBJECT,
                Prop::PF_DEFAULT_VALUE => ['type' => 'text'],
                Prop::PF_DISPLAY_ORDER => 9,
            ],
            [
                Prop::PF_KEY => Prop::PF_VALIDATORS,
                Prop::PF_LABEL => 'Validators',
                Prop::PF_DESCRIPTION => 'Validation rules [{type, ...params}]',
                Prop::PF_DATA_TYPE => Constants::DT_OBJECT,
                Prop::PF_IS_ARRAY => true,
                Prop::PF_DISPLAY_ORDER => 10,
            ],
            [
                Prop::PF_KEY => Prop::PF_ENUM_VALUES,
                Prop::PF_LABEL => 'Enum Values',
                Prop::PF_DESCRIPTION => 'Allowed values for enum type',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_IS_ARRAY => true,
                Prop::PF_DISPLAY_ORDER => 11,
            ],
            [
                Prop::PF_KEY => Prop::PF_REQUIRED,
                Prop::PF_LABEL => 'Required',
                Prop::PF_DESCRIPTION => 'Field is required',
                Prop::PF_DATA_TYPE => Constants::DT_BOOLEAN,
                Prop::PF_DEFAULT_VALUE => false,
                Prop::PF_DISPLAY_ORDER => 12,
            ],
            [
                Prop::PF_KEY => Prop::PF_READONLY,
                Prop::PF_LABEL => 'Read Only',
                Prop::PF_DESCRIPTION => 'Field cannot be edited',
                Prop::PF_DATA_TYPE => Constants::DT_BOOLEAN,
                Prop::PF_DEFAULT_VALUE => false,
                Prop::PF_DISPLAY_ORDER => 13,
            ],
            [
                Prop::PF_KEY => Prop::PF_DEFAULT_VALUE,
                Prop::PF_LABEL => 'Default Value',
                Prop::PF_DESCRIPTION => 'Default value for new objects',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_DISPLAY_ORDER => 14,
            ],
            [
                Prop::PF_KEY => Prop::PF_DISPLAY_ORDER,
                Prop::PF_LABEL => 'Display Order',
                Prop::PF_DESCRIPTION => 'Order in forms/tables',
                Prop::PF_DATA_TYPE => Constants::DT_NUMBER,
                Prop::PF_DEFAULT_VALUE => 0,
                Prop::PF_DISPLAY_ORDER => 15,
            ],
            [
                Prop::PF_KEY => Prop::PF_GROUP_NAME,
                Prop::PF_LABEL => 'Group Name',
                Prop::PF_DESCRIPTION => 'Form section grouping',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_DISPLAY_ORDER => 16,
            ],
            [
                Prop::PF_KEY => Prop::PF_HIDDEN,
                Prop::PF_LABEL => 'Hidden',
                Prop::PF_DESCRIPTION => 'Hide from default views',
                Prop::PF_DATA_TYPE => Constants::DT_BOOLEAN,
                Prop::PF_DEFAULT_VALUE => false,
                Prop::PF_DISPLAY_ORDER => 17,
            ],
        ];

        $this->storage->setobj(Constants::K_CLASS, [
            Constants::F_ID => Constants::K_PROP,
            Constants::F_CLASS_ID => Constants::K_CLASS,
            Constants::F_NAME => 'Property',
            'is_system' => true,
            Constants::F_PROPS => $propProps,
        ]);

        // @class - the meta of meta (class definition)
        $classProps = [
            [
                Prop::PF_KEY => Constants::F_NAME,
                Prop::PF_LABEL => 'Name',
                Prop::PF_DESCRIPTION => 'Class display name',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_REQUIRED => true,
                Prop::PF_DISPLAY_ORDER => 1,
            ],
            [
                Prop::PF_KEY => 'description',
                Prop::PF_LABEL => 'Description',
                Prop::PF_DESCRIPTION => 'Class description',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_EDITOR => ['type' => 'textarea'],
                Prop::PF_DISPLAY_ORDER => 2,
            ],
            [
                Prop::PF_KEY => Constants::F_EXTENDS_ID,
                Prop::PF_LABEL => 'Extends',
                Prop::PF_DESCRIPTION => 'Parent class for inheritance',
                Prop::PF_DATA_TYPE => Constants::DT_RELATION,
                Prop::PF_OBJECT_CLASS_ID => Constants::K_CLASS,
                Prop::PF_DISPLAY_ORDER => 3,
            ],
            [
                Prop::PF_KEY => Constants::F_PROPS,
                Prop::PF_LABEL => 'Properties',
                Prop::PF_DESCRIPTION => 'Class property definitions',
                Prop::PF_DATA_TYPE => Constants::DT_OBJECT,
                Prop::PF_IS_ARRAY => true,
                Prop::PF_OBJECT_CLASS_ID => Constants::K_PROP,
                Prop::PF_DISPLAY_ORDER => 4,
            ],
            [
                Prop::PF_KEY => 'table_name',
                Prop::PF_LABEL => 'Table Name',
                Prop::PF_DESCRIPTION => 'Custom table name for SQL storage',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_DISPLAY_ORDER => 5,
            ],
            [
                Prop::PF_KEY => 'is_system',
                Prop::PF_LABEL => 'System Class',
                Prop::PF_DESCRIPTION => 'Protected system class',
                Prop::PF_DATA_TYPE => Constants::DT_BOOLEAN,
                Prop::PF_READONLY => true,
                Prop::PF_DEFAULT_VALUE => false,
                Prop::PF_DISPLAY_ORDER => 6,
            ],
        ];

        $this->storage->setobj(Constants::K_CLASS, [
            Constants::F_ID => Constants::K_CLASS,
            Constants::F_CLASS_ID => Constants::K_CLASS,
            Constants::F_NAME => 'Class',
            'is_system' => true,
            Constants::F_PROPS => $classProps,
        ]);

        // @action - Action definition class
        $actionProps = [
            [
                Prop::PF_KEY => Constants::F_NAME,
                Prop::PF_LABEL => 'Name',
                Prop::PF_DESCRIPTION => 'Action name',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_REQUIRED => true,
                Prop::PF_DISPLAY_ORDER => 1,
            ],
            [
                Prop::PF_KEY => 'handler',
                Prop::PF_LABEL => 'Handler',
                Prop::PF_DESCRIPTION => 'Action handler function/class',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_DISPLAY_ORDER => 2,
            ],
            [
                Prop::PF_KEY => 'params',
                Prop::PF_LABEL => 'Parameters',
                Prop::PF_DESCRIPTION => 'Action parameters schema',
                Prop::PF_DATA_TYPE => Constants::DT_OBJECT,
                Prop::PF_DISPLAY_ORDER => 3,
            ],
        ];

        $this->storage->setobj(Constants::K_CLASS, [
            Constants::F_ID => Constants::K_ACTION,
            Constants::F_CLASS_ID => Constants::K_CLASS,
            Constants::F_NAME => 'Action',
            'is_system' => true,
            Constants::F_PROPS => $actionProps,
        ]);

        // @event - Event definition class
        $eventProps = [
            [
                Prop::PF_KEY => Constants::F_NAME,
                Prop::PF_LABEL => 'Name',
                Prop::PF_DESCRIPTION => 'Event name',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_REQUIRED => true,
                Prop::PF_DISPLAY_ORDER => 1,
            ],
            [
                Prop::PF_KEY => 'trigger_type',
                Prop::PF_LABEL => 'Trigger Type',
                Prop::PF_DESCRIPTION => 'When this event triggers',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_DISPLAY_ORDER => 2,
            ],
            [
                Prop::PF_KEY => 'payload_schema',
                Prop::PF_LABEL => 'Payload Schema',
                Prop::PF_DESCRIPTION => 'Event payload structure',
                Prop::PF_DATA_TYPE => Constants::DT_OBJECT,
                Prop::PF_DISPLAY_ORDER => 3,
            ],
        ];

        $this->storage->setobj(Constants::K_CLASS, [
            Constants::F_ID => Constants::K_EVENT,
            Constants::F_CLASS_ID => Constants::K_CLASS,
            Constants::F_NAME => 'Event',
            'is_system' => true,
            Constants::F_PROPS => $eventProps,
        ]);
    }

    public function fromCache(string $class_id, string $id) {
        return $this->objectCache[$class_id][$id] ?? null;
    }

    /**
     * Factory method to create object by class_id
     *
     * @param string     $class_id Class identifier
     * @param array|null $data     Object data
     *
     * @return AtomObj|ClassMeta|Prop
     */
    public function factory(string $class_id, ?array $data = []): AtomObj {
        return match ($class_id) {
            Constants::K_CLASS => new ClassMeta($class_id, $data, $this->getDi()),
            Constants::K_PROP => new Prop($class_id, $data, $this->getDi()),
            default => new AtomObj($class_id, $data, $this->getDi()),
        };
    }

    // =========================================================================
    // CLASS OPERATIONS
    // =========================================================================

    /**
     * Get class metadata by ID
     * Returns cached version if available. Handles inheritance by
     * merging parent class properties.
     *
     * @param string $class_id Class identifier
     *
     * @return ClassMeta|null Class metadata or null if not found
     */
    public function getClass(string $class_id): ?ClassMeta {

        $classMetaObj = $this->fromCache(Constants::K_CLASS, $class_id);
        if ($classMetaObj) {
            return $classMetaObj;
        }

        // first lets load the init @class object
        $classBaseObj = $this->fromCache(Constants::K_CLASS, Constants::K_CLASS);
        if (!$classBaseObj) {
            $result = $this->queryInternal([
                Constants::F_CLASS_ID => Constants::K_CLASS,
                Constants::F_ID => Constants::K_CLASS,
            ]);
            if (count($result) > 1) {
                // throw exception! we have more than one @class object with id @class
            }
            $classMeta = $result[0] ?? null;
            if (!$classMeta) {
                $this->createSystemClasses();
                $result = $this->queryInternal([
                    Constants::F_CLASS_ID => Constants::K_CLASS,
                    Constants::F_ID => Constants::K_CLASS,
                ]);

                if (count($result) != 1) {
                    // throw exception! we have more than one @class object with id @class
                }
                $classMeta = $result[0] ?? null;
            }
            $classBaseObj = new ClassMeta(K_CLASS, $classMeta, $this->getDi());
        }
        if ($classBaseObj->id === $class_id) {
            return $classBaseObj;
        }
        // fetch another class object

//        $classMetaObj = $this->fromCache(Constants::K_CLASS, $class_id);
//        if ($classMetaObj) return $classMetaObj;
//        $classMetaObj = $this->getObject(Constants::K_CLASS, $class_id);


//        if (isset($this->classCache[$class_id])) {
//            return $this->classCache[$class_id];
//        }


//        $data = $this->storage->getobj(Constants::K_CLASS, $class_id);
//        if (!$data) {
//            // Auto create class if enabled
//            if ($this->auto_create_class) {
//                $data = [
//                    Constants::F_ID => $class_id,
//                    Constants::F_CLASS_ID => Constants::K_CLASS,
//                    Constants::F_NAME => $class_id,
//                    Constants::F_PROPS => [],
//                ];
//                $this->storage->setobj(Constants::K_CLASS, $data);
//            }
//            else {
//                return null;
//            }
//        }

        $meta = ClassMeta::fromArray($data);

        // Convert props array to Prop objects
        $meta->props = array_map(
            fn($p) => $p instanceof Prop ? $p : Prop::fromArray($p),
            $meta->props ?? []
        );

        // Handle inheritance - merge parent props
        if ($meta->extends_id) {
            $parent = $this->getClass($meta->extends_id);
            if ($parent) {
                $meta->props = array_merge($parent->props, $meta->props);
            }
        }

        $this->classCache[$class_id] = $meta;
        return $meta;
    }

    /**
     * Save class metadata
     * Convenience method that converts ClassMeta to array and uses setObject.
     *
     * @param ClassMeta $meta Class metadata to save
     *
     * @return ClassMeta Saved class metadata
     */
    public function setClass(ClassMeta $meta): ClassMeta {
        $data = $meta->toArray();
        $data[Constants::F_PROPS] = array_map(
            fn($p) => $p instanceof Prop ? $p->toArray() : $p,
            $meta->props
        );

        $result = $this->setObject(Constants::K_CLASS, $data);
        return ClassMeta::fromArray($result);
    }

    /**
     * Get all class definitions
     *
     * @return ClassMeta[] Array of all class metadata
     */
    public function getAllClasses(): array {
//        $this->ensureBootstrap();
//        $metaClass = $this->getClass(Constants::K_CLASS);
//        $this->query($this->getClass(Constants::K_CLASS));

//        $class = $this->getClass(Constants::K_CLASS);

//        $class = $this->getClass()
        $class = $this->getClass(Constants::K_CLASS);
        $data = $this->storage->query(Constants::K_CLASS, [Constants::F_CLASS_ID => Constants::K_CLASS]);
        foreach ($data as $d) {

        }
        return array_map(fn($d) => ClassMeta::fromArray($d), $data ?? []);
    }

    /**
     * Delete a class definition
     *
     * @param
     *
     * @return bool True if deleted, false if not found
     */
    public function deleteClass(string $classId): bool {
        $this->ensureBootstrap();
        return $this->deleteObject(Constants::K_CLASS, $classId);
    }

    // =========================================================================
    // OBJECT OPERATIONS
    // =========================================================================

    /**
     * Check if class is a system class (no ownership filtering)
     *
     * @param string $classId Class identifier
     *
     * @return bool True if system class
     */
    private function isSystemClass(string $classId): bool {
        return str_starts_with($classId, '@');
    }

    /**
     * Get object(s) by class and optional ID
     * When enforceOwnership is enabled and userId is set, objects are filtered
     * by owner_id (except for system classes starting with @).
     *
     * @param string $class_id Class identifier
     * @param mixed  $id       Object ID (null for all objects)
     *
     * @return array|null Object, array of objects, or null
     */
    public function getObject(string $class_id, mixed $id = null): array|null {

        // flow:
        // 1. check if $classId is not null
        // 1. we get classMeta object for $classId. getObject can return also objAtom

        if ($class_id === null) {
            // @todo: @ai throw exception
        }
        if ($id === null) {
            // @todo: @ai throw exception
        }

        $classMetaObj = $this->getClass($class_id);


        if ($class_id != Constants::K_CLASS && $id != Constants::K_CLASS) {
            $classMetaObj = $this->getClass($class_id);
        }
        else {
            $classMetaObj = new ClassMeta($class_id, [], $this->getDi());
        }
        $result = $this->storage->getobj($class_id, $id);
        if (!$result) {
            // throw exception! we didnt find object!
        }
        $AtomObj = $classMetaObj->factoryObject($result);

        // check if user is owner of object ?
        return $AtomObj;
//        $result = AtomObj::factory($result, $class_id);


//        // Skip ownership filtering for system classes or when disabled
//        if ($this->isSystemClass($classId) || !$this->enforceOwnership || $this->userId === null) {
//            return $result;
//        }
//
//        // Filter by owner_id
//        if ($id === null) {
//            // List mode - filter all objects
//            if (!is_array($result)) {
//                return $result;
//            }
//            return array_values(array_filter($result, function ($obj) {
//                return ($obj[Constants::F_OWNER_ID] ?? null) === $this->userId;
//            }));
//        }
//        else {
//            // Single object mode - verify ownership
//            if ($result === null) {
//                return null;
//            }
//            if (($result[Constants::F_OWNER_ID] ?? null) !== $this->userId) {
//                return null; // Not owned by current user
//            }
//            return $result;
//        }
    }

    /**
     * Save object (create or update)
     * FLOW:
     * 1. Get old object if ID provided (must exist for update)
     * 2. If ID provided but not found → ERROR (can't create with custom ID)
     * 3. Apply defaults for new objects
     * 4. Set owner_id on new objects
     * 5. Validate against class meta
     * 6. Detect changes between old and new
     * 7. If no changes, return old object (skip save)
     * 8. Call onChange() to save and handle renames
     *
     * @param string $classId Class identifier
     * @param array  $obj     Object data to save
     *
     * @return array Saved object
     * @throws \Exception On validation failure or ID not found
     */
    public function setObject(string $classId, array $obj): array {
        $this->ensureBootstrap();

        $meta = $this->getClass($classId);
        $id = $obj[Constants::F_ID] ?? null;
        $oldObj = null;

        // Step 1: Get old object if ID provided
        if ($id !== null) {
            $oldObj = $this->storage->getobj($classId, $id);

            // For non-system classes with custom IDs disabled, object must exist
            if ($oldObj === null && !$this->isSystemClass($classId) && !$this->allowCustomIds) {
                throw new \Exception(json_encode([
                    'error' => 'Object not found',
                    'message' => "Cannot create object with custom ID. Object {$classId}/{$id} does not exist.",
                    'code' => 'not_found',
                ]));
            }

            // Step 1b: Verify ownership on update (if enabled)
            if ($oldObj !== null && $this->enforceOwnership && $this->userId !== null && !$this->isSystemClass($classId)) {
                $objOwnerId = $oldObj[Constants::F_OWNER_ID] ?? null;
                if ($objOwnerId !== $this->userId) {
                    throw new \Exception(json_encode([
                        'error' => 'Access denied',
                        'message' => "You don't have permission to modify this object.",
                        'code' => 'forbidden',
                    ]));
                }
            }
        }

        // Auto add props if enabled (development feature)
        if ($this->auto_add_prop && $meta) {
            $existingKeys = array_map(fn($p) => $p->key, $meta->getProps());
            foreach ($obj as $key => $value) {
                if (!in_array($key, $existingKeys) && !in_array($key, [Constants::F_ID, Constants::F_CLASS_ID, Constants::F_CREATED_AT, Constants::F_UPDATED_AT])) {
                    $meta->props[] = new Prop($key, $this->guessDataType($value));
                    $this->setObject(Constants::K_CLASS, $meta->toArray());
                }
            }
        }

        // Step 2: Validate and build merged object (handles defaults, casting, deep merge)
        if ($meta) {
            $result = $this->validateAndBuild($obj, $meta, $oldObj);
            if (!empty($result['errors'])) {
                throw new \Exception(json_encode([
                    'error' => 'Validation failed',
                    'errors' => $result['errors'],
                ]));
            }
            $obj = $result['obj'];

            // Check unique name constraint
            if (isset($obj[Constants::F_NAME])) {
                if (!$this->isNameUnique($classId, $obj[Constants::F_NAME], $id)) {
                    throw new \Exception(json_encode([
                        'error' => 'Validation failed',
                        'errors' => [[
                            'path' => Constants::F_NAME,
                            'message' => 'Name must be unique within class',
                            'code' => 'unique',
                        ]],
                    ]));
                }
            }
        }
        else {
            // No meta - simple merge
            if ($oldObj !== null) {
                $obj = array_merge($oldObj, $obj);
            }
        }

        // Step 3: Set owner_id for new objects (non-system classes)
        if ($oldObj === null && !$this->isSystemClass($classId) && $this->userId !== null) {
            $obj[Constants::F_OWNER_ID] = $this->userId;
        }

        // Step 4: Detect changes
        $changes = $this->detectChanges($obj, $oldObj);

        // Step 4: No changes - return existing object (optimization)
        if (empty($changes) && $oldObj !== null) {
            return $oldObj;
        }

        // Step 5: Save and handle renames
        return $this->onChange($classId, $obj, $oldObj, $changes);
    }

    /**
     * Handle object change - save and process side effects
     * Called after validation passes. Saves the object and handles
     * any rename operations needed for class meta changes.
     * FLOW:
     * 1. Save object to storage
     * 2. If this is a @class object, check for renames
     * 3. Clear class cache if class was modified
     *
     * @param string     $classId Class identifier
     * @param array      $obj     Object to save
     * @param array|null $oldObj  Previous version (null for new)
     * @param array      $changes Detected changes
     *
     * @return array Saved object
     */
    private function onChange(string $classId, array $obj, ?array $oldObj, array $changes): array {
        // Save the object to storage
        $result = $this->storage->setobj($classId, $obj);

        // Handle renames for @class objects (class meta changes)
        if ($classId === Constants::K_CLASS && !empty($changes)) {
            $this->handleClassMetaChanges($obj, $oldObj, $changes);
        }

        // Clear class cache if class was modified
        if ($classId === Constants::K_CLASS) {
            unset($this->classCache[$obj[Constants::F_ID]]);
        }

        return $result;
    }

    /**
     * Handle class meta changes - detect and execute renames
     * When a class definition changes, we need to propagate certain
     * changes to all objects of that class:
     * - Class ID renamed → rename all objects' class_id
     * - Property key renamed → rename key in all objects
     *
     * @param array      $newMeta New class metadata
     * @param array|null $oldMeta Previous class metadata
     * @param array      $changes Detected changes
     */
    private function handleClassMetaChanges(array $newMeta, ?array $oldMeta, array $changes): void {
        if ($oldMeta === null) {
            return; // New class, nothing to rename
        }

        $targetClassId = $newMeta[Constants::F_ID];

        // Check for class rename (id change)
        if (isset($changes[Constants::F_ID])) {
            $oldClassId = $changes[Constants::F_ID]['old'];
            $newClassId = $changes[Constants::F_ID]['new'];
            if ($oldClassId && $newClassId && $oldClassId !== $newClassId) {
                $this->storage->renameClass($oldClassId, $newClassId);
            }
        }

        // Check for property renames in props array
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
     * Uses a simple heuristic: if a prop key disappears and a new one
     * appears with the same data_type, assume it's a rename.
     *
     * @param array $oldProps Old property definitions
     * @param array $newProps New property definitions
     *
     * @return array Array of ['old' => oldKey, 'new' => newKey]
     */
    private function detectPropRenames(array $oldProps, array $newProps): array {
        $renames = [];

        $oldKeys = [];
        $newKeys = [];

        // Extract keys and types from old props
        foreach ($oldProps as $p) {
            $key = is_array($p) ? ($p['key'] ?? null) : ($p->key ?? null);
            $type = is_array($p) ? ($p['data_type'] ?? 'string') : ($p->data_type ?? 'string');
            if ($key) $oldKeys[$key] = $type;
        }

        // Extract keys and types from new props
        foreach ($newProps as $p) {
            $key = is_array($p) ? ($p['key'] ?? null) : ($p->key ?? null);
            $type = is_array($p) ? ($p['data_type'] ?? 'string') : ($p->data_type ?? 'string');
            if ($key) $newKeys[$key] = $type;
        }

        // Find removed keys (in old but not in new)
        $removed = array_diff_key($oldKeys, $newKeys);
        // Find added keys (in new but not in old)
        $added = array_diff_key($newKeys, $oldKeys);

        // Match by data_type (simple heuristic for rename detection)
        foreach ($removed as $oldKey => $oldType) {
            foreach ($added as $newKey => $newType) {
                if ($oldType === $newType) {
                    $renames[] = ['old' => $oldKey, 'new' => $newKey];
                    unset($added[$newKey]); // Don't match same key twice
                    break;
                }
            }
        }

        return $renames;
    }

    /**
     * Delete object
     *
     * @param string $classId Class identifier
     * @param mixed  $id      Object ID
     *
     * @return bool True if deleted, false if not found
     */
    public function deleteObject(string $classId, mixed $id): bool {
        return $this->storage->delobj($classId, $id);
    }

    /**
     * Query objects with filters and options
     *
     * @param string $classId Class identifier
     * @param array  $filters Key-value filters
     * @param array  $options sort, sortDir, limit, offset
     *
     * @return array Matching objects
     */
    public function query(string $classId, array $filters = [], array $options = []): array {
//        $this->ensureBootstrap();

        $filters[Constants::F_CLASS_ID] = $classId;
        $filters[Constants::F_OWNER_ID] = $this->userId;
        return $this->storage->query($classId, $filters, $options);
    }

    // =========================================================================
    // VALIDATION
    // =========================================================================

    /**
     * Validate and build object from input
     * Handles:
     * - Deep merge for updates (recursive for object properties)
     * - Defaults for new objects
     * - Type casting (string "123" → number 123)
     * - Validation of each property
     *
     * @param array      $input  The input/changes being applied
     * @param ClassMeta  $meta   The class definition
     * @param array|null $oldObj Existing object (null if new)
     *
     * @return array ['obj' => merged object, 'errors' => validation errors]
     */
    public function validateAndBuild(array $input, ClassMeta $meta, ?array $oldObj = null): array {
        $errors = [];
        $isNew = ($oldObj === null);
        $obj = $isNew ? [] : $oldObj;

        // Build props map
        $propsMap = [];
        foreach ($meta->getProps() as $prop) {
            $propsMap[$prop->key] = $prop;
        }

        // Process each property from meta
        foreach ($meta->getProps() as $prop) {
            $key = $prop->key;
            $hasInput = array_key_exists($key, $input);
            $hasOld = !$isNew && array_key_exists($key, $oldObj);

            if ($hasInput) {
                $inputValue = $input[$key];
                $oldValue = $hasOld ? $oldObj[$key] : null;

                // Cast the value to proper type
                $inputValue = $this->castValue($inputValue, $prop);

                // Handle object type - deep merge
                if ($prop->data_type === Constants::DT_OBJECT && $prop->object_class_id) {
                    $nestedMeta = $this->getClass($prop->object_class_id);
                    if ($nestedMeta && is_array($inputValue)) {
                        $nestedOld = is_array($oldValue) ? $oldValue : null;
                        $result = $this->validateAndBuild($inputValue, $nestedMeta, $nestedOld);
                        $obj[$key] = $result['obj'];
                        foreach ($result['errors'] as $err) {
                            $err['path'] = "{$key}.{$err['path']}";
                            $errors[] = $err;
                        }
                        continue;
                    }
                }

                // Handle array of objects - deep merge each item by id
                if ($prop->is_array && $prop->object_class_id && $prop->data_type !== Constants::DT_RELATION) {
                    $nestedMeta = $this->getClass($prop->object_class_id);
                    if ($nestedMeta && is_array($inputValue)) {
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
                            if ($itemId) {
                                foreach ($oldArray as $old) {
                                    if (($old[Constants::F_ID] ?? null) === $itemId) {
                                        $oldItem = $old;
                                        break;
                                    }
                                }
                            }
                            $result = $this->validateAndBuild($item, $nestedMeta, $oldItem);
                            $mergedArray[] = $result['obj'];
                            foreach ($result['errors'] as $err) {
                                $err['path'] = "{$key}[{$i}].{$err['path']}";
                                $errors[] = $err;
                            }
                        }
                        $obj[$key] = $mergedArray;
                        continue;
                    }
                }

                // Simple value - set it
                $obj[$key] = $inputValue;

                // Validate the value
                $propErrors = $this->validateProperty($inputValue, $prop);
                $errors = array_merge($errors, $propErrors);

            }
            elseif ($isNew) {
                // New object - apply default or check required
                if ($prop->default_value !== null) {
                    $obj[$key] = $prop->default_value;
                }
                elseif ($prop->required) {
                    $errors[] = [
                        'path' => $key,
                        'message' => "{$key} is required",
                        'code' => Constants::VT_REQUIRED,
                    ];
                }
            }
            // else: update without this key - keep old value (already in $obj)
        }

        // Copy system fields from input
        foreach ([Constants::F_ID, Constants::F_CLASS_ID] as $sysKey) {
            if (array_key_exists($sysKey, $input)) {
                $obj[$sysKey] = $input[$sysKey];
            }
        }

        return ['obj' => $obj, 'errors' => $errors];
    }

    /**
     * Cast value to the proper type based on property definition
     *
     * @param mixed $value Value to cast
     * @param Prop  $prop  Property definition
     *
     * @return mixed Casted value
     */
    private function castValue(mixed $value, Prop $prop): mixed {
        if ($value === null) {
            return null;
        }

        // Handle arrays
        if ($prop->is_array && is_array($value)) {
            return array_map(fn($v) => $this->castSingleValue($v, $prop->data_type), $value);
        }

        return $this->castSingleValue($value, $prop->data_type);
    }

    /**
     * Cast a single value to the specified data type
     *
     * @param mixed  $value    Value to cast
     * @param string $dataType Target data type
     *
     * @return mixed Casted value
     */
    private function castSingleValue(mixed $value, string $dataType): mixed {
        if ($value === null) {
            return null;
        }

        switch ($dataType) {
            case Constants::DT_NUMBER:
            case Constants::DT_FLOAT:
                if (is_string($value) && is_numeric($value)) {
                    return strpos($value, '.') !== false ? (float)$value : (int)$value;
                }
                if (is_numeric($value)) {
                    return $value + 0; // Convert to int or float
                }
                return $value;

            case Constants::DT_BOOLEAN:
                if (is_string($value)) {
                    $lower = strtolower($value);
                    if (in_array($lower, ['true', '1', 'yes', 'on'])) return true;
                    if (in_array($lower, ['false', '0', 'no', 'off', ''])) return false;
                }
                if (is_numeric($value)) {
                    return (bool)$value;
                }
                return $value;

            case Constants::DT_STRING:
                if (is_scalar($value)) {
                    return (string)$value;
                }
                return $value;

            default:
                return $value;
        }
    }

    /**
     * Validate a single property value
     *
     * @param mixed $value Value to validate
     * @param Prop  $prop  Property definition
     *
     * @return array Validation errors
     */
    private function validateProperty(mixed $value, Prop $prop): array {
        $errors = [];
        $key = $prop->key;
        $label = $prop->label ?? $key;

        // Null/empty check
        if ($value === null || $value === '') {
            if ($prop->required) {
                $errors[] = ['path' => $key, 'message' => "{$label} is required", 'code' => Constants::VT_REQUIRED];
            }
            return $errors;
        }

        // Type validation
        $typeError = $this->validateType($value, $prop);
        if ($typeError) {
            $errors[] = ['path' => $key, 'message' => $typeError, 'code' => 'type'];
            return $errors; // Stop if type is wrong
        }

        // Custom validators
        foreach ($prop->validators ?? [] as $validator) {
            $validatorError = $this->runValidator($value, $validator, $prop);
            if ($validatorError) {
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
     * Legacy validate method - calls validateAndBuild for backward compatibility
     *
     * @param array     $obj  Object to validate
     * @param ClassMeta $meta Class metadata
     *
     * @return array Array of error objects [{path, message, code}]
     */
    public function validate(array $obj, ClassMeta $meta): array {
        $result = $this->validateAndBuild($obj, $meta, null);
        return $result['errors'];
    }

    /**
     * Validate value type against property definition
     *
     * @param mixed $value Value to validate
     * @param Prop  $prop  Property definition
     *
     * @return string|null Error message or null if valid
     */
    private function validateType(mixed $value, Prop $prop): ?string {
        $label = $prop->label ?? $prop->key;

        // Handle arrays
        if ($prop->is_array && !is_array($value)) {
            return "{$label} must be an array";
        }

        $checkValue = $prop->is_array ? ($value[0] ?? null) : $value;
        if ($checkValue === null) {
            return null;
        }

        switch ($prop->data_type) {
            case Constants::DT_NUMBER:
            case Constants::DT_FLOAT:
                if (!is_numeric($checkValue)) {
                    return "{$label} must be a number";
                }
                break;

            case Constants::DT_BOOLEAN:
                if (!is_bool($checkValue) && !in_array($checkValue, [0, 1, '0', '1'], true)) {
                    return "{$label} must be a boolean";
                }
                break;

            case Constants::DT_ENUM:
                $options = array_column($prop->options ?? [], 'value');
                if (!empty($options) && !in_array($checkValue, $options)) {
                    return "{$label} must be one of: " . implode(', ', $options);
                }
                break;

            case Constants::DT_OBJECT:
                if (!is_array($checkValue) && !is_object($checkValue)) {
                    return "{$label} must be an object";
                }
                break;

            case Constants::DT_RELATION:
                // Validate that related object exists
                if ($prop->object_class_id) {
                    $related = $this->storage->getobj($prop->object_class_id, $checkValue);
                    if (!$related) {
                        return "{$label} references non-existent {$prop->object_class_id}";
                    }
                }
                break;
        }

        return null;
    }

    /**
     * Run a custom validator
     *
     * @param mixed $value     Value to validate
     * @param array $validator Validator config {type, ...params}
     * @param Prop  $prop      Property definition
     *
     * @return string|null Error message or null if valid
     */
    private function runValidator(mixed $value, array $validator, Prop $prop): ?string {
        $type = $validator['type'] ?? '';
        $message = $validator['message'] ?? null;

        switch ($type) {
            case Constants::VT_EMAIL:
                if (!filter_var($value, FILTER_VALIDATE_EMAIL)) {
                    return $message ?? 'Invalid email address';
                }
                break;

            case Constants::VT_URL:
                if (!filter_var($value, FILTER_VALIDATE_URL)) {
                    return $message ?? 'Invalid URL';
                }
                break;

            case Constants::VT_LENGTH:
                $len = is_string($value) ? strlen($value) : (is_array($value) ? count($value) : 0);
                if (isset($validator['min']) && $len < $validator['min']) {
                    return $message ?? "Minimum length is {$validator['min']}";
                }
                if (isset($validator['max']) && $len > $validator['max']) {
                    return $message ?? "Maximum length is {$validator['max']}";
                }
                break;

            case Constants::VT_RANGE:
                if (isset($validator['min']) && $value < $validator['min']) {
                    return $message ?? "Minimum value is {$validator['min']}";
                }
                if (isset($validator['max']) && $value > $validator['max']) {
                    return $message ?? "Maximum value is {$validator['max']}";
                }
                break;

            case Constants::VT_REGEX:
                if (!empty($validator['pattern']) && !preg_match($validator['pattern'], $value)) {
                    return $message ?? 'Invalid format';
                }
                break;

            case Constants::VT_INTEGER:
                if (!is_int($value) && !ctype_digit((string)$value)) {
                    return $message ?? 'Must be an integer';
                }
                break;

            case Constants::VT_POSITIVE:
                if ($value <= 0) {
                    return $message ?? 'Must be a positive number';
                }
                break;

            case 'enum':
                $values = $validator['values'] ?? [];
                if (!empty($values) && !in_array($value, $values, true)) {
                    return $message ?? 'Must be one of: ' . implode(', ', $values);
                }
                break;

            case 'min':
                $min = $validator['value'] ?? $validator['min'] ?? null;
                if ($min !== null && is_numeric($value) && $value < $min) {
                    return $message ?? "Minimum value is {$min}";
                }
                break;

            case 'max':
                $max = $validator['value'] ?? $validator['max'] ?? null;
                if ($max !== null && is_numeric($value) && $value > $max) {
                    return $message ?? "Maximum value is {$max}";
                }
                break;

            case 'minLength':
                $min = $validator['value'] ?? $validator['min'] ?? null;
                if ($min !== null && is_string($value) && strlen($value) < $min) {
                    return $message ?? "Minimum length is {$min}";
                }
                break;

            case 'maxLength':
                $max = $validator['value'] ?? $validator['max'] ?? null;
                if ($max !== null && is_string($value) && strlen($value) > $max) {
                    return $message ?? "Maximum length is {$max}";
                }
                break;
        }

        return null;
    }

    // =========================================================================
    // HELPERS
    // =========================================================================

    /**
     * Apply default values to a new object
     *
     * @param array     $obj  Object data
     * @param ClassMeta $meta Class metadata
     *
     * @return array Object with defaults applied
     */
    private function applyDefaults(array $obj, ClassMeta $meta): array {
        foreach ($meta->getProps() as $prop) {
            if (!isset($obj[$prop->key]) && $prop->default_value !== null) {
                $obj[$prop->key] = $prop->default_value;
            }
        }
        return $obj;
    }

    /**
     * Detect changes between new and old object
     *
     * @param array      $obj    New object data
     * @param array|null $oldObj Old object data (null for new objects)
     *
     * @return array Changes [{field => ['old' => x, 'new' => y]}]
     */
    private function detectChanges(array $obj, ?array $oldObj): array {
        if ($oldObj === null) {
            return ['_new' => true]; // New object marker
        }

        $changes = [];
        foreach ($obj as $key => $value) {
            if (!array_key_exists($key, $oldObj) || $oldObj[$key] !== $value) {
                $changes[$key] = [
                    'old' => $oldObj[$key] ?? null,
                    'new' => $value,
                ];
            }
        }
        return $changes;
    }

    /**
     * Check if name is unique within class
     *
     * @param string $classId   Class identifier
     * @param string $name      Name to check
     * @param mixed  $excludeId ID to exclude (for updates)
     *
     * @return bool True if unique
     */
    private function isNameUnique(string $classId, string $name, mixed $excludeId): bool {
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
     * Used for auto_add_prop feature.
     *
     * @param mixed $value Value to analyze
     *
     * @return string Data type constant
     */
    private function guessDataType(mixed $value): string {
        if (is_bool($value)) return Constants::DT_BOOLEAN;
        if (is_int($value)) return Constants::DT_NUMBER;
        if (is_float($value)) return Constants::DT_FLOAT;
        if (is_array($value)) return Constants::DT_OBJECT;
        return Constants::DT_STRING;
    }

    // =========================================================================
    // TEST & RESET
    // =========================================================================

    /**
     * Reset data - clears all non-system objects
     * Clears existing objects from all non-system classes,
     * and optionally loads initial test data.
     *
     * @return array {reset: true, classes: [...], timestamp: ...}
     */
    public function reset(): array {
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

        // Load initial data from test_data.json if exists
        $testFile = dirname($this->basePath) . '/data/test_data.json';
        if (file_exists($testFile)) {
            $testData = json_decode(file_get_contents($testFile), true);

            // Reset initial data
            foreach ($testData['initial_data'] ?? [] as $classId => $objects) {
                // Clear existing (in case class wasn't in getAllClasses)
                $existing = $this->storage->getobj($classId) ?? [];
                foreach ($existing as $obj) {
                    $this->storage->delobj($classId, $obj[Constants::F_ID]);
                }

                // Insert new
                foreach ($objects as $obj) {
                    $this->storage->setobj($classId, $obj);
                }

                if (!in_array($classId, $resetClasses)) {
                    $resetClasses[] = $classId;
                }
            }
        }

        return [
            'reset' => true,
            'classes' => $resetClasses,
            'timestamp' => date('c'),
        ];
    }

    /**
     * Run test scenarios from test_data.json
     *
     * @return array {passed: n, total: n, success: bool, results: [...]}
     * @throws \Exception If test_data.json not found
     */
    public function runTests(): array {
        $testFile = dirname($this->basePath) . '/data/test_data.json';

        if (!file_exists($testFile)) {
            throw new \Exception('test_data.json not found');
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
            } catch (\Exception $e) {
                $result['error'] = $e->getMessage();
                if ($expectError) {
                    $errorData = json_decode($e->getMessage(), true);
                    if ($expectedCode && $errorData) {
                        $errorCodes = array_column($errorData['errors'] ?? [], 'code');
                        $result['passed'] = in_array($expectedCode, $errorCodes);
                    }
                    else {
                        $result['passed'] = true;
                    }
                }
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

    private function queryInternal($filters = [], $options = []): array {
        // This is a placeholder for internal querying logic if needed
        // we need to remove the query $class_id , just filters that we give
        $result = $this->storage->query(Constants::K_CLASS, $filters, $options);
        return $result;
    }
}
