// =====================================================================
// UTILS - Shared utility functions and constants
// =====================================================================

// Escape HTML
function esc(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Alias for esc
function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Toast notifications
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// Set value at nested path (e.g., "address.city" or "items[0].name")
function setNestedValue(obj, path, val) {
    const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
    let curr = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        const key = parts[i];
        const nextKey = parts[i + 1];
        const isNextArray = /^\d+$/.test(nextKey);
        if (!(key in curr)) curr[key] = isNextArray ? [] : {};
        curr = curr[key];
    }
    const lastKey = parts[parts.length - 1];
    if (val !== null && val !== '' && val !== undefined) {
        curr[lastKey] = val;
    }
}

// Format bytes to human-readable
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// =====================
// Data Type Constants (closed set — 8 types)
// =====================
const DATA_TYPES = ['string', 'boolean', 'integer', 'float', 'datetime', 'object', 'relation', 'function'];

// Legacy types — mapped to canonical types for backward compatibility
const LEGACY_TYPE_MAP = {
    'number': 'float',
    'date': 'datetime',
    'enum': 'string'
};
const LEGACY_DATA_TYPES = Object.keys(LEGACY_TYPE_MAP);
const RELATION_TYPES = ['object', 'relation'];

/**
 * Resolve a data_type to its canonical form.
 * Handles legacy types: number→float, date→datetime, enum→string
 */
function resolveDataType(dt) {
    return LEGACY_TYPE_MAP[dt] || dt || 'string';
}

const OPTIONS_TYPES = {
    'string': 'string_options',
    'integer': 'number_options',
    'float': 'number_options',
    'boolean': 'boolean_options',
    'datetime': 'datetime_options',
    'object': 'object_options',
    'relation': 'relation_options',
    'function': 'function_options'
};

/**
 * Default field type resolution (per plan §2.7).
 * Returns field type instance ID string.
 */
function resolveFieldType(prop) {
    // 1. Explicit field_type set
    if (prop.field_type) return prop.field_type;

    const dt = resolveDataType(prop.data_type);
    const opts = prop.options || {};
    const cls = Array.isArray(prop.object_class_id) ? prop.object_class_id[0] : prop.object_class_id;

    // 2. Options.values → select
    if (opts.values && Array.isArray(opts.values) && opts.values.length > 0) return 'select';

    // 3. Object class references
    if (cls) {
        if (dt === 'relation') return prop.is_array ? 'references' : 'reference';
        if (dt === 'object') return 'nested';
        if (dt === 'string') return 'select'; // string + class = load instances
    }

    // 4. Data type defaults
    switch (dt) {
        case 'string':   return 'text';
        case 'boolean':  return 'toggle';
        case 'integer':  return 'number';
        case 'float':    return 'number';
        case 'datetime': return 'datetime';
        case 'object':   return 'keyvalue';
        case 'relation': return 'reference';
        case 'function': return 'code';
        default:         return 'text';
    }
}

const EDITOR_CONFIG = {
    data_types: {
        string:   { default: 'text',      editors: ['text', 'email', 'url', 'phone', 'password', 'color', 'textarea', 'code', 'richtext', 'select', 'radio', 'autocomplete'] },
        integer:  { default: 'number',    editors: ['number', 'slider'] },
        float:    { default: 'number',    editors: ['number', 'slider', 'currency'] },
        boolean:  { default: 'toggle',    editors: ['toggle', 'checkbox'] },
        datetime: { default: 'datetime',  editors: ['date', 'datetime', 'time'] },
        object:   { default: 'nested',    editors: ['nested', 'keyvalue', 'json'] },
        relation: { default: 'reference', editors: ['reference', 'references', 'select', 'multiselect', 'autocomplete'] },
        function: { default: 'code',      editors: ['code', 'textarea'] }
    },
    editors: {
        text:         { label: 'Text Input',       category: '@editor-input' },
        email:        { label: 'Email',             category: '@editor-input' },
        url:          { label: 'URL',               category: '@editor-input' },
        phone:        { label: 'Phone',             category: '@editor-input' },
        password:     { label: 'Password',          category: '@editor-input' },
        number:       { label: 'Number',            category: '@editor-input' },
        slider:       { label: 'Slider',            category: '@editor-input' },
        currency:     { label: 'Currency',          category: '@editor-input' },
        color:        { label: 'Color',             category: '@editor-input' },
        textarea:     { label: 'Text Area',         category: '@editor-multiline' },
        code:         { label: 'Code',              category: '@editor-multiline' },
        richtext:     { label: 'Rich Text',         category: '@editor-multiline' },
        json:         { label: 'JSON',              category: '@editor-multiline' },
        select:       { label: 'Select',            category: '@editor-selector' },
        multiselect:  { label: 'Multi-Select',      category: '@editor-selector' },
        radio:        { label: 'Radio',             category: '@editor-selector' },
        autocomplete: { label: 'Autocomplete',      category: '@editor-selector' },
        reference:    { label: 'Reference',         category: '@editor-selector' },
        references:   { label: 'References (multi)', category: '@editor-selector' },
        toggle:       { label: 'Toggle',            category: '@editor-toggle' },
        checkbox:     { label: 'Checkbox',          category: '@editor-toggle' },
        date:         { label: 'Date',              category: '@editor-picker' },
        datetime:     { label: 'DateTime',          category: '@editor-picker' },
        time:         { label: 'Time',              category: '@editor-picker' },
        nested:       { label: 'Nested Editor',     category: '@editor-composite' },
        keyvalue:     { label: 'Key-Value',         category: '@editor-composite' }
    }
};

