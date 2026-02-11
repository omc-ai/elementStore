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
// Data Type Constants
// =====================
const DATA_TYPES = ['string', 'boolean', 'float', 'integer', 'object', 'relation', 'function'];
const LEGACY_DATA_TYPES = ['number', 'date', 'datetime', 'enum'];
const RELATION_TYPES = ['object', 'relation'];

const OPTIONS_TYPES = {
    'string': 'string_options',
    'integer': 'number_options',
    'float': 'number_options',
    'boolean': 'boolean_options',
    'object': 'object_options',
    'relation': 'relation_options',
    'unique': 'unique_options',
    'function': 'function_options'
};

const EDITOR_CONFIG = {
    data_types: {
        string: { default: 'text', editors: ['text', 'textarea', 'code', 'json'] },
        number: { default: 'number', editors: ['number', 'slider'] },
        float: { default: 'number', editors: ['number', 'slider'] },
        boolean: { default: 'toggle', editors: ['toggle', 'checkbox'] },
        date: { default: 'date', editors: ['date'] },
        datetime: { default: 'datetime', editors: ['datetime'] },
        enum: { default: 'select', editors: ['select'] },
        object: { default: 'json', editors: ['json', 'keyvalue'] },
        relation: { default: 'reference', editors: ['reference'] }
    },
    editors: {
        text: { label: 'Text Input' },
        textarea: { label: 'Text Area' },
        number: { label: 'Number' },
        slider: { label: 'Slider' },
        toggle: { label: 'Toggle' },
        checkbox: { label: 'Checkbox' },
        select: { label: 'Select' },
        date: { label: 'Date' },
        datetime: { label: 'DateTime' },
        code: { label: 'Code' },
        json: { label: 'JSON' },
        keyvalue: { label: 'Key-Value' },
        reference: { label: 'Reference' }
    }
};

function getEditorsForDataType(dataType) {
    const config = EDITOR_CONFIG.data_types[dataType];
    return config ? config.editors : ['text'];
}

function getDefaultEditor(dataType) {
    const map = {
        'string': 'text', 'number': 'number', 'float': 'number',
        'boolean': 'toggle', 'date': 'date', 'datetime': 'datetime',
        'enum': 'select', 'object': 'json', 'relation': 'reference'
    };
    return map[dataType] || 'text';
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

    const validators = prop.validators || [];
    if (validators.some(v => v.type === 'email') || propKey === 'email') {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
            errors.push('Invalid email address');
        }
    }

    if (validators.some(v => v.type === 'url')) {
        try { new URL(value); } catch { errors.push('Invalid URL'); }
    }

    if (prop.data_type === 'enum' && prop.enum_values?.length > 0) {
        if (!prop.enum_values.includes(value)) {
            errors.push(`Must be one of: ${prop.enum_values.join(', ')}`);
        }
    }
    const enumValidator = validators.find(v => v.type === 'enum');
    if (enumValidator?.values?.length > 0) {
        if (!enumValidator.values.includes(value)) {
            errors.push(`Must be one of: ${enumValidator.values.join(', ')}`);
        }
    }

    if ((prop.data_type === 'number' || prop.data_type === 'float') && value !== '') {
        if (isNaN(parseFloat(value))) {
            errors.push('Must be a number');
        }
    }

    const minValidator = validators.find(v => v.type === 'min' || v.type === 'range');
    const maxValidator = validators.find(v => v.type === 'max' || v.type === 'range');
    if (minValidator?.min !== undefined && parseFloat(value) < minValidator.min) {
        errors.push(`Minimum value is ${minValidator.min}`);
    }
    if (maxValidator?.max !== undefined && parseFloat(value) > maxValidator.max) {
        errors.push(`Maximum value is ${maxValidator.max}`);
    }

    const lengthValidator = validators.find(v => v.type === 'length');
    if (lengthValidator) {
        if (lengthValidator.min && value.length < lengthValidator.min) {
            errors.push(`Minimum length is ${lengthValidator.min}`);
        }
        if (lengthValidator.max && value.length > lengthValidator.max) {
            errors.push(`Maximum length is ${lengthValidator.max}`);
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
