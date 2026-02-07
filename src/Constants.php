<?php
/**
 * ElementStore Constants
 *
 * Central repository for all system constants used throughout ElementStore.
 * Organized into logical groups:
 * - K_* : System class keys (meta-classes)
 * - F_* : Standard field names
 * - DT_* : Data types for properties
 * - ET_* : Editor types for UI rendering
 * - VT_* : Validator types for validation rules
 *
 * @package ElementStore
 */

namespace ElementStore;

class Constants
{
    // =========================================================================
    // SYSTEM CLASS KEYS (K_*)
    // Meta-classes that define the system structure
    // =========================================================================

    /** @var string Class definition class - defines what a class looks like */
    const K_CLASS = '@class';

    /** @var string Property definition class - defines what a property looks like */
    const K_PROP = '@prop';

    /** @var string General metadata class */
    const K_META = '@meta';

    /** @var string Action definition class - for model actions/methods */
    const K_ACTION = '@action';

    /** @var string Event definition class - for event handlers */
    const K_EVENT = '@event';

    /** @var string Editor definition class - defines UI editor types */
    const K_EDITOR = '@editor';

    /** @var string Function definition class - defines reusable functions */
    const K_FUNCTION = '@function';

    /** @var string Storage configuration class */
    const K_STORAGE = '@storage';

    // =========================================================================
    // STANDARD FIELDS (F_*)
    // Common field names used across all objects
    // =========================================================================

    /** @var string Object identifier field */
    const F_ID = 'id';

    /** @var string Class identifier field - which class this object belongs to */
    const F_CLASS_ID = 'class_id';

    /** @var string Human-readable name field */
    const F_NAME = 'name';

    /** @var string Properties array field (on class definitions) */
    const F_PROPS = 'props';

    /** @var string Parent class ID field (for inheritance) */
    const F_EXTENDS_ID = 'extends_id';

    /** @var string Creation timestamp field */
    const F_CREATED_AT = 'created_at';

    /** @var string Last update timestamp field */
    const F_UPDATED_AT = 'updated_at';

    /** @var string Owner/creator user ID field */
    const F_OWNER_ID = 'owner_id';

    // =========================================================================
    // DATA TYPES (DT_*)
    // Types for property values - used for validation and storage
    // Core types: string, boolean, float, integer, object, relation, unique, function
    // =========================================================================

    /** @var string String/text value */
    const DT_STRING = 'string';

    /** @var string Boolean true/false */
    const DT_BOOLEAN = 'boolean';

    /** @var string Floating point number */
    const DT_FLOAT = 'float';

    /** @var string Integer number */
    const DT_INTEGER = 'integer';

    /** @var string Nested object/array */
    const DT_OBJECT = 'object';

    /** @var string Reference to another object (foreign key) */
    const DT_RELATION = 'relation';

    /** @var string Unique/primary key field (auto-generated) */
    const DT_UNIQUE = 'unique';

    /** @var string JavaScript function/code */
    const DT_FUNCTION = 'function';

    // =========================================================================
    // DEPRECATED DATA TYPES (kept for backward compatibility)
    // =========================================================================

    /** @var string Integer number @deprecated Use DT_INTEGER instead */
    const DT_NUMBER = 'number';

    /** @var string Date only (no time) @deprecated Use DT_STRING with date editor */
    const DT_DATE = 'date';

    /** @var string Date and time @deprecated Use DT_STRING with datetime editor */
    const DT_DATETIME = 'datetime';

    /** @var string Enumerated value @deprecated Use DT_STRING with options.values */
    const DT_ENUM = 'enum';

    // =========================================================================
    // EDITOR TYPES (ET_*)
    // UI editor components for property editing
    // =========================================================================

    /** @var string Single line text input */
    const ET_TEXT = 'text';

    /** @var string Multi-line text area */
    const ET_TEXTAREA = 'textarea';

    /** @var string Code editor with syntax highlighting */
    const ET_CODE = 'code';

    /** @var string Rich text / WYSIWYG editor */
    const ET_RICHTEXT = 'richtext';

    /** @var string Password input (masked) */
    const ET_PASSWORD = 'password';

    /** @var string Numeric input with step controls */
    const ET_NUMBER = 'number';

    /** @var string Slider for numeric ranges */
    const ET_SLIDER = 'slider';

    /** @var string Currency input with formatting */
    const ET_CURRENCY = 'currency';

    /** @var string Checkbox for boolean */
    const ET_CHECKBOX = 'checkbox';

    /** @var string Toggle switch for boolean */
    const ET_TOGGLE = 'toggle';

    /** @var string Dropdown select */
    const ET_SELECT = 'select';

    /** @var string Multi-select with tags */
    const ET_MULTISELECT = 'multiselect';

    /** @var string Radio button group */
    const ET_RADIO = 'radio';

    /** @var string Autocomplete with search */
    const ET_AUTOCOMPLETE = 'autocomplete';

    /** @var string Date picker */
    const ET_DATE = 'date';

    /** @var string Time picker */
    const ET_TIME = 'time';

    /** @var string Date and time picker */
    const ET_DATETIME = 'datetime';

    /** @var string Color picker */
    const ET_COLOR = 'color';

    /** @var string File upload */
    const ET_FILE = 'file';

    /** @var string Image upload with preview */
    const ET_IMAGE = 'image';

    /** @var string JSON editor */
    const ET_JSON = 'json';

    /** @var string Key-value pair editor */
    const ET_KEYVALUE = 'keyvalue';

    /** @var string Single reference picker */
    const ET_REFERENCE = 'reference';

    /** @var string Multiple references picker */
    const ET_REFERENCES = 'references';

    /** @var string JavaScript code editor */
    const ET_JAVASCRIPT = 'javascript';

    // =========================================================================
    // VALIDATOR TYPES (VT_*)
    // Validation rules for property values
    // =========================================================================

    /** @var string Field is required (not null/empty) */
    const VT_REQUIRED = 'required';

    /** @var string Must be valid email format */
    const VT_EMAIL = 'email';

    /** @var string Must be valid URL format */
    const VT_URL = 'url';

    /** @var string Must be valid phone number format */
    const VT_PHONE = 'phone';

    /** @var string Must match regex pattern */
    const VT_REGEX = 'regex';

    /** @var string String/array length constraints (min, max) */
    const VT_LENGTH = 'length';

    /** @var string Numeric range constraints (min, max) */
    const VT_RANGE = 'range';

    /** @var string Must be an integer */
    const VT_INTEGER = 'integer';

    /** @var string Must be a positive number */
    const VT_POSITIVE = 'positive';

    /** @var string Must be one of enum values */
    const VT_ENUM_VALUE = 'enum_value';

    /** @var string Date must be within range */
    const VT_DATE_RANGE = 'date_range';

    /** @var string Value must be unique within class */
    const VT_UNIQUE = 'unique';

    /** @var string Custom validation function */
    const VT_CUSTOM = 'custom';
}
