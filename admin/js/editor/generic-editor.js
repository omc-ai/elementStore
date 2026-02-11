// =====================================================================
// GENERIC EDITOR - elementStore namespace
// Unified prop helpers, recursive editor rendering, data collection
// =====================================================================

const elementStore = {
    /** Whether the object being edited is new (no id yet) */
    _isNewObject: true,

    /** Extract class ID from prop (handles array format) */
    getCls(prop) {
        return Array.isArray(prop.object_class_id) ? prop.object_class_id[0] : prop.object_class_id;
    },

    /** Generate fold ID from path */
    getFoldId(path) {
        return `fold_${path.replace(/[\[\].]/g, '_')}`;
    },

    /** Get sorted props from class meta */
    getSortedProps(meta) {
        const props = Array.isArray(meta.props) ? meta.props : Object.values(meta.props || {});
        return [...props].sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
    },

    /** Get display label for prop */
    getPropLabel(prop) {
        return prop.label || prop.key;
    },

    /** Build type badge text */
    getPropType(prop) {
        const dt = prop.data_type || 'string';
        const cls = this.getCls(prop);
        let label = dt;
        if (cls) label = `${dt} \u2192 ${cls}`;
        if (prop.is_array) label += '[]';
        return label;
    },

    /** Render prop as table column header */
    propToHeader(prop) {
        return `<th data-key="${prop.key}" data-type="${prop.data_type || 'string'}">
            ${esc(this.getPropLabel(prop))}
            <span class="type-badge">${this.getPropType(prop)}</span>
        </th>`;
    },

    /** Render prop value as table cell */
    propToCell(prop, value, objId) {
        const dt = prop.data_type || 'string';
        const cls = this.getCls(prop);
        const opts = prop.options || {};

        if (dt === 'boolean') {
            const labels = opts.true_label && opts.false_label
                ? { t: opts.true_label, f: opts.false_label }
                : { t: '\u2713', f: '\u2014' };
            return value ? labels.t : labels.f;
        }
        if (dt === 'relation' && cls && value) {
            return `<a href="#" onclick="viewObject('${cls}','${value}');return false">${esc(value)}</a>`;
        }
        if (prop.is_array) return `[${Array.isArray(value) ? value.length : 0}]`;
        if (dt === 'object') return value ? '{...}' : '\u2014';
        return esc(String(value ?? ''));
    },

    /** Render a single editor row (ge-key + ge-val cells) */
    renderRow(label, req, metaBtn, typeLabel, content) {
        return `<tr>
            <td class="ge-key">${esc(label)} ${req}${metaBtn}<span class="t">${typeLabel}</span><div class="ge-resizer" onmousedown="geStartResize(event, this)"></div></td>
            <td class="ge-val">${content}</td>
        </tr>`;
    },

    /** Render nested content row (for arrays/objects) */
    renderNestRow(lvl, foldId, content) {
        return `<tr class="ge-nest-row">
            <td class="ge-nest-indent l${Math.min(lvl + 1, 3)}">
                <button type="button" class="ge-fold" onclick="elementStore.fold(this)" data-target="${foldId}" title="Collapse/Expand">\u2212</button>
            </td>
            <td class="ge-nest-content" id="${foldId}">${content}</td>
        </tr>`;
    },

    /** Render props table for object */
    async getPropsTable(meta, obj, path, lvl, cls) {
        const sorted = this.getSortedProps(meta);
        let html = `<table class="ge" data-path="${path}" data-class="${cls || ''}"><tbody>`;
        for (const p of sorted) {
            html += await geField(p, obj[p.key], `${path}.${p.key}`, lvl + 1);
        }
        html += `</tbody></table>`;
        return html;
    },

    /** Unified fold toggle */
    fold(btn) {
        const targetId = btn.dataset.target;
        if (targetId) {
            const content = document.getElementById(targetId);
            if (!content) return;
            const isCollapsed = content.classList.toggle('collapsed');
            btn.classList.toggle('collapsed', isCollapsed);
            btn.textContent = isCollapsed ? '+' : '\u2212';
            return;
        }
        const item = btn.closest('.ge-arr-item');
        if (!item) return;
        const isCollapsed = item.classList.toggle('collapsed');
        btn.classList.toggle('collapsed', isCollapsed);
        btn.textContent = isCollapsed ? '+' : '\u2212';
    },

    // =========================================================================
    // COLLECTION RENDERING
    // =========================================================================

    renderTableHeaders(props) {
        let html = '<tr>';
        for (const prop of props) {
            html += this.propToHeader(prop);
        }
        html += '<th class="actions">Actions</th></tr>';
        return html;
    },

    renderTableRow(props, obj, onEdit) {
        let html = `<tr data-id="${esc(obj.id || '')}">`;
        for (const prop of props) {
            html += `<td>${this.propToCell(prop, obj[prop.key], obj.id)}</td>`;
        }
        const editFn = onEdit ? `onclick="${onEdit}('${esc(obj.id)}')"` : '';
        html += `<td class="actions">
            <button class="btn btn-sm" ${editFn}>Edit</button>
        </td></tr>`;
        return html;
    },

    async renderObjectsTable(classId, objects, onEdit) {
        const meta = await getClassMeta(classId);
        if (!meta) return `<div class="form-hint">Class "${classId}" not found</div>`;
        const props = this.getSortedProps(meta);
        let html = '<table class="obj-table"><thead>';
        html += this.renderTableHeaders(props);
        html += '</thead><tbody>';
        for (const obj of objects) {
            html += this.renderTableRow(props, obj, onEdit);
        }
        if (objects.length === 0) {
            html += `<tr><td colspan="${props.length + 1}" class="empty">No objects</td></tr>`;
        }
        html += '</tbody></table>';
        return html;
    },

    /** Collect data from editor container */
    collectData(container) {
        const data = {};
        container.querySelectorAll('[data-path]').forEach(el => {
            if (el.disabled) return; // Skip disabled (readonly/create_only) fields
            const path = el.dataset.path;
            const type = el.dataset.type;
            let val;

            switch (type) {
                case 'boolean':
                    val = el.checked;
                    break;
                case 'integer':
                case 'number':
                    val = el.value ? parseInt(el.value, 10) : null;
                    break;
                case 'float':
                    val = el.value ? parseFloat(el.value) : null;
                    break;
                case 'json':
                case 'object':
                    try { val = JSON.parse(el.value || '{}'); } catch { val = el.value; }
                    break;
                case 'relation':
                    val = el.value || null;
                    break;
                case 'enum':
                    if (el.value === '__custom__' && el.dataset.customValue) {
                        val = el.dataset.customValue;
                    } else {
                        val = el.value || null;
                    }
                    break;
                default:
                    val = el.value;
            }

            setNestedValue(data, path, val);
        });
        return data;
    },

    // =========================================================================
    // UNIQUE CONSTRAINTS EDITOR
    // =========================================================================

    renderUniqueEditor(constraints, path, availableProps) {
        const arr = Array.isArray(constraints) ? constraints : [];
        const propOptions = availableProps.map(p => `<option value="${esc(p.key)}">${esc(p.label || p.key)}</option>`).join('');

        let html = `<div class="ge-unique" data-path="${path}">
            <div class="ge-unique-list">`;

        arr.forEach((constraint, idx) => {
            const cid = constraint.id || '';
            const fields = Array.isArray(constraint.fields) ? constraint.fields : [];
            html += `<div class="ge-unique-item" data-idx="${idx}">
                <div class="ge-unique-item-hdr">
                    <input type="text" class="ge-unique-id" value="${esc(cid)}" placeholder="Constraint ID (e.g., unique_email)">
                    <button type="button" class="ge-btn ge-btn-del" onclick="elementStore.removeUniqueConstraint(this)">Delete</button>
                </div>
                <div class="ge-unique-fields">
                    ${fields.map((f, fi) => this.renderUniqueFieldItem(f, fi, propOptions)).join('')}
                    <button type="button" class="ge-btn ge-btn-add" onclick="elementStore.addUniqueField(this, \`${propOptions.replace(/`/g, '\\`')}\`)">+ Field</button>
                </div>
            </div>`;
        });

        if (arr.length === 0) {
            html += `<div class="ge-unique-empty">No unique constraints. ID field is unique by default.</div>`;
        }

        html += `</div>
            <button type="button" class="ge-btn ge-btn-add" onclick="elementStore.addUniqueConstraint(this, \`${propOptions.replace(/`/g, '\\`')}\`)">+ Add Constraint</button>
        </div>`;
        return html;
    },

    renderUniqueFieldItem(field, idx, propOptions) {
        const isConstant = field.startsWith("'") && field.endsWith("'");
        const value = isConstant ? field.slice(1, -1) : field;
        return `<div class="ge-unique-field" data-idx="${idx}">
            <select class="ge-unique-field-type" onchange="elementStore.toggleUniqueFieldType(this)">
                <option value="field" ${!isConstant ? 'selected' : ''}>Field</option>
                <option value="constant" ${isConstant ? 'selected' : ''}>Constant</option>
            </select>
            ${isConstant
                ? `<input type="text" class="ge-unique-field-val" value="${esc(value)}" placeholder="e.g., -">`
                : `<select class="ge-unique-field-val"><option value="">--</option>${propOptions.replace(`value="${value}"`, `value="${value}" selected`)}</select>`
            }
            <button type="button" class="ge-btn-sm ge-btn-del" onclick="this.parentElement.remove()">\u00d7</button>
        </div>`;
    },

    addUniqueConstraint(btn, propOptions) {
        const list = btn.previousElementSibling;
        const empty = list.querySelector('.ge-unique-empty');
        if (empty) empty.remove();
        const idx = list.querySelectorAll('.ge-unique-item').length;
        const html = `<div class="ge-unique-item" data-idx="${idx}">
            <div class="ge-unique-item-hdr">
                <input type="text" class="ge-unique-id" value="" placeholder="Constraint ID (e.g., unique_email)">
                <button type="button" class="ge-btn ge-btn-del" onclick="elementStore.removeUniqueConstraint(this)">Delete</button>
            </div>
            <div class="ge-unique-fields">
                <button type="button" class="ge-btn ge-btn-add" onclick="elementStore.addUniqueField(this, \`${propOptions}\`)">+ Field</button>
            </div>
        </div>`;
        list.insertAdjacentHTML('beforeend', html);
    },

    removeUniqueConstraint(btn) {
        const item = btn.closest('.ge-unique-item');
        const list = item.parentElement;
        item.remove();
        if (list.querySelectorAll('.ge-unique-item').length === 0) {
            list.innerHTML = '<div class="ge-unique-empty">No unique constraints. ID field is unique by default.</div>';
        }
    },

    addUniqueField(btn, propOptions) {
        const fieldsContainer = btn.parentElement;
        const idx = fieldsContainer.querySelectorAll('.ge-unique-field').length;
        const html = `<div class="ge-unique-field" data-idx="${idx}">
            <select class="ge-unique-field-type" onchange="elementStore.toggleUniqueFieldType(this)">
                <option value="field" selected>Field</option>
                <option value="constant">Constant</option>
            </select>
            <select class="ge-unique-field-val"><option value="">--</option>${propOptions}</select>
            <button type="button" class="ge-btn-sm ge-btn-del" onclick="this.parentElement.remove()">\u00d7</button>
        </div>`;
        btn.insertAdjacentHTML('beforebegin', html);
    },

    toggleUniqueFieldType(select) {
        const container = select.parentElement;
        const valEl = container.querySelector('.ge-unique-field-val');
        const isConstant = select.value === 'constant';

        if (isConstant && valEl.tagName === 'SELECT') {
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'ge-unique-field-val';
            input.placeholder = "e.g., -";
            valEl.replaceWith(input);
        } else if (!isConstant && valEl.tagName === 'INPUT') {
            const addBtn = container.parentElement.querySelector('.ge-btn-add');
            const propOptions = addBtn?.onclick?.toString().match(/`([^`]*)`/)?.[1] || '';
            const sel = document.createElement('select');
            sel.className = 'ge-unique-field-val';
            sel.innerHTML = `<option value="">--</option>${propOptions}`;
            valEl.replaceWith(sel);
        }
    },

    collectUniqueConstraints(container) {
        const uniqueEl = container?.querySelector('.ge-unique');
        if (!uniqueEl) return undefined;

        const constraints = [];
        uniqueEl.querySelectorAll('.ge-unique-item').forEach(item => {
            const id = item.querySelector('.ge-unique-id')?.value?.trim();
            if (!id) return;

            const fields = [];
            item.querySelectorAll('.ge-unique-field').forEach(fieldEl => {
                const type = fieldEl.querySelector('.ge-unique-field-type')?.value;
                const val = fieldEl.querySelector('.ge-unique-field-val')?.value?.trim();
                if (!val) return;
                fields.push(type === 'constant' ? `'${val}'` : val);
            });

            if (fields.length > 0) {
                constraints.push({ id, fields });
            }
        });

        return constraints.length > 0 ? constraints : undefined;
    },

    /**
     * Render complete editor for a class (main entry point)
     */
    async renderEditor(classId, data) {
        const meta = await getClassMeta(classId);
        if (!meta) return `<div class="form-hint">Class "${classId}" not found</div>`;

        this._isNewObject = !data?.id;
        const sorted = this.getSortedProps(meta);

        let html = `<table class="ge"><tbody>`;
        if (!sorted.find(p => p.key === 'id')) {
            html += `<tr>
                <td class="ge-key">id <span class="t">string</span></td>
                <td class="ge-val"><input type="text" data-path="id" value="${esc(data?.id || '')}" ${data?.id ? 'readonly' : ''} placeholder="Auto-generated"></td>
            </tr>`;
        }
        for (const prop of sorted) {
            html += await geField(prop, data?.[prop.key], prop.key, 0);
        }
        html += `</tbody></table>`;
        return html;
    }
};
