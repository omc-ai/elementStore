// =====================================================================
// MODAL - Modal management, drag, renderModalForClass, save
// =====================================================================

let editingClassId = null;
let editingObject = null;
/** @type {AtomObj|null} The wrapped AtomObj for the object being edited */
let editingAtomObj = null;

// =====================
// Drag functionality
// =====================
let dragState = { active: false, modal: null, startX: 0, startY: 0, initialX: 0, initialY: 0 };

function startDrag(e, modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    dragState.active = true;
    dragState.modal = modal;
    dragState.startX = e.clientX;
    dragState.startY = e.clientY;
    const rect = modal.getBoundingClientRect();
    dragState.initialX = rect.left;
    dragState.initialY = rect.top;
    modal.style.position = 'fixed';
    modal.style.left = rect.left + 'px';
    modal.style.top = rect.top + 'px';
    modal.style.margin = '0';
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', stopDrag);
    e.preventDefault();
}

function onDrag(e) {
    if (!dragState.active) return;
    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;
    dragState.modal.style.left = (dragState.initialX + dx) + 'px';
    dragState.modal.style.top = (dragState.initialY + dy) + 'px';
}

function stopDrag() {
    dragState.active = false;
    document.removeEventListener('mousemove', onDrag);
    document.removeEventListener('mouseup', stopDrag);
}

// =====================
// Resize functionality
// =====================
let resizeState = { active: false, modal: null, startX: 0, startY: 0, startW: 0, startH: 0 };

function startModalResize(e, modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    e.preventDefault();
    e.stopPropagation();
    resizeState.active = true;
    resizeState.modal = modal;
    resizeState.startX = e.clientX;
    resizeState.startY = e.clientY;
    resizeState.startW = modal.offsetWidth;
    resizeState.startH = modal.offsetHeight;
    // Ensure modal is positioned for resize
    if (!modal.style.position || modal.style.position !== 'fixed') {
        const rect = modal.getBoundingClientRect();
        modal.style.position = 'fixed';
        modal.style.left = rect.left + 'px';
        modal.style.top = rect.top + 'px';
        modal.style.margin = '0';
    }
    modal.style.maxWidth = 'none';
    modal.style.maxHeight = 'none';
    modal.style.width = resizeState.startW + 'px';
    modal.style.height = resizeState.startH + 'px';
    document.addEventListener('mousemove', onModalResize);
    document.addEventListener('mouseup', stopModalResize);
}

function onModalResize(e) {
    if (!resizeState.active) return;
    const dx = e.clientX - resizeState.startX;
    const dy = e.clientY - resizeState.startY;
    const newW = Math.max(400, resizeState.startW + dx);
    const newH = Math.max(300, resizeState.startH + dy);
    resizeState.modal.style.width = newW + 'px';
    resizeState.modal.style.height = newH + 'px';
}

function stopModalResize() {
    resizeState.active = false;
    document.removeEventListener('mousemove', onModalResize);
    document.removeEventListener('mouseup', stopModalResize);
}

// =====================
// Modal open/close
// =====================
function openModal() {
    const modal = document.getElementById('editModal');
    modal.classList.add('active');
    const content = modal.querySelector('.modal');
    if (content) {
        content.style.position = '';
        content.style.left = '';
        content.style.top = '';
        content.style.margin = '';
        content.style.width = '';
        content.style.height = '';
        content.style.maxWidth = '';
        content.style.maxHeight = '';
    }
}

function closeModal() {
    document.getElementById('editModal').classList.remove('active');
    editingObject = null;
    editingClassId = null;
    editingAtomObj = null;
}

