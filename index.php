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
use ElementStore\AuthService;

if (!extension_loaded('phalcon')) {
    http_response_code(500);
    echo json_encode(['error' => 'Phalcon extension not loaded']);
    exit;
}

// =============================================================================
// MODEL BOOT
// =============================================================================

$model = ClassModel::boot(__DIR__);

// Allow custom IDs for seeding/testing (controlled via header)
if (isset($_SERVER['HTTP_X_ALLOW_CUSTOM_IDS']) && $_SERVER['HTTP_X_ALLOW_CUSTOM_IDS'] === 'true') {
    $model->setAllowCustomIds(true);
}

// Disable ownership enforcement (dev only — header-controlled)
if (isset($_SERVER['HTTP_X_DISABLE_OWNERSHIP']) && $_SERVER['HTTP_X_DISABLE_OWNERSHIP'] === 'true') {
    $model->setEnforceOwnership(false);
}

// Bootstrap auth-service: reads auth_config from store, registers app+machine, warms JWKS cache.
// NOOP if no auth_config object exists in the store (auth enforcement disabled).
AuthService::bootstrap($model);

$di = new FactoryDefault();
$di->setShared('model', $model);

$app = new Micro($di);

// CORS (runs first — handles OPTIONS preflight before auth check)
$app->before(function () use ($app) {
    $app->response->setHeader('Access-Control-Allow-Origin', '*');
    $app->response->setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    $app->response->setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-User-Id, X-Disable-Ownership, X-Allow-Custom-Ids');
    $app->response->setContentType('application/json', 'UTF-8');

    if ($app->request->isOptions()) {
        $app->response->setStatusCode(200)->send();
        exit;
    }
    return true;
});

// Auth middleware — verify JWT Bearer token and inject user/app/domain into model.
// Skipped automatically if no auth_config object exists in the store.
$app->before(AuthService::getMiddleware($model));

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
// RESPONSE FILTERING — strip server_only fields from class definitions
// =============================================================================

/**
 * Remove props flagged as server_only from a class definition's props array
 */
function stripServerOnlyProps(array $classData): array
{
    if (!isset($classData[Constants::F_PROPS]) || !is_array($classData[Constants::F_PROPS])) {
        return $classData;
    }
    $classData[Constants::F_PROPS] = array_values(array_filter(
        $classData[Constants::F_PROPS],
        function ($prop) {
            $serverOnly = is_array($prop) ? ($prop['server_only'] ?? false) : false;
            return !$serverOnly;
        }
    ));
    return $classData;
}

// =============================================================================
// HEALTH & INFO
// =============================================================================

$app->get('/health', fn() => json(['status' => 'ok', 'service' => 'elementStore', 'version' => '2.0.0']));

$app->get('/info', fn() => json([
    'name' => 'ElementStore API',
    'version' => '2.2.0',
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
        'PUT /store/{class}/{id}/{prop}' => 'Set property, or execute action if prop data_type=action',
        'POST /store/{class}' => 'Create object',
        'PUT /store/{class}/{id}' => 'Update object',
        'DELETE /store/{class}/{id}' => 'Delete object',
        'GET /query/{class}' => 'Query objects',
        'POST /reset' => 'Reset data',
        'POST /test' => 'Run tests',
        'POST /genesis' => 'Initialize genesis data',
        'GET /genesis' => 'Verify genesis data',
        'GET /genesis/data' => 'Export genesis data as JSON',
        'POST /genesis/reload' => 'Reload genesis from .es/ directory',
        'GET /genesis/files' => 'List genesis/seed files in .es/',
    ],
    'actions' => 'Props with data_type=action are executable via PUT /store/{class}/{id}/{prop}. Body = action params. Returns updated object.',
]));

// =============================================================================
// CLASS OPERATIONS
// =============================================================================

