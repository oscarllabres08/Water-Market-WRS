import { useCallback, useEffect, useMemo, useState } from 'react';

import { PageHeader } from '../components/PageHeader';
import { StaffAvatar } from '../components/StaffAvatar';
import { useAuth } from '../auth/AuthProvider';
import { money, publicWrsAssetUrl } from '../lib/format';
import { supabase } from '../lib/supabase';

type Filter = 'all' | 'unassigned' | 'for_delivery' | 'in_transit' | 'delivered' | 'cancelled';

type Item = { name: string; quantity: number; unitPrice: number | null; imageUrl: string | null };

type Rider = { user_id: string; display_name: string | null; avatar_path?: string | null };

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
  sourceKind: 'order' | 'laundry' | 'pos';
  sourceId: string;
  code: string;
  category: string;
  customer: string;
  phone: string;
  address: string;
  landmark: string;
  notes: string;
  latitude: number | null;
  longitude: number | null;
  placedAt: string | null;
  sourceLabel: string;
  items: Item[];
  sourceStatus: string;
  orderSource?: string | null;
  walkIn?: boolean;
  job: Job | null;
};

const STATION_ORIGIN = 'Ilang-Ilang Road, Andagao, Kalibo, Aklan';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'unassigned', label: 'Unassigned' },
  { id: 'for_delivery', label: 'For Delivery' },
  { id: 'in_transit', label: 'In Transit' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'cancelled', label: 'Cancelled' },
];

