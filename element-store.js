// ═══════════════════════════════════════════════════════════════════════════
// ELEMENT STORE
// ═══════════════════════════════════════════════════════════════════════════
//
// CODING STANDARD:
// - Use function() {} instead of arrow functions =>
// - Pass 'this' as second argument to forEach when needed
// - Use old-fashioned function declarations
// - Class fields for defaults (not saved unless explicitly set)
//
// ═══════════════════════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════════════════════
// SEED DATA
// ═══════════════════════════════════════════════════════════════════════════

const seedData = {
    '@class': {id: '@class', class_id: '@class'},
    '@prop':  {id: '@prop',  class_id: '@class'},
    '@storage': {id: '@storage', class_id: '@class'},

    // @class props (prop id = owning_class + '.' + key)
    '@class.name':       {id: '@class.name',       class_id: '@prop'},
    '@class.extends_id': {id: '@class.extends_id', class_id: '@prop', data_type: 'relation', object_class_id: '@class'},
    '@class.props': {
        id: '@class.props',
        class_id: '@prop',
        data_type: 'object',
        is_array: true,
        object_class_id: '@prop',
    },

    // @prop props
    '@prop.id':                  {id: '@prop.id',                  class_id: '@prop'},
    '@prop.key':                 {id: '@prop.key',                 class_id: '@prop', required: true},
    '@prop.name':                {id: '@prop.name',                class_id: '@prop'},
    '@prop.description':         {id: '@prop.description',         class_id: '@prop'},
    '@prop.data_type':           {id: '@prop.data_type',           class_id: '@prop'},
    '@prop.is_array':            {id: '@prop.is_array',            class_id: '@prop', data_type: 'boolean'},
    '@prop.object_class_id':     {id: '@prop.object_class_id',     class_id: '@prop', data_type: 'relation', object_class_id: '@class'},
    '@prop.object_class_strict': {id: '@prop.object_class_strict', class_id: '@prop', data_type: 'boolean'},
    '@prop.on_orphan':           {id: '@prop.on_orphan',           class_id: '@prop'},
    '@prop.options':             {id: '@prop.options',             class_id: '@prop', data_type: 'object', is_array: true},
    '@prop.editor':              {id: '@prop.editor',              class_id: '@prop', data_type: 'object'},
    '@prop.validators':          {id: '@prop.validators',          class_id: '@prop', data_type: 'object', is_array: true},
    '@prop.required':            {id: '@prop.required',            class_id: '@prop', data_type: 'boolean'},
    '@prop.readonly':            {id: '@prop.readonly',            class_id: '@prop', data_type: 'boolean'},
    '@prop.default_value':       {id: '@prop.default_value',       class_id: '@prop'},
    '@prop.display_order':       {id: '@prop.display_order',       class_id: '@prop', data_type: 'integer'},
    '@prop.group_name':          {id: '@prop.group_name',          class_id: '@prop'},
    '@prop.hidden':              {id: '@prop.hidden',              class_id: '@prop', data_type: 'boolean'},

    // @storage props
    '@storage.url':  {id: '@storage.url',  class_id: '@prop'},
    '@storage.type': {id: '@storage.type', class_id: '@prop'},
};


// ═══════════════════════════════════════════════════════════════════════════
// CLASS REGISTRY
// ═══════════════════════════════════════════════════════════════════════════

const classRegistry = {};

function registerClass(classId, constructor) {
    classRegistry[classId] = constructor;
}

// ═══════════════════════════════════════════════════════════════════════════
// ATOM COLLECTION
// ═══════════════════════════════════════════════════════════════════════════

class AtomCollection {

    /**
     * @param {Array} items - Raw array reference (from parent data)
     * @param {ElementStore} store
     * @param {string} [classId] - Class of items (e.g. '@prop')
     */
    constructor(items, store, classId) {
        this._items = items;    // same reference as parent data
        this._store = store;
        this._classId = classId || null;
    }

    get length() {
        return this._items.length;
    }

    /** Find item by key field */
    get(key) {
        for (var i = 0; i < this._items.length; i++) {
            if (this._items[i].key === key) {
                return this._wrap(i);
            }
        }
        return null;
    }

    /** Find item by id field */
    getById(id) {
        for (var i = 0; i < this._items.length; i++) {
            if (this._items[i].id === id) {
                return this._wrap(i);
            }
        }
        return null;
    }

