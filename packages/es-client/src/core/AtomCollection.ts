/**
 * AtomCollection — Array-like wrapper for collections of objects
 *
 * Proxy-wrapped: supports numeric index access (collection[0], collection[1])
 * and all standard array-like patterns (for...of, .length, .forEach, .map).
 *
 * When an owner is set, add() wires bidirectional binding:
 * - child._belongsTo = owner
 * - owner._related includes child
 * - child.owner_id = owner.id
 * - Syncs element ID to owner.data[propKey] (for React subscription chain)
 * - owner._onChange fires to notify React subscribers
 *
 * Collection hooks: subscribers can register onAdd/onRemove callbacks via
 * owner.objects._collectionHooks[propKey]. Hooks are keyed by subscriber ID
 * for idempotent registration. Survives AtomCollection instance recreation.
 *
 * Example:
 *   if (!design.objects._collectionHooks) design.objects._collectionHooks = {};
 *   if (!design.objects._collectionHooks.nodes) design.objects._collectionHooks.nodes = { onAdd: {}, onRemove: {} };
 *   design.objects._collectionHooks.nodes.onAdd['canvas2d'] = (item) => addVisualNode(item);
 */

import { AtomObj, type RawData } from './AtomObj.ts';
import type { ElementStore } from './ElementStore.ts';

export class AtomCollection {
  _items: RawData[];
  _store: ElementStore | null;
  _classId: string | null;
  _owner: AtomObj | null;
  _propKey: string | null;

  constructor(
    items: RawData[],
    store: ElementStore | null,
    classId?: string,
    owner?: AtomObj,
    propKey?: string,
  ) {
    this._items = items;
    this._store = store || null;
    this._classId = classId || null;
    this._owner = owner || null;
    this._propKey = propKey || null;

    // Return Proxy for numeric index access: collection[0], collection[1], etc.
    return new Proxy(this, {
      get(target, prop, receiver) {
        // Numeric index → wrap item at that index
        if (typeof prop === 'string') {
          const num = Number(prop);
          if (Number.isInteger(num) && num >= 0 && num < target._items.length) {
            return target._wrap(num);
          }
        }
        // Everything else → normal property access
        return Reflect.get(target, prop, receiver);
      },
    });
  }

  get length(): number {
    return this._items.length;
  }

  /** Find item by key field */
  get(key: string): AtomObj | null {
    for (let i = 0; i < this._items.length; i++) {
      if (this._items[i].key === key) {
        return this._wrap(i);
      }
    }
    return null;
  }

  /** Find item by id field */
  getById(id: string): AtomObj | null {
    for (let i = 0; i < this._items.length; i++) {
      if (this._items[i].id === id) {
        return this._wrap(i);
      }
    }
    return null;
  }

  /** Filter items by object filter */
  find(filter: RawData): AtomObj[] {
    const results: AtomObj[] = [];
    for (let i = 0; i < this._items.length; i++) {
      const item = this._items[i];
      let match = true;
      for (const k of Object.keys(filter)) {
        if (item[k] !== filter[k]) { match = false; break; }
      }
      if (match) results.push(this._wrap(i));
    }
    return results;
  }

  /** Iterate items as AtomObj */
  forEach(fn: (item: AtomObj, index: number) => void): void {
    for (let i = 0; i < this._items.length; i++) {
      fn(this._wrap(i), i);
    }
  }

