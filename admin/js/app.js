// =====================================================================
// APP - Application initialization (loaded LAST)
// =====================================================================

let tabManager;

// Global ES admin context — accessible from console: es.store, es.ws, es.editors, etc.
window.es = {
    get store() { return typeof store !== 'undefined' ? store : null; },
    get storage() { return typeof storage !== 'undefined' ? storage : null; },
    ws: null,     // WebSocket client (set after connect)
    editors: {},  // active editor contexts keyed by path
    get current() { return editingAtomObj || null; },
    get currentClass() { return editingClassId || null; },
};

function refreshData() {
    const tab = tabManager?.getActive();
    if (tab?.controller?.load) tab.controller.load();
}

// View a related object - opens its class's objects tab and edits the specific object
async function viewObject(classId, objectId) {
    // Open (or switch to) the class's objects tab
    const tabId = `obj-${classId}`;
    if (!tabManager.tabs.has(tabId)) {
        tabManager.add(tabId, classId, true, ObjectListPanel, classId);
    } else {
        tabManager.switchTo(tabId);
    }
    // Fetch the object and open the edit modal
    try {
        const objects = await api('GET', `/store/${classId}`);
        const obj = objects.find(o => o.id === objectId);
        if (obj) {
            renderModalForClass(classId, obj);
        } else {
            showToast(`Object "${objectId}" not found in ${classId}`, 'error');
        }
    } catch (err) {
        showToast(err.message, 'error');
    }
}

/**
 * Connect the element store to the API.
 * Sets the storage URL (API_BASE is defined in api.js, loaded after element-store.js).
 */
function initStore() {
    if (typeof store === 'undefined' || typeof API_BASE === 'undefined') return;

    // Update storage URL — element-store.js creates storage with empty URL
    // because API_BASE isn't defined when it loads
    if (store.storage) {
        store.storage.data.url = API_BASE;
    } else {
        const storage = new AtomStorage({
            id: 'root.storage',
            class_id: '@storage',
            url: API_BASE
        }, store);
        store.storage = storage;
    }
    console.log('Store connected to API:', API_BASE);
}

/**
 * Initialize the dashboard UI (called after successful auth).
 */
async function initDashboard() {
    showDashboard();
    renderUserInfo();
    renderAppSelector();

    await loadFunctions();

    // Start health check polling
    startHealthPolling(30000);

    // Initialize global search
    initGlobalSearch();

    // Close genesis dropdown on outside click
    document.addEventListener('click', function(e) {
        if (!e.target.closest('#genesisDropdown')) {
            const dd = document.getElementById('genesisDropdown');
            if (dd) dd.classList.remove('open');
        }
    });

    if (!tabManager) {
        tabManager = new TabManager(
            document.getElementById('tabBar'),
            document.getElementById('tabContent')
        );
        tabManager.add('classes', 'Classes (@class)', false, ClassListPanel);
    } else {
        refreshData();
    }
}

// ─────────────────────────────────────────────────────────────
// WebSocket — connect, subscribe, activity log, blink
// ─────────────────────────────────────────────────────────────
var _wsChangeCount = 0;

function initWebSocket() {
    if (typeof ElementStoreWS === 'undefined') return;

    var loc = window.location;
    var wsProtocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    // WS goes through nginx at /elementStore/ws — same host, same port, same SSL
    var wsUrl = wsProtocol + '//' + loc.host + '/elementStore/ws';

    var esws = new ElementStoreWS(store, wsUrl);
    window.es.ws = esws;

    var token = (typeof getJwtToken === 'function') ? getJwtToken() : null;
    esws.connect({ token: token, user_id: 'admin' });

    // Status dot
    var dot = document.getElementById('wsStatusDot');
    esws.on('connected', function () {
        if (dot) dot.style.background = '#22c55e'; // green
        // Subscribe to ALL classes
        esws.subscribe('*');
    });
    esws.on('close', function () {
        if (dot) dot.style.background = '#ef4444'; // red
    });

    // On change — log, update store, blink, refresh
    esws.on('change', function (item) {
        _wsLogEntry(item, 'change');
        _wsBlinkObject(item);

        if (item.class_id === '@class' && item.id) {
            invalidateClassCache(item.id);
        }

        var activeTab = tabManager?.getActive?.();
        if (activeTab?.controller?.classId === item.class_id && activeTab.controller.load) {
            activeTab.controller.load();
        }
    });

    esws.on('delete', function (item) {
        _wsLogEntry(item, 'delete');
    });

    // Handle log messages from PHP backend
    var origOnMessage = esws._onMessage.bind(esws);
    esws._onMessage = function (msg) {
        if (msg.type === 'log' && msg.entries) {
            msg.entries.forEach(function (entry) {
                _wsLogEntry(entry, 'log-' + (entry.level || 'info'));
            });
            return;
        }
        origOnMessage(msg);
    };
}

