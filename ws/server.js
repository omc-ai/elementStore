/**
 * ElementStore WebSocket Server
 *
 * Handles real-time sync between ElementStore clients.
 * - WebSocket connections authenticated via JWT token (extracts user_id)
 * - Subscribe/unsubscribe by class, object, or scope_id
 * - HTTP POST /broadcast endpoint for PHP to push changes
 * - Sender-skip by user_id (so the saving user doesn't get their own echo)
 *
 * Subscription types:
 *   { action: "subscribe", class_id: "user" }       — all changes to class
 *   { action: "subscribe", id: "user/john123" }      — specific object
 *   { action: "subscribe", scope_id: "ws-1" }       — all items with _scope_id
 *
 * Broadcast protocol:
 *   { type: "changes", items: [ { id, class_id, _scope_id, ...data }, ... ] }
 *   Items with _deleted: true are deletions.
 *   Items with _scope_id match scope_id subscribers.
 */

const http = require('http');
const { WebSocketServer } = require('ws');
const url = require('url');

const PORT = parseInt(process.env.WS_PORT || '3100', 10);
const ES_API = process.env.ES_API_URL || 'http://elementstore_php83:9000';

// Subscription maps
const classSubs = new Map();    // class_id → Set<ws>
const objectSubs = new Map();   // "class_id/object_id" → Set<ws>
const scopeSubs = new Map();   // scope_id → Set<ws>

// Connection registry: connectionId → ws
const connections = new Map();

// User index: user_id → Set<ws>  (one user can have multiple tabs)
const userConnections = new Map();

var connectionCounter = 0;

// ─────────────────────────────────────────────────────────────
// JWT Decode (payload only, no validation — PHP validates)
// ─────────────────────────────────────────────────────────────

function decodeJwtPayload(token) {
    if (!token) return null;
    var parts = token.split('.');
    if (parts.length !== 3) return null;
    try {
        var payload = Buffer.from(parts[1], 'base64url').toString('utf8');
        return JSON.parse(payload);
    } catch (e) {
        return null;
    }
}

// ─────────────────────────────────────────────────────────────
// HTTP Server — serves both WS upgrade and POST /broadcast
// ─────────────────────────────────────────────────────────────

const server = http.createServer(function (req, res) {
    // Health check
    if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'ok',
            connections: connections.size,
            users: userConnections.size,
            classSubscriptions: classSubs.size,
            objectSubscriptions: objectSubs.size,
            scopeSubscriptions: scopeSubs.size
        }));
        return;
    }

    // Broadcast endpoint (called by PHP after save)
    if (req.method === 'POST' && req.url === '/broadcast') {
        var body = '';
        req.on('data', function (chunk) { body += chunk; });
        req.on('end', function () {
            try {
                var msg = JSON.parse(body);
                var senderUserId = req.headers['x-sender-user-id'] || null;
                var count = broadcast(msg, senderUserId);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ sent: count }));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e.message }));
            }
        });
        return;
    }

    // Log broadcast endpoint (called by PHP for errors/exceptions)
    if (req.method === 'POST' && req.url === '/broadcast/log') {
        var logBody = '';
        req.on('data', function (chunk) { logBody += chunk; });
        req.on('end', function () {
            try {
                var logMsg = JSON.parse(logBody);
                // Broadcast as a log event to all wildcard subscribers
                var logPayload = JSON.stringify({ type: 'log', entries: Array.isArray(logMsg) ? logMsg : [logMsg] });
                var count = 0;
                connections.forEach(function (ws) {
                    if (ws._subscriptions.all && ws.readyState === 1) {
                        ws.send(logPayload);
                        count++;
                    }
                });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ sent: count }));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e.message }));
            }
        });
        return;
    }

    res.writeHead(404);
    res.end('Not found');
});

// ─────────────────────────────────────────────────────────────
// WebSocket Server
// ─────────────────────────────────────────────────────────────

const wss = new WebSocketServer({ server: server });

