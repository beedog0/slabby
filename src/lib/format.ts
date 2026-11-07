// Copy formatting. Uses a true minus sign (U+2212) for negatives, per the reference screens.

const MINUS = '−';

/** 1248000 → "$12,480". Drops cents unless asked. */
export function money(cents: number, opts: { cents?: boolean } = {}): string {
  const neg = cents < 0;
  const abs = Math.abs(cents) / 100;
  const s = abs.toLocaleString('en-US', {
    minimumFractionDigits: opts.cents ? 2 : 0,
    maximumFractionDigits: opts.cents ? 2 : 0,
  });
  return `${neg ? MINUS : ''}$${s}`;
}

/** 13000 → "130" (for "floor 130"). */
export function bare(cents: number): string {
  return Math.round(cents / 100).toLocaleString('en-US');
}

/** 0.6 → "+60%", -0.07 → "−7%". */
export function pct(fraction: number): string {
  const n = Math.round(fraction * 100);
  if (n === 0) return '0%';
  return `${n > 0 ? '+' : MINUS}${Math.abs(n)}%`;
}

/** Rule percent: 10 → "+10%", -5 → "−5%". */
export function rulePct(n: number): string {
  if (n === 0) return '0%';
  return `${n > 0 ? '+' : MINUS}${Math.abs(n)}%`;
}

export function gradeLabel(grader: string, grade: number | null, condition?: string): string {
  if (grader === 'raw') return condition ? `Raw · ${condition}` : 'Raw';
  return `${grader.toUpperCase()} ${grade ?? ''}`.trim();
}

const LANG_SHORT: Record<string, string> = { ja: 'JP', ko: 'KR', zh: 'CN' };

/** "JP" for a Japanese card, "" for English, so lists can tell the two printings apart. */
export function langTag(language: string | null | undefined): string {
  if (!language || language === 'en') return '';
  return LANG_SHORT[language] ?? language.toUpperCase();
}

/** Row subtitle: "JP · PSA 10", "PSA 10", "Raw · near mint". */
export function cardLabel(c: { language: string; grader: string; grade: number | null; condition?: string }): string {
  return [langTag(c.language), gradeLabel(c.grader, c.grade, c.condition)].filter(Boolean).join(' · ');
}

/** "Up $640 this month" / "Down $120 this month" / "Flat this month". */
export function monthLine(deltaCents: number): string {
  if (Math.abs(deltaCents) < 100) return 'Flat this month';
  return `${deltaCents > 0 ? 'Up' : 'Down'} ${money(Math.abs(deltaCents))} this month`;
}

/** Row title: "Mew ex 151". Numeric set names (151) read as part of the card's name. */
export function rowTitle(c: { name: string; setName: string | null }): string {
  return c.setName && /^\d+$/.test(c.setName) ? `${c.name} ${c.setName}` : c.name;
}

/** "3h 12m" / "12m" since an ISO time. */
export function elapsed(sinceIso: string, now = Date.now()): string {
  const mins = Math.max(0, Math.floor((now - Date.parse(sinceIso)) / 60000));
  const h = Math.floor(mins / 60);
  return h ? `${h}h ${mins % 60}m` : `${mins}m`;
}

/**
 * Change over a window as dollars and percent: "+$86 (+1.8%)" / "−$10 (−2.1%)".
 * `nowCents` is the value today; the percent is against the value at the start of the window.
 * Null when the change is under a dollar (nothing worth saying).
 */
export function changeText(deltaCents: number, nowCents: number): string | null {
  if (Math.abs(deltaCents) < 100) return null;
  const sign = deltaCents > 0 ? '+' : MINUS;
  const start = nowCents - deltaCents;
  const pctText =
    start > 0 ? ` (${sign}${(Math.round((Math.abs(deltaCents) / start) * 1000) / 10).toFixed(1)}%)` : '';
  return `${sign}${money(Math.abs(deltaCents))}${pctText}`;
}

/** "2026-11-05" → "Nov 5". */
export function shortDay(day: string): string {
  return new Date(`${day.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** Sale date: "Nov 5", with the year when it isn't this year ("Nov 5, 2025"). */
export function saleDay(day: string, now = Date.now()): string {
  const d = new Date(`${day.slice(0, 10)}T12:00:00Z`);
  const thisYear = new Date(now).getUTCFullYear() === d.getUTCFullYear();
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: thisYear ? undefined : 'numeric', timeZone: 'UTC' });
}

const SOURCES: Record<string, string> = { ebay: 'eBay', fanatics: 'Fanatics' };
const KINDS: Record<string, string> = { auction: 'Auction', bin: 'Buy It Now', offer: 'Best Offer · accepted offer' };

/** "eBay · Auction", "Fanatics · Buy It Now", "eBay · Best Offer · accepted offer". */
export function saleLine(s: { source: string; kind: string | null }): string {
  const source = SOURCES[s.source] ?? s.source.charAt(0).toUpperCase() + s.source.slice(1);
  return s.kind && KINDS[s.kind] ? `${source} · ${KINDS[s.kind]}` : source;
}

/** "1 sale" / "3 sales". */
export function salesWord(n: number): string {
  return `${n} ${n === 1 ? 'sale' : 'sales'}`;
}

/** 1 → "1st", 2 → "2nd", 11 → "11th", 23 → "23rd". */
export function ordinal(n: number): string {
  const t = n % 100;
  const s = t >= 11 && t <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${s}`;
}
