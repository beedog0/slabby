// card-match: resolve a card_key to a TCGplayer product id (and photo) once, shared by all users.
// Called by the app right after a card is added. Body: { cardKey, name, number, language, setName }.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { matchCard } from '../_shared/ppt.ts';

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!jwt || !(await admin.auth.getUser(jwt)).data.user) return json({ error: 'Sign in first' }, 401);

  const c = await req.json().catch(() => null);
  if (!c?.cardKey || !c?.name) return json({ error: 'Bad request' }, 400);

  const known = await admin.from('card_refs').select('*').eq('card_key', c.cardKey).maybeSingle();
  if (known.data) return json(known.data);

  const m = await matchCard(c);
  const row = {
    card_key: c.cardKey,
    language: c.language ?? 'en',
    tcgplayer_id: m?.tcgPlayerId ?? null,
    image_url: m?.image ?? null,
    matched_set: m?.setName ?? null,
  };
  await admin.from('card_refs').upsert(row);
  return json(row);
});
