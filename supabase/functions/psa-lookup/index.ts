// psa-lookup: cert_cache → PSA public API, with a daily call budget and an overflow queue.
// Secrets: PSA_TOKEN, PSA_DAILY_LIMIT (default 100). The token never ships in the app.
// Body: { cert: string }. Returns { status: 'found' | 'pending' | 'not_found' | 'error', payload? }.

import { createClient } from 'npm:@supabase/supabase-js@2';

const PSA_URL = 'https://api.psacard.com/publicapi/cert/GetByCertNumber/';
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  const { cert } = await req.json().catch(() => ({}));
  if (typeof cert !== 'string' || !/^\d{7,10}$/.test(cert)) return json({ status: 'error', message: 'Bad cert' }, 400);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Who's asking (for the queue). The caller's JWT comes in the Authorization header.
  const auth = req.headers.get('Authorization')?.replace('Bearer ', '');
  const user = auth ? (await admin.auth.getUser(auth)).data.user : null;
  if (!user) return json({ status: 'error', message: 'Sign in first' }, 401);

  const hit = await admin.from('cert_cache').select('payload').eq('cert_number', cert).maybeSingle();
  if (hit.data) return json({ status: 'found', payload: hit.data.payload });

  const limit = Number(Deno.env.get('PSA_DAILY_LIMIT') ?? 100);
  const { data: allowed } = await admin.rpc('claim_psa_call', { daily_limit: limit });
  if (!allowed) {
    await admin.from('psa_queue').upsert({ cert_number: cert, requested_by: user.id });
    return json({ status: 'pending' });
  }

  const res = await fetch(PSA_URL + cert, { headers: { Authorization: `bearer ${Deno.env.get('PSA_TOKEN')}` } });
  if (res.status === 429) {
    await admin.from('psa_queue').upsert({ cert_number: cert, requested_by: user.id });
    return json({ status: 'pending' });
  }
  if (!res.ok) {
    // Keep PSA's own words (quota, auth, WAF page) so failures can be told apart in the logs.
    const detail = (await res.text().catch(() => '')).slice(0, 200);
    console.error(`psa ${res.status}: ${detail}`);
    return json({ status: 'error', message: `PSA ${res.status}`, detail }, 502);
  }

  const payload = await res.json();
  // PSA answers unknown certs with 200 and an empty PSACert or a "No data found" message.
  if (!payload?.PSACert?.CertNumber) return json({ status: 'not_found' });

  await admin.from('cert_cache').upsert({ cert_number: cert, grader: 'psa', payload });
  return json({ status: 'found', payload });
});
