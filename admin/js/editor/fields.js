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
        const valContent = `<span class="ge-arr-inline"><span class="count">${arr.length}</span></span>`;
        const actContent = `<button type="button" class="ge-btn ge-btn-add" onclick="geAddItem('${path}')">+ Add</button>`;
        html += elementStore.renderSectionHeader(label, req, metaBtn, typeLabel, foldId, valContent, actContent);
        html += elementStore.renderSectionBody(lvl, foldId, await geArray(prop, value, path, lvl));
    } else if (dt === 'object' && cls) {
        const classes = Array.isArray(prop.object_class_id) ? prop.object_class_id : [cls];
        const isMulti = classes.length > 1;
        const obj = (typeof value === 'object' && value !== null) ? value : null;
        // Register for Create/Null re-rendering
        elementStore._typedObjRegistry[path] = { prop, lvl };

        if (obj === null) {
            // NULL STATE: no fold, Create button in act
            const valContent = `<span class="ge-null">null</span><input type="hidden" data-path="${path}" data-type="json" value="null">`;
            let actContent;
            if (isMulti) {
                const clsOpts = classes.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
                actContent = `<select class="ge-obj-cls-sel">${clsOpts}</select>` +
                    `<button type="button" class="ge-btn ge-btn-add" onclick="geCreateTypedObj('${path}')">Create</button>`;
            } else {
                actContent = `<button type="button" class="ge-btn ge-btn-add" onclick="geCreateTypedObj('${path}','${esc(cls)}')">Create</button>`;
            }
            html += elementStore.renderRow(label, req, metaBtn, typeLabel, valContent, actContent)
                .replace('<tr', `<tr data-typed-obj="${esc(path)}"`);
        } else {
            // EXISTING STATE: fold + props + Null in act
            const activeClass = obj._class_id || cls;
            const valContent = `<span class="ge-obj-inline"><span class="cls">${esc(activeClass)}</span></span>`;
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

    // Select (string/integer/float with options.values)
    if (opts.values?.length) {
        const values = opts.values;
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
    if (prop.field_type === 'textarea' || prop.key === 'description') {
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
        const meta = await getClassMeta(cls);
        let nestedHtml;
        if (meta) {
            nestedHtml = await elementStore.getPropsTable(meta, obj, path, lvl + 1, cls);
        } else {
            nestedHtml = `<textarea class="code" data-path="${path}" data-type="json" style="width:100%">${esc(JSON.stringify(obj, null, 2))}</textarea>`;
        }

        let html = `<tr class="ge-arr-row ge-section-hdr" data-idx="${idx}" data-row-id="${rowId}">
            <td class="ge-indent"><div class="ge-resizer" onmousedown="geStartResize(event, this)"></div></td>
            <td class="ge-idx"><button type="button" class="ge-fold" onclick="elementStore.fold(this)" data-target="${foldId}">\u2212</button> <span class="idx">[${idx}]</span> <span class="cls">${esc(cls)}</span><div class="ge-resizer" onmousedown="geStartResize(event, this)"></div></td>
            <td class="ge-val"></td>
            <td class="ge-act"><div class="ge-resizer" onmousedown="geStartResize(event, this)"></div><button type="button" class="ge-btn ge-btn-del" onclick="geDelItem(this)">Delete</button></td>
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
        <td class="ge-act"><div class="ge-resizer" onmousedown="geStartResize(event, this)"></div><button type="button" class="ge-btn ge-btn-del" onclick="geDelItem(this)">Delete</button></td>
    </tr>`;
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
    const path = table.dataset.arrPath;
    const rowId = row.dataset.rowId;

    // Remove body row if exists
    const bodyRow = tbody.querySelector(`:scope > tr.ge-section-body[data-row-id="${rowId}"]`);
    if (bodyRow) bodyRow.remove();
    row.remove();

    // Re-index remaining rows
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
        }
    });

    const countSpan = document.querySelector(`button[onclick="geAddItem('${path}')"]`)?.parentElement?.querySelector('.count');
    if (countSpan) countSpan.textContent = rows.length;
}

// =====================================================================
// Typed object Create / Null — toggle between null and edit states
// =====================================================================

/** Create typed object: switch from null state → edit state */
async function geCreateTypedObj(path, classIdArg) {
    const reg = elementStore._typedObjRegistry[path];
    if (!reg) return;

    // Determine class from arg or dropdown
    const row = document.querySelector(`tr[data-typed-obj="${path}"]`);
    if (!row) return;
    const sel = row.querySelector('.ge-obj-cls-sel');
    const cls = classIdArg || (sel ? sel.value : null);
    if (!cls) return;

    const { prop, lvl } = reg;
    const tbody = row.closest('tbody');

    // Find insertion point before removing
    const rows = tbody.querySelectorAll(`:scope > tr[data-typed-obj="${path}"]`);
    const lastRow = rows[rows.length - 1];
    const nextSibling = lastRow.nextElementSibling;
    rows.forEach(r => r.remove());

    // Re-render with empty object (with _class_id marker)
    const newHtml = await geField(prop, { _class_id: cls }, path, lvl);
    if (nextSibling) {
        nextSibling.insertAdjacentHTML('beforebegin', newHtml);
    } else {
        tbody.insertAdjacentHTML('beforeend', newHtml);
    }

    // Initialize Select2 on new class-select elements
    tbody.querySelectorAll(`tr[data-typed-obj="${path}"] .ge-class-select`).forEach(el => {
        $(el).select2({ width: '100%', placeholder: 'Select...', allowClear: true });
    });
}

/** Null typed object: switch from edit state → null state */
async function geNullTypedObj(path) {
    const reg = elementStore._typedObjRegistry[path];
    if (!reg) return;

    const row = document.querySelector(`tr[data-typed-obj="${path}"]`);
    if (!row) return;

    const { prop, lvl } = reg;
    const tbody = row.closest('tbody');

    // Find insertion point before removing
    const rows = tbody.querySelectorAll(`:scope > tr[data-typed-obj="${path}"]`);
    const lastRow = rows[rows.length - 1];
    const nextSibling = lastRow.nextElementSibling;
    rows.forEach(r => r.remove());

    // Re-render with null value
    const newHtml = await geField(prop, null, path, lvl);
    if (nextSibling) {
        nextSibling.insertAdjacentHTML('beforebegin', newHtml);
    } else {
        tbody.insertAdjacentHTML('beforeend', newHtml);
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
