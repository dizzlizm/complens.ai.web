/**
 * Google Authentication and API Service
 *
 * Handles native Google Sign-In and direct API calls to discover connected apps.
 * All calls go directly from device to Google - no middleman server.
 */

import { Capacitor } from '@capacitor/core';
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';
import { db, type Account, type App } from './db';

// Google API endpoints
const GOOGLE_APIS = {
  userInfo: 'https://www.googleapis.com/oauth2/v3/userinfo',
  tokenInfo: 'https://oauth2.googleapis.com/tokeninfo',
  driveApps: 'https://www.googleapis.com/drive/v3/apps',
  gmailSettings: 'https://gmail.googleapis.com/gmail/v1/users/me/settings/delegates',
  permissions: 'https://myaccount.google.com/permissions',
};

// Risk levels based on OAuth scopes
const HIGH_RISK_SCOPES = [
  'mail.google.com',
  'gmail.modify',
  'gmail.compose',
  'gmail.send',
  'gmail.insert',
  'drive',
  'drive.file',
  'calendar',
  'contacts',
  'youtube.upload',
];

const MEDIUM_RISK_SCOPES = [
  'gmail.readonly',
  'drive.readonly',
  'drive.metadata',
  'calendar.readonly',
  'contacts.readonly',
  'youtube.readonly',
];

class GoogleService {
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;

    // Initialize Google Auth plugin (native only)
    if (Capacitor.isNativePlatform()) {
      await GoogleAuth.initialize({
        clientId: import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID,
        scopes: [
          'profile',
          'email',
          'https://www.googleapis.com/auth/drive.metadata.readonly',
        ],
        grantOfflineAccess: true,
      });
    }