wss.on('connection', function (ws, req) {
    connectionCounter++;
    var connId = 'c' + connectionCounter;
    ws._connId = connId;
    ws._subscriptions = { classes: new Set(), objects: new Set(), scopes: new Set() };

    // Extract user_id from JWT token in query string
    var parsed = url.parse(req.url, true);
    var token = parsed.query.token || null;
    var userId = null;

    if (token) {
        var payload = decodeJwtPayload(token);
        if (payload) {
            userId = payload.sub || payload.user_id || null;
        }
    }

    // Fallback: user_id query param (dev mode, no JWT)
    if (!userId) {
        userId = parsed.query.user_id || null;
    }

    ws._userId = userId;
    connections.set(connId, ws);

    // Index by user_id
    if (userId) {
        if (!userConnections.has(userId)) {
            userConnections.set(userId, new Set());
        }
        userConnections.get(userId).add(ws);
    }

    // Confirm connection
    wsSend(ws, { event: 'connected', user_id: userId });
    console.log('[WS] connected: ' + connId + ' user=' + (userId || 'anonymous'));

    ws.on('message', function (raw) {
        try {
            var msg = JSON.parse(raw);
            handleClientMessage(ws, msg);
        } catch (e) {
            wsSend(ws, { event: 'error', message: 'Invalid JSON' });
        }
    });

    ws.on('close', function () {
        cleanup(ws);
    });

    ws.on('error', function () {
        cleanup(ws);
    });
});

// ─────────────────────────────────────────────────────────────
// Client Message Handling
// ─────────────────────────────────────────────────────────────

function handleClientMessage(ws, msg) {
    switch (msg.action) {
        case 'subscribe':
            if (msg.class_id === '*') {
                ws._subscriptions.all = true;
                wsSend(ws, { event: 'subscribed', class_id: '*' });
            } else if (msg.scope_id) {
                addToSet(scopeSubs, msg.scope_id, ws);
                ws._subscriptions.scopes.add(msg.scope_id);
                wsSend(ws, { event: 'subscribed', scope_id: msg.scope_id });
            } else if (msg.id) {
                addToSet(objectSubs, msg.id, ws);
                ws._subscriptions.objects.add(msg.id);
                wsSend(ws, { event: 'subscribed', id: msg.id });
            } else if (msg.class_id) {
                addToSet(classSubs, msg.class_id, ws);
                ws._subscriptions.classes.add(msg.class_id);
                wsSend(ws, { event: 'subscribed', class_id: msg.class_id });

                // Fetch historical objects if requested
                // msg.fetch: number of recent objects to return (default: 0 = none)
                // msg.since: ISO timestamp — only return objects updated after this time
                if (msg.fetch && msg.fetch > 0) {
                    fetchHistorical(ws, msg.class_id, msg.fetch, msg.since || null, msg.sort || '_sort=updated_at&_order=desc');
                }
            }
            break;

        case 'unsubscribe':
            if (msg.scope_id) {
                removeFromSet(scopeSubs, msg.scope_id, ws);
                ws._subscriptions.scopes.delete(msg.scope_id);
                wsSend(ws, { event: 'unsubscribed', scope_id: msg.scope_id });
            } else if (msg.id) {
                removeFromSet(objectSubs, msg.id, ws);
                ws._subscriptions.objects.delete(msg.id);
                wsSend(ws, { event: 'unsubscribed', id: msg.id });
            } else if (msg.class_id) {
                removeFromSet(classSubs, msg.class_id, ws);
                ws._subscriptions.classes.delete(msg.class_id);
                wsSend(ws, { event: 'unsubscribed', class_id: msg.class_id });
            }
            break;

        case 'ping':
            wsSend(ws, { event: 'pong' });
            break;

        default:
            wsSend(ws, { event: 'error', message: 'Unknown action: ' + msg.action });
    }
}

// ─────────────────────────────────────────────────────────────
// Fetch historical objects from ES API on subscribe
// ─────────────────────────────────────────────────────────────

