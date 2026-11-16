import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, Outlet, useLocation, useSearchParams } from 'react-router-dom';

import { useAuth } from '../../auth/AuthProvider';
import { PasswordInput } from '../../components/PasswordInput';
import { ConfirmModal } from '../../components/ConfirmModal';
import { LaundryCustomerRowMenu } from '../../components/LaundryCustomerRowMenu';
import { LaundryPeriodPicker } from '../../components/LaundryPeriodPicker';
import { PageHeader } from '../../components/PageHeader';
import { ManagementFrame } from '../../layout/ManagementFrame';
import { money } from '../../lib/format';
import {
  ownerDateInputToday,
  ownerRangeEnd,
  ownerRangeStart,
  type OwnerRange,
} from '../../lib/ownerPortalData';
import { normalizeCustomerName } from '../../lib/posPayment';
import { readCurrentPlace } from '../../lib/readCurrentPlace';
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
    <ManagementFrame
      brand="Laundry"
      section={current?.label ?? 'Laundry'}
      nav={NAV}
      signOutTo="/laundry-management/login"
      className="laundry-desk"
      showNotifications
    >
      <Outlet />
    </ManagementFrame>
  );
}

type Service = {
  id: string;
  name: string;
  price: number;
  unit_label: string;
  is_available: boolean;
  description?: string | null;
};

const LAUNDRY_UNIT_HINTS = ['per kg', 'per pc', 'per load', 'per set', 'Upto 8 kilo'];

function laundryPriceLabel(price: number, unit: string) {
  const amount = Number.isInteger(price) ? `₱${price}` : money(price);
  return `${amount} / ${unit.replace(/^per\s+/i, '')}`;
}

function bookingMapEmbed(row: Booking): string | null {
  const pin = bookingPin(row);
  const dest = pin ? `${pin.latitude},${pin.longitude}` : (row.address ?? '').trim();
  if (!dest) return null;
  return `https://maps.google.com/maps?q=${encodeURIComponent(dest)}&z=16&output=embed`;
}

function bookingMapLink(row: Booking, origin: string): string | null {
  return bookingRoute(row, origin);
}

function serviceIconClass(name: string) {
  const n = name.toLowerCase();
  if (n.includes('dry')) return 'dry';
  if (n.includes('press') || n.includes('iron')) return 'press';
  if (n.includes('bed') || n.includes('sheet')) return 'bed';
  if (n.includes('towel')) return 'towel';
  if (n.includes('fold') || n.includes('wash')) return 'wash';
  return 'default';
}
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
  const match = (row.notes ?? '').match(/pin:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  return { latitude: Number(match[1]), longitude: Number(match[2]) };
}

