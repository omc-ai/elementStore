<?php
/**
 * ElementStore Validation & Comparison Tool
 *
 * Validates local objects against their classes, identifies issues, and compares
 * local classes against staging classes.
 *
 * USAGE:
 *   php util/validate-and-compare.php [--objects] [--classes] [--staging-url URL] [--json] [--verbose]
 *
 * OPTIONS:
 *   --objects          Validate objects against local classes (default: both)
 *   --classes          Compare local vs staging classes (requires --staging-url)
 *   --staging-url URL  Staging server URL for class comparison
 *   --json             Output as JSON (default: formatted table)
 *   --verbose          Show full details of each issue
 *   --fix-by-type      Group errors by type for easy fixing
 *
 * EXAMPLES:
 *   php util/validate-and-compare.php --objects
 *   php util/validate-and-compare.php --classes --staging-url http://staging.local/elementStore
 *   php util/validate-and-compare.php --objects --staging-url http://staging.local/elementStore
 */

error_reporting(E_ALL);
ini_set('display_errors', 1);

require_once __DIR__ . '/../autoload.php';
require_once __DIR__ . '/../src/ClassModel.php';
require_once __DIR__ . '/../src/Prop.php';
require_once __DIR__ . '/../src/AtomObj.php';

use ElementStore\ClassModel;
use ElementStore\Prop;

// Parse arguments
$args = [
    'objects' => true,
    'classes' => true,
    'staging_url' => null,
    'json_output' => false,
    'verbose' => false,
    'fix_by_type' => true,
];

foreach ($argv as $i => $arg) {
    if ($arg === '--objects-only') {
        $args['classes'] = false;
    } elseif ($arg === '--classes-only') {
        $args['objects'] = false;
    } elseif ($arg === '--staging-url' && isset($argv[$i + 1])) {
        $args['staging_url'] = $argv[$i + 1];
    } elseif ($arg === '--json') {
        $args['json_output'] = true;
    } elseif ($arg === '--verbose') {
        $args['verbose'] = true;
    }
}

$report = [
    'timestamp' => date('Y-m-d H:i:s'),
    'local_path' => __DIR__ . '/../.es',
    'staging_url' => $args['staging_url'],
    'object_validation' => [],
    'class_comparison' => [],
    'summary' => [
        'total_issues' => 0,
        'critical_issues' => 0,
        'warnings' => 0,
        'by_type' => [],
    ],
];

// =========================================================================
// OBJECT VALIDATION
// =========================================================================

if ($args['objects']) {
    echo "🔍 Validating local objects against classes...\n\n";
    validateObjects($report, $args);
}

// =========================================================================
// CLASS COMPARISON
// =========================================================================

if ($args['classes'] && $args['staging_url']) {
    echo "\n🔄 Comparing local classes against staging...\n\n";
    compareClasses($report, $args);
}

// =========================================================================
// OUTPUT REPORT
// =========================================================================

if ($args['json_output']) {
    echo json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n";
} else {
    printReport($report, $args);
}

// =========================================================================
// FUNCTIONS
// =========================================================================

