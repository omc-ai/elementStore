<?php
/**
 * Prop - Property definition for a class
 *
 * Defines a single property within a class, including its type,
 * validation rules, editor configuration, and display settings.
 *
 * Properties are embedded within ClassMeta objects and define
 * the schema for objects of that class.
 *
 * @package ElementStore
 */

namespace ElementStore;

/**
 * Prop - Property definition for a class
 */
class Prop extends EntityObj
{
    /** @var string Default class_id for Prop objects */
    public string $class_id = Constants::K_PROP;

    // =========================================================================
    // PROPERTY FIELD CONSTANTS (PF_*)
    // Used for referencing property fields by name
    // =========================================================================

    const PF_KEY = 'key';
    const PF_NAME = 'name';
    const PF_LABEL = 'label';
    const PF_DESCRIPTION = 'description';
    const PF_DATA_TYPE = 'data_type';
    const PF_IS_ARRAY = 'is_array';
    const PF_OBJECT_CLASS_ID = 'object_class_id';
    const PF_OBJECT_CLASS_STRICT = 'object_class_strict';
    const PF_ON_ORPHAN = 'on_orphan';
    const PF_OPTIONS = 'options';
    const PF_EDITOR = 'editor';
    const PF_REQUIRED = 'required';
    const PF_READONLY = 'readonly';
    const PF_DEFAULT_VALUE = 'default_value';
    const PF_DISPLAY_ORDER = 'display_order';
    const PF_GROUP_NAME = 'group_name';
    const PF_HIDDEN = 'hidden';
    const PF_SERVER_ONLY = 'server_only';
    const PF_CREATE_ONLY = 'create_only';
    const PF_MASTER_ONLY = 'master_only';

    // =========================================================================
    // ORPHAN ACTION CONSTANTS
    // =========================================================================
    const ORPHAN_KEEP = 'keep';      // Keep orphaned objects (default)
    const ORPHAN_DELETE = 'delete';  // Delete when no references remain

    // =========================================================================
    // PROPERTY FIELDS
    // =========================================================================

    /** @var string Property key (field name) - required */
    public string $key = '';

    /** @var string|null Display label */
    public ?string $label = null;

    /** @var string|null Description/help text */
    public ?string $description = null;

    /** @var string Data type (see Constants::DT_*) */
    public string $data_type = Constants::DT_STRING;

    /**
     * Property multiplicity:
     * - false:     scalar (single value)
     * - true:      backward compat alias for 'indexed'
     * - 'indexed': ordered array [val1, val2, ...]
     * - 'assoc':   associative key→value map {key1: val1, key2: val2, ...}
     *
     * @var bool|string
     */
    public bool|string $is_array = false;

    // =========================================================================
    // ARRAY MODE CONSTANTS
    // =========================================================================
    const ARRAY_FALSE = 'false';
    const ARRAY_INDEXED = 'indexed';
    const ARRAY_ASSOC = 'assoc';

    /** @var array|null For relations/objects: target class IDs (multiple allowed, accepts child classes unless strict) */
    public ?array $object_class_id = null;

    /** @var bool Only accept exact class, not child classes (default: false = accept children) */
    public bool $object_class_strict = false;

    /** @var string Action when object becomes orphaned: 'keep' or 'delete' (default: keep) */
    public string $on_orphan = self::ORPHAN_KEEP;

    /**
     * @var array|null Type-specific options (varies by data_type)
     * - string: values[], allow_custom, min_length, max_length, pattern
     * - integer/float: min, max, step, values[]
     * - boolean: true_label, false_label
     * - datetime: min_date, max_date, min_time, max_time
     * - object: cast_from_string{} — template to expand string values into objects ($value = the string)
     * - relation: filter{}, sort_by, display_field
     * - function: function_type, function_name, parameters{}, bindings{}, code
     */
    public ?array $options = null;

    /** @var array|string|null Inline @editor widget instance {id, ...config} or legacy string ID */
    public array|string|null $editor = null;

    /** @var array Behavior flags: required, readonly, hidden, create_only, server_only, master_only */
    public array $flags = [];

    /** @var mixed Default value for new objects */
    public mixed $default_value = null;

    /** @var int Display order in forms/tables */
    public int $display_order = 0;

    // Flag accessors — read from $flags array
    public function isRequired(): bool { return !empty($this->flags['required']); }
    public function isReadonly(): bool { return !empty($this->flags['readonly']); }
    public function isHidden(): bool { return !empty($this->flags['hidden']); }
    public function isCreateOnly(): bool { return !empty($this->flags['create_only']); }
    public function isServerOnly(): bool { return !empty($this->flags['server_only']); }
    public function isMasterOnly(): bool { return !empty($this->flags['master_only']); }

