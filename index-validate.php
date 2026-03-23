<?php
/**
 * ElementStore Validation Endpoint
 *
 * Validates objects against their class definitions and identifies issues.
 * Returns structured report with severity tagging.
 *
 * ENDPOINTS:
 *   GET /validate/objects              Validate all objects against classes
 *   GET /validate/classes              Validate class definitions
 *   GET /validate/classes/{class_id}   Validate single class
 *   GET /validate/summary              Get summary of all issues
 *
 * QUERY PARAMS:
 *   severity=CRITICAL|WARNING|INFO     Filter by severity
 *   type=TYPE_NAME                     Filter by issue type
 *   group_by=severity|type|object_id   Group results
 *   format=json|html                   Output format
 *
 * RESPONSE FORMAT:
 * {
 *   "timestamp": "2026-03-23T16:00:00Z",
 *   "summary": {
 *     "total_issues": 217,
 *     "critical": 0,
 *     "warnings": 217,
 *     "by_type": { "TYPE_NAME": count, ... },
 *     "by_severity": { "CRITICAL": count, ... }
 *   },
 *   "issues": [
 *     {
 *       "type": "TYPE_MISMATCH",
 *       "severity": "WARNING|CRITICAL|INFO",
 *       "message": "human readable message",
 *       "object_id": "obj:123",
 *       "class_id": "@class",
 *       "file": "@app.json",
 *       "details": { ... }
 *     }
 *   ]
 * }
 */

error_reporting(E_ALL);
ini_set('display_errors', 0);
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/autoload.php';
require_once __DIR__ . '/src/ClassModel.php';
require_once __DIR__ . '/src/Prop.php';
require_once __DIR__ . '/src/AtomObj.php';

use ElementStore\ClassModel;

// Parse request
$method = $_SERVER['REQUEST_METHOD'];
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$query = $_GET;

// Routes
if ($method === 'GET' && preg_match('~/validate/objects~', $path)) {
    handleValidateObjects($query);
} elseif ($method === 'GET' && preg_match('~/validate/classes~', $path)) {
    handleValidateClasses($query);
} elseif ($method === 'GET' && preg_match('~/validate/summary~', $path)) {
    handleValidateSummary($query);
} else {
    http_response_code(404);
    echo json_encode(['error' => 'Not found']);
}

// =========================================================================
// HANDLERS
// =========================================================================

