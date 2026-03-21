// =====================================================================
// CLASS LIST PANEL - Controller for the Classes (@class) tab
// =====================================================================

/**
 * ClassListPanel — extends ObjectListPanel for @class objects.
 * Same grid behavior, adds "Objects" button per row and updates class caches.
 */
class ClassListPanel extends ObjectListPanel {
    constructor(containerEl) {
        super(containerEl, '@class');
    }

    async load() {
        // Use parent load (ObjectListPanel handles grid, batch, actions)
        await super.load();

        // Update global class caches after loading
        if (this.gridData?.length) {
            allClassesList = this.gridData;
            classesCache = {};
            if (typeof buildClassTree === 'function') {
                classTreeData = buildClassTree(this.gridData);
            }
        }

        // Add "Objects" button to each row via custom column
        if (this.gridApi) {
            const colDefs = this.gridApi.getColumnDefs?.() || [];
            const actCol = colDefs.find(c => c.headerName === 'Actions');
            if (actCol) {
                const origRenderer = actCol.cellRenderer;
                actCol.cellRenderer = (p) => {
                    const id = p.data?.id;
                    const base = typeof origRenderer === 'function' ? origRenderer(p) : '';
                    return base + `<button class="btn btn-primary btn-xs" style="margin-left:4px" onclick="classListOpenObjects('${esc(id)}')">Objects</button>`;
                };
                this.gridApi.setGridOption('columnDefs', colDefs);
            }
        }

        window._classListPanel = this;
    }
}

// Global action handlers (called from grid cell renderers via onclick)
function classListEditRow(idx) {
    const panel = window._classListPanel;
    if (panel && panel.gridData[idx]) {
        renderModalForClass('@class', panel.gridData[idx]);
    }
}

function classListOpenObjects(classId) {
    // Check if tab already exists
    const existing = tabManager.find(t => t.id === `obj-${classId}`);
    if (existing) {
        tabManager.switchTo(existing.id);
        return;
    }
    tabManager.add(`obj-${classId}`, classId, true, ObjectListPanel, classId);
}

async function classListDeleteRow(id) {
    if (!confirm(`Delete class "${id}"? This cannot be undone.`)) return;
    try {
        await api('DELETE', `/class/${id}`);
        delete classesCache[id];
        showToast(`Class "${id}" deleted`);
        const panel = window._classListPanel;
        if (panel) panel.load();
    } catch (err) {
        showToast(err.message, 'error');
    }
}
