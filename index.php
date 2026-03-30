<?php
require_once __DIR__ . "/env_override.php";
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
use ElementStore\RateLimiter;
use ElementStore\ResponseFormatter;

if (!extension_loaded('phalcon')) {
    http_response_code(500);
    echo json_encode(['error' => 'Phalcon extension not loaded']);
    exit;
}

// =============================================================================
// MODEL BOOT
// =============================================================================

$model = ClassModel::boot(__DIR__);

// Dev-only headers — only honoured when ES_ENV=development (or PHP_ENV=development fallback)
$esEnv = getenv('ES_ENV') ?: (getenv('PHP_ENV') ?: 'production');
$isDev = ($esEnv === 'development');

// Allow custom IDs for seeding/testing (dev only)
if ($isDev && isset($_SERVER['HTTP_X_ALLOW_CUSTOM_IDS']) && $_SERVER['HTTP_X_ALLOW_CUSTOM_IDS'] === 'true') {
    $model->setAllowCustomIds(true);
}

// Disable ownership enforcement (dev only)
if ($isDev && isset($_SERVER['HTTP_X_DISABLE_OWNERSHIP']) && $_SERVER['HTTP_X_DISABLE_OWNERSHIP'] === 'true') {
    $model->setEnforceOwnership(false);
}

// Tenant routing: X-Tenant-Id header is accepted from internal/trusted sources.
// In production, this header is set by nginx after resolving {tenant}.arc3d.ai subdomain.
// In dev mode, the header can also be set directly by clients.
// When auth is enabled, tenant_id from the JWT claim takes precedence (set in AuthService middleware).
$xTenantId = $_SERVER['HTTP_X_TENANT_ID'] ?? null;
if ($xTenantId !== null && $xTenantId !== '') {
    $model->setTenantId($xTenantId);
}

// Bootstrap auth-service: reads auth_config from store, registers app+machine, warms JWKS cache.
// NOOP if no auth_config object exists in the store (auth enforcement disabled).
AuthService::bootstrap($model);

$di = new FactoryDefault();
$di->setShared('model', $model);

$app = new Micro($di);

// CORS (runs first — handles OPTIONS preflight before auth check)
$app->before(function () use ($app, $isDev) {
    // Determine allowed origin: env var list, or wildcard only in dev mode
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $allowedRaw = getenv('CORS_ALLOWED_ORIGINS') ?: '';
    $allowedOrigins = array_filter(array_map('trim', explode(',', $allowedRaw)));

    if (!empty($allowedOrigins) && in_array($origin, $allowedOrigins, true)) {
        $corsOrigin = $origin;
    } elseif ($isDev) {
        // Dev fallback: allow any origin
        $corsOrigin = $origin ?: '*';
    } else {
        // Production with no matching origin: omit the header (browser will block)
        $corsOrigin = '';
    }

    if ($corsOrigin !== '') {
        $app->response->setHeader('Access-Control-Allow-Origin', $corsOrigin);
        if ($corsOrigin !== '*') {
            $app->response->setHeader('Vary', 'Origin');
        }
    }
    $app->response->setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    $allowHeaders = 'Content-Type, Authorization, X-Tenant-Id, X-Response-Format, X-Fields, X-Scope-Tenant, X-Scope-App, X-Scope-User, X-Scope-Org';
    if ($isDev) {
        $allowHeaders .= ', X-User-Id, X-Disable-Ownership, X-Allow-Custom-Ids';
    }
    $app->response->setHeader('Access-Control-Allow-Headers', $allowHeaders);
    $app->response->setContentType('application/json', 'UTF-8');

    if ($app->request->isOptions()) {
        $app->response->setStatusCode(200)->send();
        exit;
    }
    return true;
});

