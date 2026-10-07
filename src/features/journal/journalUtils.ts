import { TradeRecord } from '../../types/trading';

/**
 * Exports trade records into a structured CSV file for quant analysis
 */
export function exportTradesToCSV(trades: TradeRecord[]): string {
  if (!trades || trades.length === 0) return '';

  const headers = [
    'ID',
    'Timestamp',
    'Symbol',
    'Mode',
    'Direction',
    'Result',
    'Stake ($)',
    'Profit ($)',
    'Entry Price',
    'Exit Price',
    'Duration',
    'Agent',
    'Regime',
    'Confidence (%)',
    'Sniper Confluence (%)',
    'Exit Reason',
  ];

  const rows = trades.map((t) => [
    `"${t.id}"`,
    `"${t.timestamp}"`,
    `"${t.symbol}"`,
    `"${t.mode}"`,
    `"${t.decision}"`,
    `"${t.result}"`,
    t.amount.toFixed(2),
    t.profit.toFixed(2),
    t.entryPrice.toFixed(4),
    (t.exitPrice ?? t.entryPrice).toFixed(4),
    `"${t.duration} ${t.durationUnit || 'min'}"`,
    `"${t.agent}"`,
    `"${t.regime}"`,
    (t.confidence * 100).toFixed(1),
    t.confluenceScore ? t.confluenceScore.toFixed(0) : 'N/A',
    `"${t.exitReason || 'Maturity'}"`,
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

/**
 * Downloads a generated string as a file in the browser
 */
export function triggerFileDownload(content: string, filename: string, mimeType: string = 'text/csv') {
  if (typeof window === 'undefined') return;
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Exports trade history to CSV and triggers file download
 */
export function downloadTradesCSV(trades: TradeRecord[], symbol?: string) {
  const csv = exportTradesToCSV(trades);
  const dateStr = new Date().toISOString().slice(0, 10);
  const symStr = symbol ? `_${symbol}` : '';
  triggerFileDownload(csv, `deriv_ai_trades${symStr}_${dateStr}.csv`, 'text/csv');
}

/**
 * Exports trade history to JSON and triggers file download
 */
export function downloadTradesJSON(trades: TradeRecord[], symbol?: string) {
  const json = JSON.stringify(trades, null, 2);
  const dateStr = new Date().toISOString().slice(0, 10);
  const symStr = symbol ? `_${symbol}` : '';
  triggerFileDownload(json, `deriv_ai_trades${symStr}_${dateStr}.json`, 'application/json');
}
