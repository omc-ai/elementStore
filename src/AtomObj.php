<?php
/**
 * AtomObj - Base class for all storable objects
 *
 * Provides common fields and serialization for all ElementStore objects.
 * Both ClassMeta and Prop extend this base class.
 *
 * Supports dynamic properties via __get/__set magic methods.
 * Defined properties are accessed directly, extra/unknown properties
 * are stored in $extraData and merged on serialization.
 *
 * Features:
 * - Change tracking via __set() for WebSocket delta updates
 * - Automatic serialization to array/JSON
 * - DI container integration for accessing ClassModel
 *
 * USAGE:
 * ```php
 * $obj = new AtomObj('user', ['id' => 1, 'name' => 'Test', 'custom' => 123]);
 * $obj->name;           // "Test" - from public property
 * $obj->custom;         // 123 - from extraData via __get
 * $obj->newField = 'x'; // stored in extraData via __set, tracked in _changes
 * $obj->toArray();      // merges public props with extraData
 * $obj->getChanges();   // returns only modified fields
 * $obj->getModel()->getObject('user', 1); // access model via DI
 * ```
 *
 * @package ElementStore
 */

namespace ElementStore;

/**
 * AtomObj - Base class for all storable objects
 */
class AtomObj implements \JsonSerializable
{
    /** @var mixed Object ID (string or int) */
    public mixed $id = null;

    /** @var string Class identifier this object belongs to */
    public string $class_id = '';

    /** @var string|null Human-readable name */
    public ?string $name = null;

    /** @var mixed Owner/creator ID */
    public mixed $owner_id = null;

    /** @var array Storage for extra/dynamic properties */
    protected array $extraData = [];

    /** @var array Tracked changes for WebSocket delta updates */
    protected array $_changes = [];

    /** @var bool Is this a new object (not yet saved) */
    protected bool $_isNew = true;

    /** @var \Phalcon\Di\DiInterface|null DI container */
    protected ?\Phalcon\Di\DiInterface $di = null;

    /** @var array Cached reflection properties per class */
    protected static array $reflectProps = [];

    /**
     * Create instance with class_id and optional data
     *
     * @param string|null                  $class_id Class identifier
     * @param array                        $props    Key-value data to initialize
     * @param \Phalcon\Di\DiInterface|null $di       DI container (null = use default)
     */
    public function __construct(?string $class_id = null, array $props = [], ?\Phalcon\Di\DiInterface $di = null)
    {
        // DI is optional - use default if available, null otherwise
        if ($di !== null) {
            $this->di = $di;
        } elseif (class_exists('\Phalcon\Di\Di')) {
            $this->di = \Phalcon\Di\Di::getDefault();
        }
        $this->class_id = $class_id ?? '';

        // Get allowed property names via reflection (cached)
        $allowedNames = self::$reflectProps[static::class] ?? null;
        if ($allowedNames === null) {
            $reflect = new \ReflectionClass($this);
            $publicProps = $reflect->getProperties(\ReflectionProperty::IS_PUBLIC) ?? [];
            self::$reflectProps[static::class] = $allowedNames = array_map(fn($p) => $p->getName(), $publicProps);
        }

        // Set properties from data
        foreach ($props as $key => $value) {
            if (in_array($key, $allowedNames)) {
                $this->$key = $value;
            } else {
                $this->extraData[$key] = $value;
            }
        }

        // If we have an ID, assume it's not new (loaded from storage)
        if ($this->id !== null) {
            $this->_isNew = false;
        }
    }

    /**
     * Create instance from array data
     *
     * @param string                       $class_id Class identifier
     * @param array                        $data     Key-value data
     * @param \Phalcon\Di\DiInterface|null $di       DI container
     *
     * @return static New instance with data applied
     */
    public static function fromArray(string $class_id, array $data, ?\Phalcon\Di\DiInterface $di = null): static
    {
        return new static($class_id, $data, $di);
    }

