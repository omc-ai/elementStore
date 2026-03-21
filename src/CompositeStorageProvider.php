<?php
/**
 * CompositeStorageProvider — Chain multiple storage providers
 *
 * Routes reads and writes through an ordered chain of storage providers.
 *
 * Read strategies:
 *   - fallback: try each read source in order, return first hit
 *   - merge: read from all sources, merge results (later sources override)
 *
 * Write strategies:
 *   - sequential: write to each target in order, stop on failure
 *   - parallel: write to all (best-effort, collect errors)
 *   - best_effort: write to all, ignore individual failures
 *
 * Usage:
 *   $composite = new CompositeStorageProvider(
 *       [$couchdb, $json],    // read chain
 *       [$couchdb, $json],    // write chain
 *       'fallback',           // read strategy
 *       'sequential'          // write strategy
 *   );
 */

namespace ElementStore;

class CompositeStorageProvider implements IStorageProvider
{
    /** @var IStorageProvider[] Read sources (ordered) */
    private array $readSources;

    /** @var IStorageProvider[] Write targets (ordered) */
    private array $writeTargets;

    private string $readStrategy;
    private string $writeStrategy;

    public function __construct(
        array $readSources,
        array $writeTargets,
        string $readStrategy = 'fallback',
        string $writeStrategy = 'sequential'
    ) {
        $this->readSources = $readSources;
        $this->writeTargets = $writeTargets;
        $this->readStrategy = $readStrategy;
        $this->writeStrategy = $writeStrategy;
    }

    // ─── Read ────────────────────────────────────────────────────

    public function getobj(string $class, mixed $id = null): array|null
    {
        if ($this->readStrategy === 'merge') {
            return $this->getObjMerge($class, $id);
        }
        return $this->getObjFallback($class, $id);
    }

    private function getObjFallback(string $class, mixed $id): array|null
    {
        foreach ($this->readSources as $source) {
            $result = $source->getobj($class, $id);
            if ($result !== null && (!is_array($result) || !empty($result))) {
                return $result;
            }
        }
        return $id === null ? [] : null;
    }

    private function getObjMerge(string $class, mixed $id): array|null
    {
        if ($id !== null) {
            // Single object — merge fields from all sources
            $merged = null;
            foreach ($this->readSources as $source) {
                $result = $source->getobj($class, $id);
                if ($result !== null) {
                    $merged = $merged === null ? $result : array_merge($merged, $result);
                }
            }
            return $merged;
        }

        // All objects — merge lists by ID
        $byId = [];
        foreach ($this->readSources as $source) {
            $results = $source->getobj($class) ?? [];
            foreach ($results as $obj) {
                $objId = $obj['id'] ?? null;
                if ($objId !== null) {
                    $byId[$objId] = isset($byId[$objId]) ? array_merge($byId[$objId], $obj) : $obj;
                }
            }
        }
        return array_values($byId);
    }

    // ─── Write ───────────────────────────────────────────────────

    public function setobj(string $class, array $obj): array
    {
        $result = $obj;
        $errors = [];

        foreach ($this->writeTargets as $i => $target) {
            try {
                $result = $target->setobj($class, $obj);
                // Use result from first write (primary) for subsequent writes
                if ($i === 0) {
                    $obj = $result; // includes generated ID, timestamps
                }
            } catch (\Throwable $e) {
                if ($this->writeStrategy === 'sequential') {
                    throw $e; // Stop on first failure
                }
                $errors[] = $e->getMessage();
            }
        }

        return $result;
    }

    public function delobj(string $class, mixed $id): bool
    {
        $deleted = false;
        foreach ($this->writeTargets as $target) {
            try {
                if ($target->delobj($class, $id)) {
                    $deleted = true;
                }
            } catch (\Throwable $e) {
                if ($this->writeStrategy === 'sequential') throw $e;
            }
        }
        return $deleted;
    }

    // ─── Query (reads from primary source) ───────────────────────

    public function query(string $class, array $filters = [], array $options = []): array
    {
        // Query uses the first read source (primary)
        return $this->readSources[0]->query($class, $filters, $options);
    }

    // ─── Schema Operations (apply to all write targets) ──────────

    public function renameProp(string $classId, string $oldKey, string $newKey): int
    {
        $count = 0;
        foreach ($this->writeTargets as $target) {
            try {
                $count += $target->renameProp($classId, $oldKey, $newKey);
            } catch (\Throwable $e) {
                if ($this->writeStrategy === 'sequential') throw $e;
            }
        }
        return $count;
    }

    public function renameClass(string $oldClassId, string $newClassId): int
    {
        $count = 0;
        foreach ($this->writeTargets as $target) {
            try {
                $count += $target->renameClass($oldClassId, $newClassId);
            } catch (\Throwable $e) {
                if ($this->writeStrategy === 'sequential') throw $e;
            }
        }
        return $count;
    }
}
