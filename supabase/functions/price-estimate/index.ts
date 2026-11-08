// price-estimate: find a price for a card that has no price source (Korean and Chinese promos,
// old JP promos TCGplayer has no market for). Runs only when the user taps "Find a price".
// Body: { cardKey, name, setName, setCode, number, language, grader, grade, year, variety }.
//
// A model runs a few web searches for recent sold listings (eBay, PriceCharting, SNKRDUNK, Korean
// and Chinese marketplaces) and reports each sale it found. The server keeps only sales whose link
// came back from the search itself, in the card's own language and grade (a Korean card never
// takes a Japanese price), from the last year, then takes the median in US dollars. The answer
// is an estimate, never a comp: it's stored in price_estimates, not price_daily, and the app shows
// it as "Estimate · from N sales found online" with the links.
//
// Cached 7 days per card_key; a fresh row is returned without spending anything. Spend is capped
// per day through claim_ppt_credits in its own "estimate" bucket (ESTIMATE_DAILY_CAP, default 100).
// Needs the ANTHROPIC_API_KEY secret. ESTIMATE_MODEL and ESTIMATE_EFFORT override the defaults.
//
// Answers 200 with { status: 'found' | 'none', estimate } or { status: 'capped' | 'error', message }.

import Anthropic from 'npm:@anthropic-ai/sdk@1.6.0';
import { zodOutputFormat } from 'npm:@anthropic-ai/sdk@1.6.0/helpers/zod';
import { z } from 'npm:zod@4.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  cleanSales,
  estimateIsFresh,
  summarizeEstimate,
  usdPerFromRates,
  type Estimate,
  type FoundSale,
} from '../_shared/estimate-math.ts';

const MODEL = Deno.env.get('ESTIMATE_MODEL') ?? 'claude-opus-5-5';
const EFFORT = (Deno.env.get('ESTIMATE_EFFORT') ?? 'medium') as 'low' | 'medium' | 'high';
const DAILY_CAP = Number(Deno.env.get('ESTIMATE_DAILY_CAP') ?? 100);
/** Web searches per card. Each is about 1¢ on top of the tokens. */
const MAX_SEARCHES = 5;
/** The function's wall clock is 150 s; answer well inside it, with whatever was logged. */
const HANDLER_MS = 120_000;

type Status = 'found' | 'none' | 'capped' | 'error';
const json = (status: Status, extra: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ status, ...extra }), { status: 200, headers: { 'Content-Type': 'application/json' } });

const Sale = z.object({
  title: z.string(),
  url: z.string(),
  source: z.string(),
  amount: z.number(),
  currency: z.string(),
  soldOn: z.string().nullable(),
  language: z.enum(['en', 'ja', 'ko', 'zh', 'other']).nullable(),
  grade: z.string().nullable(),
  sold: z.boolean(),
});
const Answer = z.object({ sales: z.array(Sale) });

const LANGUAGE: Record<string, string> = { en: 'English', ja: 'Japanese', ko: 'Korean', zh: 'Chinese', id: 'Indonesian' };

type CardBody = {
  cardKey: string;
  name: string;
  setName: string | null;
  setCode: string | null;
  number: string | null;
  language: string;
  grader: 'psa' | 'bgs' | 'cgc' | 'raw';
  grade: number | null;
  year: number | null;
  variety: string | null;
};

function readBody(b: unknown): CardBody | null {
  const o = b as Record<string, unknown> | null;
  if (!o || typeof o.cardKey !== 'string' || typeof o.name !== 'string' || typeof o.language !== 'string') return null;
  const grader = o.grader;
  if (grader !== 'psa' && grader !== 'bgs' && grader !== 'cgc' && grader !== 'raw') return null;
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return {
    cardKey: o.cardKey,
    name: o.name.trim(),
    setName: str(o.setName),
    setCode: str(o.setCode),
    number: str(o.number),
    language: o.language,
    grader,
    grade: num(o.grade),
    year: num(o.year),
    variety: str(o.variety),
  };
}

function prompt(c: CardBody): string {
  const lang = LANGUAGE[c.language] ?? c.language;
  const grade = c.grader === 'raw' ? 'ungraded (raw)' : `${c.grader.toUpperCase()} ${c.grade ?? ''}`.trim();
  const lines = [
    `Card: ${c.name}`,
    c.setName ? `Set: ${c.setName}` : null,
    c.setCode ? `Set code: ${c.setCode}` : null,
    c.number ? `Card number: ${c.number}` : null,
    c.variety ? `Variety: ${c.variety}` : null,
    c.year ? `Year: ${c.year}` : null,
    `Language: ${lang}`,
    `Condition: ${grade}`,
  ].filter(Boolean);
  return `Find what this Pokémon card has actually sold for recently.

${lines.join('\n')}

Search the web for completed or sold listings of exactly this card in this language and this grade: eBay sold listings, PriceCharting, SNKRDUNK, 130point, Card Ladder, and marketplaces in the card's own country (for Korean cards: Bunjang, Naver, Danggeun; for Chinese cards: Xianyu, Taobao). Search in the card's language as well as English, using the card's name in that language.

Report each individual sale you found, with the link to the page that shows it.
- Only this exact card: same language (a ${lang} card is never priced from a Japanese or English copy), same card number, same grader and grade.
- language is the card's print language in the listing. grade is written like "PSA 10", or "raw" for ungraded.
- amount and currency are what it sold for, as shown on the page (currency as an ISO code: USD, KRW, JPY, CNY, TWD, HKD).
- soldOn is the sale date as YYYY-MM-DD, or null if the page doesn't say.
- sold is true only for a completed sale. An asking price or an active listing is sold: false.
- Leave out lots and bundles. Never make up a sale, a price or a link; an empty list is a fine answer.`;
}

