/**
 * ElementStoreClient — Universal HTTP client for the ElementStore PHP backend
 *
 * Works in both browser (Vite/import.meta.env) and Node.js (process.env) contexts.
 * The class accepts baseUrl as a constructor parameter.
 * The module-level singleton `elementStoreClient` is configured from environment
 * variables detected at load time.
 *
 * Frontend (Vite):  VITE_ELEMENT_STORE_URL or /api/esProxy (via Vite proxy)
 * Backend (Node):   ELEMENT_STORE_URL or https://arc3d.master.local/elementStore
 */

import type {
  Element,
  Prop,
  ResolvedClass,
  QueryOptions,
  PaginatedResponse,
  ElementStoreError,
} from '../types.ts';
import { isElementStoreError } from '../types.ts';

// ============================================
// Configuration — environment detection
// ============================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _nodeProcess = (typeof globalThis !== 'undefined' ? (globalThis as any).process : undefined) as
  | { env?: Record<string, string | undefined> }
  | undefined;

function _resolveDefaultBaseUrl(): string {
  // Node.js / tsx
  if (_nodeProcess?.env) {
    return _nodeProcess.env['ELEMENT_STORE_URL'] || 'https://arc3d.master.local/elementStore';
  }
  // Browser / Vite
  if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
    const env = (import.meta as any).env;
    const apiBase = (env.BASE_URL || '/').replace(/\/$/, '');
    return env.VITE_ELEMENT_STORE_URL || `${apiBase}/api/esProxy`;
  }
  return '/api/esProxy';
}

// ============================================
// Error Types
// ============================================

export class ElementStoreApiError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(message: string, code: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ElementStoreApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

// ============================================
// Genesis Types (re-exported from client)
// ============================================

export interface GenesisResult {
  success: boolean;
  loaded: number;
  failed: number;
  errors: Array<{ classId: string; error: string }>;
  classes: string[];
}

export type GenesisResponse = Element[] | {
  classes?: Element[];
  '@class'?: Element[];
};

export function extractGenesisClasses(genesis: GenesisResponse): Element[] {
  if (Array.isArray(genesis)) return genesis;
  return genesis.classes || genesis['@class'] || [];
}

// ============================================
// Response handler
// ============================================

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorData: ElementStoreError | null = null;
    try {
      errorData = await response.json() as ElementStoreError;
    } catch {
      // not JSON
    }

    const message = errorData?.message || `ElementStore API error: ${response.status} ${response.statusText}`;
    const code = errorData?.code || 'API_ERROR';

    console.error('[ElementStore] API Error:', {
      status: response.status,
      statusText: response.statusText,
      url: response.url,
      error: errorData,
    });

    throw new ElementStoreApiError(message, code, response.status, errorData?.details);
  }

  if (response.status === 204) {
    return null as unknown as T;
  }

  const data = await response.json();

  if (isElementStoreError(data)) {
    throw new ElementStoreApiError(data.message, data.code, response.status, data.details);
  }

  return data as T;
}

// ============================================
// Fetch with optional timeout (backend use)
// ============================================

