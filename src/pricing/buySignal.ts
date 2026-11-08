// The card page's buy signal: one Good time to buy / Fair price / Hold off read for a buyer, and
// the three factors behind it, each named in words so the read never hides behind a score.
// Built only from data we have: the 90-day series (same rule as the 90-day range) and, for graded
// cards, eBay sales in 30 days. Anything without enough data behind it returns null and is hidden.

import type { CardPrice } from '../services/comps';
import { history } from './cardStats';

/** 30-day move that counts as fast, either way. */
export const FAST_MOVE = 0.08;
/** 30-day move under which a price counts as steady. */
export const STEADY_MOVE = 0.03;
/** Graded cards need this many sales in 30 days before we give a read at all. */
export const MIN_SIGNAL_SALES = 3;

export type Verdict = 'buy' | 'fair' | 'hold';

export type Factor = {
  key: 'position' | 'momentum' | 'demand';
  label: string;
  /** The factor in words, e.g. "Near its low". */
  word: string;
  /** The number behind the word, e.g. "14 sales in 30 days". */
  detail: string;
};

export type BuySignal = {
  verdict: Verdict;
  /** Needle position on the dial, 0 (Buy end) to 1 (Hold off end), inside the verdict's third. */
  needle: number;
  /** One sentence naming what drove the read. */
  because: string;
  factors: Factor[];
};

export const verdictWord: Record<Verdict, string> = { buy: 'Good time to buy', fair: 'Fair price', hold: 'Hold off' };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const signed = (f: number) => {
  const n = Math.round(f * 100);
  return n === 0 ? '0%' : `${n > 0 ? '+' : '−'}${Math.abs(n)}%`;
};

/** Change over the last 30 days of the series. Needs 31 points (history() already asks for them). */
export function change30(series: number[]): number | null {
  if (series.length < 31) return null;
  const then = series[series.length - 31];
  return then > 0 ? series[series.length - 1] / then - 1 : null;
}

export function momentumWord(m: number, m90: number): string {
  if (m <= -FAST_MOVE) return 'Dropping fast';
  if (m >= FAST_MOVE) return 'Heating up';
  if (m <= -STEADY_MOVE) return 'Cooling';
  if (m >= STEADY_MOVE) return 'Warming';
  return m90 <= -STEADY_MOVE ? 'Stopped falling' : m90 >= STEADY_MOVE ? 'Leveling off' : 'Steady';
}

export function positionWord(at: number): string {
  return at <= 0.2 ? 'Near its low' : at >= 0.8 ? 'Near its high' : at <= 0.33 ? 'Low side' : at >= 0.67 ? 'High side' : 'Mid-range';
}

export function demandWord(sales30d: number): string {
  return sales30d >= 30 ? 'Sells daily' : sales30d >= 10 ? 'Sells often' : sales30d >= 3 ? 'Sells now and then' : 'Rarely sells';
}

function demandPhrase(sales30d: number): string {
  const perWeek = (sales30d / 30) * 7;
  if (sales30d >= 30) return 'it sells every day';
  if (perWeek >= 1.5) return `it sells about ${Math.round(perWeek)} times a week`;
  if (sales30d >= 3) return 'it sells a few times a month';
  return 'it rarely sells';
}

/**
 * The read for one grade. `graded` is false for raw (TCGplayer gives no sale count, so demand is
 * left out). Null when the 90-day history is too thin, the range is flat, or a graded card has
 * fewer than MIN_SIGNAL_SALES sales.
 */
export function buySignal(price: CardPrice | null | undefined, graded: boolean): BuySignal | null {
  const hist = history(price);
  if (!price || !hist || !(hist.high > hist.low)) return null;
  if (graded && price.sales30d < MIN_SIGNAL_SALES) return null;
  const m = change30(price.series90);
  if (m == null) return null;
  const m90 = hist.change;
  const at = clamp((price.marketCents - hist.low) / (hist.high - hist.low), 0, 1);

  const fastDown = m <= -FAST_MOVE;
  const verdict: Verdict = fastDown || (at >= 0.8 && m >= FAST_MOVE) ? 'hold' : at <= 0.33 ? 'buy' : 'fair';

  // Needle: where the price sits, nudged by momentum, then kept inside the verdict's third so the
  // dial and the words always agree.
  const raw = at + 0.25 * clamp(m / (2 * FAST_MOVE), -1, 1);
  const seg = { buy: 0, fair: 1, hold: 2 }[verdict] / 3;
  const needle = clamp(raw, seg + 0.04, seg + 1 / 3 - 0.04);

  const mWord = momentumWord(m, m90);
  const factors: Factor[] = [
    { key: 'position', label: 'Where it sits', word: positionWord(at), detail: `${Math.round(at * 100)}% of the way from its ${hist.days}-day low to high` },
    { key: 'momentum', label: 'Momentum', word: mWord, detail: `${signed(m)} in 30 days · ${signed(m90)} in ${hist.days}` },
  ];
  if (graded) factors.push({ key: 'demand', label: 'Demand', word: demandWord(price.sales30d), detail: `${price.sales30d} sales in 30 days` });

  const where =
    at <= 0.2 ? `near its ${hist.days}-day low` : at >= 0.8 ? `near its ${hist.days}-day high` : at <= 0.33 ? `on the low side of its ${hist.days}-day range` : at >= 0.67 ? `on the high side of its ${hist.days}-day range` : `mid-range for ${hist.days} days`;
  const moving =
    mWord === 'Dropping fast'
      ? `it's still dropping fast (${signed(m)} in 30 days)`
      : mWord === 'Heating up'
        ? `it's heating up (${signed(m)} in 30 days)`
        : mWord === 'Stopped falling'
          ? 'prices have stopped falling'
          : mWord === 'Leveling off'
            ? 'prices have leveled off'
            : mWord === 'Steady'
              ? 'prices are steady'
              : `it's ${mWord.toLowerCase()} (${signed(m)} in 30 days)`;
  const parts = [where[0].toUpperCase() + where.slice(1), moving];
  if (graded) parts.push(demandPhrase(price.sales30d));
  const because = parts.length === 2 ? `${parts[0]} and ${parts[1]}.` : `${parts[0]}, ${parts[1]}, and ${parts[2]}.`;

  return { verdict, needle, because, factors };
}
