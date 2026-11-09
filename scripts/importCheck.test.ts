// Run a real collection export through the import matcher against the live catalog, without
// the phone. Skipped in the normal test run. On a machine with the app's .env:
//
//   set -a; . ./.env; set +a
//   IMPORT_CHECK_FILE=~/Downloads/export.csv npx jest scripts/importCheck --testTimeout=600000
//
// Prints how many cards matched and lists every unmatched row, so a miss can be fixed in
// src/services/importMatch.ts. Reads the catalog only; writes nothing.

import fs from 'fs';

const file = process.env.IMPORT_CHECK_FILE;
const run = file && process.env.EXPO_PUBLIC_SUPABASE_URL ? it : it.skip;

run('import check against the live catalog', async () => {
  // The test environment's fetch can't reach the network; use Node's.
  (globalThis as { fetch: unknown }).fetch = require('node-fetch');
  const { parseImport } = require('../src/services/importCsv');
  const { matchAll } = require('../src/services/importMatch');
  const { supabase } = require('../src/services/supabase');
  const { error } = await supabase.auth.signInAnonymously();
  if (error) throw error;

  const parsed = parseImport(fs.readFileSync(file!, 'utf8'));
  const matched = await matchAll(parsed.rows);
  type M = { row: { line: number; name: string; setName: string | null; printedNumber: string | null; language: string | null; quantity: number }; card: { name: string; setName: string; number: string | null } | null };
  const ms = matched as M[];
  const cards = (xs: M[]) => xs.reduce((n, m) => n + m.row.quantity, 0);
  const miss = ms.filter((m) => !m.card);
  const lines = [
    `${cards(ms)} cards, ${cards(ms) - cards(miss)} matched, ${cards(miss)} unmatched (${parsed.skipped} skipped, ${parsed.watchlist} watchlist)`,
    '',
    'UNMATCHED',
    ...miss.map((m) => `${m.row.line}\t${m.row.name}\t${m.row.setName ?? ''}\t${m.row.printedNumber ?? ''}\t${m.row.language ?? '?'}`),
    '',
    'MATCHED',
    ...ms.filter((m) => m.card).map((m) => `${m.row.line}\t${m.row.name} | ${m.row.setName} | ${m.row.printedNumber}\t→ ${m.card!.name} | ${m.card!.setName} | ${m.card!.number}`),
  ];
  const out = process.env.IMPORT_CHECK_OUT ?? 'import-check.txt';
  fs.writeFileSync(out, lines.join('\n'));
  console.log(`${lines[0]}\nWrote ${out}`);
});
