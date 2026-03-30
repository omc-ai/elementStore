// =====================================================================
// APP - Application initialization (loaded LAST)
// =====================================================================

let tabManager;

// =====================
// Scope Management
// =====================
window._adminScope = JSON.parse(localStorage.getItem('es_admin_scope') || '{}');

function updateScopeLabel() {
    const scope = window._adminScope;
    const parts = [];
    if (scope.tenant_id) parts.push('T:' + scope.tenant_id.substring(0, 8));
    if (scope.app_id) parts.push('A:' + scope.app_id.substring(0, 8));
    if (scope.user_id) parts.push('U:' + scope.user_id.substring(0, 8));
    if (scope.org_id) parts.push('O:' + scope.org_id.substring(0, 8));
    const label = document.getElementById('scopeLabel');
    if (label) label.textContent = parts.length > 0 ? parts.join(' | ') : 'No Scope';
    const btn = document.getElementById('scopeBtn');
    if (btn) btn.style.background = parts.length > 0 ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.2)';
}

async function openScopeDialog() {
    const dialog = document.getElementById('scopeDialog');
    dialog.style.display = 'flex';
    const body = document.getElementById('scopeFields');
    const scope = window._adminScope;

    // Load available options for each scope type
    const scopeTypes = [
        { key: 'tenant_id', label: 'Tenant', class: '@tenant' },
        { key: 'app_id', label: 'Application', class: '@app' },
        { key: 'user_id', label: 'User', class: '@user' },
    ];

    let html = '';
    for (const st of scopeTypes) {
        let options = '<option value="">— All (no filter) —</option>';
        try {
            const items = await api('GET', `/query/${st.class}?_limit=100`);
            for (const item of items) {
                const selected = scope[st.key] === item.id ? 'selected' : '';
                const label = item.name || item.id;
                options += `<option value="${esc(item.id)}" ${selected}>${esc(label)} (${esc(item.id.substring(0, 12))})</option>`;
            }
        } catch (_) {
            options += '<option value="" disabled>(no objects found)</option>';
        }
        html += `
            <div style="margin-bottom:12px">
                <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;color:#374151">${st.label}</label>
                <select data-scope="${st.key}" style="width:100%;padding:6px 8px;border:1px solid #d1d5db;border-radius:4px;font-size:13px">
                    ${options}
                </select>
            </div>`;
    }

    // Manual ID input for org_id (no class yet)
    html += `
        <div style="margin-bottom:12px">
            <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;color:#374151">Organization</label>
            <input type="text" data-scope="org_id" value="${esc(scope.org_id || '')}" placeholder="org ID (manual)" style="width:100%;padding:6px 8px;border:1px solid #d1d5db;border-radius:4px;font-size:13px">
        </div>`;

    body.innerHTML = html;
}

function closeScopeDialog() {
    document.getElementById('scopeDialog').style.display = 'none';
}

function applyScope() {
    const scope = {};
    document.querySelectorAll('#scopeFields [data-scope]').forEach(el => {
        const val = el.value.trim();
        if (val) scope[el.dataset.scope] = val;
    });
    window._adminScope = scope;
    localStorage.setItem('es_admin_scope', JSON.stringify(scope));
    updateScopeLabel();
    closeScopeDialog();
    refreshData(); // Reload current tab with new scope
}

function clearScope() {
    document.querySelectorAll('#scopeFields [data-scope]').forEach(el => el.value = '');
    window._adminScope = {};
    localStorage.setItem('es_admin_scope', '{}');
    updateScopeLabel();
    closeScopeDialog();
    refreshData();
}

// =====================
// Raw JSON Dialog
// =====================
function openRawJson() {
    document.getElementById('rawJsonModal').classList.add('active');
    document.getElementById('rawJsonResult').style.display = 'none';
}

function closeRawJson() {
    document.getElementById('rawJsonModal').classList.remove('active');
}

