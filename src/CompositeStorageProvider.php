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

    // ─── Query (primary only) ────────────────────────────────────

    public function query(string $class, array $filters = [], array $options = []): array
    {
        try {
            $results = $this->primary->query($class, $filters, $options);
            if (!empty($results)) {
                return $results;
            }
        } catch (\Throwable $e) {
            // Primary query failed
        }

        // Fallback query: try providers
        foreach ($this->providers as $provider) {
            try {
                $results = $provider->query($class, $filters, $options);
                if (!empty($results)) {
                    // Sync results to primary if method=sync
                    if ($this->method === 'sync') {
                        foreach ($results as $obj) {
                            try {
                                $this->primary->setobj($class, $obj);
                            } catch (\Throwable $e) {
                                // Sync-back failed
                            }
                        }
                    }
                    return $results;
                }
            } catch (\Throwable $e) {
                continue;
            }
        }

        return [];
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
