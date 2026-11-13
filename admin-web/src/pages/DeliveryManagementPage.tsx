import { useCallback, useEffect, useMemo, useState } from 'react';

import { PageHeader } from '../components/PageHeader';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';

type Filter = 'all' | 'unassigned' | 'for_delivery' | 'in_transit' | 'delivered' | 'cancelled';

type Item = { name: string; quantity: number };

type Rider = { user_id: string; display_name: string | null };

type Job = {
  id: string;
  source_kind: 'order' | 'laundry';
  order_id: string | null;
  laundry_booking_id: string | null;
  business_category: string;
  rider_id: string | null;
  status: string;
  assigned_at: string | null;
  completed_at: string | null;
};

type DeliveryRow = {
  key: string;
  sourceKind: 'order' | 'laundry';
  sourceId: string;
  code: string;
  category: string;
  customer: string;
  phone: string;
  address: string;
  items: Item[];
  sourceStatus: string;
  job: Job | null;
};

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'unassigned', label: 'Unassigned' },
  { id: 'for_delivery', label: 'For Delivery' },
  { id: 'in_transit', label: 'In Transit' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'cancelled', label: 'Cancelled' },
];

function deliveryCode(kind: 'order' | 'laundry', id: string) {
  const prefix = kind === 'laundry' ? 'LY' : 'WM';
  return `${prefix}-${id.replace(/-/g, '').slice(0, 6).toUpperCase()}`;
}

function categoryLabel(category: string) {
  if (category === 'ice') return 'Ice Cubes';
  if (category === 'laundry') return 'Laundry';
  if (category === 'mixed') return 'Water + Ice';
  return 'Water Refilling';
}

function categoryOfItems(items: { category?: string | null }[]) {
  const cats = items.map((item) => item.category ?? 'water');
  const hasIce = cats.some((category) => category === 'ice');
  const hasOther = cats.some((category) => category !== 'ice');
  if (hasIce && hasOther) return 'mixed';
  if (hasIce) return 'ice';
  return 'water';
}

function deliveryStatus(row: DeliveryRow) {
  if (row.sourceStatus === 'cancelled') return 'cancelled';
  if (row.job?.status) return row.job.status;
  if (row.sourceStatus === 'delivered' || row.sourceStatus === 'completed') return 'delivered';
  return 'unassigned';
}