    /** Filter items by object filter */
    find(filter) {
        var results = [];
        var self = this;
        this._items.forEach(function (item, i) {
            var match = true;
            Object.keys(filter).forEach(function (k) {
                if (item[k] !== filter[k]) match = false;
            });
            if (match) results.push(self._wrap(i));
        });
        return results;
    }

    /** Iterate items as AtomObj */
    forEach(fn) {
        var self = this;
        this._items.forEach(function (item, i) {
            fn(self._wrap(i), i);
        });
    }

    /** Map items as AtomObj */
    map(fn) {
        var self = this;
        var results = [];
        this._items.forEach(function (item, i) {
            results.push(fn(self._wrap(i), i));
        });
        return results;
    }

    /** Add raw item to collection */
    add(raw) {
        if (this._classId && !raw.class_id) {
            raw.class_id = this._classId;
        }
        this._items.push(raw);
        return this._wrap(this._items.length - 1);
    }

    /** Remove item by key */
    remove(key) {
        for (var i = 0; i < this._items.length; i++) {
            if (this._items[i].key === key) {
                this._items.splice(i, 1);
                return true;
            }
        }
        return false;
    }

    /** Remove item by id */
    removeById(id) {
        for (var i = 0; i < this._items.length; i++) {
            if (this._items[i].id === id) {
                this._items.splice(i, 1);
                return true;
            }
        }
        return false;
    }

    /** Return raw array for serialization */
    toJSON() {
        return this._items;
    }

    /** Wrap raw item at index as AtomObj (factory resolves constructor) */
    _wrap(index) {
        var item = this._items[index];
        if (this._classId && !item.class_id) {
            item.class_id = this._classId;
        }
        return new AtomObj(item, this._store);
    }
}


// ═══════════════════════════════════════════════════════════════════════════
// ATOM OBJ
// ═══════════════════════════════════════════════════════════════════════════

class AtomObj {
    static CLASS_ID = '@atom';

    /** @type {ElementStore} */
    store = null;
    /** @type {string} */
    class_id = null;
    /** @type {string} */
    id = null;
    /** @type {Object.<string, *>} */
    data = {};
    /** @type {Object.<string, AtomObj|AtomObj[]>} related objects keyed by property name */
    objects = {};
    /** @type {AtomClass|null} class definition */
    _class = null;
    /** @type {Object|null} */
    _snapshot = null;

    /**
     * @param {Object|string} raw - Raw data object, or class_id string (new object)
     * @param {ElementStore} [store] - The ElementStore this object belongs to
     */
    constructor(raw, store) {
        // ── Factory: resolve correct subclass via extends_id chain ──
        if (new.target === AtomObj && store) {
            var cid = (typeof raw === 'string') ? raw : (raw && raw.class_id);
            if (cid) {
                var Ctor = store.resolveConstructor(cid);
                if (Ctor && Ctor !== AtomObj) {
                    return new Ctor(raw, store);
                }
            }
        }

        this.store = store || null;
        this.objects = {};

        // String → new object of that class
        if (typeof raw === 'string') {
            raw = {class_id: raw};
        }

        // Must be object with class_id
        if (!raw || typeof raw !== 'object' || !raw.class_id) {
            throw new Error('AtomObj: class_id is required');
        }

        // Use raw as data by reference
        this.data = raw;

        // Load class definition from store (null during seed bootstrap)
        this._class = this.store ? (this.store.getObject(raw.class_id) || null) : null;

        var proxy = new Proxy(this, {
            get: function (target, prop, receiver) {
                // internal fields — bypass data
                if (prop === 'store' || prop === 'data' || prop === 'objects' || prop === '_class' || prop === '_snapshot' || prop === 'el') return target[prop];
                // methods — bind to proxy so 'this' resolves through proxy
                if (typeof target[prop] === 'function') return target[prop].bind(receiver);
                // data fields — delegate to propDef if available
                if (prop in target.data) {
                    if (target._class && target.store && prop !== 'id' && prop !== 'class_id') {
                        var propDef = target.store.findPropDef(target.data.class_id, prop);
                        if (propDef && typeof propDef.getPropValue === 'function') {
                            return propDef.getPropValue(target, prop);
                        }
                    }
                    return target.data[prop];
                }
                // class field defaults
                return target[prop];
            },
            set: function (target, prop, val) {
                // internal fields — bypass data
                if (prop === 'store' || prop === 'data' || prop === 'objects' || prop === '_class' || prop === '_snapshot' || prop === 'el') {
                    target[prop] = val;
                    return true;
                }
                // delegate to propDef for type validation/coercion
                if (target._class && target.store && prop !== 'id' && prop !== 'class_id') {
                    var classId = target.data.class_id;
                    if (classId) {
                        var propDef = target.store.findPropDef(classId, prop);
                        if (propDef && typeof propDef.setPropValue === 'function') {
                            return propDef.setPropValue(target, prop, val);
                        }
                        // warn if class has props but this one is unknown
                        if (target.store.collectClassProps(classId).length > 0) {
                            console.warn('AtomObj: unknown prop "' + prop + '" for class ' + classId);
                        }
                    }
                }
                target.data[prop] = val;
                return true;
            }
        });

        // Existing object (has id) → take snapshot for change tracking
        // New object (no id) → apply defaults from class definition
        if (this.data.id) {
            this._snapshot = JSON.parse(JSON.stringify(this.data));
        } else {
            this._applyDefaults();
            this._snapshot = null;
        }

        return proxy;
    }

