import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, Outlet, useLocation, useSearchParams } from 'react-router-dom';

import { useAuth } from '../../auth/AuthProvider';
import { PasswordInput } from '../../components/PasswordInput';
import { PageHeader } from '../../components/PageHeader';
import { ManagementFrame } from '../../layout/ManagementFrame';
import { money } from '../../lib/format';
import { supabase } from '../../lib/supabase';
import { useNotifications } from '../../notifications/NotificationsProvider';

const NAV = [
  { to: '/laundry-management', label: 'Overview', end: true, icon: 'overview' as const },
  { to: '/laundry-management/pos', label: 'POS', end: true, icon: 'pos' as const },
  { to: '/laundry-management/bookings', label: 'Bookings', end: true, icon: 'bookings' as const },
  { to: '/laundry-management/services', label: 'Services & pricing', end: true, icon: 'services' as const },
  { to: '/laundry-management/sales', label: 'Sales', end: true, icon: 'sales' as const },
  { to: '/laundry-management/customers', label: 'Customers', end: true, icon: 'customers' as const },
  { to: '/laundry-management/expenses', label: 'Expenses', end: true, icon: 'expenses' as const },
  { to: '/laundry-management/settings', label: 'Settings', end: true, icon: 'settings' as const },
];

export function LaundryLayout() {
  const { pathname } = useLocation();
  const current = NAV.find((item) => (item.end ? pathname === item.to : pathname.startsWith(item.to)));
  return (
    <ManagementFrame brand="Laundry" section={current?.label ?? 'Laundry'} nav={NAV} signOutTo="/laundry-management/login" className="laundry-desk">
      <Outlet />
    </ManagementFrame>
  );
}

type Service = { id: string; name: string; price: number; unit_label: string; is_available: boolean };
type SaleItem = { service_name: string; quantity: number; unit_price: number };
type Sale = {
  id: string;
  customer_name: string | null;
  payment_method: string;
  total_amount: number;
  created_at: string;
  laundry_sale_items?: SaleItem[] | null;
};
type Booking = {
  id: string;
  customer_name: string;
  contact_number: string;
  address: string | null;
  latitude?: number | null;
  longitude?: number | null;
  service_summary: string;
  scheduled_for: string;
  status: string;
  source: string;
  notes: string | null;
  created_at?: string;
};

const STATION_ORIGIN = 'Ilang-Ilang Road, Andagao, Kalibo, Aklan';
const BOOKING_STATUSES = ['pending', 'confirmed', 'in_progress', 'ready', 'completed', 'cancelled'] as const;