function bookingInstruction(notes: string | null) {
  return (notes ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !/^pin:-?\d/.test(line))
    .join('\n');
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
  const [description, setDescription] = useState('');
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<Service | null>(null);
  const [editName, setEditName] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editUnit, setEditUnit] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editAvailable, setEditAvailable] = useState(true);
  const [editSaving, setEditSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Service | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async () => {
    if (!businessId) return;
    const full = await supabase
      .from('laundry_services')
      .select('id,name,price,unit_label,is_available,description')
      .eq('seller_id', businessId)
      .order('sort_order');
    if (full.error && /description/i.test(full.error.message)) {
      const plain = await supabase
        .from('laundry_services')
        .select('id,name,price,unit_label,is_available')
        .eq('seller_id', businessId)
        .order('sort_order');
      setError(plain.error ? plain.error.message : null);
      setRows((plain.data ?? []) as Service[]);
      return;
    }
    setError(full.error ? full.error.message : null);
    setRows((full.data ?? []) as Service[]);
  }, [businessId]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (row) =>
        row.name.toLowerCase().includes(q) ||
        (row.description ?? '').toLowerCase().includes(q) ||
        row.unit_label.toLowerCase().includes(q)
    );
  }, [query, rows]);

  async function addService(event: FormEvent) {
    event.preventDefault();
    if (!businessId) return;
    const amount = Number(price);
    if (!name.trim() || !Number.isFinite(amount) || amount < 0) {
      setError('Enter a service name and price.');
      return;
    }
    setSaving(true);
    setError(null);
    const payload: Record<string, unknown> = {
      seller_id: businessId,
      name: name.trim(),
      price: amount,
      unit_label: unit.trim() || 'per kg',
      is_available: true,
      sort_order: rows.length,
    };
    const desc = description.trim();
    if (desc) payload.description = desc;
    const { error: err } = await supabase.from('laundry_services').insert(payload);
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setName('');
    setPrice('');
    setDescription('');
    await load();
  }

  function openEdit(row: Service) {
    setEditRow(row);
    setEditName(row.name);
    setEditPrice(String(row.price));
    setEditUnit(row.unit_label);
    setEditDescription(row.description?.trim() ?? '');
    setEditAvailable(row.is_available);
    setError(null);
  }

  function closeEdit() {
    setEditRow(null);
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editRow) return;
    const amount = Number(editPrice);
    if (!editName.trim() || !Number.isFinite(amount) || amount < 0) {
      setError('Enter a valid name and price.');
      return;
    }
    setEditSaving(true);
    setError(null);
    const patch: Record<string, unknown> = {
      name: editName.trim(),
      price: amount,
      unit_label: editUnit.trim() || 'per kg',
      is_available: editAvailable,
      description: editDescription.trim() || null,
    };
    const { error: err } = await supabase.from('laundry_services').update(patch).eq('id', editRow.id);
    setEditSaving(false);
    if (err) {
      if (/description/i.test(err.message)) {
        const { description: _d, ...rest } = patch;
        const retry = await supabase.from('laundry_services').update(rest).eq('id', editRow.id);
        if (retry.error) {
          setError(retry.error.message);
          return;
        }
      } else {
        setError(err.message);
        return;
      }
    }
    closeEdit();
    await load();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setError(null);
    const { error: err } = await supabase.from('laundry_services').delete().eq('id', deleteTarget.id);
    setDeleteBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    if (editRow?.id === deleteTarget.id) closeEdit();
    setDeleteTarget(null);
    await load();
  }

  return (
    <div className="ly-services-page">
      <header className="ly-services-hero card">
        <div className="ly-services-hero-text">
          <span className="ly-services-hero-kicker" aria-hidden>
            🧺
          </span>
          <h1>Laundry Services &amp; Pricing</h1>
          <p>Manage your laundry services and set prices.</p>
        </div>
        <div className="ly-services-hero-art" aria-hidden>
          <img src="/laundry.avif" alt="" />
        </div>
      </header>

      {error ? <p className="error-text">{error}</p> : null}

      <section className="card ly-services-add-card">
        <h2 className="ly-services-card-title">Add New Service</h2>
        <form className="ly-services-add-form" onSubmit={(event) => void addService(event)}>
          <div className="ly-services-add-fields">
            <div className="field">
              <label htmlFor="laundry-service-name">
                Service Name <span className="req">*</span>
              </label>
              <input
                id="laundry-service-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Wash &amp; Fold"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="laundry-service-price">
                Price (₱) <span className="req">*</span>
              </label>
              <input
                id="laundry-service-price"
                type="number"
                min={0}
                step="0.01"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                placeholder="e.g. 50.00"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="laundry-service-unit">Unit</label>
              <input
                id="laundry-service-unit"
                list="laundry-unit-hints"
                value={unit}
                onChange={(event) => setUnit(event.target.value)}
                placeholder="e.g. per kg, Upto 8 kilo"
              />
              <datalist id="laundry-unit-hints">
                {LAUNDRY_UNIT_HINTS.map((hint) => (
                  <option key={hint} value={hint} />
                ))}
              </datalist>
            </div>
            <div className="field ly-services-desc-field">
              <label htmlFor="laundry-service-desc">Description (optional)</label>
              <input
                id="laundry-service-desc"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Short description…"
              />
            </div>
          </div>
          <div className="ly-services-add-action">
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? 'Adding…' : '+ Add Service'}
            </button>
          </div>
        </form>
      </section>

      <section className="card ly-services-list-card">
        <div className="ly-services-list-head">
          <h2 className="ly-services-card-title">Services List</h2>
          <label className="ly-services-search" htmlFor="ly-services-search">
            <span className="sr-only">Search services</span>
            <input
              id="ly-services-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search services…"
            />
          </label>
        </div>

        {filtered.length === 0 ? <p className="muted-block">No services yet. Add your first service above.</p> : null}

        {filtered.length > 0 ? (
          <div className="sales-table-scroll">
            <table className="data-table ly-services-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Service Name</th>
                  <th>Price</th>
                  <th>Unit</th>
                  <th className="ly-hide-mobile">Description</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, index) => (
                  <tr key={row.id}>
                    <td data-label="#">{index + 1}</td>
                    <td data-label="Service Name">
                      <div className="ly-svc-name-cell">
                        <span className={`ly-svc-icon ly-svc-icon--${serviceIconClass(row.name)}`} aria-hidden />
                        <span>{row.name}</span>
                      </div>
                    </td>
                    <td data-label="Price">{money(Number(row.price))}</td>
                    <td data-label="Unit">{row.unit_label}</td>
                    <td className="ly-hide-mobile" data-label="Description">
                      {row.description?.trim() || '—'}
                    </td>
                    <td data-label="Status">
                      <span className={`ly-svc-status${row.is_available ? ' is-active' : ' is-hidden'}`}>
                        {row.is_available ? 'Active' : 'Hidden'}
                      </span>
                    </td>
                    <td data-label="Actions">
                      <div className="ly-svc-actions">
                        <button type="button" className="ly-svc-btn ly-svc-btn--edit" title="Edit" onClick={() => openEdit(row)}>
                          Edit
                        </button>
                        <button type="button" className="ly-svc-btn ly-svc-btn--delete" title="Delete" onClick={() => setDeleteTarget(row)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <ul className="ly-services-mobile-list" aria-label="Services">
          {filtered.map((row, index) => (
            <li key={row.id}>
              <button type="button" className="ly-services-mobile-row" onClick={() => openEdit(row)}>
                <span className={`ly-svc-icon ly-svc-icon--${serviceIconClass(row.name)}`} aria-hidden />
                <span className="ly-services-mobile-main">
                  <strong>{row.name}</strong>
                  <span>
                    {money(Number(row.price))} / {row.unit_label}
                  </span>
                </span>
                <span className={`ly-svc-status${row.is_available ? ' is-active' : ' is-hidden'}`}>
                  {row.is_available ? 'Active' : 'Hidden'}
                </span>
                <span className="ly-services-mobile-chevron" aria-hidden>
                  ›
                </span>
              </button>
              <span className="sr-only">Row {index + 1}</span>
            </li>
          ))}
        </ul>
      </section>

      {editRow ? (
        <div className="modal-backdrop" role="presentation" onClick={closeEdit}>
          <div
            className="modal-card ly-services-edit-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ly-edit-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="ly-edit-title" className="card-title">
              Edit service
            </h2>
            <form className="ly-services-add-form" onSubmit={(event) => void saveEdit(event)}>
              <div className="field">
                <label htmlFor="ly-edit-name">Service Name</label>
                <input id="ly-edit-name" value={editName} onChange={(event) => setEditName(event.target.value)} required />
              </div>
              <div className="field">
                <label htmlFor="ly-edit-price">Price (₱)</label>
                <input
                  id="ly-edit-price"
                  type="number"
                  min={0}
                  step="0.01"
                  value={editPrice}
                  onChange={(event) => setEditPrice(event.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="ly-edit-unit">Unit</label>
                <input
                  id="ly-edit-unit"
                  list="laundry-unit-hints-edit"
                  value={editUnit}
                  onChange={(event) => setEditUnit(event.target.value)}
                  placeholder="e.g. per kg, Upto 8 kilo"
                />
                <datalist id="laundry-unit-hints-edit">
                  {LAUNDRY_UNIT_HINTS.map((hint) => (
                    <option key={hint} value={hint} />
                  ))}
                  {editUnit && !LAUNDRY_UNIT_HINTS.includes(editUnit) ? <option value={editUnit} /> : null}
                </datalist>
              </div>
              <div className="field">
                <label htmlFor="ly-edit-desc">Description</label>
                <input id="ly-edit-desc" value={editDescription} onChange={(event) => setEditDescription(event.target.value)} />
              </div>
              <label className="ly-edit-toggle">
                <input type="checkbox" checked={editAvailable} onChange={(event) => setEditAvailable(event.target.checked)} />
                Show on website &amp; POS
              </label>
              <div className="ly-edit-modal-actions">
                <button type="button" className="btn btn-ghost" onClick={closeEdit}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={editSaving}>
                  {editSaving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="modal-backdrop" role="presentation" onClick={() => !deleteBusy && setDeleteTarget(null)}>
          <div
            className="modal-card"
            role="alertdialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="card-title">Delete service?</h2>
            <p>
              Remove <strong>{deleteTarget.name}</strong>? This cannot be undone.
            </p>
            <div className="ly-edit-modal-actions">
              <button type="button" className="btn btn-ghost" disabled={deleteBusy} onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger" disabled={deleteBusy} onClick={() => void confirmDelete()}>
                {deleteBusy ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
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

  useEffect(() => {
    if (!businessId) return;
    const channel = supabase
      .channel(`laundry-bookings-page-${businessId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'laundry_bookings', filter: `seller_id=eq.${businessId}` }, () => {
        void load();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [businessId, load]);

  return (
    <div>
      <PageHeader title="Bookings" description="Website and counter laundry pickups. Update status and open the map for the route." />
      {error ? <p className="error-text">{error}</p> : null}
      {rows.length === 0 ? (
        <div className="card card-flat">
          <p className="muted-block">No bookings yet.</p>
        </div>
      ) : (
        <ul className="ly-bookings-list">
          {rows.map((row) => {
            const route = bookingRoute(row, storeOrigin);
            const schedule = new Date(row.scheduled_for).toLocaleString();
            const landmark = bookingInstruction(row.notes);
            return (
              <li key={row.id} className={`ly-booking-card is-${row.status}`}>
                <div className="ly-booking-card-head">
                  <div>
                    <strong className="ly-booking-name">{row.customer_name}</strong>
                    <span className="ly-booking-source">{row.source === 'website' ? 'Website' : 'Counter'}</span>
                  </div>
                  <time className="ly-booking-when" dateTime={row.scheduled_for}>
                    {schedule}
                  </time>
                </div>
                <div className="ly-booking-body">
                  <p className="ly-booking-line">
                    <span className="ly-booking-k">Contact</span>
                    <span>{row.contact_number || '—'}</span>
                  </p>
                  {row.address ? (
                    <p className="ly-booking-line">
                      <span className="ly-booking-k">Address</span>
                      <span>{row.address}</span>
                    </p>
                  ) : null}
                  {landmark ? (
                    <p className="ly-booking-line">
                      <span className="ly-booking-k">Landmark</span>
                      <span>{landmark}</span>
                    </p>
                  ) : null}
                  <p className="ly-booking-line">
                    <span className="ly-booking-k">Services</span>
                    <span>{row.service_summary}</span>
                  </p>
                </div>
                <div className="ly-booking-foot">
                  <div className={`ly-booking-actions${route ? '' : ' is-solo'}`}>
                    {route ? (
                      <a className="ly-map ly-map--booking" href={route} target="_blank" rel="noreferrer">
                        Open in map
                      </a>
                    ) : null}
                    <label className="ly-booking-status">
                      <span className="ly-booking-k">Status</span>
                      <select
                      className={`ly-select ly-select--block is-${row.status}`}
                      value={row.status}
                      aria-label={`Booking status for ${row.customer_name}`}
                      onChange={(event) => {
                        void supabase
                          .from('laundry_bookings')
                          .update({ status: event.target.value })
                          .eq('id', row.id)
                          .then(() => load());
                      }}
                    >
                      {BOOKING_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {bookingStatusLabel(status)}
                        </option>
                      ))}
                    </select>
                    </label>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function LaundryPosPage() {
  const { businessId } = useAuth();
  const [mode, setMode] = useState<'walkin' | 'booking'>('walkin');
  const [services, setServices] = useState<Service[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [customer, setCustomer] = useState('');
  const [payment, setPayment] = useState<'cash' | 'gcash'>('cash');
  const [cashReceived, setCashReceived] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [incoming, setIncoming] = useState<Booking[]>([]);
  const [storeOrigin, setStoreOrigin] = useState(STATION_ORIGIN);
  const [mapBooking, setMapBooking] = useState<Booking | null>(null);

  const [bookName, setBookName] = useState('');
  const [bookPhone, setBookPhone] = useState('');
  const [bookAddress, setBookAddress] = useState('');
  const [bookLandmark, setBookLandmark] = useState('');
  const [bookCoords, setBookCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [bookLocating, setBookLocating] = useState(false);
  const [bookDate, setBookDate] = useState('');
  const [bookTime, setBookTime] = useState('');
  const [bookServiceId, setBookServiceId] = useState('');
  const [bookQty, setBookQty] = useState(1);
  const [bookBusy, setBookBusy] = useState(false);
  const [bookSuccess, setBookSuccess] = useState<string | null>(null);

  const loadServices = useCallback(async () => {
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

  const loadIncoming = useCallback(async () => {
    if (!businessId) return;
    const columns =
      'id,customer_name,contact_number,address,latitude,longitude,service_summary,scheduled_for,status,source,notes,created_at';
    let result = await supabase
      .from('laundry_bookings')
      .select(columns)
      .eq('seller_id', businessId)
      .in('status', ['pending', 'confirmed'])
      .order('scheduled_for', { ascending: true })
      .limit(30);
    if (result.error && /latitude|longitude|column/i.test(result.error.message)) {
      result = (await supabase
        .from('laundry_bookings')
        .select('id,customer_name,contact_number,address,service_summary,scheduled_for,status,source,notes,created_at')
        .eq('seller_id', businessId)
        .in('status', ['pending', 'confirmed'])
        .order('scheduled_for', { ascending: true })
        .limit(30)) as typeof result;
    }
    setIncoming((result.data ?? []) as Booking[]);
  }, [businessId]);

  useEffect(() => {
    void loadServices();
    void loadIncoming();
  }, [loadIncoming, loadServices]);

  useEffect(() => {
    if (!businessId) return;
    void supabase
      .from('profiles')
      .select('latitude,longitude')
      .eq('user_id', businessId)
      .maybeSingle()
      .then(({ data }) => {
        if (typeof data?.latitude === 'number' && typeof data?.longitude === 'number') {
          setStoreOrigin(`${data.latitude},${data.longitude}`);
        }
      });
  }, [businessId]);

  useEffect(() => {
    if (!businessId) return;
    const channel = supabase
      .channel(`laundry-pos-bookings-${businessId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'laundry_bookings', filter: `seller_id=eq.${businessId}` }, () => {
        void loadIncoming();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [businessId, loadIncoming]);

  const lines = services.filter((service) => (cart[service.id] ?? 0) > 0);
  const total = lines.reduce((sum, service) => sum + Number(service.price) * (cart[service.id] ?? 0), 0);
  const cashNum = Number(cashReceived.replace(/,/g, ''));
  const changeDue =
    payment === 'cash' && Number.isFinite(cashNum) && cashNum >= total ? Math.max(0, cashNum - total) : 0;
  const bookService = services.find((service) => service.id === bookServiceId) ?? null;
  const websiteBookings = useMemo(() => incoming.filter((row) => row.source === 'website'), [incoming]);

  function setQty(id: string, next: number) {
    setCart((current) => ({ ...current, [id]: Math.max(0, Math.min(50, next)) }));
  }

  function addService(service: Service) {
    setQty(service.id, (cart[service.id] ?? 0) + 1);
  }

  async function checkout() {
    if (!businessId) return;
    if (lines.length === 0) {
      setError('Add a service first.');
      return;
    }
    if (payment === 'cash') {
      if (!Number.isFinite(cashNum) || cashNum < total) {
        setError('Enter cash received (at least the total).');
        return;
      }
    }
    setBusy(true);
    setError(null);
    const cashValue = payment === 'cash' && Number.isFinite(cashNum) ? cashNum : null;
    const changeValue = payment === 'cash' && cashValue != null ? Math.max(0, cashValue - total) : null;
    const { data, error: saleErr } = await supabase
      .from('laundry_sales')
      .insert({
        seller_id: businessId,
        customer_name: customer.trim() || null,
        payment_method: payment,
        total_amount: total,
        cash_received: cashValue,
        change_due: changeValue,
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
    setCashReceived('');
    setMessage(
      `Saved ${money(total)} for ${customer.trim() || 'walk-in'}.${changeValue != null && changeValue > 0 ? ` Change: ${money(changeValue)}.` : ''}`
    );
  }

  function useBookingLocation() {
    setBookLocating(true);
    setError(null);
    void readCurrentPlace()
      .then((place) => {
        setBookCoords({ latitude: place.latitude, longitude: place.longitude });
        setBookAddress(place.address);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not get your current location.');
      })
      .finally(() => setBookLocating(false));
  }

  async function submitBooking(event: FormEvent) {
    event.preventDefault();
    if (!businessId || !bookService) {
      setError('Select a service.');
      return;
    }
    const scheduled = new Date(`${bookDate}T${bookTime}`);
    if (Number.isNaN(scheduled.getTime())) {
      setError('Choose a date and time.');
      return;
    }
    setBookBusy(true);
    setError(null);
    setBookSuccess(null);
    const summary = `${bookQty} ${bookService.unit_label} ${bookService.name}`;
    const { data: booking, error: bookErr } = await supabase
      .from('laundry_bookings')
      .insert({
        seller_id: businessId,
        customer_name: bookName.trim(),
        contact_number: bookPhone.trim(),
        address: bookAddress.trim() || null,
        latitude: bookCoords?.latitude ?? null,
        longitude: bookCoords?.longitude ?? null,
        service_summary: summary,
        scheduled_for: scheduled.toISOString(),
        status: 'confirmed',
        source: 'walk_in',
        notes: bookLandmark.trim() || null,
      })
      .select('id')
      .single();
    if (bookErr || !booking) {
      setBookBusy(false);
      setError(bookErr?.message ?? 'Could not save booking.');
      return;
    }
    const { error: itemErr } = await supabase.from('laundry_booking_items').insert({
      booking_id: booking.id,
      service_id: bookService.id,
      service_name: bookService.name,
      unit_price: bookService.price,
      quantity: bookQty,
    });
    setBookBusy(false);
    if (itemErr) {
      setError(itemErr.message);
      return;
    }
    setBookName('');
    setBookPhone('');
    setBookAddress('');
    setBookLandmark('');
    setBookCoords(null);
    setBookDate('');
    setBookTime('');
    setBookServiceId('');
    setBookQty(1);
    setBookSuccess('Booking saved. It appears in incoming bookings and Bookings tab.');
    void loadIncoming();
  }

  async function confirmWebsiteBooking(row: Booking) {
    const { error: err } = await supabase.from('laundry_bookings').update({ status: 'confirmed' }).eq('id', row.id);
    if (err) setError(err.message);
    else void loadIncoming();
  }

  const mapEmbed = mapBooking ? bookingMapEmbed(mapBooking) : null;
  const mapRoute = mapBooking ? bookingMapLink(mapBooking, storeOrigin) : null;

  return (
    <div className="ly-pos-page">
      <header className="ly-pos-hero card">
        <div>
          <h1>Laundry POS</h1>
          <p>Walk-in sales, receive bookings like the public website, and open pickup maps.</p>
        </div>
        <Link className="btn btn-ghost btn-sm" to="/laundry-management/services">
          Edit services
        </Link>
      </header>

      <div className="ly-pos-tabs" role="tablist" aria-label="POS mode">
        <button type="button" role="tab" aria-selected={mode === 'walkin'} className={mode === 'walkin' ? 'is-on' : ''} onClick={() => setMode('walkin')}>
          Walk-in sale
        </button>
        <button type="button" role="tab" aria-selected={mode === 'booking'} className={mode === 'booking' ? 'is-on' : ''} onClick={() => setMode('booking')}>
          Receive booking
        </button>
      </div>

      {error ? <p className="error-text">{error}</p> : null}
      {message ? <p className="success-text">{message}</p> : null}
      {bookSuccess ? <p className="success-text">{bookSuccess}</p> : null}

      <div className="ly-pos-shell">
        <div className="ly-pos-main">
          {mode === 'walkin' ? (
            <div className="ly-pos-walkin">
              <section className="card ly-pos-services-panel">
                <h2 className="ly-pos-panel-title">Services</h2>
                <p className="muted-block ly-pos-tap-hint">Tap a service card to add it to the ticket.</p>
                {services.length === 0 ? (
                  <p className="muted-block">No services on the POS yet. Add one in Services &amp; pricing.</p>
                ) : (
                  <div className="ly-pos-service-grid">
                    {services.map((service) => {
                      const qty = cart[service.id] ?? 0;
                      return (
                        <article
                          key={service.id}
                          className={`ly-pos-service-card${qty > 0 ? ' is-active' : ''}`}
                          role="button"
                          tabIndex={0}
                          aria-label={`Add ${service.name} to ticket`}
                          onClick={() => addService(service)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              addService(service);
                            }
                          }}
                        >
                          <span className={`ly-svc-icon ly-svc-icon--${serviceIconClass(service.name)}`} aria-hidden />
                          <strong>{service.name}</strong>
                          <span className="ly-pos-service-price">{laundryPriceLabel(Number(service.price), service.unit_label)}</span>
                          <div className="ly-step" onClick={(event) => event.stopPropagation()}>
                            <button type="button" aria-label={`Decrease ${service.name}`} onClick={() => setQty(service.id, qty - 1)}>
                              −
                            </button>
                            <b>{qty}</b>
                            <button type="button" aria-label={`Increase ${service.name}`} onClick={() => setQty(service.id, qty + 1)}>
                              +
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
              <aside className="card ly-ticket ly-pos-ticket">
                <h2 className="ly-pos-panel-title">Ticket</h2>
                {lines.length === 0 ? <p className="muted-block">Nothing added yet.</p> : null}
                <ul className="ly-ticket-lines">
                  {lines.map((service) => (
                    <li key={service.id}>
                      <span>
                        {cart[service.id]} × {service.name}
                      </span>
                      <b>{money(Number(service.price) * (cart[service.id] ?? 0))}</b>
                    </li>
                  ))}
                </ul>
                <div className="field">
                  <label htmlFor="laundry-pos-customer">Customer name</label>
                  <input
                    id="laundry-pos-customer"
                    value={customer}
                    onChange={(event) => setCustomer(event.target.value)}
                    placeholder="Walk-in name"
                  />
                </div>
                <div className="ly-pay" role="group" aria-label="Payment">
                  <button type="button" className={payment === 'cash' ? 'is-on' : ''} onClick={() => setPayment('cash')}>
                    Cash
                  </button>
                  <button type="button" className={payment === 'gcash' ? 'is-on' : ''} onClick={() => setPayment('gcash')}>
                    GCash
                  </button>
                </div>
                {payment === 'cash' ? (
                  <>
                    <div className="field">
                      <label htmlFor="laundry-pos-cash">Cash received</label>
                      <input
                        id="laundry-pos-cash"
                        type="number"
                        min={0}
                        step="0.01"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={cashReceived}
                        onChange={(event) => setCashReceived(event.target.value)}
                      />
                    </div>
                    <div className="ly-change-box">
                      <span>Change</span>
                      <strong>{money(changeDue)}</strong>
                    </div>
                  </>
                ) : null}
                <p className="ly-total">
                  <span>Total</span>
                  <strong>{money(total)}</strong>
                </p>
                <button type="button" className="btn btn-primary ly-pos-save" disabled={busy || lines.length === 0} onClick={() => void checkout()}>
                  {busy ? 'Saving…' : 'Save sale'}
                </button>
              </aside>
            </div>
          ) : (
            <form className="card ly-pos-book-form" onSubmit={(event) => void submitBooking(event)}>
              <h2 className="ly-pos-panel-title">Book pickup / delivery</h2>
              <p className="muted-block">Same fields as the public laundry page — for phone or counter bookings.</p>
              <div className="ly-split">
                <div className="field">
                  <label htmlFor="ly-book-date">Select date</label>
                  <input id="ly-book-date" type="date" value={bookDate} onChange={(event) => setBookDate(event.target.value)} required />
                </div>
                <div className="field">
                  <label htmlFor="ly-book-time">Select time</label>
                  <input id="ly-book-time" type="time" value={bookTime} onChange={(event) => setBookTime(event.target.value)} required />
                </div>
              </div>
              <div className="field">
                <label htmlFor="ly-book-address">Pickup address</label>
                <input
                  id="ly-book-address"
                  value={bookAddress}
                  onChange={(event) => setBookAddress(event.target.value)}
                  placeholder="House no., street, barangay"
                />
              </div>
              <div className="field">
                <label htmlFor="ly-book-landmark">Instruction / landmark (optional)</label>
                <textarea
                  id="ly-book-landmark"
                  value={bookLandmark}
                  onChange={(event) => setBookLandmark(event.target.value)}
                  placeholder="Gate, landmark, or how to find the house"
                  rows={2}
                  maxLength={240}
                />
              </div>
              <button className="ly-pos-loc" type="button" onClick={useBookingLocation} disabled={bookLocating}>
                {bookLocating ? 'Finding location…' : bookCoords ? 'Update current location' : 'Use current location'}
              </button>
              {bookCoords ? <p className="ly-pos-loc-note">Pin saved for map ({bookCoords.latitude.toFixed(5)}, {bookCoords.longitude.toFixed(5)}).</p> : null}
              <div className="field">
                <label htmlFor="ly-book-name">Full name</label>
                <input id="ly-book-name" value={bookName} onChange={(event) => setBookName(event.target.value)} placeholder="Juan Dela Cruz" required />
              </div>
              <div className="field">
                <label htmlFor="ly-book-phone">Contact number</label>
                <input
                  id="ly-book-phone"
                  value={bookPhone}
                  onChange={(event) => setBookPhone(event.target.value)}
                  placeholder="09xx xxx xxxx"
                  inputMode="tel"
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="ly-book-service">Select service</label>
                <select
                  id="ly-book-service"
                  className="ly-select"
                  value={bookServiceId}
                  onChange={(event) => setBookServiceId(event.target.value)}
                  required
                  disabled={services.length === 0}
                >
                  <option value="">{services.length === 0 ? 'Add services first' : 'Choose service'}</option>
                  {services.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name} · {laundryPriceLabel(Number(service.price), service.unit_label)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="ly-pos-qty-row">
                <div className="ly-step ly-pos-book-qty">
                  <button type="button" aria-label="Decrease quantity" onClick={() => setBookQty((current) => Math.max(1, current - 1))}>
                    −
                  </button>
                  <b>{bookQty}</b>
                  <button type="button" aria-label="Increase quantity" onClick={() => setBookQty((current) => Math.min(50, current + 1))}>
                    +
                  </button>
                </div>
                <span className="muted-block">{bookService ? `(${bookService.unit_label})` : '(unit)'}</span>
              </div>
              <button className="btn btn-primary ly-pos-save" type="submit" disabled={bookBusy || services.length === 0}>
                {bookBusy ? 'Saving…' : 'Confirm booking'}
              </button>
            </form>
          )}
        </div>

        <aside className="card ly-pos-incoming">
          <div className="ly-pos-incoming-head">
            <h2 className="ly-pos-panel-title">From website</h2>
            <span className="ly-pos-badge">{websiteBookings.length}</span>
          </div>
          <p className="muted-block">New bookings from the public laundry page appear here in real time.</p>
          {websiteBookings.length === 0 ? <p className="muted-block">No open website bookings.</p> : null}
          <ul className="ly-pos-incoming-list">
            {websiteBookings.map((row) => {
              const route = bookingRoute(row, storeOrigin);
              return (
                <li key={row.id} className={`ly-pos-incoming-card is-${row.status}`}>
                  <strong>{row.customer_name}</strong>
                  <span>{row.contact_number}</span>
                  <span>{new Date(row.scheduled_for).toLocaleString()}</span>
                  <span>{row.service_summary}</span>
                  {row.address ? <span className="ly-pos-addr">{row.address}</span> : null}
                  <div className="ly-pos-incoming-actions">
                    {row.status === 'pending' ? (
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => void confirmWebsiteBooking(row)}>
                        Receive
                      </button>
                    ) : (
                      <span className="ly-svc-status is-active">Confirmed</span>
                    )}
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMapBooking(row)} disabled={!bookingMapEmbed(row)}>
                      View map
                    </button>
                    {route ? (
                      <a className="ly-map" href={route} target="_blank" rel="noreferrer">
                        Open route
                      </a>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
          <Link to="/laundry-management/bookings" className="ly-pos-all-bookings">
            All bookings →
          </Link>
        </aside>
      </div>

      {mapBooking && mapEmbed ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setMapBooking(null)}>
          <div className="modal-card ly-pos-map-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <h2 className="card-title">{mapBooking.customer_name}</h2>
            <p className="muted-block">{mapBooking.address || 'Location from customer pin'}</p>
            <div className="ly-pos-map-frame">
              <iframe title={`Map for ${mapBooking.customer_name}`} src={mapEmbed} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
            </div>
            <div className="ly-edit-modal-actions">
              {mapRoute ? (
                <a className="btn btn-primary" href={mapRoute} target="_blank" rel="noreferrer">
                  Open driving route
                </a>
              ) : null}
              <button type="button" className="btn btn-ghost" onClick={() => setMapBooking(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function LaundrySalesPage() {
  const { businessId } = useAuth();
  const [range, setRange] = useState<OwnerRange>('month');
  const [dateInput, setDateInput] = useState(() => ownerDateInputToday());
  const [rows, setRows] = useState<Sale[]>([]);
  const [expenses, setExpenses] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!businessId) return;
    if (range === 'date' && !dateInput) return;
    const periodDate = range === 'date' ? dateInput : undefined;
    const from = ownerRangeStart(range, new Date(), periodDate);
    const to = ownerRangeEnd(range, new Date(), periodDate);
    const fromIso = from.toISOString();
    const toIso = to.toISOString();
    const fromDate = fromIso.slice(0, 10);
    const toDate = toIso.slice(0, 10);
    void (async () => {
      let saleRes = await supabase
        .from('laundry_sales')
        .select('id,customer_name,payment_method,total_amount,created_at,laundry_sale_items(service_name,quantity,unit_price)')
        .eq('seller_id', businessId)
        .gte('created_at', fromIso)
        .lte('created_at', toIso)
        .order('created_at', { ascending: false })
        .limit(500);
      if (saleRes.error) {
        saleRes = (await supabase
          .from('laundry_sales')
          .select('id,customer_name,payment_method,total_amount,created_at')
          .eq('seller_id', businessId)
          .gte('created_at', fromIso)
          .lte('created_at', toIso)
          .order('created_at', { ascending: false })
          .limit(500)) as typeof saleRes;
      }
      const expenseRes = await supabase
        .from('business_expenses')
        .select('amount')
        .eq('seller_id', businessId)
        .eq('business_unit', 'laundry')
        .gte('expense_date', fromDate)
        .lte('expense_date', toDate);
      setError(saleRes.error?.message || expenseRes.error?.message || null);
      setRows((saleRes.data ?? []) as Sale[]);
      setExpenses(sumAmounts(expenseRes.data ?? []));
    })();
  }, [businessId, range, dateInput]);

  const sales = sumAmounts(rows);

  return (
    <div>
      <PageHeader title="Sales" description="Laundry sales report. Water station sales are not included." />
      {error ? <p className="error-text">{error}</p> : null}
      <LaundryPeriodPicker
        range={range}
        dateInput={dateInput}
        onRange={setRange}
        onDateInput={setDateInput}
        dateInputId="laundry-sales-date"
      />
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
  const [viewFor, setViewFor] = useState<CustomerRow | null>(null);
  const [editFor, setEditFor] = useState<CustomerRow | null>(null);
  const [editName, setEditName] = useState('');
  const [editContact, setEditContact] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editBusy, setEditBusy] = useState(false);
  const [editNotice, setEditNotice] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<CustomerRow | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);

  const load = useCallback(async () => {
    if (!businessId) return;
    const [bookingRes, saleRes, savedRes, hiddenRes] = await Promise.all([
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
      supabase
        .from('seller_pos_customers')
        .select('customer_name_key,display_name,phone,address')
        .eq('seller_id', businessId),
      supabase.from('seller_hidden_pos_customers').select('customer_name_key').eq('seller_id', businessId),
    ]);
    setError(bookingRes.error?.message || saleRes.error?.message || savedRes.error?.message || null);
    const hidden = new Set((hiddenRes.data ?? []).map((row) => row.customer_name_key));
    const savedByKey = new Map(
      (savedRes.data ?? []).map((row) => [
        row.customer_name_key,
        { name: row.display_name, phone: row.phone ?? '', address: row.address ?? '' },
      ])
    );
    const map = new Map<string, CustomerRow>();
    const touch = (name: string, when: string, contact = '', address = '') => {
      const clean = name.trim();
      if (!clean) return;
      const key = normalizeCustomerName(clean);
      if (hidden.has(key)) return;
      const saved = savedByKey.get(key);
      const displayName = saved?.name?.trim() || clean;
      const current = map.get(key);
      if (!current) {
        map.set(key, {
          key,
          name: displayName,
          contact: saved?.phone || contact,
          address: saved?.address || address,
          visits: 1,
          lastSeen: when,
        });
        return;
      }
      current.visits += 1;
      if (!current.contact && contact) current.contact = contact;
      if (!current.address && address) current.address = address;
      if (new Date(when).getTime() > new Date(current.lastSeen).getTime()) current.lastSeen = when;
    };
    for (const [savedKey, saved] of savedByKey.entries()) {
      if (hidden.has(savedKey)) continue;
      if (!map.has(savedKey)) {
        map.set(savedKey, {
          key: savedKey,
          name: saved.name,
          contact: saved.phone,
          address: saved.address,
          visits: 0,
          lastSeen: new Date(0).toISOString(),
        });
      }
    }
    for (const row of bookingRes.data ?? []) touch(row.customer_name, row.created_at, row.contact_number ?? '', row.address ?? '');
    for (const row of saleRes.data ?? []) touch(row.customer_name ?? '', row.created_at);
    setPeople([...map.values()].sort((a, b) => a.name.localeCompare(b.name)));
  }, [businessId]);

  useEffect(() => {
    void load();
  }, [load]);

  function openView(row: CustomerRow) {
    setViewFor(row);
  }

  function openEdit(row: CustomerRow) {
    setEditFor(row);
    setEditName(row.name);
    setEditContact(row.contact);
    setEditAddress(row.address);
    setEditNotice(null);
  }

  function closeEdit() {
    if (editBusy) return;
    setEditFor(null);
    setEditNotice(null);
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!businessId || !editFor) return;
    const name = editName.trim().replace(/\s+/g, ' ');
    if (name.length < 2) {
      setEditNotice('Enter a customer name.');
      return;
    }
    const key = normalizeCustomerName(name);
    setEditBusy(true);
    setEditNotice(null);
    setError(null);
    const { error: err } = await supabase.from('seller_pos_customers').upsert(
      {
        seller_id: businessId,
        customer_name_key: editFor.key || key,
        display_name: name,
        phone: editContact.trim() || null,
        address: editAddress.trim() || null,
      },
      { onConflict: 'seller_id,customer_name_key' }
    );
    setEditBusy(false);
    if (err) {
      setEditNotice(/phone|address|column/i.test(err.message) ? 'Run migration 0019_customer_contact.sql, then try again.' : err.message);
      return;
    }
    setEditFor(null);
    await load();
  }

  async function confirmRemove() {
    if (!businessId || !removeTarget) return;
    setRemoveBusy(true);
    setError(null);
    const { error: err } = await supabase.from('seller_hidden_pos_customers').insert({
      seller_id: businessId,
      customer_name_key: removeTarget.key,
    });
    setRemoveBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    if (viewFor?.key === removeTarget.key) setViewFor(null);
    setRemoveTarget(null);
    await load();
  }

  return (
    <div>
      <PageHeader title="Customers" description="Names from website bookings and POS sales." />
      {error ? <p className="error-text">{error}</p> : null}
      <div className="card card-flat ly-customer-card">
        {people.length === 0 ? <p className="muted-block">No customer names yet.</p> : null}
        {people.length > 0 ? (
          <ul className="ly-customer-list">
            {people.map((row) => (
              <li key={row.key} className="ly-customer-row">
                <button type="button" className="ly-customer-name" onClick={() => openView(row)}>
                  <span className="ly-customer-initial" aria-hidden>
                    {(row.name.trim()[0] ?? 'C').toUpperCase()}
                  </span>
                  <span className="ly-customer-name-meta">
                    <span className="ly-customer-title">{row.name}</span>
                    <span className="ly-customer-sub">
                      {row.visits} visit{row.visits === 1 ? '' : 's'}
                      {row.visits > 0 && new Date(row.lastSeen).getTime() > 0
                        ? ` · Last ${new Date(row.lastSeen).toLocaleDateString()}`
                        : ''}
                    </span>
                  </span>
                </button>
                <LaundryCustomerRowMenu onEdit={() => openEdit(row)} onRemove={() => setRemoveTarget(row)} />
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {viewFor ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setViewFor(null)}>
          <div
            className="modal-card ly-customer-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ly-customer-view-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="ly-customer-view-title" className="card-title">
              Customer details
            </h2>
            <p className="ly-customer-view-name">{viewFor.name}</p>
            <dl className="ly-customer-details">
              <div>
                <dt>Contact</dt>
                <dd>{viewFor.contact || '—'}</dd>
              </div>
              <div>
                <dt>Address</dt>
                <dd>{viewFor.address || '—'}</dd>
              </div>
              <div>
                <dt>Visits</dt>
                <dd>{viewFor.visits}</dd>
              </div>
              <div>
                <dt>Last seen</dt>
                <dd>{new Date(viewFor.lastSeen).toLocaleString()}</dd>
              </div>
            </dl>
            <div className="ly-customer-modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setViewFor(null)}>
                Close
              </button>
              <button type="button" className="btn btn-primary" onClick={() => { openEdit(viewFor); setViewFor(null); }}>
                Edit details
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editFor ? (
        <div className="modal-backdrop" role="presentation" onClick={closeEdit}>
          <div className="modal-card ly-customer-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <h2 className="card-title">Edit customer</h2>
            {editNotice ? <p className="error-text">{editNotice}</p> : null}
            <form className="ly-customer-edit-form" onSubmit={(event) => void saveEdit(event)}>
              <div className="field">
                <label htmlFor="ly-cust-name">Name</label>
                <input id="ly-cust-name" value={editName} onChange={(event) => setEditName(event.target.value)} required />
              </div>
              <div className="field">
                <label htmlFor="ly-cust-phone">Contact</label>
                <input id="ly-cust-phone" value={editContact} onChange={(event) => setEditContact(event.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="ly-cust-address">Address</label>
                <input id="ly-cust-address" value={editAddress} onChange={(event) => setEditAddress(event.target.value)} />
              </div>
              <div className="ly-customer-modal-actions">
                <button type="button" className="btn btn-ghost" onClick={closeEdit} disabled={editBusy}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={editBusy}>
                  {editBusy ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <ConfirmModal
        open={!!removeTarget}
        title="Remove customer?"
        message={removeTarget ? `Hide ${removeTarget.name} from this list? Past bookings and sales stay in the system.` : ''}
        confirmLabel="Remove"
        variant="danger"
        busy={removeBusy}
        onCancel={() => {
          if (!removeBusy) setRemoveTarget(null);
        }}
        onConfirm={() => void confirmRemove()}
      />
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
