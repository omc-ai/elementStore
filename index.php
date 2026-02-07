<?php
/**
 * ElementStore API Router
 *
 * Returns data directly with HTTP status codes.
 * 200/201 = success (data)
 * 400/404/500 = error (error message)
 *
 * =============================================================================
 * CODING STANDARDS
 * =============================================================================
 *
 * 1. Object Creation - Use variables, not inline new:
 *
 *    WRONG:
 *    (new Prop('key', 'string'))->setLabel('Key')->setRequired(true)
 *
 *    CORRECT:
 *    $prop = new Prop('key', 'string');
 *    $prop->setLabel('Key')->setRequired(true);
 *
 * 2. AtomObj Constructor Pattern:
 *    - First param: $class_id (string)
 *    - Second param: $props (array) for extra data
 *    - Third param: $di (optional DI container)
 *
 *    Example:
 *    $obj = new AtomObj('user', ['name' => 'John']);
 *    $obj->custom_field = 'value';  // goes to extraData via __set
 *    $obj->toArray();               // merges public props with extraData
 *
 * 3. Prop/ClassMeta extend AtomObj:
 *    $prop = new Prop('email', Constants::DT_STRING);
 *    $prop->setLabel('Email');
 *
 *    $meta = new ClassMeta(['id' => 'user', 'name' => 'User']);
 *
 * 4. Access Model from objects via DI:
 *    $model = $obj->getModel();
 *    $related = $model->getObject('profile', $obj->profile_id);
 *
 * =============================================================================
 */

use Phalcon\Di\FactoryDefault;
use Phalcon\Mvc\Micro;
use Phalcon\Http\Response;

error_reporting(E_ALL);
ini_set('display_errors', 0);

require_once __DIR__ . '/autoload.php';

use ElementStore\Constants;
use ElementStore\ClassModel;
use ElementStore\ClassMeta;
use ElementStore\StorageException;

if (!extension_loaded('phalcon')) {
    http_response_code(500);
    echo json_encode(['error' => 'Phalcon extension not loaded']);
    exit;
}

// Get user ID from header (X-User-Id) if available
$userId = $_SERVER['HTTP_X_USER_ID'] ?? null;

$model = ClassModel::boot(__DIR__, $userId);

// Disable ownership enforcement for testing (can be controlled via header)
if (isset($_SERVER['HTTP_X_DISABLE_OWNERSHIP']) && $_SERVER['HTTP_X_DISABLE_OWNERSHIP'] === 'true') {
    $model->setEnforceOwnership(false);
}

// Allow custom IDs for seeding/testing (can be controlled via header)
if (isset($_SERVER['HTTP_X_ALLOW_CUSTOM_IDS']) && $_SERVER['HTTP_X_ALLOW_CUSTOM_IDS'] === 'true') {
    $model->setAllowCustomIds(true);
}

$di = new FactoryDefault();
$di->setShared('model', $model);

$app = new Micro($di);

// CORS
$app->before(function () use ($app) {
    $app->response->setHeader('Access-Control-Allow-Origin', '*');
    $app->response->setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    $app->response->setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, token, X-User-Id, X-Disable-Ownership, X-Allow-Custom-Ids');
    $app->response->setContentType('application/json', 'UTF-8');

    if ($app->request->isOptions()) {
        $app->response->setStatusCode(200)->send();
        exit;
    }
    return true;
});

// Response helpers - return data directly
function json($data, $code = 200): Response
{
    return (new Response())->setStatusCode($code)->setJsonContent($data);
}

function error($message, $code = 400, $details = null): Response
{
    $content = ['error' => $message];
    if ($details) $content['details'] = $details;
    return (new Response())->setStatusCode($code)->setJsonContent($content);
}

/**
 * Handle exception and return appropriate response
 */
function handleException(\Exception $e): Response
{
    if ($e instanceof StorageException) {
        $code = match ($e->getErrorCode()) {
            'not_found' => 404,
            'forbidden' => 403,
            'validation_failed' => 400,
            default => 400,
        };
        return error($e->getMessage(), $code, $e->getErrors() ?: null);
    }

    // Try to parse JSON error from legacy format
    $decoded = json_decode($e->getMessage(), true);
    if ($decoded) {
        return error($decoded['error'] ?? $e->getMessage(), 400, $decoded['errors'] ?? null);
    }

    return error($e->getMessage());
}

// =============================================================================
// HEALTH & INFO
// =============================================================================

$app->get('/health', fn() => json(['status' => 'ok', 'service' => 'elementStore', 'version' => '2.0.0']));

