<?php
/**
 * SystemClasses - System class definitions
 *
 * Provides definitions for system meta-classes:
 * - @class: Class definition (schema of schemas)
 * - @prop: Property definition
 * - @action: Action/method definition
 * - @event: Event handler definition
 *
 * These are the foundational classes that define how ElementStore works.
 *
 * @package ElementStore
 */

namespace ElementStore;

/**
 * SystemClasses - Static helper for system class management
 */
class SystemClasses
{
    /**
     * Get all system class definitions
     *
     * @return array Array of class definitions ready for storage
     */
    public static function getSystemClassDefinitions(): array
    {
        return [
            self::getPropClassDefinition(),
            self::getClassClassDefinition(),
            self::getEditorClassDefinition(),
            self::getFunctionClassDefinition(),
            self::getStorageClassDefinition(),
            self::getActionClassDefinition(),
            self::getEventClassDefinition(),
            self::getProviderClassDefinition(),
            self::getCrudProviderClassDefinition(),
        ];
    }

    /**
     * Create system classes in storage
     *
     * @param IStorageProvider $storage Storage provider
     */
    public static function createSystemClasses(IStorageProvider $storage): void
    {
        foreach (self::getSystemClassDefinitions() as $classDef) {
            $storage->setobj(Constants::K_CLASS, $classDef);
        }
    }

    /**
     * Get @prop class definition
     *
     * @return array
     */
    public static function getPropClassDefinition(): array
    {
        $props = [
            // Type group
            [
                Prop::PF_KEY => Prop::PF_DATA_TYPE,
                Prop::PF_LABEL => 'Data Type',
                Prop::PF_DESCRIPTION => 'Type of value this property holds',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_REQUIRED => true,
                Prop::PF_DEFAULT_VALUE => Constants::DT_STRING,
                Prop::PF_OPTIONS => [
                    'values' => [
                        Constants::DT_STRING,
                        Constants::DT_BOOLEAN,
                        Constants::DT_INTEGER,
                        Constants::DT_FLOAT,
                        Constants::DT_DATETIME,
                        Constants::DT_OBJECT,
                        Constants::DT_RELATION,
                        Constants::DT_FUNCTION,
                    ],
                ],
                Prop::PF_DISPLAY_ORDER => 1,
                Prop::PF_GROUP_NAME => 'Type',
            ],
            [
                Prop::PF_KEY => Prop::PF_IS_ARRAY,
                Prop::PF_LABEL => 'Is Array',
                Prop::PF_DESCRIPTION => 'Property holds multiple values',
                Prop::PF_DATA_TYPE => Constants::DT_BOOLEAN,
                Prop::PF_DEFAULT_VALUE => false,
                Prop::PF_DISPLAY_ORDER => 2,
                Prop::PF_GROUP_NAME => 'Type',
            ],

            // Core group
            [
                Prop::PF_KEY => Prop::PF_KEY,
                Prop::PF_LABEL => 'Key',
                Prop::PF_DESCRIPTION => 'Property key (field name in data)',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_REQUIRED => true,
                Prop::PF_DISPLAY_ORDER => 10,
                Prop::PF_GROUP_NAME => 'Core',
            ],
            [
                Prop::PF_KEY => Prop::PF_LABEL,
                Prop::PF_LABEL => 'Label',
                Prop::PF_DESCRIPTION => 'Display label in UI',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_DISPLAY_ORDER => 11,
                Prop::PF_GROUP_NAME => 'Core',
            ],
            [
                Prop::PF_KEY => Prop::PF_DESCRIPTION,
                Prop::PF_LABEL => 'Description',
                Prop::PF_DESCRIPTION => 'Help text shown to users',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_FIELD_TYPE => 'textarea',
                Prop::PF_DISPLAY_ORDER => 12,
                Prop::PF_GROUP_NAME => 'Core',
            ],

            // Options group
            [
                Prop::PF_KEY => Prop::PF_OPTIONS,
                Prop::PF_LABEL => 'Type Options',
                Prop::PF_DESCRIPTION => 'Type-specific options (varies by data_type)',
                Prop::PF_DATA_TYPE => Constants::DT_OBJECT,
                Prop::PF_DISPLAY_ORDER => 20,
                Prop::PF_GROUP_NAME => 'Options',
            ],

            // Relation group
            [
                Prop::PF_KEY => Prop::PF_OBJECT_CLASS_ID,
                Prop::PF_LABEL => 'Target Classes',
                Prop::PF_DESCRIPTION => 'Class IDs for relations/embedded objects',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_IS_ARRAY => true,
                Prop::PF_DISPLAY_ORDER => 30,
                Prop::PF_GROUP_NAME => 'Relation',
            ],
            [
                Prop::PF_KEY => Prop::PF_OBJECT_CLASS_STRICT,
                Prop::PF_LABEL => 'Strict Class',
                Prop::PF_DESCRIPTION => 'Only accept exact class, not child classes',
                Prop::PF_DATA_TYPE => Constants::DT_BOOLEAN,
                Prop::PF_DEFAULT_VALUE => false,
                Prop::PF_DISPLAY_ORDER => 31,
                Prop::PF_GROUP_NAME => 'Relation',
            ],
            [
                Prop::PF_KEY => Prop::PF_ON_ORPHAN,
                Prop::PF_LABEL => 'On Orphan',
                Prop::PF_DESCRIPTION => 'Action when referenced object is deleted',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_OPTIONS => [
                    'values' => [Prop::ORPHAN_KEEP, Prop::ORPHAN_DELETE, 'nullify'],
                ],
                Prop::PF_DEFAULT_VALUE => Prop::ORPHAN_KEEP,
                Prop::PF_DISPLAY_ORDER => 32,
                Prop::PF_GROUP_NAME => 'Relation',
            ],

            // UI group
            [
                Prop::PF_KEY => 'editor',
                Prop::PF_LABEL => 'Editor',
                Prop::PF_DESCRIPTION => 'UI editor — relation to @editor instance',
                Prop::PF_DATA_TYPE => Constants::DT_RELATION,
                Prop::PF_OBJECT_CLASS_ID => [Constants::K_EDITOR],
                Prop::PF_DISPLAY_ORDER => 40,
                Prop::PF_GROUP_NAME => 'UI',
            ],
            [
                Prop::PF_KEY => Prop::PF_FIELD_TYPE,
                Prop::PF_LABEL => 'Field Type',
                Prop::PF_DESCRIPTION => 'Shorthand field type string (e.g. email, url, textarea)',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_DISPLAY_ORDER => 41,
                Prop::PF_GROUP_NAME => 'UI',
            ],
            [
                Prop::PF_KEY => Prop::PF_DISPLAY_ORDER,
                Prop::PF_LABEL => 'Display Order',
                Prop::PF_DESCRIPTION => 'Sort order in forms (lower = first)',
                Prop::PF_DATA_TYPE => Constants::DT_INTEGER,
                Prop::PF_DEFAULT_VALUE => 0,
                Prop::PF_DISPLAY_ORDER => 42,
                Prop::PF_GROUP_NAME => 'UI',
            ],
            [
                Prop::PF_KEY => Prop::PF_GROUP_NAME,
                Prop::PF_LABEL => 'Group',
                Prop::PF_DESCRIPTION => 'Form section grouping',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_DISPLAY_ORDER => 43,
                Prop::PF_GROUP_NAME => 'UI',
            ],
            [
                Prop::PF_KEY => Prop::PF_HIDDEN,
                Prop::PF_LABEL => 'Hidden',
                Prop::PF_DESCRIPTION => 'Hide from default UI views',
                Prop::PF_DATA_TYPE => Constants::DT_BOOLEAN,
                Prop::PF_DEFAULT_VALUE => false,
                Prop::PF_DISPLAY_ORDER => 44,
                Prop::PF_GROUP_NAME => 'UI',
            ],

            // Validation group
            [
                Prop::PF_KEY => Prop::PF_REQUIRED,
                Prop::PF_LABEL => 'Required',
                Prop::PF_DESCRIPTION => 'Field must have a value',
                Prop::PF_DATA_TYPE => Constants::DT_BOOLEAN,
                Prop::PF_DEFAULT_VALUE => false,
                Prop::PF_DISPLAY_ORDER => 50,
                Prop::PF_GROUP_NAME => 'Validation',
            ],
            [
                Prop::PF_KEY => Prop::PF_READONLY,
                Prop::PF_LABEL => 'Read Only',
                Prop::PF_DESCRIPTION => 'Field cannot be edited after creation',
                Prop::PF_DATA_TYPE => Constants::DT_BOOLEAN,
                Prop::PF_DEFAULT_VALUE => false,
                Prop::PF_DISPLAY_ORDER => 51,
                Prop::PF_GROUP_NAME => 'Validation',
            ],
            [
                Prop::PF_KEY => Prop::PF_CREATE_ONLY,
                Prop::PF_LABEL => 'Create Only',
                Prop::PF_DESCRIPTION => 'Only writable when creating new objects',
                Prop::PF_DATA_TYPE => Constants::DT_BOOLEAN,
                Prop::PF_DEFAULT_VALUE => false,
                Prop::PF_DISPLAY_ORDER => 52,
                Prop::PF_GROUP_NAME => 'Validation',
            ],
            [
                Prop::PF_KEY => Prop::PF_DEFAULT_VALUE,
                Prop::PF_LABEL => 'Default Value',
                Prop::PF_DESCRIPTION => 'Default value for new objects',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_DISPLAY_ORDER => 53,
                Prop::PF_GROUP_NAME => 'Validation',
            ],
            [
                Prop::PF_KEY => 'validators',
                Prop::PF_LABEL => 'Validators',
                Prop::PF_DESCRIPTION => 'Validation rules — relation to @function instances',
                Prop::PF_DATA_TYPE => Constants::DT_RELATION,
                Prop::PF_OBJECT_CLASS_ID => [Constants::K_FUNCTION],
                Prop::PF_IS_ARRAY => true,
                Prop::PF_DISPLAY_ORDER => 54,
                Prop::PF_GROUP_NAME => 'Validation',
            ],

            // Security group
            [
                Prop::PF_KEY => Prop::PF_SERVER_ONLY,
                Prop::PF_LABEL => 'Server Only',
                Prop::PF_DESCRIPTION => 'Stripped from API responses (backend-only)',
                Prop::PF_DATA_TYPE => Constants::DT_BOOLEAN,
                Prop::PF_DEFAULT_VALUE => false,
                Prop::PF_DISPLAY_ORDER => 60,
                Prop::PF_GROUP_NAME => 'Security',
            ],
            [
                Prop::PF_KEY => Prop::PF_MASTER_ONLY,
                Prop::PF_LABEL => 'Master Only',
                Prop::PF_DESCRIPTION => 'Only visible on master/admin interface',
                Prop::PF_DATA_TYPE => Constants::DT_BOOLEAN,
                Prop::PF_DEFAULT_VALUE => false,
                Prop::PF_DISPLAY_ORDER => 61,
                Prop::PF_GROUP_NAME => 'Security',
            ],
        ];

        return [
            Constants::F_ID => Constants::K_PROP,
            Constants::F_CLASS_ID => Constants::K_CLASS,
            Constants::F_NAME => 'Property',
            'description' => 'Defines a property within a class — type, validation, and UI behavior',
            'is_system' => true,
            Constants::F_PROPS => $props,
        ];
    }

