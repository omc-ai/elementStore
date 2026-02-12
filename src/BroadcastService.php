<?php
/**
 * BroadcastService — fire-and-forget HTTP POST to the WS server
 *
 * Sends change events so the WebSocket server can fan out to subscribed
 * clients. Failures are logged but never block the save.
 *
 * The WS server skips broadcasting back to connections belonging to the
 * sender's user_id (extracted from JWT), so the saving client doesn't
 * receive its own changes as echo.
 *
 * Message protocol:
 *   { type: "changes", items: [ { id, class_id, ...data, _old: {...} }, ... ] }
 *
 * Each item IS the object data (id, class_id, all fields).
 * _old contains the previous values (optional, omitted for new objects).
 * _deleted: true marks a deletion.
 */

namespace ElementStore;

class BroadcastService
{
    private static string $wsUrl = 'http://elementstore-ws:3100/broadcast';

    /**
     * Broadcast one or more changed items to the WS server.
     *
     * @param array       $items        Array of item payloads (each has id, class_id, data fields)
     * @param string|null $senderUserId User ID of the client that triggered the save (skip echo)
     */
    public static function send(array $items, ?string $senderUserId = null): void
    {
        if (empty($items)) {
            return;
        }

        $payload = json_encode([
            'type'  => 'changes',
            'items' => $items,
        ]);

        $headers = [
            'Content-Type: application/json',
            'Content-Length: ' . strlen($payload),
        ];
        if ($senderUserId) {
            $headers[] = 'X-Sender-User-Id: ' . $senderUserId;
        }

        $context = stream_context_create([
            'http' => [
                'method'  => 'POST',
                'header'  => implode("\r\n", $headers),
                'content' => $payload,
                'timeout' => 0.5, // 500ms max — fire and forget
                'ignore_errors' => true,
            ],
        ]);

        try {
            @file_get_contents(self::$wsUrl, false, $context);
        } catch (\Throwable $e) {
            error_log('[ElementStore] BroadcastService: ' . $e->getMessage());
        }
    }

    /**
     * Convenience: broadcast a single changed object.
     *
     * @param array       $data         The saved object data (must include id, class_id)
     * @param array|null  $oldData      Previous object data (null for new objects)
     * @param string|null $senderUserId User ID of the saving client
     */
    public static function emitChange(array $data, ?array $oldData, ?string $senderUserId = null): void
    {
        $item = $data;
        if ($oldData !== null) {
            $item['_old'] = $oldData;
        }
        self::send([$item], $senderUserId);
    }

    /**
     * Convenience: broadcast a single deleted object.
     *
     * @param string      $classId      Class identifier
     * @param string      $id           Object ID
     * @param array|null  $oldData      Previous object data (optional)
     * @param string|null $senderUserId User ID of the deleting client
     */
    public static function emitDelete(string $classId, string $id, ?array $oldData = null, ?string $senderUserId = null): void
    {
        $item = [
            Constants::F_ID       => $id,
            Constants::F_CLASS_ID => $classId,
            '_deleted'            => true,
        ];
        if ($oldData !== null) {
            $item['_old'] = $oldData;
        }
        self::send([$item], $senderUserId);
    }
}