// Rate limiting middleware
$rateLimitMax = (int)(getenv('RATE_LIMIT_MAX') ?: 200);
$rateLimitWindow = (int)(getenv('RATE_LIMIT_WINDOW') ?: 60);
if ($rateLimitMax > 0) {
    $rateLimiter = new RateLimiter($rateLimitMax, $rateLimitWindow);
    $app->before(function () use ($app, $rateLimiter, $rateLimitMax) {
        $ip = RateLimiter::getClientIp();
        $result = $rateLimiter->check($ip);

        $app->response->setHeader('X-RateLimit-Limit', (string)$rateLimitMax);
        $app->response->setHeader('X-RateLimit-Remaining', (string)$result['remaining']);
        $app->response->setHeader('X-RateLimit-Reset', (string)$result['reset']);

        if (!$result['allowed']) {
            $app->response->setStatusCode(429);
            $app->response->setJsonContent(['error' => 'Rate limit exceeded. Try again later.']);
            $app->response->setHeader('Retry-After', (string)$result['reset']);
            $app->response->send();
            return false;
        }
        return true;
    });
}

// Pre-auth bypass middleware — system secret and dev mode checked BEFORE JWT auth
// This must run first so internal tools and dev mode skip the auth requirement entirely.
$app->before(function () use ($model) {
    // System secret bypass — grants admin+system roles for internal tools (MCP, CLI, agents)
    $systemSecret = getenv('ES_SYSTEM_SECRET') ?: null;
    $headerSecret = $_SERVER['HTTP_X_SYSTEM_SECRET'] ?? null;
    if ($systemSecret && $headerSecret && hash_equals($systemSecret, $headerSecret)) {
        $model->setUserRoles(['admin', 'system']);
        $model->setUserId('system');
        $model->skipAuth = true;  // Flag to skip JWT auth middleware
        return true;
    }

    // Dev mode bypass — grants admin+system roles when ES_ALLOW_UNAUTHENTICATED=true
    $allowUnauth = strtolower((string)(getenv('ES_ALLOW_UNAUTHENTICATED') ?: $_SERVER['ES_ALLOW_UNAUTHENTICATED'] ?? '')) === 'true';
    if ($allowUnauth) {
        $model->setUserRoles(['admin', 'system']);
        $model->setUserId('dev-admin');
        $model->skipAuth = true;
        return true;
    }
    return true;
});

// Auth middleware — verify JWT Bearer token and inject user/app/domain into model.
// Skipped if system secret or dev mode already authenticated above.
$app->before(function () use ($model) {
    if (!empty($model->skipAuth)) return true;
    return AuthService::getMiddleware($model)();
});

// Role-injection middleware — extract roles from verified JWT.
$app->before(function () use ($model) {
    if (!empty($model->skipAuth)) return true;

    // JWT token — extract roles from verified token
    $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (preg_match('/^Bearer\s+(.+)$/i', $authHeader, $matches)) {
        $result = AuthService::verifyLocal($matches[1]);
        if ($result['valid'] && $result['claims'] !== null) {
            // Support both 'roles' (array) and 'role' (single string) from JWT
            $roles = (array)($result['claims']->roles ?? []);
            $singleRole = $result['claims']->role ?? null;
            if ($singleRole && !in_array($singleRole, $roles, true)) {
                $roles[] = $singleRole;
            }
            $model->setUserRoles($roles);
        }
    }
    return true;
});

// Scope override middleware — admin can override session scope via X-Scope-* headers
// Only allowed for admin/system roles (prevents regular users from escalating)
$app->before(function () use ($model) {
    $isAdmin = in_array('admin', $model->getUserRoles(), true)
            || in_array('system', $model->getUserRoles(), true);
    if (!$isAdmin) return true;

    $scopeTenant = $_SERVER['HTTP_X_SCOPE_TENANT'] ?? null;
    $scopeApp    = $_SERVER['HTTP_X_SCOPE_APP']    ?? null;
    $scopeUser   = $_SERVER['HTTP_X_SCOPE_USER']   ?? null;
    $scopeOrg    = $_SERVER['HTTP_X_SCOPE_ORG']    ?? null;

    if ($scopeTenant) $model->setTenantId($scopeTenant);
    if ($scopeApp)    $model->setSecurityContext($model->getUserId(), $scopeApp, $model->getDomain());
    if ($scopeUser)   $model->setUserId($scopeUser);
    // org_id: stored on model if available
    // TODO: add org support to ClassModel when @org class exists

    return true;
});