function validateObjects(&$report, $args) {
    $esDir = __DIR__ . '/../.es';
    $issues = [];
    $issuesByType = [];
    $validatedCount = 0;

    // Load all genesis files to get class definitions
    $classes = loadAllClasses($esDir);

    // Scan all JSON files for objects
    foreach (glob("$esDir/*.json") as $file) {
        // Skip seed files and genesis files
        if (strpos(basename($file), '.seed.json') !== false ||
            strpos(basename($file), '.genesis.json') !== false ||
            strpos(basename($file), '.json') === false) {
            continue;
        }

        $filename = basename($file);
        $data = json_decode(file_get_contents($file), true);

        if (!is_array($data)) {
            continue;
        }

        // Handle both single object and array of objects
        $objects = isset($data['id']) ? [$data] : $data;

        foreach ($objects as $obj) {
            if (!is_array($obj)) continue;

            $validatedCount++;
            $classId = $obj['class_id'] ?? null;
            $objId = $obj['id'] ?? 'unknown';

            if (!$classId) {
                $issue = createIssue(
                    'MISSING_CLASS_ID',
                    "Object missing class_id",
                    $file,
                    $objId,
                    'CRITICAL'
                );
                $issues[] = $issue;
                $issuesByType['MISSING_CLASS_ID'][] = $issue;
                continue;
            }

            // Get class definition
            $class = $classes[$classId] ?? null;
            if (!$class) {
                $issue = createIssue(
                    'CLASS_NOT_FOUND',
                    "Class '$classId' not found in genesis files",
                    $file,
                    $objId,
                    'CRITICAL'
                );
                $issues[] = $issue;
                $issuesByType['CLASS_NOT_FOUND'][] = $issue;
                continue;
            }

            // Validate object against class
            $objIssues = validateObjectAgainstClass($obj, $class, $file, $objId);
            $issues = array_merge($issues, $objIssues);

            foreach ($objIssues as $issue) {
                $type = $issue['type'];
                if (!isset($issuesByType[$type])) {
                    $issuesByType[$type] = [];
                }
                $issuesByType[$type][] = $issue;
            }
        }
    }

    $report['object_validation'] = [
        'total_validated' => $validatedCount,
        'total_issues' => count($issues),
        'issues' => $issues,
        'by_type' => $issuesByType,
    ];

    // Update summary
    foreach ($issuesByType as $type => $typeIssues) {
        $report['summary']['by_type'][$type] = count($typeIssues);
        foreach ($typeIssues as $issue) {
            if ($issue['severity'] === 'CRITICAL') {
                $report['summary']['critical_issues']++;
            } elseif ($issue['severity'] === 'WARNING') {
                $report['summary']['warnings']++;
            }
        }
    }

    $report['summary']['total_issues'] += count($issues);
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

        // Check if required property is missing
        if ($isRequired && $propValue === null) {
            $issues[] = createIssue(
                'REQUIRED_PROPERTY_MISSING',
                "Required property '$key' is missing",
                $file,
                $objId,
                'CRITICAL',
                ['key' => $key, 'class_id' => $classId]
            );
            continue;
        }

        if ($propValue === null) continue;

        // Type validation
        $typeIssue = validatePropertyType($propValue, $propDef, $key, $file, $objId);
        if ($typeIssue) {
            $issues[] = $typeIssue;
            continue;
        }

        // For relation types, check if referenced object exists
        if ($dataType === 'relation') {
            $issues = array_merge($issues, validateRelationReference($propValue, $propDef, $key, $file, $objId));
        }

        // For enum/options, check if value is in allowed values
        if (in_array($dataType, ['string', 'integer']) && isset($propDef['options']['values'])) {
            $allowedValues = array_values($propDef['options']['values']);
            if (!in_array($propValue, $allowedValues)) {
                $issues[] = createIssue(
                    'INVALID_ENUM_VALUE',
                    "Property '$key' value '$propValue' not in allowed values: " . implode(', ', $allowedValues),
                    $file,
                    $objId,
                    'WARNING',
                    ['key' => $key, 'value' => $propValue, 'allowed' => $allowedValues]
                );
            }
        }
    }

    // Check for extra properties not in class definition
    $classKeys = array_column($props, 'key');
    $objKeys = array_keys($obj);
    $extraKeys = array_diff($objKeys, $classKeys, ['id', 'class_id', 'created_at', 'updated_at', 'owner_id']);

    if (!empty($extraKeys)) {
        foreach ($extraKeys as $extraKey) {
            $issues[] = createIssue(
                'EXTRA_PROPERTY',
                "Object has property '$extraKey' not defined in class",
                $file,
                $objId,
                'WARNING',
                ['key' => $extraKey, 'value' => $obj[$extraKey]]
            );
        }
    }

    return $issues;
}

