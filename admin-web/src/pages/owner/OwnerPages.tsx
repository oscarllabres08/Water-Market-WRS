import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Outlet, useLocation, useSearchParams } from 'react-router-dom';

import { useAuth } from '../../auth/AuthProvider';
import { LaundryPeriodPicker } from '../../components/LaundryPeriodPicker';
import { PasswordInput } from '../../components/PasswordInput';
import { SettingsSection } from '../../components/SettingsSection';
import { StaffAvatar } from '../../components/StaffAvatar';
import { ManagementFrame } from '../../layout/ManagementFrame';
import { useNotifications } from '../../notifications/NotificationsProvider';
import { money } from '../../lib/format';
import {
  fetchOwnerCustomerCount,
  fetchOwnerExpenseTrend,
  fetchOwnerExpenses,
  fetchOwnerRecentSales,
  fetchOwnerStaffCounts,
  fetchOwnerCustomerRows,
  fetchOwnerStaffRows,
  fetchOwnerTimeline,
  ownerCustomerMatchesBusiness,
  ownerStaffMatchesBusiness,
  ownerStaffTagLabel,
  fetchOwnerTotals,
  fetchTopCustomers,
  ownerBusinessIncomes,
  ownerExpenseByBusiness,
  ownerDateInputToday,
  ownerPreviousDateInput,
  ownerPreviousRangeStart,
  ownerRangeEnd,
  ownerRangeStart,
  pctChange,
  type OwnerBusinessIncome,
  type OwnerBusinessKey,
  type OwnerCustomerRow,
  type OwnerDayPoint,
  type OwnerExpenseRow,
  type OwnerRange,
  type OwnerRecentSale,
  type OwnerStaffRow,
  type OwnerTotals,
  type TopCustomer,
} from '../../lib/ownerPortalData';
import { supabase } from '../../lib/supabase';

const NAV = [
  { to: '/overall-sales', label: 'Overview', shortLabel: 'Overview', end: true, icon: 'overview' as const },
  { to: '/overall-sales/sales', label: 'Sales Report & Analytics', shortLabel: 'Sales', icon: 'sales' as const },
  { to: '/overall-sales/expenses', label: 'Overall Expenses', shortLabel: 'Expenses', icon: 'expenses' as const },
  { to: '/overall-sales/staff', label: 'Users & Staff', shortLabel: 'Users', icon: 'customers' as const },
];

type BusinessFilter = OwnerBusinessKey;
type ChartFilter = BusinessFilter | 'all';

function Delta({ value }: { value: number }) {
  const up = value >= 0;
  return <span className={`owner-kpi-delta${up ? ' is-up' : ' is-down'}`}>{up ? '▲' : '▼'} {Math.abs(value).toFixed(1)}%</span>;
}

function OwnerSettingsToggle({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="settings-toggle-row">
      <div className="settings-toggle-copy">
        <strong>{label}</strong>
        <p>{description}</p>
      </div>
      <label className={`loyalty-toggle settings-toggle${checked ? ' loyalty-toggle--on' : ''}`}>
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          aria-label={label}
        />
        <span className="loyalty-toggle-track" aria-hidden />
        <span className="loyalty-toggle-label">{checked ? 'On' : 'Off'}</span>
      </label>
    </div>
  );
}

function useOwnerRangeState(initial: OwnerRange = 'month') {
  const [range, setRange] = useState<OwnerRange>(initial);
  const [dateInput, setDateInput] = useState(() => ownerDateInputToday());
  const periodDate = range === 'date' ? dateInput : undefined;
  const period = useOwnerPeriod(range, periodDate);
  return { range, setRange, dateInput, setDateInput, period, periodDate };
}

function useOwnerPeriod(range: OwnerRange, dateInput?: string) {
  const { businessId } = useAuth();
  const [totals, setTotals] = useState<OwnerTotals>({ water: 0, ice: 0, laundry: 0, wrsExpenses: 0, laundryExpenses: 0 });
  const [prevTotals, setPrevTotals] = useState<OwnerTotals>({ water: 0, ice: 0, laundry: 0, wrsExpenses: 0, laundryExpenses: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!businessId) return;
    if (range === 'date' && !dateInput) return;
    setLoading(true);
    const from = ownerRangeStart(range, new Date(), dateInput).toISOString();
    const to = range === 'date' ? ownerRangeEnd(range, new Date(), dateInput).toISOString() : undefined;
    const prevFrom = ownerPreviousRangeStart(range, new Date(), dateInput).toISOString();
    const prevTo =
      range === 'date' && dateInput
        ? ownerRangeEnd('date', new Date(), ownerPreviousDateInput(dateInput)).toISOString()
        : ownerRangeStart(range, new Date(), dateInput).toISOString();
    try {
      const [current, previous] = await Promise.all([
        fetchOwnerTotals(businessId, from, to),
        fetchOwnerTotals(businessId, prevFrom, prevTo),
      ]);
      setTotals(current);
      setPrevTotals(previous);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load totals.');
    }
    setLoading(false);
  }, [businessId, range, dateInput]);

  useEffect(() => {
    void load();
  }, [load]);

  const sales = totals.water + totals.ice + totals.laundry;
  const prevSales = prevTotals.water + prevTotals.ice + prevTotals.laundry;
  const expenses = totals.wrsExpenses + totals.laundryExpenses;
  const prevExpenses = prevTotals.wrsExpenses + prevTotals.laundryExpenses;
  return {
    totals,
    sales,
    expenses,
    net: sales - expenses,
    salesChange: pctChange(sales, prevSales),
    expensesChange: pctChange(expenses, prevExpenses),
    netChange: pctChange(sales - expenses, prevSales - prevExpenses),
    waterChange: pctChange(totals.water, prevTotals.water),
    iceChange: pctChange(totals.ice, prevTotals.ice),
    laundryChange: pctChange(totals.laundry, prevTotals.laundry),
    loading,
    error,
    reload: load,
  };
}