    this.initialized = true;
  }

  /**
   * Sign in with Google (native OAuth)
   */
  async signIn(): Promise<Account> {
    await this.init();

    if (!Capacitor.isNativePlatform()) {
      // For web, redirect to OAuth flow
      throw new Error('Use web OAuth flow for browser');
    }

    const user = await GoogleAuth.signIn();

    const account: Account = {
      id: `google_${user.id}`,
      platform: 'google',
      email: user.email,
      name: user.name,
      picture: user.imageUrl,
      accessToken: user.authentication.accessToken,
      refreshToken: user.authentication.refreshToken,
      scopes: (user.authentication as { scopes?: string[] }).scopes || [],
      status: 'connected',
    };

    // Save to local database
    await db.saveAccount(account);

    // Also save to profile
    await db.saveProfile({
      googleId: user.id,
      email: user.email,
      name: user.name,
      picture: user.imageUrl,
    });

    return account;
  }

  /**
   * Sign out
   */
  async signOut(): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      await GoogleAuth.signOut();
    }
  }

  /**
   * Refresh access token
   */
  async refreshToken(account: Account): Promise<Account> {
    if (!Capacitor.isNativePlatform()) {
      throw new Error('Token refresh only supported on native');
    }

    const response = await GoogleAuth.refresh();

    const updated: Account = {
      ...account,
      accessToken: response.accessToken,
      tokenExpiry: response.idToken ? new Date(Date.now() + 3600000).toISOString() : undefined,
    };

    await db.saveAccount(updated);
    return updated;
  }

  /**
   * Discover apps with access to Google account
   *
   * Note: Google doesn't provide a public API to list all third-party apps.
   * We use available APIs to discover what we can, and provide links for manual review.
   */
  async discoverApps(account: Account): Promise<App[]> {
    const apps: App[] = [];
    const scanId = await db.createScan(account.id);

    try {
      await db.updateScan(scanId, { status: 'scanning' });

      // 1. Discover Drive-connected apps
      const driveApps = await this.discoverDriveApps(account);
      apps.push(...driveApps);

      // 2. In the future: Add more discovery methods
      // - Gmail delegated access
      // - Calendar shared access
      // - etc.

      // Calculate risk for each app
      for (const app of apps) {
        const { level, score } = this.calculateRisk(app.scopes);
        app.riskLevel = level;
        app.riskScore = score;
        await db.saveApp(app);
      }

      // Update scan results
      await db.updateScan(scanId, {
        status: 'complete',
        appsFound: apps.length,
        highRisk: apps.filter(a => a.riskLevel === 'high').length,
        mediumRisk: apps.filter(a => a.riskLevel === 'medium').length,
        lowRisk: apps.filter(a => a.riskLevel === 'low').length,
      });

      // Update account last scanned
      await db.saveAccount({
        ...account,
        lastScannedAt: new Date().toISOString(),
      });

      return apps;
    } catch (error) {
      await db.updateScan(scanId, {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Discover apps connected via Google Drive
   */
  private async discoverDriveApps(account: Account): Promise<App[]> {
    try {
      const response = await fetch(GOOGLE_APIS.driveApps, {
        headers: {
          Authorization: `Bearer ${account.accessToken}`,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          // Token expired, try refresh
          const refreshed = await this.refreshToken(account);
          return this.discoverDriveApps(refreshed);
        }
        throw new Error(`Drive API error: ${response.status}`);
      }

      const data = await response.json();
      const apps: App[] = [];

      for (const item of data.items || []) {
        // Skip Google's own apps
        if (item.productId?.startsWith('Google')) continue;

        apps.push({
          id: `drive_${item.id}`,
          accountId: account.id,
          name: item.name,
          clientId: item.id,
          iconUrl: item.icons?.[0]?.iconUrl,
          scopes: ['drive.file'], // Drive apps have file access
          permissions: this.describePermissions(['drive.file']),
          riskLevel: 'medium',
          riskScore: 50,
          authorizedAt: item.installedDate,
        });
      }

      return apps;
    } catch (error) {
      console.error('Failed to discover Drive apps:', error);
      return [];
    }
  }

  /**
   * Calculate risk level based on OAuth scopes
   */
  calculateRisk(scopes: string[]): { level: App['riskLevel']; score: number } {
    let score = 0;
    let hasHighRisk = false;
    let hasMediumRisk = false;

    for (const scope of scopes) {
      const scopeLower = scope.toLowerCase();

      // Check high risk
      if (HIGH_RISK_SCOPES.some(s => scopeLower.includes(s))) {
        score += 30;
        hasHighRisk = true;
      }
      // Check medium risk
      else if (MEDIUM_RISK_SCOPES.some(s => scopeLower.includes(s))) {
        score += 15;
        hasMediumRisk = true;
      }
      // Low risk
      else {
        score += 5;
      }
    }

    // Cap at 100
    score = Math.min(score, 100);

    let level: App['riskLevel'] = 'low';
    if (hasHighRisk || score >= 60) {
      level = 'high';
    } else if (hasMediumRisk || score >= 30) {
      level = 'medium';
    }

    return { level, score };
  }

  /**
   * Convert scopes to human-readable permissions
   */
  describePermissions(scopes: string[]): string[] {
    const descriptions: string[] = [];

    for (const scope of scopes) {
      const scopeLower = scope.toLowerCase();

      if (scopeLower.includes('mail') || scopeLower.includes('gmail')) {
        if (scopeLower.includes('readonly')) {
          descriptions.push('Read your emails');
        } else {
          descriptions.push('Read and send emails on your behalf');
        }
      }
      if (scopeLower.includes('drive')) {
        if (scopeLower.includes('readonly') || scopeLower.includes('metadata')) {
          descriptions.push('See your files in Google Drive');
        } else {
          descriptions.push('Access and modify files in Google Drive');
        }
      }
      if (scopeLower.includes('calendar')) {
        if (scopeLower.includes('readonly')) {
          descriptions.push('See your calendar events');
        } else {
          descriptions.push('Manage your calendar events');
        }
      }
      if (scopeLower.includes('contacts')) {
        if (scopeLower.includes('readonly')) {
          descriptions.push('See your contacts');
        } else {
          descriptions.push('Manage your contacts');
        }
      }
      if (scopeLower.includes('profile')) {
        descriptions.push('See your basic profile info');
      }
      if (scopeLower.includes('email')) {
        descriptions.push('See your email address');
      }
    }

    return [...new Set(descriptions)]; // Remove duplicates
  }

  /**
   * Get URL to Google's app permissions page
   * This is where users can manually revoke access
   */
  getPermissionsUrl(): string {
    return GOOGLE_APIS.permissions;
  }

  /**
   * Open Google's permissions page in browser/in-app browser
   */
  async openPermissionsPage(): Promise<void> {
    const url = this.getPermissionsUrl();

    if (Capacitor.isNativePlatform()) {
      // Use in-app browser
      const { Browser } = await import('@capacitor/browser');
      await Browser.open({ url });
    } else {
      window.open(url, '_blank');
    }
  }
}

// Singleton
export const googleService = new GoogleService();
