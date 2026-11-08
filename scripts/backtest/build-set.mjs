#!/usr/bin/env node
// Build a backtest set: catalog cards from TCGplayer (via TCGCSV, free) across Pokémon EN/JP,
// One Piece and Riftbound, their catalog images, and real phone photos of the same cards from
// eBay listings (sellers' own photos: glare, sleeves, angles, desks).
//
//   node scripts/backtest/build-set.mjs <set dir> [--sets 6] [--per-set 3] [--ebay 2] [--seed 1] [--urls photos.json]
//
// Writes <set dir>/truth.json ({ productId: card }), catalog/<id>.jpg and ebay/<id>-e<n>.jpg.
// Then `slabby-scan synth <set dir>` makes synthetic phone photos from catalog/ (see README).
// Needs a normal internet connection (the cloud sandbox can't reach TCGCSV or eBay).

import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith('--'));
const opt = (name, d) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : d;
};
if (!dir) {
  console.error('usage: build-set.mjs <set dir> [--sets 6] [--per-set 3] [--ebay 2] [--seed 1]');
  process.exit(2);
}
const SETS = opt('sets', 6);
const PER_SET = opt('per-set', 3);
const EBAY = opt('ebay', 2);
let seed = opt('seed', 1);
const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
const pick = (a, n) => [...a].sort(() => rnd() - 0.5).slice(0, n);

const CATEGORIES = [
  { id: 3, game: 'pokemon', language: 'en' },
  { id: 85, game: 'pokemon', language: 'ja' },
  { id: 68, game: 'onepiece', language: 'en' },
  { id: 89, game: 'riftbound', language: 'en' },
];
const UA = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15' };
const TCGCSV = 'https://tcgcsv.com/tcgplayer';

async function results(path) {
  const res = await fetch(`${TCGCSV}${path}`, { headers: UA });
  if (!res.ok) throw new Error(`tcgcsv ${res.status} ${path}`);
  return (await res.json()).results ?? [];
}

async function download(url, file) {
  if (existsSync(file)) return true;
  const res = await fetch(url, { headers: UA });
  if (!res.ok) return false;
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return true;
}

const ext = (p, name) => p.extendedData?.find((e) => e.name === name)?.value ?? null;

mkdirSync(join(dir, 'catalog'), { recursive: true });
mkdirSync(join(dir, 'ebay'), { recursive: true });
const truthFile = join(dir, 'truth.json');
const truth = existsSync(truthFile) ? JSON.parse(readFileSync(truthFile, 'utf8')) : {};

for (const cat of CATEGORIES) {
  const groups = await results(`/${cat.id}/groups`);
  for (const g of pick(groups, SETS)) {
    const products = (await results(`/${cat.id}/${g.groupId}/products`)).filter((p) => ext(p, 'Number'));
    for (const p of pick(products, PER_SET)) {
      const card = {
        productId: p.productId,
        game: cat.game,
        language: cat.language,
        name: p.name,
        number: ext(p, 'Number'),
        rarity: ext(p, 'Rarity'),
        setName: g.name,
        setCode: g.abbreviation ?? null,
      };
      const ok = await download(`https://tcgplayer-cdn.tcgplayer.com/product/${p.productId}_400w.jpg`, join(dir, 'catalog', `${p.productId}.jpg`));
      if (!ok) continue;
      truth[p.productId] = card;
      process.stderr.write(`${cat.game}/${cat.language} ${g.name}: ${p.name} ${card.number}\n`);
    }
  }
}

// eBay: listings of each card, sellers' own photos. A listing's title must carry the card's
// number and first name word, so the photo is (almost certainly) that card.
async function ebayPhotos(card) {
  const num = String(card.number).split('/')[0].replace(/^0+(?=\d)/, '');
  const name = card.name.replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+-\s+.*$/, '').trim();
  const q = `${name} ${card.number}`;
  const res = await fetch(`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}&_sacat=0&LH_BIN=1`, { headers: UA });
  if (!res.ok) return [];
  const html = await res.text();
  const out = [];
  // Each result: a title and its image (s-l140/s-l225/s-l500 → s-l1600 for the full photo).
  const items = [...html.matchAll(/<li[^>]*class="[^"]*s-(?:item|card)[^"]*"[\s\S]*?<\/li>/g)].map((m) => m[0]);
  for (const li of items) {
    const title = (li.match(/(?:s-item__title|s-card__title)[^>]*>(?:<[^>]+>)*([^<]+)/) ?? [])[1] ?? '';
    const img = (li.match(/https:\/\/i\.ebayimg\.com\/images\/g\/[^"\s]+?\/s-l\d+\.(?:jpg|webp)/) ?? [])[0];
    if (!img || !title) continue;
    const t = title.toUpperCase();
    if (!t.includes(name.split(' ')[0].toUpperCase())) continue;
    if (!new RegExp(`(^|\\D)0*${num}(\\D|$)`).test(t)) continue;
    if (/\b(PSA|BGS|CGC|SGC|GRADED|LOT|BUNDLE|PROXY|CUSTOM)\b/.test(t)) continue; // raw singles only
    out.push(img.replace(/s-l\d+\.(jpg|webp)$/, 's-l1600.jpg'));
    if (out.length >= EBAY) break;
  }
  return out;
}

// Real photos found by hand or in a browser (eBay blocks scripts): { "<productId>": ["https://…jpg"] }.
// The cards must already be in truth.json (from an earlier run of this script).
const URLS = (() => {
  const i = args.indexOf('--urls');
  return i >= 0 ? args[i + 1] : null;
})();
if (URLS) {
  const list = JSON.parse(readFileSync(URLS, 'utf8'));
  for (const [id, urls] of Object.entries(list)) {
    if (!truth[id]) {
      process.stderr.write(`urls: ${id} isn't in truth.json, skipped\n`);
      continue;
    }
    let n = 0;
    for (const u of urls) if (await download(u, join(dir, 'ebay', `${id}-u${n}.jpg`))) n++;
    process.stderr.write(`urls ${truth[id].name}: ${n}\n`);
  }
}

if (EBAY > 0 && !URLS) {
  for (const card of Object.values(truth)) {
    try {
      const urls = await ebayPhotos(card);
      let n = 0;
      for (const u of urls) if (await download(u, join(dir, 'ebay', `${card.productId}-e${n}.jpg`))) n++;
      process.stderr.write(`ebay ${card.name}: ${n}\n`);
      await new Promise((r) => setTimeout(r, 1500)); // gentle on eBay
    } catch (e) {
      process.stderr.write(`ebay ${card.name}: ${e.message}\n`);
    }
  }
}

writeFileSync(truthFile, JSON.stringify(truth, null, 1));
console.error(`truth: ${Object.keys(truth).length} cards → ${truthFile}`);