    /**
     * Get the DI container
     *
     * @return \Phalcon\Di\DiInterface|null
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
     * Get the ClassModel from DI
     *
     * @return ClassModel|null
     */
    public function getModel(): ?ClassModel
    {
        $di = $this->getDi();
        return $di?->has('model') ? $di->get('model') : null;
    }

    // =========================================================================
    // MAGIC METHODS FOR DYNAMIC PROPERTIES
    // =========================================================================

    /**
     * Magic getter for non-existent properties
     *
     * @param string $name Property name
     *
     * @return mixed Property value or null
     */
    public function __get(string $name): mixed
    {
        return $this->extraData[$name] ?? null;
    }

    /**
     * Magic setter for non-existent properties
     * Tracks changes for WebSocket delta updates.
     *
     * @param string $name  Property name
     * @param mixed  $value Property value
     */
    public function __set(string $name, mixed $value): void
    {
        $oldValue = $this->extraData[$name] ?? null;
        $this->extraData[$name] = $value;

        // Track change if value actually changed
        if ($oldValue !== $value) {
            $this->_changes[$name] = [
                'old' => $oldValue,
                'new' => $value,
            ];
        }
    }

    /**
     * Magic isset for non-existent properties
     *
     * @param string $name Property name
     *
     * @return bool
     */
    public function __isset(string $name): bool
    {
        return isset($this->extraData[$name]);
    }

    /**
     * Magic unset for non-existent properties
     *
     * @param string $name Property name
     */
    public function __unset(string $name): void
    {
        if (isset($this->extraData[$name])) {
            $this->_changes[$name] = [
                'old' => $this->extraData[$name],
                'new' => null,
            ];
        }
        unset($this->extraData[$name]);
    }

    // =========================================================================
    // CHANGE TRACKING
    // =========================================================================

    /**
     * Get tracked changes (for WebSocket delta updates)
     *
     * @return array Changes [{field => ['old' => x, 'new' => y]}]
     */
    public function getChanges(): array
    {
        return $this->_changes;
    }

    /**
     * Check if object has pending changes
     *
     * @return bool
     */
    public function hasChanges(): bool
    {
        return !empty($this->_changes);
    }

    /**
     * Clear tracked changes (call after save/publish)
     *
     * @return self
     */
    public function clearChanges(): self
    {
        $this->_changes = [];
        return $this;
    }

    /**
     * Check if object is new (not yet saved)
     *
     * @return bool
     */
    public function isNew(): bool
    {
        return $this->_isNew;
    }

    /**
     * Mark object as saved (not new)
     *
     * @return self
     */
    public function markSaved(): self
    {
        $this->_isNew = false;
        return $this;
    }

    // =========================================================================
    // SERIALIZATION
    // =========================================================================

    /**
     * Serialize to JSON-compatible array
     * Merges public properties with extraData.
     * Filters out null values and internal properties to keep storage compact.
     *
     * @return array
     */
    public function jsonSerialize(): array
    {
        return $this->toArray();
    }

    /**
     * Convert to array
     * Merges public properties with extraData.
     * Filters out null values and internal properties.
     *
     * @return array
     */
    public function toArray(): array
    {
        $vars = get_object_vars($this);

        // Remove internal properties
        unset($vars['extraData']);
        unset($vars['_changes']);
        unset($vars['_isNew']);
        unset($vars['di']);

        // Merge with extra data
        $merged = array_merge($vars, $this->extraData);

        // Filter out null values
        return array_filter($merged, fn($v) => $v !== null);
    }

    /**
     * Get class_id
     *
     * @return string
     */
    public function getClassId(): string
    {
        return $this->class_id;
    }

    /**
     * Get object ID
     *
     * @return mixed
     */
    public function getId(): mixed
    {
        return $this->id;
    }
}

/**
 * EntityObj - Extended base class with audit fields
 *
 * Adds created_at, updated_at, and system flags for objects
 * that need audit tracking.
 */
class EntityObj extends AtomObj
{
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
