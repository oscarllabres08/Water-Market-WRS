import { normalizeCustomerName } from './posPayment';
import { supabase } from './supabase';

export type OwnerRange = 'today' | 'week' | 'month' | 'year' | 'date';

export function ownerDateInputToday(ref = new Date()) {
  return ref.toISOString().slice(0, 10);
}

export function parseOwnerDateInput(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function ownerPreviousDateInput(value: string): string {
  const d = parseOwnerDateInput(value);
  if (!d) return value;
  d.setDate(d.getDate() - 1);
  return ownerDateInputToday(d);
}

export type OwnerTotals = {
  water: number;
  ice: number;
  laundry: number;
  wrsExpenses: number;
  laundryExpenses: number;
};

export type OwnerRecentSale = {
  id: string;
  at: string;
  business: 'Water Refilling' | 'Ice Cubes' | 'Laundry';
  productLabel: string;
  customerName: string;
  amount: number;
};

export type OwnerExpenseRow = {
  id: string;
  expense_date: string;
  business_unit: string;
  expense_type: string;
  amount: number;
};

export type OwnerStaffRow = {
  user_id: string;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  businessTags: OwnerBusinessKey[];
  role: 'Owner' | 'Admin' | 'Rider';
  status: string;
  joined_at: string | null;
  signup_channel: string | null;
};

const STAFF_TAG_LABELS: Record<OwnerBusinessKey, string> = {
  water: 'Water Refilling',
  ice: 'Ice Cubes',
  laundry: 'Laundry',
};

export function ownerStaffTagLabel(tag: OwnerBusinessKey): string {
  return STAFF_TAG_LABELS[tag];
}

export function ownerStaffMatchesBusiness(row: OwnerStaffRow, filter: OwnerBusinessKey | 'all'): boolean {
  if (filter === 'all') return true;
  if (row.role === 'Owner') return true;
  return row.businessTags.includes(filter);
}

export type OwnerCustomerRow = {
  id: string;
  name: string;
  login: string | null;
  contact: string | null;
  businessTags: OwnerBusinessKey[];
  orderCount: number;
  lastActivity: string | null;
  source: 'app' | 'walkin';
  address: string | null;
};

function walkinCustomerId(name: string) {
  return `walkin:${normalizeCustomerName(name)}`;
}

function orderBusinessTag(items: { products?: { category: string } | { category: string }[] | null }[] | null): OwnerBusinessKey {
  let hasIce = false;
  let hasWater = false;
  for (const item of items ?? []) {
    const ice = categoryOf(item.products as { category: string } | { category: string }[] | null) === 'ice';
    if (ice) hasIce = true;
    else hasWater = true;
  }
  if (hasIce && !hasWater) return 'ice';
  if (hasIce) return 'ice';
  return 'water';
}

export function ownerCustomerMatchesBusiness(row: OwnerCustomerRow, filter: OwnerBusinessKey | 'all'): boolean {
  if (filter === 'all') return true;
  return row.businessTags.includes(filter);
}

type OwnerCustomerMutable = OwnerCustomerRow & { tagSet: Set<OwnerBusinessKey> };

export async function fetchOwnerCustomerRows(businessId: string): Promise<OwnerCustomerRow[]> {
  const map = new Map<string, OwnerCustomerMutable>();

  const ensure = (id: string, seed: Partial<OwnerCustomerRow>) => {
    if (!map.has(id)) {
      map.set(id, {
        id,
        name: seed.name ?? 'Customer',
        login: seed.login ?? null,
        contact: seed.contact ?? null,
        businessTags: [],
        orderCount: 0,
        lastActivity: null,
        source: seed.source ?? 'walkin',
        address: seed.address ?? null,
        tagSet: new Set(),
      });
    }
    const row = map.get(id)!;
    if (seed.name && (row.name === 'Customer' || !row.name.trim())) row.name = seed.name;
    if (seed.login && !row.login) row.login = seed.login;
    if (seed.contact && !row.contact) row.contact = seed.contact;
    if (seed.address && !row.address) row.address = seed.address;
    return row;
  };

  const record = (id: string, tag: OwnerBusinessKey, at: string) => {
    const row = map.get(id);
    if (!row) return;
    row.tagSet.add(tag);
    row.orderCount += 1;
    if (!row.lastActivity || at > row.lastActivity) row.lastActivity = at;
  };

  const { data: profiles } = await supabase
    .from('profiles')
    .select('user_id,display_name,username,phone,address')
    .eq('role', 'customer')
    .order('created_at', { ascending: false })
    .limit(500);

  for (const profile of profiles ?? []) {
    ensure(profile.user_id, {
      name: profile.display_name?.trim() || 'Customer',
      login: profile.username?.trim() || null,
      contact: profile.phone,
      address: profile.address,
      source: 'app',
    });
  }

  const [ordersRes, posRes, laundryRes] = await Promise.all([
    supabase
      .from('orders')
      .select(
        'customer_id,customer_name,contact_number,created_at,order_items(products(category))'
      )
      .eq('seller_id', businessId)
      .neq('status', 'cancelled')
      .limit(2000),
    supabase
      .from('pos_sales')
      .select('customer_name,created_at,pos_sale_items(products(category))')
      .eq('seller_id', businessId)
      .limit(2000),
    supabase
      .from('laundry_sales')
      .select('customer_name,contact_number,created_at')
      .eq('seller_id', businessId)
      .limit(1500),
  ]);

  const registeredNames = new Set(
    [...map.values()].map((row) => normalizeCustomerName(row.name)).filter(Boolean)
  );

  for (const order of ordersRes.data ?? []) {
    const tag = orderBusinessTag(order.order_items as { products?: { category: string } | { category: string }[] | null }[] | null);
    const guestName = order.customer_name?.trim() ?? '';
    const userId = order.customer_id;
    const id = userId ? String(userId) : guestName ? walkinCustomerId(guestName) : '';
    if (!id) continue;
    if (!userId && guestName && registeredNames.has(normalizeCustomerName(guestName))) continue;
    ensure(id, {
      name: guestName || undefined,
      contact: order.contact_number,
      source: userId ? 'app' : 'walkin',
    });
    record(id, tag, order.created_at);
  }

  for (const sale of posRes.data ?? []) {
    const name = sale.customer_name?.trim();
    if (!name) continue;
    const id = walkinCustomerId(name);
    const tag = orderBusinessTag(sale.pos_sale_items as { products?: { category: string } | { category: string }[] | null }[] | null);
    ensure(id, { name, source: 'walkin' });
    record(id, tag, sale.created_at);
  }

  for (const sale of laundryRes.data ?? []) {
    const name = sale.customer_name?.trim() || 'Customer';
    const id = walkinCustomerId(`laundry:${name}`);
    ensure(id, { name, contact: sale.contact_number, source: 'walkin' });
    record(id, 'laundry', sale.created_at);
  }

  return [...map.values()]
    .map((row) => ({
      id: row.id,
      name: row.name,
      login: row.login,
      contact: row.contact,
      businessTags: row.tagSet.size ? [...row.tagSet].sort() : [],
      orderCount: row.orderCount,
      lastActivity: row.lastActivity,
      source: row.source,
      address: row.address,
    }))
    .sort((a, b) => {
      const at = b.lastActivity ?? '';
      const bt = a.lastActivity ?? '';
      if (at !== bt) return at.localeCompare(bt);
      return a.name.localeCompare(b.name);
    });
}

function staffBusinessTags(roleUnits: Set<string>, isOwner: boolean): OwnerBusinessKey[] {
  if (isOwner) return ['water', 'ice', 'laundry'];
  const hasLaundry = roleUnits.has('laundry');
  const hasWrs = roleUnits.has('wrs') || roleUnits.size === 0;
  const tags: OwnerBusinessKey[] = [];
  if (hasWrs) tags.push('water', 'ice');
  if (hasLaundry) tags.push('laundry');
  if (tags.length === 0) tags.push('water', 'ice');
  return [...new Set(tags)];
}

export type OwnerDayPoint = {
  key: string;
  label: string;
  water: number;
  ice: number;
  laundry: number;
  total: number;
};

export type TopCustomer = {
  name: string;
  amount: number;
};

export type OwnerBusinessKey = 'water' | 'ice' | 'laundry';

export type OwnerBusinessIncome = {
  key: OwnerBusinessKey;
  label: string;
  gross: number;
  expenses: number;
  net: number;
};

export function ownerExpenseByBusiness(totals: OwnerTotals): Record<OwnerBusinessKey, number> {
  const rows = ownerBusinessIncomes(totals);
  return {
    water: rows.find((r) => r.key === 'water')!.expenses,
    ice: rows.find((r) => r.key === 'ice')!.expenses,
    laundry: rows.find((r) => r.key === 'laundry')!.expenses,
  };
}

export function ownerBusinessIncomes(totals: OwnerTotals): OwnerBusinessIncome[] {
  const wrsSales = totals.water + totals.ice;
  const wrsShare = totals.wrsExpenses;
  const waterExpense = wrsSales > 0 ? wrsShare * (totals.water / wrsSales) : wrsShare / 2;
  const iceExpense = wrsSales > 0 ? wrsShare * (totals.ice / wrsSales) : wrsShare / 2;
  return [
    {
      key: 'water',
      label: 'Water Refilling',
      gross: totals.water,
      expenses: waterExpense,
      net: totals.water - waterExpense,
    },
    {
      key: 'ice',
      label: 'Ice Cubes',
      gross: totals.ice,
      expenses: iceExpense,
      net: totals.ice - iceExpense,
    },
    {
      key: 'laundry',
      label: 'Laundry',
      gross: totals.laundry,
      expenses: totals.laundryExpenses,
      net: totals.laundry - totals.laundryExpenses,
    },
  ];
}

const EMPTY_TOTALS: OwnerTotals = { water: 0, ice: 0, laundry: 0, wrsExpenses: 0, laundryExpenses: 0 };

export function ownerRangeStart(range: OwnerRange, ref = new Date(), dateInput?: string) {
  if (range === 'date' && dateInput) {
    const day = parseOwnerDateInput(dateInput);
    if (day) {
      day.setHours(0, 0, 0, 0);
      return day;
    }
  }
  const now = new Date(ref);
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
  return now;
}

export function ownerRangeEnd(range: OwnerRange, ref = new Date(), dateInput?: string) {
  if (range === 'date' && dateInput) {
    const day = parseOwnerDateInput(dateInput);
    if (day) {
      day.setHours(23, 59, 59, 999);
      return day;
    }
  }
  const end = new Date(ref);
  end.setHours(23, 59, 59, 999);
  return end;
}

export function ownerPreviousRangeStart(range: OwnerRange, ref = new Date(), dateInput?: string) {
  if (range === 'date' && dateInput) {
    const prevInput = ownerPreviousDateInput(dateInput);
    const day = parseOwnerDateInput(prevInput);
    if (day) {
      day.setHours(0, 0, 0, 0);
      return day;
    }
  }
  const end = ownerRangeStart(range, ref, dateInput);
  const prev = new Date(end);
  if (range === 'today') prev.setDate(prev.getDate() - 1);
  if (range === 'week') prev.setDate(prev.getDate() - 7);
  if (range === 'month') prev.setMonth(prev.getMonth() - 1);
  if (range === 'year') prev.setFullYear(prev.getFullYear() - 1);
  return ownerRangeStart(range, prev);
}

function categoryOf(products: { category: string } | { category: string }[] | null) {
  if (Array.isArray(products)) return products[0]?.category ?? '';
  return products?.category ?? '';
}

export function pctChange(current: number, previous: number) {
  if (previous <= 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

export async function fetchOwnerTotals(businessId: string, fromIso: string, toIso?: string): Promise<OwnerTotals> {
  const next = { ...EMPTY_TOTALS };
  let posQuery = supabase
    .from('pos_sale_items')
    .select('unit_price,quantity,products(category),pos_sales!inner(created_at,seller_id)')
    .eq('pos_sales.seller_id', businessId)
    .gte('pos_sales.created_at', fromIso);
  let orderQuery = supabase
    .from('order_items')
    .select('unit_price,quantity,products(category),orders!inner(created_at,seller_id,status)')
    .eq('orders.seller_id', businessId)
    .neq('orders.status', 'cancelled')
    .gte('orders.created_at', fromIso);
  let laundryQuery = supabase.from('laundry_sales').select('total_amount,created_at').eq('seller_id', businessId).gte('created_at', fromIso);
  let expenseQuery = supabase
    .from('business_expenses')
    .select('amount,business_unit,expense_date')
    .eq('seller_id', businessId)
    .gte('expense_date', fromIso.slice(0, 10));

  if (toIso) {
    posQuery = posQuery.lte('pos_sales.created_at', toIso);
    orderQuery = orderQuery.lte('orders.created_at', toIso);
    laundryQuery = laundryQuery.lte('created_at', toIso);
    expenseQuery = expenseQuery.lte('expense_date', toIso.slice(0, 10));
  }

  const [posRes, orderRes, laundryRes, expenseRes] = await Promise.all([posQuery, orderQuery, laundryQuery, expenseQuery]);

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
  return next;
}

export async function fetchOwnerCustomerCount(businessId: string): Promise<number> {
  const names = new Set<string>();
  const [orders, pos, laundry] = await Promise.all([
    supabase.from('orders').select('customer_name').eq('seller_id', businessId).limit(2000),
    supabase.from('pos_sales').select('customer_name').eq('seller_id', businessId).limit(2000),
    supabase.from('laundry_sales').select('customer_name').eq('seller_id', businessId).limit(2000),
  ]);
  for (const row of orders.data ?? []) {
    const name = (row.customer_name ?? '').trim();
    if (name) names.add(name.toLowerCase());
  }
  for (const row of pos.data ?? []) {
    const name = (row.customer_name ?? '').trim();
    if (name) names.add(name.toLowerCase());
  }
  for (const row of laundry.data ?? []) {
    const name = (row.customer_name ?? '').trim();
    if (name) names.add(name.toLowerCase());
  }
  return names.size;
}

export async function fetchOwnerStaffCounts(businessId: string) {
  const [staffRes, laundryRoles] = await Promise.all([
    supabase
      .from('profiles')
      .select('user_id,seller_team_role,seller_join_status,signup_channel')
      .eq('seller_workspace_owner_id', businessId)
      .eq('seller_team_role', 'staff'),
    supabase.from('user_business_roles').select('user_id,business_id').eq('business_id', 'laundry'),
  ]);
  const rows = staffRes.data ?? [];
  const active = rows.filter((r) => r.seller_join_status === 'approved');
  const riders = active.filter((r) => (r.signup_channel ?? 'rider') !== 'admin').length;
  const admins = active.filter((r) => r.signup_channel === 'admin').length;
  const laundryIds = new Set((laundryRoles.data ?? []).filter((r) => r.business_id === 'laundry').map((r) => r.user_id));
  const laundryStaff = active.filter((r) => laundryIds.has(r.user_id)).length;
  return {
    totalUsers: active.length + 1,
    staff: active.length,
    riders,
    admins: admins + 1,
    laundryStaff,
  };
}

export async function fetchOwnerRecentSales(businessId: string, limit = 8): Promise<OwnerRecentSale[]> {
  const [posRes, orderRes, laundryRes] = await Promise.all([
    supabase
      .from('pos_sales')
      .select('id,created_at,customer_name,pos_sale_items(product_name,quantity,unit_price,products(category))')
      .eq('seller_id', businessId)
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase
      .from('orders')
      .select('id,created_at,customer_name,order_items(product_name,quantity,unit_price,products(category))')
      .eq('seller_id', businessId)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase
      .from('laundry_sales')
      .select('id,created_at,customer_name,total_amount')
      .eq('seller_id', businessId)
      .order('created_at', { ascending: false })
      .limit(limit),
  ]);

  const rows: OwnerRecentSale[] = [];

  for (const sale of posRes.data ?? []) {
    const items = sale.pos_sale_items ?? [];
    const amount = items.reduce((sum, item) => sum + Number(item.unit_price) * Number(item.quantity), 0);
    const hasIce = items.some((item) => categoryOf(item.products as { category: string } | { category: string }[] | null) === 'ice');
    const hasWater = items.some((item) => categoryOf(item.products as { category: string } | { category: string }[] | null) !== 'ice');
    rows.push({
      id: `pos:${sale.id}`,
      at: sale.created_at,
      business: hasIce && !hasWater ? 'Ice Cubes' : hasIce ? 'Ice Cubes' : 'Water Refilling',
      productLabel: items.map((item) => `${item.quantity} × ${item.product_name}`).join(', ') || 'POS sale',
      customerName: sale.customer_name?.trim() || 'Walk-in',
      amount,
    });
  }

  for (const order of orderRes.data ?? []) {
    const items = order.order_items ?? [];
    const amount = items.reduce((sum, item) => sum + Number(item.unit_price) * Number(item.quantity), 0);
    const hasIce = items.some((item) => categoryOf(item.products as { category: string } | { category: string }[] | null) === 'ice');
    rows.push({
      id: `order:${order.id}`,
      at: order.created_at,
      business: hasIce ? 'Ice Cubes' : 'Water Refilling',
      productLabel: items.map((item) => `${item.quantity} × ${item.product_name}`).join(', ') || 'Order',
      customerName: order.customer_name,
      amount,
    });
  }

  for (const sale of laundryRes.data ?? []) {
    rows.push({
      id: `laundry:${sale.id}`,
      at: sale.created_at,
      business: 'Laundry',
      productLabel: 'Laundry sale',
      customerName: sale.customer_name?.trim() || 'Customer',
      amount: Number(sale.total_amount),
    });
  }

  return rows.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

function bucketKey(date: Date, range: OwnerRange) {
  if (range === 'year') return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  return date.toISOString().slice(0, 10);
}

function bucketLabel(key: string, range: OwnerRange) {
  if (range === 'year') {
    const month = Number(key.split('-')[1]) - 1;
    return new Date(2000, month, 1).toLocaleDateString('en-US', { month: 'short' });
  }
  return String(new Date(`${key}T12:00:00`).getDate());
}

export async function fetchOwnerTimeline(businessId: string, range: OwnerRange, dateInput?: string): Promise<OwnerDayPoint[]> {
  const from = ownerRangeStart(range, new Date(), dateInput);
  const to = ownerRangeEnd(range, new Date(), dateInput);
  const fromIso = from.toISOString();
  const toIso = to.toISOString();

  const buckets = new Map<string, OwnerDayPoint>();

  const ensure = (key: string) => {
    if (!buckets.has(key)) {
      buckets.set(key, { key, label: bucketLabel(key, range), water: 0, ice: 0, laundry: 0, total: 0 });
    }
    return buckets.get(key)!;
  };

  const [posRes, orderRes, laundryRes] = await Promise.all([
    supabase
      .from('pos_sale_items')
      .select('unit_price,quantity,products(category),pos_sales!inner(created_at,seller_id)')
      .eq('pos_sales.seller_id', businessId)
      .gte('pos_sales.created_at', fromIso)
      .lte('pos_sales.created_at', toIso),
    supabase
      .from('order_items')
      .select('unit_price,quantity,products(category),orders!inner(created_at,seller_id,status)')
      .eq('orders.seller_id', businessId)
      .neq('orders.status', 'cancelled')
      .gte('orders.created_at', fromIso)
      .lte('orders.created_at', toIso),
    supabase.from('laundry_sales').select('total_amount,created_at').eq('seller_id', businessId).gte('created_at', fromIso).lte('created_at', toIso),
  ]);

  const addSale = (createdAt: string, amount: number, kind: 'water' | 'ice' | 'laundry') => {
    const key = bucketKey(new Date(createdAt), range);
    const row = ensure(key);
    row[kind] += amount;
    row.total += amount;
  };

  for (const row of posRes.data ?? []) {
    const sale = row.pos_sales as unknown as { created_at: string };
    const amount = Number(row.unit_price) * Number(row.quantity);
    const ice = categoryOf(row.products as { category: string } | { category: string }[] | null) === 'ice';
    addSale(sale.created_at, amount, ice ? 'ice' : 'water');
  }
  for (const row of orderRes.data ?? []) {
    const order = row.orders as unknown as { created_at: string };
    const amount = Number(row.unit_price) * Number(row.quantity);
    const ice = categoryOf(row.products as { category: string } | { category: string }[] | null) === 'ice';
    addSale(order.created_at, amount, ice ? 'ice' : 'water');
  }
  for (const row of laundryRes.data ?? []) {
    addSale(row.created_at, Number(row.total_amount), 'laundry');
  }

  return [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export async function fetchOwnerExpenseTrend(businessId: string, fromIso: string, toDate?: string): Promise<OwnerDayPoint[]> {
  let query = supabase
    .from('business_expenses')
    .select('amount,business_unit,expense_date')
    .eq('seller_id', businessId)
    .gte('expense_date', fromIso.slice(0, 10));
  if (toDate) query = query.lte('expense_date', toDate.slice(0, 10));
  const { data } = await query;
  const buckets = new Map<string, OwnerDayPoint>();
  for (const row of data ?? []) {
    const key = row.expense_date;
    const current = buckets.get(key) ?? { key, label: String(new Date(`${key}T12:00:00`).getDate()), water: 0, ice: 0, laundry: 0, total: 0 };
    const amount = Number(row.amount);
    if (row.business_unit === 'laundry') current.laundry += amount;
    else current.water += amount;
    current.total += amount;
    buckets.set(key, current);
  }
  return [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export async function fetchOwnerExpenses(businessId: string, fromIso: string, toDate?: string): Promise<OwnerExpenseRow[]> {
  let query = supabase
    .from('business_expenses')
    .select('id,expense_date,business_unit,expense_type,amount')
    .eq('seller_id', businessId)
    .gte('expense_date', fromIso.slice(0, 10))
    .order('expense_date', { ascending: false })
    .limit(50);
  if (toDate) query = query.lte('expense_date', toDate.slice(0, 10));
  const { data } = await query;
  return (data ?? []) as OwnerExpenseRow[];
}

function lineAmount(
  unitPrice: number,
  quantity: number,
  products: { category: string } | { category: string }[] | null,
  business?: OwnerBusinessKey
) {
  const amount = Number(unitPrice) * Number(quantity);
  if (!business) return amount;
  if (business === 'laundry') return 0;
  const ice = categoryOf(products) === 'ice';
  if (business === 'ice') return ice ? amount : 0;
  return ice ? 0 : amount;
}

export async function fetchTopCustomers(
  businessId: string,
  fromIso: string,
  limit = 5,
  business?: OwnerBusinessKey
): Promise<TopCustomer[]> {
  const totals = new Map<string, number>();
  const add = (name: string, amount: number) => {
    if (amount <= 0) return;
    const key = name.trim() || 'Customer';
    totals.set(key, (totals.get(key) ?? 0) + amount);
  };

  if (!business || business === 'laundry') {
    const { data: laundry } = await supabase
      .from('laundry_sales')
      .select('customer_name,total_amount,created_at')
      .eq('seller_id', businessId)
      .gte('created_at', fromIso);
    for (const row of laundry ?? []) {
      add(row.customer_name ?? 'Customer', Number(row.total_amount));
    }
    if (business === 'laundry') {
      return [...totals.entries()]
        .map(([name, amount]) => ({ name, amount }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, limit);
    }
  }

  const [orders, pos] = await Promise.all([
    supabase
      .from('orders')
      .select('customer_name,order_items(unit_price,quantity,products(category)),created_at')
      .eq('seller_id', businessId)
      .gte('created_at', fromIso)
      .neq('status', 'cancelled'),
    supabase
      .from('pos_sales')
      .select('customer_name,pos_sale_items(unit_price,quantity,products(category)),created_at')
      .eq('seller_id', businessId)
      .gte('created_at', fromIso),
  ]);

  for (const order of orders.data ?? []) {
    const amount = (order.order_items ?? []).reduce(
      (sum, item) =>
        sum +
        lineAmount(
          Number(item.unit_price),
          Number(item.quantity),
          item.products as { category: string } | { category: string }[] | null,
          business
        ),
      0
    );
    add(order.customer_name, amount);
  }
  for (const sale of pos.data ?? []) {
    const amount = (sale.pos_sale_items ?? []).reduce(
      (sum, item) =>
        sum +
        lineAmount(
          Number(item.unit_price),
          Number(item.quantity),
          item.products as { category: string } | { category: string }[] | null,
          business
        ),
      0
    );
    add(sale.customer_name?.trim() || 'Walk-in', amount);
  }
  return [...totals.entries()]
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}

type WorkspaceStaffRpcRow = {
  user_id: string;
  display_name: string | null;
  phone: string | null;
  email: string | null;
  seller_join_status: string | null;
  created_at: string;
  signup_channel: string | null;
};

export async function fetchOwnerStaffRows(businessId: string, ownerName: string, ownerEmail: string | null): Promise<OwnerStaffRow[]> {
  const { data: staffJson, error: staffErr } = await supabase.rpc('owner_list_workspace_staff');
  let staff: WorkspaceStaffRpcRow[] = [];
  if (!staffErr && staffJson) {
    staff = (Array.isArray(staffJson) ? staffJson : []) as WorkspaceStaffRpcRow[];
  } else {
    const { data: fallback } = await supabase
      .from('profiles')
      .select('user_id,display_name,phone,seller_join_status,signup_channel,created_at')
      .eq('seller_workspace_owner_id', businessId)
      .eq('seller_team_role', 'staff')
      .order('display_name');
    staff = (fallback ?? []).map((row) => ({
      user_id: row.user_id,
      display_name: row.display_name,
      phone: row.phone,
      email: null,
      seller_join_status: row.seller_join_status,
      created_at: row.created_at ?? '',
      signup_channel: row.signup_channel ?? null,
    }));
  }

  const staffIds = staff.map((row) => row.user_id);
  const { data: roleRows } = staffIds.length
    ? await supabase.from('user_business_roles').select('user_id,business_id').in('user_id', staffIds)
    : { data: [] as { user_id: string; business_id: string }[] };

  const unitsByUser = new Map<string, Set<string>>();
  for (const row of roleRows ?? []) {
    const set = unitsByUser.get(row.user_id) ?? new Set<string>();
    set.add(row.business_id);
    unitsByUser.set(row.user_id, set);
  }

  const rows: OwnerStaffRow[] = [
    {
      user_id: businessId,
      display_name: ownerName,
      email: ownerEmail,
      phone: null,
      businessTags: ['water', 'ice', 'laundry'],
      role: 'Owner',
      status: 'Active',
      joined_at: null,
      signup_channel: 'admin',
    },
  ];

  for (const row of staff) {
    const channel = row.signup_channel ?? 'rider';
    const isAdmin = channel === 'admin';
    const status =
      row.seller_join_status === 'approved'
        ? 'Active'
        : row.seller_join_status === 'pending'
          ? 'Pending'
          : row.seller_join_status === 'rejected'
            ? 'Rejected'
            : 'Inactive';
    rows.push({
      user_id: row.user_id,
      display_name: row.display_name,
      email: row.email,
      phone: row.phone,
      businessTags: staffBusinessTags(unitsByUser.get(row.user_id) ?? new Set(), false),
      role: isAdmin ? 'Admin' : 'Rider',
      status,
      joined_at: row.created_at ?? null,
      signup_channel: channel,
    });
  }

  return rows.sort((a, b) => {
    if (a.role === 'Owner') return -1;
    if (b.role === 'Owner') return 1;
    const rank = (r: OwnerStaffRow) => (r.status === 'Pending' ? 0 : r.status === 'Active' ? 1 : 2);
    const dr = rank(a) - rank(b);
    if (dr !== 0) return dr;
    return (a.display_name ?? '').localeCompare(b.display_name ?? '');
  });
}