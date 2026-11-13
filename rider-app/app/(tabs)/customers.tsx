import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Image, Pressable, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { supabase } from '../../lib/supabase';
import { publicWrsAssetUrl } from '../../lib/publicAssetUrl';
import { useAuth } from '../../providers/AuthProvider';
import { Screen } from '../../ui/components/Screen';
import { Card } from '../../ui/components/Card';
import { Text } from '../../ui/components/Text';
import { theme } from '../../ui/theme';
import { SellerCustomersSkeleton } from '../../ui/components/Skeleton';
import { orderGrandTotal } from '../../lib/orderTotal';

type ProfileRow = {
  user_id: string;
  display_name: string | null;
  phone: string | null;
  address: string | null;
  latitude?: number | null;
  longitude?: number | null;
  avatar_path?: string | null;
};

type OrderAggRow = {
  customer_id: string;
  created_at: string;
  customer_name: string;
  contact_number: string;
  delivery_address: string;
  status: string;
  payment_method: string | null;
  payment_settled: boolean | null;
  order_items?: { product_name?: string | null; unit_price: number; quantity: number }[];
  delivery_fee?: number | null;
};

type CustomerSource = 'app' | 'walkin';

type CustomerRow = {
  id: string;
  source: CustomerSource;
  name: string;
  phone: string;
  address: string;
  avatarPath: string | null;
  orderCount: number;
  lastOrderIso: string | null;
  hasUnpaidCredit: boolean;
  unpaidDeliveredCount: number;
  unpaidDeliveredTotal: number;
  /** Gallon/container na pinahiram, hindi pa naibalik (mula `seller_customer_container_balance`). */
  containersOutstanding: number;
  containerIdentifierNotes: string | null;
};

function nameKey(name: string) {
  return name.trim().toLowerCase();
}

function walkInId(name: string) {
  return `walkin-${encodeURIComponent(nameKey(name) || 'customer')}`;
}

function blankCustomer(id: string, source: CustomerSource, name: string, phone = '', address = ''): CustomerRow {
  return {
    id,
    source,
    name: name.trim() || (source === 'walkin' ? 'Walk-in' : 'Customer'),
    phone: phone.trim(),
    address: address.trim(),
    avatarPath: null,
    orderCount: 0,
    lastOrderIso: null,
    hasUnpaidCredit: false,
    unpaidDeliveredCount: 0,
    unpaidDeliveredTotal: 0,
    containersOutstanding: 0,
    containerIdentifierNotes: null,
  };
}

function daysAgoLabel(iso: string | null) {
  if (!iso) return 'Last order: —';
  const then = new Date(iso).getTime();
  const now = Date.now();
  if (!Number.isFinite(then)) return 'Last order: —';
  const days = Math.max(0, Math.floor((now - then) / (1000 * 60 * 60 * 24)));
  if (days === 0) return 'Last order: today';
  if (days === 1) return 'Last order: 1 day ago';
  return `Last order: ${days} days ago`;
}

