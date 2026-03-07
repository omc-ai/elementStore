<?php
/**
 * ActionExecutor — Universal action dispatcher
 *
 * Executes @action objects defined in the ElementStore schema.
 * Supports six execution types:
 *   - api      : HTTP call to external provider (via cURL)
 *   - cli      : Shell command execution with {field} placeholders
 *   - function : Named function in FunctionRegistry
 *   - event    : EventBus event dispatch
 *   - composite: Chain of other actions (sequential or parallel)
 *   - ui       : No-op on server (UI-only JS handlers)
 *
 * The same @action config drives this executor on the server and
 * the equivalent ActionExecutor.ts on the client — same types,
 * same field names, symmetric behavior.
 *
 * Usage:
 *   $executor = new ActionExecutor($functionRegistry, $eventBus);
 *   $result   = $executor->execute($actionDef, ['id' => '123'], $contextObj);
 *
 * @package ElementStore
 */

namespace ElementStore;

class ActionExecutor
{
    /** @var callable|null Function registry: fn(string $key, array $params): mixed */
    private $functionRegistry;

    /** @var callable|null Event bus: fn(string $event, array $payload): void */
    private $eventBus;

    /** @var callable|null Provider resolver: fn(string $providerId): ?array — returns provider object */
    private $providerResolver;

    /**
     * @param callable|null $functionRegistry  fn(string $key, array $params): mixed
     * @param callable|null $eventBus          fn(string $event, array $payload): void
     * @param callable|null $providerResolver  fn(string $providerId): ?array
     */
    public function __construct(?callable $functionRegistry = null, ?callable $eventBus = null, ?callable $providerResolver = null)
    {
        $this->functionRegistry = $functionRegistry;
        $this->eventBus         = $eventBus;
        $this->providerResolver = $providerResolver;
    }

    // =========================================================================
    // PUBLIC API
    // =========================================================================

    /**
     * Execute an action definition.
     *
     * @param array  $action   @action element data (type, endpoint, function, etc.)
     * @param array  $params   Runtime parameter values (e.g. ['id' => '42'])
     * @param mixed  $context  The object this action is being executed on (optional)
     *
     * @return mixed  Result — depends on action.returns (object, list, void/null)
     *
     * @throws \InvalidArgumentException on unknown action type
     * @throws ActionExecutorException   on execution failure
     */
    public function execute(array $action, array $params = [], mixed $context = null): mixed
    {
        $type = $action['type'] ?? 'ui';

        return match ($type) {
            'api'       => $this->executeApi($action, $params, $context),
            'cli'       => $this->executeCli($action, $params, $context),
            'function'  => $this->executeFunction($action, $params),
            'event'     => $this->executeEvent($action, $params, $context),
            'composite' => $this->executeComposite($action, $params, $context),
            'ui'        => null, // UI-only, no-op on server
            default     => throw new \InvalidArgumentException("Unknown action type: {$type}"),
        };
    }

    // =========================================================================
    // API TYPE
    // =========================================================================

    /**
     * Execute an api-type action via cURL.
     *
     * Resolves endpoint placeholders like {id}, {name} from params + context.
     * Applies field mapping from action.mapping (api_field → es_field).
     * Updates object._links with the external ID if id_field is configured.
     *
     * @param array  $action
     * @param array  $params
     * @param mixed  $context
     * @return mixed Decoded JSON response (array or null)
     */
    private function executeApi(array $action, array $params, mixed $context): mixed
    {
        $endpoint = $action['endpoint'] ?? '';
        $method   = strtoupper($action['method'] ?? 'GET');
        $headers  = $action['headers'] ?? [];
        $mapping  = $action['request_mapping'] ?? $action['mapping'] ?? [];

        // Resolve provider: action.provider_id → provider object → base_url + auth
        $provider = $this->resolveProvider($action);
        $baseUrl  = $provider ? rtrim($provider['base_url'] ?? '', '/') : $this->resolveBaseUrl($context);
        $url      = $this->buildUrl($baseUrl . $endpoint, $params, $context, $action);

        // Apply provider auth headers
        if ($provider) {
            $authHeaders = $this->buildAuthHeaders($provider['auth'] ?? null);
            $headers = array_merge($authHeaders, $headers);
        }

        $body = null;
        if (in_array($method, ['POST', 'PUT', 'PATCH'], true)) {
            $body = $this->buildRequestBody($params, $mapping, $context);
        }

        $response = $this->httpRequest($method, $url, $headers, $body);

        if ($response === null) {
            return null;
        }

        // Apply response mapping (response_field → object_field)
        $responseMapping = $action['response_mapping'] ?? [];
        if (!empty($responseMapping)) {
            $response = $this->applyReverseMapping($responseMapping, $response);
        } elseif (!empty($mapping)) {
            // Fallback: use request_mapping in reverse for backwards compat
            $response = $this->applyReverseMapping($mapping, $response);
        }

        // Update _links on context object if id_field is configured
        if ($context !== null && is_array($context)) {
            $this->updateLinks($context, $action, $response);
        }

        return $response;
    }

