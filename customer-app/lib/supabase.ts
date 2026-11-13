import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import { getSupabaseUrlAndKey } from './supabaseEnv';

const RETIRED_PROJECTS = ['hjvwwxdyyugjchkeolyp', 'nigvimeeqglqvgvtnbfy'];
const config = getSupabaseUrlAndKey();

/** Shown instead of crashing when a build has no project, or still points at a retired one. */
export const supabaseConfigError = config.error;

/** Drop a saved login from a retired project so it cannot refresh and close the app. */
function dropRetiredWebSession() {
  if (Platform.OS !== 'web' || typeof globalThis.localStorage === 'undefined') return;
  const storage = globalThis.localStorage;
  for (let i = storage.length - 1; i >= 0; i -= 1) {
    const key = storage.key(i);
    if (key && RETIRED_PROJECTS.some((host) => key.includes(host))) storage.removeItem(key);
  }
}

function dropRetiredNativeSession() {
  if (Platform.OS === 'web') return;
  void AsyncStorage.getAllKeys()
    .then((keys) => {
      const stale = keys.filter((key) => RETIRED_PROJECTS.some((host) => key.includes(host)));
      return stale.length ? AsyncStorage.multiRemove(stale) : undefined;
    })
    .catch(() => {
      /* a leftover session must not take the app down */
    });
}

dropRetiredWebSession();
dropRetiredNativeSession();

/**
 * AsyncStorage breaks Expo Router **web** SSR in Node (`window is not defined`).
 * Use localStorage in the browser; during SSR return null.
 */
const authStorage = {
  getItem: async (key: string): Promise<string | null> => {
    if (Platform.OS === 'web') {
      if (typeof globalThis.localStorage === 'undefined') return null;
      return globalThis.localStorage.getItem(key);
    }
    return AsyncStorage.getItem(key);
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (Platform.OS === 'web') {
      globalThis.localStorage?.setItem(key, value);
      return;
    }
    await AsyncStorage.setItem(key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    if (Platform.OS === 'web') {
      globalThis.localStorage?.removeItem(key);
      return;
    }
    await AsyncStorage.removeItem(key);
  },
};

export const supabase = createClient(config.url || 'https://invalid.supabase.co', config.anonKey || 'public-anon-key', {
  auth: {
    storage: authStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
