// ═══════════════════════════════════════════════════════════════════════════
// ELEMENTSTORE WEBSOCKET CLIENT
// ═══════════════════════════════════════════════════════════════════════════
//
// Real-time sync client — connects to the ElementStore WS server,
// subscribes to classes/objects, and applies incoming changes via
// store.applyRemote().
//
// Authentication: connects with the JWT token as query param.
// The WS server decodes the token to extract user_id, which is used
// for sender-skip (so you don't get your own saves echoed back).
//
// CODING STANDARD: function() {} style, no arrow functions
//
// Usage:
//   var esws = new ElementStoreWS(store, 'ws://master.local/elementStore/ws');
//   esws.connect({ token: jwtToken });
//   esws.subscribe('user');        // all user changes
//   esws.subscribeObject('user', 'john123');  // specific object
//
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @param {ElementStore} store  - ElementStore instance
 * @param {string}       wsUrl  - WebSocket endpoint URL (without query params)
 */
function ElementStoreWS(store, wsUrl) {
    this.store = store;
    this.wsUrl = wsUrl;
    this.ws = null;
    this.userId = null;
    this._token = null;
    this.subscriptions = {
        classes: new Set(),
        objects: new Set()
    };
    this._listeners = {};
    this._reconnectDelay = 1000;
    this._reconnectTimer = null;
    this._closed = false; // true when disconnect() called explicitly
}

// ─────────────────────────────────────────────────────────────
// Connection
// ─────────────────────────────────────────────────────────────

/**
 * Connect to the WebSocket server.
 * @param {Object} [opts]
 * @param {string} [opts.token]   - JWT token for authentication
 * @param {string} [opts.user_id] - Fallback user_id (dev mode, no JWT)
 */
ElementStoreWS.prototype.connect = function (opts) {
    var self = this;
    this._closed = false;

    opts = opts || {};
    if (opts.token) this._token = opts.token;

    // Build URL with auth params
    var connectUrl = this.wsUrl;
    var params = [];
    if (this._token) {
        params.push('token=' + encodeURIComponent(this._token));
    } else if (opts.user_id) {
        params.push('user_id=' + encodeURIComponent(opts.user_id));
    }
    if (params.length > 0) {
        connectUrl += (connectUrl.indexOf('?') >= 0 ? '&' : '?') + params.join('&');
    }

    try {
        this.ws = new WebSocket(connectUrl);
    } catch (e) {
        console.warn('[ES-WS] connect failed:', e.message);
        this._scheduleReconnect();
        return;
    }

    this.ws.onopen = function () {
        console.log('[ES-WS] connected');
        self._reconnectDelay = 1000; // reset backoff
        self._emit('open');
    };

    this.ws.onmessage = function (evt) {
        try {
            var msg = JSON.parse(evt.data);
            self._onMessage(msg);
        } catch (e) {
            console.warn('[ES-WS] bad message:', e.message);
        }
    };

    this.ws.onclose = function () {
        console.log('[ES-WS] disconnected');
        self.userId = null;
        self._emit('close');
        if (!self._closed) {
            self._scheduleReconnect();
        }
    };

    this.ws.onerror = function (err) {
        console.warn('[ES-WS] error:', err);
    };
};

ElementStoreWS.prototype.disconnect = function () {
    this._closed = true;
    if (this._reconnectTimer) {
        clearTimeout(this._reconnectTimer);
        this._reconnectTimer = null;
    }
    if (this.ws) {
        this.ws.close();
        this.ws = null;
    }
    this.userId = null;
};

// ─────────────────────────────────────────────────────────────
// Subscriptions
// ─────────────────────────────────────────────────────────────

ElementStoreWS.prototype.subscribe = function (classId) {
    this.subscriptions.classes.add(classId);
    this._send({ action: 'subscribe', class_id: classId });
};

ElementStoreWS.prototype.unsubscribe = function (classId) {
    this.subscriptions.classes.delete(classId);
    this._send({ action: 'unsubscribe', class_id: classId });
};

ElementStoreWS.prototype.subscribeObject = function (classId, objectId) {
    var key = classId + '/' + objectId;
    this.subscriptions.objects.add(key);
    this._send({ action: 'subscribe', id: key });
};

ElementStoreWS.prototype.unsubscribeObject = function (classId, objectId) {
    var key = classId + '/' + objectId;
    this.subscriptions.objects.delete(key);
    this._send({ action: 'unsubscribe', id: key });
};