    // =========================================================================
    // CLI TYPE
    // =========================================================================

    /**
     * Execute a cli-type action — shell command with {field} placeholders.
     *
     * Substitutes {field} placeholders from params, then context object fields.
     * Runs the command via shell_exec in the specified working directory.
     *
     * @param array  $action
     * @param array  $params
     * @param mixed  $context
     * @return array ['exit_code' => int, 'output' => string]
     */
    private function executeCli(array $action, array $params, mixed $context): array
    {
        $command    = $action['command'] ?? '';
        $workingDir = $action['working_dir'] ?? null;

        if (empty($command)) {
            throw new ActionExecutorException("action.command is required for cli-type actions");
        }

        // Merge context fields into available values for placeholder resolution
        $values = $params;
        if (is_array($context)) {
            $values = array_merge($context, $values); // params override context
        }

        // Substitute {field} placeholders
        $resolved = preg_replace_callback('/\{(\w+)\}/', function ($m) use ($values) {
            $key = $m[1];
            if (isset($values[$key])) {
                return escapeshellarg((string) $values[$key]);
            }
            return $m[0]; // Leave unreplaced
        }, $command);

        // Resolve working_dir placeholders too
        if ($workingDir) {
            $workingDir = preg_replace_callback('/\{(\w+)\}/', function ($m) use ($values) {
                $key = $m[1];
                return isset($values[$key]) ? (string) $values[$key] : $m[0];
            }, $workingDir);
        }

        // Build full command with cd prefix if working_dir specified
        $fullCommand = $workingDir ? "cd " . escapeshellarg($workingDir) . " && " . $resolved : $resolved;
        $fullCommand .= ' 2>&1';

        $output   = [];
        $exitCode = 0;
        exec($fullCommand, $output, $exitCode);

        $outputStr = implode("\n", $output);

        if ($exitCode !== 0) {
            throw new ActionExecutorException("CLI command failed (exit {$exitCode}): {$outputStr}", $exitCode);
        }

        return ['exit_code' => $exitCode, 'output' => $outputStr];
    }

    // =========================================================================
    // FUNCTION TYPE
    // =========================================================================

    /**
     * Execute a function-type action via FunctionRegistry.
     *
     * @param array $action
     * @param array $params
     * @return mixed
     */
    private function executeFunction(array $action, array $params): mixed
    {
        if ($this->functionRegistry === null) {
            throw new ActionExecutorException("FunctionRegistry not configured");
        }

        $key = $action['function'] ?? null;
        if (empty($key)) {
            throw new ActionExecutorException("action.function key is required for function-type actions");
        }

        return ($this->functionRegistry)($key, $params);
    }

    // =========================================================================
    // EVENT TYPE
    // =========================================================================

    /**
     * Execute an event-type action — emit to EventBus.
     *
     * Maps params to event payload using action.payload mapping.
     *
     * @param array  $action
     * @param array  $params
     * @param mixed  $context
     * @return void
     */
    private function executeEvent(array $action, array $params, mixed $context): void
    {
        if ($this->eventBus === null) {
            throw new ActionExecutorException("EventBus not configured");
        }

        $event        = $action['event'] ?? null;
        $payloadMap   = $action['payload'] ?? [];

        if (empty($event)) {
            throw new ActionExecutorException("action.event is required for event-type actions");
        }

        // Build payload from params using mapping
        $payload = [];
        if (empty($payloadMap)) {
            $payload = $params;
        } else {
            foreach ($payloadMap as $paramKey => $eventField) {
                if (isset($params[$paramKey])) {
                    $payload[$eventField] = $params[$paramKey];
                }
            }
        }

        // Add context metadata
        if ($context !== null && is_array($context)) {
            $payload['_context_id']       = $context['id'] ?? null;
            $payload['_context_class_id'] = $context['class_id'] ?? null;
        }

        ($this->eventBus)($event, $payload);
    }

