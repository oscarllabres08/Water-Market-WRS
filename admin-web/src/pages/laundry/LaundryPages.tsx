import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Outlet } from 'react-router-dom';

import { useAuth } from '../../auth/AuthProvider';
import { ManagementFrame } from '../../layout/ManagementFrame';
import { PageHeader } from '../../components/PageHeader';
import { money } from '../../lib/format';
import { supabase } from '../../lib/supabase';

const NAV = [
  { to: '/laundry-management', label: 'Overview', end: true },
  { to: '/laundry-management/pos', label: 'POS' },
  { to: '/laundry-management/bookings', label: 'Online bookings' },
  { to: '/laundry-management/transactions', label: 'Transactions' },
  { to: '/laundry-management/services', label: 'Services & pricing' },
  { to: '/laundry-management/customers', label: 'Customers' },
  { to: '/laundry-management/expenses', label: 'Expenses' },
  { to: '/laundry-management/reports', label: 'Reports' },
  { to: '/laundry-management/settings', label: 'Settings' },
];

export function LaundryLayout() {
  return (
    <ManagementFrame brand="Laundry" section="Laundry" nav={NAV} signOutTo="/laundry-management/login">
      <Outlet />
    </ManagementFrame>
  );
}

type Service = { id: string; name: string; price: number; unit_label: string; is_available: boolean };
type Booking = {
  id: string;
  customer_name: string;
  contact_number: string;
  address: string | null;
  service_summary: string;
  scheduled_for: string;
  status: string;
  source: string;
  notes: string | null;
};
type Sale = { id: string; customer_name: string | null; payment_method: string; total_amount: number; created_at: string };

const BOOKING_STATUSES = ['pending', 'confirmed', 'in_progress', 'ready', 'completed', 'cancelled'];

export function LaundryDashboardPage() {
  const { businessId } = useAuth();
  const [bookings, setBookings] = useState(0);
  const [sales, setSales] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!businessId) return;
    void (async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const [bookingRes, saleRes] = await Promise.all([
        supabase.from('laundry_bookings').select('id', { count: 'exact', head: true }).eq('seller_id', businessId).eq('status', 'pending'),
        supabase.from('laundry_sales').select('total_amount').eq('seller_id', businessId).gte('created_at', start.toISOString()),
      ]);
      if (bookingRes.error || saleRes.error) {
        setError(bookingRes.error?.message || saleRes.error?.message || 'Laundry tables are not ready yet. Run supabase/migrations/0003_laundry_and_public_orders.sql.');
        return;
      }
      setBookings(bookingRes.count ?? 0);
      setSales((saleRes.data ?? []).reduce((sum, row) => sum + Number(row.total_amount), 0));
    })();
  }, [businessId]);

  return (
    <div>
      <PageHeader title="Laundry overview" description="Bookings and sales for the laundry business only." />
      {error ? <p className="error-text">{error}</p> : null}
      <div className="card card-flat">
        <p>Pending website bookings: <strong>{bookings}</strong></p>
        <p>Today&apos;s laundry sales: <strong>{money(sales)}</strong></p>
      </div>
    </div>
  );
}

export function LaundryServicesPage() {
  const { businessId } = useAuth();
  const [rows, setRows] = useState<Service[]>([]);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [unit, setUnit] = useState('per load');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!businessId) return;
    const { data, error: err } = await supabase
      .from('laundry_services')
      .select('id,name,price,unit_label,is_available')
      .eq('seller_id', businessId)
      .order('sort_order');
    if (err) setError(err.message);
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
      unit_label: unit.trim() || 'per load',
    });
    if (err) {
      setError(err.message);
      return;
    }
    setName('');
    setPrice('');
    await load();
  }

  return (
    <div>
      <PageHeader title="Services and pricing" description="These prices appear on the public laundry page." />
      {error ? <p className="error-text">{error}</p> : null}
      <form className="card card-flat" onSubmit={(event) => void addService(event)}>
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
        <button className="btn btn-primary" type="submit">Add service</button>
      </form>
      <div className="card card-flat">
        <table className="data-table">
          <thead>
            <tr><th>Service</th><th>Price</th><th>Unit</th><th>Shown online</th></tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.name}</td>
                <td>{money(Number(row.price))}</td>
                <td>{row.unit_label}</td>
                <td>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => {
                      void supabase.from('laundry_services').update({ is_available: !row.is_available }).eq('id', row.id).then(() => load());
                    }}
                  >
                    {row.is_available ? 'Hide' : 'Show'}
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

