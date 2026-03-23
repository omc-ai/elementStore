/**
 * ElementStore HTTP client — thin wrapper over the REST API.
 * Used by the MCP server to discover classes and execute operations.
 */

// Encode for URL path segments but keep colons (ES IDs use ns:name)
function encodeES(segment) {
  return encodeURIComponent(segment).replace(/%3A/gi, ':');
}

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
    return this._fetch(`/class/${encodeES(classId)}`);
  }

  async getClassProps(classId) {
    return this._fetch(`/class/${encodeES(classId)}/props`);
  }

  // ── Objects ──
  async listObjects(classId, params = {}) {
    const qs = new URLSearchParams(params).toString();
    const path = `/query/${encodeES(classId)}${qs ? '?' + qs : ''}`;
    return this._fetch(path);
  }

  async getObject(classId, objectId) {
    // Use query with id filter — /store/{class}/{id} route has issues with colons in nginx
    const results = await this._fetch(`/query/${encodeES(classId)}?id=${encodeES(objectId)}`);
    const list = Array.isArray(results) ? results : (results.data || []);
    if (list.length === 0) throw new Error(`Not found: ${classId}/${objectId}`);
    return list[0];
  }

  async createObject(classId, data) {
    return this._fetch(`/store/${encodeES(classId)}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateObject(classId, objectId, data) {
    return this._fetch(`/store/${encodeES(classId)}/${encodeES(objectId)}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteObject(classId, objectId) {
    return this._fetch(`/store/${encodeES(classId)}/${encodeES(objectId)}`, {
      method: 'DELETE',
    });
  }

  async findObject(objectId) {
    return this._fetch(`/find/${encodeES(objectId)}`);
  }

  // ── Actions ──
  async executeAction(actionId, params = {}) {
    return this._fetch(`/action/${encodeES(actionId)}/execute`, {
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
