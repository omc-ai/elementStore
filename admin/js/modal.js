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

    // Initialize Select2 on class-option selects
    setTimeout(() => {
        $('#modalBody .ge-class-select').select2({
            width: '100%',
            placeholder: 'Select...',
            allowClear: true
        });
    }, 0);
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
