/**
 * Global App State Store
 *
 * Manages app state using Zustand with persistence to local SQLite.
 * This is the single source of truth for the app.
 */

import { create } from 'zustand';
import { db, type Profile, type Account, type App, type Stats } from '../services/db';
import { googleService } from '../services/google';

interface AppState {
  // Auth state
  isAuthenticated: boolean;
  isLoading: boolean;
  profile: Profile | null;

  // Data
  accounts: Account[];
  apps: App[];
  stats: Stats;

  // UI state
  isScanning: boolean;
  error: string | null;

  // Actions
  init: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  scanAccount: (accountId: string) => Promise<void>;
  removeAccount: (accountId: string) => Promise<void>;
  refreshData: () => Promise<void>;
  clearError: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  isAuthenticated: false,
  isLoading: true,
  profile: null,
  accounts: [],
  apps: [],
  stats: {
    accountCount: 0,
    appCount: 0,
    highRisk: 0,
    mediumRisk: 0,
    lowRisk: 0,
  },
  isScanning: false,
  error: null,

  /**
   * Initialize app - load data from local database
   */
  init: async () => {
    try {
      set({ isLoading: true, error: null });

      // Initialize local database
      await db.init();

      // Load profile
      const profile = await db.getProfile();

      // Load accounts
      const accounts = await db.getAccounts();

      // Load apps
      const apps = await db.getApps();

      // Get stats
      const stats = await db.getStats();

      set({
        isAuthenticated: !!profile?.googleId,
        profile,
        accounts,
        apps,
        stats,
        isLoading: false,
      });
    } catch (error) {
      console.error('Failed to initialize:', error);
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to initialize',
      });
    }
  },

  /**
   * Sign in with Google (native)
   */
  signInWithGoogle: async () => {
    try {
      set({ isLoading: true, error: null });

      const account = await googleService.signIn();

      // Reload data
      const profile = await db.getProfile();
      const accounts = await db.getAccounts();
      const stats = await db.getStats();

      set({
        isAuthenticated: true,
        profile,
        accounts,
        stats,
        isLoading: false,
      });

      // Auto-scan after first sign in
      if (accounts.length === 1) {
        get().scanAccount(account.id);
      }
    } catch (error) {
      console.error('Sign in failed:', error);
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Sign in failed',
      });
    }
  },

  /**
   * Sign out
   */
  signOut: async () => {
    try {
      set({ isLoading: true });

      await googleService.signOut();
      await db.clearAll();

      set({
        isAuthenticated: false,
        profile: null,
        accounts: [],
        apps: [],
        stats: {
          accountCount: 0,
          appCount: 0,
          highRisk: 0,
          mediumRisk: 0,
          lowRisk: 0,
        },
        isLoading: false,
      });
    } catch (error) {
      console.error('Sign out failed:', error);
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Sign out failed',
      });
    }
  },

  /**
   * Scan an account for connected apps
   */
  scanAccount: async (accountId: string) => {
    try {
      set({ isScanning: true, error: null });

      const account = await db.getAccount(accountId);
      if (!account) throw new Error('Account not found');

      // Discover apps
      await googleService.discoverApps(account);

      // Reload data
      const apps = await db.getApps();
      const stats = await db.getStats();
      const accounts = await db.getAccounts();

      set({
        apps,
        stats,
        accounts,
        isScanning: false,
      });
    } catch (error) {
      console.error('Scan failed:', error);
      set({
        isScanning: false,
        error: error instanceof Error ? error.message : 'Scan failed',
      });
    }
  },

  /**
   * Remove an account and its apps
   */
  removeAccount: async (accountId: string) => {
    try {
      await db.deleteAppsForAccount(accountId);
      await db.deleteAccount(accountId);

      const accounts = await db.getAccounts();
      const apps = await db.getApps();
      const stats = await db.getStats();

      set({ accounts, apps, stats });

      // If no accounts left, sign out completely
      if (accounts.length === 0) {
        await get().signOut();
      }
    } catch (error) {
      console.error('Remove account failed:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to remove account',
      });
    }
  },

  /**
   * Refresh all data from local database
   */
  refreshData: async () => {
    try {
      const profile = await db.getProfile();
      const accounts = await db.getAccounts();
      const apps = await db.getApps();
      const stats = await db.getStats();

      set({
        profile,
        accounts,
        apps,
        stats,
      });
    } catch (error) {
      console.error('Refresh failed:', error);
    }
  },

  /**
   * Clear error
   */
  clearError: () => set({ error: null }),
}));
