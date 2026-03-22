// =====================================================================
// FIELDS - Generic Editor field rendering (ge* functions)
// =====================================================================

/**
 * Generate a read-only preview of an object's first few properties.
 * Shows id first, excludes _class_id, takes up to maxProps keys.
 */
function geObjPreview(obj, maxProps = 4) {
    if (!obj || typeof obj !== 'object') return '';
    const keys = Object.keys(obj).filter(k => k !== '_class_id');
    // Put 'id' first if present
    const idx = keys.indexOf('id');
    if (idx > 0) { keys.splice(idx, 1); keys.unshift('id'); }
    const shown = keys.slice(0, maxProps);
    if (!shown.length) return '';
    const parts = shown.map(k => {
        let v = obj[k];
        if (v === null || v === undefined) v = '';
        if (typeof v === 'object') v = Array.isArray(v) ? `[${v.length}]` : '{…}';
        const sv = String(v);
        const display = sv.length > 24 ? sv.slice(0, 24) + '\u2026' : sv;
        return `<span class="ge-preview-kv"><span class="ge-preview-k">${esc(k)}</span>${esc(display)}</span>`;
    });
    return `<span class="ge-obj-preview">${parts.join('')}</span>`;
}

/**
 * Render @obj_ref — dynamic typed value.
 * Resolves the ref to a @prop definition and renders the value using that prop's type/editor/options.
 * ref="self" means use the parent object as the @prop definition (reads data_type, options from parent).
 */
async function geObjRef(prop, value, path, lvl, label, req, metaBtn, typeLabel) {
    const refValue = prop.options?.ref || (typeof value === 'object' && value?.ref) || 'self';
    const rawValue = (typeof value === 'object' && value !== null) ? value.value : value;

    // Resolve the ref to a @prop definition
    let refProp = null;

    if (refValue === 'self') {
        // "self" = use the parent object as the @prop definition
        // The parent is the object that contains this field — read from the render stack
        const parent = elementStore._parentStack[elementStore._parentStack.length - 1];
        if (parent?.obj) {
            const parentObj = parent.obj;
            refProp = {
                key: 'value',
                data_type: parentObj.data_type || 'string',
                options: parentObj.options || {},
                editor: parentObj.editor || null,
                object_class_id: parentObj.object_class_id || null,
                label: label
            };
        }
    } else {
        // Fetch the referenced @prop by ID from the store
        try {
            refProp = await api('GET', `/store/@prop/${refValue}`);
        } catch (_) {}
    }

    if (!refProp) {
        refProp = { key: 'value', data_type: 'string', label: label };
    }

    // Render the value using the resolved @prop's type — always use geInput (no recursion)
    const refInput = `<input type="hidden" data-path="${path}.ref" value="${esc(refValue)}">`;
    const valuePath = `${path}.value`;
    const resolvedType = refProp.data_type || 'string';

    // For relation, use geRelation
    if (resolvedType === 'relation') {
        const valueHtml = await geRelation(refProp, rawValue, valuePath);
        return elementStore.renderRow(label, req, metaBtn, resolvedType, refInput + valueHtml);
    }

    // For all other types, use geInput directly (no geField — avoids @obj_ref recursion)
    const valueHtml = await geInput(refProp, rawValue, valuePath);
    return elementStore.renderRow(label, req, metaBtn, resolvedType, refInput + valueHtml);
}

/**
 * Render a single field (recursive)
 */
async function geField(prop, value, path, lvl) {
    if (lvl > 20) return '<span class="ge-error">Max nesting depth</span>';
    const dt = prop.data_type || 'string';
    const arrMode = elementStore.getArrayMode(prop);
    const isIndexed = arrMode === 'indexed';
    const isAssoc = arrMode === 'assoc';
    const cls = elementStore.getCls(prop);
    const label = elementStore.getPropLabel(prop);
    const typeLabel = elementStore.getPropType(prop);
    const req = prop.flags?.required ? '<span class="req">*</span>' : '';
    const propJson = esc(JSON.stringify(prop));
    const metaBtn = `<button type="button" class="ge-meta-btn" onclick="showPropMeta(this)" data-prop="${propJson}" title="View @prop meta">@</button>`;
    const foldId = elementStore.getFoldId(path);

    let html = '';

    if (isAssoc) {
        // Associative array: key→value map
        const obj = (value && typeof value === 'object' && !Array.isArray(value)) ? value : {};
        const keyCount = Object.keys(obj).length;
        const valContent = `<span class="ge-arr-inline"><span class="count">{${keyCount}}</span></span>`;
        const actContent = `<button type="button" class="ge-fold" onclick="geFoldAllToggle(this,'${esc(foldId)}')" title="Fold/Unfold all">⊟</button>` +
            `<button type="button" class="ge-btn ge-btn-add" onclick="geAddAssocItem('${path}', '${esc(dt)}', '${esc(cls || '')}')">+ Add</button>`;
        html += elementStore.renderSectionHeader(label, req, metaBtn, typeLabel, foldId, valContent, actContent, keyCount === 0);
        html += elementStore.renderSectionBody(lvl, foldId, await geAssocArray(prop, obj, path, lvl));
    } else if (isIndexed && elementStore.getEditorId(prop) === 'grid' && cls) {
        // Explicit grid editor for typed arrays
        const arr = Array.isArray(value) ? value : [];
        const valContent = `<span class="ge-arr-inline"><span class="count">${arr.length}</span></span>`;
        const actContent = `<button type="button" class="ge-btn ge-btn-add" onclick="geGridAddRow('${esc(path)}')">+ New</button>`;
        html += elementStore.renderSectionHeader(label, req, metaBtn, typeLabel, foldId, valContent, actContent);
        html += elementStore.renderSectionBody(lvl, foldId, geGrid(prop, arr, path));
    } else if (isIndexed) {
        const arr = Array.isArray(value) ? value : [];
        const valContent = `<span class="ge-arr-inline"><span class="count">${arr.length}</span></span>`;
        const actContent = `<button type="button" class="ge-fold" onclick="geFoldAllToggle(this,'${esc(foldId)}')" title="Fold/Unfold all">⊟</button>` +
            `<button type="button" class="ge-btn ge-btn-add" onclick="geAddItem('${path}')">+ Add</button>`;
        html += elementStore.renderSectionHeader(label, req, metaBtn, typeLabel, foldId, valContent, actContent);
        html += elementStore.renderSectionBody(lvl, foldId, await geArray(prop, value, path, lvl));
    } else if (dt === 'object' && cls === '@obj_ref') {
        // @obj_ref — dynamic typed value. Resolve ref and render value as the referenced @prop type.
        html += await geObjRef(prop, value, path, lvl, label, req, metaBtn, typeLabel);
    } else if (dt === 'object' && cls) {
        const classes = Array.isArray(prop.object_class_id) ? prop.object_class_id : [cls];
        const isMulti = classes.length > 1;
        // Resolve string values as IDs — metadata-driven via object_class_id
        let obj;
        if (typeof value === 'object' && value !== null) {
            obj = value;
        } else if (typeof value === 'string' && value && prop.object_class_id) {
            try { obj = await api('GET', `/store/${cls}/${value}`); } catch (_) { obj = null; }
        } else {
            obj = null;
        }
        // Register for Create/Null re-rendering
        elementStore._typedObjRegistry[path] = { prop, lvl };

        if (obj === null) {
            // NULL STATE: select from existing instances, child classes, or create new
            const storeObjects = await _geLoadClassObjects(cls, prop, path);
            const childClasses = await _geGetChildClasses(cls);
            // Build available class options: explicit classes + discovered children
            const allClasses = [...classes];
            for (const ch of childClasses) {
                if (!allClasses.includes(ch.id)) allClasses.push(ch.id);
            }
            const hasClassChoice = allClasses.length > 1;
            let valContent, actContent;
            if (storeObjects.length > 0 && !hasClassChoice) {
                // Single class with existing instances — show select dropdown
                const opts = _geBuildOptions(storeObjects, '');
                valContent = `<select class="ge-class-select" onchange="geSelectTypedObj('${esc(path)}', this.value)">
                    <option value="">-- Select ${esc(cls)} --</option>${opts}
                </select>`;
                actContent = `<button type="button" class="ge-btn ge-btn-add" onclick="geCreateTypedObj('${path}','${esc(cls)}')">New</button>`;
            } else if (hasClassChoice) {
                // Multiple classes or child classes — show class selector
                valContent = `<span class="ge-null">null</span><input type="hidden" data-path="${path}" data-type="json" value="null">`;
                const clsOpts = allClasses.map(c => {
                    const meta = childClasses.find(ch => ch.id === c);
                    const label = meta?.name || c;
                    return `<option value="${esc(c)}">${esc(c)}${label !== c ? ` (${esc(label)})` : ''}</option>`;
                }).join('');
                actContent = `<select class="ge-obj-cls-sel">${clsOpts}</select>` +
                    `<button type="button" class="ge-btn ge-btn-add" onclick="geCreateTypedObj('${path}')">Create</button>`;
            } else {
                valContent = `<span class="ge-null">null</span><input type="hidden" data-path="${path}" data-type="json" value="null">`;
                actContent = `<button type="button" class="ge-btn ge-btn-add" onclick="geCreateTypedObj('${path}','${esc(cls)}')">Create</button>`;
            }
            html += elementStore.renderRow(label, req, metaBtn, typeLabel, valContent, actContent)
                .replace('<tr', `<tr data-typed-obj="${esc(path)}"`);
        } else {
            // EXISTING STATE: fold + props + Null in act
            const activeClass = obj._class_id || obj.class_id || cls;
            const valContent = `<span class="ge-obj-inline"><span class="cls">${esc(activeClass)}</span></span> ${geObjPreview(obj)}`;
            const actContent = `<button type="button" class="ge-btn ge-btn-del" onclick="geNullTypedObj('${path}')">Null</button>`;
            const nestedContent = `<input type="hidden" data-path="${path}._class_id" value="${esc(activeClass)}">` +
                await geObject(prop, value, path, lvl, activeClass);
            html += elementStore.renderSectionHeader(label, req, metaBtn, typeLabel, foldId, valContent, actContent)
                .replace('<tr', `<tr data-typed-obj="${esc(path)}"`);
            html += elementStore.renderSectionBody(lvl, foldId, nestedContent)
                .replace('<tr', `<tr data-typed-obj="${esc(path)}"`);
        }
    } else if (dt === 'object' && !cls) {
        const obj = typeof value === 'object' && value !== null ? value : {};
        const keyCount = Object.keys(obj).length;
        const valContent = `<span class="ge-obj-inline"><span class="cls">{${keyCount}}</span></span>`;
        const actContent = `<button type="button" class="ge-btn ge-btn-add" onclick="geAddFreeKey('${path}')">+ Key</button>`;
        html += elementStore.renderSectionHeader(label, req, metaBtn, typeLabel, foldId, valContent, actContent, keyCount === 0);
        html += elementStore.renderSectionBody(lvl, foldId, geFreeObject(obj, path, lvl + 1));
    } else if (dt === 'relation') {
        html += elementStore.renderRow(label, req, metaBtn, typeLabel, await geRelation(prop, value, path));
    } else {
        html += elementStore.renderRow(label, req, metaBtn, typeLabel, await geInput(prop, value, path));
    }
    return html;
}