  /** Map items as AtomObj */
  map<T>(fn: (item: AtomObj, index: number) => T): T[] {
    const results: T[] = [];
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
  add(obj?: RawData | AtomObj): AtomObj {
    // Empty call → create new instance of the collection's class
    if (!obj) {
      if (!this._classId) throw new Error('AtomCollection.add(): no classId for empty add');
      obj = { class_id: this._classId };
    }

    // Set class_id from collection classId if missing
    if (!(obj instanceof AtomObj) && this._classId && !obj.class_id) {
      obj.class_id = this._classId;
    }

    // Create AtomObj from raw data
    if (!(obj instanceof AtomObj)) {
      if (!this._store) throw new Error('AtomCollection.add(): no store');
      obj = new AtomObj(obj, this._store);
    }
    const atomObj = obj as AtomObj;

    // Class validation
    if (this._store && this._classId) {
      const childClassId = atomObj.data.class_id;
      if (childClassId && !this._store.classExtends(childClassId, this._classId)) {
        console.warn(`AtomCollection.add(): ${childClassId} does not extend ${this._classId}`);
      }
    }

    // Wire bidirectional binding with owner
    if (this._owner) {
      // Wire _belongsTo on child (single owner)
      atomObj._belongsTo = this._owner;
      // Wire _related on owner
      if (this._owner._related.indexOf(atomObj) === -1) {
        this._owner._related.push(atomObj);
      }
      // Wire _dirtyRelated if child has changes
      if (atomObj.hasChanges && atomObj.hasChanges()) {
        if (this._owner._dirtyRelated.indexOf(atomObj) === -1) {
          this._owner._dirtyRelated.push(atomObj);
        }
      }
      // Set owner_id on child data
      if (this._owner.data.id) {
        atomObj.data.owner_id = this._owner.data.id;
      }
    }

    // Push to items array (resolved objects cache)
    this._items.push(atomObj);

    // Register in store so it's findable by id
    // Use direct registration — NOT setObject() which fires _notifySubscribers()
    // and causes infinite re-render loops. _notifyOwner() below is sufficient.
    if (this._store) {
      this._store.objects[atomObj._id] = atomObj;
    }

    // Sync element ID to owner.data[propKey] — keeps raw data in sync
    // (React hooks like useCanvasDesign read owner.data.nodes directly)
    this._syncIdToOwnerData(atomObj);

    // Fire _onChange on owner to notify React subscribers
    this._notifyOwner();

    // Fire onAdd collection hooks (canvas binding, etc.)
    this._fireOnAdd(atomObj);

    return atomObj;
  }

  /** Remove item by key */
  remove(key: string): boolean {
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
  removeById(id: string): boolean {
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
  setItemIndex(item: AtomObj | RawData, newIndex: number): boolean {
    let oldIndex = -1;
    const itemId = (item as any).id || (item as any)._id;
    for (let i = 0; i < this._items.length; i++) {
      const cur = this._items[i];
      if (cur === item || (itemId && (cur.id === itemId || cur._id === itemId))) {
        oldIndex = i;
        break;
      }
    }
    if (oldIndex === -1 || oldIndex === newIndex) return false;

    if (newIndex < 0) newIndex = 0;
    if (newIndex >= this._items.length) newIndex = this._items.length - 1;

    const removed = this._items.splice(oldIndex, 1)[0];
    this._items.splice(newIndex, 0, removed);

    if (removed && (removed as any)._orderChanged !== undefined) {
      (removed as any)._orderChanged = true;
    }
    return true;
  }

  /** Save collection through its owner (parent handles cascade).
   *  If no owner, falls back to saving dirty children individually. */
  save(): void {
    if (!this._store) throw new Error('AtomCollection.save: no store');
    if (this._owner) {
      // Delegate to owner — storage cascade handles dirty children
      this._owner.save();
      return;
    }
    // Fallback: no owner, save children individually
    for (const item of this._items) {
      if (item && typeof item.hasChanges === 'function' && item.hasChanges()) {
        item.save();
      }
    }
  }

  /** Return raw array for serialization */
  toJSON(): RawData[] {
    return this._items;
  }

  // --- React additions ---

  /** Return a snapshot array of AtomObj instances for React rendering */
  snapshot(): AtomObj[] {
    return this._items.map((_, i) => this._wrap(i));
  }

  /** Iterable support for for...of */
  *[Symbol.iterator](): Iterator<AtomObj> {
    for (let i = 0; i < this._items.length; i++) {
      yield this._wrap(i);
    }
  }

  /** Wrap raw item at index as AtomObj (factory resolves constructor) */
  _wrap(index: number): AtomObj {
    const item = this._items[index];
    if (item instanceof AtomObj) return item;
    if (this._classId && !item.class_id) {
      item.class_id = this._classId;
    }
    return new AtomObj(item, this._store!);
  }

  /** Sync added element's ID into owner.data[propKey] (raw ID array) */
  _syncIdToOwnerData(obj: AtomObj): void {
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
  _removeIdFromOwnerData(item: RawData): void {
    if (!this._owner || !this._propKey) return;
    const id = item instanceof AtomObj ? item._id : (item.id || item._id);
    if (!id) return;
    const rawArr = this._owner.data[this._propKey];
    if (Array.isArray(rawArr)) {
      const idx = rawArr.indexOf(id);
      if (idx >= 0) rawArr.splice(idx, 1);
    }
  }

  /** Notify owner of collection change */
  _notifyOwner(): void {
    if (this._owner && this._owner._onChange.length > 0) {
      const info = { obj: this._owner, prop: this._propKey || '*', value: null, oldValue: null };
      for (const fn of this._owner._onChange) fn(info);
    }
  }

  // --- Collection hooks ---
  // Hooks are stored on owner.objects._collectionHooks[propKey] so they
  // survive AtomCollection instance recreation (AtomProp creates a new
  // AtomCollection wrapper on every property access).

  /** Fire onAdd hooks registered by subscribers (e.g. CanvasElement).
   *  Each hook runs in a try-catch so one canvas's failure doesn't block others. */
  _fireOnAdd(item: AtomObj): void {
    if (!this._owner || !this._propKey) return;
    const hooks = this._owner.objects._collectionHooks?.[this._propKey]?.onAdd;
    if (!hooks) return;
    for (const [key, fn] of Object.entries(hooks)) {
      if (typeof fn === 'function') {
        try {
          (fn as (item: AtomObj) => void)(item);
        } catch (err) {
          console.error(`[AtomCollection._fireOnAdd] Hook "${key}" threw:`, err);
        }
      }
    }
  }

  /** Fire onRemove hooks registered by subscribers.
   *  Each hook runs in a try-catch for error isolation. */
  _fireOnRemove(item: RawData): void {
    if (!this._owner || !this._propKey) return;
    const hooks = this._owner.objects._collectionHooks?.[this._propKey]?.onRemove;
    if (!hooks) return;
    for (const [key, fn] of Object.entries(hooks)) {
      if (typeof fn === 'function') {
        try {
          (fn as (item: RawData) => void)(item);
        } catch (err) {
          console.error(`[AtomCollection._fireOnRemove] Hook "${key}" threw:`, err);
        }
      }
    }
  }

  // Allow index signature for TypeScript
  [index: number]: AtomObj;
}