    /** Get prop definitions for this object's class (includes inherited) */
    getProps() {
        if (!this.store) return [];
        return this.store.collectClassProps(this.class_id);
    }

    /** Get a specific prop definition by key (walks inheritance) */
    getPropDef(key) {
        if (!this.store) return null;
        return this.store.findPropDef(this.class_id, key);
    }

    /** Apply default values from class prop definitions (includes inherited) */
    _applyDefaults() {
        if (!this.store) return;
        var classId = this.data.class_id;
        if (!classId) return;
        var data = this.data;
        var props = this.store.collectClassProps(classId);
        props.forEach(function(propObj) {
            // Extract key from prop id (e.g. 'ui-element.x' → 'x')
            var dotIdx = propObj.id.lastIndexOf('.');
            var key = dotIdx >= 0 ? propObj.id.substring(dotIdx + 1) : propObj.id;
            if (data[key] === undefined) {
                var def = propObj.default_value;
                if (def !== undefined && def !== null) {
                    data[key] = def;
                }
            }
        });
    }

    /** Check if data changed since load */
    hasChanges() {
        if (!this._snapshot) return true; // new object
        return JSON.stringify(this.data) !== JSON.stringify(this._snapshot);
    }

    /** Get changed fields (diff vs snapshot) */
    getChanges() {
        if (!this._snapshot) return Object.assign({}, this.data); // new: all fields
        var changes = {};
        var data = this.data;
        var snap = this._snapshot;
        Object.keys(data).forEach(function (k) {
            if (JSON.stringify(data[k]) !== JSON.stringify(snap[k])) {
                changes[k] = data[k];
            }
        });
        Object.keys(snap).forEach(function (k) {
            if (!(k in data)) {
                changes[k] = null; // deleted field
            }
        });
        return changes;
    }

    /** Save to store (updates snapshot) */
    save() {
        if (!this.store) throw new Error('save: no store assigned');
        this.store.setObject(this);
        this._snapshot = JSON.parse(JSON.stringify(this.data));
    }

    /** Get related objects that have unsaved changes */
    getDirtyObjects() {
        var dirty = [];
        var objs = this.objects;
        Object.keys(objs).forEach(function (propName) {
            var val = objs[propName];
            if (Array.isArray(val)) {
                val.forEach(function (obj) {
                    if (obj && obj.hasChanges && obj.hasChanges()) dirty.push(obj);
                });
            } else if (val && val.hasChanges && val.hasChanges()) {
                dirty.push(val);
            }
        });
        return dirty;
    }

    /** Serialize to plain object */
    toJSON() {
        return this.data;
    }
}


// ═══════════════════════════════════════════════════════════════════════════
// ATOM CLASS
// ═══════════════════════════════════════════════════════════════════════════

class AtomClass extends AtomObj {
    static CLASS_ID = '@class';

    class_id = '@class';

    // Returns all @prop objects for this class (including inherited via extends_id)
    getProps() {
        if (!this.store) return [];
        return this.store.collectClassProps(this.id);
    }
}