// =====================================================================
// AtomObj binding — sync DOM changes to the parent AtomObj
// =====================================================================

/**
 * Delegated change handler — writes input values to the parent AtomObj.
 * Attach to the editor container once after rendering.
 */
function geBindEditorToAtomObj(container) {
    if (!container || typeof store === 'undefined') return;
    container.addEventListener('change', (e) => {
        const el = e.target;
        const path = el.dataset?.path;
        if (!path) return;
        // Find which editor context this path belongs to
        const parts = path.split('.');
        // Walk up to find the parent context in es.editors
        for (let i = parts.length - 1; i >= 0; i--) {
            const parentPath = parts.slice(0, i).join('.') || parts[0];
            const ctx = window.es?.editors?.[parentPath];
            if (ctx?.atomObj) {
                const propKey = parts.slice(i).join('.');
                const type = el.dataset.type;
                let val;
                if (type === 'boolean') val = el.checked;
                else if (type === 'integer' || type === 'number') val = el.value ? parseInt(el.value, 10) : null;
                else if (type === 'float') val = el.value ? parseFloat(el.value) : null;
                else if (type === 'json' || type === 'object') {
                    try { val = JSON.parse(el.value || 'null'); } catch (_) { val = el.value; }
                } else val = el.value;
                // Write to AtomObj — triggers subscribe callbacks
                try { ctx.atomObj.data[propKey] = val; } catch (_) {}
                break;
            }
        }
    });
}

// Show @prop meta in JSON viewer dialog
function showPropMeta(btn) {
    const prop = JSON.parse(btn.dataset.prop);
    const json = JSON.stringify(prop, null, 2);

    let overlay = document.getElementById('ge-meta-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'ge-meta-overlay';
        overlay.className = 'ge-meta-overlay';
        document.body.appendChild(overlay);
    }

    overlay.innerHTML = `<div class="ge-meta-dialog">
        <div class="ge-meta-dialog-hdr">
            <span>@prop: ${esc(prop.key || '')}</span>
            <div>
                <button type="button" class="ge-btn" onclick="navigator.clipboard.writeText(document.getElementById('ge-meta-json').textContent).then(()=>{this.textContent='Copied!';setTimeout(()=>this.textContent='Copy',1500)})">Copy</button>
                <button type="button" class="ge-btn" onclick="document.getElementById('ge-meta-overlay').style.display='none'">\u00d7</button>
            </div>
        </div>
        <pre id="ge-meta-json" class="ge-meta-json">${esc(json)}</pre>
    </div>`;
    overlay.style.display = 'flex';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.style.display = 'none'; };
}

/**
 * Render simple input based on data_type and prop.options
 */
async function geInput(prop, value, path) {
    const dt = prop.data_type || 'string';
    const opts = prop.options || {};
    const v = value ?? prop.default_value ?? '';
    const safeVal = esc(typeof v === 'object' ? JSON.stringify(v) : String(v));
    const ph = esc(prop.description || '');
    const ro = (prop.flags?.readonly || (prop.flags?.create_only && !elementStore._isNewObject)) ? 'disabled' : '';

    // String with options from a class (Select2 dropdown)
    const cls = elementStore.getCls(prop);
    if (dt === 'string' && cls) {
        return await geStringClassSelect(prop, v, path, cls, ro);
    }

    // Boolean
    if (dt === 'boolean') {
        const checked = v === true || v === 'true' ? 'checked' : '';
        const label = checked ? (opts.true_label || 'Yes') : (opts.false_label || 'No');
        return `<label class="ge-toggle">
            <input type="checkbox" data-path="${path}" data-type="boolean" ${checked} ${ro}>
            <span class="ge-toggle-label">${esc(label)}</span>
        </label>`;
    }

    // Select — options.values as array (static) or object (class selector)
    if (opts.values) {
        const isClassSelector = !Array.isArray(opts.values) && typeof opts.values === 'object';

        if (isClassSelector) {
            // Class selector: keys are display values, values are class_ids
            const keys = Object.keys(opts.values);
            const optHtml = keys.map(k => `<option value="${esc(k)}" ${v === k ? 'selected' : ''}>${esc(k)}</option>`).join('');
            return `<select data-path="${path}" data-type="select" data-class-selector='${esc(JSON.stringify(opts.values))}' onchange="geClassSelectorChange(this)" ${ro}>
                <option value="">--</option>${optHtml}
            </select>`;
        }

        // Static select: array of values
        const values = opts.values;
        if (values.length > 0) {
            const allowCustom = opts.allow_custom;
            const optHtml = values.map(o => `<option value="${esc(o)}" ${v === o ? 'selected' : ''}>${esc(o)}</option>`).join('');

            if (allowCustom) {
                const isCustom = v && !values.includes(v);
                return `<div class="ge-combo">
                    <select data-path="${path}" data-type="select" onchange="geComboChange(this)" ${ro}>
                        <option value="">--</option>
                        ${optHtml}
                        <option value="__custom__" ${isCustom ? 'selected' : ''}>Custom...</option>
                    </select>
                    <input type="text" class="ge-combo-custom" value="${isCustom ? safeVal : ''}"
                           style="display:${isCustom ? 'block' : 'none'}" placeholder="Enter custom value"
                           onchange="geComboCustomChange(this, '${path}')" ${ro}>
                </div>`;
            }
            return `<select data-path="${path}" data-type="select" ${ro}><option value="">--</option>${optHtml}</select>`;
        }
    }

    // Number types
    if (dt === 'integer') {
        const min = opts.min !== undefined ? `min="${opts.min}"` : '';
        const max = opts.max !== undefined ? `max="${opts.max}"` : '';
        const step = opts.step !== undefined ? `step="${opts.step}"` : 'step="1"';
        return `<input type="number" data-path="${path}" data-type="${dt}" value="${safeVal}" ${min} ${max} ${step} placeholder="${ph}" ${ro}>`;
    }
    if (dt === 'float') {
        const min = opts.min !== undefined ? `min="${opts.min}"` : '';
        const max = opts.max !== undefined ? `max="${opts.max}"` : '';
        const step = opts.step !== undefined ? `step="${opts.step}"` : 'step="any"';
        return `<input type="number" data-path="${path}" data-type="float" value="${safeVal}" ${min} ${max} ${step} placeholder="${ph}" ${ro}>`;
    }

    // Function/code
    if (dt === 'function') {
        return `<textarea class="code" data-path="${path}" data-type="function" placeholder="function(scope) { ... }" ${ro}>${safeVal}</textarea>`;
    }

    // Generic object (JSON)
    if (dt === 'object') {
        const jsonVal = typeof v === 'object' ? JSON.stringify(v, null, 2) : v;
        return `<textarea class="code" data-path="${path}" data-type="json" placeholder="{ }" ${ro}>${esc(jsonVal)}</textarea>`;
    }

    // Date/datetime
    if (dt === 'date') return `<input type="date" data-path="${path}" data-type="date" value="${safeVal}" ${ro}>`;
    if (dt === 'datetime') return `<input type="datetime-local" data-path="${path}" data-type="datetime" value="${safeVal}" ${ro}>`;

    // Textarea for description/long text
    if (elementStore.getEditorId(prop) === 'textarea' || prop.key === 'description') {
        return `<textarea data-path="${path}" data-type="string" placeholder="${ph}" ${ro}>${safeVal}</textarea>`;
    }

    // String with pattern validation
    if (opts.pattern) {
        return `<input type="text" data-path="${path}" data-type="${dt}" value="${safeVal}" pattern="${esc(opts.pattern)}" placeholder="${ph}" ${ro}>`;
    }

    // String with length constraints
    const minLen = opts.min_length !== undefined ? `minlength="${opts.min_length}"` : '';
    const maxLen = opts.max_length !== undefined ? `maxlength="${opts.max_length}"` : '';

    return `<input type="text" data-path="${path}" data-type="${dt}" value="${safeVal}" ${minLen} ${maxLen} placeholder="${ph}" ${ro}>`;
}

// Class selector — values as assoc map (value → class_id)
// Works in any context: array item, typed object, or top-level modal
async function geClassSelectorChange(select) {
    const val = select.value;
    if (!val || select.disabled) return;
    const classMap = JSON.parse(select.dataset.classSelector || '{}');
    const newClassId = classMap[val];
    if (!newClassId) return;

    const fieldKey = select.dataset.path?.split('.').pop() || '';

    // Context 1: Inside an array item
    const arrRow = select.closest('tr.ge-arr-row');
    if (arrRow) {
        const tbody = arrRow.closest('tbody');
        const table = arrRow.closest('.ge-arr-tbl');
        if (!table) return;
        const rowId = arrRow.dataset.rowId;
        const idx = parseInt(arrRow.dataset.idx || '0');
        const lvl = parseInt(table.dataset.level || '1') - 1;
        const arrPath = table.dataset.arrPath;
        const path = `${arrPath}[${idx}]`;

        const bodyRow = tbody.querySelector(`:scope > tr.ge-section-body[data-row-id="${rowId}"]`);
        const container = bodyRow?.querySelector('.ge-nest-content');
        let currentData = {};
        if (container) currentData = elementStore.collectData(container);
        currentData.class_id = newClassId;
        if (fieldKey) currentData[fieldKey] = val;

        if (bodyRow) bodyRow.remove();
        arrRow.remove();

        const newHtml = await geArrayItem(
            { data_type: 'object', object_class_id: newClassId },
            currentData, path, idx, lvl, true, false, newClassId
        );
        const allRows = tbody.querySelectorAll(':scope > tr.ge-arr-row');
        const insertBefore = allRows[idx] || null;
        if (insertBefore) {
            insertBefore.insertAdjacentHTML('beforebegin', newHtml);
        } else {
            tbody.insertAdjacentHTML('beforeend', newHtml);
        }
        const newRow = tbody.querySelector(`tr.ge-arr-row[data-idx="${idx}"]`);
        if (newRow) {
            const bid = newRow.dataset.rowId;
            const bRow = tbody.querySelector(`tr.ge-section-body[data-row-id="${bid}"]`);
            $(bRow || newRow).find('.ge-class-select').select2({ width: '100%', placeholder: 'Select...', allowClear: true });
        }
        return;
    }

    // Context 2: Inside a typed object (data-typed-obj)
    const typedRow = select.closest('tr[data-typed-obj]');
    if (typedRow) {
        const path = typedRow.dataset.typedObj;
        const reg = elementStore._typedObjRegistry[path];
        if (!reg) return;
        const { prop, lvl } = reg;
        const tbody = typedRow.closest('tbody');
        const rows = tbody.querySelectorAll(`:scope > tr[data-typed-obj="${path}"]`);
        const lastRow = rows[rows.length - 1];
        const container = lastRow?.querySelector('.ge-nest-content');
        let currentData = {};
        if (container) currentData = elementStore.collectData(container);
        currentData.class_id = newClassId;
        if (fieldKey) currentData[fieldKey] = val;

        const nextSibling = lastRow?.nextElementSibling;
        rows.forEach(r => r.remove());
        const newHtml = await geField(prop, currentData, path, lvl);
        if (nextSibling) {
            nextSibling.insertAdjacentHTML('beforebegin', newHtml);
        } else {
            tbody.insertAdjacentHTML('beforeend', newHtml);
        }
        tbody.querySelectorAll(`tr[data-typed-obj="${path}"] .ge-class-select`).forEach(el => {
            $(el).select2({ width: '100%', placeholder: 'Select...', allowClear: true });
        });
        return;
    }

    // Context 3: Top-level modal editor
    const geContainer = select.closest('#geContainer') || select.closest('#modalBody');
    if (geContainer && typeof editingClassId !== 'undefined') {
        let currentData = elementStore.collectData(geContainer);
        currentData.class_id = newClassId;
        if (fieldKey) currentData[fieldKey] = val;
        // Re-render the modal with the new class
        const editorHtml = await elementStore.renderEditor(newClassId, currentData);
        const container = document.getElementById('geContainer');
        if (container) {
            container.innerHTML = editorHtml;
            setTimeout(() => {
                $('#geContainer .ge-class-select').select2({ width: '100%', placeholder: 'Select...', allowClear: true });
                if (typeof geGridInitAll === 'function') geGridInitAll();
            }, 0);
        }
    }
}