$app->get('/info', fn() => json([
    'name' => 'ElementStore API',
    'version' => '2.1.0',
    'endpoints' => [
        'GET /health' => 'Health check',
        'GET /class' => 'List all classes',
        'GET /class/{id}' => 'Get class with properties',
        'GET /class/{id}/props' => 'Get class properties (includes inherited)',
        'POST /class' => 'Create/update class',
        'DELETE /class/{id}' => 'Delete class',
        'GET /store/{class}' => 'List objects',
        'GET /store/{class}/{id}' => 'Get object',
        'GET /find/{id}' => 'Find object by ID across all classes',
        'GET /store/{class}/{id}/{prop}' => 'Get property (resolves relations)',
        'PUT /store/{class}/{id}/{prop}' => 'Set property',
        'POST /store/{class}' => 'Create object',
        'PUT /store/{class}/{id}' => 'Update object',
        'DELETE /store/{class}/{id}' => 'Delete object',
        'GET /query/{class}' => 'Query objects',
        'POST /reset' => 'Reset data',
        'POST /test' => 'Run tests',
        'POST /genesis' => 'Initialize genesis data',
        'GET /genesis' => 'Verify genesis data',
        'GET /genesis/data' => 'Export genesis data as JSON'
    ]
]));

// =============================================================================
// CLASS OPERATIONS
// =============================================================================

$app->get('/class', function () use ($app) {
    /** @var ClassModel $model */
    $model = $app->di->get('model');
    $classes = $model->getAllClasses();
    return json(array_map(fn($c) => $c->toArray(), $classes));
});

$app->get('/class/{id}', function ($id) use ($app) {
    /** @var ClassModel $model */
    $model = $app->di->get('model');
    $class = $model->getClass($id);
    return $class ? json($class->toArray()) : error("Class not found: {$id}", 404);
});

$app->get('/class/{id}/props', function ($id) use ($app) {
    /** @var ClassModel $model */
    $model = $app->di->get('model');
    $props = $model->getClassProps($id);
    return json(array_map(fn($p) => $p->toArray(), $props));
});

$app->post('/class', function () use ($app) {
    $input = $app->request->getJsonRawBody(true);
    if (empty($input[Constants::F_ID])) return error('Class id required');
    try {
        /** @var ClassModel $model */
        $model = $app->di->get('model');
        $result = $model->setObject(Constants::K_CLASS, $input);
        return json($result->toArray(), 201);
    } catch (\Exception $e) {
        return handleException($e);
    }
});

$app->delete('/class/{id}', function ($id) use ($app) {
    /** @var ClassModel $model */
    $model = $app->di->get('model');
    return $model->deleteClass($id)
        ? json(['deleted' => true, 'id' => $id])
        : error("Class not found: {$id}", 404);
});

// =============================================================================
// OBJECT OPERATIONS
// =============================================================================

// List all objects of a class
$app->get('/store/{class}', function ($c) use ($app) {
    /** @var ClassModel $model */
    $model = $app->di->get('model');
    $objects = $model->query($c);
    return json(array_map(fn($o) => $o->toArray(), $objects));
});

// Get single object by ID
$app->get('/store/{class}/{id}', function ($c, $id) use ($app) {
    /** @var ClassModel $model */
    $model = $app->di->get('model');
    $result = $model->getObject($c, $id);
    return $result ? json($result->toArray()) : error("Not found: {$c}/{$id}", 404);
});

// GET /store/{class}/{id}/{prop} - Get property value (resolves relations)
$app->get('/store/{class}/{id}/{prop}', function ($c, $id, $prop) use ($app) {
    /** @var ClassModel $model */
    $model = $app->di->get('model');
    $obj = $model->getObject($c, $id);

    if (!$obj) return error("Not found: {$c}/{$id}", 404);

    $objArray = $obj->toArray();
    if (!array_key_exists($prop, $objArray)) return error("Property not found: {$prop}", 404);

    $value = $objArray[$prop];

    // Check if relation - fetch related object(s)
    $classMeta = $model->getClass($c);
    if ($classMeta) {
        $propDef = $classMeta->getProp($prop);
        if ($propDef && $propDef->data_type === Constants::DT_RELATION && $propDef->object_class_id) {
            if ($propDef->is_array && is_array($value)) {
                // HasMany
                $related = [];
                foreach ($value as $relId) {
                    $relObj = $model->getObject($propDef->object_class_id, $relId);
                    if ($relObj) $related[] = $relObj->toArray();
                }
                return json($related);
            } else {
                // HasOne
                $relObj = $model->getObject($propDef->object_class_id, $value);
                return $relObj ? json($relObj->toArray()) : json(null);
            }
        }
    }

    return json($value);
});

