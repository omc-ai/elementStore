/**
 * AtomProp — Property definition with type-aware GET/SET
 *
 * Direct TypeScript port of element-store.js AtomProp.
 * Each @prop object in the store is an AtomProp instance.
 * Provides getPropValue() and setPropValue() for type coercion and validation.
 */

import { AtomObj, type RawData } from './AtomObj.ts';
import { AtomCollection } from './AtomCollection.ts';
import type { ElementStore } from './ElementStore.ts';
import { normalizeArrayMode } from '../types.ts';

export class AtomProp extends AtomObj {
  static override CLASS_ID = '@prop';

  // Default field values (class-level)
  declare key: string | null;
  declare label: string | null;
  declare description: string | null;
  declare data_type: string | null;
  declare is_array: boolean | string;
  declare object_class_id: string | string[] | null;
  declare object_class_strict: boolean;
  declare on_orphan: string | null;
  declare options: unknown;
  /** Editor — can be a string ID or an inline editor instance object */
  declare editor: unknown;
  declare flags: Record<string, boolean>;
  /** @deprecated Prefer flags.required */
  declare required: boolean;
  /** @deprecated Prefer flags.readonly */
  declare readonly: boolean;
  /** @deprecated Prefer flags.create_only */
  declare create_only: boolean;
  declare default_value: unknown;
  declare display_order: number;
  /** @deprecated Prefer flags.hidden */
  declare hidden: boolean;
  /** @deprecated Prefer flags.server_only */
  declare server_only: boolean;
  /** @deprecated Prefer flags.master_only */
  declare master_only: boolean;

  constructor(raw: RawData | string, store?: ElementStore) {
    super(raw, store);
  }

  // ── Type helpers ──────────────────────────────────────────

  /** True when data_type is 'relation' */
  isRelation(): boolean {
    return (this.data?.data_type ?? this.data_type) === 'relation';
  }

  /** True when data_type is 'object', has target classes, and is NOT any collection */
  isEmbeddedObject(): boolean {
    const dt = this.data?.data_type ?? this.data_type;
    return dt === 'object' && this.hasTargetClasses() && this.getArrayMode() === 'false';
  }

  /** True when data_type is 'relation', has target classes, and is NOT any collection (single ownership) */
  isOwnershipRelation(): boolean {
    return this.isRelation() && this.hasTargetClasses() && this.getArrayMode() === 'false';
  }

  /** True when data_type is 'relation', has target classes, and IS an indexed array (many-refs) */
  isReferenceRelation(): boolean {
    return this.isRelation() && this.hasTargetClasses() && this.isIndexedArray();
  }

  /** True when object_class_id is a non-empty string or array */
  hasTargetClasses(): boolean {
    const oci = this.data?.object_class_id;
    if (!oci) return false;
    if (Array.isArray(oci)) return oci.length > 0;
    return typeof oci === 'string' && oci.length > 0;
  }

  /** Return target class IDs as an array (normalises string → [string]) */
  getTargetClasses(): string[] {
    const oci = this.data?.object_class_id;
    if (!oci) return [];
    if (Array.isArray(oci)) return oci;
    return typeof oci === 'string' ? [oci] : [];
  }

  /** First target class (convenience) */
  getPrimaryTargetClass(): string | null {
    const classes = this.getTargetClasses();
    return classes.length > 0 ? classes[0] : null;
  }

  /** True when on_orphan === 'delete' */
  shouldDeleteOnOrphan(): boolean {
    return (this.data?.on_orphan ?? this.on_orphan) === 'delete';
  }

  // ── Array mode helpers ─────────────────────────────────────

  /** Normalized array mode: 'false' | 'indexed' | 'assoc' */
  getArrayMode(): 'false' | 'indexed' | 'assoc' {
    return normalizeArrayMode(this.data?.is_array);
  }

  /** True when is_array is true, 'indexed', or 'assoc' (any collection) */
  isCollection(): boolean {
    const mode = this.getArrayMode();
    return mode === 'indexed' || mode === 'assoc';
  }

  /** True when is_array is true or 'indexed' (ordered array) */
  isIndexedArray(): boolean {
    return this.getArrayMode() === 'indexed';
  }

