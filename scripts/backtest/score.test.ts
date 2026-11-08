/**
 * @jest-environment node
 */
// Backtest scorer: what the scan screen would decide for each photo, against the truth.
// Skipped in a normal `npm test`; run on the Mac after `slabby-scan read` (see README):
//
//   BACKTEST_DIR=<set dir> BACKTEST_READS=<set dir>/reads-synth.jsonl \
//   EXPO_PUBLIC_SUPABASE_URL=… EXPO_PUBLIC_SUPABASE_ANON_KEY=… npx jest scripts/backtest --testPathIgnorePatterns=/node_modules/
//
// For each photo it follows Photo mode's order: the text read (number) → the art when no number
// → the enlarged-pieces read → the art's pick list. It writes <reads>.report.md with hit rates,
// wrong answers, latency and the distance spread used to tune ART_SURE / ART_GAP.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { artRead, artSure, combine, printsOf, rankArt, weakNumber, type ArtHit, type FoundCard } from '../../src/services/artMatch';
import { fitsRead, numberVariants, readName, type ParsedCard } from '../../src/services/cardScan';
import { readPhoto } from '../../src/services/photoScan';
import type { CatalogCard } from '../../src/services/search';
import type { LabelLine } from '../../src/services/label';

const DIR = process.env.BACKTEST_DIR;
const READS = process.env.BACKTEST_READS;
const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const run = DIR && READS && existsSync(READS) ? it : it.skip;

type Truth = { productId: number; game: string; language: string; name: string; number: string | null; setName: string; setCode: string | null };
type Read = { file: string; lines: LabelLine[]; tileLines: LabelLine[]; ocrMs: number; cardMs: number; tileMs: number; card?: FoundCard };
type Outcome = 'number' | 'art' | 'tiles' | 'pick' | 'wrong' | 'miss';

const pct = (a: number[], p: number) => (a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))] : NaN);
const share = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : '—');

/** POST JSON with Node's https (jest-expo replaces the global fetch with one that has no status or json). */
function postJson(url: string, headers: Record<string, string>, body: unknown): Promise<unknown> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const https = require('node:https') as typeof import('node:https');
  const data = JSON.stringify(body);
  return new Promise((resolve) => {
    const req = https.request(url, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, (res) => {
      let text = '';
      res.on('data', (c) => (text += c));
      res.on('end', () => {
        if ((res.statusCode ?? 500) >= 300) {
          console.warn(`match_card_art ${res.statusCode}: ${text.slice(0, 200)}`);
          return resolve([]);
        }
        try {
          resolve(JSON.parse(text));
        } catch {
          resolve([]);
        }
      });
    });
    req.on('error', (e) => {
      console.warn(`match_card_art: ${e.message}`);
      resolve([]);
    });
    req.end(data);
  });
}

async function matchArt(card: FoundCard): Promise<{ hits: ArtHit[]; ms: number }> {
  const prints = printsOf(card);
  const t = Date.now();
  const rows = (await postJson(`${URL}/rest/v1/rpc/match_card_art`, { apikey: KEY!, Authorization: `Bearer ${KEY}` }, {
    face: prints[0].face,
    art: prints[0].art,
    face2: prints[1].face,
    art2: prints[1].art,
    lim: 24,
  })) as Parameters<typeof rankArt>[0];
  return { hits: rankArt(Array.isArray(rows) ? rows : [], prints), ms: Date.now() - t };
}

/** The same card: its product, or the same name and number (a reprint or another listing of it). */
function isTruth(c: CatalogCard, t: Truth): boolean {
  if (c.productId === t.productId) return true;
  const n = (s: string | null) => (s ?? '').split('/')[0].replace(/^0+(?=\d)/, '').toUpperCase();
  return c.name.toUpperCase() === t.name.toUpperCase() && n(c.number) === n(t.number);
}

/** A number read that the truth card carries. */
function numberFits(read: ParsedCard, t: Truth): boolean {
  if (!t.number) return false;
  const card = { number: t.number, setCode: t.setCode } as CatalogCard;
  return fitsRead(card, read) || read.numbers.some((n) => numberVariants(n).some((v) => v.split('/')[0] === t.number!.split('/')[0]));
}