    /**
     * Constructor with data normalization
     *
     * Normalizes object_class_id from string to array for backward compatibility.
     *
     * @param string|null                  $class_id Class identifier
     * @param array                        $data     Property data
     * @param \Phalcon\Di\DiInterface|null $di       DI container
     */
    public function __construct(?string $class_id = null, array $data = [], ?\Phalcon\Di\DiInterface $di = null)
    {
        // Normalize object_class_id: string -> array for backward compatibility
        if (isset($data['object_class_id'])) {
            $data['object_class_id'] = self::normalizeClassIds($data['object_class_id']);
        }

        // Normalize is_array: boolean true → 'indexed', boolean false → false (keep as bool)
        // String values 'indexed'/'assoc'/'false' pass through
        if (isset($data['is_array'])) {
            if ($data['is_array'] === true) {
                $data['is_array'] = self::ARRAY_INDEXED;
            } elseif ($data['is_array'] === 'true') {
                $data['is_array'] = self::ARRAY_INDEXED;
            } elseif ($data['is_array'] === false || $data['is_array'] === 'false') {
                $data['is_array'] = false;
            }
            // 'indexed' and 'assoc' string values pass through as-is
        }

        // Normalize editor: string → inline object {id: "string_value"}
        if (isset($data['editor'])) {
            if (is_string($data['editor'])) {
                $data['editor'] = ['id' => $data['editor']];
            } elseif (is_array($data['editor']) && isset($data['editor']['type']) && !isset($data['editor']['id'])) {
                // Legacy {type: "textarea"} → {id: "textarea"}
                $data['editor']['id'] = $data['editor']['type'];
                unset($data['editor']['type']);
            }
        }
        if (isset($data['field_type']) && !isset($data['editor'])) {
            $data['editor'] = ['id' => $data['field_type']];
            unset($data['field_type']);
        }

        // Normalize flags: merge top-level booleans into flags object
        $flagKeys = ['required', 'readonly', 'hidden', 'create_only', 'server_only', 'master_only'];
        if (!isset($data['flags']) || !is_array($data['flags'])) {
            $data['flags'] = [];
        }
        foreach ($flagKeys as $fk) {
            if (isset($data[$fk]) && !isset($data['flags'][$fk])) {
                if ($data[$fk]) $data['flags'][$fk] = true;
                unset($data[$fk]);
            }
        }

        // Remove group_name (legacy — grouping is now via contexts)
        unset($data['group_name']);

        parent::__construct($class_id ?? Constants::K_PROP, $data, $di);
    }

    /**
     * Create Prop from array data
     *
     * @param string                       $class_id Class identifier (ignored, uses K_PROP)
     * @param array                        $data     Property data
     * @param \Phalcon\Di\DiInterface|null $di       DI container
     *
     * @return static
     */
    public static function fromArray(string $class_id = '', array $data = [], ?\Phalcon\Di\DiInterface $di = null): static
    {
        // Handle both signatures: fromArray($data) and fromArray($class_id, $data)
        if (empty($data) && !empty($class_id) && is_string($class_id)) {
            // Old signature: just data array passed as first param - shouldn't happen but handle gracefully
            return new static(Constants::K_PROP, [], $di);
        }
        return new static(Constants::K_PROP, $data, $di);
    }

    /**
     * Create Prop from data array (convenience method)
     *
     * @param array                        $data Property data
     * @param \Phalcon\Di\DiInterface|null $di   DI container
     *
     * @return static
     */
    public static function create(array $data, ?\Phalcon\Di\DiInterface $di = null): static
    {
        return new static(Constants::K_PROP, $data, $di);
    }

    /**
     * Get the effective label (label or key)
     *
     * @return string
     */
    public function getLabel(): string
    {
        return $this->label ?? $this->key;
    }

    /**
     * Check if this is a relation property
     *
     * @return bool
     */
    public function isRelation(): bool
    {
        return $this->data_type === Constants::DT_RELATION;
    }

    /**
     * Check if this is a single embedded object property (not an array)
     *
     * @return bool
     */
    public function isEmbeddedObject(): bool
    {
        return $this->data_type === Constants::DT_OBJECT
            && $this->hasTargetClasses()
            && $this->getArrayMode() === self::ARRAY_FALSE;
    }

