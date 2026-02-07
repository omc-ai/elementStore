#!/usr/bin/env php
<?php
/**
 * ElementStore Storage Test Script
 *
 * Tests the storage system by:
 * 1. Checking database connectivity
 * 2. Verifying GET operations work
 * 3. Testing CREATE/UPDATE with the new setobj() signature
 * 4. Verifying genesis data is properly seeded
 *
 * Usage:
 *   php test.php                    # Run all tests
 *   php test.php --verbose          # Verbose output
 *   php test.php --url=<url>        # Custom API URL
 */

require_once __DIR__ . '/Genesis.php';

use ElementStore\Genesis\Genesis;

// Parse command line arguments
$options = getopt('', ['verbose', 'url:', 'help']);

if (isset($options['help'])) {
    echo <<<HELP
ElementStore Storage Tests

Usage:
  php test.php [options]

Options:
  --verbose   Show detailed test output
  --url=URL   Custom API URL
  --help      Show this help message

HELP;
    exit(0);
}

$verbose = isset($options['verbose']);
$apiUrl = $options['url']
    ?? getenv('ELEMENTSTORE_API_URL')
    ?: 'http://wallet-bo.master.local/elementStore';

echo "ElementStore Storage Tests\n";
echo "==========================\n";
echo "API URL: {$apiUrl}\n\n";

$tests = [];
$passed = 0;
$failed = 0;

// Test helper functions
function test(string $name, callable $testFn, bool $verbose): bool
{
    global $passed, $failed;

    echo "Testing: {$name}... ";

    try {
        $result = $testFn();
        if ($result === true || (is_array($result) && ($result['success'] ?? false))) {
            echo "\033[32mPASS\033[0m\n";
            if ($verbose && is_array($result) && isset($result['message'])) {
                echo "  → {$result['message']}\n";
            }
            $passed++;
            return true;
        } else {
            $msg = is_array($result) ? ($result['error'] ?? 'Unknown error') : 'Test returned false';
            echo "\033[31mFAIL\033[0m - {$msg}\n";
            $failed++;
            return false;
        }
    } catch (Exception $e) {
        echo "\033[31mFAIL\033[0m - Exception: {$e->getMessage()}\n";
        $failed++;
        return false;
    }
}

function apiGet(string $url): ?array
{
    $context = stream_context_create([
        'http' => [
            'method' => 'GET',
            'header' => "Accept: application/json\r\n",
            'ignore_errors' => true,
        ],
    ]);
    $response = @file_get_contents($url, false, $context);
    return $response ? json_decode($response, true) : null;
}

function apiPost(string $url, array $data, array $headers = []): ?array
{
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
    return $response ? json_decode($response, true) : null;
}

function apiPut(string $url, array $data, array $headers = []): ?array
{
    $headerStr = "Content-Type: application/json\r\nAccept: application/json\r\n";
    foreach ($headers as $key => $value) {
        $headerStr .= "{$key}: {$value}\r\n";
    }

    $context = stream_context_create([
        'http' => [
            'method' => 'PUT',
            'header' => $headerStr,
            'content' => json_encode($data),
            'ignore_errors' => true,
        ],
    ]);
    $response = @file_get_contents($url, false, $context);
    return $response ? json_decode($response, true) : null;
}

function apiDelete(string $url): ?array
{
    $context = stream_context_create([
        'http' => [
            'method' => 'DELETE',
            'header' => "Accept: application/json\r\n",
            'ignore_errors' => true,
        ],
    ]);
    $response = @file_get_contents($url, false, $context);
    return $response ? json_decode($response, true) : null;
}

// ============================================================================
// TEST 1: API Health Check
// ============================================================================
test('API Health Check', function () use ($apiUrl) {
    $result = apiGet("{$apiUrl}/health");
    if (!$result) {
        return ['success' => false, 'error' => 'Could not connect to API'];
    }
    if (($result['status'] ?? '') !== 'ok') {
        return ['success' => false, 'error' => 'API health check failed'];
    }
    return ['success' => true, 'message' => "API v{$result['version']} is healthy"];
}, $verbose);