  /** True when is_array is 'assoc' (key-value map) */
  isAssocArray(): boolean {
    return this.getArrayMode() === 'assoc';
  }

  // ── Value access ──────────────────────────────────────────

  /**
   * Get typed value from sender object
   */
  getPropValue(senderObj: AtomObj, propName: string): unknown {
    // Computed order_id: if item is in owner's collection, return its index
    if (propName === 'order_id' && senderObj._belongsTo) {
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
    const store = senderObj.store;
    const dataType = this.data.data_type;
    const arrayMode = this.getArrayMode();
    const isIndexed = arrayMode === 'indexed';
    const isAssoc = arrayMode === 'assoc';

    // Early return for non-relation types when value is missing
    if ((val === undefined || val === null) && dataType !== 'relation') return val;

    // Assoc maps: return as-is (typed object), coerce values per data_type
    if (isAssoc && val && typeof val === 'object' && !Array.isArray(val)) {
      const coerce = this._getScalarCoercer(dataType);
      if (coerce) {
        const result: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(val)) {
          result[k] = coerce(v);
        }
        return result;
      }
      // For object/relation assoc: return raw (each value is an object)
      return val;
    }

    switch (dataType) {
      case 'string':
        if (isIndexed && Array.isArray(val)) {
          return val.map((v: unknown) => String(v));
        }
        return String(val);
      case 'boolean':
        if (isIndexed && Array.isArray(val)) {
          return val.map((v: unknown) => !!v);
        }
        return !!val;
      case 'integer':
        if (isIndexed && Array.isArray(val)) {
          return val.map((v: unknown) => parseInt(v as string, 10) || 0);
        }
        return parseInt(val as string, 10) || 0;
      case 'float':
      case 'number':
        if (isIndexed && Array.isArray(val)) {
          return val.map((v: unknown) => parseFloat(v as string) || 0);
        }
        return parseFloat(val as string) || 0;
      case 'object':
        if (isIndexed && Array.isArray(val)) {
          return new AtomCollection(val, store!, this.getPrimaryTargetClass() ?? undefined, senderObj, propName);
        }
        if (typeof val === 'object' && this.hasTargetClasses() && store) {
          if (!val.class_id) val.class_id = this.getPrimaryTargetClass();
          return new AtomObj(val, store);
        }
        return val;
      case 'relation':
        if (!store) return val;
        if (isIndexed) {
          // Explicit ID array in data → resolve to objects
          if (Array.isArray(val) && val.length > 0) {
            if (!senderObj.objects[propName]) {
              const items: AtomObj[] = [];
              for (const refId of val) {
                let found: AtomObj | null = null;
                for (const r of senderObj._related) {
                  if (r.data.id === refId || r._id === refId) { found = r; break; }
                }
                if (!found && store) found = store.getObject(refId);
                if (found) items.push(found);
              }
              senderObj.objects[propName] = items;
            }
            return new AtomCollection(senderObj.objects[propName], store, this.getPrimaryTargetClass() ?? undefined, senderObj, propName);
          }
          // Dynamic: query all instances of target class owned by this object
          if (!senderObj.objects[propName]) {
            const objectClassId = this.getPrimaryTargetClass();
            if (objectClassId && senderObj.data.id) {
              const items = store.getElementsByClass(objectClassId)
                .filter((obj: AtomObj) => obj.data.owner_id === senderObj.data.id);
              senderObj.objects[propName] = items;
            } else {
              senderObj.objects[propName] = [];
            }
          }
          return new AtomCollection(senderObj.objects[propName], store, this.getPrimaryTargetClass() ?? undefined, senderObj, propName);
        }
        // Single relation → objects[propName] = AtomObj
        if (val === undefined || val === null) return val;
        if (!senderObj.objects[propName]) {
          let found: AtomObj | null = null;
          for (const r of senderObj._related) {
            if (r.data.id === val || r._id === val) { found = r; break; }
          }
          if (!found) found = store.getObject(val as string);
          if (found) senderObj.objects[propName] = found;
        }
        return senderObj.objects[propName] || val;
      case 'function':
        if (typeof val === 'function') return val;
        if (typeof val === 'string') {
          try { return new Function('return ' + val)(); } catch { return val; }
        }
        return val;
      default:
        return val;
    }
  }

