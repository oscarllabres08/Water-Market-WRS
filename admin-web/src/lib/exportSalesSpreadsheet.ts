import { SALES_CATEGORY_LABELS, type SalesCategoryKey } from './productCategory';
import type {
  DayExportPayload,
  ExportTransaction,
  MonthExportPayload,
  RangeExportPayload,
  YearExportPayload,
} from './salesReportData';

type SheetCell = string | number;
type SheetRow = SheetCell[];
type XlsxMerge = { s: { r: number; c: number }; e: { r: number; c: number } };

type ColorSpec = { rgb: string };
type BorderEdge = { style: string; color: ColorSpec };
type CellStyle = {
  font?: {
    bold?: boolean;
    color?: ColorSpec;
    sz?: number;
    name?: string;
    italic?: boolean;
  };
  fill?: { patternType: string; fgColor: ColorSpec };
  alignment?: { horizontal?: string; vertical?: string; wrapText?: boolean };
  border?: {
    top?: BorderEdge;
    bottom?: BorderEdge;
    left?: BorderEdge;
    right?: BorderEdge;
  };
  numFmt?: string;
};

type WorksheetCell = { t?: string; v?: SheetCell; s?: CellStyle };
type Worksheet = Record<string, WorksheetCell | unknown> & {
  '!cols'?: { wch: number }[];
  '!merges'?: XlsxMerge[];
  '!rows'?: { hpt?: number }[];
  '!autofilter'?: { ref: string };
  '!views'?: { state: string; ySplit: number }[];
};

type XlsxLib = {
  utils: {
    encode_cell: (addr: { r: number; c: number }) => string;
    book_new: () => unknown;
    aoa_to_sheet: (data: SheetRow[]) => Worksheet;
    book_append_sheet: (wb: unknown, ws: unknown, name: string) => void;
  };
  writeFile: (wb: unknown, filename: string) => void;
};

const XLSX_CDN = 'https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.min.js';

const COLORS = {
  navy: '06215F',
  blue: '0074F0',
  blueDeep: '0E42A8',
  blueLight: 'D6E8FF',
  bluePale: 'F3F8FF',
  ice: 'E8F3FF',
  teal: '0F766E',
  tealPale: 'E6F7F4',
  green: '166534',
  greenPale: 'DCFCE7',
  amber: '92400E',
  amberPale: 'FEF3C7',
  border: 'C5D7EE',
  white: 'FFFFFF',
  muted: '64748B',
  zebra: 'F7FBFF',
};

const META_LABELS = new Set(['Report date', 'Report period', 'Report year', 'Generated on']);

const SECTION_TITLES = new Set([
  'SUMMARY',
  'SALES BY CATEGORY',
  'TOP SELLING PRODUCTS',
  'ALL TRANSACTIONS',
  'DAILY BREAKDOWN',
  'YEAR TOTALS',
  'MONTHLY SUMMARY',
  'SALES BY CATEGORY (FULL YEAR)',
  'TOP PRODUCTS (FULL YEAR)',
  'LINE ITEMS',
]);

const SECTION_COLORS: Record<string, string> = {
  SUMMARY: COLORS.navy,
  'YEAR TOTALS': COLORS.navy,
  'SALES BY CATEGORY': COLORS.blue,
  'SALES BY CATEGORY (FULL YEAR)': COLORS.blue,
  'TOP SELLING PRODUCTS': COLORS.teal,
  'TOP PRODUCTS (FULL YEAR)': COLORS.teal,
  'DAILY BREAKDOWN': COLORS.blueDeep,
  'MONTHLY SUMMARY': COLORS.blueDeep,
  'ALL TRANSACTIONS': COLORS.navy,
  'LINE ITEMS': COLORS.blueDeep,
};

const TABLE_HEADER_FIRST = new Set([
  'Metric',
  'Category',
  '#',
  'Date',
  'Date & time',
  'Month',
]);

let xlsxLoad: Promise<XlsxLib> | null = null;