// Combo box helpers
function geComboChange(select) {
    const customInput = select.nextElementSibling;
    if (select.value === '__custom__') {
        customInput.style.display = 'block';
        customInput.focus();
    } else {
        customInput.style.display = 'none';
        customInput.value = '';
    }
}

function geComboCustomChange(input, path) {
    const select = input.previousElementSibling;
    select.dataset.customValue = input.value;
}

/**
 * Render string field with options from a class (Select2 dropdown)
 * The value is stored as a plain string (object ID), but the dropdown
 * is populated from objects of the referenced class.
 */
async function geStringClassSelect(prop, value, path, cls, ro) {
    let objects = [];
    try {
        if (cls === '@class') {
            objects = allClassesList || [];
        } else {
            objects = await api('GET', `/store/${cls}`) || [];
        }
    } catch (e) {
        console.warn(`Could not load ${cls} objects for select:`, e);
    }

    const opts = objects.map(o => {
        const id = o.id;
        const label = o.name || o.label || o.key || id;
        const selected = value === id ? 'selected' : '';
        return `<option value="${esc(id)}" ${selected}>${esc(id)}${label !== id ? ' (' + esc(label) + ')' : ''}</option>`;
    }).join('');

    return `<select data-path="${path}" data-type="string" data-class="${cls}" class="ge-class-select" ${ro}>
        <option value="">--</option>
        ${opts}
    </select>`;
}

/**
 * Render relation field
 */
async function geRelation(prop, value, path) {
    const cls = elementStore.getCls(prop);
    const v = value || '';
    const ro = (prop.flags?.readonly || (prop.flags?.create_only && !elementStore._isNewObject)) ? 'disabled' : '';

    if (!cls) {
        return `<input type="text" data-path="${path}" data-type="relation" value="${esc(v)}" placeholder="ID" ${ro}>`;
    }

    const objects = await _geLoadClassObjects(cls, prop, path);
    const opts = _geBuildOptions(objects, v);

    return `<select data-path="${path}" data-type="relation" data-class="${cls}" class="ge-class-select" ${ro}>
        <option value="">--</option>
        ${opts}
    </select>`;
}

/**
 * Render nested object
 */
async function geObject(prop, value, path, lvl, cls) {
    const obj = typeof value === 'object' && value !== null ? value : {};
    const meta = await getClassMeta(cls);

    if (!meta) {
        const jsonVal = JSON.stringify(obj, null, 2);
        return `<textarea class="code" data-path="${path}" data-type="json" style="width:100%">${esc(jsonVal)}</textarea>`;
    }

    return await elementStore.getPropsTable(meta, obj, path, lvl, cls);
}

// =====================================================================
// GRID — Inline AG-Grid for typed object/relation arrays
// =====================================================================

/** Registry of active inline grids: path → { gridApi, data, classId, prop } */
const _geGrids = {};

/**
 * Render an inline AG-Grid for a typed array property.
 * Data stored in hidden textarea with data-path for collectData().
 */
function geGrid(prop, arr, path) {
    const cls = elementStore.getCls(prop);
    const gridId = `ge-grid-${path.replace(/[\[\].]/g, '_')}`;

    // Store grid state for later init + save-back
    _geGrids[path] = { data: [...arr], classId: cls, prop, gridId, gridApi: null };

    // Hidden textarea holds the JSON for collectData()
    const jsonVal = JSON.stringify(arr);
    return `<div class="ge-grid-wrap">
        <div id="${gridId}" class="ag-theme-alpine ge-grid-div" style="height:250px;width:100%"></div>
        <textarea data-path="${path}" data-type="json" class="ge-grid-data" style="display:none">${esc(jsonVal)}</textarea>
    </div>`;
}

/**
 * Initialize all pending inline grids after DOM is rendered.
 * Called after renderEditor inserts HTML into the page.
 */
async function geGridInitAll() {
    for (const [path, g] of Object.entries(_geGrids)) {
        if (g.gridApi) continue; // already initialized
        const div = document.getElementById(g.gridId);
        if (!div) continue;

        const meta = await getClassMeta(g.classId);
        if (!meta) continue;

        const columnDefs = buildGridColumns(meta, g.classId, (p) => {
            const idx = p.rowIndex;
            return `<button class="btn btn-ghost btn-xs" onclick="geGridEditRow('${esc(path)}',${idx})">Edit</button>` +
                `<button class="btn btn-danger btn-xs" style="margin-left:4px" onclick="geGridDeleteRow('${esc(path)}',${idx})">Del</button>`;
        });

        g.gridApi = agGrid.createGrid(div, {
            columnDefs,
            rowData: g.data,
            defaultColDef: { sortable: true, resizable: true, flex: 1, minWidth: 80 },
            domLayout: g.data.length > 10 ? undefined : 'autoHeight',
            animateRows: true,
            onRowDoubleClicked: (e) => geGridEditRow(path, e.rowIndex)
        });

        // Auto-height capped at 400px
        if (g.data.length <= 10) {
            div.style.height = '';
        }
    }
}

/** Sync grid data → hidden textarea for collectData() */
function _geGridSync(path) {
    const g = _geGrids[path];
    if (!g) return;
    const textarea = document.querySelector(`textarea[data-path="${path}"]`);
    if (textarea) textarea.value = JSON.stringify(g.data);
    // Update count in section header
    const foldId = `fold_${path.replace(/[\[\].]/g, '_')}`;
    const hdr = document.querySelector(`[data-target="${foldId}"]`)?.closest('.ge-section-hdr');
    if (hdr) {
        const countEl = hdr.querySelector('.count');
        if (countEl) countEl.textContent = String(g.data.length);
    }
}

/** Edit a grid row — opens property-editor modal with save-back callback */
function geGridEditRow(path, rowIndex) {
    const g = _geGrids[path];
    if (!g || rowIndex < 0 || rowIndex >= g.data.length) return;
    const obj = g.data[rowIndex];

    _geGridModal(g.classId, obj, (updated) => {
        g.data[rowIndex] = updated;
        g.gridApi.setGridOption('rowData', g.data);
        _geGridSync(path);
    });
}

/** Add new row — opens property-editor modal for empty object */
function geGridAddRow(path) {
    const g = _geGrids[path];
    if (!g) return;

    _geGridModal(g.classId, null, (newObj) => {
        g.data.push(newObj);
        g.gridApi.setGridOption('rowData', g.data);
        _geGridSync(path);
    });
}

/** Delete a grid row */
function geGridDeleteRow(path, rowIndex) {
    const g = _geGrids[path];
    if (!g || rowIndex < 0 || rowIndex >= g.data.length) return;
    const id = g.data[rowIndex].id || `row ${rowIndex}`;
    if (!confirm(`Delete "${id}"?`)) return;
    g.data.splice(rowIndex, 1);
    g.gridApi.setGridOption('rowData', g.data);
    _geGridSync(path);
}

/** Counter for stacked grid dialogs */
let _geGridDialogId = 0;

/**
 * Open a NEW stacked dialog for inline grid editing.
 * Does not touch the parent modal — creates its own overlay + dialog.
 */
async function _geGridModal(classId, data, onSave) {
    const meta = await getClassMeta(classId);
    const displayName = meta?.name || classId;
    const isNew = !data || !data.id;
    const obj = data || {};
    const dlgId = `ge-grid-dlg-${++_geGridDialogId}`;
    const containerId = `${dlgId}-container`;

    const editorHtml = await elementStore.renderEditor(classId, obj);
    const title = isNew ? `Create New ${displayName}` : `Edit ${displayName}: ${obj.id || ''}`;

    const overlay = document.createElement('div');
    overlay.id = dlgId;
    overlay.className = 'ge-grid-overlay';
    overlay.innerHTML = `<div class="ge-grid-dialog">
        <div class="ge-grid-dialog-hdr" onmousedown="_geGridDragStart(event,'${dlgId}')">
            <span>${esc(title)}</span>
            <div style="display:flex;gap:6px">
                <button class="btn btn-primary btn-sm" id="${dlgId}-save">Save</button>
                <button class="btn btn-ghost btn-sm" id="${dlgId}-cancel">\u00d7</button>
            </div>
        </div>
        <div class="ge-grid-dialog-body">
            <div style="margin-bottom:8px;padding:6px 10px;background:#f0f4ff;border-radius:4px;font-size:12px">
                <strong>${esc(classId)}</strong>
                <span style="color:#10b981;margin-left:8px">inline edit</span>
            </div>
            <div id="${containerId}">${editorHtml}</div>
        </div>
    </div>`;
    document.body.appendChild(overlay);

    // Close on backdrop click
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    function close() {
        overlay.remove();
    }

    // Cancel
    document.getElementById(`${dlgId}-cancel`).addEventListener('click', close);

    // Save — collect data from this dialog's container and call onSave
    document.getElementById(`${dlgId}-save`).addEventListener('click', () => {
        const container = document.getElementById(containerId);
        const collected = container ? elementStore.collectData(container) : {};
        if (!isNew && obj.id) collected.id = obj.id;
        if (classId) collected._class_id = classId;
        onSave(collected);
        close();
    });

    // Init Select2 + nested grids
    setTimeout(() => {
        $(`#${containerId} .ge-class-select`).select2({ width: '100%', placeholder: 'Select...', allowClear: true });
        geGridInitAll();
    }, 0);
}