// Toggle WS activity dialog
function toggleWsActivity() {
    var dlg = document.getElementById('wsActivityDialog');
    if (dlg.open) {
        dlg.close();
    } else {
        dlg.show(); // non-modal — doesn't block interaction
        _wsChangeCount = 0;
        var badge = document.getElementById('wsBadge');
        if (badge) badge.style.display = 'none';
    }
}

function clearWsActivity() {
    var log = document.getElementById('wsActivityLog');
    if (log) log.innerHTML = '';
}

// Log a WS entry to the activity dialog
var _wsTotalEvents = 0;

function _wsLogEntry(item, type) {
    var log = document.getElementById('wsActivityLog');
    if (!log) return;

    _wsTotalEvents++;
    var time = new Date().toLocaleTimeString();
    var entry = document.createElement('div');
    entry.className = 'ws-entry ' + type;

    if (type.startsWith('log-')) {
        // Error/warning/info log from PHP
        var traceHtml = '';
        if (item.context?.trace) {
            traceHtml = '<span class="ws-trace">' + item.context.trace.join(' → ') + '</span>';
        }
        var fileInfo = item.context?.file ? ' <span style="color:#585b70">' + item.context.file + '</span>' : '';
        entry.innerHTML = '<span class="ws-time">' + time + '</span>' +
            '<span style="color:' + (type === 'log-error' ? '#f38ba8' : type === 'log-warn' ? '#f9e2af' : '#89b4fa') + ';font-weight:600;">' +
            (item.level || 'info').toUpperCase() + '</span> ' +
            '<span class="ws-msg">' + (item.message || '') + '</span>' +
            fileInfo + traceHtml;
    } else {
        // Data change/delete — clickable to open property editor
        var cid = item.class_id || '?';
        var oid = item.id || '?';
        entry.innerHTML = '<span class="ws-time">' + time + '</span>' +
            '<a href="#" class="ws-class" onclick="viewObject(\'' + cid + '\',\'' + oid + '\');return false;" title="Open ' + cid + '/' + oid + '">' +
            cid + ' / <span class="ws-id">' + oid + '</span></a>' +
            (type === 'delete' ? ' <span style="color:#f38ba8">DELETED</span>' : '');
    }
    log.insertBefore(entry, log.firstChild);

    while (log.children.length > 200) log.removeChild(log.lastChild);

    // Update stats
    var stats = document.getElementById('wsStats');
    if (stats) stats.textContent = _wsTotalEvents + ' events';

    // Update badge if dialog is closed
    var dlg = document.getElementById('wsActivityDialog');
    if (!dlg.open) {
        _wsChangeCount++;
        var badge = document.getElementById('wsBadge');
        if (badge) {
            badge.textContent = _wsChangeCount > 99 ? '99+' : _wsChangeCount;
            badge.style.display = 'block';
        }
    }
}

function wsToggleFilter() {
    var showLogs = document.getElementById('wsShowLogs')?.checked;
    var showChanges = document.getElementById('wsShowChanges')?.checked;
    document.querySelectorAll('#wsActivityLog .ws-entry').forEach(function (el) {
        var isLog = el.className.includes('log-');
        el.style.display = (isLog ? showLogs : showChanges) ? '' : 'none';
    });
}

// Blink changed elements in grids and editors
function _wsBlinkObject(item) {
    if (!item.id || !item.class_id) return;

    // Blink AG-Grid rows with matching ID
    document.querySelectorAll('.ag-row').forEach(function (row) {
        var rowId = row.querySelector('[col-id="id"]');
        if (rowId && rowId.textContent.trim() === item.id) {
            row.classList.add('es-changed');
            setTimeout(function () { row.classList.remove('es-changed'); }, 1500);
        }
    });

    // Blink editor fields with matching data-path prefix
    document.querySelectorAll('[data-path^="' + item.id + '"]').forEach(function (el) {
        el.classList.add('es-changed');
        setTimeout(function () { el.classList.remove('es-changed'); }, 1500);
    });
}

async function init() {
    // Connect store to API first
    initStore();

    // Wire up auth config
    store.storage.authUrl = '/api/auth';
    store.storage.onAuthRequired = showLoginScreen;

    var authed = await checkAuth();
    if (!authed) {
        showLoginScreen();
        return;
    }

    await initDashboard();

    // Connect WebSocket after dashboard is ready
    initWebSocket();
}

init();
