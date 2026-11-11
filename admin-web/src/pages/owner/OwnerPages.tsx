import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';

import { useAuth } from '../../auth/AuthProvider';
import { ManagementFrame } from '../../layout/ManagementFrame';
import { PageHeader } from '../../components/PageHeader';
import { money } from '../../lib/format';
import { supabase } from '../../lib/supabase';

const NAV = [
  { to: '/overall-sales', label: 'Overview', end: true },
  { to: '/overall-sales/businesses', label: 'Business sales' },
  { to: '/overall-sales/expenses', label: 'Overall expenses' },
  { to: '/overall-sales/analytics', label: 'Business analytics' },
  { to: '/overall-sales/reports', label: 'Financial reports' },
  { to: '/overall-sales/staff', label: 'User & staff' },
  { to: '/overall-sales/settings', label: 'Settings' },
];

export function OwnerLayout() {
  return (
    <ManagementFrame brand="Overall sales" section="Owner" nav={NAV} signOutTo="/overall-sales/login">
      <Outlet />
    </ManagementFrame>
  );
}

type RangeKey = 'today' | 'week' | 'month' | 'year';

type Totals = {
  water: number;
  ice: number;
  laundry: number;
  wrsExpenses: number;
  laundryExpenses: number;
};

const EMPTY: Totals = { water: 0, ice: 0, laundry: 0, wrsExpenses: 0, laundryExpenses: 0 };

function rangeStart(range: RangeKey) {
  const now = new Date();
  if (range === 'today') now.setHours(0, 0, 0, 0);
  if (range === 'week') {
    const day = now.getDay();
    now.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
    now.setHours(0, 0, 0, 0);
  }
  if (range === 'month') {
    now.setDate(1);
    now.setHours(0, 0, 0, 0);
  }
  if (range === 'year') {
    now.setMonth(0, 1);
    now.setHours(0, 0, 0, 0);
  }
  return now.toISOString();
}

function categoryOf(products: { category: string } | { category: string }[] | null) {
  if (Array.isArray(products)) return products[0]?.category ?? '';
  return products?.category ?? '';
}

export function useOwnerTotals(range: RangeKey) {
  const { businessId } = useAuth();
  const [totals, setTotals] = useState<Totals>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!businessId) return;
    let alive = true;
    const from = rangeStart(range);
    setLoading(true);
    void (async () => {
      const [posRes, orderRes, laundryRes, expenseRes] = await Promise.all([
        supabase
          .from('pos_sale_items')
          .select('unit_price,quantity,products(category),pos_sales!inner(created_at,seller_id)')
          .eq('pos_sales.seller_id', businessId)
          .gte('pos_sales.created_at', from),
        supabase
          .from('order_items')
          .select('unit_price,quantity,products(category),orders!inner(created_at,seller_id,status)')
          .eq('orders.seller_id', businessId)
          .neq('orders.status', 'cancelled')
          .gte('orders.created_at', from),
        supabase.from('laundry_sales').select('total_amount').eq('seller_id', businessId).gte('created_at', from),
        supabase
          .from('business_expenses')
          .select('amount,business_unit')
          .eq('seller_id', businessId)
          .gte('expense_date', from.slice(0, 10)),
      ]);
      if (!alive) return;
      const err = posRes.error || orderRes.error || expenseRes.error;
      if (err) setError(err.message);
      const next = { ...EMPTY };
      for (const row of posRes.data ?? []) {
        const amount = Number(row.unit_price) * Number(row.quantity);
        if (categoryOf(row.products as { category: string } | { category: string }[] | null) === 'ice') next.ice += amount;
        else next.water += amount;
      }
      for (const row of orderRes.data ?? []) {
        const amount = Number(row.unit_price) * Number(row.quantity);
        if (categoryOf(row.products as { category: string } | { category: string }[] | null) === 'ice') next.ice += amount;
        else next.water += amount;
      }
      next.laundry = (laundryRes.data ?? []).reduce((sum, row) => sum + Number(row.total_amount), 0);
      for (const row of expenseRes.data ?? []) {
        if (row.business_unit === 'laundry') next.laundryExpenses += Number(row.amount);
        else next.wrsExpenses += Number(row.amount);
      }
      setTotals(next);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [businessId, range]);

  const sales = totals.water + totals.ice + totals.laundry;
  const expenses = totals.wrsExpenses + totals.laundryExpenses;
  return { totals, sales, expenses, net: sales - expenses, error, loading };
}

function RangeTabs({ range, onChange }: { range: RangeKey; onChange: (range: RangeKey) => void }) {
  const options: RangeKey[] = ['today', 'week', 'month', 'year'];
  return (
    <div className="pos-category-tabs" role="tablist">
      {options.map((option) => (
        <button key={option} type="button" className={`pos-category-tab${range === option ? ' active' : ''}`} onClick={() => onChange(option)}>
          {option === 'today' ? 'Today' : option === 'week' ? 'This week' : option === 'month' ? 'This month' : 'This year'}
        </button>
      ))}
    </div>
  );
}

