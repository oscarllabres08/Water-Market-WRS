import { useCallback, useEffect, useMemo, useState } from 'react';

import { ConfirmModal } from '../components/ConfirmModal';
import { ContainerReturnPanel } from '../components/ContainerReturnPanel';
import { CustomerRowMenu } from '../components/CustomerRowMenu';
import { PageHeader } from '../components/PageHeader';
import { useAuth } from '../auth/AuthProvider';
import { money, publicWrsAssetUrl } from '../lib/format';
import { orderGrandTotal } from '../lib/orderTotal';
import {
  formatPosPaymentMethod,
  normalizeCustomerName,
  posCustomerRowId,
  posNameFromRowId,
} from '../lib/posPayment';
import { supabase } from '../lib/supabase';
import { markOrderViewed } from '../lib/viewedOrders';

type CustomerRow = {
  id: string;
  name: string;
  username: string;
  avatarPath: string | null;
  phone: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  orderCount: number;
  lastOrder: string | null;
  hasUnpaidUtang: boolean;
  unpaidDeliveredCount: number;
  unpaidDeliveredTotal: number;
  totalSpent: number;
  containersOutstanding: number;
  containerIdentifierNotes: string | null;
  isPosOnly: boolean;
  posNameKey: string | null;
  profileIds: string[];
};

type HistoryItem = {
  name: string;
  qty: number;
  unit_price: number;
};

type HistoryEntry = {
  id: string;
  source: 'order' | 'pos';
  created_at: string;
  status: string;
  payment_settled: boolean;
  payment_method: string | null;
  total: number;
  items: HistoryItem[];
  channelLabel: string;
};

type PayFilter = 'all' | 'paid' | 'unpaid';
type ContainerFilter = 'all' | 'borrowed';

const ORDER_HISTORY_PAGE = 10;

const ORDER_HISTORY_SELECT =
  'id,created_at,status,payment_settled,payment_method,delivery_fee,order_items(product_name,unit_price,quantity)';

const POS_HISTORY_SELECT =
  'id,created_at,payment_settled,payment_method,customer_name,pos_sale_items(product_name,unit_price,quantity)';

type OrderHistorySource = {
  id: string;
  created_at: string;
  status: string;
  payment_settled: boolean | null;
  payment_method: string | null;
  delivery_fee: number | null;
  order_items: { product_name?: string | null; unit_price: number; quantity: number }[];
};

type PosHistorySource = {
  id: string;
  created_at: string;
  payment_settled: boolean | null;
  payment_method: string | null;
  customer_name: string | null;
  pos_sale_items: { product_name?: string | null; unit_price: number; quantity: number }[];
};

