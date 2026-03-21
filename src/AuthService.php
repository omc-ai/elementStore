<?php
/**
 * AuthService — Auth-service integration for ElementStore
 *
 * All configuration is read from the `auth_config` store object.
 * No hardcoded URLs or keys — everything lives in the elementStore itself.
 *
 * BOOT SEQUENCE (called once at startup):
 *   1. Read auth_config from store (service_url, app_id, all ep_* endpoint paths)
 *   2. Ensure this app is registered with auth-service (auth_app store object)
 *   3. Ensure this machine is registered (auth_machine store object, updated each boot)
 *   4. Warm public key cache from JWKS endpoint (stored back into auth_config)
 *
 * PER-REQUEST MIDDLEWARE:
 *   - Verifies JWT Bearer token using cached RS256 public keys
 *   - Injects user/app/domain into ClassModel security context
 *
 * AUTH-SERVICE HTTP INTERFACE:
 *   - login, logout, refresh, verifyRemote
 *   - registerApp, getApp, registerMachineRemote, getMachines, revokeMachine
 *   - fetchJwks
 *
 * PERMISSION HELPERS:
 *   - hasRole, hasPermission, getSubject, isExpired
 *
 * STORE CLASSES:
 *   - auth_config : connection config + endpoint map + cached public key
 *   - auth_app    : registered app credentials (client_id / client_secret)
 *   - auth_machine: per-instance machine registration (instance_id, machine_id)
 *
 * @package ElementStore
 */

namespace ElementStore;

use Firebase\JWT\JWT;
use Firebase\JWT\JWK;
use Firebase\JWT\Key;

class AuthService
{
    // =========================================================================
    // PROCESS-LEVEL CACHE (shared across requests within one FPM worker)
    // =========================================================================

    /** @var bool Has bootstrap run at least once */
    private static bool $bootstrapped = false;

    /** @var array|null Raw auth_config data from store */
    private static ?array $cachedConfig = null;

    /** @var array|null Parsed Firebase\JWT Key array for token verification */
    private static ?array $cachedKeySet = null;

    /** @var int Unix timestamp of last successful key fetch */
    private static int $keyFetchedAt = 0;

    /** @var object|null Decoded JWT claims for the current request */
    private static ?object $currentClaims = null;

    /** @var int Public key TTL in seconds before re-fetching */
    private const KEY_TTL = 3600;


    // =========================================================================
    // BOOTSTRAP
    // =========================================================================

    /**
     * Bootstrap auth-service integration.
     *
     * Reads auth_config from the store, ensures app and machine are registered,
     * and warms the public key cache. Safe to call multiple times — only runs once
     * per FPM worker process.
     *
     * Call this immediately after ClassModel::boot() in index.php, before routing.
     *
     * @param ClassModel $model ElementStore model (must be booted)
     */
    public static function bootstrap(ClassModel $model): void
    {
        if (self::$bootstrapped) {
            return;
        }

        // Load auth_config from store
        $configs = $model->query(Constants::K_AUTH_CONFIG, ['is_enabled' => true]);
        if (empty($configs)) {
            // Not configured — auth enforcement disabled
            self::$bootstrapped = true;
            return;
        }

        self::$cachedConfig = $configs[0]->toArray();

        // Ensure this app is registered
        self::ensureAppRegistered($model);

        // Ensure this machine is registered / updated
        self::ensureMachineRegistered($model);

        // Warm public key (JWKS) cache
        self::refreshPublicKeyIfStale($model);

        self::$bootstrapped = true;
    }


    // =========================================================================
    // MIDDLEWARE
    // =========================================================================

