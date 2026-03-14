/**
 * AtomStorage — Storage adapter with standard interface
 *
 * Every storage adapter implements: setObject(), getObject(), delObject()
 * The type field determines the backend: 'local' (localStorage), 'api' (remote), 'crud' (REST endpoints).
 * No storage = memory only (no persistence).
 *
 * Cascade save for relations (works the same for any storage type):
 *   New parent:  create parent (empty relations) → create children → update parent with IDs
 *   Existing:    create/update dirty children → update parent with IDs
 */

import { AtomObj, type RawData } from '../core/AtomObj.ts';
import { elementStoreClient } from '../modules/ElementStoreClient.ts';
import type { ElementStore } from '../core/ElementStore.ts';

/** Auth data stored by setAuth() — mirrors login/refresh response shape */
export interface AuthData {
  user?: Record<string, unknown>;
  tokens?: { accessToken: string; refreshToken: string };
  app?: Record<string, unknown>;
  [key: string]: unknown;
}

export class AtomStorage extends AtomObj {
  static override CLASS_ID = '@storage';

  // ── Auth state (used by admin dashboard and any browser client) ──
  auth: AuthData | null = null;
  authUrl: string | null = null;        // e.g. '/api/auth'
  onAuthRequired: (() => void) | null = null;
  private _refreshing = false;
  private _refreshPromise: Promise<boolean> | null = null;

  constructor(raw: RawData | string, store?: ElementStore) {
    super(raw, store);
  }

  // --- Auth management ---

  /** Store auth data from login/refresh response. Syncs store token + localStorage. */
  setAuth(data: AuthData | null): void {
    this.auth = data;
    const token = data?.tokens?.accessToken ?? null;
    this.store?.setToken(token);
    try {
      if (data) {
        localStorage.setItem('es_auth', JSON.stringify(data));
      } else {
        localStorage.removeItem('es_auth');
      }
    } catch { /* quota exceeded or SSR */ }
  }

  /** Get current access token from auth state */
  getToken(): string | null {
    return this.auth?.tokens?.accessToken ?? null;
  }

  /** Clear all auth state */
  clearAuth(): void {
    this.auth = null;
    this.store?.setToken(null);
    try { localStorage.removeItem('es_auth'); } catch { /* SSR */ }
  }

  /** Restore auth from localStorage (call on app startup). Returns true if token found. */
  restoreAuth(): boolean {
    try {
      const raw = localStorage.getItem('es_auth');
      if (raw) {
        this.auth = JSON.parse(raw) as AuthData;
        const token = this.auth?.tokens?.accessToken ?? null;
        this.store?.setToken(token);
        return true;
      }
    } catch { /* corrupt storage */ }
    return false;
  }

  /** Async token refresh with deduplication. Returns true if refreshed successfully. */
  refreshAuth(): Promise<boolean> {
    if (this._refreshing && this._refreshPromise) return this._refreshPromise;
    this._refreshing = true;
    this._refreshPromise = this._doRefreshAsync().finally(() => {
      this._refreshing = false;
      this._refreshPromise = null;
    });
    return this._refreshPromise;
  }

