import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ConfirmModal } from '../components/ConfirmModal';
import { StaffAvatar } from '../components/StaffAvatar';
import { PageHeader } from '../components/PageHeader';
import { useAuth } from '../auth/AuthProvider';
import { accountKind, loadWorkspaceStaff, type WorkspaceStaff } from '../lib/workspaceStaff';
import { supabase } from '../lib/supabase';

type HistoryRow = {
  id: string;
  job_id: string;
  assigned_at: string;
  started_at: string | null;
  completed_at: string | null;
  released_at: string | null;
  status: string;
  customer_name: string;
  business_category: string;
  items_summary: string;
};

type JobRow = {
  id: string;
  source_kind: 'order' | 'laundry';
  order_id: string | null;
  laundry_booking_id: string | null;
  business_category: string;
  status: string;
  assigned_at: string | null;
  started_at: string | null;
  completed_at: string | null;
};

type DeliveryDetail = {
  id: string;
  code: string;
  category: string;
  customer: string;
  phone: string;
  address: string;
  items: { name: string; quantity: number }[];
  status: string;
  assignedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
};

function deliveryCode(kind: 'order' | 'laundry', id: string) {
  return `${kind === 'laundry' ? 'LY' : 'WM'}-${id.replace(/-/g, '').slice(0, 6).toUpperCase()}`;
}

function categoryLabel(category: string) {
  if (category === 'ice') return 'Ice Cubes';
  if (category === 'laundry') return 'Laundry';
  if (category === 'mixed') return 'Water + Ice';
  return 'Water Refilling';
}

function statusClass(status: string) {
  if (status === 'assigned' || status === 'for_delivery') return 'for_delivery';
  if (status === 'reassigned') return 'unassigned';
  return status;
}

function statusLabel(status: string) {
  if (status === 'assigned' || status === 'for_delivery') return 'For delivery';
  if (status === 'in_transit') return 'In transit';
  if (status === 'delivered') return 'Delivered';
  if (status === 'reassigned') return 'Reassigned';
  if (status === 'cancelled') return 'Cancelled';
  if (status === 'failed') return 'Failed';
  return status;
}

function parseItems(summary: string) {
  return summary
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const match = /^(\d+)\s+x\s+(.+)$/i.exec(part);
      if (!match) return { name: part, quantity: 1 };
      return { quantity: Number(match[1]), name: match[2] };
    });
}

