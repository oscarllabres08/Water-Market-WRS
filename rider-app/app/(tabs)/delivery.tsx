import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Modal, Pressable, RefreshControl, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';

import { supabase } from '../../lib/supabase';
import { uniqueRealtimeChannelName } from '../../lib/supabaseRealtime';
import { useAuth } from '../../providers/AuthProvider';
import { Button } from '../../ui/components/Button';
import { Card } from '../../ui/components/Card';
import { KeyboardAwareScrollView } from '../../ui/components/KeyboardAwareScrollView';
import { NewOrderBadge } from '../../ui/components/NewOrderBadge';
import { Screen } from '../../ui/components/Screen';
import { SellerScreenHeader } from '../../ui/components/SellerScreenHeader';
import { Text } from '../../ui/components/Text';
import { formatSourceReference } from '../../lib/sourceReference';
import { theme } from '../../ui/theme';

type DeliveryFilter = 'for_delivery' | 'delivered';

type BatchStatusKey = 'pending' | 'confirmed' | 'preparing' | 'on_the_way' | 'delivered';

const BATCH_STATUS_OPTIONS: Array<{ key: BatchStatusKey; label: string }> = [
  { key: 'pending', label: 'Pending' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'preparing', label: 'Preparing' },
  { key: 'on_the_way', label: 'On the way' },
  { key: 'delivered', label: 'Delivered' },
];

function batchStatusIcon(key: BatchStatusKey): keyof typeof Ionicons.glyphMap {
  switch (key) {
    case 'pending':
      return 'time-outline';
    case 'confirmed':
      return 'checkmark-circle-outline';
    case 'preparing':
      return 'sync-outline';
    case 'on_the_way':
      return 'navigate-outline';
    case 'delivered':
      return 'checkmark-done-outline';
    default:
      return 'ellipse-outline';
  }
}

type Item = { name: string; quantity: number };

type Stop = {
  key: string;
  jobId: string | null;
  assignedToMe: boolean;
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
  status: 'for_delivery' | 'in_transit' | 'delivered';
  fresh: boolean;
  paymentSettled?: boolean | null;
};

const STATION = 'Ilang-Ilang Road, Andagao, Kalibo, Aklan';

function deliveryBucket(status: string): Stop['status'] | null {
  if (status === 'cancelled' || status === 'failed') return null;
  if (status === 'delivered' || status === 'completed') return 'delivered';
  if (status === 'on_the_way' || status === 'in_transit' || status === 'in_progress') return 'in_transit';
  return 'for_delivery';
}

function categoryMeta(category: string) {
  if (category === 'ice') {
    return { label: 'Ice Cubes', pillBg: '#E8F4FF', accent: '#0074F0' };
  }
  if (category === 'laundry') {
    return { label: 'Laundry', pillBg: '#F3EEFF', accent: '#7C3AED' };
  }
  if (category === 'mixed') {
    return { label: 'Mixed order', pillBg: '#E8F4FF', accent: '#0074F0' };
  }
  return { label: 'Water Refilling', pillBg: '#E8F4FF', accent: '#0074F0' };
}

function statusBadgeMeta(status: Stop['status']) {
  if (status === 'in_transit') {
    return { label: 'In Transit', icon: 'car-outline' as const, bg: '#F3EEFF', color: '#7C3AED' };
  }
  if (status === 'delivered') {
    return { label: 'Delivered', icon: 'checkmark-circle' as const, bg: '#E8F8EF', color: '#16A34A' };
  }
  return { label: 'For Delivery', icon: 'time-outline' as const, bg: '#E7F3FF', color: '#0074F0' };
}

function itemsLine(stop: Stop) {
  if (!stop.items.length) return '—';
  return stop.items.map((item) => `${item.quantity} ${item.name}`).join(' · ');
}

function dbStatusForStop(stop: Stop, statusKey: BatchStatusKey): string | null {
  if (stop.sourceKind === 'order') return statusKey;
  if (statusKey === 'pending') return 'pending';
  if (statusKey === 'confirmed' || statusKey === 'preparing') return 'confirmed';
  if (statusKey === 'on_the_way') return 'in_progress';
  if (statusKey === 'delivered') return 'completed';
  return null;
}