// ============================================================================
// TEST 2: Genesis Verification
// ============================================================================
test('Genesis Data Exists', function () use ($apiUrl) {
    $genesis = new Genesis($apiUrl);
    $result = $genesis->verify();

    if (!$result['valid']) {
        return ['success' => false, 'error' => 'Missing: ' . implode(', ', $result['missing'])];
    }
    return ['success' => true, 'message' => 'All genesis data verified'];
}, $verbose);

// ============================================================================
// TEST 3: GET Classes
// ============================================================================
test('GET /class returns classes', function () use ($apiUrl) {
    $result = apiGet("{$apiUrl}/class");
    if (!$result || !is_array($result)) {
        return ['success' => false, 'error' => 'No classes returned'];
    }
    if (count($result) < 5) {
        return ['success' => false, 'error' => 'Expected at least 5 system classes, got ' . count($result)];
    }
    return ['success' => true, 'message' => count($result) . ' classes found'];
}, $verbose);

// ============================================================================
// TEST 4: GET Single Class
// ============================================================================
test('GET /class/@class returns class definition', function () use ($apiUrl) {
    $result = apiGet("{$apiUrl}/class/@class");
    if (!$result || isset($result['error'])) {
        return ['success' => false, 'error' => $result['error'] ?? 'No result'];
    }
    if (($result['id'] ?? '') !== '@class') {
        return ['success' => false, 'error' => 'Wrong class returned'];
    }
    if (!isset($result['props']) || !is_array($result['props'])) {
        return ['success' => false, 'error' => 'No props array'];
    }
    return ['success' => true, 'message' => 'Class @class has ' . count($result['props']) . ' props'];
}, $verbose);

// ============================================================================
// TEST 5: GET Editors
// ============================================================================
test('GET /store/@editor returns editors', function () use ($apiUrl) {
    $result = apiGet("{$apiUrl}/store/@editor");
    if (!$result || !is_array($result)) {
        return ['success' => false, 'error' => 'No editors returned'];
    }
    if (count($result) < 10) {
        return ['success' => false, 'error' => 'Expected at least 10 editors, got ' . count($result)];
    }
    // Check for javascript editor (new function type)
    $hasJavascript = false;
    foreach ($result as $editor) {
        if (($editor['id'] ?? '') === 'javascript') {
            $hasJavascript = true;
            break;
        }
    }
    if (!$hasJavascript) {
        return ['success' => false, 'error' => 'Missing javascript editor for function type'];
    }
    return ['success' => true, 'message' => count($result) . ' editors found, including javascript'];
}, $verbose);

// ============================================================================
// TEST 6: Create Test Object
// ============================================================================
$testClassId = 'test_storage';
$testObjId = null;

test('POST /class creates test class', function () use ($apiUrl, $testClassId) {
    $result = apiPost("{$apiUrl}/class", [
        'id' => $testClassId,
        'name' => 'Storage Test Class',
        'description' => 'Temporary class for testing storage',
        'props' => [
            ['key' => 'title', 'label' => 'Title', 'data_type' => 'string', 'required' => true],
            ['key' => 'count', 'label' => 'Count', 'data_type' => 'number', 'default_value' => 0],
            ['key' => 'active', 'label' => 'Active', 'data_type' => 'boolean', 'default_value' => true],
            ['key' => 'handler', 'label' => 'Handler', 'data_type' => 'function', 'editor' => ['type' => 'javascript']],
        ],
    ]);

    if (!$result || isset($result['error'])) {
        return ['success' => false, 'error' => $result['error'] ?? 'Create failed'];
    }
    return ['success' => true, 'message' => "Created class {$testClassId}"];
}, $verbose);

// ============================================================================
// TEST 7: Create Object with Function Data Type
// ============================================================================
test('POST /store creates object with function type', function () use ($apiUrl, $testClassId, &$testObjId) {
    $result = apiPost("{$apiUrl}/store/{$testClassId}", [
        'title' => 'Test Object',
        'count' => 42,
        'active' => true,
        'handler' => 'function(obj) { return obj.count * 2; }',
    ]);

    if (!$result || isset($result['error'])) {
        return ['success' => false, 'error' => $result['error'] ?? 'Create failed'];
    }
    if (!isset($result['id'])) {
        return ['success' => false, 'error' => 'No ID returned'];
    }
    $testObjId = $result['id'];
    return ['success' => true, 'message' => "Created object {$testObjId}"];
}, $verbose);

