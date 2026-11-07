// Con-day sell sheet: everything marked for sale with its ask, as a one-page PDF to AirDrop,
// print, or leave on the table. Floors and what you paid never go on it.

import * as Print from 'expo-print';
import { Platform, Share } from 'react-native';
import { gradeLabel, money, rowTitle } from '../lib/format';
import type { CardRow } from '../pricing/portfolio';
// The printed sheet is always light: it's paper.
import { light as color } from '../theme/tokens';

/** Cards for sale or trade, highest ask first. */
export function sellSheetRows(rows: CardRow[]): CardRow[] {
  return rows
    .filter((r) => r.card.status === 'owned' && (r.card.plan === 'sell' || r.card.plan === 'trade'))
    .sort((a, b) => (b.ask ?? 0) - (a.ask ?? 0));
}

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ENTITIES[c]);

export function sellSheetHtml(rows: CardRow[], opts: { title: string; date: string }): string {
  const list = sellSheetRows(rows);
  const body = list
    .map((r) => {
      const c = r.card;
      const ask = c.plan === 'trade' ? 'Trade' : r.ask != null ? money(r.ask) : 'Ask';
      const set = c.setName && !/^\d+$/.test(c.setName) ? c.setName : null;
      const detail = [gradeLabel(c.grader, c.grade, c.condition), set, c.certNumber ? `Cert ${c.certNumber}` : null]
        .filter(Boolean)
        .join(' · ');
      return `<tr><td><div class="name">${esc(rowTitle(c))}</div><div class="sub">${esc(detail)}</div></td><td class="ask">${esc(ask)}</td></tr>`;
    })
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { margin: 48px 44px; }
  body { font-family: -apple-system, 'Inter', sans-serif; color: ${color.ink}; font-variant-numeric: tabular-nums; }
  h1 { font-size: 28px; font-weight: 600; letter-spacing: -0.5px; margin: 0; }
  .meta { color: ${color.secondary}; font-size: 13px; margin: 4px 0 24px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 12px 0; border-bottom: 1px solid ${color.hairline}; vertical-align: middle; }
  .name { font-size: 16px; font-weight: 500; }
  .sub { font-size: 12px; color: ${color.secondary}; margin-top: 2px; }
  .ask { text-align: right; font-size: 18px; font-weight: 600; white-space: nowrap; padding-left: 16px; }
  </style></head><body>
  <h1>${esc(opts.title)}</h1>
  <div class="meta">${list.length} ${list.length === 1 ? 'slab' : 'slabs'} for sale · ${esc(opts.date)}</div>
  <table>${body}</table>
  </body></html>`;
}

/** Make the PDF and open the share sheet (AirDrop, Messages, Print, Files). */
export async function shareSellSheet(rows: CardRow[], title: string): Promise<void> {
  if (Platform.OS === 'web') return;
  const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const { uri } = await Print.printToFileAsync({ html: sellSheetHtml(rows, { title, date }) });
  await Share.share({ url: uri });
}