    /**
     * Return a Phalcon-compatible before() middleware closure.
     *
     * Verifies the JWT Bearer token on every request. On success, injects
     * user/app/domain into the model security context so handlers can use them.
     *
     * Usage:
     *   $app->before(AuthService::getMiddleware($model));
     *
     * @param ClassModel $model Model instance (captured by closure for setSecurityContext)
     * @return \Closure
     */
    public static function getMiddleware(ClassModel $model): \Closure
    {
        return function () use ($model) {
            // Passthrough when auth not configured or disabled
            if (self::$cachedConfig === null || !(self::$cachedConfig['is_enabled'] ?? true)) {
                return true;
            }

            $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';

            // Reset per-request claims cache
            self::$currentClaims = null;

            // Dev fallback: X-User-Id header (deprecated — only works in development)
            if (empty($authHeader)) {
                $esEnv = getenv('ES_ENV') ?: (getenv('PHP_ENV') ?: 'production');
                $xUserId = $_SERVER['HTTP_X_USER_ID'] ?? null;
                if ($xUserId !== null && $esEnv === 'development') {
                    error_log('[AuthService] DEPRECATED: X-User-Id header used in dev mode — migrate to JWT.');
                    $model->setSecurityContext($xUserId, null, null);
                    return true;
                }
                http_response_code(401);
                echo json_encode(['error' => 'Authorization header with Bearer token is required']);
                return false;
            }

            if (!preg_match('/^Bearer\s+(.+)$/i', $authHeader, $matches)) {
                http_response_code(401);
                echo json_encode(['error' => 'Invalid Authorization header format']);
                return false;
            }

            $result = self::verifyLocal($matches[1]);
            if (!$result['valid']) {
                http_response_code(401);
                echo json_encode(['error' => $result['error'] ?? 'Invalid or expired token']);
                return false;
            }

            $claims = $result['claims'];
            self::$currentClaims = $claims;
            $model->setSecurityContext(
                $claims->sub ?? $claims->user_id ?? null,
                $claims->app_id ?? null,
                $claims->domain ?? null
            );

            return true;
        };
    }


    // =========================================================================
    // JWT VERIFICATION
    // =========================================================================

    /**
     * Verify a JWT token locally using the cached public key set (RS256).
     *
     * Does not make any HTTP call — uses the key set warmed at bootstrap.
     *
     * @param  string $token Raw JWT string
     * @return array{valid: bool, claims: object|null, error: string|null}
     */
    public static function verifyLocal(string $token): array
    {
        if (self::$cachedKeySet === null) {
            return ['valid' => false, 'claims' => null, 'error' => 'Public key not loaded'];
        }
        try {
            $decoded = JWT::decode($token, self::$cachedKeySet);
            return ['valid' => true, 'claims' => $decoded, 'error' => null];
        } catch (\Exception $e) {
            return ['valid' => false, 'claims' => null, 'error' => $e->getMessage()];
        }
    }

    /**
     * Verify a token remotely via the auth-service /verify endpoint.
     * More expensive than local verification but reflects real-time revocation.
     *
     * @param  string $token Raw JWT string
     * @return array  Auth-service response (shape: {valid, user?, error?})
     */
    public static function verifyRemote(string $token): array
    {
        $url = self::buildUrl(self::ep('ep_verify'));
        $result = self::httpRequest('GET', $url, null, ['Authorization' => 'Bearer ' . $token]);
        return $result ?? ['valid' => false, 'error' => 'Auth-service unreachable'];
    }


    // =========================================================================
    // AUTH-SERVICE HTTP INTERFACE
    // =========================================================================

    /**
     * Authenticate a user.
     * POST {ep_login}  → { access_token, refresh_token, expires_in, user }
     *
     * @param  string      $email
     * @param  string      $password
     * @param  string|null $appId    Override app_id (defaults to auth_config.app_id)
     * @return array|null
     */
    public static function login(string $email, string $password, ?string $appId = null): ?array
    {
        $payload = ['email' => $email, 'password' => $password];
        if ($appId !== null) {
            $payload['app_id'] = $appId;
        } elseif (isset(self::$cachedConfig['app_id'])) {
            $payload['app_id'] = self::$cachedConfig['app_id'];
        }
        return self::httpRequest('POST', self::buildUrl(self::ep('ep_login')), $payload);
    }

    /**
     * Invalidate a token.
     * POST {ep_logout}
     *
     * @param  string $token Access token to invalidate
     * @return array|null
     */
    public static function logout(string $token): ?array
    {
        return self::httpRequest(
            'POST',
            self::buildUrl(self::ep('ep_logout')),
            [],
            ['Authorization' => 'Bearer ' . $token]
        );
    }

    /**
     * Refresh an expiring access token.
     * POST {ep_refresh}  → { access_token, expires_in }
     *
     * @param  string $refreshToken
     * @return array|null
     */
    public static function refresh(string $refreshToken): ?array
    {
        return self::httpRequest(
            'POST',
            self::buildUrl(self::ep('ep_refresh')),
            ['refresh_token' => $refreshToken]
        );
    }

    /**
     * Fetch JWKS (public keys) from auth-service.
     * GET {ep_jwks}  → { keys: [...] }
     *
     * @return array|null
     */
    public static function fetchJwks(): ?array
    {
        return self::httpRequest('GET', self::buildUrl(self::ep('ep_jwks')));
    }

