/**
 * AtomObj — Core reactive object with Proxy-based property access
 *
 * Direct TypeScript port of element-store.js AtomObj.
 * Factory dispatch: `new AtomObj(raw, store)` resolves the correct subclass
 * via store.resolveConstructor() walking the extends_id chain.
 *
 * Proxy GET: internal fields → methods → propDef.getPropValue() → data[prop] → class field defaults
 * Proxy SET: propDef.setPropValue() → mark parents dirty → fire _onChange
 */

import type { ElementStore } from './ElementStore.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RawData = Record<string, any>;
export type OnChangeInfo = { obj: AtomObj; prop: string; value: unknown; oldValue: unknown };
export type OnChangeCallback = (info: OnChangeInfo) => void;

export interface AtomObjConstructor {
  new (raw: RawData | string, store?: ElementStore): AtomObj;
  CLASS_ID?: string;
}

// Internal fields that bypass the data proxy
const INTERNAL_FIELDS = new Set([
  'store', 'data', 'objects', '_class', '_snapshot', '_id',
  '_related', '_dirtyRelated', '_belongsTo', '_onChange', '_renderVersion', 'el',
  '_autoSaveTimer',
]);

let _localIdCounter = 0;
export function generateLocalId(): string {
  return '_' + (++_localIdCounter) + '_' + Math.random().toString(36).substr(2, 6);
}

export class AtomObj {
  static CLASS_ID = '@atom';

  store: ElementStore | null = null;
  data: RawData = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  objects: Record<string, any> = {};
  _class: AtomObj | null = null;
  _snapshot: RawData | null = null;
  _id: string = '';
  _related: AtomObj[] = [];
  _dirtyRelated: AtomObj[] = [];
  _belongsTo: AtomObj | null = null;
  _onChange: OnChangeCallback[] = [];

  constructor(raw: RawData | string, store?: ElementStore) {
    // Factory: resolve correct subclass via extends_id chain
    if (new.target === AtomObj && store) {
      const cid = typeof raw === 'string' ? raw : raw?.class_id;
      if (cid) {
        const Ctor = store.resolveConstructor(cid);
        if (Ctor && Ctor !== AtomObj) {
          return new Ctor(raw, store);
        }
      }
    }

    this.store = store || null;
    this.objects = {};
    this._related = [];
    this._dirtyRelated = [];
    this._belongsTo = null;
    this._onChange = [];

    // String → new object of that class
    if (typeof raw === 'string') {
      raw = { class_id: raw };
    }

    // _id: explicit _id > data.id (remote identity) > auto-generate
    this._id = (raw?._id as string) || (raw?.id as string) || generateLocalId();
    if (raw?._id) delete raw._id; // _id is internal, not data

    if (!raw || typeof raw !== 'object' || !raw.class_id) {
      throw new Error('AtomObj: class_id is required');
    }

    // Use raw as data by reference (NOT copied)
    this.data = raw;

    // Load class definition from store (null during seed bootstrap)
    this._class = this.store ? (this.store.getObject(raw.class_id) || null) : null;

    const proxy = new Proxy(this, {
      get(target, prop: string | symbol, receiver) {
        // Symbols (React DevTools, iterators, etc.) — pass through
        if (typeof prop === 'symbol') return (target as any)[prop];
        // Internal fields — bypass data
        if (INTERNAL_FIELDS.has(prop)) return target[prop as keyof AtomObj];
        // Methods — bind to proxy so 'this' resolves through proxy
        if (typeof (target as any)[prop] === 'function') {
          return (target as any)[prop].bind(receiver);
        }
        // Lazy-resolve _class if not set at construction time
        if (!target._class && target.store) {
          target._class = target.store.getObject(target.data.class_id) || null;
        }
        // PropDef resolution (relations, computed values, type coercion)
        if (target._class && target.store && prop !== 'id' && prop !== 'class_id') {
          const propDef = target.store.findPropDef(target.data.class_id, prop);
          if (propDef && typeof propDef.getPropValue === 'function') {
            return propDef.getPropValue(target, prop);
          }
        }
        // Data fields
        if (prop in target.data) {
          return target.data[prop];
        }
        // Class field defaults
        return (target as any)[prop];
      },

      set(target, prop: string, val) {
        // Internal fields — bypass data
        if (INTERNAL_FIELDS.has(prop)) {
          (target as any)[prop] = val;
          return true;
        }
        // Delegate to propDef for type validation/coercion
        if (target._class && target.store && prop !== 'id' && prop !== 'class_id') {
          const classId = target.data.class_id;
          if (classId) {
            const propDef = target.store.findPropDef(classId, prop);
            if (propDef && typeof propDef.setPropValue === 'function') {
              return propDef.setPropValue(target, prop, val);
            }
            // Warn if class has props but this one is unknown
            if (target.store.collectClassProps(classId).length > 0) {
              // Silently allow — some props may not be defined yet
            }
          }
        }
        // Notify owner this object is dirty
        if (target._belongsTo) {
          if (target._belongsTo._dirtyRelated.indexOf(target) === -1) {
            target._belongsTo._dirtyRelated.push(target);
          }
        }
        const oldVal = target.data[prop];
        target.data[prop] = val;
        console.log(
          `%c[AtomObj.set]%c ${target._id} .${prop}`,
          'background: #8b5cf6; color: white; padding: 1px 6px; border-radius: 3px;', '',
          { old: oldVal, new: val, class_id: target.data.class_id },
        );
        // Only UIElement subclasses have _renderVersion (widget render tracking)
        if (typeof (target as any)._renderVersion === 'number') (target as any)._renderVersion++;
        // Fire onChange callbacks (for persistence/dirty tracking — NOT for render decisions)
        if (target._onChange && target._onChange.length > 0) {
          const info: OnChangeInfo = { obj: target, prop, value: val, oldValue: oldVal };
          for (const fn of target._onChange) {
            fn(info);
          }
        }
        return true;
      },
    });

    // Apply property defaults from class definition (only fills undefined keys)
    this._applyDefaults();

    // Existing object (has id) → snapshot for change tracking
    // New object (no id) → no snapshot yet
    if (this.data.id) {
      this._snapshot = JSON.parse(JSON.stringify(this.data));
    } else {
      this._snapshot = null;
    }
    // UIElement subclasses set _renderVersion in their constructor

    return proxy;
  }

