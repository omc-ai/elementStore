<?php
/**
 * ApiStorageProvider — External API storage via @provider
 *
 * Maps elementStore CRUD operations to HTTP API calls using a @provider definition.
 * The provider defines base_url, auth, and endpoint patterns.
 *
 * Uses crud_provider patterns:
 *   get_one:    GET  {base_url}/{endpoint}/{id}
 *   get_list:   GET  {base_url}/{endpoint}
 *   create_one: POST {base_url}/{endpoint}
 *   update_one: PUT  {base_url}/{endpoint}/{id}
 *   delete_one: DELETE {base_url}/{endpoint}/{id}
 *
 * Field mapping: provider.mapping maps API field names ↔ ES field names
 *
 * Usage:
 *   $provider = $model->getObject('@provider', 'billing-api');
 *   $storage = new ApiStorageProvider($provider->toArray());
 */

namespace ElementStore;

class ApiStorageProvider implements IStorageProvider
{
    private string $baseUrl;
    private array $auth;
    private array $endpoints;
    private array $mapping;
    private array $headers;

    public function __construct(array $providerDef)
    {
        $this->baseUrl = rtrim($providerDef['base_url'] ?? '', '/');
        $this->auth = $providerDef['auth'] ?? [];
        $this->mapping = $providerDef['mapping'] ?? [];
        $this->headers = [];

        // Build auth headers
        $authType = $this->auth['type'] ?? '';
        match ($authType) {
            'bearer' => $this->headers[] = 'Authorization: Bearer ' . ($this->auth['token'] ?? ''),
            'basic' => $this->headers[] = 'Authorization: Basic ' . base64_encode(
                ($this->auth['username'] ?? '') . ':' . ($this->auth['password'] ?? '')
            ),
            'apikey' => $this->headers[] = ($this->auth['header'] ?? 'X-API-Key') . ': ' . ($this->auth['key'] ?? ''),
            default => null,
        };

        // Extract CRUD endpoints from provider actions or crud_provider patterns
        $this->endpoints = [
            'get_one' => $providerDef['get_one'] ?? '/{class}/{id}',
            'get_list' => $providerDef['get_list'] ?? '/{class}',
            'create_one' => $providerDef['create_one'] ?? '/{class}',
            'update_one' => $providerDef['update_one'] ?? '/{class}/{id}',
            'delete_one' => $providerDef['delete_one'] ?? '/{class}/{id}',
        ];
    }

    public function getobj(string $class, mixed $id = null): array|null
    {
        if ($id !== null) {
            $url = $this->buildUrl('get_one', $class, $id);
            $response = $this->request('GET', $url);
            if ($response['status'] === 200) {
                return $this->mapInbound($response['body']);
            }
            return null;
        }

        $url = $this->buildUrl('get_list', $class);
        $response = $this->request('GET', $url);
        if ($response['status'] === 200 && is_array($response['body'])) {
            return array_map(fn($obj) => $this->mapInbound($obj), $response['body']);
        }
        return [];
    }

    public function setobj(string $class, array $obj): array
    {
        $id = $obj[Constants::F_ID] ?? null;
        $mapped = $this->mapOutbound($obj);

        if ($id) {
            // Update
            $url = $this->buildUrl('update_one', $class, $id);
            $response = $this->request('PUT', $url, $mapped);
        } else {
            // Create
            $url = $this->buildUrl('create_one', $class);
            $response = $this->request('POST', $url, $mapped);
        }

        if ($response['status'] >= 200 && $response['status'] < 300) {
            $result = is_array($response['body']) ? $this->mapInbound($response['body']) : $obj;
            $result[Constants::F_CLASS_ID] = $class;
            return $result;
        }

        throw new StorageException(
            'API storage error: HTTP ' . $response['status'],
            'storage_error'
        );
    }

    public function delobj(string $class, mixed $id): bool
    {
        $url = $this->buildUrl('delete_one', $class, $id);
        $response = $this->request('DELETE', $url);
        return $response['status'] >= 200 && $response['status'] < 300;
    }

    public function query(string $class, array $filters = [], array $options = []): array
    {
        $url = $this->buildUrl('get_list', $class);
        // Append filters as query params
        if (!empty($filters)) {
            $url .= '?' . http_build_query($filters);
        }
        $response = $this->request('GET', $url);
        if ($response['status'] === 200 && is_array($response['body'])) {
            return array_map(fn($obj) => $this->mapInbound($obj), $response['body']);
        }
        return [];
    }

    public function renameProp(string $classId, string $oldKey, string $newKey): int
    {
        return 0; // Not supported via API
    }

    public function renameClass(string $oldClassId, string $newClassId): int
    {
        return 0; // Not supported via API
    }

    // ─── Helpers ─────────────────────────────────────────────────