// =====================
// Render modal for any class (replaces openCreateModal + openEditModal)
// =====================
async function renderModalForClass(classId, data) {
    editingClassId = classId;
    editingObject = data || { id: '' };

    // Wrap in AtomObj through the store for proxy access and validation
    if (typeof store !== 'undefined') {
        try {
            const raw = Object.assign({}, editingObject);
            if (!raw.class_id) raw.class_id = classId;
            editingAtomObj = store.setObject(raw);
        } catch (e) {
            console.warn('Failed to wrap editingObject in store:', e.message);
            editingAtomObj = null;
        }
    }

    const meta = await getClassMeta(classId);
    const displayName = meta?.name || classId;
    const isNew = !data || !data.id;

    document.getElementById('modalTitle').textContent = isNew
        ? `Create New ${displayName}`
        : `Edit ${displayName}: ${data.id}`;

    // Store props for validation
    currentFormProps = {};
    const props = meta?.props || [];
    const propsArray = Array.isArray(props) ? props : Object.values(props);
    propsArray.forEach(p => currentFormProps[p.key] = p);

    // Render generic editor
    const editorHtml = await elementStore.renderEditor(classId, editingObject);

    let html = `
        <div style="margin-bottom:12px;padding:8px 12px;background:#f0f4ff;border-radius:6px;font-size:12px">
            <strong>${esc(classId)}</strong>
            <span style="color:#6366f1;margin-left:8px">${propsArray.length} properties</span>
            <button type="button" class="btn-json-toggle" onclick="toggleMetaViewer()" style="float:right">{ } Schema</button>
        </div>
        <div id="metaViewerContent" style="display:none;margin-bottom:12px;padding:12px;background:#1e1e1e;border-radius:6px;max-height:200px;overflow:auto">
            <pre style="margin:0;font-size:11px;color:#9cdcfe;white-space:pre-wrap">${esc(JSON.stringify(meta, null, 2))}</pre>
        </div>
        <div id="validationSummary" class="ge-validation-summary" style="display:none"></div>
        <div id="geContainer">${editorHtml}</div>
    `;

    // Render action buttons for @action-type props (only when editing existing objects)
    if (!isNew) {
        const actionProps = propsArray.filter(p => {
            const ocid = p.object_class_id;
            if (!ocid) return false;
            if (Array.isArray(ocid)) return ocid.includes('@action');
            return ocid === '@action';
        });
        if (actionProps.length > 0) {
            html += `<div class="action-buttons" style="margin-top:12px;padding:8px 12px;background:#fef3c7;border:1px solid #fcd34d;border-radius:6px">
                <strong style="font-size:12px;color:#92400e">Prop Actions</strong>
                <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">`;
            for (const ap of actionProps) {
                const label = ap.label || ap.name || ap.key;
                const icon = ap.icon ? `${ap.icon} ` : '';
                html += `<button type="button" class="btn btn-primary btn-sm"
                    onclick="executeModalAction('${esc(ap.key)}')"
                    title="${esc(ap.description || '')}">${icon}${esc(label)}</button>`;
            }
            html += `</div></div>`;
        }

        // Class-level actions: query @action objects with target_class_id matching this class
        html += `<div id="classActionsPanel" style="margin-top:12px"><div class="loading" style="padding:8px"><div class="spinner" style="width:16px;height:16px;border-width:2px;margin-right:8px"></div><span style="font-size:12px">Loading class actions...</span></div></div>`;

        // Action results panel
        html += `<div id="actionResultsPanel" style="display:none;margin-top:12px"></div>`;
    }

    const d = editingObject;
    if (d.created_at || d.updated_at || d.owner_id) {
        html += `<div style="margin-top:12px;padding:8px 12px;background:#f9fafb;border-radius:4px;font-size:11px;color:#6b7280">
            ${d.owner_id ? `Owner: ${d.owner_id} | ` : ''}
            ${d.created_at ? `Created: ${d.created_at} | ` : ''}
            ${d.updated_at ? `Updated: ${d.updated_at}` : ''}
        </div>`;
    }

    document.getElementById('modalBody').innerHTML = html;
    openModal();

    // Initialize Select2, inline grids, and AtomObj binding after DOM is ready
    setTimeout(() => {
        $('#modalBody .ge-class-select').select2({
            width: '100%',
            placeholder: 'Select...',
            allowClear: true
        });
        if (typeof geGridInitAll === 'function') geGridInitAll();
        if (typeof geBindEditorToAtomObj === 'function') {
            geBindEditorToAtomObj(document.getElementById('geContainer'));
        }
    }, 0);

    // Load class-level actions (async, after modal is rendered)
    if (!isNew) {
        _loadClassActions(classId);
    }
}

