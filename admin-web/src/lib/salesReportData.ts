import {
  isSaleRecordedInRange,
  orderCountsTowardOnlineSales,
  posCountsTowardWalkInSales,
  saleRecordedAt,
} from './orderSalesEligible';
import { formatPosPaymentMethod } from './posPayment';
import { categoryFromProductName, type SalesCategoryKey } from './productCategory';
import { type CatalogCategory } from './inventoryStock';
import { supabase } from './supabase';

export function formatSalePaymentMethod(type: 'online' | 'walk-in', method: string | null | undefined): string {
  if (type === 'walk-in') return formatPosPaymentMethod(method);
  const m = (method ?? '').toLowerCase();
  if (m === 'gcash') return 'GCash';
  if (m === 'cod' || m === 'cash') return 'Cash';
  if (m === 'maya') return 'Maya';
  if (m === 'utang') return 'Utang';
  return method?.trim() || '—';
}

export type DashboardPeriod = 'week' | 'month' | 'year';

type OrderRow = {
  id: string;
  created_at: string;
  status: string;
  customer_name: string;
  payment_settled: boolean | null;
  payment_settled_at?: string | null;
  payment_method: string | null;
  order_source?: string | null;
  order_items: { product_name: string; unit_price: number; quantity: number; product_id?: string | null }[];
};

type PosRow = {
  id: string;
  created_at: string;
  customer_name?: string | null;
  payment_settled?: boolean | null;
  payment_settled_at?: string | null;
  payment_method?: string | null;
  pos_sale_items: { product_name: string; unit_price: number; quantity: number; product_id?: string | null }[];
};

export type TimelinePoint = {
  key: string;
  label: string;
  online: number;
  walkIn: number;
  total: number;
};

export type RecentSaleRow = {
  id: string;
  at: Date;
  type: 'online' | 'walk-in';
  amount: number;
  status: 'paid' | 'unpaid';
  paymentMethod: string;
  productLabel: string;
  customerName: string;
};

export const RECENT_SALES_PAGE = 10;

export type SalesDashboardData = {
  onlineSales: number;
  walkInSales: number;
  totalSales: number;
  onlineOrderCount: number;
  walkInTxnCount: number;
  totalOrderCount: number;
  paidOrders: number;
  unpaidOrders: number;
  timeline: TimelinePoint[];
  categoryTotals: Record<SalesCategoryKey, number>;
  topProducts: { name: string; units: number; revenue: number }[];
  recentSales: RecentSaleRow[];
  prevTotalSales: number;
  prevTotalOrders: number;
};

export function periodBounds(period: DashboardPeriod, ref = new Date()): { from: Date; to: Date; label: string } {
  const to = new Date(ref);
  to.setHours(23, 59, 59, 999);
  if (period === 'week') {
    const from = new Date(ref);
    from.setDate(from.getDate() - 6);
    from.setHours(0, 0, 0, 0);
    return { from, to, label: 'Last 7 days' };
  }
  if (period === 'month') {
    const from = new Date(ref.getFullYear(), ref.getMonth(), 1);
    from.setHours(0, 0, 0, 0);
    return { from, to, label: ref.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) };
  }
  const from = new Date(ref.getFullYear(), 0, 1);
  from.setHours(0, 0, 0, 0);
  return { from, to, label: String(ref.getFullYear()) };
}

