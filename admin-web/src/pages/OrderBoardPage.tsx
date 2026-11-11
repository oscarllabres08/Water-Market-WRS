import { useCallback, useEffect, useMemo, useState } from 'react';

import { PageHeader } from '../components/PageHeader';
import { useAuth } from '../auth/AuthProvider';
import { money } from '../lib/format';
import { supabase } from '../lib/supabase';

const STATUSES = ['pending', 'confirmed', 'preparing', 'on_the_way', 'delivered', 'cancelled'] as const;

type Status = (typeof STATUSES)[number];

type Item = {
  product_name: string;
  quantity: number;
  unit_price: number;
  products: { category: string } | { category: string }[] | null;
};

type OrderRow = {
  id: string;
  customer_name: string;
  contact_number: string;
  delivery_address: string;
  status: Status;
  created_at: string;
  order_source: string | null;
  order_items: Item[] | null;
};

function itemCategory(item: Item) {
  const product = item.products;
  if (Array.isArray(product)) return product[0]?.category ?? '';
  return product?.category ?? '';
}

function statusLabel(status: string) {
  if (status === 'on_the_way') return 'For delivery';
  if (status === 'delivered') return 'Completed';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function OrderBoardPage({ mode }: { mode: 'water' | 'ice' | 'delivery' }) {
  const { businessId } = useAuth();
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<Status | 'all'>(mode === 'delivery' ? 'on_the_way' : 'all');

  const load = useCallback(async () => {
    if (!businessId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error: err } = await supabase
      .from('orders')
      .select(
        'id,customer_name,contact_number,delivery_address,status,created_at,order_source,order_items(product_name,quantity,unit_price,products(category))'
      )
      .eq('seller_id', businessId)
      .order('created_at', { ascending: false })
      .limit(200);
    if (err) setError(err.message);
    setRows((data ?? []) as OrderRow[]);
    setLoading(false);
  }, [businessId]);

  useEffect(() => {
    void load();
  }, [load]);

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

  const title = mode === 'ice' ? 'Ice Order Management' : mode === 'delivery' ? 'Delivery Management' : 'Water Orders';
  const subtitle =
    mode === 'ice'
      ? 'Online and walk-in orders that include ice. Stock stays on the shared inventory.'
      : mode === 'delivery'
        ? 'Orders the rider is preparing or bringing out.'
        : 'Station orders that are not ice-only.';

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
        {!loading && visible.length === 0 ? <p className="muted-block">No orders in this view.</p> : null}
        {visible.length > 0 ? (
          <div className="sales-table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Source</th>
                  <th>Status</th>
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
                      </td>
                      <td>
                        {items.map((item, index) => (
                          <div key={`${order.id}-${index}`}>
                            {item.quantity} × {item.product_name}
                          </div>
                        ))}
                      </td>
                      <td>{money(total)}</td>
                      <td>{order.order_source === 'website' ? 'Website' : 'App'}</td>
                      <td>
                        <select
                          value={order.status}
                          aria-label={`Status for ${order.customer_name}`}
                          onChange={(event) => void updateStatus(order.id, event.target.value as Status)}
                        >
                          {STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {statusLabel(status)}
                            </option>
                          ))}
                        </select>
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