$app->get('/class', function () use ($app) {
    /** @var ClassModel $model */
    $model = $app->di->get('model');
    $classes = $model->getAllClasses();
    return json(array_map(fn($c) => stripServerOnlyProps($c->toArray()), $classes));
});

$app->get('/class/{id}', function ($id) use ($app) {
    /** @var ClassModel $model */
    $model = $app->di->get('model');
    $class = $model->getClass($id);
    return $class ? json(stripServerOnlyProps($class->toArray())) : error("Class not found: {$id}", 404);
});

$app->get('/class/{id}/props', function ($id) use ($app) {
    /** @var ClassModel $model */
    $model = $app->di->get('model');
    $props = $model->getClassProps($id);
    // Filter out server_only props from the response
    $filtered = array_filter($props, fn($p) => !$p->server_only);
    return json(array_map(fn($p) => $p->toArray(), array_values($filtered)));
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
    return json(array_map(fn($o) => $o->toApiArray(), $objects));
});

// Get single object by ID
$app->get('/store/{class}/{id}', function ($c, $id) use ($app) {
    /** @var ClassModel $model */
    $model = $app->di->get('model');
    $result = $model->getObject($c, $id);
    return $result ? json($result->toApiArray()) : error("Not found: {$c}/{$id}", 404);
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

    // Check if relation - use getRelated() with mode support
    $classMeta = $model->getClass($c);
    if ($classMeta) {
        $propDef = $classMeta->getProp($prop);
        if ($propDef && $propDef->data_type === Constants::DT_RELATION && $propDef->hasTargetClasses()) {
            // Support ?mode=query|resolve (default: resolve)
            parse_str($_SERVER['QUERY_STRING'] ?? '', $qp);
            $mode = $qp['mode'] ?? 'resolve';

            $related = $model->getRelated($obj, $prop, $mode);
            $result = array_map(fn($o) => $o->toApiArray(), $related);

            // For single (non-array) relation in resolve mode, return single object
            if (!$propDef->is_array && $mode === 'resolve') {
                return json(!empty($result) ? $result[0] : null);
            }
            return json($result);
        }
    }

    return json($value);
});

// PUT /store/{class}/{id}/{prop} - Set property value OR execute action
$app->put('/store/{class}/{id}/{prop}', function ($c, $id, $prop) use ($app) {
    /** @var ClassModel $model */
    $model = $app->di->get('model');
    $obj = $model->getObject($c, $id);

    if (!$obj) return error("Not found: {$c}/{$id}", 404);

    $input = $app->request->getJsonRawBody(true) ?: [];

    // Check if this prop references an @action (object_class_id includes '@action')
    $objData = $obj->toArray();
    $actionDef = resolveActionForProp($model, $c, $prop, $objData);

    if ($actionDef !== null) {
        // Execute the action — input body = action params
        try {
            $executor = createActionExecutor($model);
            $result = $executor->execute($actionDef, $input, $objData);

            // If action returned data, merge into object and save
            if (is_array($result) && !empty($result)) {
                $merged = array_merge($objData, $result);
                $saved = $model->setObject($c, $merged);
                return json($saved->toApiArray());
            }

            // Action returned nothing — re-read and return current state
            $refreshed = $model->getObject($c, $id);
            return json($refreshed ? $refreshed->toApiArray() : $objData);
        } catch (ActionExecutorException $e) {
            return error("Action '{$prop}' failed: " . $e->getMessage(), $e->getCode() ?: 400);
        } catch (\Exception $e) {
            return handleException($e);
        }
    }

    // Normal property set
    $value = $input['value'] ?? $input;

    try {
        $result = $model->setObject($c, [
            Constants::F_ID => $id,
            $prop => $value
        ]);
        return json($result->toApiArray());
    } catch (\Exception $e) {
        return handleException($e);
    }
});