function validatePropertyType($value, $propDef, $key, $file, $objId) {
    $dataType = $propDef['data_type'] ?? 'string';

    switch ($dataType) {
        case 'string':
            if (!is_string($value)) {
                // Check if it can be cast
                if (is_numeric($value) || is_bool($value)) {
                    return createIssue(
                        'TYPE_MISMATCH_CASTABLE',
                        "Property '$key' is " . gettype($value) . ", expects string (but castable)",
                        $file,
                        $objId,
                        'INFO',
                        ['key' => $key, 'expected' => 'string', 'actual' => gettype($value)]
                    );
                }
                return createIssue(
                    'TYPE_MISMATCH',
                    "Property '$key' is " . gettype($value) . ", expects string",
                    $file,
                    $objId,
                    'WARNING',
                    ['key' => $key, 'expected' => 'string', 'actual' => gettype($value)]
                );
            }
            break;

        case 'integer':
            if (!is_int($value)) {
                if (is_numeric($value) && (int)$value == $value) {
                    return createIssue(
                        'TYPE_MISMATCH_CASTABLE',
                        "Property '$key' is " . gettype($value) . ", expects integer (but castable)",
                        $file,
                        $objId,
                        'INFO',
                        ['key' => $key, 'expected' => 'integer', 'actual' => gettype($value)]
                    );
                }
                return createIssue(
                    'TYPE_MISMATCH',
                    "Property '$key' is " . gettype($value) . ", expects integer",
                    $file,
                    $objId,
                    'WARNING',
                    ['key' => $key, 'expected' => 'integer', 'actual' => gettype($value)]
                );
            }
            break;

        case 'boolean':
            if (!is_bool($value)) {
                return createIssue(
                    'TYPE_MISMATCH',
                    "Property '$key' is " . gettype($value) . ", expects boolean",
                    $file,
                    $objId,
                    'WARNING',
                    ['key' => $key, 'expected' => 'boolean', 'actual' => gettype($value)]
                );
            }
            break;

        case 'object':
        case 'array':
            if (!is_array($value)) {
                return createIssue(
                    'TYPE_MISMATCH',
                    "Property '$key' is " . gettype($value) . ", expects array/object",
                    $file,
                    $objId,
                    'WARNING',
                    ['key' => $key, 'expected' => 'array', 'actual' => gettype($value)]
                );
            }
            break;

        case 'datetime':
            if (!isValidDateTime($value)) {
                return createIssue(
                    'INVALID_DATETIME',
                    "Property '$key' value '$value' is not a valid ISO 8601 datetime",
                    $file,
                    $objId,
                    'WARNING',
                    ['key' => $key, 'value' => $value]
                );
            }
            break;
    }

    return null;
}

function validateRelationReference($value, $propDef, $key, $file, $objId) {
    $issues = [];
    $objectClassId = $propDef['object_class_id'] ?? null;

    // Handle both single ID and array of IDs
    $ids = is_array($value) ? $value : [$value];

    foreach ($ids as $id) {
        if (!is_string($id)) continue;

        // Check if referenced object exists in any JSON file
        $found = false;
        $esDir = __DIR__ . '/../.es';

        foreach (glob("$esDir/*.json") as $refFile) {
            if (strpos(basename($refFile), '.seed.json') !== false ||
                strpos(basename($refFile), '.genesis.json') !== false) {
                continue;
            }

            $data = json_decode(file_get_contents($refFile), true);
            if (!is_array($data)) continue;

            $objects = isset($data['id']) ? [$data] : $data;
            foreach ($objects as $obj) {
                if (($obj['id'] ?? null) === $id) {
                    $found = true;
                    break 2;
                }
            }
        }

        if (!$found) {
            $issues[] = createIssue(
                'BROKEN_REFERENCE',
                "Property '$key' references non-existent object '$id'",
                $file,
                $objId,
                'WARNING',
                ['key' => $key, 'reference' => $id, 'expected_class' => $objectClassId]
            );
        }
    }

    return $issues;
}