function loadXlsx(): Promise<XlsxLib> {
  if (xlsxLoad) return xlsxLoad;
  xlsxLoad = new Promise((resolve, reject) => {
    const w = window as Window & { XLSX?: XlsxLib };
    if (w.XLSX) {
      resolve(w.XLSX);
      return;
    }
    const existing = document.querySelector(`script[src="${XLSX_CDN}"]`);
    if (existing) {
      existing.addEventListener('load', () => (w.XLSX ? resolve(w.XLSX) : reject(new Error('SheetJS failed to load'))));
      existing.addEventListener('error', () => reject(new Error('SheetJS failed to load')));
      return;
    }
    const script = document.createElement('script');
    script.src = XLSX_CDN;
    script.async = true;
    script.onload = () => {
      if (w.XLSX) resolve(w.XLSX);
      else reject(new Error('SheetJS failed to load'));
    };
    script.onerror = () => reject(new Error('SheetJS failed to load'));
    document.head.appendChild(script);
  });
  return xlsxLoad;
}

function formatDateTime(d: Date): string {
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

function timelineDateLabel(isoDay: string): string {
  const d = new Date(isoDay + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function pushBlank(rows: SheetRow[]) {
  rows.push([]);
}

function pushSectionTitle(rows: SheetRow[], title: string) {
  pushBlank(rows);
  rows.push([title]);
}

function borderCell(): CellStyle['border'] {
  const edge: BorderEdge = { style: 'thin', color: { rgb: COLORS.border } };
  return { top: edge, bottom: edge, left: edge, right: edge };
}

function mergeStyle(base: CellStyle): CellStyle {
  return { ...base, border: borderCell() };
}

const PESO = '"₱"#,##0.00';

const STYLES = {
  title: mergeStyle({
    font: { bold: true, sz: 18, color: { rgb: COLORS.white }, name: 'Calibri' },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.navy } },
    alignment: { horizontal: 'left', vertical: 'center' },
  }),
  subtitle: mergeStyle({
    font: { italic: true, sz: 11, color: { rgb: COLORS.blueDeep }, name: 'Calibri' },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.ice } },
    alignment: { horizontal: 'left', vertical: 'center' },
  }),
  metaLabel: mergeStyle({
    font: { bold: true, sz: 11, color: { rgb: COLORS.navy }, name: 'Calibri' },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.bluePale } },
    alignment: { horizontal: 'left', vertical: 'center' },
  }),
  metaValue: mergeStyle({
    font: { sz: 11, color: { rgb: COLORS.navy }, name: 'Calibri' },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.bluePale } },
    alignment: { horizontal: 'left', vertical: 'center' },
  }),
  section: mergeStyle({
    font: { bold: true, sz: 12, color: { rgb: COLORS.white }, name: 'Calibri' },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.navy } },
    alignment: { horizontal: 'left', vertical: 'center' },
  }),
  tableHeader: mergeStyle({
    font: { bold: true, sz: 11, color: { rgb: COLORS.white }, name: 'Calibri' },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.blue } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  }),
  data: mergeStyle({
    font: { sz: 11, color: { rgb: COLORS.navy }, name: 'Calibri' },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.white } },
    alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
  }),
  dataStripe: mergeStyle({
    font: { sz: 11, color: { rgb: COLORS.navy }, name: 'Calibri' },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.zebra } },
    alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
  }),
  money: mergeStyle({
    font: { sz: 11, color: { rgb: COLORS.navy }, name: 'Calibri' },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.white } },
    alignment: { horizontal: 'right', vertical: 'center' },
    numFmt: PESO,
  }),
  moneyStripe: mergeStyle({
    font: { sz: 11, color: { rgb: COLORS.navy }, name: 'Calibri' },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.zebra } },
    alignment: { horizontal: 'right', vertical: 'center' },
    numFmt: PESO,
  }),
  integer: mergeStyle({
    font: { sz: 11, color: { rgb: COLORS.navy }, name: 'Calibri' },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.white } },
    alignment: { horizontal: 'center', vertical: 'center' },
    numFmt: '#,##0',
  }),
  integerStripe: mergeStyle({
    font: { sz: 11, color: { rgb: COLORS.navy }, name: 'Calibri' },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.zebra } },
    alignment: { horizontal: 'center', vertical: 'center' },
    numFmt: '#,##0',
  }),
  paid: mergeStyle({
    font: { bold: true, sz: 11, color: { rgb: COLORS.green }, name: 'Calibri' },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.greenPale } },
    alignment: { horizontal: 'center', vertical: 'center' },
  }),
  unpaid: mergeStyle({
    font: { bold: true, sz: 11, color: { rgb: COLORS.amber }, name: 'Calibri' },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.amberPale } },
    alignment: { horizontal: 'center', vertical: 'center' },
  }),
  online: mergeStyle({
    font: { bold: true, sz: 11, color: { rgb: COLORS.blueDeep }, name: 'Calibri' },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.ice } },
    alignment: { horizontal: 'center', vertical: 'center' },
  }),
  walkIn: mergeStyle({
    font: { bold: true, sz: 11, color: { rgb: COLORS.teal }, name: 'Calibri' },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.tealPale } },
    alignment: { horizontal: 'center', vertical: 'center' },
  }),
  highlight: mergeStyle({
    font: { bold: true, sz: 11, color: { rgb: COLORS.white }, name: 'Calibri' },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.blue } },
    alignment: { horizontal: 'left', vertical: 'center' },
  }),
  highlightMoney: mergeStyle({
    font: { bold: true, sz: 11, color: { rgb: COLORS.white }, name: 'Calibri' },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.blue } },
    alignment: { horizontal: 'right', vertical: 'center' },
    numFmt: PESO,
  }),
  highlightInteger: mergeStyle({
    font: { bold: true, sz: 11, color: { rgb: COLORS.white }, name: 'Calibri' },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.blue } },
    alignment: { horizontal: 'center', vertical: 'center' },
    numFmt: '#,##0',
  }),
  total: mergeStyle({
    font: { bold: true, sz: 11, color: { rgb: COLORS.white }, name: 'Calibri' },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.navy } },
    alignment: { horizontal: 'left', vertical: 'center' },
  }),
  totalMoney: mergeStyle({
    font: { bold: true, sz: 11, color: { rgb: COLORS.white }, name: 'Calibri' },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.navy } },
    alignment: { horizontal: 'right', vertical: 'center' },
    numFmt: PESO,
  }),
  totalInteger: mergeStyle({
    font: { bold: true, sz: 11, color: { rgb: COLORS.white }, name: 'Calibri' },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.navy } },
    alignment: { horizontal: 'center', vertical: 'center' },
    numFmt: '#,##0',
  }),
  footer: {
    font: { italic: true, sz: 10, color: { rgb: COLORS.muted }, name: 'Calibri' },
    alignment: { horizontal: 'left', vertical: 'center' },
  },
};