  private async _doRefreshAsync(): Promise<boolean> {
    const rt = this.auth?.tokens?.refreshToken;
    if (!rt || !this.authUrl) return false;
    try {
      const res = await fetch(this.authUrl + '/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: rt }),
      });
      if (!res.ok) return false;
      const data = await res.json() as { accessToken: string; refreshToken: string };
      if (this.auth?.tokens) {
        this.auth.tokens.accessToken = data.accessToken;
        this.auth.tokens.refreshToken = data.refreshToken;
      }
      this.store?.setToken(data.accessToken);
      try { localStorage.setItem('es_auth', JSON.stringify(this.auth)); } catch { /* quota */ }
      return true;
    } catch {
      return false;
    }
  }

  // --- CRUD helpers ---

  /** Resolve the crud_provider object for a given class_id */
  private _resolveCrudProvider(classId: string): AtomObj | null {
    if (!this.store) return null;
    const cls = this.store.getObject(classId);
    const providers = cls?.data?.providers as string[] | undefined;
    if (!providers || providers.length === 0) return null;
    // Find the first provider that is a crud_provider
    for (const pid of providers) {
      const prov = this.store.getObject(pid);
      if (prov && prov.data.class_id === 'crud_provider') return prov;
    }
    return null;
  }

  /** Build full URL from provider base_url + endpoint pattern, substituting {id} */
  private _buildCrudUrl(provider: AtomObj, endpointKey: string, id?: string): string {
    const baseUrl = (provider.data.base_url as string) || '';
    const pattern = (provider.data[endpointKey] as string) || '';
    let url = baseUrl + pattern;
    if (id) url = url.replace('{id}', id);
    // Prepend API base from env (browser only)
    const apiBase = (typeof import.meta !== 'undefined' && (import.meta as any).env?.BASE_URL || '/').replace(/\/$/, '');
    return apiBase + url;
  }

  /** Get auth headers (JWT from store) */
  private _getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = this.store?.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }

  // --- Composite helpers ---

  /** Resolve a storage reference (string ID) to an AtomStorage instance */
  private _resolveStorage(storageId: string): AtomStorage | null {
    if (!this.store) return null;
    const obj = this.store.objects[storageId];
    return obj instanceof AtomStorage ? obj : null;
  }

  /** Get write storage for composite type */
  private _getWriteStorage(): AtomStorage | null {
    const writeId = this.data.write as string;
    return writeId ? this._resolveStorage(writeId) : null;
  }

  /** Get ordered read storage chain for composite type */
  private _getReadChain(): AtomStorage[] {
    const read = this.data.read;
    const ids: string[] = Array.isArray(read) ? read : (typeof read === 'string' ? [read] : []);
    const result: AtomStorage[] = [];
    for (const id of ids) {
      const s = this._resolveStorage(id);
      if (s) result.push(s);
    }
    return result;
  }

  // --- API helpers ---

  /** POST object to remote API, apply server-assigned ID + re-key in store */
  private _applyServerResponse(obj: AtomObj, response: Record<string, unknown>): void {
    if (!response?.id) return;
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
  setObject(obj: AtomObj): void {
    this.setObjectAsync(obj).catch(() => {});
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
  async setObjectAsync(obj: AtomObj): Promise<void> {
    const type = this.data.type;

    // Composite → delegate to write storage
    if (type === 'composite') {
      const writeStorage = this._getWriteStorage();
      if (writeStorage) await writeStorage.setObjectAsync(obj);
      return;
    }

    // No relations → simple persist
    if (!obj.store) {
      await this._persistSingle(obj);
      return;
    }

    const relationMeta = this._getRelationMeta(obj);
    if (relationMeta.length === 0) {
      await this._persistSingle(obj);
      return;
    }

    // --- Cascade save ---
    const isNew = !obj._snapshot;

    if (isNew) {
      // Stash relation arrays, save parent with empty arrays first
      const stashed: Record<string, unknown> = {};
      for (const rm of relationMeta) {
        stashed[rm.key] = obj.data[rm.key];
        obj.data[rm.key] = [];
      }
      await this._persistSingle(obj);
      // Restore
      for (const rm of relationMeta) {
        obj.data[rm.key] = stashed[rm.key];
      }
    }

    // Save dirty children (set back-ref to parent's server ID)
    for (const rm of relationMeta) {
      const children = obj.objects[rm.key];
      if (!Array.isArray(children)) continue;
      for (const child of children) {
        if (!(child instanceof AtomObj)) continue;
        // Set back-reference (e.g. design_id = parent.id)
        if (rm.backRefKey && obj.data.id) {
          child.data[rm.backRefKey] = obj.data.id;
        }
        if (child.hasChanges()) {
          await this._persistSingle(child);
        }
      }
    }

    // Rebuild relation ID arrays with server-assigned IDs, then save parent
    obj._syncRelationIds();
    await this._persistSingle(obj);
  }

  /** Get relation metadata for an object's class */
  private _getRelationMeta(obj: AtomObj): Array<{ key: string; classId: string; backRefKey: string | null }> {
    if (!obj.store) return [];
    const result: Array<{ key: string; classId: string; backRefKey: string | null }> = [];
    const props = obj.store.collectClassProps(obj.data.class_id);
    const parentClassId = obj.data.class_id;

    for (const propObj of props) {
      // Only cascade for indexed array relations (not assoc, not single)
      const arrMode = propObj.data.is_array;
      if (propObj.data.data_type !== 'relation' || !(arrMode === true || arrMode === 'indexed')) continue;
      const dotIdx = propObj.data.id.lastIndexOf('.');
      const key = dotIdx >= 0 ? propObj.data.id.substring(dotIdx + 1) : propObj.data.id;
      const targetClassId = propObj.data.object_class_id;
      if (!targetClassId) continue;

      // Find child's back-reference prop pointing to parent class
      let backRefKey: string | null = null;
      const childProps = obj.store.collectClassProps(targetClassId);
      for (const cp of childProps) {
        // Back-ref must be a single relation (not array, not assoc)
        if (cp.data.data_type !== 'relation' || cp.data.is_array === true || cp.data.is_array === 'indexed' || cp.data.is_array === 'assoc') continue;
        const targets = Array.isArray(cp.data.object_class_id)
          ? cp.data.object_class_id : [cp.data.object_class_id];
        if (targets.includes(parentClassId)) {
          const di = cp.data.id.lastIndexOf('.');
          backRefKey = di >= 0 ? cp.data.id.substring(di + 1) : cp.data.id;
          break;
        }
      }

      result.push({ key, classId: targetClassId, backRefKey });
    }
    return result;
  }

  /** Persist a single object (no cascade). Handles type routing. */
  private async _persistSingle(obj: AtomObj): Promise<void> {
    const id = obj.data.id;
    const isNew = !obj._snapshot;

    if (!id && !isNew) {
      console.warn(`[AtomStorage] SKIP — no data.id on ${obj._id} (class=${obj.data.class_id})`);
      return;
    }

    const type = this.data.type;
    console.log(
      `%c[AtomStorage]%c ${this._id}(${type}) → ${id || obj._id} class=${obj.data.class_id} isNew=${isNew}`,
      'background: #6366f1; color: white; padding: 1px 6px; border-radius: 3px;', '',
    );

    if (type === 'composite') {
      const writeStorage = this._getWriteStorage();
      console.log(`  composite → write=${writeStorage?._id || 'null'}`);
      if (writeStorage) await writeStorage._persistSingle(obj);
      return;
    }

    if (type === 'seed') return;

    if (type === 'local') {
      if (!id) return;
      try {
        let dataToSave = obj.data;

        // When exclude_readonly is set, filter out readonly props
        if (this.data.exclude_readonly && obj.store) {
          const classId = obj.data.class_id as string;
          const allProps = obj.store.collectClassProps(classId);
          const readonlyKeys = new Set<string>();
          for (const p of allProps) {
            if (p.data.readonly) readonlyKeys.add(p.data.key as string);
          }
          if (readonlyKeys.size > 0) {
            dataToSave = {};
            for (const [k, v] of Object.entries(obj.data)) {
              if (!readonlyKeys.has(k)) dataToSave[k] = v;
            }
          }
        }

        localStorage.setItem(`es:${id}`, JSON.stringify(dataToSave));
      } catch { /* quota exceeded */ }
    } else if (type === 'api') {
      const classId = obj.data.class_id;

      if (isNew) {
        // CREATE: POST — server assigns ID, we re-key locally
        console.log(`  api → CREATE ${classId} (local: ${obj._id})`);
        const response = await elementStoreClient.createObject(classId, obj.data);
        this._applyServerResponse(obj, response); // sets snapshot + re-keys
      } else {
        // UPDATE: PUT — fall back to CREATE on 404 (seed objects never saved remotely)
        console.log(`  api → UPDATE ${classId}/${id}`);
        try {
          await elementStoreClient.updateObject(classId, id!, obj.data);
          obj._snapshot = JSON.parse(JSON.stringify(obj.data));
        } catch (e: any) {
          if (e?.status === 404) {
            console.log(`  api → UPDATE 404, falling back to CREATE ${classId}/${id}`);
            const response = await elementStoreClient.createObject(classId, obj.data);
            this._applyServerResponse(obj, response);
          } else {
            throw e;
          }
        }
      }
    } else if (type === 'crud') {
      const classId = obj.data.class_id;
      const provider = this._resolveCrudProvider(classId);
      if (!provider) return;

      const endpointKey = isNew ? 'create_one' : 'update_one';
      const method = isNew ? 'POST' : 'PUT';
      const url = this._buildCrudUrl(provider, endpointKey, id);
      const mapping = (provider.data.mapping as Record<string, string>) || {};

      // Strip internal fields before sending
      const payload: Record<string, unknown> = {};
      for (const k of Object.keys(obj.data)) {
        if (k !== 'class_id' && k !== '_snapshot') payload[k] = obj.data[k];
      }

      const res = await fetch(url, {
        method,
        headers: this._getAuthHeaders(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`CRUD ${method} failed: ${res.status}`);
      const json = await res.json();
      // Unwrap response using mapping._item_key
      const itemKey = mapping._item_key;
      const responseData = itemKey && json[itemKey] ? json[itemKey] : json;
      // Merge server response back (e.g., server-assigned ID)
      if (responseData?.id && responseData.id !== id && obj.store) {
        this._applyServerResponse(obj, responseData);
      }
      // Update snapshot to mark as clean
      obj._snapshot = JSON.parse(JSON.stringify(obj.data));
    }
  }

  /** Load object data from this storage (sync) */
  getObject(id: string): RawData | null {
    const type = this.data.type;

    if (type === 'composite') {
      // Walk read chain, return first non-null
      for (const s of this._getReadChain()) {
        const result = s.getObject(id);
        if (result) return result;
      }
      return null;
    }

    if (type === 'seed') {
      return this.store?._seedData[id] || null;
    }

    if (type === 'local') {
      try {
        const raw = localStorage.getItem(`es:${id}`);
        return raw ? JSON.parse(raw) : null;
      } catch { return null; }
    }
    // API and CRUD load are async — use fetchList()
    return null;
  }

  /** Delete object from this storage */
  delObject(id: string): void {
    const type = this.data.type;

    if (type === 'composite') {
      // Delegate to write storage
      const writeStorage = this._getWriteStorage();
      if (writeStorage) writeStorage.delObject(id);
      return;
    }

    if (type === 'seed') {
      // Seed storage is read-only — no-op
      return;
    }

    if (type === 'local') {
      try { localStorage.removeItem(`es:${id}`); } catch {}
    } else if (type === 'api') {
      const obj = this.store?.getObject(id);
      const classId = obj?.data?.class_id;
      if (classId) {
        elementStoreClient.deleteObject(classId, id)
          .catch(e => console.warn('AtomStorage.delObject (api) failed:', e));
      }
    } else if (type === 'crud') {
      const obj = this.store?.getObject(id);
      const classId = obj?.data?.class_id;
      if (!classId) return;

      const provider = this._resolveCrudProvider(classId);
      if (!provider) return;

      const url = this._buildCrudUrl(provider, 'delete_one', id);
      fetch(url, {
        method: 'DELETE',
        headers: this._getAuthHeaders(),
      }).catch(e => console.warn('AtomStorage.delObject (crud) failed:', e));
    }
  }

  // --- Bulk fetch ---

  /** Fetch all objects of a class from this storage */
  async fetchList(classId: string): Promise<RawData[]> {
    const type = this.data.type;

    if (type === 'composite') {
      // Walk read chain: try each storage in order, return first successful non-empty result
      for (const s of this._getReadChain()) {
        try {
          const items = await s.fetchList(classId);
          if (items.length > 0) return items;
        } catch { /* try next */ }
      }
      return [];
    }

    if (type === 'seed') {
      // Return matching seed data for this class
      if (!this.store) return [];
      const results: RawData[] = [];
      for (const raw of Object.values(this.store._seedData)) {
        if (raw.class_id === classId) results.push({ ...raw });
      }
      return results;
    }

    if (type === 'api') {
      // Fetch from esProxy client
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

    if (type === 'crud') {
      const provider = this._resolveCrudProvider(classId);
      if (!provider) return [];

      const url = this._buildCrudUrl(provider, 'get_list');
      const mapping = (provider.data.mapping as Record<string, string>) || {};

      try {
        const res = await fetch(url, { headers: this._getAuthHeaders() });
        if (!res.ok) throw new Error(`CRUD GET list failed: ${res.status}`);
        const json = await res.json();

        // Unwrap response using mapping._list_key
        const listKey = mapping._list_key;
        const items: RawData[] = listKey && json[listKey] ? json[listKey] : (Array.isArray(json) ? json : []);

        // Inject class_id from mapping._class_id
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
}