  // --- Class introspection ---

  /**
   * Check if this object's class extends (inherits from) the given ancestor class.
   * Works on both instances and class definitions:
   *   instance.extendsFrom('core:baseContainer')  → checks instance's class chain
   *   classObj.extendsFrom('core:baseElement')     → checks this class's own chain
   */
  extendsFrom(ancestorClassId: string): boolean {
    if (!this.store) return false;
    // If this IS a class definition (@class), check its own inheritance
    if (this.data.class_id === '@class') {
      return this.store.classExtends(this.data.id, ancestorClassId);
    }
    // Otherwise check this instance's class inheritance
    return this.store.classExtends(this.data.class_id, ancestorClassId);
  }

  /**
   * Get the inheritance chain for this object's class.
   * Returns array of class IDs from this class up to the root.
   */
  getInheritanceChain(): string[] {
    if (!this.store) return [];
    const classId = this.data.class_id === '@class' ? this.data.id : this.data.class_id;
    return this.store.getInheritanceChain(classId);
  }

  /**
   * Get resolved defaults for this object's class (merged from all ancestors).
   * Child class defaults override parent defaults.
   */
  getClassDefaults(): Record<string, unknown> {
    if (!this.store) return {};
    const classId = this.data.class_id === '@class' ? this.data.id : this.data.class_id;
    return this.store.getResolvedDefaults(classId);
  }

  // --- Property introspection ---

  /** Get prop definitions for this object's class (includes inherited) */
  getProps(): AtomObj[] {
    if (!this.store) return [];
    return this.store.collectClassProps(this.data.class_id);
  }

  /** Get a specific prop definition by key (walks inheritance) */
  getPropDef(key: string): AtomObj | null {
    if (!this.store) return null;
    return this.store.findPropDef(this.data.class_id, key);
  }

  /** Apply default values from class definition (includes inherited).
   *  1. Class-level `defaults` block (merged from inheritance chain)
   *  2. Property-level `default_value` from each @prop definition
   *  Only fills keys that are `undefined` in data. */
  _applyDefaults(): void {
    if (!this.store) return;
    const classId = this.data.class_id;
    if (!classId) return;
    const data = this.data;

    // 1. Class-level defaults (merged from inheritance chain)
    const classDefaults = this.store.getResolvedDefaults(classId);
    for (const [key, val] of Object.entries(classDefaults)) {
      if (data[key] === undefined && val !== undefined && val !== null) {
        data[key] = val;
      }
    }

    // 2. Property-level default_value from each @prop
    const props = this.store.collectClassProps(classId);
    for (const propObj of props) {
      const dotIdx = propObj.data.id.lastIndexOf('.');
      const key = dotIdx >= 0 ? propObj.data.id.substring(dotIdx + 1) : propObj.data.id;
      if (data[key] === undefined) {
        const def = propObj.data.default_value;
        if (def !== undefined && def !== null) {
          data[key] = def;
        }
      }
    }
  }

