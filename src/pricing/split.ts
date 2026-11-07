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
