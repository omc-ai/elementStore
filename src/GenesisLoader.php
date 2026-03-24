<?php
/**
 * GenesisLoader - Direct genesis/seed file loader for .es/ directory
 *
 * Loads genesis files (.genesis.json) and seed files (.seed.json) from:
 * - Local .es/ directory (development and default mode)
 * - Remote git raw URL (production mode)
 *
 * Unlike genesis/Genesis.php which uses HTTP API calls, this loader
 * writes directly to the storage provider during boot — no round-trips.
 *
 * BOOT SEQUENCE:
 * 1. Load system.genesis.json → creates system class definitions
 * 2. Load *.seed.json → creates seed data (editors, functions)
 * 3. Load remaining *.genesis.json → domain class definitions
 *    (including their seed sections — classes + seed objects)
 *
 * SEED WRITE-BACK:
 * When a class or seed object is modified and the user has seed_write
 * permission, changes are automatically saved back to the source
 * genesis/seed file in .es/. For external projects, the genesis_dir
 * field on each class tracks which .es/ directory to write to.
 *
 * @package ElementStore
 */

namespace ElementStore;

class GenesisLoader
{
    private IStorageProvider $storage;
    private string $esDir;
    private ?string $genesisUrl;
    private string $genesisMode;

    /** @var ClassModel|null ClassModel for phase 2 loading (through ES validation) */
    private ?ClassModel $classModel = null;

    /** @var bool Whether system bootstrap (phase 1) is complete */
    private bool $bootstrapped = false;

    /** @var array<string, array{file: string, dir: string}> classId → seed file mapping */
    private array $seedFileMap = [];

    /** @var string|null Absolute path to apps/ directory for auto-discovery */
    private ?string $appsDir = null;

    /**
     * @param IStorageProvider $storage    Storage backend to write into
     * @param string          $esDir      Absolute path to .es/ directory
     * @param string|null     $genesisUrl Remote genesis URL base (git raw URL)
     * @param string          $genesisMode 'local' or 'remote'
     */
    public function __construct(
        IStorageProvider $storage,
        string $esDir,
        ?string $genesisUrl = null,
        string $genesisMode = 'local'
    ) {
        $this->storage = $storage;
        $this->esDir = rtrim($esDir, '/');
        $this->genesisUrl = $genesisUrl ? rtrim($genesisUrl, '/') : null;
        $this->genesisMode = $genesisMode;
    }

    /**
     * Set ClassModel for phase 2 loading.
     * After system classes are bootstrapped (phase 1), all subsequent
     * loads go through ClassModel with full validation, events, and versioning.
     */
    public function setClassModel(ClassModel $classModel): void
    {
        $this->classModel = $classModel;
    }

    /**
     * Save object through ClassModel (phase 2) or direct storage (phase 1 bootstrap).
     * Phase 1: system classes (@class, @prop, etc.) → direct storage (no validation yet)
     * Phase 2: everything else → ClassModel with validation, events, broadcast
     */
    private function saveObject(string $classId, array $data): array
    {
        // Phase 2: use ClassModel if available and bootstrap is done
        if ($this->bootstrapped && $this->classModel !== null) {
            try {
                $obj = $this->classModel->setObject($classId, $data);
                return $obj->toArray();
            } catch (\Throwable $e) {
                // Fall back to direct storage on validation errors during genesis
                error_log("[GenesisLoader] ClassModel save failed for {$classId}/{$data['id']}: {$e->getMessage()}, falling back to direct storage");
            }
        }

        // Phase 1 (bootstrap) or fallback: direct storage
        return $this->storage->setobj($classId, $data);
    }