// Response helpers - return data directly, with format negotiation
// Supports: Accept: text/plain, X-Response-Format: text, X-Fields: id,name,status
function json($data, $code = 200): Response
{
    $format = ResponseFormatter::detectFormat();
    if ($format !== 'json') {
        return ResponseFormatter::format($data, $code);
    }
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
function handleException(\Throwable $e): Response
{
    // Save @log entry — guarded against recursion
    static $saving = false;
    if (!$saving) {
        $saving = true;
        try {
            global $app;
            /** @var ClassModel $model */
            $model = $app->di->get('model');
            $logEntry = [
                'class_id' => '@log',
                'level' => ($e instanceof StorageException) ? 'warning' : 'error',
                'message' => $e->getMessage(),
                'code' => $e->getCode(),
                'source' => 'api',
                'endpoint' => $_SERVER['REQUEST_URI'] ?? '',
                'method' => $_SERVER['REQUEST_METHOD'] ?? '',
                'trace' => $e->getTraceAsString(),
                'created_at' => date('c'),
            ];
            if ($e instanceof StorageException && $e->getErrors()) {
                $logEntry['details'] = $e->getErrors();
            }
            $model->getStorage()->setobj('@log', $logEntry);
        } catch (\Exception $logEx) {
            // Silently ignore — prevent recursion and log-save failures from masking the original error
        } finally {
            $saving = false;
        }
    }

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

/**
 * Admin access guard — call at the top of any admin route handler.
 *
 * Returns a 401/403/503 error Response if the request does not have admin
 * privileges; returns null on success. Uses AuthService::requireAdmin() which
 * ALWAYS enforces authentication even if ES_ALLOW_UNAUTHENTICATED=true.
 *
 * Usage:
 *   if ($e = adminGuard()) return $e;
 */
function adminGuard(): ?Response
{
    $result = AuthService::requireAdmin();
    if ($result !== null) {
        return error($result['message'], $result['code']);
    }
    return null;
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
            if (!is_array($prop)) return true;
            // Check both old format (top-level) and new format (flags object)
            $serverOnly = ($prop['flags']['server_only'] ?? false) || ($prop['server_only'] ?? false);
            return !$serverOnly;
        }
    ));
    return $classData;
}

// =============================================================================
// HEALTH & INFO
// =============================================================================

$app->get('/health', function () use ($app) {
    /** @var ClassModel $model */
    $model = $app->di->get('model');
    $initCompleted = false;
    $lastRun = null;
    try {
        // Check if system classes exist (indicates init has run)
        $classClass = $model->getClass(Constants::K_CLASS);
        $initCompleted = $classClass !== null;
        if ($initCompleted) {
            $classData = $classClass->toArray();
            $lastRun = $classData[Constants::F_UPDATED_AT] ?? $classData[Constants::F_CREATED_AT] ?? null;
        }
    } catch (\Exception $e) {
        // health should not fail
    }
    // Read .version.json (written by deploy_runner)
    $versionFile = __DIR__ . '/.version.json';
    $git = file_exists($versionFile)
        ? json_decode(file_get_contents($versionFile), true) ?? []
        : [];

    return json([
        'status' => 'ok',
        'service' => 'elementStore',
        'version' => '2.0.0',
        'git' => $git ?: null,
        'init' => [
            'completed' => $initCompleted,
            'last_run' => $lastRun,
        ],
    ]);
});