    // =========================================================================
    // COMPOSITE TYPE
    // =========================================================================

    /**
     * Execute a composite-type action — chain of sub-actions.
     *
     * Strategies:
     *   sequential: execute in order, stop if any fails
     *   parallel:   execute all (PHP is single-threaded, so runs sequentially but
     *               collects all results — failures don't stop execution)
     *
     * @param array  $action
     * @param array  $params
     * @param mixed  $context
     * @return array Array of results from each sub-action
     */
    private function executeComposite(array $action, array $params, mixed $context): array
    {
        $actionIds = $action['actions'] ?? [];
        $strategy  = $action['strategy'] ?? 'sequential';

        if (empty($actionIds)) {
            return [];
        }

        $results = [];
        $errors  = [];

        foreach ($actionIds as $subActionId) {
            $subAction = $this->resolveAction($subActionId);
            if ($subAction === null) {
                throw new ActionExecutorException("Sub-action not found: {$subActionId}");
            }

            try {
                $result              = $this->execute($subAction, $params, $context);
                $results[$subActionId] = $result;

                // Merge result params into next action's context (pass-through)
                if (is_array($result)) {
                    $params = array_merge($params, $result);
                }
            } catch (\Throwable $e) {
                if ($strategy === 'sequential') {
                    throw new ActionExecutorException(
                        "Composite action failed at step '{$subActionId}': " . $e->getMessage(),
                        previous: $e
                    );
                }
                // parallel: collect error and continue
                $errors[$subActionId] = $e->getMessage();
            }
        }

        return ['results' => $results, 'errors' => $errors];
    }

    // =========================================================================
    // HTTP HELPERS
    // =========================================================================

