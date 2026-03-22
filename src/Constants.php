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

    /** @var string Data provider class — external API integration */
    const K_PROVIDER = '@provider';

    /** @var string CRUD provider class — extends @provider for REST CRUD APIs */
    const K_CRUD_PROVIDER = 'crud_provider';

    /** @var string Auth-service connection config class */
    const K_AUTH_CONFIG = 'auth_config';

    /** @var string Auth app registration credentials class */
    const K_AUTH_APP = 'auth_app';

    /** @var string Auth machine registration class */
    const K_AUTH_MACHINE = 'auth_machine';

    /** @var string Seed definition class — declarative data loading */
    const K_SEED = '@seed';

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

    /** @var string Application ID for multi-tenant isolation */
    const F_APP_ID = 'app_id';

    /** @var string Domain for multi-tenant isolation */
    const F_DOMAIN = 'domain';

    /** @var string Tenant ID for multi-tenant data isolation */
    const F_TENANT_ID = 'tenant_id';

    // =========================================================================
    // DATA TYPES (DT_*) — CLOSED SET: 8 canonical types
    // Types for property values - used for validation, storage, and editor resolution
    // =========================================================================

    /** @var string String/text value */
    const DT_STRING = 'string';

    /** @var string Boolean true/false */
    const DT_BOOLEAN = 'boolean';

    /** @var string Integer (whole number) */
    const DT_INTEGER = 'integer';

    /** @var string Floating point number */
    const DT_FLOAT = 'float';

    /**
     * @var string Canonical type for all date/time values.
     * Covers date-only, time-only, and full datetime.
     * The editor type (ET_DATE / ET_TIME / ET_DATETIME) controls display granularity — not this field.
     */
    const DT_DATETIME = 'datetime';

    /** @var string Nested object/array */
    const DT_OBJECT = 'object';

    /** @var string Reference to another object (foreign key) */
    const DT_RELATION = 'relation';

    /** @var string Executable — local function or @action (PUT triggers execution, body = params) */
    const DT_FUNCTION = 'function';

    // =========================================================================
    // LEGACY TYPE ALIASES (for migration/backward compat in existing data)
    // These map to canonical types. New code should use canonical types directly.
    // number → float, date → datetime, enum → string + options.values, unique → string
    // =========================================================================

    const DT_NUMBER = 'number';    // → DT_FLOAT or DT_INTEGER
    const DT_DATE = 'date';        // → DT_DATETIME
    const DT_ENUM = 'enum';        // → DT_STRING + options.values
    const DT_UNIQUE = 'unique';    // → DT_STRING (id auto-generation is storage concern)

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

    // =========================================================================
    // DIRECTORY & PATH CONSTANTS
    // =========================================================================

    /** @var string ElementStore data directory name */
    const ES_DIR = '.es';

    /** @var string Namespace separator in class IDs (e.g., ui:button) */
    const NS_SEPARATOR = ':';

    /** @var string Genesis file suffix */
    const GENESIS_SUFFIX = '.genesis.json';

    /** @var string Seed file suffix */
    const SEED_SUFFIX = '.seed.json';

    // =========================================================================
    // GENESIS CONFIGURATION KEYS
    // =========================================================================

    /** @var string Config key for genesis source URL (git raw URL) */
    const CFG_GENESIS_URL = 'genesis_url';

    /** @var string Config key for genesis mode: 'local' or 'remote' */
    const CFG_GENESIS_MODE = 'genesis_mode';

    /** @var string Environment variable for genesis URL override */
    const ENV_GENESIS_URL = 'ES_GENESIS_URL';

    /** @var string Environment variable for genesis mode override */
    const ENV_GENESIS_MODE = 'ES_GENESIS_MODE';

    // =========================================================================
    // PERMISSION CONSTANTS
    // =========================================================================

    /** @var string Permission: allowed to write to seed/genesis files */
    const PERM_SEED_WRITE = 'seed_write';

    // =========================================================================
    // GENESIS FIELDS
    // =========================================================================

    /** @var string Flag: class is a seed class (changes auto-save to genesis) */
    const F_IS_SEED = 'is_seed';

    /** @var string The genesis file this class definition was loaded from */
    const F_GENESIS_FILE = 'genesis_file';

    /** @var string The .es/ directory path where this class's genesis/seed files reside */
    const F_GENESIS_DIR = 'genesis_dir';

    /** @var string The seed file this class's objects should write back to */
    const F_SEED_FILE = 'seed_file';
}