function compareClasses(&$report, $args) {
    if (!$args['staging_url']) {
        echo "⚠️  --staging-url required for class comparison\n";
        return;
    }

    $esDir = __DIR__ . '/../.es';
    $localClasses = loadAllClasses($esDir);
    $stagingClasses = loadStagingClasses($args['staging_url']);

    if (empty($stagingClasses)) {
        echo "❌ Could not load staging classes from {$args['staging_url']}\n";
        return;
    }

    $comparisonIssues = [];
    $issuesByType = [];

    // Compare each local class with staging
    foreach ($localClasses as $id => $localClass) {
        $stagingClass = $stagingClasses[$id] ?? null;

        if (!$stagingClass) {
            $issue = createIssue(
                'CLASS_NOT_IN_STAGING',
                "Local class '$id' does not exist in staging",
                "local",
                $id,
                'WARNING',
                ['class_id' => $id]
            );
            $comparisonIssues[] = $issue;
            $issuesByType['CLASS_NOT_IN_STAGING'][] = $issue;
            continue;
        }

        // Compare properties
        $localProps = $localClass['props'] ?? [];
        $stagingProps = $stagingClass['props'] ?? [];

        $localPropKeys = array_column($localProps, 'key');
        $stagingPropKeys = array_column($stagingProps, 'key');

        // Missing props in staging
        $missingInStaging = array_diff($localPropKeys, $stagingPropKeys);
        foreach ($missingInStaging as $key) {
            $issue = createIssue(
                'PROPERTY_NOT_IN_STAGING',
                "Class '$id' property '$key' does not exist in staging",
                "local",
                $id,
                'WARNING',
                ['class_id' => $id, 'property' => $key]
            );
            $comparisonIssues[] = $issue;
            $issuesByType['PROPERTY_NOT_IN_STAGING'][] = $issue;
        }

        // Extra props in staging (not critical, just informational)
        $extraInStaging = array_diff($stagingPropKeys, $localPropKeys);
        foreach ($extraInStaging as $key) {
            $issue = createIssue(
                'PROPERTY_EXTRA_IN_STAGING',
                "Class '$id' property '$key' exists in staging but not locally",
                "staging",
                $id,
                'INFO',
                ['class_id' => $id, 'property' => $key]
            );
            $comparisonIssues[] = $issue;
            $issuesByType['PROPERTY_EXTRA_IN_STAGING'][] = $issue;
        }

        // Compare property definitions
        $localPropMap = array_column($localProps, null, 'key');
        $stagingPropMap = array_column($stagingProps, null, 'key');

        foreach ($localPropMap as $key => $localProp) {
            if (!isset($stagingPropMap[$key])) continue;

            $stagingProp = $stagingPropMap[$key];

            // Compare data_type
            if (($localProp['data_type'] ?? null) !== ($stagingProp['data_type'] ?? null)) {
                $issue = createIssue(
                    'PROPERTY_TYPE_MISMATCH',
                    "Class '$id' property '$key' type mismatch: local={$localProp['data_type']}, staging={$stagingProp['data_type']}",
                    "local",
                    $id,
                    'CRITICAL',
                    [
                        'class_id' => $id,
                        'property' => $key,
                        'local_type' => $localProp['data_type'] ?? null,
                        'staging_type' => $stagingProp['data_type'] ?? null,
                    ]
                );
                $comparisonIssues[] = $issue;
                $issuesByType['PROPERTY_TYPE_MISMATCH'][] = $issue;
            }

            // Compare flags
            $localFlags = $localProp['flags'] ?? [];
            $stagingFlags = $stagingProp['flags'] ?? [];

            foreach ($localFlags as $flagName => $flagValue) {
                $stagingFlagValue = $stagingFlags[$flagName] ?? false;
                if ($flagValue !== $stagingFlagValue) {
                    $issue = createIssue(
                        'PROPERTY_FLAG_MISMATCH',
                        "Class '$id' property '$key' flag '$flagName' mismatch: local=$flagValue, staging=$stagingFlagValue",
                        "local",
                        $id,
                        'WARNING',
                        [
                            'class_id' => $id,
                            'property' => $key,
                            'flag' => $flagName,
                            'local' => $flagValue,
                            'staging' => $stagingFlagValue,
                        ]
                    );
                    $comparisonIssues[] = $issue;
                    $issuesByType['PROPERTY_FLAG_MISMATCH'][] = $issue;
                }
            }
        }
    }

    // Check for classes in staging but not local
    foreach ($stagingClasses as $id => $stagingClass) {
        if (!isset($localClasses[$id])) {
            $issue = createIssue(
                'CLASS_EXTRA_IN_STAGING',
                "Class '$id' exists in staging but not locally",
                "staging",
                $id,
                'INFO',
                ['class_id' => $id]
            );
            $comparisonIssues[] = $issue;
            $issuesByType['CLASS_EXTRA_IN_STAGING'][] = $issue;
        }
    }

    $report['class_comparison'] = [
        'local_count' => count($localClasses),
        'staging_count' => count($stagingClasses),
        'total_issues' => count($comparisonIssues),
        'issues' => $comparisonIssues,
        'by_type' => $issuesByType,
    ];

    // Update summary
    foreach ($issuesByType as $type => $typeIssues) {
        if (!isset($report['summary']['by_type'][$type])) {
            $report['summary']['by_type'][$type] = 0;
        }
        $report['summary']['by_type'][$type] += count($typeIssues);
        foreach ($typeIssues as $issue) {
            if ($issue['severity'] === 'CRITICAL') {
                $report['summary']['critical_issues']++;
            } elseif ($issue['severity'] === 'WARNING') {
                $report['summary']['warnings']++;
            }
        }
    }

    $report['summary']['total_issues'] += count($comparisonIssues);
}

