// Generates src/mocks/cards.json and prices.json deterministically.
const fs = require('fs');
const out = process.argv[2];
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const $ = (d) => Math.round(d * 100);
const cards = [
  // name, grader, grade, set, code, num, lang, year, plan, paid, market, low, high, sales, trend(90d %), color, condition
  ['Mew ex', 'psa', 10, '151', 'SV2a', '205', 'ja', 2023, 'hold', 650, 1040, 980, 1120, 22, 0.18, '#7FC8F2'],
  ['Umbreon VMAX alt art', 'psa', 10, 'Evolving Skies', 'EVS', '215', 'en', 2021, 'hold', 1301, 1210, 1150, 1330, 31, -0.07, '#2B2B33'],
  ['Lugia V alt art', 'psa', 10, 'Silver Tempest', 'SIT', '186', 'en', 2022, 'hold', 420, 610, 570, 660, 18, 0.09, '#B9C4D6'],
  ['Gengar VMAX alt art', 'psa', 10, 'Fusion Strike', 'FST', '271', 'en', 2021, 'hold', 700, 880, 820, 940, 14, 0.04, '#5B3C88'],
  ['Charizard ex', 'psa', 10, '151', 'SV2a', '201', 'ja', 2023, 'sell', 95, 150, 137, 172, 40, 0.12, '#E8643A'],
  ['Giratina V alt art', 'psa', 9, 'Lost Origin', 'LOR', '186', 'en', 2022, 'sell', 190, 273, 263, 280, 26, 0.0, '#6E5FB0'],
  ['Pikachu ex SAR', 'raw', null, 'Surging Sparks', 'SSP', '238', 'en', 2024, 'sell', 60, 91, 84, 99, 0, -0.1, '#F2C230', 'near mint'],
  ['Umbreon V alt art', 'psa', 9, 'Evolving Skies', 'EVS', '189', 'en', 2021, 'sell', 400, 520, 505, 560, 19, 0.08, '#3A6EA5'],
  ['Mewtwo ex SAR', 'psa', 10, 'Pokemon 151', 'MEW', '193', 'en', 2023, 'sell', 120, 191, 184, 205, 33, 0.01, '#4B5BD6'],
];
const key = (c) => `${c[1]}:${c[2] ?? ''}:${c[4]}:${c[5]}:${c[6]}`;
const cardsJson = cards.map((c, i) => ({
  id: `c${i + 1}`,
  certNumber: c[1] === 'psa' ? String(81234560 + i * 7) : null,
  grader: c[1], grade: c[2], name: c[0], setName: c[3], setCode: c[4], number: c[5],
  language: c[6], year: c[7], imageFrontUrl: null, artColor: c[15], condition: c[16],
  paidCents: $(c[9]), paidAt: '2025-06-01', plan: c[8],
  floorOverrideCents: null, askOverrideCents: null,
  status: 'owned', soldCents: null, soldAt: null, soldWhere: null,
  createdAt: '2025-06-01T00:00:00Z',
}));
const prices = {};
for (const c of cards) {
  const market = c[10], trend = c[14];
  const start = market / (1 + trend);
  const series = [];
  for (let d = 0; d < 90; d++) {
    const t = d / 89;
    const noise = (rnd() - 0.5) * 0.04 * market;
    series.push($(start + (market - start) * t + (d === 89 ? 0 : noise)));
  }
  prices[key(c)] = {
    marketCents: $(market), lowCents: $(c[11]), highCents: $(c[12]), sales30d: c[13],
    asOf: '2026-11-05', series90: series,
  };
}
fs.writeFileSync(out + '/cards.json', JSON.stringify(cardsJson, null, 2) + '\n');
fs.writeFileSync(out + '/prices.json', JSON.stringify(prices, null, 1) + '\n');