function isEmptyRow(row: SheetRow): boolean {
  return row.length === 0 || row.every((c) => c === '' || c === undefined);
}

function maxColIndex(rows: SheetRow[]): number {
  return Math.max(0, ...rows.map((r) => Math.max(0, r.length - 1)));
}

function isTableHeaderRow(row: SheetRow): boolean {
  const first = String(row[0] ?? '');
  return TABLE_HEADER_FIRST.has(first);
}

function isMoneyHeader(label: string): boolean {
  const s = label.toLowerCase();
  return (
    s.includes('(php)') ||
    s.includes('amount') ||
    s.includes('revenue') ||
    s.includes('online (php)') ||
    s.includes('walk-in (php)') ||
    s.includes('total (php)')
  );
}

function isIntegerHeader(label: string): boolean {
  const s = label.toLowerCase();
  return (
    s === '#' ||
    s === 'qty' ||
    s === 'items' ||
    s.includes('units') ||
    s.includes('orders') ||
    s.includes('txns') ||
    s.includes('transactions')
  );
}

function isTotalRow(row: SheetRow): boolean {
  return String(row[0] ?? '') === 'TOTAL';
}

function isHighlightRow(row: SheetRow): boolean {
  return String(row[0] ?? '') === 'Total sales (PHP)';
}

function columnStyleForCell(header: string, row: SheetRow, col: number, striped: boolean): CellStyle {
  const value = String(row[col] ?? '');
  if (header === 'Status' && value === 'Paid') return STYLES.paid;
  if (header === 'Status' && value === 'Unpaid') return STYLES.unpaid;
  if (header === 'Channel' && value === 'Online') return STYLES.online;
  if (header === 'Channel' && value === 'Walk-in') return STYLES.walkIn;
  if (isHighlightRow(row)) {
    if (header === 'Value' && String(row[0]).toLowerCase().includes('(php)')) return STYLES.highlightMoney;
    if (isMoneyHeader(header)) return STYLES.highlightMoney;
    if (isIntegerHeader(header)) return STYLES.highlightInteger;
    return STYLES.highlight;
  }
  if (isTotalRow(row)) {
    if (isMoneyHeader(header) || (header === 'Value' && String(row[0]).toLowerCase().includes('(php)'))) return STYLES.totalMoney;
    if (isIntegerHeader(header)) return STYLES.totalInteger;
    return STYLES.total;
  }
  if (header === 'Value' && col === 1) {
    const metric = String(row[0] ?? '').toLowerCase();
    if (metric.includes('(php)')) return striped ? STYLES.moneyStripe : STYLES.money;
    return striped ? STYLES.integerStripe : STYLES.integer;
  }
  if (isMoneyHeader(header)) return striped ? STYLES.moneyStripe : STYLES.money;
  if (isIntegerHeader(header)) return striped ? STYLES.integerStripe : STYLES.integer;
  return striped ? STYLES.dataStripe : STYLES.data;
}

