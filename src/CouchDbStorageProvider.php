<?php
/**
 * CouchDB Storage Provider
 *
 * CouchDB-based storage implementation using HTTP REST API.
 * Each class is stored in a separate database.
 *
 * STORAGE STRUCTURE:
 * CouchDB Server
 *   _class (database)      - Class definitions (@ replaced with _)
 *   _prop (database)       - Property definitions
 *   user (database)        - User objects
 *   product (database)     - Product objects
 *   _counters (database)   - Auto-increment counters
 *
 * DOCUMENT FORMAT:
 * {
 *   "_id": "1",           // CouchDB document ID (same as our id)
 *   "_rev": "1-abc...",   // CouchDB revision (managed internally)
 *   "id": 1,              // Our ID
 *   "class_id": "user",
 *   "name": "John",
 *   ...
 * }
 *
 * FEATURES:
 * - Built-in versioning via _rev field
 * - MVCC (Multi-Version Concurrency Control)
 * - HTTP REST API (no special driver needed)
 * - Replication support
 *
 * REQUIREMENTS:
 * - CouchDB 3.x server
 * - PHP curl extension
 *
 * @package ElementStore
 */

namespace ElementStore;

class CouchDbStorageProvider implements IStorageProvider
{
    /** @var string CouchDB server URL */
    private string $serverUrl;

    /** @var string|null Authentication header */
    private ?string $authHeader = null;

    /** @var array Cache of database existence checks */
    private array $dbCache = [];

    /**
     * Create CouchDB storage provider
     *
     * @param string $serverUrl CouchDB server URL (e.g., http://localhost:5984)
     * @param string|null $username Optional username for authentication
     * @param string|null $password Optional password for authentication
     */
    public function __construct(
        string $serverUrl = 'http://localhost:5984',
        ?string $username = null,
        ?string $password = null
    ) {
        $this->serverUrl = rtrim($serverUrl, '/');

        if ($username && $password) {
            $this->authHeader = 'Basic ' . base64_encode("$username:$password");
        }
    }

    /**
     * Get database name for a class (@ replaced with _)
     *
     * @param string $class Class identifier
     * @return string Database name
     */
    private function getDbName(string $class): string
    {
        // CouchDB database names must start with a letter
        // Replace @ prefix with 'es_' (elementstore)
        $name = strtolower($class);
        if (str_starts_with($name, '@')) {
            $name = 'es_' . substr($name, 1);
        }
        return $name;
    }

    /**
     * Ensure database exists, create if not
     *
     * @param string $class Class identifier
     * @param bool $skipCache Skip cache check (useful after reset)
     */
    private function ensureDatabase(string $class, bool $skipCache = false): void
    {
        $dbName = $this->getDbName($class);

        if (!$skipCache && isset($this->dbCache[$dbName])) {
            return;
        }

        // Check if database exists
        $response = $this->request('GET', "/$dbName");

        if ($response['status'] === 404) {
            // Create database
            $this->request('PUT', "/$dbName");
        }

        $this->dbCache[$dbName] = true;
    }

    /**
     * Clear database cache (call after reset/delete operations)
     */
    public function clearDbCache(): void
    {
        $this->dbCache = [];
    }

