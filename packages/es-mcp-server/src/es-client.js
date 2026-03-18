/**
 * ElementStore HTTP client — thin wrapper over the REST API.
 * Used by the MCP server to discover classes and execute operations.
 */
export class EsClient {
  constructor(baseUrl, options = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.token = options.token || null;
    this.appId = options.appId || 'mcp-server';
  }

  async _fetch(path, options = {}) {
    const url = `${this.baseUrl}${path}`;
    const headers = {
      'Content-Type': 'application/json',
      'X-App-Id': this.appId,
      ...options.headers,
    };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

    const res = await fetch(url, { ...options, headers });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }

    if (!res.ok) {
      const msg = typeof data === 'object' ? (data.error || data.message || JSON.stringify(data)) : data;
      throw new Error(`ES ${res.status}: ${msg}`);
    }
    return data;
  }

  // ── Health ──
  async health() {
    return this._fetch('/health');
  }

  // ── Classes ──
  async listClasses() {
    return this._fetch('/class');
  }

  async getClass(classId) {
    return this._fetch(`/class/${encodeURIComponent(classId)}`);
  }

  async getClassProps(classId) {
    return this._fetch(`/class/${encodeURIComponent(classId)}/props`);
  }

  // ── Objects ──
  async listObjects(classId, params = {}) {
    const qs = new URLSearchParams(params).toString();
    const path = `/query/${encodeURIComponent(classId)}${qs ? '?' + qs : ''}`;
    return this._fetch(path);
  }

  async getObject(classId, objectId) {
    return this._fetch(`/store/${encodeURIComponent(classId)}/${encodeURIComponent(objectId)}`);
  }

  async createObject(classId, data) {
    return this._fetch(`/store/${encodeURIComponent(classId)}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateObject(classId, objectId, data) {
    return this._fetch(`/store/${encodeURIComponent(classId)}/${encodeURIComponent(objectId)}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteObject(classId, objectId) {
    return this._fetch(`/store/${encodeURIComponent(classId)}/${encodeURIComponent(objectId)}`, {
      method: 'DELETE',
    });
  }

  async findObject(objectId) {
    return this._fetch(`/find/${encodeURIComponent(objectId)}`);
  }

  // ── Actions ──
  async executeAction(actionId, params = {}) {
    return this._fetch(`/action/${encodeURIComponent(actionId)}/execute`, {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  // ── Genesis ──
  async genesis() {
    return this._fetch('/genesis', { method: 'POST' });
  }

  async genesisVerify() {
    return this._fetch('/genesis');
  }
}