/** Drag support for stacked grid dialogs */
function _geGridDragStart(e, dlgId) {
    const overlay = document.getElementById(dlgId);
    if (!overlay) return;
    const dialog = overlay.querySelector('.ge-grid-dialog');
    const rect = dialog.getBoundingClientRect();
    const startX = e.clientX, startY = e.clientY;
    const initX = rect.left, initY = rect.top;
    dialog.style.position = 'fixed';
    dialog.style.left = initX + 'px';
    dialog.style.top = initY + 'px';
    dialog.style.margin = '0';

    function onMove(ev) {
        dialog.style.left = (initX + ev.clientX - startX) + 'px';
        dialog.style.top = (initY + ev.clientY - startY) + 'px';
    }
    function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    e.preventDefault();
}

/**
 * Render array as a 4-column table:
 * | ge-indent (30px) | ge-idx (resizable) | ge-val (rest) | ge-act (auto) |
 */
async function geArray(prop, value, path, lvl) {
    const arr = Array.isArray(value) ? value : [];
    const dt = prop.data_type || 'string';
    const cls = elementStore.getCls(prop);
    const isNestedObjArr = dt === 'object' && cls;
    const isRelationArr = dt === 'relation';
    const level = lvl + 1;

    let html = `<table class="ge ge-arr-tbl" data-arr-path="${path}" data-type="${dt}" data-class="${cls || ''}" data-level="${level}">${elementStore.getColgroup()}<tbody>`;
    for (let i = 0; i < arr.length; i++) {
        html += await geArrayItem(prop, arr[i], `${path}[${i}]`, i, lvl, isNestedObjArr, isRelationArr, cls);
    }
    html += `</tbody></table>`;
    return html;
}

/** Global row ID counter for array items */
let _geArrRowId = 0;

/**
 * Render single array item as table rows (4-column).
 * Scalars: 1 <tr>. Objects: 2 <tr>s (header + body).
 */
async function geArrayItem(prop, value, path, idx, lvl, isNestedObjArr, isRelationArr, cls) {
    const hasNested = isNestedObjArr && cls;
    const rowId = `ar_${++_geArrRowId}`;

    if (hasNested) {
        const foldId = `af_${_geArrRowId}`;
        const obj = typeof value === 'object' && value !== null ? value : {};
        // Use the item's own _class_id if present (child class), otherwise fall back to prop's class
        const itemClass = obj._class_id || obj.class_id || cls;
        const meta = await getClassMeta(itemClass);
        let nestedHtml;
        if (meta) {
            // Persist _class_id if it's a child class so collectData includes it
            const classIdInput = itemClass !== cls
                ? `<input type="hidden" data-path="${path}._class_id" value="${esc(itemClass)}">`
                : '';
            nestedHtml = classIdInput + await elementStore.getPropsTable(meta, obj, path, lvl + 1, itemClass);
        } else {
            nestedHtml = `<textarea class="code" data-path="${path}" data-type="json" style="width:100%">${esc(JSON.stringify(obj, null, 2))}</textarea>`;
        }

        let html = `<tr class="ge-arr-row ge-section-hdr" data-idx="${idx}" data-row-id="${rowId}">
            <td class="ge-indent"><div class="ge-resizer" onmousedown="geStartResize(event, this)"></div></td>
            <td class="ge-idx"><button type="button" class="ge-fold" onclick="elementStore.fold(this)" data-target="${foldId}">\u2212</button> <span class="idx">[${idx}]</span> <span class="cls">${esc(itemClass)}</span><div class="ge-resizer" onmousedown="geStartResize(event, this)"></div></td>
            <td class="ge-val">${geObjPreview(obj)}</td>
            <td class="ge-act"><div class="ge-resizer" onmousedown="geStartResize(event, this)"></div><button type="button" class="ge-btn ge-btn-move" onclick="geMoveItem(this,-1)" title="Move up">\u2191</button><button type="button" class="ge-btn ge-btn-move" onclick="geMoveItem(this,1)" title="Move down">\u2193</button><button type="button" class="ge-btn ge-btn-del" onclick="geDelItem(this)">Delete</button></td>
        </tr>`;
        html += `<tr class="ge-section-body" data-row-id="${rowId}">
            <td colspan="4" class="ge-nest-content" id="${foldId}">${nestedHtml}</td>
        </tr>`;
        return html;
    }

    // Scalar or relation — single row
    let valHtml;
    if (isRelationArr) {
        valHtml = await geRelation({...prop, is_array: false}, value, path);
    } else {
        valHtml = await geInput({...prop, is_array: false}, value, path);
    }
    return `<tr class="ge-arr-row" data-idx="${idx}" data-row-id="${rowId}">
        <td class="ge-indent"><div class="ge-resizer" onmousedown="geStartResize(event, this)"></div></td>
        <td class="ge-idx"><span class="idx">[${idx}]</span><div class="ge-resizer" onmousedown="geStartResize(event, this)"></div></td>
        <td class="ge-val">${valHtml}</td>
        <td class="ge-act"><div class="ge-resizer" onmousedown="geStartResize(event, this)"></div><button type="button" class="ge-btn ge-btn-move" onclick="geMoveItem(this,-1)" title="Move up">\u2191</button><button type="button" class="ge-btn ge-btn-move" onclick="geMoveItem(this,1)" title="Move down">\u2193</button><button type="button" class="ge-btn ge-btn-del" onclick="geDelItem(this)">Delete</button></td>
    </tr>`;
}

// =====================================================================
// ASSOC ARRAY - key→value map editor
// =====================================================================

/**
 * Render assoc array as key→value rows.
 * Each entry: | indent | key input | value editor | actions |
 */
async function geAssocArray(prop, obj, path, lvl) {
    const dt = prop.data_type || 'string';
    const cls = elementStore.getCls(prop);
    const entries = Object.entries(obj || {});
    const level = lvl + 1;

    let html = `<table class="ge ge-assoc-tbl" data-assoc-path="${path}" data-type="${dt}" data-class="${cls || ''}" data-level="${level}">${elementStore.getColgroup()}<tbody>`;
    for (const [key, val] of entries) {
        html += await geAssocItem(prop, key, val, path, lvl, cls);
    }
    html += `</tbody></table>`;
    return html;
}

/**
 * Render a single assoc item row.
 * For object values with class: fold header + nested props.
 * For scalars/relations: single row with key + value.
 */
async function geAssocItem(prop, key, value, basePath, lvl, cls) {
    const dt = prop.data_type || 'string';
    const itemPath = `${basePath}.${key}`;
    const rowId = `asc_${++_geArrRowId}`;

    if (dt === 'object' && cls) {
        // Typed object value — foldable nested editor
        const foldId = `asf_${_geArrRowId}`;
        const obj = typeof value === 'object' && value !== null ? value : {};
        const meta = await getClassMeta(cls);
        let nestedHtml;
        if (meta) {
            nestedHtml = await elementStore.getPropsTable(meta, obj, itemPath, lvl + 1, cls);
        } else {
            nestedHtml = `<textarea class="code" data-path="${itemPath}" data-type="json" style="width:100%">${esc(JSON.stringify(obj, null, 2))}</textarea>`;
        }

        let html = `<tr class="ge-arr-row ge-section-hdr ge-assoc-row" data-assoc-key="${esc(key)}" data-row-id="${rowId}">
            <td class="ge-indent"><div class="ge-resizer" onmousedown="geStartResize(event, this)"></div></td>
            <td class="ge-idx"><button type="button" class="ge-fold" onclick="elementStore.fold(this)" data-target="${foldId}">\u2212</button> <input type="text" class="ge-assoc-key" value="${esc(key)}" data-orig-key="${esc(key)}" onchange="geAssocKeyChange(this,'${esc(basePath)}'"><div class="ge-resizer" onmousedown="geStartResize(event, this)"></div></td>
            <td class="ge-val">${geObjPreview(obj)}</td>
            <td class="ge-act"><div class="ge-resizer" onmousedown="geStartResize(event, this)"></div><button type="button" class="ge-btn ge-btn-del" onclick="geDelAssocItem(this,'${esc(basePath)}')">Delete</button></td>
        </tr>`;
        html += `<tr class="ge-section-body ge-assoc-row" data-row-id="${rowId}">
            <td colspan="4" class="ge-nest-content" id="${foldId}">${nestedHtml}</td>
        </tr>`;
        return html;
    }

    // Scalar or relation — single row with key input + value input
    const scalarProp = {...prop, is_array: false};
    let valHtml;
    if (dt === 'relation') {
        valHtml = await geRelation(scalarProp, value, itemPath);
    } else {
        valHtml = await geInput(scalarProp, value, itemPath);
    }

    return `<tr class="ge-arr-row ge-assoc-row" data-assoc-key="${esc(key)}" data-row-id="${rowId}">
        <td class="ge-indent"><div class="ge-resizer" onmousedown="geStartResize(event, this)"></div></td>
        <td class="ge-idx"><input type="text" class="ge-assoc-key" value="${esc(key)}" data-orig-key="${esc(key)}" onchange="geAssocKeyChange(this,'${esc(basePath)}')"><div class="ge-resizer" onmousedown="geStartResize(event, this)"></div></td>
        <td class="ge-val">${valHtml}</td>
        <td class="ge-act"><div class="ge-resizer" onmousedown="geStartResize(event, this)"></div><button type="button" class="ge-btn ge-btn-del" onclick="geDelAssocItem(this,'${esc(basePath)}')">Delete</button></td>
    </tr>`;
}

/**
 * Add new assoc item — prompts for key name
 */
async function geAddAssocItem(basePath, dt, cls) {
    const table = document.querySelector(`[data-assoc-path="${basePath}"]`);
    if (!table) return;
    const tbody = table.querySelector('tbody');

    // Generate unique key
    let keyNum = 1;
    const existing = new Set();
    tbody.querySelectorAll('.ge-assoc-key').forEach(k => existing.add(k.value));
    let newKey = `key_${keyNum}`;
    while (existing.has(newKey)) newKey = `key_${++keyNum}`;

    const prop = { data_type: dt, is_array: false, object_class_id: cls ? [cls] : undefined };
    const defaultVal = dt === 'object' && cls ? {} : (dt === 'boolean' ? false : (dt === 'integer' || dt === 'float' ? 0 : ''));
    const rowHtml = await geAssocItem(prop, newKey, defaultVal, basePath, 0, cls);
    tbody.insertAdjacentHTML('beforeend', rowHtml);

    // Update count in section header
    const countEl = table.closest('.ge-nest-content')?.previousElementSibling?.querySelector('.count');
    if (countEl) countEl.textContent = `{${tbody.querySelectorAll('.ge-assoc-row:not(.ge-section-body)').length}}`;

    const newRow = tbody.lastElementChild;
    _geUnfoldAndFocus(table, newRow);
}