// ═══════════════════════════════════════════════════════════════════════════
// ATOM PROP
// ═══════════════════════════════════════════════════════════════════════════

class AtomProp extends AtomObj {
    static CLASS_ID = '@prop';

    class_id = '@prop';
    key = null;
    name = null;
    description = null;
    data_type = null;
    is_array = false;
    object_class_id = null;
    object_class_strict = false;
    on_orphan = null;
    options = null;
    editor = null;
    validators = null;
    required = false;
    readonly = false;
    default_value = null;
    display_order = 0;
    group_name = null;
    hidden = false;

    /**
     * Get typed value from sender object
     * @param {AtomObj} senderObj - The object that holds the value
     * @param {string} propName - The property key
     * @returns {*} object | AtomCollection | AtomObj[] | AtomObj | string | boolean | number | function
     */
    getPropValue(senderObj, propName) {
        var val = senderObj.data[propName];
        if (val === undefined || val === null) return val;

        var store = senderObj.store;

        switch (this.data_type) {
            case 'string':
                return String(val);
            case 'boolean':
                return !!val;
            case 'integer':
                return parseInt(val, 10) || 0;
            case 'float':
                return parseFloat(val) || 0;
            case 'object':
                if (this.is_array && Array.isArray(val)) {
                    return new AtomCollection(val, store, this.object_class_id);
                }
                if (typeof val === 'object' && this.object_class_id && store) {
                    if (!val.class_id) val.class_id = this.object_class_id;
                    return new AtomObj(val, store);
                }
                return val;
            case 'relation':
                if (!store) return val;
                if (this.is_array && Array.isArray(val)) {
                    // Fetch all into objects[propName] (array of AtomObj)
                    if (!senderObj.objects[propName]) {
                        var items = [];
                        val.forEach(function (id) {
                            var fetched = store.getObject(id);
                            if (fetched) items.push(fetched);
                        });
                        senderObj.objects[propName] = items;
                    }
                    return new AtomCollection(senderObj.objects[propName], store, this.object_class_id);
                }
                // single relation → objects[propName] = AtomObj
                if (!senderObj.objects[propName]) {
                    var fetched = store.getObject(val);
                    if (fetched) senderObj.objects[propName] = fetched;
                }
                return senderObj.objects[propName] || val;
            case 'function':
                if (typeof val === 'function') return val;
                if (typeof val === 'string') {
                    try { return new Function('return ' + val)(); } catch (e) { return val; }
                }
                return val;
            default:
                return val;
        }
    }

    /**
     * Set and validate value on sender object
     * @param {AtomObj} senderObj - The object to set value on
     * @param {string} propName - The property key
     * @param {*} value - The value to set
     * @returns {boolean} success
     */
    setPropValue(senderObj, propName, value) {
        // Type coercion/validation
        switch (this.data_type) {
            case 'boolean':
                value = !!value;
                break;
            case 'integer':
                value = parseInt(value, 10);
                if (isNaN(value)) {
                    console.warn('setPropValue: expected integer for "' + propName + '"');
                    return false;
                }
                break;
            case 'float':
                value = parseFloat(value);
                if (isNaN(value)) {
                    console.warn('setPropValue: expected float for "' + propName + '"');
                    return false;
                }
                break;
            case 'string':
                if (value !== null && value !== undefined) {
                    value = String(value);
                }
                break;
            case 'relation':
                // Accept AtomObj → store object in objects[propName], id in data
                if (value instanceof AtomObj) {
                    senderObj.objects[propName] = value;
                    value = value.id;
                }
                if (this.is_array && Array.isArray(value)) {
                    var relObjs = [];
                    value = value.map(function (v) {
                        if (v instanceof AtomObj) {
                            relObjs.push(v);
                            return v.id;
                        }
                        return v;
                    });
                    if (relObjs.length > 0) senderObj.objects[propName] = relObjs;
                }
                break;
            case 'object':
                // Accept AtomObj → store its data
                if (value instanceof AtomObj) {
                    value = value.data;
                }
                if (this.is_array && Array.isArray(value)) {
                    value = value.map(function (v) {
                        return v instanceof AtomObj ? v.data : v;
                    });
                }
                break;
        }

        // Required check
        if (this.required && (value === null || value === undefined || value === '')) {
            console.warn('setPropValue: "' + propName + '" is required');
        }

        senderObj.data[propName] = value;
        return true;
    }
}