export default function CustomersScreen() {
  const router = useRouter();
  const { user, businessId } = useAuth();

  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [hiddenCount, setHiddenCount] = useState(0);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user || !businessId) return;
    setError(null);
    setLoading(true);

    const { data: orders, error: ordErr } = await supabase
      .from('orders')
      .select(
        'customer_id,created_at,customer_name,contact_number,delivery_address,status,payment_method,payment_settled,delivery_fee,order_items(product_name,unit_price,quantity)'
      )
      .eq('seller_id', businessId)
      .order('created_at', { ascending: false })
      .limit(1200);

    if (ordErr) {
      setError(ordErr.message ?? 'Failed to load customers');
      setRows([]);
      setLoading(false);
      return;
    }

    // Always list registered customers (RLS allows approved sellers to read all customer profiles).
    // Previously we only loaded profiles for customers who had orders whenever any order existed,
    // so new signups never appeared until their first order.
    const { data: customers, error: custErr } = await supabase
      .from('profiles')
      .select('user_id,display_name,phone,address,latitude,longitude,avatar_path')
      .eq('role', 'customer')
      .order('created_at', { ascending: false })
      .limit(300);

    if (custErr) {
      setError(custErr.message ?? 'Failed to load customer profiles');
    }

    const byId = new Map<string, CustomerRow>();
    for (const p of (customers ?? []) as ProfileRow[]) {
      byId.set(p.user_id, {
        ...blankCustomer(p.user_id, 'app', (p.display_name ?? 'Customer').trim() || 'Customer', p.phone ?? '', p.address ?? ''),
        avatarPath: p.avatar_path ?? null,
      });
    }

    const appNames = new Set<string>();
    for (const row of byId.values()) {
      if (row.source === 'app') appNames.add(nameKey(row.name));
    }

    for (const o of (orders ?? []) as OrderAggRow[]) {
      const guestName = (o.customer_name ?? '').trim();
      const guestPhone = (o.contact_number ?? '').trim();
      const hasAccount = typeof o.customer_id === 'string' && o.customer_id.length > 0;
      if (!hasAccount && (!guestName || appNames.has(nameKey(guestName)))) continue;
      const linkedId = hasAccount ? (o.customer_id as string) : walkInId(guestName);
      const existing =
        byId.get(linkedId) ??
        blankCustomer(linkedId, linkedId.startsWith('walkin-') ? 'walkin' : 'app', guestName || 'Walk-in', guestPhone, o.delivery_address ?? '');

      const orderTotal = orderGrandTotal(o.order_items, o.delivery_fee);
      const deliveredUnpaid = o.status === 'delivered' && o.payment_settled !== true;

      const nextCount = existing.orderCount + 1;
      const last = existing.lastOrderIso;
      const nextLast =
        !last || new Date(o.created_at).getTime() > new Date(last).getTime() ? o.created_at : last;

      const utangOpen =
        (o.payment_method ?? '').toLowerCase() === 'utang' &&
        o.payment_settled !== true &&
        o.status !== 'cancelled';

      byId.set(linkedId, {
        ...existing,
        name: existing.name || guestName || 'Walk-in',
        phone: existing.phone || guestPhone,
        address: existing.address || (o.delivery_address ?? ''),
        avatarPath: existing.avatarPath,
        orderCount: nextCount,
        lastOrderIso: nextLast,
        hasUnpaidCredit: existing.hasUnpaidCredit || utangOpen || deliveredUnpaid,
        unpaidDeliveredCount: existing.unpaidDeliveredCount + (deliveredUnpaid ? 1 : 0),
        unpaidDeliveredTotal: existing.unpaidDeliveredTotal + (deliveredUnpaid ? orderTotal : 0),
        containersOutstanding: existing.containersOutstanding,
        containerIdentifierNotes: existing.containerIdentifierNotes,
      });
    }

    const [posCustomers, posSales, hiddenPos, laundryBookings, laundrySales] = await Promise.all([
      supabase.from('seller_pos_customers').select('customer_name_key,display_name').eq('seller_id', businessId),
      supabase.from('pos_sales').select('customer_name,created_at').eq('seller_id', businessId).order('created_at', { ascending: false }).limit(800),
      supabase.from('seller_hidden_pos_customers').select('customer_name_key').eq('seller_id', businessId),
      supabase.from('laundry_bookings').select('customer_name,contact_number,address,created_at').eq('seller_id', businessId).order('created_at', { ascending: false }).limit(400),
      supabase.from('laundry_sales').select('customer_name,created_at').eq('seller_id', businessId).order('created_at', { ascending: false }).limit(400),
    ]);
    const hiddenPosKeys = new Set(
      ((hiddenPos.data ?? []) as { customer_name_key: string }[]).map((row) => row.customer_name_key)
    );
    for (const row of (posCustomers.data ?? []) as { customer_name_key: string; display_name: string }[]) {
      const label = (row.display_name ?? '').trim();
      if (!label || hiddenPosKeys.has(row.customer_name_key) || appNames.has(nameKey(label))) continue;
      const id = walkInId(label);
      if (!byId.has(id)) byId.set(id, blankCustomer(id, 'walkin', label));
    }
    for (const sale of (posSales.data ?? []) as { customer_name: string | null; created_at: string }[]) {
      const label = (sale.customer_name ?? '').trim();
      if (!label || hiddenPosKeys.has(nameKey(label)) || appNames.has(nameKey(label))) continue;
      const id = walkInId(label);
      const existing = byId.get(id) ?? blankCustomer(id, 'walkin', label);
      const last = existing.lastOrderIso;
      const nextLast = !last || new Date(sale.created_at).getTime() > new Date(last).getTime() ? sale.created_at : last;
      byId.set(id, { ...existing, orderCount: existing.orderCount + 1, lastOrderIso: nextLast });
    }
    for (const booking of (laundryBookings.data ?? []) as { customer_name: string; contact_number: string | null; address: string | null; created_at: string }[]) {
      const label = (booking.customer_name ?? '').trim();
      if (!label || hiddenPosKeys.has(nameKey(label)) || appNames.has(nameKey(label))) continue;
      const id = walkInId(label);
      const existing = byId.get(id) ?? blankCustomer(id, 'walkin', label, booking.contact_number ?? '', booking.address ?? '');
      const last = existing.lastOrderIso;
      const nextLast = !last || new Date(booking.created_at).getTime() > new Date(last).getTime() ? booking.created_at : last;
      byId.set(id, {
        ...existing,
        phone: existing.phone || (booking.contact_number ?? '').trim(),
        address: existing.address || (booking.address ?? '').trim(),
        orderCount: existing.orderCount + 1,
        lastOrderIso: nextLast,
      });
    }
    for (const sale of (laundrySales.data ?? []) as { customer_name: string | null; created_at: string }[]) {
      const label = (sale.customer_name ?? '').trim();
      if (!label || hiddenPosKeys.has(nameKey(label)) || appNames.has(nameKey(label))) continue;
      const id = walkInId(label);
      const existing = byId.get(id) ?? blankCustomer(id, 'walkin', label);
      const last = existing.lastOrderIso;
      const nextLast = !last || new Date(sale.created_at).getTime() > new Date(last).getTime() ? sale.created_at : last;
      byId.set(id, { ...existing, orderCount: existing.orderCount + 1, lastOrderIso: nextLast });
    }

    let hiddenSet = new Set<string>();
    const { data: hiddenRows, error: hidErr } = await supabase
      .from('seller_hidden_customers')
      .select('customer_id')
      .eq('seller_id', businessId);

    if (hidErr) {
      setError(hidErr.message ?? 'Could not load hidden customers');
      setHiddenCount(0);
    } else {
      hiddenSet = new Set(((hiddenRows ?? []) as { customer_id: string }[]).map((r) => r.customer_id));
      setHiddenCount(hiddenSet.size);
    }

    const allIds = Array.from(byId.keys()).filter((id) => !id.startsWith('walkin-'));
    if (allIds.length) {
      const { data: balances, error: balErr } = await supabase
        .from('seller_customer_container_balance')
        .select('customer_id,outstanding_count,identifier_notes')
        .eq('seller_id', businessId)
        .in('customer_id', allIds);
      if (!balErr) {
        const balByCustomer = new Map<
          string,
          { outstanding_count: number; identifier_notes: string | null }
        >();
        for (const b of (balances ?? []) as {
          customer_id: string;
          outstanding_count: number;
          identifier_notes: string | null;
        }[]) {
          balByCustomer.set(b.customer_id, {
            outstanding_count: Math.max(0, b.outstanding_count ?? 0),
            identifier_notes: b.identifier_notes,
          });
        }
        for (const [cid, row] of byId) {
          const b = balByCustomer.get(cid);
          const outstanding = b?.outstanding_count ?? 0;
          const notes =
            outstanding > 0 ? ((b?.identifier_notes ?? '').trim() || null) : null;
          byId.set(cid, {
            ...row,
            containersOutstanding: outstanding,
            containerIdentifierNotes: notes,
          });
        }
      }
    }

    const list = Array.from(byId.values())
      .filter((r) => typeof r.id === 'string' && r.id.length > 0 && !hiddenSet.has(r.id) && !hiddenPosKeys.has(nameKey(r.name)))
      .sort((a, b) => {
      if (b.orderCount !== a.orderCount) return b.orderCount - a.orderCount;
      const bt = b.lastOrderIso ? new Date(b.lastOrderIso).getTime() : -1;
      const at = a.lastOrderIso ? new Date(a.lastOrderIso).getTime() : -1;
      if (bt !== at) return bt - at;
      return a.name.localeCompare(b.name);
    });

    setRows(list);
    setLoading(false);
  }, [user, businessId]);

  useFocusEffect(
    useCallback(() => {
      if (!user || !businessId) return;
      void load();
    }, [user, businessId, load])
  );

  useEffect(() => {
    if (!user || !businessId) return;
    const channel = supabase
      .channel(`seller-customers-${businessId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `seller_id=eq.${businessId}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => load())
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'seller_customer_container_balance', filter: `seller_id=eq.${businessId}` },
        () => load()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'seller_hidden_customers', filter: `seller_id=eq.${businessId}` },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, businessId, load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((c) => {
      const notes = (c.containerIdentifierNotes ?? '').toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.address.toLowerCase().includes(q) ||
        notes.includes(q)
      );
    });
  }, [rows, query]);

  return (
    <Screen>
      <FlatList
        data={filtered}
        keyExtractor={(c) => c.id}
        refreshing={refreshing}
        onRefresh={async () => {
          setRefreshing(true);
          await load();
          setRefreshing(false);
        }}
        contentContainerStyle={{ paddingBottom: 92 }}
        ItemSeparatorComponent={() => <View style={{ height: theme.spacing.sm }} />}
        ListHeaderComponent={
          <Animated.View entering={FadeInDown.duration(240)} style={{ gap: theme.spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text variant="title" weight="extrabold">
                  Customers
                </Text>
                <Text variant="muted" weight="bold" style={{ marginTop: 2 }}>
                  Customer app and walk-in
                </Text>
                {hiddenCount > 0 ? (
                  <Pressable
                    onPress={() => router.push('/customer/hidden')}
                    style={({ pressed }) => ({
                      marginTop: 10,
                      alignSelf: 'flex-start',
                      paddingVertical: 8,
                      paddingHorizontal: 12,
                      borderRadius: 12,
                      backgroundColor: 'rgba(106,122,149,0.12)',
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      opacity: pressed ? 0.88 : 1,
                    })}
                  >
                    <Text variant="chip" weight="extrabold" style={{ color: theme.colors.muted }}>
                      Hidden · {hiddenCount} — tap to manage
                    </Text>
                  </Pressable>
                ) : null}
              </View>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 14,
                  backgroundColor: '#FFFFFF',
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="people-outline" size={20} color={theme.colors.primary} />
              </View>
            </View>

            <View
              style={{
                backgroundColor: '#FFFFFF',
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderRadius: 14,
                paddingHorizontal: 12,
                paddingVertical: 10,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <Ionicons name="search-outline" size={18} color={theme.colors.muted} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search customers..."
                placeholderTextColor="rgba(106,122,149,0.9)"
                style={{ flex: 1, color: theme.colors.text, fontFamily: theme.font.bold }}
              />
              {query ? (
                <Pressable
                  onPress={() => setQuery('')}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 12,
                    backgroundColor: 'rgba(0,114,240,0.08)',
                    borderWidth: 1,
                    borderColor: 'rgba(0,114,240,0.12)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="close" size={16} color={theme.colors.primary} />
                </Pressable>
              ) : null}
            </View>

            {loading ? <SellerCustomersSkeleton /> : null}
            {error ? <Text style={{ color: theme.colors.danger }}>{error}</Text> : null}
          </Animated.View>
        }
        renderItem={({ item, index }) => {
          const avatarUri = publicWrsAssetUrl(item.avatarPath);
          return (
          <Animated.View entering={FadeInDown.duration(220).delay(20 * index)}>
            <Pressable
              onPress={() => {
                if (!item.id) return;
                router.push({
                  pathname: '/customer/[customerKey]',
                  params: {
                    customerKey: item.id,
                    source: item.source,
                    name: item.name,
                    phone: item.phone,
                    address: item.address,
                  },
                });
              }}
            >
              <Card>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 14,
                      overflow: 'hidden',
                      backgroundColor: 'rgba(0,114,240,0.10)',
                      borderWidth: 1,
                      borderColor: 'rgba(0,114,240,0.18)',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {avatarUri ? (
                      <Image
                        source={{ uri: avatarUri }}
                        style={{ width: '100%', height: '100%' }}
                        resizeMode="cover"
                      />
                    ) : (
                      <Text weight="extrabold" style={{ color: theme.colors.primary }}>
                        {(item.name.trim()[0] ?? 'C').toUpperCase()}
                      </Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <Text weight="extrabold">{item.name}</Text>
                      <View
                        style={{
                          paddingVertical: 4,
                          paddingHorizontal: 8,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: item.source === 'walkin' ? 'rgba(245,158,11,0.45)' : 'rgba(0,114,240,0.28)',
                          backgroundColor: item.source === 'walkin' ? 'rgba(245,158,11,0.12)' : 'rgba(0,114,240,0.08)',
                        }}
                      >
                        <Text
                          variant="chip"
                          weight="extrabold"
                          style={{ color: item.source === 'walkin' ? theme.colors.warning : theme.colors.primary }}
                        >
                          {item.source === 'walkin' ? 'Walk-in' : 'Customer app'}
                        </Text>
                      </View>
                      <View
                        style={{
                          paddingVertical: 4,
                          paddingHorizontal: 8,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: theme.colors.border,
                          backgroundColor: 'rgba(0,114,240,0.06)',
                        }}
                      >
                        <Text variant="chip" weight="extrabold" style={{ color: 'rgba(7,20,46,0.75)' }}>
                          {item.orderCount} orders
                        </Text>
                      </View>
                      {item.unpaidDeliveredCount > 0 ? (
                        <View
                          style={{
                            paddingVertical: 4,
                            paddingHorizontal: 8,
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: 'rgba(239,68,68,0.35)',
                            backgroundColor: 'rgba(239,68,68,0.10)',
                          }}
                        >
                          <Text variant="chip" weight="extrabold" style={{ color: theme.colors.danger }}>
                            {item.unpaidDeliveredCount} unpaid · ₱{item.unpaidDeliveredTotal.toFixed(2)}
                          </Text>
                        </View>
                      ) : item.hasUnpaidCredit ? (
                        <View
                          style={{
                            paddingVertical: 4,
                            paddingHorizontal: 8,
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: 'rgba(239,68,68,0.35)',
                            backgroundColor: 'rgba(239,68,68,0.10)',
                          }}
                        >
                          <Text variant="chip" weight="extrabold" style={{ color: theme.colors.danger }}>
                            Unpaid
                          </Text>
                        </View>
                      ) : null}
                      {item.containersOutstanding > 0 ? (
                        <View
                          style={{
                            paddingVertical: 4,
                            paddingHorizontal: 8,
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: 'rgba(245,158,11,0.45)',
                            backgroundColor: 'rgba(245,158,11,0.12)',
                          }}
                        >
                          <Text variant="chip" weight="extrabold" style={{ color: theme.colors.warning }}>
                            Not returned
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text variant="muted" style={{ marginTop: 4 }}>
                      {daysAgoLabel(item.lastOrderIso)}
                    </Text>
                    {item.containersOutstanding > 0 ? (
                      <Text
                        variant="muted"
                        weight="bold"
                        numberOfLines={2}
                        style={{ marginTop: 6, color: 'rgba(7,20,46,0.82)' }}
                      >
                        {item.containerIdentifierNotes
                          ? `Container #: ${item.containerIdentifierNotes}`
                          : `${item.containersOutstanding} container(s) — no number recorded`}
                      </Text>
                    ) : null}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.muted} />
                </View>
              </Card>
            </Pressable>
          </Animated.View>
          );
        }}
        ListEmptyComponent={
          loading ? null : (
            <Card style={{ marginTop: theme.spacing.sm }}>
              <Text variant="muted">No customers yet.</Text>
            </Card>
          )
        }
      />
    </Screen>
  );
}
