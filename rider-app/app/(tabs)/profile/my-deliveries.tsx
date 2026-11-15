import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, RefreshControl, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';

import { formatSourceReference } from '../../../lib/sourceReference';
import { supabase } from '../../../lib/supabase';
import { uniqueRealtimeChannelName } from '../../../lib/supabaseRealtime';
import { useAuth } from '../../../providers/AuthProvider';
import { KeyboardAwareScrollView } from '../../../ui/components/KeyboardAwareScrollView';
import { Screen } from '../../../ui/components/Screen';
import { Card } from '../../../ui/components/Card';
import { Text } from '../../../ui/components/Text';
import { theme } from '../../../ui/theme';

type DeliveryRecord = {
  id: string;
  sourceKind: 'order' | 'laundry';
  sourceId: string;
  customerName: string;
  whenIso: string | null;
  address: string;
  itemsSummary: string;
};

function formatWhen(iso: string | null) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function DeliveryHistoryScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [rows, setRows] = useState<DeliveryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [laundryDetail, setLaundryDetail] = useState<DeliveryRecord | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    setError(null);
    const { data, error: queryError } = await supabase
      .from('delivery_jobs')
      .select(
        `
        id,
        source_kind,
        order_id,
        laundry_booking_id,
        completed_at,
        updated_at,
        orders ( customer_name, delivery_address, landmark, order_items ( product_name, quantity ) ),
        laundry_bookings (
          customer_name,
          address,
          laundry_booking_items ( service_name, quantity )
        )
      `
      )
      .eq('rider_id', user.id)
      .eq('status', 'delivered')
      .order('completed_at', { ascending: false, nullsFirst: false })
      .limit(250);

    if (queryError) {
      setError(queryError.message);
      setRows([]);
      setLoading(false);
      return;
    }

    const mapped: DeliveryRecord[] = [];
    const raw = (data ?? []) as {
      id: string;
      source_kind: 'order' | 'laundry';
      order_id: string | null;
      laundry_booking_id: string | null;
      completed_at: string | null;
      updated_at: string;
      orders:
        | {
            customer_name: string;
            delivery_address: string;
            landmark: string | null;
            order_items: { product_name: string; quantity: number }[] | null;
          }
        | {
            customer_name: string;
            delivery_address: string;
            landmark: string | null;
            order_items: { product_name: string; quantity: number }[] | null;
          }[]
        | null;
      laundry_bookings:
        | {
            customer_name: string;
            address: string | null;
            laundry_booking_items: { service_name: string; quantity: number }[] | null;
          }
        | {
            customer_name: string;
            address: string | null;
            laundry_booking_items: { service_name: string; quantity: number }[] | null;
          }[]
        | null;
    }[];

    for (const job of raw) {
      const whenIso = job.completed_at ?? job.updated_at;

      if (job.source_kind === 'order' && job.order_id) {
        const order = Array.isArray(job.orders) ? job.orders[0] : job.orders;
        if (!order) continue;
        const items = order.order_items ?? [];
        const address = `${order.delivery_address ?? ''}${order.landmark ? `, ${order.landmark}` : ''}`.trim();
        mapped.push({
          id: job.id,
          sourceKind: 'order',
          sourceId: job.order_id,
          customerName: order.customer_name,
          whenIso,
          address,
          itemsSummary: items.map((item) => `${item.quantity}× ${item.product_name}`).join(', '),
        });
        continue;
      }
      if (job.source_kind === 'laundry' && job.laundry_booking_id) {
        const booking = Array.isArray(job.laundry_bookings) ? job.laundry_bookings[0] : job.laundry_bookings;
        if (!booking) continue;
        const items = booking.laundry_booking_items ?? [];
        mapped.push({
          id: job.id,
          sourceKind: 'laundry',
          sourceId: job.laundry_booking_id,
          customerName: booking.customer_name,
          whenIso,
          address: booking.address ?? '',
          itemsSummary: items.map((item) => `${item.quantity}× ${item.service_name}`).join(', '),
        });
      }
    }

    setRows(mapped);
    setLoading(false);
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load])
  );

  useEffect(() => {
    if (!user?.id) return;
    const refresh = () => {
      void load();
    };
    const channel = supabase
      .channel(uniqueRealtimeChannelName(`delivery-history-${user.id}`))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'delivery_jobs', filter: `rider_id=eq.${user.id}` },
        refresh
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load, user?.id]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const summary = useMemo(() => {
    if (loading) return 'Loading…';
    if (rows.length === 0) return 'No delivered orders yet';
    return `${rows.length} delivered`;
  }, [loading, rows.length]);

  function openRecord(row: DeliveryRecord) {
    if (row.sourceKind === 'order') {
      router.push(`/order/${row.sourceId}`);
      return;
    }
    setLaundryDetail(row);
  }

  return (
    <Screen style={{ padding: 0 }}>
      <KeyboardAwareScrollView
        contentContainerStyle={{ padding: theme.spacing.md, paddingBottom: theme.spacing.xl + 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}
      >
        <Text variant="muted" weight="semibold" style={{ marginBottom: 8, lineHeight: 20 }}>
          Delivered assignments for your rider account, newest first.
        </Text>

        <Text variant="muted" weight="semibold">
          {summary}
        </Text>

        {error ? (
          <Text style={{ marginTop: 10, color: theme.colors.danger }} weight="semibold">
            {error}
          </Text>
        ) : null}

        {loading ? (
          <View style={{ marginTop: 24, alignItems: 'center' }}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : null}

        {!loading && rows.length === 0 ? (
          <Text variant="muted" style={{ marginTop: 16 }}>
            When you complete a delivery, it will show here.
          </Text>
        ) : null}

        {!loading && rows.length > 0 ? (
          <Card style={{ marginTop: 12, paddingVertical: 4, paddingHorizontal: 0 }}>
            {rows.map((row, index) => (
              <View key={row.id}>
                {index > 0 ? <View style={{ height: 1, backgroundColor: theme.colors.border, marginHorizontal: 14 }} /> : null}
                <Pressable
                  onPress={() => openRecord(row)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingVertical: 14,
                    paddingHorizontal: 14,
                    gap: 10,
                  }}
                >
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text weight="extrabold" style={{ fontSize: 16 }}>
                      {row.customerName}
                    </Text>
                    <Text variant="muted" weight="semibold" style={{ fontSize: 13 }}>
                      {formatWhen(row.whenIso)}
                    </Text>
                    <Text weight="bold" style={{ color: theme.colors.primary, fontSize: 13, marginTop: 2 }}>
                      {formatSourceReference(row.sourceKind, row.sourceId)}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.muted} />
                </Pressable>
              </View>
            ))}
          </Card>
        ) : null}
      </KeyboardAwareScrollView>

      <Modal visible={!!laundryDetail} transparent animationType="fade" onRequestClose={() => setLaundryDetail(null)}>
        <Pressable
          onPress={() => setLaundryDetail(null)}
          style={{ flex: 1, backgroundColor: 'rgba(11,27,58,0.45)', justifyContent: 'center', padding: theme.spacing.md }}
        >
          <Pressable onPress={() => {}} style={{ width: '100%', maxWidth: 420, alignSelf: 'center' }}>
            {laundryDetail ? (
              <Card>
                <Text variant="h2" weight="extrabold">
                  Laundry delivery
                </Text>
                <Text weight="extrabold" style={{ marginTop: 12, fontSize: 17 }}>
                  {laundryDetail.customerName}
                </Text>
                <Text variant="muted" weight="semibold" style={{ marginTop: 6 }}>
                  {formatWhen(laundryDetail.whenIso)}
                </Text>
                <Text weight="bold" style={{ marginTop: 10, color: theme.colors.primary }}>
                  {formatSourceReference('laundry', laundryDetail.sourceId)}
                </Text>
                <Text variant="muted" style={{ marginTop: 10 }}>
                  {laundryDetail.address || 'No address'}
                </Text>
                {laundryDetail.itemsSummary ? (
                  <Text variant="muted" style={{ marginTop: 8 }}>
                    {laundryDetail.itemsSummary}
                  </Text>
                ) : null}
                <View style={{ marginTop: 16 }}>
                  <Pressable onPress={() => setLaundryDetail(null)} style={{ alignSelf: 'flex-end' }}>
                    <Text weight="extrabold" style={{ color: theme.colors.primary }}>
                      Close
                    </Text>
                  </Pressable>
                </View>
              </Card>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}