function deliveryCode(kind: 'order' | 'laundry' | 'pos', id: string) {
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

function shownStatus(row: DeliveryRow) {
  if (row.sourceStatus === 'cancelled') return 'cancelled';
  if (row.sourceKind === 'laundry') {
    if (row.sourceStatus === 'completed') return 'delivered';
    if (row.sourceStatus === 'in_progress') return 'on_the_way';
  }
  if (row.sourceStatus) return row.sourceStatus;
  if (row.job?.status) return row.job.status;
  return 'unassigned';
}

function filterBucket(row: DeliveryRow) {
  const status = shownStatus(row);
  const assigned = Boolean(row.job?.rider_id);
  if (status === 'cancelled' || status === 'failed') return 'cancelled';
  if (status === 'delivered' || status === 'completed') return 'delivered';
  if (status === 'on_the_way' || status === 'in_transit' || status === 'in_progress') return 'in_transit';
  if (!assigned && (row.walkIn || row.orderSource === 'pos')) return 'for_delivery';
  if (!assigned) return 'unassigned';
  return 'for_delivery';
}

function cleanNotes(notes: string) {
  return notes.replace(/pin:-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?/g, '').trim();
}

function mapUrl(row: DeliveryRow, origin: string) {
  const match = row.notes.match(/pin:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  const latitude = typeof row.latitude === 'number' && Number.isFinite(row.latitude) ? row.latitude : match ? Number(match[1]) : null;
  const longitude = typeof row.longitude === 'number' && Number.isFinite(row.longitude) ? row.longitude : match ? Number(match[2]) : null;
  const destination = latitude != null && longitude != null ? `${latitude},${longitude}` : row.address.trim();
  if (!destination) return null;
  const params = new URLSearchParams({
    api: '1',
    origin,
    destination,
    travelmode: 'driving',
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function lineItems(
  items: { product_name?: string; service_name?: string; quantity: number; unit_price?: number | null; products?: { category?: string | null; image_url?: string | null } | { category?: string | null; image_url?: string | null }[] | null }[] | null,
) {
  return (items ?? []).map((item) => {
    const product = Array.isArray(item.products) ? item.products[0] : item.products;
    return {
      name: item.product_name ?? item.service_name ?? 'Item',
      quantity: item.quantity,
      unitPrice: item.unit_price == null ? null : Number(item.unit_price),
      imageUrl: product?.image_url ?? null,
      category: product?.category ?? null,
    };
  });
}

function statusLabel(status: string) {
  if (status === 'pending') return 'Pending';
  if (status === 'confirmed') return 'Confirmed';
  if (status === 'preparing') return 'Preparing';
  if (status === 'on_the_way' || status === 'in_transit' || status === 'in_progress') return 'On the way';
  if (status === 'for_delivery') return 'For delivery';
  if (status === 'delivered' || status === 'completed') return 'Delivered';
  if (status === 'cancelled') return 'Cancelled';
  if (status === 'failed') return 'Failed';
  if (status === 'unassigned') return 'Unassigned';
  return status.charAt(0).toUpperCase() + status.slice(1).replaceAll('_', ' ');
}

export function DeliveryManagementPage() {
  const { businessId, user, isStoreOwner } = useAuth();
  const [rows, setRows] = useState<DeliveryRow[]>([]);
  const [riders, setRiders] = useState<Rider[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const [storeOrigin, setStoreOrigin] = useState(STATION_ORIGIN);

  const load = useCallback(async () => {
    if (!businessId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [ordersRes, laundryRes, jobsRes, staffRes, ownerRes, posRes] = await Promise.all([
      supabase
        .from('orders')
        .select('id,customer_name,contact_number,delivery_address,landmark,notes,latitude,longitude,status,order_source,created_at,order_items(product_name,quantity,unit_price,products(category,image_url))')
        .eq('seller_id', businessId)
        .order('created_at', { ascending: false })
        .limit(300),
      supabase
        .from('laundry_bookings')
        .select('id,customer_name,contact_number,address,latitude,longitude,notes,status,created_at,laundry_booking_items(service_name,quantity)')
        .eq('seller_id', businessId)
        .order('created_at', { ascending: false })
        .limit(300),
      supabase.from('delivery_jobs').select('id,source_kind,order_id,laundry_booking_id,business_category,rider_id,status,assigned_at,completed_at').eq('seller_id', businessId),
      supabase
        .from('profiles')
        .select('user_id,display_name,avatar_path')
        .eq('seller_workspace_owner_id', businessId)
        .eq('seller_team_role', 'staff')
        .eq('seller_join_status', 'approved')
        .order('display_name'),
      supabase.from('profiles').select('user_id,display_name').eq('user_id', businessId).maybeSingle(),
      supabase
        .from('pos_sales')
        .select('id,customer_name,delivery_address,delivery_landmark,delivery_order_id,created_at,pos_sale_items(product_name,quantity,unit_price,products(category,image_url))')
        .eq('seller_id', businessId)
        .eq('for_delivery', true)
        .order('created_at', { ascending: false })
        .limit(100),
    ]);

    if (ordersRes.error) setError(ordersRes.error.message);
    else if (jobsRes.error) setError(jobsRes.error.message);
    else setError(null);

    let laundryData: unknown = laundryRes.data;
    if (laundryRes.error) {
      const fallback = await supabase
        .from('laundry_bookings')
        .select('id,customer_name,contact_number,address,status,created_at,notes,laundry_booking_items(service_name,quantity)')
        .eq('seller_id', businessId)
        .order('created_at', { ascending: false })
        .limit(300);
      laundryData = fallback.error ? null : fallback.data;
    }

    const jobs = (jobsRes.data ?? []) as Job[];
    const jobByOrder = new Map(jobs.filter((job) => job.order_id).map((job) => [job.order_id as string, job]));
    const jobByLaundry = new Map(jobs.filter((job) => job.laundry_booking_id).map((job) => [job.laundry_booking_id as string, job]));

    const orderRows: DeliveryRow[] = ((ordersRes.data ?? []) as {
      id: string;
      customer_name: string;
      contact_number: string;
      delivery_address: string;
      landmark: string | null;
      notes: string | null;
      latitude?: number | null;
      longitude?: number | null;
      status: string;
      order_source?: string | null;
      created_at?: string | null;
      order_items: Parameters<typeof lineItems>[0];
    }[])
      .filter((order) => (order.delivery_address ?? '').trim().length > 0 || jobByOrder.has(order.id))
      .map((order) => {
        const items = lineItems(order.order_items);
        const job = jobByOrder.get(order.id) ?? null;
        const category = job?.business_category ?? categoryOfItems(items);
        return {
          key: `order:${order.id}`,
          sourceKind: 'order' as const,
          sourceId: order.id,
          code: deliveryCode('order', order.id),
          category,
          customer: order.customer_name,
          phone: order.contact_number,
          address: order.delivery_address ?? '',
          landmark: order.landmark ?? '',
          notes: order.notes ?? '',
          latitude: typeof order.latitude === 'number' ? order.latitude : null,
          longitude: typeof order.longitude === 'number' ? order.longitude : null,
          placedAt: order.created_at ?? null,
          sourceLabel: order.order_source === 'pos' ? 'Walk-in POS' : order.order_source === 'website' ? 'Website' : 'App',
          items,
          sourceStatus: order.status,
          orderSource: order.order_source ?? null,
          walkIn: order.order_source === 'pos',
          job,
        };
      });

    const laundryRows: DeliveryRow[] = !laundryData
      ? []
      : ((laundryData ?? []) as {
          id: string;
          customer_name: string;
          contact_number: string;
          address: string | null;
          latitude?: number | null;
          longitude?: number | null;
          notes?: string | null;
          status: string;
          created_at?: string | null;
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
            landmark: '',
            notes: booking.notes ?? '',
            latitude: typeof booking.latitude === 'number' ? booking.latitude : null,
            longitude: typeof booking.longitude === 'number' ? booking.longitude : null,
            placedAt: booking.created_at ?? null,
            sourceLabel: 'Laundry',
            items: lineItems(booking.laundry_booking_items),
            sourceStatus: booking.status === 'completed' ? 'delivered' : booking.status,
            job,
          };
        });

    const orderIds = new Set(orderRows.map((row) => row.sourceId));
    const posRows: DeliveryRow[] = posRes.error
      ? []
      : ((posRes.data ?? []) as {
          id: string;
          customer_name: string | null;
          delivery_address: string | null;
          delivery_landmark: string | null;
          delivery_order_id: string | null;
          created_at?: string | null;
          pos_sale_items: Parameters<typeof lineItems>[0];
        }[])
          .filter((sale) => !sale.delivery_order_id || !orderIds.has(sale.delivery_order_id))
          .map((sale) => {
            const items = lineItems(sale.pos_sale_items);
            return {
              key: `pos:${sale.id}`,
              sourceKind: 'pos' as const,
              sourceId: sale.id,
              code: deliveryCode('pos', sale.id),
              category: categoryOfItems(items),
              customer: sale.customer_name?.trim() || 'Walk-in',
              phone: 'Walk-in',
              address: sale.delivery_address ?? '',
              landmark: sale.delivery_landmark ?? '',
              notes: '',
              latitude: null,
              longitude: null,
              placedAt: sale.created_at ?? null,
              sourceLabel: 'Walk-in POS',
              items,
              sourceStatus: 'confirmed',
              walkIn: true,
              job: null,
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
    setRows([...orderRows, ...laundryRows, ...posRows]);
    setLoading(false);
  }, [businessId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!businessId) return;
    let cancelled = false;
    void supabase
      .from('profiles')
      .select('latitude,longitude')
      .eq('user_id', businessId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        if (typeof data?.latitude === 'number' && typeof data?.longitude === 'number') {
          setStoreOrigin(`${data.latitude},${data.longitude}`);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [businessId]);

  useEffect(() => {
    if (!businessId) return;
    const channel = supabase
      .channel(`admin-deliveries-${businessId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_jobs', filter: `seller_id=eq.${businessId}` }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `seller_id=eq.${businessId}` }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pos_sales', filter: `seller_id=eq.${businessId}` }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'laundry_bookings', filter: `seller_id=eq.${businessId}` }, () => void load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [businessId, load]);

  const counts = useMemo(() => {
    const tally: Record<Filter, number> = {
      all: rows.length,
      unassigned: 0,
      for_delivery: 0,
      in_transit: 0,
      delivered: 0,
      cancelled: 0,
    };
    for (const row of rows) {
      const bucket = filterBucket(row) as Exclude<Filter, 'all'>;
      tally[bucket] += 1;
    }
    return tally;
  }, [rows]);

  const visible = useMemo(() => {
    return rows.filter((row) => filter === 'all' || filterBucket(row) === filter);
  }, [filter, rows]);

  const detail = useMemo(() => rows.find((row) => row.key === detailKey) ?? null, [detailKey, rows]);

  useEffect(() => {
    if (!detail) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setDetailKey(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detail]);

  async function assign(row: DeliveryRow, riderId: string) {
    if (!user || !riderId || riderId === row.job?.rider_id) return;
    setSavingKey(row.key);
    setError(null);
    let sourceKind: 'order' | 'laundry' = row.sourceKind === 'laundry' ? 'laundry' : 'order';
    let sourceId = row.sourceId;
    if (row.sourceKind === 'pos') {
      const { data: orderId, error: openErr } = await supabase.rpc('pos_open_walkin_delivery', {
        p_sale_id: row.sourceId,
        p_customer_name: row.customer,
        p_address: row.address.trim(),
        p_landmark: row.landmark.trim(),
        p_payment_method: 'cash',
      });
      if (openErr || !orderId) {
        setSavingKey(null);
        setError(openErr?.message ?? 'Could not open this walk-in delivery.');
        return;
      }
      sourceId = orderId as string;
    }
    const { error: err } = await supabase.rpc('admin_assign_delivery', {
      p_source_kind: sourceKind,
      p_source_id: sourceId,
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
            <span className="delivery-filter-count">{counts[item.id]}</span>
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
                  <th>Customer name</th>
                  <th>Category</th>
                  <th>Address</th>
                  <th>Assigned rider</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const status = shownStatus(row);
                  const locked = status === 'delivered' || status === 'completed' || status === 'cancelled' || status === 'failed' || !isStoreOwner;
                  const rider = riders.find((item) => item.user_id === row.job?.rider_id);
                  const riderName = rider?.display_name || 'Unassigned';
                  return (
                    <tr key={row.key}>
                      <td>
                        <strong>{row.customer}</strong>
                        <div className="muted-block">{row.phone}</div>
                      </td>
                      <td>
                        <span className={`delivery-cat is-${row.category}`}>{categoryLabel(row.category)}</span>
                      </td>
                      <td className="delivery-address-cell">{row.address.trim() || '—'}</td>
                      <td>
                        <div className="delivery-assignee">
                          {row.job?.rider_id ? <StaffAvatar name={riderName} path={rider?.avatar_path} /> : null}
                          {locked ? (
                            <span>{riderName}</span>
                          ) : (
                            <select
                              className="delivery-rider"
                              aria-label={`Assign rider for ${row.customer}`}
                              value={row.job?.rider_id ?? ''}
                              disabled={savingKey === row.key || riders.length === 0}
                              onChange={(event) => void assign(row, event.target.value)}
                            >
                              <option value="">Unassigned</option>
                              {riders.map((item) => (
                                <option key={item.user_id} value={item.user_id}>
                                  {item.display_name || 'Rider'}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className={`delivery-state is-${status}`}>{statusLabel(status)}</span>
                      </td>
                      <td>
                        <button type="button" className="btn btn-ghost btn-sm delivery-details-btn" onClick={() => setDetailKey(row.key)}>
                          Full details
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
      {detail ? <DeliveryDetailModal row={detail} riders={riders} origin={storeOrigin} onClose={() => setDetailKey(null)} /> : null}
    </div>
  );
}

function DeliveryDetailModal({
  row,
  riders,
  origin,
  onClose,
}: {
  row: DeliveryRow;
  riders: Rider[];
  origin: string;
  onClose: () => void;
}) {
  const status = shownStatus(row);
  const riderName = riders.find((item) => item.user_id === row.job?.rider_id)?.display_name || 'Unassigned';
  const noteText = cleanNotes(row.notes);
  const route = mapUrl(row, origin);
  const priced = row.items.some((item) => item.unitPrice != null);
  const total = row.items.reduce((sum, item) => sum + (item.unitPrice ?? 0) * item.quantity, 0);
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-card delivery-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delivery-detail-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="delivery-detail-head">
          <div>
            <h2 id="delivery-detail-title" className="card-title">Order details</h2>
            <p className="muted-block">{row.code}</p>
          </div>
          <span className={`delivery-state is-${status}`}>{statusLabel(status)}</span>
        </div>
        <dl className="delivery-detail-list">
          <div>
            <dt>Customer name</dt>
            <dd>{row.customer}</dd>
          </div>
          <div>
            <dt>Phone</dt>
            <dd>{row.phone || '—'}</dd>
          </div>
          <div>
            <dt>Category</dt>
            <dd>{categoryLabel(row.category)}</dd>
          </div>
          <div>
            <dt>Source</dt>
            <dd>{row.sourceLabel}</dd>
          </div>
          {row.placedAt ? (
            <div>
              <dt>Placed</dt>
              <dd>{new Date(row.placedAt).toLocaleString()}</dd>
            </div>
          ) : null}
          <div>
            <dt>Assigned rider</dt>
            <dd>
              {riderName}
              {row.job?.assigned_at ? <span className="muted-block">Assigned {new Date(row.job.assigned_at).toLocaleString()}</span> : null}
              {row.job?.completed_at ? <span className="muted-block">Done {new Date(row.job.completed_at).toLocaleString()}</span> : null}
            </dd>
          </div>
          <div>
            <dt>Product summary</dt>
            <dd>
              {row.items.length === 0 ? <span className="muted-block">No items</span> : null}
              {row.items.map((item, index) => {
                const photo = publicWrsAssetUrl(supabase, item.imageUrl);
                return (
                  <div key={`${row.key}-${index}`} className="order-item">
                    {photo ? <img className="order-item-photo" src={photo} alt="" /> : <span className="order-item-photo order-item-photo-empty" aria-hidden />}
                    <span>
                      {item.quantity} × {item.name}
                      {item.unitPrice != null ? ` · ${money(item.unitPrice * item.quantity)}` : ''}
                    </span>
                  </div>
                );
              })}
              {priced ? <strong className="delivery-detail-total">Total {money(total)}</strong> : null}
            </dd>
          </div>
          <div>
            <dt>Address</dt>
            <dd>{row.address.trim() || '—'}</dd>
          </div>
          {row.landmark.trim() ? (
            <div>
              <dt>Instruction / landmark</dt>
              <dd>{row.landmark}</dd>
            </div>
          ) : null}
          {noteText ? (
            <div>
              <dt>Notes</dt>
              <dd>{noteText}</dd>
            </div>
          ) : null}
        </dl>
        <div className="delivery-detail-actions">
          {route ? (
            <a className="order-map" href={route} target="_blank" rel="noreferrer">
              Open in map
            </a>
          ) : null}
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