function OwnerPageHead({ title, subtitle, aside }: { title: string; subtitle: string; aside?: ReactNode }) {
  return (
    <header className="owner-page-head">
      <div>
        <h1 className="owner-page-title">{title}</h1>
        <p className="owner-page-sub">{subtitle}</p>
      </div>
      {aside}
    </header>
  );
}

function OwnerKpiCard({
  label,
  value,
  delta,
  sub,
  accent,
}: {
  label: string;
  value: string;
  delta?: number;
  sub?: string;
  accent?: 'sales' | 'expenses' | 'net' | 'people';
}) {
  return (
    <article className={`owner-kpi-card${accent ? ` is-${accent}` : ''}`}>
      <p className="owner-kpi-label">{label}</p>
      <p className="owner-kpi-value">{value}</p>
      {typeof delta === 'number' ? <Delta value={delta} /> : null}
      {sub ? <p className="owner-kpi-sub">{sub}</p> : null}
    </article>
  );
}

function OwnerBusinessTrend({ points }: { points: OwnerDayPoint[] }) {
  const w = 560;
  const h = 220;
  const pad = { l: 44, r: 16, t: 16, b: 36 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  if (points.length === 0) return <p className="muted-block">No sales trend for this period.</p>;
  const maxY = Math.max(1, ...points.map((p) => p.total));
  const step = innerW / Math.max(1, points.length - 1);
  const toX = (i: number) => pad.l + i * step;
  const toY = (v: number) => pad.t + innerH - (v / maxY) * innerH;
  const line = (key: 'water' | 'ice' | 'laundry', color: string) => {
    const segments = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(p[key])}`)
      .join(' ');
    return <path key={key} d={segments} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" />;
  };
  return (
    <svg className="owner-trend-chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Sales trend by business">
      {line('water', '#0074F0')}
      {line('ice', '#00B7F5')}
      {line('laundry', '#7C3AED')}
      {points.map((p, i) => (
        <text key={p.key} x={toX(i)} y={h - 8} textAnchor="middle" className="sales-chart-axis">
          {p.label}
        </text>
      ))}
    </svg>
  );
}

function OwnerBusinessDonut({ water, ice, laundry }: { water: number; ice: number; laundry: number }) {
  const sum = water + ice + laundry || 1;
  const wPct = (water / sum) * 100;
  const iPct = (ice / sum) * 100;
  return (
    <div className="owner-donut-wrap">
      <div
        className="owner-donut"
        style={{
          background: `conic-gradient(#0074F0 0 ${wPct}%, #00B7F5 ${wPct}% ${wPct + iPct}%, #7C3AED ${wPct + iPct}% 100%)`,
        }}
      >
        <div className="owner-donut-hole">
          <span>Expenses mix</span>
          <strong>{money(water + ice + laundry)}</strong>
        </div>
      </div>
      <ul className="owner-donut-legend">
        <li><span className="dot water" /> Water {wPct.toFixed(0)}%</li>
        <li><span className="dot ice" /> Ice {iPct.toFixed(0)}%</li>
        <li><span className="dot laundry" /> Laundry {(100 - wPct - iPct).toFixed(0)}%</li>
      </ul>
    </div>
  );
}

const BUSINESS_BAR_COLOR: Record<BusinessFilter, string> = {
  water: '#0074F0',
  ice: '#00B7F5',
  laundry: '#7C3AED',
};

