import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, RefreshControl, ScrollView, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { supabase } from '../../lib/supabase';
import { useAuth } from '../../providers/AuthProvider';
import { Screen } from '../../ui/components/Screen';
import { Card } from '../../ui/components/Card';
import { Text } from '../../ui/components/Text';
import { Button } from '../../ui/components/Button';
import { SellerScreenHeader } from '../../ui/components/SellerScreenHeader';
import { theme } from '../../ui/theme';

type Tab = 'assigned' | 'transit' | 'done' | 'history';

type Item = { name: string; quantity: number };

type Stop = {
  jobId: string;
  sourceKind: 'order' | 'laundry';
  sourceId: string;
  code: string;
  category: string;
  customer: string;
  phone: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  items: Item[];
  status: string;
  assignedAt: string | null;
  completedAt: string | null;
};

type HistoryRow = {
  id: string;
  jobId: string;
  status: string;
  assignedAt: string;
  completedAt: string | null;
  category: string;
  customer: string;
  items: Item[];
};

const STATION = 'Ilang-Ilang Road, Andagao, Kalibo, Aklan';

function deliveryCode(kind: 'order' | 'laundry', id: string) {
  return `${kind === 'laundry' ? 'LY' : 'WM'}-${id.replace(/-/g, '').slice(0, 6).toUpperCase()}`;
}

function categoryLabel(category: string) {
  if (category === 'ice') return 'Ice Cubes';
  if (category === 'laundry') return 'Laundry';
  if (category === 'mixed') return 'Water + Ice';
  return 'Water Refilling';
}

function statusLabel(status: string) {
  if (status === 'for_delivery' || status === 'assigned') return 'For delivery';
  if (status === 'in_transit') return 'In transit';
  if (status === 'delivered') return 'Delivered';
  if (status === 'reassigned') return 'Reassigned';
  if (status === 'cancelled' || status === 'failed') return 'Failed';
  return status;
}

function openMaps(stop: Stop) {
  const destination = stop.latitude != null && stop.longitude != null
    ? `${stop.latitude},${stop.longitude}`
    : stop.address.trim();
  if (!destination) return;
  const params = new URLSearchParams({
    api: '1',
    origin: STATION,
    destination,
    travelmode: 'driving',
  });
  void Linking.openURL(`https://www.google.com/maps/dir/?${params.toString()}`);
}

