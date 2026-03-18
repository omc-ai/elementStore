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

    private function request(string $method, string $url, ?array $body = null): array
    {
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