/**
 * Handle assoc key rename — update data-path on all child inputs
 */
function geAssocKeyChange(input, basePath) {
    const newKey = input.value.trim();
    const origKey = input.dataset.origKey;
    if (!newKey || newKey === origKey) { input.value = origKey; return; }

    // Check for duplicates
    const table = input.closest('.ge-assoc-tbl');
    const keys = [];
    table.querySelectorAll('.ge-assoc-key').forEach(k => { if (k !== input) keys.push(k.value); });
    if (keys.includes(newKey)) { input.value = origKey; return; }

    const row = input.closest('.ge-arr-row');
    const rowId = row.dataset.rowId;
    const oldPath = `${basePath}.${origKey}`;
    const newPath = `${basePath}.${newKey}`;

    // Update data-path on all child inputs in this row (and its body row)
    const updatePaths = (el) => {
        el.querySelectorAll('[data-path]').forEach(inp => {
            const p = inp.dataset.path;
            if (p.startsWith(oldPath)) {
                inp.dataset.path = newPath + p.slice(oldPath.length);
            }
        });
    };
    updatePaths(row);
    // Find matching body row
    const bodyRow = table.querySelector(`tr.ge-section-body[data-row-id="${rowId}"]`);
    if (bodyRow) updatePaths(bodyRow);

    input.dataset.origKey = newKey;
    row.dataset.assocKey = newKey;
}

/**
 * Delete assoc item
 */
function geDelAssocItem(btn, basePath) {
    const row = btn.closest('.ge-arr-row');
    const table = row.closest('.ge-assoc-tbl');
    const rowId = row.dataset.rowId;

    // Remove body row if exists
    const bodyRow = table.querySelector(`tr.ge-section-body[data-row-id="${rowId}"]`);
    if (bodyRow) bodyRow.remove();
    row.remove();

    // Update count
    const countEl = table.closest('.ge-nest-content')?.previousElementSibling?.querySelector('.count');
    if (countEl) countEl.textContent = `{${table.querySelectorAll('.ge-assoc-row:not(.ge-section-body)').length}}`;
}

// =====================================================================
// Fold/Unfold all child elements in a section
// =====================================================================
function geFoldAllToggle(triggerBtn, foldId) {
    const container = document.getElementById(foldId);
    if (!container) return;
    // If any child is expanded, collapse all. Otherwise expand all.
    const foldBtns = container.querySelectorAll('.ge-fold');
    const anyExpanded = Array.from(foldBtns).some(btn => {
        const c = document.getElementById(btn.dataset.target);
        return c && !c.classList.contains('collapsed');
    });
    foldBtns.forEach(btn => {
        const content = document.getElementById(btn.dataset.target);
        if (!content) return;
        if (anyExpanded) {
            content.classList.add('collapsed');
            btn.classList.add('collapsed');
            btn.textContent = '+';
        } else {
            content.classList.remove('collapsed');
            btn.classList.remove('collapsed');
            btn.textContent = '\u2212';
        }
    });
    triggerBtn.textContent = anyExpanded ? '⊞' : '⊟';
}

// =====================================================================
// Unfold + focus helper — used by all +Add / +Key actions
// =====================================================================
function _geUnfoldAndFocus(table, newRow) {
    // Find the parent fold container (ge-nest-content) that wraps this table
    const nestContent = table.closest('.ge-nest-content');
    if (nestContent && nestContent.classList.contains('collapsed')) {
        // Collapsed — find the fold button and expand
        const foldBtn = document.querySelector(`.ge-fold[data-target="${nestContent.id}"]`);
        if (foldBtn) elementStore.fold(foldBtn);
    }
    // Focus on the first focusable input in the new row
    if (newRow) {
        const focusable = newRow.querySelector('input, select, textarea');
        if (focusable) {
            setTimeout(() => focusable.focus(), 0);
        }
    }
}

// =====================================================================
// Column resizing — syncs all tables at the same data-level
// =====================================================================
let geResizing = null;
let geResizeStartX = 0;
let geResizeStartWidth = 0;

function geStartResize(e, resizer) {
    e.preventDefault();
    const cell = resizer.parentElement;
    const table = cell.closest('.ge');
    const level = table.dataset.level || '0';
    const colClass = cell.classList.contains('ge-indent') ? 'ge-indent'
                   : cell.classList.contains('ge-idx') ? 'ge-idx'
                   : cell.classList.contains('ge-act') ? 'ge-act' : 'ge-key';
    // Map cell class to colgroup col index: indent=0, key/idx=1, val=2, act=3
    const colIdx = colClass === 'ge-indent' ? 0
                 : (colClass === 'ge-key' || colClass === 'ge-idx') ? 1
                 : colClass === 'ge-act' ? 3 : 2;
    const invertDir = colClass === 'ge-act'; // ge-act resizer is on its left edge
    const root = table.closest('.modal-body') || table.closest('.tab-pane') || document;
    geResizing = { table, cell, level, colClass, colIdx, invertDir, root };
    geResizeStartX = e.pageX;
    // Read initial width from the <col> element
    const col = table.querySelector('colgroup')?.children[colIdx];
    geResizeStartWidth = col ? parseFloat(getComputedStyle(col).width) || cell.offsetWidth : cell.offsetWidth;
    resizer.classList.add('active');
    // Highlight column across synced tables
    const selector = (colClass === 'ge-act') ? '.ge' : `.ge[data-level="${level}"]`;
    root.querySelectorAll(selector).forEach(t => {
        t.classList.add('ge-resizing');
        t.dataset.resizeCol = String(colIdx);
    });
    document.addEventListener('mousemove', geDoResize);
    document.addEventListener('mouseup', geStopResize);
}

function geDoResize(e) {
    if (!geResizing) return;
    const rawDiff = e.pageX - geResizeStartX;
    const diff = geResizing.invertDir ? -rawDiff : rawDiff;
    const minW = geResizing.colClass === 'ge-act' ? 40 : geResizing.colClass === 'ge-indent' ? 0 : 80;
    const newWidth = Math.max(minW, geResizeStartWidth + diff);
    const { level, colClass, colIdx, root } = geResizing;
    // ge-act syncs across ALL levels; ge-key/ge-idx sync within same level
    const selector = (colClass === 'ge-act') ? '.ge' : `.ge[data-level="${level}"]`;
    root.querySelectorAll(selector).forEach(t => {
        const col = t.querySelector('colgroup')?.children[colIdx];
        if (col) col.style.width = newWidth + 'px';
    });
}

function geStopResize() {
    if (!geResizing) return;
    const { root } = geResizing;
    root.querySelectorAll('.ge-resizer.active').forEach(r => r.classList.remove('active'));
    // Remove column highlights
    root.querySelectorAll('.ge-resizing').forEach(t => {
        t.classList.remove('ge-resizing');
        delete t.dataset.resizeCol;
    });
    geResizing = null;
    document.removeEventListener('mousemove', geDoResize);
    document.removeEventListener('mouseup', geStopResize);
}

/** Get child classes of a base class (classes with extends_id = baseClassId) */
async function _geGetChildClasses(baseClassId) {
    try {
        const allClasses = allClassesList || await api('GET', '/class');
        return allClasses.filter(c => c.extends_id === baseClassId);
    } catch (_) {
        return [];
    }
}

// Add array item (classed arrays)
async function geAddItem(path) {
    const table = document.querySelector(`[data-arr-path="${path}"].ge-arr-tbl`);
    if (!table) return;
    const tbody = table.querySelector('tbody');
    const dt = table.dataset.type;
    const cls = table.dataset.class;
    const lvl = parseInt(table.dataset.level || '1') - 1;

    const rows = tbody.querySelectorAll(':scope > tr.ge-arr-row');
    const idx = rows.length;
    const newPath = `${path}[${idx}]`;

    const itemProp = { data_type: dt, object_class_id: cls || null };
    const isNestedObjArr = dt === 'object' && cls;
    const isRelationArr = dt === 'relation';
    const defaultVal = isNestedObjArr ? {} : (dt === 'boolean' ? false : '');

    const html = await geArrayItem(itemProp, defaultVal, newPath, idx, lvl, isNestedObjArr, isRelationArr, cls);
    tbody.insertAdjacentHTML('beforeend', html);

    // Initialize Select2 on any new class-select elements
    const newRow = tbody.querySelector(`tr.ge-arr-row[data-idx="${idx}"]`);
    if (newRow) {
        const bodyRowId = newRow.dataset.rowId;
        const bodyRow = tbody.querySelector(`tr.ge-section-body[data-row-id="${bodyRowId}"]`);
        const scope = bodyRow || newRow;
        $(scope).find('.ge-class-select').select2({ width: '100%', placeholder: 'Select...', allowClear: true });
    }

    const countSpan = document.querySelector(`button[onclick="geAddItem('${path}')"]`)?.parentElement?.querySelector('.count');
    if (countSpan) countSpan.textContent = idx + 1;

    // Unfold the section if collapsed, then focus on the new item
    _geUnfoldAndFocus(table, newRow);
}

// Delete array item (classed arrays)
function geDelItem(btn) {
    const row = btn.closest('tr.ge-arr-row');
    const tbody = row.closest('tbody');
    const table = row.closest('.ge-arr-tbl');
    const rowId = row.dataset.rowId;

    // Remove body row if exists
    const bodyRow = tbody.querySelector(`:scope > tr.ge-section-body[data-row-id="${rowId}"]`);
    if (bodyRow) bodyRow.remove();
    row.remove();

    // Re-index remaining rows
    geReindexItems(table);
}

// Move array item up or down
function geMoveItem(btn, direction) {
    const row = btn.closest('tr.ge-arr-row');
    const tbody = row.closest('tbody');
    const table = row.closest('.ge-arr-tbl');
    const items = Array.from(tbody.querySelectorAll(':scope > tr.ge-arr-row'));
    const idx = items.indexOf(row);
    const newIdx = idx + direction;

    if (newIdx < 0 || newIdx >= items.length) return;

    const rowId = row.dataset.rowId;
    const bodyRow = tbody.querySelector(`:scope > tr.ge-section-body[data-row-id="${rowId}"]`);

    const targetRow = items[newIdx];
    const targetRowId = targetRow.dataset.rowId;
    const targetBodyRow = tbody.querySelector(`:scope > tr.ge-section-body[data-row-id="${targetRowId}"]`);

    if (direction === -1) {
        // Move up: insert before target's header row
        tbody.insertBefore(row, targetRow);
        if (bodyRow) tbody.insertBefore(bodyRow, row.nextSibling);
    } else {
        // Move down: insert after target's last row
        const afterEl = targetBodyRow || targetRow;
        tbody.insertBefore(row, afterEl.nextSibling);
        if (bodyRow) tbody.insertBefore(bodyRow, row.nextSibling);
    }

    geReindexItems(table);
}

