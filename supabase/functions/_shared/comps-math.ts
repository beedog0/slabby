// Pure comps math shared by the Edge Functions and unit-tested from the app (jest).
// No imports: this file must run unchanged in Deno and Node.
//
// Source: PokemonPriceTracker. Graded = eBay + Fanatics Collect sold, as daily
// {average, count} per grade. Raw = TCGplayer market, as a daily series.
// Output: one price_daily row per day (TECH.md), cents.

export type DailySales = Record<string, { average: number; count: number }>; // "YYYY-MM-DD" → day
export type RawPoint = { date: string; market: number | null };

export type DailyRow = {
  day: string;
  market_cents: number;
  low_cents: number;
  high_cents: number;
  sales_30d: number;
};

const cents = (d: number) => Math.round(d * 100);

/** Percentile (0..1) of a sorted array, linear interpolation. */
export function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * PSA 10 → "psa10", BGS 9.5 → "bgs9_5". Returns null for raw cards.
 */
export function gradeKey(grader: string, grade: number | null): string | null {
  if (grader === 'raw' || grade == null) return null;
  return `${grader}${String(grade).replace('.', '_')}`;
}

/**
 * Graded daily rows for the last `days` days ending `today`. Each day's numbers use the trailing
 * 30 days of sales: market = median, low/high = 10th/90th percentile (drops outliers), each
 * day's average weighted by its sale count. Days with no sales in the window are skipped.
 */
export function gradedDaily(sales: DailySales, today: string, days = 90): DailyRow[] {
  const rows: DailyRow[] = [];
  for (let k = days - 1; k >= 0; k--) {
    const day = addDays(today, -k);
    const values: number[] = [];
    let count = 0;
    for (let j = 0; j < 30; j++) {
      const s = sales[addDays(day, -j)];
      if (!s || !s.count || !(s.average > 0)) continue;
      count += s.count;
      for (let c = 0; c < Math.min(s.count, 50); c++) values.push(s.average);
    }
    if (!values.length) continue;
    values.sort((a, b) => a - b);
    rows.push({
      day,
      market_cents: cents(percentile(values, 0.5)),
      low_cents: cents(percentile(values, 0.1)),
      high_cents: cents(percentile(values, 0.9)),
      sales_30d: count,
    });
  }
  return rows;
}

/**
 * Raw daily rows: market is that day's TCGplayer market; low/high are the 10th/90th percentile
 * of the trailing 30 days of market. sales_30d is 0 (TCGplayer doesn't give sold counts here).
 */
export function rawDaily(points: RawPoint[], today: string, days = 90): DailyRow[] {
  const byDay = new Map<string, number>();
  for (const p of points) if (p.market != null && p.market > 0) byDay.set(p.date.slice(0, 10), p.market);
  const rows: DailyRow[] = [];
  let last: number | null = null;
  for (let k = days - 1 + 30; k >= 0; k--) {
    const day = addDays(today, -k);
    if (byDay.has(day)) last = byDay.get(day)!;
    else if (last != null) byDay.set(day, last); // carry forward over gaps
    if (k >= days || last == null) continue;
    const window: number[] = [];
    for (let j = 0; j < 30; j++) {
      const v = byDay.get(addDays(day, -j));
      if (v != null) window.push(v);
    }
    window.sort((a, b) => a - b);
    rows.push({
      day,
      market_cents: cents(last),
      low_cents: cents(percentile(window, 0.1)),
      high_cents: cents(percentile(window, 0.9)),
      sales_30d: 0,
    });
  }
  return rows;
}

/** Card number as PokemonPriceTracker prints it ("199/165") → "199". */
export function bareNumber(n: string | null | undefined): string {
  return (n ?? '').split('/')[0].replace(/^0+(?=\d)/, '').trim();
}

/**
 * Whether a catalog number is the label's number. Pokémon prints "199/165"; One Piece prints
 * "OP05-119" where the label says #119; Riftbound prints "OGN-001" or "001/298".
 */