function setCellStyle(XLSX: XlsxLib, ws: Worksheet, r: number, c: number, style: CellStyle) {
  const addr = XLSX.utils.encode_cell({ r, c });
  const cell = ws[addr] as WorksheetCell | undefined;
  if (!cell) return;
  cell.s = style;
}

function applyRowStyle(XLSX: XlsxLib, ws: Worksheet, r: number, c0: number, c1: number, style: CellStyle) {
  for (let c = c0; c <= c1; c++) setCellStyle(XLSX, ws, r, c, style);
}

function applySheetStyles(XLSX: XlsxLib, ws: Worksheet, rows: SheetRow[], merges: XlsxMerge[]) {
  const maxCol = maxColIndex(rows);
  let inTable = false;
  let stripe = false;
  let currentHeaders: string[] = [];
  let filterHeader = -1;
  let filterLast = -1;

  ws['!rows'] = rows.map((row, r) => {
    if (r === 0) return { hpt: 32 };
    if (String(row[0] ?? '') === 'Water refilling station') return { hpt: 20 };
    const products = row.find((cell) => String(cell).includes('×'));
    if (products && String(products).length > 42) return { hpt: 32 };
    if (!isEmptyRow(row) && SECTION_TITLES.has(String(row[0] ?? ''))) return { hpt: 22 };
    if (isTableHeaderRow(row)) return { hpt: 22 };
    return { hpt: 18 };
  });

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (isEmptyRow(row)) {
      if (filterHeader >= 0 && filterLast > filterHeader) {
        ws['!autofilter'] = { ref: `A${filterHeader + 1}:${columnLetter(Math.max(currentHeaders.length - 1, 0))}${filterLast + 1}` };
      }
      inTable = false;
      stripe = false;
      currentHeaders = [];
      filterHeader = -1;
      filterLast = -1;
      continue;
    }

    const first = String(row[0] ?? '');

    if (r === 0) {
      applyRowStyle(XLSX, ws, r, 0, maxCol, STYLES.title);
      if (!merges.some((m) => m.s.r === 0)) {
        merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: maxCol } });
      }
      continue;
    }

    if (first === 'Water refilling station') {
      merges.push({ s: { r, c: 0 }, e: { r, c: maxCol } });
      applyRowStyle(XLSX, ws, r, 0, maxCol, STYLES.subtitle);
      continue;
    }

    if (META_LABELS.has(first)) {
      setCellStyle(XLSX, ws, r, 0, STYLES.metaLabel);
      if (maxCol > 1) merges.push({ s: { r, c: 1 }, e: { r, c: maxCol } });
      for (let c = 1; c <= maxCol; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        if (!ws[addr]) ws[addr] = { t: 's', v: '' };
        setCellStyle(XLSX, ws, r, c, STYLES.metaValue);
      }
      continue;
    }

    if (SECTION_TITLES.has(first) && row.filter((c) => c !== '' && c !== undefined).length === 1) {
      inTable = false;
      stripe = false;
      currentHeaders = [];
      merges.push({ s: { r, c: 0 }, e: { r, c: maxCol } });
      const sectionStyle: CellStyle = {
        ...STYLES.section,
        fill: { patternType: 'solid', fgColor: { rgb: SECTION_COLORS[first] ?? COLORS.navy } },
      };
      applyRowStyle(XLSX, ws, r, 0, maxCol, sectionStyle);
      continue;
    }

    if (isTableHeaderRow(row)) {
      inTable = true;
      stripe = false;
      currentHeaders = row.map((c) => String(c ?? ''));
      if (currentHeaders.includes('Customer') || currentHeaders.includes('Product')) {
        filterHeader = r;
        filterLast = r;
      }
      for (let c = 0; c < row.length; c++) {
        const headerStyle: CellStyle = {
          ...STYLES.tableHeader,
          alignment: { ...STYLES.tableHeader.alignment },
        };
        if (isMoneyHeader(currentHeaders[c] ?? '')) {
          headerStyle.alignment = { ...headerStyle.alignment, horizontal: 'right' };
        } else if (isIntegerHeader(currentHeaders[c] ?? '')) {
          headerStyle.alignment = { ...headerStyle.alignment, horizontal: 'center' };
        }
        setCellStyle(XLSX, ws, r, c, headerStyle);
      }
      continue;
    }

    if (first === 'Generated by WaterMarket Admin') {
      inTable = false;
      setCellStyle(XLSX, ws, r, 0, STYLES.footer);
      continue;
    }

    if (inTable) {
      const colCount = Math.max(row.length, currentHeaders.length);
      for (let c = 0; c < colCount; c++) {
        const header = currentHeaders[c] ?? '';
        const style = columnStyleForCell(header, row, c, stripe);
        const addr = XLSX.utils.encode_cell({ r, c });
        if (!ws[addr]) ws[addr] = { t: 's', v: row[c] ?? '' };
        setCellStyle(XLSX, ws, r, c, style);
      }
      if (filterHeader >= 0 && !isTotalRow(row)) filterLast = r;
      if (!isTotalRow(row)) stripe = !stripe;
    }
  }

  if (filterHeader >= 0 && filterLast > filterHeader) {
    ws['!autofilter'] = {
      ref: `A${filterHeader + 1}:${columnLetter(Math.max(currentHeaders.length - 1, 0))}${filterLast + 1}`,
    };
  }
}

