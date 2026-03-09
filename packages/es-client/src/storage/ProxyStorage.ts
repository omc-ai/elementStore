/**
 * ProxyStorage
 *
 * A storage backend that routes all CRUD operations to a remote ElementStore HTTP API.
 * Used by arch-backend so it can participate in the ES storage graph without owning data.
 */

import type { Element } from '../types.ts';
import { elementStoreClient as defaultClient } from '../modules/ElementStoreClient.ts';

export interface ProxyStorageConfig {
  url: string;        // Remote ES base URL, e.g. 'http://arc3d.master.local/elementStore'
  token?: string;     // Optional Bearer token
}

export class ProxyStorage {
  private baseUrl: string;
  private token: string | undefined;

  constructor(config: ProxyStorageConfig) {
    this.baseUrl = config.url;
    this.token = config.token;
  }

  private get _headers(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    return headers;
  }

  private async _fetch<T>(url: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(url, {
      ...init,
      headers: { ...this._headers, ...(init.headers as Record<string, string> || {}) },
    });
    if (!res.ok) {
      throw new Error(`ProxyStorage: ${init.method || 'GET'} ${url} → ${res.status}`);
    }
    if (res.status === 204) return null as unknown as T;
    return res.json() as Promise<T>;
  }

  async setObject(classId: string, data: Partial<Element>): Promise<Element> {
    if (data.id) {
      return this.updateObject(classId, data.id, data);
    }
    return this.createObject(classId, data);
  }

  async getObject(classId: string, id: string): Promise<Element | null> {
    try {
      return await this._fetch<Element>(
        `${this.baseUrl}/store/${encodeURIComponent(classId)}/${encodeURIComponent(id)}`
      );
    } catch {
      return null;
    }
  }

  async createObject(classId: string, data: Partial<Element>): Promise<Element> {
    return this._fetch<Element>(
      `${this.baseUrl}/store/${encodeURIComponent(classId)}`,
      { method: 'POST', body: JSON.stringify(data) }
    );
  }

  async updateObject(classId: string, id: string, data: Partial<Element>): Promise<Element> {
    return this._fetch<Element>(
      `${this.baseUrl}/store/${encodeURIComponent(classId)}/${encodeURIComponent(id)}`,
      { method: 'PUT', body: JSON.stringify(data) }
    );
  }

  async deleteObject(classId: string, id: string): Promise<boolean> {
    try {
      await this._fetch<void>(
        `${this.baseUrl}/store/${encodeURIComponent(classId)}/${encodeURIComponent(id)}`,
        { method: 'DELETE' }
      );
      return true;
    } catch {
      return false;
    }
  }

  async fetchList(classId: string, filters?: Record<string, string>): Promise<Element[]> {
    const params = filters
      ? '?' + new URLSearchParams(filters).toString()
      : '';
    return this._fetch<Element[]>(
      `${this.baseUrl}/store/${encodeURIComponent(classId)}${params}`
    );
  }

  setToken(token: string): void {
    this.token = token;
  }
}

// Convenience: re-export the default (Vite-env) client for consumers that just need it
export { defaultClient as elementStoreClient };
