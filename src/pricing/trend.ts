// Trend verdict and comps freshness copy for Slab detail, Before the table and con mode.
// Pure: screens render the parts these return and never compute prices or dates themselves.

import { shortDay } from '../lib/format';
import { changeOver, type CardPrice } from '../services/comps';
import { trendThreshold } from '../theme/tokens';

export type Trend = {
  direction: 'up' | 'flat' | 'down';
  /** Change over the window, as a fraction. */
  change: number;
  /** Sales in the window (graded). 0 for raw. */
  sales: number;
  /** False when there are too few sales or points to call it. */
  enough: boolean;
};

const DAY = 86_400_000;
const MIN_SALES = { 30: 5, 90: 10 } as const;
const MIN_RAW_POINTS = 15;

const dayMs = (day: string) => Date.parse(`${day.slice(0, 10)}T00:00:00Z`);

/** Up, flat or down over 30 or 90 days, and whether there's enough behind it to say so. */
export function trendVerdict(p: CardPrice, days: 30 | 90, opts: { raw?: boolean; now?: number; threshold?: number } = {}): Trend {
  const { raw = false, now = Date.now(), threshold = trendThreshold } = opts;
  const change = changeOver(p, days);
  const direction = change > threshold ? 'up' : change < -threshold ? 'down' : 'flat';
  const points = Math.min(p.series90.length, days + 1);
  if (raw) return { direction, change, sales: 0, enough: points >= MIN_RAW_POINTS && points >= days / 2 };
  // Without sales90d (prices saved before it existed) the 30-day count is a lower bound.
  const sales = days === 30 ? p.sales30d : p.sales90d ?? p.sales30d;
  // Whole UTC days, so the answer doesn't change with the hour of the day.
  const today = dayMs(new Date(now).toISOString());
  const lastSaleTooOld = p.lastSaleDay ? (today - dayMs(p.lastSaleDay)) / DAY > days : false;
  const enough = sales >= MIN_SALES[days] && !lastSaleTooOld && points >= days / 2;
  return { direction, change, sales, enough };
}

export type Tone = 'secondary' | 'gain' | 'loss';
export type Part = { text: string; tone: Tone };

/**
 * "Up 21% on 62 sales" (the percent in gain/loss), "Flat on 14 sales", "Too few sales for a
 * trend"; raw cards say "on TCGplayer" instead of a sale count. Slab detail's 30d/90d control
 * names the window; `window` puts it in the sentence where nothing else does ("Up 8% in 30 days
 * on 14 sales", Before the table).
 */
export function trendSentence(t: Trend, days: 30 | 90, raw = false, opts: { window?: boolean } = {}): Part[] {
  if (!t.enough) return [{ text: 'Too few sales for a trend', tone: 'secondary' }];
  const basis = raw ? 'on TCGplayer' : `on ${t.sales} ${t.sales === 1 ? 'sale' : 'sales'}`;
  if (t.direction === 'flat') return [{ text: `Flat ${opts.window ? `over ${days} days ` : ''}${basis}`, tone: 'secondary' }];
  const up = t.direction === 'up';
  return [
    { text: up ? 'Up ' : 'Down ', tone: 'secondary' },
    { text: `${Math.round(Math.abs(t.change) * 100)}%`, tone: up ? 'gain' : 'loss' },
    { text: ` ${opts.window ? `in ${days} days ` : ''}${basis}`, tone: 'secondary' },
  ];
}

export type RefreshState = 'idle' | 'refreshing' | 'failed';

/** "2h ago", "2 days ago". From the exact time when known, else from the price_daily day. */
function age(p: CardPrice, now: number): { text: string; stale: boolean } {
  if (p.refreshedAt && !Number.isNaN(Date.parse(p.refreshedAt))) {
    const ms = Math.max(0, now - Date.parse(p.refreshedAt));
    const mins = Math.floor(ms / 60_000);
    const hours = Math.floor(ms / 3_600_000);
    const d = Math.floor(ms / DAY);
    const text = mins < 1 ? 'just now' : hours < 1 ? `${mins}m ago` : d < 1 ? `${hours}h ago` : d === 1 ? '1 day ago' : `${d} days ago`;
    return { text, stale: ms > DAY };
  }
  // Day only: the nightly run writes yesterday's day, so stale starts at two days.
  const today = new Date(now).toISOString().slice(0, 10);
  const d = Math.max(0, Math.round((dayMs(today) - dayMs(p.asOf)) / DAY));
  const text = d === 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
  return { text, stale: d >= 2 };
}

/** True when the comps are more than a day behind (or a nightly run was missed). */
export function isBehind(p: CardPrice, now = Date.now()): boolean {
  return age(p, now).stale;
}

/**
 * The freshness line under the comps row:
 *   "Updated 2h ago · Last sale Nov 5", "Updated 2 days ago · prices may be behind",
 *   "Updating…", "Couldn't update · showing prices from Nov 4",
 *   "Updated 2h ago · no sales on record", raw "Updated 2h ago".
 */
export function freshnessLine(p: CardPrice, opts: { raw?: boolean; state?: RefreshState; now?: number } = {}): string {
  const { raw = false, state = 'idle', now = Date.now() } = opts;
  if (state === 'refreshing') return 'Updating…';
  if (state === 'failed') return `Couldn't update · showing prices from ${shortDay(p.asOf)}`;
  const a = age(p, now);
  const updated = `Updated ${a.text}`;
  if (a.stale) return `${updated} · prices may be behind`;
  if (raw) return updated;
  if (p.lastSaleDay) return `${updated} · Last sale ${shortDay(p.lastSaleDay)}`;
  // null = the server says there's no sale; undefined = freshness not known (not deployed, mocks).
  if (p.lastSaleDay === null && p.refreshedAt) return `${updated} · no sales on record`;
  return updated;
}

/** Whether a quiet screen (Before the table) should show the freshness line: behind or failed. */
export function freshnessWorthShowing(p: CardPrice, state: RefreshState, now = Date.now()): boolean {
  // An estimate or your own price isn't refreshed, so it's never "behind".
  if (p.source) return false;
  return state === 'failed' || isBehind(p, now);
}

/**
 * Con mode header line: "Prices updated 2 days ago · pull to refresh" when the oldest card is
 * more than a day behind or the refresh failed. Null otherwise (also while pulling).
 */
export function conFreshnessLine(prices: CardPrice[], opts: { failed?: boolean; now?: number } = {}): string | null {
  const { failed = false, now = Date.now() } = opts;
  prices = prices.filter((p) => !p.source);
  if (!prices.length) return failed ? "Couldn't update prices · pull to refresh" : null;
  const oldest = prices.reduce((a, b) => (ageMs(b, now) > ageMs(a, now) ? b : a));
  if (!failed && !isBehind(oldest, now)) return null;
  return `Prices updated ${age(oldest, now).text} · pull to refresh`;
}

function ageMs(p: CardPrice, now: number): number {
  if (p.refreshedAt && !Number.isNaN(Date.parse(p.refreshedAt))) return now - Date.parse(p.refreshedAt);
  return now - dayMs(p.asOf);
}
