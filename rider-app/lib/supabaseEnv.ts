import Constants from 'expo-constants';

type Extra = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
};

const BLOCKED_HOSTS = ['hjvwwxdyyugjchkeolyp', 'nigvimeeqglqvgvtnbfy'];

function readExtra(): Extra {
  const constants = Constants as {
    expoConfig?: { extra?: Extra } | null;
    manifest?: { extra?: Extra } | null;
    manifest2?: { extra?: { expoClient?: { extra?: Extra } } } | null;
  };
  return (
    constants.expoConfig?.extra ??
    constants.manifest?.extra ??
    constants.manifest2?.extra?.expoClient?.extra ??
    {}
  );
}

export function getSupabaseUrlAndKey(): { url: string; anonKey: string; error: string | null } {
  const extra = readExtra();
  // Prefer the live env. A long-running Expo server can keep an older project in extra.
  const url = (process.env.EXPO_PUBLIC_SUPABASE_URL || extra.supabaseUrl || '').trim();
  const anonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || extra.supabaseAnonKey || '').trim();
  const blocked = BLOCKED_HOSTS.find((host) => url.includes(host) || anonKey.includes(host));

  if (!url || !anonKey) {
    return {
      url: '',
      anonKey: '',
      error:
        'This install has no WaterMarket Supabase settings, so it cannot open. Rebuild with EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.',
    };
  }

  if (blocked) {
    return {
      url: '',
      anonKey: '',
      error:
        'This install still points at a retired Supabase project. Rebuild the app against the current WaterMarket project.',
    };
  }

  return { url, anonKey, error: null };
}
