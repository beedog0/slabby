// refreshProduct's recent-sales writes (0008): sales upserts on (card_key, source, listing_id),
// so one listing written for several card_keys keeps a row for each.

const mockComps = jest.fn();
jest.mock('../../../supabase/functions/_shared/ppt.ts', () => ({ fetchComps: (...a: unknown[]) => mockComps(...a) }));

// Loaded by path, not import, so tsc doesn't type-check the Deno sources (npm: specifiers, Deno).
const { refreshProduct } = jest.requireActual('../../../supabase/functions/_shared/comps-write') as {
  refreshProduct: (admin: never, tcgPlayerId: string, language: string, keys: string[], today?: string) => Promise<unknown>;
};

type W = { table: string; rows: { card_key: string; listing_id?: string }[]; opts?: unknown };

function admin() {
  const writes: W[] = [];
  const a = {
    from: (table: string) => ({
      upsert: async (rows: W['rows'], opts?: unknown) => {
        writes.push({ table, rows, opts });
        return { error: null };
      },
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  };
  return { a: a as never, writes };
}

it('upserts sales on card_key, source and listing_id for every key', async () => {
  mockComps.mockResolvedValue({
    tcgPlayerId: '1',
    ebay: {
      priceHistory: { psa10: { '2026-11-05': { average: 1000, count: 1 } } },
      soldListings: { psa10: [{ id: 'L1', price: { value: 1000, currency: 'USD' }, soldDate: '2026-11-05' }] },
    },
  });
  const { a, writes } = admin();
  const keys = ['psa:10:SV2a:205:ja', 'psa:10:SV2a:205:ja-alt'];
  await refreshProduct(a, '1', 'ja', keys, '2026-11-06');
  const sales = writes.filter((w) => w.table === 'sales');
  expect(sales).toHaveLength(2);
  for (const w of sales) expect(w.opts).toEqual({ onConflict: 'card_key,source,listing_id' });
  expect(sales.map((w) => [w.rows[0].card_key, w.rows[0].listing_id])).toEqual([
    [keys[0], 'L1'],
    [keys[1], 'L1'],
  ]);
});