export function numberMatches(catalog: string | null | undefined, label: string | null | undefined): boolean {
  const want = bareNumber(label).toLowerCase();
  if (!want) return false;
  const have = bareNumber(catalog).toLowerCase();
  if (have === want) return true;
  const tail = (t: string) => bareNumber(t.split('-').pop()).toLowerCase();
  return tail(have) === tail(want);
}

/**
 * Today's raw row from today's TCGplayer market and the days already stored, for sources that
 * only give the current price (TCGCSV). Same low/high window as rawDaily.
 */
export function rawToday(history: { day: string; market_cents: number }[], marketDollars: number, today: string): DailyRow | null {
  const points: RawPoint[] = history.map((h) => ({ date: h.day, market: h.market_cents / 100 }));
  points.push({ date: today, market: marketDollars });
  return rawDaily(points, today, 1)[0] ?? null;
}

export type LastSale = { day: string; cents: number };

/** Latest day with a graded sale (count > 0 and a price), with that day's average. */
export function lastSaleDay(sales: DailySales): LastSale | null {
  let best: LastSale | null = null;
  for (const [date, s] of Object.entries(sales ?? {})) {
    if (!s || !(s.count > 0) || !(s.average > 0)) continue;
    const day = date.slice(0, 10);
    if (!best || day > best.day) best = { day, cents: cents(s.average) };
  }
  return best;
}

/** Latest raw TCGplayer market point with a price. */
export function lastRawDay(points: RawPoint[]): LastSale | null {
  let best: LastSale | null = null;
  for (const p of points ?? []) {
    if (p.market == null || !(p.market > 0)) continue;
    const day = p.date.slice(0, 10);
    if (!best || day > best.day) best = { day, cents: cents(p.market) };
  }
  return best;
}

// Recent sales (0009_recent_sales.sql) -------------------------------------------------------

export type SalesDailyRow = { day: string; sales: number; avg_cents: number };

/**
 * One sales_daily row per day with a sale (count > 0, average > 0) in the last `days` days
 * ending `today`, newest first. Keys that land on the same day ("2026-11-05" and
 * "2026-11-05T00:00:00Z") merge: counts add, averages weight by count.
 */
export function dailySales(sales: DailySales, today: string, days = 90): SalesDailyRow[] {
  const since = addDays(today, -(days - 1));
  const byDay = new Map<string, { count: number; total: number }>();
  for (const [date, s] of Object.entries(sales ?? {})) {
    if (!s || typeof s !== 'object') continue;
    const count = Number(s.count);
    const average = Number(s.average);
    if (!(count > 0) || !(average > 0) || !Number.isFinite(count) || !Number.isFinite(average)) continue;
    const day = String(date).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day < since || day > today) continue;
    const d = byDay.get(day) ?? { count: 0, total: 0 };
    d.count += count;
    d.total += count * average;
    byDay.set(day, d);
  }
  return [...byDay.entries()]
    .map(([day, d]) => ({ day, sales: Math.max(1, Math.round(d.count)), avg_cents: cents(d.total / d.count) }))
    .sort((a, b) => b.day.localeCompare(a.day));
}

export type SaleKind = 'auction' | 'bin' | 'offer';

export type SaleRow = {
  source: string;
  listing_id: string;
  sold_day: string;
  sold_at: string | null;
  price_cents: number;
  kind: SaleKind | null;
  title: string | null;
  url: string | null;
};

const pick = (o: Record<string, unknown>, names: string[]): unknown => {
  for (const n of names) if (o[n] != null && o[n] !== '') return o[n];
  return undefined;
};

/**
 * Dollars as a number, a string ("$1,020.00") or an object ({ value, currency }, USD or no
 * currency) → cents; null when it isn't a positive price.
 */