function when(iso: string | null) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '—';
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function DeliveryGroup({ title, rows }: { title: string; rows: DeliveryDetail[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="rider-history-group">
      <h3>{title}</h3>
      <ul className="rider-delivery-list">
        {rows.map((delivery) => (
          <li key={delivery.id} className="rider-delivery">
            <div className="rider-delivery-top">
              <strong>{delivery.code}</strong>
              <span className={`delivery-cat is-${delivery.category}`}>{categoryLabel(delivery.category)}</span>
              <span className={`delivery-state is-${statusClass(delivery.status)}`}>{statusLabel(delivery.status)}</span>
              <time className="rider-delivery-when" dateTime={delivery.completedAt ?? delivery.assignedAt ?? undefined}>
                {delivery.status === 'delivered' ? when(delivery.completedAt) : `Assigned ${when(delivery.assignedAt)}`}
              </time>
            </div>
            <p>
              <span>Customer</span> {delivery.customer}
            </p>
            <p>
              <span>Phone</span> {delivery.phone || '—'}
            </p>
            <p>
              <span>Address</span> {delivery.address || '—'}
            </p>
            <p>
              <span>Products</span>{' '}
              {delivery.items.length ? delivery.items.map((item) => `${item.quantity} × ${item.name}`).join(', ') : '—'}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function StaffPage() {
  const { user, businessId, isStoreOwner } = useAuth();
  const [riders, setRiders] = useState<WorkspaceStaff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeRiderIds, setActiveRiderIds] = useState<Set<string>>(new Set());
  const [deliveries, setDeliveries] = useState<DeliveryDetail[]>([]);
  const [deliveriesLoading, setDeliveriesLoading] = useState(false);
  const [deliveriesError, setDeliveriesError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [removeTarget, setRemoveTarget] = useState<WorkspaceStaff | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const listReady = useRef(false);

  const load = useCallback(async () => {
    if (!user?.id || !businessId) {
      setLoading(false);
      return;
    }
    if (!listReady.current) setLoading(true);
    const result = await loadWorkspaceStaff(businessId);
    const approvedRiders = result.rows.filter((row) => row.seller_join_status === 'approved' && accountKind(row) === 'rider');
    setRiders(approvedRiders);
    setError(result.error ?? result.notice);
    setSelectedId((current) => (current && approvedRiders.some((row) => row.user_id === current) ? current : null));
    const jobsRes = await supabase
      .from('delivery_jobs')
      .select('rider_id,status,order_id,laundry_booking_id')
      .eq('seller_id', businessId)
      .in('status', ['for_delivery', 'in_transit']);
    const openJobs = (jobsRes.data ?? []) as {
      rider_id: string | null;
      status: string;
      order_id: string | null;
      laundry_booking_id: string | null;
    }[];
    const orderIds = [...new Set(openJobs.map((job) => job.order_id).filter((id): id is string => Boolean(id)))];
    const bookingIds = [...new Set(openJobs.map((job) => job.laundry_booking_id).filter((id): id is string => Boolean(id)))];
    const [openOrders, openBookings] = await Promise.all([
      orderIds.length
        ? supabase.from('orders').select('id,status').in('id', orderIds)
        : Promise.resolve({ data: [] as { id: string; status: string }[] }),
      bookingIds.length
        ? supabase.from('laundry_bookings').select('id,status').in('id', bookingIds)
        : Promise.resolve({ data: [] as { id: string; status: string }[] }),
    ]);
    const closedOrders = new Set(
      ((openOrders.data ?? []) as { id: string; status: string }[])
        .filter((order) => order.status === 'delivered' || order.status === 'cancelled')
        .map((order) => order.id)
    );
    const closedBookings = new Set(
      ((openBookings.data ?? []) as { id: string; status: string }[])
        .filter((booking) => booking.status === 'completed' || booking.status === 'cancelled')
        .map((booking) => booking.id)
    );
    setActiveRiderIds(
      new Set(
        openJobs
          .filter((job) => {
            if (!job.rider_id) return false;
            if (job.order_id && closedOrders.has(job.order_id)) return false;
            if (job.laundry_booking_id && closedBookings.has(job.laundry_booking_id)) return false;
            return true;
          })
          .map((job) => job.rider_id as string)
      )
    );
    listReady.current = true;
    setLoading(false);
  }, [user?.id, businessId]);

  const loadDeliveries = useCallback(
    async (riderId: string) => {
      if (!businessId) return;
      setDeliveriesLoading(true);
      setDeliveriesError(null);
      const [historyRes, jobsRes] = await Promise.all([
        supabase
          .from('delivery_assignment_history')
          .select('id,job_id,assigned_at,started_at,completed_at,released_at,status,customer_name,business_category,items_summary')
          .eq('seller_id', businessId)
          .eq('rider_id', riderId)
          .order('assigned_at', { ascending: false })
          .limit(40),
        supabase
          .from('delivery_jobs')
          .select('id,source_kind,order_id,laundry_booking_id,business_category,status,assigned_at,started_at,completed_at')
          .eq('seller_id', businessId)
          .eq('rider_id', riderId),
      ]);

      if (historyRes.error && jobsRes.error) {
        const missing = `${historyRes.error.message} ${jobsRes.error.message}`.includes('delivery_');
        setDeliveries([]);
        setDeliveriesError(
          missing
            ? 'Delivery history is not ready yet. Run supabase/migrations/0010_delivery_management.sql in the Supabase SQL Editor.'
            : historyRes.error.message
        );
        setDeliveriesLoading(false);
        return;
      }

      const history = (historyRes.data ?? []) as HistoryRow[];
      const jobs = (jobsRes.data ?? []) as JobRow[];
      const jobsById = new Map(jobs.map((job) => [job.id, job]));
      const orderIds = [...new Set(jobs.map((job) => job.order_id).filter((id): id is string => Boolean(id)))];
      const bookingIds = [...new Set(jobs.map((job) => job.laundry_booking_id).filter((id): id is string => Boolean(id)))];

      const [ordersRes, laundryRes] = await Promise.all([
        orderIds.length
          ? supabase
              .from('orders')
              .select('id,customer_name,contact_number,delivery_address,status,updated_at,order_items(product_name,quantity)')
              .in('id', orderIds)
          : Promise.resolve({ data: [] as never[], error: null }),
        bookingIds.length
          ? supabase
              .from('laundry_bookings')
              .select('id,customer_name,contact_number,address,status,updated_at,service_summary,laundry_booking_items(service_name,quantity)')
              .in('id', bookingIds)
          : Promise.resolve({ data: [] as never[], error: null }),
      ]);

      const orders = new Map(
        ((ordersRes.data ?? []) as {
          id: string;
          customer_name: string | null;
          contact_number: string | null;
          delivery_address: string | null;
          status: string;
          updated_at: string | null;
          order_items: { product_name: string; quantity: number }[] | null;
        }[]).map((order) => [order.id, order])
      );
      const bookings = new Map(
        ((laundryRes.data ?? []) as {
          id: string;
          customer_name: string | null;
          contact_number: string | null;
          address: string | null;
          status: string;
          updated_at: string | null;
          service_summary: string | null;
          laundry_booking_items: { service_name: string; quantity: number }[] | null;
        }[]).map((booking) => [booking.id, booking])
      );

      function deliveredStamp(
        rowStatus: string,
        completedAt: string | null,
        sourceStatus: string | undefined,
        sourceUpdatedAt: string | null | undefined
      ) {
        const delivered = rowStatus === 'delivered' || sourceStatus === 'delivered' || sourceStatus === 'completed';
        return {
          status: delivered ? 'delivered' : rowStatus,
          completedAt: completedAt || (delivered ? sourceUpdatedAt ?? null : null),
        };
      }

      const seenJobs = new Set<string>();
      const details: DeliveryDetail[] = history.map((row) => {
        seenJobs.add(row.job_id);
        const job = jobsById.get(row.job_id);
        const order = job?.order_id ? orders.get(job.order_id) : undefined;
        const booking = job?.laundry_booking_id ? bookings.get(job.laundry_booking_id) : undefined;
        const liveItems = order?.order_items?.map((item) => ({ name: item.product_name, quantity: item.quantity }))
          ?? booking?.laundry_booking_items?.map((item) => ({ name: item.service_name, quantity: item.quantity }))
          ?? [];
        const sourceId = job?.order_id ?? job?.laundry_booking_id ?? row.job_id;
        const kind = job?.source_kind ?? (row.business_category === 'laundry' ? 'laundry' : 'order');
        const stamp = deliveredStamp(
          job?.status === 'in_transit' ? 'in_transit' : row.status,
          row.completed_at,
          order?.status ?? booking?.status,
          order?.updated_at ?? booking?.updated_at
        );
        return {
          id: row.id,
          code: deliveryCode(kind, sourceId),
          category: row.business_category || job?.business_category || 'water',
          customer: order?.customer_name || booking?.customer_name || row.customer_name || 'Customer',
          phone: order?.contact_number || booking?.contact_number || '',
          address: order?.delivery_address || booking?.address || '',
          items: liveItems.length ? liveItems : parseItems(row.items_summary || booking?.service_summary || ''),
          status: stamp.status,
          assignedAt: row.assigned_at,
          startedAt: row.started_at,
          completedAt: stamp.completedAt,
        };
      });

      for (const job of jobs) {
        if (seenJobs.has(job.id)) continue;
        const order = job.order_id ? orders.get(job.order_id) : undefined;
        const booking = job.laundry_booking_id ? bookings.get(job.laundry_booking_id) : undefined;
        const sourceId = job.order_id ?? job.laundry_booking_id ?? job.id;
        const stamp = deliveredStamp(
          job.status === 'for_delivery' ? 'assigned' : job.status,
          job.completed_at,
          order?.status ?? booking?.status,
          order?.updated_at ?? booking?.updated_at
        );
        details.push({
          id: job.id,
          code: deliveryCode(job.source_kind, sourceId),
          category: job.business_category,
          customer: order?.customer_name || booking?.customer_name || 'Customer',
          phone: order?.contact_number || booking?.contact_number || '',
          address: order?.delivery_address || booking?.address || '',
          items:
            order?.order_items?.map((item) => ({ name: item.product_name, quantity: item.quantity }))
            ?? booking?.laundry_booking_items?.map((item) => ({ name: item.service_name, quantity: item.quantity }))
            ?? (booking?.service_summary ? parseItems(booking.service_summary) : []),
          status: stamp.status,
          assignedAt: job.assigned_at,
          startedAt: job.started_at,
          completedAt: stamp.completedAt,
        });
      }

      details.sort((a, b) => new Date(b.completedAt ?? b.assignedAt ?? 0).getTime() - new Date(a.completedAt ?? a.assignedAt ?? 0).getTime());
      setDeliveries(details);
      setDeliveriesLoading(false);
    },
    [businessId]
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!businessId) return;
    const channel = supabase
      .channel(`rider-duty-${businessId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_jobs', filter: `seller_id=eq.${businessId}` }, () => {
        void load();
        if (selectedId) void loadDeliveries(selectedId);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `seller_id=eq.${businessId}` }, () => {
        void load();
        if (selectedId) void loadDeliveries(selectedId);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [businessId, load, loadDeliveries, selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setDeliveries([]);
      return;
    }
    void loadDeliveries(selectedId);
  }, [selectedId, loadDeliveries]);

  useEffect(() => {
    if (!selectedId || removeTarget) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setSelectedId(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, removeTarget]);

  const selected = useMemo(() => riders.find((row) => row.user_id === selectedId) ?? null, [riders, selectedId]);
  const visibleRiders = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return riders;
    return riders.filter((rider) => (rider.display_name?.trim() || 'Unnamed rider').toLowerCase().includes(q));
  }, [query, riders]);
  const assigned = useMemo(
    () => deliveries.filter((delivery) => delivery.status === 'assigned' || delivery.status === 'for_delivery' || delivery.status === 'in_transit'),
    [deliveries]
  );
  const delivered = useMemo(() => deliveries.filter((delivery) => delivery.status === 'delivered'), [deliveries]);

  async function confirmRemove() {
    if (!removeTarget) return;
    setBusyId(removeTarget.user_id);
    setError(null);
    try {
      const { data, error: delErr } = await supabase.rpc('owner_delete_staff_account', {
        p_staff_user_id: removeTarget.user_id,
      });
      if (delErr) throw delErr;
      const res = data as { ok?: boolean; message?: string; error?: string } | null;
      if (res && res.ok === false) throw new Error(res.message ?? res.error ?? 'Delete failed');
      if (selectedId === removeTarget.user_id) setSelectedId(null);
      setRemoveTarget(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setBusyId(null);
    }
  }

  if (!isStoreOwner) {
    return <PageHeader title="Riders" description="Only the master admin can open rider accounts." />;
  }

  return (
    <div className="staff-page rider-page">
      <PageHeader
        title="Riders"
        description="Approved rider accounts. Green means the rider still has a delivery. Available means they have none."
      />
      {error ? <p className="error-text">{error}</p> : null}
      {loading ? <p className="staff-empty">Loading…</p> : null}
      {!loading && riders.length === 0 ? (
        <p className="staff-empty">No approved riders yet. New registrations wait on Staff Acc Management.</p>
      ) : null}

      {!loading && riders.length > 0 ? (
        <label className="rider-search">
          <span className="sr-only">Search rider name</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search rider name..."
            type="search"
          />
        </label>
      ) : null}

      {!loading && riders.length > 0 && visibleRiders.length === 0 ? (
        <p className="staff-empty">No rider matches that name.</p>
      ) : null}

      <div className="rider-board">
        {visibleRiders.map((rider) => {
          const name = rider.display_name?.trim() || 'Unnamed rider';
          const open = rider.user_id === selectedId;
          const onDuty = activeRiderIds.has(rider.user_id);
          return (
            <article
              key={rider.user_id}
              className={`rider-account-card${onDuty ? ' has-delivery' : ''}`}
            >
              <div className="rider-account-top">
                <StaffAvatar name={name} path={rider.avatar_path} />
                <span className="rider-account-copy">
                  <strong>{name}</strong>
                  <small>{rider.phone?.trim() || 'No contact number'}</small>
                  <small>{rider.email ?? 'No email on file'}</small>
                </span>
                {onDuty ? <em className="rider-duty is-on">For delivery</em> : <em className="rider-duty is-free">Available</em>}
                <button
                  type="button"
                  className="btn btn-sm rider-history-btn"
                  aria-expanded={open}
                  onClick={() => setSelectedId(open ? null : rider.user_id)}
                >
                  Delivery history
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {selected ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setSelectedId(null)}
        >
          <div
            className="modal-card rider-history-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rider-history-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="staff-section-head">
              <h2 id="rider-history-title">{selected.display_name?.trim() || 'Rider'} · delivery history</h2>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelectedId(null)}>
                Close
              </button>
            </div>
            {deliveriesLoading ? <p className="staff-empty">Loading deliveries…</p> : null}
            {deliveriesError ? <p className="error-text">{deliveriesError}</p> : null}
            {!deliveriesLoading && !deliveriesError && assigned.length === 0 && delivered.length === 0 ? (
              <p className="staff-empty">No deliveries for this rider yet.</p>
            ) : null}
            <DeliveryGroup title="Assigned" rows={assigned} />
            <DeliveryGroup title="Delivered" rows={delivered} />
            <div className="rider-history-actions">
              <button type="button" className="btn btn-danger btn-sm" onClick={() => setRemoveTarget(selected)}>
                Remove rider
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmModal
        open={removeTarget != null}
        title="Remove rider account?"
        message={
          <>
            Remove <strong>{removeTarget?.display_name ?? removeTarget?.email ?? 'this rider'}</strong>? They will lose
            rider app access.
          </>
        }
        confirmLabel="Yes, remove"
        variant="danger"
        busy={removeTarget != null && busyId === removeTarget.user_id}
        onCancel={() => {
          if (busyId !== removeTarget?.user_id) setRemoveTarget(null);
        }}
        onConfirm={() => void confirmRemove()}
      />
    </div>
  );
}
