/**
 * ElementStore — Main store managing object lifecycle
 *
 * Direct TypeScript port of element-store.js ElementStore.
 * Enhanced with design state and query helpers for React consumers.
 * The store is the single source of truth — all objects live here.
 *
 * React subscription lives on AtomObj via _onChange, NOT on the store.
 * Store-level subscribe/version is for useSyncExternalStore in React hooks.
 *
 * NOTE: The singleton `store` instance and window registration live in cwm-architect
 * (ElementStore.ts shim) so this class is framework-agnostic and portable.
 */

import { AtomObj, type RawData } from './AtomObj.ts';
import { AtomStorage } from '../storage/AtomStorage.ts';
import { AtomClass } from './AtomClass.ts';
import { AtomProp } from './AtomProp.ts';
import { classRegistry } from '../modules/classRegistry.ts';
import type { AtomObjConstructor } from './AtomObj.ts';

// Register core meta-classes BEFORE store creation so seed data objects
// get the correct subclass (AtomStorage, AtomClass, AtomProp) via factory dispatch.
// Without this, seedData @storage objects become plain AtomObj and instanceof checks fail.
classRegistry.set('@class', AtomClass);
classRegistry.set('@prop', AtomProp);
classRegistry.set('@storage', AtomStorage);

// Meta class IDs
const META_CLASS = '@class';
const META_PROP = '@prop';
const META_STORAGE = '@storage';
const META_IDS = new Set([META_CLASS, META_PROP, META_STORAGE]);

export class ElementStore {
  id: string;
  objects: Record<string, AtomObj> = {};
  storage: AtomStorage | null = null;
  /** Seed data backup — original raw values from genesis + ui-seed.
   *  Used as fallback when getObject() doesn't find an object in memory. */
  _seedData: Record<string, RawData> = {};
  private _initialized = false;
  private _version = 0;
  private _subscribers: Set<() => void> = new Set();
  private _jwtToken: string | null = null;

  /** Global error handler — set once to route store errors to UI */
  onError: ((source: string, error: unknown) => void) | null = null;

  constructor(id: string, seedOverride?: Record<string, RawData>) {
    this.id = id;
    this.objects = {};
    this.storage = null;

    // Seed core definitions (caller passes seedData, or empty if none)
    if (seedOverride) {
      this.seed(seedOverride);
    }
  }

  // --- Initialization state ---

  get initialized(): boolean { return this._initialized; }
  setInitialized(value: boolean): void {
    this._initialized = value;
    this._notifySubscribers();
  }

  /** Monotonically increasing version — used by useSyncExternalStore */
  get version(): number { return this._version; }

  // --- Seeding ---

  /** Seed data into the store (creates objects without triggering remote save or subscribers).
   *  Also stores a copy in _seedData for fallback/restore. */
  seed(data: Record<string, RawData>): void {
    for (const raw of Object.values(data)) {
      // Keep original seed data for fallback
      const id = raw.id;
      if (id) this._seedData[id] = { ...raw };
      this._setObjectLocal(raw);
    }
  }

  // --- Constructor resolution ---

  /** Resolve JS constructor for a class_id (walks extends_id chain) */
  resolveConstructor(classId: string): AtomObjConstructor | null {
    if (classRegistry.has(classId)) return classRegistry.get(classId)!;
    const cls = this.objects[classId];
    if (cls && cls.data && cls.data.extends_id) {
      return this.resolveConstructor(cls.data.extends_id);
    }
    return null;
  }

  // --- Property resolution ---

  /** Find prop definition by walking extends_id chain */
  findPropDef(classId: string, key: string): AtomObj | null {
    const visited: Record<string, boolean> = {};
    let cid: string | null = classId;
    while (cid && !visited[cid]) {
      visited[cid] = true;
      const propObj = this.objects[cid + '.' + key];
      if (propObj) return propObj;
      const clsObj: AtomObj | undefined = this.objects[cid];
      cid = (clsObj?.data?.extends_id as string) || null;
    }
    return null;
  }