run('backtest', async () => {
  const truth = JSON.parse(readFileSync(join(DIR!, 'truth.json'), 'utf8')) as Record<string, Truth>;
  const reads = readFileSync(READS!, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Read);
  const rows: { file: string; outcome: Outcome; ms: number; artTop1: boolean; artTop5: boolean; dTrue: number | null; dOther: number | null; edge: boolean; detail: string }[] = [];
  const lat = { ocr: [] as number[], card: [] as number[], tiles: [] as number[], rpc: [] as number[] };

  for (const r of reads) {
    const t = truth[(r.file.match(/^\d+/) ?? [''])[0]];
    if (!t) continue;
    lat.ocr.push(r.ocrMs);
    lat.card.push(r.cardMs);
    const art = r.card && URL && KEY ? await matchArt(r.card) : null;
    if (art) lat.rpc.push(art.ms);
    const hits = art?.hits ?? [];
    const iTrue = hits.findIndex((h) => isTruth(h.card, t));
    const dTrue = iTrue >= 0 ? hits[iTrue].distance : null;
    const dOther = hits.find((h) => !isTruth(h.card, t))?.distance ?? null;
    const found = { hits, edge: !!r.card?.found };

    // Photo mode's order (app/scan.tsx readStill).
    let outcome: Outcome = 'miss';
    let ms = r.ocrMs + Math.max(r.cardMs + (art?.ms ?? 0) - r.ocrMs, 0);
    let detail = '';
    const first = readPhoto(r.lines);
    const top = hits[0];
    if (first.kind === 'card' && weakNumber(first.card) && top && artSure(hits, found.edge) && !(top.card.number && fitsRead(top.card, first.card))) {
      // combine(): a sure art match overrules a short bare number it doesn't fit.
      outcome = isTruth(top.card, t) ? 'art' : 'wrong';
      detail = `art over number ${first.card.numbers.map((n) => n.num).join(',')}: ${top.card.name} ${top.card.number}`;
    } else if (first.kind === 'card') {
      outcome = numberFits(first.card, t) ? 'number' : 'wrong';
      detail = `number ${first.card.numbers.map((n) => n.num).join(',')}`;
    } else {
      const read = artRead(r.lines, readName);
      const id = combine([], found, read);
      if (id.confident) {
        outcome = isTruth(id.matches[0].card, t) ? 'art' : 'wrong';
        detail = `art ${id.matches[0].card.name} ${id.matches[0].card.number}`;
      } else {
        ms += r.tileMs;
        lat.tiles.push(r.tileMs);
        const again = readPhoto([...r.lines, ...r.tileLines]);
        if (again.kind === 'card') {
          outcome = numberFits(again.card, t) ? 'tiles' : 'wrong';
          detail = `tiles ${again.card.numbers.map((n) => n.num).join(',')}`;
        } else if (id.matches.length) {
          outcome = id.matches.some((m) => isTruth(m.card, t)) ? 'pick' : 'miss';
          detail = `pick of ${id.matches.length}`;
        }
      }
    }
    rows.push({ file: r.file, outcome, ms, artTop1: iTrue === 0, artTop5: iTrue >= 0 && iTrue < 5, dTrue, dOther, edge: found.edge, detail });
  }

  const n = rows.length;
  const count = (o: Outcome) => rows.filter((r) => r.outcome === o).length;
  const right = count('number') + count('art') + count('tiles');
  const trueD = rows.map((r) => r.dTrue).filter((d): d is number => d != null);
  const otherD = rows.map((r) => r.dOther).filter((d): d is number => d != null);
  const report = [
    `# Scan backtest: ${READS}`,
    '',
    `${n} photos. Right without asking: ${share(right, n)} (number ${count('number')}, art ${count('art')}, closer look ${count('tiles')}). In a pick list: ${share(count('pick'), n)}. Wrong: ${share(count('wrong'), n)}. Missed: ${share(count('miss'), n)}.`,
    '',
    `Art alone: top-1 ${share(rows.filter((r) => r.artTop1).length, n)}, top-5 ${share(rows.filter((r) => r.artTop5).length, n)}. Card edge found in ${share(rows.filter((r) => r.edge).length, n)}.`,
    '',
    `Time to answer (ms): p50 ${pct(rows.map((r) => r.ms), 0.5)}, p90 ${pct(rows.map((r) => r.ms), 0.9)}. Text read p50 ${pct(lat.ocr, 0.5)}, card find p50 ${pct(lat.card, 0.5)}, art lookup p50 ${pct(lat.rpc, 0.5)}, closer look p50 ${pct(lat.tiles, 0.5)} (Mac timings; a recent iPhone is in the same range).`,
    '',
    `Art distance, right card: p50 ${pct(trueD, 0.5)?.toFixed?.(1)}, p90 ${pct(trueD, 0.9)?.toFixed?.(1)}. Nearest wrong card: p10 ${pct(otherD, 0.1)?.toFixed?.(1)}, p50 ${pct(otherD, 0.5)?.toFixed?.(1)}.`,
    '',
    '| photo | outcome | ms | art d (right / nearest wrong) | detail |',
    '|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.file} | ${r.outcome} | ${r.ms} | ${r.dTrue?.toFixed(1) ?? '—'} / ${r.dOther?.toFixed(1) ?? '—'} | ${r.detail} |`),
  ].join('\n');
  writeFileSync(`${READS}.report.md`, report);
  console.log(report.split('\n').slice(0, 10).join('\n'));
  expect(n).toBeGreaterThan(0);
}, 600_000);