    /**
     * Check if this is an array of embedded objects (indexed array)
     *
     * @return bool
     */
    public function isEmbeddedArray(): bool
    {
        return $this->isIndexedArray() && $this->hasTargetClasses() && $this->data_type !== Constants::DT_RELATION;
    }

    /**
     * Check if this is an assoc map of embedded objects
     *
     * @return bool
     */
    public function isEmbeddedAssoc(): bool
    {
        return $this->isAssocArray() && $this->hasTargetClasses() && $this->data_type !== Constants::DT_RELATION;
    }

    /**
     * Check if this is an ownership relation (single, uses owner_id in child)
     * - Child belongs to ONE parent
     * - Deleting parent cascades to children
     *
     * @return bool
     */
    public function isOwnershipRelation(): bool
    {
        return $this->data_type === Constants::DT_RELATION
            && $this->hasTargetClasses()
            && $this->getArrayMode() === self::ARRAY_FALSE;
    }

    /**
     * Check if this is a reference relation (indexed array of IDs, many-to-many)
     * - Objects exist independently
     * - Can unlink without deleting
     *
     * @return bool
     */
    public function isReferenceRelation(): bool
    {
        return $this->data_type === Constants::DT_RELATION
            && $this->hasTargetClasses()
            && $this->isIndexedArray();
    }

    // =========================================================================
    // ARRAY MODE HELPERS
    // =========================================================================

    /**
     * Get normalized array mode: 'false' | 'indexed' | 'assoc'
     */
    public function getArrayMode(): string
    {
        if ($this->is_array === true || $this->is_array === 'indexed' || $this->is_array === self::ARRAY_INDEXED) {
            return self::ARRAY_INDEXED;
        }
        if ($this->is_array === 'assoc' || $this->is_array === self::ARRAY_ASSOC) {
            return self::ARRAY_ASSOC;
        }
        return self::ARRAY_FALSE;
    }

    /**
     * True when is_array is true, 'indexed', or 'assoc' (any collection)
     */
    public function isCollection(): bool
    {
        $mode = $this->getArrayMode();
        return $mode === self::ARRAY_INDEXED || $mode === self::ARRAY_ASSOC;
    }

    /**
     * True when is_array is true or 'indexed' (ordered array)
     */
    public function isIndexedArray(): bool
    {
        return $this->getArrayMode() === self::ARRAY_INDEXED;
    }

    /**
     * True when is_array is 'assoc' (key→value map)
     */
    public function isAssocArray(): bool
    {
        return $this->getArrayMode() === self::ARRAY_ASSOC;
    }

    /**
     * Check if orphaned objects should be deleted
     *
     * @return bool
     */
    public function shouldDeleteOnOrphan(): bool
    {
        return $this->on_orphan === self::ORPHAN_DELETE;
    }

    /**
     * Check if this relation accepts child classes
     *
     * @return bool
     */
    public function acceptsChildClasses(): bool
    {
        return !$this->object_class_strict;
    }

    /**
     * Check if this property has any target classes defined
     *
     * @return bool
     */
    public function hasTargetClasses(): bool
    {
        return $this->object_class_id !== null && count($this->object_class_id) > 0;
    }

    /**
     * Get the target class IDs as an array (normalizes single string to array)
     *
     * @return array
     */
    public function getTargetClasses(): array
    {
        if ($this->object_class_id === null) {
            return [];
        }
        return $this->object_class_id;
    }

    /**
     * Get the first (primary) target class ID
     *
     * @return string|null
     */
    public function getPrimaryTargetClass(): ?string
    {
        if ($this->object_class_id === null || count($this->object_class_id) === 0) {
            return null;
        }
        return $this->object_class_id[0];
    }

    /**
     * Check if a specific class ID is a valid target for this property
     *
     * @param string $classId Class ID to check
     * @return bool
     */
    public function isValidTargetClass(string $classId): bool
    {
        if ($this->object_class_id === null) {
            return false;
        }
        return in_array($classId, $this->object_class_id, true);
    }

    /**
     * Normalize object_class_id to always be an array
     * Call this after loading data that might have single string value
     *
     * @param mixed $value The value to normalize
     * @return array|null
     */
    public static function normalizeClassIds(mixed $value): ?array
    {
        if ($value === null) {
            return null;
        }
        if (is_array($value)) {
            return array_filter($value, fn($v) => $v !== null && $v !== '');
        }
        if (is_string($value) && $value !== '') {
            return [$value];
        }
        return null;
    }
}
