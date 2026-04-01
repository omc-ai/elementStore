<?php
/**
 * WebSocket Storage Provider — broadcasts changes to connected clients
 *
 * Not a data store — only implements setobj (broadcast on change)
 * and delobj (broadcast deletion). get/query return empty.
 *
 * Wraps BroadcastService for the actual HTTP POST to the WS server.
 */

namespace ElementStore;

class WebSocketStorageProvider implements IStorageProvider
{
    public function getobj(string $class, mixed $id = null): array|null
    {
        // WebSocket is not a data store — no reads
        return $id === null ? [] : null;
    }

    public function setobj(string $class, array $obj): array
    {
        // Broadcast the change
        $oldValues = $obj['old_values'] ?? null;
        $item = $obj;
        if ($oldValues) {
            $item['old_values'] = $oldValues;
        }
        BroadcastService::send([$item]);
        return $obj;
    }

    public function delobj(string $class, mixed $id): bool
    {
        // Broadcast deletion
        BroadcastService::send([[
            'id' => $id,
            'class_id' => $class,
            '_deleted' => true,
        ]]);
        return true;
    }

    public function query(string $class, array $filters = [], array $options = []): array
    {
        // WebSocket is not a data store — no queries
        return [];
    }

    public function renameProp(string $classId, string $oldKey, string $newKey): int
    {
        return 0;
    }

    public function renameClass(string $oldClassId, string $newClassId): int
    {
        return 0;
    }

    public function setTenantId(?string $tenantId): void
    {
        // No tenant scoping for broadcast
    }
}