export function LaundryBookingsPage() {
  const { businessId } = useAuth();
  const [rows, setRows] = useState<Booking[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!businessId) return;
    const { data, error: err } = await supabase
      .from('laundry_bookings')
      .select('id,customer_name,contact_number,address,service_summary,scheduled_for,status,source,notes')
      .eq('seller_id', businessId)
      .order('scheduled_for', { ascending: true })
      .limit(200);
    if (err) setError(err.message);
    setRows((data ?? []) as Booking[]);
  }, [businessId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <PageHeader title="Online bookings" description="Website laundry requests land here." />
      {error ? <p className="error-text">{error}</p> : null}
      <div className="card card-flat">
        <table className="data-table">
          <thead>
            <tr><th>Customer</th><th>Services</th><th>Schedule</th><th>Status</th></tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <strong>{row.customer_name}</strong>
                  <div className="muted-block">{row.contact_number}</div>
                  <div className="muted-block">{row.address}</div>
                </td>
                <td>{row.service_summary}</td>
                <td>{new Date(row.scheduled_for).toLocaleString()}</td>
                <td>
                  <select
                    value={row.status}
                    aria-label={`Booking status for ${row.customer_name}`}
                    onChange={(event) => {
                      void supabase.from('laundry_bookings').update({ status: event.target.value }).eq('id', row.id).then(() => load());
                    }}
                  >
                    {BOOKING_STATUSES.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <p className="muted-block">No bookings yet.</p> : null}
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

  useEffect(() => {
    if (!businessId) return;
    void supabase
      .from('laundry_services')
      .select('id,name,price,unit_label,is_available')
      .eq('seller_id', businessId)
      .eq('is_available', true)
      .then(({ data, error: err }) => {
        if (err) setError(err.message);
        setServices((data ?? []) as Service[]);
      });
  }, [businessId]);

  const total = useMemo(
    () => services.reduce((sum, service) => sum + Number(service.price) * (cart[service.id] ?? 0), 0),
    [cart, services]
  );

  async function checkout() {
    if (!businessId) return;
    const lines = services.filter((service) => (cart[service.id] ?? 0) > 0);
    if (lines.length === 0) {
      setError('Add a service first.');
      return;
    }
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
    if (itemErr) {
      setError(itemErr.message);
      return;
    }
    setCart({});
    setCustomer('');
    setError(null);
    setMessage(`Sale saved. ${money(total)}.`);
  }

  return (
    <div>
      <PageHeader title="Laundry POS" description="Walk-in laundry sales stay out of the water station POS." />
      {error ? <p className="error-text">{error}</p> : null}
      {message ? <p className="muted-block">{message}</p> : null}
      <div className="card card-flat">
        {services.map((service) => (
          <div key={service.id} className="admin-user-row">
            <span>{service.name} · {money(Number(service.price))} {service.unit_label}</span>
            <input
              type="number"
              min={0}
              value={cart[service.id] ?? 0}
              aria-label={`Quantity for ${service.name}`}
              onChange={(event) => setCart((current) => ({ ...current, [service.id]: Number(event.target.value) }))}
            />
          </div>
        ))}
        <div className="field">
          <label htmlFor="laundry-pos-customer">Customer name</label>
          <input id="laundry-pos-customer" value={customer} onChange={(event) => setCustomer(event.target.value)} />
        </div>
        <div className="pos-category-tabs">
          <button type="button" className={`pos-category-tab${payment === 'cash' ? ' active' : ''}`} onClick={() => setPayment('cash')}>Cash</button>
          <button type="button" className={`pos-category-tab${payment === 'gcash' ? ' active' : ''}`} onClick={() => setPayment('gcash')}>GCash</button>
        </div>
        <p>Total {money(total)}</p>
        <button type="button" className="btn btn-primary" onClick={() => void checkout()}>Save sale</button>
      </div>
    </div>
  );
}