// Toggle meta viewer in modal
function toggleMetaViewer() {
    const el = document.getElementById('metaViewerContent');
    if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

// JSON preview toggles
function togglePropJson(btn) {
    const propRow = btn.closest('.prop-row');
    const preview = propRow.querySelector('.prop-json-preview');
    if (preview) {
        const isHidden = preview.style.display === 'none';
        preview.style.display = isHidden ? 'block' : 'none';
        btn.classList.toggle('active', isHidden);
    }
}

function toggleAllPropJson(show) {
    document.querySelectorAll('.prop-json-preview').forEach(el => {
        el.style.display = show ? 'block' : 'none';
    });
    document.querySelectorAll('.btn-json-toggle').forEach(btn => {
        btn.classList.toggle('active', show);
    });
}

// =====================
// Client-side validation (advisory — shows inline errors)
// =====================

/**
 * Validate collected data against class props.
 * Shows inline errors on fields and a summary banner.
 * @returns {boolean} true if valid (or no validation available)
 */
function validateBeforeSave(data, classId) {
    // Clear previous validation
    document.querySelectorAll('.ge-field-error').forEach(el => el.remove());
    document.querySelectorAll('.ge-invalid').forEach(el => el.classList.remove('ge-invalid'));
    const summary = document.getElementById('validationSummary');
    if (summary) { summary.style.display = 'none'; summary.innerHTML = ''; }

    // Use AtomObj.validate() if available
    if (typeof store !== 'undefined' && classId) {
        try {
            const tempRaw = Object.assign({ class_id: classId }, data);
            const tempObj = new AtomObj(tempRaw, store);
            const errors = tempObj.validate();
            if (errors) {
                _showValidationErrors(errors);
                return false;
            }
        } catch (e) {
            console.warn('Validation failed:', e.message);
        }
    }
    return true;
}

/**
 * Show validation errors inline on fields and in summary banner.
 */
function _showValidationErrors(errors) {
    const keys = Object.keys(errors);
    let summaryHtml = '<strong>Validation issues:</strong><ul>';

    keys.forEach(function(key) {
        const msgs = errors[key];
        msgs.forEach(function(msg) {
            summaryHtml += '<li>' + esc(msg) + '</li>';
        });

        // Find the field input by data-path
        const input = document.querySelector(`[data-path="${key}"]`);
        if (input) {
            input.classList.add('ge-invalid');
            const errorEl = document.createElement('div');
            errorEl.className = 'ge-field-error';
            errorEl.textContent = msgs[0];
            input.parentElement.appendChild(errorEl);
        }
    });

    summaryHtml += '</ul>';
    const summary = document.getElementById('validationSummary');
    if (summary) {
        summary.innerHTML = summaryHtml;
        summary.style.display = 'block';
    }
}

// =====================
// Save Object (from modal)
// =====================
async function saveCurrentObject() {
    try {
        const geContainer = document.getElementById('geContainer');
        const data = geContainer ? geCollectData(geContainer) : {};
        const isClassEdit = editingClassId === '@class';
        const isUpdate = editingObject && editingObject.id;

        // Collect unique constraints if present
        const uniqueConstraints = elementStore.collectUniqueConstraints(document.getElementById('modalBody'));
        if (uniqueConstraints) {
            data.unique = uniqueConstraints;
        }

        // Client-side validation (advisory — continues on failure with warning)
        if (!isClassEdit) {
            const isValid = validateBeforeSave(data, editingClassId);
            if (!isValid) {
                // Show toast but don't block — validation is advisory
                showToast('Some fields have validation issues — check before saving', 'error');
                return;
            }
        }

        if (isClassEdit) {
            if (!data.id) {
                showToast('Class ID is required', 'error');
                return;
            }
            await api('POST', '/class', data);
            showToast(`Class "${data.id}" saved successfully`);
            invalidateClassCache(data.id);
        } else {
            if (!isUpdate) {
                data.class_id = editingClassId;
            }
            if (isUpdate) {
                await api('PUT', `/store/${editingClassId}/${editingObject.id}`, data);
                showToast('Object updated successfully');
            } else {
                await api('POST', `/store/${editingClassId}`, data);
                showToast('Object created successfully');
            }
        }

        closeModal();

        // Refresh the active tab's grid
        const activeTab = typeof tabManager !== 'undefined' ? tabManager?.getActive() : null;
        if (activeTab?.controller?.load) {
            activeTab.controller.load();
        }
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// =====================
// Execute Action (from modal action buttons)
// =====================
// =====================
// Class-level action discovery & execution
// =====================
const ACTION_TYPE_COLORS = {
    api: '#3b82f6', cli: '#8b5cf6', function: '#10b981',
    event: '#f59e0b', composite: '#ec4899', ui: '#6366f1'
};

let _actionResults = []; // session-only, last 5

async function _loadClassActions(classId) {
    const panel = document.getElementById('classActionsPanel');
    if (!panel) return;

    try {
        const actions = await getActionsForClass(classId);
        if (!actions || actions.length === 0) {
            panel.innerHTML = '';
            return;
        }

        // Group by group_name
        const groups = {};
        for (const a of actions) {
            const g = a.group_name || 'General';
            if (!groups[g]) groups[g] = [];
            groups[g].push(a);
        }

        let html = `<div class="class-actions-container">
            <div class="class-actions-header" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none';this.querySelector('.ca-arrow').textContent=this.nextElementSibling.style.display==='none'?'\\u25B6':'\\u25BC'">
                <strong>Class Actions</strong>
                <span style="font-size:12px;color:#6b7280;margin-left:8px">${actions.length} available</span>
                <span class="ca-arrow" style="margin-left:auto">&#9660;</span>
            </div>
            <div class="class-actions-body">`;

        for (const [groupName, groupActions] of Object.entries(groups)) {
            html += `<div class="ca-group">
                <div class="ca-group-name">${esc(groupName)}</div>
                <div class="ca-group-actions">`;
            for (const a of groupActions) {
                const color = ACTION_TYPE_COLORS[a.type] || '#6b7280';
                const icon = a.icon ? `${a.icon} ` : '';
                const desc = a.description ? ` title="${esc(a.description)}"` : '';
                html += `<button type="button" class="ca-btn"${desc}
                    onclick="handleClassAction('${esc(a.id)}')">
                    ${icon}<span>${esc(a.name || a.id)}</span>
                    <span class="ca-type-badge" style="background:${color}">${esc(a.type || '?')}</span>
                </button>`;
            }
            html += `</div></div>`;
        }

        html += `</div></div>`;
        panel.innerHTML = html;
    } catch (e) {
        panel.innerHTML = `<div style="font-size:12px;color:#9ca3af;padding:4px">No class actions</div>`;
    }
}

async function handleClassAction(actionId) {
    if (!editingClassId || !editingObject?.id) {
        showToast('No object selected', 'error');
        return;
    }

    try {
        // Fetch action definition
        const actionDef = await api('GET', `/store/@action/${actionId}`);
        if (!actionDef) { showToast('Action not found', 'error'); return; }

        // Confirmation
        if (actionDef.confirm) {
            let msg = actionDef.confirm;
            // Resolve {field} placeholders from current object
            msg = msg.replace(/\{(\w+)\}/g, (_, key) => editingObject[key] || `{${key}}`);
            if (!confirm(msg)) return;
        }

        // Collect params if action has params defined
        let params = {};
        if (actionDef.params && actionDef.params.length > 0) {
            params = await _collectActionParams(actionDef);
            if (params === null) return; // user cancelled
        }

        showToast(`Executing ${actionDef.name || actionId}...`, 'success');
        const result = await executeClassAction(actionId, editingClassId, editingObject.id, params);

        // Record result
        _addActionResult(actionDef.name || actionId, actionDef.type, result);

        showToast(`Action "${actionDef.name || actionId}" completed`, 'success');

        // Refresh editor with updated object
        if (result?.object) {
            editingObject = result.object;
            await renderModalForClass(editingClassId, editingObject);
        }
    } catch (err) {
        _addActionResult(actionId, 'error', { error: err.message });
        showToast(`Action failed: ${err.message}`, 'error');
    }
}

function _collectActionParams(actionDef) {
    return new Promise((resolve) => {
        const params = actionDef.params || [];
        let html = `<div style="padding:8px"><strong>${esc(actionDef.name || actionDef.id)}</strong><p style="font-size:12px;color:#6b7280;margin:4px 0 12px">${esc(actionDef.description || 'Enter parameters:')}</p>`;
        for (const p of params) {
            const key = p.key || p.id || p.name;
            const label = p.label || p.name || key;
            const type = p.data_type || 'string';
            html += `<div style="margin-bottom:8px">
                <label style="display:block;font-size:12px;font-weight:500;margin-bottom:4px">${esc(label)}${p.required ? ' <span style="color:#ef4444">*</span>' : ''}</label>`;
            if (p.options && p.options.length) {
                html += `<select class="form-input action-param-input" data-key="${esc(key)}">
                    <option value="">Select...</option>`;
                for (const opt of p.options) {
                    const optVal = typeof opt === 'string' ? opt : (opt.value || opt.id || opt);
                    const optLabel = typeof opt === 'string' ? opt : (opt.label || opt.name || optVal);
                    html += `<option value="${esc(optVal)}">${esc(optLabel)}</option>`;
                }
                html += `</select>`;
            } else if (type === 'boolean') {
                html += `<label class="toggle-switch"><input type="checkbox" class="action-param-input" data-key="${esc(key)}" data-type="boolean"><span class="toggle-slider"></span></label>`;
            } else if (type === 'text') {
                html += `<textarea class="form-input action-param-input" data-key="${esc(key)}" rows="3"></textarea>`;
            } else {
                html += `<input type="text" class="form-input action-param-input" data-key="${esc(key)}" placeholder="${esc(p.default_value || '')}">`;
            }
            html += `</div>`;
        }
        html += `<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
            <button class="btn btn-ghost btn-sm" id="actionParamCancel">Cancel</button>
            <button class="btn btn-primary btn-sm" id="actionParamSubmit">Execute</button>
        </div></div>`;

        // Show in a sub-overlay
        const overlay = document.createElement('div');
        overlay.className = 'action-param-overlay';
        overlay.innerHTML = `<div class="action-param-dialog">${html}</div>`;
        document.body.appendChild(overlay);

        overlay.querySelector('#actionParamCancel').onclick = () => { overlay.remove(); resolve(null); };
        overlay.querySelector('#actionParamSubmit').onclick = () => {
            const collected = {};
            overlay.querySelectorAll('.action-param-input').forEach(el => {
                const k = el.dataset.key;
                if (el.dataset.type === 'boolean') {
                    collected[k] = el.checked;
                } else {
                    if (el.value) collected[k] = el.value;
                }
            });
            overlay.remove();
            resolve(collected);
        };
    });
}

function _addActionResult(name, type, result) {
    _actionResults.unshift({ name, type, result, timestamp: new Date().toLocaleTimeString() });
    if (_actionResults.length > 5) _actionResults.pop();
    _renderActionResults();
}

function _renderActionResults() {
    const panel = document.getElementById('actionResultsPanel');
    if (!panel) return;

    if (_actionResults.length === 0) { panel.style.display = 'none'; return; }

    panel.style.display = 'block';
    let html = `<div class="action-results-container">
        <div class="action-results-header" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none'">
            <strong>Results</strong>
            <span style="font-size:11px;color:#6b7280;margin-left:8px">${_actionResults.length}</span>
        </div>
        <div class="action-results-body">`;
    for (const r of _actionResults) {
        const isError = r.type === 'error' || r.result?.error;
        const statusClass = isError ? 'ar-error' : 'ar-success';
        const output = typeof r.result === 'string' ? r.result : JSON.stringify(r.result, null, 2);
        html += `<div class="ar-item ${statusClass}">
            <div class="ar-item-header">
                <span class="ar-name">${esc(r.name)}</span>
                <span class="ar-time">${esc(r.timestamp)}</span>
                <span class="ar-status">${isError ? 'FAIL' : 'OK'}</span>
            </div>
            <pre class="ar-output">${esc(output)}</pre>
        </div>`;
    }
    html += `</div></div>`;
    panel.innerHTML = html;
}

// =====================
// Execute Action (from modal action buttons — prop-level)
// =====================
async function executeModalAction(propKey) {
    if (!editingClassId || !editingObject?.id) {
        showToast('Cannot execute action: no object selected', 'error');
        return;
    }

    // Use store.executeAction if available (preferred), else direct API call
    try {
        showToast(`Executing ${propKey}...`, 'success');
        let result;

        if (typeof store !== 'undefined' && store.executeAction) {
            result = store.executeAction(editingClassId, editingObject.id, propKey, {});
        } else {
            result = await api('PUT', `/store/${editingClassId}/${editingObject.id}/${propKey}`, {});
        }

        if (result) {
            showToast(`Action "${propKey}" completed`, 'success');
            // Refresh the editor with updated object data
            const updated = await api('GET', `/store/${editingClassId}/${editingObject.id}`);
            if (updated) {
                showEditor(editingClassId, updated);
            }
        } else {
            showToast(`Action "${propKey}" returned no result`, 'error');
        }
    } catch (err) {
        showToast(`Action "${propKey}" failed: ${err.message}`, 'error');
    }
}
