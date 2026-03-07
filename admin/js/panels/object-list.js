// =====================================================================
// OBJECT LIST PANEL - Controller for a class's objects tab
// =====================================================================

class ObjectListPanel {
    constructor(containerEl, classId) {
        this.containerEl = containerEl;
        this.classId = classId;
        this.gridApi = null;
        this.gridData = [];
        this.classActions = []; // cached class-level @action objects

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

    _getSelectedIds() {
        if (!this.gridApi) return [];
        const nodes = this.gridApi.getSelectedNodes ? this.gridApi.getSelectedNodes() : [];
        return nodes.map(n => n.data?.id).filter(Boolean);
    }

    _renderBatchToolbar() {
        // Remove old toolbar if exists
        const existing = this.containerEl.querySelector('.batch-toolbar');
        if (existing) existing.remove();

        const header = this.containerEl.querySelector('.card-header');
        if (!header) return;

        const classId = this.classId;
        const toolbar = document.createElement('div');
        toolbar.className = 'batch-toolbar';
        toolbar.innerHTML = `
            <span class="batch-label">Selected: <strong class="batch-count">0</strong></span>
            <button class="btn btn-danger btn-xs" onclick="objectListBatchDelete('${esc(classId)}')">Delete Selected</button>
            <button class="btn btn-ghost btn-xs" onclick="objectListBatchExport('${esc(classId)}')">Export Selected</button>
            ${this.classActions.length > 0 ? `
                <select class="batch-action-select" onchange="objectListBatchAction('${esc(classId)}', this.value); this.value='';">
                    <option value="">Run Action...</option>
                    ${this.classActions.map(a => `<option value="${esc(a.id)}">${esc(a.name || a.id)}</option>`).join('')}
                </select>
            ` : ''}
        `;

        // Insert after header
        header.parentNode.insertBefore(toolbar, header.nextSibling);
    }

    _updateBatchCount() {
        const count = this._getSelectedIds().length;
        const el = this.containerEl.querySelector('.batch-count');
        if (el) el.textContent = count;
        const toolbar = this.containerEl.querySelector('.batch-toolbar');
        if (toolbar) toolbar.style.display = count > 0 ? 'flex' : 'none';
    }

    async load() {
        try {
            const [classMeta, objects] = await Promise.all([
                getClassMeta(this.classId),
                api('GET', `/store/${this.classId}`)
            ]);

            this.gridData = objects;
            const classId = this.classId;

            // Load class-level actions
            try {
                this.classActions = await getActionsForClass(classId);
            } catch (_) {
                this.classActions = [];
            }

            // Build columns with checkbox selection
            const columnDefs = [
                {
                    headerCheckboxSelection: true,
                    checkboxSelection: true,
                    width: 40,
                    maxWidth: 40,
                    pinned: 'left',
                    suppressMenu: true,
                    sortable: false,
                    filter: false,
                    resizable: false
                },
                ...buildGridColumns(classMeta, classId, (p) => {
                    const idx = p.rowIndex;
                    const id = p.data.id;
                    return `<button class="btn btn-ghost btn-xs" onclick="objectListEditRow('${esc(classId)}', ${idx})">Edit</button>` +
                        `<button class="btn btn-danger btn-xs" style="margin-left:4px" onclick="objectListDeleteRow('${esc(classId)}', '${esc(id)}')">Del</button>`;
                })
            ];

            // Init grid
            const gridDiv = this.containerEl.querySelector('.ag-grid-el');
            gridDiv.innerHTML = '';

            const self = this;
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
                rowSelection: 'multiple',
                onRowDoubleClicked: (e) => renderModalForClass(this.classId, e.data),
                onSelectionChanged: () => self._updateBatchCount(),
                animateRows: true,
                pagination: true,
                paginationPageSize: 20
            };

            this.gridApi = agGrid.createGrid(gridDiv, gridOptions);

            // Render batch toolbar
            this._renderBatchToolbar();

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

// Batch action handlers
async function objectListBatchDelete(classId) {
    const panel = window._objectListPanels?.[classId];
    if (!panel) return;
    const ids = panel._getSelectedIds();
    if (ids.length === 0) { showToast('No objects selected', 'error'); return; }
    if (!confirm(`Delete ${ids.length} selected objects? This cannot be undone.`)) return;

    showToast(`Deleting ${ids.length} objects...`, 'success');
    const result = await batchDelete(classId, ids);
    showToast(`Deleted: ${result.ok.length}, Errors: ${result.errors.length}`, result.errors.length ? 'error' : 'success');
    panel.load();
}

function objectListBatchExport(classId) {
    const panel = window._objectListPanels?.[classId];
    if (!panel) return;
    const ids = panel._getSelectedIds();
    if (ids.length === 0) { showToast('No objects selected', 'error'); return; }

    const selected = panel.gridData.filter(o => ids.includes(o.id));
    const json = JSON.stringify(selected, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${classId}_export_${ids.length}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${ids.length} objects`);
}

async function objectListBatchAction(classId, actionId) {
    if (!actionId) return;
    const panel = window._objectListPanels?.[classId];
    if (!panel) return;
    const ids = panel._getSelectedIds();
    if (ids.length === 0) { showToast('No objects selected', 'error'); return; }
    if (!confirm(`Execute action on ${ids.length} selected objects?`)) return;

    showToast(`Executing action on ${ids.length} objects...`, 'success');
    const result = await batchExecuteAction(actionId, classId, ids);
    showToast(`OK: ${result.ok.length}, Errors: ${result.errors.length}`, result.errors.length ? 'error' : 'success');
    panel.load();
}