function OwnerGroupedBars({ points, filter }: { points: OwnerDayPoint[]; filter: ChartFilter }) {
  const w = Math.max(480, points.length * 52);
  const h = 240;
  const pad = { l: 48, r: 16, t: 16, b: 40 };
  const innerH = h - pad.t - pad.b;
  if (points.length === 0) return <p className="muted-block">No chart data.</p>;
  const values = points.map((p) => {
    if (filter === 'all') return p.total;
    if (filter === 'water') return p.water;
    if (filter === 'ice') return p.ice;
    return p.laundry;
  });
  const barColor = filter === 'all' ? '#0074F0' : BUSINESS_BAR_COLOR[filter];
  const maxY = Math.max(1, ...values);
  const slot = (w - pad.l - pad.r) / points.length;
  const barW = Math.min(28, slot * 0.5);
  return (
    <div className="sales-line-chart-scroll">
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className="sales-chart-svg sales-chart-svg--scroll">
        {points.map((p, i) => {
          const v = values[i];
          const x = pad.l + i * slot + (slot - barW) / 2;
          const barH = (v / maxY) * innerH;
          const y = pad.t + innerH - barH;
          return (
            <g key={p.key}>
              <rect x={x} y={y} width={barW} height={barH} rx="4" fill={barColor} opacity="0.9" />
              <text x={x + barW / 2} y={h - 12} textAnchor="middle" className="sales-chart-axis">
                {p.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function OwnerBusinessIncomeCard({
  row,
  delta,
}: {
  row: OwnerBusinessIncome;
  delta?: number;
}) {
  const tone = row.key === 'water' ? 'is-water' : row.key === 'ice' ? 'is-ice' : 'is-laundry';
  return (
    <article className={`owner-business-card owner-income-card ${tone}`}>
      <h3>{row.label}</h3>
      <dl className="owner-income-lines">
        <div>
          <dt>Gross income</dt>
          <dd>{money(row.gross)}</dd>
        </div>
        <div>
          <dt>Expenses</dt>
          <dd>{money(row.expenses)}</dd>
        </div>
        <div className="is-net">
          <dt>Net income</dt>
          <dd>{money(row.net)}</dd>
        </div>
      </dl>
      {typeof delta === 'number' ? (
        <p className="owner-income-delta">
          Gross vs prior period: <Delta value={delta} />
        </p>
      ) : null}
    </article>
  );
}

export function OwnerLayout() {
  const { pathname } = useLocation();
  const current = pathname.startsWith('/overall-sales/settings')
    ? { label: 'Settings', shortLabel: 'Settings' }
    : (NAV.find((item) => (item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`))) ??
      NAV[0]);
  return (
    <ManagementFrame
      brand="Overall Sales"
      section={current.label}
      sectionMobile={current.shortLabel ?? current.label}
      nav={NAV}
      signOutTo="/overall-sales/login"
      className="owner-main"
      shellClassName="owner-portal"
      footRole="Owner"
      showNotifications
      settingsMenu={{
        basePath: '/overall-sales/settings',
        links: [
          { section: 'account', label: 'Account Settings' },
          { section: 'notifications', label: 'Notification' },
        ],
      }}
    >
      <Outlet />
    </ManagementFrame>
  );
}

export function OwnerDashboardPage() {
  const { range, setRange, dateInput, setDateInput, period, periodDate } = useOwnerRangeState('month');
  const { businessId } = useAuth();
  const [customers, setCustomers] = useState(0);
  const [staffCounts, setStaffCounts] = useState({ totalUsers: 0, staff: 0, riders: 0, admins: 0 });
  const [recent, setRecent] = useState<OwnerRecentSale[]>([]);
  const [trend, setTrend] = useState<OwnerDayPoint[]>([]);

  useEffect(() => {
    if (!businessId) return;
    void fetchOwnerCustomerCount(businessId).then(setCustomers);
    void fetchOwnerStaffCounts(businessId).then((counts) =>
      setStaffCounts({ totalUsers: counts.totalUsers, staff: counts.staff, riders: counts.riders, admins: counts.admins })
    );
    void fetchOwnerRecentSales(businessId, 6).then(setRecent);
    void fetchOwnerTimeline(businessId, range, periodDate).then(setTrend);
  }, [businessId, range, periodDate]);

  const share = (part: number) => (period.sales > 0 ? ((part / period.sales) * 100).toFixed(1) : '0.0');

  return (
    <div className="owner-page">
      <OwnerPageHead
        title="Overview"
        subtitle="Your businesses in one place — water refilling, ice cubes, and laundry."
        aside={
          <LaundryPeriodPicker
            range={range}
            dateInput={dateInput}
            onRange={setRange}
            onDateInput={setDateInput}
            dateInputId="owner-overview-date"
            className="owner-period-picker"
          />
        }
      />
      {period.error ? <p className="error-text">{period.error}</p> : null}
      {period.loading ? <p className="muted-block">Loading overview…</p> : null}
      <section className="owner-kpi-grid">
        <OwnerKpiCard label="Total Sales" value={money(period.sales)} delta={period.salesChange} accent="sales" />
        <OwnerKpiCard label="Total Expenses" value={money(period.expenses)} delta={period.expensesChange} accent="expenses" />
        <OwnerKpiCard label="Net Income" value={money(period.net)} delta={period.netChange} accent="net" />
        <OwnerKpiCard label="Total Customers" value={String(customers)} sub="Unique names across channels" accent="people" />
        <OwnerKpiCard
          label="Total Staff / Riders"
          value={String(staffCounts.staff)}
          sub={`${staffCounts.riders} riders · ${staffCounts.admins} admins`}
          accent="people"
        />
      </section>

      <section className="owner-section">
        <h2 className="owner-section-title">Business Performance</h2>
        <div className="owner-business-grid">
          <article className="owner-business-card is-water">
            <h3>Water Refilling</h3>
            <p className="owner-business-amount">{money(period.totals.water)}</p>
            <p className="owner-business-meta">{share(period.totals.water)}% of sales</p>
            <Delta value={period.waterChange} />
          </article>
          <article className="owner-business-card is-ice">
            <h3>Ice Cubes</h3>
            <p className="owner-business-amount">{money(period.totals.ice)}</p>
            <p className="owner-business-meta">{share(period.totals.ice)}% of sales</p>
            <Delta value={period.iceChange} />
          </article>
          <article className="owner-business-card is-laundry">
            <h3>Laundry</h3>
            <p className="owner-business-amount">{money(period.totals.laundry)}</p>
            <p className="owner-business-meta">{share(period.totals.laundry)}% of sales</p>
            <Delta value={period.laundryChange} />
          </article>
        </div>
      </section>

      <div className="owner-split-grid">
        <section className="owner-panel card card-flat">
          <div className="owner-panel-head">
            <h2 className="owner-section-title">Recent Sales</h2>
            <Link className="owner-link" to="/overall-sales/sales">
              View all
            </Link>
          </div>
          <ul className="owner-recent-list">
            {recent.length === 0 ? <li className="muted-block">No recent sales.</li> : null}
            {recent.map((row) => (
              <li key={row.id}>
                <div className="owner-recent-main">
                  <span className={`owner-biz-pill is-${row.business === 'Ice Cubes' ? 'ice' : row.business === 'Laundry' ? 'laundry' : 'water'}`}>
                    {row.business}
                  </span>
                  <span className="owner-recent-product">{row.productLabel}</span>
                  <span className="muted-block">
                    {row.customerName} · {new Date(row.at).toLocaleString()}
                  </span>
                </div>
                <span className="owner-recent-amount">{money(row.amount)}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="owner-panel card card-flat">
          <h2 className="owner-section-title">Sales Trend</h2>
          <div className="owner-trend-legend">
            <span><i className="dot water" /> Water</span>
            <span><i className="dot ice" /> Ice</span>
            <span><i className="dot laundry" /> Laundry</span>
          </div>
          <OwnerBusinessTrend points={trend} />
        </section>
      </div>
    </div>
  );
}

export function OwnerSalesPage() {
  const { range, setRange, dateInput, setDateInput, period, periodDate } = useOwnerRangeState('month');
  const [analyticsBusiness, setAnalyticsBusiness] = useState<ChartFilter>('all');
  const { businessId } = useAuth();
  const [points, setPoints] = useState<OwnerDayPoint[]>([]);
  const [topCustomers, setTopCustomers] = useState<TopCustomer[]>([]);

  const businessRows = useMemo(() => ownerBusinessIncomes(period.totals), [period.totals]);

  const grossDelta: Record<BusinessFilter, number> = {
    water: period.waterChange,
    ice: period.iceChange,
    laundry: period.laundryChange,
  };

  const analyticsLabel =
    analyticsBusiness === 'all' ? 'All businesses' : businessRows.find((r) => r.key === analyticsBusiness)?.label ?? 'Business';
  const analyticsNet = analyticsBusiness === 'all' ? period.net : (businessRows.find((r) => r.key === analyticsBusiness)?.net ?? 0);
  const analyticsGross = analyticsBusiness === 'all' ? period.sales : (businessRows.find((r) => r.key === analyticsBusiness)?.gross ?? 0);
  const analyticsExpenses =
    analyticsBusiness === 'all' ? period.expenses : (businessRows.find((r) => r.key === analyticsBusiness)?.expenses ?? 0);

  useEffect(() => {
    if (!businessId) return;
    void fetchOwnerTimeline(businessId, range, periodDate).then(setPoints);
  }, [businessId, range, periodDate]);

  useEffect(() => {
    if (!businessId) return;
    const unit = analyticsBusiness === 'all' ? undefined : analyticsBusiness;
    const from = ownerRangeStart(range, new Date(), periodDate).toISOString();
    void fetchTopCustomers(businessId, from, 6, unit).then(setTopCustomers);
  }, [businessId, range, periodDate, analyticsBusiness]);

  return (
    <div className="owner-page">
      <OwnerPageHead
        title="Sales Report & Analytics"
        subtitle="Gross income, expenses, and net income per business — then drill into each line."
        aside={
          <LaundryPeriodPicker
            range={range}
            dateInput={dateInput}
            onRange={setRange}
            onDateInput={setDateInput}
            dateInputId="owner-sales-date"
            className="owner-period-picker"
          />
        }
      />
      {period.error ? <p className="error-text module-alert">{period.error}</p> : null}
      <section className="owner-business-grid owner-income-grid">
        {businessRows.map((row) => (
          <OwnerBusinessIncomeCard key={row.key} row={row} delta={grossDelta[row.key]} />
        ))}
      </section>
      <article className="owner-income-totals card card-flat">
        <h2 className="owner-section-title">Combined total (all businesses)</h2>
        <dl className="owner-income-totals-grid">
          <div>
            <dt>Total gross income</dt>
            <dd>{money(period.sales)}</dd>
            <Delta value={period.salesChange} />
          </div>
          <div>
            <dt>Total expenses</dt>
            <dd>{money(period.expenses)}</dd>
            <Delta value={period.expensesChange} />
          </div>
          <div className="is-net">
            <dt>Total net income</dt>
            <dd>{money(period.net)}</dd>
            <Delta value={period.netChange} />
          </div>
        </dl>
      </article>
      <section className="owner-analytics-block">
        <header className="owner-analytics-head">
          <h2 className="owner-section-title">Analytics — {analyticsLabel}</h2>
          <label className="owner-field">
            <span>Show analytics for</span>
            <select
              className="owner-select"
              value={analyticsBusiness}
              onChange={(e) => setAnalyticsBusiness(e.target.value as ChartFilter)}
            >
              <option value="all">All businesses</option>
              <option value="water">Water Refilling</option>
              <option value="ice">Ice Cubes</option>
              <option value="laundry">Laundry</option>
            </select>
          </label>
        </header>
        <div className="owner-analytics-summary card card-flat">
          <p className="owner-kpi-label">Net income (selected)</p>
          <p className="owner-hero-value">{money(analyticsNet)}</p>
          <p className="owner-kpi-sub">
            Gross {money(analyticsGross)} · Expenses {money(analyticsExpenses)}
          </p>
        </div>
        <div className="owner-analytics-grid">
          <section className="owner-panel card card-flat">
            <h3 className="owner-section-title">Sales over time</h3>
            <OwnerGroupedBars points={points} filter={analyticsBusiness} />
          </section>
          <aside className="owner-panel card card-flat">
            <h3 className="owner-section-title">Top customers</h3>
            <ul className="owner-top-customers">
              {topCustomers.length === 0 ? <li className="muted-block">No customers in this period.</li> : null}
              {topCustomers.map((row, index) => (
                <li key={row.name}>
                  <span className="owner-rank">{index + 1}</span>
                  <div>
                    <strong>{row.name}</strong>
                    <span className="owner-top-amount">{money(row.amount)}</span>
                  </div>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </section>
    </div>
  );
}

function expenseRowMatchesBusiness(row: OwnerExpenseRow, filter: ChartFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'laundry') return row.business_unit === 'laundry';
  return row.business_unit !== 'laundry';
}

function expenseBusinessLabel(filter: ChartFilter): string {
  if (filter === 'all') return 'All businesses';
  if (filter === 'water') return 'Water Refilling';
  if (filter === 'ice') return 'Ice Cubes';
  return 'Laundry';
}

export function OwnerExpensesPage() {
  const { range, setRange, dateInput, setDateInput, period, periodDate } = useOwnerRangeState('month');
  const [expenseBusiness, setExpenseBusiness] = useState<ChartFilter>('all');
  const { businessId } = useAuth();
  const [rows, setRows] = useState<OwnerExpenseRow[]>([]);
  const [trend, setTrend] = useState<OwnerDayPoint[]>([]);

  useEffect(() => {
    if (!businessId) return;
    const from = ownerRangeStart(range, new Date(), periodDate).toISOString();
    const toDay = range === 'date' && periodDate ? periodDate : undefined;
    void fetchOwnerExpenses(businessId, from, toDay).then(setRows);
    void fetchOwnerExpenseTrend(businessId, from, toDay).then(setTrend);
  }, [businessId, range, periodDate]);

  const expenseSplit = useMemo(() => ownerExpenseByBusiness(period.totals), [period.totals]);

  const filteredExpenseTotal = useMemo(() => {
    if (expenseBusiness === 'all') return period.expenses;
    return expenseSplit[expenseBusiness];
  }, [expenseBusiness, expenseSplit, period.expenses]);

  const expenseTrendPoints = useMemo(() => {
    const wrsSales = period.totals.water + period.totals.ice || 1;
    const waterRatio = period.totals.water / wrsSales;
    const iceRatio = period.totals.ice / wrsSales;
    return trend.map((p) => ({
      ...p,
      water: p.water * waterRatio,
      ice: p.water * iceRatio,
    }));
  }, [trend, period.totals]);

  const visibleRows = useMemo(
    () => rows.filter((row) => expenseRowMatchesBusiness(row, expenseBusiness)),
    [rows, expenseBusiness]
  );

  const donutProps = useMemo(() => {
    if (expenseBusiness === 'all') {
      return {
        water: expenseSplit.water,
        ice: expenseSplit.ice,
        laundry: expenseSplit.laundry,
      };
    }
    return {
      water: expenseBusiness === 'water' ? expenseSplit.water : 0,
      ice: expenseBusiness === 'ice' ? expenseSplit.ice : 0,
      laundry: expenseBusiness === 'laundry' ? expenseSplit.laundry : 0,
    };
  }, [expenseBusiness, expenseSplit]);

  const chartFilter: ChartFilter = expenseBusiness === 'all' ? 'all' : expenseBusiness;

  return (
    <div className="owner-page">
      <OwnerPageHead
        title="Overall Expenses"
        subtitle="Track spending across water station and laundry."
        aside={
          <LaundryPeriodPicker
            range={range}
            dateInput={dateInput}
            onRange={setRange}
            onDateInput={setDateInput}
            dateInputId="owner-expenses-date"
            className="owner-period-picker"
          />
        }
      />
      <div className="owner-expenses-toolbar">
        <label className="owner-field">
          <span>Filter by business</span>
          <select
            className="owner-select"
            value={expenseBusiness}
            onChange={(e) => setExpenseBusiness(e.target.value as ChartFilter)}
          >
            <option value="all">All businesses</option>
            <option value="water">Water Refilling</option>
            <option value="ice">Ice Cubes</option>
            <option value="laundry">Laundry</option>
          </select>
        </label>
      </div>
      <div className="owner-expenses-top">
        <article className="owner-hero-kpi card card-flat">
          <p className="owner-kpi-label">
            {expenseBusiness === 'all' ? 'Total expenses' : `Expenses — ${expenseBusinessLabel(expenseBusiness)}`}
          </p>
          <p className="owner-hero-value">{money(filteredExpenseTotal)}</p>
          {expenseBusiness === 'all' ? <Delta value={period.expensesChange} /> : null}
          {expenseBusiness === 'ice' || expenseBusiness === 'water' ? (
            <p className="owner-kpi-sub">Station expenses split by water vs ice sales share.</p>
          ) : null}
        </article>
        <section className="owner-panel card card-flat">
          <h2 className="owner-section-title">Expenses by business</h2>
          <OwnerBusinessDonut water={donutProps.water} ice={donutProps.ice} laundry={donutProps.laundry} />
        </section>
      </div>
      <section className="owner-panel card card-flat">
        <h2 className="owner-section-title">Expenses trend — {expenseBusinessLabel(expenseBusiness)}</h2>
        <OwnerGroupedBars points={expenseTrendPoints} filter={chartFilter} />
      </section>
      <section className="owner-panel card card-flat">
        <h2 className="owner-section-title">Recent expenses</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Business</th>
              <th>Category</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={4} className="muted-block">
                  No expenses recorded for this filter and period.
                </td>
              </tr>
            ) : null}
            {visibleRows.map((row) => (
              <tr key={row.id}>
                <td>{row.expense_date}</td>
                <td>
                  {row.business_unit === 'laundry'
                    ? 'Laundry'
                    : expenseBusiness === 'ice'
                      ? 'Ice Cubes (station share)'
                      : 'Water Refilling'}
                </td>
                <td>{row.expense_type}</td>
                <td>
                  {expenseBusiness === 'ice' && row.business_unit !== 'laundry'
                    ? money(
                        Number(row.amount) *
                          (period.totals.water + period.totals.ice > 0
                            ? period.totals.ice / (period.totals.water + period.totals.ice)
                            : 0.5)
                      )
                    : expenseBusiness === 'water' && row.business_unit !== 'laundry'
                      ? money(
                          Number(row.amount) *
                            (period.totals.water + period.totals.ice > 0
                              ? period.totals.water / (period.totals.water + period.totals.ice)
                              : 0.5)
                        )
                      : money(Number(row.amount))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

type StaffFilter = 'all' | 'customer' | 'water' | 'ice' | 'laundry';

type PeopleDetail =
  | { kind: 'staff'; row: OwnerStaffRow }
  | { kind: 'customer'; row: OwnerCustomerRow }
  | null;

function OwnerStaffBusinessTags({ tags }: { tags: OwnerBusinessKey[] }) {
  return (
    <span className="owner-staff-tags">
      {tags.map((tag) => (
        <span key={tag} className={`owner-biz-pill is-${tag === 'ice' ? 'ice' : tag === 'laundry' ? 'laundry' : 'water'}`}>
          {ownerStaffTagLabel(tag)}
        </span>
      ))}
    </span>
  );
}

function OwnerPeopleDetailModal({
  detail,
  onClose,
  onGrantLaundry,
}: {
  detail: NonNullable<PeopleDetail>;
  onClose: () => void;
  onGrantLaundry: (userId: string) => void;
}) {
  const staff = detail.kind === 'staff' ? detail.row : null;
  const customer = detail.kind === 'customer' ? detail.row : null;
  const title = staff ? `${staff.role} details` : 'Customer details';
  const name = staff?.display_name || customer?.name || 'User';
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-card owner-people-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="owner-people-detail-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="owner-panel-head">
          <div className="owner-staff-name">
            <StaffAvatar name={name} path={null} />
            <div>
              <h2 id="owner-people-detail-title" className="owner-section-title">
                {title}
              </h2>
              <p className="owner-kpi-sub">{name}</p>
            </div>
          </div>
          <button type="button" className="btn btn-sm btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
        {staff ? (
          <dl className="owner-staff-detail-lines">
            <div>
              <dt>Email</dt>
              <dd>{staff.email || '—'}</dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>{staff.phone || '—'}</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>{staff.role}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                <span className={`owner-status-pill is-${staff.status.toLowerCase()}`}>{staff.status}</span>
              </dd>
            </div>
            <div>
              <dt>Joined</dt>
              <dd>{staff.joined_at ? new Date(staff.joined_at).toLocaleString() : '—'}</dd>
            </div>
            <div>
              <dt>Business access</dt>
              <dd>
                <OwnerStaffBusinessTags tags={staff.businessTags} />
              </dd>
            </div>
          </dl>
        ) : null}
        {customer ? (
          <dl className="owner-staff-detail-lines">
            <div>
              <dt>Username / email</dt>
              <dd>{customer.login || '—'}</dd>
            </div>
            <div>
              <dt>Contact</dt>
              <dd>{customer.contact || '—'}</dd>
            </div>
            <div>
              <dt>Customer of</dt>
              <dd>
                {customer.businessTags.length ? (
                  <OwnerStaffBusinessTags tags={customer.businessTags} />
                ) : (
                  <span className="muted-block">No orders yet</span>
                )}
              </dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>{customer.source === 'app' ? 'App account' : 'Walk-in / POS'}</dd>
            </div>
            <div>
              <dt>Orders</dt>
              <dd>{customer.orderCount}</dd>
            </div>
            <div>
              <dt>Last activity</dt>
              <dd>{customer.lastActivity ? new Date(customer.lastActivity).toLocaleString() : '—'}</dd>
            </div>
            {customer.address ? (
              <div>
                <dt>Address</dt>
                <dd>{customer.address}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}
        {staff && staff.role !== 'Owner' && !staff.businessTags.includes('laundry') ? (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => onGrantLaundry(staff.user_id)}>
            Grant laundry access
          </button>
        ) : null}
        {staff && staff.role !== 'Owner' ? (
          <Link className="owner-link" to="/wrs-management/staff-accounts">
            Manage approval in WRS → Staff Acc Management
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export function OwnerStaffPage() {
  const { businessId, profile, user } = useAuth();
  const [staffRows, setStaffRows] = useState<OwnerStaffRow[]>([]);
  const [customerRows, setCustomerRows] = useState<OwnerCustomerRow[]>([]);
  const [filter, setFilter] = useState<StaffFilter>('all');
  const [detail, setDetail] = useState<PeopleDetail>(null);
  const [message, setMessage] = useState<string | null>(null);

  const reload = useCallback(() => {
    if (!businessId) return;
    const ownerName = profile?.display_name?.trim() || user?.email || 'Owner';
    void fetchOwnerStaffRows(businessId, ownerName, user?.email ?? null).then(setStaffRows);
    void fetchOwnerCustomerRows(businessId).then(setCustomerRows);
  }, [businessId, profile?.display_name, user?.email]);

  useEffect(() => {
    reload();
  }, [reload]);

  const visibleStaff = useMemo(
    () => (filter === 'customer' ? [] : staffRows.filter((row) => ownerStaffMatchesBusiness(row, filter))),
    [staffRows, filter]
  );

  const visibleCustomers = useMemo(
    () => (filter === 'customer' ? customerRows : customerRows.filter((row) => ownerCustomerMatchesBusiness(row, filter))),
    [customerRows, filter]
  );

  const tabCounts = useMemo(
    () =>
      ({
        all: staffRows.filter((row) => ownerStaffMatchesBusiness(row, 'all')).length,
        customer: customerRows.length,
        water: staffRows.filter((row) => ownerStaffMatchesBusiness(row, 'water')).length,
        ice: staffRows.filter((row) => ownerStaffMatchesBusiness(row, 'ice')).length,
        laundry: staffRows.filter((row) => ownerStaffMatchesBusiness(row, 'laundry')).length,
      }) satisfies Record<StaffFilter, number>,
    [staffRows, customerRows]
  );

  const counts = useMemo(() => {
    const active = staffRows.filter((r) => r.status === 'Active');
    return {
      customers: customerRows.length,
      riders: active.filter((r) => r.role === 'Rider').length,
      admins: active.filter((r) => r.role === 'Admin' || r.role === 'Owner').length,
    };
  }, [staffRows, customerRows]);

  async function grantLaundry(userId: string) {
    const { error } = await supabase.from('user_business_roles').upsert({ user_id: userId, business_id: 'laundry', role: 'staff' });
    if (error) setMessage(error.message);
    else {
      setMessage('Laundry access updated.');
      reload();
    }
  }

  const showCustomers = filter === 'customer' || (filter !== 'all' && visibleCustomers.length > 0);

  return (
    <div className="owner-page">
      <OwnerPageHead
        title="Users & Staff"
        subtitle="Staff and customers — filter by role or business line."
        aside={
          <Link className="btn btn-primary btn-water" to="/wrs-management/staff-accounts">
            Add user
          </Link>
        }
      />
      {message ? <p className="muted-block">{message}</p> : null}
      <div className="pos-category-tabs owner-period-tabs" role="tablist">
        {(
          [
            ['all', 'All Users'],
            ['customer', 'Customers'],
            ['water', 'Water Refilling'],
            ['ice', 'Ice Cubes'],
            ['laundry', 'Laundry'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" className={`pos-category-tab${filter === id ? ' active' : ''}`} onClick={() => setFilter(id)}>
            {label} ({tabCounts[id]})
          </button>
        ))}
      </div>
      {filter === 'customer' ? (
        <section className="owner-staff-stats owner-staff-stats--three">
          <OwnerKpiCard label="Total customers" value={String(counts.customers)} accent="people" />
          <OwnerKpiCard label="With water / ice orders" value={String(customerRows.filter((r) => r.businessTags.some((t) => t !== 'laundry')).length)} />
          <OwnerKpiCard label="Laundry customers" value={String(customerRows.filter((r) => r.businessTags.includes('laundry')).length)} />
        </section>
      ) : (
        <section className="owner-staff-stats owner-staff-stats--three">
          <OwnerKpiCard label="Admins" value={String(counts.admins)} accent="people" />
          <OwnerKpiCard label="Riders" value={String(counts.riders)} accent="sales" />
          <OwnerKpiCard label="Customers" value={String(counts.customers)} accent="net" />
        </section>
      )}
      {filter !== 'customer' ? (
        <section className="owner-panel card card-flat">
          <h2 className="owner-section-title">Admins & riders</h2>
          <table className="data-table owner-staff-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visibleStaff.length === 0 ? (
                <tr>
                  <td colSpan={5} className="muted-block">
                    No staff for this filter.
                  </td>
                </tr>
              ) : null}
              {visibleStaff.map((row) => (
                <tr key={row.user_id}>
                  <td>
                    <div className="owner-staff-name">
                      <StaffAvatar name={row.display_name || 'User'} path={null} />
                      <strong>{row.display_name || 'User'}</strong>
                    </div>
                  </td>
                  <td>{row.email || row.phone || '—'}</td>
                  <td>{row.role}</td>
                  <td>
                    <span className={`owner-status-pill is-${row.status.toLowerCase()}`}>{row.status}</span>
                  </td>
                  <td>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => setDetail({ kind: 'staff', row })}>
                      Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
      {filter === 'customer' || showCustomers ? (
        <section className="owner-panel card card-flat">
          <h2 className="owner-section-title">Customers</h2>
          <table className="data-table owner-staff-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Username / email</th>
                <th>Contact</th>
                <th>Business</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visibleCustomers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="muted-block">
                    No customers for this filter.
                  </td>
                </tr>
              ) : null}
              {visibleCustomers.map((row) => (
                <tr key={row.id}>
                  <td>
                    <div className="owner-staff-name">
                      <StaffAvatar name={row.name} path={null} />
                      <strong>{row.name}</strong>
                    </div>
                  </td>
                  <td>{row.login || '—'}</td>
                  <td>{row.contact || '—'}</td>
                  <td>
                    {row.businessTags.length ? (
                      <OwnerStaffBusinessTags tags={row.businessTags} />
                    ) : (
                      <span className="muted-block">—</span>
                    )}
                  </td>
                  <td>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => setDetail({ kind: 'customer', row })}>
                      Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
      {detail ? (
        <OwnerPeopleDetailModal detail={detail} onClose={() => setDetail(null)} onGrantLaundry={(id) => void grantLaundry(id)} />
      ) : null}
    </div>
  );
}

/** @deprecated route alias */
export const OwnerBusinessesPage = OwnerSalesPage;
export const OwnerAnalyticsPage = OwnerSalesPage;
export const OwnerReportsPage = OwnerSalesPage;

type OwnerSettingsSection = 'account' | 'notifications';

export function OwnerSettingsPage() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const section: OwnerSettingsSection = params.get('section') === 'notifications' ? 'notifications' : 'account';
  const { notificationsEnabled, soundEnabled, prefsLoading, prefsSaving, updateNotificationPrefs } = useNotifications();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  async function onChangePassword(event: FormEvent) {
    event.preventDefault();
    if (!user?.email) {
      setPasswordError('Missing account email.');
      return;
    }
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError('Fill in all password fields.');
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation do not match.');
      return;
    }
    setPasswordSaving(true);
    setPasswordError(null);
    setPasswordSuccess(null);
    const { error: verifyError } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPassword });
    if (verifyError) {
      setPasswordError('Current password is incorrect.');
      setPasswordSaving(false);
      return;
    }
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    setPasswordSaving(false);
    if (updateError) {
      setPasswordError(updateError.message);
      return;
    }
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordSuccess('Password updated.');
  }

  return (
    <div className="owner-page owner-settings-page">
      <OwnerPageHead
        title={section === 'account' ? 'Account Settings' : 'Notification'}
        subtitle={
          section === 'account'
            ? 'Login password for this owner account.'
            : 'Alerts and sound for store activity across businesses.'
        }
      />

      <nav className="owner-settings-tabs" role="tablist" aria-label="Settings sections">
        <Link
          to="/overall-sales/settings?section=account"
          className={`owner-settings-tab${section === 'account' ? ' is-active' : ''}`}
          role="tab"
          aria-selected={section === 'account'}
        >
          Account
        </Link>
        <Link
          to="/overall-sales/settings?section=notifications"
          className={`owner-settings-tab${section === 'notifications' ? ' is-active' : ''}`}
          role="tab"
          aria-selected={section === 'notifications'}
        >
          Notifications
        </Link>
      </nav>
      <p className="owner-settings-active-label muted-block">
        {section === 'account' ? 'Manage your sign-in password.' : 'Choose how alerts appear on this device.'}
      </p>

      {section === 'account' ? (
        <SettingsSection
          title="Account settings"
          subtitle="Change your sign-in password"
          defaultOpen
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.8" />
              <path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          }
        >
          <p className="muted-block settings-account-email">
            Signed in as <strong>{user?.email ?? '—'}</strong>
          </p>
          {passwordError ? <p className="error-text">{passwordError}</p> : null}
          {passwordSuccess ? <p className="success-text">{passwordSuccess}</p> : null}
          <form className="settings-password-form" onSubmit={(e) => void onChangePassword(e)}>
            <div className="field">
              <label htmlFor="owner-current-password">Current password</label>
              <PasswordInput
                id="owner-current-password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>
            <div className="owner-settings-password-grid">
              <div className="field">
                <label htmlFor="owner-new-password">New password</label>
                <PasswordInput
                  id="owner-new-password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="owner-confirm-password">Confirm password</label>
                <PasswordInput
                  id="owner-confirm-password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
            </div>
            <button type="submit" className="btn btn-primary btn-water" disabled={passwordSaving}>
              {passwordSaving ? 'Updating…' : 'Change password'}
            </button>
          </form>
        </SettingsSection>
      ) : null}

      {section === 'notifications' ? (
        <SettingsSection
          title="Notification settings"
          subtitle="Pop-ups and sound on this device"
          defaultOpen
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          }
        >
          {prefsLoading ? <p className="muted-block">Loading preferences…</p> : null}
          <OwnerSettingsToggle
            label="Receive notifications"
            description="Show alerts for new orders, deliveries, and staff activity while you are signed in."
            checked={notificationsEnabled}
            disabled={prefsLoading || prefsSaving}
            onChange={(enabled) => {
              void updateNotificationPrefs({
                notifications_enabled: enabled,
                notification_sound_enabled: enabled ? soundEnabled : false,
              });
            }}
          />
          <div className="settings-divider" />
          <OwnerSettingsToggle
            label="Notification sound"
            description="Play a short sound when a new notification appears."
            checked={soundEnabled}
            disabled={!notificationsEnabled || prefsLoading || prefsSaving}
            onChange={(enabled) => {
              void updateNotificationPrefs({ notification_sound_enabled: enabled });
            }}
          />
          {prefsSaving ? <p className="muted-block settings-saving-hint">Saving…</p> : null}
        </SettingsSection>
      ) : null}

    </div>
  );
}

/** Legacy hook for any imports */
export type RangeKey = OwnerRange;
export function useOwnerTotals(range: RangeKey) {
  const period = useOwnerPeriod(range);
  return {
    totals: period.totals,
    sales: period.sales,
    expenses: period.expenses,
    net: period.net,
    error: period.error,
    loading: period.loading,
  };
}