function createIssue($type, $message, $file, $id, $severity = 'WARNING', $details = []) {
    return [
        'type' => $type,
        'message' => $message,
        'file' => $file,
        'object_id' => $id,
        'severity' => $severity,
        'details' => $details,
    ];
}

function loadAllClasses($esDir) {
    $classes = [];

    // First load from genesis files (have version/description/classes structure)
    foreach (glob("$esDir/*.genesis.json") as $file) {
        $data = json_decode(file_get_contents($file), true);
        if (!is_array($data)) continue;

        // Genesis files have { version, description, classes: [...] }
        if (isset($data['classes']) && is_array($data['classes'])) {
            foreach ($data['classes'] as $item) {
                if (is_array($item) && ($item['class_id'] ?? null) === '@class') {
                    $classId = $item['id'] ?? null;
                    if ($classId) {
                        $classes[$classId] = $item;
                    }
                }
            }
        }
    }

    // Then load from runtime JSON files (might have single objects or arrays)
    foreach (glob("$esDir/*.json") as $file) {
        // Skip genesis and seed files
        if (strpos(basename($file), '.genesis.json') !== false ||
            strpos(basename($file), '.seed.json') !== false) {
            continue;
        }

        $data = json_decode(file_get_contents($file), true);
        if (!is_array($data)) continue;

        // Check if it's a single class definition object
        if (($data['class_id'] ?? null) === '@class') {
            $classId = $data['id'] ?? null;
            if ($classId) {
                $classes[$classId] = $data;
            }
        }
    }

    return $classes;
}

function loadStagingClasses($url) {
    $classes = [];

    // Try to fetch class registry from staging server
    $url = rtrim($url, '/');
    $endpoints = [
        '/query/@class',
        '/api/classes',
        '/classes',
    ];

    foreach ($endpoints as $endpoint) {
        $response = @file_get_contents("$url$endpoint");
        if ($response) {
            $data = json_decode($response, true);
            if (is_array($data)) {
                foreach ($data as $item) {
                    if (is_array($item) && isset($item['id'])) {
                        $classes[$item['id']] = $item;
                    }
                }
                if (!empty($classes)) {
                    return $classes;
                }
            }
        }
    }

    return [];
}

function isValidDateTime($value) {
    if (!is_string($value)) return false;
    $d = DateTime::createFromFormat('Y-m-d\TH:i:s\Z', $value);
    return $d && $d->format('Y-m-d\TH:i:s\Z') === $value;
}