export function OwnerDashboardPage() {
  const [range, setRange] = useState<RangeKey>('today');
  const { totals, sales, expenses, net, error, loading } = useOwnerTotals(range);
  return (
    <div>
      <PageHeader title="Overall sales" description="Water and ice are counted once. Laundry is separate and then added." />
      <RangeTabs range={range} onChange={setRange} />
      {error ? <p className="error-text">{error}</p> : null}
      {loading ? <p className="muted-block">Loading…</p> : null}
      <div className="card card-flat">
        <p>Water refilling {money(totals.water)}</p>
        <p>Ice cubes {money(totals.ice)}</p>
        <p>Laundry {money(totals.laundry)}</p>
        <p>Combined sales {money(sales)}</p>
        <p>Expenses {money(expenses)}</p>
        <p>Net {money(net)}</p>
      </div>
    </div>
  );
}

export function OwnerBusinessesPage() {
  const { totals, loading } = useOwnerTotals('month');
  return (
    <div>
      <PageHeader title="Business sales" description="This month. Ice is not included in the water refilling figure." />
      {loading ? <p className="muted-block">Loading…</p> : null}
      <div className="card card-flat">
        <p>Water refilling {money(totals.water)}</p>
        <p>Ice cubes {money(totals.ice)}</p>
        <p>Laundry {money(totals.laundry)}</p>
      </div>
    </div>
  );
}

export function OwnerExpensesPage() {
  const { totals } = useOwnerTotals('month');
  return (
    <div>
      <PageHeader title="Overall expenses" description="This month, split by business." />
      <div className="card card-flat">
        <p>Water station {money(totals.wrsExpenses)}</p>
        <p>Laundry {money(totals.laundryExpenses)}</p>
        <p>Combined {money(totals.wrsExpenses + totals.laundryExpenses)}</p>
      </div>
    </div>
  );
}

export function OwnerAnalyticsPage() {
  const [range, setRange] = useState<RangeKey>('month');
  const { totals, sales, expenses, net } = useOwnerTotals(range);
  return (
    <div>
      <PageHeader title="Business analytics" description="Compare the three businesses for the selected period." />
      <RangeTabs range={range} onChange={setRange} />
      <div className="card card-flat">
        <table className="data-table">
          <thead><tr><th>Business</th><th>Sales</th></tr></thead>
          <tbody>
            <tr><td>Water refilling</td><td>{money(totals.water)}</td></tr>
            <tr><td>Ice cubes</td><td>{money(totals.ice)}</td></tr>
            <tr><td>Laundry</td><td>{money(totals.laundry)}</td></tr>
            <tr><td>Combined sales</td><td>{money(sales)}</td></tr>
            <tr><td>Expenses</td><td>{money(expenses)}</td></tr>
            <tr><td>Net</td><td>{money(net)}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function OwnerReportsPage() {
  const year = useOwnerTotals('year');
  return (
    <div>
      <PageHeader title="Financial report" description="Year to date. Ice sales are their own line, not added again into water." />
      <div className="card card-flat">
        <p>Gross sales {money(year.sales)}</p>
        <p>Water {money(year.totals.water)}</p>
        <p>Ice {money(year.totals.ice)}</p>
        <p>Laundry {money(year.totals.laundry)}</p>
        <p>Expenses {money(year.expenses)}</p>
        <p>Net income {money(year.net)}</p>
      </div>
    </div>
  );
}

type StaffRow = { user_id: string; display_name: string | null; seller_team_role: string | null };

export function OwnerStaffPage() {
  const [rows, setRows] = useState<StaffRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void supabase
      .from('profiles')
      .select('user_id,display_name,seller_team_role')
      .eq('role', 'seller')
      .then(({ data }) => setRows((data ?? []) as StaffRow[]));
  }, []);

  async function grantLaundry(userId: string) {
    const { error } = await supabase.from('user_business_roles').upsert({ user_id: userId, business_id: 'laundry', role: 'staff' });
    setMessage(error ? error.message : 'Laundry access saved. Run the WaterMarket migration if this failed.');
  }

  return (
    <div>
      <PageHeader title="User and staff" description="The store owner can open every portal. Grant laundry-only access here." />
      {message ? <p className="muted-block">{message}</p> : null}
      <div className="card card-flat">
        <table className="data-table">
          <thead><tr><th>Name</th><th>Team</th><th></th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.user_id}>
                <td>{row.display_name || row.user_id}</td>
                <td>{row.seller_team_role || 'owner'}</td>
                <td>
                  <button type="button" className="btn btn-sm" onClick={() => void grantLaundry(row.user_id)}>
                    Laundry access
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function OwnerSettingsPage() {
  return (
    <div>
      <PageHeader title="Owner settings" description="Dark mode follows the same switch used in WRS settings." />
      <div className="card card-flat">
        <p className="muted-block">WRS, laundry, and this owner view share one sign-in. Staff without laundry access stay in WRS.</p>
      </div>
    </div>
  );
}
