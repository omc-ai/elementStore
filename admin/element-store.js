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
    // System classes
    '@class':   {id: '@class',   class_id: '@class', name: 'Class', is_system: true},
    '@prop':    {id: '@prop',    class_id: '@class', name: 'Property', is_system: true},
    '@storage': {id: '@storage', class_id: '@class', name: 'Storage', is_system: true},
    '@editor':  {id: '@editor',  class_id: '@class', name: 'Editor', is_system: true},

    // ── @class props ──
    '@class.name':        {id: '@class.name',        class_id: '@prop', key: 'name', required: true, display_order: 1},
    '@class.description': {id: '@class.description', class_id: '@prop', key: 'description', field_type: 'textarea', display_order: 2},
    '@class.extends_id':  {id: '@class.extends_id',  class_id: '@prop', key: 'extends_id', data_type: 'relation', object_class_id: ['@class'], create_only: true, display_order: 3},
    '@class.props':       {id: '@class.props',       class_id: '@prop', key: 'props', data_type: 'object', is_array: true, object_class_id: ['@prop'], display_order: 4},
    '@class.storage_id':  {id: '@class.storage_id',  class_id: '@prop', key: 'storage_id', data_type: 'relation', object_class_id: ['@storage'], display_order: 5},
    '@class.table_name':  {id: '@class.table_name',  class_id: '@prop', key: 'table_name', display_order: 6},
    '@class.is_system':   {id: '@class.is_system',   class_id: '@prop', key: 'is_system', data_type: 'boolean', readonly: true, default_value: false, display_order: 7},

    // ── @prop props ──
    '@prop.key':                 {id: '@prop.key',                 class_id: '@prop', key: 'key', required: true, display_order: 1},
    '@prop.label':               {id: '@prop.label',               class_id: '@prop', key: 'label', display_order: 1.5},
    '@prop.name':                {id: '@prop.name',                class_id: '@prop', key: 'name', display_order: 2},
    '@prop.description':         {id: '@prop.description',         class_id: '@prop', key: 'description', field_type: 'textarea', display_order: 3},
    '@prop.data_type':           {id: '@prop.data_type',           class_id: '@prop', key: 'data_type', options: {values: ['string','boolean','integer','float','datetime','object','relation','function']}, default_value: 'string', display_order: 4},
    '@prop.is_array':            {id: '@prop.is_array',            class_id: '@prop', key: 'is_array', data_type: 'boolean', default_value: false, display_order: 5},
    '@prop.object_class_id':     {id: '@prop.object_class_id',     class_id: '@prop', key: 'object_class_id', data_type: 'relation', is_array: true, object_class_id: ['@class'], display_order: 6},
    '@prop.object_class_strict': {id: '@prop.object_class_strict', class_id: '@prop', key: 'object_class_strict', data_type: 'boolean', default_value: false, display_order: 7},
    '@prop.on_orphan':           {id: '@prop.on_orphan',           class_id: '@prop', key: 'on_orphan', options: {values: ['keep', 'delete']}, default_value: 'keep', display_order: 8},
    '@prop.options':             {id: '@prop.options',             class_id: '@prop', key: 'options', data_type: 'object', display_order: 7},
    '@prop.field_type':          {id: '@prop.field_type',          class_id: '@prop', key: 'field_type', data_type: 'relation', object_class_id: ['@editor'], display_order: 8},
    '@prop.required':            {id: '@prop.required',            class_id: '@prop', key: 'required', data_type: 'boolean', default_value: false, display_order: 9},
    '@prop.readonly':            {id: '@prop.readonly',            class_id: '@prop', key: 'readonly', data_type: 'boolean', default_value: false, display_order: 10},
    '@prop.create_only':         {id: '@prop.create_only',         class_id: '@prop', key: 'create_only', data_type: 'boolean', default_value: false, display_order: 11},
    '@prop.default_value':       {id: '@prop.default_value',       class_id: '@prop', key: 'default_value', display_order: 12},
    '@prop.display_order':       {id: '@prop.display_order',       class_id: '@prop', key: 'display_order', data_type: 'integer', default_value: 0, display_order: 13},
    '@prop.group_name':          {id: '@prop.group_name',          class_id: '@prop', key: 'group_name', display_order: 14},
    '@prop.hidden':              {id: '@prop.hidden',              class_id: '@prop', key: 'hidden', data_type: 'boolean', default_value: false, display_order: 15},
    '@prop.server_only':         {id: '@prop.server_only',         class_id: '@prop', key: 'server_only', data_type: 'boolean', default_value: false, display_order: 16},
    '@prop.master_only':         {id: '@prop.master_only',         class_id: '@prop', key: 'master_only', data_type: 'boolean', default_value: false, display_order: 17},

    // ── @storage props ──
    '@storage.name': {id: '@storage.name', class_id: '@prop', key: 'name', required: true, display_order: 1},
    '@storage.url':  {id: '@storage.url',  class_id: '@prop', key: 'url', field_type: 'url', display_order: 2},
    '@storage.type': {id: '@storage.type', class_id: '@prop', key: 'type', options: {values: ['local', 'rest', 'couchdb', 'mysql', 'json']}, default_value: 'rest', display_order: 3},

    // ── @editor props ──
    '@editor.name':        {id: '@editor.name',        class_id: '@prop', key: 'name', required: true, display_order: 1},
    '@editor.description': {id: '@editor.description', class_id: '@prop', key: 'description', field_type: 'textarea', display_order: 2},
    '@editor.data_types':  {id: '@editor.data_types',  class_id: '@prop', key: 'data_types', is_array: true, options: {values: ['string','boolean','integer','float','datetime','object','relation','function']}, required: true, display_order: 3},
    '@editor.is_default':  {id: '@editor.is_default',  class_id: '@prop', key: 'is_default', data_type: 'boolean', default_value: false, display_order: 4},
    '@editor.props':       {id: '@editor.props',       class_id: '@prop', key: 'props', data_type: 'object', is_array: true, object_class_id: ['@prop'], display_order: 5},

    // Built-in storage types
    'local': {id: 'local', class_id: '@storage', name: 'Local', type: 'local'},
};