function printReport($report, $args) {
    echo "\n╔════════════════════════════════════════════════════════════════╗\n";
    echo "║           ElementStore Validation & Comparison Report          ║\n";
    echo "╚════════════════════════════════════════════════════════════════╝\n\n";

    // Summary
    echo "📊 SUMMARY\n";
    echo "──────────────────────────────────────────────────────────────────\n";
    printf("  Total Issues:      %3d\n", $report['summary']['total_issues']);
    printf("  Critical Issues:   %3d 🔴\n", $report['summary']['critical_issues']);
    printf("  Warnings:          %3d 🟡\n", $report['summary']['warnings']);
    echo "\n  Issues by Type:\n";

    if (!empty($report['summary']['by_type'])) {
        arsort($report['summary']['by_type']);
        foreach ($report['summary']['by_type'] as $type => $count) {
            printf("    • %-40s %3d\n", $type, $count);
        }
    }

    // Object Validation Results
    if (!empty($report['object_validation'])) {
        echo "\n\n📋 OBJECT VALIDATION\n";
        echo "──────────────────────────────────────────────────────────────────\n";
        printf("  Total Objects Validated: %d\n", $report['object_validation']['total_validated']);
        printf("  Total Issues Found:      %d\n", $report['object_validation']['total_issues']);

        if (!empty($report['object_validation']['issues'])) {
            echo "\n  Issues by Severity:\n\n";
            printIssueTable($report['object_validation']['issues'], $args);
        }
    }

    // Class Comparison Results
    if (!empty($report['class_comparison'])) {
        echo "\n\n🔄 CLASS COMPARISON (Local vs Staging)\n";
        echo "──────────────────────────────────────────────────────────────────\n";
        printf("  Local Classes:   %d\n", $report['class_comparison']['local_count']);
        printf("  Staging Classes: %d\n", $report['class_comparison']['staging_count']);
        printf("  Total Issues:    %d\n", $report['class_comparison']['total_issues']);

        if (!empty($report['class_comparison']['issues'])) {
            echo "\n  Issues by Type:\n\n";
            printIssueTable($report['class_comparison']['issues'], $args);
        }
    }

    // Group by type for easy fixing
    if ($args['fix_by_type'] && !empty($report['summary']['by_type'])) {
        echo "\n\n🔧 FIXES BY TYPE (for bulk resolution)\n";
        echo "──────────────────────────────────────────────────────────────────\n";

        $allIssues = array_merge(
            $report['object_validation']['issues'] ?? [],
            $report['class_comparison']['issues'] ?? []
        );

        $byType = [];
        foreach ($allIssues as $issue) {
            $type = $issue['type'];
            if (!isset($byType[$type])) {
                $byType[$type] = [];
            }
            $byType[$type][] = $issue;
        }

        foreach ($byType as $type => $issues) {
            echo "\n  [$type] - " . count($issues) . " issues\n";
            echo "  " . str_repeat("─", 62) . "\n";

            // Show first few
            foreach (array_slice($issues, 0, 3) as $issue) {
                printf("    • %s (in %s)\n", $issue['message'], basename($issue['file']));
            }

            if (count($issues) > 3) {
                printf("    • ... and %d more\n", count($issues) - 3);
            }
        }
    }

    echo "\n";
}

function printIssueTable($issues, $args) {
    usort($issues, function ($a, $b) {
        $severityMap = ['CRITICAL' => 3, 'WARNING' => 2, 'INFO' => 1];
        $aSev = $severityMap[$a['severity']] ?? 0;
        $bSev = $severityMap[$b['severity']] ?? 0;
        return $bSev <=> $aSev;
    });

    foreach (array_slice($issues, 0, 20) as $issue) {
        $icon = match ($issue['severity']) {
            'CRITICAL' => '🔴',
            'WARNING' => '🟡',
            default => '🔵',
        };

        printf("  %s [%-30s] %s\n", $icon, $issue['type'], $issue['message']);
        printf("     └─ %s:%s\n", basename($issue['file']), $issue['object_id']);

        if ($args['verbose'] && !empty($issue['details'])) {
            echo "       Details: " . json_encode($issue['details']) . "\n";
        }
    }

    if (count($issues) > 20) {
        printf("  ... and %d more issues\n", count($issues) - 20);
    }
}