$app->post('/init', function () use ($app) {
    // Disabled by default — must be explicitly enabled via ENABLE_INIT_ENDPOINT=true.
    // This endpoint wipes ALL data; it must never be reachable in production unless intended.
    $initEnabled = strtolower((string)(getenv('ENABLE_INIT_ENDPOINT') ?: 'false')) === 'true';
    if (!$initEnabled) {
        return error(
            'The /init endpoint is disabled. Set ENABLE_INIT_ENDPOINT=true to enable it.',
            503
        );
    }

    // Admin authentication is required regardless of global auth posture.
    if ($e = adminGuard()) return $e;

    try {
        /** @var ClassModel $model */
        $model = $app->di->get('model');
        $input = $app->request->getJsonRawBody(true) ?? [];
        $strategy = $input['strategy'] ?? 'auto';

        $force = ($strategy === 'fresh');

        if ($strategy === 'existing') {
            // Verify only — check if init has been done
            $classClass = $model->getClass(Constants::K_CLASS);
            if (!$classClass) {
                return error('Not initialized — @class not found', 412);
            }
            $allClasses = $model->getAllClasses();
            return json([
                'success' => true,
                'strategy' => 'existing',
                'classes' => count($allClasses),
                'verified' => true,
            ]);
        }

        // auto or fresh — trigger genesis load
        if ($strategy === 'fresh') {
            $model->reset();
        }

        // Trigger bootstrap (which loads genesis if needed)
        $model->init();

        // If GenesisLoader is available (v2.2+), use it for explicit load
        $results = [];
        if (method_exists($model, 'getGenesisLoader')) {
            $loader = $model->getGenesisLoader();
            if ($loader !== null) {
                $results = $loader->load($force);
            }
        }

        $allClasses = $model->getAllClasses();
        return json([
            'success' => true,
            'strategy' => $strategy,
            'classes' => count($allClasses),
            'genesis' => $results,
        ]);
    } catch (\Exception $e) {
        return handleException($e);
    }
});

$app->get('/info', fn() => json([
    'name' => 'ElementStore API',
    'version' => '2.2.0',
    'endpoints' => [
        'GET /health' => 'Health check (includes init status)',
        'POST /init' => 'Initialize application (body: {"strategy":"auto|fresh|existing"})',
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
    $filtered = array_filter($props, fn($p) => !$p->isServerOnly());
    return json(array_map(fn($p) => $p->toArray(), array_values($filtered)));
});

$app->post('/class', function () use ($app) {
    if ($e = adminGuard()) return $e;
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
    if ($e = adminGuard()) return $e;
    /** @var ClassModel $model */
    $model = $app->di->get('model');
    try {
        return $model->deleteClass($id)
            ? json(['deleted' => true, 'id' => $id])
            : error("Class not found: {$id}", 404);
    } catch (\Exception $e) {
        return handleException($e);
    }
});

// =============================================================================
// OBJECT OPERATIONS
// =============================================================================

// List all objects of a class
$app->get('/store/{class}', function ($c) use ($app) {
    /** @var ClassModel $model */
    $model = $app->di->get('model');
    $isAdmin  = in_array('admin', $model->getUserRoles(), true);
    $hardMax  = $isAdmin ? 10000 : 1000;
    $limit    = min(500, $hardMax); // default: 500, never unbounded
    $objects  = $model->query($c, [], ['limit' => $limit]);
    $count    = count($objects);
    return json(array_map(fn($o) => $o->toApiArray(), $objects))
        ->setHeader('X-Pagination-Limit',    (string)$limit)
        ->setHeader('X-Pagination-Count',    (string)$count)
        ->setHeader('X-Pagination-Hard-Max', (string)$hardMax);
});

// Get single object by ID (or /me resolver)
$app->get('/store/{class}/{id}', function ($c, $id) use ($app) {
    /** @var ClassModel $model */
    $model = $app->di->get('model');

    // /me resolver — resolve current user's object from JWT context
    if ($id === 'me') {
        try {
            $result = $model->resolveMe($c);
            if ($result === null) return error('Not authenticated', 401);
            return json($result->toApiArray());
        } catch (\Throwable $e) {
            return handleException($e);
        }
    }

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
            if (!$propDef->isCollection() && $mode === 'resolve') {
                return json(!empty($result) ? $result[0] : null);
            }
            return json($result);
        }
    }

    return json($value);
});