function openMaps(stop: Stop, origin: { lat: number; lng: number } | null) {
  const destination =
    stop.latitude != null && stop.longitude != null
      ? `${stop.latitude},${stop.longitude}`
      : stop.address.trim();
  if (!destination) return;
  const params = new URLSearchParams({
    api: '1',
    origin: origin ? `${origin.lat},${origin.lng}` : STATION,
    destination,
    travelmode: 'driving',
  });
  void Linking.openURL(`https://www.google.com/maps/dir/?${params.toString()}`);
}

export default function DeliveryScreen() {
  const router = useRouter();
  const { user, businessId } = useAuth();
  const [filter, setFilter] = useState<DeliveryFilter>('for_delivery');
  const [query, setQuery] = useState('');
  const [storeCoords, setStoreCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [stops, setStops] = useState<Stop[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchStatus, setBatchStatus] = useState<BatchStatusKey | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [laundryDetail, setLaundryDetail] = useState<Stop | null>(null);
  const loadRef = useRef<() => Promise<void>>(async () => {});

  const load = useCallback(async () => {
    if (!user || !businessId) {
      setLoading(false);
      return;
    }
    setError(null);
    const [ordersRes, laundryRes, jobsRes] = await Promise.all([
      supabase
        .from('orders')
        .select(
          'id,customer_name,contact_number,delivery_address,landmark,latitude,longitude,status,payment_settled,order_items(product_name,quantity,products(category))'
        )
        .eq('seller_id', businessId)
        .order('created_at', { ascending: false })
        .limit(300),
      supabase
        .from('laundry_bookings')
        .select('id,customer_name,contact_number,address,latitude,longitude,status,laundry_booking_items(service_name,quantity)')
        .eq('seller_id', businessId)
        .order('created_at', { ascending: false })
        .limit(300),
      supabase
        .from('delivery_jobs')
        .select('id,order_id,laundry_booking_id,rider_id,status')
        .eq('seller_id', businessId),
    ]);
    if (ordersRes.error) {
      setError(ordersRes.error.message);
      setStops([]);
      setLoading(false);
      return;
    }

    const jobs = (jobsRes.data ?? []) as {
      id: string;
      order_id: string | null;
      laundry_booking_id: string | null;
      rider_id: string | null;
      status: string;
    }[];
    const jobByOrder = new Map(jobs.filter((job) => job.order_id).map((job) => [job.order_id as string, job]));
    const jobByLaundry = new Map(
      jobs.filter((job) => job.laundry_booking_id).map((job) => [job.laundry_booking_id as string, job])
    );

    const orderStops: Stop[] = ((ordersRes.data ?? []) as {
      id: string;
      customer_name: string;
      contact_number: string;
      delivery_address: string;
      landmark: string | null;
      latitude: number | null;
      longitude: number | null;
      status: string;
      payment_settled: boolean | null;
      order_items:
        | {
            product_name: string;
            quantity: number;
            products: { category?: string | null } | { category?: string | null }[] | null;
          }[]
        | null;
    }[]).flatMap((order) => {
      const status = deliveryBucket(order.status);
      if (!status) return [];
      const items = order.order_items ?? [];
      const categories = items.map((item) => {
        const product = Array.isArray(item.products) ? item.products[0] : item.products;
        return product?.category ?? 'water';
      });
      const hasIce = categories.some((category) => category === 'ice');
      const hasOther = categories.some((category) => category !== 'ice');
      const job = jobByOrder.get(order.id);
      const address = `${order.delivery_address ?? ''}${order.landmark ? `, ${order.landmark}` : ''}`.trim();
      return [
        {
          key: `order:${order.id}`,
          jobId: job?.id ?? null,
          assignedToMe: job?.rider_id === user.id,
          sourceKind: 'order' as const,
          sourceId: order.id,
          code: formatSourceReference('order', order.id),
          category: hasIce && hasOther ? 'mixed' : hasIce ? 'ice' : 'water',
          customer: order.customer_name,
          phone: order.contact_number,
          address,
          latitude: order.latitude,
          longitude: order.longitude,
          items: items.map((item) => ({ name: item.product_name, quantity: item.quantity })),
          status,
          fresh: order.status === 'pending',
          paymentSettled: order.payment_settled,
        },
      ];
    });

    const laundryStops: Stop[] = laundryRes.error
      ? []
      : ((laundryRes.data ?? []) as {
          id: string;
          customer_name: string;
          contact_number: string;
          address: string | null;
          latitude: number | null;
          longitude: number | null;
          status: string;
          laundry_booking_items: { service_name: string; quantity: number }[] | null;
        }[]).flatMap((booking) => {
          const status = deliveryBucket(booking.status);
          if (!status) return [];
          const job = jobByLaundry.get(booking.id);
          return [
            {
              key: `laundry:${booking.id}`,
              jobId: job?.id ?? null,
              assignedToMe: job?.rider_id === user.id,
              sourceKind: 'laundry' as const,
              sourceId: booking.id,
              code: formatSourceReference('laundry', booking.id),
              category: 'laundry',
              customer: booking.customer_name,
              phone: booking.contact_number,
              address: booking.address ?? '',
              latitude: booking.latitude,
              longitude: booking.longitude,
              items: (booking.laundry_booking_items ?? []).map((item) => ({
                name: item.service_name,
                quantity: item.quantity,
              })),
              status,
              fresh: booking.status === 'pending',
            },
          ];
        });

    setStops([...orderStops, ...laundryStops]);
    setLoading(false);
  }, [businessId, user]);

  loadRef.current = load;

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  useEffect(() => {
    if (!user?.id || !businessId) return;
    const refresh = () => {
      void loadRef.current();
    };
    const channel = supabase
      .channel(uniqueRealtimeChannelName(`my-deliveries-${businessId}-${user.id}`))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `seller_id=eq.${businessId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'laundry_bookings', filter: `seller_id=eq.${businessId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_jobs', filter: `seller_id=eq.${businessId}` }, refresh)
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [businessId, user?.id]);

  useEffect(() => {
    if (!businessId) return;
    let cancelled = false;
    void supabase
      .from('profiles')
      .select('latitude,longitude')
      .eq('user_id', businessId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || typeof data?.latitude !== 'number' || typeof data?.longitude !== 'number') return;
        setStoreCoords({ lat: data.latitude, lng: data.longitude });
      });
    return () => {
      cancelled = true;
    };
  }, [businessId]);

  const counts = useMemo(
    () => ({
      forDelivery: stops.filter((stop) => stop.status === 'for_delivery' || stop.status === 'in_transit').length,
      delivered: stops.filter((stop) => stop.status === 'delivered').length,
    }),
    [stops]
  );

  const visible = stops.filter((stop) => {
    if (filter === 'for_delivery' && stop.status === 'delivered') return false;
    if (filter === 'delivered' && stop.status !== 'delivered') return false;
    const q = query.trim().toLowerCase();
    if (q && !stop.customer.toLowerCase().includes(q)) return false;
    return true;
  });

  const selectionMode = filter === 'for_delivery';
  const selectedStops = useMemo(
    () => visible.filter((stop) => selectedKeys.has(stop.key)),
    [visible, selectedKeys]
  );
  useEffect(() => {
    if (filter !== 'for_delivery') {
      setSelectedKeys(new Set());
      setBatchStatus(null);
    }
  }, [filter]);

  function toggleSelected(key: string) {
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectAllVisible() {
    setSelectedKeys(new Set(visible.map((stop) => stop.key)));
  }

  function clearSelection() {
    setSelectedKeys(new Set());
    setBatchStatus(null);
  }

  async function applyDeliveryUpdate(stop: Stop, action: 'start' | 'deliver'): Promise<string | null> {
    if (stop.jobId && stop.assignedToMe) {
      const { error: err } = await supabase.rpc('rider_update_delivery', { p_job_id: stop.jobId, p_action: action });
      return err?.message ?? null;
    }
    const next =
      stop.sourceKind === 'laundry'
        ? action === 'start'
          ? 'in_progress'
          : 'completed'
        : action === 'start'
          ? 'on_the_way'
          : 'delivered';
    const { error: err } =
      stop.sourceKind === 'laundry'
        ? await supabase.from('laundry_bookings').update({ status: next }).eq('id', stop.sourceId)
        : await supabase.from('orders').update({ status: next }).eq('id', stop.sourceId);
    return err?.message ?? null;
  }

  async function setStopStatus(stop: Stop, statusKey: BatchStatusKey): Promise<string | null> {
    const next = dbStatusForStop(stop, statusKey);
    if (!next) return `${stop.code}: Status not supported for this type.`;

    if (stop.jobId && stop.assignedToMe) {
      if (statusKey === 'on_the_way') {
        if (stop.status === 'for_delivery') {
          const err = await applyDeliveryUpdate(stop, 'start');
          if (!err) return null;
        } else if (stop.status === 'in_transit') {
          return null;
        }
      }
      if (statusKey === 'delivered') {
        if (stop.status === 'for_delivery') {
          const startErr = await applyDeliveryUpdate(stop, 'start');
          if (startErr) return `${stop.code}: ${startErr}`;
        }
        if (stop.status !== 'delivered') {
          const err = await applyDeliveryUpdate(stop, 'deliver');
          if (!err) return null;
        } else {
          return null;
        }
      }
    }

    const { error: err } =
      stop.sourceKind === 'laundry'
        ? await supabase.from('laundry_bookings').update({ status: next }).eq('id', stop.sourceId)
        : await supabase.from('orders').update({ status: next }).eq('id', stop.sourceId);
    return err ? `${stop.code}: ${err.message}` : null;
  }

  async function batchApplyStatus(statusKey: BatchStatusKey, label: string) {
    const targets = [...selectedStops];
    if (!targets.length) return;
    setBatchBusy(true);
    setError(null);
    const failures: string[] = [];
    for (const stop of targets) {
      const err = await setStopStatus(stop, statusKey);
      if (err) failures.push(err);
    }
    setBatchBusy(false);
    clearSelection();
    await load();
    if (failures.length) {
      setError(`Updated ${targets.length - failures.length} of ${targets.length}. ${failures.slice(0, 2).join(' · ')}`);
    } else {
      Alert.alert('Status updated', `Set ${targets.length} ${targets.length === 1 ? 'order' : 'orders'} to ${label}.`);
    }
  }

  function confirmBatchStatus() {
    if (!batchStatus || !selectedStops.length) return;
    const option = BATCH_STATUS_OPTIONS.find((row) => row.key === batchStatus);
    const label = option?.label ?? batchStatus;
    Alert.alert('Change status', `Set ${selectedStops.length} selected to “${label}”?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Update', onPress: () => void batchApplyStatus(batchStatus, label) },
    ]);
  }

  async function updateDelivery(stop: Stop, action: 'start' | 'deliver') {
    setBusyId(stop.key);
    setError(null);
    const err = await applyDeliveryUpdate(stop, action);
    setBusyId(null);
    if (err) {
      setError(err);
      return;
    }
    await load();
  }

  function openDetails(stop: Stop) {
    if (stop.sourceKind === 'order') {
      router.push(`/order/${stop.sourceId}`);
      return;
    }
    setLaundryDetail(stop);
  }

  const modalStop = laundryDetail;

  return (
    <Screen>
      <KeyboardAwareScrollView
        offset={72}
        contentContainerStyle={{ paddingBottom: selectionMode && selectedStops.length > 0 ? 118 : 120, gap: 8 }}
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
        <SellerScreenHeader title="My Deliveries" subtitle="Search by customer and filter active or completed runs." />
        {error ? (
          <Text weight="bold" style={{ color: theme.colors.danger }}>
            {error}
          </Text>
        ) : null}

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingHorizontal: 14,
            height: 48,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: '#FFFFFF',
          }}
        >
          <Ionicons name="search" size={18} color={theme.colors.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search customer name..."
            placeholderTextColor="#8AA0BB"
            style={{ flex: 1, color: theme.colors.text, fontFamily: theme.font.semibold, fontSize: 14 }}
          />
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'stretch',
            gap: 4,
            padding: 4,
            borderRadius: 14,
            backgroundColor: '#E5F3FC',
            borderWidth: 1,
            borderColor: 'rgba(0,114,240,0.10)',
          }}
        >
          <DeliveryFilterChip
            label={`For delivery (${counts.forDelivery})`}
            active={filter === 'for_delivery'}
            onPress={() => setFilter('for_delivery')}
          />
          <DeliveryFilterChip
            label={`Delivered (${counts.delivered})`}
            active={filter === 'delivered'}
            onPress={() => setFilter('delivered')}
          />
        </View>

        {selectionMode && visible.length > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <Text variant="muted" weight="semibold" style={{ fontSize: 12, flex: 1 }}>
              Select orders, then update status together.
            </Text>
            <Pressable onPress={selectedStops.length === visible.length ? clearSelection : selectAllVisible} hitSlop={8}>
              <Text weight="semibold" style={{ fontSize: 12, color: theme.colors.primary }}>
                {selectedStops.length === visible.length && visible.length > 0 ? 'Clear all' : 'Select all'}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {loading ? <Text variant="muted">Loading your deliveries…</Text> : null}
        {!loading && visible.length === 0 ? (
          <Text variant="muted" weight="semibold">
            {query.trim() ? 'No matching customer.' : 'No deliveries in this list.'}
          </Text>
        ) : null}

        {visible.map((stop) => (
          <DeliveryCard
            key={stop.key}
            stop={stop}
            selectable={selectionMode}
            selected={selectedKeys.has(stop.key)}
            onToggleSelect={() => toggleSelected(stop.key)}
            onViewDetails={() => openDetails(stop)}
          />
        ))}
      </KeyboardAwareScrollView>

      {selectionMode && selectedStops.length > 0 ? (
        <DeliveryBatchStatusBar
          count={selectedStops.length}
          status={batchStatus}
          busy={batchBusy}
          onSelectStatus={setBatchStatus}
          onClear={clearSelection}
          onApply={confirmBatchStatus}
        />
      ) : null}

      <Modal visible={!!modalStop} transparent animationType="fade" onRequestClose={() => setLaundryDetail(null)}>
        <Pressable
          onPress={() => setLaundryDetail(null)}
          style={{ flex: 1, backgroundColor: 'rgba(11,27,58,0.45)', justifyContent: 'center', padding: theme.spacing.md }}
        >
          <Pressable onPress={() => {}} style={{ width: '100%', maxWidth: 420, alignSelf: 'center' }}>
            {modalStop ? (
              <Card style={{ gap: 12 }}>
                <Text variant="h2" weight="extrabold">
                  Laundry delivery
                </Text>
                <Text weight="extrabold" style={{ fontSize: 17 }}>
                  {modalStop.customer}
                </Text>
                <Text weight="bold" style={{ color: theme.colors.primary }}>
                  {modalStop.code}
                </Text>
                <Text variant="muted">{modalStop.address || 'No address'}</Text>
                <Text variant="muted">{itemsLine(modalStop)}</Text>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                  <View style={{ flex: 1 }}>
                    <Button
                      title="Open in Maps"
                      leadingIcon={<Ionicons name="map-outline" size={18} color={theme.colors.onPrimary} />}
                      onPress={() => openMaps(modalStop, storeCoords)}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button variant="ghost" title="Close" onPress={() => setLaundryDetail(null)} />
                  </View>
                </View>
                {modalStop.status === 'for_delivery' ? (
                  <Button
                    title="Start delivery"
                    disabled={busyId === modalStop.key}
                    onPress={() => void updateDelivery(modalStop, 'start').then(() => setLaundryDetail(null))}
                  />
                ) : null}
                {modalStop.status === 'in_transit' ? (
                  <Button
                    title="Mark as delivered"
                    disabled={busyId === modalStop.key}
                    onPress={() => void updateDelivery(modalStop, 'deliver').then(() => setLaundryDetail(null))}
                  />
                ) : null}
              </Card>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

function DeliveryBatchStatusBar({
  count,
  status,
  busy,
  onSelectStatus,
  onClear,
  onApply,
}: {
  count: number;
  status: BatchStatusKey | null;
  busy: boolean;
  onSelectStatus: (key: BatchStatusKey) => void;
  onClear: () => void;
  onApply: () => void;
}) {
  const insets = useSafeAreaInsets();
  const ready = !!status && !busy;

  function handleApplyPress() {
    if (busy) return;
    if (!status) {
      Alert.alert('Choose a status', 'Tap Pending, Confirmed, or another status in the row below, then tap Apply.');
      return;
    }
    onApply();
  }

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 40,
        elevation: 40,
        paddingHorizontal: theme.spacing.md,
        paddingBottom: Math.max(insets.bottom, 8),
      }}
    >
      <View
        style={{
          width: '100%',
          maxWidth: 720,
          alignSelf: 'center',
          paddingHorizontal: 12,
          paddingTop: 10,
          paddingBottom: 10,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: 'rgba(0,114,240,0.1)',
          backgroundColor: 'rgba(255,255,255,0.98)',
          gap: 8,
          shadowColor: '#0B1B3A',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.08,
          shadowRadius: 12,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
            <View
              style={{
                minWidth: 30,
                height: 30,
                paddingHorizontal: 8,
                borderRadius: 10,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(0,114,240,0.08)',
              }}
            >
              <Text weight="semibold" style={{ fontSize: 14, color: theme.colors.primary }}>
                {count}
              </Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text weight="semibold" style={{ fontSize: 14, lineHeight: 17 }} numberOfLines={1}>
                Update status
              </Text>
              <Text variant="muted" style={{ fontSize: 11, lineHeight: 14 }} numberOfLines={1}>
                {count === 1 ? '1 selected' : `${count} selected`}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Pressable
              onPress={handleApplyPress}
              hitSlop={6}
              style={{
                paddingVertical: 8,
                paddingHorizontal: 12,
                borderRadius: 12,
                backgroundColor: ready ? theme.colors.primary : '#E4EDF8',
              }}
            >
              <Text weight="semibold" style={{ fontSize: 13, color: ready ? theme.colors.onPrimary : '#8AA0BB' }}>
                {busy ? '…' : 'Apply'}
              </Text>
            </Pressable>
            <Pressable onPress={onClear} hitSlop={8} style={{ paddingVertical: 8, paddingHorizontal: 6 }}>
              <Text variant="muted" weight="semibold" style={{ fontSize: 12 }}>
                Clear
              </Text>
            </Pressable>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          style={{ flexGrow: 0, marginHorizontal: -2 }}
          contentContainerStyle={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2, paddingHorizontal: 2 }}
        >
          {BATCH_STATUS_OPTIONS.map((option) => {
            const active = status === option.key;
            const iconColor = active ? theme.colors.primary : '#7A92B0';
            return (
              <Pressable
                key={option.key}
                onPress={() => onSelectStatus(option.key)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                  paddingVertical: 6,
                  paddingHorizontal: 10,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: active ? 'rgba(0,114,240,0.35)' : 'rgba(138,160,187,0.28)',
                  backgroundColor: active ? '#FFFFFF' : 'rgba(246,250,254,0.95)',
                }}
              >
                <Ionicons name={batchStatusIcon(option.key)} size={13} color={iconColor} />
                <Text
                  weight={active ? 'semibold' : 'regular'}
                  style={{ fontSize: 12, lineHeight: 15, color: active ? theme.colors.primary : theme.colors.text }}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

function DeliveryFilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        paddingVertical: 10,
        paddingHorizontal: 8,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: active ? 'rgba(0,114,240,0.18)' : 'transparent',
        borderWidth: active ? 1 : 0,
        borderColor: active ? 'rgba(0,114,240,0.28)' : 'transparent',
      }}
    >
      <Text
        weight="semibold"
        numberOfLines={2}
        style={{
          textAlign: 'center',
          fontSize: 12,
          color: active ? theme.colors.primary : theme.colors.muted,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function DeliveryCard({
  stop,
  selectable,
  selected,
  onToggleSelect,
  onViewDetails,
}: {
  stop: Stop;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  onViewDetails: () => void;
}) {
  const meta = categoryMeta(stop.category);
  const badge = statusBadgeMeta(stop.status);
  const place = stop.address.trim() || 'No address';
  const showUnpaid = stop.sourceKind === 'order' && stop.status === 'delivered' && stop.paymentSettled !== true;

  const cardBorder = stop.fresh
    ? { borderWidth: 2, borderColor: 'rgba(229, 72, 77, 0.65)' }
    : stop.status === 'delivered'
      ? { borderWidth: 1.5, borderColor: 'rgba(22, 163, 74, 0.55)' }
      : { borderWidth: 1, borderColor: theme.colors.border };

  return (
    <View
      style={{
        borderRadius: 14,
        ...cardBorder,
        backgroundColor: stop.status === 'delivered' && !stop.fresh ? '#F8FDF9' : '#FFFFFF',
        paddingHorizontal: 11,
        paddingVertical: 10,
        gap: 6,
        shadowColor: '#0B1B3A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
        elevation: 2,
      }}
    >
      {stop.fresh ? (
        <View style={{ position: 'absolute', top: 8, right: 8, zIndex: 2 }}>
          <NewOrderBadge />
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: stop.fresh ? 44 : 0 }}>
        {selectable ? (
          <Pressable
            onPress={onToggleSelect}
            hitSlop={6}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: !!selected }}
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              borderWidth: 2,
              borderColor: selected ? theme.colors.primary : theme.colors.border,
              backgroundColor: selected ? theme.colors.primary : '#FFFFFF',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {selected ? <Ionicons name="checkmark" size={14} color="#FFFFFF" /> : null}
          </Pressable>
        ) : null}
        <View
          style={{
            paddingVertical: 2,
            paddingHorizontal: 7,
            borderRadius: 999,
            backgroundColor: meta.pillBg,
          }}
        >
          <Text weight="bold" style={{ fontSize: 10, color: meta.accent }}>
            {meta.label}
          </Text>
        </View>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 3,
            marginLeft: 'auto',
            paddingVertical: 2,
            paddingHorizontal: 7,
            borderRadius: 999,
            backgroundColor: badge.bg,
          }}
        >
          <Ionicons name={badge.icon} size={11} color={badge.color} />
          <Text weight="extrabold" style={{ fontSize: 9, color: badge.color }}>
            {badge.label}
          </Text>
        </View>
      </View>

      <Text weight="extrabold" style={{ fontSize: 15, lineHeight: 19 }}>
        {stop.code}
      </Text>

      <View style={{ gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Ionicons name="person-outline" size={12} color={theme.colors.muted} />
          <Text weight="semibold" numberOfLines={1} style={{ flex: 1, fontSize: 12 }}>
            {stop.customer}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Ionicons name="location-outline" size={12} color={theme.colors.muted} />
          <Text variant="muted" numberOfLines={1} style={{ flex: 1, fontSize: 11 }}>
            {place}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Ionicons name="cube-outline" size={12} color={theme.colors.muted} />
          <Text variant="muted" numberOfLines={1} style={{ flex: 1, fontSize: 11 }}>
            {itemsLine(stop)}
          </Text>
        </View>
      </View>

      {showUnpaid ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name="alert-circle" size={11} color={theme.colors.danger} />
          <Text weight="bold" style={{ fontSize: 10, color: theme.colors.danger, flex: 1 }}>
            Unpaid — mark paid in order details
          </Text>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 2 }}>
        <Pressable
          onPress={onViewDetails}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 3,
            paddingVertical: 5,
            paddingHorizontal: 10,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: theme.colors.primary,
          }}
        >
          <Text weight="extrabold" style={{ color: theme.colors.primary, fontSize: 11 }}>
            View Details
          </Text>
          <Ionicons name="chevron-forward" size={14} color={theme.colors.primary} />
        </Pressable>
      </View>
    </View>
  );
}