  // --- Change tracking ---

  /** Check if data changed since load */
  hasChanges(): boolean {
    if (!this._snapshot) return true; // new object
    return JSON.stringify(this.data) !== JSON.stringify(this._snapshot);
  }

  /** Get changed fields (diff vs snapshot) */
  getChanges(): RawData {
    if (!this._snapshot) return { ...this.data }; // new: all fields
    const changes: RawData = {};
    const data = this.data;
    const snap = this._snapshot;
    for (const k of Object.keys(data)) {
      if (JSON.stringify(data[k]) !== JSON.stringify(snap[k])) {
        changes[k] = data[k];
      }
    }
    for (const k of Object.keys(snap)) {
      if (!(k in data)) {
        changes[k] = null; // deleted field
      }
    }
    return changes;
  }

  // --- Persistence ---

  /** Save this object and its dirty relations via store.setObject.
   *  Relations delegate to their parent — only the parent talks to storage.
   *  The storage adapter handles the cascade (children first, then self). */
  async save(): Promise<void> {
    if (!this.store) throw new Error('save: no store assigned');

    // If this is a relation child, delegate save to the parent.
    // The parent's setObjectAsync will include this child in its cascade.
    if (this._belongsTo) {
      return this._belongsTo.save();
    }

    this._syncRelationIds();
    await this.store.saveObjectAsync(this);
  }

  /** Walk relation props, rebuild raw ID arrays/values from actual objects.
   *  Uses data.id (server-assigned) when available, falls back to _id (local). */
  _syncRelationIds(): void {
    if (!this.store || !this._class) return;
    const data = this.data;
    const objects = this.objects;
    const props = this.store.collectClassProps(this.data.class_id);
    for (const propObj of props) {
      if (propObj.data.data_type !== 'relation') continue;
      const dotIdx = propObj.data.id.lastIndexOf('.');
      const key = dotIdx >= 0 ? propObj.data.id.substring(dotIdx + 1) : propObj.data.id;
      const relObjs = objects[key];
      if (!relObjs) continue;
      if (propObj.data.is_array && Array.isArray(relObjs)) {
        data[key] = relObjs.map((o: AtomObj) => o.data.id ?? o._id);
      } else if (relObjs instanceof AtomObj) {
        data[key] = relObjs.data.id ?? relObjs._id;
      }
    }
  }

  /** Soft delete: mark as deleted, then save */
  delete(): void {
    this.data._deleted = true;
    this.save();
  }

  /** Get related objects that have unsaved changes */
  getDirtyObjects(): AtomObj[] {
    const dirty: AtomObj[] = [];
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
  toJSON(): RawData {
    return this.data;
  }

  // --- ReactiveElement-compatible interface ---
  // These methods allow consumers to use AtomObj with the same API
  // that was previously provided by ReactiveElement.

  /** Get raw data (ReactiveElement compatibility) */
  getData(): RawData {
    return this.data;
  }

  /** Subscribe to changes, returns unsubscribe function (ReactiveElement compatibility) */
  subscribe(callback: () => void): () => void {
    const handler: OnChangeCallback = () => callback();
    this._onChange.push(handler);
    return () => {
      const idx = this._onChange.indexOf(handler);
      if (idx >= 0) this._onChange.splice(idx, 1);
    };
  }

  /** Update data (merge). Goes through the Proxy setter for each key,
   *  so propDef validation, dirty tracking, _renderVersion, and _onChange all fire. */
  update(updates: Record<string, unknown>): void {
    console.log(
      `%c[AtomObj.update]%c ${this._id}`,
      'background: #f59e0b; color: black; padding: 1px 6px; border-radius: 3px;', '',
      updates, { class_id: this.data.class_id, listeners: this._onChange.length },
    );
    for (const [k, v] of Object.entries(updates)) {
      (this as any)[k] = v; // goes through Proxy set → propDef, dirty, _onChange
    }
  }

  // --- Convenience accessors (for TypeScript typing) ---
  get id(): string { return this.data.id; }
  get class_id(): string { return this.data.class_id; }

  // Allow index signature for dynamic property access
  [key: string]: unknown;
}
