<?php
/**
 * Genesis - ElementStore Initialization System
 *
 * Handles seeding and verification of the ElementStore base data.
 * Uses the API endpoints to initialize all system classes and seed objects.
 *
 * GENESIS DATA STRUCTURE:
 * - System classes: @class, @prop, @action, @event, @editor, @function, @provider, crud_provider
 * - Seed editors: text, textarea, number, toggle, select, date, json, reference, javascript, etc.
 * - Seed functions: validators, generators, transformers
 *
 * PROPERTY FORMAT (consistent across all classes):
 * {
 *   key: string,           // Field name (required)
 *   label: string,         // Display label
 *   description: string,   // Help text
 *   data_type: enum,       // string|boolean|float|integer|object|relation|unique|function
 *   is_array: boolean,     // Multiple values
 *   required: boolean,     // Required field
 *   readonly: boolean,     // Cannot edit
 *   hidden: boolean,       // Hide from UI
 *   default_value: any,    // Default for new objects
 *   display_order: number, // Sort order in forms
 *   group_name: string,    // Form section grouping
 *
 *   // Type-specific options:
 *   options: object,       // Type-specific options (values, min, max, pattern, etc.)
 *   object_class_id: string[], // For object/relation types (array of class IDs)
 *   object_class_strict: boolean,
 *   on_orphan: 'keep'|'delete',
 *   field_type: string,   // Relation to @editor instance (e.g. 'text', 'email', 'select')
 * }
 *
 * @package ElementStore
 */

namespace ElementStore\Genesis;

class Genesis
{
    private string $apiBaseUrl;
    private array $results = [];

    /**
     * @param string $apiBaseUrl Base URL for ElementStore API (e.g., http://localhost/elementStore)
     */
    public function __construct(string $apiBaseUrl)
    {
        $this->apiBaseUrl = rtrim($apiBaseUrl, '/');
    }

    /**
     * Initialize all genesis data via API
     *
     * @param bool $force Force re-initialization even if data exists
     * @return array Results of initialization
     */
    public function init(bool $force = false): array
    {
        $this->results = [
            'started_at' => date('c'),
            'classes' => [],
            'editors' => [],
            'functions' => [],
            'errors' => [],
            'skipped' => [],
        ];

        // Step 1: Verify API is accessible
        $health = $this->apiGet('/health');
        if (!$health || ($health['status'] ?? null) !== 'ok') {
            $this->results['errors'][] = 'API not accessible at ' . $this->apiBaseUrl;
            return $this->results;
        }
        $this->results['api_version'] = $health['version'] ?? 'unknown';

        // Step 2: Initialize system classes
        $this->initSystemClasses($force);

        // Step 3: Initialize seed editors
        $this->initSeedEditors($force);

        // Step 4: Initialize seed functions
        $this->initSeedFunctions($force);

        $this->results['completed_at'] = date('c');
        $this->results['success'] = empty($this->results['errors']);

        return $this->results;
    }

    /**
     * Verify all genesis data exists
     *
     * @return array Verification results
     */
    public function verify(): array
    {
        $results = [
            'verified_at' => date('c'),
            'classes' => [],
            'editors' => [],
            'missing' => [],
            'valid' => true,
        ];

        // Verify system classes
        $expectedClasses = ['@class', '@prop', '@action', '@event', '@editor', '@function', '@provider'];
        foreach ($expectedClasses as $classId) {
            $class = $this->apiGet("/class/{$classId}");
            if ($class && !isset($class['error'])) {
                $results['classes'][$classId] = [
                    'exists' => true,
                    'name' => $class['name'] ?? $classId,
                    'props_count' => count($class['props'] ?? []),
                ];
            } else {
                $results['classes'][$classId] = ['exists' => false];
                $results['missing'][] = "class:{$classId}";
                $results['valid'] = false;
            }
        }

        // Verify seed editors
        $editors = $this->apiGet('/store/@editor');
        if (is_array($editors)) {
            $results['editors']['count'] = count($editors);
            $results['editors']['ids'] = array_column($editors, 'id');

            // Check for required seed editors
            $requiredEditors = ['text', 'textarea', 'number', 'toggle', 'select', 'date', 'json', 'reference', 'javascript'];
            foreach ($requiredEditors as $editorId) {
                if (!in_array($editorId, $results['editors']['ids'])) {
                    $results['missing'][] = "editor:{$editorId}";
                    $results['valid'] = false;
                }
            }
        } else {
            $results['editors'] = ['error' => 'Could not fetch editors'];
            $results['valid'] = false;
        }

        return $results;
    }

    /**
     * Reset all data and reinitialize
     *
     * @return array Reset results
     */
    public function reset(): array
    {
        // Call reset endpoint
        $resetResult = $this->apiPost('/reset', []);

        // Then initialize
        $initResult = $this->init(true);

        return [
            'reset' => $resetResult,
            'init' => $initResult,
        ];
    }

    /**
     * Get all genesis data as exportable JSON
     *
     * @return array
     */
    public function getGenesisData(): array
    {
        return [
            'version' => '2.0.0',
            'generated_at' => date('c'),
            'classes' => $this->getSystemClassDefinitions(),
            'editors' => $this->getSeedEditorDefinitions(),
            'functions' => $this->getSeedFunctionDefinitions(),
        ];
    }

    /**
     * Initialize system classes
     */
    private function initSystemClasses(bool $force): void
    {
        $classes = $this->getSystemClassDefinitions();

        foreach ($classes as $classDef) {
            $classId = $classDef['id'];

            // Check if exists
            if (!$force) {
                $existing = $this->apiGet("/class/{$classId}");
                if ($existing && !isset($existing['error'])) {
                    $this->results['skipped'][] = "class:{$classId}";
                    continue;
                }
            }

            // Create/update via API
            $result = $this->apiPost('/class', $classDef);
            if ($result && !isset($result['error'])) {
                $this->results['classes'][$classId] = 'created';
            } else {
                $this->results['errors'][] = "Failed to create class {$classId}: " . json_encode($result);
            }
        }
    }

    /**
     * Initialize seed editors
     */
    private function initSeedEditors(bool $force): void
    {
        $editors = $this->getSeedEditorDefinitions();

        foreach ($editors as $editorDef) {
            $editorId = $editorDef['id'];

            // Check if exists
            if (!$force) {
                $existing = $this->apiGet("/store/@editor/{$editorId}");
                if ($existing && !isset($existing['error'])) {
                    $this->results['skipped'][] = "editor:{$editorId}";
                    continue;
                }
            }

            // Create/update via API with custom ID support
            $result = $this->apiPost('/store/@editor', $editorDef, ['X-Allow-Custom-Ids' => 'true']);
            if ($result && !isset($result['error'])) {
                $this->results['editors'][$editorId] = 'created';
            } else {
                $this->results['errors'][] = "Failed to create editor {$editorId}: " . json_encode($result);
            }
        }
    }

