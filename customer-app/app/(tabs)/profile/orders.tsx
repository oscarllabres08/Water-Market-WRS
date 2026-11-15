import { useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useAuth } from '../../../providers/AuthProvider';
import { supabase } from '../../../lib/supabase';
import { Screen } from '../../../ui/components/Screen';
import { Card } from '../../../ui/components/Card';
import { Text } from '../../../ui/components/Text';
import { Skeleton } from '../../../ui/components/Skeleton';
import { theme } from '../../../ui/theme';

type OrderRow = {
  id: string;
  status: string;
  created_at: string;
  customer_name: string;
  delivery_address: string;
};

function statusLabel(s: string) {
  if (s === 'pending') return 'Pending';
  if (s === 'confirmed') return 'Confirmed';
  if (s === 'preparing') return 'Preparing';
  if (s === 'on_the_way') return 'On the way';
  if (s === 'delivered') return 'Delivered';
  if (s === 'cancelled') return 'Cancelled';
  return s;
}

type OrderFilter = 'all' | 'active' | 'delivered';

const PAGE_SIZE = 10;

export default function MyOrdersScreen() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<OrderFilter>('all');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  async function load() {
    if (authLoading) return;
    if (!user) return;
    setErr(null);
    setLoading(true);
    const { data, error } = await supabase
      .from('orders')
      .select('id,status,created_at,customer_name,delivery_address')
      .eq('customer_id', user.id)
      .order('created_at', { ascending: false });
    if (error) setErr(error.message);
    setRows((data ?? []) as OrderRow[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, authLoading]);

  const active = useMemo(() => rows.filter((r) => r.status !== 'delivered'), [rows]);
  const delivered = useMemo(() => rows.filter((r) => r.status === 'delivered'), [rows]);
  const filtered = useMemo(() => {
    if (filter === 'active') return active;
    if (filter === 'delivered') return delivered;
    return rows;
  }, [active, delivered, filter, rows]);
  const shown = filtered.slice(0, visibleCount);
  const hasMore = filtered.length > shown.length;
  const shownActive = shown.filter((r) => r.status !== 'delivered');
  const shownDelivered = shown.filter((r) => r.status === 'delivered');

  return (
    <Screen style={{ padding: 0 }} safeAreaEdges={['left', 'right']}>
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
        contentContainerStyle={{ padding: theme.spacing.md, paddingBottom: theme.spacing.xl }}
      >
        <Text variant="muted" style={{ marginBottom: theme.spacing.sm }}>
          {filter === 'all'
            ? 'Active and delivered orders.'
            : filter === 'active'
              ? 'Orders still in progress.'
              : 'Completed deliveries.'}
        </Text>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: theme.spacing.md }}>
          {(
            [
              { key: 'all' as const, label: 'All' },
              { key: 'active' as const, label: 'Active' },
              { key: 'delivered' as const, label: 'Delivered' },
            ] as const
          ).map((opt) => {
            const selected = filter === opt.key;
            const count =
              opt.key === 'all'
                ? rows.length
                : opt.key === 'active'
                  ? active.length
                  : delivered.length;
            return (
              <Pressable
                key={opt.key}
                onPress={() => {
                  setFilter(opt.key);
                  setVisibleCount(PAGE_SIZE);
                }}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: selected ? theme.colors.primary : theme.colors.border,
                  backgroundColor: selected ? theme.colors.primary : '#fff',
                }}
              >
                <Text weight="semibold" style={{ color: selected ? '#fff' : theme.colors.text }}>
                  {opt.label}
                  {!loading ? ` (${count})` : ''}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {err ? (
          <Card style={{ marginTop: theme.spacing.md }}>
            <Text weight="bold" style={{ color: theme.colors.danger }}>
              {err}
            </Text>
          </Card>
        ) : null}

        {(filter === 'all' || filter === 'active') && (loading || filter === 'active' || shownActive.length > 0) ? (
          <Card style={{ marginTop: theme.spacing.md }}>
            <Text variant="h2" weight="semibold">
              Active
            </Text>
            {loading ? (
              <View style={{ marginTop: 12, gap: 10 }}>
                <Skeleton height={74} width="100%" radius={16} />
                <Skeleton height={74} width="100%" radius={16} />
              </View>
            ) : shownActive.length === 0 ? (
              <Text variant="muted" style={{ marginTop: 10 }}>
                No active orders.
              </Text>
            ) : (
              <View style={{ marginTop: 10, gap: 10 }}>
                {shownActive.map((o) => (
                  <OrderRowCard key={o.id} row={o} onPress={() => router.push(`/order/${o.id}`)} />
                ))}
              </View>
            )}
          </Card>
        ) : null}

        {(filter === 'all' || filter === 'delivered') && (loading || filter === 'delivered' || shownDelivered.length > 0) ? (
          <Card style={{ marginTop: filter === 'delivered' ? theme.spacing.md : theme.spacing.sm }}>
            <Text variant="h2" weight="semibold">
              Delivered
            </Text>
            {loading ? (
              <View style={{ marginTop: 12, gap: 10 }}>
                <Skeleton height={74} width="100%" radius={16} />
                <Skeleton height={74} width="100%" radius={16} />
              </View>
            ) : shownDelivered.length === 0 ? (
              <Text variant="muted" style={{ marginTop: 10 }}>
                No delivered orders yet.
              </Text>
            ) : (
              <View style={{ marginTop: 10, gap: 10 }}>
                {shownDelivered.map((o) => (
                  <OrderRowCard key={o.id} row={o} onPress={() => router.push(`/order/${o.id}`)} />
                ))}
              </View>
            )}
          </Card>
        ) : null}

        {!loading && hasMore ? (
          <Pressable
            onPress={() => setVisibleCount((count) => count + PAGE_SIZE)}
            style={{
              marginTop: theme.spacing.md,
              paddingVertical: 12,
              paddingHorizontal: 14,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: '#fff',
              alignItems: 'center',
            }}
          >
            <Text weight="semibold" style={{ color: theme.colors.primary }}>
              Show more
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function OrderRowCard({ row, onPress }: { row: OrderRow; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.90)',
        padding: 12,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text weight="semibold">{row.customer_name || 'Order'}</Text>
          <Text variant="muted" style={{ marginTop: 2 }}>
            {new Date(row.created_at).toLocaleString()}
          </Text>
          <Text variant="muted" style={{ marginTop: 2 }}>
            {row.delivery_address}
          </Text>
        </View>
        <View
          style={{
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: 'rgba(0,114,240,0.06)',
          }}
        >
          <Text variant="chip" weight="semibold" style={{ color: 'rgba(7,20,46,0.8)' }}>
            {statusLabel(row.status)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