// ═══════════════════════════════════════════════════════════════════════════
// ATOM STORAGE
// ═══════════════════════════════════════════════════════════════════════════

class AtomStorage extends AtomObj {
    static CLASS_ID = '@storage';

    class_id = '@storage';
    url = null;
    type = null;
}


// ═══════════════════════════════════════════════════════════════════════════
// ELEMENT STORE
// ═══════════════════════════════════════════════════════════════════════════

class ElementStore {

    constructor(id, seed) {
        this.id = id;
        this.objects = {};
        this.storage = null;  // AtomStorage for remote operations

        // Seed: construct each element via setObject
        seed = seed || seedData;
        var self = this;
        Object.values(seed).forEach(function (raw) {
            self.setObject(raw);
        });
    }

    /** Resolve JS constructor for a class_id (walks extends_id chain) */
    resolveConstructor(classId) {
        if (classRegistry[classId]) return classRegistry[classId];
        var cls = this.objects[classId];
        if (cls && cls.data && cls.data.extends_id) {
            return this.resolveConstructor(cls.data.extends_id);
        }
        return null;
    }

    /** Find prop definition by walking extends_id chain */
    findPropDef(classId, key) {
        var visited = {};
        var cid = classId;
        while (cid && !visited[cid]) {
            visited[cid] = true;
            var propObj = this.objects[cid + '.' + key];
            if (propObj) return propObj;
            var classObj = this.objects[cid];
            cid = (classObj && classObj.data) ? classObj.data.extends_id || null : null;
        }
        return null;
    }

    /** Collect all prop definitions for a class (inherited, child overrides parent) */
    collectClassProps(classId) {
        var visited = {};
        var propsByKey = {};
        var chain = [];
        var cid = classId;
        while (cid && !visited[cid]) {
            visited[cid] = true;
            chain.push(cid);
            var classObj = this.objects[cid];
            cid = (classObj && classObj.data) ? classObj.data.extends_id || null : null;
        }
        var objs = this.objects;
        for (var i = chain.length - 1; i >= 0; i--) {
            var prefix = chain[i] + '.';
            Object.keys(objs).forEach(function(k) {
                if (k.indexOf(prefix) === 0 && objs[k].class_id === '@prop') {
                    propsByKey[k.substring(prefix.length)] = objs[k];
                }
            });
        }
        return Object.values(propsByKey);
    }

    // Get object — local first, then fetch remote
    // classId is optional optimization hint — without it, uses /find/{id} endpoint
    getObject(id, classId) {
        var obj = this.objects[id];
        if (obj) return obj;

        // Fetch from remote storage if configured
        if (this.storage) {
            var raw = this.fetchRemote(id, classId);
            if (raw) {
                obj = new AtomObj(raw, this);
                this.objects[id] = obj;
                return obj;
            }
        }

        return null;
    }

    // Get class definition
    getClass(classId) {
        var obj = this.getObject(classId);
        if (!obj) {
            throw new Error('getClass: class not found: ' + classId);
        }
        return obj;
    }

    // Save object to store (local + remote)
    setObject(obj) {
        if (!(obj instanceof AtomObj)) {
            if (!obj.class_id) {
                throw new Error('setObject: class_id is required');
            }
            obj = new AtomObj(obj, this);
        }

        // Store locally
        this.objects[obj.id] = obj;

        // Save to remote if storage configured
        if (this.storage) {
            this.saveRemote(obj);
        }

        return obj;
    }

    // Find objects by filter
    find(filter) {
        var results = [];
        Object.values(this.objects).forEach(function (obj) {
            var match = true;
            Object.keys(filter).forEach(function (k) {
                if (obj[k] !== filter[k]) match = false;
            });
            if (match) results.push(obj);
        });
        return results;
    }

    // ═══════════════════════════════════════════════════════════════════
    // APPLY REMOTE — merge external data into existing objects
    // ═══════════════════════════════════════════════════════════════════

