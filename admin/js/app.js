// =====================================================================
// APP - Application initialization (loaded LAST)
// =====================================================================

let tabManager;

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
}

init();
