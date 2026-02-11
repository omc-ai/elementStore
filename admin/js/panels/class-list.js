// =====================================================================
// CLASS LIST PANEL - Controller for the Classes (@class) tab
// =====================================================================

class ClassListPanel {
    constructor(containerEl) {
        this.containerEl = containerEl;
        this.gridApi = null;
        this.gridData = [];

        // Clone template and append
        const tpl = document.getElementById('tpl-class-list');
        const content = tpl.content.cloneNode(true);
        this.containerEl.appendChild(content);

        // Wire up the "New Class" button
        const createBtn = this.containerEl.querySelector('[data-action="create"]');
        if (createBtn) {
            createBtn.addEventListener('click', () => {
                renderModalForClass('@class', null);
            });
        }
    }

    async load() {
        try {
            // Fetch class metadata and all classes in parallel
            const [classMeta, classes] = await Promise.all([
                getClassMeta('@class'),
                api('GET', '/class')
            ]);

            // Update global caches
            allClassesList = classes;
            classesCache = {};
            classTreeData = buildClassTree(classes);

            this.gridData = classes;

            // Build columns
            const columnDefs = buildGridColumns(classMeta, '@class', (p) => {
                const idx = p.rowIndex;
                const id = p.data.id;
                return `<button class="btn btn-ghost btn-xs" onclick="classListEditRow(${idx})">Edit</button>` +
                    `<button class="btn btn-primary btn-xs" style="margin-left:4px" onclick="classListOpenObjects('${esc(id)}')">Objects</button>` +
                    `<button class="btn btn-danger btn-xs" style="margin-left:4px" onclick="classListDeleteRow('${esc(id)}')">Del</button>`;
            });

            // Init grid
            const gridDiv = this.containerEl.querySelector('.ag-grid-el');
            gridDiv.innerHTML = '';

            const gridOptions = {
                columnDefs,
                rowData: classes,
                defaultColDef: {
                    sortable: true,
                    filter: true,
                    resizable: true,
                    flex: 1,
                    minWidth: 100
                },
                rowSelection: 'single',
                onRowDoubleClicked: (e) => renderModalForClass('@class', e.data),
                animateRows: true,
                pagination: true,
                paginationPageSize: 20
            };

            this.gridApi = agGrid.createGrid(gridDiv, gridOptions);

            // Store reference for global action functions
            window._classListPanel = this;

        } catch (err) {
            showToast(err.message, 'error');
        }
    }

    destroy() {
        if (this.gridApi) {
            this.gridApi.destroy();
            this.gridApi = null;
        }
        window._classListPanel = null;
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