// PUT /store/{class}/{id}/{prop} - Set property value
$app->put('/store/{class}/{id}/{prop}', function ($c, $id, $prop) use ($app) {
    /** @var ClassModel $model */
    $model = $app->di->get('model');
    $obj = $model->getObject($c, $id);

    if (!$obj) return error("Not found: {$c}/{$id}", 404);

    $input = $app->request->getJsonRawBody(true);
    $value = $input['value'] ?? $input;

    try {
        $result = $model->setObject($c, [
            Constants::F_ID => $id,
            $prop => $value
        ]);
        return json($result->toArray());
    } catch (\Exception $e) {
        return handleException($e);
    }
});

// Create new object
$app->post('/store/{class}', function ($c) use ($app) {
    $input = $app->request->getJsonRawBody(true);
    if (empty($input)) return error('Body required');

    try {
        /** @var ClassModel $model */
        $model = $app->di->get('model');
        $result = $model->setObject($c, $input);
        return json($result->toArray(), 201);
    } catch (\Exception $e) {
        return handleException($e);
    }
});

// Update existing object
$app->put('/store/{class}/{id}', function ($c, $id) use ($app) {
    $input = $app->request->getJsonRawBody(true);
    if (empty($input)) return error('Body required');
    $input[Constants::F_ID] = $id;

    try {
        /** @var ClassModel $model */
        $model = $app->di->get('model');
        $result = $model->setObject($c, $input);
        return json($result->toArray());
    } catch (\Exception $e) {
        return handleException($e);
    }
});

// Delete object
$app->delete('/store/{class}/{id}', function ($c, $id) use ($app) {
    /** @var ClassModel $model */
    $model = $app->di->get('model');
    return $model->deleteObject($c, $id)
        ? json(['deleted' => true, 'id' => $id])
        : error("Not found: {$c}/{$id}", 404);
});

// =============================================================================
// FIND BY ID (cross-class lookup)
// =============================================================================

$app->get('/find/{id}', function ($id) use ($app) {
    /** @var ClassModel $model */
    $model = $app->di->get('model');
    $classes = $model->getAllClasses();
    foreach ($classes as $class) {
        if (str_starts_with($class->id, '@')) continue; // skip system classes
        try {
            $obj = $model->getObject($class->id, $id);
            if ($obj) return json($obj->toArray());
        } catch (\Exception $e) {
            // not found in this class, continue
        }
    }
    return error("Not found: {$id}", 404);
});

// =============================================================================
// QUERY
// =============================================================================

$app->get('/query/{class}', function ($c) use ($app) {
    parse_str($_SERVER['QUERY_STRING'] ?? '', $q);
    $filters = $options = [];
    foreach ($q as $k => $v) {
        match ($k) {
            '_sort' => $options['sort'] = $v,
            '_order' => $options['sortDir'] = $v,
            '_limit' => $options['limit'] = (int)$v,
            '_offset' => $options['offset'] = (int)$v,
            default => !str_starts_with($k, '_') ? $filters[$k] = $v : null
        };
    }
    /** @var ClassModel $model */
    $model = $app->di->get('model');
    $results = $model->query($c, $filters, $options);
    return json(array_map(fn($o) => $o->toArray(), $results));
});

// =============================================================================
// RESET / TEST
// =============================================================================

$app->post('/reset', function () use ($app) {
    try {
        /** @var ClassModel $model */
        $model = $app->di->get('model');
        return json($model->reset());
    } catch (\Exception $e) {
        return handleException($e);
    }
});

$app->post('/test', function () use ($app) {
    try {
        /** @var ClassModel $model */
        $model = $app->di->get('model');
        return json($model->runTests());
    } catch (\Exception $e) {
        return handleException($e);
    }
});

// =============================================================================
// GENESIS - Initialization & Seeding
// =============================================================================

use ElementStore\Genesis\Genesis;

// Initialize genesis data (skip existing by default)
$app->post('/genesis', function () use ($app) {
    try {
        $input = $app->request->getJsonRawBody(true) ?? [];
        $force = $input['force'] ?? false;

        // Build API URL from current request
        $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
        $basePath = dirname($_SERVER['REQUEST_URI'] ?? '/elementStore');
        $apiUrl = "{$protocol}://{$host}{$basePath}";

        $genesis = new Genesis($apiUrl);
        $result = $genesis->init($force);

        return json($result, $result['success'] ? 200 : 500);
    } catch (\Exception $e) {
        return handleException($e);
    }
});

// Verify genesis data
$app->get('/genesis', function () use ($app) {
    try {
        $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
        $basePath = dirname($_SERVER['REQUEST_URI'] ?? '/elementStore');
        $apiUrl = "{$protocol}://{$host}{$basePath}";

        $genesis = new Genesis($apiUrl);
        $result = $genesis->verify();

        return json($result, $result['valid'] ? 200 : 500);
    } catch (\Exception $e) {
        return handleException($e);
    }
});

