// =====================================================================
// AUTH - Login UI, startup auth check, app selector
// =====================================================================

var AUTH_BASE = '/api/auth';
var selectedAppId = null;

/**
 * Check if user is authenticated. Restores from localStorage, validates via /me.
 * @returns {Promise<boolean>}
 */
async function checkAuth() {
    if (!store.storage.restoreAuth()) return false;

    try {
        var res = await fetch(AUTH_BASE + '/me', {
            headers: { 'Authorization': 'Bearer ' + store.storage.getToken() }
        });

        if (res.ok) {
            var data = await res.json();
            if (data.user) store.storage.auth.user = data.user;
            return true;
        }

        if (res.status === 401) {
            var refreshed = await store.storage.refreshAuth();
            if (refreshed) {
                var retry = await fetch(AUTH_BASE + '/me', {
                    headers: { 'Authorization': 'Bearer ' + store.storage.getToken() }
                });
                if (retry.ok) {
                    var retryData = await retry.json();
                    if (retryData.user) store.storage.auth.user = retryData.user;
                    return true;
                }
            }
        }
    } catch (e) {
        console.warn('checkAuth failed:', e.message);
    }

    store.storage.clearAuth();
    return false;
}

/**
 * Handle login form submission.
 */
async function handleLoginSubmit(e) {
    e.preventDefault();
    var form = e.target;
    var email = form.querySelector('#loginEmail').value.trim();
    var password = form.querySelector('#loginPassword').value;
    var errorEl = form.querySelector('#loginError');
    var submitBtn = form.querySelector('#loginSubmit');

    errorEl.style.display = 'none';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Signing in...';

    try {
        var res = await fetch(AUTH_BASE + '/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email, password: password })
        });

        var data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || data.message || 'Login failed');
        }

        // Store auth on the storage object
        store.storage.setAuth(data);
        store.storage.authUrl = AUTH_BASE;

        await initDashboard();
    } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign In';
    }
}

/**
 * Logout — clear tokens and show login screen.
 */
async function logout() {
    var rt = store.storage.auth && store.storage.auth.tokens
        ? store.storage.auth.tokens.refreshToken : null;

    if (rt) {
        try {
            await fetch(AUTH_BASE + '/logout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + store.storage.getToken()
                },
                body: JSON.stringify({ refreshToken: rt })
            });
        } catch (e) { /* ignore */ }
    }

    store.storage.clearAuth();
    selectedAppId = null;
    showLoginScreen();
}

/**
 * Show login screen, hide dashboard.
 */
function showLoginScreen() {
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('mainHeader').style.display = 'none';
    document.getElementById('mainContainer').style.display = 'none';
}

/**
 * Show dashboard, hide login screen.
 */
function showDashboard() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('mainHeader').style.display = 'flex';
    document.getElementById('mainContainer').style.display = 'block';
}

/**
 * Render user info in header.
 */
function renderUserInfo() {
    var user = store.storage.auth ? store.storage.auth.user : null;
    var display = document.getElementById('userDisplay');
    var logoutBtn = document.getElementById('logoutBtn');

    if (user) {
        display.textContent = user.name || user.email || 'User';
        display.style.display = 'inline';
        logoutBtn.style.display = 'inline-block';
    } else {
        display.style.display = 'none';
        logoutBtn.style.display = 'none';
    }
}

/**
 * Render app selector from user's app_access.
 */
async function renderAppSelector() {
    var sel = document.getElementById('appSelector');
    if (!sel) return;

    try {
        var res = await fetch(AUTH_BASE + '/me', {
            headers: { 'Authorization': 'Bearer ' + store.storage.getToken() }
        });
        if (!res.ok) return;

        var data = await res.json();
        var apps = data.user ? data.user.app_access : null;
        if (!apps || !Array.isArray(apps) || apps.length === 0) {
            sel.style.display = 'none';
            return;
        }

        sel.innerHTML = '<option value="">All Apps</option>';
        apps.forEach(function(app) {
            var opt = document.createElement('option');
            opt.value = app.id || app.app_id || '';
            opt.textContent = app.name || app.app_name || opt.value;
            sel.appendChild(opt);
        });

        // Restore saved selection
        var saved = localStorage.getItem('es_admin_selected_app');
        if (saved) {
            sel.value = saved;
            selectedAppId = saved || null;
        }

        sel.style.display = 'inline-block';
    } catch (e) {
        sel.style.display = 'none';
    }
}

/**
 * Handle app selector change.
 */
function handleAppChange(appId) {
    selectedAppId = appId || null;
    if (appId) {
        localStorage.setItem('es_admin_selected_app', appId);
    } else {
        localStorage.removeItem('es_admin_selected_app');
    }
    refreshData();
}

/**
 * Get selected app ID (called by api.js for X-App-Id header).
 */
function getSelectedAppId() {
    return selectedAppId;
}
