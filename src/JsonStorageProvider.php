<?php
/**
 * JSON File Storage Provider
 *
 * File-based storage implementation using JSON files.
 * Each class is stored in a separate JSON file: {class_id}.json
 *
 * STORAGE STRUCTURE:
 * data/
 *   @class.json     - Class definitions
 *   @prop.json      - Property definitions (if stored separately)
 *   user.json       - User objects
 *   product.json    - Product objects
 *   ...
 *
 * FILE FORMAT:
 * {
 *   "1": { "id": 1, "class_id": "user", "name": "John", ... },
 *   "2": { "id": 2, "class_id": "user", "name": "Jane", ... }
 * }
 *
 * Objects are keyed by ID for fast lookup. IDs can be integers or strings.
 *
 * THREAD SAFETY:
 * This implementation is NOT thread-safe. For concurrent access,
 * use MongoStorageProvider or implement file locking.
 */

namespace ElementStore;

class JsonStorageProvider implements IStorageProvider
{
    /** @var string Directory path for JSON data files */
    private string $dataDir;

    /**
     * Create JSON storage provider
     *
     * @param string|null $dataDir Directory for JSON files. Created if not exists.
     *                             Defaults to ../data relative to src/
     */
    public function __construct(?string $dataDir = null)
    {
        $this->dataDir = $dataDir ?? dirname(__DIR__) . '/data';
        if (!is_dir($this->dataDir)) {
            mkdir($this->dataDir, 0755, true);
        }
    }

    /**
     * Get file path for a class
     *
     * @param string $class Class identifier
     * @return string Full file path
     */
    private function getFile(string $class): string
    {
        return $this->dataDir . '/' . $class . '.json';
    }

    /**
     * Load all objects for a class from JSON file
     *
     * @param string $class Class identifier
     * @return array Associative array of objects keyed by ID
     * @throws StorageException On file read error
     */
    private function load(string $class): array
    {
        $file = $this->getFile($class);
        if (!file_exists($file)) {
            return [];
        }

        $content = @file_get_contents($file);
        if ($content === false) {
            throw new StorageException(
                "Failed to read file: $file",
                'JSON',
                'load',
                ['class' => $class, 'file' => $file, 'error' => error_get_last()['message'] ?? 'Unknown error']
            );
        }

        $data = json_decode($content, true);
        if ($data === null && json_last_error() !== JSON_ERROR_NONE) {
            throw new StorageException(
                "Failed to parse JSON: " . json_last_error_msg(),
                'JSON',
                'load',
                ['class' => $class, 'file' => $file, 'json_error' => json_last_error_msg()]
            );
        }

        return $data ?? [];
    }

    /**
     * Save all objects for a class to JSON file
     *
     * @param string $class Class identifier
     * @param array $data Associative array of objects keyed by ID
     * @throws StorageException On file write error
     */
    private function save(string $class, array $data): void
    {
        $file = $this->getFile($class);
        $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);

        if ($json === false) {
            throw new StorageException(
                "Failed to encode JSON: " . json_last_error_msg(),
                'JSON',
                'save',
                ['class' => $class, 'json_error' => json_last_error_msg()]
            );
        }