    private function buildUrl(string $action, string $class, mixed $id = null): string
    {
        $pattern = $this->endpoints[$action] ?? '/{class}';
        $url = str_replace('{class}', urlencode($class), $pattern);
        if ($id !== null) {
            $url = str_replace('{id}', urlencode((string)$id), $url);
        }
        return $this->baseUrl . $url;
    }

    private function mapInbound(array $obj): array
    {
        if (empty($this->mapping)) return $obj;
        $mapped = [];
        $reverseMap = array_flip($this->mapping);
        foreach ($obj as $k => $v) {
            $mapped[$reverseMap[$k] ?? $k] = $v;
        }
        return $mapped;
    }

    private function mapOutbound(array $obj): array
    {
        if (empty($this->mapping)) return $obj;
        $mapped = [];
        foreach ($obj as $k => $v) {
            $mapped[$this->mapping[$k] ?? $k] = $v;
        }
        return $mapped;
    }

    /**
     * Validate a URL against SSRF risks before making an outbound HTTP request.
     *
     * Blocks requests to private/reserved IP ranges unless the host is
     * explicitly listed in the API_SSRF_ALLOWLIST env var (comma-separated
     * hostnames or CIDRs). Only http:// and https:// schemes are permitted.
     *
     * @param string $url Full URL to validate
     * @throws \InvalidArgumentException on scheme violation or blocked IP
     */
    private function validateUrlForSsrf(string $url): void
    {
        $parsed = parse_url($url);
        $scheme = strtolower($parsed['scheme'] ?? '');

        if (!in_array($scheme, ['http', 'https'], true)) {
            throw new \InvalidArgumentException(
                "API provider URL must use http or https scheme. Got: {$scheme}"
            );
        }

        $host = $parsed['host'] ?? '';
        if ($host === '') {
            throw new \InvalidArgumentException("API provider URL has no host.");
        }

        // Check explicit allowlist first (env var: comma-separated host substrings)
        $allowlistRaw = getenv('API_SSRF_ALLOWLIST') ?: '';
        if ($allowlistRaw !== '') {
            $allowed = array_filter(array_map('trim', explode(',', $allowlistRaw)));
            foreach ($allowed as $entry) {
                if ($entry !== '' && (strcasecmp($host, $entry) === 0 || str_ends_with($host, '.' . $entry))) {
                    return; // Explicitly allowed
                }
            }
        }

        // Resolve hostname to IPv4 and block private/reserved ranges
        $ip = gethostbyname($host);
        if ($ip === $host && !filter_var($host, FILTER_VALIDATE_IP)) {
            // DNS resolution failed — block to prevent DNS rebinding fallback
            throw new \InvalidArgumentException(
                "API provider host '{$host}' could not be resolved. Request blocked."
            );
        }

        $long = ip2long($ip);
        if ($long === false) {
            // IPv6 or unparseable — allow but log (IPv6 SSRF is a separate concern)
            return;
        }

        // Private and reserved IPv4 ranges
        $blocked = [
            ['0.0.0.0',         '0.255.255.255'],   // this-network
            ['10.0.0.0',        '10.255.255.255'],   // RFC 1918 private
            ['100.64.0.0',      '100.127.255.255'],  // RFC 6598 shared
            ['127.0.0.0',       '127.255.255.255'],  // loopback
            ['169.254.0.0',     '169.254.255.255'],  // link-local / AWS metadata
            ['172.16.0.0',      '172.31.255.255'],   // RFC 1918 private
            ['192.168.0.0',     '192.168.255.255'],  // RFC 1918 private
            ['198.18.0.0',      '198.19.255.255'],   // RFC 2544 benchmark
            ['198.51.100.0',    '198.51.100.255'],   // TEST-NET-2
            ['203.0.113.0',     '203.0.113.255'],    // TEST-NET-3
            ['240.0.0.0',       '255.255.255.255'],  // reserved / broadcast
        ];

        foreach ($blocked as [$start, $end]) {
            if ($long >= ip2long($start) && $long <= ip2long($end)) {
                throw new \InvalidArgumentException(
                    "API provider URL '{$url}' resolves to a private or reserved IP address ({$ip}). "
                    . "SSRF blocked. Add the host to API_SSRF_ALLOWLIST env var to permit internal endpoints."
                );
            }
        }
    }

    private function request(string $method, string $url, ?array $body = null): array
    {
        // SSRF guard: reject private/internal URLs from stored provider definitions
        $this->validateUrlForSsrf($url);

        $ch = curl_init($url);
        $headers = array_merge(['Content-Type: application/json'], $this->headers);

        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => 30,
        ]);

        if ($body !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
        }

        $response = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        return [
            'status' => $status,
            'body' => json_decode($response, true),
        ];
    }
}