// Get genesis data export
$app->get('/genesis/data', function () use ($app) {
    try {
        $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
        $basePath = dirname($_SERVER['REQUEST_URI'] ?? '/elementStore');
        $apiUrl = "{$protocol}://{$host}{$basePath}";

        $genesis = new Genesis($apiUrl);
        return json($genesis->getGenesisData());
    } catch (\Exception $e) {
        return handleException($e);
    }
});

// =============================================================================
// EXPORT / HISTORY
// =============================================================================

$app->post('/export', function () use ($app) {
    try {
        /** @var ClassModel $model */
        $model = $app->di->get('model');
        $model->setEnforceOwnership(false);

        // Collect all data
        $exportData = [
            'exported_at' => date('c'),
            'version' => '2.0.0',
            'classes' => [],
            'data' => []
        ];

        // Get all classes
        $classes = $model->getAllClasses();
        foreach ($classes as $class) {
            $classArray = $class->toArray();
            $exportData['classes'][] = $classArray;

            // Skip system classes for data export
            if (!str_starts_with($class->id, '@')) {
                $objects = $model->query($class->id);
                if (!empty($objects)) {
                    $exportData['data'][$class->id] = array_map(fn($o) => $o->toArray(), $objects);
                }
            }
        }

        // Generate hash of data (excluding timestamp for deduplication)
        $hashData = $exportData;
        unset($hashData['exported_at']);
        $hash = substr(md5(json_encode($hashData)), 0, 12);

        // Create exports directory if not exists
        $exportsDir = dirname(__DIR__) . '/data/exports';
        if (!is_dir($exportsDir)) {
            mkdir($exportsDir, 0755, true);
        }

        $filename = "export_{$hash}.json";
        $filepath = "{$exportsDir}/{$filename}";

        // Check if file already exists (same data)
        $isNew = !file_exists($filepath);
        if ($isNew) {
            file_put_contents($filepath, json_encode($exportData, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        }

        return json([
            'success' => true,
            'hash' => $hash,
            'filename' => $filename,
            'url' => "/elementStore/export/{$hash}",
            'is_new' => $isNew,
            'exported_at' => $exportData['exported_at'],
            'stats' => [
                'classes' => count($exportData['classes']),
                'data_classes' => count($exportData['data']),
                'total_objects' => array_sum(array_map('count', $exportData['data']))
            ]
        ]);
    } catch (\Exception $e) {
        return handleException($e);
    }
});

$app->get('/exports', function () use ($app) {
    try {
        $exportsDir = dirname(__DIR__) . '/data/exports';
        $exports = [];

        if (is_dir($exportsDir)) {
            $files = glob("{$exportsDir}/export_*.json");
            foreach ($files as $file) {
                $filename = basename($file);
                preg_match('/export_([a-f0-9]+)\.json/', $filename, $matches);
                $hash = $matches[1] ?? '';

                $data = json_decode(file_get_contents($file), true);
                $exports[] = [
                    'hash' => $hash,
                    'filename' => $filename,
                    'url' => "/elementStore/export/{$hash}",
                    'exported_at' => $data['exported_at'] ?? null,
                    'size' => filesize($file),
                    'stats' => [
                        'classes' => count($data['classes'] ?? []),
                        'data_classes' => count($data['data'] ?? []),
                        'total_objects' => array_sum(array_map('count', $data['data'] ?? []))
                    ]
                ];
            }

            // Sort by date descending
            usort($exports, fn($a, $b) => strcmp($b['exported_at'] ?? '', $a['exported_at'] ?? ''));
        }

        return json($exports);
    } catch (\Exception $e) {
        return handleException($e);
    }
});

$app->get('/export/{hash}', function ($hash) use ($app) {
    $exportsDir = dirname(__DIR__) . '/data/exports';
    $filepath = "{$exportsDir}/export_{$hash}.json";

    if (!file_exists($filepath)) {
        return error("Export not found: {$hash}", 404);
    }

    $response = new Response();
    $response->setHeader('Content-Type', 'application/json');
    $response->setHeader('Content-Disposition', "attachment; filename=\"export_{$hash}.json\"");
    $response->setContent(file_get_contents($filepath));
    return $response;
});

$app->delete('/export/{hash}', function ($hash) use ($app) {
    $exportsDir = dirname(__DIR__) . '/data/exports';
    $filepath = "{$exportsDir}/export_{$hash}.json";

    if (!file_exists($filepath)) {
        return error("Export not found: {$hash}", 404);
    }

    unlink($filepath);
    return json(['deleted' => true, 'hash' => $hash]);
});

// =============================================================================
// 404 & RUN
// =============================================================================

$app->notFound(fn() => error('Endpoint not found', 404));

try {
    $app->handle(strtok($_SERVER['REQUEST_URI'] ?? '/', '?'));
} catch (\Exception $e) {
    (new Response())->setStatusCode(500)->setJsonContent(['error' => $e->getMessage()])->send();
}
