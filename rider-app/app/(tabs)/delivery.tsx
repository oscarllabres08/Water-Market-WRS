import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';

import { formatOrderDistance, orderDistanceKm } from '../../lib/orderDistance';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../providers/AuthProvider';
import { Screen } from '../../ui/components/Screen';
import { Text } from '../../ui/components/Text';
import { Button } from '../../ui/components/Button';
import { NewOrderBadge } from '../../ui/components/NewOrderBadge';
import { SellerScreenHeader } from '../../ui/components/SellerScreenHeader';
import { theme } from '../../ui/theme';

type Tab = 'pending' | 'ongoing' | 'delivered';

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
};

const STATION = 'Ilang-Ilang Road, Andagao, Kalibo, Aklan';

function deliveryCode(kind: 'order' | 'laundry', id: string) {
  return `${kind === 'laundry' ? 'LY' : 'WM'}-${id.replace(/-/g, '').slice(0, 6).toUpperCase()}`;
}

function statusLabel(status: string) {
  if (status === 'for_delivery' || status === 'assigned') return 'For delivery';
  if (status === 'in_transit') return 'In transit';
  if (status === 'delivered') return 'Delivered';
  if (status === 'reassigned') return 'Reassigned';
  if (status === 'cancelled' || status === 'failed') return 'Failed';
  return status;
}

