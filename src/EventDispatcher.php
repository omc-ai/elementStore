<?php

namespace ElementStore;

/**
 * EventDispatcher — fires @event objects on CRUD operations.
 *
 * Called from ClassModel after BroadcastService on setObject() and deleteObject().
 * Events are defined as @event objects in the store (see events.genesis.json).
 */
class EventDispatcher
{
    /**
     * Dispatch an event trigger to all matching @event handlers.
     *
     * @param string     $trigger   Event name: after_create | after_update | after_delete
     * @param string     $class_id  Class of the object that changed
     * @param array      $data      Current object data
     * @param array|null $old       Previous object data (null on create)
     * @param mixed      $userId    User who triggered the change
     */
    public static function dispatch(
        string $trigger,
        string $class_id,
        array $data,
        ?array $old = null,
        mixed $userId = null
    ): void {
        try {
            $di = \Phalcon\Di\Di::getDefault();
            if (!$di || !$di->has('storage')) {
                return;
            }
            /** @var IStorageProvider $storage */
            $storage = $di->get('storage');

            $events = $storage->query('@event', ['trigger' => $trigger], []);
            if (empty($events)) {
                return;
            }

            $objectId = $data['id'] ?? '?';

            foreach ($events as $event) {
                // Filter by target class if specified
                $target = $event['target_class_id'] ?? null;
                if ($target !== null && $target !== '' && $target !== $class_id) {
                    continue;
                }

                $handler = $event['handler'] ?? null;
                if (!$handler) {
                    continue;
                }

                error_log(sprintf(
                    '[ES-EVENT] %s on %s/%s → %s (handler: %s)',
                    $trigger,
                    $class_id,
                    $objectId,
                    $event['id'] ?? '?',
                    $handler
                ));

                // Future: invoke handler (action executor, webhook, etc.)
                // ActionExecutor::run($handler, [...]);
            }
        } catch (\Throwable $e) {
            error_log('[ES-EVENT] EventDispatcher error: ' . $e->getMessage());
        }
    }
}
