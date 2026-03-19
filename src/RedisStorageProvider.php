<?php
/**
 * RedisStorageProvider — Redis-based key-value cache storage
 *
 * Stores objects as JSON in Redis hashes. Each class is a hash,
 * each object is a field within the hash (keyed by object ID).
 *
 * Redis key format: es:{class_id}        → hash of all objects
 * Redis field:      {object_id}           → JSON string
 *
 * Best for:
 * - Session data, tokens, temporary state
 * - Cache layer in front of CouchDB (via CompositeStorage)
 * - High-frequency read/write objects (logs, metrics, real-time)
 * - Objects with TTL (expiring data)
 *
 * Uses raw Redis protocol (RESP) — no PHP extension or library needed.
 *
 * Usage in @init.json:
 *   {"type": "redis", "host": "agura_redis_1", "port": 6379, "prefix": "es:", "ttl": 3600}
 */

namespace ElementStore;

class RedisStorageProvider implements IStorageProvider
{
    private string $host;
    private int $port;
    private string $prefix;
    private int $defaultTtl;
    private $socket = null;

    public function __construct(string $host = 'localhost', int $port = 6379, string $prefix = 'es:', int $ttl = 0)
    {
        $this->host = $host;
        $this->port = $port;
        $this->prefix = $prefix;
        $this->defaultTtl = $ttl;
    }

    // ─── IStorageProvider ────────────────────────────────────────

    public function getobj(string $class, mixed $id = null): array|null
    {
        $key = $this->key($class);

        if ($id !== null) {
            $json = $this->cmd('HGET', $key, (string)$id);
            if ($json === null || $json === '' || $json === false) return null;
            return json_decode($json, true) ?: null;
        }

        // All objects in class
        $all = $this->cmd('HGETALL', $key);
        if (!is_array($all) || empty($all)) return [];

        $result = [];
        // HGETALL returns [field, value, field, value, ...]
        for ($i = 0; $i < count($all); $i += 2) {
            $obj = json_decode($all[$i + 1] ?? '', true);
            if ($obj) $result[] = $obj;
        }
        return $result;
    }

    public function setobj(string $class, array $obj): array
    {
        $id = $obj[Constants::F_ID] ?? null;
        $key = $this->key($class);
        $now = date('Y-m-d H:i:s');

        // Generate ID if missing
        if ($id === null || $id === '') {
            $id = bin2hex(random_bytes(8));
            $obj[Constants::F_ID] = $id;
        }

        // Check existing
        $existingJson = $this->cmd('HGET', $key, (string)$id);
        $existing = ($existingJson && $existingJson !== '') ? json_decode($existingJson, true) : null;

        if ($existing) {
            $obj['created_at'] = $existing['created_at'] ?? $now;
        } else {
            $obj[Constants::F_CLASS_ID] = $class;
            $obj['created_at'] = $now;
        }
        $obj['updated_at'] = $now;

        $json = json_encode($obj, JSON_UNESCAPED_UNICODE);
        $this->cmd('HSET', $key, (string)$id, $json);

        // Set TTL on the hash if configured
        if ($this->defaultTtl > 0) {
            $this->cmd('EXPIRE', $key, (string)$this->defaultTtl);
        }

        return $obj;
    }

    public function delobj(string $class, mixed $id): bool
    {
        $result = $this->cmd('HDEL', $this->key($class), (string)$id);
        return $result && $result > 0;
    }

    public function query(string $class, array $filters = [], array $options = []): array
    {
        // Get all, then filter in PHP (Redis hashes don't support complex queries)
        $all = $this->getobj($class);
        if (empty($all)) return [];

        // Apply filters
        foreach ($filters as $field => $value) {
            $all = array_filter($all, function ($obj) use ($field, $value) {
                $objVal = $obj[$field] ?? null;
                if (is_array($value)) return in_array($objVal, $value);
                return $objVal == $value;
            });
        }

        $all = array_values($all);

        // Sort
        if (!empty($options['sort'])) {
            $f = $options['sort'];
            $dir = ($options['sortDir'] ?? 'asc') === 'desc' ? -1 : 1;
            usort($all, fn($a, $b) => (($a[$f] ?? '') <=> ($b[$f] ?? '')) * $dir);
        }

        // Pagination
        $offset = $options['offset'] ?? 0;
        $limit = $options['limit'] ?? null;
        if ($offset > 0) $all = array_slice($all, $offset);
        if ($limit !== null) $all = array_slice($all, 0, $limit);

        return $all;
    }

