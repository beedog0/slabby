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