// PUT /store/{class}/{id}/{prop_or_action}
// prop = set property value | action() = execute action
$app->put('/store/{class}/{id}/{prop}', function ($c, $id, $prop) use ($app) {
    /** @var ClassModel $model */
    $model = $app->di->get('model');
    $input = $app->request->getJsonRawBody(true) ?: [];

    // Action call: name ends with ()
    if (str_ends_with($prop, '()')) {
        $actionName = substr($prop, 0, -2);
        try {
            $result = $model->executeObjectAction($c, $id, $actionName, $input);
            return json($result);
        } catch (\Exception $e) {
            return handleException($e);
        }
    }

    // Property set or legacy prop-wired action
    $obj = $model->getObject($c, $id);
    if (!$obj) return error("Not found: {$c}/{$id}", 404);

    $objData = $obj->toArray();

    // Legacy: check if prop references an @action (object_class_id includes '@action')
    $actionDef = resolveActionForProp($model, $c, $prop, $objData);
    if ($actionDef !== null) {
        if (($actionDef['type'] ?? '') === 'cli') {
            if ($e = adminGuard()) return $e;
        }
        try {
            $executor = createActionExecutor($model);
            $result = $executor->execute($actionDef, $input, $objData);
            if (is_array($result) && !empty($result)) {
                $merged = array_merge($objData, $result);
                $saved = $model->setObject($c, $merged);
                return json($saved->toApiArray());
            }
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
    /** @var ClassModel $model */
    $model    = $app->di->get('model');
    $isAdmin  = in_array('admin', $model->getUserRoles(), true);
    $hardMax  = $isAdmin ? 10000 : 1000;
    foreach ($q as $k => $v) {
        match ($k) {
            '_sort'   => $options['sort']    = $v,
            '_order'  => $options['sortDir'] = $v,
            '_limit'  => $options['limit']   = min(max((int)$v, 1), $hardMax), // clamp [1, hardMax]
            '_offset' => $options['offset']  = max((int)$v, 0),
            '_q'      => $options['freeText'] = $v,
            default   => !str_starts_with($k, '_') ? $filters[$k] = $v : null
        };
    }
    // Apply default limit when caller omits _limit
    if (!isset($options['limit'])) {
        $options['limit'] = 100;
    }
    // When free text search is active, fetch more from storage then filter+trim
    $requestedLimit = $options['limit'];
    if (!empty($options['freeText'])) {
        $options['limit'] = $hardMax; // fetch all, filter in memory
    }
    $results = $model->query($c, $filters, $options);
    // Re-apply requested limit after free text filter
    if (!empty($options['freeText']) && count($results) > $requestedLimit) {
        $results = array_slice($results, 0, $requestedLimit);
    }
    $count   = count($results);
    return json(array_map(fn($o) => $o->toApiArray(), $results))
        ->setHeader('X-Pagination-Limit',    (string)$options['limit'])
        ->setHeader('X-Pagination-Offset',   (string)($options['offset'] ?? 0))
        ->setHeader('X-Pagination-Count',    (string)$count)
        ->setHeader('X-Pagination-Hard-Max', (string)$hardMax);
});

// =============================================================================
// RESET / TEST
// =============================================================================

$app->post('/reset', function () use ($app) {
    // Disabled by default — must be explicitly enabled via ENABLE_RESET_ENDPOINT=true.
    // This endpoint wipes ALL store data; it must never be reachable in production unless intended.
    $resetEnabled = strtolower((string)(getenv('ENABLE_RESET_ENDPOINT') ?: 'false')) === 'true';
    if (!$resetEnabled) {
        error_log('[AUDIT] POST /reset blocked — endpoint disabled (ENABLE_RESET_ENDPOINT not set)');
        return error(
            'The /reset endpoint is disabled. Set ENABLE_RESET_ENDPOINT=true to enable it.',
            503
        );
    }

    // Admin authentication is required regardless of global auth posture.
    if ($e = adminGuard()) {
        error_log('[AUDIT] POST /reset blocked — authentication/authorization failed');
        return $e;
    }

    try {
        /** @var ClassModel $model */
        $model = $app->di->get('model');
        $input = $app->request->getJsonRawBody(true) ?? [];

        // Optional confirmation token — if RESET_CONFIRM_TOKEN env var is set,
        // the caller must supply it in the request body as {"confirm_token": "..."}.
        $requiredToken = getenv('RESET_CONFIRM_TOKEN') ?: null;
        if ($requiredToken) {
            $providedToken = $input['confirm_token'] ?? '';
            if (!hash_equals($requiredToken, $providedToken)) {
                error_log('[AUDIT] POST /reset blocked — invalid confirmation token provided');
                // Log to @log before any data is touched
                $model->getStorage()->setobj('@log', [
                    'class_id'   => '@log',
                    'level'      => 'warning',
                    'message'    => 'POST /reset rejected — invalid or missing confirm_token',
                    'source'     => 'api',
                    'endpoint'   => '/reset',
                    'method'     => 'POST',
                    'created_at' => date('c'),
                ]);
                return error('Invalid or missing confirm_token', 403);
            }
        }

        // Audit: log to system error_log BEFORE wipe (the @log entry will be destroyed by reset).
        error_log('[AUDIT] POST /reset executed — all store data is being wiped');

        return json($model->reset());
    } catch (\Exception $e) {
        return handleException($e);
    }
});

$app->post('/test', function () use ($app) {
    if ($e = adminGuard()) return $e;
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
    if ($e = adminGuard()) return $e;
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
    if ($e = adminGuard()) return $e;
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
    if ($e = adminGuard()) return $e;
    try {
        /** @var ClassModel $model */
        $model = $app->di->get('model');

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
    if ($e = adminGuard()) return $e;

    // Validate hash — must be a 32-char lowercase hex string (MD5); reject any path traversal attempts
    if (!preg_match('/^[a-f0-9]{32}$/', $hash)) {
        return error("Invalid export hash format", 400);
    }

    $exportsDir = dirname(__DIR__) . '/data/exports';
    $filepath = "{$exportsDir}/export_{$hash}.json";

    if (!file_exists($filepath)) {
        return error("Export not found: {$hash}", 404);
    }

    // Defense-in-depth: verify resolved path stays within the exports directory
    $realExportsDir = realpath($exportsDir);
    $realFilepath   = realpath($filepath);
    if ($realExportsDir === false || $realFilepath === false ||
        strpos($realFilepath, $realExportsDir . DIRECTORY_SEPARATOR) !== 0) {
        return error("Invalid export path", 400);
    }

    $response = new Response();
    $response->setHeader('Content-Type', 'application/json');
    $response->setHeader('Content-Disposition', "attachment; filename=\"export_{$hash}.json\"");
    $response->setContent(file_get_contents($realFilepath));
    return $response;
});

$app->delete('/export/{hash}', function ($hash) use ($app) {
    if ($e = adminGuard()) return $e;

    // Validate hash — must be a 32-char lowercase hex string (MD5); reject any path traversal attempts
    if (!preg_match('/^[a-f0-9]{32}$/', $hash)) {
        return error("Invalid export hash format", 400);
    }

    $exportsDir = dirname(__DIR__) . '/data/exports';
    $filepath = "{$exportsDir}/export_{$hash}.json";

    if (!file_exists($filepath)) {
        return error("Export not found: {$hash}", 404);
    }

    // Defense-in-depth: verify resolved path stays within the exports directory
    $realExportsDir = realpath($exportsDir);
    $realFilepath   = realpath($filepath);
    if ($realExportsDir === false || $realFilepath === false ||
        strpos($realFilepath, $realExportsDir . DIRECTORY_SEPARATOR) !== 0) {
        return error("Invalid export path", 400);
    }

    unlink($realFilepath);
    return json(['deleted' => true, 'hash' => $hash]);
});

// =============================================================================
// DIRECT ACTION EXECUTION (class-level actions, not prop-wired)
// =============================================================================

$app->post('/action/{actionId}/execute', function ($actionId) use ($app) {
    if ($e = adminGuard()) return $e;
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
 * Injects the current user ID so CLI audit logs can identify the executor.
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
    // Inject executor user ID for CLI audit logging
    $executor->setExecutorUserId($model->getUserId());
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