// Re-index all array items (paths, index badges, display_order, count)
function geReindexItems(table) {
    const tbody = table.querySelector('tbody');
    const path = table.dataset.arrPath;
    const rows = tbody.querySelectorAll(':scope > tr.ge-arr-row');
    rows.forEach((el, i) => {
        el.dataset.idx = i;
        const idxSpan = el.querySelector('.idx');
        if (idxSpan) idxSpan.textContent = `[${i}]`;
        // Update paths in this row
        el.querySelectorAll('[data-path]').forEach(input => {
            input.dataset.path = input.dataset.path.replace(/\[\d+\]/, `[${i}]`);
        });
        // Update paths in associated body row
        const rid = el.dataset.rowId;
        const bRow = tbody.querySelector(`:scope > tr.ge-section-body[data-row-id="${rid}"]`);
        if (bRow) {
            bRow.querySelectorAll('[data-path]').forEach(input => {
                input.dataset.path = input.dataset.path.replace(/\[\d+\]/, `[${i}]`);
            });
            bRow.querySelectorAll('table[data-path]').forEach(t => {
                t.dataset.path = t.dataset.path.replace(/\[\d+\]/, `[${i}]`);
            });
            // Auto-update display_order field if present
            const displayOrderInput = bRow.querySelector('[data-path$=".display_order"]');
            if (displayOrderInput) displayOrderInput.value = i + 1;
        }
    });

    const countSpan = document.querySelector(`button[onclick="geAddItem('${path}')"]`)?.parentElement?.querySelector('.count');
    if (countSpan) countSpan.textContent = rows.length;
}

// =====================================================================
// Typed object — shared helpers
// =====================================================================

/**
 * Load objects of a class, with filter_by support from prop.options.
 * Used by both typed-object selects and relation fields.
 *
 * @param cls   - Class ID to load objects from
 * @param prop  - Prop definition (may have options.filter_by)
 * @param path  - Current field path (e.g. "props[0].editor") — used to resolve
 *                filter_by.source relative to the current object context.
 *                Falls back to absolute DOM query if path is not provided.
 */
async function _geLoadClassObjects(cls, prop, path) {
    try {
        if (cls === '@class') return allClassesList || [];
        const objects = await api('GET', `/store/${cls}`) || [];
        const filterBy = prop?.options?.filter_by;
        if (!filterBy || !filterBy.field || !filterBy.source) return objects;

        // Resolve source value: prefer context-relative path over absolute DOM query.
        // If path = "props[0].editor", base = "props[0]", source path = "props[0].data_type"
        let sourceVal = '';
        if (path) {
            const lastDot = path.lastIndexOf('.');
            const lastBracket = path.lastIndexOf('[');
            const lastSep = Math.max(lastDot, lastBracket > -1 ? path.lastIndexOf(']') + 1 : -1);
            const basePath = lastSep > 0 ? path.slice(0, lastDot > -1 ? lastDot : lastSep) : '';
            const sourcePath = basePath ? `${basePath}.${filterBy.source}` : filterBy.source;
            // Try context-relative first, then absolute
            const sourceEl = document.querySelector(`[data-path="${sourcePath}"]`)
                          || document.querySelector(`[data-path="${filterBy.source}"]`);
            sourceVal = sourceEl ? (sourceEl.value || '') : '';
        } else {
            const sourceEl = document.querySelector(`[data-path="${filterBy.source}"]`);
            sourceVal = sourceEl ? (sourceEl.value || '') : '';
        }

        if (!sourceVal) return objects;
        return objects.filter(o => {
            const fieldVal = o[filterBy.field];
            if (Array.isArray(fieldVal)) return fieldVal.includes(sourceVal);
            return fieldVal === sourceVal;
        });
    } catch (_) {
        return [];
    }
}

/** Build <option> tags from an array of objects */
function _geBuildOptions(objects, selectedId) {
    return objects.map(o => {
        const id = o.id;
        const label = o.name || o.label || o.key || id;
        const selected = selectedId === id ? 'selected' : '';
        return `<option value="${esc(id)}" ${selected}>${esc(id)}${label !== id ? ` (${esc(label)})` : ''}</option>`;
    }).join('');
}

/**
 * Re-render a typed object field with a new value.
 * Shared by geSelectTypedObj, geCreateTypedObj, geNullTypedObj.
 */
async function _geReplaceTypedObj(path, newValue) {
    const reg = elementStore._typedObjRegistry[path];
    if (!reg) return;
    const row = document.querySelector(`tr[data-typed-obj="${path}"]`);
    if (!row) return;

    const { prop, lvl } = reg;
    const tbody = row.closest('tbody');
    const rows = tbody.querySelectorAll(`:scope > tr[data-typed-obj="${path}"]`);
    const lastRow = rows[rows.length - 1];
    const nextSibling = lastRow.nextElementSibling;
    rows.forEach(r => r.remove());

    const newHtml = await geField(prop, newValue, path, lvl);
    if (nextSibling) {
        nextSibling.insertAdjacentHTML('beforebegin', newHtml);
    } else {
        tbody.insertAdjacentHTML('beforeend', newHtml);
    }
    tbody.querySelectorAll(`tr[data-typed-obj="${path}"] .ge-class-select`).forEach(el => {
        $(el).select2({ width: '100%', placeholder: 'Select...', allowClear: true });
    });
}

// =====================================================================
// Typed object Create / Select / Null
// =====================================================================

/** Select a stored object by ID → load and render inline */
async function geSelectTypedObj(path, objectId) {
    if (!objectId) return;
    const reg = elementStore._typedObjRegistry[path];
    if (!reg) return;
    const cls = elementStore.getCls(reg.prop);
    try {
        const obj = await api('GET', `/store/${cls}/${objectId}`);
        if (obj) _geReplaceTypedObj(path, obj);
    } catch (_) {}
}

/** Create new empty object of the given class */
async function geCreateTypedObj(path, classIdArg) {
    const reg = elementStore._typedObjRegistry[path];
    if (!reg) return;
    const row = document.querySelector(`tr[data-typed-obj="${path}"]`);
    const sel = row?.querySelector('.ge-obj-cls-sel');
    const cls = classIdArg || (sel ? sel.value : null);
    if (!cls) return;
    _geReplaceTypedObj(path, { _class_id: cls });
}

/** Set typed object to null */
async function geNullTypedObj(path) {
    _geReplaceTypedObj(path, null);
}

// Browse relation
async function geBrowse(path, classId) {
    try {
        const objects = await api('GET', `/store/${classId}`);
        if (!objects?.length) { showToast(`No ${classId} objects found`, 'error'); return; }
        const options = objects.map(o => `${o.id} - ${o.name || o.id}`).join('\n');
        const selected = prompt(`Select ${classId}:\n\nAvailable:\n${options}`);
        if (selected) {
            const id = selected.split(' - ')[0].trim();
            const input = document.querySelector(`[data-path="${path}"]`);
            if (input) input.value = id;
        }
    } catch (err) { showToast(err.message, 'error'); }
}

// =====================================================================
// FREEFORM OBJECT EDITOR (unclassed objects — dynamic key-value pairs)
// Same recursive <table class="ge"> layout as classed objects.
// Type is detected from data values and changeable via dropdown.
// =====================================================================

let _geFreeId = 0;
function geFreeNextId(prefix) { return `${prefix}${++_geFreeId}`; }

const GE_FREE_TYPES = ['string', 'number', 'boolean', 'object', 'array'];

/** Detect type from a JS value */
function geFreeDetectType(value) {
    if (value === null || value === undefined) return 'string';
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'number') return 'number';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'object') return 'object';
    return 'string';
}

/** Build scalar value input HTML */
function geFreeScalarHtml(type, value) {
    switch (type) {
        case 'boolean': {
            const checked = (value === true || value === 'true') ? 'checked' : '';
            return `<label class="ge-toggle"><input type="checkbox" class="ge-free-val" data-free-type="boolean" ${checked}><span class="ge-toggle-label">${checked ? 'Yes' : 'No'}</span></label>`;
        }
        case 'number':
            return `<input type="number" class="ge-free-val" data-free-type="number" value="${esc(String(value ?? ''))}" step="any">`;
        default:
            return `<input type="text" class="ge-free-val" data-free-type="string" value="${esc(String(value ?? ''))}">`;
    }
}

/** Build the type <select> options */
function geFreeTypeOpts(selected) {
    return GE_FREE_TYPES.map(t =>
        `<option value="${t}" ${t === selected ? 'selected' : ''}>${t}</option>`
    ).join('');
}

/**
 * Render a freeform object as <table class="ge">
 */
function geFreeObject(obj, path, lvl) {
    const tableId = geFreeNextId('gft_');
    const keys = Object.keys(obj);
    let html = `<table class="ge ge-free-obj" data-path="${path}" data-free-id="${tableId}" data-level="${lvl}">${elementStore.getColgroup()}<tbody>`;
    for (const key of keys) {
        html += geFreeObjectRow(key, obj[key], lvl);
    }
    html += `</tbody></table>`;
    return html;
}

/**
 * Render one key-value entry. Returns 1 <tr> for scalars, 2 <tr>s for object/array.
 */
function geFreeObjectRow(key, value, lvl) {
    const type = geFreeDetectType(value);
    const rowId = geFreeNextId('gfr_');

    if (type === 'object') {
        return geFreeObjectRowNested(key, value, lvl, rowId, type);
    }
    if (type === 'array') {
        return geFreeArrayRowNested(key, value, lvl, rowId);
    }
    // Scalar row — 4 columns: indent | key | val | act
    return `<tr class="ge-free-row" data-row-id="${rowId}">
        <td class="ge-indent"><div class="ge-resizer" onmousedown="geStartResize(event, this)"></div></td>
        <td class="ge-key">
            <input type="text" class="ge-free-key" value="${esc(key)}" placeholder="key">
            <select class="ge-free-type" onchange="geFreeTypeChange(this)">${geFreeTypeOpts(type)}</select>
            <div class="ge-resizer" onmousedown="geStartResize(event, this)"></div>
        </td>
        <td class="ge-val">${geFreeScalarHtml(type, value)}</td>
        <td class="ge-act"><div class="ge-resizer" onmousedown="geStartResize(event, this)"></div><button type="button" class="ge-btn ge-btn-del" onclick="geDelFreeKey(this)" title="Remove key">&times;</button></td>
    </tr>`;
}