    /**
     * Check if this app is already registered with auth-service.
     * GET {ep_get_app}/{app_id}
     *
     * @param  string|null $appId Defaults to auth_config.app_id
     * @return array|null
     */
    public static function getApp(?string $appId = null): ?array
    {
        $id = $appId ?? (self::$cachedConfig['app_id'] ?? null);
        $url = self::buildUrl(self::ep('ep_get_app') . '/' . rawurlencode((string)$id));
        return self::httpRequest('GET', $url);
    }

    /**
     * Register this application with auth-service.
     * POST {ep_register_app}  → { app_id, client_id, client_secret, ... }
     *
     * @param  array $appData
     * @return array|null
     */
    public static function registerApp(array $appData): ?array
    {
        return self::httpRequest(
            'POST',
            self::buildUrl(self::ep('ep_register_app')),
            $appData
        );
    }

    /**
     * List machines registered for this app.
     * GET {ep_list_machines}/{app_id}/machines
     *
     * @param  string|null $appId
     * @return array|null
     */
    public static function getMachines(?string $appId = null): ?array
    {
        $id = $appId ?? (self::$cachedConfig['app_id'] ?? null);
        $url = self::buildUrl(self::ep('ep_list_machines') . '/' . rawurlencode((string)$id) . '/machines');
        return self::httpRequest('GET', $url);
    }

    /**
     * Register (or boot-update) this machine with auth-service.
     * POST {ep_register_machine}/{app_id}/machines  → { machine_id, ... }
     *
     * @param  array       $machineData { instance_id, hostname, ip, version }
     * @param  string|null $appId
     * @return array|null
     */
    public static function registerMachineRemote(array $machineData, ?string $appId = null): ?array
    {
        $id = $appId ?? (self::$cachedConfig['app_id'] ?? null);
        $url = self::buildUrl(
            self::ep('ep_register_machine') . '/' . rawurlencode((string)$id) . '/machines'
        );
        return self::httpRequest('POST', $url, $machineData);
    }

    /**
     * Revoke a specific machine registration.
     * DELETE {ep_revoke_machine}/{app_id}/machines/{machine_id}
     *
     * @param  string      $machineId
     * @param  string|null $appId
     * @return array|null
     */
    public static function revokeMachine(string $machineId, ?string $appId = null): ?array
    {
        $id = $appId ?? (self::$cachedConfig['app_id'] ?? null);
        $url = self::buildUrl(
            self::ep('ep_revoke_machine')
            . '/' . rawurlencode((string)$id)
            . '/machines/' . rawurlencode($machineId)
        );
        return self::httpRequest('DELETE', $url);
    }


    // =========================================================================
    // PERMISSION HELPERS
    // =========================================================================

    /**
     * Return the decoded JWT claims for the current request.
     * Null when auth is not configured, disabled, or the request used the dev X-User-Id path.
     *
     * @return object|null
     */
    public static function getCurrentClaims(): ?object
    {
        return self::$currentClaims;
    }

    /**
     * Assert that the current request carries the 'admin' role in its JWT claims.
     *
     * Returns true when auth is not configured / disabled (backward-compatible for dev installs
     * without an auth_config). Returns false when auth IS enabled but the caller lacks admin.
     *
     * Usage:
     *   if (!AuthService::requireAdmin()) {
     *       return error('Admin role required', 403);
     *   }
     *
     * @return bool
     */
    public static function requireAdmin(): bool
    {
        // Auth not configured or disabled — allow unrestricted access (dev installs)
        if (self::$cachedConfig === null || !(self::$cachedConfig['is_enabled'] ?? false)) {
            return true;
        }
        if (self::$currentClaims === null) {
            return false;
        }
        return self::hasRole(self::$currentClaims, 'admin');
    }

    /**
     * Check if JWT claims contain a specific role.
     *
     * @param  object $claims Decoded JWT claims
     * @param  string $role   Role name to check
     * @return bool
     */
    public static function hasRole(object $claims, string $role): bool
    {
        $roles = (array)($claims->roles ?? []);
        return in_array($role, $roles, true);
    }

