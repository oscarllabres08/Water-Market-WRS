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

export function getSupabaseUrlAndKey(): { url: string; anonKey: string } {
  const extra = readExtra();
  const url = (extra.supabaseUrl || process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim();
  const anonKey = (extra.supabaseAnonKey || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '').trim();

  if (!url || !anonKey || BLOCKED_HOSTS.some((host) => url.includes(host) || anonKey.includes(host))) {
    throw new Error(
      'Missing WaterMarket Supabase settings. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY, then restart Expo with a cleared cache.'
    );
  }

  return { url, anonKey };
}