async function sendRawJson() {
    const classId = document.getElementById('rawJsonClass').value.trim();
    const bodyText = document.getElementById('rawJsonBody').value.trim();
    const resultEl = document.getElementById('rawJsonResult');

    if (!classId || !bodyText) {
        resultEl.style.display = 'block';
        resultEl.style.background = '#fef2f2';
        resultEl.textContent = 'Class ID and JSON body required';
        return;
    }

    let body;
    try {
        body = JSON.parse(bodyText);
    } catch (e) {
        resultEl.style.display = 'block';
        resultEl.style.background = '#fef2f2';
        resultEl.textContent = 'Invalid JSON: ' + e.message;
        return;
    }

    try {
        const endpoint = `/store/${classId}`;
        const result = await api('POST', endpoint, body);
        resultEl.style.display = 'block';
        resultEl.style.background = '#f0fdf4';
        resultEl.textContent = JSON.stringify(result, null, 2);
    } catch (e) {
        resultEl.style.display = 'block';
        resultEl.style.background = '#fef2f2';
        resultEl.textContent = e.message;
    }
}

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

    // Start agent status polling (30s interval)
    startAgentStatusPolling(30000);

    // Initialize global search
    initGlobalSearch();
    updateScopeLabel();

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
    if (window.es?.ws) return; // already connected

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
            traceHtml = '<span class="ws-trace">' + item.context.trace.map(esc).join(' → ') + '</span>';
        }
        var fileInfo = item.context?.file ? ' <span style="color:#585b70">' + esc(item.context.file) + '</span>' : '';
        entry.innerHTML = '<span class="ws-time">' + time + '</span>' +
            '<span style="color:' + (type === 'log-error' ? '#f38ba8' : type === 'log-warn' ? '#f9e2af' : '#89b4fa') + ';font-weight:600;">' +
            esc((item.level || 'info').toUpperCase()) + '</span> ' +
            '<span class="ws-msg">' + esc(item.message || '') + '</span>' +
            fileInfo + traceHtml;
    } else {
        // Data change/delete — show class name, changed fields, clickable link
        var cid = item.class_id || '?';
        var oid = item.id || '?';
        var displayName = item.name || item.label || item.key || oid;

        // Format changed fields from _old
        var changedHtml = '';
        if (item.old_values && typeof item.old_values === 'object') {
            var changes = Object.keys(item.old_values).map(function (k) {
                var oldVal = JSON.stringify(item.old_values[k]);
                var newVal = JSON.stringify(item[k]);
                if (oldVal.length > 30) oldVal = oldVal.slice(0, 30) + '…';
                if (newVal.length > 30) newVal = newVal.slice(0, 30) + '…';
                return '<span style="color:#89b4fa">' + esc(k) + '</span>: ' +
                    '<span style="color:#f38ba8;text-decoration:line-through">' + esc(oldVal) + '</span>' +
                    ' → <span style="color:#a6e3a1">' + esc(newVal) + '</span>';
            });
            if (changes.length > 0) {
                changedHtml = '<div style="margin-top:2px;padding-left:12px;font-size:11px">' + changes.join('<br>') + '</div>';
            }
        }

        entry.innerHTML = '<span class="ws-time">' + time + '</span>' +
            (type === 'delete' ? '<span style="color:#f38ba8;font-weight:600">DEL </span>' : '') +
            '<a href="#" class="ws-class" onclick="viewObject(\'' + escapeHtml(cid) + '\',\'' + escapeHtml(oid) + '\');return false;" title="Open in editor">' +
            '<span style="color:#6c7086">' + esc(cid) + '</span> / <span class="ws-id">' + esc(displayName) + '</span></a>' +
            changedHtml;
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

// ─────────────────────────────────────────────────────────────
// URL Routing — deep links and browser history
// ─────────────────────────────────────────────────────────────

/**
 * Handle URL params on load or popstate:
 *   ?class=@app                    → open class objects tab
 *   ?class=@app&id=app:es-admin    → open class tab + edit object
 *   ?action=edit&class=X&id=Y        → edit object directly
 */
async function handleRoute() {
    var params = new URLSearchParams(window.location.search);
    var classId = params.get('class');
    var objectId = params.get('id');
    var action = params.get('action');
    var tabId = params.get('tab');

    console.log('[Route]', { classId, objectId, action, tabId });

    if (classId) {
        // Open class objects tab
        var tabKey = 'obj-' + classId;
        tabManager._suppressHistory = true;
        tabManager.add(tabKey, classId, true, ObjectListPanel, classId);
        tabManager._suppressHistory = false;

        // If object ID provided, open it in the editor
        if (objectId && (action === 'edit' || !action)) {
            try {
                console.log('[Route] Fetching', classId, objectId);
                var obj = await api('GET', '/store/' + classId + '/' + objectId);
                console.log('[Route] Got object:', obj ? 'yes' : 'no');
                if (obj) renderModalForClass(classId, obj);
            } catch (e) {
                console.error('[Route] Error:', e);
                showToast('Object not found: ' + objectId, 'error');
            }
        }
    } else if (tabId) {
        // Switch to tab by ID
        tabManager._suppressHistory = true;
        if (tabManager.tabs.has(tabId)) {
            tabManager.switchTo(tabId);
        }
        tabManager._suppressHistory = false;
    }
}

// Browser back/forward
window.addEventListener('popstate', function (e) {
    if (e.state?.tab && tabManager) {
        tabManager._suppressHistory = true;
        if (tabManager.tabs.has(e.state.tab)) {
            tabManager.switchTo(e.state.tab);
        }
        tabManager._suppressHistory = false;
    }
});

async function init() {
    // Connect store to API first
    initStore();

    // Wire up auth config
    store.storage.authUrl = '/api/auth';
    store.storage.onAuthRequired = showLoginScreen;

    // Load auth environments (populates selector, restores saved env)
    await loadAuthEnvironments();

    var authed = await checkAuth();
    if (!authed) {
        showLoginScreen();
        return;
    }

    await initDashboard();

    // Handle URL params (deep link)
    handleRoute();

    // Connect WebSocket after dashboard is ready
    initWebSocket();
}

init();
