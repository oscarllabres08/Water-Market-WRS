import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { SalesBarChart } from '../components/SalesCharts';
import { AlertIcon, BoxIcon, DropIcon, PeopleIcon, PesoIcon, ReceiptIcon, StarIcon, TrendIcon } from '../components/UiIcons';
import { useAuth } from '../auth/AuthProvider';
import { todayDateInputValue } from '../lib/expenseTypes';
import { money, publicWrsAssetUrl } from '../lib/format';
import { LOW_STOCK_THRESHOLD } from '../lib/inventoryStock';
import { orderCountsTowardOnlineSales, posCountsTowardWalkInSales, saleRecordedAt } from '../lib/orderSalesEligible';
import { loadSalesDashboard, type TimelinePoint } from '../lib/salesReportData';
import { supabase } from '../lib/supabase';

type RecentOrderRow = {
  id: string;
  source: 'online' | 'walk-in';
  status: string;
  customer_name: string;
  created_at: string;
  payment_settled: boolean;
  amount: number;
  avatarUrl: string | null;
};

type SnapshotProduct = {
  id: string;
  name: string;
  category: string;
  stock_quantity: number | null;
};

function lineAmount(items: { unit_price: number; quantity: number }[] | null | undefined) {
  return (items ?? []).reduce((sum, item) => sum + Number(item.unit_price) * Number(item.quantity), 0);
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function pctChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Math.round(((current - previous) / previous) * 100);
}

const RECENT_ORDERS_PAGE = 10;

function mapOnlineRecent(
  o: {
    id: string;
    customer_id: string | null;
    status: string;
    customer_name: string;
    created_at: string;
    payment_settled: boolean | null;
    order_items?: { unit_price: number; quantity: number }[] | null;
  },
  avatarByCustomer: Map<string, string | null>
): RecentOrderRow {
  const path = o.customer_id ? avatarByCustomer.get(o.customer_id) ?? null : null;
  return {
    id: o.id,
    source: 'online',
    status: o.status,
    customer_name: o.customer_name?.trim() || 'Customer',
    created_at: o.created_at,
    payment_settled: o.payment_settled === true,
    amount: lineAmount(o.order_items),
    avatarUrl: publicWrsAssetUrl(supabase, path),
  };
}

