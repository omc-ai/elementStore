<?php
/**
 * JSON Genesis Storage Provider
 *
 * File-based storage using genesis format (*.genesis.json).
 * Reads/writes class definitions and objects from .es/ directory.
 *
 * GENESIS FORMAT:
 * {
 *   "classes": [
 *     { "id": "@prop", "class_id": "@class", "name": "Property", "props": [...] },
 *     ...
 *   ]
 * }
 *
 * INDEX:
 * On first access, scans all *.genesis.json files and builds an in-memory
 * index mapping class_id/object_id → genesis file. Cached to index.es.json.
 *
 * INTERFACE: Same as all storage providers (IStorageProvider).
 */

namespace ElementStore;

class JsonStorageProvider implements IStorageProvider
{
    private string $dataDir;
    private ?array $index = null;

    public function __construct(?string $dataDir = null)
    {
        $this->dataDir = $dataDir ?? dirname(__DIR__) . '/data';
        if (!is_dir($this->dataDir)) {
            mkdir($this->dataDir, 0755, true);
        }
    }

    public function getDataDir(): string
    {
        return $this->dataDir;
    }

    // ─── Core Interface ──────────────────────────────────────────

    public function getobj(string $class, mixed $id = null): array|null
    {
        $index = $this->getIndex();

        if ($id !== null) {
            // Get single object
            $file = $index['map'][$class . '/' . $id] ?? null;
            if (!$file) return null;
            return $this->readObjectFromFile($file, $class, $id);
        }

        // Get ALL objects of a class
        $files = $index['class_files'][$class] ?? [];
        if (empty($files)) return [];

        $result = [];
        foreach (array_unique($files) as $file) {
            $objects = $this->readAllFromFile($file, $class);
            foreach ($objects as $obj) {
                $objId = $obj['id'] ?? null;
                if ($objId !== null) {
                    $result[] = $obj;
                }
            }
        }
        return $result;
    }