function fetchHistorical(ws, classId, limit, since, sort) {
    var queryParams = '_limit=' + Math.min(limit, 100);
    if (sort) {
        queryParams += '&' + sort;
    } else {
        queryParams += '&_sort=updated_at&_order=desc';
    }
    if (since) {
        queryParams += '&updated_at_gte=' + encodeURIComponent(since);
    }

    var fetchUrl = ES_API + '/query/' + encodeURIComponent(classId) + '?' + queryParams;

    var proto = fetchUrl.startsWith('https') ? require('https') : require('http');
    proto.get(fetchUrl, function(res) {
        var data = '';
        res.on('data', function(chunk) { data += chunk; });
        res.on('end', function() {
            try {
                var items = JSON.parse(data);
                if (Array.isArray(items) && items.length > 0) {
                    wsSend(ws, {
                        event: 'initial',
                        class_id: classId,
                        items: items,
                        count: items.length
                    });
                    console.log('[WS] fetch-on-subscribe: ' + classId + ' → ' + items.length + ' items to ' + ws._connId);
                }
            } catch (e) {
                console.log('[WS] fetch error for ' + classId + ': ' + e.message);
            }
        });
    }).on('error', function(e) {
        console.log('[WS] fetch error: ' + e.message);
    });
}

// ─────────────────────────────────────────────────────────────
// Broadcast — fan out to subscribers, skip sender's user_id
// msg = { type: "changes", items: [ { id, class_id, ... }, ... ] }
// senderUserId = user_id of the client that triggered the save
// ─────────────────────────────────────────────────────────────

function broadcast(msg, senderUserId) {
    var items = msg.items;
    if (!items || !items.length) return 0;

    var payload = JSON.stringify(msg);
    var count = 0;
    var sent = new Set(); // avoid double-send to same connection

    function trySend(ws) {
        if (senderUserId && ws._userId === senderUserId) return;
        if (sent.has(ws._connId)) return;
        if (ws.readyState === 1) { // OPEN
            ws.send(payload);
            sent.add(ws._connId);
            count++;
        }
    }

    // Wildcard subscribers — receive everything
    connections.forEach(function (ws) {
        if (ws._subscriptions.all) trySend(ws);
    });

    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var classId = item.class_id;
        var objectId = item.id;
        var scopeId = item._scope_id;

        // Design-level subscribers (items tagged with _scope_id)
        if (scopeId) {
            var scopeSet = scopeSubs.get(scopeId);
            if (scopeSet) scopeSet.forEach(trySend);
        }

        // Class-level subscribers
        var classSet = classSubs.get(classId);
        if (classSet) classSet.forEach(trySend);

        // Object-level subscribers
        if (objectId) {
            var objectKey = classId + '/' + objectId;
            var objectSet = objectSubs.get(objectKey);
            if (objectSet) objectSet.forEach(trySend);
        }
    }

    if (count > 0) {
        console.log('[WS] broadcast: ' + items.length + ' items → ' + count + ' clients (skip user=' + (senderUserId || 'none') + ')');
    }

    return count;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function wsSend(ws, obj) {
    if (ws.readyState === 1) {
        ws.send(JSON.stringify(obj));
    }
}

function addToSet(map, key, ws) {
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(ws);
}

function removeFromSet(map, key, ws) {
    var set = map.get(key);
    if (set) {
        set.delete(ws);
        if (set.size === 0) map.delete(key);
    }
}

function cleanup(ws) {
    console.log('[WS] disconnected: ' + ws._connId + ' user=' + (ws._userId || 'anonymous'));

    // Remove from connection registry
    connections.delete(ws._connId);

    // Remove from user index
    if (ws._userId) {
        var userSet = userConnections.get(ws._userId);
        if (userSet) {
            userSet.delete(ws);
            if (userSet.size === 0) userConnections.delete(ws._userId);
        }
    }

    // Remove from all class subscriptions
    ws._subscriptions.classes.forEach(function (classId) {
        removeFromSet(classSubs, classId, ws);
    });

    // Remove from all object subscriptions
    ws._subscriptions.objects.forEach(function (objectKey) {
        removeFromSet(objectSubs, objectKey, ws);
    });

    // Remove from all scope subscriptions
    ws._subscriptions.scopes.forEach(function (scopeId) {
        removeFromSet(scopeSubs, scopeId, ws);
    });
}

// ─────────────────────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────────────────────

server.listen(PORT, function () {
    console.log('[ElementStore WS] listening on port ' + PORT);
});
