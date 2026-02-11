// =====================================================================
// OBJECT LIST PANEL - Controller for a class's objects tab
// =====================================================================

class ObjectListPanel {
    constructor(containerEl, classId) {
        this.containerEl = containerEl;
        this.classId = classId;
        this.gridApi = null;
        this.gridData = [];

        // Clone template and append
        const tpl = document.getElementById('tpl-object-list');
        const content = tpl.content.cloneNode(true);
        this.containerEl.appendChild(content);

        // Update title and endpoint
        const titleEl = this.containerEl.querySelector('.panel-title');
        if (titleEl) titleEl.textContent = classId;

        const endpointEl = this.containerEl.querySelector('.endpoint');
        if (endpointEl) endpointEl.textContent = `GET /store/${classId}`;

        // Wire up the "New" button
        const createBtn = this.containerEl.querySelector('[data-action="create"]');
        if (createBtn) {
            createBtn.addEventListener('click', () => {
                renderModalForClass(this.classId, null);
            });
        }

        // Store reference for global action functions keyed by classId
        if (!window._objectListPanels) window._objectListPanels = {};
        window._objectListPanels[classId] = this;
    }

    async load() {
        try {
            const [classMeta, objects] = await Promise.all([
                getClassMeta(this.classId),
                api('GET', `/store/${this.classId}`)
            ]);

            this.gridData = objects;
            const classId = this.classId;

            // Build columns
            const columnDefs = buildGridColumns(classMeta, classId, (p) => {
                const idx = p.rowIndex;
                const id = p.data.id;
                return `<button class="btn btn-ghost btn-xs" onclick="objectListEditRow('${esc(classId)}', ${idx})">Edit</button>` +
                    `<button class="btn btn-danger btn-xs" style="margin-left:4px" onclick="objectListDeleteRow('${esc(classId)}', '${esc(id)}')">Del</button>`;
            });

            // Init grid
            const gridDiv = this.containerEl.querySelector('.ag-grid-el');
            gridDiv.innerHTML = '';

            const gridOptions = {
                columnDefs,
                rowData: objects,
                defaultColDef: {
                    sortable: true,
                    filter: true,
                    resizable: true,
                    flex: 1,
                    minWidth: 100
                },
                rowSelection: 'single',
                onRowDoubleClicked: (e) => renderModalForClass(this.classId, e.data),
                animateRows: true,
                pagination: true,
                paginationPageSize: 20
            };

            this.gridApi = agGrid.createGrid(gridDiv, gridOptions);

            // Update title with count
            const titleEl = this.containerEl.querySelector('.panel-title');
            if (titleEl) {
                const displayName = classMeta?.name || classId;
                titleEl.textContent = `${displayName} (${objects.length})`;
            }

        } catch (err) {
            showToast(err.message, 'error');
        }
    }

    destroy() {
        if (this.gridApi) {
            this.gridApi.destroy();
            this.gridApi = null;
        }
        if (window._objectListPanels) {
            delete window._objectListPanels[this.classId];
        }
    }
}

// Global action handlers
function objectListEditRow(classId, idx) {
    const panel = window._objectListPanels?.[classId];
    if (panel && panel.gridData[idx]) {
        renderModalForClass(classId, panel.gridData[idx]);
    }
}

async function objectListDeleteRow(classId, id) {
    if (!confirm(`Delete object "${id}"? This cannot be undone.`)) return;
    try {
        await api('DELETE', `/store/${classId}/${id}`);
        showToast(`Object "${id}" deleted`);
        const panel = window._objectListPanels?.[classId];
        if (panel) panel.load();
    } catch (err) {
        showToast(err.message, 'error');
    }
}
