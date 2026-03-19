"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __esm = (fn, res) => function __init() {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // src/types.ts
  function normalizeArrayMode(mode) {
    if (mode === true || mode === "indexed") return "indexed";
    if (mode === "assoc") return "assoc";
    return "false";
  }
  function isElementStoreError(response) {
    return typeof response === "object" && response !== null && "code" in response && "message" in response;
  }
  var init_types = __esm({
    "src/types.ts"() {
      "use strict";
    }
  });

  // src/modules/ElementStoreClient.ts
  var ElementStoreClient_exports = {};
  __export(ElementStoreClient_exports, {
    ElementStoreApiError: () => ElementStoreApiError,
    ElementStoreClient: () => ElementStoreClient,
    elementStoreClient: () => elementStoreClient,
    extractGenesisClasses: () => extractGenesisClasses
  });
  function _resolveDefaultBaseUrl() {
    if (_nodeProcess == null ? void 0 : _nodeProcess.env) {
      return _nodeProcess.env["ELEMENT_STORE_URL"] || "https://arc3d.master.local/elementStore";
    }
    if (typeof import_meta !== "undefined" && import_meta.env) {
      const env = import_meta.env;
      const apiBase = (env.BASE_URL || "/").replace(/\/$/, "");
      return env.VITE_ELEMENT_STORE_URL || `${apiBase}/api/esProxy`;
    }
    return "/api/esProxy";
  }
  function extractGenesisClasses(genesis) {
    if (Array.isArray(genesis)) return genesis;
    return genesis.classes || genesis["@class"] || [];
  }
  async function handleResponse(response) {
    if (!response.ok) {
      let errorData = null;
      try {
        errorData = await response.json();
      } catch {
      }
      const message = (errorData == null ? void 0 : errorData.message) || `ElementStore API error: ${response.status} ${response.statusText}`;
      const code = (errorData == null ? void 0 : errorData.code) || "API_ERROR";
      console.error("[ElementStore] API Error:", {
        status: response.status,
        statusText: response.statusText,
        url: response.url,
        error: errorData
      });
      throw new ElementStoreApiError(message, code, response.status, errorData == null ? void 0 : errorData.details);
    }
    if (response.status === 204) {
      return null;
    }
    const data = await response.json();
    if (isElementStoreError(data)) {
      throw new ElementStoreApiError(data.message, data.code, response.status, data.details);
    }
    return data;
  }
  async function _fetchMaybeTimeout(url, options = {}) {
    const { timeout, ...init } = options;
    if (!timeout) return fetch(url, init);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
  }
  var import_meta, _nodeProcess, ElementStoreApiError, ElementStoreClient, elementStoreClient;
  var init_ElementStoreClient = __esm({
    "src/modules/ElementStoreClient.ts"() {
      "use strict";
      init_types();
      import_meta = {};
      _nodeProcess = typeof globalThis !== "undefined" ? globalThis.process : void 0;
      ElementStoreApiError = class extends Error {
        constructor(message, code, status, details) {
          super(message);
          __publicField(this, "code");
          __publicField(this, "status");
          __publicField(this, "details");
          this.name = "ElementStoreApiError";
          this.code = code;
          this.status = status;
          this.details = details;
        }
      };
      ElementStoreClient = class {
        constructor(baseUrl, token, timeout) {
          __publicField(this, "baseUrl");
          __publicField(this, "token");
          __publicField(this, "timeout");
          this.baseUrl = baseUrl || _resolveDefaultBaseUrl();
          this.token = token;
          this.timeout = timeout;
        }
        setToken(token) {
          this.token = token != null ? token : void 0;
        }
        get _headers() {
          const headers = { "Content-Type": "application/json" };
          if (this.token) headers["Authorization"] = `Bearer ${this.token}`;
          return headers;
        }
        _fetch(url, init = {}) {
          return _fetchMaybeTimeout(url, {
            ...init,
            headers: { ...this._headers, ...init.headers || {} },
            timeout: this.timeout
          });
        }
        // ── Class Operations ────────────────────────────────────────────────────
        async getClasses() {
          const res = await this._fetch(`${this.baseUrl}/class`);
          return handleResponse(res);
        }
        async getClass(classId) {
          try {
            const res = await this._fetch(`${this.baseUrl}/class/${encodeURIComponent(classId)}`);
            return handleResponse(res);
          } catch (e) {
            if (e instanceof ElementStoreApiError && e.status === 404) return null;
            throw e;
          }
        }
        async getClassWithProps(classId) {
          try {
            const res = await this._fetch(`${this.baseUrl}/class/${encodeURIComponent(classId)}/props`);
            return handleResponse(res);
          } catch (e) {
            if (e instanceof ElementStoreApiError && e.status === 404) return null;
            throw e;
          }
        }
        async upsertClass(classData) {
          const res = await this._fetch(`${this.baseUrl}/class`, {
            method: "POST",
            body: JSON.stringify(classData)
          });
          return handleResponse(res);
        }
        async deleteClass(classId) {
          try {
            const res = await this._fetch(`${this.baseUrl}/class/${encodeURIComponent(classId)}`, { method: "DELETE" });
            await handleResponse(res);
            return true;
          } catch (e) {
            if (e instanceof ElementStoreApiError && e.status === 404) return false;
            throw e;
          }
        }
        // ── Object Operations ────────────────────────────────────────────────────
        async getObjects(classId) {
          const res = await this._fetch(`${this.baseUrl}/store/${encodeURIComponent(classId)}`);
          return handleResponse(res);
        }
        async getObject(classId, id) {
          try {
            const res = await this._fetch(
              `${this.baseUrl}/store/${encodeURIComponent(classId)}/${encodeURIComponent(id)}`
            );
            return handleResponse(res);
          } catch (e) {
            if (e instanceof ElementStoreApiError && e.status === 404) return null;
            throw e;
          }
        }
        async createObject(classId, data) {
          const res = await this._fetch(`${this.baseUrl}/store/${encodeURIComponent(classId)}`, {
            method: "POST",
            body: JSON.stringify(data)
          });
          return handleResponse(res);
        }
        async updateObject(classId, id, data) {
          const res = await this._fetch(
            `${this.baseUrl}/store/${encodeURIComponent(classId)}/${encodeURIComponent(id)}`,
            { method: "PUT", body: JSON.stringify(data) }
          );
          return handleResponse(res);
        }
        async deleteObject(classId, id) {
          try {
            const res = await this._fetch(
              `${this.baseUrl}/store/${encodeURIComponent(classId)}/${encodeURIComponent(id)}`,
              { method: "DELETE" }
            );
            await handleResponse(res);
            return true;
          } catch (e) {
            if (e instanceof ElementStoreApiError && e.status === 404) return false;
            throw e;
          }
        }
        // ── Query Operations ─────────────────────────────────────────────────────
        async query(classId, filters = {}, options = {}) {
          const params = new URLSearchParams();
          for (const [key, value] of Object.entries(filters)) {
            if (value !== void 0 && value !== null) params.append(key, String(value));
          }
          if (options.page !== void 0) params.append("page", String(options.page));
          if (options.pageSize !== void 0) params.append("pageSize", String(options.pageSize));
          if (options.sortBy) params.append("sortBy", options.sortBy);
          if (options.sortOrder) params.append("sortOrder", options.sortOrder);
          const qs = params.toString();
          const url = `${this.baseUrl}/query/${encodeURIComponent(classId)}${qs ? `?${qs}` : ""}`;
          const res = await this._fetch(url);
          return handleResponse(res);
        }
        async queryPaginated(classId, filters = {}, options = {}) {
          const params = new URLSearchParams();
          for (const [key, value] of Object.entries(filters)) {
            if (value !== void 0 && value !== null) params.append(key, String(value));
          }
          const page = options.page || 1;
          const pageSize = options.pageSize || 50;
          params.append("page", String(page));
          params.append("pageSize", String(pageSize));
          if (options.sortBy) params.append("sortBy", options.sortBy);
          if (options.sortOrder) params.append("sortOrder", options.sortOrder);
          const url = `${this.baseUrl}/query/${encodeURIComponent(classId)}?${params.toString()}`;
          const res = await this._fetch(url);
          const total = parseInt(res.headers.get("X-Total-Count") || "0", 10);
          const data = await handleResponse(res);
          return {
            data,
            total: total || data.length,
            page,
            pageSize,
            totalPages: Math.ceil((total || data.length) / pageSize)
          };
        }
        // ── Batch Operations ─────────────────────────────────────────────────────
        async batchUpdate(updates) {
          const results = [];
          for (const update of updates) {
            try {
              const result = await this.updateObject(update.classId, update.id, update.data);
              results.push(result);
            } catch (e) {
              console.error(`[ElementStore] Batch update failed for ${update.classId}/${update.id}:`, e);
            }
          }
          return results;
        }
        async batchCreate(items) {
          const results = [];
          for (const item of items) {
            try {
              const result = await this.createObject(item.classId, item.data);
              results.push(result);
            } catch (e) {
              console.error(`[ElementStore] Batch create failed for ${item.classId}:`, e);
            }
          }
          return results;
        }
        // ── Health Check ─────────────────────────────────────────────────────────
        async healthCheck() {
          try {
            const res = await this._fetch(`${this.baseUrl}/info`);
            if (res.ok) {
              const data = await res.json();
              return { ok: data.ok !== false, timestamp: (/* @__PURE__ */ new Date()).toISOString(), ...data };
            }
            return { ok: false, message: `ElementStore returned status ${res.status}`, timestamp: (/* @__PURE__ */ new Date()).toISOString() };
          } catch (e) {
            return {
              ok: false,
              message: e instanceof Error ? e.message : "Unknown error",
              timestamp: (/* @__PURE__ */ new Date()).toISOString()
            };
          }
        }
        // ── Genesis Operations ────────────────────────────────────────────────────
        async getGenesis() {
          const res = await this._fetch(`${this.baseUrl}/genesis`);
          return handleResponse(res);
        }
        async getGenesisClassIds() {
          const res = await this._fetch(`${this.baseUrl}/genesis/classes`);
          return handleResponse(res);
        }
        async validateGenesis() {
          const res = await this._fetch(`${this.baseUrl}/genesis/validate`);
          return handleResponse(res);
        }
        async seedGenesis(force) {
          const url = `${this.baseUrl}/genesis/seed${force ? "?force=true" : ""}`;
          const res = await this._fetch(url, { method: "POST", body: JSON.stringify({}) });
          return handleResponse(res);
        }
        // ── Prop Operations ───────────────────────────────────────────────────────
        /** Get props for a class */
        async getClassProps(classId) {
          const res = await this._fetch(`${this.baseUrl}/class/${encodeURIComponent(classId)}/props`);
          return handleResponse(res);
        }
        // ── Configuration ────────────────────────────────────────────────────────
        get baseUrlValue() {
          return this.baseUrl;
        }
      };
      elementStoreClient = new ElementStoreClient();
      if (typeof globalThis !== "undefined") {
        globalThis.__elementStoreClient = elementStoreClient;
      }
    }
  });

  // src/core/AtomObj.ts
  var INTERNAL_FIELDS = /* @__PURE__ */ new Set([
    "store",
    "data",
    "objects",
    "_class",
    "_snapshot",
    "_id",
    "_related",
    "_dirtyRelated",
    "_belongsTo",
    "_onChange",
    "_renderVersion",
    "el",
    "_autoSaveTimer"
  ]);
  var _localIdCounter = 0;
  function generateLocalId() {
    return "_" + ++_localIdCounter + "_" + Math.random().toString(36).substr(2, 6);
  }
  var _AtomObj = class _AtomObj {
    constructor(raw, store2) {
      __publicField(this, "store", null);
      __publicField(this, "data", {});
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      __publicField(this, "objects", {});
      __publicField(this, "_class", null);
      __publicField(this, "_snapshot", null);
      __publicField(this, "_id", "");
      __publicField(this, "_related", []);
      __publicField(this, "_dirtyRelated", []);
      __publicField(this, "_belongsTo", null);
      __publicField(this, "_onChange", []);
      if (new.target === _AtomObj && store2) {
        const cid = typeof raw === "string" ? raw : raw == null ? void 0 : raw.class_id;
        if (cid) {
          const Ctor = store2.resolveConstructor(cid);
          if (Ctor && Ctor !== _AtomObj) {
            return new Ctor(raw, store2);
          }
        }
      }
      this.store = store2 || null;
      this.objects = {};
      this._related = [];
      this._dirtyRelated = [];
      this._belongsTo = null;
      this._onChange = [];
      if (typeof raw === "string") {
        raw = { class_id: raw };
      }
      this._id = (raw == null ? void 0 : raw._id) || (raw == null ? void 0 : raw.id) || generateLocalId();
      if (raw == null ? void 0 : raw._id) delete raw._id;
      if (!raw || typeof raw !== "object" || !raw.class_id) {
        throw new Error("AtomObj: class_id is required");
      }
      this.data = raw;
      this._class = this.store ? this.store.getObject(raw.class_id) || null : null;
      const proxy = new Proxy(this, {
        get(target, prop, receiver) {
          if (typeof prop === "symbol") return target[prop];
          if (INTERNAL_FIELDS.has(prop)) return target[prop];
          if (typeof target[prop] === "function") {
            return target[prop].bind(receiver);
          }
          if (!target._class && target.store) {
            target._class = target.store.getObject(target.data.class_id) || null;
          }
          if (target._class && target.store && prop !== "id" && prop !== "class_id") {
            const propDef = target.store.findPropDef(target.data.class_id, prop);
            if (propDef && typeof propDef.getPropValue === "function") {
              return propDef.getPropValue(target, prop);
            }
          }
          if (prop in target.data) {
            return target.data[prop];
          }
          return target[prop];
        },
        set(target, prop, val) {
          if (INTERNAL_FIELDS.has(prop)) {
            target[prop] = val;
            return true;
          }
          if (target._class && target.store && prop !== "id" && prop !== "class_id") {
            const classId = target.data.class_id;
            if (classId) {
              const propDef = target.store.findPropDef(classId, prop);
              if (propDef && typeof propDef.setPropValue === "function") {
                return propDef.setPropValue(target, prop, val);
              }
              if (target.store.collectClassProps(classId).length > 0) {
              }
            }
          }
          if (target._belongsTo) {
            if (target._belongsTo._dirtyRelated.indexOf(target) === -1) {
              target._belongsTo._dirtyRelated.push(target);
            }
          }
          const oldVal = target.data[prop];
          target.data[prop] = val;
          console.log(
            `%c[AtomObj.set]%c ${target._id} .${prop}`,
            "background: #8b5cf6; color: white; padding: 1px 6px; border-radius: 3px;",
            "",
            { old: oldVal, new: val, class_id: target.data.class_id }
          );
          if (typeof target._renderVersion === "number") target._renderVersion++;
          if (target._onChange && target._onChange.length > 0) {
            const info = { obj: target, prop, value: val, oldValue: oldVal };
            for (const fn of target._onChange) {
              fn(info);
            }
          }
          return true;
        }
      });
      this._applyDefaults();
      if (this.data.id) {
        this._snapshot = JSON.parse(JSON.stringify(this.data));
      } else {
        this._snapshot = null;
      }
      return proxy;
    }
    // --- Class introspection ---
    /**
     * Check if this object's class extends (inherits from) the given ancestor class.
     * Works on both instances and class definitions:
     *   instance.extendsFrom('core:baseContainer')  → checks instance's class chain
     *   classObj.extendsFrom('core:baseElement')     → checks this class's own chain
     */
    extendsFrom(ancestorClassId) {
      if (!this.store) return false;
      if (this.data.class_id === "@class") {
        return this.store.classExtends(this.data.id, ancestorClassId);
      }
      return this.store.classExtends(this.data.class_id, ancestorClassId);
    }
    /**
     * Get the inheritance chain for this object's class.
     * Returns array of class IDs from this class up to the root.
     */
    getInheritanceChain() {
      if (!this.store) return [];
      const classId = this.data.class_id === "@class" ? this.data.id : this.data.class_id;
      return this.store.getInheritanceChain(classId);
    }
    /**
     * Get resolved defaults for this object's class (merged from all ancestors).
     * Child class defaults override parent defaults.
     */
    getClassDefaults() {
      if (!this.store) return {};
      const classId = this.data.class_id === "@class" ? this.data.id : this.data.class_id;
      return this.store.getResolvedDefaults(classId);
    }
    // --- Property introspection ---
    /** Get prop definitions for this object's class (includes inherited) */
    getProps() {
      if (!this.store) return [];
      return this.store.collectClassProps(this.data.class_id);
    }
    /** Get a specific prop definition by key (walks inheritance) */
    getPropDef(key) {
      if (!this.store) return null;
      return this.store.findPropDef(this.data.class_id, key);
    }
    /** Apply default values from class definition (includes inherited).
     *  1. Class-level `defaults` block (merged from inheritance chain)
     *  2. Property-level `default_value` from each @prop definition
     *  Only fills keys that are `undefined` in data. */
    _applyDefaults() {
      if (!this.store) return;
      const classId = this.data.class_id;
      if (!classId) return;
      const data = this.data;
      const classDefaults = this.store.getResolvedDefaults(classId);
      for (const [key, val] of Object.entries(classDefaults)) {
        if (data[key] === void 0 && val !== void 0 && val !== null) {
          data[key] = val;
        }
      }
      const props = this.store.collectClassProps(classId);
      for (const propObj of props) {
        const dotIdx = propObj.data.id.lastIndexOf(".");
        const key = dotIdx >= 0 ? propObj.data.id.substring(dotIdx + 1) : propObj.data.id;
        if (data[key] === void 0) {
          const def = propObj.data.default_value;
          if (def !== void 0 && def !== null) {
            data[key] = def;
          }
        }
      }
    }
    // --- Change tracking ---
    /** Check if data changed since load */
    hasChanges() {
      if (!this._snapshot) return true;
      return JSON.stringify(this.data) !== JSON.stringify(this._snapshot);
    }
    /** Get changed fields (diff vs snapshot) */
    getChanges() {
      if (!this._snapshot) return { ...this.data };
      const changes = {};
      const data = this.data;
      const snap = this._snapshot;
      for (const k of Object.keys(data)) {
        if (JSON.stringify(data[k]) !== JSON.stringify(snap[k])) {
          changes[k] = data[k];
        }
      }
      for (const k of Object.keys(snap)) {
        if (!(k in data)) {
          changes[k] = null;
        }
      }
      return changes;
    }
    // --- Persistence ---
    /** Save this object and its dirty relations via store.setObject.
     *  Relations delegate to their parent — only the parent talks to storage.
     *  The storage adapter handles the cascade (children first, then self). */
    async save() {
      if (!this.store) throw new Error("save: no store assigned");
      if (this._belongsTo) {
        return this._belongsTo.save();
      }
      this._syncRelationIds();
      await this.store.saveObjectAsync(this);
    }
    /** Walk relation props, rebuild raw ID arrays/values from actual objects.
     *  Uses data.id (server-assigned) when available, falls back to _id (local). */
    _syncRelationIds() {
      var _a;
      if (!this.store || !this._class) return;
      const data = this.data;
      const objects = this.objects;
      const props = this.store.collectClassProps(this.data.class_id);
      for (const propObj of props) {
        if (propObj.data.data_type !== "relation") continue;
        const dotIdx = propObj.data.id.lastIndexOf(".");
        const key = dotIdx >= 0 ? propObj.data.id.substring(dotIdx + 1) : propObj.data.id;
        const relObjs = objects[key];
        if (!relObjs) continue;
        const isArr = propObj.data.is_array === true || propObj.data.is_array === "indexed";
        if (isArr && Array.isArray(relObjs)) {
          data[key] = relObjs.map((o) => {
            var _a2;
            return (_a2 = o.data.id) != null ? _a2 : o._id;
          });
        } else if (relObjs instanceof _AtomObj) {
          data[key] = (_a = relObjs.data.id) != null ? _a : relObjs._id;
        }
      }
    }
    /** Soft delete: mark as deleted, then save */
    delete() {
      this.data._deleted = true;
      this.save();
    }
    /** Get related objects that have unsaved changes */
    getDirtyObjects() {
      const dirty = [];
      for (const [, val] of Object.entries(this.objects)) {
        if (Array.isArray(val)) {
          for (const obj of val) {
            if (obj && obj.hasChanges && obj.hasChanges()) dirty.push(obj);
          }
        } else if (val && val.hasChanges && val.hasChanges()) {
          dirty.push(val);
        }
      }
      return dirty;
    }
    /** Serialize to plain object */
    toJSON() {
      return this.data;
    }
    // --- ReactiveElement-compatible interface ---
    // These methods allow consumers to use AtomObj with the same API
    // that was previously provided by ReactiveElement.
    /** Get raw data (ReactiveElement compatibility) */
    getData() {
      return this.data;
    }
    /** Subscribe to changes, returns unsubscribe function (ReactiveElement compatibility) */
    subscribe(callback) {
      const handler = () => callback();
      this._onChange.push(handler);
      return () => {
        const idx = this._onChange.indexOf(handler);
        if (idx >= 0) this._onChange.splice(idx, 1);
      };
    }
    /** Update data (merge). Goes through the Proxy setter for each key,
     *  so propDef validation, dirty tracking, _renderVersion, and _onChange all fire. */
    update(updates) {
      console.log(
        `%c[AtomObj.update]%c ${this._id}`,
        "background: #f59e0b; color: black; padding: 1px 6px; border-radius: 3px;",
        "",
        updates,
        { class_id: this.data.class_id, listeners: this._onChange.length }
      );
      for (const [k, v] of Object.entries(updates)) {
        this[k] = v;
      }
    }
    // --- Convenience accessors (for TypeScript typing) ---
    get id() {
      return this.data.id;
    }
    get class_id() {
      return this.data.class_id;
    }
  };
  __publicField(_AtomObj, "CLASS_ID", "@atom");
  var AtomObj = _AtomObj;

  // src/core/AtomCollection.ts
  var AtomCollection = class {
    constructor(items, store2, classId, owner, propKey) {
      __publicField(this, "_items");
      __publicField(this, "_store");
      __publicField(this, "_classId");
      __publicField(this, "_owner");
      __publicField(this, "_propKey");
      this._items = items;
      this._store = store2 || null;
      this._classId = classId || null;
      this._owner = owner || null;
      this._propKey = propKey || null;
      return new Proxy(this, {
        get(target, prop, receiver) {
          if (typeof prop === "string") {
            const num = Number(prop);
            if (Number.isInteger(num) && num >= 0 && num < target._items.length) {
              return target._wrap(num);
            }
          }
          return Reflect.get(target, prop, receiver);
        }
      });
    }
    get length() {
      return this._items.length;
    }
    /** Find item by key field */
    get(key) {
      for (let i = 0; i < this._items.length; i++) {
        if (this._items[i].key === key) {
          return this._wrap(i);
        }
      }
      return null;
    }
    /** Find item by id field */
    getById(id) {
      for (let i = 0; i < this._items.length; i++) {
        if (this._items[i].id === id) {
          return this._wrap(i);
        }
      }
      return null;
    }
    /** Filter items by object filter */
    find(filter) {
      const results = [];
      for (let i = 0; i < this._items.length; i++) {
        const item = this._items[i];
        let match = true;
        for (const k of Object.keys(filter)) {
          if (item[k] !== filter[k]) {
            match = false;
            break;
          }
        }
        if (match) results.push(this._wrap(i));
      }
      return results;
    }
    /** Iterate items as AtomObj */
    forEach(fn) {
      for (let i = 0; i < this._items.length; i++) {
        fn(this._wrap(i), i);
      }
    }
    /** Map items as AtomObj */
    map(fn) {
      const results = [];
      for (let i = 0; i < this._items.length; i++) {
        results.push(fn(this._wrap(i), i));
      }
      return results;
    }
    /**
     * Add item to collection.
     * - Empty call → creates new object with _classId
     * - Raw data → wraps as AtomObj with class_id from _classId
     * - AtomObj → validates class compatibility
     *
     * Wires bidirectional binding when owner is set:
     * - child._belongsTo = owner
     * - owner._related ← child
     * - child.owner_id = owner.id
     * - Syncs ID to owner.data[propKey] for React chain
     * - Fires owner._onChange for React notification
     */
    add(obj) {
      if (!obj) {
        if (!this._classId) throw new Error("AtomCollection.add(): no classId for empty add");
        obj = { class_id: this._classId };
      }
      if (!(obj instanceof AtomObj) && this._classId && !obj.class_id) {
        obj.class_id = this._classId;
      }
      if (!(obj instanceof AtomObj)) {
        if (!this._store) throw new Error("AtomCollection.add(): no store");
        obj = new AtomObj(obj, this._store);
      }
      const atomObj = obj;
      if (this._store && this._classId) {
        const childClassId = atomObj.data.class_id;
        if (childClassId && !this._store.classExtends(childClassId, this._classId)) {
          console.warn(`AtomCollection.add(): ${childClassId} does not extend ${this._classId}`);
        }
      }
      if (this._owner) {
        atomObj._belongsTo = this._owner;
        if (this._owner._related.indexOf(atomObj) === -1) {
          this._owner._related.push(atomObj);
        }
        if (atomObj.hasChanges && atomObj.hasChanges()) {
          if (this._owner._dirtyRelated.indexOf(atomObj) === -1) {
            this._owner._dirtyRelated.push(atomObj);
          }
        }
        if (this._owner.data.id) {
          atomObj.data.owner_id = this._owner.data.id;
        }
      }
      this._items.push(atomObj);
      if (this._store) {
        this._store.objects[atomObj._id] = atomObj;
      }
      this._syncIdToOwnerData(atomObj);
      this._notifyOwner();
      this._fireOnAdd(atomObj);
      return atomObj;
    }
    /** Remove item by key */
    remove(key) {
      for (let i = 0; i < this._items.length; i++) {
        if (this._items[i].key === key) {
          const removed = this._items.splice(i, 1)[0];
          this._removeIdFromOwnerData(removed);
          this._notifyOwner();
          this._fireOnRemove(removed);
          return true;
        }
      }
      return false;
    }
    /** Remove item by id */
    removeById(id) {
      for (let i = 0; i < this._items.length; i++) {
        const item = this._items[i];
        const itemId = item instanceof AtomObj ? item._id : item.id;
        if (itemId === id) {
          const removed = this._items.splice(i, 1)[0];
          this._removeIdFromOwnerData(removed);
          this._notifyOwner();
          this._fireOnRemove(removed);
          return true;
        }
      }
      return false;
    }
    /** Move an item to a new index position within the collection */
    setItemIndex(item, newIndex) {
      let oldIndex = -1;
      const itemId = item.id || item._id;
      for (let i = 0; i < this._items.length; i++) {
        const cur = this._items[i];
        if (cur === item || itemId && (cur.id === itemId || cur._id === itemId)) {
          oldIndex = i;
          break;
        }
      }
      if (oldIndex === -1 || oldIndex === newIndex) return false;
      if (newIndex < 0) newIndex = 0;
      if (newIndex >= this._items.length) newIndex = this._items.length - 1;
      const removed = this._items.splice(oldIndex, 1)[0];
      this._items.splice(newIndex, 0, removed);
      if (removed && removed._orderChanged !== void 0) {
        removed._orderChanged = true;
      }
      return true;
    }
    /** Save collection through its owner (parent handles cascade).
     *  If no owner, falls back to saving dirty children individually. */
    save() {
      if (!this._store) throw new Error("AtomCollection.save: no store");
      if (this._owner) {
        this._owner.save();
        return;
      }
      for (const item of this._items) {
        if (item && typeof item.hasChanges === "function" && item.hasChanges()) {
          item.save();
        }
      }
    }
    /** Return raw array for serialization */
    toJSON() {
      return this._items;
    }
    // --- React additions ---
    /** Return a snapshot array of AtomObj instances for React rendering */
    snapshot() {
      return this._items.map((_, i) => this._wrap(i));
    }
    /** Iterable support for for...of */
    *[Symbol.iterator]() {
      for (let i = 0; i < this._items.length; i++) {
        yield this._wrap(i);
      }
    }
    /** Wrap raw item at index as AtomObj (factory resolves constructor) */
    _wrap(index) {
      const item = this._items[index];
      if (item instanceof AtomObj) return item;
      if (this._classId && !item.class_id) {
        item.class_id = this._classId;
      }
      return new AtomObj(item, this._store);
    }
    /** Sync added element's ID into owner.data[propKey] (raw ID array) */
    _syncIdToOwnerData(obj) {
      if (!this._owner || !this._propKey) return;
      const id = obj._id;
      if (!id) return;
      const rawArr = this._owner.data[this._propKey];
      if (Array.isArray(rawArr)) {
        if (rawArr.indexOf(id) === -1) {
          rawArr.push(id);
        }
      } else {
        this._owner.data[this._propKey] = [id];
      }
    }
    /** Remove element ID from owner.data[propKey] (raw ID array) */
    _removeIdFromOwnerData(item) {
      if (!this._owner || !this._propKey) return;
      const id = item instanceof AtomObj ? item._id : item.id || item._id;
      if (!id) return;
      const rawArr = this._owner.data[this._propKey];
      if (Array.isArray(rawArr)) {
        const idx = rawArr.indexOf(id);
        if (idx >= 0) rawArr.splice(idx, 1);
      }
    }
    /** Notify owner of collection change */
    _notifyOwner() {
      if (this._owner && this._owner._onChange.length > 0) {
        const info = { obj: this._owner, prop: this._propKey || "*", value: null, oldValue: null };
        for (const fn of this._owner._onChange) fn(info);
      }
    }
    // --- Collection hooks ---
    // Hooks are stored on owner.objects._collectionHooks[propKey] so they
    // survive AtomCollection instance recreation (AtomProp creates a new
    // AtomCollection wrapper on every property access).
    /** Fire onAdd hooks registered by subscribers (e.g. CanvasElement).
     *  Each hook runs in a try-catch so one canvas's failure doesn't block others. */
    _fireOnAdd(item) {
      var _a, _b;
      if (!this._owner || !this._propKey) return;
      const hooks = (_b = (_a = this._owner.objects._collectionHooks) == null ? void 0 : _a[this._propKey]) == null ? void 0 : _b.onAdd;
      if (!hooks) return;
      for (const [key, fn] of Object.entries(hooks)) {
        if (typeof fn === "function") {
          try {
            fn(item);
          } catch (err) {
            console.error(`[AtomCollection._fireOnAdd] Hook "${key}" threw:`, err);
          }
        }
      }
    }
    /** Fire onRemove hooks registered by subscribers.
     *  Each hook runs in a try-catch for error isolation. */
    _fireOnRemove(item) {
      var _a, _b;
      if (!this._owner || !this._propKey) return;
      const hooks = (_b = (_a = this._owner.objects._collectionHooks) == null ? void 0 : _a[this._propKey]) == null ? void 0 : _b.onRemove;
      if (!hooks) return;
      for (const [key, fn] of Object.entries(hooks)) {
        if (typeof fn === "function") {
          try {
            fn(item);
          } catch (err) {
            console.error(`[AtomCollection._fireOnRemove] Hook "${key}" threw:`, err);
          }
        }
      }
    }
  };

  // src/core/AtomClass.ts
  var AtomClass = class extends AtomObj {
    constructor(raw, store2) {
      super(raw, store2);
    }
    /** Returns all @prop objects for this class (including inherited via extends_id) */
    getProps() {
      if (!this.store) return [];
      return this.store.collectClassProps(this.data.id);
    }
  };
  __publicField(AtomClass, "CLASS_ID", "@class");

  // src/core/AtomProp.ts
  init_types();
  var AtomProp = class extends AtomObj {
    constructor(raw, store2) {
      super(raw, store2);
    }
    // ── Type helpers ──────────────────────────────────────────
    /** True when data_type is 'relation' */
    isRelation() {
      var _a, _b;
      return ((_b = (_a = this.data) == null ? void 0 : _a.data_type) != null ? _b : this.data_type) === "relation";
    }
    /** True when data_type is 'object', has target classes, and is NOT any collection */
    isEmbeddedObject() {
      var _a, _b;
      const dt = (_b = (_a = this.data) == null ? void 0 : _a.data_type) != null ? _b : this.data_type;
      return dt === "object" && this.hasTargetClasses() && this.getArrayMode() === "false";
    }
    /** True when data_type is 'relation', has target classes, and is NOT any collection (single ownership) */
    isOwnershipRelation() {
      return this.isRelation() && this.hasTargetClasses() && this.getArrayMode() === "false";
    }
    /** True when data_type is 'relation', has target classes, and IS an indexed array (many-refs) */
    isReferenceRelation() {
      return this.isRelation() && this.hasTargetClasses() && this.isIndexedArray();
    }
    /** True when object_class_id is a non-empty string or array */
    hasTargetClasses() {
      var _a;
      const oci = (_a = this.data) == null ? void 0 : _a.object_class_id;
      if (!oci) return false;
      if (Array.isArray(oci)) return oci.length > 0;
      return typeof oci === "string" && oci.length > 0;
    }
    /** Return target class IDs as an array (normalises string → [string]) */
    getTargetClasses() {
      var _a;
      const oci = (_a = this.data) == null ? void 0 : _a.object_class_id;
      if (!oci) return [];
      if (Array.isArray(oci)) return oci;
      return typeof oci === "string" ? [oci] : [];
    }
    /** First target class (convenience) */
    getPrimaryTargetClass() {
      const classes = this.getTargetClasses();
      return classes.length > 0 ? classes[0] : null;
    }
    /** True when on_orphan === 'delete' */
    shouldDeleteOnOrphan() {
      var _a, _b;
      return ((_b = (_a = this.data) == null ? void 0 : _a.on_orphan) != null ? _b : this.on_orphan) === "delete";
    }
    // ── Array mode helpers ─────────────────────────────────────
    /** Normalized array mode: 'false' | 'indexed' | 'assoc' */
    getArrayMode() {
      var _a;
      return normalizeArrayMode((_a = this.data) == null ? void 0 : _a.is_array);
    }
    /** True when is_array is true, 'indexed', or 'assoc' (any collection) */
    isCollection() {
      const mode = this.getArrayMode();
      return mode === "indexed" || mode === "assoc";
    }
    /** True when is_array is true or 'indexed' (ordered array) */
    isIndexedArray() {
      return this.getArrayMode() === "indexed";
    }
    /** True when is_array is 'assoc' (key-value map) */
    isAssocArray() {
      return this.getArrayMode() === "assoc";
    }
    // ── Value access ──────────────────────────────────────────
    /**
     * Get typed value from sender object
     */
    getPropValue(senderObj, propName) {
      var _a, _b, _c;
      if (propName === "order_id" && senderObj._belongsTo) {
        const parent = senderObj._belongsTo;
        if (parent.objects) {
          for (const key of Object.keys(parent.objects)) {
            const arr = parent.objects[key];
            if (Array.isArray(arr)) {
              let idx = arr.indexOf(senderObj);
              if (idx === -1) {
                for (let si = 0; si < arr.length; si++) {
                  if (arr[si]._id === senderObj._id) {
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
      const val = senderObj.data[propName];
      const store2 = senderObj.store;
      const dataType = this.data.data_type;
      const arrayMode = this.getArrayMode();
      const isIndexed = arrayMode === "indexed";
      const isAssoc = arrayMode === "assoc";
      if ((val === void 0 || val === null) && dataType !== "relation") return val;
      if (isAssoc && val && typeof val === "object" && !Array.isArray(val)) {
        const coerce = this._getScalarCoercer(dataType);
        if (coerce) {
          const result = {};
          for (const [k, v] of Object.entries(val)) {
            result[k] = coerce(v);
          }
          return result;
        }
        return val;
      }
      switch (dataType) {
        case "string":
          if (isIndexed && Array.isArray(val)) {
            return val.map((v) => String(v));
          }
          return String(val);
        case "boolean":
          if (isIndexed && Array.isArray(val)) {
            return val.map((v) => !!v);
          }
          return !!val;
        case "integer":
          if (isIndexed && Array.isArray(val)) {
            return val.map((v) => parseInt(v, 10) || 0);
          }
          return parseInt(val, 10) || 0;
        case "float":
        case "number":
          if (isIndexed && Array.isArray(val)) {
            return val.map((v) => parseFloat(v) || 0);
          }
          return parseFloat(val) || 0;
        case "object":
          if (isIndexed && Array.isArray(val)) {
            return new AtomCollection(val, store2, (_a = this.getPrimaryTargetClass()) != null ? _a : void 0, senderObj, propName);
          }
          if (typeof val === "object" && this.hasTargetClasses() && store2) {
            if (!val.class_id) val.class_id = this.getPrimaryTargetClass();
            return new AtomObj(val, store2);
          }
          return val;
        case "relation":
          if (!store2) return val;
          if (isIndexed) {
            if (Array.isArray(val) && val.length > 0) {
              if (!senderObj.objects[propName]) {
                const items = [];
                for (const refId of val) {
                  let found = null;
                  for (const r of senderObj._related) {
                    if (r.data.id === refId || r._id === refId) {
                      found = r;
                      break;
                    }
                  }
                  if (!found && store2) found = store2.getObject(refId);
                  if (found) items.push(found);
                }
                senderObj.objects[propName] = items;
              }
              return new AtomCollection(senderObj.objects[propName], store2, (_b = this.getPrimaryTargetClass()) != null ? _b : void 0, senderObj, propName);
            }
            if (!senderObj.objects[propName]) {
              const objectClassId = this.getPrimaryTargetClass();
              if (objectClassId && senderObj.data.id) {
                const items = store2.getElementsByClass(objectClassId).filter((obj) => obj.data.owner_id === senderObj.data.id);
                senderObj.objects[propName] = items;
              } else {
                senderObj.objects[propName] = [];
              }
            }
            return new AtomCollection(senderObj.objects[propName], store2, (_c = this.getPrimaryTargetClass()) != null ? _c : void 0, senderObj, propName);
          }
          if (val === void 0 || val === null) return val;
          if (!senderObj.objects[propName]) {
            let found = null;
            for (const r of senderObj._related) {
              if (r.data.id === val || r._id === val) {
                found = r;
                break;
              }
            }
            if (!found) found = store2.getObject(val);
            if (found) senderObj.objects[propName] = found;
          }
          return senderObj.objects[propName] || val;
        case "function":
          if (typeof val === "function") return val;
          if (typeof val === "string") {
            try {
              return new Function("return " + val)();
            } catch {
              return val;
            }
          }
          return val;
        default:
          return val;
      }
    }
    /** Helper: return a scalar coercion function for the given data_type, or null for complex types */
    _getScalarCoercer(dataType) {
      switch (dataType) {
        case "string":
          return (v) => String(v != null ? v : "");
        case "boolean":
          return (v) => !!v;
        case "integer":
          return (v) => parseInt(v, 10) || 0;
        case "float":
        case "number":
          return (v) => parseFloat(v) || 0;
        default:
          return null;
      }
    }
    /**
     * Set and validate value on sender object
     */
    setPropValue(senderObj, propName, value) {
      var _a, _b;
      const dataType = this.data.data_type;
      const arrayMode = this.getArrayMode();
      const isIndexed = arrayMode === "indexed";
      const isAssoc = arrayMode === "assoc";
      if (isAssoc && value && typeof value === "object" && !Array.isArray(value)) {
        const coerce = this._getScalarCoercer(dataType);
        if (coerce) {
          const result = {};
          for (const [k, v] of Object.entries(value)) {
            result[k] = coerce(v);
          }
          value = result;
        }
        senderObj.data[propName] = value;
        this._notifyChange(senderObj, propName, value, senderObj.data[propName]);
        return true;
      }
      switch (dataType) {
        case "boolean":
          if (isIndexed && Array.isArray(value)) {
            value = value.map((v) => !!v);
          } else {
            value = !!value;
          }
          break;
        case "integer":
          if (isIndexed && Array.isArray(value)) {
            value = value.map((v) => {
              const n = parseInt(v, 10);
              return isNaN(n) ? 0 : n;
            });
          } else {
            value = parseInt(value, 10);
            if (isNaN(value)) {
              console.warn(`setPropValue: expected integer for "${propName}"`);
              return false;
            }
          }
          break;
        case "float":
        case "number":
          if (isIndexed && Array.isArray(value)) {
            value = value.map((v) => {
              const n = parseFloat(v);
              return isNaN(n) ? 0 : n;
            });
          } else {
            value = parseFloat(value);
            if (isNaN(value)) {
              console.warn(`setPropValue: expected float for "${propName}"`);
              return false;
            }
          }
          break;
        case "string":
          if (value !== null && value !== void 0) {
            if (isIndexed && Array.isArray(value)) {
              value = value.map((v) => String(v));
            } else {
              value = String(value);
            }
          }
          break;
        case "relation":
          if (value instanceof AtomObj) {
            senderObj.objects[propName] = value;
            if (senderObj._related.indexOf(value) === -1) {
              senderObj._related.push(value);
            }
            value._belongsTo = senderObj;
            if (value.hasChanges && value.hasChanges()) {
              if (senderObj._dirtyRelated.indexOf(value) === -1) {
                senderObj._dirtyRelated.push(value);
              }
            }
            value = value._id;
          }
          if (isIndexed && Array.isArray(value)) {
            const relObjs = [];
            value = value.map((v) => {
              if (v instanceof AtomObj) {
                relObjs.push(v);
                if (senderObj._related.indexOf(v) === -1) {
                  senderObj._related.push(v);
                }
                v._belongsTo = senderObj;
                if (v.hasChanges && v.hasChanges()) {
                  if (senderObj._dirtyRelated.indexOf(v) === -1) {
                    senderObj._dirtyRelated.push(v);
                  }
                }
                return v._id;
              }
              return v;
            });
            if (relObjs.length > 0) senderObj.objects[propName] = relObjs;
          }
          break;
        case "object":
          if (value instanceof AtomObj) {
            value = value.data;
          }
          if (isIndexed && Array.isArray(value)) {
            value = value.map(
              (v) => v instanceof AtomObj ? v.data : v
            );
          }
          break;
      }
      const isRequired = (_b = (_a = this.data.flags) == null ? void 0 : _a.required) != null ? _b : this.data.required;
      if (isRequired && (value === null || value === void 0 || value === "")) {
        console.warn(`setPropValue: "${propName}" is required`);
      }
      const oldVal = senderObj.data[propName];
      senderObj.data[propName] = value;
      this._notifyChange(senderObj, propName, value, oldVal);
      return true;
    }
    /** Notify owner and fire onChange callbacks */
    _notifyChange(senderObj, propName, value, oldValue) {
      if (senderObj._belongsTo) {
        if (senderObj._belongsTo._dirtyRelated.indexOf(senderObj) === -1) {
          senderObj._belongsTo._dirtyRelated.push(senderObj);
        }
      }
      if (senderObj._onChange && senderObj._onChange.length > 0) {
        const info = { obj: senderObj, prop: propName, value, oldValue };
        for (const fn of senderObj._onChange) {
          fn(info);
        }
      }
    }
  };
  __publicField(AtomProp, "CLASS_ID", "@prop");

  // src/storage/AtomStorage.ts
  init_ElementStoreClient();
  var import_meta2 = {};
  var _AtomStorage = class _AtomStorage extends AtomObj {
    constructor(raw, store2) {
      super(raw, store2);
      // ── Auth state (used by admin dashboard and any browser client) ──
      __publicField(this, "auth", null);
      __publicField(this, "authUrl", null);
      // e.g. '/api/auth'
      __publicField(this, "onAuthRequired", null);
      __publicField(this, "_refreshing", false);
      __publicField(this, "_refreshPromise", null);
    }
    // --- Auth management ---
    /** Store auth data from login/refresh response. Syncs store token + localStorage. */
    setAuth(data) {
      var _a, _b, _c;
      this.auth = data;
      const token = (_b = (_a = data == null ? void 0 : data.tokens) == null ? void 0 : _a.accessToken) != null ? _b : null;
      (_c = this.store) == null ? void 0 : _c.setToken(token);
      try {
        if (data) {
          localStorage.setItem("es_auth", JSON.stringify(data));
        } else {
          localStorage.removeItem("es_auth");
        }
      } catch {
      }
    }
    /** Get current access token from auth state */
    getToken() {
      var _a, _b, _c;
      return (_c = (_b = (_a = this.auth) == null ? void 0 : _a.tokens) == null ? void 0 : _b.accessToken) != null ? _c : null;
    }
    /** Clear all auth state */
    clearAuth() {
      var _a;
      this.auth = null;
      (_a = this.store) == null ? void 0 : _a.setToken(null);
      try {
        localStorage.removeItem("es_auth");
      } catch {
      }
    }
    /** Restore auth from localStorage (call on app startup). Returns true if token found. */
    restoreAuth() {
      var _a, _b, _c, _d;
      try {
        const raw = localStorage.getItem("es_auth");
        if (raw) {
          this.auth = JSON.parse(raw);
          const token = (_c = (_b = (_a = this.auth) == null ? void 0 : _a.tokens) == null ? void 0 : _b.accessToken) != null ? _c : null;
          (_d = this.store) == null ? void 0 : _d.setToken(token);
          return true;
        }
      } catch {
      }
      return false;
    }
    /** Async token refresh with deduplication. Returns true if refreshed successfully. */
    refreshAuth() {
      if (this._refreshing && this._refreshPromise) return this._refreshPromise;
      this._refreshing = true;
      this._refreshPromise = this._doRefreshAsync().finally(() => {
        this._refreshing = false;
        this._refreshPromise = null;
      });
      return this._refreshPromise;
    }
    async _doRefreshAsync() {
      var _a, _b, _c, _d;
      const rt = (_b = (_a = this.auth) == null ? void 0 : _a.tokens) == null ? void 0 : _b.refreshToken;
      if (!rt || !this.authUrl) return false;
      try {
        const res = await fetch(this.authUrl + "/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken: rt })
        });
        if (!res.ok) return false;
        const data = await res.json();
        if ((_c = this.auth) == null ? void 0 : _c.tokens) {
          this.auth.tokens.accessToken = data.accessToken;
          this.auth.tokens.refreshToken = data.refreshToken;
        }
        (_d = this.store) == null ? void 0 : _d.setToken(data.accessToken);
        try {
          localStorage.setItem("es_auth", JSON.stringify(this.auth));
        } catch {
        }
        return true;
      } catch {
        return false;
      }
    }
    // --- CRUD helpers ---
    /** Resolve the crud_provider object for a given class_id */
    _resolveCrudProvider(classId) {
      var _a;
      if (!this.store) return null;
      const cls = this.store.getObject(classId);
      const providers = (_a = cls == null ? void 0 : cls.data) == null ? void 0 : _a.providers;
      if (!providers || providers.length === 0) return null;
      for (const pid of providers) {
        const prov = this.store.getObject(pid);
        if (prov && prov.data.class_id === "crud_provider") return prov;
      }
      return null;
    }
    /** Build full URL from provider base_url + endpoint pattern, substituting {id} */
    _buildCrudUrl(provider, endpointKey, id) {
      var _a;
      const baseUrl = provider.data.base_url || "";
      const pattern = provider.data[endpointKey] || "";
      let url = baseUrl + pattern;
      if (id) url = url.replace("{id}", id);
      const apiBase = (typeof import_meta2 !== "undefined" && ((_a = import_meta2.env) == null ? void 0 : _a.BASE_URL) || "/").replace(/\/$/, "");
      return apiBase + url;
    }
    /** Get auth headers (JWT from store) */
    _getAuthHeaders() {
      var _a;
      const headers = { "Content-Type": "application/json" };
      const token = (_a = this.store) == null ? void 0 : _a.getToken();
      if (token) headers["Authorization"] = `Bearer ${token}`;
      return headers;
    }
    // --- Composite helpers ---
    /** Resolve a storage reference (string ID) to an AtomStorage instance */
    _resolveStorage(storageId) {
      if (!this.store) return null;
      const obj = this.store.objects[storageId];
      return obj instanceof _AtomStorage ? obj : null;
    }
    /** Get write storage for composite type */
    _getWriteStorage() {
      const writeId = this.data.write;
      return writeId ? this._resolveStorage(writeId) : null;
    }
    /** Get ordered read storage chain for composite type */
    _getReadChain() {
      const read = this.data.read;
      const ids = Array.isArray(read) ? read : typeof read === "string" ? [read] : [];
      const result = [];
      for (const id of ids) {
        const s = this._resolveStorage(id);
        if (s) result.push(s);
      }
      return result;
    }
    // --- API helpers ---
    /** POST object to remote API, apply server-assigned ID + re-key in store */
    _applyServerResponse(obj, response) {
      if (!(response == null ? void 0 : response.id)) return;
      const oldId = obj._id;
      const serverId = String(response.id);
      obj.data.id = response.id;
      obj._id = serverId;
      obj._snapshot = JSON.parse(JSON.stringify(obj.data));
      if (obj.store) {
        obj.store.objects[serverId] = obj;
        if (serverId !== oldId) delete obj.store.objects[oldId];
      }
    }
    // --- Storage interface ---
    /** Persist object to this storage (fire-and-forget — use setObjectAsync for awaitable) */
    setObject(obj) {
      this.setObjectAsync(obj).catch(() => {
      });
    }
    /**
     * Awaitable persist with relation cascade.
     * Works the same for any storage type (api, local, crud).
     *
     * New parent (no server ID):
     *   1. Create parent (with empty relation arrays)
     *   2. Create children (set back-ref to parent ID)
     *   3. Update parent with child IDs
     *
     * Existing parent:
     *   1. Create/update dirty children
     *   2. Update parent with child IDs
     */
    async setObjectAsync(obj) {
      const type = this.data.type;
      if (type === "composite") {
        const writeStorage = this._getWriteStorage();
        if (writeStorage) await writeStorage.setObjectAsync(obj);
        return;
      }
      if (!obj.store) {
        await this._persistSingle(obj);
        return;
      }
      const relationMeta = this._getRelationMeta(obj);
      if (relationMeta.length === 0) {
        await this._persistSingle(obj);
        return;
      }
      const isNew = !obj._snapshot;
      if (isNew) {
        const stashed = {};
        for (const rm of relationMeta) {
          stashed[rm.key] = obj.data[rm.key];
          obj.data[rm.key] = [];
        }
        await this._persistSingle(obj);
        for (const rm of relationMeta) {
          obj.data[rm.key] = stashed[rm.key];
        }
      }
      for (const rm of relationMeta) {
        const children = obj.objects[rm.key];
        if (!Array.isArray(children)) continue;
        for (const child of children) {
          if (!(child instanceof AtomObj)) continue;
          if (rm.backRefKey && obj.data.id) {
            child.data[rm.backRefKey] = obj.data.id;
          }
          if (child.hasChanges()) {
            await this._persistSingle(child);
          }
        }
      }
      obj._syncRelationIds();
      await this._persistSingle(obj);
    }
    /** Get relation metadata for an object's class */
    _getRelationMeta(obj) {
      if (!obj.store) return [];
      const result = [];
      const props = obj.store.collectClassProps(obj.data.class_id);
      const parentClassId = obj.data.class_id;
      for (const propObj of props) {
        const arrMode = propObj.data.is_array;
        if (propObj.data.data_type !== "relation" || !(arrMode === true || arrMode === "indexed")) continue;
        const dotIdx = propObj.data.id.lastIndexOf(".");
        const key = dotIdx >= 0 ? propObj.data.id.substring(dotIdx + 1) : propObj.data.id;
        const targetClassId = propObj.data.object_class_id;
        if (!targetClassId) continue;
        let backRefKey = null;
        const childProps = obj.store.collectClassProps(targetClassId);
        for (const cp of childProps) {
          if (cp.data.data_type !== "relation" || cp.data.is_array === true || cp.data.is_array === "indexed" || cp.data.is_array === "assoc") continue;
          const targets = Array.isArray(cp.data.object_class_id) ? cp.data.object_class_id : [cp.data.object_class_id];
          if (targets.includes(parentClassId)) {
            const di = cp.data.id.lastIndexOf(".");
            backRefKey = di >= 0 ? cp.data.id.substring(di + 1) : cp.data.id;
            break;
          }
        }
        result.push({ key, classId: targetClassId, backRefKey });
      }
      return result;
    }
    /** Persist a single object (no cascade). Handles type routing. */
    async _persistSingle(obj) {
      var _a, _b;
      const id = obj.data.id;
      const isNew = !obj._snapshot;
      if (!id && !isNew) {
        console.warn(`[AtomStorage] SKIP \u2014 no data.id on ${obj._id} (class=${obj.data.class_id})`);
        return;
      }
      const type = this.data.type;
      console.log(
        `%c[AtomStorage]%c ${this._id}(${type}) \u2192 ${id || obj._id} class=${obj.data.class_id} isNew=${isNew}`,
        "background: #6366f1; color: white; padding: 1px 6px; border-radius: 3px;",
        ""
      );
      if (type === "composite") {
        const writeStorage = this._getWriteStorage();
        console.log(`  composite \u2192 write=${(writeStorage == null ? void 0 : writeStorage._id) || "null"}`);
        if (writeStorage) await writeStorage._persistSingle(obj);
        return;
      }
      if (type === "seed") return;
      if (type === "local") {
        if (!id) return;
        try {
          let dataToSave = obj.data;
          if (this.data.exclude_readonly && obj.store) {
            const classId = obj.data.class_id;
            const allProps = obj.store.collectClassProps(classId);
            const readonlyKeys = /* @__PURE__ */ new Set();
            for (const p of allProps) {
              if ((_b = (_a = p.data.flags) == null ? void 0 : _a.readonly) != null ? _b : p.data.readonly) readonlyKeys.add(p.data.key);
            }
            if (readonlyKeys.size > 0) {
              dataToSave = {};
              for (const [k, v] of Object.entries(obj.data)) {
                if (!readonlyKeys.has(k)) dataToSave[k] = v;
              }
            }
          }
          localStorage.setItem(`es:${id}`, JSON.stringify(dataToSave));
        } catch {
        }
      } else if (type === "api") {
        const classId = obj.data.class_id;
        if (isNew) {
          console.log(`  api \u2192 CREATE ${classId} (local: ${obj._id})`);
          const response = await elementStoreClient.createObject(classId, obj.data);
          this._applyServerResponse(obj, response);
        } else {
          console.log(`  api \u2192 UPDATE ${classId}/${id}`);
          try {
            await elementStoreClient.updateObject(classId, id, obj.data);
            obj._snapshot = JSON.parse(JSON.stringify(obj.data));
          } catch (e) {
            if ((e == null ? void 0 : e.status) === 404) {
              console.log(`  api \u2192 UPDATE 404, falling back to CREATE ${classId}/${id}`);
              const response = await elementStoreClient.createObject(classId, obj.data);
              this._applyServerResponse(obj, response);
            } else {
              throw e;
            }
          }
        }
      } else if (type === "crud") {
        const classId = obj.data.class_id;
        const provider = this._resolveCrudProvider(classId);
        if (!provider) return;
        const endpointKey = isNew ? "create_one" : "update_one";
        const method = isNew ? "POST" : "PUT";
        const url = this._buildCrudUrl(provider, endpointKey, id);
        const mapping = provider.data.mapping || {};
        const payload = {};
        for (const k of Object.keys(obj.data)) {
          if (k !== "class_id" && k !== "_snapshot") payload[k] = obj.data[k];
        }
        const res = await fetch(url, {
          method,
          headers: this._getAuthHeaders(),
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error(`CRUD ${method} failed: ${res.status}`);
        const json = await res.json();
        const itemKey = mapping._item_key;
        const responseData = itemKey && json[itemKey] ? json[itemKey] : json;
        if ((responseData == null ? void 0 : responseData.id) && responseData.id !== id && obj.store) {
          this._applyServerResponse(obj, responseData);
        }
        obj._snapshot = JSON.parse(JSON.stringify(obj.data));
      }
    }
    /** Load object data from this storage (sync) */
    getObject(id) {
      var _a;
      const type = this.data.type;
      if (type === "composite") {
        for (const s of this._getReadChain()) {
          const result = s.getObject(id);
          if (result) return result;
        }
        return null;
      }
      if (type === "seed") {
        return ((_a = this.store) == null ? void 0 : _a._seedData[id]) || null;
      }
      if (type === "local") {
        try {
          const raw = localStorage.getItem(`es:${id}`);
          return raw ? JSON.parse(raw) : null;
        } catch {
          return null;
        }
      }
      return null;
    }
    /** Delete object from this storage */
    delObject(id) {
      var _a, _b, _c, _d;
      const type = this.data.type;
      if (type === "composite") {
        const writeStorage = this._getWriteStorage();
        if (writeStorage) writeStorage.delObject(id);
        return;
      }
      if (type === "seed") {
        return;
      }
      if (type === "local") {
        try {
          localStorage.removeItem(`es:${id}`);
        } catch {
        }
      } else if (type === "api") {
        const obj = (_a = this.store) == null ? void 0 : _a.getObject(id);
        const classId = (_b = obj == null ? void 0 : obj.data) == null ? void 0 : _b.class_id;
        if (classId) {
          elementStoreClient.deleteObject(classId, id).catch((e) => console.warn("AtomStorage.delObject (api) failed:", e));
        }
      } else if (type === "crud") {
        const obj = (_c = this.store) == null ? void 0 : _c.getObject(id);
        const classId = (_d = obj == null ? void 0 : obj.data) == null ? void 0 : _d.class_id;
        if (!classId) return;
        const provider = this._resolveCrudProvider(classId);
        if (!provider) return;
        const url = this._buildCrudUrl(provider, "delete_one", id);
        fetch(url, {
          method: "DELETE",
          headers: this._getAuthHeaders()
        }).catch((e) => console.warn("AtomStorage.delObject (crud) failed:", e));
      }
    }
    // --- Bulk fetch ---
    /** Fetch all objects of a class from this storage */
    async fetchList(classId) {
      const type = this.data.type;
      if (type === "composite") {
        for (const s of this._getReadChain()) {
          try {
            const items = await s.fetchList(classId);
            if (items.length > 0) return items;
          } catch {
          }
        }
        return [];
      }
      if (type === "seed") {
        if (!this.store) return [];
        const results = [];
        for (const raw of Object.values(this.store._seedData)) {
          if (raw.class_id === classId) results.push({ ...raw });
        }
        return results;
      }
      if (type === "api") {
        try {
          const items = await elementStoreClient.getObjects(classId);
          for (const item of items) {
            if (!item.class_id) item.class_id = classId;
          }
          return items;
        } catch (e) {
          console.warn(`AtomStorage.fetchList api (${classId}) failed:`, e);
          return [];
        }
      }
      if (type === "crud") {
        const provider = this._resolveCrudProvider(classId);
        if (!provider) return [];
        const url = this._buildCrudUrl(provider, "get_list");
        const mapping = provider.data.mapping || {};
        try {
          const res = await fetch(url, { headers: this._getAuthHeaders() });
          if (!res.ok) throw new Error(`CRUD GET list failed: ${res.status}`);
          const json = await res.json();
          const listKey = mapping._list_key;
          const items = listKey && json[listKey] ? json[listKey] : Array.isArray(json) ? json : [];
          const targetClassId = mapping._class_id || classId;
          for (const item of items) {
            if (!item.class_id) item.class_id = targetClassId;
          }
          return items;
        } catch (e) {
          console.warn(`AtomStorage.fetchList crud (${classId}) failed:`, e);
          return [];
        }
      }
      return [];
    }
  };
  __publicField(_AtomStorage, "CLASS_ID", "@storage");
  var AtomStorage = _AtomStorage;

  // src/modules/classRegistry.ts
  var classRegistry = /* @__PURE__ */ new Map();
  function registerClass(classId, Ctor) {
    classRegistry.set(classId, Ctor);
  }

  // src/core/ElementStore.ts
  classRegistry.set("@class", AtomClass);
  classRegistry.set("@prop", AtomProp);
  classRegistry.set("@storage", AtomStorage);
  var META_CLASS = "@class";
  var META_PROP = "@prop";
  var META_STORAGE = "@storage";
  var META_IDS = /* @__PURE__ */ new Set([META_CLASS, META_PROP, META_STORAGE]);
  var ElementStore = class {
    constructor(id, seedOverride) {
      __publicField(this, "id");
      __publicField(this, "objects", {});
      __publicField(this, "storage", null);
      /** Seed data backup — original raw values from genesis + ui-seed.
       *  Used as fallback when getObject() doesn't find an object in memory. */
      __publicField(this, "_seedData", {});
      __publicField(this, "_initialized", false);
      __publicField(this, "_version", 0);
      __publicField(this, "_subscribers", /* @__PURE__ */ new Set());
      __publicField(this, "_jwtToken", null);
      /** Global error handler — set once to route store errors to UI */
      __publicField(this, "onError", null);
      this.id = id;
      this.objects = {};
      this.storage = null;
      if (seedOverride) {
        this.seed(seedOverride);
      }
    }
    // --- Initialization state ---
    get initialized() {
      return this._initialized;
    }
    setInitialized(value) {
      this._initialized = value;
      this._notifySubscribers();
    }
    /** Monotonically increasing version — used by useSyncExternalStore */
    get version() {
      return this._version;
    }
    // --- Seeding ---
    /** Seed data into the store (creates objects without triggering remote save or subscribers).
     *  Also stores a copy in _seedData for fallback/restore. */
    seed(data) {
      for (const raw of Object.values(data)) {
        const id = raw.id;
        if (id) this._seedData[id] = { ...raw };
        this._setObjectLocal(raw);
      }
    }
    // --- Constructor resolution ---
    /** Resolve JS constructor for a class_id (walks extends_id chain) */
    resolveConstructor(classId) {
      if (classRegistry.has(classId)) return classRegistry.get(classId);
      const cls = this.objects[classId];
      if (cls && cls.data && cls.data.extends_id) {
        return this.resolveConstructor(cls.data.extends_id);
      }
      return null;
    }
    // --- Property resolution ---
    /** Find prop definition by walking extends_id chain */
    findPropDef(classId, key) {
      var _a;
      const visited = {};
      let cid = classId;
      while (cid && !visited[cid]) {
        visited[cid] = true;
        const propObj = this.objects[cid + "." + key];
        if (propObj) return propObj;
        const clsObj = this.objects[cid];
        cid = ((_a = clsObj == null ? void 0 : clsObj.data) == null ? void 0 : _a.extends_id) || null;
      }
      return null;
    }
    /** Collect all prop definitions for a class (inherited, child overrides parent) */
    collectClassProps(classId) {
      var _a;
      const visited = {};
      const propsByKey = {};
      const chain = [];
      let cid = classId;
      while (cid && !visited[cid]) {
        visited[cid] = true;
        chain.push(cid);
        const clsObj = this.objects[cid];
        cid = ((_a = clsObj == null ? void 0 : clsObj.data) == null ? void 0 : _a.extends_id) || null;
      }
      for (let i = chain.length - 1; i >= 0; i--) {
        const prefix = chain[i] + ".";
        for (const k of Object.keys(this.objects)) {
          if (k.indexOf(prefix) === 0 && this.objects[k].data.class_id === META_PROP) {
            propsByKey[k.substring(prefix.length)] = this.objects[k];
          }
        }
      }
      return Object.values(propsByKey);
    }
    // --- Class helpers ---
    /** Check if classId extends baseClassId (walks extends_id chain) */
    classExtends(classId, baseClassId) {
      var _a;
      if (classId === baseClassId) return true;
      const visited = /* @__PURE__ */ new Set();
      let cid = classId;
      while (cid && !visited.has(cid)) {
        visited.add(cid);
        if (cid === baseClassId) return true;
        const clsObj = this.objects[cid];
        cid = ((_a = clsObj == null ? void 0 : clsObj.data) == null ? void 0 : _a.extends_id) || null;
      }
      return false;
    }
    /** Get resolved defaults for a class (walks extends_id chain, child overrides parent) */
    getResolvedDefaults(classId) {
      var _a, _b;
      const defaults = {};
      const chain = [];
      const visited = /* @__PURE__ */ new Set();
      let cid = classId;
      while (cid && !visited.has(cid)) {
        visited.add(cid);
        chain.push(cid);
        const clsObj = this.objects[cid];
        cid = ((_a = clsObj == null ? void 0 : clsObj.data) == null ? void 0 : _a.extends_id) || null;
      }
      for (let i = chain.length - 1; i >= 0; i--) {
        const clsObj = this.objects[chain[i]];
        if (((_b = clsObj == null ? void 0 : clsObj.data) == null ? void 0 : _b.defaults) && typeof clsObj.data.defaults === "object") {
          Object.assign(defaults, clsObj.data.defaults);
        }
      }
      return defaults;
    }
    /** Get inheritance chain for a class ID */
    getInheritanceChain(classId) {
      var _a;
      const chain = [];
      const visited = /* @__PURE__ */ new Set();
      let cid = classId;
      while (cid && !visited.has(cid)) {
        visited.add(cid);
        chain.push(cid);
        const clsObj = this.objects[cid];
        cid = ((_a = clsObj == null ? void 0 : clsObj.data) == null ? void 0 : _a.extends_id) || null;
      }
      return chain;
    }
    // --- Object access ---
    /** Get object from memory. classId is optional hint (unused). */
    getObject(id, classId) {
      void classId;
      return this.objects[id] || null;
    }
    /** Get class definition (throws if missing) */
    getClass(classId) {
      const obj = this.getObject(classId);
      if (!obj) {
        throw new Error("getClass: class not found: " + classId);
      }
      return obj;
    }
    /** Get class definition (returns null if missing) */
    getClassSafe(classId) {
      return this.getObject(classId);
    }
    // --- Object mutation ---
    /**
     * Create object locally. No remote save. Only class_id is required.
     * _id is auto-generated (or set from data.id if present).
     * Defaults applied from class definition (class defaults + prop default_value).
     * Indexed by _id (or data.id if it exists).
     */
    add(raw) {
      if (!raw.class_id) {
        throw new Error("add: class_id is required");
      }
      const obj = new AtomObj(raw, this);
      this.objects[obj._id] = obj;
      this._notifySubscribers();
      return obj;
    }
    /**
     * Seed an instance into the store without triggering storage write-through.
     * Used for seed data (default agents, etc.) that should exist locally
     * but not be POSTed to the backend. CRUD fetch will update them later.
     * Also stores a copy in _seedData for fallback.
     */
    seedInstance(raw) {
      const obj = new AtomObj(raw, this);
      this.objects[obj._id] = obj;
      obj._snapshot = JSON.parse(JSON.stringify(obj.data));
      const id = raw.id;
      if (id && !this._seedData[id]) {
        this._seedData[id] = { ...raw };
      }
      this._notifySubscribers();
      return obj;
    }
    /**
     * Batch-apply remote objects (e.g. from WebSocket changes) silently.
     * Does NOT trigger _notifySubscribers — caller manages UI updates separately.
     * For existing objects, updates data in place (preserving proxy references).
     * For new objects, creates a clean AtomObj. All objects marked clean (snapshot set).
     */
    setRemoteObjects(items) {
      if (items.length === 0) return;
      for (const raw of items) {
        if (!raw.class_id) continue;
        const id = raw.id || raw._id;
        if (!id) continue;
        const existing = this.objects[id];
        if (existing) {
          Object.assign(existing.data, raw);
          existing._snapshot = JSON.parse(JSON.stringify(existing.data));
        } else {
          const obj = new AtomObj(raw, this);
          this.objects[obj._id] = obj;
          obj._snapshot = JSON.parse(JSON.stringify(obj.data));
        }
      }
    }
    /**
     * Store object in memory + persist via class storage adapter.
     * Uses add() for local creation, then triggers remote save.
     */
    setObject(objOrRaw) {
      var _a;
      try {
        let obj;
        if (objOrRaw instanceof AtomObj) {
          obj = objOrRaw;
          this.objects[obj._id] = obj;
          this._notifySubscribers();
        } else {
          obj = this.add(objOrRaw);
        }
        const storage2 = this._getClassStorage(obj.data.class_id);
        console.log(
          `%c[setObject]%c ${obj._id} class=${obj.data.class_id} storage=${storage2 ? storage2._id + "(" + storage2.data.type + ")" : "null"}`,
          "background: #10b981; color: white; padding: 1px 6px; border-radius: 3px;",
          ""
        );
        if (storage2) storage2.setObject(obj);
        return obj;
      } catch (err) {
        (_a = this.onError) == null ? void 0 : _a.call(this, "ElementStore.setObject", err);
        throw err;
      }
    }
    /**
     * Awaitable save: index in memory + await storage persistence.
     * Used by AtomObj.save() cascade so children get server IDs before parent saves.
     */
    async saveObjectAsync(obj) {
      var _a;
      try {
        this.objects[obj._id] = obj;
        this._notifySubscribers();
        const storage2 = this._getClassStorage(obj.data.class_id);
        console.log(
          `%c[saveObjectAsync]%c ${obj._id} class=${obj.data.class_id} storage=${storage2 ? storage2._id + "(" + storage2.data.type + ")" : "null"}`,
          "background: #10b981; color: white; padding: 1px 6px; border-radius: 3px;",
          ""
        );
        if (storage2) await storage2.setObjectAsync(obj);
      } catch (err) {
        (_a = this.onError) == null ? void 0 : _a.call(this, "ElementStore.saveObjectAsync", err);
        throw err;
      }
    }
    /**
     * Get the @storage adapter for a class (walks extends_id chain).
     * Checks: 1) explicit `storage` property, 2) `providers` array (CRUD), 3) store default.
     * With composite storages, the returned storage handles read/write routing internally.
     */
    _getClassStorage(classId) {
      var _a, _b;
      if (META_IDS.has(classId)) return null;
      const chain = this.getInheritanceChain(classId);
      for (const cid of chain) {
        const cls = this.objects[cid];
        if (!cls) continue;
        const storageId = (_a = cls.data) == null ? void 0 : _a.storage;
        if (storageId && typeof storageId === "string") {
          const storageObj = this.objects[storageId];
          if (storageObj instanceof AtomStorage) return storageObj;
        }
        const providers = (_b = cls.data) == null ? void 0 : _b.providers;
        if (providers && providers.length > 0) {
          for (const pid of providers) {
            const prov = this.objects[pid];
            if (prov && prov.data.class_id === "crud_provider") {
              const crudStorage = this.objects["@storage:crud"];
              if (crudStorage instanceof AtomStorage) return crudStorage;
            }
          }
        }
      }
      return this.storage;
    }
    /**
     * Upsert: update existing or create new.
     * If object exists, merges data + fires _onChange.
     * If not, creates via setObject (factory dispatch).
     */
    upsertObject(raw) {
      const id = raw.id;
      if (id && this.objects[id]) {
        const existing = this.objects[id];
        for (const k of Object.keys(raw)) {
          existing.data[k] = raw[k];
        }
        if (existing._onChange.length > 0) {
          const info = { obj: existing, prop: "*", value: raw, oldValue: null };
          for (const fn of existing._onChange) fn(info);
        }
        this._notifySubscribers();
        return existing;
      }
      return this.setObject(raw);
    }
    /** Remove object from memory + delete from class storage. Notifies subscribers. */
    removeObject(id) {
      var _a;
      try {
        const obj = this.objects[id];
        if (obj) {
          const storage2 = this._getClassStorage(obj.data.class_id);
          if (storage2) storage2.delObject(id);
          delete this.objects[id];
          this._notifySubscribers();
          return true;
        }
        return false;
      } catch (err) {
        (_a = this.onError) == null ? void 0 : _a.call(this, "ElementStore.removeObject", err);
        throw err;
      }
    }
    /** Create object with resolved defaults merged */
    createElement(classId, data) {
      const defaults = this.getResolvedDefaults(classId);
      return {
        class_id: classId,
        ...defaults,
        ...data
      };
    }
    /** Internal: set object locally only (no remote save, no subscriber notification). Used during seed(). */
    _setObjectLocal(raw) {
      const obj = new AtomObj(raw, this);
      this.objects[obj._id] = obj;
      return obj;
    }
    // --- Query ---
    /** Find objects by filter (local only) */
    find(filter) {
      const results = [];
      for (const obj of Object.values(this.objects)) {
        let match = true;
        for (const k of Object.keys(filter)) {
          if (obj.data[k] !== filter[k]) {
            match = false;
            break;
          }
        }
        if (match) results.push(obj);
      }
      return results;
    }
    /** Get all class definitions (@class objects) */
    getClasses() {
      return this.find({ class_id: META_CLASS });
    }
    /** Get all instances of a given class (including subclasses) */
    getElementsByClass(classId) {
      const results = [];
      for (const obj of Object.values(this.objects)) {
        const objClassId = obj.data.class_id;
        if (objClassId && !META_IDS.has(objClassId) && this.classExtends(objClassId, classId)) {
          results.push(obj);
        }
      }
      return results;
    }
    /** Get instances owned by a specific object (by owner_id or design_id) */
    getElementsByOwner(ownerId) {
      return Object.values(this.objects).filter(
        (obj) => obj.data.owner_id === ownerId || obj.data.design_id === ownerId
      );
    }
    /** Get all instance objects (non-class, non-prop, non-storage) */
    getInstances() {
      return Object.values(this.objects).filter(
        (obj) => !META_IDS.has(obj.data.class_id)
      );
    }
    /** Get all dialog instances */
    getDialogs() {
      return this.getElementsByClass("ui:dialog");
    }
    /** Get all canvas instances */
    getCanvases() {
      return this.getElementsByClass("ui:canvas");
    }
    /** Get all button instances */
    getButtons() {
      return this.getElementsByClass("ui:button");
    }
    /** Get all panel instances */
    getPanels() {
      return this.getElementsByClass("ui:panel");
    }
    /** Get infra elements */
    getInfraElements() {
      return Object.values(this.objects).filter((obj) => {
        const cid = obj.data.class_id;
        return cid && typeof cid === "string" && cid.startsWith("infra:");
      });
    }
    /** Get domain elements (non-core, non-ui, non-infra, non-meta) */
    getDomainElements() {
      return Object.values(this.objects).filter((obj) => {
        const cid = obj.data.class_id;
        if (!cid || META_IDS.has(cid)) return false;
        return !cid.startsWith("ui:") && !cid.startsWith("core:") && !cid.startsWith("infra:");
      });
    }
    // --- Instance lifecycle ---
    /** Clear all non-class, non-prop, non-storage instances from the store */
    clearInstances() {
      const toDelete = [];
      for (const [key, obj] of Object.entries(this.objects)) {
        if (!META_IDS.has(obj.data.class_id)) {
          toDelete.push(key);
        }
      }
      for (const key of toDelete) {
        delete this.objects[key];
      }
      this._notifySubscribers();
    }
    // --- JWT ---
    setToken(token) {
      this._jwtToken = token;
    }
    getToken() {
      return this._jwtToken;
    }
    // --- Apply remote data ---
    /**
     * Apply external/remote data to an existing object.
     * Merges fields, updates snapshot (marks clean), fires _onChange.
     * If object doesn't exist, creates it via seedInstance (no write-through).
     */
    applyRemote(raw) {
      if (!raw || !raw.id) throw new Error("applyRemote: id is required");
      const existing = this.objects[raw.id];
      if (existing) {
        for (const k of Object.keys(raw)) {
          existing.data[k] = raw[k];
        }
        existing._snapshot = JSON.parse(JSON.stringify(existing.data));
        if (existing._onChange.length > 0) {
          const info = { obj: existing, prop: "*", value: raw, oldValue: null };
          for (const fn of existing._onChange) fn(info);
        }
        this._notifySubscribers();
        return existing;
      }
      return this.seedInstance(raw);
    }
    /** Save all objects that have unsaved changes via their class storage */
    saveDirty() {
      const saved = [];
      for (const obj of Object.values(this.objects)) {
        if (obj.hasChanges && obj.hasChanges()) {
          const storage2 = this._getClassStorage(obj.data.class_id);
          if (storage2) storage2.setObject(obj);
          obj._snapshot = JSON.parse(JSON.stringify(obj.data));
          saved.push(obj._id);
        }
      }
      return saved;
    }
    // --- Remote fetch (async, smart routing: CRUD or esProxy) ---
    /** Fetch single object. Uses class storage if available; falls back to esProxy. */
    async fetchRemote(id, classId) {
      if (classId) {
        const storage2 = this._getClassStorage(classId);
        if (storage2) {
          await this.fetchObjects(classId);
          return this.objects[id] || null;
        }
      }
      try {
        const { elementStoreClient: elementStoreClient2 } = await Promise.resolve().then(() => (init_ElementStoreClient(), ElementStoreClient_exports));
        let raw = null;
        if (classId) {
          raw = await elementStoreClient2.getObject(classId, id);
        } else {
          const dotIndex = id.indexOf(".");
          if (dotIndex > 0) {
            const derivedClass = id.substring(0, dotIndex);
            raw = await elementStoreClient2.getObject(derivedClass, id);
          }
        }
        if (raw) {
          const obj = this.applyRemote(raw);
          return obj;
        }
      } catch (e) {
        console.warn("fetchRemote failed for " + id + ":", e);
      }
      return null;
    }
    /**
     * Check if a class is backed by a CRUD provider.
     */
    isCrudBacked(classId) {
      var _a;
      const cls = this.objects[classId];
      const providers = (_a = cls == null ? void 0 : cls.data) == null ? void 0 : _a.providers;
      if (!providers || providers.length === 0) return false;
      for (const pid of providers) {
        const prov = this.objects[pid];
        if (prov && prov.data.class_id === "crud_provider") return true;
      }
      return false;
    }
    /**
     * Smart fetch: delegates to the class's storage adapter.
     * The storage (which may be composite) handles routing internally.
     * Falls back to esProxy if no class storage is configured.
     */
    async fetchObjects(classId) {
      const storage2 = this._getClassStorage(classId);
      if (storage2) {
        try {
          const items = await storage2.fetchList(classId);
          const results = [];
          for (const raw of items) {
            if (!raw.id) continue;
            const obj = this.applyRemote({ ...raw, class_id: raw.class_id || classId });
            results.push(obj);
          }
          if (results.length > 0) {
            console.log(`[fetchObjects] Loaded ${results.length} ${classId} via ${storage2.data.type} storage`);
          }
          return results;
        } catch (e) {
          console.warn(`fetchObjects(${classId}) storage failed:`, e);
          return [];
        }
      }
      try {
        const { elementStoreClient: elementStoreClient2 } = await Promise.resolve().then(() => (init_ElementStoreClient(), ElementStoreClient_exports));
        const items = await elementStoreClient2.getObjects(classId);
        const results = [];
        for (const raw of items) {
          if (!raw.id) continue;
          const obj = this.applyRemote({ ...raw, class_id: raw.class_id || classId });
          results.push(obj);
        }
        return results;
      } catch (e) {
        console.warn(`fetchObjects(${classId}) failed:`, e);
        return [];
      }
    }
    /**
     * Fetch all objects of a CRUD-backed class from its provider endpoint.
     * Resolves the crud_provider, fetches the list, creates AtomObj instances.
     */
    async fetchCrud(classId) {
      var _a;
      try {
        const crudStorage = this.objects["@storage:crud"];
        if (!(crudStorage instanceof AtomStorage)) {
          console.warn("fetchCrud: @storage:crud not found");
          return [];
        }
        const items = await crudStorage.fetchList(classId);
        const results = [];
        for (const raw of items) {
          if (!raw.id) continue;
          const obj = this.applyRemote(raw);
          results.push(obj);
        }
        console.log(`[fetchCrud] Loaded ${results.length} ${classId} objects`);
        return results;
      } catch (err) {
        (_a = this.onError) == null ? void 0 : _a.call(this, "ElementStore.fetchCrud", err);
        throw err;
      }
    }
    // --- Subscriptions (global, for React top-level) ---
    subscribe(callback) {
      this._subscribers.add(callback);
      return () => this._subscribers.delete(callback);
    }
    _notifySubscribers() {
      this._version++;
      for (const cb of this._subscribers) {
        try {
          cb();
        } catch (e) {
          console.error("ElementStore subscriber error:", e);
        }
      }
    }
  };

  // src/actions/ActionExecutor.ts
  var ActionExecutorError = class extends Error {
    constructor(message, httpStatus) {
      super(message);
      __publicField(this, "httpStatus");
      this.name = "ActionExecutorError";
      this.httpStatus = httpStatus;
    }
  };
  var ActionExecutor = class {
    constructor(options = {}) {
      __publicField(this, "functionRegistry");
      __publicField(this, "eventBus");
      __publicField(this, "actionResolver");
      this.functionRegistry = options.functionRegistry;
      this.eventBus = options.eventBus;
      this.actionResolver = options.actionResolver;
    }
    // ==========================================================================
    // PUBLIC API
    // ==========================================================================
    /**
     * Execute an action definition.
     *
     * @param action   @action element data
     * @param params   Runtime parameter values (e.g. { id: '42' })
     * @param context  The ES object this action is running on (optional)
     * @returns        Result — depends on action.returns (object, list, void/null)
     */
    async execute(action, params = {}, context = null) {
      var _a;
      const type = (_a = action.type) != null ? _a : "ui";
      switch (type) {
        case "api":
          return this.executeApi(action, params, context);
        case "function":
          return this.executeFunction(action, params);
        case "event":
          return this.executeEvent(action, params, context);
        case "composite":
          return this.executeComposite(action, params, context);
        case "ui":
          return null;
        // UI-only, no-op here
        default:
          throw new ActionExecutorError(`Unknown action type: ${type}`);
      }
    }
    // ==========================================================================
    // API TYPE
    // ==========================================================================
    /**
     * Execute an api-type action via fetch().
     *
     * Resolves endpoint placeholders like {id} from params + context.
     * Applies field mapping from action.mapping (api_field → es_field).
     */
    async executeApi(action, params, context) {
      var _a, _b, _c;
      const method = ((_a = action.method) != null ? _a : "GET").toUpperCase();
      const mapping = (_b = action.mapping) != null ? _b : {};
      const headers = { "Content-Type": "application/json", "Accept": "application/json", ...action.headers };
      const baseUrl = this.resolveBaseUrl(context);
      const url = this.buildUrl(baseUrl + ((_c = action.endpoint) != null ? _c : ""), params, context);
      let body;
      if (["POST", "PUT", "PATCH"].includes(method)) {
        body = JSON.stringify(this.buildRequestBody(params, mapping, context));
      }
      const response = await fetch(url, { method, headers, body });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new ActionExecutorError(`API error ${response.status}: ${text}`, response.status);
      }
      if (response.status === 204) return null;
      const data = await response.json();
      const mapped = Object.keys(mapping).length > 0 ? this.applyReverseMapping(mapping, data) : data;
      if (context !== null) {
        this.updateLinks(context, action, mapped);
      }
      return mapped;
    }
    // ==========================================================================
    // FUNCTION TYPE
    // ==========================================================================
    /**
     * Execute a function-type action via FunctionRegistry.
     */
    async executeFunction(action, params) {
      if (!this.functionRegistry) {
        throw new ActionExecutorError("FunctionRegistry not configured");
      }
      const key = action.function;
      if (!key) {
        throw new ActionExecutorError("action.function key is required for function-type actions");
      }
      return this.functionRegistry(key, params);
    }
    // ==========================================================================
    // EVENT TYPE
    // ==========================================================================
    /**
     * Execute an event-type action — emit to EventBus.
     */
    async executeEvent(action, params, context) {
      var _a;
      if (!this.eventBus) {
        throw new ActionExecutorError("EventBus not configured");
      }
      const eventName = action.event;
      const payloadMap = (_a = action.payload) != null ? _a : {};
      if (!eventName) {
        throw new ActionExecutorError("action.event is required for event-type actions");
      }
      const payload = {};
      if (Object.keys(payloadMap).length === 0) {
        Object.assign(payload, params);
      } else {
        for (const [paramKey, eventField] of Object.entries(payloadMap)) {
          if (paramKey in params) {
            payload[eventField] = params[paramKey];
          }
        }
      }
      if (context) {
        payload["_context_id"] = context.id;
        payload["_context_class_id"] = context.class_id;
      }
      await this.eventBus(eventName, payload);
    }
    // ==========================================================================
    // COMPOSITE TYPE
    // ==========================================================================
    /**
     * Execute a composite-type action — chain of sub-actions.
     *
     * sequential: execute in order, stop if any fails
     * parallel:   execute all concurrently (Promise.allSettled)
     */
    async executeComposite(action, params, context) {
      var _a, _b, _c, _d;
      const actionIds = (_a = action.actions) != null ? _a : [];
      const strategy = (_b = action.strategy) != null ? _b : "sequential";
      if (actionIds.length === 0) return { results: {}, errors: {} };
      const results = {};
      const errors = {};
      if (strategy === "parallel") {
        const settled = await Promise.allSettled(
          actionIds.map((id) => {
            const sub = this.resolveAction(id);
            if (!sub) return Promise.reject(new Error(`Sub-action not found: ${id}`));
            return this.execute(sub, params, context).then((r) => ({ id, r }));
          })
        );
        for (let i = 0; i < settled.length; i++) {
          const s = settled[i];
          const id = actionIds[i];
          if (s.status === "fulfilled") {
            results[id] = s.value.r;
          } else {
            errors[id] = (_d = (_c = s.reason) == null ? void 0 : _c.message) != null ? _d : String(s.reason);
          }
        }
      } else {
        let currentParams = { ...params };
        for (const id of actionIds) {
          const sub = this.resolveAction(id);
          if (!sub) throw new ActionExecutorError(`Sub-action not found: ${id}`);
          try {
            const result = await this.execute(sub, currentParams, context);
            results[id] = result;
            if (result && typeof result === "object") {
              currentParams = { ...currentParams, ...result };
            }
          } catch (e) {
            throw new ActionExecutorError(
              `Composite action failed at step '${id}': ${e.message}`
            );
          }
        }
      }
      return { results, errors };
    }
    // ==========================================================================
    // URL / PARAM HELPERS
    // ==========================================================================
    /**
     * Build full URL, substituting {param} placeholders from params + context.
     */
    buildUrl(urlTemplate, params, context) {
      return urlTemplate.replace(/\{(\w+)\}/g, (_, key) => {
        if (key in params) return encodeURIComponent(String(params[key]));
        if (context && key in context) return encodeURIComponent(String(context[key]));
        return `{${key}}`;
      });
    }
    /**
     * Build request body for POST/PUT/PATCH.
     * Applies forward mapping: es_field → api_field (invert of action.mapping).
     */
    buildRequestBody(params, mapping, _context) {
      var _a;
      if (Object.keys(mapping).length === 0) return params;
      const inverted = Object.fromEntries(Object.entries(mapping).map(([a, e]) => [e, a]));
      const body = {};
      for (const [esField, value] of Object.entries(params)) {
        const apiField = (_a = inverted[esField]) != null ? _a : esField;
        body[apiField] = value;
      }
      return body;
    }
    /**
     * Apply reverse mapping to API response: {api_field: es_field} → rename keys.
     */
    applyReverseMapping(mapping, response) {
      const result = { ...response };
      for (const [apiField, esField] of Object.entries(mapping)) {
        if (apiField in response) {
          result[esField] = response[apiField];
          if (apiField !== esField) delete result[apiField];
        }
      }
      return result;
    }
    /**
     * Update _links on context object after API call.
     * Stores: _links[storage_id] = external_id
     */
    updateLinks(context, action, response) {
      var _a;
      const idField = (_a = action["id_field"]) != null ? _a : "id";
      const storageId = action["storage_id"];
      if (storageId && idField in response) {
        if (!context["_links"]) context["_links"] = {};
        context["_links"][storageId] = response[idField];
      }
    }
    /**
     * Resolve base URL from context's _provider field.
     */
    resolveBaseUrl(context) {
      if (!context) return "";
      const provider = context["_provider"];
      if (provider == null ? void 0 : provider.base_url) return provider.base_url.replace(/\/$/, "");
      return "";
    }
    /**
     * Resolve a sub-action by ID via actionResolver.
     */
    resolveAction(actionId) {
      var _a;
      return (_a = this.actionResolver) == null ? void 0 : _a.call(this, actionId);
    }
  };

  // src/modules/genesisConverter.ts
  function flattenGenesis(genesis) {
    const flat = {};
    const classes = Array.isArray(genesis) ? genesis : genesis.classes || genesis["@class"] || [];
    for (const cls of classes) {
      const { props, defaults, ...classFields } = cls;
      flat[cls.id] = {
        ...classFields,
        class_id: "@class"
      };
      if (defaults) {
        flat[cls.id].defaults = defaults;
      }
      if (props && Array.isArray(props)) {
        for (const prop of props) {
          const propId = `${cls.id}.${prop.key}`;
          flat[propId] = {
            id: propId,
            class_id: "@prop",
            ...prop
          };
        }
      }
    }
    return flat;
  }

  // src/browser.ts
  function setJwtToken(token) {
    store.setToken(token);
  }
  function getJwtToken() {
    return store.getToken();
  }
  function normalizeClassIds(val) {
    if (val === null || val === void 0) return null;
    if (Array.isArray(val)) return val.length > 0 ? val : null;
    if (typeof val === "string" && val.trim()) return [val.trim()];
    return null;
  }
  var store = new ElementStore("root.store");
  var storage = new AtomStorage(
    { id: "root.storage", class_id: "@storage", url: "" },
    store
  );
  store.storage = storage;
  var w = window;
  w["AtomObj"] = AtomObj;
  w["AtomCollection"] = AtomCollection;
  w["AtomClass"] = AtomClass;
  w["AtomProp"] = AtomProp;
  w["AtomStorage"] = AtomStorage;
  w["ElementStore"] = ElementStore;
  w["classRegistry"] = classRegistry;
  w["registerClass"] = registerClass;
  w["ActionExecutor"] = ActionExecutor;
  w["flattenGenesis"] = flattenGenesis;
  w["generateLocalId"] = generateLocalId;
  w["normalizeClassIds"] = normalizeClassIds;
  w["setJwtToken"] = setJwtToken;
  w["getJwtToken"] = getJwtToken;
  w["store"] = store;
  w["storage"] = storage;
})();
//# sourceMappingURL=element-store.js.map