export default function DeliveryScreen() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('assigned');
  const [stops, setStops] = useState<Stop[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setError(null);
    const [jobsRes, historyRes] = await Promise.all([
      supabase
        .from('delivery_jobs')
        .select('id,source_kind,order_id,laundry_booking_id,business_category,status,assigned_at,completed_at')
        .eq('rider_id', user.id)
        .order('assigned_at', { ascending: false }),
      supabase
        .from('delivery_assignment_history')
        .select('id,job_id,status,assigned_at,completed_at,customer_name,business_category,items_summary')
        .eq('rider_id', user.id)
        .order('assigned_at', { ascending: false })
        .limit(200),
    ]);
    if (jobsRes.error) {
      setError(jobsRes.error.message);
      setStops([]);
      setHistory([]);
      setLoading(false);
      return;
    }

    const jobs = (jobsRes.data ?? []) as {
      id: string;
      source_kind: 'order' | 'laundry';
      order_id: string | null;
      laundry_booking_id: string | null;
      business_category: string;
      status: string;
      assigned_at: string | null;
      completed_at: string | null;
    }[];
    const orderIds = jobs.map((job) => job.order_id).filter((id): id is string => Boolean(id));
    const laundryIds = jobs.map((job) => job.laundry_booking_id).filter((id): id is string => Boolean(id));
    const [ordersRes, laundryRes] = await Promise.all([
      orderIds.length
        ? supabase
            .from('orders')
            .select('id,customer_name,contact_number,delivery_address,latitude,longitude,order_items(product_name,quantity)')
            .in('id', orderIds)
        : Promise.resolve({ data: [], error: null }),
      laundryIds.length
        ? supabase
            .from('laundry_bookings')
            .select('id,customer_name,contact_number,address,latitude,longitude,laundry_booking_items(service_name,quantity)')
            .in('id', laundryIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const orders = new Map(
      ((ordersRes.data ?? []) as {
        id: string;
        customer_name: string;
        contact_number: string;
        delivery_address: string;
        latitude: number | null;
        longitude: number | null;
        order_items: { product_name: string; quantity: number }[] | null;
      }[]).map((order) => [order.id, order])
    );
    const bookings = new Map(
      ((laundryRes.data ?? []) as {
        id: string;
        customer_name: string;
        contact_number: string;
        address: string | null;
        latitude: number | null;
        longitude: number | null;
        laundry_booking_items: { service_name: string; quantity: number }[] | null;
      }[]).map((booking) => [booking.id, booking])
    );

    const nextStops: Stop[] = jobs.map((job) => {
      const order = job.order_id ? orders.get(job.order_id) : undefined;
      const booking = job.laundry_booking_id ? bookings.get(job.laundry_booking_id) : undefined;
      const sourceId = job.order_id ?? job.laundry_booking_id ?? job.id;
      return {
        jobId: job.id,
        sourceKind: job.source_kind,
        sourceId,
        code: deliveryCode(job.source_kind, sourceId),
        category: job.business_category,
        customer: order?.customer_name ?? booking?.customer_name ?? 'Customer',
        phone: order?.contact_number ?? booking?.contact_number ?? '',
        address: order?.delivery_address ?? booking?.address ?? '',
        latitude: order?.latitude ?? booking?.latitude ?? null,
        longitude: order?.longitude ?? booking?.longitude ?? null,
        items: order
          ? (order.order_items ?? []).map((item) => ({ name: item.product_name, quantity: item.quantity }))
          : (booking?.laundry_booking_items ?? []).map((item) => ({ name: item.service_name, quantity: item.quantity })),
        status: job.status,
        assignedAt: job.assigned_at,
        completedAt: job.completed_at,
      };
    });

    const stopByJob = new Map(nextStops.map((stop) => [stop.jobId, stop]));
    const nextHistory: HistoryRow[] = ((historyRes.data ?? []) as {
      id: string;
      job_id: string;
      status: string;
      assigned_at: string;
      completed_at: string | null;
      customer_name?: string | null;
      business_category?: string | null;
      items_summary?: string | null;
    }[]).map((row) => {
      const stop = stopByJob.get(row.job_id);
      const summary = (row.items_summary ?? '').trim();
      const fromSummary = summary
        ? summary.split(', ').map((part) => {
            const match = part.match(/^(\d+)\s+x\s+(.+)$/i);
            return match ? { quantity: Number(match[1]), name: match[2] } : { quantity: 1, name: part };
          })
        : [];
      return {
        id: row.id,
        jobId: row.job_id,
        status: row.status,
        assignedAt: row.assigned_at,
        completedAt: row.completed_at,
        category: row.business_category || stop?.category || 'water',
        customer: row.customer_name || stop?.customer || 'Customer',
        items: fromSummary.length ? fromSummary : (stop?.items ?? []),
      };
    });

    setStops(nextStops);
    setHistory(nextHistory);
    setLoading(false);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`my-deliveries-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_jobs', filter: `rider_id=eq.${user.id}` }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_assignment_history', filter: `rider_id=eq.${user.id}` }, () => void load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load, user]);

  const stats = useMemo(() => {
    const completed = history.filter((row) => row.status === 'delivered').length;
    const pending = history.filter((row) => row.status === 'assigned' || row.status === 'in_transit').length;
    const failed = history.filter((row) => row.status === 'cancelled' || row.status === 'failed').length;
    return { assigned: history.length, completed, pending, failed };
  }, [history]);

  const visible = stops.filter((stop) => {
    if (tab === 'assigned') return stop.status === 'for_delivery';
    if (tab === 'transit') return stop.status === 'in_transit';
    if (tab === 'done') return stop.status === 'delivered';
    return false;
  });

  async function updateDelivery(jobId: string, action: 'start' | 'deliver') {
    setBusyId(jobId);
    setError(null);
    const { error: err } = await supabase.rpc('rider_update_delivery', { p_job_id: jobId, p_action: action });
    setBusyId(null);
    if (err) {
      setError(err.message);
      return;
    }
    await load();
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 28, gap: 12 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load().finally(() => setRefreshing(false));
            }}
          />
        }
      >
        <SellerScreenHeader title="My Deliveries" subtitle="Only orders assigned to your account" />
        {error ? <Text weight="bold" style={{ color: theme.colors.danger }}>{error}</Text> : null}

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TabButton label="To deliver" active={tab === 'assigned'} onPress={() => setTab('assigned')} />
          <TabButton label="In transit" active={tab === 'transit'} onPress={() => setTab('transit')} />
          <TabButton label="Done" active={tab === 'done'} onPress={() => setTab('done')} />
          <TabButton label="History" active={tab === 'history'} onPress={() => setTab('history')} />
        </View>

        {loading ? <Text variant="muted">Loading your deliveries…</Text> : null}

        {tab === 'history' ? (
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Stat label="Assigned" value={stats.assigned} />
              <Stat label="Completed" value={stats.completed} />
              <Stat label="Pending" value={stats.pending} />
              <Stat label="Failed" value={stats.failed} />
            </View>
            {history.length === 0 ? <Text variant="muted">No delivery records yet.</Text> : null}
            {history.map((row) => (
              <Card key={row.id}>
                <Text variant="chip" weight="extrabold" style={{ color: theme.colors.primary }}>
                  {categoryLabel(row.category)} · {new Date(row.completedAt ?? row.assignedAt).toLocaleString()}
                </Text>
                <Text weight="extrabold" style={{ marginTop: 6 }}>{row.customer}</Text>
                <Text variant="muted" style={{ marginTop: 4 }}>{statusLabel(row.status)}</Text>
                {row.items.map((item, index) => (
                  <Text key={`${row.id}-${index}`} style={{ marginTop: 4 }}>
                    {item.quantity} × {item.name}
                  </Text>
                ))}
              </Card>
            ))}
          </View>
        ) : null}

        {tab !== 'history' && !loading && visible.length === 0 ? (
          <Card>
            <Text variant="muted">No deliveries in this list. Unassigned orders stay with the admin.</Text>
          </Card>
        ) : null}

        {tab !== 'history'
          ? visible.map((stop) => (
              <Card key={stop.jobId}>
                <Text variant="chip" weight="extrabold" style={{ color: theme.colors.primary }}>
                  {stop.code} · {categoryLabel(stop.category)}
                </Text>
                <Text weight="extrabold" style={{ marginTop: 8, fontSize: 18 }}>{stop.customer}</Text>
                {stop.phone ? <Text variant="muted" style={{ marginTop: 2 }}>{stop.phone}</Text> : null}
                <Text style={{ marginTop: 8 }}>{stop.address || 'No address'}</Text>
                <View style={{ marginTop: 10, gap: 4 }}>
                  {stop.items.map((item, index) => (
                    <Text key={`${stop.jobId}-${index}`} weight="bold">
                      {item.quantity} × {item.name}
                    </Text>
                  ))}
                </View>
                <View style={{ marginTop: 12, gap: 8 }}>
                  <Button variant="ghost" title="Open in Google Maps" onPress={() => openMaps(stop)} />
                  {stop.status === 'for_delivery' ? (
                    <Button title="Start Delivery" disabled={busyId === stop.jobId} onPress={() => void updateDelivery(stop.jobId, 'start')} />
                  ) : null}
                  {stop.status === 'in_transit' ? (
                    <Button title="Mark as Delivered" disabled={busyId === stop.jobId} onPress={() => void updateDelivery(stop.jobId, 'deliver')} />
                  ) : null}
                </View>
              </Card>
            ))
          : null}
      </ScrollView>
    </Screen>
  );
}

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <View style={{ flex: 1 }}>
      <Button variant={active ? 'primary' : 'ghost'} title={label} onPress={onPress} />
    </View>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card style={{ width: '48%', padding: 12 }}>
      <Text variant="muted" weight="bold">{label}</Text>
      <Text weight="extrabold" style={{ fontSize: 22, marginTop: 4 }}>{value}</Text>
    </Card>
  );
}
