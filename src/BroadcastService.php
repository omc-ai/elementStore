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
 *
 * PERFORMANCE NOTE:
 *   Docker DNS resolution blocks ~8s when the target container doesn't exist.
 *   Neither curl CURLOPT_CONNECTTIMEOUT_MS nor stream timeout help with DNS.
 *   Solution: check if the WS server is enabled via env var or @init.json config.
 *   If not explicitly enabled, skip broadcast entirely (zero overhead).
 */

namespace ElementStore;

class BroadcastService
{
    private static string $wsUrl = 'http://elementstore_ws:3100/broadcast';

    /** @var bool|null Cached reachability: null=not tested, true=OK, false=skip */
    private static ?bool $reachable = null;

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

        // Fast path: skip if already known unreachable (lasts for FPM worker lifetime)
        if (self::$reachable === false) {
            return;
        }

        // First call: check WS URL from env or use default
        // ES_WS_URL=0 disables broadcasting. Unset = try default URL.
        if (self::$reachable === null) {
            $envUrl = getenv('ES_WS_URL');
            if ($envUrl === '0') {
                self::$reachable = false;
                return;
            }
            if ($envUrl && $envUrl !== '1') {
                self::$wsUrl = $envUrl;
            }
            // Try connecting — will mark unreachable on first failure
            self::$reachable = true;
        }

        $payload = json_encode([
            'class_id'  => '@changes',
            'items'     => $items,
            'sender_id' => $senderUserId,
            'time'      => date('Y-m-d\TH:i:s'),
        ]);

        $headers = [
            'Content-Type: application/json',
            'Content-Length: ' . strlen($payload),
        ];
        if ($senderUserId) {
            $headers[] = 'X-Sender-User-Id: ' . $senderUserId;
        }

        $ch = curl_init(self::$wsUrl);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_HTTPHEADER     => $headers,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT_MS => 200,  // 200ms connect timeout
            CURLOPT_TIMEOUT_MS     => 500,     // 500ms total timeout
            CURLOPT_NOSIGNAL       => true,    // Required for sub-second timeouts
        ]);

        $result = curl_exec($ch);
        $errno  = curl_errno($ch);
        curl_close($ch);

        if ($errno !== 0) {
            // Connection failed — mark unreachable for the rest of this worker's lifetime
            self::$reachable = false;
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
            // Only include changed values in _old
            $changed = [];
            foreach ($oldData as $k => $v) {
                // Skip storage-internal fields (should already be stripped by storage layer)
                if (!array_key_exists($k, $data) || $data[$k] !== $v) {
                    $changed[$k] = $v;
                }
            }
            if (!empty($changed)) {
                $item['_old'] = $changed;
            }
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
    /**
     * Broadcast a log entry (error, warning, info) to WS subscribers.
     * Fire-and-forget — failures never block the caller.
     */
    public static function emitLog(string $level, string $message, array $context = []): void
    {
        if (self::$reachable === false) return;
        if (self::$reachable === null) {
            // Trigger reachability check via send()
            self::send([], null);
            if (self::$reachable === false) return;
        }

        $logUrl = str_replace('/broadcast', '/broadcast/log', self::$wsUrl);
        $payload = json_encode([
            'level'   => $level,
            'message' => $message,
            'context' => $context,
            'time'    => date('Y-m-d H:i:s'),
        ]);

        $ch = curl_init($logUrl);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_HTTPHEADER     => ['Content-Type: application/json', 'Content-Length: ' . strlen($payload)],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT_MS => 100,
            CURLOPT_TIMEOUT_MS     => 200,
            CURLOPT_NOSIGNAL       => true,
        ]);
        curl_exec($ch);
        curl_close($ch);
    }

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
