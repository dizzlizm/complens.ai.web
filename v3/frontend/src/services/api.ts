import { fetchAuthSession } from 'aws-amplify/auth';

const API_URL = import.meta.env.VITE_API_URL || '';

async function getAuthToken(): Promise<string | null> {
  try {
    const session = await fetchAuthSession();
    return session.tokens?.idToken?.toString() || null;
  } catch {
    return null;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getAuthToken();

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

export const api = {
  // User profile
  getMe: () => request<{
    userId: string;
    settings: { notifications: boolean; autoScan: boolean };
    createdAt: string;
  }>('/me'),

  updateMe: (data: { settings?: object; name?: string }) =>
    request('/me', { method: 'PUT', body: JSON.stringify(data) }),

  // Accounts
  getAccounts: () => request<{
    accounts: Array<{
      accountId: string;
      platform: string;
      email?: string;
      status: string;
      lastScannedAt?: string;
      createdAt: string;
    }>;
  }>('/accounts'),

  createAccount: (data: { platform: string; accessToken: string; refreshToken?: string; email?: string }) =>
    request('/accounts', { method: 'POST', body: JSON.stringify(data) }),

  deleteAccount: (accountId: string) =>
    request(`/accounts/${accountId}`, { method: 'DELETE' }),

  // Apps
  getApps: () => request<{
    apps: Array<{
      appId: string;
      name: string;
      platform: string;
      accountId: string;
      riskLevel: 'high' | 'medium' | 'low';
      permissions: string[];
      lastAccessed?: string;
      discoveredAt: string;
    }>;
  }>('/apps'),

  // Scans
  startScan: (accountId: string) =>
    request('/scan', { method: 'POST', body: JSON.stringify({ accountId }) }),

  getScanStatus: (scanId: string) =>
    request(`/scan/${scanId}`),

  // Chat
  chat: (message: string) =>
    request<{ response: string; context: object }>('/chat', {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),
};