function priceCents(v: unknown): number | null {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    const currency = typeof o.currency === 'string' ? o.currency.trim().toUpperCase() : o.currency;
    if (currency != null && currency !== '' && currency !== 'USD') return null;
    return priceCents(o.value);
  }
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/[$,\s]/g, '')) : NaN;
  return Number.isFinite(n) && n > 0 ? cents(n) : null;
}

function saleKind(v: unknown): SaleKind | null {
  if (typeof v !== 'string') return null;
  const t = v.toLowerCase();
  if (t.includes('auction')) return 'auction';
  if (t.includes('offer')) return 'offer';
  if (t === 'bin' || t.includes('buy') || t.includes('fixed')) return 'bin';
  return null;
}

/** A date-only string keeps only the day; a timestamp (ISO or epoch s/ms) keeps the time too. */
function soldWhen(v: unknown): { day: string; at: string | null } | null {
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.trim())) return { day: v.trim(), at: null };
  let d: Date;
  if (typeof v === 'number' && Number.isFinite(v)) d = new Date(v > 1e12 ? v : v * 1000);
  else if (typeof v === 'string' && v.trim()) d = new Date(v.trim());
  else return null;
  if (Number.isNaN(d.getTime())) return null;
  const at = d.toISOString();
  return { day: at.slice(0, 10), at };
}

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/**
 * PPT's soldListings for one grade → sales rows. PPT's field names aren't pinned down, so this
 * reads the likely ones and drops a row with no id, price or date. Duplicate ids keep the first.
 */
export function parseSoldListings(raw: unknown): SaleRow[] {
  if (!Array.isArray(raw)) return [];
  const out: SaleRow[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const o = item as Record<string, unknown>;
    const id = pick(o, ['listingId', 'id', 'itemId']);
    const listing_id = typeof id === 'number' ? String(id) : text(id);
    const price_cents = priceCents(pick(o, ['price', 'soldPrice']));
    const when = soldWhen(pick(o, ['soldAt', 'soldDate', 'date', 'endDate']));
    if (!listing_id || price_cents == null || !when) continue;
    const source = (text(o.source) ?? 'ebay').toLowerCase();
    const k = `${source}:${listing_id}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({
      source,
      listing_id,
      sold_day: when.day,
      sold_at: when.at,
      price_cents,
      kind: saleKind(pick(o, ['listingType', 'saleType', 'type'])),
      title: text(o.title),
      url: text(pick(o, ['url', 'listingUrl', 'itemUrl'])),
    });
  }
  return out;
}

/**
 * A catalog product title as a card name: "Pikachu ex - 236/187" → "Pikachu ex",
 * "Charizard (Secret)" → "Charizard". Null when nothing is left.
 */
export function productName(title: string | null | undefined): string | null {
  const n = (title ?? '')
    .replace(/\s+-\s+[A-Z]*\d+[A-Za-z]*(?:\/[A-Z0-9-]+)?\s*$/i, '')
    .replace(/(?:\s*\([^)]*\))+\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return n || null;
}

// Words that don't tell two card names apart.
const NAME_FILLER = new Set(['ex', 'gx', 'v', 'vmax', 'vstar', 'holo', 'the', 'and', 'of', 'pokemon']);
const nameWords = (t: string | null | undefined) =>
  (t ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !NAME_FILLER.has(w));

/**
 * Whether a number-matched product can be the card the label names. A label name of four or more
 * letters that shares no word with the product ("DITTO" vs "Eevee - 173") means the set or language
 * was read wrong, so the match is refused. Short names may be label codes ("PZA" for Pikachu ex on
 * SV8a), so they trust the number.
 */
export function nameAgrees(label: string | null | undefined, product: string | null | undefined): boolean {
  const have = nameWords(label);
  const want = new Set(nameWords(productName(product)));
  if (!have.length || !want.size) return true;
  if (have.some((w) => want.has(w))) return true;
  return !have.some((w) => /^[a-z]{4,}$/.test(w));
}