// ============================================================================
// TEST 8: GET Created Object
// ============================================================================
test('GET /store retrieves created object', function () use ($apiUrl, $testClassId, &$testObjId) {
    if (!$testObjId) {
        return ['success' => false, 'error' => 'No test object ID'];
    }

    $result = apiGet("{$apiUrl}/store/{$testClassId}/{$testObjId}");

    if (!$result || isset($result['error'])) {
        return ['success' => false, 'error' => $result['error'] ?? 'Get failed'];
    }
    if (($result['title'] ?? '') !== 'Test Object') {
        return ['success' => false, 'error' => 'Title mismatch'];
    }
    if (($result['count'] ?? -1) !== 42) {
        return ['success' => false, 'error' => 'Count mismatch'];
    }
    if (($result['handler'] ?? '') !== 'function(obj) { return obj.count * 2; }') {
        return ['success' => false, 'error' => 'Handler (function) mismatch'];
    }
    return ['success' => true, 'message' => 'Object data verified'];
}, $verbose);

// ============================================================================
// TEST 9: Update Object
// ============================================================================
test('PUT /store updates object', function () use ($apiUrl, $testClassId, &$testObjId) {
    if (!$testObjId) {
        return ['success' => false, 'error' => 'No test object ID'];
    }

    $result = apiPut("{$apiUrl}/store/{$testClassId}/{$testObjId}", [
        'title' => 'Updated Test Object',
        'count' => 100,
        'handler' => 'function(obj) { return obj.title.toUpperCase(); }',
    ]);

    if (!$result || isset($result['error'])) {
        return ['success' => false, 'error' => $result['error'] ?? 'Update failed'];
    }

    // Verify the update
    $verify = apiGet("{$apiUrl}/store/{$testClassId}/{$testObjId}");
    if (($verify['title'] ?? '') !== 'Updated Test Object') {
        return ['success' => false, 'error' => 'Title not updated'];
    }
    if (($verify['count'] ?? -1) !== 100) {
        return ['success' => false, 'error' => 'Count not updated'];
    }
    return ['success' => true, 'message' => 'Object updated and verified'];
}, $verbose);

// ============================================================================
// TEST 10: Query Objects
// ============================================================================
test('GET /query returns filtered results', function () use ($apiUrl, $testClassId) {
    $result = apiGet("{$apiUrl}/query/{$testClassId}?active=true");

    if (!$result || !is_array($result)) {
        return ['success' => false, 'error' => 'Query failed'];
    }
    return ['success' => true, 'message' => count($result) . ' objects matched query'];
}, $verbose);

// ============================================================================
// TEST 11: Delete Test Object
// ============================================================================
test('DELETE /store deletes object', function () use ($apiUrl, $testClassId, &$testObjId) {
    if (!$testObjId) {
        return ['success' => false, 'error' => 'No test object ID'];
    }

    $result = apiDelete("{$apiUrl}/store/{$testClassId}/{$testObjId}");

    if (!$result || !($result['deleted'] ?? false)) {
        return ['success' => false, 'error' => 'Delete failed'];
    }

    // Verify deletion
    $verify = apiGet("{$apiUrl}/store/{$testClassId}/{$testObjId}");
    if ($verify && !isset($verify['error'])) {
        return ['success' => false, 'error' => 'Object still exists after delete'];
    }
    return ['success' => true, 'message' => 'Object deleted'];
}, $verbose);

// ============================================================================
// TEST 12: Delete Test Class
// ============================================================================
test('DELETE /class deletes test class', function () use ($apiUrl, $testClassId) {
    $result = apiDelete("{$apiUrl}/class/{$testClassId}");

    if (!$result || !($result['deleted'] ?? false)) {
        return ['success' => false, 'error' => 'Delete class failed'];
    }
    return ['success' => true, 'message' => "Cleaned up test class {$testClassId}"];
}, $verbose);

// ============================================================================
// Summary
// ============================================================================
echo "\n";
echo "==========================\n";
echo "Results: \033[32m{$passed} passed\033[0m, \033[31m{$failed} failed\033[0m\n";

if ($failed === 0) {
    echo "\n\033[32mAll storage tests passed!\033[0m\n";
    exit(0);
} else {
    echo "\n\033[31mSome tests failed.\033[0m\n";
    exit(1);
}
