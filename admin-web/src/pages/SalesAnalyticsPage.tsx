import { useCallback, useEffect, useMemo, useRef, useState } from 'react';



import { CategoryBarChart, SalesBarChart, SalesDonutChart } from '../components/SalesCharts';
import { CalendarIcon } from '../components/UiIcons';

import { useAuth } from '../auth/AuthProvider';

import {
  downloadDaySpreadsheet,
  downloadMonthSpreadsheet,
  downloadRangeSpreadsheet,
  downloadYearSpreadsheet,
} from '../lib/exportSalesSpreadsheet';

import { money } from '../lib/format';

import {

  calendarWeekBounds,

  fetchDayExportPayload,

  fetchMonthExportPayload,

  fetchRangeExportPayload,

  fetchYearExportPayload,

  loadSalesAnalyticsView,

  formatPctChangeLabel,

  RECENT_SALES_PAGE,

  type RecentSaleRow,

  type SalesDashboardData,

} from '../lib/salesReportData';



type SalesPeriod = 'today' | 'week' | 'month' | 'year' | 'date';

const SALES_PERIODS: { id: Exclude<SalesPeriod, 'date'>; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This Week' },
  { id: 'month', label: 'This Month' },
  { id: 'year', label: 'This Year' },
];



function toDateInputValue(d: Date): string {

  const y = d.getFullYear();

  const m = String(d.getMonth() + 1).padStart(2, '0');

  const day = String(d.getDate()).padStart(2, '0');

  return `${y}-${m}-${day}`;

}



function parseDateInput(value: string): { year: number; month: number; day: number } {

  const [y, m, d] = value.split('-').map(Number);

  return { year: y, month: m - 1, day: d };

}



