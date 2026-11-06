// Generates src/mocks/sales.json from cards.json and prices.json, so Slab detail and Recent sales
// agree: for every graded card, the newest sale is on its lastSaleDay (else asOf), the 30-day
// window holds sales30d sales whose median is its market and whose 10th/90th sit at low/high,
// and the 90-day window holds sales90d sales that follow its series90 trend.
// Usage: node scripts/gen-sales-mocks.js
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'src', 'mocks');
const cards = require(path.join(dir, 'cards.json'));
const prices = require(path.join(dir, 'prices.json'));

let seed = 11;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const key = (c) => `${c.grader}:${c.grade ?? ''}:${c.setCode}:${c.number}:${c.language}`;
const minus = (day, n) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};
// Listings for these cards, daily averages for the rest (the two shapes the server can send).
const LISTINGS = new Set(['c1', 'c3', 'c5', 'c8']);
// One clearly low sale in Mew's 30 days, to show an outlier on the strip and in the list.
const OUTLIER = new Set(['c1']);
const KINDS = ['auction', 'bin', 'auction', 'offer', 'bin'];

/** Price at quantile q: through (0, low−), (0.1, low), (0.5, market), (0.9, high), (1, high+). */
function quantile(p, q) {
  const pts = [
    [0, p.lowCents - (p.marketCents - p.lowCents) * 0.4],
    [0.1, p.lowCents],
    [0.5, p.marketCents],
    [0.9, p.highCents],
    [1, p.highCents + (p.highCents - p.marketCents) * 0.4],
  ];
  for (let i = 1; i < pts.length; i++) {
    const [q0, v0] = pts[i - 1];
    const [q1, v1] = pts[i];
    if (q <= q1) return v0 + ((v1 - v0) * (q - q0)) / (q1 - q0);
  }
  return pts[pts.length - 1][1];
}

const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const out = {};
for (const card of cards) {
  if (card.grader === 'raw') continue;
  const k = key(card);
  const p = prices[k];
  if (!p || !p.sales30d) continue;
  const step = p.marketCents >= 50000 ? 500 : 100;
  const round = (v) => Math.max(step, Math.round(v / step) * step);
  const end = p.lastSaleDay ?? p.asOf;
  const n30 = p.sales30d;
  const n90 = Math.max(p.sales90d ?? n30, n30);

  // 30 days: evenly spaced quantiles, so median/low/high land on the price mock.
  const recent = Array.from({ length: n30 }, (_, i) => round(quantile(p, n30 === 1 ? 0.5 : i / (n30 - 1))));
  if (OUTLIER.has(card.id)) recent[0] = round(p.marketCents * 0.72);
  shuffle(recent);
  const sales = recent.map((cents, i) => ({ day: i === 0 ? end : minus(end, Math.floor(rnd() * 30)), cents }));

  // Days 31–90: the same spread, scaled by the market on that day.
  const series = p.series90;
  for (let i = 0; i < n90 - n30; i++) {
    const back = 30 + Math.floor(rnd() * 60);
    const day = minus(end, back);
    const ratio = series[Math.max(0, series.length - 1 - back)] / p.marketCents;
    sales.push({ day, cents: round(quantile(p, rnd()) * ratio) });
  }
  sales.sort((a, b) => (a.day === b.day ? 0 : a.day < b.day ? 1 : -1));

  if (LISTINGS.has(card.id)) {
    out[k] = {
      kind: 'sales',
      rows: sales.map((s, i) => ({
        source: i % 5 === 3 ? 'fanatics' : 'ebay',
        listingId: `${card.id}-${i + 1}`,
        soldDay: s.day,
        soldAt: null,
        priceCents: s.cents,
        kind: KINDS[i % KINDS.length],
        url: null,
      })),
    };
  } else {
    const byDay = new Map();
    for (const s of sales) {
      const d = byDay.get(s.day) ?? { n: 0, sum: 0 };
      d.n++;
      d.sum += s.cents;
      byDay.set(s.day, d);
    }
    out[k] = {
      kind: 'daily',
      rows: [...byDay.entries()].map(([day, d]) => ({ day, sales: d.n, avgCents: Math.round(d.sum / d.n / 100) * 100 })),
    };
  }
}

fs.writeFileSync(path.join(dir, 'sales.json'), `${JSON.stringify(out, null, 2)}\n`);
console.log(Object.entries(out).map(([k, v]) => `${k} ${v.kind} ${v.rows.length}`).join('\n'));