function customerMapHref(row: CustomerRow) {
  const pin =
    typeof row.latitude === 'number' && typeof row.longitude === 'number' ? `${row.latitude},${row.longitude}` : '';
  const address = row.address.trim() && row.address !== '—' ? row.address.trim() : '';
  const query = pin || address;
  if (!query) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function mapOrderHistoryRow(o: OrderHistorySource): HistoryEntry {
  const items = (o.order_items ?? []).map((it) => ({
    name: it.product_name?.trim() || 'Item',
    qty: it.quantity,
    unit_price: Number(it.unit_price),
  }));
  return {
    id: o.id,
    source: 'order',
    created_at: o.created_at,
    status: o.status,
    payment_settled: o.payment_settled === true,
    payment_method: o.payment_method,
    total: orderGrandTotal(o.order_items, o.delivery_fee),
    items,
    channelLabel: 'Online order',
  };
}

function mapPosHistoryRow(o: PosHistorySource): HistoryEntry {
  const items = (o.pos_sale_items ?? []).map((it) => ({
    name: it.product_name?.trim() || 'Item',
    qty: it.quantity,
    unit_price: Number(it.unit_price),
  }));
  const total = items.reduce((s, it) => s + it.unit_price * it.qty, 0);
  return {
    id: o.id,
    source: 'pos',
    created_at: o.created_at,
    status: 'walk-in',
    payment_settled: o.payment_settled === true,
    payment_method: o.payment_method,
    total,
    items,
    channelLabel: 'Walk-in POS',
  };
}

function posSaleTotal(
  items: { unit_price: number; quantity: number }[] | null | undefined
): number {
  return (items ?? []).reduce((s, it) => s + Number(it.unit_price) * Number(it.quantity), 0);
}

export function CustomersPage() {
  const { businessId } = useAuth();
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [query, setQuery] = useState('');
  const [payFilter, setPayFilter] = useState<PayFilter>('all');
  const [containerFilter, setContainerFilter] = useState<ContainerFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailsFor, setDetailsFor] = useState<CustomerRow | null>(null);
  const [historyFor, setHistoryFor] = useState<CustomerRow | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
  const [returnBusyId, setReturnBusyId] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<HistoryEntry | null>(null);
  const [paymentBusyKey, setPaymentBusyKey] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<CustomerRow | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeNotice, setRemoveNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!businessId || !selectedEntry || selectedEntry.source !== 'order') return;
    markOrderViewed(businessId, selectedEntry.id);
  }, [businessId, selectedEntry]);

  const load = useCallback(async () => {
    if (!businessId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {

    const { data: customers, error: custErr } = await supabase
      .from('profiles')
      .select('user_id,display_name,username,phone,address,latitude,longitude,avatar_path')
      .eq('role', 'customer')
      .order('created_at', { ascending: false })
      .limit(400);

    if (custErr) {
      setError(custErr.message);
      setRows([]);
      setLoading(false);
      return;
    }

    const { data: orders } = await supabase
      .from('orders')
      .select(
        'id,customer_id,created_at,status,payment_settled,payment_method,delivery_fee,contact_number,order_items(product_name,unit_price,quantity)'
      )
      .eq('seller_id', businessId)
      .order('created_at', { ascending: false })
      .limit(2000);

    const { data: posSales } = await supabase
      .from('pos_sales')
      .select('id,customer_name,created_at,payment_settled,payment_method,pos_sale_items(unit_price,quantity)')
      .eq('seller_id', businessId)
      .order('created_at', { ascending: false })
      .limit(2000);

    const agg = new Map<
      string,
      {
        count: number;
        last: string;
        hasUnpaidUtang: boolean;
        unpaidDeliveredCount: number;
        unpaidDeliveredTotal: number;
        totalSpent: number;
      }
    >();

    const phoneByCustomer = new Map<string, string>();

    for (const o of orders ?? []) {
      const row = o as OrderHistorySource & { customer_id: string | null; contact_number?: string | null };
      if (!row.customer_id) continue;
      const contact = row.contact_number?.trim();
      if (contact && !phoneByCustomer.has(row.customer_id)) phoneByCustomer.set(row.customer_id, contact);
      const orderTotal = orderGrandTotal(row.order_items, row.delivery_fee);
      const utangUnpaid =
        (row.payment_method ?? '').toLowerCase() === 'utang' && row.payment_settled !== true;
      const deliveredUnpaid = row.status === 'delivered' && row.payment_settled !== true;
      const cur = agg.get(row.customer_id);
      if (!cur) {
        agg.set(row.customer_id, {
          count: 1,
          last: row.created_at,
          hasUnpaidUtang: utangUnpaid,
          unpaidDeliveredCount: deliveredUnpaid ? 1 : 0,
          unpaidDeliveredTotal: deliveredUnpaid ? orderTotal : 0,
          totalSpent: orderTotal,
        });
      } else {
        agg.set(row.customer_id, {
          count: cur.count + 1,
          last: cur.last > row.created_at ? cur.last : row.created_at,
          hasUnpaidUtang: cur.hasUnpaidUtang || utangUnpaid,
          unpaidDeliveredCount: cur.unpaidDeliveredCount + (deliveredUnpaid ? 1 : 0),
          unpaidDeliveredTotal: cur.unpaidDeliveredTotal + (deliveredUnpaid ? orderTotal : 0),
          totalSpent: cur.totalSpent + orderTotal,
        });
      }
    }

    const posAgg = new Map<
      string,
      {
        displayName: string;
        count: number;
        last: string;
        unpaidCount: number;
        unpaidTotal: number;
        totalSpent: number;
      }
    >();

    for (const s of posSales ?? []) {
      const row = s as {
        customer_name: string | null;
        created_at: string;
        payment_settled: boolean | null;
        pos_sale_items: { unit_price: number; quantity: number }[];
      };
      const rawName = row.customer_name?.trim();
      if (!rawName) continue;
      const key = normalizeCustomerName(rawName);
      const amt = posSaleTotal(row.pos_sale_items);
      const unpaid = row.payment_settled !== true;
      const cur = posAgg.get(key);
      if (!cur) {
        posAgg.set(key, {
          displayName: rawName,
          count: 1,
          last: row.created_at,
          unpaidCount: unpaid ? 1 : 0,
          unpaidTotal: unpaid ? amt : 0,
          totalSpent: amt,
        });
      } else {
        posAgg.set(key, {
          displayName: cur.displayName,
          count: cur.count + 1,
          last: cur.last > row.created_at ? cur.last : row.created_at,
          unpaidCount: cur.unpaidCount + (unpaid ? 1 : 0),
          unpaidTotal: cur.unpaidTotal + (unpaid ? amt : 0),
          totalSpent: cur.totalSpent + amt,
        });
      }
    }

    const [balRes, posBalRes, hiddenCustRes, hiddenPosRes] = await Promise.all([
      supabase
        .from('seller_customer_container_balance')
        .select('customer_id,outstanding_count,identifier_notes')
        .eq('seller_id', businessId),
      supabase
        .from('seller_pos_container_balance')
        .select('customer_name_key,outstanding_count,identifier_notes,display_name')
        .eq('seller_id', businessId),
      supabase.from('seller_hidden_customers').select('customer_id').eq('seller_id', businessId),
      supabase.from('seller_hidden_pos_customers').select('customer_name_key').eq('seller_id', businessId),
    ]);

    const balances = balRes.data;
    const posBalances = posBalRes.data;
    const hiddenCustomers = hiddenCustRes.data;

    const hiddenCustomerIds = new Set(
      ((hiddenCustomers ?? []) as { customer_id: string }[]).map((r) => r.customer_id)
    );
    const hiddenPosKeys = new Set<string>();
    if (!hiddenPosRes.error) {
      for (const row of (hiddenPosRes.data ?? []) as { customer_name_key: string }[]) {
        const key = normalizeCustomerName(row.customer_name_key);
        if (key) hiddenPosKeys.add(key);
      }
    }

    const balByCustomer = new Map<
      string,
      { outstanding_count: number; identifier_notes: string | null }
    >();
    for (const b of balances ?? []) {
      const row = b as {
        customer_id: string;
        outstanding_count: number;
        identifier_notes: string | null;
      };
      balByCustomer.set(row.customer_id, {
        outstanding_count: Math.max(0, row.outstanding_count ?? 0),
        identifier_notes: row.identifier_notes,
      });
    }

    const balByPosKey = new Map<
      string,
      { outstanding_count: number; identifier_notes: string | null }
    >();
    for (const b of posBalances ?? []) {
      const row = b as {
        customer_name_key: string;
        outstanding_count: number;
        identifier_notes: string | null;
      };
      const key = normalizeCustomerName(row.customer_name_key);
      if (!key) continue;
      const prev = balByPosKey.get(key);
      balByPosKey.set(key, {
        outstanding_count: (prev?.outstanding_count ?? 0) + Math.max(0, row.outstanding_count ?? 0),
        identifier_notes: prev?.identifier_notes || row.identifier_notes,
      });
    }

    const byName = new Map<string, CustomerRow>();
    for (const c of customers ?? []) {
      const p = c as {
        user_id: string;
        display_name: string | null;
        username: string | null;
        phone: string | null;
        address: string | null;
        latitude: number | null;
        longitude: number | null;
        avatar_path: string | null;
      };
      const username = p.username?.trim() || '';
      const displayName = (p.display_name ?? '').trim().replace(/\s+/g, ' ') || 'Customer';
      const phone = p.phone?.trim() || phoneByCustomer.get(p.user_id) || '—';
      const nameKey = normalizeCustomerName(displayName);
      if (!nameKey) continue;
      const a = agg.get(p.user_id);
      const bal = balByCustomer.get(p.user_id);
      const existing = byName.get(nameKey);
      if (!existing) {
        byName.set(nameKey, {
          id: p.user_id,
          name: displayName,
          username,
          avatarPath: p.avatar_path ?? null,
          phone,
          address: p.address?.trim() || '—',
          latitude: typeof p.latitude === 'number' ? p.latitude : null,
          longitude: typeof p.longitude === 'number' ? p.longitude : null,
          orderCount: a?.count ?? 0,
          lastOrder: a?.last ?? null,
          hasUnpaidUtang: a?.hasUnpaidUtang ?? false,
          unpaidDeliveredCount: a?.unpaidDeliveredCount ?? 0,
          unpaidDeliveredTotal: a?.unpaidDeliveredTotal ?? 0,
          totalSpent: a?.totalSpent ?? 0,
          containersOutstanding: Math.max(0, bal?.outstanding_count ?? 0),
          containerIdentifierNotes: bal?.identifier_notes?.trim() || null,
          isPosOnly: false,
          posNameKey: nameKey,
          profileIds: [p.user_id],
        });
        continue;
      }
      existing.profileIds.push(p.user_id);
      existing.orderCount += a?.count ?? 0;
      existing.totalSpent += a?.totalSpent ?? 0;
      existing.unpaidDeliveredCount += a?.unpaidDeliveredCount ?? 0;
      existing.unpaidDeliveredTotal += a?.unpaidDeliveredTotal ?? 0;
      existing.hasUnpaidUtang = existing.hasUnpaidUtang || (a?.hasUnpaidUtang ?? false);
      existing.containersOutstanding += Math.max(0, bal?.outstanding_count ?? 0);
      if (a?.last && (!existing.lastOrder || a.last > existing.lastOrder)) existing.lastOrder = a.last;
      if (!existing.username && username) existing.username = username;
      if (existing.phone === '—' && phone !== '—') existing.phone = phone;
      if (existing.address === '—' && p.address?.trim()) existing.address = p.address.trim();
      if (existing.latitude == null && typeof p.latitude === 'number') existing.latitude = p.latitude;
      if (existing.longitude == null && typeof p.longitude === 'number') existing.longitude = p.longitude;
      if (!existing.avatarPath && p.avatar_path) existing.avatarPath = p.avatar_path;
      const extraNotes = bal?.identifier_notes?.trim();
      if (extraNotes && existing.containerIdentifierNotes && !existing.containerIdentifierNotes.includes(extraNotes)) {
        existing.containerIdentifierNotes = `${existing.containerIdentifierNotes}, ${extraNotes}`;
      } else if (extraNotes && !existing.containerIdentifierNotes) {
        existing.containerIdentifierNotes = extraNotes;
      }
    }

    const list: CustomerRow[] = [...byName.values()];

    for (const row of list) {
      if (!row.posNameKey) continue;
      const pos = posAgg.get(row.posNameKey);
      if (pos) {
        row.orderCount += pos.count;
        row.totalSpent += pos.totalSpent;
        row.unpaidDeliveredCount += pos.unpaidCount;
        row.unpaidDeliveredTotal += pos.unpaidTotal;
        if (!row.lastOrder || pos.last > row.lastOrder) row.lastOrder = pos.last;
      }
      const posBal = balByPosKey.get(row.posNameKey);
      if (posBal) {
        row.containersOutstanding += posBal.outstanding_count;
        const notes = posBal.identifier_notes?.trim();
        if (notes && row.containerIdentifierNotes && !row.containerIdentifierNotes.includes(notes)) {
          row.containerIdentifierNotes = `${row.containerIdentifierNotes}, ${notes}`;
        } else if (notes && !row.containerIdentifierNotes) {
          row.containerIdentifierNotes = notes;
        }
      }
    }

    for (const [key, pos] of posAgg) {
      if (byName.has(key)) continue;
      const posBal = balByPosKey.get(key);
      const posOutstanding = posBal?.outstanding_count ?? 0;
      list.push({
        id: posCustomerRowId(key),
        name: pos.displayName,
        username: '',
        avatarPath: null,
        phone: 'Walk-in POS',
        address: '—',
        latitude: null,
        longitude: null,
        orderCount: pos.count,
        lastOrder: pos.last,
        hasUnpaidUtang: false,
        unpaidDeliveredCount: pos.unpaidCount,
        unpaidDeliveredTotal: pos.unpaidTotal,
        totalSpent: pos.totalSpent,
        containersOutstanding: posOutstanding,
        containerIdentifierNotes: posOutstanding > 0 ? posBal?.identifier_notes?.trim() || null : null,
        isPosOnly: true,
        posNameKey: key,
        profileIds: [],
      });
    }

    const savedPosRes = await supabase
      .from('seller_pos_customers')
      .select('customer_name_key, display_name')
      .eq('seller_id', businessId);
    if (!savedPosRes.error) {
      for (const row of (savedPosRes.data ?? []) as { customer_name_key: string; display_name: string | null }[]) {
        const key = normalizeCustomerName(row.customer_name_key);
        const existingBalance = balByPosKey.get(key);
        if (!key || byName.has(key) || posAgg.has(key) || (existingBalance?.outstanding_count ?? 0) > 0) continue;
        list.push({
          id: posCustomerRowId(key),
          name: row.display_name?.trim() || key,
          username: '',
          avatarPath: null,
          phone: 'Walk-in POS',
          address: '—',
          latitude: null,
          longitude: null,
          orderCount: 0,
          lastOrder: null,
          hasUnpaidUtang: false,
          unpaidDeliveredCount: 0,
          unpaidDeliveredTotal: 0,
          totalSpent: 0,
          containersOutstanding: 0,
          containerIdentifierNotes: null,
          isPosOnly: true,
          posNameKey: key,
          profileIds: [],
        });
      }
    }

    for (const [key, bal] of balByPosKey) {
      if (byName.has(key) || posAgg.has(key)) continue;
      if ((bal.outstanding_count ?? 0) < 1) continue;
      list.push({
        id: posCustomerRowId(key),
        name: key
          .split(/\s+/)
          .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
          .join(' '),
        username: '',
        avatarPath: null,
        phone: 'Walk-in POS',
        address: '—',
        latitude: null,
        longitude: null,
        orderCount: 0,
        lastOrder: null,
        hasUnpaidUtang: false,
        unpaidDeliveredCount: 0,
        unpaidDeliveredTotal: 0,
        totalSpent: 0,
        containersOutstanding: bal.outstanding_count,
        containerIdentifierNotes: bal.identifier_notes?.trim() || null,
        isPosOnly: true,
        posNameKey: key,
        profileIds: [],
      });
    }

    const visible = list.filter((r) => {
      if (r.isPosOnly) {
        return r.posNameKey ? !hiddenPosKeys.has(r.posNameKey) : true;
      }
      return !hiddenCustomerIds.has(r.id);
    });

    visible.sort((a, b) => {
      const aFresh = a.isPosOnly && a.orderCount === 0 && a.containersOutstanding === 0 ? 1 : 0;
      const bFresh = b.isPosOnly && b.orderCount === 0 && b.containersOutstanding === 0 ? 1 : 0;
      if (aFresh !== bFresh) return bFresh - aFresh;
      return b.orderCount - a.orderCount;
    });
    setRows(visible);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load customers.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    void load();
    if (!businessId) return;
    const ch = supabase
      .channel(`admin-customers-${businessId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `seller_id=eq.${businessId}` }, () => void load())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pos_sales', filter: `seller_id=eq.${businessId}` }, () => void load())
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'seller_customer_container_balance', filter: `seller_id=eq.${businessId}` },
        () => void load()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'seller_pos_container_balance', filter: `seller_id=eq.${businessId}` },
        () => void load()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'seller_hidden_customers', filter: `seller_id=eq.${businessId}` },
        () => void load()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'seller_hidden_pos_customers', filter: `seller_id=eq.${businessId}` },
        () => void load()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'seller_pos_customers', filter: `seller_id=eq.${businessId}` },
        () => void load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [businessId, load]);

  const [historyAll, setHistoryAll] = useState<HistoryEntry[]>([]);
  const [historyVisibleCount, setHistoryVisibleCount] = useState(ORDER_HISTORY_PAGE);

  const fetchAllHistory = useCallback(
    async (customer: CustomerRow): Promise<HistoryEntry[]> => {
      if (!businessId) return [];

      const entries: HistoryEntry[] = [];
      const nameKey = customer.posNameKey ?? posNameFromRowId(customer.id);

      if (!customer.isPosOnly) {
        const ids = customer.profileIds.length > 0 ? customer.profileIds : [customer.id];
        const { data, error: err } = await supabase
          .from('orders')
          .select(ORDER_HISTORY_SELECT)
          .eq('seller_id', businessId)
          .in('customer_id', ids)
          .order('created_at', { ascending: false })
          .limit(200);
        if (err) throw err;
        entries.push(...(data ?? []).map((o) => mapOrderHistoryRow(o as OrderHistorySource)));
      }

      if (nameKey) {
        const { data: posData, error: posErr } = await supabase
          .from('pos_sales')
          .select(POS_HISTORY_SELECT)
          .eq('seller_id', businessId)
          .not('customer_name', 'is', null)
          .order('created_at', { ascending: false })
          .limit(500);
        if (posErr) throw posErr;
        const filtered = (posData ?? []).filter((row) => {
          const name = (row as PosHistorySource).customer_name?.trim();
          return name ? normalizeCustomerName(name) === nameKey : false;
        });
        entries.push(...filtered.map((o) => mapPosHistoryRow(o as PosHistorySource)));
      }

      entries.sort((a, b) => b.created_at.localeCompare(a.created_at));
      return entries;
    },
    [businessId]
  );

  async function openHistory(c: CustomerRow) {
    if (!businessId) return;
    setHistoryFor(c);
    setHistory([]);
    setHistoryAll([]);
    setHistoryVisibleCount(ORDER_HISTORY_PAGE);
    setSelectedEntry(null);
    setHistoryHasMore(false);
    setHistoryLoading(true);
    try {
      const list = await fetchAllHistory(c);
      setHistoryAll(list);
      setHistory(list.slice(0, ORDER_HISTORY_PAGE));
      setHistoryHasMore(list.length > ORDER_HISTORY_PAGE);
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Could not load order history');
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function showMoreHistory() {
    if (!historyFor || historyLoadingMore || !historyHasMore) return;
    setHistoryLoadingMore(true);
    try {
      const nextCount = historyVisibleCount + ORDER_HISTORY_PAGE;
      setHistoryVisibleCount(nextCount);
      setHistory(historyAll.slice(0, nextCount));
      setHistoryHasMore(historyAll.length > nextCount);
    } finally {
      setHistoryLoadingMore(false);
    }
  }

  async function confirmRemoveCustomer() {
    if (!businessId || !removeTarget) return;
    setRemoveBusy(true);
    setError(null);
    try {
      if (removeTarget.isPosOnly) {
        const key = removeTarget.posNameKey ?? posNameFromRowId(removeTarget.id);
        if (!key) throw new Error('Could not identify this walk-in customer.');
        const { error: err } = await supabase.from('seller_hidden_pos_customers').insert({
          seller_id: businessId,
          customer_name_key: key,
        });
        if (err) throw err;
      } else {
        const { data, error: err } = await supabase.rpc('owner_remove_customer_from_store', {
          p_customer_id: removeTarget.id,
        });
        if (err) throw err;
        const res = data as { ok?: boolean; message?: string; error?: string } | null;
        if (res && res.ok === false) {
          throw new Error(res.message ?? res.error ?? 'Could not remove customer');
        }
        if (res?.message) {
          setRemoveNotice(res.message);
        }
      }
      if (historyFor?.id === removeTarget.id) {
        closeHistory();
      }
      setRemoveTarget(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove customer');
    } finally {
      setRemoveBusy(false);
    }
  }

  function closeHistory() {
    setHistoryFor(null);
    setHistory([]);
    setSelectedEntry(null);
    setHistoryHasMore(false);
  }

  function historyEntryKey(entry: HistoryEntry): string {
    return `${entry.source}-${entry.id}`;
  }

  async function setEntryPaymentSettled(entry: HistoryEntry, settled: boolean) {
    if (!businessId) return;
    const busyKey = historyEntryKey(entry);
    setPaymentBusyKey(busyKey);
    setError(null);
    try {
      const payload = settled
        ? { payment_settled: true, payment_settled_at: new Date().toISOString() }
        : { payment_settled: false, payment_settled_at: null };
      if (entry.source === 'order') {
        const { error: upErr } = await supabase
          .from('orders')
          .update(payload)
          .eq('id', entry.id)
          .eq('seller_id', businessId);
        if (upErr) throw upErr;
      } else {
        const { error: upErr } = await supabase
          .from('pos_sales')
          .update(payload)
          .eq('id', entry.id)
          .eq('seller_id', businessId);
        if (upErr) throw upErr;
      }
      const nextEntry = { ...entry, payment_settled: settled };
      setSelectedEntry((prev) =>
        prev && prev.id === entry.id && prev.source === entry.source ? nextEntry : prev
      );
      setHistory((prev) => prev.map((h) => (h.id === entry.id && h.source === entry.source ? nextEntry : h)));
      setHistoryAll((prev) => prev.map((h) => (h.id === entry.id && h.source === entry.source ? nextEntry : h)));
      await load();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Could not update payment status');
    } finally {
      setPaymentBusyKey(null);
    }
  }

  function paymentMethodLabel(entry: HistoryEntry): string {
    if (entry.source === 'pos') return formatPosPaymentMethod(entry.payment_method);
    const m = (entry.payment_method ?? '').toLowerCase();
    if (m === 'gcash') return 'GCash';
    if (m === 'cod') return 'Cash on delivery';
    if (m === 'maya') return 'Maya';
    if (m === 'utang') return 'Utang';
    return entry.payment_method ?? '—';
  }

  const filtered = useMemo(() => {
    let list = rows.filter(
      (r) => r.orderCount > 0 || r.containersOutstanding > 0 || payFilter === 'all' || containerFilter === 'borrowed'
    );
    if (payFilter === 'paid')
      list = list.filter((r) => r.orderCount > 0 && r.unpaidDeliveredCount === 0 && !r.hasUnpaidUtang);
    if (payFilter === 'unpaid') list = list.filter((r) => r.unpaidDeliveredCount > 0 || r.hasUnpaidUtang);
    if (containerFilter === 'borrowed') list = list.filter((r) => r.containersOutstanding > 0);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.username.toLowerCase().includes(q) ||
          r.phone.toLowerCase().includes(q) ||
          r.address.toLowerCase().includes(q) ||
          (r.containerIdentifierNotes ?? '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [rows, query, payFilter, containerFilter]);

  return (
    <>
      <PageHeader
        title="Customers"
        description="Customer list, walk-in POS names, borrowed containers, and order history."
      />
      {error ? <p className="error-text">{error}</p> : null}
      {removeNotice ? <p className="success-text module-alert">{removeNotice}</p> : null}

      <div className="customer-toolbar card card-flat">
        <label className="customer-search" htmlFor="q">
          <span>Search</span>
          <input id="q" placeholder="Name, username, phone, or address" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div className="customer-filter-group">
          <span>Payment</span>
          <div className="customer-pills" role="group" aria-label="Payment filter">
            {(['all', 'paid', 'unpaid'] as PayFilter[]).map((f) => (
              <button
                key={f}
                type="button"
                className={`customer-pill${payFilter === f ? ' active' : ''}`}
                onClick={() => setPayFilter(f)}
              >
                {f === 'all' ? 'All' : f === 'paid' ? 'Paid' : 'Unpaid'}
              </button>
            ))}
          </div>
        </div>
        <div className="customer-filter-group">
          <span>Containers</span>
          <div className="customer-pills" role="group" aria-label="Container filter">
            {(['all', 'borrowed'] as ContainerFilter[]).map((f) => (
              <button
                key={f}
                type="button"
                className={`customer-pill${containerFilter === f ? ' active' : ''}`}
                onClick={() => setContainerFilter(f)}
              >
                {f === 'all' ? 'All' : 'Borrowed'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        {loading ? <p className="muted-block">Loading…</p> : null}
        <div className="table-wrap">
          <table className="data-table customer-list-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Payment</th>
                <th>Containers</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 100).map((r) => {
                const avatarUrl = publicWrsAssetUrl(supabase, r.avatarPath);
                const initial = (r.name.trim()[0] ?? 'C').toUpperCase();
                return (
                <tr key={r.id}>
                  <td>
                    <div className="customer-list-name-cell">
                      <span className="customer-list-avatar" aria-hidden>
                        {avatarUrl ? (
                          <img src={avatarUrl} alt="" />
                        ) : (
                          <span className="customer-list-avatar-fallback">{initial}</span>
                        )}
                      </span>
                      <div className="customer-list-name-meta">
                        <strong>{r.name}</strong>
                        {r.isPosOnly ? (
                          <div className="customer-list-sub">Walk-in POS</div>
                        ) : (
                          <div className="customer-list-sub">{r.phone}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td data-label="Payment">
                    {r.unpaidDeliveredCount > 0 ? (
                      <span className="chip pending">
                        {r.unpaidDeliveredCount} unpaid · {money(r.unpaidDeliveredTotal)}
                      </span>
                    ) : r.hasUnpaidUtang ? (
                      <span className="chip pending">Unpaid utang</span>
                    ) : r.orderCount > 0 ? (
                      <span className="chip ok">Paid</span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td data-label="Containers">
                    <ContainerReturnPanel
                      customerId={r.id}
                      customerName={r.name}
                      outstanding={r.containersOutstanding}
                      identifierNotes={r.containerIdentifierNotes}
                      busy={returnBusyId === r.id}
                      onBusyChange={(b) => setReturnBusyId(b ? r.id : null)}
                      onSuccess={() => void load()}
                      onError={(msg) => setError(msg || null)}
                    />
                  </td>
                  <td>
                    <CustomerRowMenu
                      onDetails={() => setDetailsFor(r)}
                      onHistory={() => void openHistory(r)}
                      onRemove={() => setRemoveTarget(r)}
                    />
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {detailsFor ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setDetailsFor(null)}>
          <div className="modal-card customer-details-modal" role="dialog" aria-labelledby="customer-details-title" onClick={(e) => e.stopPropagation()}>
            <div className="customer-details-head">
              <span className="customer-list-avatar customer-details-avatar" aria-hidden>
                {publicWrsAssetUrl(supabase, detailsFor.avatarPath) ? (
                  <img src={publicWrsAssetUrl(supabase, detailsFor.avatarPath) ?? ''} alt="" />
                ) : (
                  <span className="customer-list-avatar-fallback">{(detailsFor.name.trim()[0] ?? 'C').toUpperCase()}</span>
                )}
              </span>
              <div>
                <h2 id="customer-details-title" className="card-title">
                  {detailsFor.name}
                </h2>
                <p className="muted-block customer-details-kind">
                  {detailsFor.isPosOnly ? 'Walk-in POS' : 'Registered customer'}
                </p>
              </div>
            </div>
            <dl className="customer-details-list">
              <div>
                <dt>Name</dt>
                <dd>{detailsFor.name}</dd>
              </div>
              <div>
                <dt>Username</dt>
                <dd>{detailsFor.username || '—'}</dd>
              </div>
              <div>
                <dt>Phone</dt>
                <dd>{detailsFor.phone}</dd>
              </div>
              <div>
                <dt>Address</dt>
                <dd>
                  <div>{detailsFor.address}</div>
                  {customerMapHref(detailsFor) ? (
                    <a className="order-map" href={customerMapHref(detailsFor) ?? undefined} target="_blank" rel="noreferrer">
                      Open in map
                    </a>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt>Payment</dt>
                <dd>
                  {detailsFor.unpaidDeliveredCount > 0
                    ? `${detailsFor.unpaidDeliveredCount} unpaid · ${money(detailsFor.unpaidDeliveredTotal)}`
                    : detailsFor.hasUnpaidUtang
                      ? 'Unpaid utang'
                      : detailsFor.orderCount > 0
                        ? 'Paid'
                        : '—'}
                </dd>
              </div>
              <div>
                <dt>Containers borrowed</dt>
                <dd>{detailsFor.containersOutstanding}</dd>
              </div>
              <div>
                <dt>Last order</dt>
                <dd>{detailsFor.lastOrder ? new Date(detailsFor.lastOrder).toLocaleString() : '—'}</dd>
              </div>
              {detailsFor.containerIdentifierNotes ? (
                <div>
                  <dt>Container notes</dt>
                  <dd>{detailsFor.containerIdentifierNotes}</dd>
                </div>
              ) : null}
            </dl>
            <div className="row-actions">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  const row = detailsFor;
                  setDetailsFor(null);
                  void openHistory(row);
                }}
              >
                Order history
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDetailsFor(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {historyFor ? (
        <div className="modal-backdrop" role="presentation" onClick={closeHistory}>
          <div className="modal-card customer-history-modal" role="dialog" onClick={(e) => e.stopPropagation()}>
            <h2 className="card-title">{historyFor.name} — order history</h2>
            {historyLoading ? <p className="muted-block">Loading…</p> : null}
            {!historyLoading && history.length === 0 ? <p className="muted-block">No orders yet.</p> : null}
            <ul className="history-list customer-history-list">
              {history.map((h, index) => {
                const entryKey = historyEntryKey(h);
                const markingPaid = paymentBusyKey === entryKey;
                const day = new Date(h.created_at).toDateString();
                const prevDay = index > 0 ? new Date(history[index - 1].created_at).toDateString() : '';
                const showDate = day !== prevDay;
                return (
                  <li key={entryKey} className="customer-history-row">
                    {showDate ? (
                      <div className="customer-history-date">
                        {new Date(h.created_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </div>
                    ) : null}
                    <div className={`customer-history-item${!h.payment_settled ? ' customer-history-item--unpaid' : ''}`}>
                      <button type="button" className="customer-history-item-main" onClick={() => setSelectedEntry(h)}>
                        <span className="customer-history-time">
                          {new Date(h.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        </span>
                        <span className="customer-history-channel">{h.channelLabel}</span>
                        <span className="customer-history-amount">{money(h.total)}</span>
                        <span className="customer-history-pay">{paymentMethodLabel(h)}</span>
                        {h.payment_settled ? (
                          <span className="chip ok">Paid</span>
                        ) : (
                          <span className="chip pending">Unpaid</span>
                        )}
                      </button>
                      {!h.payment_settled ? (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm customer-history-mark-paid"
                          disabled={paymentBusyKey != null}
                          onClick={() => void setEntryPaymentSettled(h, true)}
                        >
                          {markingPaid ? '…' : 'Paid'}
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
            {historyHasMore ? (
              <div style={{ marginBottom: 12, textAlign: 'center' }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={historyLoadingMore}
                  onClick={() => void showMoreHistory()}
                >
                  {historyLoadingMore ? 'Loading…' : 'Show more'}
                </button>
              </div>
            ) : null}

            {selectedEntry ? (
              <div className="customer-order-detail card card-flat">
                <h3 className="inventory-section-title">Order details</h3>
                <p className="muted-block">
                  {new Date(selectedEntry.created_at).toLocaleString()} · {selectedEntry.channelLabel}
                </p>
                <p>
                  <strong>Payment:</strong> {paymentMethodLabel(selectedEntry)} ·{' '}
                  {selectedEntry.payment_settled ? (
                    <span className="chip ok">Paid</span>
                  ) : (
                    <span className="chip pending">Unpaid</span>
                  )}
                </p>
                <ul className="customer-order-detail-items">
                  {selectedEntry.items.map((it, i) => (
                    <li key={`${it.name}-${i}`}>
                      {it.name} × {it.qty} — {money(it.unit_price * it.qty)}
                    </li>
                  ))}
                </ul>
                <p className="customer-order-detail-total">
                  <strong>Total: {money(selectedEntry.total)}</strong>
                </p>
                <div className="row-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={paymentBusyKey != null || selectedEntry.payment_settled}
                    onClick={() => void setEntryPaymentSettled(selectedEntry, true)}
                  >
                    {paymentBusyKey === historyEntryKey(selectedEntry) ? 'Saving…' : 'Mark as paid'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={paymentBusyKey != null || !selectedEntry.payment_settled}
                    onClick={() => void setEntryPaymentSettled(selectedEntry, false)}
                  >
                    Mark as unpaid
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelectedEntry(null)}>
                    Close detail
                  </button>
                </div>
              </div>
            ) : null}

            <button type="button" className="btn btn-ghost btn-sm" onClick={closeHistory}>
              Close
            </button>
          </div>
        </div>
      ) : null}

      <ConfirmModal
        open={removeTarget != null}
        title="Remove customer?"
        message={
          removeTarget ? (
            <>
              Remove <strong>{removeTarget.name}</strong> from your customer list?
              {removeTarget.isPosOnly ? (
                <> Walk-in name only — POS sales history stays in your records.</>
              ) : removeTarget.orderCount > 0 ? (
                <>
                  {' '}
                  They have <strong>{removeTarget.orderCount}</strong> order
                  {removeTarget.orderCount === 1 ? '' : 's'} on record — their{' '}
                  <strong>Supabase login will stay</strong> so order history is preserved. They disappear from your list
                  only.
                </>
              ) : (
                <>
                  {' '}
                  No orders on record — their <strong>login account can be deleted</strong> from Supabase as well.
                </>
              )}
              {removeTarget.containersOutstanding > 0 ? (
                <>
                  {' '}
                  Borrowed containers: <strong>{removeTarget.containersOutstanding}</strong>.
                </>
              ) : null}
            </>
          ) : null
        }
        confirmLabel="Yes, remove"
        variant="danger"
        busy={removeBusy}
        onCancel={() => {
          if (!removeBusy) setRemoveTarget(null);
        }}
        onConfirm={() => void confirmRemoveCustomer()}
      />
    </>
  );
}
