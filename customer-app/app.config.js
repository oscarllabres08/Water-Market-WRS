/** @type {import('@expo/env').loadEnvFiles} */
const { load: loadEnv } = require('@expo/env');

loadEnv(process.cwd());

const base = require('./app.json');

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() || '';
const retiredHosts = ['hjvwwxdyyugjchkeolyp', 'nigvimeeqglqvgvtnbfy'];

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. A build without them makes the installed app close and reopen.'
  );
}

if (retiredHosts.some((host) => supabaseUrl.includes(host) || supabaseAnonKey.includes(host))) {
  throw new Error('Refusing to build against a retired Supabase project. Use the current WaterMarket project.');
}

module.exports = () => ({
  expo: {
    ...base.expo,
    extra: {
      ...base.expo.extra,
      supabaseUrl,
      supabaseAnonKey,
    },
  },
});