function getEditorsForDataType(dataType) {
    const resolved = resolveDataType(dataType);
    const config = EDITOR_CONFIG.data_types[resolved];
    return config ? config.editors : ['text'];
}

function getDefaultEditor(dataType) {
    const resolved = resolveDataType(dataType);
    const config = EDITOR_CONFIG.data_types[resolved];
    return config ? config.default : 'text';
}

// =====================
// Field Validation
// =====================
let currentFormProps = {};

function validateField(input) {
    const propKey = input.dataset.prop || input.dataset.nested?.split('.').pop();
    if (!propKey) return true;

    const prop = currentFormProps[propKey];
    if (!prop) return true;

    const value = input.type === 'checkbox' ? input.checked : input.value;
    const errors = [];

    if (prop.required && (value === '' || value === undefined || value === null)) {
        errors.push(`${prop.label || propKey} is required`);
    }

    if (value === '' || value === undefined || value === null) {
        clearValidationError(input);
        return true;
    }

    const dt = resolveDataType(prop.data_type);
    const opts = prop.options || {};

    // Field type-driven validation (validator lives in the field type instance)
    const ft = prop.field_type;
    if (ft === 'email' || propKey === 'email') {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
            errors.push('Invalid email address');
        }
    }
    if (ft === 'url') {
        try { new URL(value); } catch { errors.push('Invalid URL'); }
    }
    if (ft === 'phone') {
        if (!/^[+]?[\d\s\-().]{7,20}$/.test(value)) {
            errors.push('Invalid phone number');
        }
    }

    // Options.values constraint (string + options.values = select)
    if (opts.values && Array.isArray(opts.values) && opts.values.length > 0) {
        if (!opts.values.includes(value) && !opts.allow_custom) {
            errors.push(`Must be one of: ${opts.values.join(', ')}`);
        }
    }

    // Number type checks
    if ((dt === 'integer' || dt === 'float') && value !== '') {
        if (isNaN(parseFloat(value))) {
            errors.push('Must be a number');
        } else {
            const num = parseFloat(value);
            if (opts.min !== undefined && num < opts.min) {
                errors.push(`Minimum value is ${opts.min}`);
            }
            if (opts.max !== undefined && num > opts.max) {
                errors.push(`Maximum value is ${opts.max}`);
            }
        }
    }

    // String length checks
    if (dt === 'string' && typeof value === 'string') {
        if (opts.min_length !== undefined && value.length < opts.min_length) {
            errors.push(`Minimum length is ${opts.min_length}`);
        }
        if (opts.max_length !== undefined && value.length > opts.max_length) {
            errors.push(`Maximum length is ${opts.max_length}`);
        }
        if (opts.pattern) {
            try {
                if (!new RegExp(opts.pattern).test(value)) {
                    errors.push('Does not match required pattern');
                }
            } catch (e) { /* ignore invalid regex */ }
        }
    }

    if (errors.length > 0) {
        showValidationError(input, errors[0]);
        return false;
    } else {
        clearValidationError(input);
        return true;
    }
}

function showValidationError(input, message) {
    input.classList.add('invalid');
    let errorEl = input.parentElement.querySelector('.validation-error');
    if (!errorEl) {
        errorEl = document.createElement('div');
        errorEl.className = 'validation-error';
        input.parentElement.appendChild(errorEl);
    }
    errorEl.textContent = message;
    errorEl.classList.add('show');
}

function clearValidationError(input) {
    input.classList.remove('invalid');
    const errorEl = input.parentElement.querySelector('.validation-error');
    if (errorEl) {
        errorEl.classList.remove('show');
    }
}

function validateAllFields() {
    let isValid = true;
    document.querySelectorAll('[data-prop]').forEach(input => {
        if (!validateField(input)) {
            isValid = false;
        }
    });
    return isValid;
}
