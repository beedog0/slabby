// Price estimate math for cards with no price source (Korean and Chinese promos, some old JP
// promos). Pure, so the price-estimate Edge Function and the app's jest tests share it.
//
// A model searches the web for sold listings and reports each one it found. Nothing it says is
// trusted on its own: a sale only counts when its link came back from the web search itself, its
// language and grade match the card, it has a real price and a date in the last year. The estimate
// is the median of what's left, and it always says how many sales it came from.

export type Language = 'en' | 'ja' | 'ko' | 'zh' | 'other';

/** One sale as the model reported it. */
export type FoundSale = {
  title: string;
  url: string;
  /** Site name, e.g. "eBay", "SNKRDUNK", "Bunjang". */
  source: string;
  amount: number;
  /** ISO 4217, e.g. "USD", "KRW", "JPY", "CNY". */
  currency: string;
  /** "YYYY-MM-DD", or null when the page doesn't say. */
  soldOn: string | null;
  /** Print language of the card in the listing. */
  language: Language | null;
  /** Grader and grade in the listing, e.g. "PSA 10", or "raw". */
  grade: string | null;
  /** True for a sold or completed sale; false for an asking price. */
  sold: boolean;
};

/** One sale the app shows, in US cents plus what it sold for where it sold. */
export type EstimateSale = {
  title: string;
  url: string;
  source: string;
  priceCents: number;
  amount: number;
  currency: string;
  soldOn: string | null;
};

export type Estimate = {
  /** Median of the sales, US cents. */
  priceCents: number;
  lowCents: number;
  highCents: number;
  sales: EstimateSale[];
  /** When the search ran (ISO time). */
  foundAt: string;
};

/**
 * US dollars per one unit of each currency. Used when the live rate can't be fetched; close
 * enough for an estimate, which is shown as one. Updated 2026-11.
 */
export const FALLBACK_USD_PER: Record<string, number> = {
  USD: 1,
  KRW: 0.00072,
  JPY: 0.0066,
  CNY: 0.14,
  TWD: 0.031,
  HKD: 0.128,
  SGD: 0.77,
  EUR: 1.08,
  GBP: 1.28,
  CAD: 0.72,
  AUD: 0.65,
};

/** A price in some currency, in US cents. Null when the currency is unknown or the amount isn't a price. */
export function toUsdCents(amount: number, currency: string, usdPer: Record<string, number> = FALLBACK_USD_PER): number | null {
  const rate = usdPer[currency.toUpperCase()];
  if (!rate || !Number.isFinite(amount) || amount <= 0) return null;
  const cents = Math.round(amount * rate * 100);
  return cents > 0 ? cents : null;
}

/** Turn a rates answer in "units per 1 USD" (Frankfurter, ECB) into "USD per unit", over the fallback. */
export function usdPerFromRates(perUsd: Record<string, number> | null | undefined): Record<string, number> {
  const out = { ...FALLBACK_USD_PER };
  for (const [code, r] of Object.entries(perUsd ?? {})) if (Number.isFinite(r) && r > 0) out[code.toUpperCase()] = 1 / r;
  return out;
}

/** "PSA 10", "psa10", "Gem Mint 10" → { grader: 'psa', grade: 10 }. Raw → { grader: 'raw' }. */
export function parseGrade(text: string | null | undefined): { grader: string; grade: number | null } | null {
  if (!text) return null;
  const t = text.toLowerCase();
  if (/\b(raw|ungraded)\b/.test(t)) return { grader: 'raw', grade: null };
  const grader = /\bpsa\b|psa\s?\d/.test(t) ? 'psa' : /\bbgs\b|beckett/.test(t) ? 'bgs' : /\bcgc\b/.test(t) ? 'cgc' : null;
  const m = t.match(/(\d{1,2}(?:\.5)?)\s*$/) ?? t.match(/(?:psa|bgs|cgc|mint)\s*(\d{1,2}(?:\.5)?)/);
  const grade = m ? Number(m[1]) : null;
  return grader ? { grader, grade: grade != null && grade <= 10 ? grade : null } : null;
}

export type CardQuery = {
  grader: 'psa' | 'bgs' | 'cgc' | 'raw';
  grade: number | null;
  language: string;
};

/** Normalise a URL for comparing: no hash, no trailing slash, lower-case host. */
export function normUrl(u: string): string | null {
  try {
    const url = new URL(u);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    url.hash = '';
    return `${url.protocol}//${url.host.toLowerCase()}${url.pathname.replace(/\/+$/, '')}${url.search}`;
  } catch {
    return null;
  }
}

const YEAR_MS = 366 * 86_400_000;

/**
 * Keep only the sales that are this card: sold (not asking), a link the search returned, the same
 * print language (a Korean card never takes a Japanese price), the same grader and grade, a known
 * currency, and not older than a year. One sale per link.
 */
export function cleanSales(
  found: FoundSale[],
  card: CardQuery,
  searchedUrls: Iterable<string>,
  opts: { now?: number; usdPer?: Record<string, number> } = {},
): EstimateSale[] {
  const now = opts.now ?? Date.now();
  const allowed = new Set([...searchedUrls].map(normUrl).filter((u): u is string => !!u));
  const seen = new Set<string>();
  const out: EstimateSale[] = [];
  for (const s of found) {
    if (!s.sold) continue;
    const key = normUrl(s.url);
    if (!key || !allowed.has(key) || seen.has(key)) continue;
    if (s.language !== card.language) continue;
    const g = parseGrade(s.grade);
    if (card.grader === 'raw' ? g?.grader !== 'raw' : g?.grader !== card.grader || g.grade !== card.grade) continue;
    if (s.soldOn) {
      const t = Date.parse(`${s.soldOn}T00:00:00Z`);
      if (Number.isNaN(t) || t > now + 86_400_000 || now - t > YEAR_MS) continue;
    }
    const priceCents = toUsdCents(s.amount, s.currency, opts.usdPer);
    if (priceCents == null) continue;
    seen.add(key);
    out.push({
      title: s.title.trim(),
      url: s.url,
      source: s.source.trim() || new URL(s.url).host.replace(/^www\./, ''),
      priceCents,
      amount: s.amount,
      currency: s.currency.toUpperCase(),
      soldOn: s.soldOn,
    });
  }
  return dropOutliers(out).sort((a, b) => (b.soldOn ?? '').localeCompare(a.soldOn ?? ''));
}

/** With four or more sales, drop any under a third or over three times the median (lots, wrong cards). */
export function dropOutliers(sales: EstimateSale[]): EstimateSale[] {
  if (sales.length < 4) return sales;
  const m = median(sales.map((s) => s.priceCents));
  return sales.filter((s) => s.priceCents >= m / 3 && s.priceCents <= m * 3);
}

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/** The estimate from cleaned sales. Null with none. */
export function summarizeEstimate(sales: EstimateSale[], foundAt: string): Estimate | null {
  if (!sales.length) return null;
  const cents = sales.map((s) => s.priceCents);
  return { priceCents: median(cents), lowCents: Math.min(...cents), highCents: Math.max(...cents), sales, foundAt };
}

/** Estimates are kept a week, then searched again on the next tap. */
export const ESTIMATE_TTL_MS = 7 * 86_400_000;

export function estimateIsFresh(foundAt: string | null | undefined, now = Date.now()): boolean {
  if (!foundAt) return false;
  const t = Date.parse(foundAt);
  return !Number.isNaN(t) && now - t < ESTIMATE_TTL_MS;
}
