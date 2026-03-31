<?php
/**
 * CompositeStorageProvider — Primary storage with provider pipeline
 *
 * The primary provider (self) handles the main storage.
 * Additional providers in the pipeline run after the primary.
 *
 * Methods:
 *   - sync: on read miss from primary, try providers (fallback).
 *           If found in fallback, auto-save to primary.
 *   - fallback: on read miss, try providers. No write-back.
 *
 * Write: always writes to primary first, then to each provider (best-effort).
 */

namespace ElementStore;

class CompositeStorageProvider implements IStorageProvider
{
    /** @var IStorageProvider Primary storage (self) */
    private IStorageProvider $primary;

    /** @var IStorageProvider[] Pipeline of sub-providers */
    private array $providers;

    /** @var string Method: sync or fallback */
    private string $method;

    public function __construct(
        IStorageProvider $primary,
        array $providers = [],
        string $method = 'sync'
    ) {
        $this->primary = $primary;
        $this->providers = $providers;
        $this->method = $method;
    }

    // ─── Read ────────────────────────────────────────────────────

    public function getobj(string $class, mixed $id = null): array|null
    {
        // Try primary first
        try {
            $result = $this->primary->getobj($class, $id);
            if ($result !== null && (!is_array($result) || !empty($result))) {
                return $result;
            }
        } catch (\Throwable $e) {
            // Primary failed — fall through to providers
        }

        // Fallback: try each provider in order
        foreach ($this->providers as $provider) {
            try {
                $result = $provider->getobj($class, $id);
                if ($result !== null && (!is_array($result) || !empty($result))) {
                    // Sync: write back to primary
                    if ($this->method === 'sync' && $id !== null) {
                        try {
                            $this->primary->setobj($class, $result);
                        } catch (\Throwable $e) {
                            // Sync-back failed — not critical, return the data anyway
                        }
                    }
                    return $result;
                }
            } catch (\Throwable $e) {
                // Provider failed — try next
                continue;
            }
        }

        return $id === null ? [] : null;
    }

    // ─── Write ───────────────────────────────────────────────────

    public function setobj(string $class, array $obj): array
    {
        // Write to primary (must succeed)
        $result = $this->primary->setobj($class, $obj);

        // Write to providers (best-effort)
        foreach ($this->providers as $provider) {
            try {
                $provider->setobj($class, $result);
            } catch (\Throwable $e) {
                // Provider write failed — ignore
            }
        }

        return $result;
    }

    public function delobj(string $class, mixed $id): bool
    {
        // Delete from primary (must succeed)
        $deleted = $this->primary->delobj($class, $id);

        // Delete from providers (best-effort)
        foreach ($this->providers as $provider) {
            try {
                $provider->delobj($class, $id);
            } catch (\Throwable $e) {
                // Ignore
            }
        }

        return $deleted;
    }

    // ─── Query ────────────────────────────────────────────────────

    /** @var array Track which classes have been synced from fallback */
    private array $syncedClasses = [];

    public function query(string $class, array $filters = [], array $options = []): array
    {
        // For sync method: ensure this class is fully loaded from fallback first
        if ($this->method === 'sync' && !isset($this->syncedClasses[$class])) {
            $this->syncClassFromFallback($class);
            $this->syncedClasses[$class] = true;
        }

        // Query primary
        try {
            $results = $this->primary->query($class, $filters, $options);
            if (!empty($results)) {
                return $results;
            }
        } catch (\Throwable $e) {
            // Primary failed
        }

        // Fallback query
        foreach ($this->providers as $provider) {
            try {
                $results = $provider->query($class, $filters, $options);
                if (!empty($results)) {
                    return $results;
                }
            } catch (\Throwable $e) {
                continue;
            }
        }

        return [];
    }

    /**
     * Sync all objects of a class from fallback providers to primary.
     * Called once per class on first query (sync method only).
     */
    private function syncClassFromFallback(string $class): void
    {
        foreach ($this->providers as $provider) {
            try {
                // Get all objects from fallback
                $objects = $provider->getobj($class, null);
                if (empty($objects) || !is_array($objects)) continue;

                // Sync each to primary
                foreach ($objects as $obj) {
                    if (!is_array($obj)) continue;
                    $id = $obj['id'] ?? $obj[Constants::F_ID] ?? null;
                    if ($id === null) continue;

                    // Only sync if primary doesn't have it
                    try {
                        $existing = $this->primary->getobj($class, $id);
                        if ($existing !== null) continue;
                    } catch (\Throwable $e) {
                        // Primary read failed — try to sync anyway
                    }

                    try {
                        $this->primary->setobj($class, $obj);
                    } catch (\Throwable $e) {
                        // Sync failed — continue
                    }
                }
                return; // Done — synced from first provider that has data
            } catch (\Throwable $e) {
                continue;
            }
        }
    }

    // ─── Schema Operations ───────────────────────────────────────

    public function renameProp(string $classId, string $oldKey, string $newKey): int
    {
        $count = $this->primary->renameProp($classId, $oldKey, $newKey);
        foreach ($this->providers as $provider) {
            try { $provider->renameProp($classId, $oldKey, $newKey); } catch (\Throwable $e) {}
        }
        return $count;
    }

    public function renameClass(string $oldClassId, string $newClassId): int
    {
        $count = $this->primary->renameClass($oldClassId, $newClassId);
        foreach ($this->providers as $provider) {
            try { $provider->renameClass($oldClassId, $newClassId); } catch (\Throwable $e) {}
        }
        return $count;
    }

    // ─── Tenant Routing ──────────────────────────────────────────

    public function setTenantId(?string $tenantId): void
    {
        if (method_exists($this->primary, 'setTenantId')) {
            $this->primary->setTenantId($tenantId);
        }
        foreach ($this->providers as $provider) {
            if (method_exists($provider, 'setTenantId')) {
                $provider->setTenantId($tenantId);
            }
        }
    }
}
