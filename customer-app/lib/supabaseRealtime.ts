/**
 * Supabase reuses channel instances by name. After subscribe(), extra .on() throws.
 * Use a unique name per effect mount (e.g. React Strict Mode).
 */
export function uniqueRealtimeChannelName(base: string): string {
  return `${base}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}