    /**
     * Initialize seed functions (validators, generators, transformers)
     */
    private function initSeedFunctions(bool $force): void
    {
        $functions = $this->getSeedFunctionDefinitions();

        foreach ($functions as $funcDef) {
            $funcId = $funcDef['id'];

            // Check if exists
            if (!$force) {
                $existing = $this->apiGet("/store/@function/{$funcId}");
                if ($existing && !isset($existing['error'])) {
                    $this->results['skipped'][] = "function:{$funcId}";
                    continue;
                }
            }

            // Create/update via API with custom ID support
            $result = $this->apiPost('/store/@function', $funcDef, ['X-Allow-Custom-Ids' => 'true']);
            if ($result && !isset($result['error'])) {
                $this->results['functions'][$funcId] = 'created';
            } else {
                $this->results['errors'][] = "Failed to create function {$funcId}: " . json_encode($result);
            }
        }
    }

    /**
     * Get system class definitions
     *
     * PROPERTY FORMAT:
     * All props use consistent format with only relevant fields:
     * - key (required), label, description, data_type
     * - Type-specific: options, object_class_id, is_array, field_type
     * - Behavior: required, readonly, hidden, default_value, display_order, group_name
     * - Functions: computed, visible_if, enabled_if, options_fn, validate_fn, transform, on_change
     */
    private function getSystemClassDefinitions(): array
    {
        return [
            // =========================================================================
            // @prop - Property Definition Schema
            // Defines what a property looks like and its behavior
            // NEW FIELD ORDER: data_type first, then key, then conditional fields
            // =========================================================================
            [
                'id' => '@prop',
                'class_id' => '@class',
                'name' => 'Property',
                'description' => 'Defines a property within a class, including type, validation, and UI behavior',
                'is_system' => true,
                'props' => [
                    // === Data Type (FIRST - drives conditional display of other fields) ===
                    ['key' => 'data_type', 'label' => 'Data Type', 'description' => 'Type of value this property holds', 'data_type' => 'string', 'options' => ['type' => 'string_options', 'values' => ['string', 'boolean', 'float', 'integer', 'object', 'relation', 'unique', 'function']], 'default_value' => 'string', 'required' => true, 'display_order' => 1, 'group_name' => 'Type'],
                    ['key' => 'is_array', 'label' => 'Is Array', 'description' => 'Property holds multiple values (any type can be array)', 'data_type' => 'boolean', 'default_value' => false, 'display_order' => 2, 'group_name' => 'Type'],

                    // === Core Identity ===
                    ['key' => 'key', 'label' => 'Key', 'description' => 'Property key (field name in data)', 'data_type' => 'string', 'required' => true, 'display_order' => 10, 'group_name' => 'Core'],
                    ['key' => 'label', 'label' => 'Label', 'description' => 'Display label in UI', 'data_type' => 'string', 'display_order' => 11, 'group_name' => 'Core'],
                    ['key' => 'description', 'label' => 'Description', 'description' => 'Help text shown to users', 'data_type' => 'string', 'editor' => 'textarea', 'display_order' => 12, 'group_name' => 'Core'],

                    // === Type-Specific Options (flexible object that varies by data_type) ===
                    ['key' => 'options', 'label' => 'Type Options', 'description' => 'Type-specific options (varies by data_type). Always has "type" field.', 'data_type' => 'object', 'display_order' => 20, 'group_name' => 'Options'],

                    // === Relation/Object Options (shown for object/relation types) ===
                    ['key' => 'object_class_id', 'label' => 'Target Classes', 'description' => 'Class IDs for relations/embedded objects (multiple allowed)', 'data_type' => 'string', 'is_array' => true, 'display_order' => 30, 'group_name' => 'Relation'],
                    ['key' => 'object_class_strict', 'label' => 'Strict Class', 'description' => 'Only accept exact class, not child classes', 'data_type' => 'boolean', 'default_value' => false, 'display_order' => 31, 'group_name' => 'Relation'],
                    ['key' => 'on_orphan', 'label' => 'On Orphan', 'description' => 'Action when referenced object is deleted', 'data_type' => 'string', 'options' => ['type' => 'string_options', 'values' => ['keep', 'delete', 'nullify']], 'default_value' => 'keep', 'display_order' => 32, 'group_name' => 'Relation'],

                    // === UI Configuration ===
                    ['key' => 'editor', 'label' => 'Editor', 'description' => 'UI editor configuration {type, ...options}', 'data_type' => 'relation', 'object_class_id' => ['@editor'], 'display_order' => 40, 'group_name' => 'UI'],
                    ['key' => 'display_order', 'label' => 'Display Order', 'description' => 'Sort order in forms (lower = first)', 'data_type' => 'integer', 'default_value' => 0, 'display_order' => 41, 'group_name' => 'UI'],
                    ['key' => 'group_name', 'label' => 'Group', 'description' => 'Form section grouping', 'data_type' => 'string', 'display_order' => 42, 'group_name' => 'UI'],
                    ['key' => 'hidden', 'label' => 'Hidden', 'description' => 'Hide from default UI views', 'data_type' => 'boolean', 'default_value' => false, 'display_order' => 43, 'group_name' => 'UI'],

                    // === Validation ===
                    ['key' => 'required', 'label' => 'Required', 'description' => 'Field must have a value', 'data_type' => 'boolean', 'default_value' => false, 'display_order' => 50, 'group_name' => 'Validation'],
                    ['key' => 'readonly', 'label' => 'Read Only', 'description' => 'Field cannot be edited after creation', 'data_type' => 'boolean', 'default_value' => false, 'display_order' => 51, 'group_name' => 'Validation'],
                    ['key' => 'validators', 'label' => 'Validators', 'description' => 'Validation rules [{type, ...params}]', 'data_type' => 'relation', 'object_class_id' => ['@function'], 'is_array' => true, 'display_order' => 52, 'group_name' => 'Validation'],
                    ['key' => 'default_value', 'label' => 'Default Value', 'description' => 'Default value for new objects', 'data_type' => 'string', 'display_order' => 53, 'group_name' => 'Validation'],

                    // === Security ===
                    ['key' => 'server_only', 'label' => 'Server Only', 'description' => 'Property is stripped from API responses (backend-only)', 'data_type' => 'boolean', 'default_value' => false, 'display_order' => 60, 'group_name' => 'Security'],
                    ['key' => 'create_only', 'label' => 'Create Only', 'description' => 'Only writable when creating new objects (readonly after first save)', 'data_type' => 'boolean', 'default_value' => false, 'display_order' => 61, 'group_name' => 'Security'],
                ],
            ],

            // =========================================================================
            // @class - Class Definition Schema
            // Defines what a class looks like (schema of schemas)
            // =========================================================================
            [
                'id' => '@class',
                'class_id' => '@class',
                'name' => 'Class',
                'description' => 'Defines a data class with its properties and behaviors',
                'is_system' => true,
                'props' => [
                    ['key' => 'name', 'label' => 'Name', 'description' => 'Display name of the class', 'data_type' => 'string', 'required' => true, 'display_order' => 1],
                    ['key' => 'description', 'label' => 'Description', 'description' => 'What this class represents', 'data_type' => 'string', 'editor' => 'textarea', 'display_order' => 2],
                    ['key' => 'extends_id', 'label' => 'Extends', 'description' => 'Parent class for inheritance', 'data_type' => 'string', 'object_class_id' => ['@class'], 'create_only' => true, 'display_order' => 3],
                    ['key' => 'props', 'label' => 'Properties', 'description' => 'Property definitions for this class', 'data_type' => 'object', 'is_array' => true, 'object_class_id' => ['@prop'], 'display_order' => 4],
                    ['key' => 'table_name', 'label' => 'Table Name', 'description' => 'Custom table/collection name for storage', 'data_type' => 'string', 'display_order' => 5, 'group_name' => 'Advanced'],
                    ['key' => 'is_system', 'label' => 'System Class', 'description' => 'Protected system class (cannot be deleted)', 'data_type' => 'boolean', 'readonly' => true, 'default_value' => false, 'display_order' => 6, 'group_name' => 'Advanced'],
                    ['key' => 'is_abstract', 'label' => 'Abstract', 'description' => 'Cannot create instances directly (only via child classes)', 'data_type' => 'boolean', 'default_value' => false, 'display_order' => 7, 'group_name' => 'Advanced'],
                    ['key' => 'providers', 'label' => 'Providers', 'description' => 'Data providers for external API integration', 'data_type' => 'relation', 'is_array' => true, 'object_class_id' => ['@provider'], 'display_order' => 8, 'group_name' => 'Advanced'],
                ],
            ],

            // =========================================================================
            // @action - Action Definition Schema
            // Defines executable actions/methods on classes
            // =========================================================================
            [
                'id' => '@action',
                'class_id' => '@class',
                'name' => 'Action',
                'description' => 'Defines an executable action that can be triggered on objects',
                'is_system' => true,
                'props' => [
                    ['key' => 'name', 'label' => 'Name', 'description' => 'Action display name', 'data_type' => 'string', 'required' => true, 'display_order' => 1],
                    ['key' => 'description', 'label' => 'Description', 'description' => 'What this action does', 'data_type' => 'string', 'editor' => 'textarea', 'display_order' => 2],
                    ['key' => 'target_class_id', 'label' => 'Target Class', 'description' => 'Class this action applies to', 'data_type' => 'relation', 'object_class_id' => ['@class'], 'display_order' => 3],
                    ['key' => 'handler', 'label' => 'Handler', 'description' => 'Action implementation: (scope) => result', 'data_type' => 'function', 'editor' => 'javascript', 'required' => true, 'display_order' => 4],
                    ['key' => 'params', 'label' => 'Parameters', 'description' => 'Action input parameters', 'data_type' => 'object', 'is_array' => true, 'object_class_id' => ['@prop'], 'display_order' => 5],
                    ['key' => 'returns', 'label' => 'Returns', 'description' => 'Return type description', 'data_type' => 'object', 'object_class_id' => ['@prop'], 'display_order' => 6],
                    ['key' => 'requires_selection', 'label' => 'Requires Selection', 'description' => 'Action requires selected object(s)', 'data_type' => 'boolean', 'default_value' => true, 'display_order' => 7],
                    ['key' => 'bulk', 'label' => 'Bulk Action', 'description' => 'Can apply to multiple objects', 'data_type' => 'boolean', 'default_value' => false, 'display_order' => 8],
                    ['key' => 'confirm', 'label' => 'Confirm', 'description' => 'Confirmation message (empty = no confirm)', 'data_type' => 'string', 'display_order' => 9],
                    ['key' => 'icon', 'label' => 'Icon', 'description' => 'Icon name for UI', 'data_type' => 'string', 'display_order' => 10],
                ],
            ],

            // =========================================================================
            // @event - Event Definition Schema
            // Defines events that can be subscribed to
            // =========================================================================
            [
                'id' => '@event',
                'class_id' => '@class',
                'name' => 'Event',
                'description' => 'Defines an event that can be subscribed to and triggered',
                'is_system' => true,
                'props' => [
                    ['key' => 'name', 'label' => 'Name', 'description' => 'Event name', 'data_type' => 'string', 'required' => true, 'display_order' => 1],
                    ['key' => 'description', 'label' => 'Description', 'description' => 'What triggers this event', 'data_type' => 'string', 'editor' => 'textarea', 'display_order' => 2],
                    ['key' => 'target_class_id', 'label' => 'Target Class', 'description' => 'Class this event applies to', 'data_type' => 'relation', 'object_class_id' => ['@class'], 'display_order' => 3],
                    ['key' => 'trigger', 'label' => 'Trigger', 'description' => 'When this event fires', 'data_type' => 'string', 'options' => ['type' => 'string_options', 'values' => ['before_create', 'after_create', 'before_update', 'after_update', 'before_delete', 'after_delete', 'on_change', 'custom']], 'display_order' => 4],
                    ['key' => 'handler', 'label' => 'Handler', 'description' => 'Event handler: (scope) => void', 'data_type' => 'function', 'editor' => 'javascript', 'required' => true, 'display_order' => 5],
                    ['key' => 'payload_schema', 'label' => 'Payload Schema', 'description' => 'Event payload structure', 'data_type' => 'object', 'is_array' => true, 'object_class_id' => ['@prop'], 'display_order' => 6],
                    ['key' => 'async', 'label' => 'Async', 'description' => 'Run handler asynchronously', 'data_type' => 'boolean', 'default_value' => false, 'display_order' => 7],
                    ['key' => 'priority', 'label' => 'Priority', 'description' => 'Execution order (higher = first)', 'data_type' => 'integer', 'default_value' => 0, 'display_order' => 8],
                ],
            ],

            // =========================================================================
            // @editor - Editor Definition Schema
            // Defines UI editor components for properties
            // =========================================================================
            [
                'id' => '@editor',
                'class_id' => '@class',
                'name' => 'Editor',
                'description' => 'Defines a UI editor component for editing property values',
                'is_system' => true,
                'props' => [
                    ['key' => 'name', 'label' => 'Name', 'description' => 'Editor display name', 'data_type' => 'string', 'required' => true, 'display_order' => 1],
                    ['key' => 'description', 'label' => 'Description', 'description' => 'What this editor is for', 'data_type' => 'string', 'editor' => 'textarea', 'display_order' => 2],
                    ['key' => 'data_types', 'label' => 'Data Types', 'description' => 'Supported data types', 'data_type' => 'string', 'is_array' => true, 'options' => ['type' => 'string_options', 'values' => ['string', 'boolean', 'float', 'integer', 'object', 'relation', 'unique', 'function']], 'required' => true, 'display_order' => 3],
                    ['key' => 'is_default', 'label' => 'Default', 'description' => 'Default editor for its data types', 'data_type' => 'boolean', 'default_value' => false, 'display_order' => 4],
                    ['key' => 'props', 'label' => 'Options', 'description' => 'Configuration options this editor accepts', 'data_type' => 'object', 'is_array' => true, 'object_class_id' => ['@prop'], 'display_order' => 5],
                    ['key' => 'component', 'label' => 'Component', 'description' => 'UI component name/path', 'data_type' => 'string', 'display_order' => 6],
                    ['key' => 'render', 'label' => 'Render', 'description' => 'Custom render function: (scope) => html', 'data_type' => 'function', 'editor' => 'javascript', 'display_order' => 7],
                ],
            ],

            // =========================================================================
            // @function - Function Definition Schema
            // Defines reusable functions for validators, transformers, computed fields
            // =========================================================================
            [
                'id' => '@function',
                'class_id' => '@class',
                'name' => 'Function',
                'description' => 'Defines a reusable function for validators, transformers, generators, or computed fields',
                'is_system' => true,
                'props' => [
                    ['key' => 'name', 'label' => 'Name', 'description' => 'Function display name', 'data_type' => 'string', 'required' => true, 'display_order' => 1],
                    ['key' => 'description', 'label' => 'Description', 'description' => 'What this function does', 'data_type' => 'string', 'editor' => 'textarea', 'display_order' => 2],
                    ['key' => 'function_type', 'label' => 'Function Type', 'description' => 'Category of function', 'data_type' => 'string', 'options' => ['type' => 'string_options', 'values' => ['validator', 'transformer', 'computed', 'generator', 'custom']], 'required' => true, 'display_order' => 3],
                    ['key' => 'parameters', 'label' => 'Parameters', 'description' => 'Function input parameters schema', 'data_type' => 'object', 'is_array' => true, 'object_class_id' => ['@prop'], 'display_order' => 4],
                    ['key' => 'code', 'label' => 'Code', 'description' => 'JavaScript function code: (obj, prop, value, params) => result', 'data_type' => 'function', 'editor' => 'javascript', 'required' => true, 'display_order' => 5],
                    ['key' => 'scope', 'label' => 'Scope', 'description' => 'Which data types this function applies to', 'data_type' => 'string', 'is_array' => true, 'display_order' => 6],
                    ['key' => 'is_system', 'label' => 'System Function', 'description' => 'Protected system function', 'data_type' => 'boolean', 'readonly' => true, 'default_value' => false, 'display_order' => 7],
                ],
            ],

            // =========================================================================
            // @provider - Provider Definition Schema (Abstract Base)
            // Defines how a class fetches/saves data via external APIs
            // =========================================================================
            [
                'id' => '@provider',
                'class_id' => '@class',
                'name' => 'Provider',
                'description' => 'Abstract base for data providers — defines how to fetch/save data via external APIs',
                'is_system' => true,
                'is_abstract' => true,
                'props' => [
                    ['key' => 'name', 'label' => 'Name', 'description' => 'Provider display name', 'data_type' => 'string', 'required' => true, 'display_order' => 1],
                    ['key' => 'description', 'label' => 'Description', 'description' => 'What this provider connects to', 'data_type' => 'string', 'editor' => 'textarea', 'display_order' => 2],
                    ['key' => 'provider_type', 'label' => 'Provider Type', 'description' => 'Type of provider (crud, graphql, etc.)', 'data_type' => 'string', 'display_order' => 3],
                    ['key' => 'base_url', 'label' => 'Base URL', 'description' => 'Base URL for API requests', 'data_type' => 'string', 'display_order' => 4],
                    ['key' => 'auth', 'label' => 'Authentication', 'description' => 'Authentication configuration', 'data_type' => 'object', 'display_order' => 5],
                    ['key' => 'params', 'label' => 'Default Parameters', 'description' => 'Default query parameters sent with every request', 'data_type' => 'object', 'display_order' => 6],
                ],
            ],

            // =========================================================================
            // crud_provider - CRUD Provider (extends @provider)
            // Defines CRUD URLs, pagination, filters, and field mapping
            // =========================================================================
            [
                'id' => 'crud_provider',
                'class_id' => '@class',
                'extends_id' => '@provider',
                'name' => 'CRUD Provider',
                'description' => 'Provider for standard CRUD operations — defines URLs, pagination, filters, and field mapping for external APIs',
                'is_system' => true,
                'props' => [
                    ['key' => 'get_one', 'label' => 'Get One', 'description' => 'URL pattern for fetching one object', 'data_type' => 'string', 'display_order' => 10],
                    ['key' => 'get_list', 'label' => 'Get List', 'description' => 'URL pattern for listing objects', 'data_type' => 'string', 'display_order' => 11],
                    ['key' => 'create_one', 'label' => 'Create One', 'description' => 'URL pattern for creating an object', 'data_type' => 'string', 'display_order' => 12],
                    ['key' => 'update_one', 'label' => 'Update One', 'description' => 'URL pattern for updating an object', 'data_type' => 'string', 'display_order' => 13],
                    ['key' => 'delete_one', 'label' => 'Delete One', 'description' => 'URL pattern for deleting an object', 'data_type' => 'string', 'display_order' => 14],
                    ['key' => 'paginator', 'label' => 'Paginator', 'description' => 'Pagination configuration', 'data_type' => 'object', 'display_order' => 15],
                    ['key' => 'filters', 'label' => 'Filters', 'description' => 'Available filter parameter names', 'data_type' => 'string', 'is_array' => true, 'display_order' => 16],
                    ['key' => 'mapping', 'label' => 'Field Mapping', 'description' => 'Field mapping: ES_key → API_field (string) or @function (transform)', 'data_type' => 'object', 'display_order' => 17],
                ],
            ],
        ];
    }