/** Render object-type row: section header + section body with recursive freeform table */
function geFreeObjectRowNested(key, value, lvl, rowId, type) {
    const foldId = geFreeNextId('gff_');
    const obj = typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {};
    const keyCount = Object.keys(obj).length;
    const foldDis = keyCount === 0 ? ' disabled' : '';

    let html = `<tr class="ge-free-row ge-section-hdr" data-row-id="${rowId}">
        <td class="ge-indent"><div class="ge-resizer" onmousedown="geStartResize(event, this)"></div></td>
        <td class="ge-key">
            <button type="button" class="ge-fold"${foldDis} onclick="elementStore.fold(this)" data-target="${foldId}">\u2212</button>
            <input type="text" class="ge-free-key" value="${esc(key)}" placeholder="key">
            <select class="ge-free-type" onchange="geFreeTypeChange(this)">${geFreeTypeOpts(type)}</select>
            <div class="ge-resizer" onmousedown="geStartResize(event, this)"></div>
        </td>
        <td class="ge-val">
            <span class="ge-obj-inline"><span class="cls">{${keyCount}}</span>
            <button type="button" class="ge-btn ge-btn-add" onclick="geAddFreeKeyNested(this)">+ Key</button></span>
        </td>
        <td class="ge-act"><div class="ge-resizer" onmousedown="geStartResize(event, this)"></div><button type="button" class="ge-btn ge-btn-del" onclick="geDelFreeKey(this)" title="Remove key">&times;</button></td>
    </tr>`;
    html += `<tr class="ge-section-body" data-row-id="${rowId}">
        <td colspan="4" class="ge-nest-content" id="${foldId}">
            ${geFreeObject(obj, '_nested', (lvl || 0) + 1)}
        </td>
    </tr>`;
    return html;
}

/** Render array-type row: section header + section body with freeform array items */
function geFreeArrayRowNested(key, value, lvl, rowId) {
    const foldId = geFreeNextId('gff_');
    const arr = Array.isArray(value) ? value : [];
    const arrId = geFreeNextId('gfa_');

    let html = `<tr class="ge-free-row ge-section-hdr" data-row-id="${rowId}">
        <td class="ge-indent"><div class="ge-resizer" onmousedown="geStartResize(event, this)"></div></td>
        <td class="ge-key">
            <button type="button" class="ge-fold" onclick="elementStore.fold(this)" data-target="${foldId}">\u2212</button>
            <input type="text" class="ge-free-key" value="${esc(key)}" placeholder="key">
            <select class="ge-free-type" onchange="geFreeTypeChange(this)">${geFreeTypeOpts('array')}</select>
            <div class="ge-resizer" onmousedown="geStartResize(event, this)"></div>
        </td>
        <td class="ge-val">
            <span class="ge-arr-inline"><span class="count">${arr.length}</span>
            <button type="button" class="ge-btn ge-btn-add" onclick="geAddFreeArrItem('${arrId}')">+ Add</button></span>
        </td>
        <td class="ge-act"><div class="ge-resizer" onmousedown="geStartResize(event, this)"></div><button type="button" class="ge-btn ge-btn-del" onclick="geDelFreeKey(this)" title="Remove key">&times;</button></td>
    </tr>`;
    html += `<tr class="ge-section-body" data-row-id="${rowId}">
        <td colspan="4" class="ge-nest-content" id="${foldId}">
            ${geFreeArray(arr, arrId, (lvl || 0) + 1)}
        </td>
    </tr>`;
    return html;
}

/**
 * Render a freeform array as 4-column table (matching classed array layout):
 * | ge-indent (30px) | ge-idx (resizable) | ge-val (rest) | ge-act (auto) |
 */
function geFreeArray(arr, arrId, lvl) {
    let html = `<table class="ge ge-arr-tbl ge-free-arr" data-free-arr-id="${arrId}" data-level="${lvl}">${elementStore.getColgroup()}<tbody>`;
    for (let i = 0; i < arr.length; i++) {
        html += geFreeArrayItem(arr[i], i, lvl);
    }
    html += `</tbody></table>`;
    return html;
}

/** Render one freeform array item as 4-column <tr> rows. Scalars = 1 row, objects/arrays = 2 rows (header+body) */
function geFreeArrayItem(value, idx, lvl) {
    const type = geFreeDetectType(value);
    const rowId = geFreeNextId('gfar_');

    if (type === 'object') {
        const foldId = geFreeNextId('gff_');
        const obj = typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {};
        const keyCount = Object.keys(obj).length;
        const foldDis = keyCount === 0 ? ' disabled' : '';
        let html = `<tr class="ge-free-arr-row ge-section-hdr" data-idx="${idx}" data-row-id="${rowId}">
            <td class="ge-indent"><div class="ge-resizer" onmousedown="geStartResize(event, this)"></div></td>
            <td class="ge-idx"><button type="button" class="ge-fold"${foldDis} onclick="elementStore.fold(this)" data-target="${foldId}">\u2212</button> <span class="idx">[${idx}]</span> <select class="ge-free-item-type" onchange="geFreeArrItemTypeChange(this)">${geFreeTypeOpts(type)}</select><div class="ge-resizer" onmousedown="geStartResize(event, this)"></div></td>
            <td class="ge-val">
                <span class="ge-obj-inline"><span class="cls">{${keyCount}}</span>
                <button type="button" class="ge-btn ge-btn-add" onclick="geAddFreeKeyNested(this)">+ Key</button></span>
            </td>
            <td class="ge-act"><div class="ge-resizer" onmousedown="geStartResize(event, this)"></div><button type="button" class="ge-btn ge-btn-del" onclick="geDelFreeArrItem(this)">Delete</button></td>
        </tr>`;
        html += `<tr class="ge-section-body" data-row-id="${rowId}">
            <td colspan="4" class="ge-nest-content" id="${foldId}">
                ${geFreeObject(obj, '_nested', lvl + 1)}
            </td>
        </tr>`;
        return html;
    }

    if (type === 'array') {
        const foldId = geFreeNextId('gff_');
        const innerArr = Array.isArray(value) ? value : [];
        const innerArrId = geFreeNextId('gfa_');
        let html = `<tr class="ge-free-arr-row ge-section-hdr" data-idx="${idx}" data-row-id="${rowId}">
            <td class="ge-indent"><div class="ge-resizer" onmousedown="geStartResize(event, this)"></div></td>
            <td class="ge-idx"><button type="button" class="ge-fold" onclick="elementStore.fold(this)" data-target="${foldId}">\u2212</button> <span class="idx">[${idx}]</span> <select class="ge-free-item-type" onchange="geFreeArrItemTypeChange(this)">${geFreeTypeOpts(type)}</select><div class="ge-resizer" onmousedown="geStartResize(event, this)"></div></td>
            <td class="ge-val">
                <span class="ge-arr-inline"><span class="count">${innerArr.length}</span>
                <button type="button" class="ge-btn ge-btn-add" onclick="geAddFreeArrItemNested(this)">+ Add</button></span>
            </td>
            <td class="ge-act"><div class="ge-resizer" onmousedown="geStartResize(event, this)"></div><button type="button" class="ge-btn ge-btn-del" onclick="geDelFreeArrItem(this)">Delete</button></td>
        </tr>`;
        html += `<tr class="ge-section-body" data-row-id="${rowId}">
            <td colspan="4" class="ge-nest-content" id="${foldId}">
                ${geFreeArray(innerArr, innerArrId, lvl + 1)}
            </td>
        </tr>`;
        return html;
    }

    // Scalar: single row with 4 columns
    return `<tr class="ge-free-arr-row" data-idx="${idx}" data-row-id="${rowId}">
        <td class="ge-indent"><div class="ge-resizer" onmousedown="geStartResize(event, this)"></div></td>
        <td class="ge-idx"><span class="idx">[${idx}]</span> <select class="ge-free-item-type" onchange="geFreeArrItemTypeChange(this)">${geFreeTypeOpts(type)}</select><div class="ge-resizer" onmousedown="geStartResize(event, this)"></div></td>
        <td class="ge-val">${geFreeScalarHtml(type, value)}</td>
        <td class="ge-act"><div class="ge-resizer" onmousedown="geStartResize(event, this)"></div><button type="button" class="ge-btn ge-btn-del" onclick="geDelFreeArrItem(this)">Delete</button></td>
    </tr>`;
}

// ----- Type change handlers -----

/** Type change on a freeform object key row */
function geFreeTypeChange(select) {
    const row = select.closest('tr.ge-free-row');
    const tbody = row.closest('tbody');
    const rowId = row.dataset.rowId;
    const key = row.querySelector('.ge-free-key')?.value || '';
    const lvl = parseInt(row.closest('.ge-free-obj')?.dataset.level || '0');

    // Read current value to attempt conversion
    const oldType = _geFreeReadRowType(row, rowId, tbody);
    const oldVal = _geFreeReadRowValue(row, rowId, tbody, oldType);
    const newType = select.value;
    const converted = _geFreeConvert(oldVal, oldType, newType);

    // Find next sibling before removing (to preserve position)
    const oldBody = tbody.querySelector(`:scope > tr.ge-section-body[data-row-id="${rowId}"]`);
    const nextSibling = (oldBody || row).nextElementSibling;
    if (oldBody) oldBody.remove();
    row.remove();

    // Re-render and insert at same position
    const newHtml = geFreeObjectRow(key, converted, lvl);
    if (nextSibling) {
        nextSibling.insertAdjacentHTML('beforebegin', newHtml);
    } else {
        tbody.insertAdjacentHTML('beforeend', newHtml);
    }

    // Update fold state in case row count changed
    const table = tbody.closest('.ge-free-obj');
    if (table) _geFreeUpdateObjState(table);
}

/** Type change on a freeform array item row */
function geFreeArrItemTypeChange(select) {
    const row = select.closest('tr.ge-free-arr-row');
    const tbody = row.closest('tbody');
    const rowId = row.dataset.rowId;
    const idx = parseInt(row.dataset.idx || '0');
    const lvl = parseInt(row.closest('.ge-free-arr')?.dataset.level || '0');

    // Read old value
    const oldType = _geFreeReadRowType(row, rowId, tbody);
    const oldVal = _geFreeReadArrItemRowValue(row, rowId, tbody, oldType);
    const newType = select.value;
    const converted = _geFreeConvert(oldVal, oldType, newType);

    // Find next sibling before removing (to preserve position)
    const bodyRow = tbody.querySelector(`:scope > tr.ge-section-body[data-row-id="${rowId}"]`);
    const nextSibling = (bodyRow || row).nextElementSibling;
    if (bodyRow) bodyRow.remove();
    row.remove();

    // Re-render and insert at same position
    const newHtml = geFreeArrayItem(converted, idx, lvl);
    if (nextSibling) {
        nextSibling.insertAdjacentHTML('beforebegin', newHtml);
    } else {
        tbody.insertAdjacentHTML('beforeend', newHtml);
    }
}

// ----- Add / Delete -----

/** Add key to a freeform table targeted by data-path (from section header "+ Key") */
function geAddFreeKey(path) {
    const table = document.querySelector(`.ge-free-obj[data-path="${path}"]`);
    if (!table) return;
    _geFreeAddKeyToTable(table);
}