    /**
     * Get @class class definition (meta of meta)
     *
     * @return array
     */
    public static function getClassClassDefinition(): array
    {
        $props = [
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
                Prop::PF_FIELD_TYPE => 'textarea',
                Prop::PF_DISPLAY_ORDER => 2,
            ],
            [
                Prop::PF_KEY => Constants::F_EXTENDS_ID,
                Prop::PF_LABEL => 'Extends',
                Prop::PF_DESCRIPTION => 'Parent class for inheritance',
                Prop::PF_DATA_TYPE => Constants::DT_RELATION,
                Prop::PF_OBJECT_CLASS_ID => [Constants::K_CLASS],
                Prop::PF_CREATE_ONLY => true,
                Prop::PF_DISPLAY_ORDER => 3,
            ],
            [
                Prop::PF_KEY => Constants::F_PROPS,
                Prop::PF_LABEL => 'Properties',
                Prop::PF_DESCRIPTION => 'Class property definitions',
                Prop::PF_DATA_TYPE => Constants::DT_OBJECT,
                Prop::PF_IS_ARRAY => true,
                Prop::PF_OBJECT_CLASS_ID => [Constants::K_PROP],
                Prop::PF_DISPLAY_ORDER => 4,
            ],
            [
                Prop::PF_KEY => 'storage_id',
                Prop::PF_LABEL => 'Storage',
                Prop::PF_DESCRIPTION => 'Storage provider for this class (falls back to parent class, then store default)',
                Prop::PF_DATA_TYPE => Constants::DT_RELATION,
                Prop::PF_OBJECT_CLASS_ID => [Constants::K_STORAGE],
                Prop::PF_DISPLAY_ORDER => 5,
            ],
            [
                Prop::PF_KEY => 'table_name',
                Prop::PF_LABEL => 'Table Name',
                Prop::PF_DESCRIPTION => 'Custom table name for SQL storage',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_DISPLAY_ORDER => 6,
            ],
            [
                Prop::PF_KEY => 'is_system',
                Prop::PF_LABEL => 'System Class',
                Prop::PF_DESCRIPTION => 'Protected system class (cannot be deleted)',
                Prop::PF_DATA_TYPE => Constants::DT_BOOLEAN,
                Prop::PF_READONLY => true,
                Prop::PF_DEFAULT_VALUE => false,
                Prop::PF_DISPLAY_ORDER => 7,
                Prop::PF_GROUP_NAME => 'Advanced',
            ],
            [
                Prop::PF_KEY => 'is_abstract',
                Prop::PF_LABEL => 'Abstract',
                Prop::PF_DESCRIPTION => 'Cannot create instances directly (only via child classes)',
                Prop::PF_DATA_TYPE => Constants::DT_BOOLEAN,
                Prop::PF_DEFAULT_VALUE => false,
                Prop::PF_DISPLAY_ORDER => 8,
                Prop::PF_GROUP_NAME => 'Advanced',
            ],
            [
                Prop::PF_KEY => 'providers',
                Prop::PF_LABEL => 'Providers',
                Prop::PF_DESCRIPTION => 'Data providers for external API integration',
                Prop::PF_DATA_TYPE => Constants::DT_RELATION,
                Prop::PF_IS_ARRAY => true,
                Prop::PF_OBJECT_CLASS_ID => [Constants::K_PROVIDER],
                Prop::PF_DISPLAY_ORDER => 9,
                Prop::PF_GROUP_NAME => 'Advanced',
            ],
            [
                Prop::PF_KEY => '_links',
                Prop::PF_LABEL => 'External Links',
                Prop::PF_DESCRIPTION => 'Maps storage_id to external ID for provider-linked objects. Managed by ActionExecutor — never set manually.',
                Prop::PF_DATA_TYPE => Constants::DT_OBJECT,
                Prop::PF_SERVER_ONLY => true,
                Prop::PF_HIDDEN => true,
                Prop::PF_DISPLAY_ORDER => 100,
                Prop::PF_GROUP_NAME => 'Internal',
            ],
        ];