    /**
     * Get seed editor definitions
     */
    private function getSeedEditorDefinitions(): array
    {
        return [
            // === String Editors ===
            [
                'id' => 'text',
                'class_id' => '@editor',
                'name' => 'Text Input',
                'description' => 'Single line text input',
                'data_types' => ['string'],
                'is_default' => true,
                'is_system' => true,
                'props' => [
                    ['key' => 'placeholder', 'label' => 'Placeholder', 'data_type' => 'string'],
                    ['key' => 'maxLength', 'label' => 'Max Length', 'data_type' => 'integer'],
                    ['key' => 'prefix', 'label' => 'Prefix', 'data_type' => 'string'],
                    ['key' => 'suffix', 'label' => 'Suffix', 'data_type' => 'string'],
                ],
            ],
            [
                'id' => 'textarea',
                'class_id' => '@editor',
                'name' => 'Text Area',
                'description' => 'Multi-line text input',
                'data_types' => ['string'],
                'is_default' => false,
                'is_system' => true,
                'props' => [
                    ['key' => 'rows', 'label' => 'Rows', 'data_type' => 'integer', 'default_value' => 3],
                    ['key' => 'maxLength', 'label' => 'Max Length', 'data_type' => 'integer'],
                    ['key' => 'placeholder', 'label' => 'Placeholder', 'data_type' => 'string'],
                ],
            ],
            [
                'id' => 'code',
                'class_id' => '@editor',
                'name' => 'Code Editor',
                'description' => 'Code editor with syntax highlighting',
                'data_types' => ['string'],
                'is_default' => false,
                'is_system' => true,
                'props' => [
                    ['key' => 'language', 'label' => 'Language', 'data_type' => 'string', 'default_value' => 'json'],
                    ['key' => 'theme', 'label' => 'Theme', 'data_type' => 'string', 'options' => ['type' => 'string_options', 'values' => ['light', 'dark', 'monokai']], 'default_value' => 'light'],
                    ['key' => 'lineNumbers', 'label' => 'Line Numbers', 'data_type' => 'boolean', 'default_value' => true],
                ],
            ],
            [
                'id' => 'password',
                'class_id' => '@editor',
                'name' => 'Password',
                'description' => 'Masked password input',
                'data_types' => ['string'],
                'is_default' => false,
                'is_system' => true,
                'props' => [
                    ['key' => 'showToggle', 'label' => 'Show Toggle', 'data_type' => 'boolean', 'default_value' => true],
                ],
            ],
            [
                'id' => 'email',
                'class_id' => '@editor',
                'name' => 'Email',
                'description' => 'Email input with validation',
                'data_types' => ['string'],
                'is_default' => false,
                'is_system' => true,
                'props' => [],
            ],
            [
                'id' => 'url',
                'class_id' => '@editor',
                'name' => 'URL',
                'description' => 'URL input with validation',
                'data_types' => ['string'],
                'is_default' => false,
                'is_system' => true,
                'props' => [],
            ],

            // === Function Editor ===
            [
                'id' => 'javascript',
                'class_id' => '@editor',
                'name' => 'JavaScript Code',
                'description' => 'JavaScript code editor for function definitions. Scope: {obj, prop, value, oldValue, newValue}',
                'data_types' => ['function'],
                'is_default' => true,
                'is_system' => true,
                'props' => [
                    ['key' => 'theme', 'label' => 'Theme', 'data_type' => 'string', 'options' => ['type' => 'string_options', 'values' => ['light', 'dark', 'monokai']], 'default_value' => 'light'],
                    ['key' => 'lineNumbers', 'label' => 'Line Numbers', 'data_type' => 'boolean', 'default_value' => true],
                    ['key' => 'minLines', 'label' => 'Min Lines', 'data_type' => 'integer', 'default_value' => 3],
                    ['key' => 'maxLines', 'label' => 'Max Lines', 'data_type' => 'integer', 'default_value' => 20],
                ],
            ],

            // === Number Editors ===
            [
                'id' => 'number',
                'class_id' => '@editor',
                'name' => 'Number Input',
                'description' => 'Numeric input with step controls',
                'data_types' => ['integer', 'float'],
                'is_default' => true,
                'is_system' => true,
                'props' => [
                    ['key' => 'min', 'label' => 'Minimum', 'data_type' => 'integer'],
                    ['key' => 'max', 'label' => 'Maximum', 'data_type' => 'integer'],
                    ['key' => 'step', 'label' => 'Step', 'data_type' => 'integer', 'default_value' => 1],
                    ['key' => 'prefix', 'label' => 'Prefix', 'data_type' => 'string'],
                    ['key' => 'suffix', 'label' => 'Suffix', 'data_type' => 'string'],
                ],
            ],
            [
                'id' => 'slider',
                'class_id' => '@editor',
                'name' => 'Slider',
                'description' => 'Slider for numeric ranges',
                'data_types' => ['integer', 'float'],
                'is_default' => false,
                'is_system' => true,
                'props' => [
                    ['key' => 'min', 'label' => 'Minimum', 'data_type' => 'integer', 'default_value' => 0],
                    ['key' => 'max', 'label' => 'Maximum', 'data_type' => 'integer', 'default_value' => 100],
                    ['key' => 'step', 'label' => 'Step', 'data_type' => 'integer', 'default_value' => 1],
                    ['key' => 'showValue', 'label' => 'Show Value', 'data_type' => 'boolean', 'default_value' => true],
                ],
            ],
            [
                'id' => 'currency',
                'class_id' => '@editor',
                'name' => 'Currency',
                'description' => 'Currency input with formatting',
                'data_types' => ['integer', 'float'],
                'is_default' => false,
                'is_system' => true,
                'props' => [
                    ['key' => 'currency', 'label' => 'Currency', 'data_type' => 'string', 'default_value' => 'USD'],
                    ['key' => 'decimals', 'label' => 'Decimals', 'data_type' => 'integer', 'default_value' => 2],
                    ['key' => 'locale', 'label' => 'Locale', 'data_type' => 'string', 'default_value' => 'en-US'],
                ],
            ],

            // === Boolean Editors ===
            [
                'id' => 'toggle',
                'class_id' => '@editor',
                'name' => 'Toggle Switch',
                'description' => 'On/off toggle switch',
                'data_types' => ['boolean'],
                'is_default' => true,
                'is_system' => true,
                'props' => [
                    ['key' => 'labelOn', 'label' => 'Label On', 'data_type' => 'string'],
                    ['key' => 'labelOff', 'label' => 'Label Off', 'data_type' => 'string'],
                ],
            ],
            [
                'id' => 'checkbox',
                'class_id' => '@editor',
                'name' => 'Checkbox',
                'description' => 'Checkbox for boolean values',
                'data_types' => ['boolean'],
                'is_default' => false,
                'is_system' => true,
                'props' => [],
            ],

            // === Date/Time Editors ===
            [
                'id' => 'date',
                'class_id' => '@editor',
                'name' => 'Date Picker',
                'description' => 'Date selection',
                'data_types' => ['string'],
                'is_default' => false,
                'is_system' => true,
                'props' => [
                    ['key' => 'format', 'label' => 'Format', 'data_type' => 'string', 'default_value' => 'YYYY-MM-DD'],
                    ['key' => 'minDate', 'label' => 'Min Date', 'data_type' => 'string'],
                    ['key' => 'maxDate', 'label' => 'Max Date', 'data_type' => 'string'],
                ],
            ],
            [
                'id' => 'datetime',
                'class_id' => '@editor',
                'name' => 'DateTime Picker',
                'description' => 'Date and time selection',
                'data_types' => ['string'],
                'is_default' => false,
                'is_system' => true,
                'props' => [
                    ['key' => 'format', 'label' => 'Format', 'data_type' => 'string', 'default_value' => 'YYYY-MM-DD HH:mm'],
                    ['key' => 'showTime', 'label' => 'Show Time', 'data_type' => 'boolean', 'default_value' => true],
                ],
            ],
            [
                'id' => 'time',
                'class_id' => '@editor',
                'name' => 'Time Picker',
                'description' => 'Time selection',
                'data_types' => ['string'],
                'is_default' => false,
                'is_system' => true,
                'props' => [
                    ['key' => 'format', 'label' => 'Format', 'data_type' => 'string', 'default_value' => 'HH:mm'],
                    ['key' => 'use12Hours', 'label' => '12 Hour', 'data_type' => 'boolean', 'default_value' => false],
                ],
            ],

            // === Select Editors (for strings with options) ===
            [
                'id' => 'select',
                'class_id' => '@editor',
                'name' => 'Select',
                'description' => 'Dropdown selection',
                'data_types' => ['string'],
                'is_default' => false,
                'is_system' => true,
                'props' => [
                    ['key' => 'allowClear', 'label' => 'Allow Clear', 'data_type' => 'boolean', 'default_value' => true],
                    ['key' => 'showSearch', 'label' => 'Searchable', 'data_type' => 'boolean', 'default_value' => false],
                    ['key' => 'placeholder', 'label' => 'Placeholder', 'data_type' => 'string'],
                ],
            ],
            [
                'id' => 'radio',
                'class_id' => '@editor',
                'name' => 'Radio Buttons',
                'description' => 'Radio button group',
                'data_types' => ['string'],
                'is_default' => false,
                'is_system' => true,
                'props' => [
                    ['key' => 'layout', 'label' => 'Layout', 'data_type' => 'string', 'options' => ['type' => 'string_options', 'values' => ['horizontal', 'vertical']], 'default_value' => 'horizontal'],
                ],
            ],
            [
                'id' => 'multiselect',
                'class_id' => '@editor',
                'name' => 'Multi-Select',
                'description' => 'Multiple selection with tags',
                'data_types' => ['string'],
                'is_default' => false,
                'is_system' => true,
                'props' => [
                    ['key' => 'maxTags', 'label' => 'Max Tags', 'data_type' => 'integer'],
                    ['key' => 'showSearch', 'label' => 'Searchable', 'data_type' => 'boolean', 'default_value' => true],
                ],
            ],

            // === Object Editors ===
            [
                'id' => 'json',
                'class_id' => '@editor',
                'name' => 'JSON Editor',
                'description' => 'JSON text editor',
                'data_types' => ['object'],
                'is_default' => true,
                'is_system' => true,
                'props' => [
                    ['key' => 'rows', 'label' => 'Rows', 'data_type' => 'integer', 'default_value' => 5],
                    ['key' => 'validateJson', 'label' => 'Validate', 'data_type' => 'boolean', 'default_value' => true],
                ],
            ],
            [
                'id' => 'keyvalue',
                'class_id' => '@editor',
                'name' => 'Key-Value Editor',
                'description' => 'Key-value pair editor',
                'data_types' => ['object'],
                'is_default' => false,
                'is_system' => true,
                'props' => [
                    ['key' => 'keyLabel', 'label' => 'Key Label', 'data_type' => 'string', 'default_value' => 'Key'],
                    ['key' => 'valueLabel', 'label' => 'Value Label', 'data_type' => 'string', 'default_value' => 'Value'],
                ],
            ],

            // === Relation Editors ===
            [
                'id' => 'reference',
                'class_id' => '@editor',
                'name' => 'Reference Picker',
                'description' => 'Single object reference selector',
                'data_types' => ['relation'],
                'is_default' => true,
                'is_system' => true,
                'props' => [
                    ['key' => 'displayField', 'label' => 'Display Field', 'data_type' => 'string', 'default_value' => 'name'],
                    ['key' => 'allowCreate', 'label' => 'Allow Create', 'data_type' => 'boolean', 'default_value' => false],
                    ['key' => 'showSearch', 'label' => 'Searchable', 'data_type' => 'boolean', 'default_value' => true],
                ],
            ],
            [
                'id' => 'references',
                'class_id' => '@editor',
                'name' => 'Multi-Reference Picker',
                'description' => 'Multiple object references selector',
                'data_types' => ['relation'],
                'is_default' => false,
                'is_system' => true,
                'props' => [
                    ['key' => 'displayField', 'label' => 'Display Field', 'data_type' => 'string', 'default_value' => 'name'],
                    ['key' => 'maxItems', 'label' => 'Max Items', 'data_type' => 'integer'],
                ],
            ],

            // === Special Editors ===
            [
                'id' => 'color',
                'class_id' => '@editor',
                'name' => 'Color Picker',
                'description' => 'Color selection',
                'data_types' => ['string'],
                'is_default' => false,
                'is_system' => true,
                'props' => [
                    ['key' => 'format', 'label' => 'Format', 'data_type' => 'string', 'options' => ['type' => 'string_options', 'values' => ['hex', 'rgb', 'hsl']], 'default_value' => 'hex'],
                    ['key' => 'showAlpha', 'label' => 'Show Alpha', 'data_type' => 'boolean', 'default_value' => false],
                ],
            ],
            [
                'id' => 'file',
                'class_id' => '@editor',
                'name' => 'File Upload',
                'description' => 'File upload input',
                'data_types' => ['string'],
                'is_default' => false,
                'is_system' => true,
                'props' => [
                    ['key' => 'accept', 'label' => 'Accept', 'data_type' => 'string'],
                    ['key' => 'maxSize', 'label' => 'Max Size (MB)', 'data_type' => 'integer'],
                    ['key' => 'multiple', 'label' => 'Multiple', 'data_type' => 'boolean', 'default_value' => false],
                ],
            ],
            [
                'id' => 'image',
                'class_id' => '@editor',
                'name' => 'Image Upload',
                'description' => 'Image upload with preview',
                'data_types' => ['string'],
                'is_default' => false,
                'is_system' => true,
                'props' => [
                    ['key' => 'maxWidth', 'label' => 'Max Width', 'data_type' => 'integer'],
                    ['key' => 'maxHeight', 'label' => 'Max Height', 'data_type' => 'integer'],
                    ['key' => 'maxSize', 'label' => 'Max Size (MB)', 'data_type' => 'integer'],
                    ['key' => 'crop', 'label' => 'Enable Crop', 'data_type' => 'boolean', 'default_value' => false],
                ],
            ],
            [
                'id' => 'rich',
                'class_id' => '@editor',
                'name' => 'Rich Text',
                'description' => 'Rich text / WYSIWYG editor',
                'data_types' => ['string'],
                'is_default' => false,
                'is_system' => true,
                'props' => [
                    ['key' => 'toolbar', 'label' => 'Toolbar', 'data_type' => 'string', 'options' => ['type' => 'string_options', 'values' => ['minimal', 'standard', 'full']], 'default_value' => 'standard'],
                    ['key' => 'minHeight', 'label' => 'Min Height', 'data_type' => 'integer', 'default_value' => 200],
                ],
            ],
        ];
    }

