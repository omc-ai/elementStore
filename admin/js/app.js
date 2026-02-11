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

async function init() {
    await loadFunctions();

    tabManager = new TabManager(
        document.getElementById('tabBar'),
        document.getElementById('tabContent')
    );

    // Add the permanent "Classes" tab
    tabManager.add('classes', 'Classes (@class)', false, ClassListPanel);
}

init();