// Batch upsert — best-effort: save what passes, report errors for the rest
$app->post('/store/{class}/_batch', function ($c) use ($app) {
    $input = $app->request->getJsonRawBody(true);
    if (!is_array($input) || empty($input)) return error('Array of objects required');

    /** @var ClassModel $model */
    $model = $app->di->get('model');
    $batchResult = $model->setObjects($c, $input);

    $httpCode = match(true) {
        $batchResult['summary']['errors'] === 0 => 200,
        $batchResult['summary']['ok'] === 0 => 400,
        default => 207,
    };
    return json($batchResult, $httpCode);
});

// Create new object
$app->post('/store/{class}', function ($c) use ($app) {
    $input = $app->request->getJsonRawBody(true);
    if (empty($input)) return error('Body required');

    try {
        /** @var ClassModel $model */
        $model = $app->di->get('model');
        $result = $model->setObject($c, $input);
        return json($result->toApiArray(), 201);
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
        return json($result->toApiArray());
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
            if ($obj) return json($obj->toApiArray());
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
    return json(array_map(fn($o) => $o->toApiArray(), $results));
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

// Reload genesis from .es/ directory (uses GenesisLoader directly)
// Accepts optional 'dir' param to load from an external .es/ directory
$app->post('/genesis/reload', function () use ($app) {
    try {
        /** @var ClassModel $model */
        $model = $app->di->get('model');
        $loader = $model->getGenesisLoader();
        if (!$loader) {
            return error('Genesis loader not available — ensure .es/ directory exists', 500);
        }
        $input = $app->request->getJsonRawBody(true) ?? [];
        $force = $input['force'] ?? false;
        $dir = $input['dir'] ?? null;

        if ($dir !== null) {
            // Load from external .es/ directory
            $result = $loader->loadExternal($dir, $force);
        } else {
            $result = $loader->load($force);
        }
        return json($result, ($result['success'] ?? false) ? 200 : 500);
    } catch (\Exception $e) {
        return handleException($e);
    }
});

// List genesis/seed files in .es/ directory
$app->get('/genesis/files', function () use ($app) {
    try {
        /** @var ClassModel $model */
        $model = $app->di->get('model');
        $loader = $model->getGenesisLoader();
        if (!$loader) {
            return error('Genesis loader not available — ensure .es/ directory exists', 500);
        }
        return json($loader->scanFiles());
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
// DIRECT ACTION EXECUTION (class-level actions, not prop-wired)
// =============================================================================

$app->post('/action/{actionId}/execute', function ($actionId) use ($app) {
    /** @var ClassModel $model */
    $model = $app->di->get('model');
    $input = $app->request->getJsonRawBody(true) ?: [];

    // Fetch the @action definition
    $actionObj = $model->getObject('@action', $actionId);
    if (!$actionObj) return error("Action not found: {$actionId}", 404);

    $actionDef = $actionObj->toArray();
    $targetClassId = $input['target_class_id'] ?? ($actionDef['target_class_id'] ?? null);
    $targetId = $input['target_id'] ?? null;

    // Remove meta keys from params
    $params = $input;
    unset($params['target_class_id'], $params['target_id']);

    // Load target object if specified
    $targetData = [];
    if ($targetClassId && $targetId) {
        $targetObj = $model->getObject($targetClassId, $targetId);
        if (!$targetObj) return error("Target not found: {$targetClassId}/{$targetId}", 404);
        $targetData = $targetObj->toArray();
    }

    try {
        $executor = createActionExecutor($model);
        $result = $executor->execute($actionDef, $params, $targetData);

        // If action returned data and we have a target, merge and save
        if (is_array($result) && !empty($result) && $targetClassId && $targetId) {
            $merged = array_merge($targetData, $result);
            $saved = $model->setObject($targetClassId, $merged);
            return json([
                'success' => true,
                'action_id' => $actionId,
                'result' => $result,
                'object' => $saved->toApiArray()
            ]);
        }

        return json([
            'success' => true,
            'action_id' => $actionId,
            'result' => $result
        ]);
    } catch (ActionExecutorException $e) {
        return error("Action '{$actionId}' failed: " . $e->getMessage(), $e->getCode() ?: 400);
    } catch (\Exception $e) {
        return handleException($e);
    }
});

// =============================================================================
// ACTION EXECUTION SUPPORT
// =============================================================================

use ElementStore\ActionExecutor;
use ElementStore\ActionExecutorException;

/**
 * Create an ActionExecutor wired to the model for provider/action resolution.
 */
function createActionExecutor($model): ActionExecutor
{
    $providerResolver = function (string $providerId) use ($model): ?array {
        $provider = $model->getObject('@provider', $providerId);
        return $provider ? $provider->toArray() : null;
    };

    $executor = new class(null, null, $providerResolver) extends ActionExecutor {
        private $model;

        public function setModel($model): void { $this->model = $model; }

        protected function resolveAction(string $actionId): ?array
        {
            if (!$this->model) return null;
            $action = $this->model->getObject('@action', $actionId);
            return $action ? $action->toArray() : null;
        }
    };

    $executor->setModel($model);
    return $executor;
}

/**
 * Resolve an @action definition for a class property of data_type 'function'.
 *
 * A function-type prop can be either a local function (FunctionRegistry) or an
 * @action (API call, composite, etc). This resolver checks whether the prop
 * resolves to an @action element. If not, the caller falls through to normal
 * function handling.
 *
 * Resolution order:
 * 1. Prop's object_class_id references @action → look up that action ID
 * 2. Instance value is an @action ID string
 * 3. Convention: "{classId}.{propKey}" (e.g. "infra:vm.refresh")
 *
 * @return array|null  Action definition array, or null if not an @action
 */
function resolveActionForProp($model, string $classId, string $propKey, array $objData): ?array
{
    // Walk inheritance chain to find the prop definition
    $propDef = null;
    $classMeta = $model->getClass($classId);
    if ($classMeta) {
        $allProps = $model->getClassProps($classId);
        foreach ($allProps as $p) {
            $pk = $p instanceof \ElementStore\Prop ? $p->key : ($p['key'] ?? null);
            if ($pk === $propKey) {
                $propDef = $p instanceof \ElementStore\Prop ? $p->toArray() : $p;
                break;
            }
        }
    }

    // Prop must have object_class_id referencing @action (the prop IS an @action reference)
    if (!$propDef) return null;

    $targetIds = $propDef['object_class_id'] ?? [];
    if (is_string($targetIds)) $targetIds = [$targetIds];

    // Check if @action is among the object_class_id refs
    $isActionProp = in_array('@action', $targetIds, true);

    // Also check for specific @action IDs (e.g. object_class_id: 'vm:refresh')
    foreach ($targetIds as $candidate) {
        if ($candidate === '@action') continue;
        $actionObj = $model->getObject('@action', $candidate);
        if ($actionObj) return $actionObj->toArray();
    }

    if (!$isActionProp) return null;

    // Prop is typed object_class_id: '@action' — resolve the actual action

    // 1. Instance value is an @action ID
    $instanceVal = $objData[$propKey] ?? null;
    if (is_string($instanceVal) && !empty($instanceVal)) {
        $actionObj = $model->getObject('@action', $instanceVal);
        if ($actionObj) return $actionObj->toArray();
    }

    // 2. Convention: "{classId}.{propKey}" e.g. "infra:vm.refresh"
    $conventionId = "{$classId}.{$propKey}";
    $actionObj = $model->getObject('@action', $conventionId);
    if ($actionObj) return $actionObj->toArray();

    return null;
}

// =============================================================================
// 404 & RUN
// =============================================================================

$app->notFound(fn() => error('Endpoint not found', 404));

try {
    $app->handle(strtok($_SERVER['REQUEST_URI'] ?? '/', '?'));
} catch (\Exception $e) {
    (new Response())->setStatusCode(500)->setJsonContent(['error' => $e->getMessage()])->send();
}