async function _fetchMaybeTimeout(url: string, options: RequestInit & { timeout?: number } = {}): Promise<Response> {
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

// ============================================
// ElementStoreClient class
// ============================================

export class ElementStoreClient {
  private baseUrl: string;
  private token: string | undefined;
  private timeout: number | undefined;

  constructor(baseUrl?: string, token?: string, timeout?: number) {
    this.baseUrl = baseUrl || _resolveDefaultBaseUrl();
    this.token = token;
    this.timeout = timeout;
  }

  setToken(token: string | null): void {
    this.token = token ?? undefined;
  }

  private get _headers(): HeadersInit {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    return headers;
  }

  private _fetch(url: string, init: RequestInit = {}): Promise<Response> {
    return _fetchMaybeTimeout(url, {
      ...init,
      headers: { ...this._headers as Record<string, string>, ...(init.headers as Record<string, string> || {}) },
      timeout: this.timeout,
    });
  }

  // ── Class Operations ────────────────────────────────────────────────────

  async getClasses(): Promise<Element[]> {
    const res = await this._fetch(`${this.baseUrl}/class`);
    return handleResponse<Element[]>(res);
  }

  async getClass(classId: string): Promise<Element | null> {
    try {
      const res = await this._fetch(`${this.baseUrl}/class/${encodeURIComponent(classId)}`);
      return handleResponse<Element>(res);
    } catch (e) {
      if (e instanceof ElementStoreApiError && e.status === 404) return null;
      throw e;
    }
  }

  async getClassWithProps(classId: string): Promise<ResolvedClass | null> {
    try {
      const res = await this._fetch(`${this.baseUrl}/class/${encodeURIComponent(classId)}/props`);
      return handleResponse<ResolvedClass>(res);
    } catch (e) {
      if (e instanceof ElementStoreApiError && e.status === 404) return null;
      throw e;
    }
  }

  async upsertClass(classData: Partial<Element>): Promise<Element> {
    const res = await this._fetch(`${this.baseUrl}/class`, {
      method: 'POST',
      body: JSON.stringify(classData),
    });
    return handleResponse<Element>(res);
  }

  async deleteClass(classId: string): Promise<boolean> {
    try {
      const res = await this._fetch(`${this.baseUrl}/class/${encodeURIComponent(classId)}`, { method: 'DELETE' });
      await handleResponse<void>(res);
      return true;
    } catch (e) {
      if (e instanceof ElementStoreApiError && e.status === 404) return false;
      throw e;
    }
  }

  // ── Object Operations ────────────────────────────────────────────────────

  async getObjects(classId: string): Promise<Element[]> {
    const res = await this._fetch(`${this.baseUrl}/store/${encodeURIComponent(classId)}`);
    return handleResponse<Element[]>(res);
  }

  async getObject(classId: string, id: string): Promise<Element | null> {
    try {
      const res = await this._fetch(
        `${this.baseUrl}/store/${encodeURIComponent(classId)}/${encodeURIComponent(id)}`
      );
      return handleResponse<Element>(res);
    } catch (e) {
      if (e instanceof ElementStoreApiError && e.status === 404) return null;
      throw e;
    }
  }

  async createObject(classId: string, data: Partial<Element>): Promise<Element> {
    const res = await this._fetch(`${this.baseUrl}/store/${encodeURIComponent(classId)}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return handleResponse<Element>(res);
  }

  async updateObject(classId: string, id: string, data: Partial<Element>): Promise<Element> {
    const res = await this._fetch(
      `${this.baseUrl}/store/${encodeURIComponent(classId)}/${encodeURIComponent(id)}`,
      { method: 'PUT', body: JSON.stringify(data) }
    );
    return handleResponse<Element>(res);
  }

  async deleteObject(classId: string, id: string): Promise<boolean> {
    try {
      const res = await this._fetch(
        `${this.baseUrl}/store/${encodeURIComponent(classId)}/${encodeURIComponent(id)}`,
        { method: 'DELETE' }
      );
      await handleResponse<void>(res);
      return true;
    } catch (e) {
      if (e instanceof ElementStoreApiError && e.status === 404) return false;
      throw e;
    }
  }

  // ── Query Operations ─────────────────────────────────────────────────────

  async query(
    classId: string,
    filters: Record<string, unknown> = {},
    options: QueryOptions = {}
  ): Promise<Element[]> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null) params.append(key, String(value));
    }
    if (options.page !== undefined) params.append('page', String(options.page));
    if (options.pageSize !== undefined) params.append('pageSize', String(options.pageSize));
    if (options.sortBy) params.append('sortBy', options.sortBy);
    if (options.sortOrder) params.append('sortOrder', options.sortOrder);

    const qs = params.toString();
    const url = `${this.baseUrl}/query/${encodeURIComponent(classId)}${qs ? `?${qs}` : ''}`;
    const res = await this._fetch(url);
    return handleResponse<Element[]>(res);
  }

  async queryPaginated(
    classId: string,
    filters: Record<string, unknown> = {},
    options: QueryOptions = {}
  ): Promise<PaginatedResponse<Element>> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null) params.append(key, String(value));
    }
    const page = options.page || 1;
    const pageSize = options.pageSize || 50;
    params.append('page', String(page));
    params.append('pageSize', String(pageSize));
    if (options.sortBy) params.append('sortBy', options.sortBy);
    if (options.sortOrder) params.append('sortOrder', options.sortOrder);

    const url = `${this.baseUrl}/query/${encodeURIComponent(classId)}?${params.toString()}`;
    const res = await this._fetch(url);
    const total = parseInt(res.headers.get('X-Total-Count') || '0', 10);
    const data = await handleResponse<Element[]>(res);

    return {
      data,
      total: total || data.length,
      page,
      pageSize,
      totalPages: Math.ceil((total || data.length) / pageSize),
    };
  }

  // ── Batch Operations ─────────────────────────────────────────────────────

  async batchUpdate(
    updates: Array<{ classId: string; id: string; data: Partial<Element> }>
  ): Promise<Element[]> {
    const results: Element[] = [];
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

  async batchCreate(
    items: Array<{ classId: string; data: Partial<Element> }>
  ): Promise<Element[]> {
    const results: Element[] = [];
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

  async healthCheck(): Promise<{ ok: boolean; message?: string; timestamp?: string }> {
    try {
      const res = await this._fetch(`${this.baseUrl}/info`);
      if (res.ok) {
        const data = await res.json() as Record<string, unknown>;
        return { ok: data.ok !== false, timestamp: new Date().toISOString(), ...data };
      }
      return { ok: false, message: `ElementStore returned status ${res.status}`, timestamp: new Date().toISOString() };
    } catch (e) {
      return {
        ok: false,
        message: e instanceof Error ? e.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      };
    }
  }

  // ── Genesis Operations ────────────────────────────────────────────────────

  async getGenesis(): Promise<GenesisResponse> {
    const res = await this._fetch(`${this.baseUrl}/genesis`);
    return handleResponse<GenesisResponse>(res);
  }

  async getGenesisClassIds(): Promise<{ classIds: string[]; count: number }> {
    const res = await this._fetch(`${this.baseUrl}/genesis/classes`);
    return handleResponse<{ classIds: string[]; count: number }>(res);
  }

  async validateGenesis(): Promise<{ valid: boolean; errors: string[] }> {
    const res = await this._fetch(`${this.baseUrl}/genesis/validate`);
    return handleResponse<{ valid: boolean; errors: string[] }>(res);
  }

  async seedGenesis(force?: boolean): Promise<GenesisResult> {
    const url = `${this.baseUrl}/genesis/seed${force ? '?force=true' : ''}`;
    const res = await this._fetch(url, { method: 'POST', body: JSON.stringify({}) });
    return handleResponse<GenesisResult>(res);
  }

  // ── Prop Operations ───────────────────────────────────────────────────────

  /** Get props for a class */
  async getClassProps(classId: string): Promise<Prop[]> {
    const res = await this._fetch(`${this.baseUrl}/class/${encodeURIComponent(classId)}/props`);
    return handleResponse<Prop[]>(res);
  }

  // ── Configuration ────────────────────────────────────────────────────────

  get baseUrlValue(): string {
    return this.baseUrl;
  }
}

// ============================================
// Default singleton client
// ============================================

export const elementStoreClient = new ElementStoreClient();

// Register on globalThis for AppContext store accessor (avoids circular imports)
if (typeof globalThis !== 'undefined') {
  (globalThis as any).__elementStoreClient = elementStoreClient;
}