    /**
     * Load all genesis and seed data into storage.
     * Called during boot before any user operations.
     *
     * Order: system.genesis.json first, then *.seed.json, then remaining *.genesis.json
     *
     * @param bool $force Re-load even if data already exists in storage
     * @return array Load results summary
     */
    public function load(bool $force = false): array
    {
        $results = [
            'started_at' => date('c'),
            'classes' => [],
            'seed' => [],
            'errors' => [],
            'skipped' => [],
        ];

        // Step 1: Load system genesis (must be first — defines meta-classes)
        $systemFile = 'system' . Constants::GENESIS_SUFFIX;
        $systemResult = $this->loadGenesisFile($systemFile, $force);
        $results = $this->mergeResults($results, $systemResult);

        // Step 2: Load all seed files (editors, functions, etc.)
        $files = $this->scanFiles();
        foreach ($files['seed'] as $seedFile) {
            $classId = $this->classIdFromSeedFile($seedFile);
            $seedResult = $this->loadSeedFile($seedFile, $classId, $force);
            $results = $this->mergeResults($results, $seedResult);
        }

        // Step 3: Load remaining genesis files (domain classes + their seed sections)
        foreach ($files['genesis'] as $genesisFile) {
            if ($genesisFile === $systemFile) {
                continue; // Already loaded
            }
            $genesisResult = $this->loadGenesisFile($genesisFile, $force);
            $results = $this->mergeResults($results, $genesisResult);
        }

        // Step 4: Auto-discover and load app genesis/seed files from apps/*/.es/
        $results['apps_loaded'] = [];
        if ($this->appsDir !== null && is_dir($this->appsDir)) {
            $apps = $this->discoverApps();
            foreach ($apps as $appName => $appEsDir) {
                $appResult = $this->loadApp($appName, $appEsDir, $force);
                $results = $this->mergeResults($results, $appResult);
                $results['apps_loaded'][] = $appName;
            }
        }

        $results['completed_at'] = date('c');
        $results['success'] = empty($results['errors']);
        return $results;
    }

    /**
     * Load a single genesis file — extracts classes array and processes seed section.
     *
     * Genesis file format:
     * {
     *   "version": "2.0.0",
     *   "classes": [ { "id": "@class", "class_id": "@class", ... }, ... ],
     *   "seed": [ { "storage": "./@project.seed.json" }, ... ]
     * }
     *
     * Each class definition gets stamped with genesis_file and genesis_dir
     * so we can write back later.
     *
     * @param string      $filename   Genesis filename (relative to .es/)
     * @param bool        $force      Overwrite existing classes
     * @param string|null $genesisDir Override .es/ directory (for external project loading)
     * @return array Results for this file
     */
    private function loadGenesisFile(string $filename, bool $force, ?string $genesisDir = null): array
    {
        $results = ['classes' => [], 'seed' => [], 'errors' => [], 'skipped' => []];
        $dir = $genesisDir ?? $this->esDir;

        $content = $this->readFileFrom($filename, $dir);
        if ($content === null) {
            $results['errors'][] = "Could not read genesis file: {$filename}";
            return $results;
        }

        $data = json_decode($content, true);
        if ($data === null) {
            $results['errors'][] = "Invalid JSON in genesis file: {$filename}";
            return $results;
        }

        // Load classes
        $classes = $data['classes'] ?? [];
        foreach ($classes as $classDef) {
            $classId = $classDef[Constants::F_ID] ?? null;
            if (!$classId) {
                $results['errors'][] = "Class without ID in {$filename}";
                continue;
            }

            // Check if exists (skip unless force)
            if (!$force) {
                $existing = $this->storage->getobj(Constants::K_CLASS, $classId);
                if ($existing !== null) {
                    $results['skipped'][] = "class:{$classId}";
                    continue;
                }
            }

            // Stamp genesis_file and genesis_dir for write-back tracking
            $classDef[Constants::F_GENESIS_FILE] = $filename;
            $classDef[Constants::F_GENESIS_DIR] = $dir;

            // Ensure class_id is @class
            $classDef[Constants::F_CLASS_ID] = Constants::K_CLASS;

            $this->storage->setobj(Constants::K_CLASS, $classDef);
            $results['classes'][$classId] = 'loaded';
        }

        // Process seed section — load seed files and build seedFileMap
        $seedEntries = $data['seed'] ?? [];
        foreach ($seedEntries as $seedEntry) {
            $storage = $seedEntry['storage'] ?? null;
            if ($storage === null) {
                continue;
            }

            // Strip leading "./" prefix (but preserve "../" for parent-relative paths)
            $seedFile = str_starts_with($storage, './') ? substr($storage, 2) : $storage;

            // Resolve parent-relative paths (../) against $dir to get absolute, then re-relativize
            if (str_starts_with($seedFile, '../')) {
                $resolvedPath = realpath($dir . '/' . $seedFile);
                if ($resolvedPath !== false) {
                    // Use resolved path with the actual directory it lives in
                    $seedFile = basename($resolvedPath);
                    $dir = dirname($resolvedPath);
                }
            }

            if (str_ends_with($seedFile, Constants::GENESIS_SUFFIX)) {
                // Sub-genesis: recurse
                $subResult = $this->loadGenesisFile($seedFile, $force, $dir);
                $results = $this->mergeResults($results, $subResult);
            } elseif (str_ends_with($seedFile, '.json')) {
                // Seed data file (.seed.json or plain .json like @project.json)
                if (str_ends_with($seedFile, Constants::SEED_SUFFIX)) {
                    $classId = $this->classIdFromSeedFile($seedFile);
                } else {
                    // Plain .json: derive class ID from filename (@project.json → @project)
                    $classId = str_replace('.json', '', $seedFile);
                }

                // Register in seedFileMap for write-back resolution
                $this->seedFileMap[$classId] = [
                    'file' => $seedFile,
                    'dir' => $dir,
                ];

                // Stamp seed_file on the class definition for persistent mapping
                $classDef = $this->storage->getobj(Constants::K_CLASS, $classId);
                if ($classDef !== null && !isset($classDef[Constants::F_SEED_FILE])) {
                    $classDef[Constants::F_SEED_FILE] = $seedFile;
                    $this->storage->setobj(Constants::K_CLASS, $classDef);
                }

                // Load seed objects into storage
                $seedResult = $this->loadSeedFile($seedFile, $classId, $force, $dir);
                $results = $this->mergeResults($results, $seedResult);
            }
        }

        return $results;
    }

