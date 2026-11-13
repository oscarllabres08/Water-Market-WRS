import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { PageHeader } from '../components/PageHeader';
import { useAuth } from '../auth/AuthProvider';
import { money, publicWrsAssetUrl } from '../lib/format';
import { supabase } from '../lib/supabase';

const STATUSES = ['pending', 'confirmed', 'preparing', 'on_the_way', 'delivered', 'cancelled'] as const;

type Status = (typeof STATUSES)[number];

type ProductSnap = { category: string; image_url?: string | null };

type Item = {
  product_name: string;
  quantity: number;
  unit_price: number;
  products: ProductSnap | ProductSnap[] | null;
};

type OrderRow = {
  id: string;
  customer_name: string;
  contact_number: string;
  delivery_address: string;
  latitude?: number | null;
  longitude?: number | null;
  notes?: string | null;
  status: Status;
  created_at: string;
  order_source: string | null;
  order_items: Item[] | null;
};

const STATION_ORIGIN = 'Ilang-Ilang Road, Andagao, Kalibo, Aklan';

function orderRoute(order: OrderRow, origin: string): string | null {
  const match = (order.notes ?? '').match(/pin:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  const latitude = typeof order.latitude === 'number' && Number.isFinite(order.latitude) ? order.latitude : match ? Number(match[1]) : null;
  const longitude = typeof order.longitude === 'number' && Number.isFinite(order.longitude) ? order.longitude : match ? Number(match[2]) : null;
  const destination = latitude != null && longitude != null ? `${latitude},${longitude}` : (order.delivery_address ?? '').trim();
  if (!destination) return null;
  const params = new URLSearchParams({
    api: '1',
    origin,
    destination,
    travelmode: 'driving',
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function itemProduct(item: Item) {
  const product = item.products;
  if (Array.isArray(product)) return product[0] ?? null;
  return product;
}

function itemCategory(item: Item) {
  return itemProduct(item)?.category ?? '';
}

function statusLabel(status: string) {
  if (status === 'on_the_way') return 'For delivery';
  if (status === 'delivered') return 'Completed';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function StatusMenu({
  value,
  customerName,
  onChange,
}: {
  value: Status;
  customerName: string;
  onChange: (status: Status) => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  useEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const menuHeight = 248;
    const openUp = rect.bottom + menuHeight + 8 > window.innerHeight;
    setPos({
      top: openUp ? Math.max(8, rect.top - menuHeight - 6) : rect.bottom + 6,
      right: Math.max(8, window.innerWidth - rect.right),
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={`order-status-field is-${value}${open ? ' is-open' : ''}`}>
      <button
        ref={buttonRef}
        type="button"
        className="order-status-select"
        aria-label={`Status for ${customerName}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {statusLabel(value)}
      </button>
      <span className="order-status-chevron" aria-hidden />
      {open && pos ? (
        <div ref={panelRef} className="order-status-menu" role="listbox" style={{ top: pos.top, right: pos.right }}>
          {STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              role="option"
              aria-selected={status === value}
              className={`order-status-option is-${status}${status === value ? ' is-current' : ''}`}
              onClick={() => {
                setOpen(false);
                if (status !== value) onChange(status);
              }}
            >
              <span className="order-status-dot" aria-hidden />
              {statusLabel(status)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function OrderBoardPage({ mode }: { mode: 'water' | 'ice' | 'delivery' }) {
  const { businessId } = useAuth();
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<Status | 'all'>(mode === 'delivery' ? 'on_the_way' : 'all');
  const [storeOrigin, setStoreOrigin] = useState(STATION_ORIGIN);

  const load = useCallback(async () => {
    if (!businessId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const select =
      'id,customer_name,contact_number,delivery_address,latitude,longitude,notes,status,created_at,order_source,order_items(product_name,quantity,unit_price,products(category,image_url))';
    let { data, error: err } = await supabase
      .from('orders')
      .select(select)
      .eq('seller_id', businessId)
      .order('created_at', { ascending: false })
      .limit(200);
    if (err) {
      const fallback = await supabase
        .from('orders')
        .select(
          'id,customer_name,contact_number,delivery_address,latitude,longitude,notes,status,created_at,order_source,order_items(product_name,quantity,unit_price)'
        )
        .eq('seller_id', businessId)
        .order('created_at', { ascending: false })
        .limit(200);
      data = fallback.data as typeof data;
      err = fallback.error;
    }
    if (err) setError(err.message);
    else setError(null);
    setRows((data ?? []) as OrderRow[]);
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
      .channel(`admin-orders-${mode}-${businessId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `seller_id=eq.${businessId}` },
        () => void load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [businessId, load, mode]);

  const visible = useMemo(() => {
    return rows.filter((order) => {
      const items = order.order_items ?? [];
      const hasIce = items.some((item) => itemCategory(item) === 'ice');
      const hasWaterStation = items.some((item) => itemCategory(item) !== 'ice');
      if (mode === 'ice' && !hasIce) return false;
      if (mode === 'water' && hasIce && !hasWaterStation) return false;
      if (mode === 'delivery' && !['confirmed', 'preparing', 'on_the_way'].includes(order.status)) return false;
      if (statusFilter !== 'all' && order.status !== statusFilter) return false;
      return true;
    });
  }, [mode, rows, statusFilter]);

  async function updateStatus(id: string, status: Status) {
    const { error: err } = await supabase.from('orders').update({ status }).eq('id', id);
    if (err) {
      setError(err.message);
      return;
    }
    setRows((current) => current.map((row) => (row.id === id ? { ...row, status } : row)));
  }

  const title = mode === 'ice' ? 'Ice Order Management' : mode === 'delivery' ? 'Delivery Management' : 'Water Online Orders';
  const subtitle =
    mode === 'ice'
      ? 'Online and walk-in orders that include ice. Stock stays on the shared inventory.'
      : mode === 'delivery'
        ? 'Orders the rider is preparing or bringing out.'
        : 'Online water and bottled water orders. The rider app receives the same orders.';

  return (
    <div>
      <PageHeader title={title} description={subtitle} />
      {error ? <p className="error-text">{error}</p> : null}
      <div className="pos-category-tabs" role="tablist">
        <button type="button" className={`pos-category-tab${statusFilter === 'all' ? ' active' : ''}`} onClick={() => setStatusFilter('all')}>
          All
        </button>
        {STATUSES.map((status) => (
          <button
            key={status}
            type="button"
            className={`pos-category-tab${statusFilter === status ? ' active' : ''}`}
            onClick={() => setStatusFilter(status)}
          >
            {statusLabel(status)}
          </button>
        ))}
      </div>
      <div className="card card-flat" style={{ marginTop: 16 }}>
        {loading ? <p className="muted-block">Loading orders…</p> : null}
        {!loading && visible.length === 0 ? <p className="muted-block">No online orders in this view.</p> : null}
        {visible.length > 0 ? (
          <div className="sales-table-scroll">
            <table className="data-table orders-board-table">
              <colgroup>
                <col className="orders-col-customer" />
                <col className="orders-col-items" />
                <col className="orders-col-total" />
                <col className="orders-col-source" />
                <col className="orders-col-status" />
              </colgroup>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Source</th>
                  <th className="orders-status-cell">Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((order) => {
                  const items = order.order_items ?? [];
                  const total = items.reduce((sum, item) => sum + Number(item.unit_price) * Number(item.quantity), 0);
                  return (
                    <tr key={order.id}>
                      <td>
                        <strong>{order.customer_name}</strong>
                        <div className="muted-block">{order.contact_number}</div>
                        <div className="muted-block">{order.delivery_address}</div>
                        {orderRoute(order, storeOrigin) ? (
                          <a className="order-map" href={orderRoute(order, storeOrigin) ?? undefined} target="_blank" rel="noreferrer">Open in map</a>
                        ) : null}
                      </td>
                      <td>
                        {items.map((item, index) => {
                          const photo = publicWrsAssetUrl(supabase, itemProduct(item)?.image_url);
                          return (
                            <div key={`${order.id}-${index}`} className="order-item">
                              {photo ? (
                                <img className="order-item-photo" src={photo} alt="" />
                              ) : (
                                <span className="order-item-photo order-item-photo-empty" aria-hidden />
                              )}
                              <span>
                                {item.quantity} × {item.product_name}
                              </span>
                            </div>
                          );
                        })}
                      </td>
                      <td>{money(total)}</td>
                      <td>{order.order_source === 'website' ? 'Website' : 'App'}</td>
                      <td className="orders-status-cell">
                        <div className="order-status">
                          {order.status === 'cancelled' ? <span className="order-tag is-cancelled">Cancelled</span> : null}
                          {order.status === 'delivered' ? <span className="order-tag is-delivered">Delivered</span> : null}
                          <StatusMenu
                            value={order.status}
                            customerName={order.customer_name}
                            onChange={(status) => void updateStatus(order.id, status)}
                          />
                        </div>
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