/** Add key to nested freeform table (from "+ Key" button inside a nested section) */
function geAddFreeKeyNested(btn) {
    const headerRow = btn.closest('tr.ge-section-hdr');
    const bodyRow = headerRow?.nextElementSibling;
    const table = bodyRow?.querySelector('.ge-free-obj');
    if (!table) return;
    _geFreeAddKeyToTable(table);
}

/**
 * Update fold button enabled/disabled state and key count for a freeform object table.
 * Finds the parent fold button via the ge-nest-content wrapper.
 */
function _geFreeUpdateObjState(table) {
    const tbody = table.querySelector(':scope > tbody');
    const rowCount = tbody ? tbody.querySelectorAll(':scope > .ge-free-row').length : 0;
    const nestContent = table.closest('.ge-nest-content');
    if (!nestContent || !nestContent.id) return;
    const foldBtn = document.querySelector(`.ge-fold[data-target="${nestContent.id}"]`);
    if (!foldBtn) return;
    foldBtn.disabled = rowCount === 0;
    // Update key count in parent header row
    const headerRow = foldBtn.closest('tr');
    const countSpan = headerRow?.querySelector('.cls');
    if (countSpan) countSpan.textContent = `{${rowCount}}`;
}

function _geFreeAddKeyToTable(table) {
    const tbody = table.querySelector('tbody');
    const lvl = parseInt(table.dataset.level || '0');
    const html = geFreeObjectRow('', '', lvl);
    tbody.insertAdjacentHTML('beforeend', html);
    const rows = tbody.querySelectorAll('.ge-free-row');
    const lastRow = rows[rows.length - 1];

    // Update fold state and count, then unfold and focus
    _geFreeUpdateObjState(table);
    _geUnfoldAndFocus(table, lastRow);
}

/** Delete a key row (and its section-body if present) */
function geDelFreeKey(btn) {
    const row = btn.closest('tr.ge-free-row');
    const table = row.closest('.ge-free-obj');
    const tbody = row.closest('tbody');
    const rowId = row.dataset.rowId;
    // Remove body row if exists
    const bodyRow = tbody.querySelector(`tr.ge-section-body[data-row-id="${rowId}"]`);
    if (bodyRow) bodyRow.remove();
    row.remove();
    // Update fold state and key count
    if (table) _geFreeUpdateObjState(table);
}

/** Add item to a freeform array by arrId */
function geAddFreeArrItem(arrId) {
    const table = document.querySelector(`.ge-free-arr[data-free-arr-id="${arrId}"]`);
    if (!table) return;
    _geFreeAddItemToArr(table);
}

/** Add item to nested freeform array (from "+ Add" inside a section header) */
function geAddFreeArrItemNested(btn) {
    const headerRow = btn.closest('tr.ge-section-hdr');
    const bodyRow = headerRow?.nextElementSibling;
    const table = bodyRow?.querySelector('.ge-free-arr');
    if (!table) return;
    _geFreeAddItemToArr(table);
}

function _geFreeAddItemToArr(table) {
    const tbody = table.querySelector('tbody');
    const idx = tbody.querySelectorAll(':scope > tr.ge-free-arr-row').length;
    const lvl = parseInt(table.dataset.level || '0');
    const html = geFreeArrayItem('', idx, lvl);
    tbody.insertAdjacentHTML('beforeend', html);
    _geFreeUpdateArrCount(table);

    // Unfold and focus
    const newRow = tbody.querySelector(`tr.ge-free-arr-row[data-idx="${idx}"]`);
    _geUnfoldAndFocus(table, newRow);
}

/** Delete a freeform array item row (and its section-body if present) */
function geDelFreeArrItem(btn) {
    const row = btn.closest('tr.ge-free-arr-row');
    const tbody = row.closest('tbody');
    const table = row.closest('.ge-free-arr');
    const rowId = row.dataset.rowId;
    // Remove body row if exists
    const bodyRow = tbody.querySelector(`:scope > tr.ge-section-body[data-row-id="${rowId}"]`);
    if (bodyRow) bodyRow.remove();
    row.remove();
    // Re-index remaining rows
    const rows = tbody.querySelectorAll(':scope > tr.ge-free-arr-row');
    rows.forEach((el, i) => {
        el.dataset.idx = i;
        const idxSpan = el.querySelector('.idx');
        if (idxSpan) idxSpan.textContent = `[${i}]`;
    });
    _geFreeUpdateArrCount(table);
}

/** Update the item count shown in the parent section header */
function _geFreeUpdateArrCount(table) {
    const sectionBody = table.closest('td.ge-nest-content');
    const foldId = sectionBody?.id;
    if (!foldId) return;
    const foldBtn = document.querySelector(`.ge-fold[data-target="${foldId}"]`);
    const countSpan = foldBtn?.closest('tr')?.querySelector('.count');
    if (countSpan) {
        const count = table.querySelectorAll(':scope > tbody > tr.ge-free-arr-row').length;
        countSpan.textContent = count;
    }
}

// ----- Internal helpers -----

function _geFreeReadRowType(row, rowId, tbody) {
    const bodyRow = tbody.querySelector(`tr.ge-section-body[data-row-id="${rowId}"]`);
    if (bodyRow) {
        if (bodyRow.querySelector('.ge-free-obj')) return 'object';
        if (bodyRow.querySelector('.ge-free-arr')) return 'array';
    }
    const valInput = row.querySelector('.ge-free-val');
    return valInput?.dataset.freeType || 'string';
}

function _geFreeReadRowValue(row, rowId, tbody, type) {
    if (type === 'object') {
        const bodyRow = tbody.querySelector(`tr.ge-section-body[data-row-id="${rowId}"]`);
        const table = bodyRow?.querySelector('.ge-free-obj');
        return table ? _geFreeCollectObj(table) : {};
    }
    if (type === 'array') {
        const bodyRow = tbody.querySelector(`tr.ge-section-body[data-row-id="${rowId}"]`);
        const arrDiv = bodyRow?.querySelector('.ge-free-arr');
        return arrDiv ? _geFreeCollectArr(arrDiv) : [];
    }
    const valInput = row.querySelector('.ge-free-val');
    if (!valInput) return '';
    if (type === 'boolean') return valInput.checked;
    if (type === 'number') return valInput.value ? parseFloat(valInput.value) : 0;
    return valInput.value;
}

function _geFreeReadArrItemRowValue(row, rowId, tbody, type) {
    if (type === 'object') {
        const bodyRow = tbody.querySelector(`:scope > tr.ge-section-body[data-row-id="${rowId}"]`);
        const table = bodyRow?.querySelector('.ge-free-obj');
        return table ? _geFreeCollectObj(table) : {};
    }
    if (type === 'array') {
        const bodyRow = tbody.querySelector(`:scope > tr.ge-section-body[data-row-id="${rowId}"]`);
        const arrTable = bodyRow?.querySelector('.ge-free-arr');
        return arrTable ? _geFreeCollectArr(arrTable) : [];
    }
    const valInput = row.querySelector('.ge-free-val');
    if (!valInput) return '';
    if (type === 'boolean') return valInput.checked;
    if (type === 'number') return valInput.value ? parseFloat(valInput.value) : 0;
    return valInput.value;
}

function _geFreeConvert(oldVal, oldType, newType) {
    if (newType === 'object') {
        if (oldType === 'object' && typeof oldVal === 'object' && !Array.isArray(oldVal)) return oldVal;
        return {};
    }
    if (newType === 'array') {
        if (oldType === 'array' && Array.isArray(oldVal)) return oldVal;
        return [];
    }
    if (newType === 'boolean') {
        return oldVal === true || oldVal === 'true' || oldVal === '1' || oldVal === 1;
    }
    if (newType === 'number') {
        return parseFloat(oldVal) || 0;
    }
    // string
    if (typeof oldVal === 'object') return JSON.stringify(oldVal);
    return String(oldVal ?? '');
}

/** Recursively collect data from a freeform object table */
function _geFreeCollectObj(table) {
    const obj = {};
    const tbody = table.querySelector(':scope > tbody');
    if (!tbody) return obj;
    const rows = tbody.querySelectorAll(':scope > tr.ge-free-row');
    rows.forEach(row => {
        const keyInput = row.querySelector('.ge-free-key');
        const key = keyInput?.value?.trim();
        if (!key) return;
        const rowId = row.dataset.rowId;
        const typeSelect = row.querySelector('.ge-free-type');
        const type = typeSelect?.value || 'string';

        if (type === 'object') {
            const bodyRow = tbody.querySelector(`:scope > tr.ge-section-body[data-row-id="${rowId}"]`);
            const nestedTable = bodyRow?.querySelector('.ge-free-obj');
            obj[key] = nestedTable ? _geFreeCollectObj(nestedTable) : {};
        } else if (type === 'array') {
            const bodyRow = tbody.querySelector(`:scope > tr.ge-section-body[data-row-id="${rowId}"]`);
            const arrDiv = bodyRow?.querySelector('.ge-free-arr');
            obj[key] = arrDiv ? _geFreeCollectArr(arrDiv) : [];
        } else {
            const valInput = row.querySelector('.ge-free-val');
            if (!valInput) { obj[key] = null; return; }
            if (type === 'boolean') obj[key] = valInput.checked;
            else if (type === 'number') obj[key] = valInput.value ? parseFloat(valInput.value) : null;
            else obj[key] = valInput.value;
        }
    });
    return obj;
}

/** Recursively collect data from a freeform array table */
function _geFreeCollectArr(table) {
    const result = [];
    const tbody = table.querySelector(':scope > tbody');
    if (!tbody) return result;
    const rows = tbody.querySelectorAll(':scope > tr.ge-free-arr-row');
    rows.forEach(row => {
        const rowId = row.dataset.rowId;
        const typeSelect = row.querySelector('.ge-free-item-type');
        const type = typeSelect?.value || 'string';

        if (type === 'object') {
            const bodyRow = tbody.querySelector(`:scope > tr.ge-section-body[data-row-id="${rowId}"]`);
            const nestedTable = bodyRow?.querySelector('.ge-free-obj');
            result.push(nestedTable ? _geFreeCollectObj(nestedTable) : {});
        } else if (type === 'array') {
            const bodyRow = tbody.querySelector(`:scope > tr.ge-section-body[data-row-id="${rowId}"]`);
            const innerArr = bodyRow?.querySelector('.ge-free-arr');
            result.push(innerArr ? _geFreeCollectArr(innerArr) : []);
        } else {
            const valInput = row.querySelector('.ge-free-val');
            if (!valInput) { result.push(null); return; }
            if (type === 'boolean') result.push(valInput.checked);
            else if (type === 'number') result.push(valInput.value ? parseFloat(valInput.value) : null);
            else result.push(valInput.value);
        }
    });
    return result;
}

// Collect data from generic editor (delegates to elementStore)
function geCollectData(container) {
    return elementStore.collectData(container);
}