function statusLabel(status: string) {
  if (status === 'for_delivery') return 'For delivery';
  if (status === 'in_transit') return 'In transit';
  if (status === 'unassigned') return 'Unassigned';
  if (status === 'failed') return 'Failed';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function DeliveryManagementPage() {
  const { businessId, user, isStoreOwner } = useAuth();
  const [rows, setRows] = useState<DeliveryRow[]>([]);
  const [riders, setRiders] = useState<Rider[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!businessId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [ordersRes, laundryRes, jobsRes, staffRes, ownerRes] = await Promise.all([
      supabase
        .from('orders')
        .select('id,customer_name,contact_number,delivery_address,status,order_items(product_name,quantity,products(category))')
        .eq('seller_id', businessId)
        .order('created_at', { ascending: false })
        .limit(300),
      supabase
        .from('laundry_bookings')
        .select('id,customer_name,contact_number,address,status,laundry_booking_items(service_name,quantity)')
        .eq('seller_id', businessId)
        .order('created_at', { ascending: false })
        .limit(300),
      supabase.from('delivery_jobs').select('id,source_kind,order_id,laundry_booking_id,business_category,rider_id,status,assigned_at,completed_at').eq('seller_id', businessId),
      supabase
        .from('profiles')
        .select('user_id,display_name')
        .eq('seller_workspace_owner_id', businessId)
        .eq('seller_team_role', 'staff')
        .eq('seller_join_status', 'approved')
        .order('display_name'),
      supabase.from('profiles').select('user_id,display_name').eq('user_id', businessId).maybeSingle(),
    ]);

    if (ordersRes.error) setError(ordersRes.error.message);
    else if (jobsRes.error) setError(jobsRes.error.message);
    else setError(null);

    const jobs = (jobsRes.data ?? []) as Job[];
    const jobByOrder = new Map(jobs.filter((job) => job.order_id).map((job) => [job.order_id as string, job]));
    const jobByLaundry = new Map(jobs.filter((job) => job.laundry_booking_id).map((job) => [job.laundry_booking_id as string, job]));

    const orderRows: DeliveryRow[] = ((ordersRes.data ?? []) as {
      id: string;
      customer_name: string;
      contact_number: string;
      delivery_address: string;
      status: string;
      order_items: { product_name: string; quantity: number; products: { category?: string | null } | { category?: string | null }[] | null }[] | null;
    }[])
      .filter((order) => (order.delivery_address ?? '').trim().length > 0 || jobByOrder.has(order.id))
      .map((order) => {
        const items = order.order_items ?? [];
        const job = jobByOrder.get(order.id) ?? null;
        const category = job?.business_category ?? categoryOfItems(items.map((item) => {
          const product = Array.isArray(item.products) ? item.products[0] : item.products;
          return { category: product?.category };
        }));
        return {
          key: `order:${order.id}`,
          sourceKind: 'order' as const,
          sourceId: order.id,
          code: deliveryCode('order', order.id),
          category,
          customer: order.customer_name,
          phone: order.contact_number,
          address: order.delivery_address,
          items: items.map((item) => ({ name: item.product_name, quantity: item.quantity })),
          sourceStatus: order.status,
          job,
        };
      });

    const laundryRows: DeliveryRow[] = laundryRes.error
      ? []
      : ((laundryRes.data ?? []) as {
          id: string;
          customer_name: string;
          contact_number: string;
          address: string | null;
          status: string;
          laundry_booking_items: { service_name: string; quantity: number }[] | null;
        }[]).map((booking) => {
          const job = jobByLaundry.get(booking.id) ?? null;
          return {
            key: `laundry:${booking.id}`,
            sourceKind: 'laundry' as const,
            sourceId: booking.id,
            code: deliveryCode('laundry', booking.id),
            category: 'laundry',
            customer: booking.customer_name,
            phone: booking.contact_number,
            address: booking.address ?? '',
            items: (booking.laundry_booking_items ?? []).map((item) => ({ name: item.service_name, quantity: item.quantity })),
            sourceStatus: booking.status === 'completed' ? 'delivered' : booking.status,
            job,
          };
        });

    const riderRows = (staffRes.data ?? []) as Rider[];
    if (ownerRes.data?.user_id) {
      riderRows.unshift({
        user_id: ownerRes.data.user_id,
        display_name: ownerRes.data.display_name ? `${ownerRes.data.display_name} (admin)` : 'Store admin',
      });
    }
    const seen = new Set<string>();
    setRiders(riderRows.filter((rider) => (seen.has(rider.user_id) ? false : (seen.add(rider.user_id), true))));
    setRows([...orderRows, ...laundryRows]);
    setLoading(false);
  }, [businessId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!businessId) return;
    const channel = supabase
      .channel(`admin-deliveries-${businessId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_jobs', filter: `seller_id=eq.${businessId}` }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `seller_id=eq.${businessId}` }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'laundry_bookings', filter: `seller_id=eq.${businessId}` }, () => void load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [businessId, load]);

  const visible = useMemo(() => {
    return rows.filter((row) => {
      const status = deliveryStatus(row);
      if (filter === 'all') return true;
      if (filter === 'cancelled') return status === 'cancelled' || status === 'failed';
      return status === filter;
    });
  }, [filter, rows]);

  async function assign(row: DeliveryRow, riderId: string) {
    if (!user || !riderId || riderId === row.job?.rider_id) return;
    setSavingKey(row.key);
    setError(null);
    const { error: err } = await supabase.rpc('admin_assign_delivery', {
      p_source_kind: row.sourceKind,
      p_source_id: row.sourceId,
      p_rider_id: riderId,
    });
    setSavingKey(null);
    if (err) {
      setError(err.message);
      return;
    }
    await load();
  }

  return (
    <div>
      <PageHeader
        title="Delivery Management"
        description="Assign water, ice, and laundry deliveries to a rider. Status updates from the rider app appear here on their own."
      />
      {error ? <p className="error-text">{error}</p> : null}
      <div className="pos-category-tabs" role="tablist">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`pos-category-tab${filter === item.id ? ' active' : ''}`}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="card card-flat" style={{ marginTop: 16 }}>
        {loading ? <p className="muted-block">Loading deliveries…</p> : null}
        {!loading && visible.length === 0 ? <p className="muted-block">No deliveries in this view.</p> : null}
        {visible.length > 0 ? (
          <div className="sales-table-scroll">
            <table className="data-table orders-board-table delivery-board-table">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Category</th>
                  <th>Customer</th>
                  <th>Products</th>
                  <th>Assigned rider</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const status = deliveryStatus(row);
                  const locked = status === 'delivered' || status === 'cancelled' || status === 'failed' || !isStoreOwner;
                  const riderName = riders.find((rider) => rider.user_id === row.job?.rider_id)?.display_name || 'Unassigned';
                  return (
                    <tr key={row.key}>
                      <td>
                        <strong>{row.code}</strong>
                        {row.job?.completed_at ? (
                          <div className="muted-block">Done {new Date(row.job.completed_at).toLocaleString()}</div>
                        ) : row.job?.assigned_at ? (
                          <div className="muted-block">Assigned {new Date(row.job.assigned_at).toLocaleString()}</div>
                        ) : null}
                      </td>
                      <td>
                        <span className={`delivery-cat is-${row.category}`}>{categoryLabel(row.category)}</span>
                      </td>
                      <td>
                        <strong>{row.customer}</strong>
                        <div className="muted-block">{row.phone}</div>
                        {row.address ? <div className="muted-block">{row.address}</div> : null}
                      </td>
                      <td>
                        {row.items.length === 0 ? <span className="muted-block">No items</span> : null}
                        {row.items.map((item, index) => (
                          <div key={`${row.key}-${index}`} className="order-item">
                            <span>{item.quantity} × {item.name}</span>
                          </div>
                        ))}
                      </td>
                      <td>
                        {locked ? (
                          <span>{riderName}</span>
                        ) : (
                          <select
                            className="delivery-rider"
                            aria-label={`Assign rider for ${row.code}`}
                            value={row.job?.rider_id ?? ''}
                            disabled={savingKey === row.key || riders.length === 0}
                            onChange={(event) => void assign(row, event.target.value)}
                          >
                            <option value="">Unassigned</option>
                            {riders.map((rider) => (
                              <option key={rider.user_id} value={rider.user_id}>
                                {rider.display_name || 'Rider'}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td>
                        <span className={`delivery-state is-${status}`}>{statusLabel(status)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}
