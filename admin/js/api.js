// =====================================================================
// API - Fetch wrapper, class metadata, caches
// =====================================================================

const API_BASE = (() => {
    const match = window.location.pathname.match(/^(\/[^/]+)\/admin/);
    return match ? match[1] : '';
})();

let classesCache = {};
let classTreeData = [];
let allClassesList = [];

// Store @function definitions for function type editors
let functionConfig = {
    functions: {},
    typeMap: {},
    loaded: false
};

async function api(method, endpoint, data = null) {
    const opts = {
        method,
        headers: {
            'Content-Type': 'application/json',
            'X-Disable-Ownership': 'true',
            'X-Allow-Custom-Ids': 'true'
        }
    };
    if (data) opts.body = JSON.stringify(data);
    const res = await fetch(API_BASE + endpoint, opts);
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    return json;
}

async function getClassMeta(classId) {
    if (classesCache[classId]) return classesCache[classId];
    try {
        const [meta, inheritedProps] = await Promise.all([
            api('GET', `/class/${classId}`),
            api('GET', `/class/${classId}/props`)
        ]);
        meta.props = inheritedProps;
        classesCache[classId] = meta;
        return meta;
    } catch (e) {
        return null;
    }
}

function buildClassTree(classes) {
    const userClasses = classes.filter(c => !c.id.startsWith('@'));
    const childrenMap = {};
    const rootClasses = [];

    userClasses.forEach(c => {
        if (c.extends_id && !c.extends_id.startsWith('@')) {
            if (!childrenMap[c.extends_id]) childrenMap[c.extends_id] = [];
            childrenMap[c.extends_id].push(c);
        } else {
            rootClasses.push(c);
        }
    });

    function buildNode(cls, level) {
        const indent = '\u2502  '.repeat(level);
        const prefix = level > 0 ? '\u251C\u2500 ' : '';
        const node = {
            id: cls.id,
            text: cls.id,
            name: cls.name || cls.id,
            description: cls.description || '',
            extends_id: cls.extends_id || '',
            level: level,
            indent: indent + prefix
        };
        const children = childrenMap[cls.id] || [];
        const result = [node];
        children.forEach(child => {
            result.push(...buildNode(child, level + 1));
        });
        return result;
    }

    let treeData = [];
    rootClasses.forEach(cls => {
        treeData.push(...buildNode(cls, 0));
    });
    return treeData;
}

// Load @function objects from API
async function loadFunctions() {
    try {
        const functions = await api('GET', '/store/@function');
        functionConfig.functions = {};
        functionConfig.typeMap = {};

        for (const func of functions) {
            functionConfig.functions[func.id] = func;
            const funcType = func.function_type || 'custom';
            if (!functionConfig.typeMap[funcType]) {
                functionConfig.typeMap[funcType] = [];
            }
            functionConfig.typeMap[funcType].push(func.id);
        }
        functionConfig.loaded = true;
        console.log('Loaded', Object.keys(functionConfig.functions).length, 'functions from @function');
    } catch (e) {
        console.warn('Failed to load @function objects:', e.message);
        functionConfig.loaded = true;
    }
}

function getFunctionsByType(funcType) {
    return functionConfig.typeMap[funcType] || [];
}

function getFunctionDef(funcId) {
    return functionConfig.functions[funcId] || null;
}