        return [
            Constants::F_ID => Constants::K_CLASS,
            Constants::F_CLASS_ID => Constants::K_CLASS,
            Constants::F_NAME => 'Class',
            'is_system' => true,
            Constants::F_PROPS => $props,
        ];
    }

    /**
     * Get @storage class definition
     *
     * @return array
     */
    public static function getStorageClassDefinition(): array
    {
        $props = [
            [
                Prop::PF_KEY => Constants::F_NAME,
                Prop::PF_LABEL => 'Name',
                Prop::PF_DESCRIPTION => 'Storage provider display name',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_REQUIRED => true,
                Prop::PF_DISPLAY_ORDER => 1,
            ],
            [
                Prop::PF_KEY => 'url',
                Prop::PF_LABEL => 'URL',
                Prop::PF_DESCRIPTION => 'API endpoint URL (for rest type)',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_FIELD_TYPE => 'url',
                Prop::PF_DISPLAY_ORDER => 2,
            ],
            [
                Prop::PF_KEY => 'type',
                Prop::PF_LABEL => 'Type',
                Prop::PF_DESCRIPTION => 'Storage backend: local (browser), rest (ES API), api (external via @provider), seed (read-only), composite (multi-source), couchdb/mysql/json (server-only)',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_OPTIONS => [
                    'values' => ['local', 'rest', 'api', 'seed', 'composite', 'couchdb', 'mysql', 'json'],
                ],
                Prop::PF_DEFAULT_VALUE => 'rest',
                Prop::PF_DISPLAY_ORDER => 3,
            ],
            [
                Prop::PF_KEY => 'provider_id',
                Prop::PF_LABEL => 'Provider',
                Prop::PF_DESCRIPTION => 'Data provider for external API integration (type=api)',
                Prop::PF_DATA_TYPE => Constants::DT_RELATION,
                Prop::PF_OBJECT_CLASS_ID => [Constants::K_PROVIDER],
                Prop::PF_DISPLAY_ORDER => 10,
                Prop::PF_GROUP_NAME => 'Composite',
            ],
            [
                Prop::PF_KEY => 'read',
                Prop::PF_LABEL => 'Read Sources',
                Prop::PF_DESCRIPTION => 'Ordered storage IDs to read from (type=composite). Tried in order or merged.',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_IS_ARRAY => true,
                Prop::PF_DISPLAY_ORDER => 11,
                Prop::PF_GROUP_NAME => 'Composite',
            ],
            [
                Prop::PF_KEY => 'write',
                Prop::PF_LABEL => 'Write Target',
                Prop::PF_DESCRIPTION => 'Storage ID to write to (type=composite).',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_DISPLAY_ORDER => 12,
                Prop::PF_GROUP_NAME => 'Composite',
            ],
            [
                Prop::PF_KEY => 'read_strategy',
                Prop::PF_LABEL => 'Read Strategy',
                Prop::PF_DESCRIPTION => 'How to combine reads (type=composite): fallback=first hit wins, merge=combine all',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_OPTIONS => [
                    'values' => ['fallback', 'merge'],
                ],
                Prop::PF_DEFAULT_VALUE => 'fallback',
                Prop::PF_DISPLAY_ORDER => 13,
                Prop::PF_GROUP_NAME => 'Composite',
            ],
            [
                Prop::PF_KEY => 'write_strategy',
                Prop::PF_LABEL => 'Write Strategy',
                Prop::PF_DESCRIPTION => 'How to handle writes (type=composite): sequential=in order stop on fail, parallel=all at once, best_effort=all ignore failures',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_OPTIONS => [
                    'values' => ['sequential', 'parallel', 'best_effort'],
                ],
                Prop::PF_DEFAULT_VALUE => 'sequential',
                Prop::PF_DISPLAY_ORDER => 14,
                Prop::PF_GROUP_NAME => 'Composite',
            ],
        ];

        return [
            Constants::F_ID => Constants::K_STORAGE,
            Constants::F_CLASS_ID => Constants::K_CLASS,
            Constants::F_NAME => 'Storage',
            'is_system' => true,
            Constants::F_PROPS => $props,
        ];
    }

    /**
     * Get @action class definition
     *
     * @return array
     */
    public static function getActionClassDefinition(): array
    {
        $props = [
            // Core
            [
                Prop::PF_KEY => Constants::F_NAME,
                Prop::PF_LABEL => 'Name',
                Prop::PF_DESCRIPTION => 'Action display name',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_REQUIRED => true,
                Prop::PF_DISPLAY_ORDER => 1,
            ],
            [
                Prop::PF_KEY => 'description',
                Prop::PF_LABEL => 'Description',
                Prop::PF_DESCRIPTION => 'What this action does',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_FIELD_TYPE => 'textarea',
                Prop::PF_DISPLAY_ORDER => 2,
            ],
            [
                Prop::PF_KEY => 'type',
                Prop::PF_LABEL => 'Type',
                Prop::PF_DESCRIPTION => 'Execution type: api (HTTP call), function (FunctionRegistry), event (EventBus), composite (chain), ui (JS handler)',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_REQUIRED => true,
                Prop::PF_OPTIONS => [
                    'values' => ['api', 'function', 'event', 'composite', 'ui'],
                ],
                Prop::PF_DISPLAY_ORDER => 3,
            ],
            [
                Prop::PF_KEY => 'group_name',
                Prop::PF_LABEL => 'Group',
                Prop::PF_DESCRIPTION => 'Action category for UI grouping',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_DISPLAY_ORDER => 4,
            ],
            [
                Prop::PF_KEY => 'params',
                Prop::PF_LABEL => 'Parameters',
                Prop::PF_DESCRIPTION => 'Input parameters schema',
                Prop::PF_DATA_TYPE => Constants::DT_OBJECT,
                Prop::PF_IS_ARRAY => true,
                Prop::PF_OBJECT_CLASS_ID => [Constants::K_PROP],
                Prop::PF_DISPLAY_ORDER => 5,
            ],
            [
                Prop::PF_KEY => 'returns',
                Prop::PF_LABEL => 'Returns',
                Prop::PF_DESCRIPTION => 'Return type',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_OPTIONS => [
                    'values' => ['object', 'list', 'void'],
                ],
                Prop::PF_DEFAULT_VALUE => 'void',
                Prop::PF_DISPLAY_ORDER => 6,
            ],

            // API group
            [
                Prop::PF_KEY => 'method',
                Prop::PF_LABEL => 'HTTP Method',
                Prop::PF_DESCRIPTION => 'HTTP method (type=api)',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_OPTIONS => [
                    'values' => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
                ],
                Prop::PF_DEFAULT_VALUE => 'GET',
                Prop::PF_DISPLAY_ORDER => 10,
                Prop::PF_GROUP_NAME => 'API',
            ],
            [
                Prop::PF_KEY => 'endpoint',
                Prop::PF_LABEL => 'Endpoint',
                Prop::PF_DESCRIPTION => 'URL path relative to provider base_url, may use {id} substitution (type=api)',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_DISPLAY_ORDER => 11,
                Prop::PF_GROUP_NAME => 'API',
            ],
            [
                Prop::PF_KEY => 'headers',
                Prop::PF_LABEL => 'Headers',
                Prop::PF_DESCRIPTION => 'Additional HTTP headers as key:value object (type=api)',
                Prop::PF_DATA_TYPE => Constants::DT_OBJECT,
                Prop::PF_DISPLAY_ORDER => 12,
                Prop::PF_GROUP_NAME => 'API',
            ],
            [
                Prop::PF_KEY => 'mapping',
                Prop::PF_LABEL => 'Field Mapping',
                Prop::PF_DESCRIPTION => 'API response field → ES field mapping, e.g. {api_name: es_name} (type=api)',
                Prop::PF_DATA_TYPE => Constants::DT_OBJECT,
                Prop::PF_DISPLAY_ORDER => 13,
                Prop::PF_GROUP_NAME => 'API',
            ],

            // Function group
            [
                Prop::PF_KEY => 'function',
                Prop::PF_LABEL => 'Function Key',
                Prop::PF_DESCRIPTION => "FunctionRegistry key to call (type=function), e.g. 'billing.calculate'",
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_DISPLAY_ORDER => 20,
                Prop::PF_GROUP_NAME => 'Function',
            ],

            // Event group
            [
                Prop::PF_KEY => 'event',
                Prop::PF_LABEL => 'Event Name',
                Prop::PF_DESCRIPTION => 'EventBus event name to emit (type=event)',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_DISPLAY_ORDER => 30,
                Prop::PF_GROUP_NAME => 'Event',
            ],
            [
                Prop::PF_KEY => 'payload',
                Prop::PF_LABEL => 'Payload Map',
                Prop::PF_DESCRIPTION => 'param→event_field mapping for event payload (type=event)',
                Prop::PF_DATA_TYPE => Constants::DT_OBJECT,
                Prop::PF_DISPLAY_ORDER => 31,
                Prop::PF_GROUP_NAME => 'Event',
            ],

            // Composite group
            [
                Prop::PF_KEY => 'actions',
                Prop::PF_LABEL => 'Sub-Actions',
                Prop::PF_DESCRIPTION => 'Ordered action IDs to chain (type=composite)',
                Prop::PF_DATA_TYPE => Constants::DT_RELATION,
                Prop::PF_OBJECT_CLASS_ID => [Constants::K_ACTION],
                Prop::PF_IS_ARRAY => true,
                Prop::PF_DISPLAY_ORDER => 40,
                Prop::PF_GROUP_NAME => 'Composite',
            ],
            [
                Prop::PF_KEY => 'strategy',
                Prop::PF_LABEL => 'Strategy',
                Prop::PF_DESCRIPTION => 'Execution strategy (type=composite): sequential=stop on fail, parallel=all at once',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_OPTIONS => [
                    'values' => ['sequential', 'parallel'],
                ],
                Prop::PF_DEFAULT_VALUE => 'sequential',
                Prop::PF_DISPLAY_ORDER => 41,
                Prop::PF_GROUP_NAME => 'Composite',
            ],

            // UI group
            [
                Prop::PF_KEY => 'handler',
                Prop::PF_LABEL => 'Handler',
                Prop::PF_DESCRIPTION => 'JS handler code: (scope) => result (type=ui)',
                Prop::PF_DATA_TYPE => Constants::DT_FUNCTION,
                Prop::PF_FIELD_TYPE => 'javascript',
                Prop::PF_DISPLAY_ORDER => 50,
                Prop::PF_GROUP_NAME => 'UI',
            ],
            [
                Prop::PF_KEY => 'target_class_id',
                Prop::PF_LABEL => 'Target Class',
                Prop::PF_DESCRIPTION => 'Class this action applies to (type=ui)',
                Prop::PF_DATA_TYPE => Constants::DT_RELATION,
                Prop::PF_OBJECT_CLASS_ID => [Constants::K_CLASS],
                Prop::PF_DISPLAY_ORDER => 51,
                Prop::PF_GROUP_NAME => 'UI',
            ],
            [
                Prop::PF_KEY => 'requires_selection',
                Prop::PF_LABEL => 'Requires Selection',
                Prop::PF_DESCRIPTION => 'Action requires selected object(s) (type=ui)',
                Prop::PF_DATA_TYPE => Constants::DT_BOOLEAN,
                Prop::PF_DEFAULT_VALUE => true,
                Prop::PF_DISPLAY_ORDER => 52,
                Prop::PF_GROUP_NAME => 'UI',
            ],
            [
                Prop::PF_KEY => 'bulk',
                Prop::PF_LABEL => 'Bulk Action',
                Prop::PF_DESCRIPTION => 'Can apply to multiple objects (type=ui)',
                Prop::PF_DATA_TYPE => Constants::DT_BOOLEAN,
                Prop::PF_DEFAULT_VALUE => false,
                Prop::PF_DISPLAY_ORDER => 53,
                Prop::PF_GROUP_NAME => 'UI',
            ],
            [
                Prop::PF_KEY => 'confirm',
                Prop::PF_LABEL => 'Confirm',
                Prop::PF_DESCRIPTION => 'Confirmation message before running (empty = no confirm)',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_DISPLAY_ORDER => 54,
                Prop::PF_GROUP_NAME => 'UI',
            ],
            [
                Prop::PF_KEY => 'icon',
                Prop::PF_LABEL => 'Icon',
                Prop::PF_DESCRIPTION => 'Icon name for UI display',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_DISPLAY_ORDER => 55,
                Prop::PF_GROUP_NAME => 'UI',
            ],
        ];

        return [
            Constants::F_ID => Constants::K_ACTION,
            Constants::F_CLASS_ID => Constants::K_CLASS,
            Constants::F_NAME => 'Action',
            'is_system' => true,
            Constants::F_PROPS => $props,
        ];
    }

    /**
     * Get @event class definition
     *
     * @return array
     */
    public static function getEventClassDefinition(): array
    {
        $props = [
            [
                Prop::PF_KEY => Constants::F_NAME,
                Prop::PF_LABEL => 'Name',
                Prop::PF_DESCRIPTION => 'Event name',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_REQUIRED => true,
                Prop::PF_DISPLAY_ORDER => 1,
            ],
            [
                Prop::PF_KEY => 'description',
                Prop::PF_LABEL => 'Description',
                Prop::PF_DESCRIPTION => 'What triggers this event',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_FIELD_TYPE => 'textarea',
                Prop::PF_DISPLAY_ORDER => 2,
            ],
            [
                Prop::PF_KEY => 'target_class_id',
                Prop::PF_LABEL => 'Target Class',
                Prop::PF_DESCRIPTION => 'Class this event applies to',
                Prop::PF_DATA_TYPE => Constants::DT_RELATION,
                Prop::PF_OBJECT_CLASS_ID => [Constants::K_CLASS],
                Prop::PF_DISPLAY_ORDER => 3,
            ],
            [
                Prop::PF_KEY => 'trigger',
                Prop::PF_LABEL => 'Trigger',
                Prop::PF_DESCRIPTION => 'When this event fires',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_OPTIONS => [
                    'values' => ['before_create', 'after_create', 'before_update', 'after_update', 'before_delete', 'after_delete', 'on_change', 'custom'],
                ],
                Prop::PF_DISPLAY_ORDER => 4,
            ],
            [
                Prop::PF_KEY => 'handler',
                Prop::PF_LABEL => 'Handler',
                Prop::PF_DESCRIPTION => 'Event handler: (scope) => void',
                Prop::PF_DATA_TYPE => Constants::DT_FUNCTION,
                Prop::PF_FIELD_TYPE => 'javascript',
                Prop::PF_REQUIRED => true,
                Prop::PF_DISPLAY_ORDER => 5,
            ],
            [
                Prop::PF_KEY => 'payload_schema',
                Prop::PF_LABEL => 'Payload Schema',
                Prop::PF_DESCRIPTION => 'Event payload structure',
                Prop::PF_DATA_TYPE => Constants::DT_OBJECT,
                Prop::PF_IS_ARRAY => true,
                Prop::PF_OBJECT_CLASS_ID => [Constants::K_PROP],
                Prop::PF_DISPLAY_ORDER => 6,
            ],
            [
                Prop::PF_KEY => 'async',
                Prop::PF_LABEL => 'Async',
                Prop::PF_DESCRIPTION => 'Run handler asynchronously',
                Prop::PF_DATA_TYPE => Constants::DT_BOOLEAN,
                Prop::PF_DEFAULT_VALUE => false,
                Prop::PF_DISPLAY_ORDER => 7,
            ],
            [
                Prop::PF_KEY => 'priority',
                Prop::PF_LABEL => 'Priority',
                Prop::PF_DESCRIPTION => 'Execution order (higher = first)',
                Prop::PF_DATA_TYPE => Constants::DT_INTEGER,
                Prop::PF_DEFAULT_VALUE => 0,
                Prop::PF_DISPLAY_ORDER => 8,
            ],
        ];

        return [
            Constants::F_ID => Constants::K_EVENT,
            Constants::F_CLASS_ID => Constants::K_CLASS,
            Constants::F_NAME => 'Event',
            'is_system' => true,
            Constants::F_PROPS => $props,
        ];
    }

    /**
     * Get @editor class definition
     *
     * @return array
     */
    public static function getEditorClassDefinition(): array
    {
        $props = [
            [
                Prop::PF_KEY => Constants::F_NAME,
                Prop::PF_LABEL => 'Name',
                Prop::PF_DESCRIPTION => 'Editor display name',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_REQUIRED => true,
                Prop::PF_DISPLAY_ORDER => 1,
            ],
            [
                Prop::PF_KEY => 'description',
                Prop::PF_LABEL => 'Description',
                Prop::PF_DESCRIPTION => 'What this editor does',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_FIELD_TYPE => 'textarea',
                Prop::PF_DISPLAY_ORDER => 2,
            ],
            [
                Prop::PF_KEY => 'data_types',
                Prop::PF_LABEL => 'Supported Data Types',
                Prop::PF_DESCRIPTION => 'Which data_types this editor can handle',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_IS_ARRAY => true,
                Prop::PF_OPTIONS => [
                    'values' => [
                        Constants::DT_STRING,
                        Constants::DT_BOOLEAN,
                        Constants::DT_INTEGER,
                        Constants::DT_FLOAT,
                        Constants::DT_DATETIME,
                        Constants::DT_OBJECT,
                        Constants::DT_RELATION,
                        Constants::DT_FUNCTION,
                    ],
                ],
                Prop::PF_REQUIRED => true,
                Prop::PF_DISPLAY_ORDER => 3,
            ],
            [
                Prop::PF_KEY => 'is_default',
                Prop::PF_LABEL => 'Default Editor',
                Prop::PF_DESCRIPTION => 'Default editor for its data types',
                Prop::PF_DATA_TYPE => Constants::DT_BOOLEAN,
                Prop::PF_DEFAULT_VALUE => false,
                Prop::PF_DISPLAY_ORDER => 4,
            ],
            [
                Prop::PF_KEY => 'is_system',
                Prop::PF_LABEL => 'System Editor',
                Prop::PF_DESCRIPTION => 'Protected system editor (cannot be deleted)',
                Prop::PF_DATA_TYPE => Constants::DT_BOOLEAN,
                Prop::PF_READONLY => true,
                Prop::PF_DEFAULT_VALUE => false,
                Prop::PF_DISPLAY_ORDER => 5,
            ],
            [
                Prop::PF_KEY => 'validator',
                Prop::PF_LABEL => 'Validator',
                Prop::PF_DESCRIPTION => 'Built-in validator (e.g. email, url, phone)',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_DISPLAY_ORDER => 6,
            ],
            [
                Prop::PF_KEY => Constants::F_PROPS,
                Prop::PF_LABEL => 'Options Schema',
                Prop::PF_DESCRIPTION => 'Configuration options this editor accepts',
                Prop::PF_DATA_TYPE => Constants::DT_OBJECT,
                Prop::PF_IS_ARRAY => true,
                Prop::PF_OBJECT_CLASS_ID => [Constants::K_PROP],
                Prop::PF_DISPLAY_ORDER => 7,
            ],
            [
                Prop::PF_KEY => 'component',
                Prop::PF_LABEL => 'Component',
                Prop::PF_DESCRIPTION => 'UI component name or path',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_DISPLAY_ORDER => 8,
            ],
            [
                Prop::PF_KEY => 'render',
                Prop::PF_LABEL => 'Render',
                Prop::PF_DESCRIPTION => 'Custom render function: (scope) => html',
                Prop::PF_DATA_TYPE => Constants::DT_FUNCTION,
                Prop::PF_FIELD_TYPE => 'javascript',
                Prop::PF_DISPLAY_ORDER => 9,
            ],
        ];

        return [
            Constants::F_ID => Constants::K_EDITOR,
            Constants::F_CLASS_ID => Constants::K_CLASS,
            Constants::F_NAME => 'Editor',
            'is_system' => true,
            Constants::F_PROPS => $props,
        ];
    }

    /**
     * Get @function class definition
     *
     * @return array
     */
    public static function getFunctionClassDefinition(): array
    {
        $props = [
            [
                Prop::PF_KEY => Constants::F_NAME,
                Prop::PF_LABEL => 'Name',
                Prop::PF_DESCRIPTION => 'Function display name',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_REQUIRED => true,
                Prop::PF_DISPLAY_ORDER => 1,
            ],
            [
                Prop::PF_KEY => 'description',
                Prop::PF_LABEL => 'Description',
                Prop::PF_DESCRIPTION => 'What this function does',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_FIELD_TYPE => 'textarea',
                Prop::PF_DISPLAY_ORDER => 2,
            ],
            [
                Prop::PF_KEY => 'function_type',
                Prop::PF_LABEL => 'Function Type',
                Prop::PF_DESCRIPTION => 'Category of function',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_REQUIRED => true,
                Prop::PF_OPTIONS => [
                    'values' => ['validator', 'transformer', 'computed', 'generator', 'custom'],
                ],
                Prop::PF_DISPLAY_ORDER => 3,
            ],
            [
                Prop::PF_KEY => 'scope',
                Prop::PF_LABEL => 'Scope',
                Prop::PF_DESCRIPTION => 'Which data types this function applies to',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_IS_ARRAY => true,
                Prop::PF_DISPLAY_ORDER => 4,
            ],
            [
                Prop::PF_KEY => 'parameters',
                Prop::PF_LABEL => 'Parameters',
                Prop::PF_DESCRIPTION => 'Function input parameters schema',
                Prop::PF_DATA_TYPE => Constants::DT_OBJECT,
                Prop::PF_IS_ARRAY => true,
                Prop::PF_OBJECT_CLASS_ID => [Constants::K_PROP],
                Prop::PF_DISPLAY_ORDER => 5,
            ],
            [
                Prop::PF_KEY => 'code',
                Prop::PF_LABEL => 'Code',
                Prop::PF_DESCRIPTION => 'JavaScript: (obj, prop, value, params) => result',
                Prop::PF_DATA_TYPE => Constants::DT_FUNCTION,
                Prop::PF_FIELD_TYPE => 'javascript',
                Prop::PF_REQUIRED => true,
                Prop::PF_DISPLAY_ORDER => 6,
            ],
            [
                Prop::PF_KEY => 'is_system',
                Prop::PF_LABEL => 'System',
                Prop::PF_DESCRIPTION => 'Protected system function',
                Prop::PF_DATA_TYPE => Constants::DT_BOOLEAN,
                Prop::PF_READONLY => true,
                Prop::PF_DEFAULT_VALUE => false,
                Prop::PF_DISPLAY_ORDER => 7,
            ],
        ];

        return [
            Constants::F_ID => Constants::K_FUNCTION,
            Constants::F_CLASS_ID => Constants::K_CLASS,
            Constants::F_NAME => 'Function',
            'is_system' => true,
            Constants::F_PROPS => $props,
        ];
    }

    /**
     * Get @provider class definition (abstract base)
     *
     * @return array
     */
    public static function getProviderClassDefinition(): array
    {
        $props = [
            [
                Prop::PF_KEY => Constants::F_NAME,
                Prop::PF_LABEL => 'Name',
                Prop::PF_DESCRIPTION => 'Provider display name',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_REQUIRED => true,
                Prop::PF_DISPLAY_ORDER => 1,
            ],
            [
                Prop::PF_KEY => 'description',
                Prop::PF_LABEL => 'Description',
                Prop::PF_DESCRIPTION => 'What external system this provider connects to',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_FIELD_TYPE => 'textarea',
                Prop::PF_DISPLAY_ORDER => 2,
            ],
            [
                Prop::PF_KEY => 'base_url',
                Prop::PF_LABEL => 'Base URL',
                Prop::PF_DESCRIPTION => 'Base URL for API requests (inherited by child providers via extends_id)',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_FIELD_TYPE => 'url',
                Prop::PF_DISPLAY_ORDER => 3,
            ],
            [
                Prop::PF_KEY => 'auth',
                Prop::PF_LABEL => 'Authentication',
                Prop::PF_DESCRIPTION => 'Auth config: {type: bearer|basic|apikey, token?, username?, password?, header?, key?}',
                Prop::PF_DATA_TYPE => Constants::DT_OBJECT,
                Prop::PF_DISPLAY_ORDER => 4,
            ],
            [
                Prop::PF_KEY => 'id_field',
                Prop::PF_LABEL => 'External ID Field',
                Prop::PF_DESCRIPTION => 'Field name in API response that holds the external ID (stored in object._links)',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_DEFAULT_VALUE => 'id',
                Prop::PF_DISPLAY_ORDER => 5,
            ],
            [
                Prop::PF_KEY => 'write_mode',
                Prop::PF_LABEL => 'Write Mode',
                Prop::PF_DESCRIPTION => 'crud=direct setObject allowed; actions_only=must use @action to modify linked objects',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_OPTIONS => [
                    'values' => ['crud', 'actions_only'],
                ],
                Prop::PF_DEFAULT_VALUE => 'actions_only',
                Prop::PF_DISPLAY_ORDER => 6,
            ],
            [
                Prop::PF_KEY => 'mapping',
                Prop::PF_LABEL => 'Field Mapping',
                Prop::PF_DESCRIPTION => 'Default API field → ES field mapping (overridden per action). e.g. {api_id: id, api_name: name}',
                Prop::PF_DATA_TYPE => Constants::DT_OBJECT,
                Prop::PF_DISPLAY_ORDER => 7,
            ],
            [
                Prop::PF_KEY => 'actions',
                Prop::PF_LABEL => 'Actions',
                Prop::PF_DESCRIPTION => 'Available actions on this provider (get_one, get_list, create_one, update_one, delete_one, + custom)',
                Prop::PF_DATA_TYPE => Constants::DT_RELATION,
                Prop::PF_OBJECT_CLASS_ID => [Constants::K_ACTION],
                Prop::PF_IS_ARRAY => true,
                Prop::PF_DISPLAY_ORDER => 8,
            ],
            [
                Prop::PF_KEY => 'params',
                Prop::PF_LABEL => 'Default Parameters',
                Prop::PF_DESCRIPTION => 'Default query parameters added to every API request',
                Prop::PF_DATA_TYPE => Constants::DT_OBJECT,
                Prop::PF_DISPLAY_ORDER => 9,
            ],
        ];

        return [
            Constants::F_ID => Constants::K_PROVIDER,
            Constants::F_CLASS_ID => Constants::K_CLASS,
            Constants::F_NAME => 'Provider',
            'description' => 'Abstract base for data providers — defines how to connect to an external API. Extend via extends_id to inherit base_url and auth.',
            'is_system' => true,
            'is_abstract' => true,
            Constants::F_PROPS => $props,
        ];
    }

    /**
     * Get crud_provider class definition (extends @provider)
     *
     * @return array
     */
    public static function getCrudProviderClassDefinition(): array
    {
        $props = [
            [
                Prop::PF_KEY => 'get_one',
                Prop::PF_LABEL => 'Get One Endpoint',
                Prop::PF_DESCRIPTION => 'Endpoint path for GET single object, e.g. /vms/{id}',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_DISPLAY_ORDER => 10,
            ],
            [
                Prop::PF_KEY => 'get_list',
                Prop::PF_LABEL => 'Get List Endpoint',
                Prop::PF_DESCRIPTION => 'Endpoint path for GET list, e.g. /vms',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_DISPLAY_ORDER => 11,
            ],
            [
                Prop::PF_KEY => 'create_one',
                Prop::PF_LABEL => 'Create One Endpoint',
                Prop::PF_DESCRIPTION => 'Endpoint path for POST create, e.g. /vms',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_DISPLAY_ORDER => 12,
            ],
            [
                Prop::PF_KEY => 'update_one',
                Prop::PF_LABEL => 'Update One Endpoint',
                Prop::PF_DESCRIPTION => 'Endpoint path for PUT/PATCH update, e.g. /vms/{id}',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_DISPLAY_ORDER => 13,
            ],
            [
                Prop::PF_KEY => 'delete_one',
                Prop::PF_LABEL => 'Delete One Endpoint',
                Prop::PF_DESCRIPTION => 'Endpoint path for DELETE, e.g. /vms/{id}',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_DISPLAY_ORDER => 14,
            ],
            [
                Prop::PF_KEY => 'paginator',
                Prop::PF_LABEL => 'Paginator',
                Prop::PF_DESCRIPTION => 'Pagination config: {page_param, size_param, total_field, data_field}',
                Prop::PF_DATA_TYPE => Constants::DT_OBJECT,
                Prop::PF_DISPLAY_ORDER => 15,
            ],
            [
                Prop::PF_KEY => 'filters',
                Prop::PF_LABEL => 'Filter Params',
                Prop::PF_DESCRIPTION => 'Available filter query parameter names',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_IS_ARRAY => true,
                Prop::PF_DISPLAY_ORDER => 16,
            ],
        ];

        return [
            Constants::F_ID => Constants::K_CRUD_PROVIDER,
            Constants::F_CLASS_ID => Constants::K_CLASS,
            Constants::F_EXTENDS_ID => Constants::K_PROVIDER,
            Constants::F_NAME => 'CRUD Provider',
            'description' => 'Concrete provider template for standard REST CRUD APIs. Inherits base_url and auth from @provider.',
            'is_system' => true,
            Constants::F_PROPS => $props,
        ];
    }

    /**
     * Get seed editor definitions
     *
     * @return array Array of editor objects
     */
    public static function getSeedEditors(): array
    {
        return [
            // String editors
            [
                Constants::F_ID => 'text',
                Constants::F_CLASS_ID => Constants::K_EDITOR,
                Constants::F_NAME => 'Text Input',
                'description' => 'Single line text input',
                'data_types' => [Constants::DT_STRING],
                'is_default' => true,
                'is_system' => true,
                'is_seed' => true,
                Constants::F_PROPS => [
                    ['key' => 'placeholder', 'data_type' => 'string', 'label' => 'Placeholder'],
                    ['key' => 'maxLength', 'data_type' => 'integer', 'label' => 'Max Length'],
                ],
            ],
            [
                Constants::F_ID => 'textarea',
                Constants::F_CLASS_ID => Constants::K_EDITOR,
                Constants::F_NAME => 'Text Area',
                'description' => 'Multi-line text input',
                'data_types' => [Constants::DT_STRING, Constants::DT_FUNCTION],
                'is_default' => false,
                'is_system' => true,
                'is_seed' => true,
                Constants::F_PROPS => [
                    ['key' => 'rows', 'data_type' => 'integer', 'label' => 'Rows', 'default_value' => 3],
                    ['key' => 'maxLength', 'data_type' => 'integer', 'label' => 'Max Length'],
                ],
            ],
            [
                Constants::F_ID => 'code',
                Constants::F_CLASS_ID => Constants::K_EDITOR,
                Constants::F_NAME => 'Code Editor',
                'description' => 'Code editor with syntax highlighting',
                'data_types' => [Constants::DT_STRING, Constants::DT_FUNCTION],
                'is_default' => false,
                'is_system' => true,
                'is_seed' => true,
                Constants::F_PROPS => [
                    ['key' => 'language', 'data_type' => 'string', 'label' => 'Language', 'default_value' => 'json'],
                    ['key' => 'theme', 'data_type' => 'string', 'label' => 'Theme', 'default_value' => 'light'],
                ],
            ],
            [
                Constants::F_ID => 'password',
                Constants::F_CLASS_ID => Constants::K_EDITOR,
                Constants::F_NAME => 'Password',
                'description' => 'Masked password input',
                'data_types' => [Constants::DT_STRING],
                'is_default' => false,
                'is_system' => true,
                'is_seed' => true,
                Constants::F_PROPS => [
                    ['key' => 'masked', 'data_type' => 'boolean', 'label' => 'Masked', 'default_value' => true],
                ],
            ],
            [
                Constants::F_ID => 'email',
                Constants::F_CLASS_ID => Constants::K_EDITOR,
                Constants::F_NAME => 'Email',
                'description' => 'Email input with validation',
                'data_types' => [Constants::DT_STRING],
                'is_default' => false,
                'is_system' => true,
                'is_seed' => true,
                'validator' => 'email',
                Constants::F_PROPS => [
                    ['key' => 'placeholder', 'data_type' => 'string', 'label' => 'Placeholder', 'default_value' => 'user@example.com'],
                ],
            ],
            [
                Constants::F_ID => 'url',
                Constants::F_CLASS_ID => Constants::K_EDITOR,
                Constants::F_NAME => 'URL',
                'description' => 'URL input with validation',
                'data_types' => [Constants::DT_STRING],
                'is_default' => false,
                'is_system' => true,
                'is_seed' => true,
                'validator' => 'url',
                Constants::F_PROPS => [
                    ['key' => 'placeholder', 'data_type' => 'string', 'label' => 'Placeholder', 'default_value' => 'https://...'],
                ],
            ],
            [
                Constants::F_ID => 'phone',
                Constants::F_CLASS_ID => Constants::K_EDITOR,
                Constants::F_NAME => 'Phone',
                'description' => 'Phone number input with validation',
                'data_types' => [Constants::DT_STRING],
                'is_default' => false,
                'is_system' => true,
                'is_seed' => true,
                'validator' => 'phone',
                Constants::F_PROPS => [],
            ],
            [
                Constants::F_ID => 'richtext',
                Constants::F_CLASS_ID => Constants::K_EDITOR,
                Constants::F_NAME => 'Rich Text',
                'description' => 'Rich text WYSIWYG editor',
                'data_types' => [Constants::DT_STRING],
                'is_default' => false,
                'is_system' => true,
                'is_seed' => true,
                Constants::F_PROPS => [
                    ['key' => 'toolbar', 'data_type' => 'string', 'label' => 'Toolbar', 'default_value' => 'standard'],
                ],
            ],
            [
                Constants::F_ID => 'autocomplete',
                Constants::F_CLASS_ID => Constants::K_EDITOR,
                Constants::F_NAME => 'Autocomplete',
                'description' => 'Searchable dropdown with type-ahead',
                'data_types' => [Constants::DT_STRING, Constants::DT_RELATION],
                'is_default' => false,
                'is_system' => true,
                'is_seed' => true,
                Constants::F_PROPS => [],
            ],

            // Function editors
            [
                Constants::F_ID => 'javascript',
                Constants::F_CLASS_ID => Constants::K_EDITOR,
                Constants::F_NAME => 'JavaScript Code',
                'description' => 'JavaScript code editor for function definitions',
                'data_types' => [Constants::DT_FUNCTION],
                'is_default' => true,
                'is_system' => true,
                'is_seed' => true,
                Constants::F_PROPS => [
                    ['key' => 'theme', 'data_type' => 'string', 'label' => 'Theme', 'options' => ['values' => ['light', 'dark', 'monokai']], 'default_value' => 'light'],
                    ['key' => 'lineNumbers', 'data_type' => 'boolean', 'label' => 'Show Line Numbers', 'default_value' => true],
                    ['key' => 'minLines', 'data_type' => 'integer', 'label' => 'Min Lines', 'default_value' => 5],
                    ['key' => 'maxLines', 'data_type' => 'integer', 'label' => 'Max Lines', 'default_value' => 30],
                ],
            ],

            // Number editors
            [
                Constants::F_ID => 'number',
                Constants::F_CLASS_ID => Constants::K_EDITOR,
                Constants::F_NAME => 'Number Input',
                'description' => 'Numeric input with step controls',
                'data_types' => [Constants::DT_INTEGER, Constants::DT_FLOAT],
                'is_default' => true,
                'is_system' => true,
                'is_seed' => true,
                Constants::F_PROPS => [
                    ['key' => 'min', 'data_type' => 'integer', 'label' => 'Minimum'],
                    ['key' => 'max', 'data_type' => 'integer', 'label' => 'Maximum'],
                    ['key' => 'step', 'data_type' => 'integer', 'label' => 'Step', 'default_value' => 1],
                ],
            ],
            [
                Constants::F_ID => 'slider',
                Constants::F_CLASS_ID => Constants::K_EDITOR,
                Constants::F_NAME => 'Slider',
                'description' => 'Slider for numeric ranges',
                'data_types' => [Constants::DT_INTEGER, Constants::DT_FLOAT],
                'is_default' => false,
                'is_system' => true,
                'is_seed' => true,
                Constants::F_PROPS => [
                    ['key' => 'min', 'data_type' => 'integer', 'label' => 'Minimum', 'default_value' => 0],
                    ['key' => 'max', 'data_type' => 'integer', 'label' => 'Maximum', 'default_value' => 100],
                    ['key' => 'step', 'data_type' => 'integer', 'label' => 'Step', 'default_value' => 1],
                ],
            ],
            [
                Constants::F_ID => 'currency',
                Constants::F_CLASS_ID => Constants::K_EDITOR,
                Constants::F_NAME => 'Currency',
                'description' => 'Currency input with formatting',
                'data_types' => [Constants::DT_INTEGER, Constants::DT_FLOAT],
                'is_default' => false,
                'is_system' => true,
                'is_seed' => true,
                Constants::F_PROPS => [
                    ['key' => 'currency', 'data_type' => 'string', 'label' => 'Currency Code', 'default_value' => 'USD'],
                    ['key' => 'decimals', 'data_type' => 'integer', 'label' => 'Decimals', 'default_value' => 2],
                ],
            ],

            // Boolean editors
            [
                Constants::F_ID => 'toggle',
                Constants::F_CLASS_ID => Constants::K_EDITOR,
                Constants::F_NAME => 'Toggle Switch',
                'description' => 'On/off toggle switch',
                'data_types' => [Constants::DT_BOOLEAN],
                'is_default' => true,
                'is_system' => true,
                'is_seed' => true,
                Constants::F_PROPS => [],
            ],
            [
                Constants::F_ID => 'checkbox',
                Constants::F_CLASS_ID => Constants::K_EDITOR,
                Constants::F_NAME => 'Checkbox',
                'description' => 'Checkbox for boolean values',
                'data_types' => [Constants::DT_BOOLEAN],
                'is_default' => false,
                'is_system' => true,
                'is_seed' => true,
                Constants::F_PROPS => [],
            ],

            // Date/time editors (datetime is canonical type, picker controls granularity)
            [
                Constants::F_ID => 'date',
                Constants::F_CLASS_ID => Constants::K_EDITOR,
                Constants::F_NAME => 'Date Picker',
                'description' => 'Date-only selection (stores as datetime with T00:00:00)',
                'data_types' => [Constants::DT_DATETIME],
                'is_default' => false,
                'is_system' => true,
                'is_seed' => true,
                Constants::F_PROPS => [
                    ['key' => 'granularity', 'data_type' => 'string', 'label' => 'Granularity', 'default_value' => 'date'],
                ],
            ],
            [
                Constants::F_ID => 'datetime',
                Constants::F_CLASS_ID => Constants::K_EDITOR,
                Constants::F_NAME => 'DateTime Picker',
                'description' => 'Full date and time selection',
                'data_types' => [Constants::DT_DATETIME],
                'is_default' => true,
                'is_system' => true,
                'is_seed' => true,
                Constants::F_PROPS => [
                    ['key' => 'granularity', 'data_type' => 'string', 'label' => 'Granularity', 'default_value' => 'datetime'],
                ],
            ],
            [
                Constants::F_ID => 'time',
                Constants::F_CLASS_ID => Constants::K_EDITOR,
                Constants::F_NAME => 'Time Picker',
                'description' => 'Time-only selection',
                'data_types' => [Constants::DT_DATETIME],
                'is_default' => false,
                'is_system' => true,
                'is_seed' => true,
                Constants::F_PROPS => [
                    ['key' => 'granularity', 'data_type' => 'string', 'label' => 'Granularity', 'default_value' => 'time'],
                ],
            ],

            // Selector editors
            [
                Constants::F_ID => 'select',
                Constants::F_CLASS_ID => Constants::K_EDITOR,
                Constants::F_NAME => 'Select Dropdown',
                'description' => 'Dropdown selection from options or related objects',
                'data_types' => [Constants::DT_STRING, Constants::DT_INTEGER, Constants::DT_FLOAT, Constants::DT_RELATION],
                'is_default' => false,
                'is_system' => true,
                'is_seed' => true,
                Constants::F_PROPS => [
                    ['key' => 'allowClear', 'data_type' => 'boolean', 'label' => 'Allow Clear', 'default_value' => true],
                ],
            ],
            [
                Constants::F_ID => 'radio',
                Constants::F_CLASS_ID => Constants::K_EDITOR,
                Constants::F_NAME => 'Radio Buttons',
                'description' => 'Radio button group',
                'data_types' => [Constants::DT_STRING, Constants::DT_INTEGER, Constants::DT_FLOAT],
                'is_default' => false,
                'is_system' => true,
                'is_seed' => true,
                Constants::F_PROPS => [
                    ['key' => 'layout', 'data_type' => 'string', 'label' => 'Layout', 'default_value' => 'horizontal'],
                ],
            ],
            [
                Constants::F_ID => 'multiselect',
                Constants::F_CLASS_ID => Constants::K_EDITOR,
                Constants::F_NAME => 'Multi-Select',
                'description' => 'Multiple selection with tags',
                'data_types' => [Constants::DT_STRING, Constants::DT_RELATION],
                'is_default' => false,
                'is_system' => true,
                'is_seed' => true,
                Constants::F_PROPS => [],
            ],

            // Object/composite editors
            [
                Constants::F_ID => 'nested',
                Constants::F_CLASS_ID => Constants::K_EDITOR,
                Constants::F_NAME => 'Nested Editor',
                'description' => 'Class-driven nested property editor for typed objects',
                'data_types' => [Constants::DT_OBJECT],
                'is_default' => true,
                'is_system' => true,
                'is_seed' => true,
                Constants::F_PROPS => [
                    ['key' => 'mode', 'data_type' => 'string', 'label' => 'Mode', 'default_value' => 'nested'],
                ],
            ],
            [
                Constants::F_ID => 'keyvalue',
                Constants::F_CLASS_ID => Constants::K_EDITOR,
                Constants::F_NAME => 'Key-Value Editor',
                'description' => 'Free key-value pair editor for freeform objects',
                'data_types' => [Constants::DT_OBJECT],
                'is_default' => false,
                'is_system' => true,
                'is_seed' => true,
                Constants::F_PROPS => [
                    ['key' => 'mode', 'data_type' => 'string', 'label' => 'Mode', 'default_value' => 'keyvalue'],
                ],
            ],
            [
                Constants::F_ID => 'json',
                Constants::F_CLASS_ID => Constants::K_EDITOR,
                Constants::F_NAME => 'JSON Editor',
                'description' => 'Raw JSON text editor',
                'data_types' => [Constants::DT_OBJECT, Constants::DT_STRING],
                'is_default' => false,
                'is_system' => true,
                'is_seed' => true,
                Constants::F_PROPS => [
                    ['key' => 'rows', 'data_type' => 'integer', 'label' => 'Rows', 'default_value' => 5],
                    ['key' => 'language', 'data_type' => 'string', 'label' => 'Language', 'default_value' => 'json'],
                ],
            ],

            // Relation editors
            [
                Constants::F_ID => 'reference',
                Constants::F_CLASS_ID => Constants::K_EDITOR,
                Constants::F_NAME => 'Reference Picker',
                'description' => 'Single object reference selector',
                'data_types' => [Constants::DT_RELATION],
                'is_default' => true,
                'is_system' => true,
                'is_seed' => true,
                Constants::F_PROPS => [
                    ['key' => 'displayField', 'data_type' => 'string', 'label' => 'Display Field', 'default_value' => 'name'],
                    ['key' => 'allowCreate', 'data_type' => 'boolean', 'label' => 'Allow Create', 'default_value' => false],
                ],
            ],
            [
                Constants::F_ID => 'references',
                Constants::F_CLASS_ID => Constants::K_EDITOR,
                Constants::F_NAME => 'Multi-Reference Picker',
                'description' => 'Multiple object references selector',
                'data_types' => [Constants::DT_RELATION],
                'is_default' => false,
                'is_system' => true,
                'is_seed' => true,
                Constants::F_PROPS => [
                    ['key' => 'displayField', 'data_type' => 'string', 'label' => 'Display Field', 'default_value' => 'name'],
                ],
            ],

            // Special editors
            [
                Constants::F_ID => 'color',
                Constants::F_CLASS_ID => Constants::K_EDITOR,
                Constants::F_NAME => 'Color Picker',
                'description' => 'Color selection',
                'data_types' => [Constants::DT_STRING],
                'is_default' => false,
                'is_system' => true,
                'is_seed' => true,
                Constants::F_PROPS => [
                    ['key' => 'format', 'data_type' => 'string', 'label' => 'Format', 'options' => ['values' => ['hex', 'rgb', 'hsl']], 'default_value' => 'hex'],
                ],
            ],
            [
                Constants::F_ID => 'file',
                Constants::F_CLASS_ID => Constants::K_EDITOR,
                Constants::F_NAME => 'File Upload',
                'description' => 'File upload input',
                'data_types' => [Constants::DT_STRING],
                'is_default' => false,
                'is_system' => true,
                'is_seed' => true,
                Constants::F_PROPS => [
                    ['key' => 'accept', 'data_type' => 'string', 'label' => 'Accept Types'],
                    ['key' => 'maxSize', 'data_type' => 'integer', 'label' => 'Max Size (MB)'],
                ],
            ],
            [
                Constants::F_ID => 'image',
                Constants::F_CLASS_ID => Constants::K_EDITOR,
                Constants::F_NAME => 'Image Upload',
                'description' => 'Image upload with preview',
                'data_types' => [Constants::DT_STRING],
                'is_default' => false,
                'is_system' => true,
                'is_seed' => true,
                Constants::F_PROPS => [
                    ['key' => 'maxWidth', 'data_type' => 'integer', 'label' => 'Max Width'],
                    ['key' => 'maxHeight', 'data_type' => 'integer', 'label' => 'Max Height'],
                    ['key' => 'maxSize', 'data_type' => 'integer', 'label' => 'Max Size (MB)'],
                ],
            ],
        ];
    }
}