export function SalesAnalyticsPage() {

  const { businessId } = useAuth();

  const [period, setPeriod] = useState<SalesPeriod>('today');

  const [selectedDate, setSelectedDate] = useState(() => toDateInputValue(new Date()));

  const [data, setData] = useState<SalesDashboardData | null>(null);

  const [loading, setLoading] = useState(true);

  const [exporting, setExporting] = useState(false);

  const [exportError, setExportError] = useState<string | null>(null);

  const [selectedSale, setSelectedSale] = useState<RecentSaleRow | null>(null);

  const [recentVisible, setRecentVisible] = useState(RECENT_SALES_PAGE);
  const dateInputRef = useRef<HTMLInputElement>(null);

  const openDatePicker = useCallback(() => {
    const input = dateInputRef.current;
    if (!input) return;
    if (typeof input.showPicker === 'function') {
      try {
        input.showPicker();
        return;
      } catch {
        /* fallback below */
      }
    }
    input.focus();
    input.click();
  }, []);

  const { year: filterYear, month: filterMonth, day: filterDay } = useMemo(

    () => parseDateInput(selectedDate),

    [selectedDate]

  );



  const load = useCallback(async () => {

    if (!businessId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {

      const dash = await loadSalesAnalyticsView(businessId, period, filterYear, filterMonth, filterDay);

      setData(dash);
      setRecentVisible(RECENT_SALES_PAGE);

    } finally {

      setLoading(false);

    }

  }, [businessId, period, filterYear, filterMonth, filterDay]);



  useEffect(() => {

    void load();

  }, [load]);

  const filterLabel = useMemo(() => {
    const now = new Date();
    const longDate = (d: Date) =>
      d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    if (period === 'today') return `Today · ${longDate(now)}`;
    if (period === 'date') return longDate(new Date(filterYear, filterMonth, filterDay));
    if (period === 'week') {
      const { from, to } = calendarWeekBounds(now);
      const start = from.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const end = to.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      return `This Week · ${start} – ${end}`;
    }
    if (period === 'month') {
      return `This Month · ${now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;
    }
    return `This Year · ${now.getFullYear()}`;
  }, [period, filterYear, filterMonth, filterDay]);

  const pickerLabel = useMemo(() => {
    if (period !== 'date') return 'Select date';
    return new Date(filterYear, filterMonth, filterDay).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }, [period, filterYear, filterMonth, filterDay]);

  const chartSlotWidth = period === 'year' ? 52 : period === 'month' ? 36 : period === 'week' ? 72 : 88;



  const salesChangeLabel = data ? formatPctChangeLabel(data.totalSales, data.prevTotalSales) : null;

  const ordersChangeLabel = data ? formatPctChangeLabel(data.totalOrderCount, data.prevTotalOrders) : null;



  const onlineShare = data && data.totalSales > 0 ? (data.onlineSales / data.totalSales) * 100 : 0;

  const walkShare = data && data.totalSales > 0 ? (data.walkInSales / data.totalSales) * 100 : 0;

  const paidShare = data && data.totalOrderCount > 0 ? (data.paidOrders / data.totalOrderCount) * 100 : 0;

  const unpaidShare = data && data.totalOrderCount > 0 ? (data.unpaidOrders / data.totalOrderCount) * 100 : 0;



  async function handleExport() {
    if (!businessId) return;
    setExporting(true);
    setExportError(null);
    try {
      const now = new Date();
      if (period === 'today' || period === 'date') {
        const year = period === 'today' ? now.getFullYear() : filterYear;
        const month = period === 'today' ? now.getMonth() : filterMonth;
        const day = period === 'today' ? now.getDate() : filterDay;
        const payload = await fetchDayExportPayload(businessId, year, month, day);
        const stamp = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        await downloadDaySpreadsheet(payload, `watermarket-sales-${stamp}.xlsx`);
      } else if (period === 'week') {
        const { from, to } = calendarWeekBounds(now);
        const start = from.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const end = to.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const payload = await fetchRangeExportPayload(
          businessId,
          from,
          to,
          'week',
          'WaterMarket — Weekly Sales Report',
          `${start} – ${end}`
        );
        await downloadRangeSpreadsheet(payload, `watermarket-sales-week-${toDateInputValue(from)}.xlsx`);
      } else if (period === 'month') {
        const payload = await fetchMonthExportPayload(businessId, now.getFullYear(), now.getMonth());
        const name = `watermarket-sales-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}.xlsx`;
        await downloadMonthSpreadsheet(payload, name);
      } else {
        const payload = await fetchYearExportPayload(businessId, now.getFullYear());
        await downloadYearSpreadsheet(payload, `watermarket-sales-${now.getFullYear()}.xlsx`);
      }
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Export failed. Check your internet connection and try again.');
    } finally {
      setExporting(false);
    }
  }



  return (

    <div className="sales-analytics-layout">

      {exportError ? <p className="error-text module-alert">{exportError}</p> : null}

      <div className="sales-toolbar card card-flat">
        <div className="sales-toolbar-block">
          <div className="sales-toolbar-controls">
            <div className="sales-period-tabs" role="tablist" aria-label="Sales display period">
              {SALES_PERIODS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="tab"
                  aria-selected={period === p.id}
                  className={`pos-category-tab${period === p.id ? ' active' : ''}`}
                  onClick={() => setPeriod(p.id)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <label
              className={`sales-date-picker-btn sales-date-picker-btn--inline${period === 'date' ? ' active' : ''}`}
              title={pickerLabel}
              htmlFor="sales-display-date"
              onClick={() => openDatePicker()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openDatePicker();
                }
              }}
            >
              <span className="sales-date-picker-icon" aria-hidden>
                <CalendarIcon />
              </span>
              <span className="sales-date-picker-value">{pickerLabel}</span>
              <input
                id="sales-display-date"
                ref={dateInputRef}
                type="date"
                className="sales-date-input-overlay"
                value={selectedDate}
                onChange={(e) => {
                  if (!e.target.value) return;
                  setSelectedDate(e.target.value);
                  setPeriod('date');
                }}
                aria-label="Select date to display sales"
              />
            </label>
            <button
              type="button"
              className="btn btn-primary btn-sm sales-export-action"
              disabled={exporting}
              onClick={() => void handleExport()}
            >
              {exporting ? 'Exporting…' : 'Export Excel'}
            </button>
          </div>
          <p className="sales-filter-summary">
            <span className="sales-filter-current">{filterLabel}</span>
            <span className="sales-filter-note">Export uses this period</span>
          </p>
        </div>
      </div>



      {loading ? <p className="muted-block">Loading sales data…</p> : null}



      {data ? (

        <>

          <div className="sales-kpi-grid">

            <KpiCard label="Total Sales" value={money(data.totalSales)} changeLabel={salesChangeLabel} />

            <KpiCard label="Total Orders" value={String(data.totalOrderCount)} changeLabel={ordersChangeLabel} />

            <KpiCard label="Online Sales" value={money(data.onlineSales)} sub={`${onlineShare.toFixed(1)}% of total sales`} />

            <KpiCard label="Walk-in Sales" value={money(data.walkInSales)} sub={`${walkShare.toFixed(1)}% of total sales`} />

            <KpiCard label="Paid Orders" value={String(data.paidOrders)} sub={`${paidShare.toFixed(1)}% of orders`} />

            <KpiCard label="Unpaid Orders" value={String(data.unpaidOrders)} sub={`${unpaidShare.toFixed(1)}% of orders`} />

          </div>



          <div className="sales-charts-grid">

            <div className="card card-flat sales-chart-card">

              <h2 className="inventory-section-title">Sales Overview</h2>

              <p className="sales-chart-period-hint">

                {filterLabel}

                {period === 'week'
                  ? ' · 7 days'
                  : period === 'month'
                    ? ` · ${data.timeline.length} days`
                    : period === 'year'
                      ? ' · 12 months'
                      : ''}

              </p>

              <div className="sales-chart-legend">

                <span><i className="lg total" /> Total (bar height)</span>

                <span><i className="lg online" /> Online</span>

                <span><i className="lg walk" /> Walk-in</span>

              </div>

              <SalesBarChart points={data.timeline} slotWidth={chartSlotWidth} />

            </div>

            <div className="card card-flat sales-chart-card sales-chart-card--donut">

              <h2 className="inventory-section-title">Sales Breakdown</h2>

              <SalesDonutChart online={data.onlineSales} walkIn={data.walkInSales} total={data.totalSales} />

            </div>

          </div>



          <div className="card card-flat" style={{ marginBottom: 16 }}>

            <h2 className="inventory-section-title">Sales by Product Category</h2>

            <CategoryBarChart totals={data.categoryTotals} />

          </div>



          <div className="sales-lower-grid sales-lower-grid--recent-only">

            <div className="card card-flat">

              <h2 className="inventory-section-title">Recent Sales</h2>

              {data.recentSales.length > 0 ? (
                <p className="sales-table-hint">Tap a row to view customer details · swipe sideways for all columns</p>
              ) : null}

              <div className="table-wrap sales-table-scroll">

                <table className="data-table sales-recent-table">

                  <thead>

                    <tr>

                      <th className="sales-col-customer">Customer</th>

                      <th className="sales-col-datetime">Date &amp; Time</th>

                      <th className="sales-col-product">Product</th>

                      <th className="sales-col-type">Type</th>

                      <th className="sales-col-payment">Payment</th>

                      <th className="sales-col-amount">Amount</th>

                      <th className="sales-col-status">Status</th>

                    </tr>

                  </thead>

                  <tbody>

                    {data.recentSales.length === 0 ? (

                      <tr>

                        <td colSpan={7} className="muted-block">

                          No transactions yet.

                        </td>

                      </tr>

                    ) : (

                      data.recentSales.slice(0, recentVisible).flatMap((r, index, rows) => {
                        const day = r.at.toDateString();
                        const prevDay = index > 0 ? rows[index - 1].at.toDateString() : '';
                        const nodes = [];
                        if (day !== prevDay) {
                          nodes.push(
                            <tr key={`date-${day}`} className="sales-date-row">
                              <td colSpan={7}>
                                {r.at.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                              </td>
                            </tr>
                          );
                        }
                        nodes.push(
                          <tr
                            key={r.id}
                            className="sales-row-clickable"
                            tabIndex={0}
                            role="button"
                            onClick={() => setSelectedSale(r)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setSelectedSale(r);
                              }
                            }}
                          >
                            <td className="sales-col-customer">{r.customerName}</td>
                            <td className="sales-col-datetime">
                              {r.at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                            </td>
                            <td className="sales-col-product">{r.productLabel}</td>
                            <td className="sales-col-type">
                              <span className={`sales-pill ${r.type === 'online' ? 'online' : 'walk'}`}>
                                {r.type === 'online' ? 'Online' : 'Walk-in'}
                              </span>
                            </td>
                            <td className="sales-col-payment">
                              <span className={`sales-pill ${r.paymentMethod === 'GCash' ? 'gcash' : r.paymentMethod === 'Cash' ? 'cash' : 'neutral'}`}>
                                {r.paymentMethod}
                              </span>
                            </td>
                            <td className="sales-col-amount">{money(r.amount)}</td>
                            <td className="sales-col-status">
                              <span className={`sales-pill ${r.status}`}>{r.status === 'paid' ? 'Paid' : 'Unpaid'}</span>
                            </td>
                          </tr>
                        );
                        return nodes;
                      })

                    )}

                  </tbody>

                </table>

              </div>

              {data.recentSales.length > recentVisible ? (
                <div style={{ marginTop: 12, textAlign: 'center' }}>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setRecentVisible((v) => v + RECENT_SALES_PAGE)}
                  >
                    Show more
                  </button>
                </div>
              ) : null}

            </div>

          </div>

        </>

      ) : null}

      {selectedSale ? (
        <div className="modal-backdrop" onClick={() => setSelectedSale(null)} role="presentation">
          <div className="modal-card sales-sale-detail-modal" role="dialog" aria-labelledby="sales-sale-detail-title" onClick={(e) => e.stopPropagation()}>
            <h2 id="sales-sale-detail-title" style={{ margin: '0 0 12px', fontSize: 18 }}>
              Sale details
            </h2>
            <dl className="sales-sale-detail-list">
              <div>
                <dt>Customer</dt>
                <dd>{selectedSale.customerName}</dd>
              </div>
              <div>
                <dt>Date &amp; time</dt>
                <dd>
                  {selectedSale.at.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })},{' '}
                  {selectedSale.at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </dd>
              </div>
              <div>
                <dt>Type</dt>
                <dd>
                  <span className={`sales-pill ${selectedSale.type === 'online' ? 'online' : 'walk'}`}>
                    {selectedSale.type === 'online' ? 'Online' : 'Walk-in'}
                  </span>
                </dd>
              </div>
              <div>
                <dt>Products</dt>
                <dd>{selectedSale.productLabel}</dd>
              </div>
              <div>
                <dt>Amount</dt>
                <dd>{money(selectedSale.amount)}</dd>
              </div>
              <div>
                <dt>Payment method</dt>
                <dd>{selectedSale.paymentMethod}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>
                  <span className={`sales-pill ${selectedSale.status}`}>
                    {selectedSale.status === 'paid' ? 'Paid' : 'Unpaid'}
                  </span>
                </dd>
              </div>
            </dl>
            <button type="button" className="btn btn-primary btn-block" style={{ marginTop: 16 }} onClick={() => setSelectedSale(null)}>
              Close
            </button>
          </div>
        </div>
      ) : null}

    </div>

  );

}



function KpiCard({

  label,

  value,

  changeLabel,

  sub,

}: {

  label: string;

  value: string;

  changeLabel?: string | null;

  sub?: string;

}) {

  const changeTone =
    changeLabel?.startsWith('-') ? ' down' : changeLabel ? ' up' : '';

  return (

    <div className="sales-kpi-card">

      <div className="sales-kpi-label">{label}</div>

      <div className="sales-kpi-value">{value}</div>

      {changeLabel ? (

        <div className={`sales-kpi-delta${changeTone}`}>{changeLabel}</div>

      ) : sub ? (

        <div className="sales-kpi-sub">{sub}</div>

      ) : null}

      {changeLabel && sub ? <div className="sales-kpi-sub">{sub}</div> : null}

    </div>

  );

}

export default SalesAnalyticsPage;
