import type {
  DayExportPayload,
  MonthExportPayload,
  RangeExportPayload,
  YearExportPayload,
} from './salesReportData';
import {
  buildDayRows,
  buildLineItemRows,
  buildMonthRows,
  buildYearRows,
  writeWorkbook,
} from './exportSalesSpreadsheet';

export async function downloadDaySpreadsheet(payload: DayExportPayload, filename: string) {
  const report = buildDayRows(payload);
  const lines = buildLineItemRows(
    'WaterMarket — Daily Line Items',
    'Report date',
    payload.dayLabel,
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
  const lines = buildLineItemRows(
    'WaterMarket — Annual Line Items',
    'Report year',
    payload.year,
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