function handleValidateObjects($query) {
    try {
        $model = ClassModel::boot(__DIR__);
        $severity = $query['severity'] ?? null;
        $type = $query['type'] ?? null;
        $groupBy = $query['group_by'] ?? null;

        $issues = validateAllObjects($model);

        // Filter
        if ($severity) {
            $issues = array_filter($issues, fn($i) => $i['severity'] === $severity);
        }
        if ($type) {
            $issues = array_filter($issues, fn($i) => $i['type'] === $type);
        }

        $response = [
            'timestamp' => date('c'),
            'endpoint' => '/validate/objects',
            'count' => count($issues),
            'issues' => array_values($issues),
        ];

        if ($groupBy) {
            $response['grouped'] = groupIssues($issues, $groupBy);
        }

        // Summary
        $response['summary'] = summarizeIssues($issues);

        echo json_encode($response, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode([
            'error' => $e->getMessage(),
            'code' => $e->getCode(),
        ]);
    }
}

function handleValidateClasses($query) {
    try {
        $model = ClassModel::boot(__DIR__);
        $severity = $query['severity'] ?? null;

        $issues = validateAllClasses($model);

        if ($severity) {
            $issues = array_filter($issues, fn($i) => $i['severity'] === $severity);
        }

        $response = [
            'timestamp' => date('c'),
            'endpoint' => '/validate/classes',
            'count' => count($issues),
            'issues' => array_values($issues),
            'summary' => summarizeIssues($issues),
        ];

        echo json_encode($response, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
}

function handleValidateSummary($query) {
    try {
        $model = ClassModel::boot(__DIR__);

        $objIssues = validateAllObjects($model);
        $classIssues = validateAllClasses($model);
        $allIssues = array_merge($objIssues, $classIssues);

        $response = [
            'timestamp' => date('c'),
            'summary' => summarizeIssues($allIssues),
            'object_issues' => count($objIssues),
            'class_issues' => count($classIssues),
            'by_type_top_10' => getTopIssueTypes($allIssues, 10),
        ];

        echo json_encode($response, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
}

// =========================================================================
// VALIDATION LOGIC
// =========================================================================

function validateAllObjects($model) {
    $issues = [];
    $esDir = __DIR__ . '/.es';

    // Load all classes first
    $classes = loadClassesFromServer($model);

    // Validate each object
    foreach (glob("$esDir/*.json") as $file) {
        // Skip genesis and seed files
        if (strpos(basename($file), '.genesis.json') !== false ||
            strpos(basename($file), '.seed.json') !== false) {
            continue;
        }

        $data = json_decode(file_get_contents($file), true);
        if (!is_array($data)) continue;

        // Handle single object or array
        $objects = isset($data['id']) ? [$data] : $data;

        foreach ($objects as $obj) {
            if (!is_array($obj)) continue;

            $classId = $obj['class_id'] ?? null;
            $objId = $obj['id'] ?? 'unknown';

            if (!$classId) {
                $issues[] = [
                    'type' => 'MISSING_CLASS_ID',
                    'severity' => 'CRITICAL',
                    'message' => "Object missing class_id",
                    'object_id' => $objId,
                    'file' => basename($file),
                    'details' => [],
                ];
                continue;
            }

            $class = $classes[$classId] ?? null;
            if (!$class) {
                $issues[] = [
                    'type' => 'CLASS_NOT_FOUND',
                    'severity' => 'CRITICAL',
                    'message' => "Class '$classId' not found",
                    'object_id' => $objId,
                    'class_id' => $classId,
                    'file' => basename($file),
                    'details' => [],
                ];
                continue;
            }

            // Validate object
            $objIssues = validateObjectAgainstClass($obj, $class, basename($file), $objId);
            $issues = array_merge($issues, $objIssues);
        }
    }

    return $issues;
}

function validateAllClasses($model) {
    $issues = [];
    $esDir = __DIR__ . '/.es';
    $classes = loadClassesFromServer($model);

    // Validate each class definition
    foreach ($classes as $classId => $class) {
        // Check required fields
        if (empty($class['name'])) {
            $issues[] = [
                'type' => 'MISSING_CLASS_NAME',
                'severity' => 'CRITICAL',
                'message' => "Class missing name",
                'class_id' => $classId,
                'file' => getClassFile($esDir, $classId),
                'details' => [],
            ];
        }

        // Validate props
        $props = $class['props'] ?? [];
        if (!is_array($props)) {
            $issues[] = [
                'type' => 'INVALID_PROPS_FORMAT',
                'severity' => 'CRITICAL',
                'message' => "Class props must be array",
                'class_id' => $classId,
                'file' => getClassFile($esDir, $classId),
                'details' => ['props_type' => gettype($props)],
            ];
            continue;
        }

        foreach ($props as $prop) {
            if (!is_array($prop)) {
                $issues[] = [
                    'type' => 'INVALID_PROP_FORMAT',
                    'severity' => 'WARNING',
                    'message' => "Property definition must be object/array",
                    'class_id' => $classId,
                    'file' => getClassFile($esDir, $classId),
                    'details' => ['prop_type' => gettype($prop)],
                ];
                continue;
            }

            if (empty($prop['key'])) {
                $issues[] = [
                    'type' => 'MISSING_PROP_KEY',
                    'severity' => 'CRITICAL',
                    'message' => "Property missing key",
                    'class_id' => $classId,
                    'file' => getClassFile($esDir, $classId),
                    'details' => [],
                ];
            }

            if (empty($prop['data_type'])) {
                $issues[] = [
                    'type' => 'MISSING_PROP_TYPE',
                    'severity' => 'CRITICAL',
                    'message' => "Property '{$prop['key']}' missing data_type",
                    'class_id' => $classId,
                    'file' => getClassFile($esDir, $classId),
                    'details' => ['key' => $prop['key']],
                ];
            }
        }
    }

    return $issues;
}

function validateObjectAgainstClass($obj, $class, $file, $objId) {
    $issues = [];
    $props = $class['props'] ?? [];
    $classId = $class['id'] ?? 'unknown';

    // Check required properties
    foreach ($props as $propDef) {
        $key = $propDef['key'] ?? null;
        if (!$key) continue;

        $propValue = $obj[$key] ?? null;
        $isRequired = $propDef['flags']['required'] ?? false;
        $dataType = $propDef['data_type'] ?? 'string';

        if ($isRequired && $propValue === null) {
            $issues[] = [
                'type' => 'REQUIRED_PROPERTY_MISSING',
                'severity' => 'CRITICAL',
                'message' => "Required property '$key' missing",
                'object_id' => $objId,
                'class_id' => $classId,
                'file' => $file,
                'details' => ['key' => $key],
            ];
            continue;
        }

        if ($propValue === null) continue;

        // Type validation
        $expectedType = getExpectedPhpType($dataType);
        $actualType = gettype($propValue);

        // Check if type matches (or can be cast)
        $typeIssue = checkTypeMatch($propValue, $expectedType, $dataType, $key, $objId, $classId, $file);
        if ($typeIssue) {
            $issues[] = $typeIssue;
        }
    }

    // Check for extra properties
    $classKeys = array_column($props, 'key');
    $objKeys = array_keys($obj);
    $extraKeys = array_diff($objKeys, $classKeys, ['id', 'class_id', 'created_at', 'updated_at', 'owner_id']);

    foreach ($extraKeys as $extraKey) {
        $issues[] = [
            'type' => 'EXTRA_PROPERTY',
            'severity' => 'WARNING',
            'message' => "Object has property '$extraKey' not in class",
            'object_id' => $objId,
            'class_id' => $classId,
            'file' => $file,
            'details' => ['key' => $extraKey],
        ];
    }

    return $issues;
}

function checkTypeMatch($value, $expectedType, $dataType, $key, $objId, $classId, $file) {
    $actualType = gettype($value);

    // Arrays with scalar values
    if ($actualType === 'array' && $expectedType === 'string') {
        return [
            'type' => 'TYPE_MISMATCH',
            'severity' => 'WARNING',
            'message' => "Property '$key' is array, expects $expectedType (may need casting)",
            'object_id' => $objId,
            'class_id' => $classId,
            'file' => $file,
            'details' => ['key' => $key, 'expected' => $expectedType, 'actual' => $actualType],
        ];
    }

    // Numeric strings as integers
    if ($expectedType === 'integer' && is_numeric($value) && $actualType === 'string') {
        return [
            'type' => 'TYPE_MISMATCH_CASTABLE',
            'severity' => 'INFO',
            'message' => "Property '$key' is string number, can be cast to integer",
            'object_id' => $objId,
            'class_id' => $classId,
            'file' => $file,
            'details' => ['key' => $key, 'value' => $value],
        ];
    }

    // Type mismatch that's not castable
    if ($actualType !== $expectedType && !canCast($actualType, $expectedType, $value)) {
        return [
            'type' => 'TYPE_MISMATCH',
            'severity' => 'WARNING',
            'message' => "Property '$key' is $actualType, expects $expectedType",
            'object_id' => $objId,
            'class_id' => $classId,
            'file' => $file,
            'details' => ['key' => $key, 'expected' => $expectedType, 'actual' => $actualType],
        ];
    }

    return null;
}

function canCast($from, $to, $value) {
    // Allow casting between numeric types
    if (in_array($from, ['integer', 'double']) && in_array($to, ['integer', 'double'])) {
        return true;
    }
    // Allow string to number if numeric
    if ($from === 'string' && in_array($to, ['integer', 'double']) && is_numeric($value)) {
        return true;
    }
    return false;
}

function getExpectedPhpType($dataType) {
    return match ($dataType) {
        'string' => 'string',
        'integer' => 'integer',
        'boolean' => 'boolean',
        'float', 'number' => 'double',
        'object', 'array' => 'array',
        'relation' => 'string', // relation IDs are strings
        'datetime' => 'string',
        default => 'string',
    };
}

function loadClassesFromServer($model) {
    $classes = [];
    $esDir = __DIR__ . '/.es';

    // Load from genesis files
    foreach (glob("$esDir/*.genesis.json") as $file) {
        $data = json_decode(file_get_contents($file), true);
        if (!is_array($data) || !isset($data['classes'])) continue;

        foreach ($data['classes'] as $class) {
            if (is_array($class) && ($class['class_id'] ?? null) === '@class') {
                $classId = $class['id'] ?? null;
                if ($classId) {
                    $classes[$classId] = $class;
                }
            }
        }
    }

    // Load from runtime JSON files
    foreach (glob("$esDir/*.json") as $file) {
        if (strpos(basename($file), '.genesis.json') !== false ||
            strpos(basename($file), '.seed.json') !== false) {
            continue;
        }

        $data = json_decode(file_get_contents($file), true);
        if (!is_array($data)) continue;

        if (($data['class_id'] ?? null) === '@class') {
            $classId = $data['id'] ?? null;
            if ($classId) {
                $classes[$classId] = $data;
            }
        }
    }

    return $classes;
}

function getClassFile($esDir, $classId) {
    // Try to find which file contains this class
    foreach (glob("$esDir/*.json") as $file) {
        $data = json_decode(file_get_contents($file), true);
        if ($data['id'] === $classId && ($data['class_id'] ?? null) === '@class') {
            return basename($file);
        }
    }
    return 'unknown';
}

function summarizeIssues($issues) {
    $summary = [
        'total' => count($issues),
        'critical' => 0,
        'warnings' => 0,
        'info' => 0,
        'by_type' => [],
        'by_severity' => ['CRITICAL' => 0, 'WARNING' => 0, 'INFO' => 0],
    ];

    foreach ($issues as $issue) {
        $type = $issue['type'];
        $severity = $issue['severity'];

        if (!isset($summary['by_type'][$type])) {
            $summary['by_type'][$type] = 0;
        }
        $summary['by_type'][$type]++;
        $summary['by_severity'][$severity]++;

        if ($severity === 'CRITICAL') {
            $summary['critical']++;
        } elseif ($severity === 'WARNING') {
            $summary['warnings']++;
        } else {
            $summary['info']++;
        }
    }

    return $summary;
}

function groupIssues($issues, $groupBy) {
    $grouped = [];

    foreach ($issues as $issue) {
        $key = $issue[$groupBy] ?? 'unknown';

        if (!isset($grouped[$key])) {
            $grouped[$key] = [];
        }
        $grouped[$key][] = $issue;
    }

    return $grouped;
}

function getTopIssueTypes($issues, $limit = 10) {
    $types = [];

    foreach ($issues as $issue) {
        $type = $issue['type'];
        if (!isset($types[$type])) {
            $types[$type] = 0;
        }
        $types[$type]++;
    }

    arsort($types);
    return array_slice($types, 0, $limit, true);
}
