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
            self::getActionClassDefinition(),
            self::getEventClassDefinition(),
            self::getEditorClassDefinition(),
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
            [
                Prop::PF_KEY => Prop::PF_DESCRIPTION,
                Prop::PF_LABEL => 'Description',
                Prop::PF_DESCRIPTION => 'Help text for the field',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_EDITOR => ['type' => 'textarea'],
                Prop::PF_DISPLAY_ORDER => 3,
            ],
            [
                Prop::PF_KEY => Prop::PF_DATA_TYPE,
                Prop::PF_LABEL => 'Data Type',
                Prop::PF_DESCRIPTION => 'Value data type',
                Prop::PF_DATA_TYPE => Constants::DT_ENUM,
                Prop::PF_ENUM_VALUES => [
                    Constants::DT_STRING,
                    Constants::DT_BOOLEAN,
                    Constants::DT_FLOAT,
                    Constants::DT_INTEGER,
                    Constants::DT_OBJECT,
                    Constants::DT_RELATION,
                    Constants::DT_UNIQUE,
                    Constants::DT_FUNCTION,
                ],
                Prop::PF_DEFAULT_VALUE => Constants::DT_STRING,
                Prop::PF_DISPLAY_ORDER => 1,
            ],
            [
                Prop::PF_KEY => Prop::PF_IS_ARRAY,
                Prop::PF_LABEL => 'Is Array',
                Prop::PF_DESCRIPTION => 'Property holds array of values',
                Prop::PF_DATA_TYPE => Constants::DT_BOOLEAN,
                Prop::PF_DEFAULT_VALUE => false,
                Prop::PF_DISPLAY_ORDER => 5,
            ],
            [
                Prop::PF_KEY => Prop::PF_OBJECT_CLASS_ID,
                Prop::PF_LABEL => 'Target Classes',
                Prop::PF_DESCRIPTION => 'Target class(es) for relations/objects (accepts child classes unless strict)',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_IS_ARRAY => true,
                Prop::PF_DISPLAY_ORDER => 6,
            ],
            [
                Prop::PF_KEY => Prop::PF_OBJECT_CLASS_STRICT,
                Prop::PF_LABEL => 'Strict Class',
                Prop::PF_DESCRIPTION => 'Only accept exact class, not child classes',
                Prop::PF_DATA_TYPE => Constants::DT_BOOLEAN,
                Prop::PF_DEFAULT_VALUE => false,
                Prop::PF_DISPLAY_ORDER => 7,
            ],
            [
                Prop::PF_KEY => Prop::PF_ON_ORPHAN,
                Prop::PF_LABEL => 'On Orphan',
                Prop::PF_DESCRIPTION => 'Action when object becomes orphaned',
                Prop::PF_DATA_TYPE => Constants::DT_ENUM,
                Prop::PF_ENUM_VALUES => [Prop::ORPHAN_KEEP, Prop::ORPHAN_DELETE],
                Prop::PF_DEFAULT_VALUE => Prop::ORPHAN_KEEP,
                Prop::PF_DISPLAY_ORDER => 8,
            ],
            [
                Prop::PF_KEY => Prop::PF_OPTIONS,
                Prop::PF_LABEL => 'Options',
                Prop::PF_DESCRIPTION => 'Enum options [{value, label}]',
                Prop::PF_DATA_TYPE => Constants::DT_OBJECT,
                Prop::PF_IS_ARRAY => true,
                Prop::PF_DISPLAY_ORDER => 7,
            ],
            [
                Prop::PF_KEY => Prop::PF_EDITOR,
                Prop::PF_LABEL => 'Editor',
                Prop::PF_DESCRIPTION => 'Editor configuration {type, ...options}',
                Prop::PF_DATA_TYPE => Constants::DT_OBJECT,
                Prop::PF_DEFAULT_VALUE => ['type' => 'text'],
                Prop::PF_DISPLAY_ORDER => 8,
            ],
            [
                Prop::PF_KEY => Prop::PF_VALIDATORS,
                Prop::PF_LABEL => 'Validators',
                Prop::PF_DESCRIPTION => 'Validation rules [{type, ...params}]',
                Prop::PF_DATA_TYPE => Constants::DT_OBJECT,
                Prop::PF_IS_ARRAY => true,
                Prop::PF_DISPLAY_ORDER => 9,
            ],
            [
                Prop::PF_KEY => Prop::PF_ENUM_VALUES,
                Prop::PF_LABEL => 'Enum Values',
                Prop::PF_DESCRIPTION => 'Allowed values for enum type',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_IS_ARRAY => true,
                Prop::PF_DISPLAY_ORDER => 10,
            ],
            [
                Prop::PF_KEY => 'enum_allow_custom',
                Prop::PF_LABEL => 'Allow Custom Values',
                Prop::PF_DESCRIPTION => 'Allow free text input in addition to enum values',
                Prop::PF_DATA_TYPE => Constants::DT_BOOLEAN,
                Prop::PF_DEFAULT_VALUE => false,
                Prop::PF_DISPLAY_ORDER => 10.5,
            ],
            [
                Prop::PF_KEY => Prop::PF_REQUIRED,
                Prop::PF_LABEL => 'Required',
                Prop::PF_DESCRIPTION => 'Field is required',
                Prop::PF_DATA_TYPE => Constants::DT_BOOLEAN,
                Prop::PF_DEFAULT_VALUE => false,
                Prop::PF_DISPLAY_ORDER => 11,
            ],
            [
                Prop::PF_KEY => Prop::PF_READONLY,
                Prop::PF_LABEL => 'Read Only',
                Prop::PF_DESCRIPTION => 'Field cannot be edited',
                Prop::PF_DATA_TYPE => Constants::DT_BOOLEAN,
                Prop::PF_DEFAULT_VALUE => false,
                Prop::PF_DISPLAY_ORDER => 12,
            ],
            [
                Prop::PF_KEY => Prop::PF_DEFAULT_VALUE,
                Prop::PF_LABEL => 'Default Value',
                Prop::PF_DESCRIPTION => 'Default value for new objects',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_DISPLAY_ORDER => 13,
            ],
            [
                Prop::PF_KEY => Prop::PF_DISPLAY_ORDER,
                Prop::PF_LABEL => 'Display Order',
                Prop::PF_DESCRIPTION => 'Order in forms/tables',
                Prop::PF_DATA_TYPE => Constants::DT_INTEGER,
                Prop::PF_DEFAULT_VALUE => 0,
                Prop::PF_DISPLAY_ORDER => 14,
            ],
            [
                Prop::PF_KEY => Prop::PF_GROUP_NAME,
                Prop::PF_LABEL => 'Group Name',
                Prop::PF_DESCRIPTION => 'Form section grouping',
                Prop::PF_DATA_TYPE => Constants::DT_STRING,
                Prop::PF_DISPLAY_ORDER => 15,
            ],
            [
                Prop::PF_KEY => Prop::PF_HIDDEN,
                Prop::PF_LABEL => 'Hidden',
                Prop::PF_DESCRIPTION => 'Hide from default views',
                Prop::PF_DATA_TYPE => Constants::DT_BOOLEAN,
                Prop::PF_DEFAULT_VALUE => false,
                Prop::PF_DISPLAY_ORDER => 16,
            ],
        ];

        return [
            Constants::F_ID => Constants::K_PROP,
            Constants::F_CLASS_ID => Constants::K_CLASS,
            Constants::F_NAME => 'Property',
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

        return [
            Constants::F_ID => Constants::K_CLASS,
            Constants::F_CLASS_ID => Constants::K_CLASS,
            Constants::F_NAME => 'Class',
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
                Prop::PF_EDITOR => ['type' => 'textarea'],
                Prop::PF_DISPLAY_ORDER => 2,
            ],
            [
                Prop::PF_KEY => 'data_types',
                Prop::PF_LABEL => 'Supported Data Types',
                Prop::PF_DESCRIPTION => 'Which data_types this editor can handle',
                Prop::PF_DATA_TYPE => Constants::DT_ENUM,
                Prop::PF_IS_ARRAY => true,
                Prop::PF_ENUM_VALUES => [
                    Constants::DT_STRING,
                    Constants::DT_BOOLEAN,
                    Constants::DT_FLOAT,
                    Constants::DT_INTEGER,
                    Constants::DT_OBJECT,
                    Constants::DT_RELATION,
                    Constants::DT_UNIQUE,
                    Constants::DT_FUNCTION,
                ],
                Prop::PF_REQUIRED => true,
                Prop::PF_DISPLAY_ORDER => 3,
            ],
            [
                Prop::PF_KEY => 'is_default',
                Prop::PF_LABEL => 'Default Editor',
                Prop::PF_DESCRIPTION => 'Is this the default editor for its data_types',
                Prop::PF_DATA_TYPE => Constants::DT_BOOLEAN,
                Prop::PF_DEFAULT_VALUE => false,
                Prop::PF_DISPLAY_ORDER => 4,
            ],
            [
                Prop::PF_KEY => Constants::F_PROPS,
                Prop::PF_LABEL => 'Options Schema',
                Prop::PF_DESCRIPTION => 'Configuration options this editor accepts',
                Prop::PF_DATA_TYPE => Constants::DT_OBJECT,
                Prop::PF_IS_ARRAY => true,
                Prop::PF_OBJECT_CLASS_ID => Constants::K_PROP,
                Prop::PF_DISPLAY_ORDER => 5,
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
                'data_types' => [Constants::DT_STRING],
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
                'data_types' => [Constants::DT_STRING],
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
                    ['key' => 'theme', 'data_type' => 'string', 'label' => 'Theme', 'enum_values' => ['light', 'dark', 'monokai'], 'default_value' => 'light'],
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

            // Date/time editors
            [
                Constants::F_ID => 'date',
                Constants::F_CLASS_ID => Constants::K_EDITOR,
                Constants::F_NAME => 'Date Picker',
                'description' => 'Date selection',
                'data_types' => [Constants::DT_STRING],
                'is_default' => false,
                'is_system' => true,
                'is_seed' => true,
                Constants::F_PROPS => [
                    ['key' => 'format', 'data_type' => 'string', 'label' => 'Format', 'default_value' => 'YYYY-MM-DD'],
                ],
            ],
            [
                Constants::F_ID => 'datetime',
                Constants::F_CLASS_ID => Constants::K_EDITOR,
                Constants::F_NAME => 'DateTime Picker',
                'description' => 'Date and time selection',
                'data_types' => [Constants::DT_STRING],
                'is_default' => false,
                'is_system' => true,
                'is_seed' => true,
                Constants::F_PROPS => [
                    ['key' => 'format', 'data_type' => 'string', 'label' => 'Format', 'default_value' => 'YYYY-MM-DD HH:mm'],
                ],
            ],

            // Select editors (for strings with predefined options)
            [
                Constants::F_ID => 'select',
                Constants::F_CLASS_ID => Constants::K_EDITOR,
                Constants::F_NAME => 'Select Dropdown',
                'description' => 'Dropdown selection',
                'data_types' => [Constants::DT_STRING],
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
                'data_types' => [Constants::DT_STRING],
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
                'data_types' => [Constants::DT_STRING],
                'is_default' => false,
                'is_system' => true,
                'is_seed' => true,
                Constants::F_PROPS => [],
            ],

            // Object editors
            [
                Constants::F_ID => 'json',
                Constants::F_CLASS_ID => Constants::K_EDITOR,
                Constants::F_NAME => 'JSON Editor',
                'description' => 'JSON text editor',
                'data_types' => [Constants::DT_OBJECT],
                'is_default' => true,
                'is_system' => true,
                'is_seed' => true,
                Constants::F_PROPS => [
                    ['key' => 'rows', 'data_type' => 'integer', 'label' => 'Rows', 'default_value' => 5],
                ],
            ],
            [
                Constants::F_ID => 'keyvalue',
                Constants::F_CLASS_ID => Constants::K_EDITOR,
                Constants::F_NAME => 'Key-Value Editor',
                'description' => 'Key-value pair editor',
                'data_types' => [Constants::DT_OBJECT],
                'is_default' => false,
                'is_system' => true,
                'is_seed' => true,
                Constants::F_PROPS => [],
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
                    ['key' => 'format', 'data_type' => 'string', 'label' => 'Format', 'enum_values' => ['hex', 'rgb', 'hsl'], 'default_value' => 'hex'],
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