    /**
     * Make HTTP request to CouchDB
     *
     * @param string $method HTTP method
     * @param string $path URL path
     * @param array|null $data Request body (will be JSON encoded)
     * @param bool $throwOnError Whether to throw exception on non-success status
     * @return array ['status' => int, 'body' => array]
     * @throws StorageException On curl errors or connection failures
     */
    private function request(string $method, string $path, ?array $data = null, bool $throwOnError = false): array
    {
        $url = $this->serverUrl . $path;

        $ch = curl_init($url);
        if ($ch === false) {
            throw new StorageException(
                "Failed to initialize curl",
                'CouchDB',
                [],
                ['operation' => 'request', 'url' => $url]
            );
        }

        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => array_filter([
                'Content-Type: application/json',
                'Accept: application/json',
                $this->authHeader ? "Authorization: {$this->authHeader}" : null
            ]),
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_TIMEOUT => 30,
        ]);

        if ($data !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
        }

        $response = curl_exec($ch);
        $curlError = curl_error($ch);
        $curlErrno = curl_errno($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        // Check for curl errors (connection failures, timeouts, etc.)
        if ($response === false || $curlErrno !== 0) {
            throw new StorageException(
                "CouchDB connection failed: $curlError",
                'CouchDB',
                [],
                ['operation' => 'request', 'url' => $url, 'curl_errno' => $curlErrno, 'curl_error' => $curlError]
            );
        }

        $result = [
            'status' => $status,
            'body' => json_decode($response, true) ?? []
        ];

        // Throw on error if requested and status indicates failure
        if ($throwOnError && ($status < 200 || $status >= 300) && $status !== 404) {
            $errorMsg = $result['body']['error'] ?? $result['body']['reason'] ?? "HTTP $status";
            throw new StorageException(
                "CouchDB request failed: $errorMsg",
                'CouchDB',
                [],
                ['operation' => "$method $path", 'status' => $status, 'body' => $result['body']]
            );
        }

        return $result;
    }

    /**
     * Generate next auto-increment ID for a class
     *
     * Uses a separate _counters database to track sequences.
     * Uses optimistic locking with CouchDB _rev for concurrent safety.
     *
     * @param string $class Class identifier
     * @return int Next available integer ID
     */
    private function nextId(string $class): int
    {
        $this->ensureDatabase('_counters');
        $dbName = $this->getDbName('_counters');
        $docId = $this->getDbName($class);

        // Try to get current counter with retries for conflict handling
        for ($retry = 0; $retry < 5; $retry++) {
            $response = $this->request('GET', "/$dbName/$docId");

            if ($response['status'] === 200) {
                // Increment existing counter
                $doc = $response['body'];
                $newSeq = ($doc['seq'] ?? 0) + 1;
                $doc['seq'] = $newSeq;

                $updateResponse = $this->request('PUT', "/$dbName/$docId", $doc);
                if ($updateResponse['status'] >= 200 && $updateResponse['status'] < 300) {
                    return $newSeq;
                }
                // Conflict - retry
                usleep(10000 * ($retry + 1)); // Exponential backoff
                continue;
            } else {
                // Counter doesn't exist - create it
                $createResponse = $this->request('PUT', "/$dbName/$docId", ['seq' => 1]);
                if ($createResponse['status'] >= 200 && $createResponse['status'] < 300) {
                    return 1;
                }
                // Creation failed (maybe race condition) - retry
                usleep(10000 * ($retry + 1));
                continue;
            }
        }

        // Fallback: use timestamp-based ID if counter fails
        return (int)(microtime(true) * 1000) % 1000000000;
    }

    /**
     * @inheritDoc
     * @throws StorageException On connection or server errors
     */
    public function getobj(string $class, mixed $id = null): array|null
    {
        $this->ensureDatabase($class);
        $dbName = $this->getDbName($class);

        if ($id === null) {
            // Get all documents
            $response = $this->request('GET', "/$dbName/_all_docs?include_docs=true");

            // 200 = success, anything else is an error (connection errors already thrown by request())
            if ($response['status'] !== 200) {
                throw new StorageException(
                    "Failed to get objects from CouchDB: HTTP {$response['status']}",
                    'CouchDB',
                    [],
                    ['operation' => 'getobj', 'class' => $class, 'status' => $response['status'], 'body' => $response['body']]
                );
            }

            $results = [];
            foreach ($response['body']['rows'] ?? [] as $row) {
                if (isset($row['doc']) && !str_starts_with($row['id'], '_design/')) {
                    $results[] = $this->documentToArray($row['doc']);
                }
            }
            return $results;
        }

        // Get single document
        $response = $this->request('GET', "/$dbName/" . urlencode((string)$id));

        // 404 = not found (return null), 200 = success, anything else is an error
        if ($response['status'] === 404) {
            return null;
        }

        if ($response['status'] !== 200) {
            throw new StorageException(
                "Failed to get object from CouchDB: HTTP {$response['status']}",
                'CouchDB',
                [],
                ['operation' => 'getobj', 'class' => $class, 'id' => $id, 'status' => $response['status'], 'body' => $response['body']]
            );
        }

        return $this->documentToArray($response['body']);
    }

    /**
     * @inheritDoc
     *
     * Uses CouchDB revision for conflict handling.
     * @throws StorageException On save failure
     */
    public function setobj(string $class, array $obj): array
    {
        $this->ensureDatabase($class);
        $dbName = $this->getDbName($class);

        // Check if document exists
        $id = $obj[Constants::F_ID] ?? null;
        $existing = null;

        if ($id !== null) {
            $response = $this->request('GET', "/$dbName/" . urlencode((string)$id));
            if ($response['status'] === 200) {
                $existing = $response['body'];
            }
        }

        $isNew = ($existing === null);

        if ($isNew) {
            // Create: generate ID, set class_id and created_at
            if (!isset($obj[Constants::F_ID])) {
                $obj[Constants::F_ID] = $this->nextId($class);
            }
            $obj[Constants::F_CLASS_ID] = $class;
            $obj[Constants::F_CREATED_AT] = date('Y-m-d H:i:s');
        } else {
            // Update: preserve _rev for CouchDB
            $obj['_rev'] = $existing['_rev'];
        }

        // Always update timestamp
        $obj[Constants::F_UPDATED_AT] = date('Y-m-d H:i:s');

        // Set CouchDB _id
        $obj['_id'] = (string)$obj[Constants::F_ID];

        // Save document
        $response = $this->request('PUT', "/$dbName/" . urlencode($obj['_id']), $obj);

        if ($response['status'] < 200 || $response['status'] >= 300) {
            $errorMsg = $response['body']['error'] ?? $response['body']['reason'] ?? "HTTP {$response['status']}";
            throw new StorageException(
                "Failed to save object to CouchDB: $errorMsg",
                'CouchDB',
                [],
                ['operation' => 'setobj', 'class' => $class, 'id' => $obj[Constants::F_ID], 'status' => $response['status'], 'body' => $response['body']]
            );
        }

        // Update _rev from response
        if (isset($response['body']['rev'])) {
            $obj['_rev'] = $response['body']['rev'];
        }

        return $this->documentToArray($obj);
    }

    /**
     * @inheritDoc
     * @throws StorageException On delete failure (except not found)
     */
    public function delobj(string $class, mixed $id): bool
    {
        $this->ensureDatabase($class);
        $dbName = $this->getDbName($class);

        // Get document to retrieve _rev
        $response = $this->request('GET', "/$dbName/" . urlencode((string)$id));

        // 404 = document doesn't exist, return false (not an error)
        if ($response['status'] === 404) {
            return false;
        }

        // Any other non-200 status is an error
        if ($response['status'] !== 200) {
            throw new StorageException(
                "Failed to get object for deletion: HTTP {$response['status']}",
                'CouchDB',
                [],
                ['operation' => 'delobj', 'class' => $class, 'id' => $id, 'status' => $response['status'], 'body' => $response['body']]
            );
        }

        $rev = $response['body']['_rev'] ?? null;
        if (!$rev) {
            throw new StorageException(
                "Object missing _rev field, cannot delete",
                'CouchDB',
                [],
                ['operation' => 'delobj', 'class' => $class, 'id' => $id]
            );
        }

        // Delete with revision
        $deleteResponse = $this->request(
            'DELETE',
            "/$dbName/" . urlencode((string)$id) . "?rev=" . urlencode($rev)
        );

        if ($deleteResponse['status'] < 200 || $deleteResponse['status'] >= 300) {
            $errorMsg = $deleteResponse['body']['error'] ?? $deleteResponse['body']['reason'] ?? "HTTP {$deleteResponse['status']}";
            throw new StorageException(
                "Failed to delete object from CouchDB: $errorMsg",
                'CouchDB',
                [],
                ['operation' => 'delobj', 'class' => $class, 'id' => $id, 'status' => $deleteResponse['status'], 'body' => $deleteResponse['body']]
            );
        }

        return true;
    }

    /**
     * @inheritDoc
     *
     * Uses CouchDB Mango query for filtering.
     * Falls back to client-side filtering if Mango not available.
     * @throws StorageException On query failure
     */
    public function query(string $class, array $filters = [], array $options = []): array
    {
        $this->ensureDatabase($class);
        $dbName = $this->getDbName($class);

        // Build Mango query
        $selector = [];
        foreach ($filters as $key => $value) {
            if (is_array($value)) {
                $selector[$key] = ['$in' => $value];
            } else {
                $selector[$key] = $value;
            }
        }

        // If no filters, use _all_docs
        if (empty($selector)) {
            $results = $this->getobj($class);
        } else {
            // Use Mango query
            $query = ['selector' => $selector];

            if (isset($options['limit'])) {
                $query['limit'] = $options['limit'];
            }
            if (isset($options['offset'])) {
                $query['skip'] = $options['offset'];
            }
            if (isset($options['sort'])) {
                $sortDir = ($options['sortDir'] ?? 'asc') === 'desc' ? 'desc' : 'asc';
                $query['sort'] = [[$options['sort'] => $sortDir]];
            }

            $response = $this->request('POST', "/$dbName/_find", $query);

            // 400 = Mango query failed (e.g., no index), fallback to client-side
            if ($response['status'] === 400) {
                return $this->clientSideQuery($class, $filters, $options);
            }

            // Any other non-200 status is an error
            if ($response['status'] !== 200) {
                throw new StorageException(
                    "CouchDB query failed: HTTP {$response['status']}",
                    'CouchDB',
                    [],
                    ['operation' => 'query', 'class' => $class, 'filters' => $filters, 'status' => $response['status'], 'body' => $response['body']]
                );
            }

            $results = array_map(
                fn($doc) => $this->documentToArray($doc),
                $response['body']['docs'] ?? []
            );
        }

        // Apply sorting if not done by Mango
        if (isset($options['sort']) && empty($filters)) {
            $sortField = $options['sort'];
            $sortDir = ($options['sortDir'] ?? 'asc') === 'desc' ? -1 : 1;
            usort($results, function ($a, $b) use ($sortField, $sortDir) {
                $aVal = $a[$sortField] ?? '';
                $bVal = $b[$sortField] ?? '';
                if (is_numeric($aVal) && is_numeric($bVal)) {
                    return ($aVal - $bVal) * $sortDir;
                }
                return strcmp((string)$aVal, (string)$bVal) * $sortDir;
            });
        }

        // Apply pagination if not done by Mango
        if (empty($filters)) {
            if (isset($options['offset'])) {
                $results = array_slice($results, $options['offset']);
            }
            if (isset($options['limit'])) {
                $results = array_slice($results, 0, $options['limit']);
            }
        }

        return $results;
    }

    /**
     * Fallback query using client-side filtering
     *
     * @param string $class Class identifier
     * @param array $filters Filters
     * @param array $options Options
     * @return array Filtered results
     */
    private function clientSideQuery(string $class, array $filters, array $options): array
    {
        $all = $this->getobj($class);

        // Apply filters
        $results = array_filter($all, function ($obj) use ($filters) {
            foreach ($filters as $key => $value) {
                if (!isset($obj[$key])) {
                    return false;
                }
                if (is_array($value)) {
                    if (!in_array($obj[$key], $value)) {
                        return false;
                    }
                } else {
                    if ($obj[$key] != $value) {
                        return false;
                    }
                }
            }
            return true;
        });

        $results = array_values($results);

        // Apply sorting
        if (isset($options['sort'])) {
            $sortField = $options['sort'];
            $sortDir = ($options['sortDir'] ?? 'asc') === 'desc' ? -1 : 1;
            usort($results, function ($a, $b) use ($sortField, $sortDir) {
                $aVal = $a[$sortField] ?? '';
                $bVal = $b[$sortField] ?? '';
                if (is_numeric($aVal) && is_numeric($bVal)) {
                    return ($aVal - $bVal) * $sortDir;
                }
                return strcmp((string)$aVal, (string)$bVal) * $sortDir;
            });
        }

        // Apply pagination
        if (isset($options['offset'])) {
            $results = array_slice($results, $options['offset']);
        }
        if (isset($options['limit'])) {
            $results = array_slice($results, 0, $options['limit']);
        }

        return $results;
    }

    /**
     * @inheritDoc
     *
     * Updates all documents with the renamed property.
     * @throws StorageException On bulk update failure
     */
    public function renameProp(string $classId, string $oldKey, string $newKey): int
    {
        $this->ensureDatabase($classId);
        $dbName = $this->getDbName($classId);

        // Get all documents
        $response = $this->request('GET', "/$dbName/_all_docs?include_docs=true");

        if ($response['status'] !== 200) {
            throw new StorageException(
                "Failed to get documents for property rename: HTTP {$response['status']}",
                'CouchDB',
                [],
                ['operation' => 'renameProp', 'classId' => $classId, 'status' => $response['status'], 'body' => $response['body']]
            );
        }

        $count = 0;
        $bulkDocs = [];

        foreach ($response['body']['rows'] ?? [] as $row) {
            if (!isset($row['doc']) || str_starts_with($row['id'], '_design/')) {
                continue;
            }

            $doc = $row['doc'];
            if (array_key_exists($oldKey, $doc)) {
                $doc[$newKey] = $doc[$oldKey];
                unset($doc[$oldKey]);
                $doc[Constants::F_UPDATED_AT] = date('Y-m-d H:i:s');
                $bulkDocs[] = $doc;
                $count++;
            }
        }

        // Bulk update
        if (!empty($bulkDocs)) {
            $bulkResponse = $this->request('POST', "/$dbName/_bulk_docs", ['docs' => $bulkDocs]);
            if ($bulkResponse['status'] < 200 || $bulkResponse['status'] >= 300) {
                throw new StorageException(
                    "Failed to bulk update documents: HTTP {$bulkResponse['status']}",
                    'CouchDB',
                    [],
                    ['operation' => 'renameProp', 'classId' => $classId, 'oldKey' => $oldKey, 'newKey' => $newKey, 'status' => $bulkResponse['status']]
                );
            }
        }

        return $count;
    }

    /**
     * @inheritDoc
     *
     * Creates new database and copies all documents.
     * @throws StorageException On migration failure
     */
    public function renameClass(string $oldClassId, string $newClassId): int
    {
        $this->ensureDatabase($oldClassId);
        $this->ensureDatabase($newClassId);

        $oldDbName = $this->getDbName($oldClassId);
        $newDbName = $this->getDbName($newClassId);

        // Get all documents from old database
        $response = $this->request('GET', "/$oldDbName/_all_docs?include_docs=true");

        if ($response['status'] !== 200) {
            throw new StorageException(
                "Failed to get documents for class rename: HTTP {$response['status']}",
                'CouchDB',
                [],
                ['operation' => 'renameClass', 'oldClassId' => $oldClassId, 'status' => $response['status'], 'body' => $response['body']]
            );
        }

        $count = 0;
        $bulkDocs = [];

        foreach ($response['body']['rows'] ?? [] as $row) {
            if (!isset($row['doc']) || str_starts_with($row['id'], '_design/')) {
                continue;
            }

            $doc = $row['doc'];
            // Remove _rev for new database
            unset($doc['_rev']);
            $doc[Constants::F_CLASS_ID] = $newClassId;
            $doc[Constants::F_UPDATED_AT] = date('Y-m-d H:i:s');
            $bulkDocs[] = $doc;
            $count++;
        }

        // Bulk insert to new database
        if (!empty($bulkDocs)) {
            $bulkResponse = $this->request('POST', "/$newDbName/_bulk_docs", ['docs' => $bulkDocs]);
            if ($bulkResponse['status'] < 200 || $bulkResponse['status'] >= 300) {
                throw new StorageException(
                    "Failed to insert documents to new class: HTTP {$bulkResponse['status']}",
                    'CouchDB',
                    [],
                    ['operation' => 'renameClass', 'oldClassId' => $oldClassId, 'newClassId' => $newClassId, 'status' => $bulkResponse['status']]
                );
            }
        }

        // Delete old database
        if ($count > 0) {
            $deleteResponse = $this->request('DELETE', "/$oldDbName");
            if ($deleteResponse['status'] < 200 || $deleteResponse['status'] >= 300) {
                // Log warning but don't fail - documents were already copied
                error_log("Warning: Failed to delete old database $oldDbName after rename");
            }
            unset($this->dbCache[$oldDbName]);
        }

        return $count;
    }

    /**
     * Convert CouchDB document to plain array
     *
     * Removes CouchDB internal fields (_id, _rev) but keeps our id.
     *
     * @param array $doc CouchDB document
     * @return array Plain associative array
     */
    private function documentToArray(array $doc): array
    {
        unset($doc['_id'], $doc['_rev']);
        return $doc;
    }
}