    /**
     * Execute HTTP request via cURL.
     *
     * @param string     $method   GET, POST, PUT, PATCH, DELETE
     * @param string     $url      Full URL
     * @param array      $headers  Additional headers (key => value)
     * @param array|null $body     Request body (JSON-encoded)
     *
     * @return array|null Decoded JSON response or null on empty/204
     * @throws ActionExecutorException on HTTP or network errors
     */
    private function httpRequest(string $method, string $url, array $headers = [], ?array $body = null): ?array
    {
        $ch = curl_init($url);

        $curlHeaders = ['Content-Type: application/json', 'Accept: application/json'];
        foreach ($headers as $key => $value) {
            $curlHeaders[] = "{$key}: {$value}";
        }

        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_HTTPHEADER     => $curlHeaders,
            CURLOPT_CUSTOMREQUEST  => $method,
        ]);

        if ($body !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
        }

        $raw    = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error  = curl_error($ch);
        curl_close($ch);

        if ($error) {
            throw new ActionExecutorException("cURL error: {$error}");
        }

        if ($status >= 400) {
            throw new ActionExecutorException("API error {$status}: {$raw}", $status);
        }

        if ($status === 204 || empty($raw)) {
            return null;
        }

        $decoded = json_decode($raw, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            throw new ActionExecutorException("Invalid JSON response: " . json_last_error_msg());
        }

        return $decoded;
    }

    // =========================================================================
    // URL / PARAM HELPERS
    // =========================================================================

    /**
     * Build the full URL, substituting {param} placeholders.
     *
     * Placeholders resolved from: params first, then context fields.
     * Remaining params (not used in path) become query string for GET.
     *
     * @param string $urlTemplate  e.g. "https://api.example.com/vms/{id}"
     * @param array  $params       Runtime params
     * @param mixed  $context      Object context (array)
     * @return string
     */
    private function buildUrl(string $urlTemplate, array $params, mixed $context, array $action = []): string
    {
        $usedKeys = [];

        // Substitute {placeholder} from params, then context
        $url = preg_replace_callback('/\{(\w+)\}/', function ($m) use ($params, $context, $action, &$usedKeys) {
            $key = $m[1];

            // Special: {_link_id} resolves from context._links using provider_id
            if ($key === '_link_id' && is_array($context)) {
                $providerId = $action['provider_id'] ?? null;
                $links = $context['_links'] ?? [];
                if ($providerId && isset($links[$providerId])) {
                    return urlencode((string) $links[$providerId]);
                }
                // Fallback: if only one link exists, use it
                if (count($links) === 1) {
                    return urlencode((string) reset($links));
                }
                return $m[0]; // Leave unreplaced
            }

            if (isset($params[$key])) {
                $usedKeys[] = $key;
                return urlencode((string) $params[$key]);
            }
            if (is_array($context) && isset($context[$key])) {
                return urlencode((string) $context[$key]);
            }
            return $m[0]; // Leave unreplaced
        }, $urlTemplate);

        return $url;
    }

    /**
     * Build request body from params, applying forward mapping (es_field → api_field).
     *
     * @param array  $params   Input params
     * @param array  $mapping  {api_field: es_field} mapping (reverse direction for body)
     * @param mixed  $context  Object context
     * @return array
     */
    private function buildRequestBody(array $params, array $mapping, mixed $context): array
    {
        if (empty($mapping)) {
            return $params;
        }

        // Invert: {api_field: es_field} → {es_field: api_field}
        $inverted = array_flip($mapping);
        $body     = [];

        foreach ($params as $esField => $value) {
            $apiField        = $inverted[$esField] ?? $esField;
            $body[$apiField] = $value;
        }

        return $body;
    }

    /**
     * Apply reverse mapping to API response: {api_field: es_field} → rename keys.
     *
     * @param array $mapping   {api_field: es_field}
     * @param array $response  Raw API response
     * @return array           Mapped response
     */
    private function applyReverseMapping(array $mapping, array $response): array
    {
        $result = $response;
        foreach ($mapping as $apiField => $esField) {
            if (isset($response[$apiField])) {
                $result[$esField] = $response[$apiField];
                if ($apiField !== $esField) {
                    unset($result[$apiField]);
                }
            }
        }
        return $result;
    }

    /**
     * Update _links on the context object after an API call.
     *
     * Stores: _links[storage_id] = external_id
     * where external_id comes from response[action.id_field]
     *
     * @param array  $context   The ES object (passed by reference)
     * @param array  $action    The action def
     * @param array  $response  The API response
     */
    private function updateLinks(array &$context, array $action, array $response): void
    {
        $idField   = $action['id_field'] ?? 'id';
        $storageId = $action['storage_id'] ?? null;

        if ($storageId && isset($response[$idField])) {
            if (!isset($context['_links'])) {
                $context['_links'] = [];
            }
            $context['_links'][$storageId] = $response[$idField];
        }
    }

    /**
     * Resolve provider from action.provider_id via providerResolver.
     *
     * @param array $action
     * @return array|null Provider object or null
     */
    private function resolveProvider(array $action): ?array
    {
        $providerId = $action['provider_id'] ?? null;
        if (empty($providerId) || $this->providerResolver === null) {
            return null;
        }
        return ($this->providerResolver)($providerId);
    }

    /**
     * Build HTTP auth headers from provider.auth config.
     *
     * @param array|null $auth  {type: bearer|basic|apikey, token?, username?, password?, header?, key?}
     * @return array Key-value headers
     */
    private function buildAuthHeaders(?array $auth): array
    {
        if (empty($auth) || empty($auth['type'])) {
            return [];
        }

        return match ($auth['type']) {
            'bearer' => ['Authorization' => 'Bearer ' . ($auth['token'] ?? '')],
            'basic'  => ['Authorization' => 'Basic ' . base64_encode(($auth['username'] ?? '') . ':' . ($auth['password'] ?? ''))],
            'apikey' => [($auth['header'] ?? 'X-API-Key') => ($auth['key'] ?? '')],
            default  => [],
        };
    }

    /**
     * Resolve base URL from context object's linked provider (legacy fallback).
     *
     * @param mixed $context
     * @return string
     */
    private function resolveBaseUrl(mixed $context): string
    {
        // Context may carry _provider with base_url if set by the caller
        if (is_array($context) && isset($context['_provider']['base_url'])) {
            return rtrim($context['_provider']['base_url'], '/');
        }
        return '';
    }

    /**
     * Resolve a sub-action by ID.
     * Override this method to integrate with your store's object lookup.
     *
     * @param string $actionId
     * @return array|null
     */
    protected function resolveAction(string $actionId): ?array
    {
        // Default: no resolution (caller must subclass or inject a resolver)
        return null;
    }
}