/** Every URL in the search results the model got back, at any depth of the tool result blocks. */
function searchedUrls(content: unknown[]): Set<string> {
  const out = new Set<string>();
  const walk = (v: unknown, inResult: boolean) => {
    if (Array.isArray(v)) return v.forEach((x) => walk(x, inResult));
    if (!v || typeof v !== 'object') return;
    const o = v as Record<string, unknown>;
    const isResult = inResult || (typeof o.type === 'string' && o.type.endsWith('tool_result'));
    if (isResult && typeof o.url === 'string') out.add(o.url);
    for (const k of Object.keys(o)) if (k !== 'encrypted_content' && k !== 'encrypted_index') walk(o[k], isResult);
  };
  walk(content, false);
  return out;
}

async function usdRates(): Promise<Record<string, number>> {
  try {
    const res = await fetch('https://api.frankfurter.app/latest?from=USD', { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return usdPerFromRates(null);
    return usdPerFromRates((await res.json())?.rates);
  } catch {
    return usdPerFromRates(null);
  }
}

function rowToEstimate(r: { price_cents: number | null; low_cents: number | null; high_cents: number | null; sales: unknown; found_at: string }): Estimate | null {
  if (r.price_cents == null) return null;
  return { priceCents: r.price_cents, lowCents: r.low_cents ?? r.price_cents, highCents: r.high_cents ?? r.price_cents, sales: (r.sales as Estimate['sales']) ?? [], foundAt: r.found_at };
}

Deno.serve((req) => {
  const t0 = Date.now();
  const log = (step: string) => console.log(`price-estimate ${step} +${Date.now() - t0}ms`);
  return Promise.race([
    handle(req, log).catch((e) => {
      console.error('price-estimate failed', e);
      return json('error', { message: 'estimate failed' });
    }),
    new Promise<Response>((resolve) =>
      setTimeout(() => {
        log('gave up');
        resolve(json('error', { message: 'timeout' }));
      }, HANDLER_MS),
    ),
  ]);
});

async function handle(req: Request, log: (s: string) => void): Promise<Response> {
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!jwt || !(await admin.auth.getUser(jwt)).data.user) return json('error', { message: 'Sign in first' });
  if (!Deno.env.get('ANTHROPIC_API_KEY')) return json('error', { message: 'not_configured' });

  const card = readBody(await req.json().catch(() => null));
  if (!card) return json('error', { message: 'Bad request' });
  log(`card ${card.cardKey}`);

  // A search in the last week answers again for free, found or not.
  const { data: cached } = await admin.from('price_estimates').select('*').eq('card_key', card.cardKey).maybeSingle();
  if (cached && estimateIsFresh(cached.found_at)) {
    const est = rowToEstimate(cached);
    log(`cached ${est ? 'found' : 'none'}`);
    return est ? json('found', { estimate: est }) : json('none', { foundAt: cached.found_at });
  }

  const ok = (await admin.rpc('claim_ppt_credits', { bucket_name: 'estimate', n: 1, daily_cap: DAILY_CAP })).data === true;
  if (!ok) return json('capped');

  const client = new Anthropic({ timeout: 110_000, maxRetries: 0 });
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: prompt(card) }];
  const all: unknown[] = [];
  let parsed: z.infer<typeof Answer> | null = null;
  let searches = 0;
  try {
    // A long search turn can pause; hand it back so the server carries on (at most twice).
    for (let turn = 0; turn < 3; turn++) {
      const res = await client.messages.parse({
        model: MODEL,
        max_tokens: 16000,
        output_config: { effort: EFFORT, format: zodOutputFormat(Answer) },
        tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: MAX_SEARCHES }] as never,
        messages,
      });
      all.push(...res.content);
      searches += (res.usage as { server_tool_use?: { web_search_requests?: number } }).server_tool_use?.web_search_requests ?? 0;
      log(`turn ${turn} ${res.stop_reason} in:${res.usage.input_tokens} out:${res.usage.output_tokens} searches:${searches}`);
      if (res.stop_reason === 'pause_turn') {
        messages.push({ role: 'assistant', content: res.content });
        continue;
      }
      if (res.stop_reason !== 'refusal') parsed = res.parsed_output ?? null;
      break;
    }
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json('error', { message: 'busy' });
    if (e instanceof Anthropic.AuthenticationError) return json('error', { message: 'not_configured' });
    if (e instanceof Anthropic.APIError) {
      console.error('price-estimate model error', e.status, e.message);
      return json('error', { message: `model ${e.status}` });
    }
    throw e;
  }

  const urls = searchedUrls(all);
  const found = (parsed?.sales ?? []) as FoundSale[];
  const sales = cleanSales(found, card, urls, { usdPer: await usdRates() });
  log(`model ${found.length} sales, ${urls.size} links searched, kept ${sales.length}`);
  const foundAt = new Date().toISOString();
  const est = summarizeEstimate(sales, foundAt);

  await admin.from('price_estimates').upsert({
    card_key: card.cardKey,
    found_at: foundAt,
    price_cents: est?.priceCents ?? null,
    low_cents: est?.lowCents ?? null,
    high_cents: est?.highCents ?? null,
    sales: est?.sales ?? [],
    searches,
    model: MODEL,
  });
  return est ? json('found', { estimate: est }) : json('none', { foundAt });
}