  /** Helper: return a scalar coercion function for the given data_type, or null for complex types */
  private _getScalarCoercer(dataType: string): ((v: unknown) => unknown) | null {
    switch (dataType) {
      case 'string': return (v) => String(v ?? '');
      case 'boolean': return (v) => !!v;
      case 'integer': return (v) => parseInt(v as string, 10) || 0;
      case 'float': case 'number': return (v) => parseFloat(v as string) || 0;
      default: return null;
    }
  }

  /**
   * Set and validate value on sender object
   */
  setPropValue(senderObj: AtomObj, propName: string, value: unknown): boolean {
    const dataType = this.data.data_type;
    const arrayMode = this.getArrayMode();
    const isIndexed = arrayMode === 'indexed';
    const isAssoc = arrayMode === 'assoc';

    // Assoc maps: coerce each value per data_type, pass through as object
    if (isAssoc && value && typeof value === 'object' && !Array.isArray(value)) {
      const coerce = this._getScalarCoercer(dataType);
      if (coerce) {
        const result: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
          result[k] = coerce(v);
        }
        value = result;
      }
      // For object/relation assoc: store as-is
      senderObj.data[propName] = value;
      this._notifyChange(senderObj, propName, value, senderObj.data[propName]);
      return true;
    }

    // Type coercion/validation
    switch (dataType) {
      case 'boolean':
        if (isIndexed && Array.isArray(value)) {
          value = (value as unknown[]).map(v => !!v);
        } else {
          value = !!value;
        }
        break;
      case 'integer':
        if (isIndexed && Array.isArray(value)) {
          value = (value as unknown[]).map(v => {
            const n = parseInt(v as string, 10);
            return isNaN(n) ? 0 : n;
          });
        } else {
          value = parseInt(value as string, 10);
          if (isNaN(value as number)) {
            console.warn(`setPropValue: expected integer for "${propName}"`);
            return false;
          }
        }
        break;
      case 'float':
      case 'number':
        if (isIndexed && Array.isArray(value)) {
          value = (value as unknown[]).map(v => {
            const n = parseFloat(v as string);
            return isNaN(n) ? 0 : n;
          });
        } else {
          value = parseFloat(value as string);
          if (isNaN(value as number)) {
            console.warn(`setPropValue: expected float for "${propName}"`);
            return false;
          }
        }
        break;
      case 'string':
        if (value !== null && value !== undefined) {
          if (isIndexed && Array.isArray(value)) {
            value = (value as unknown[]).map(v => String(v));
          } else {
            value = String(value);
          }
        }
        break;
      case 'relation':
        // Accept AtomObj → store object in objects[propName], id in data
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
          const relObjs: AtomObj[] = [];
          value = (value as unknown[]).map((v) => {
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
      case 'object':
        if (value instanceof AtomObj) {
          value = value.data;
        }
        if (isIndexed && Array.isArray(value)) {
          value = (value as unknown[]).map((v) =>
            v instanceof AtomObj ? v.data : v
          );
        }
        break;
    }

    // Required check (flags.required takes precedence, fall back to top-level required)
    const isRequired = this.data.flags?.required ?? this.data.required;
    if (isRequired && (value === null || value === undefined || value === '')) {
      console.warn(`setPropValue: "${propName}" is required`);
    }

    const oldVal = senderObj.data[propName];
    senderObj.data[propName] = value;
    this._notifyChange(senderObj, propName, value, oldVal);

    return true;
  }

  /** Notify owner and fire onChange callbacks */
  private _notifyChange(senderObj: AtomObj, propName: string, value: unknown, oldValue: unknown): void {
    // Notify owner this object is dirty
    if (senderObj._belongsTo) {
      if (senderObj._belongsTo._dirtyRelated.indexOf(senderObj) === -1) {
        senderObj._belongsTo._dirtyRelated.push(senderObj);
      }
    }

    // Fire onChange callbacks
    if (senderObj._onChange && senderObj._onChange.length > 0) {
      const info = { obj: senderObj, prop: propName, value, oldValue };
      for (const fn of senderObj._onChange) {
        fn(info);
      }
    }
  }
}