export function LaundryTransactionsPage() {
  const { businessId } = useAuth();
  const [rows, setRows] = useState<Sale[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!businessId) return;
    void supabase
      .from('laundry_sales')
      .select('id,customer_name,payment_method,total_amount,created_at')
      .eq('seller_id', businessId)
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data, error: err }) => {
        if (err) setError(err.message);
        setRows((data ?? []) as Sale[]);
      });
  }, [businessId]);

  return (
    <div>
      <PageHeader title="Laundry transactions" description="Walk-in laundry sales." />
      {error ? <p className="error-text">{error}</p> : null}
      <div className="card card-flat">
        <table className="data-table">
          <thead><tr><th>When</th><th>Customer</th><th>Payment</th><th>Total</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{new Date(row.created_at).toLocaleString()}</td>
                <td>{row.customer_name || 'Walk-in'}</td>
                <td>{row.payment_method}</td>
                <td>{money(Number(row.total_amount))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function LaundryCustomersPage() {
  const { businessId } = useAuth();
  const [rows, setRows] = useState<Booking[]>([]);

  useEffect(() => {
    if (!businessId) return;
    void supabase
      .from('laundry_bookings')
      .select('id,customer_name,contact_number,address,service_summary,scheduled_for,status,source,notes')
      .eq('seller_id', businessId)
      .order('created_at', { ascending: false })
      .limit(300)
      .then(({ data }) => setRows((data ?? []) as Booking[]));
  }, [businessId]);

  const people = useMemo(() => {
    const map = new Map<string, Booking>();
    for (const row of rows) {
      const key = `${row.customer_name}|${row.contact_number}`;
      if (!map.has(key)) map.set(key, row);
    }
    return [...map.values()];
  }, [rows]);

  return (
    <div>
      <PageHeader title="Laundry customers" description="People who booked or were recorded in laundry." />
      <div className="card card-flat">
        <table className="data-table">
          <thead><tr><th>Name</th><th>Contact</th><th>Address</th></tr></thead>
          <tbody>
            {people.map((row) => (
              <tr key={row.id}>
                <td>{row.customer_name}</td>
                <td>{row.contact_number}</td>
                <td>{row.address}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function LaundryReportsPage() {
  const { businessId } = useAuth();
  const [sales, setSales] = useState(0);
  const [expenses, setExpenses] = useState(0);

  useEffect(() => {
    if (!businessId) return;
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    void Promise.all([
      supabase.from('laundry_sales').select('total_amount').eq('seller_id', businessId).gte('created_at', start.toISOString()),
      supabase.from('business_expenses').select('amount').eq('seller_id', businessId).eq('business_unit', 'laundry').gte('expense_date', start.toISOString().slice(0, 10)),
    ]).then(([saleRes, expenseRes]) => {
      setSales((saleRes.data ?? []).reduce((sum, row) => sum + Number(row.total_amount), 0));
      setExpenses((expenseRes.data ?? []).reduce((sum, row) => sum + Number(row.amount), 0));
    });
  }, [businessId]);

  return (
    <div>
      <PageHeader title="Laundry reports" description="This month. These figures are not added into water station sales." />
      <div className="card card-flat">
        <p>Sales {money(sales)}</p>
        <p>Expenses {money(expenses)}</p>
        <p>Net {money(sales - expenses)}</p>
      </div>
    </div>
  );
}

export function LaundrySettingsPage() {
  return (
    <div>
      <PageHeader title="Laundry settings" description="Laundry staff can be granted access in the owner portal after the database migration is applied." />
      <div className="card card-flat">
        <p className="muted-block">The store owner already has access. To add a laundry-only staff account, insert a row in user_business_roles with business_id laundry and role staff.</p>
      </div>
    </div>
  );
}