/**
 * Subscribe to a scope (any parent element/container).
 * Receives all changes for items tagged with _scope_id matching this ID.
 * @param {string} scopeId - The parent element ID (e.g. 'ws-1')
 */
ElementStoreWS.prototype.subscribeScope = function (scopeId) {
    if (!this.subscriptions.scopes) this.subscriptions.scopes = new Set();
    this.subscriptions.scopes.add(scopeId);
    this._send({ action: 'subscribe', scope_id: scopeId });
};

ElementStoreWS.prototype.unsubscribeScope = function (scopeId) {
    if (this.subscriptions.scopes) this.subscriptions.scopes.delete(scopeId);
    this._send({ action: 'unsubscribe', scope_id: scopeId });
};

// ─────────────────────────────────────────────────────────────
// Message Handling
// ─────────────────────────────────────────────────────────────

ElementStoreWS.prototype._onMessage = function (msg) {
    // Control messages (from WS server directly)
    if (msg.event) {
        switch (msg.event) {
            case 'connected':
                this.userId = msg.user_id || null;
                // Re-subscribe after reconnect
                this._resubscribe();
                this._emit('connected', msg);
                break;

            case 'subscribed':
                this._emit('subscribed', msg);
                break;

            case 'unsubscribed':
                this._emit('unsubscribed', msg);
                break;

            case 'pong':
                break;

            case 'error':
                console.warn('[ES-WS] server error:', msg.message);
                break;
        }
        return;
    }

    // Data messages — { type: "changes", items: [...] }
    if (msg.type === 'changes' && msg.items) {
        this._onChanges(msg.items);
        return;
    }
};

/**
 * Process a batch of change items.
 * Each item = { id, class_id, ...data, _old: {...}, _deleted: true|undefined }
 */
ElementStoreWS.prototype._onChanges = function (items) {
    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (!item || !item.id) continue;

        if (item._deleted) {
            // Remove from local store
            if (this.store.objects[item.id]) {
                delete this.store.objects[item.id];
            }
            this._emit('delete', item);
        } else {
            // Merge into local store (strip internal fields before applying)
            var data = {};
            for (var k in item) {
                if (k !== '_old' && k !== '_deleted' && k !== '_scope_id' && item.hasOwnProperty(k)) {
                    data[k] = item[k];
                }
            }
            this.store.applyRemote(data);
            this._emit('change', item);
        }
    }
};

// ─────────────────────────────────────────────────────────────
// Reconnect
// ─────────────────────────────────────────────────────────────

ElementStoreWS.prototype._scheduleReconnect = function () {
    var self = this;
    if (this._closed) return;

    console.log('[ES-WS] reconnecting in ' + this._reconnectDelay + 'ms...');
    this._reconnectTimer = setTimeout(function () {
        self._reconnectTimer = null;
        self.connect();
    }, this._reconnectDelay);

    // Exponential backoff, max 30s
    this._reconnectDelay = Math.min(this._reconnectDelay * 2, 30000);
};

ElementStoreWS.prototype._resubscribe = function () {
    var self = this;
    this.subscriptions.classes.forEach(function (classId) {
        self._send({ action: 'subscribe', class_id: classId });
    });
    this.subscriptions.objects.forEach(function (key) {
        self._send({ action: 'subscribe', id: key });
    });
    if (this.subscriptions.scopes) {
        this.subscriptions.scopes.forEach(function (scopeId) {
            self._send({ action: 'subscribe', scope_id: scopeId });
        });
    }
};

// ─────────────────────────────────────────────────────────────
// Event Emitter (simple)
// ─────────────────────────────────────────────────────────────

ElementStoreWS.prototype.on = function (event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
    return this;
};

ElementStoreWS.prototype.off = function (event, fn) {
    if (!this._listeners[event]) return this;
    if (!fn) {
        delete this._listeners[event];
    } else {
        this._listeners[event] = this._listeners[event].filter(function (f) {
            return f !== fn;
        });
    }
    return this;
};

ElementStoreWS.prototype._emit = function (event, data) {
    var fns = this._listeners[event];
    if (!fns) return;
    for (var i = 0; i < fns.length; i++) {
        try {
            fns[i](data);
        } catch (e) {
            console.warn('[ES-WS] listener error:', e);
        }
    }
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

ElementStoreWS.prototype._send = function (obj) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(obj));
    }
};

ElementStoreWS.prototype.ping = function () {
    this._send({ action: 'ping' });
};

// ─────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ElementStoreWS: ElementStoreWS };
}

if (typeof window !== 'undefined') {
    window.ElementStoreWS = ElementStoreWS;
}