        $result = @file_put_contents($file, $json);
        if ($result === false) {
            throw new StorageException(
                "Failed to write file: $file",
                'JSON',
                'save',
                ['class' => $class, 'file' => $file, 'error' => error_get_last()['message'] ?? 'Unknown error']
            );
        }
    }

    /**
     * Generate next auto-increment ID for a class
     *
     * @param array $data Existing objects
     * @return int Next available integer ID
     */
    private function nextId(array $data): int
    {
        if (empty($data)) {
            return 1;
        }
        $maxId = max(array_map(fn($obj) => (int)($obj[Constants::F_ID] ?? 0), $data));
        return $maxId + 1;
    }

    /**
     * @inheritDoc
     */
    public function getobj(string $class, mixed $id = null): array|null
    {
        $data = $this->load($class);

        if ($id === null) {
            return array_values($data);
        }

        $key = (string)$id;
        return $data[$key] ?? null;
    }

    /**
     * @inheritDoc
     *
     * Determines create vs update by checking if ID exists in storage.
     */
    public function setobj(string $class, array $obj): array
    {
        $data = $this->load($class);
        $id = $obj[Constants::F_ID] ?? null;
        $isNew = ($id === null || !isset($data[(string)$id]));

        if ($isNew) {
            // Create: generate ID, set class_id and created_at
            if (!isset($obj[Constants::F_ID])) {
                $obj[Constants::F_ID] = $this->nextId($data);
            }
            $obj[Constants::F_CLASS_ID] = $class;
            $obj[Constants::F_CREATED_AT] = date('Y-m-d H:i:s');
        }

        // Always update timestamp
        $obj[Constants::F_UPDATED_AT] = date('Y-m-d H:i:s');

        // Save to file
        $data[(string)$obj[Constants::F_ID]] = $obj;
        $this->save($class, $data);

        return $obj;
    }

    /**
     * @inheritDoc
     */
    public function delobj(string $class, mixed $id): bool
    {
        $data = $this->load($class);
        $key = (string)$id;

        if (!isset($data[$key])) {
            return false;
        }

        unset($data[$key]);
        $this->save($class, $data);
        return true;
    }

    /**
     * @inheritDoc
     *
     * Filters support:
     * - Exact match: ['status' => 'active']
     * - IN match: ['status' => ['active', 'pending']]
     */
    public function query(string $class, array $filters = [], array $options = []): array
    {
        $results = array_values($this->load($class));

        // Apply filters
        if (!empty($filters)) {
            $results = array_filter($results, function ($obj) use ($filters) {
                foreach ($filters as $key => $value) {
                    if (!isset($obj[$key])) {
                        return false;
                    }
                    if (is_array($value)) {
                        // IN match
                        if (!in_array($obj[$key], $value)) {
                            return false;
                        }
                    } else {
                        // Exact match
                        if ($obj[$key] != $value) {
                            return false;
                        }
                    }
                }
                return true;
            });
            $results = array_values($results);
        }

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
     * Iterates all objects, renames the key if present, saves file.
     */
    public function renameProp(string $classId, string $oldKey, string $newKey): int
    {
        $data = $this->load($classId);
        $count = 0;

        foreach ($data as $id => $obj) {
            if (array_key_exists($oldKey, $obj)) {
                $obj[$newKey] = $obj[$oldKey];
                unset($obj[$oldKey]);
                $obj[Constants::F_UPDATED_AT] = date('Y-m-d H:i:s');
                $data[$id] = $obj;
                $count++;
            }
        }

        if ($count > 0) {
            $this->save($classId, $data);
        }

        return $count;
    }

    /**
     * @inheritDoc
     *
     * Renames the JSON file and updates class_id in all objects.
     * @throws StorageException On file operation failure
     */
    public function renameClass(string $oldClassId, string $newClassId): int
    {
        $oldFile = $this->getFile($oldClassId);
        $newFile = $this->getFile($newClassId);

        if (!file_exists($oldFile)) {
            return 0;
        }

        $data = $this->load($oldClassId);
        $count = 0;

        // Update class_id in all objects
        foreach ($data as $id => $obj) {
            $obj[Constants::F_CLASS_ID] = $newClassId;
            $obj[Constants::F_UPDATED_AT] = date('Y-m-d H:i:s');
            $data[$id] = $obj;
            $count++;
        }

        // Save to new file and remove old
        $this->save($newClassId, $data);

        if (!@unlink($oldFile)) {
            throw new StorageException(
                "Failed to delete old file after rename: $oldFile",
                'JSON',
                'renameClass',
                ['oldFile' => $oldFile, 'newFile' => $newFile, 'error' => error_get_last()['message'] ?? 'Unknown error']
            );
        }

        return $count;
    }
}
