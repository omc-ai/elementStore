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
    const PF_VALIDATORS = 'validators';
    const PF_ENUM_VALUES = 'enum_values';
    const PF_ENUM_ALLOW_CUSTOM = 'enum_allow_custom';
    const PF_REQUIRED = 'required';
    const PF_READONLY = 'readonly';
    const PF_DEFAULT_VALUE = 'default_value';
    const PF_DISPLAY_ORDER = 'display_order';
    const PF_GROUP_NAME = 'group_name';
    const PF_HIDDEN = 'hidden';

    // =========================================================================
    // ORPHAN ACTION CONSTANTS
    // =========================================================================
    const ORPHAN_KEEP = 'keep';      // Keep orphaned objects (default)
    const ORPHAN_DELETE = 'delete';  // Delete when no references remain

    // =========================================================================
    // AVAILABLE EDITOR TYPES
    // =========================================================================

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

    /** @var bool Is this property an array of values */
    public bool $is_array = false;

    /** @var array|null For relations/objects: target class IDs (multiple allowed, accepts child classes unless strict) */
    public ?array $object_class_id = null;

    /** @var bool Only accept exact class, not child classes (default: false = accept children) */
    public bool $object_class_strict = false;

    /** @var string Action when object becomes orphaned: 'keep' or 'delete' (default: keep) */
    public string $on_orphan = self::ORPHAN_KEEP;

    /**
     * @var array|null Type-specific options (varies by data_type)
     * Always has a 'type' field to identify the format:
     * - string_options: values[], allow_custom, min_length, max_length, pattern
     * - relation_options: filter{}, sort_by, display_field, on_orphan, strict_class
     * - object_options: embedded, strict_class
     * - number_options: min, max, step, values[]
     * - boolean_options: true_label, false_label
     * - function_options: function_type, function_name, parameters{}, bindings{}, code
     * - unique_options: generator (uuid|auto_increment|custom), prefix, custom_function
     */
    public ?array $options = null;

    /** @var array|string|null Editor configuration {type, ...options} or @editor reference ID */
    public array|string|null $editor = ['type' => 'text'];

    /** @var array Validation rules - array of @function references or inline validators */
    public array $validators = [];

    /** @var array|null Enum values for enum type (simple string array) @deprecated Use options.values instead */
    public ?array $enum_values = null;

    /** @var bool Allow custom values in addition to enum values @deprecated Use options.allow_custom instead */
    public bool $enum_allow_custom = false;

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

        // Normalize editor: if it's an object with 'type', convert to just the type string for @editor relation
        // Keep as object for now - the UI will handle both formats
        // Future: editor should be a reference ID to @editor object

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
            && !$this->is_array;
    }

    /**
     * Check if this is an array of embedded objects
     *
     * @return bool
     */
    public function isEmbeddedArray(): bool
    {
        return $this->is_array && $this->hasTargetClasses() && $this->data_type !== Constants::DT_RELATION;
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
            && !$this->is_array;
    }

    /**
     * Check if this is a reference relation (array of IDs, many-to-many)
     * - Objects exist independently
     * - Can unlink without deleting
     *
     * @return bool
     */
    public function isReferenceRelation(): bool
    {
        return $this->data_type === Constants::DT_RELATION
            && $this->hasTargetClasses()
            && $this->is_array;
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