    /**
     * Load a single seed file — flat array of objects for a specific class.
     *
     * Seed file format:
     * [
     *   { "id": "text", "class_id": "@editor", "name": "Text", ... },
     *   ...
     * ]
     *
     * @param string      $filename   Seed filename (relative to .es/)
     * @param string      $classId    Target class for these objects
     * @param bool        $force      Overwrite existing objects
     * @param string|null $fromDir    Directory to read from (defaults to $this->esDir)
     * @return array Results for this file
     */
    private function loadSeedFile(string $filename, string $classId, bool $force, ?string $fromDir = null): array
    {
        $results = ['classes' => [], 'seed' => [], 'errors' => [], 'skipped' => []];
        $dir = $fromDir ?? $this->esDir;

        $content = $this->readFileFrom($filename, $dir);
        if ($content === null) {
            $results['errors'][] = "Could not read seed file: {$filename}";
            return $results;
        }

        $objects = json_decode($content, true);
        if ($objects === null || !is_array($objects)) {
            $results['errors'][] = "Invalid JSON in seed file: {$filename}";
            return $results;
        }

        foreach ($objects as $obj) {
            $objId = $obj[Constants::F_ID] ?? null;
            $objClassId = $obj[Constants::F_CLASS_ID] ?? $classId;

            if (!$objId) {
                $results['errors'][] = "Object without ID in {$filename}";
                continue;
            }

            // Check if exists
            if (!$force) {
                $existing = $this->storage->getobj($objClassId, $objId);
                if ($existing !== null) {
                    $results['skipped'][] = "{$objClassId}:{$objId}";
                    continue;
                }
            }

            $this->storage->setobj($objClassId, $obj);
            $results['seed']["{$objClassId}:{$objId}"] = 'loaded';
        }

        return $results;
    }

    /**
     * Read file contents from a specific directory.
     *
     * @param string $filename File path relative to directory
     * @param string $dir      Directory to read from
     * @return string|null File contents or null on failure
     */
    private function readFileFrom(string $filename, string $dir): ?string
    {
        $localPath = $dir . '/' . $filename;
        if (!file_exists($localPath)) {
            return null;
        }

        $content = @file_get_contents($localPath);
        return $content !== false ? $content : null;
    }

    /**
     * Read file contents — from local .es/ or remote git URL.
     *
     * In 'local' mode: reads from $esDir/$filename
     * In 'remote' mode: fetches from $genesisUrl/.es/$filename
     *   Falls back to local if remote fails and local exists.
     *
     * @param string $filename File path relative to .es/
     * @return string|null File contents or null on failure
     */
    private function readFile(string $filename): ?string
    {
        if ($this->genesisMode === 'remote' && $this->genesisUrl !== null) {
            $url = $this->genesisUrl . '/' . Constants::ES_DIR . '/' . $filename;
            $content = $this->fetchRemote($url);
            if ($content !== null) {
                return $content;
            }
            // Fall back to local
        }

        return $this->readFileFrom($filename, $this->esDir);
    }

