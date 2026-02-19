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

/**
 * Get class metadata (props included). Seeds the store as a side effect.
 * Returns { id, name, ..., props: [...] } or null.
 */
async function getClassMeta(classId) {
    if (classesCache[classId]) return classesCache[classId];

    // Check if store already has the class with props loaded
    if (typeof store !== 'undefined' && store.objects[classId]) {
        const storeProps = store.collectClassProps(classId);
        if (storeProps.length > 0) {
            const classData = store.objects[classId].data || store.objects[classId];
            const meta = Object.assign({}, classData);
            meta.props = storeProps.map(function(p) { return p.data || p; });
            classesCache[classId] = meta;
            return meta;
        }
    }

    try {
        const [meta, inheritedProps] = await Promise.all([
            api('GET', `/class/${classId}`),
            api('GET', `/class/${classId}/props`)
        ]);
        meta.props = inheritedProps;
        classesCache[classId] = meta;

        // Seed into element-store for unified access
        if (typeof store !== 'undefined') {
            _seedClassIntoStore(classId, meta, inheritedProps);
        }

        return meta;
    } catch (e) {
        return null;
    }
}

/**
 * Seed a class and its props into the element store.
 * Called by getClassMeta after fetching from API.
 */
function _seedClassIntoStore(classId, meta, props) {
    try {
        // Seed the class definition
        if (!store.objects[classId]) {
            const classData = Object.assign({}, meta);
            delete classData.props; // props are stored separately
            classData.class_id = '@class';
            store.setObject(classData);
        }

        // Seed each prop
        if (Array.isArray(props)) {
            for (const prop of props) {
                const propId = classId + '.' + prop.key;
                if (!store.objects[propId]) {
                    store.setObject(Object.assign({}, prop, {
                        id: propId,
                        class_id: '@prop'
                    }));
                }
            }
        }
    } catch (e) {
        console.warn('_seedClassIntoStore failed for', classId, e.message);
    }
}

/**
 * Invalidate class cache (both classesCache and store props).
 * Call after saving a class definition.
 */
function invalidateClassCache(classId) {
    delete classesCache[classId];
    // Remove store props for this class so they'll be re-fetched
    if (typeof store !== 'undefined') {
        const prefix = classId + '.';
        Object.keys(store.objects).forEach(function(k) {
            if (k.indexOf(prefix) === 0) {
                delete store.objects[k];
            }
        });
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
