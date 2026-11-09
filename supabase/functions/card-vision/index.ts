// card-vision: read a card photo the on-device text reader couldn't place (too far away, glare,
// a foreign card, an old promo with no number). Body: { image: base64 JPEG, about 1200 px }.
// A vision model writes down what's printed: a slab's grader label line by line, or a loose
// card's name, collector number, set code and language. It never names a price, and its name is
// only a search hint: the app runs these through the same parsers and catalog match as a live
// scan, so the card's name and price still come from the matched catalog card.
//
// Needs the ANTHROPIC_API_KEY secret. Spend is capped per day through the same daily ledger as
// PokemonPriceTracker credits, in its own "vision" bucket (VISION_DAILY_CAP photos, default 300),
// so it never touches the PPT buckets. VISION_MODEL overrides the model.

import Anthropic from 'npm:@anthropic-ai/sdk@1.6.0';
import { zodOutputFormat } from 'npm:@anthropic-ai/sdk@1.6.0/helpers/zod';
import { z } from 'npm:zod@4.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const MODEL = Deno.env.get('VISION_MODEL') ?? 'claude-opus-5-5';
const DAILY_CAP = Number(Deno.env.get('VISION_DAILY_CAP') ?? 300);
// About 1200 px on the long side arrives near 300 KB as base64; anything far bigger isn't from the app.
const MAX_IMAGE_CHARS = 4_000_000;
// Every step logs how long it took, and the whole request answers within HANDLER_MS: Bryan's
// first calls hung until the 150 s wall-clock limit with nothing logged.
const HANDLER_MS = 30_000;
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });

const Read = z.object({
  kind: z.enum(['slab', 'card', 'none']),
  /** Slab: the grader label's text, one printed line per entry, top to bottom, left column first. */
  labelLines: z.array(z.string()),
  /** Loose card: the name as printed, and in English when the card isn't. */
  name: z.string().nullable(),
  englishName: z.string().nullable(),
  /** As printed at the bottom: "199/165", "SWSH123", "SVP 049", "TG05/TG30". */
  number: z.string().nullable(),
  /** The small set code by the number: "MEW", "SV2a", "PAL". */
  setCode: z.string().nullable(),
  language: z.enum(['en', 'ja', 'ko', 'zh', 'other']).nullable(),
});
export type VisionRead = z.infer<typeof Read>;

const PROMPT = `This photo shows one trading card, either loose or in a grading slab (PSA, BGS/Beckett, CGC).
Write down only what is printed. Never guess text you can't see; use null or an empty list instead.
- Slab: kind "slab". In labelLines, copy the grader label's text exactly, one printed line per entry, top to bottom, left column before right (year and set, card number with "#", card name, variety, grade words, grade number, cert number).
- Loose card: kind "card". name is the card name as printed; englishName is its English name (same as name for English cards). number is the collector number exactly as printed at the bottom (e.g. "199/165", "SWSH123", "TG05/TG30"). setCode is the small set code printed near the number, if any. language is the card's print language.
- No card in the photo, or nothing readable: kind "none".
If several cards show, describe the largest, most central one.`;

Deno.serve((req) => {
  const t0 = Date.now();
  const log = (step: string) => console.log(`card-vision ${step} +${Date.now() - t0}ms`);
  log('start');
  return Promise.race([
    handle(req, log).catch((e) => {
      console.error('card-vision failed', e);
      return json({ error: 'vision failed' }, 502);
    }),
    new Promise<Response>((resolve) =>
      setTimeout(() => {
        log('gave up');
        resolve(json({ error: 'timeout' }, 504));
      }, HANDLER_MS),
    ),
  ]);
});

async function handle(req: Request, log: (step: string) => void): Promise<Response> {
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!jwt || !(await admin.auth.getUser(jwt)).data.user) return json({ error: 'Sign in first' }, 401);
  log('signed in');
  if (!Deno.env.get('ANTHROPIC_API_KEY')) return json({ error: 'not_configured' }, 503);

  const body = await req.json().catch(() => null);
  log(`body ${typeof body?.image === 'string' ? body.image.length : 0} chars`);
  const image = typeof body?.image === 'string' ? body.image.replace(/^data:image\/\w+;base64,/, '') : '';
  if (!image || image.length > MAX_IMAGE_CHARS) return json({ error: 'Bad request' }, 400);

  const ok = (await admin.rpc('claim_ppt_credits', { bucket_name: 'vision', n: 1, daily_cap: DAILY_CAP })).data === true;
  log(`claimed ${ok}`);
  if (!ok) return json({ error: 'capped' }, 429);

  try {
    // One try, and well inside HANDLER_MS: a slow answer is a miss, not a hung scan.
    const client = new Anthropic({ timeout: 25_000, maxRetries: 0 });
    const res = await client.messages.parse({
      model: MODEL,
      max_tokens: 4000,
      // Transcription, not reasoning: the lowest effort keeps it quick and cheap.
      output_config: { effort: 'low', format: zodOutputFormat(Read) },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
            { type: 'text', text: PROMPT },
          ],
        },
      ],
    });
    log(`answered ${res.stop_reason} in:${res.usage.input_tokens} out:${res.usage.output_tokens}`);
    if (res.stop_reason === 'refusal' || !res.parsed_output) return json({ kind: 'none' });
    return json(res.parsed_output);
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'busy' }, 429);
    if (e instanceof Anthropic.AuthenticationError) return json({ error: 'not_configured' }, 503);
    if (e instanceof Anthropic.APIError) return json({ error: `vision ${e.status}` }, 502);
    console.error('card-vision model call failed', e);
    return json({ error: 'vision failed' }, 502);
  }
}