    /**
     * Apply external/remote data to an existing object.
     * Merges fields, updates snapshot (marks clean), triggers syncToDom.
     * If object doesn't exist, creates it via setObject.
     * @param {Object} raw - Data with at least {id, class_id}
     * @returns {AtomObj}
     */
    applyRemote(raw) {
        if (!raw || !raw.id) throw new Error('applyRemote: id is required');

        var existing = this.objects[raw.id];
        if (existing) {
            // Merge fields into existing data
            Object.keys(raw).forEach(function (k) {
                existing.data[k] = raw[k];
            });
            // Update snapshot — external data = clean state
            existing._snapshot = JSON.parse(JSON.stringify(existing.data));
            // Sync DOM if this is an AtomElement
            if (typeof existing.syncToDom === 'function') existing.syncToDom();
            return existing;
        }

        // Object doesn't exist yet — create it
        return this.setObject(raw);
    }

    /**
     * Save all objects that have unsaved changes.
     * Updates snapshots after saving.
     * @returns {Array} list of saved object ids
     */
    saveDirty() {
        var saved = [];
        var self = this;
        Object.values(this.objects).forEach(function (obj) {
            if (obj.hasChanges && obj.hasChanges()) {
                if (self.storage) self.saveRemote(obj);
                obj._snapshot = JSON.parse(JSON.stringify(obj.data));
                saved.push(obj.id);
            }
        });
        return saved;
    }

    // ═══════════════════════════════════════════════════════════════════
    // REMOTE STORAGE
    // API: http://master.local/elementStore/api/store/{class_id}/{id}
    // ═══════════════════════════════════════════════════════════════════

    fetchRemote(id, classId) {
        if (!this.storage || !this.storage.url) return null;

        var url;
        if (classId) {
            // Direct fetch: /store/{class}/{id}
            url = this.storage.url + '/store/' + encodeURIComponent(classId) + '/' + encodeURIComponent(id);
        } else {
            // Derive class_id from dot-prefix (e.g. '@class.name' → '@class')
            var dotIndex = id.indexOf('.');
            if (dotIndex > 0) {
                url = this.storage.url + '/store/' + encodeURIComponent(id.substring(0, dotIndex)) + '/' + encodeURIComponent(id);
            } else {
                // No class hint — use cross-class find endpoint
                url = this.storage.url + '/find/' + encodeURIComponent(id);
            }
        }

        try {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', url, false); // sync
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.send();
            if (xhr.status === 200) {
                return JSON.parse(xhr.responseText);
            }
        } catch (e) {
            console.warn('fetchRemote failed for ' + id + ':', e.message);
        }
        return null;
    }

    /** @param {AtomObj} obj */
    saveRemote(obj) {
        if (!this.storage || !this.storage.url) return;

        var classId = obj.class_id;
        var id = obj.id;
        var url = this.storage.url + '/store/' + encodeURIComponent(classId) + '/' + encodeURIComponent(id);

        try {
            var xhr = new XMLHttpRequest();
            xhr.open('PUT', url, false); // sync
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.setRequestHeader('X-Allow-Custom-Ids', 'true');
            xhr.send(JSON.stringify(obj.data));
            if (xhr.status >= 400) {
                console.warn('saveRemote failed for ' + id + ': HTTP ' + xhr.status);
            }
        } catch (e) {
            console.warn('saveRemote failed for ' + id + ':', e.message);
        }
    }
}


// ═══════════════════════════════════════════════════════════════════════════
// REGISTER CLASSES
// ═══════════════════════════════════════════════════════════════════════════

registerClass('@class', AtomClass);
registerClass('@prop', AtomProp);
registerClass('@storage', AtomStorage);


// ═══════════════════════════════════════════════════════════════════════════
// ENVIRONMENT EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        seedData,
        classRegistry,
        registerClass,
        AtomObj,
        AtomClass,
        AtomProp,
        AtomStorage,
        AtomCollection,
        ElementStore,
    };
}

if (typeof window !== 'undefined') {
    window.seedData = seedData;
    window.classRegistry = classRegistry;
    window.registerClass = registerClass;
    window.AtomObj = AtomObj;
    window.AtomClass = AtomClass;
    window.AtomProp = AtomProp;
    window.AtomStorage = AtomStorage;
    window.AtomCollection = AtomCollection;
    window.ElementStore = ElementStore;

    // initialize
    store = new ElementStore('root.store');
    window.store = store;  // expose for F12 console
    storage = new AtomStorage({id: 'root.storage', class_id: '@storage', url: 'http://master.local/elementStore/api'}, store);
    store.storage = storage;
}