function columnLetter(index: number): string {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

type SummaryNumbers = {
  totalSales: number;
  onlineSales: number;
  walkInSales: number;
  onlineOrderCount: number;
  walkInTxnCount: number;
  paidOrders: number;
  unpaidOrders: number;
};

function shareLabel(part: number, total: number): string {
  if (total <= 0) return '0.0%';
  return `${((part / total) * 100).toFixed(1)}%`;
}

function formatClock(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function paidItemCount(transactions: ExportTransaction[]): number {
  return transactions.filter((t) => t.status === 'Paid').reduce((sum, t) => sum + t.itemCount, 0);
}

function moneySum(transactions: ExportTransaction[], status: 'Paid' | 'Unpaid'): number {
  return transactions.filter((t) => t.status === status).reduce((sum, t) => sum + t.amount, 0);
}

function productRanking(transactions: ExportTransaction[]): { name: string; units: number; revenue: number }[] {
  const map = new Map<string, { name: string; units: number; revenue: number }>();
  for (const txn of transactions) {
    if (txn.status !== 'Paid') continue;
    for (const item of txn.items) {
      const current = map.get(item.product) ?? { name: item.product, units: 0, revenue: 0 };
      current.units += item.quantity;
      current.revenue += item.quantity * item.unitPrice;
      map.set(item.product, current);
    }
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue);
}

function pushReportHead(rows: SheetRow[], title: string, periodLabel: string, periodValue: string | number, generatedAt: Date) {
  rows.push([title]);
  rows.push(['Water refilling station']);
  rows.push([periodLabel, periodValue]);
  rows.push(['Generated on', formatDateTime(generatedAt)]);
}

function pushSummary(rows: SheetRow[], data: SummaryNumbers, transactions: ExportTransaction[]) {
  const tickets = data.onlineOrderCount + data.walkInTxnCount;
  pushSectionTitle(rows, 'SUMMARY');
  rows.push(['Metric', 'Value']);
  rows.push(['Total sales (PHP)', roundMoney(data.totalSales)]);
  rows.push(['Online sales (PHP)', roundMoney(data.onlineSales)]);
  rows.push(['Walk-in sales (PHP)', roundMoney(data.walkInSales)]);
  rows.push(['Paid amount (PHP)', roundMoney(moneySum(transactions, 'Paid'))]);
  rows.push(['Unpaid amount (PHP)', roundMoney(moneySum(transactions, 'Unpaid'))]);
  rows.push(['Online orders (paid)', data.onlineOrderCount]);
  rows.push(['Walk-in transactions', data.walkInTxnCount]);
  rows.push(['Paid orders', data.paidOrders]);
  rows.push(['Unpaid orders', data.unpaidOrders]);
  rows.push(['Items sold', paidItemCount(transactions)]);
  rows.push(['Average ticket (PHP)', tickets > 0 ? roundMoney(data.totalSales / tickets) : 0]);
}

function pushCategories(rows: SheetRow[], title: string, totals: Record<SalesCategoryKey, number>, grand: number) {
  const cats = Object.keys(SALES_CATEGORY_LABELS) as SalesCategoryKey[];
  pushSectionTitle(rows, title);
  rows.push(['Category', 'Amount (PHP)', 'Share']);
  for (const key of cats) {
    rows.push([SALES_CATEGORY_LABELS[key], roundMoney(totals[key]), shareLabel(totals[key], grand)]);
  }
  rows.push(['TOTAL', roundMoney(cats.reduce((sum, key) => sum + totals[key], 0)), grand > 0 ? '100.0%' : '0.0%']);
}

function pushProducts(
  rows: SheetRow[],
  title: string,
  products: { name: string; units: number; revenue: number }[],
  emptyLabel: string
) {
  const revenue = products.reduce((sum, product) => sum + product.revenue, 0);
  const units = products.reduce((sum, product) => sum + product.units, 0);
  pushSectionTitle(rows, title);
  rows.push(['#', 'Product', 'Units sold', 'Revenue (PHP)', 'Share']);
  if (products.length === 0) {
    rows.push(['', emptyLabel, '', '', '']);
  } else {
    products.forEach((product, index) => {
      rows.push([index + 1, product.name, product.units, roundMoney(product.revenue), shareLabel(product.revenue, revenue)]);
    });
    rows.push(['TOTAL', `${products.length} products`, units, roundMoney(revenue), '100.0%']);
  }
}

function pushTransactions(rows: SheetRow[], transactions: ExportTransaction[], emptyLabel: string) {
  pushSectionTitle(rows, 'ALL TRANSACTIONS');
  rows.push(['#', 'Date', 'Time', 'Customer', 'Channel', 'Payment', 'Status', 'Items', 'Products', 'Amount (PHP)']);
  if (transactions.length === 0) {
    rows.push([emptyLabel, '', '', '', '', '', '', '', '', '']);
    return;
  }
  transactions.forEach((txn, index) => {
    rows.push([
      index + 1,
      txn.at.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      formatClock(txn.at),
      txn.customer,
      txn.type,
      txn.payment,
      txn.status,
      txn.itemCount,
      txn.products,
      roundMoney(txn.amount),
    ]);
  });
  rows.push([
    'TOTAL',
    '',
    '',
    '',
    '',
    '',
    `${transactions.length} transactions`,
    transactions.reduce((sum, txn) => sum + txn.itemCount, 0),
    '',
    roundMoney(transactions.reduce((sum, txn) => sum + txn.amount, 0)),
  ]);
}

function buildLineItemRows(
  title: string,
  periodLabel: string,
  periodValue: string | number,
  generatedAt: Date,
  transactions: ExportTransaction[]
): { rows: SheetRow[]; merges: XlsxMerge[] } {
  const rows: SheetRow[] = [];
  const merges: XlsxMerge[] = [];
  pushReportHead(rows, title, periodLabel, periodValue, generatedAt);
  pushSectionTitle(rows, 'LINE ITEMS');
  rows.push(['#', 'Date', 'Time', 'Customer', 'Channel', 'Payment', 'Status', 'Product', 'Qty', 'Unit price (PHP)', 'Line total (PHP)']);
  let lineNo = 0;
  let qty = 0;
  let total = 0;
  for (const txn of transactions) {
    const lines = txn.items.length > 0 ? txn.items : [{ product: '—', quantity: 0, unitPrice: 0 }];
    for (const item of lines) {
      lineNo += 1;
      const lineTotal = item.quantity * item.unitPrice;
      qty += item.quantity;
      total += lineTotal;
      rows.push([
        lineNo,
        txn.at.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        formatClock(txn.at),
        txn.customer,
        txn.type,
        txn.payment,
        txn.status,
        item.product,
        item.quantity,
        roundMoney(item.unitPrice),
        roundMoney(lineTotal),
      ]);
    }
  }
  if (lineNo === 0) {
    rows.push(['No line items in this period', '', '', '', '', '', '', '', '', '', '']);
  } else {
    rows.push(['TOTAL', '', '', '', '', '', `${lineNo} lines`, '', qty, '', roundMoney(total)]);
  }
  rows.push([]);
  rows.push(['Generated by WaterMarket Admin']);
  return { rows, merges };
}

function buildDayRows(payload: DayExportPayload): { rows: SheetRow[]; merges: XlsxMerge[] } {
  const { dayLabel, generatedAt, data, transactions } = payload;
  const rows: SheetRow[] = [];
  const merges: XlsxMerge[] = [];
  pushReportHead(rows, 'WaterMarket — Daily Sales Report', 'Report date', dayLabel, generatedAt);
  pushSummary(rows, data, transactions);
  pushCategories(rows, 'SALES BY CATEGORY', data.categoryTotals, data.totalSales);
  pushProducts(rows, 'TOP SELLING PRODUCTS', productRanking(transactions), 'No sales on this day');
  pushTransactions(rows, transactions, 'No transactions on this day');
  rows.push([]);
  rows.push(['Generated by WaterMarket Admin']);
  return { rows, merges };
}

function buildMonthRows(payload: MonthExportPayload, title = 'WaterMarket — Monthly Sales Report'): { rows: SheetRow[]; merges: XlsxMerge[] } {
  const { monthLabel, generatedAt, data, transactions } = payload;
  const rows: SheetRow[] = [];
  const merges: XlsxMerge[] = [];
  pushReportHead(rows, title, 'Report period', monthLabel, generatedAt);
  pushSummary(rows, data, transactions);

  pushSectionTitle(rows, 'DAILY BREAKDOWN');
  rows.push(['Date', 'Online (PHP)', 'Walk-in (PHP)', 'Total (PHP)']);
  let online = 0;
  let walkIn = 0;
  let total = 0;
  for (const point of data.timeline) {
    online += point.online;
    walkIn += point.walkIn;
    total += point.total;
    rows.push([timelineDateLabel(point.key), roundMoney(point.online), roundMoney(point.walkIn), roundMoney(point.total)]);
  }
  rows.push(['TOTAL', roundMoney(online), roundMoney(walkIn), roundMoney(total)]);

  pushCategories(rows, 'SALES BY CATEGORY', data.categoryTotals, data.totalSales);
  pushProducts(rows, 'TOP SELLING PRODUCTS', productRanking(transactions), 'No sales in this period');
  pushTransactions(rows, transactions, 'No transactions in this period');
  rows.push([]);
  rows.push(['Generated by WaterMarket Admin']);
  return { rows, merges };
}

function buildYearRows(payload: YearExportPayload): { rows: SheetRow[]; merges: XlsxMerge[] } {
  const { year, generatedAt, months, yearTotals, categoryTotals, transactions } = payload;
  const rows: SheetRow[] = [];
  const merges: XlsxMerge[] = [];
  pushReportHead(rows, 'WaterMarket — Annual Sales Report', 'Report year', year, generatedAt);

  pushSectionTitle(rows, 'YEAR TOTALS');
  rows.push(['Metric', 'Value']);
  rows.push(['Total sales (PHP)', roundMoney(yearTotals.totalSales)]);
  rows.push(['Online sales (PHP)', roundMoney(yearTotals.onlineSales)]);
  rows.push(['Walk-in sales (PHP)', roundMoney(yearTotals.walkInSales)]);
  rows.push(['Paid amount (PHP)', roundMoney(moneySum(transactions, 'Paid'))]);
  rows.push(['Unpaid amount (PHP)', roundMoney(moneySum(transactions, 'Unpaid'))]);
  rows.push(['Online orders', yearTotals.onlineOrders]);
  rows.push(['Walk-in transactions', yearTotals.walkInTxns]);
  rows.push(['Items sold', paidItemCount(transactions)]);

  pushSectionTitle(rows, 'MONTHLY SUMMARY');
  rows.push(['Month', 'Online (PHP)', 'Walk-in (PHP)', 'Total (PHP)', 'Online orders', 'Walk-in txns']);
  let online = 0;
  let walkIn = 0;
  let total = 0;
  let onlineOrders = 0;
  let walkTxns = 0;
  for (const month of months) {
    online += month.online;
    walkIn += month.walkIn;
    total += month.total;
    onlineOrders += month.onlineOrders;
    walkTxns += month.walkInTxns;
    rows.push([
      month.monthLabel,
      roundMoney(month.online),
      roundMoney(month.walkIn),
      roundMoney(month.total),
      month.onlineOrders,
      month.walkInTxns,
    ]);
  }
  rows.push(['TOTAL', roundMoney(online), roundMoney(walkIn), roundMoney(total), onlineOrders, walkTxns]);

  pushCategories(rows, 'SALES BY CATEGORY (FULL YEAR)', categoryTotals, yearTotals.totalSales);
  pushProducts(rows, 'TOP PRODUCTS (FULL YEAR)', productRanking(transactions), 'No sales this year');
  pushTransactions(rows, transactions, 'No transactions this year');
  rows.push([]);
  rows.push(['Generated by WaterMarket Admin']);
  return { rows, merges };
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

const COLUMN_WIDTHS: Record<string, number> = {
  '#': 6,
  Metric: 28,
  Value: 18,
  Category: 18,
  'Amount (PHP)': 18,
  Share: 12,
  Product: 32,
  'Units sold': 14,
  Units: 12,
  'Revenue (PHP)': 18,
  Date: 20,
  Time: 12,
  Customer: 24,
  Channel: 14,
  Payment: 14,
  Status: 14,
  Items: 12,
  Qty: 8,
  Products: 56,
  'Online (PHP)': 16,
  'Walk-in (PHP)': 16,
  'Total (PHP)': 16,
  'Unit price (PHP)': 18,
  'Line total (PHP)': 18,
  'Online orders': 16,
  'Walk-in txns': 16,
  Month: 16,
};

function applySheetLayout(ws: Worksheet, rows: SheetRow[]) {
  let headers: string[] = [];
  for (const row of rows) {
    if (isTableHeaderRow(row) && row.length >= headers.length) headers = row.map((cell) => String(cell ?? ''));
  }
  const width = Math.max(headers.length, maxColIndex(rows) + 1, 2);
  ws['!cols'] = Array.from({ length: width }, (_, index) => ({ wch: COLUMN_WIDTHS[headers[index] ?? ''] ?? 18 }));
  ws['!views'] = [{ state: 'frozen', ySplit: 4 }];
}

type SheetSpec = { name: string; rows: SheetRow[]; merges: XlsxMerge[] };

async function writeWorkbook(sheets: SheetSpec[], filename: string) {
  const XLSX = await loadXlsx();
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.rows);
    applySheetLayout(ws, sheet.rows);
    applySheetStyles(XLSX, ws, sheet.rows, sheet.merges);
    if (sheet.merges.length) ws['!merges'] = sheet.merges;
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
  }
  const out = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  XLSX.writeFile(wb, out);
}

export async function downloadDaySpreadsheet(payload: DayExportPayload, filename: string) {
  const report = buildDayRows(payload);
  const lines = buildLineItemRows('WaterMarket — Daily Line Items', 'Report date', payload.dayLabel, payload.generatedAt, payload.transactions);
  await writeWorkbook(
    [
      { name: 'Sales Report', ...report },
      { name: 'Line Items', ...lines },
    ],
    filename
  );
}

export async function downloadMonthSpreadsheet(payload: MonthExportPayload, filename: string) {
  const report = buildMonthRows(payload);
  const lines = buildLineItemRows(
    'WaterMarket — Monthly Line Items',
    'Report period',
    payload.monthLabel,
    payload.generatedAt,
    payload.transactions
  );
  await writeWorkbook(
    [
      { name: 'Sales Report', ...report },
      { name: 'Line Items', ...lines },
    ],
    filename
  );
}

export async function downloadRangeSpreadsheet(payload: RangeExportPayload, filename: string) {
  const report = buildMonthRows(
    {
      monthLabel: payload.periodLabel,
      generatedAt: payload.generatedAt,
      data: payload.data,
      transactions: payload.transactions,
    },
    payload.reportTitle
  );
  const lines = buildLineItemRows(
    'WaterMarket — Line Items',
    'Report period',
    payload.periodLabel,
    payload.generatedAt,
    payload.transactions
  );
  await writeWorkbook(
    [
      { name: 'Sales Report', ...report },
      { name: 'Line Items', ...lines },
    ],
    filename
  );
}

export async function downloadYearSpreadsheet(payload: YearExportPayload, filename: string) {
  const report = buildYearRows(payload);
  const lines = buildLineItemRows('WaterMarket — Annual Line Items', 'Report year', payload.year, payload.generatedAt, payload.transactions);
  await writeWorkbook(
    [
      { name: 'Sales Report', ...report },
      { name: 'Line Items', ...lines },
    ],
    filename
  );
}
