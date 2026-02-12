// =====================================================================
// FIELDS - Generic Editor field rendering (ge* functions)
// =====================================================================

/**
 * Render a single field (recursive)
 */
async function geField(prop, value, path, lvl) {
    const dt = prop.data_type || 'string';
    const isArr = prop.is_array;
    const cls = elementStore.getCls(prop);
    const label = elementStore.getPropLabel(prop);
    const typeLabel = elementStore.getPropType(prop);
    const req = prop.required ? '<span class="req">*</span>' : '';
    const propJson = esc(JSON.stringify(prop));
    const metaBtn = `<button type="button" class="ge-meta-btn" onclick="showPropMeta(this)" data-prop="${propJson}" title="View @prop meta">@</button>`;
    const foldId = elementStore.getFoldId(path);

    let html = '';

    if (isArr) {
        const arr = Array.isArray(value) ? value : [];
        const content = `<span class="ge-arr-inline">
            <span class="count">${arr.length}</span>
            <button type="button" class="ge-btn ge-btn-add" onclick="geAddItem('${path}')">+ Add</button>
        </span>`;
        html += elementStore.renderRow(label, req, metaBtn, typeLabel, content);
        html += elementStore.renderNestRow(lvl, foldId, await geArray(prop, value, path, lvl));
    } else if (dt === 'object' && cls) {
        const content = `<span class="ge-obj-inline"><span class="cls">${cls}</span></span>`;
        html += elementStore.renderRow(label, req, metaBtn, typeLabel, content);
        html += elementStore.renderNestRow(lvl, foldId, await geObject(prop, value, path, lvl, cls));
    } else if (dt === 'relation') {
        html += elementStore.renderRow(label, req, metaBtn, typeLabel, await geRelation(prop, value, path));
    } else {
        html += elementStore.renderRow(label, req, metaBtn, typeLabel, await geInput(prop, value, path));
    }
    return html;
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
    const ro = (prop.readonly || (prop.create_only && !elementStore._isNewObject)) ? 'disabled' : '';

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

    // Enum/select (string with values[])
    if (prop.enum_values?.length || opts.values?.length) {
        const values = prop.enum_values || opts.values || [];
        const allowCustom = opts.allow_custom || prop.enum_allow_custom;
        const optHtml = values.map(o => `<option value="${esc(o)}" ${v === o ? 'selected' : ''}>${esc(o)}</option>`).join('');

        if (allowCustom) {
            const isCustom = v && !values.includes(v);
            return `<div class="ge-combo">
                <select data-path="${path}" data-type="enum" onchange="geComboChange(this)" ${ro}>
                    <option value="">--</option>
                    ${optHtml}
                    <option value="__custom__" ${isCustom ? 'selected' : ''}>Custom...</option>
                </select>
                <input type="text" class="ge-combo-custom" value="${isCustom ? safeVal : ''}"
                       style="display:${isCustom ? 'block' : 'none'}" placeholder="Enter custom value"
                       onchange="geComboCustomChange(this, '${path}')" ${ro}>
            </div>`;
        }
        return `<select data-path="${path}" data-type="enum" ${ro}><option value="">--</option>${optHtml}</select>`;
    }

    // Number types
    if (dt === 'integer' || dt === 'number') {
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
    if (prop.editor === 'textarea' || prop.key === 'description') {
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
    const ro = (prop.readonly || (prop.create_only && !elementStore._isNewObject)) ? 'disabled' : '';

    if (!cls) {
        return `<input type="text" data-path="${path}" data-type="relation" value="${esc(v)}" placeholder="ID" ${ro}>`;
    }

    let objects = [];
    try {
        if (cls === '@class') {
            objects = allClassesList || [];
        } else {
            objects = await api('GET', `/store/${cls}`) || [];
        }
    } catch (e) {
        console.warn(`Could not load ${cls} objects:`, e);
    }

    const opts = objects.map(o => {
        const id = o.id;
        const label = o.name || o.label || o.key || id;
        const selected = v === id ? 'selected' : '';
        return `<option value="${esc(id)}" ${selected}>${esc(id)}${label !== id ? ` (${esc(label)})` : ''}</option>`;
    }).join('');

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

/**
 * Render array items
 */
async function geArray(prop, value, path, lvl) {
    const arr = Array.isArray(value) ? value : [];
    const dt = prop.data_type || 'string';
    const cls = elementStore.getCls(prop);
    const isNestedObjArr = dt === 'object' && cls;
    const isRelationArr = dt === 'relation';

    let html = `<div class="ge-arr" data-path="${path}" data-type="${dt}" data-class="${cls || ''}">`;
    for (let i = 0; i < arr.length; i++) {
        html += await geArrayItem(prop, arr[i], `${path}[${i}]`, i, lvl, isNestedObjArr, isRelationArr, cls);
    }
    if (arr.length === 0) {
        html += `<div style="padding:8px;color:#9ca3af;font-size:12px;font-style:italic">No items</div>`;
    }
    html += `</div>`;
    return html;
}

/**
 * Render single array item
 */
async function geArrayItem(prop, value, path, idx, lvl, isNestedObjArr, isRelationArr, cls) {
    const hasNested = isNestedObjArr && cls;
    let html = `<div class="ge-arr-item" data-idx="${idx}">
        <div class="ge-arr-item-hdr">
            <span class="left">
                ${hasNested ? `<button type="button" class="ge-fold" onclick="elementStore.fold(this)" title="Collapse/Expand">\u2212</button>` : ''}
                <span class="idx">[${idx}]</span>
            </span>
            <button type="button" class="ge-btn ge-btn-del" onclick="geDelItem(this)">Delete</button>
        </div>
        <div class="ge-arr-item-body">`;

    if (isNestedObjArr && cls) {
        const obj = typeof value === 'object' && value !== null ? value : {};
        const meta = await getClassMeta(cls);
        if (meta) {
            html += await elementStore.getPropsTable(meta, obj, path, lvl, cls);
        } else {
            html += `<textarea class="code" data-path="${path}" data-type="json">${esc(JSON.stringify(obj, null, 2))}</textarea>`;
        }
    } else if (isRelationArr) {
        html += await geRelation({...prop, is_array: false}, value, path);
    } else {
        html += await geInput({...prop, is_array: false}, value, path);
    }
    html += `</div></div>`;
    return html;
}

// Column resizing for GE tables
let geResizing = null;
let geResizeStartX = 0;
let geResizeStartWidth = 0;

function geStartResize(e, resizer) {
    e.preventDefault();
    const cell = resizer.parentElement;
    const table = cell.closest('.ge');
    geResizing = { table, cell };
    geResizeStartX = e.pageX;
    geResizeStartWidth = cell.offsetWidth;
    resizer.classList.add('active');
    document.addEventListener('mousemove', geDoResize);
    document.addEventListener('mouseup', geStopResize);
}

function geDoResize(e) {
    if (!geResizing) return;
    const diff = e.pageX - geResizeStartX;
    const newWidth = Math.max(80, Math.min(400, geResizeStartWidth + diff));
    geResizing.table.querySelectorAll(':scope > tbody > tr > .ge-key').forEach(cell => {
        cell.style.width = newWidth + 'px';
    });
}

function geStopResize() {
    if (!geResizing) return;
    geResizing.table.querySelectorAll('.ge-resizer.active').forEach(r => r.classList.remove('active'));
    geResizing = null;
    document.removeEventListener('mousemove', geDoResize);
    document.removeEventListener('mouseup', geStopResize);
}

// Add array item
async function geAddItem(path) {
    const container = document.querySelector(`[data-path="${path}"].ge-arr`);
    if (!container) return;
    const dt = container.dataset.type;
    const cls = container.dataset.class;
    const items = container.querySelectorAll('.ge-arr-item');
    const idx = items.length;
    const newPath = `${path}[${idx}]`;

    const emptyMsg = container.querySelector('div[style*="italic"]');
    if (emptyMsg) emptyMsg.remove();

    const itemProp = { data_type: dt, object_class_id: cls || null };
    const isNestedObjArr = dt === 'object' && cls;
    const isRelationArr = dt === 'relation';
    const defaultVal = isNestedObjArr ? {} : (dt === 'boolean' ? false : '');

    const html = await geArrayItem(itemProp, defaultVal, newPath, idx, 0, isNestedObjArr, isRelationArr, cls);
    container.insertAdjacentHTML('beforeend', html);

    // Initialize Select2 on any new class-select elements
    const newItem = container.querySelector(`.ge-arr-item[data-idx="${idx}"]`);
    if (newItem) {
        $(newItem).find('.ge-class-select').select2({ width: '100%', placeholder: 'Select...', allowClear: true });
    }

    const countSpan = document.querySelector(`button[onclick="geAddItem('${path}')"]`)?.parentElement?.querySelector('.count');
    if (countSpan) countSpan.textContent = idx + 1;
}

// Delete array item
function geDelItem(btn) {
    const item = btn.closest('.ge-arr-item');
    const container = item.closest('.ge-arr');
    const path = container.dataset.path;
    item.remove();

    const items = container.querySelectorAll('.ge-arr-item');
    items.forEach((el, i) => {
        el.dataset.idx = i;
        el.querySelector('.idx').textContent = `[${i}]`;
        el.querySelectorAll('[data-path]').forEach(input => {
            input.dataset.path = input.dataset.path.replace(/\[\d+\]/, `[${i}]`);
        });
    });

    const countSpan = document.querySelector(`button[onclick="geAddItem('${path}')"]`)?.parentElement?.querySelector('.count');
    if (countSpan) countSpan.textContent = items.length;

    if (items.length === 0) {
        container.innerHTML = `<div style="padding:8px;color:#9ca3af;font-size:12px;font-style:italic">No items</div>`;
    }
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

// Collect data from generic editor (delegates to elementStore)
function geCollectData(container) {
    return elementStore.collectData(container);
}