// ═══════════════════════════════════════════════════════════════════════════
// LOCAL ID GENERATOR
// ═══════════════════════════════════════════════════════════════════════════

var _localIdCounter = 0;
function generateLocalId() {
    return '_' + (++_localIdCounter) + '_' + Math.random().toString(36).substr(2, 6);
}


// ═══════════════════════════════════════════════════════════════════════════
// NORMALIZE CLASS IDS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Normalize object_class_id to array|null.
 * Accepts string, array, null/undefined. Always returns array or null.
 * @param {*} val
 * @returns {string[]|null}
 */
function normalizeClassIds(val) {
    if (val === null || val === undefined) return null;
    if (Array.isArray(val)) return val.length > 0 ? val : null;
    if (typeof val === 'string' && val) return [val];
    return null;
}


// ═══════════════════════════════════════════════════════════════════════════
// BUILT-IN VALIDATORS
// ═══════════════════════════════════════════════════════════════════════════

var _validators = {
    email: function(val) {
        if (!val) return null;
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val) ? null : 'Invalid email address';
    },
    url: function(val) {
        if (!val) return null;
        try { new URL(val); return null; } catch (e) { return 'Invalid URL'; }
    },
    phone: function(val) {
        if (!val) return null;
        return /^[+]?[\d\s\-().]{7,20}$/.test(val) ? null : 'Invalid phone number';
    },
    json: function(val) {
        if (!val) return null;
        try { JSON.parse(val); return null; } catch (e) { return 'Invalid JSON'; }
    },
    regex: function(val, params) {
        if (!val || !params || !params.pattern) return null;
        try {
            return new RegExp(params.pattern).test(val) ? null : 'Does not match pattern';
        } catch (e) { return null; }
    },
    range: function(val, params) {
        if (val === null || val === undefined || !params) return null;
        var num = parseFloat(val);
        if (isNaN(num)) return null;
        if (params.min !== undefined && num < params.min) return 'Minimum is ' + params.min;
        if (params.max !== undefined && num > params.max) return 'Maximum is ' + params.max;
        return null;
    },
    length: function(val, params) {
        if (!val || !params) return null;
        var len = String(val).length;
        if (params.min_length !== undefined && len < params.min_length) return 'Minimum length is ' + params.min_length;
        if (params.max_length !== undefined && len > params.max_length) return 'Maximum length is ' + params.max_length;
        return null;
    },
    date_range: function(val, params) {
        if (!val || !params) return null;
        if (params.min_date && val < params.min_date) return 'Date must be after ' + params.min_date;
        if (params.max_date && val > params.max_date) return 'Date must be before ' + params.max_date;
        return null;
    },
    enum_value: function(val, params) {
        if (!val || !params || !params.values) return null;
        return params.values.indexOf(val) >= 0 ? null : 'Must be one of: ' + params.values.join(', ');
    }
};