  /** Collect all prop definitions for a class (inherited, child overrides parent) */
  collectClassProps(classId: string): AtomObj[] {
    const visited: Record<string, boolean> = {};
    const propsByKey: Record<string, AtomObj> = {};
    const chain: string[] = [];
    let cid: string | null = classId;

    while (cid && !visited[cid]) {
      visited[cid] = true;
      chain.push(cid);
      const clsObj: AtomObj | undefined = this.objects[cid];
      cid = (clsObj?.data?.extends_id as string) || null;
    }

    // Walk from base to derived (base first, derived overrides)
    for (let i = chain.length - 1; i >= 0; i--) {
      const prefix = chain[i] + '.';
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
  classExtends(classId: string, baseClassId: string): boolean {
    if (classId === baseClassId) return true;
    const visited = new Set<string>();
    let cid: string | null = classId;
    while (cid && !visited.has(cid)) {
      visited.add(cid);
      if (cid === baseClassId) return true;
      const clsObj: AtomObj = this.objects[cid];
      cid = (clsObj?.data?.extends_id as string) || null;
    }
    return false;
  }

  /** Get resolved defaults for a class (walks extends_id chain, child overrides parent) */
  getResolvedDefaults(classId: string): Record<string, unknown> {
    const defaults: Record<string, unknown> = {};
    const chain: string[] = [];
    const visited = new Set<string>();
    let cid: string | null = classId;

    while (cid && !visited.has(cid)) {
      visited.add(cid);
      chain.push(cid);
      const clsObj: AtomObj = this.objects[cid];
      cid = (clsObj?.data?.extends_id as string) || null;
    }

    // Walk from base to derived
    for (let i = chain.length - 1; i >= 0; i--) {
      const clsObj: AtomObj = this.objects[chain[i]];
      if (clsObj?.data?.defaults && typeof clsObj.data.defaults === 'object') {
        Object.assign(defaults, clsObj.data.defaults);
      }
    }

    return defaults;
  }

  /** Get inheritance chain for a class ID */
  getInheritanceChain(classId: string): string[] {
    const chain: string[] = [];
    const visited = new Set<string>();
    let cid: string | null = classId;
    while (cid && !visited.has(cid)) {
      visited.add(cid);
      chain.push(cid);
      const clsObj: AtomObj = this.objects[cid];
      cid = (clsObj?.data?.extends_id as string) || null;
    }
    return chain;
  }

  // --- Object access ---

  /** Get object from memory. classId is optional hint (unused). */
  getObject(id: string, classId?: string): AtomObj | null {
    void classId;
    return this.objects[id] || null;
  }

  /** Get class definition (throws if missing) */
  getClass(classId: string): AtomObj {
    const obj = this.getObject(classId);
    if (!obj) {
      throw new Error('getClass: class not found: ' + classId);
    }
    return obj;
  }

  /** Get class definition (returns null if missing) */
  getClassSafe(classId: string): AtomObj | null {
    return this.getObject(classId);
  }

  // --- Object mutation ---

  /**
   * Create object locally. No remote save. Only class_id is required.
   * _id is auto-generated (or set from data.id if present).
   * Defaults applied from class definition (class defaults + prop default_value).
   * Indexed by _id (or data.id if it exists).
   */
  add(raw: RawData): AtomObj {
    if (!raw.class_id) {
      throw new Error('add: class_id is required');
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
  seedInstance(raw: RawData): AtomObj {
    const obj = new AtomObj(raw, this);
    this.objects[obj._id] = obj;
    obj._snapshot = JSON.parse(JSON.stringify(obj.data));
    // Keep seed backup if not already stored
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
  setRemoteObjects(items: RawData[]): void {
    if (items.length === 0) return;
    for (const raw of items) {
      if (!raw.class_id) continue;
      const id = (raw.id as string) || (raw._id as string);
      if (!id) continue;

      const existing = this.objects[id];
      if (existing) {
        // Update data in place — preserves proxy reference held by React components
        Object.assign(existing.data, raw);
        existing._snapshot = JSON.parse(JSON.stringify(existing.data));
      } else {
        // New object — create fresh
        const obj = new AtomObj(raw, this);
        this.objects[obj._id] = obj;
        obj._snapshot = JSON.parse(JSON.stringify(obj.data));
      }
    }
    // Intentionally NO _notifySubscribers() — avoids global re-render cascade.
    // The conversationClient emits targeted events that useConversation listens to.
  }

  /**
   * Store object in memory + persist via class storage adapter.
   * Uses add() for local creation, then triggers remote save.
   */
  setObject(objOrRaw: AtomObj | RawData): AtomObj {
    try {
      let obj: AtomObj;
      if (objOrRaw instanceof AtomObj) {
        // Already an AtomObj — index it
        obj = objOrRaw;
        this.objects[obj._id] = obj;
        this._notifySubscribers();
      } else {
        obj = this.add(objOrRaw);
      }

      // Persist via class storage adapter
      const storage = this._getClassStorage(obj.data.class_id);
      console.log(
        `%c[setObject]%c ${obj._id} class=${obj.data.class_id} storage=${storage ? storage._id + '(' + storage.data.type + ')' : 'null'}`,
        'background: #10b981; color: white; padding: 1px 6px; border-radius: 3px;', '',
      );
      if (storage) storage.setObject(obj);

      return obj;
    } catch (err) {
      this.onError?.('ElementStore.setObject', err);
      throw err;
    }
  }

  /**
   * Awaitable save: index in memory + await storage persistence.
   * Used by AtomObj.save() cascade so children get server IDs before parent saves.
   */
  async saveObjectAsync(obj: AtomObj): Promise<void> {
    try {
      this.objects[obj._id] = obj;
      this._notifySubscribers();

      const storage = this._getClassStorage(obj.data.class_id);
      console.log(
        `%c[saveObjectAsync]%c ${obj._id} class=${obj.data.class_id} storage=${storage ? storage._id + '(' + storage.data.type + ')' : 'null'}`,
        'background: #10b981; color: white; padding: 1px 6px; border-radius: 3px;', '',
      );
      if (storage) await storage.setObjectAsync(obj);
    } catch (err) {
      this.onError?.('ElementStore.saveObjectAsync', err);
      throw err;
    }
  }

  /**
   * Get the @storage adapter for a class (walks extends_id chain).
   * Checks: 1) explicit `storage` property, 2) `providers` array (CRUD), 3) store default.
   * With composite storages, the returned storage handles read/write routing internally.
   */
  _getClassStorage(classId: string): AtomStorage | null {
    if (META_IDS.has(classId)) return null;
    const chain = this.getInheritanceChain(classId);
    for (const cid of chain) {
      const cls = this.objects[cid];
      if (!cls) continue;
      // 1. Explicit storage reference (may be composite)
      const storageId = cls.data?.storage;
      if (storageId && typeof storageId === 'string') {
        const storageObj = this.objects[storageId];
        if (storageObj instanceof AtomStorage) return storageObj;
      }
      // 2. Providers array → CRUD storage (backward compat)
      const providers = cls.data?.providers as string[] | undefined;
      if (providers && providers.length > 0) {
        for (const pid of providers) {
          const prov = this.objects[pid];
          if (prov && prov.data.class_id === 'crud_provider') {
            const crudStorage = this.objects['@storage:crud'];
            if (crudStorage instanceof AtomStorage) return crudStorage;
          }
        }
      }
    }
    return this.storage; // 3. Store default
  }

  /**
   * Upsert: update existing or create new.
   * If object exists, merges data + fires _onChange.
   * If not, creates via setObject (factory dispatch).
   */
  upsertObject(raw: RawData): AtomObj {
    const id = raw.id;
    if (id && this.objects[id]) {
      const existing = this.objects[id];
      for (const k of Object.keys(raw)) {
        existing.data[k] = raw[k];
      }
      // Fire onChange
      if (existing._onChange.length > 0) {
        const info = { obj: existing, prop: '*', value: raw, oldValue: null };
        for (const fn of existing._onChange) fn(info);
      }
      this._notifySubscribers();
      return existing;
    }
    return this.setObject(raw);
  }

  /** Remove object from memory + delete from class storage. Notifies subscribers. */
  removeObject(id: string): boolean {
    try {
      const obj = this.objects[id];
      if (obj) {
        const storage = this._getClassStorage(obj.data.class_id);
        if (storage) storage.delObject(id);
        delete this.objects[id];
        this._notifySubscribers();
        return true;
      }
      return false;
    } catch (err) {
      this.onError?.('ElementStore.removeObject', err);
      throw err;
    }
  }

  /** Create object with resolved defaults merged */
  createElement(classId: string, data?: Record<string, unknown>): RawData {
    const defaults = this.getResolvedDefaults(classId);
    return {
      class_id: classId,
      ...defaults,
      ...data,
    };
  }

  /** Internal: set object locally only (no remote save, no subscriber notification). Used during seed(). */
  private _setObjectLocal(raw: RawData): AtomObj {
    const obj = new AtomObj(raw, this);
    this.objects[obj._id] = obj;
    return obj;
  }

  // --- Query ---

  /** Find objects by filter (local only) */
  find(filter: Record<string, unknown>): AtomObj[] {
    const results: AtomObj[] = [];
    for (const obj of Object.values(this.objects)) {
      let match = true;
      for (const k of Object.keys(filter)) {
        if (obj.data[k] !== filter[k]) { match = false; break; }
      }
      if (match) results.push(obj);
    }
    return results;
  }

  /** Get all class definitions (@class objects) */
  getClasses(): AtomObj[] {
    return this.find({ class_id: META_CLASS });
  }

  /** Get all instances of a given class (including subclasses) */
  getElementsByClass(classId: string): AtomObj[] {
    const results: AtomObj[] = [];
    for (const obj of Object.values(this.objects)) {
      const objClassId = obj.data.class_id;
      if (objClassId && !META_IDS.has(objClassId) && this.classExtends(objClassId, classId)) {
        results.push(obj);
      }
    }
    return results;
  }

  /** Get instances owned by a specific object (by owner_id or design_id) */
  getElementsByOwner(ownerId: string): AtomObj[] {
    return Object.values(this.objects).filter(obj =>
      obj.data.owner_id === ownerId || obj.data.design_id === ownerId
    );
  }

  /** Get all instance objects (non-class, non-prop, non-storage) */
  getInstances(): AtomObj[] {
    return Object.values(this.objects).filter(obj =>
      !META_IDS.has(obj.data.class_id)
    );
  }

  /** Get all dialog instances */
  getDialogs(): AtomObj[] {
    return this.getElementsByClass('ui:dialog');
  }

  /** Get all canvas instances */
  getCanvases(): AtomObj[] {
    return this.getElementsByClass('ui:canvas');
  }

  /** Get all button instances */
  getButtons(): AtomObj[] {
    return this.getElementsByClass('ui:button');
  }

  /** Get all panel instances */
  getPanels(): AtomObj[] {
    return this.getElementsByClass('ui:panel');
  }

  /** Get infra elements */
  getInfraElements(): AtomObj[] {
    return Object.values(this.objects).filter(obj => {
      const cid = obj.data.class_id;
      return cid && typeof cid === 'string' && cid.startsWith('infra:');
    });
  }

  /** Get domain elements (non-core, non-ui, non-infra, non-meta) */
  getDomainElements(): AtomObj[] {
    return Object.values(this.objects).filter(obj => {
      const cid = obj.data.class_id;
      if (!cid || META_IDS.has(cid)) return false;
      return !cid.startsWith('ui:') && !cid.startsWith('core:') && !cid.startsWith('infra:');
    });
  }

  // --- Instance lifecycle ---

  /** Clear all non-class, non-prop, non-storage instances from the store */
  clearInstances(): void {
    const toDelete: string[] = [];
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

  setToken(token: string | null): void {
    this._jwtToken = token;
  }

  getToken(): string | null {
    return this._jwtToken;
  }

  // --- Apply remote data ---

  /**
   * Apply external/remote data to an existing object.
   * Merges fields, updates snapshot (marks clean), fires _onChange.
   * If object doesn't exist, creates it via seedInstance (no write-through).
   */
  applyRemote(raw: RawData): AtomObj {
    if (!raw || !raw.id) throw new Error('applyRemote: id is required');

    const existing = this.objects[raw.id];
    if (existing) {
      for (const k of Object.keys(raw)) {
        existing.data[k] = raw[k];
      }
      existing._snapshot = JSON.parse(JSON.stringify(existing.data));
      // Fire onChange
      if (existing._onChange.length > 0) {
        const info = { obj: existing, prop: '*', value: raw, oldValue: null };
        for (const fn of existing._onChange) fn(info);
      }
      this._notifySubscribers();
      return existing;
    }

    // Use seedInstance to avoid write-through (don't POST fetched data back)
    return this.seedInstance(raw);
  }

  /** Save all objects that have unsaved changes via their class storage */
  saveDirty(): string[] {
    const saved: string[] = [];
    for (const obj of Object.values(this.objects)) {
      if (obj.hasChanges && obj.hasChanges()) {
        const storage = this._getClassStorage(obj.data.class_id);
        if (storage) storage.setObject(obj);
        obj._snapshot = JSON.parse(JSON.stringify(obj.data));
        saved.push(obj._id);
      }
    }
    return saved;
  }

  // --- Remote fetch (async, smart routing: CRUD or esProxy) ---

  /** Fetch single object. Uses class storage if available; falls back to esProxy. */
  async fetchRemote(id: string, classId?: string): Promise<AtomObj | null> {
    // If class has a storage adapter, fetch the full list then find the one we want
    if (classId) {
      const storage = this._getClassStorage(classId);
      if (storage) {
        await this.fetchObjects(classId);
        return this.objects[id] || null;
      }
    }

    try {
      // Dynamic import to avoid circular deps — elementStoreClient is injected at runtime
      const { elementStoreClient } = await import('../modules/ElementStoreClient.ts');
      let raw: RawData | null = null;

      if (classId) {
        raw = await elementStoreClient.getObject(classId, id);
      } else {
        const dotIndex = id.indexOf('.');
        if (dotIndex > 0) {
          const derivedClass = id.substring(0, dotIndex);
          raw = await elementStoreClient.getObject(derivedClass, id);
        }
      }

      if (raw) {
        const obj = this.applyRemote(raw);
        return obj;
      }
    } catch (e) {
      console.warn('fetchRemote failed for ' + id + ':', e);
    }
    return null;
  }

  /**
   * Check if a class is backed by a CRUD provider.
   */
  isCrudBacked(classId: string): boolean {
    const cls = this.objects[classId];
    const providers = cls?.data?.providers as string[] | undefined;
    if (!providers || providers.length === 0) return false;
    for (const pid of providers) {
      const prov = this.objects[pid];
      if (prov && prov.data.class_id === 'crud_provider') return true;
    }
    return false;
  }

  /**
   * Smart fetch: delegates to the class's storage adapter.
   * The storage (which may be composite) handles routing internally.
   * Falls back to esProxy if no class storage is configured.
   */
  async fetchObjects(classId: string): Promise<AtomObj[]> {
    const storage = this._getClassStorage(classId);
    if (storage) {
      try {
        const items = await storage.fetchList(classId);
        const results: AtomObj[] = [];
        for (const raw of items) {
          if (!raw.id) continue;
          const obj = this.applyRemote({ ...raw, class_id: raw.class_id || classId });
          results.push(obj);
        }
        if (results.length > 0) {
          console.log(`[fetchObjects] Loaded ${results.length} ${classId} via ${storage.data.type} storage`);
        }
        return results;
      } catch (e) {
        console.warn(`fetchObjects(${classId}) storage failed:`, e);
        return [];
      }
    }

    // No class storage — fallback to esProxy
    try {
      const { elementStoreClient } = await import('../modules/ElementStoreClient.ts');
      const items = await elementStoreClient.getObjects(classId);
      const results: AtomObj[] = [];
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
  async fetchCrud(classId: string): Promise<AtomObj[]> {
    try {
      // Find CRUD storage adapter
      const crudStorage = this.objects['@storage:crud'];
      if (!(crudStorage instanceof AtomStorage)) {
        console.warn('fetchCrud: @storage:crud not found');
        return [];
      }

      const items = await crudStorage.fetchList(classId);
      const results: AtomObj[] = [];

      for (const raw of items) {
        if (!raw.id) continue;
        // Use applyRemote so existing objects get updated, new ones get created
        const obj = this.applyRemote(raw);
        results.push(obj);
      }

      console.log(`[fetchCrud] Loaded ${results.length} ${classId} objects`);
      return results;
    } catch (err) {
      this.onError?.('ElementStore.fetchCrud', err);
      throw err;
    }
  }

  // --- Subscriptions (global, for React top-level) ---

  subscribe(callback: () => void): () => void {
    this._subscribers.add(callback);
    return () => this._subscribers.delete(callback);
  }

  private _notifySubscribers(): void {
    this._version++;
    for (const cb of this._subscribers) {
      try { cb(); } catch (e) { console.error('ElementStore subscriber error:', e); }
    }
  }
}