    public function setobj(string $class, array $obj): array
    {
        $id = $obj[Constants::F_ID] ?? null;
        $index = $this->getIndex();

        // Find which file this object belongs to
        $file = null;
        if ($id !== null) {
            $file = $index['map'][$class . '/' . $id] ?? null;
        }

        // If not in index, determine the file based on class
        if (!$file) {
            // For @class objects, find which genesis file has this class
            if ($class === Constants::K_CLASS && $id !== null) {
                $file = $index['map'][Constants::K_CLASS . '/' . $id] ?? null;
            }
            // Default: use the first genesis file that has this class, or system.genesis.json
            if (!$file) {
                $files = $index['class_files'][$class] ?? [];
                $file = !empty($files) ? $files[0] : 'system.genesis.json';
            }
        }

        $filePath = $this->dataDir . '/' . $file;

        // Read existing file
        $genesis = ['classes' => []];
        if (file_exists($filePath)) {
            $content = @file_get_contents($filePath);
            if ($content) {
                $genesis = json_decode($content, true) ?? ['classes' => []];
            }
        }

        // Ensure timestamps
        if (!isset($obj[Constants::F_CREATED_AT])) {
            $obj[Constants::F_CREATED_AT] = date('Y-m-d H:i:s');
        }
        $obj[Constants::F_UPDATED_AT] = date('Y-m-d H:i:s');

        // Find and replace or append
        $found = false;
        $section = 'classes'; // Genesis format only has 'classes' section
        foreach ($genesis[$section] ?? [] as $i => $existing) {
            if (($existing['id'] ?? null) === $id) {
                $genesis[$section][$i] = $obj;
                $found = true;
                break;
            }
        }
        if (!$found) {
            $genesis[$section][] = $obj;
        }

        // Write back
        $json = json_encode($genesis, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $bytes = @file_put_contents($filePath, $json, LOCK_EX);
        if ($bytes === false) {
            error_log("[JsonProvider] write failed for {$filePath}: " . (error_get_last()['message'] ?? 'permission denied'));
        }

        // Update index
        $this->updateIndex($class, $id, $file);

        return $obj;
    }

    public function delobj(string $class, mixed $id): bool
    {
        $index = $this->getIndex();
        $file = $index['map'][$class . '/' . $id] ?? null;
        if (!$file) return false;

        $filePath = $this->dataDir . '/' . $file;
        $content = @file_get_contents($filePath);
        if (!$content) return false;

        $genesis = json_decode($content, true);
        if (!$genesis) return false;

        $section = 'classes'; // Genesis format only has 'classes' section
        $found = false;
        foreach ($genesis[$section] ?? [] as $i => $existing) {
            if (($existing['id'] ?? null) === $id) {
                array_splice($genesis[$section], $i, 1);
                $found = true;
                break;
            }
        }

        if ($found) {
            $json = json_encode($genesis, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            @file_put_contents($filePath, $json, LOCK_EX);
            $this->removeFromIndex($class, $id);
        }

        return $found;
    }

    public function query(string $class, array $filters = [], array $options = []): array
    {
        $all = $this->getobj($class, null) ?? [];

        // Apply filters
        if (!empty($filters)) {
            $all = array_filter($all, function ($obj) use ($filters) {
                foreach ($filters as $key => $value) {
                    $objVal = $obj[$key] ?? null;
                    if (is_array($value)) {
                        if (!in_array($objVal, $value, false)) return false;
                    } else {
                        if ($objVal != $value) return false;
                    }
                }
                return true;
            });
        }

        // Apply sort
        if (!empty($options['sort'])) {
            $sortField = $options['sort'];
            $sortDir = strtolower($options['sortDir'] ?? 'asc') === 'desc' ? -1 : 1;
            usort($all, function ($a, $b) use ($sortField, $sortDir) {
                return (($a[$sortField] ?? '') <=> ($b[$sortField] ?? '')) * $sortDir;
            });
        }

        // Apply offset + limit
        $offset = (int)($options['offset'] ?? 0);
        $limit = isset($options['limit']) ? (int)$options['limit'] : null;
        if ($offset > 0) {
            $all = array_slice($all, $offset);
        }
        if ($limit !== null) {
            $all = array_slice($all, 0, $limit);
        }

        return array_values($all);
    }

    // ─── Schema Operations ───────────────────────────────────────

    public function renameProp(string $classId, string $oldKey, string $newKey): int
    {
        // Not applicable for genesis files — schema changes go through setobj
        return 0;
    }

    public function renameClass(string $oldClassId, string $newClassId): int
    {
        // Not applicable for genesis files — class renames go through setobj/delobj
        return 0;
    }

    // ─── Tenant ──────────────────────────────────────────────────

    public function setTenantId(?string $tenantId): void
    {
        // Genesis files are not tenant-scoped
    }

    // ─── Index ───────────────────────────────────────────────────

    private function getIndex(): array
    {
        if ($this->index !== null) {
            return $this->index;
        }

        // Try loading cached index
        $indexFile = $this->dataDir . '/index.es.json';
        if (file_exists($indexFile)) {
            $content = @file_get_contents($indexFile);
            if ($content) {
                $this->index = json_decode($content, true);
                if ($this->index !== null && isset($this->index['map'])) {
                    return $this->index;
                }
            }
        }

        // Build index by scanning genesis files
        $this->index = $this->buildIndex();
        return $this->index;
    }

    private function buildIndex(): array
    {
        $index = [
            'map' => [],           // "class/id" → filename
            'class_files' => [],   // class → [filenames]
        ];

        foreach (glob($this->dataDir . '/*.genesis.json') as $file) {
            $content = @file_get_contents($file);
            if (!$content) continue;
            $data = json_decode($content, true);
            if (!$data) continue;
            $basename = basename($file);

            // Index class definitions
            foreach ($data['classes'] ?? [] as $cls) {
                $classId = $cls['id'] ?? null;
                if (!$classId) continue;

                $key = Constants::K_CLASS . '/' . $classId;
                $index['map'][$key] = $basename;

                if (!isset($index['class_files'][Constants::K_CLASS])) {
                    $index['class_files'][Constants::K_CLASS] = [];
                }
                if (!in_array($basename, $index['class_files'][Constants::K_CLASS])) {
                    $index['class_files'][Constants::K_CLASS][] = $basename;
                }
            }

            // Index seed objects
            foreach ($data['seed'] ?? [] as $obj) {
                $objClass = $obj['class_id'] ?? null;
                $objId = $obj['id'] ?? null;
                if (!$objClass || !$objId) continue;

                $key = $objClass . '/' . $objId;
                $index['map'][$key] = $basename;

                if (!isset($index['class_files'][$objClass])) {
                    $index['class_files'][$objClass] = [];
                }
                if (!in_array($basename, $index['class_files'][$objClass])) {
                    $index['class_files'][$objClass][] = $basename;
                }
            }
        }

        // Save index
        $indexFile = $this->dataDir . '/index.es.json';
        @file_put_contents($indexFile, json_encode($index, JSON_PRETTY_PRINT), LOCK_EX);

        return $index;
    }

    private function updateIndex(string $class, ?string $id, string $file): void
    {
        if ($id === null) return;
        $index = $this->getIndex();
        $index['map'][$class . '/' . $id] = $file;
        if (!isset($index['class_files'][$class])) {
            $index['class_files'][$class] = [];
        }
        if (!in_array($file, $index['class_files'][$class])) {
            $index['class_files'][$class][] = $file;
        }
        $this->index = $index;
        @file_put_contents($this->dataDir . '/index.es.json', json_encode($index, JSON_PRETTY_PRINT), LOCK_EX);
    }

    private function removeFromIndex(string $class, string $id): void
    {
        $index = $this->getIndex();
        unset($index['map'][$class . '/' . $id]);
        $this->index = $index;
        @file_put_contents($this->dataDir . '/index.es.json', json_encode($index, JSON_PRETTY_PRINT), LOCK_EX);
    }

    // ─── File Operations ─────────────────────────────────────────

    private function readObjectFromFile(string $filename, string $class, string $id): ?array
    {
        $filePath = $this->dataDir . '/' . $filename;
        $content = @file_get_contents($filePath);
        if (!$content) return null;

        $data = json_decode($content, true);
        if (!$data) return null;

        // Search in classes array
        foreach ($data['classes'] ?? [] as $cls) {
            if (($cls['id'] ?? null) === $id) {
                if ($class === Constants::K_CLASS) {
                    $cls[Constants::F_CLASS_ID] = Constants::K_CLASS;
                }
                return $cls;
            }
        }

        // Search in seed array
        foreach ($data['seed'] ?? [] as $obj) {
            if (($obj['id'] ?? null) === $id && ($obj['class_id'] ?? null) === $class) {
                return $obj;
            }
        }

        return null;
    }

    private function readAllFromFile(string $filename, string $class): array
    {
        $filePath = $this->dataDir . '/' . $filename;
        $content = @file_get_contents($filePath);
        if (!$content) return [];

        $data = json_decode($content, true);
        if (!$data) return [];

        $result = [];

        // Classes section (for @class queries)
        if ($class === Constants::K_CLASS) {
            foreach ($data['classes'] ?? [] as $cls) {
                $cls[Constants::F_CLASS_ID] = Constants::K_CLASS;
                $result[] = $cls;
            }
        }

        // Seed section (for object queries)
        foreach ($data['seed'] ?? [] as $obj) {
            if (($obj['class_id'] ?? null) === $class) {
                $result[] = $obj;
            }
        }

        return $result;
    }
}
