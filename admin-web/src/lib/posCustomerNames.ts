import { normalizeCustomerName } from './posPayment';
import { supabase } from './supabase';

export type PosCustomerOption = {
  name: string;
  avatarPath: string | null;
  isPosOnly: boolean;
  profileUserId?: string | null;
};

function mergeCustomerOptions(
  profileRows: { name: string; avatarPath: string | null; userId: string }[],
  posNames: string[]
): PosCustomerOption[] {
  const map = new Map<string, PosCustomerOption>();
  for (const row of profileRows) {
    const trimmed = row.name.trim();
    if (!trimmed) continue;
    map.set(normalizeCustomerName(trimmed), {
      name: trimmed,
      avatarPath: row.avatarPath,
      isPosOnly: false,
      profileUserId: row.userId,
    });
  }
  for (const raw of posNames) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = normalizeCustomerName(trimmed);
    if (!map.has(key)) {
      map.set(key, { name: trimmed, avatarPath: null, isPosOnly: true, profileUserId: null });
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

export async function loadPosCustomerNames(businessId: string): Promise<PosCustomerOption[]> {
  const [{ data: posRows }, { data: profiles }, { data: savedNames }] = await Promise.all([
    supabase
      .from('pos_sales')
      .select('customer_name')
      .eq('seller_id', businessId)
      .not('customer_name', 'is', null)
      .order('created_at', { ascending: false })
      .limit(2000),
    supabase
      .from('profiles')
      .select('user_id,display_name,avatar_path')
      .eq('role', 'customer')
      .not('display_name', 'is', null)
      .limit(400),
    supabase.from('seller_pos_customers').select('display_name').eq('seller_id', businessId),
  ]);

  const posNames = [
    ...(posRows ?? []).map((r) => String(r.customer_name ?? '')),
    ...(savedNames ?? []).map((r) => String(r.display_name ?? '')),
  ];
  const profileRows = (profiles ?? []).map((p) => ({
    userId: String(p.user_id),
    name: String(p.display_name ?? ''),
    avatarPath: (p.avatar_path as string | null) ?? null,
  }));
  return mergeCustomerOptions(profileRows, posNames);
}

export function filterCustomerNameSuggestions(
  options: PosCustomerOption[],
  query: string,
  limit = 8
): PosCustomerOption[] {
  const q = normalizeCustomerName(query);
  if (!q) return [];

  const scored: { option: PosCustomerOption; score: number }[] = [];
  for (const option of options) {
    const trimmed = option.name.trim();
    if (!trimmed) continue;
    const n = normalizeCustomerName(trimmed);
    if (n === q) {
      scored.push({ option, score: -1 });
    } else if (n.startsWith(q)) {
      scored.push({ option, score: 0 });
    } else if (n.split(/\s+/).some((word) => word.startsWith(q))) {
      scored.push({ option, score: 1 });
    } else if (n.includes(q)) {
      scored.push({ option, score: 2 });
    }
  }

  scored.sort(
    (a, b) =>
      a.score - b.score ||
      a.option.name.localeCompare(b.option.name, undefined, { sensitivity: 'base' })
  );
  return scored.slice(0, limit).map((s) => s.option);
}

export function customerNameKey(name: string): string {
  return normalizeCustomerName(name).replace(/\s+/g, ' ');
}

/** Save a walk-in name so it shows on Customer List before any sale. */
export async function savePosWalkInCustomer(
  businessId: string,
  rawName: string
): Promise<{ ok: boolean; message?: string }> {
  const displayName = rawName.trim().replace(/\s+/g, ' ');
  const key = customerNameKey(displayName);
  if (key.length < 2) return { ok: true };

  const { error } = await supabase.from('seller_pos_customers').upsert(
    {
      seller_id: businessId,
      customer_name_key: key,
      display_name: displayName,
    },
    { onConflict: 'seller_id,customer_name_key', ignoreDuplicates: true }
  );
  if (error) {
    const missing =
      error.code === '42P01' ||
      error.code === 'PGRST205' ||
      error.message.includes('seller_pos_customers');
    return {
      ok: false,
      message: missing
        ? 'Run the seller_pos_customers table from supabase/migrations/0001_wrs_baseline.sql in Supabase, then try again.'
        : error.message,
    };
  }

  await supabase
    .from('seller_hidden_pos_customers')
    .delete()
    .eq('seller_id', businessId)
    .eq('customer_name_key', key);

  return { ok: true };
}
