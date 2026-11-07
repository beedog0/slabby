// The persisted recent-sales cache: v1 migrate and the entry check readers use.

import { cleanByKey, useSalesCache, validEntry } from '../sales';

const good = { result: { kind: 'sales', rows: [{ source: 'ebay', listingId: 'a', soldDay: '2026-11-05', soldAt: null, priceCents: 1000, kind: null, url: null }] }, fetchedAt: '2026-11-05T10:00:00Z' };
const day = { result: { kind: 'daily', rows: [{ day: '2026-11-05', sales: 2, avgCents: 1000 }] }, fetchedAt: '2026-11-05T10:00:00Z' };
const none = { result: { kind: 'none' }, fetchedAt: '2026-11-05T10:00:00Z' };

it('accepts the shapes this build writes', () => {
  for (const e of [good, day, none]) expect(validEntry(e)).toBe(true);
});

it.each([
  ['bare result', { kind: 'sales', rows: [] }],
  ['rows missing', { result: { kind: 'sales' }, fetchedAt: 'x' }],
  ['old daily field names', { result: { kind: 'daily', rows: [{ day: '2026-11-05', count: 2, average: 10 }] }, fetchedAt: 'x' }],
  ['result null', { result: null, fetchedAt: null }],
  ['unknown kind', { result: { kind: 'list', rows: [] }, fetchedAt: 'x' }],
  ['no fetchedAt', { result: { kind: 'none' } }],
  ['null', null],
])('rejects %s', (_n, e) => {
  expect(validEntry(e)).toBe(false);
});

it('migrate to v1 drops malformed entries and keeps good ones', async () => {
  const opts = useSalesCache.persist.getOptions();
  expect(opts.version).toBe(1);
  const out = await opts.migrate!({ byKey: { a: good, b: { kind: 'sales', rows: [] }, c: none } }, 0);
  expect(out).toEqual({ byKey: { a: good, c: none } });
  expect(await opts.migrate!(null, 0)).toEqual({ byKey: {} });
  expect(cleanByKey('junk')).toEqual({});
});