    /**
     * Get seed function definitions (validators, generators, transformers)
     */
    private function getSeedFunctionDefinitions(): array
    {
        return [
            // =========================================================================
            // VALIDATORS - Check if values meet certain criteria
            // =========================================================================
            [
                'id' => 'email_validator',
                'class_id' => '@function',
                'name' => 'Email Validator',
                'description' => 'Validates that the value is a properly formatted email address',
                'function_type' => 'validator',
                'is_system' => true,
                'scope' => ['string'],
                'parameters' => [],
                'code' => "function(obj, prop, value) {
    if (!value) return { valid: true };
    const emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
    return {
        valid: emailRegex.test(value),
        error: 'Invalid email address format'
    };
}",
            ],
            [
                'id' => 'url_validator',
                'class_id' => '@function',
                'name' => 'URL Validator',
                'description' => 'Validates that the value is a properly formatted URL',
                'function_type' => 'validator',
                'is_system' => true,
                'scope' => ['string'],
                'parameters' => [],
                'code' => "function(obj, prop, value) {
    if (!value) return { valid: true };
    try {
        new URL(value);
        return { valid: true };
    } catch (e) {
        return { valid: false, error: 'Invalid URL format' };
    }
}",
            ],
            [
                'id' => 'phone_validator',
                'class_id' => '@function',
                'name' => 'Phone Validator',
                'description' => 'Validates that the value is a properly formatted phone number',
                'function_type' => 'validator',
                'is_system' => true,
                'scope' => ['string'],
                'parameters' => [],
                'code' => "function(obj, prop, value) {
    if (!value) return { valid: true };
    const phoneRegex = /^[\\+]?[(]?[0-9]{1,4}[)]?[-\\s\\./0-9]*$/;
    return {
        valid: phoneRegex.test(value),
        error: 'Invalid phone number format'
    };
}",
            ],
            [
                'id' => 'min_length_validator',
                'class_id' => '@function',
                'name' => 'Min Length Validator',
                'description' => 'Validates minimum string length',
                'function_type' => 'validator',
                'is_system' => true,
                'scope' => ['string'],
                'parameters' => [
                    ['key' => 'min', 'data_type' => 'integer', 'required' => true],
                ],
                'code' => "function(obj, prop, value, params) {
    if (!value) return { valid: true };
    const min = params?.min || 0;
    return {
        valid: value.length >= min,
        error: `Minimum length is \${min} characters`
    };
}",
            ],
            [
                'id' => 'max_length_validator',
                'class_id' => '@function',
                'name' => 'Max Length Validator',
                'description' => 'Validates maximum string length',
                'function_type' => 'validator',
                'is_system' => true,
                'scope' => ['string'],
                'parameters' => [
                    ['key' => 'max', 'data_type' => 'integer', 'required' => true],
                ],
                'code' => "function(obj, prop, value, params) {
    if (!value) return { valid: true };
    const max = params?.max || Infinity;
    return {
        valid: value.length <= max,
        error: `Maximum length is \${max} characters`
    };
}",
            ],
            [
                'id' => 'regex_validator',
                'class_id' => '@function',
                'name' => 'Regex Validator',
                'description' => 'Validates against a regular expression pattern',
                'function_type' => 'validator',
                'is_system' => true,
                'scope' => ['string'],
                'parameters' => [
                    ['key' => 'pattern', 'data_type' => 'string', 'required' => true],
                    ['key' => 'message', 'data_type' => 'string'],
                ],
                'code' => "function(obj, prop, value, params) {
    if (!value) return { valid: true };
    const regex = new RegExp(params?.pattern || '.*');
    return {
        valid: regex.test(value),
        error: params?.message || 'Value does not match required pattern'
    };
}",
            ],
            [
                'id' => 'required_validator',
                'class_id' => '@function',
                'name' => 'Required Validator',
                'description' => 'Validates that a value is present and not empty',
                'function_type' => 'validator',
                'is_system' => true,
                'scope' => ['string', 'boolean', 'integer', 'float', 'object', 'relation'],
                'parameters' => [],
                'code' => "function(obj, prop, value) {
    const isEmpty = value === undefined || value === null || value === '' ||
                    (Array.isArray(value) && value.length === 0);
    return {
        valid: !isEmpty,
        error: 'This field is required'
    };
}",
            ],
            [
                'id' => 'range_validator',
                'class_id' => '@function',
                'name' => 'Range Validator',
                'description' => 'Validates that a number is within a specified range',
                'function_type' => 'validator',
                'is_system' => true,
                'scope' => ['integer', 'float'],
                'parameters' => [
                    ['key' => 'min', 'data_type' => 'float'],
                    ['key' => 'max', 'data_type' => 'float'],
                ],
                'code' => "function(obj, prop, value, params) {
    if (value === undefined || value === null || value === '') return { valid: true };
    const num = parseFloat(value);
    if (isNaN(num)) return { valid: false, error: 'Value must be a number' };
    const min = params?.min ?? -Infinity;
    const max = params?.max ?? Infinity;
    if (num < min) return { valid: false, error: `Minimum value is \${min}` };
    if (num > max) return { valid: false, error: `Maximum value is \${max}` };
    return { valid: true };
}",
            ],

            // =========================================================================
            // GENERATORS - Generate unique values
            // =========================================================================
            [
                'id' => 'uuid_generator',
                'class_id' => '@function',
                'name' => 'UUID Generator',
                'description' => 'Generates a universally unique identifier (UUID v4)',
                'function_type' => 'generator',
                'is_system' => true,
                'scope' => ['unique', 'string'],
                'parameters' => [],
                'code' => "function() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}",
            ],
            [
                'id' => 'auto_increment_generator',
                'class_id' => '@function',
                'name' => 'Auto Increment Generator',
                'description' => 'Generates an auto-incrementing integer ID',
                'function_type' => 'generator',
                'is_system' => true,
                'scope' => ['unique', 'integer'],
                'parameters' => [
                    ['key' => 'prefix', 'data_type' => 'string'],
                    ['key' => 'padding', 'data_type' => 'integer', 'default_value' => 0],
                ],
                'code' => "function(obj, prop, value, params, context) {
    const nextId = (context?.lastId || 0) + 1;
    const prefix = params?.prefix || '';
    const padding = params?.padding || 0;
    const numStr = padding > 0 ? String(nextId).padStart(padding, '0') : String(nextId);
    return prefix + numStr;
}",
            ],
            [
                'id' => 'timestamp_generator',
                'class_id' => '@function',
                'name' => 'Timestamp Generator',
                'description' => 'Generates a timestamp-based unique ID',
                'function_type' => 'generator',
                'is_system' => true,
                'scope' => ['unique', 'string'],
                'parameters' => [
                    ['key' => 'prefix', 'data_type' => 'string'],
                ],
                'code' => "function(obj, prop, value, params) {
    const prefix = params?.prefix || '';
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).substring(2, 6);
    return prefix + ts + rand;
}",
            ],

            // =========================================================================
            // TRANSFORMERS - Transform/normalize values
            // =========================================================================
            [
                'id' => 'lowercase_transformer',
                'class_id' => '@function',
                'name' => 'Lowercase Transformer',
                'description' => 'Transforms the value to lowercase',
                'function_type' => 'transformer',
                'is_system' => true,
                'scope' => ['string'],
                'parameters' => [],
                'code' => "function(obj, prop, value) {
    return typeof value === 'string' ? value.toLowerCase() : value;
}",
            ],
            [
                'id' => 'uppercase_transformer',
                'class_id' => '@function',
                'name' => 'Uppercase Transformer',
                'description' => 'Transforms the value to uppercase',
                'function_type' => 'transformer',
                'is_system' => true,
                'scope' => ['string'],
                'parameters' => [],
                'code' => "function(obj, prop, value) {
    return typeof value === 'string' ? value.toUpperCase() : value;
}",
            ],
            [
                'id' => 'trim_transformer',
                'class_id' => '@function',
                'name' => 'Trim Transformer',
                'description' => 'Trims whitespace from the start and end of the value',
                'function_type' => 'transformer',
                'is_system' => true,
                'scope' => ['string'],
                'parameters' => [],
                'code' => "function(obj, prop, value) {
    return typeof value === 'string' ? value.trim() : value;
}",
            ],
            [
                'id' => 'slug_transformer',
                'class_id' => '@function',
                'name' => 'Slug Transformer',
                'description' => 'Transforms the value to a URL-friendly slug',
                'function_type' => 'transformer',
                'is_system' => true,
                'scope' => ['string'],
                'parameters' => [],
                'code' => "function(obj, prop, value) {
    if (typeof value !== 'string') return value;
    return value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\\u0300-\\u036f]/g, '')
        .replace(/[^a-z0-9\\s-]/g, '')
        .replace(/\\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}",
            ],

            // =========================================================================
            // COMPUTED - Calculate values from other fields
            // =========================================================================
            [
                'id' => 'full_name_computed',
                'class_id' => '@function',
                'name' => 'Full Name Computed',
                'description' => 'Computes full name from first_name and last_name fields',
                'function_type' => 'computed',
                'is_system' => true,
                'scope' => ['string'],
                'parameters' => [
                    ['key' => 'first_name_field', 'data_type' => 'string', 'default_value' => 'first_name'],
                    ['key' => 'last_name_field', 'data_type' => 'string', 'default_value' => 'last_name'],
                ],
                'code' => "function(obj, prop, value, params) {
    const firstName = obj[params?.first_name_field || 'first_name'] || '';
    const lastName = obj[params?.last_name_field || 'last_name'] || '';
    return [firstName, lastName].filter(Boolean).join(' ');
}",
            ],
        ];
    }

    /**
     * Make GET request to API
     */
    private function apiGet(string $endpoint): ?array
    {
        $url = $this->apiBaseUrl . $endpoint;
        $context = stream_context_create([
            'http' => [
                'method' => 'GET',
                'header' => "Accept: application/json\r\n",
                'ignore_errors' => true,
            ],
        ]);

        $response = @file_get_contents($url, false, $context);
        if ($response === false) {
            return null;
        }

        return json_decode($response, true);
    }

    /**
     * Make POST request to API
     */
    private function apiPost(string $endpoint, array $data, array $headers = []): ?array
    {
        $url = $this->apiBaseUrl . $endpoint;

        $headerStr = "Content-Type: application/json\r\nAccept: application/json\r\n";
        foreach ($headers as $key => $value) {
            $headerStr .= "{$key}: {$value}\r\n";
        }

        $context = stream_context_create([
            'http' => [
                'method' => 'POST',
                'header' => $headerStr,
                'content' => json_encode($data),
                'ignore_errors' => true,
            ],
        ]);

        $response = @file_get_contents($url, false, $context);
        if ($response === false) {
            return null;
        }

        return json_decode($response, true);
    }
}