function bookingStatusLabel(status: string) {
  if (status === 'in_progress') return 'In progress';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function bookingPin(row: Booking): { latitude: number; longitude: number } | null {
  if (typeof row.latitude === 'number' && Number.isFinite(row.latitude) && typeof row.longitude === 'number' && Number.isFinite(row.longitude)) {
    return { latitude: row.latitude, longitude: row.longitude };
  }
  const match = (row.notes ?? '').match(/^pin:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  return { latitude: Number(match[1]), longitude: Number(match[2]) };
}

function bookingRoute(row: Booking, origin: string): string | null {
  const pin = bookingPin(row);
  const destination = pin ? `${pin.latitude},${pin.longitude}` : (row.address ?? '').trim();
  if (!destination) return null;
  const params = new URLSearchParams({
    api: '1',
    origin,
    destination,
    travelmode: 'driving',
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function startOfMonth() {
  const date = startOfToday();
  date.setDate(1);
  return date;
}

function saleLines(sale: Sale) {
  const items = sale.laundry_sale_items ?? [];
  if (items.length === 0) return '—';
  return items.map((item) => `${item.quantity} × ${item.service_name}`).join(', ');
}

function sumAmounts(rows: { total_amount?: number; amount?: number }[]) {
  return rows.reduce((sum, row) => sum + Number(row.total_amount ?? row.amount ?? 0), 0);
}

export function LaundryDashboardPage() {
  const { businessId } = useAuth();
  const [salesToday, setSalesToday] = useState(0);
  const [salesMonth, setSalesMonth] = useState(0);
  const [expensesToday, setExpensesToday] = useState(0);
  const [expensesMonth, setExpensesMonth] = useState(0);
  const [pending, setPending] = useState(0);
  const [recent, setRecent] = useState<Sale[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!businessId) return;
    const today = startOfToday();
    const month = startOfMonth();
    const todayKey = today.toISOString().slice(0, 10);
    void (async () => {
      const [saleRes, expenseRes, pendingRes, recentRes] = await Promise.all([
        supabase.from('laundry_sales').select('total_amount,created_at').eq('seller_id', businessId).gte('created_at', month.toISOString()),
        supabase.from('business_expenses').select('amount,expense_date').eq('seller_id', businessId).eq('business_unit', 'laundry').gte('expense_date', month.toISOString().slice(0, 10)),
        supabase.from('laundry_bookings').select('id', { count: 'exact', head: true }).eq('seller_id', businessId).eq('status', 'pending'),
        supabase
          .from('laundry_sales')
          .select('id,customer_name,payment_method,total_amount,created_at,laundry_sale_items(service_name,quantity,unit_price)')
          .eq('seller_id', businessId)
          .order('created_at', { ascending: false })
          .limit(6),
      ]);
      let recentRows = recentRes.data as Sale[] | null;
      let recentError = recentRes.error;
      if (recentError) {
        const plain = await supabase
          .from('laundry_sales')
          .select('id,customer_name,payment_method,total_amount,created_at')
          .eq('seller_id', businessId)
          .order('created_at', { ascending: false })
          .limit(6);
        recentRows = (plain.data ?? null) as Sale[] | null;
        recentError = plain.error;
      }
      const failed = saleRes.error || expenseRes.error || pendingRes.error || recentError;
      setError(failed ? failed.message : null);
      const sales = saleRes.data ?? [];
      setSalesMonth(sumAmounts(sales));
      setSalesToday(sumAmounts(sales.filter((row) => new Date(row.created_at) >= today)));
      const expenses = expenseRes.data ?? [];
      setExpensesMonth(sumAmounts(expenses));
      setExpensesToday(sumAmounts(expenses.filter((row) => row.expense_date >= todayKey)));
      setPending(pendingRes.count ?? 0);
      setRecent(recentRows ?? []);
    })();
  }, [businessId]);

  const netToday = salesToday - expensesToday;

  return (
    <div>
      <PageHeader title="Overview" description="Today’s laundry sales, expenses, and the latest walk-in sales." />
      {error ? <p className="error-text">{error}</p> : null}
      <div className="grid-stats">
        <article className="stat-card">
          <div className="label">Sales today</div>
          <div className="value">{money(salesToday)}</div>
          <p className="stat-card-sub">This month {money(salesMonth)}</p>
        </article>
        <article className="stat-card stat-card--expense">
          <div className="label">Expenses today</div>
          <div className="value">{money(expensesToday)}</div>
          <p className="stat-card-sub">This month {money(expensesMonth)}</p>
        </article>
        <article className={`stat-card stat-card--net${netToday < 0 ? ' negative' : ''}`}>
          <div className="label">Net today</div>
          <div className="value">{money(netToday)}</div>
          <p className="stat-card-sub">Sales minus expenses</p>
        </article>
        <article className="stat-card">
          <div className="label">Pending bookings</div>
          <div className="value">{pending}</div>
          <p className="stat-card-sub">Waiting on the website</p>
        </article>
      </div>
      <section className="card card-flat">
        <div className="ly-section-head">
          <h2>Recent sales</h2>
          <Link to="/laundry-management/sales">Sales report</Link>
        </div>
        {recent.length === 0 ? <p className="muted-block">No sales yet. A POS checkout shows up here.</p> : null}
        <ul className="ly-recent">
          {recent.map((sale) => (
            <li key={sale.id}>
              <div>
                <strong>{sale.customer_name?.trim() || 'Walk-in'}</strong>
                <span>{saleLines(sale)}</span>
              </div>
              <div className="ly-recent-meta">
                <b>{money(Number(sale.total_amount))}</b>
                <span>{new Date(sale.created_at).toLocaleString()}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export function LaundryServicesPage() {
  const { businessId } = useAuth();
  const [rows, setRows] = useState<Service[]>([]);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [unit, setUnit] = useState('per kg');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!businessId) return;
    const { data, error: err } = await supabase
      .from('laundry_services')
      .select('id,name,price,unit_label,is_available')
      .eq('seller_id', businessId)
      .order('sort_order');
    setError(err ? err.message : null);
    setRows((data ?? []) as Service[]);
  }, [businessId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addService(event: FormEvent) {
    event.preventDefault();
    if (!businessId) return;
    const amount = Number(price);
    if (!name.trim() || !Number.isFinite(amount) || amount < 0) {
      setError('Enter a service name and price.');
      return;
    }
    const { error: err } = await supabase.from('laundry_services').insert({
      seller_id: businessId,
      name: name.trim(),
      price: amount,
      unit_label: unit.trim() || 'per kg',
      is_available: true,
      sort_order: rows.length,
    });
    if (err) {
      setError(err.message);
      return;
    }
    setName('');
    setPrice('');
    setError(null);
    await load();
  }

  return (
    <div>
      <PageHeader title="Services & pricing" description="Shown on the website and on the laundry POS." />
      {error ? <p className="error-text">{error}</p> : null}
      <form className="card card-flat ly-add" onSubmit={(event) => void addService(event)}>
        <div className="field">
          <label htmlFor="laundry-service-name">Service</label>
          <input id="laundry-service-name" value={name} onChange={(event) => setName(event.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="laundry-service-price">Price (₱)</label>
          <input id="laundry-service-price" type="number" min={0} step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="laundry-service-unit">Unit</label>
          <input id="laundry-service-unit" value={unit} onChange={(event) => setUnit(event.target.value)} />
        </div>
        <button className="btn btn-primary" type="submit">Add</button>
      </form>
      <div className="card card-flat">
        {rows.length === 0 ? <p className="muted-block">No services yet.</p> : null}
        <div className="sales-table-scroll">
          <table className="data-table">
            <thead>
              <tr><th>Service</th><th>Price</th><th>Unit</th><th>POS & website</th></tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td data-label="Service">{row.name}</td>
                  <td data-label="Price">{money(Number(row.price))}</td>
                  <td data-label="Unit">{row.unit_label}</td>
                  <td data-label="POS & website">
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => {
                        void supabase.from('laundry_services').update({ is_available: !row.is_available }).eq('id', row.id).then(() => load());
                      }}
                    >
                      {row.is_available ? 'Shown' : 'Hidden'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function LaundryBookingsPage() {
  const { businessId } = useAuth();
  const [rows, setRows] = useState<Booking[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [storeOrigin, setStoreOrigin] = useState(STATION_ORIGIN);

  const load = useCallback(async () => {
    if (!businessId) return;
    const columns = 'id,customer_name,contact_number,address,latitude,longitude,service_summary,scheduled_for,status,source,notes,created_at';
    let result = await supabase
      .from('laundry_bookings')
      .select(columns)
      .eq('seller_id', businessId)
      .order('scheduled_for', { ascending: true })
      .limit(200);
    if (result.error && /latitude|longitude|column/i.test(result.error.message)) {
      result = (await supabase
        .from('laundry_bookings')
        .select('id,customer_name,contact_number,address,service_summary,scheduled_for,status,source,notes,created_at')
        .eq('seller_id', businessId)
        .order('scheduled_for', { ascending: true })
        .limit(200)) as typeof result;
    }
    setError(result.error ? result.error.message : null);
    setRows((result.data ?? []) as Booking[]);
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

  return (
    <div>
      <PageHeader title="Bookings" description="Website laundry pickups. Open the map for the route to the customer." />
      {error ? <p className="error-text">{error}</p> : null}
      <div className="card card-flat">
        {rows.length === 0 ? <p className="muted-block">No bookings yet.</p> : null}
        <div className="sales-table-scroll">
          <table className="data-table">
            <thead>
              <tr><th>Customer</th><th>Services</th><th>Schedule</th><th>Status</th></tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const route = bookingRoute(row, storeOrigin);
                return (
                  <tr key={row.id}>
                    <td data-label="Customer">
                      <strong>{row.customer_name}</strong>
                      <div className="muted-block">{row.contact_number}</div>
                      <div className="muted-block">{row.address}</div>
                      {route ? (
                        <a className="ly-map" href={route} target="_blank" rel="noreferrer">Open in map</a>
                      ) : null}
                    </td>
                    <td data-label="Services">{row.service_summary}</td>
                    <td data-label="Schedule">{new Date(row.scheduled_for).toLocaleString()}</td>
                    <td data-label="Status">
                      <select
                        className={`ly-select is-${row.status}`}
                        value={row.status}
                        aria-label={`Booking status for ${row.customer_name}`}
                        onChange={(event) => {
                          void supabase.from('laundry_bookings').update({ status: event.target.value }).eq('id', row.id).then(() => load());
                        }}
                      >
                        {BOOKING_STATUSES.map((status) => (
                          <option key={status} value={status}>{bookingStatusLabel(status)}</option>
                        ))}
                      </select>
                      {row.status === 'cancelled' ? <span className="ly-tag is-cancelled">Cancelled</span> : null}
                      {row.status === 'completed' ? <span className="ly-tag is-done">Completed</span> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function LaundryPosPage() {
  const { businessId } = useAuth();
  const [services, setServices] = useState<Service[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [customer, setCustomer] = useState('');
  const [payment, setPayment] = useState<'cash' | 'gcash'>('cash');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!businessId) return;
    const { data, error: err } = await supabase
      .from('laundry_services')
      .select('id,name,price,unit_label,is_available')
      .eq('seller_id', businessId)
      .eq('is_available', true)
      .order('sort_order');
    setError(err ? err.message : null);
    setServices((data ?? []) as Service[]);
  }, [businessId]);

  useEffect(() => {
    void load();
  }, [load]);

  const lines = services.filter((service) => (cart[service.id] ?? 0) > 0);
  const total = lines.reduce((sum, service) => sum + Number(service.price) * (cart[service.id] ?? 0), 0);

  function setQty(id: string, next: number) {
    setCart((current) => ({ ...current, [id]: Math.max(0, Math.min(50, next)) }));
  }

  async function checkout() {
    if (!businessId) return;
    if (lines.length === 0) {
      setError('Add a service first.');
      return;
    }
    setBusy(true);
    setError(null);
    const { data, error: saleErr } = await supabase
      .from('laundry_sales')
      .insert({
        seller_id: businessId,
        customer_name: customer.trim() || null,
        payment_method: payment,
        total_amount: total,
      })
      .select('id')
      .single();
    if (saleErr || !data) {
      setError(saleErr?.message ?? 'Could not save the sale.');
      setBusy(false);
      return;
    }
    const { error: itemErr } = await supabase.from('laundry_sale_items').insert(
      lines.map((service) => ({
        laundry_sale_id: data.id,
        service_name: service.name,
        unit_price: service.price,
        quantity: cart[service.id],
      }))
    );
    setBusy(false);
    if (itemErr) {
      setError(itemErr.message);
      return;
    }
    setCart({});
    setCustomer('');
    setMessage(`Saved ${money(total)} for ${customer.trim() || 'walk-in'}.`);
  }

  return (
    <div>
      <PageHeader title="POS" description="Services from Services & pricing. Hidden services stay off this screen." />
      {error ? <p className="error-text">{error}</p> : null}
      {message ? <p className="success-text">{message}</p> : null}
      <div className="ly-pos">
        <section className="card card-flat">
          <div className="ly-section-head">
            <h2>Services</h2>
            <Link to="/laundry-management/services">Edit prices</Link>
          </div>
          {services.length === 0 ? (
            <p className="muted-block">No services on the POS yet. Add one in Services & pricing and leave it shown.</p>
          ) : (
            <div className="ly-services">
              {services.map((service) => {
                const qty = cart[service.id] ?? 0;
                return (
                  <article key={service.id} className={`ly-service${qty > 0 ? ' is-in' : ''}`}>
                    <strong>{service.name}</strong>
                    <span>{money(Number(service.price))} · {service.unit_label}</span>
                    <div className="ly-step">
                      <button type="button" aria-label={`Decrease ${service.name}`} onClick={() => setQty(service.id, qty - 1)}>−</button>
                      <b>{qty}</b>
                      <button type="button" aria-label={`Increase ${service.name}`} onClick={() => setQty(service.id, qty + 1)}>+</button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
        <aside className="card card-flat ly-ticket">
          <h2>Ticket</h2>
          {lines.length === 0 ? <p className="muted-block">Nothing added yet.</p> : null}
          <ul className="ly-ticket-lines">
            {lines.map((service) => (
              <li key={service.id}>
                <span>{cart[service.id]} × {service.name}</span>
                <b>{money(Number(service.price) * (cart[service.id] ?? 0))}</b>
              </li>
            ))}
          </ul>
          <div className="field">
            <label htmlFor="laundry-pos-customer">Customer name</label>
            <input id="laundry-pos-customer" value={customer} onChange={(event) => setCustomer(event.target.value)} placeholder="Walk-in name" />
          </div>
          <div className="ly-pay" role="group" aria-label="Payment">
            <button type="button" className={payment === 'cash' ? 'is-on' : ''} onClick={() => setPayment('cash')}>Cash</button>
            <button type="button" className={payment === 'gcash' ? 'is-on' : ''} onClick={() => setPayment('gcash')}>GCash</button>
          </div>
          <p className="ly-total"><span>Total</span><strong>{money(total)}</strong></p>
          <button type="button" className="btn btn-primary" disabled={busy || lines.length === 0} onClick={() => void checkout()}>
            {busy ? 'Saving…' : 'Save sale'}
          </button>
        </aside>
      </div>
    </div>
  );
}

export function LaundrySalesPage() {
  const { businessId } = useAuth();
  const [range, setRange] = useState<'today' | 'month'>('month');
  const [rows, setRows] = useState<Sale[]>([]);
  const [expenses, setExpenses] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!businessId) return;
    const from = range === 'today' ? startOfToday() : startOfMonth();
    void (async () => {
      const fromIso = from.toISOString();
      let saleRes = await supabase
        .from('laundry_sales')
        .select('id,customer_name,payment_method,total_amount,created_at,laundry_sale_items(service_name,quantity,unit_price)')
        .eq('seller_id', businessId)
        .gte('created_at', fromIso)
        .order('created_at', { ascending: false })
        .limit(300);
      if (saleRes.error) {
        saleRes = (await supabase
          .from('laundry_sales')
          .select('id,customer_name,payment_method,total_amount,created_at')
          .eq('seller_id', businessId)
          .gte('created_at', fromIso)
          .order('created_at', { ascending: false })
          .limit(300)) as typeof saleRes;
      }
      const expenseRes = await supabase
        .from('business_expenses')
        .select('amount')
        .eq('seller_id', businessId)
        .eq('business_unit', 'laundry')
        .gte('expense_date', fromIso.slice(0, 10));
      setError(saleRes.error?.message || expenseRes.error?.message || null);
      setRows((saleRes.data ?? []) as Sale[]);
      setExpenses(sumAmounts(expenseRes.data ?? []));
    })();
  }, [businessId, range]);

  const sales = sumAmounts(rows);

  return (
    <div>
      <PageHeader title="Sales" description="Laundry sales report. Water station sales are not included." />
      {error ? <p className="error-text">{error}</p> : null}
      <div className="ly-range" role="tablist">
        <button type="button" className={range === 'today' ? 'is-on' : ''} onClick={() => setRange('today')}>Today</button>
        <button type="button" className={range === 'month' ? 'is-on' : ''} onClick={() => setRange('month')}>This month</button>
      </div>
      <div className="grid-stats ly-sales-stats">
        <article className="stat-card">
          <div className="label">Sales</div>
          <div className="value">{money(sales)}</div>
        </article>
        <article className="stat-card stat-card--expense">
          <div className="label">Expenses</div>
          <div className="value">{money(expenses)}</div>
        </article>
        <article className={`stat-card stat-card--net${sales - expenses < 0 ? ' negative' : ''}`}>
          <div className="label">Net</div>
          <div className="value">{money(sales - expenses)}</div>
        </article>
      </div>
      <div className="card card-flat">
        {rows.length === 0 ? <p className="muted-block">No sales in this period.</p> : null}
        <div className="sales-table-scroll">
          <table className="data-table">
            <thead>
              <tr><th>When</th><th>Customer</th><th>Services</th><th>Payment</th><th>Total</th></tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td data-label="When">{new Date(row.created_at).toLocaleString()}</td>
                  <td data-label="Customer"><strong>{row.customer_name?.trim() || 'Walk-in'}</strong></td>
                  <td data-label="Services">{saleLines(row)}</td>
                  <td data-label="Payment">{row.payment_method}</td>
                  <td data-label="Total">{money(Number(row.total_amount))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

type CustomerRow = {
  key: string;
  name: string;
  contact: string;
  address: string;
  visits: number;
  lastSeen: string;
};

export function LaundryCustomersPage() {
  const { businessId } = useAuth();
  const [people, setPeople] = useState<CustomerRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!businessId) return;
    void Promise.all([
      supabase
        .from('laundry_bookings')
        .select('customer_name,contact_number,address,created_at')
        .eq('seller_id', businessId)
        .order('created_at', { ascending: false })
        .limit(400),
      supabase
        .from('laundry_sales')
        .select('customer_name,created_at')
        .eq('seller_id', businessId)
        .order('created_at', { ascending: false })
        .limit(400),
    ]).then(([bookingRes, saleRes]) => {
      setError(bookingRes.error?.message || saleRes.error?.message || null);
      const map = new Map<string, CustomerRow>();
      const touch = (name: string, when: string, contact = '', address = '') => {
        const clean = name.trim();
        if (!clean) return;
        const key = clean.toLowerCase();
        const current = map.get(key);
        if (!current) {
          map.set(key, { key, name: clean, contact, address, visits: 1, lastSeen: when });
          return;
        }
        current.visits += 1;
        if (!current.contact && contact) current.contact = contact;
        if (!current.address && address) current.address = address;
        if (new Date(when).getTime() > new Date(current.lastSeen).getTime()) current.lastSeen = when;
      };
      for (const row of bookingRes.data ?? []) touch(row.customer_name, row.created_at, row.contact_number ?? '', row.address ?? '');
      for (const row of saleRes.data ?? []) touch(row.customer_name ?? '', row.created_at);
      setPeople([...map.values()].sort((a, b) => a.name.localeCompare(b.name)));
    });
  }, [businessId]);

  const named = useMemo(() => people, [people]);

  return (
    <div>
      <PageHeader title="Customers" description="Names from website bookings and POS sales." />
      {error ? <p className="error-text">{error}</p> : null}
      <div className="card card-flat">
        {named.length === 0 ? <p className="muted-block">No customer names yet.</p> : null}
        <div className="sales-table-scroll">
          <table className="data-table">
            <thead>
              <tr><th>Name</th><th>Contact</th><th>Address</th><th>Visits</th><th>Last seen</th></tr>
            </thead>
            <tbody>
              {named.map((row) => (
                <tr key={row.key}>
                  <td data-label="Name"><strong>{row.name}</strong></td>
                  <td data-label="Contact">{row.contact || '—'}</td>
                  <td data-label="Address">{row.address || '—'}</td>
                  <td data-label="Visits">{row.visits}</td>
                  <td data-label="Last seen">{new Date(row.lastSeen).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function LaundrySettingsPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const section = params.get('section') === 'notifications' ? 'notifications' : 'account';
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
    <div>
      <PageHeader
        title={section === 'account' ? 'Account settings' : 'Notifications'}
        description={section === 'account' ? 'Password for this laundry account.' : 'Alerts for this signed-in account.'}
      />
      <div className="ly-range" role="tablist">
        <button type="button" className={section === 'account' ? 'is-on' : ''} onClick={() => setParams({ section: 'account' })}>Account</button>
        <button type="button" className={section === 'notifications' ? 'is-on' : ''} onClick={() => setParams({ section: 'notifications' })}>Notifications</button>
      </div>
      {section === 'account' ? (
        <form className="card card-flat ly-settings" onSubmit={(event) => void onChangePassword(event)}>
          <p className="muted-block">Signed in as <strong>{user?.email ?? '—'}</strong></p>
          {passwordError ? <p className="error-text">{passwordError}</p> : null}
          {passwordSuccess ? <p className="success-text">{passwordSuccess}</p> : null}
          <div className="field">
            <label htmlFor="ly-current-password">Current password</label>
            <PasswordInput id="ly-current-password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
          </div>
          <div className="ly-split">
            <div className="field">
              <label htmlFor="ly-new-password">New password</label>
              <PasswordInput id="ly-new-password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="ly-confirm-password">Confirm password</label>
              <PasswordInput id="ly-confirm-password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
            </div>
          </div>
          <button className="btn btn-primary" type="submit" disabled={passwordSaving}>{passwordSaving ? 'Updating…' : 'Change password'}</button>
        </form>
      ) : (
        <div className="card card-flat ly-settings">
          {prefsLoading ? <p className="muted-block">Loading preferences…</p> : null}
          <label className="ly-toggle">
            <span>
              <strong>Receive notifications</strong>
              <small>Pop-ups when laundry bookings and store activity arrive.</small>
            </span>
            <input
              type="checkbox"
              checked={notificationsEnabled}
              disabled={prefsLoading || prefsSaving}
              onChange={(event) => {
                void updateNotificationPrefs({
                  notifications_enabled: event.target.checked,
                  notification_sound_enabled: event.target.checked ? soundEnabled : false,
                });
              }}
            />
          </label>
          <label className="ly-toggle">
            <span>
              <strong>Notification sound</strong>
              <small>Play a sound with each new notification.</small>
            </span>
            <input
              type="checkbox"
              checked={soundEnabled}
              disabled={!notificationsEnabled || prefsLoading || prefsSaving}
              onChange={(event) => {
                void updateNotificationPrefs({ notification_sound_enabled: event.target.checked });
              }}
            />
          </label>
          {prefsSaving ? <p className="muted-block">Saving…</p> : null}
        </div>
      )}
    </div>
  );
}