// ═══════════════════════════════════════════════════════════════════════════
// JWT TOKEN MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

var _jwtToken = null;

/**
 * Set the JWT token for API authentication.
 * @param {string|null} token - JWT Bearer token, or null to clear
 */
function setJwtToken(token) {
    _jwtToken = token;
}

/**
 * Get the current JWT token.
 * @returns {string|null}
 */
function getJwtToken() {
    return _jwtToken;
}


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
        this._onAdd = [];
        this._onRemove = [];
    }

    /** Register callback for item additions */
    onAdd(fn) { this._onAdd.push(fn); return this; }

    /** Register callback for item removals */
    onRemove(fn) { this._onRemove.push(fn); return this; }

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

    /** Add item to collection (accepts raw object or AtomObj) */
    add(obj) {
        if (!(obj instanceof AtomObj) && this._store) {
            if (this._classId && !obj.class_id) {
                obj.class_id = this._classId;
            }
            obj = new AtomObj(obj, this._store);
        }
        this._items.push(obj);
        // Fire onAdd hooks
        var hooks = this._onAdd;
        for (var h = 0; h < hooks.length; h++) hooks[h](obj);
        return obj;
    }

    /** Remove item by key */
    remove(key) {
        for (var i = 0; i < this._items.length; i++) {
            if (this._items[i].key === key) {
                var removed = this._items.splice(i, 1)[0];
                var hooks = this._onRemove;
                for (var h = 0; h < hooks.length; h++) hooks[h](removed);
                return true;
            }
        }
        return false;
    }

    /** Remove item by id */
    removeById(id) {
        for (var i = 0; i < this._items.length; i++) {
            if (this._items[i].id === id) {
                var removed = this._items.splice(i, 1)[0];
                var hooks = this._onRemove;
                for (var h = 0; h < hooks.length; h++) hooks[h](removed);
                return true;
            }
        }
        return false;
    }

    /**
     * Move an item to a new index position within the collection.
     * Splices from old position, inserts at new. Marks parent dirty.
     * @param {AtomObj|Object} item - The item to move (matched by reference or id)
     * @param {number} newIndex - Target index (0-based)
     * @returns {boolean} true if moved successfully
     */
    setItemIndex(item, newIndex) {
        var oldIndex = -1;
        var itemId = item.id || item._id;
        for (var i = 0; i < this._items.length; i++) {
            var cur = this._items[i];
            if (cur === item || (itemId && (cur.id === itemId || cur._id === itemId))) {
                oldIndex = i;
                break;
            }
        }
        if (oldIndex === -1 || oldIndex === newIndex) return false;

        // Clamp newIndex
        if (newIndex < 0) newIndex = 0;
        if (newIndex >= this._items.length) newIndex = this._items.length - 1;

        // Splice out and insert at new position
        var removed = this._items.splice(oldIndex, 1)[0];
        this._items.splice(newIndex, 0, removed);

        // Mark the item as order-changed for dirty tracking
        if (removed && removed._orderChanged !== undefined) {
            removed._orderChanged = true;
        }
        return true;
    }

    /**
     * Save all dirty children, then trigger parent sync + save.
     * Convenience method for batch-saving collection changes.
     */
    save() {
        if (!this._store) throw new Error('AtomCollection.save: no store');
        // Save dirty items
        for (var i = 0; i < this._items.length; i++) {
            var item = this._items[i];
            if (item && typeof item.hasChanges === 'function' && item.hasChanges()) {
                item.save();
            }
        }
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
    /** @type {string} client-local identity, never sent to server */
    _id = null;
    /** @type {AtomObj[]} all related AtomObj instances */
    _related = [];
    /** @type {AtomObj[]} subset of _related needing save */
    _dirtyRelated = [];
    /** @type {AtomObj[]} parent objects that own this object */
    _belongsTo = [];
    /** @type {Function[]} onChange callbacks: fn({obj, prop, value, oldValue}) */
    _onChange = [];

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
        this._id = generateLocalId();
        this._related = [];
        this._dirtyRelated = [];
        this._belongsTo = [];
        this._onChange = [];

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

        // Normalize object_class_id to array|null
        if (raw.object_class_id !== undefined) {
            raw.object_class_id = normalizeClassIds(raw.object_class_id);
        }

        // Load class definition from store (null during seed bootstrap)
        this._class = this.store ? (this.store.getObject(raw.class_id) || null) : null;

        var proxy = new Proxy(this, {
            get: function (target, prop, receiver) {
                // internal fields — bypass data
                if (prop === 'store' || prop === 'data' || prop === 'objects' || prop === '_class' || prop === '_snapshot' || prop === '_id' || prop === '_related' || prop === '_dirtyRelated' || prop === '_belongsTo' || prop === '_onChange' || prop === 'el') return target[prop];
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
                if (prop === 'store' || prop === 'data' || prop === 'objects' || prop === '_class' || prop === '_snapshot' || prop === '_id' || prop === '_related' || prop === '_dirtyRelated' || prop === '_belongsTo' || prop === '_onChange' || prop === 'el') {
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
                // Notify parents this object is dirty
                if (target._belongsTo && target._belongsTo.length > 0) {
                    var self = target;
                    target._belongsTo.forEach(function(parent) {
                        if (parent._dirtyRelated.indexOf(self) === -1) {
                            parent._dirtyRelated.push(self);
                        }
                    });
                }
                var oldVal = target.data[prop];
                target.data[prop] = val;
                // Fire onChange callbacks
                if (target._onChange && target._onChange.length > 0) {
                    var info = {obj: target, prop: prop, value: val, oldValue: oldVal};
                    target._onChange.forEach(function(fn) { fn(info); });
                }
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

    /** Save to store — recursive, children-first (updates snapshot) */
    save() {
        if (!this.store) throw new Error('save: no store assigned');

        // 1. Save dirty related objects first (children before parent)
        var dirtyList = this._dirtyRelated.slice();
        for (var i = 0; i < dirtyList.length; i++) {
            dirtyList[i].save();
        }
        this._dirtyRelated = [];

        // 2. Rebuild raw ID arrays for relation properties from _related objects
        this._syncRelationIds();

        // 3. Register locally
        var key = this.id || this._id;
        this.store.objects[key] = this;

        // 4. Persist via class-resolved storage
        var storage = this.store._resolveStorage(this.data.class_id);
        if (storage && storage.url) {
            this.store.saveRemote(this, storage);
        }

        this._snapshot = JSON.parse(JSON.stringify(this.data));
    }

    /** Walk relation props, rebuild raw ID arrays/values from actual objects */
    _syncRelationIds() {
        if (!this.store || !this._class) return;
        var data = this.data;
        var objects = this.objects;
        var props = this.store.collectClassProps(this.data.class_id);
        props.forEach(function(propObj) {
            if (propObj.data_type !== 'relation') return;
            var dotIdx = propObj.id.lastIndexOf('.');
            var key = dotIdx >= 0 ? propObj.id.substring(dotIdx + 1) : propObj.id;
            var relObjs = objects[key];
            if (!relObjs) return;
            if (propObj.is_array && Array.isArray(relObjs)) {
                data[key] = relObjs.map(function(o) { return o.id || o._id; });
            } else if (relObjs instanceof AtomObj) {
                data[key] = relObjs.id || relObjs._id;
            }
        });
    }

    /**
     * Add a child object to an array-relation property.
     * Registers in objects[propName], _related, _belongsTo, _dirtyRelated, and data[propName].
     * @param {string} propName - Relation property key (e.g. 'children')
     * @param {AtomObj} child - The child object to add
     */
    addChild(propName, child) {
        // Init objects array if needed
        if (!this.objects[propName]) this.objects[propName] = [];
        // Avoid duplicates
        var childKey = child.id || child._id;
        for (var i = 0; i < this.objects[propName].length; i++) {
            var existing = this.objects[propName][i];
            if (existing === child || existing.id === childKey || existing._id === childKey) return;
        }
        this.objects[propName].push(child);
        // Register relation links
        if (this._related.indexOf(child) === -1) this._related.push(child);
        if (child._belongsTo.indexOf(this) === -1) child._belongsTo.push(this);
        if (this._dirtyRelated.indexOf(child) === -1) this._dirtyRelated.push(child);
        // Keep data array in sync (will be rebuilt by _syncRelationIds on save, but useful for UI reads)
        if (!this.data[propName]) this.data[propName] = [];
        if (this.data[propName].indexOf(childKey) === -1) this.data[propName].push(childKey);
    }

    /**
     * Remove a child object from an array-relation property.
     * @param {string} propName - Relation property key
     * @param {AtomObj} child - The child to remove
     */
    removeChild(propName, child) {
        var childKey = child.id || child._id;
        // Remove from objects array
        if (this.objects[propName]) {
            this.objects[propName] = this.objects[propName].filter(function(o) {
                return o !== child && o.id !== childKey && o._id !== childKey;
            });
        }
        // Remove from _related
        var idx = this._related.indexOf(child);
        if (idx >= 0) this._related.splice(idx, 1);
        // Remove from child's _belongsTo
        idx = child._belongsTo.indexOf(this);
        if (idx >= 0) child._belongsTo.splice(idx, 1);
        // Remove from _dirtyRelated
        idx = this._dirtyRelated.indexOf(child);
        if (idx >= 0) this._dirtyRelated.splice(idx, 1);
        // Remove from data array
        if (this.data[propName]) {
            idx = this.data[propName].indexOf(childKey);
            if (idx >= 0) this.data[propName].splice(idx, 1);
        }
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

    /**
     * Validate all props on this object (advisory — server is final authority).
     * Returns null if valid, or { propKey: ['error', ...], ... } if invalid.
     * @returns {Object|null}
     */
    validate() {
        if (!this.store) return null;
        var props = this.store.collectClassProps(this.data.class_id);
        if (!props || props.length === 0) return null;
        var data = this.data;
        var errors = {};
        props.forEach(function(propObj) {
            var key = propObj.data ? propObj.data.key : propObj.key;
            if (!key) {
                var dotIdx = (propObj.data ? propObj.data.id : propObj.id || '').lastIndexOf('.');
                key = dotIdx >= 0 ? (propObj.data ? propObj.data.id : propObj.id).substring(dotIdx + 1) : null;
            }
            if (!key) return;
            var propErrors = [];
            var val = data[key];
            var pData = propObj.data || propObj;

            // Required check
            if (pData.required && (val === null || val === undefined || val === '')) {
                propErrors.push(key + ' is required');
            }

            // Type check (only if value is present)
            if (val !== null && val !== undefined && val !== '') {
                switch (pData.data_type) {
                    case 'integer':
                        if (typeof val === 'string') val = parseInt(val, 10);
                        if (typeof val !== 'number' || isNaN(val) || !isFinite(val)) {
                            propErrors.push(key + ' must be an integer');
                        }
                        break;
                    case 'float':
                        if (typeof val === 'string') val = parseFloat(val);
                        if (typeof val !== 'number' || isNaN(val)) {
                            propErrors.push(key + ' must be a number');
                        }
                        break;
                    case 'boolean':
                        // Coerce — no error for truthy/falsy
                        break;
                    case 'string':
                        if (typeof val !== 'string') {
                            propErrors.push(key + ' must be a string');
                        }
                        break;
                }

                // Options.values check (enum constraint)
                var opts = pData.options;
                if (opts && opts.values && Array.isArray(opts.values) && opts.values.length > 0) {
                    if (opts.values.indexOf(val) < 0 && !(opts.allow_custom)) {
                        propErrors.push(key + ' must be one of: ' + opts.values.join(', '));
                    }
                }

                // String length checks
                if (pData.data_type === 'string' && typeof val === 'string') {
                    if (opts && opts.min_length !== undefined && val.length < opts.min_length) {
                        propErrors.push(key + ' minimum length is ' + opts.min_length);
                    }
                    if (opts && opts.max_length !== undefined && val.length > opts.max_length) {
                        propErrors.push(key + ' maximum length is ' + opts.max_length);
                    }
                    if (opts && opts.pattern) {
                        try {
                            if (!new RegExp(opts.pattern).test(val)) {
                                propErrors.push(key + ' does not match pattern');
                            }
                        } catch (e) { /* ignore invalid regex */ }
                    }
                }

                // Number range checks
                if ((pData.data_type === 'integer' || pData.data_type === 'float') && typeof val === 'number') {
                    if (opts && opts.min !== undefined && val < opts.min) {
                        propErrors.push(key + ' minimum is ' + opts.min);
                    }
                    if (opts && opts.max !== undefined && val > opts.max) {
                        propErrors.push(key + ' maximum is ' + opts.max);
                    }
                }
            }

            if (propErrors.length > 0) errors[key] = propErrors;
        });
        return Object.keys(errors).length > 0 ? errors : null;
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
    field_type = null;
    required = false;
    readonly = false;
    create_only = false;
    default_value = null;
    display_order = 0;
    group_name = null;
    hidden = false;
    master_only = false;
    server_only = false;

    /**
     * Get typed value from sender object
     * @param {AtomObj} senderObj - The object that holds the value
     * @param {string} propName - The property key
     * @returns {*} object | AtomCollection | AtomObj[] | AtomObj | string | boolean | number | function
     */
    getPropValue(senderObj, propName) {
        // Computed order_id: if item is in a parent's collection, return its index
        if (propName === 'order_id' && senderObj._belongsTo && senderObj._belongsTo.length > 0) {
            var parent = senderObj._belongsTo[0];
            if (parent && parent.objects) {
                var keys = Object.keys(parent.objects);
                for (var ki = 0; ki < keys.length; ki++) {
                    var arr = parent.objects[keys[ki]];
                    if (Array.isArray(arr)) {
                        var idx = arr.indexOf(senderObj);
                        if (idx === -1) {
                            // Try matching by id
                            for (var si = 0; si < arr.length; si++) {
                                if (arr[si].id === senderObj.id || arr[si]._id === senderObj._id) {
                                    idx = si;
                                    break;
                                }
                            }
                        }
                        if (idx >= 0) return idx;
                    }
                }
            }
        }

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
                    var arrCls = Array.isArray(this.data.object_class_id) ? this.data.object_class_id[0] : this.data.object_class_id;
                    return new AtomCollection(val, store, arrCls);
                }
                if (typeof val === 'object' && this.data.object_class_id && store) {
                    var objCls = val._class_id || (Array.isArray(this.data.object_class_id) ? this.data.object_class_id[0] : this.data.object_class_id);
                    if (!val.class_id) val.class_id = objCls;
                    return new AtomObj(val, store);
                }
                return val;
            case 'relation':
                if (!store) return val;
                if (this.is_array && Array.isArray(val)) {
                    // Build/update objects array from _related + store lookups
                    if (!senderObj.objects[propName]) {
                        var items = [];
                        val.forEach(function (refId) {
                            // First check _related, then store
                            var found = null;
                            for (var i = 0; i < senderObj._related.length; i++) {
                                var r = senderObj._related[i];
                                if (r.id === refId || r._id === refId) { found = r; break; }
                            }
                            if (!found && store) found = store.getObject(refId);
                            if (found) items.push(found);
                        });
                        senderObj.objects[propName] = items;
                    }
                    return new AtomCollection(senderObj.objects[propName], store, this.object_class_id);
                }
                // single relation → objects[propName] = AtomObj
                if (!senderObj.objects[propName]) {
                    // Check _related first
                    var found = null;
                    for (var i = 0; i < senderObj._related.length; i++) {
                        var r = senderObj._related[i];
                        if (r.id === val || r._id === val) { found = r; break; }
                    }
                    if (!found) found = store.getObject(val);
                    if (found) senderObj.objects[propName] = found;
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
                    // Register in _related and _belongsTo
                    if (senderObj._related.indexOf(value) === -1) {
                        senderObj._related.push(value);
                    }
                    if (value._belongsTo.indexOf(senderObj) === -1) {
                        value._belongsTo.push(senderObj);
                    }
                    if (value.hasChanges && value.hasChanges()) {
                        if (senderObj._dirtyRelated.indexOf(value) === -1) {
                            senderObj._dirtyRelated.push(value);
                        }
                    }
                    value = value.id || value._id;
                }
                if (this.is_array && Array.isArray(value)) {
                    var relObjs = [];
                    value = value.map(function (v) {
                        if (v instanceof AtomObj) {
                            relObjs.push(v);
                            // Register in _related and _belongsTo
                            if (senderObj._related.indexOf(v) === -1) {
                                senderObj._related.push(v);
                            }
                            if (v._belongsTo.indexOf(senderObj) === -1) {
                                v._belongsTo.push(senderObj);
                            }
                            if (v.hasChanges && v.hasChanges()) {
                                if (senderObj._dirtyRelated.indexOf(v) === -1) {
                                    senderObj._dirtyRelated.push(v);
                                }
                            }
                            return v.id || v._id;
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

    constructor(id, seedOverride) {
        this.id = id;
        this.objects = {};
        this.storage = null;  // AtomStorage for remote operations

        // Seed core definitions
        this.seed(seedOverride || seedData);
    }

    /** Seed data into the store (creates objects without triggering remote save) */
    seed(data) {
        var self = this;
        Object.values(data).forEach(function (raw) {
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

    // Register object in store (local memory only — use obj.save() to persist)
    setObject(obj) {
        if (!(obj instanceof AtomObj)) {
            if (!obj.class_id) {
                throw new Error('setObject: class_id is required');
            }
            obj = new AtomObj(obj, this);
        }

        // Store locally — key by id if available, otherwise _id
        var key = obj.id || obj._id;
        this.objects[key] = obj;

        return obj;
    }

    /**
     * Resolve the storage for a class by walking the extends_id chain.
     * Returns the class-level storage if set, otherwise falls back to store.storage.
     * @param {string} classId
     * @returns {AtomStorage|null}
     */
    _resolveStorage(classId) {
        var visited = {};
        var cid = classId;
        while (cid && !visited[cid]) {
            visited[cid] = true;
            var classObj = this.objects[cid];
            if (!classObj) break;
            if (classObj.data && classObj.data.storage_id) {
                return this.objects[classObj.data.storage_id] || null;
            }
            cid = (classObj.data) ? classObj.data.extends_id || null : null;
        }
        return this.storage; // default store-level storage
    }

    /**
     * Find objects by filter.
     * Supports simple equality and $in operator for array matching.
     * @example store.find({ class_id: '@class' })
     * @example store.find({ class_id: { $in: ['@editor-input', '@editor-selector'] } })
     */
    find(filter) {
        var results = [];
        Object.values(this.objects).forEach(function (obj) {
            var match = true;
            var objData = obj.data || obj;
            Object.keys(filter).forEach(function (k) {
                var filterVal = filter[k];
                var objVal = objData[k] !== undefined ? objData[k] : obj[k];
                if (filterVal && typeof filterVal === 'object' && filterVal.$in) {
                    if (filterVal.$in.indexOf(objVal) < 0) match = false;
                } else {
                    if (objVal !== filterVal) match = false;
                }
            });
            if (match) results.push(obj);
        });
        return results;
    }

    /**
     * Set JWT token for authenticated API calls.
     * @param {string|null} token - JWT Bearer token
     */
    setToken(token) {
        setJwtToken(token);
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
                var storage = self._resolveStorage(obj.data ? obj.data.class_id : obj.class_id);
                if (storage && storage.url) self.saveRemote(obj, storage);
                obj._snapshot = JSON.parse(JSON.stringify(obj.data));
                saved.push(obj.id || obj._id);
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
            if (_jwtToken) {
                xhr.setRequestHeader('Authorization', 'Bearer ' + _jwtToken);
            }
            xhr.send();
            if (xhr.status === 200) {
                return JSON.parse(xhr.responseText);
            }
        } catch (e) {
            console.warn('fetchRemote failed for ' + id + ':', e.message);
        }
        return null;
    }

    /**
     * @param {AtomObj} obj
     * @param {AtomStorage} [storage] - Storage to use (defaults to store.storage)
     */
    saveRemote(obj, storage) {
        var st = storage || this.storage;
        if (!st || !st.url) return;

        var classId = obj.class_id;
        var id = obj.id;
        var isNew = !id;
        var url, method;

        if (isNew) {
            url = st.url + '/store/' + encodeURIComponent(classId);
            method = 'POST';
        } else {
            url = st.url + '/store/' + encodeURIComponent(classId) + '/' + encodeURIComponent(id);
            method = 'PUT';
        }

        try {
            var xhr = new XMLHttpRequest();
            xhr.open(method, url, false); // sync
            xhr.setRequestHeader('Content-Type', 'application/json');
            if (_jwtToken) {
                xhr.setRequestHeader('Authorization', 'Bearer ' + _jwtToken);
            }
            if (!isNew) xhr.setRequestHeader('X-Allow-Custom-Ids', 'true');
            xhr.send(JSON.stringify(obj.data));

            if (xhr.status >= 200 && xhr.status < 300) {
                var response = JSON.parse(xhr.responseText);
                if (isNew && response.id) {
                    // Re-key: _id → id
                    var oldKey = obj._id;
                    obj.data.id = response.id;
                    this.objects[obj.id] = obj;
                    delete this.objects[oldKey];
                }
                // Merge server fields (created_at, updated_at, etc.)
                var self = this;
                Object.keys(response).forEach(function(k) {
                    obj.data[k] = response[k];
                });
            } else {
                console.warn('saveRemote failed: HTTP ' + xhr.status);
            }
        } catch (e) {
            console.warn('saveRemote failed:', e.message);
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
        generateLocalId,
        normalizeClassIds,
        setJwtToken,
        getJwtToken,
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
    window.generateLocalId = generateLocalId;
    window.normalizeClassIds = normalizeClassIds;
    window.setJwtToken = setJwtToken;
    window.getJwtToken = getJwtToken;
    window.AtomObj = AtomObj;
    window.AtomClass = AtomClass;
    window.AtomProp = AtomProp;
    window.AtomStorage = AtomStorage;
    window.AtomCollection = AtomCollection;
    window.ElementStore = ElementStore;

    // initialize
    store = new ElementStore('root.store');
    window.store = store;  // expose for F12 console
    storage = new AtomStorage({id: 'root.storage', class_id: '@storage', url: (typeof API_BASE !== 'undefined' ? API_BASE : '')}, store);
    store.storage = storage;
}
