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
     * Load system class definitions from genesis/data/system.genesis.json
     */
    private function getSystemClassDefinitions(): array
    {
        $file = __DIR__ . '/data/system.genesis.json';
        return json_decode(file_get_contents($file), true)['classes'];
    }

    /**
     * Load seed editor definitions from genesis/data/editors.seed.json
     */
    private function getSeedEditorDefinitions(): array
    {
        return json_decode(file_get_contents(__DIR__ . '/data/editors.seed.json'), true);
    }

    /**
     * Load seed function definitions from genesis/data/functions.seed.json
     */
    private function getSeedFunctionDefinitions(): array
    {
        return json_decode(file_get_contents(__DIR__ . '/data/functions.seed.json'), true);
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