export function previousPeriodBounds(period: DashboardPeriod, ref = new Date()): { from: Date; to: Date } {
  if (period === 'week') {
    const to = new Date(ref);
    to.setDate(to.getDate() - 7);
    to.setHours(23, 59, 59, 999);
    const from = new Date(to);
    from.setDate(from.getDate() - 6);
    from.setHours(0, 0, 0, 0);
    return { from, to };
  }
  if (period === 'month') {
    const from = new Date(ref.getFullYear(), ref.getMonth() - 1, 1);
    from.setHours(0, 0, 0, 0);
    const to = new Date(ref.getFullYear(), ref.getMonth(), 0, 23, 59, 59, 999);
    return { from, to };
  }
  const from = new Date(ref.getFullYear() - 1, 0, 1);
  const to = new Date(ref.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
  return { from, to };
}

export function monthBounds(year: number, monthIndex: number): { from: Date; to: Date } {
  const from = new Date(year, monthIndex, 1, 0, 0, 0, 0);
  const to = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
  return { from, to };
}

export function dayBounds(year: number, monthIndex: number, day: number): { from: Date; to: Date } {
  const from = new Date(year, monthIndex, day, 0, 0, 0, 0);
  const to = new Date(year, monthIndex, day, 23, 59, 59, 999);
  return { from, to };
}

/** Seven days ending on the given calendar date (inclusive). */
export function weekEndingOn(ref: Date): { from: Date; to: Date } {
  const to = new Date(ref);
  to.setHours(23, 59, 59, 999);
  const from = new Date(ref);
  from.setDate(from.getDate() - 6);
  from.setHours(0, 0, 0, 0);
  return { from, to };
}

export function yearBounds(year: number): { from: Date; to: Date } {
  return {
    from: new Date(year, 0, 1, 0, 0, 0, 0),
    to: new Date(year, 11, 31, 23, 59, 59, 999),
  };
}

function lineTotal(items: { unit_price: number; quantity: number }[]): number {
  return items.reduce((s, it) => s + Number(it.unit_price) * Number(it.quantity), 0);
}

function bucketKey(d: Date, period: DashboardPeriod): string {
  if (period === 'year') return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function bucketLabel(key: string, period: DashboardPeriod): string {
  if (period === 'year') {
    const [y, m] = key.split('-');
    const dt = new Date(Number(y), Number(m) - 1, 1);
    return dt.toLocaleDateString('en-US', { month: 'short' });
  }
  const dt = new Date(key + 'T12:00:00');
  return dt.toLocaleDateString('en-US', { weekday: 'short' });
}

function initTimeline(from: Date, to: Date, period: DashboardPeriod): Map<string, TimelinePoint> {
  const map = new Map<string, TimelinePoint>();
  if (period === 'year') {
    const y = from.getFullYear();
    for (let m = 0; m < 12; m++) {
      const key = `${y}-${String(m + 1).padStart(2, '0')}`;
      map.set(key, { key, label: bucketLabel(key, period), online: 0, walkIn: 0, total: 0 });
    }
    return map;
  }
  const cur = new Date(from);
  cur.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  while (cur <= end) {
    const key = bucketKey(cur, period);
    map.set(key, { key, label: bucketLabel(key, period), online: 0, walkIn: 0, total: 0 });
    cur.setDate(cur.getDate() + 1);
  }
  return map;
}

async function loadProductCategories(businessId: string): Promise<Map<string, CatalogCategory>> {
  const { data } = await supabase.from('products').select('id,category').eq('seller_id', businessId);
  const map = new Map<string, CatalogCategory>();
  for (const p of data ?? []) {
    const row = p as { id: string; category: CatalogCategory };
    map.set(row.id, row.category);
  }
  return map;
}

function aggregate(
  orders: OrderRow[],
  posSales: PosRow[],
  productCats: Map<string, CatalogCategory>,
  period: DashboardPeriod,
  from: Date,
  to: Date
): SalesDashboardData {
  const timelineMap = initTimeline(from, to, period);
  const categoryTotals: Record<SalesCategoryKey, number> = {
    water: 0,
    ice: 0,
    containers: 0,
    others: 0,
    accessories: 0,
  };
  const prodMap = new Map<string, { name: string; units: number; revenue: number }>();

  let onlineSales = 0;
  let walkInSales = 0;
  let onlineOrderCount = 0;
  let paidOrders = 0;
  let unpaidOrders = 0;

  const recentSales: RecentSaleRow[] = [];

  for (const o of orders) {
    const amt = lineTotal(o.order_items ?? []);
    const createdAt = new Date(o.created_at);
    const countsOnline = orderCountsTowardOnlineSales(o);
    const isPaid = o.payment_settled === true && o.status !== 'cancelled';
    const isUnpaid = o.status !== 'cancelled' && o.payment_settled !== true;
    const createdInRange = createdAt >= from && createdAt <= to;
    const revenueInRange = countsOnline && isSaleRecordedInRange(o, from, to);

    if (isUnpaid && createdInRange) unpaidOrders += 1;
    if (isPaid && isSaleRecordedInRange(o, from, to)) paidOrders += 1;

    if (revenueInRange) {
      onlineSales += amt;
      onlineOrderCount += 1;
      const recordedAt = saleRecordedAt(o)!;
      const key = bucketKey(recordedAt, period);
      const pt = timelineMap.get(key);
      if (pt) {
        pt.online += amt;
        pt.total += amt;
      }

      for (const it of o.order_items ?? []) {
        const cat = categoryFromProductName(it.product_name, it.product_id ? productCats.get(it.product_id) : null);
        const lineAmt = Number(it.unit_price) * Number(it.quantity);
        categoryTotals[cat] += lineAmt;
        const prev = prodMap.get(it.product_name) ?? { name: it.product_name, units: 0, revenue: 0 };
        prev.units += Number(it.quantity);
        prev.revenue += lineAmt;
        prodMap.set(it.product_name, prev);
      }
    }

    if (o.status !== 'cancelled' && createdInRange) {
      const names = (o.order_items ?? []).map((i) => i.product_name).slice(0, 2);
      recentSales.push({
        id: `o-${o.id}`,
        at: createdAt,
        type: 'online',
        amount: amt,
        status: isPaid ? 'paid' : 'unpaid',
        paymentMethod: formatSalePaymentMethod('online', o.payment_method),
        productLabel: names.join(', ') || 'Online order',
        customerName: o.customer_name?.trim() || 'Customer',
      });
    }
  }

  for (const s of posSales) {
    const amt = lineTotal(s.pos_sale_items ?? []);
    const createdAt = new Date(s.created_at);
    const posPaid = posCountsTowardWalkInSales(s);
    const createdInRange = createdAt >= from && createdAt <= to;
    const revenueInRange = posPaid && isSaleRecordedInRange(s, from, to);

    if (!posPaid && createdInRange) unpaidOrders += 1;
    if (posPaid && isSaleRecordedInRange(s, from, to)) paidOrders += 1;

    if (revenueInRange) {
      walkInSales += amt;
      const recordedAt = saleRecordedAt(s)!;
      const key = bucketKey(recordedAt, period);
      const pt = timelineMap.get(key);
      if (pt) {
        pt.walkIn += amt;
        pt.total += amt;
      }

      for (const it of s.pos_sale_items ?? []) {
        const cat = categoryFromProductName(it.product_name, it.product_id ? productCats.get(it.product_id) : null);
        const lineAmt = Number(it.unit_price) * Number(it.quantity);
        categoryTotals[cat] += lineAmt;
        const prev = prodMap.get(it.product_name) ?? { name: it.product_name, units: 0, revenue: 0 };
        prev.units += Number(it.quantity);
        prev.revenue += lineAmt;
        prodMap.set(it.product_name, prev);
      }
    }

    if (!createdInRange) continue;

    const names = (s.pos_sale_items ?? []).map((i) => i.product_name).slice(0, 2);
    recentSales.push({
      id: `p-${s.id}`,
      at: createdAt,
      type: 'walk-in',
      amount: amt,
      status: posPaid ? 'paid' : 'unpaid',
      paymentMethod: formatSalePaymentMethod('walk-in', s.payment_method),
      productLabel: names.join(', ') || 'Walk-in sale',
      customerName: s.customer_name?.trim() || 'Walk-in customer',
    });
  }

  recentSales.sort((a, b) => b.at.getTime() - a.at.getTime());

  const timeline = [...timelineMap.values()].sort((a, b) => a.key.localeCompare(b.key));
  const topProducts = [...prodMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  const walkInTxnCount = posSales.filter((s) => {
    const d = new Date(s.created_at);
    return d >= from && d <= to;
  }).length;

  return {
    onlineSales,
    walkInSales,
    totalSales: onlineSales + walkInSales,
    onlineOrderCount,
    walkInTxnCount,
    totalOrderCount: onlineOrderCount + walkInTxnCount,
    paidOrders,
    unpaidOrders,
    timeline,
    categoryTotals,
    topProducts,
    recentSales: recentSales.slice(0, 200),
    prevTotalSales: 0,
    prevTotalOrders: 0,
  };
}

function salesRangeOrFilter(fromIso: string, toIso: string): string {
  return [
    `and(payment_settled.eq.true,payment_settled_at.gte.${fromIso},payment_settled_at.lte.${toIso})`,
    `and(created_at.gte.${fromIso},created_at.lte.${toIso})`,
  ].join(',');
}

async function fetchRange(businessId: string, from: Date, to: Date): Promise<{ orders: OrderRow[]; pos: PosRow[] }> {
  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  const rangeOr = salesRangeOrFilter(fromIso, toIso);
  const [ordersRes, posRes] = await Promise.all([
    supabase
      .from('orders')
      .select(
        'id,created_at,status,customer_name,payment_settled,payment_settled_at,payment_method,order_source,order_items(product_name,unit_price,quantity,product_id)'
      )
      .eq('seller_id', businessId)
      .or(rangeOr),
    supabase
      .from('pos_sales')
      .select(
        'id,created_at,customer_name,payment_settled,payment_settled_at,payment_method,pos_sale_items(product_name,unit_price,quantity,product_id)'
      )
      .eq('seller_id', businessId)
      .or(rangeOr),
  ]);
  return {
    orders: ((ordersRes.data ?? []) as OrderRow[]).filter((order) => order.order_source !== 'pos'),
    pos: (posRes.data ?? []) as PosRow[],
  };
}

export type SalesDisplayMode = 'today' | 'week' | 'month' | 'year' | 'date';

/** Monday–Sunday week that contains `ref`. */
export function calendarWeekBounds(ref = new Date()): { from: Date; to: Date } {
  const from = new Date(ref);
  const weekday = from.getDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  from.setDate(from.getDate() + mondayOffset);
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(from.getDate() + 6);
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

export type SalesOverviewMonth = {
  timeline: TimelinePoint[];
  onlineSales: number;
  walkInSales: number;
  totalSales: number;
};

async function loadRangeDashboard(
  businessId: string,
  from: Date,
  to: Date,
  timelinePeriod: DashboardPeriod,
  prevFrom: Date,
  prevTo: Date,
  labelTimeline: (pts: TimelinePoint[]) => TimelinePoint[]
): Promise<SalesDashboardData> {
  const productCats = await loadProductCategories(businessId);
  const [current, previous] = await Promise.all([
    fetchRange(businessId, from, to),
    fetchRange(businessId, prevFrom, prevTo),
  ]);
  const data = aggregate(current.orders, current.pos, productCats, timelinePeriod, from, to);
  data.timeline = labelTimeline(data.timeline);
  const prevAgg = aggregate(previous.orders, previous.pos, productCats, timelinePeriod, prevFrom, prevTo);
  data.prevTotalSales = prevAgg.totalSales;
  data.prevTotalOrders = prevAgg.totalOrderCount;
  return data;
}

function dayChartLabel(pts: TimelinePoint[]): TimelinePoint[] {
  return pts.map((pt) => ({
    ...pt,
    label: new Date(`${pt.key}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  }));
}

function weekChartLabel(pts: TimelinePoint[]): TimelinePoint[] {
  return pts.map((pt) => ({
    ...pt,
    label: new Date(`${pt.key}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }),
  }));
}

function monthDayChartLabel(pts: TimelinePoint[]): TimelinePoint[] {
  return pts.map((pt) => ({ ...pt, label: String(Number(pt.key.slice(8, 10))) }));
}

/** KPIs + chart for Today, This Week, This Month, This Year, or one selected date. */
export async function loadSalesAnalyticsView(
  businessId: string,
  mode: SalesDisplayMode,
  year: number,
  monthIndex: number,
  day = 1
): Promise<SalesDashboardData> {
  const now = new Date();

  if (mode === 'today' || mode === 'date') {
    const y = mode === 'today' ? now.getFullYear() : year;
    const m = mode === 'today' ? now.getMonth() : monthIndex;
    const d = mode === 'today' ? now.getDate() : day;
    const ref = new Date(y, m, d);
    const { from, to } = dayBounds(y, m, d);
    const prevRef = new Date(ref);
    prevRef.setDate(prevRef.getDate() - 1);
    const prev = dayBounds(prevRef.getFullYear(), prevRef.getMonth(), prevRef.getDate());
    return loadRangeDashboard(businessId, from, to, 'week', prev.from, prev.to, dayChartLabel);
  }

  if (mode === 'week') {
    const { from, to } = calendarWeekBounds(now);
    const prevAnchor = new Date(from);
    prevAnchor.setDate(prevAnchor.getDate() - 1);
    const prev = calendarWeekBounds(prevAnchor);
    return loadRangeDashboard(businessId, from, to, 'week', prev.from, prev.to, weekChartLabel);
  }

  if (mode === 'month') {
    const y = now.getFullYear();
    const m = now.getMonth();
    const { from, to } = monthBounds(y, m);
    const prev = m === 0 ? monthBounds(y - 1, 11) : monthBounds(y, m - 1);
    return loadRangeDashboard(businessId, from, to, 'month', prev.from, prev.to, monthDayChartLabel);
  }

  const y = now.getFullYear();
  const { from, to } = yearBounds(y);
  const prev = yearBounds(y - 1);
  return loadRangeDashboard(businessId, from, to, 'year', prev.from, prev.to, (pts) => pts);
}

/** Daily sales timeline for one calendar month (x-axis: day 1 … last day). */
export async function loadSalesOverviewMonth(
  businessId: string,
  year: number,
  monthIndex: number
): Promise<SalesOverviewMonth> {
  const { from, to } = monthBounds(year, monthIndex);
  const prev = monthIndex === 0 ? monthBounds(year - 1, 11) : monthBounds(year, monthIndex - 1);
  const data = await loadRangeDashboard(businessId, from, to, 'month', prev.from, prev.to, monthDayChartLabel);
  return {
    timeline: data.timeline,
    onlineSales: data.onlineSales,
    walkInSales: data.walkInSales,
    totalSales: data.totalSales,
  };
}

export async function loadSalesDashboard(
  businessId: string,
  period: DashboardPeriod
): Promise<SalesDashboardData> {
  const { from, to } = periodBounds(period);
  const prev = previousPeriodBounds(period);
  const productCats = await loadProductCategories(businessId);
  const [current, previous] = await Promise.all([fetchRange(businessId, from, to), fetchRange(businessId, prev.from, prev.to)]);

  const data = aggregate(current.orders, current.pos, productCats, period, from, to);
  const prevAgg = aggregate(previous.orders, previous.pos, productCats, period, prev.from, prev.to);
  data.prevTotalSales = prevAgg.totalSales;
  data.prevTotalOrders = prevAgg.totalOrderCount;
  return data;
}

export type ExportLine = {
  product: string;
  quantity: number;
  unitPrice: number;
};

export type ExportTransaction = {
  at: Date;
  type: 'Online' | 'Walk-in';
  status: 'Paid' | 'Unpaid';
  payment: string;
  customer: string;
  itemCount: number;
  amount: number;
  products: string;
  items: ExportLine[];
};

function describeItems(items: { product_name: string; unit_price: number; quantity: number }[]): {
  products: string;
  itemCount: number;
  lines: ExportLine[];
} {
  const lines = items.map((item) => ({
    product: item.product_name,
    quantity: Number(item.quantity),
    unitPrice: Number(item.unit_price),
  }));
  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);
  const products =
    lines.length === 0
      ? '—'
      : lines.map((line) => `${line.quantity} × ${line.product} @ ₱${line.unitPrice.toFixed(2)}`).join('; ');
  return { products, itemCount, lines };
}

function buildTransactions(orders: OrderRow[], pos: PosRow[]): ExportTransaction[] {
  const rows: ExportTransaction[] = [
    ...orders.flatMap((order) => {
      if (order.status === 'cancelled') return [];
      const described = describeItems(order.order_items ?? []);
      const paid = orderCountsTowardOnlineSales(order);
      return [
        {
          at: new Date(order.created_at),
          type: 'Online' as const,
          status: paid ? ('Paid' as const) : ('Unpaid' as const),
          payment: formatSalePaymentMethod('online', order.payment_method),
          customer: order.customer_name?.trim() || 'Customer',
          itemCount: described.itemCount,
          amount: lineTotal(order.order_items ?? []),
          products: described.products,
          items: described.lines,
        },
      ];
    }),
    ...pos.map((sale) => {
      const described = describeItems(sale.pos_sale_items ?? []);
      const paid = posCountsTowardWalkInSales(sale);
      return {
        at: new Date(sale.created_at),
        type: 'Walk-in' as const,
        status: paid ? ('Paid' as const) : ('Unpaid' as const),
        payment: formatSalePaymentMethod('walk-in', sale.payment_method),
        customer: sale.customer_name?.trim() || 'Walk-in customer',
        itemCount: described.itemCount,
        amount: lineTotal(sale.pos_sale_items ?? []),
        products: described.products,
        items: described.lines,
      };
    }),
  ];
  rows.sort((a, b) => b.at.getTime() - a.at.getTime());
  return rows;
}

export type DayExportPayload = {
  dayLabel: string;
  generatedAt: Date;
  data: SalesDashboardData;
  transactions: ExportTransaction[];
};

export async function fetchDayExportPayload(
  businessId: string,
  year: number,
  monthIndex: number,
  day: number
): Promise<DayExportPayload> {
  const { from, to } = dayBounds(year, monthIndex, day);
  const productCats = await loadProductCategories(businessId);
  const { orders, pos } = await fetchRange(businessId, from, to);
  const data = aggregate(orders, pos, productCats, 'week', from, to);
  const dayLabel = from.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  return {
    dayLabel,
    generatedAt: new Date(),
    data,
    transactions: buildTransactions(orders, pos),
  };
}

export type RangeExportPayload = {
  reportTitle: string;
  periodLabel: string;
  generatedAt: Date;
  data: SalesDashboardData;
  transactions: ExportTransaction[];
};

export async function fetchRangeExportPayload(
  businessId: string,
  from: Date,
  to: Date,
  timelinePeriod: DashboardPeriod,
  reportTitle: string,
  periodLabel: string
): Promise<RangeExportPayload> {
  const productCats = await loadProductCategories(businessId);
  const { orders, pos } = await fetchRange(businessId, from, to);
  const data = aggregate(orders, pos, productCats, timelinePeriod, from, to);
  return {
    reportTitle,
    periodLabel,
    generatedAt: new Date(),
    data,
    transactions: buildTransactions(orders, pos),
  };
}

export type MonthExportPayload = {
  monthLabel: string;
  generatedAt: Date;
  data: SalesDashboardData;
  transactions: ExportTransaction[];
};

export async function fetchMonthExportPayload(
  businessId: string,
  year: number,
  monthIndex: number
): Promise<MonthExportPayload> {
  const { from, to } = monthBounds(year, monthIndex);
  const productCats = await loadProductCategories(businessId);
  const { orders, pos } = await fetchRange(businessId, from, to);
  const data = aggregate(orders, pos, productCats, 'month', from, to);
  const monthLabel = from.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  return {
    monthLabel,
    generatedAt: new Date(),
    data,
    transactions: buildTransactions(orders, pos),
  };
}

export type YearMonthRow = {
  monthLabel: string;
  online: number;
  walkIn: number;
  total: number;
  onlineOrders: number;
  walkInTxns: number;
};

export type YearExportPayload = {
  year: number;
  generatedAt: Date;
  months: YearMonthRow[];
  yearTotals: {
    totalSales: number;
    onlineSales: number;
    walkInSales: number;
    onlineOrders: number;
    walkInTxns: number;
  };
  categoryTotals: Record<SalesCategoryKey, number>;
  topProducts: { name: string; units: number; revenue: number }[];
  transactions: ExportTransaction[];
};

export async function fetchYearExportPayload(businessId: string, year: number): Promise<YearExportPayload> {
  const productCats = await loadProductCategories(businessId);
  const months: YearMonthRow[] = [];
  let yearOnline = 0;
  let yearWalk = 0;
  let yearOrders = 0;
  let yearWalkTx = 0;

  for (let m = 0; m < 12; m++) {
    const { from, to } = monthBounds(year, m);
    const { orders, pos } = await fetchRange(businessId, from, to);
    const data = aggregate(orders, pos, productCats, 'month', from, to);
    yearOnline += data.onlineSales;
    yearWalk += data.walkInSales;
    yearOrders += data.onlineOrderCount;
    yearWalkTx += data.walkInTxnCount;
    months.push({
      monthLabel: from.toLocaleDateString('en-US', { month: 'long' }),
      online: data.onlineSales,
      walkIn: data.walkInSales,
      total: data.totalSales,
      onlineOrders: data.onlineOrderCount,
      walkInTxns: data.walkInTxnCount,
    });
  }

  const { from, to } = yearBounds(year);
  const { orders, pos } = await fetchRange(businessId, from, to);
  const yearData = aggregate(orders, pos, productCats, 'year', from, to);

  return {
    year,
    generatedAt: new Date(),
    months,
    yearTotals: {
      totalSales: yearOnline + yearWalk,
      onlineSales: yearOnline,
      walkInSales: yearWalk,
      onlineOrders: yearOrders,
      walkInTxns: yearWalkTx,
    },
    categoryTotals: yearData.categoryTotals,
    topProducts: yearData.topProducts,
    transactions: buildTransactions(orders, pos),
  };
}

export function pctChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

/** Percent change vs previous period — one decimal, no misleading rounding to 0%. */
export function formatPctChangeLabel(current: number, previous: number): string | null {
  if (previous <= 0) {
    if (current > 0) return 'New vs previous period';
    return null;
  }
  const pct = ((current - previous) / previous) * 100;
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}% vs previous period`;
}