function mapWalkInRecent(s: {
  id: string;
  customer_name: string | null;
  created_at: string;
  payment_settled: boolean | null;
  pos_sale_items?: { unit_price: number; quantity: number }[] | null;
}): RecentOrderRow {
  return {
    id: s.id,
    source: 'walk-in',
    status: 'completed',
    customer_name: s.customer_name?.trim() || 'Walk-in customer',
    created_at: s.created_at,
    payment_settled: s.payment_settled === true,
    amount: lineAmount(s.pos_sale_items),
    avatarUrl: null,
  };
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function DashboardPage() {
  const { businessId, profile } = useAuth();
  const [onlineToday, setOnlineToday] = useState(0);
  const [walkInToday, setWalkInToday] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [recent, setRecent] = useState<RecentOrderRow[]>([]);
  const [recentHasMore, setRecentHasMore] = useState(false);
  const [recentLoadingMore, setRecentLoadingMore] = useState(false);
  const [staffPending, setStaffPending] = useState(0);
  const [productCount, setProductCount] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [expensesToday, setExpensesToday] = useState(0);
  const [ordersToday, setOrdersToday] = useState(0);
  const [loyaltyMembers, setLoyaltyMembers] = useState(0);
  const [borrowedContainers, setBorrowedContainers] = useState(0);
  const [borrowedCustomers, setBorrowedCustomers] = useState(0);
  const [timeline, setTimeline] = useState<TimelinePoint[]>([]);
  const [snapshot, setSnapshot] = useState<SnapshotProduct[]>([]);

  const fetchRecentOrders = useCallback(
    async (offset: number) => {
      if (!businessId) return { rows: [] as RecentOrderRow[], hasMore: false };
      const fetchLimit = offset + RECENT_ORDERS_PAGE + 1;
      const [ordersRes, posRes] = await Promise.all([
        supabase
          .from('orders')
          .select('id,customer_id,status,customer_name,created_at,payment_settled,order_items(unit_price,quantity)')
          .eq('seller_id', businessId)
          .order('created_at', { ascending: false })
          .limit(fetchLimit),
        supabase
          .from('pos_sales')
          .select('id,customer_name,created_at,payment_settled,pos_sale_items(unit_price,quantity)')
          .eq('seller_id', businessId)
          .order('created_at', { ascending: false })
          .limit(fetchLimit),
      ]);
      if (ordersRes.error || posRes.error) {
        return { rows: [] as RecentOrderRow[], hasMore: false };
      }

      const onlineRows = (ordersRes.data ?? []) as Parameters<typeof mapOnlineRecent>[0][];
      const customerIds = [...new Set(onlineRows.map((row) => row.customer_id).filter((id): id is string => Boolean(id)))];
      const avatarByCustomer = new Map<string, string | null>();
      if (customerIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id,avatar_path')
          .in('user_id', customerIds);
        for (const profile of (profiles ?? []) as { user_id: string; avatar_path: string | null }[]) {
          avatarByCustomer.set(profile.user_id, profile.avatar_path);
        }
      }

      const merged = [
        ...onlineRows.map((o) => mapOnlineRecent(o, avatarByCustomer)),
        ...(posRes.data ?? []).map((s) => mapWalkInRecent(s as Parameters<typeof mapWalkInRecent>[0])),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      const rows = merged.slice(offset, offset + RECENT_ORDERS_PAGE);
      const hasMore = merged.length > offset + RECENT_ORDERS_PAGE;
      return { rows, hasMore };
    },
    [businessId]
  );

  const load = useCallback(async () => {
    if (!businessId) return;
    try {
    const from = startOfToday().toISOString();

    const today = todayDateInputValue();

    const [ordersRes, posRes, pendingRes, recentResult, staffRes, prodRes, lowStockRes, expensesRes, ordersCountRes, posCountRes, loyaltyRes, onlineContainersRes, posContainersRes, snapshotRes, week] =
      await Promise.all([
      supabase
        .from('orders')
        .select('id,status,created_at,payment_settled,payment_settled_at,payment_method,order_items(unit_price,quantity)')
        .eq('seller_id', businessId)
        .or(`and(payment_settled.eq.true,payment_settled_at.gte.${from}),and(created_at.gte.${from})`),
      supabase
        .from('pos_sales')
        .select('id,created_at,payment_settled,payment_settled_at,pos_sale_items(unit_price,quantity)')
        .eq('seller_id', businessId)
        .or(`and(payment_settled.eq.true,payment_settled_at.gte.${from}),and(created_at.gte.${from})`),
      supabase.from('orders').select('id', { count: 'exact', head: true }).eq('seller_id', businessId).eq('status', 'pending'),
      fetchRecentOrders(0),
      supabase
        .from('profiles')
        .select('user_id', { count: 'exact', head: true })
        .eq('seller_workspace_owner_id', businessId)
        .eq('seller_team_role', 'staff')
        .eq('seller_join_status', 'pending'),
      supabase.from('products').select('id', { count: 'exact', head: true }).eq('seller_id', businessId),
      supabase
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('seller_id', businessId)
        .eq('category', 'other')
        .not('stock_quantity', 'is', null)
        .lte('stock_quantity', LOW_STOCK_THRESHOLD),
      supabase
        .from('business_expenses')
        .select('amount')
        .eq('seller_id', businessId)
        .eq('business_unit', 'wrs')
        .eq('expense_date', today),
      supabase.from('orders').select('id', { count: 'exact', head: true }).eq('seller_id', businessId).gte('created_at', from),
      supabase.from('pos_sales').select('id', { count: 'exact', head: true }).eq('seller_id', businessId).gte('created_at', from),
      supabase.from('loyalty_balances').select('customer_id', { count: 'exact', head: true }).eq('seller_id', businessId),
      supabase.from('seller_customer_container_balance').select('outstanding_count').eq('seller_id', businessId).gt('outstanding_count', 0),
      supabase.from('seller_pos_container_balance').select('outstanding_count').eq('seller_id', businessId).gt('outstanding_count', 0),
      supabase
        .from('products')
        .select('id,name,category,stock_quantity')
        .eq('seller_id', businessId)
        .order('name')
        .limit(6),
      loadSalesDashboard(businessId, 'week').catch(() => null),
    ]);

    let online = 0;
    const todayStart = startOfToday();
    for (const o of ordersRes.data ?? []) {
      const row = o as {
        status: string;
        created_at: string;
        payment_settled: boolean | null;
        payment_settled_at: string | null;
        payment_method: string | null;
        order_items: { unit_price: number; quantity: number }[];
      };
      if (!orderCountsTowardOnlineSales(row)) continue;
      const recordedAt = saleRecordedAt(row);
      if (!recordedAt || recordedAt < todayStart) continue;
      for (const it of row.order_items ?? []) {
        online += Number(it.unit_price) * Number(it.quantity);
      }
    }

    let walk = 0;
    for (const s of posRes.data ?? []) {
      const sale = s as {
        payment_settled: boolean | null;
        payment_settled_at: string | null;
        created_at: string;
        pos_sale_items: { unit_price: number; quantity: number }[];
      };
      if (!posCountsTowardWalkInSales(sale)) continue;
      const recordedAt = saleRecordedAt(sale);
      if (!recordedAt || recordedAt < todayStart) continue;
      for (const it of sale.pos_sale_items ?? []) {
        walk += Number(it.unit_price) * Number(it.quantity);
      }
    }

    let expenses = 0;
    if (!expensesRes.error) {
      for (const row of expensesRes.data ?? []) {
        expenses += Number((row as { amount: number }).amount);
      }
    }

    setOnlineToday(online);
    setWalkInToday(walk);
    setExpensesToday(expenses);
    setPendingCount(pendingRes.count ?? 0);
    setRecent(recentResult.rows);
    setRecentHasMore(recentResult.hasMore);
    setStaffPending(staffRes.count ?? 0);
    setProductCount(prodRes.count ?? 0);
    setLowStockCount(lowStockRes.count ?? 0);
    setOrdersToday((ordersCountRes.count ?? 0) + (posCountRes.count ?? 0));
    setLoyaltyMembers(loyaltyRes.count ?? 0);
    const onlineBorrowed = (onlineContainersRes.data ?? []) as { outstanding_count: number }[];
    const posBorrowed = (posContainersRes.data ?? []) as { outstanding_count: number }[];
    const borrowedRows = [...onlineBorrowed, ...posBorrowed];
    setBorrowedContainers(borrowedRows.reduce((sum, row) => sum + Number(row.outstanding_count), 0));
    setBorrowedCustomers(borrowedRows.length);
    setSnapshot((snapshotRes.data ?? []) as SnapshotProduct[]);
    setTimeline(week?.timeline ?? []);
    } catch {
      /* Keep the station visible even if one request fails. */
    }
  }, [businessId, fetchRecentOrders]);

  async function showMoreRecent() {
    if (!businessId || recentLoadingMore || !recentHasMore) return;
    setRecentLoadingMore(true);
    try {
      const next = await fetchRecentOrders(recent.length);
      setRecent((prev) => [...prev, ...next.rows]);
      setRecentHasMore(next.hasMore);
    } finally {
      setRecentLoadingMore(false);
    }
  }

  useEffect(() => {
    void load();
    if (!businessId) return;
    const ch = supabase
      .channel(`admin-dash-${businessId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `seller_id=eq.${businessId}` }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pos_sales', filter: `seller_id=eq.${businessId}` }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products', filter: `seller_id=eq.${businessId}` }, () => void load())
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'business_expenses', filter: `seller_id=eq.${businessId}` },
        () => void load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [businessId, load]);

  const storeLabel = profile?.display_name?.trim() || 'there';
  const firstName = storeLabel.split(/\s+/)[0] || 'there';
  const grossToday = onlineToday + walkInToday;
  const netIncomeToday = grossToday - expensesToday;
  const yesterday = timeline.length > 1 ? timeline[timeline.length - 2].total : 0;
  const salesDelta = pctChange(grossToday, yesterday);

  return (
    <div className="station-overview">
      <div className="station-hero">
        <div>
          <p className="station-kicker">{greeting()}, {firstName}</p>
          <h1>Your station at a glance</h1>
          <p>Sales, stock, and orders for today.</p>
        </div>
        <Link to="/wrs-management/pos" className="btn station-new-sale">
          + New sale
        </Link>
      </div>

      <div className="station-stat-grid">
        <article className="station-stat tone-blue">
          <span className="station-stat-icon" aria-hidden><PesoIcon /></span>
          <div>
            <span className="station-stat-label">Today&apos;s sales</span>
            <strong>{money(grossToday)}</strong>
            <em className={salesDelta < 0 ? 'down' : ''}>{salesDelta > 0 ? '+' : ''}{salesDelta}%</em>
          </div>
        </article>
        <article className="station-stat tone-cyan">
          <span className="station-stat-icon" aria-hidden><ReceiptIcon /></span>
          <div>
            <span className="station-stat-label">Today&apos;s expenses</span>
            <strong>{money(expensesToday)}</strong>
            <em><Link to="/wrs-management/expenses">Manage</Link></em>
          </div>
        </article>
        <article className="station-stat tone-navy">
          <span className="station-stat-icon" aria-hidden><TrendIcon /></span>
          <div>
            <span className="station-stat-label">Net income</span>
            <strong>{money(netIncomeToday)}</strong>
            <em>After expenses</em>
          </div>
        </article>
        <article className="station-stat tone-green">
          <span className="station-stat-icon" aria-hidden><DropIcon /></span>
          <div>
            <span className="station-stat-label">Orders today</span>
            <strong>{ordersToday}</strong>
            <em>{pendingCount} pending</em>
          </div>
        </article>
        <article className="station-stat tone-cyan">
          <span className="station-stat-icon" aria-hidden><AlertIcon /></span>
          <div>
            <span className="station-stat-label">Low stock</span>
            <strong>{lowStockCount}</strong>
            <em>{lowStockCount > 0 ? 'Needs attention' : 'Stock looks fine'}</em>
          </div>
        </article>
        <article className="station-stat tone-blue">
          <span className="station-stat-icon" aria-hidden><StarIcon /></span>
          <div>
            <span className="station-stat-label">Loyalty members</span>
            <strong>{loyaltyMembers}</strong>
            <em><Link to="/wrs-management/loyalty">View program</Link></em>
          </div>
        </article>
        <article className="station-stat tone-green">
          <span className="station-stat-icon" aria-hidden><BoxIcon /></span>
          <div>
            <span className="station-stat-label">Borrowed containers</span>
            <strong>{borrowedContainers}</strong>
            <em>{borrowedCustomers} customer{borrowedCustomers === 1 ? '' : 's'}</em>
          </div>
        </article>
      </div>

      {staffPending > 0 ? (
        <div className="card station-note">
          <strong>{staffPending}</strong> staff registration{staffPending === 1 ? '' : 's'} waiting for approval.{' '}
          <Link to="/wrs-management/staff">Review in Staff account approval</Link>
        </div>
      ) : null}

      <div className="station-split">
        <section className="card station-panel">
          <div className="station-panel-head">
            <h2>Sales overview</h2>
            <Link to="/wrs-management/sales">Last 7 days</Link>
          </div>
          <SalesBarChart points={timeline} height={148} slotWidth={36} />
          <p className="station-chart-total">
            Today <strong>{money(grossToday)}</strong>
          </p>
        </section>
        <section className="card station-panel">
          <div className="station-panel-head">
            <h2>Quick actions</h2>
          </div>
          <Link to="/wrs-management/pos" className="station-action">
            <span className="station-action-icon tone-blue" aria-hidden><PesoIcon /></span>
            <span>
              <strong>Start a new sale</strong>
              <small>Open point of sale</small>
            </span>
          </Link>
          <Link to="/wrs-management/inventory" className="station-action">
            <span className="station-action-icon tone-cyan" aria-hidden><BoxIcon /></span>
            <span>
              <strong>Check inventory</strong>
              <small>{productCount} product{productCount === 1 ? '' : 's'}</small>
            </span>
          </Link>
          <Link to="/wrs-management/customers" className="station-action">
            <span className="station-action-icon tone-green" aria-hidden><PeopleIcon /></span>
            <span>
              <strong>Add a customer</strong>
              <small>Grow the loyalty list</small>
            </span>
          </Link>
        </section>
      </div>

      <div className="station-split">
        <section className="card station-panel">
          <div className="station-panel-head">
            <h2>Recent transactions</h2>
            <Link to="/wrs-management/sales">View all</Link>
          </div>
          {recent.length === 0 ? (
            <p className="muted-block">No orders yet.</p>
          ) : (
            <ul className="station-tx-list">
              {recent.slice(0, 5).map((row) => (
                <li key={`${row.source}-${row.id}`}>
                  <div className="station-tx-person">
                    <span className="customer-list-avatar" aria-hidden>
                      {row.avatarUrl ? (
                        <img src={row.avatarUrl} alt="" />
                      ) : (
                        <span className="customer-list-avatar-fallback">
                          {(row.customer_name.trim()[0] ?? 'C').toUpperCase()}
                        </span>
                      )}
                    </span>
                    <div>
                      <strong>{row.customer_name}</strong>
                      <small>
                        {row.payment_settled ? 'Paid' : 'Unpaid'} · {new Date(row.created_at).toLocaleDateString()}
                      </small>
                    </div>
                  </div>
                  <div className="station-tx-end">
                    <b>{money(row.amount)}</b>
                    <span className={`sales-pill ${row.payment_settled ? 'paid' : 'unpaid'}`}>
                      {row.payment_settled ? 'Paid' : 'Unpaid'}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {recentHasMore ? (
            <button type="button" className="btn btn-ghost btn-sm" disabled={recentLoadingMore} onClick={() => void showMoreRecent()}>
              {recentLoadingMore ? 'Loading…' : 'Show more'}
            </button>
          ) : null}
        </section>

        <section className="card station-panel">
          <div className="station-panel-head">
            <h2>Inventory snapshot</h2>
            <Link to="/wrs-management/inventory">Manage</Link>
          </div>
          {snapshot.length === 0 ? (
            <p className="muted-block">No products yet.</p>
          ) : (
            <ul className="station-stock-list">
              {snapshot.map((product) => {
                const tracked = product.stock_quantity != null;
                const qty = product.stock_quantity ?? 0;
                const width = tracked ? Math.max(6, Math.min(100, qty)) : 0;
                return (
                  <li key={product.id}>
                    <div>
                      <strong>{product.name}</strong>
                      <small>
                        {product.category === 'water'
                          ? 'Water refill'
                          : product.category === 'bottled_water'
                            ? 'Bottled water'
                            : product.category === 'ice'
                              ? 'Ice'
                              : 'Others'}
                      </small>
                    </div>
                    <div className="station-stock-meter">
                      {tracked ? <span style={{ width: `${width}%` }} /> : null}
                      <em>{tracked ? `${qty} left` : 'Not tracked'}</em>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