    public function renameProp(string $classId, string $oldKey, string $newKey): int
    {
        $all = $this->getobj($classId) ?? [];
        $count = 0;
        foreach ($all as &$obj) {
            if (array_key_exists($oldKey, $obj)) {
                $obj[$newKey] = $obj[$oldKey];
                unset($obj[$oldKey]);
                $this->cmd('HSET', $this->key($classId), (string)$obj['id'], json_encode($obj));
                $count++;
            }
        }
        return $count;
    }

    public function renameClass(string $oldClassId, string $newClassId): int
    {
        $all = $this->getobj($oldClassId) ?? [];
        foreach ($all as &$obj) {
            $obj[Constants::F_CLASS_ID] = $newClassId;
            $this->cmd('HSET', $this->key($newClassId), (string)$obj['id'], json_encode($obj));
        }
        $this->cmd('DEL', $this->key($oldClassId));
        return count($all);
    }

    // ─── Redis-specific methods ──────────────────────────────────

    /**
     * Set TTL on a class hash (all objects of that class expire together)
     */
    public function setClassTtl(string $class, int $seconds): void
    {
        $this->cmd('EXPIRE', $this->key($class), (string)$seconds);
    }

    /**
     * Check if a class hash exists
     */
    public function classExists(string $class): bool
    {
        return (bool)$this->cmd('EXISTS', $this->key($class));
    }

    /**
     * Get count of objects in a class
     */
    public function classCount(string $class): int
    {
        return (int)$this->cmd('HLEN', $this->key($class));
    }

    // ─── Raw Redis Protocol (RESP) ───────────────────────────────

    private function key(string $class): string
    {
        return $this->prefix . str_replace(':', '_', $class);
    }

    private function connect(): void
    {
        if ($this->socket !== null) return;

        $this->socket = @fsockopen($this->host, $this->port, $errno, $errstr, 2);
        if (!$this->socket) {
            throw new StorageException("Redis connection failed: $errstr ($errno)", 'connection_error');
        }
        stream_set_timeout($this->socket, 5);
    }

    private function cmd(string ...$args): mixed
    {
        $this->connect();

        // Build RESP protocol message
        $msg = '*' . count($args) . "\r\n";
        foreach ($args as $arg) {
            $msg .= '$' . strlen($arg) . "\r\n" . $arg . "\r\n";
        }

        fwrite($this->socket, $msg);
        return $this->readReply();
    }

    private function readReply(): mixed
    {
        $line = fgets($this->socket);
        if ($line === false) return null;

        $type = $line[0];
        $data = trim(substr($line, 1));

        return match ($type) {
            '+' => $data,                          // Simple string
            '-' => null,                           // Error (silently return null)
            ':' => (int)$data,                     // Integer
            '$' => $this->readBulkString((int)$data), // Bulk string
            '*' => $this->readArray((int)$data),   // Array
            default => null,
        };
    }

    private function readBulkString(int $length): ?string
    {
        if ($length < 0) return null;
        $data = '';
        $remaining = $length + 2; // +2 for \r\n
        while ($remaining > 0) {
            $chunk = fread($this->socket, $remaining);
            if ($chunk === false) break;
            $data .= $chunk;
            $remaining -= strlen($chunk);
        }
        return substr($data, 0, $length);
    }

    private function readArray(int $count): ?array
    {
        if ($count < 0) return null;
        $result = [];
        for ($i = 0; $i < $count; $i++) {
            $result[] = $this->readReply();
        }
        return $result;
    }

    public function __destruct()
    {
        if ($this->socket) {
            fclose($this->socket);
            $this->socket = null;
        }
    }
}