    /**
     * Check if JWT claims grant a specific module+action permission.
     *
     * @param  object $claims  Decoded JWT claims
     * @param  string $module  Module name (e.g. 'elementstore.classes')
     * @param  string $action  Action name (e.g. 'read', 'write', 'admin')
     * @return bool
     */
    public static function hasPermission(object $claims, string $module, string $action): bool
    {
        $permissions = (array)($claims->permissions ?? []);
        foreach ($permissions as $perm) {
            $perm = (array)$perm;
            if (($perm['module'] ?? '') !== $module) {
                continue;
            }
            $actions = (array)($perm['actions'] ?? []);
            if (in_array('*', $actions, true) || in_array($action, $actions, true)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Extract subject (user ID) from JWT claims.
     *
     * @param  object $claims
     * @return string|null
     */
    public static function getSubject(object $claims): ?string
    {
        return $claims->sub ?? $claims->user_id ?? null;
    }

    /**
     * Check if JWT claims are expired.
     *
     * @param  object $claims
     * @return bool
     */
    public static function isExpired(object $claims): bool
    {
        return isset($claims->exp) && (int)$claims->exp < time();
    }


    // =========================================================================
    // CONFIGURATION ACCESSORS
    // =========================================================================

    /**
     * Return the raw cached auth_config data, or null if not bootstrapped.
     */
    public static function getConfig(): ?array
    {
        return self::$cachedConfig;
    }

    /**
     * True if auth is bootstrapped and `is_enabled` is set in auth_config.
     */
    public static function isEnabled(): bool
    {
        return self::$cachedConfig !== null && (bool)(self::$cachedConfig['is_enabled'] ?? false);
    }


    // =========================================================================
    // PRIVATE — BOOTSTRAP SEQUENCE
    // =========================================================================

    /**
     * Ensure this application is registered with auth-service.
     * Stores credentials in auth_app store object.
     */
    private static function ensureAppRegistered(ClassModel $model): void
    {
        $config = self::$cachedConfig;
        $appId = $config['app_id'] ?? null;
        if (!$appId) {
            return;
        }

        // If an auth_app record already exists in the store, skip
        $existing = $model->query(Constants::K_AUTH_APP, []);
        if (!empty($existing)) {
            return;
        }

        // Check if app already registered on auth-service side
        $remoteApp = self::getApp($appId);
        if ($remoteApp && empty($remoteApp['error'])) {
            // Already registered — persist to store
            $model->setObject(Constants::K_AUTH_APP, [
                'name'          => 'app_' . $appId,
                'config_id'     => $config['id'] ?? null,
                'client_id'     => $remoteApp['client_id'] ?? null,
                'client_secret' => $remoteApp['client_secret'] ?? null,
                'registered_at' => $remoteApp['registered_at'] ?? date('c'),
                'is_active'     => true,
            ]);
            return;
        }

        // Register new app
        $result = self::registerApp([
            'app_id'          => $appId,
            'name'            => $config['app_name'] ?? $appId,
            'scopes'          => $config['scopes'] ?? [],
            'allowed_origins' => $config['allowed_origins'] ?? [],
        ]);
        if ($result && empty($result['error'])) {
            $model->setObject(Constants::K_AUTH_APP, [
                'name'          => 'app_' . $appId,
                'config_id'     => $config['id'] ?? null,
                'client_id'     => $result['client_id'] ?? null,
                'client_secret' => $result['client_secret'] ?? null,
                'registered_at' => date('c'),
                'is_active'     => true,
            ]);
        }
    }

    /**
     * Ensure this machine is registered / boot-updated with auth-service.
     * Creates or updates auth_machine store object.
     */
    private static function ensureMachineRegistered(ClassModel $model): void
    {
        $config = self::$cachedConfig;
        $appId = $config['app_id'] ?? null;

        $machines = $model->query(Constants::K_AUTH_MACHINE, []);
        $storedMachine = $machines[0] ?? null;
        $instanceId = $storedMachine ? ($storedMachine->instance_id ?? self::generateUuid()) : self::generateUuid();

        $hostname = gethostname() ?: 'unknown';
        $ip       = self::getLocalIp();
        $version  = defined('ElementStore\\VERSION') ? \ElementStore\VERSION : '1.0.0';

        $result = self::registerMachineRemote([
            'instance_id' => $instanceId,
            'hostname'    => $hostname,
            'ip'          => $ip,
            'version'     => $version,
        ], $appId);

        if ($result && empty($result['error'])) {
            $now = date('c');
            if ($storedMachine) {
                $data = $storedMachine->toArray();
                $data['last_boot_at'] = $now;
                if (!empty($result['machine_id'])) {
                    $data['machine_id'] = $result['machine_id'];
                }
                $model->setObject(Constants::K_AUTH_MACHINE, $data);
            } else {
                $model->setObject(Constants::K_AUTH_MACHINE, [
                    'name'          => 'machine_' . substr($instanceId, 0, 8),
                    'config_id'     => $config['id'] ?? null,
                    'instance_id'   => $instanceId,
                    'machine_id'    => $result['machine_id'] ?? null,
                    'hostname'      => $hostname,
                    'ip'            => $ip,
                    'version'       => $version,
                    'registered_at' => $now,
                    'last_boot_at'  => $now,
                    'is_active'     => true,
                ]);
            }
        }
    }

    /**
     * Fetch and cache the JWKS public key set.
     * Checks in-process cache first, then store-persisted key, then live JWKS endpoint.
     */
    private static function refreshPublicKeyIfStale(ClassModel $model): void
    {
        // In-process cache is still fresh
        if (self::$cachedKeySet !== null && (time() - self::$keyFetchedAt) < self::KEY_TTL) {
            return;
        }

        $config = self::$cachedConfig;

        // Try store-persisted key first (avoids JWKS call on warm processes)
        $storedKey    = $config['public_key'] ?? null;
        $storedFetchedAt = isset($config['public_key_fetched_at'])
            ? (int)strtotime($config['public_key_fetched_at'])
            : 0;

        if ($storedKey && (time() - $storedFetchedAt) < self::KEY_TTL) {
            self::$cachedKeySet  = self::parseStoredKey($storedKey, $config['public_key_kid'] ?? null);
            self::$keyFetchedAt  = $storedFetchedAt;
            return;
        }

        // Fetch fresh JWKS from auth-service
        $jwks = self::fetchJwks();
        if (!$jwks || empty($jwks['keys'])) {
            return;
        }

        self::$cachedKeySet = JWK::parseKeySet($jwks);
        self::$keyFetchedAt = time();

        // Persist JWKS back to auth_config store object for cold-start warm-up
        $configs = $model->query(Constants::K_AUTH_CONFIG, []);
        if (!empty($configs)) {
            $cfgData = $configs[0]->toArray();
            $cfgData['public_key']            = json_encode($jwks);
            $cfgData['public_key_kid']        = $jwks['keys'][0]['kid'] ?? '';
            $cfgData['public_key_fetched_at'] = date('c');
            $model->setObject(Constants::K_AUTH_CONFIG, $cfgData);
        }
    }


    // =========================================================================
    // PRIVATE — HELPERS
    // =========================================================================

    /**
     * Get endpoint path from cached auth_config.
     * Returns empty string if config not loaded (safe for buildUrl).
     */
    private static function ep(string $epKey): string
    {
        return self::$cachedConfig[$epKey] ?? '';
    }

    /**
     * Build a full URL from a relative endpoint path using auth_config.service_url.
     */
    private static function buildUrl(string $path): string
    {
        $base = rtrim(self::$cachedConfig['service_url'] ?? '', '/');
        return $base . '/' . ltrim($path, '/');
    }

    /**
     * Generic HTTP request to auth-service.
     *
     * @param  string      $method  HTTP verb (GET, POST, PUT, DELETE)
     * @param  string      $url     Full URL
     * @param  array|null  $body    JSON body (null for no body)
     * @param  array       $headers Extra headers as key => value map
     * @return array|null  Decoded JSON response, or null on network failure
     */
    private static function httpRequest(string $method, string $url, ?array $body = null, array $headers = []): ?array
    {
        $headerLines = ['Content-Type: application/json', 'Accept: application/json'];
        foreach ($headers as $key => $value) {
            $headerLines[] = "{$key}: {$value}";
        }

        $opts = [
            'http' => [
                'method'        => $method,
                'header'        => implode("\r\n", $headerLines),
                'ignore_errors' => true,
                'timeout'       => 5,
            ],
        ];
        if ($body !== null) {
            $opts['http']['content'] = json_encode($body);
        }

        $response = @file_get_contents($url, false, stream_context_create($opts));
        if ($response === false) {
            return null;
        }
        return json_decode($response, true);
    }

    /**
     * Parse a stored key back into a Firebase\JWT Key array.
     * The stored value may be a full JWKS JSON string or a raw PEM string.
     */
    private static function parseStoredKey(string $stored, ?string $kid): array
    {
        $data = json_decode($stored, true);
        if (is_array($data) && isset($data['keys'])) {
            return JWK::parseKeySet($data);
        }
        // Fallback: treat as raw PEM
        return [($kid ?: 'default') => new Key($stored, 'RS256')];
    }

    /**
     * Generate a UUID v4 using random_bytes.
     */
    private static function generateUuid(): string
    {
        $bytes = random_bytes(16);
        $bytes[6] = chr(ord($bytes[6]) & 0x0f | 0x40);
        $bytes[8] = chr(ord($bytes[8]) & 0x3f | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($bytes), 4));
    }

    /**
     * Best-effort local IP detection.
     */
    private static function getLocalIp(): string
    {
        $hostname = gethostname();
        if ($hostname) {
            $ip = gethostbyname($hostname);
            if ($ip && $ip !== $hostname) {
                return $ip;
            }
        }
        return '127.0.0.1';
    }
}
