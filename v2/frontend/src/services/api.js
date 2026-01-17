import { config } from '../config';

class ApiClient {
  constructor() {
    this.baseUrl = config.apiUrl;
    this.token = null;
  }

  setToken(token) {
    this.token = token;
  }

  async request(path, options = {}) {
    const url = `${this.baseUrl}${path}`;
    const headers = {
      'Content-Type': 'application/json',
      ...(this.token && { Authorization: `Bearer ${this.token}` }),
      ...options.headers,
    };

    const response = await fetch(url, { ...options, headers });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || 'Request failed');
    }

    if (response.status === 204) return null;
    return response.json();
  }

  // User
  getMe() {
    return this.request('/me');
  }

  // Connections
  getConnections() {
    return this.request('/connections');
  }

  startOAuth(provider = 'microsoft') {
    return this.request('/oauth/start/microsoft', {
      method: 'POST',
      body: JSON.stringify({ provider }),
    });
  }

  deleteConnection(connectionId) {
    return this.request(`/connections/${connectionId}`, { method: 'DELETE' });
  }

  // Apps
  getApps(connectionId) {
    return this.request(`/connections/${connectionId}/apps`);
  }

  scanApps(connectionId) {
    return this.request(`/connections/${connectionId}/scan`, { method: 'POST' });
  }
}

export const api = new ApiClient();
