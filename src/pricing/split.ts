// Splitting one bundle price across several slabs sold together (Select mode → Mark sold).
// Pure, integer cents. Each slab's share follows its market price; slabs with no market price
// share evenly with each other only when none has one. Rounding goes to the biggest shares so the
// parts always add up to the total exactly.

export function splitTotal(totalCents: number, weights: (number | null)[]): number[] {
  const n = weights.length;
  if (!n) return [];
  const known = weights.map((w) => (w != null && w > 0 ? w : 0));
  const sum = known.reduce((a, b) => a + b, 0);
  const w = sum > 0 ? known : weights.map(() => 1);
  const total = sum > 0 ? sum : n;
  const raw = w.map((x) => (totalCents * x) / total);
  const parts = raw.map(Math.floor);
  let left = totalCents - parts.reduce((a, b) => a + b, 0);
  // Hand out the leftover cents by largest remainder.
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]);
  for (let k = 0; left > 0; k = (k + 1) % n, left--) parts[order[k][1]] += 1;
  return parts;
}

/**
 * A deal's split after you've typed some cards' shares yourself. `fixed[i]` is a share you set
 * (or null to let it follow the market). The cards you didn't set share what's left of the total
 * by market. Whole-dollar totals split into whole dollars, so nobody's share reads $133.33.
 * When every card is set, the shares are what you typed (they may no longer add up to `total`;
 * the sheet says so).
 */
export function splitDeal(totalCents: number, weights: (number | null)[], fixed: (number | null)[] = []): number[] {
  const n = weights.length;
  const isFixed = (i: number) => fixed[i] != null;
  const set = weights.reduce<number>((a, _, i) => a + (isFixed(i) ? fixed[i]! : 0), 0);
  const free = weights.map((_, i) => i).filter((i) => !isFixed(i));
  const left = Math.max(0, totalCents - set);
  const dollars = left % 100 === 0;
  const parts = free.length ? splitTotal(dollars ? left / 100 : left, free.map((i) => weights[i])) : [];
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) if (isFixed(i)) out[i] = fixed[i]!;
  free.forEach((i, k) => (out[i] = dollars ? parts[k] * 100 : parts[k]));
  return out;
}

/** The most one card's share can be: the total less what you've set for the other cards. */
export function maxShare(totalCents: number, fixed: (number | null)[], index: number): number {
  const others = fixed.reduce<number>((a, f, i) => a + (i !== index && f != null ? f : 0), 0);
  return Math.max(0, totalCents - others);
}