    /**
     * Fetch file from remote URL with timeout.
     *
     * @param string $url Full URL to fetch
     * @return string|null Content or null on failure
     */
    private function fetchRemote(string $url): ?string
    {
        $context = stream_context_create([
            'http' => [
                'method' => 'GET',
                'header' => "Accept: application/json\r\n",
                'timeout' => 10,
                'ignore_errors' => true,
            ],
            'ssl' => [
                'verify_peer' => true,
                'verify_peer_name' => true,
            ],
        ]);

        $content = @file_get_contents($url, false, $context);
        if ($content === false) {
            return null;
        }

        // Check HTTP status via $http_response_header
        if (isset($http_response_header) && is_array($http_response_header)) {
            $statusLine = $http_response_header[0] ?? '';
            if (preg_match('/\s(\d{3})\s/', $statusLine, $matches)) {
                $statusCode = (int)$matches[1];
                if ($statusCode >= 400) {
                    return null;
                }
            }
        }

        return $content;
    }

    /**
     * Save a class definition back to its genesis file.
     *
     * Reads the existing genesis JSON, finds the class by ID in the
     * classes array, replaces it (or appends), and writes back.
     * Uses file locking for concurrent safety.
     *
     * @param string      $classId     Class ID being saved
     * @param string      $genesisFile Genesis filename within .es/ (e.g., "system.genesis.json")
     * @param array       $data        Full class definition to save
     * @param string|null $genesisDir  Override .es/ directory (for external projects)
     * @return bool Success
     */
    public function saveToGenesis(string $classId, string $genesisFile, array $data, ?string $genesisDir = null): bool
    {
        $dir = $genesisDir ?? $this->esDir;
        $filePath = $dir . '/' . $genesisFile;

        // Read existing genesis file
        $content = file_exists($filePath) ? @file_get_contents($filePath) : null;
        if ($content === null || $content === false) {
            return false;
        }

        $genesis = json_decode($content, true);
        if ($genesis === null) {
            return false;
        }

        // Remove internal fields that shouldn't be in genesis
        $cleanData = $data;
        unset($cleanData[Constants::F_CREATED_AT]);
        unset($cleanData[Constants::F_UPDATED_AT]);
        unset($cleanData[Constants::F_GENESIS_FILE]);
        unset($cleanData[Constants::F_GENESIS_DIR]);

        // Find and replace the class in the classes array
        $found = false;
        $classes = $genesis['classes'] ?? [];
        foreach ($classes as $i => $cls) {
            if (($cls[Constants::F_ID] ?? null) === $classId) {
                $classes[$i] = $cleanData;
                $found = true;
                break;
            }
        }

        if (!$found) {
            $classes[] = $cleanData;
        }

        $genesis['classes'] = $classes;

        // Write back with file locking
        $json = json_encode($genesis, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($json === false) {
            return false;
        }

        $fp = @fopen($filePath, 'c');
        if ($fp === false) {
            return false;
        }

        if (flock($fp, LOCK_EX)) {
            ftruncate($fp, 0);
            fwrite($fp, $json);
            fflush($fp);
            flock($fp, LOCK_UN);
            fclose($fp);
            return true;
        }

        fclose($fp);
        return false;
    }

    /**
     * Save an object back to its seed file.
     *
     * Reads the existing seed file (flat array), finds the object by ID,
     * replaces/inserts it, and writes back.
     *
     * @param string      $classId    Target class (e.g., "@editor")
     * @param string      $seedFile   Seed filename within .es/ (e.g., "editors.seed.json")
     * @param array       $object     Object to upsert
     * @param string|null $seedDir    Override .es/ directory (for external projects)
     * @return bool Success
     */
    public function saveToSeed(string $classId, string $seedFile, array $object, ?string $seedDir = null): bool
    {
        $dir = $seedDir ?? $this->esDir;
        $filePath = $dir . '/' . $seedFile;

        // Read existing seed file
        $content = file_exists($filePath) ? @file_get_contents($filePath) : '[]';
        $objects = json_decode($content, true);
        if (!is_array($objects)) {
            $objects = [];
        }

        // Remove internal fields
        $cleanObj = $object;
        unset($cleanObj[Constants::F_CREATED_AT]);
        unset($cleanObj[Constants::F_UPDATED_AT]);

        // Find and replace or append
        $objId = $cleanObj[Constants::F_ID] ?? null;
        $found = false;
        if ($objId !== null) {
            foreach ($objects as $i => $existing) {
                if (($existing[Constants::F_ID] ?? null) === $objId) {
                    $objects[$i] = $cleanObj;
                    $found = true;
                    break;
                }
            }
        }

        if (!$found) {
            $objects[] = $cleanObj;
        }

        // Write back with file locking
        $json = json_encode($objects, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($json === false) {
            return false;
        }

        $fp = @fopen($filePath, 'c');
        if ($fp === false) {
            return false;
        }

        if (flock($fp, LOCK_EX)) {
            ftruncate($fp, 0);
            fwrite($fp, $json);
            fflush($fp);
            flock($fp, LOCK_UN);
            fclose($fp);
            return true;
        }

        fclose($fp);
        return false;
    }

    /**
     * Delete an object from its seed file.
     *
     * @param string      $classId  Target class
     * @param string      $seedFile Seed filename within .es/
     * @param string      $objectId Object ID to remove
     * @param string|null $seedDir  Override .es/ directory
     * @return bool Success
     */
    public function deleteFromSeed(string $classId, string $seedFile, string $objectId, ?string $seedDir = null): bool
    {
        $dir = $seedDir ?? $this->esDir;
        $filePath = $dir . '/' . $seedFile;

        if (!file_exists($filePath)) {
            return false;
        }

        $content = @file_get_contents($filePath);
        $objects = json_decode($content, true);
        if (!is_array($objects)) {
            return false;
        }

        // Filter out the object
        $filtered = array_values(array_filter($objects, function ($obj) use ($objectId) {
            return ($obj[Constants::F_ID] ?? null) !== $objectId;
        }));

        if (count($filtered) === count($objects)) {
            return false; // Not found
        }

        $json = json_encode($filtered, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($json === false) {
            return false;
        }

        $fp = @fopen($filePath, 'c');
        if ($fp === false) {
            return false;
        }

        if (flock($fp, LOCK_EX)) {
            ftruncate($fp, 0);
            fwrite($fp, $json);
            fflush($fp);
            flock($fp, LOCK_UN);
            fclose($fp);
            return true;
        }

        fclose($fp);
        return false;
    }

    /**
     * Load genesis and seed data from an external .es/ directory.
     *
     * Used when pushing registry data from an external project (e.g., platform_root)
     * into this elementStore instance.
     *
     * @param string $externalEsDir Absolute path to external .es/ directory
     * @param bool   $force         Overwrite existing data
     * @return array Load results summary
     */
    public function loadExternal(string $externalEsDir, bool $force = false): array
    {
        $results = [
            'started_at' => date('c'),
            'classes' => [],
            'seed' => [],
            'errors' => [],
            'skipped' => [],
        ];

        $externalEsDir = rtrim($externalEsDir, '/');
        if (!is_dir($externalEsDir)) {
            $results['errors'][] = "External .es/ directory not found: {$externalEsDir}";
            $results['success'] = false;
            return $results;
        }

        // Find genesis files in external dir
        $files = scandir($externalEsDir);
        $genesisFiles = [];
        foreach ($files as $file) {
            if ($file === '.' || $file === '..') {
                continue;
            }
            if (str_ends_with($file, Constants::GENESIS_SUFFIX)) {
                $genesisFiles[] = $file;
            }
        }

        // Load genesis files (they handle their own seed sections)
        foreach ($genesisFiles as $genesisFile) {
            $genesisResult = $this->loadGenesisFile($genesisFile, $force, $externalEsDir);
            $results = $this->mergeResults($results, $genesisResult);
        }

        $results['completed_at'] = date('c');
        $results['success'] = empty($results['errors']);
        return $results;
    }

    /**
     * Scan .es/ directory for genesis and seed files.
     *
     * @return array ['genesis' => [filenames], 'seed' => [filenames]]
     */
    public function scanFiles(): array
    {
        $result = ['genesis' => [], 'seed' => []];

        if (!is_dir($this->esDir)) {
            return $result;
        }

        $files = scandir($this->esDir);
        foreach ($files as $file) {
            if ($file === '.' || $file === '..') {
                continue;
            }
            if (str_ends_with($file, Constants::GENESIS_SUFFIX)) {
                $result['genesis'][] = $file;
            } elseif (str_ends_with($file, Constants::SEED_SUFFIX)) {
                $result['seed'][] = $file;
            }
        }

        // Sort so system.genesis.json is first
        usort($result['genesis'], function (string $a, string $b) {
            if (str_starts_with($a, 'system')) return -1;
            if (str_starts_with($b, 'system')) return 1;
            return strcmp($a, $b);
        });

        sort($result['seed']);

        return $result;
    }

    // =========================================================================
    // APP AUTO-DISCOVERY
    // =========================================================================

    /**
     * Set the apps directory for auto-discovery.
     * On load(), apps/{name}/.es/ directories will be scanned and loaded.
     *
     * @param string $appsDir Absolute path to apps/ directory
     */
    public function setAppsDir(string $appsDir): void
    {
        $this->appsDir = rtrim($appsDir, '/');
    }

    /**
     * Discover app directories that contain .es/ subdirectories.
     *
     * @return array<string, string> appName => absolute path to app's .es/ dir
     */
    public function discoverApps(): array
    {
        if ($this->appsDir === null || !is_dir($this->appsDir)) {
            return [];
        }

        $apps = [];
        $dirs = scandir($this->appsDir);
        foreach ($dirs as $entry) {
            if ($entry === '.' || $entry === '..') {
                continue;
            }
            $esDir = $this->appsDir . '/' . $entry . '/' . Constants::ES_DIR;
            if (is_dir($esDir)) {
                $apps[$entry] = $esDir;
            }
        }

        ksort($apps);
        return $apps;
    }

    /**
     * Load a single app's genesis and seed data.
     *
     * Handles the hybrid genesis format where the root JSON is both an @app
     * instance (has class_id, name, etc.) AND a genesis envelope (has classes[], seed[]).
     * The @app object is stored, then classes and seed are processed normally.
     *
     * Standard genesis/seed files in the app's .es/ directory are also loaded.
     *
     * @param string $appName  App directory name (e.g., "aic")
     * @param string $appEsDir Absolute path to the app's .es/ directory
     * @param bool   $force    Overwrite existing data
     * @return array Load results
     */
    public function loadApp(string $appName, string $appEsDir, bool $force = false): array
    {
        $results = ['classes' => [], 'seed' => [], 'errors' => [], 'skipped' => []];

        if (!is_dir($appEsDir)) {
            $results['errors'][] = "App .es/ directory not found: {$appEsDir}";
            return $results;
        }

        $files = scandir($appEsDir);
        $genesisFiles = [];
        $seedFiles = [];

        foreach ($files as $file) {
            if ($file === '.' || $file === '..') {
                continue;
            }
            if (str_ends_with($file, Constants::GENESIS_SUFFIX)) {
                $genesisFiles[] = $file;
            } elseif (str_ends_with($file, Constants::SEED_SUFFIX)) {
                $seedFiles[] = $file;
            }
        }

        // Process genesis files (may be hybrid format)
        foreach ($genesisFiles as $genesisFile) {
            $content = $this->readFileFrom($genesisFile, $appEsDir);
            if ($content === null) {
                $results['errors'][] = "Could not read app genesis: {$appEsDir}/{$genesisFile}";
                continue;
            }

            $data = json_decode($content, true);
            if ($data === null) {
                $results['errors'][] = "Invalid JSON in app genesis: {$appEsDir}/{$genesisFile}";
                continue;
            }

            // Hybrid format: root JSON has class_id (it's an @app instance + genesis envelope)
            if (isset($data[Constants::F_CLASS_ID]) && isset($data[Constants::F_ID])) {
                // Extract the @app object (all keys except classes/seed)
                $appObj = [];
                foreach ($data as $k => $v) {
                    if ($k !== 'classes' && $k !== 'seed') {
                        $appObj[$k] = $v;
                    }
                }
                $appClassId = $appObj[Constants::F_CLASS_ID];
                $appObjId = $appObj[Constants::F_ID];

                if (!$force) {
                    $existing = $this->storage->getobj($appClassId, $appObjId);
                    if ($existing !== null) {
                        $results['skipped'][] = "{$appClassId}:{$appObjId}";
                    } else {
                        $this->storage->setobj($appClassId, $appObj);
                        $results['seed']["{$appClassId}:{$appObjId}"] = 'loaded';
                    }
                } else {
                    $this->storage->setobj($appClassId, $appObj);
                    $results['seed']["{$appClassId}:{$appObjId}"] = 'loaded';
                }

                // Process classes[] from hybrid genesis (if any)
                if (!empty($data['classes'])) {
                    foreach ($data['classes'] as $classDef) {
                        $classId = $classDef[Constants::F_ID] ?? null;
                        if (!$classId) {
                            continue;
                        }
                        $classDef['genesis_file'] = $genesisFile;
                        $classDef['genesis_dir'] = $appEsDir;
                        if (!isset($classDef[Constants::F_CLASS_ID])) {
                            $classDef[Constants::F_CLASS_ID] = Constants::K_CLASS;
                        }

                        if (!$force) {
                            $existing = $this->storage->getobj(Constants::K_CLASS, $classId);
                            if ($existing !== null) {
                                $results['skipped'][] = "class:{$classId}";
                                continue;
                            }
                        }
                        $this->storage->setobj(Constants::K_CLASS, $classDef);
                        $results['classes'][$classId] = 'loaded';
                    }
                }

                // Process seed[] references from hybrid genesis
                if (!empty($data['seed'])) {
                    foreach ($data['seed'] as $seedRef) {
                        $seedStorage = $seedRef['storage'] ?? null;
                        if ($seedStorage === null) {
                            continue;
                        }
                        // Resolve relative path
                        $seedFilename = ltrim($seedStorage, './');
                        $classId = $this->classIdFromSeedFile($seedFilename);
                        $seedResult = $this->loadSeedFile($seedFilename, $classId, $force, $appEsDir);
                        $results = $this->mergeResults($results, $seedResult);
                    }
                }
            } else {
                // Standard genesis file — delegate to existing loader
                $genesisResult = $this->loadGenesisFile($genesisFile, $force, $appEsDir);
                $results = $this->mergeResults($results, $genesisResult);
            }
        }

        // Process standalone seed files (not referenced by genesis)
        foreach ($seedFiles as $seedFile) {
            $classId = $this->classIdFromSeedFile($seedFile);
            $seedResult = $this->loadSeedFile($seedFile, $classId, $force, $appEsDir);
            $results = $this->mergeResults($results, $seedResult);
        }

        return $results;
    }

    // =========================================================================
    // UTILITIES
    // =========================================================================

    /**
     * Derive class ID from seed filename.
     *
     * Convention: editors.seed.json -> @editor
     *             functions.seed.json -> @function
     *             @project.seed.json -> @project  (already @-prefixed)
     *             {name}.seed.json -> @{name} (singular)
     *
     * @param string $filename Seed filename
     * @return string Class ID
     */
    public function classIdFromSeedFile(string $filename): string
    {
        $mapping = [
            'editors.seed.json' => Constants::K_EDITOR,
            'functions.seed.json' => Constants::K_FUNCTION,
        ];

        if (isset($mapping[$filename])) {
            return $mapping[$filename];
        }

        // Strip .seed.json suffix
        $name = str_replace(Constants::SEED_SUFFIX, '', $filename);

        // If already @-prefixed (e.g., @project.seed.json → @project), don't add another @
        if (str_starts_with($name, '@')) {
            return $name;
        }

        // Generic: prepend @ and singularize
        return '@' . rtrim($name, 's');
    }

    /**
     * Get the seed file mapping built from genesis seed sections.
     *
     * @return array<string, array{file: string, dir: string}> classId → seed file info
     */
    public function getSeedFileMap(): array
    {
        return $this->seedFileMap;
    }

    /**
     * Merge partial results into main results array.
     */
    private function mergeResults(array $main, array $partial): array
    {
        $main['classes'] = array_merge($main['classes'], $partial['classes'] ?? []);
        $main['seed'] = array_merge($main['seed'], $partial['seed'] ?? []);
        $main['errors'] = array_merge($main['errors'], $partial['errors'] ?? []);
        $main['skipped'] = array_merge($main['skipped'], $partial['skipped'] ?? []);
        return $main;
    }

    /**
     * Get the .es/ directory path.
     *
     * @return string
     */
    public function getEsDir(): string
    {
        return $this->esDir;
    }
}
