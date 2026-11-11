import { supabase } from './supabase';

export type StalePendingOrder = {
  id: string;
  customer_name: string | null;
  created_at: string;
};

export const PENDING_REMINDER_MS = 30 * 60 * 1000;

export async function fetchStaleUnviewedPendingOrders(
  businessId: string,
  viewedOrderIds: Set<string>
): Promise<StalePendingOrder[]> {
  const cutoff = new Date(Date.now() - PENDING_REMINDER_MS).toISOString();
  const { data, error } = await supabase
    .from('orders')
    .select('id,customer_name,created_at')
    .eq('seller_id', businessId)
    .eq('status', 'pending')
    .lt('created_at', cutoff);

  if (error) return [];
  return (data ?? []).filter((o) => !viewedOrderIds.has(o.id)) as StalePendingOrder[];
}

export async function requestPendingOrderReminders(orderIds: string[]): Promise<{ ok: boolean; message: string }> {
  let sent = 0;
  let message = 'Reminder sent to the rider app.';
  for (const id of orderIds) {
    const { data, error } = await supabase.rpc('request_pending_order_reminder', { p_order_id: id });
    if (error) {
      const missing = error.message.includes('request_pending_order_reminder') || error.message.includes('schema cache');
      return {
        ok: false,
        message: missing
          ? 'Run the latest request_pending_order_reminder function from supabase/migrations/0001_wrs_baseline.sql in Supabase, then try again.'
          : error.message,
      };
    }
    if (data === true) {
      sent += 1;
      message = 'Reminder sent to the rider app.';
      continue;
    }
    const result = data as { ok?: boolean; sent?: number; message?: string } | null;
    if (result?.ok === false) {
      return { ok: false, message: result.message || 'Could not send the reminder.' };
    }
    sent += result?.sent ?? 0;
    if (result?.message) message = result.message;
  }
  if (sent === 0) {
    return { ok: true, message: 'A reminder was already sent to the rider app in the last 30 minutes.' };
  }
  return { ok: true, message };
}