function openMaps(stop: Stop, origin: { lat: number; lng: number } | null) {
  const destination = stop.latitude != null && stop.longitude != null
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

function listStatus(status: string) {
  if (status === 'for_delivery' || status === 'assigned') return 'pending';
  if (status === 'in_transit') return 'on-going';
  if (status === 'delivered') return 'delivered';
  return statusLabel(status).toLowerCase();
}

function deliveryBucket(status: string): Stop['status'] | null {
  if (status === 'cancelled' || status === 'failed') return null;
  if (status === 'delivered' || status === 'completed') return 'delivered';
  if (status === 'on_the_way' || status === 'in_transit' || status === 'in_progress') return 'in_transit';
  return 'for_delivery';
}

export default function DeliveryScreen() {
  const router = useRouter();
  const { user, businessId } = useAuth();
  const [tab, setTab] = useState<Tab>('pending');
  const [query, setQuery] = useState('');
  const [storeCoords, setStoreCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [stops, setStops] = useState<Stop[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user || !businessId) {
      setLoading(false);
      return;
    }
    setError(null);
    const [ordersRes, laundryRes, jobsRes] = await Promise.all([
      supabase
        .from('orders')
        .select('id,customer_name,contact_number,delivery_address,landmark,latitude,longitude,status,order_items(product_name,quantity,products(category))')
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
    const jobByLaundry = new Map(jobs.filter((job) => job.laundry_booking_id).map((job) => [job.laundry_booking_id as string, job]));

    const orderStops: Stop[] = ((ordersRes.data ?? []) as {
      id: string;
      customer_name: string;
      contact_number: string;
      delivery_address: string;
      landmark: string | null;
      latitude: number | null;
      longitude: number | null;
      status: string;
      order_items: { product_name: string; quantity: number; products: { category?: string | null } | { category?: string | null }[] | null }[] | null;
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
      return [{
        key: `order:${order.id}`,
        jobId: job?.id ?? null,
        assignedToMe: job?.rider_id === user.id,
        sourceKind: 'order' as const,
        sourceId: order.id,
        code: deliveryCode('order', order.id),
        category: hasIce && hasOther ? 'mixed' : hasIce ? 'ice' : 'water',
        customer: order.customer_name,
        phone: order.contact_number,
        address,
        latitude: order.latitude,
        longitude: order.longitude,
        items: items.map((item) => ({ name: item.product_name, quantity: item.quantity })),
        status,
        fresh: order.status === 'pending',
      }];
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
          return [{
            key: `laundry:${booking.id}`,
            jobId: job?.id ?? null,
            assignedToMe: job?.rider_id === user.id,
            sourceKind: 'laundry' as const,
            sourceId: booking.id,
            code: deliveryCode('laundry', booking.id),
            category: 'laundry',
            customer: booking.customer_name,
            phone: booking.contact_number,
            address: booking.address ?? '',
            latitude: booking.latitude,
            longitude: booking.longitude,
            items: (booking.laundry_booking_items ?? []).map((item) => ({ name: item.service_name, quantity: item.quantity })),
            status,
            fresh: booking.status === 'pending',
          }];
        });

    setStops([...orderStops, ...laundryStops]);
    setLoading(false);
  }, [businessId, user]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  useEffect(() => {
    if (!user || !businessId) return;
    const channel = supabase
      .channel(`my-deliveries-${businessId}-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `seller_id=eq.${businessId}` }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'laundry_bookings', filter: `seller_id=eq.${businessId}` }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_jobs', filter: `seller_id=eq.${businessId}` }, () => void load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [businessId, load, user]);

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
      pending: stops.filter((stop) => stop.status === 'for_delivery').length,
      ongoing: stops.filter((stop) => stop.status === 'in_transit').length,
      delivered: stops.filter((stop) => stop.status === 'delivered').length,
    }),
    [stops]
  );

  const visible = stops.filter((stop) => {
    if (tab === 'pending' && stop.status !== 'for_delivery') return false;
    if (tab === 'ongoing' && stop.status !== 'in_transit') return false;
    if (tab === 'delivered' && stop.status !== 'delivered') return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      stop.customer.toLowerCase().includes(q) ||
      stop.code.toLowerCase().includes(q) ||
      stop.sourceId.toLowerCase().includes(q) ||
      stop.address.toLowerCase().includes(q)
    );
  });

  async function updateDelivery(stop: Stop, action: 'start' | 'deliver') {
    setBusyId(stop.key);
    setError(null);
    if (stop.jobId && stop.assignedToMe) {
      const { error: err } = await supabase.rpc('rider_update_delivery', { p_job_id: stop.jobId, p_action: action });
      setBusyId(null);
      if (err) {
        setError(err.message);
        return;
      }
      await load();
      return;
    }
    const next = stop.sourceKind === 'laundry'
      ? action === 'start' ? 'in_progress' : 'completed'
      : action === 'start' ? 'on_the_way' : 'delivered';
    const { error: err } = stop.sourceKind === 'laundry'
      ? await supabase.from('laundry_bookings').update({ status: next }).eq('id', stop.sourceId)
      : await supabase.from('orders').update({ status: next }).eq('id', stop.sourceId);
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
        <SellerScreenHeader title="WaterMarket" subtitle="Delivery" />
        <Text variant="muted" weight="semibold" style={{ marginTop: -6, lineHeight: 18 }}>
          Track delivered orders and view customer details, order history, and payment status.
        </Text>
        {error ? <Text weight="bold" style={{ color: theme.colors.danger }}>{error}</Text> : null}

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
          <FilterTab icon="time-outline" label="Pending" count={counts.pending} active={tab === 'pending'} onPress={() => setTab('pending')} />
          <FilterTab icon="car-outline" label="On-going" count={counts.ongoing} active={tab === 'ongoing'} onPress={() => setTab('ongoing')} />
          <FilterTab icon="checkmark" label="Delivered" count={counts.delivered} active={tab === 'delivered'} onPress={() => setTab('delivered')} />
        </View>

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
            placeholder="Search customer name or order ID..."
            placeholderTextColor="#8AA0BB"
            style={{ flex: 1, color: theme.colors.text, fontFamily: theme.font.semibold, fontSize: 14 }}
          />
        </View>

        {loading ? <Text variant="muted">Loading your deliveries…</Text> : null}
        {!loading && visible.length === 0 ? (
          <Text variant="muted" weight="semibold">
            {query.trim() ? 'No matching deliveries.' : 'No deliveries in this list.'}
          </Text>
        ) : null}

        {visible.map((stop) => {
          const km = orderDistanceKm(
            { latitude: stop.latitude, longitude: stop.longitude },
            storeCoords
          );
          const distance = formatOrderDistance(km);
          return (
            <DeliveryCard
              key={stop.key}
              stop={stop}
              distance={distance ? `~ ${distance}` : null}
              busy={busyId === stop.key}
              onOpen={stop.sourceKind === 'order' ? () => router.push(`/order/${stop.sourceId}`) : undefined}
              onMaps={() => openMaps(stop, storeCoords)}
              onStart={() => void updateDelivery(stop, 'start')}
              onDeliver={() => void updateDelivery(stop, 'deliver')}
            />
          );
        })}
      </ScrollView>
    </Screen>
  );
}

function FilterTab({
  icon,
  label,
  count,
  active,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  count: number;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        minWidth: 0,
        paddingVertical: 10,
        paddingHorizontal: 4,
        borderRadius: 11,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        backgroundColor: active ? 'rgba(0,114,240,0.18)' : 'transparent',
        borderWidth: active ? 1 : 0,
        borderColor: active ? 'rgba(0,114,240,0.28)' : 'transparent',
      }}
    >
      <Ionicons name={icon} size={15} color={active ? theme.colors.primary : theme.colors.muted} />
      <Text
        weight="semibold"
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.85}
        style={{ color: active ? theme.colors.primary : theme.colors.muted, fontSize: 12 }}
      >
        {label} ({count})
      </Text>
    </Pressable>
  );
}

function DeliveryCard({
  stop,
  distance,
  busy,
  onOpen,
  onMaps,
  onStart,
  onDeliver,
}: {
  stop: Stop;
  distance: string | null;
  busy: boolean;
  onOpen?: () => void;
  onMaps: () => void;
  onStart: () => void;
  onDeliver: () => void;
}) {
  const pending = stop.status === 'for_delivery';
  const initial = (stop.customer.trim()[0] || 'C').toUpperCase();
  const place = stop.address.trim() || (stop.latitude != null ? `${stop.latitude.toFixed(5)}, ${stop.longitude?.toFixed(5)}` : 'No address');
  return (
    <View
      style={{
        borderRadius: 18,
        borderWidth: pending ? 1.5 : 1,
        borderColor: pending ? 'rgba(229, 72, 77, 0.45)' : theme.colors.border,
        backgroundColor: '#FFFFFF',
        padding: 14,
        gap: 12,
      }}
    >
      <Pressable onPress={onOpen} disabled={!onOpen} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: 21,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#E7F3FF',
          }}
        >
          <Text weight="extrabold" style={{ color: '#0B3A96', fontSize: 16 }}>{initial}</Text>
        </View>
        <View style={{ flex: 1, paddingRight: stop.fresh ? 52 : 8 }}>
          <Text weight="extrabold" style={{ fontSize: 16 }}>{stop.customer}</Text>
          <Text variant="muted" numberOfLines={2} style={{ marginTop: 2, fontSize: 13 }}>{place}</Text>
          <Text weight="bold" style={{ marginTop: 4, color: '#0074F0', fontSize: 13 }}>
            {listStatus(stop.status)}{distance ? `  ·  ${distance}` : ''}
          </Text>
        </View>
        {stop.fresh ? (
          <View style={{ position: 'absolute', top: 0, right: 18 }}>
            <NewOrderBadge />
          </View>
        ) : null}
        <Ionicons name="chevron-forward" size={18} color="#8AA0BB" />
      </Pressable>
      <Pressable
        onPress={onMaps}
        style={{
          height: 44,
          borderRadius: 12,
          borderWidth: 1.5,
          borderColor: '#0074F0',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 8,
        }}
      >
        <Ionicons name="map-outline" size={18} color="#0074F0" />
        <Text weight="extrabold" style={{ color: '#0074F0' }}>Open in Maps</Text>
      </Pressable>
      {pending ? <Button title="Start delivery" disabled={busy} onPress={onStart} /> : null}
      {stop.status === 'in_transit' ? <Button title="Mark as delivered" disabled={busy} onPress={onDeliver} /> : null}
    </View>
  );
}
