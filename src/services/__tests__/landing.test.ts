import { isEmptyLanding, landingFrom } from '../landing';

describe('landingFrom', () => {
  it('maps the server feed and drops malformed rows', () => {
    const l = landingFrom({
      up: [{ product_id: 1, game: 'pokemon', language: 'en', name: 'A', number: null, rarity: null, set_name: 'S', set_code: null, image_url: '', market_cents: 5000, low_cents: null, change_7d: null, change_30d: null, sealed_type: null, change: 0.2, days: 3, then_cents: 4100 }, null, {}],
      sealed_new: [{ product_id: 2, game: 'pokemon', language: 'en', name: 'Box', set_name: 'S', image_url: 'x', market_cents: 15000, sealed_type: 'booster_box' }],
      sets: [{ group_id: 7, set_name: 'S', game: 'pokemon', language: 'en', change: 0.04, days: 7, why: 'hot', top_name: 'A', top_image: null, top_cents: 5000 }],
      as_of: '2026-11-09',
    });
    expect(l.up).toHaveLength(1);
    expect(l.up[0]).toMatchObject({ productId: 1, change: 0.2, days: 3, imageUrl: null, thenCents: 4100 });
    expect(l.sealedNew[0].sealedType).toBe('booster_box');
    expect(l.sets[0]).toMatchObject({ groupId: 7, why: 'hot' });
    expect(l.down).toEqual([]);
    expect(isEmptyLanding(l)).toBe(false);
  });
  it('treats an old server or junk as empty', () => {
    expect(isEmptyLanding(landingFrom(null))).toBe(true);
    expect(isEmptyLanding(landingFrom({ up: 'x' }))).toBe(true);
  });
});
