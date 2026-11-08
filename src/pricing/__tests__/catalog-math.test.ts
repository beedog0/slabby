import { catalogRows, catalogSummary, isFresh, sealedType, packPrice, primaryPrice, printings, summarize } from '../../../supabase/functions/_shared/catalog-math';

describe('primaryPrice', () => {
  it('prefers the base printing over a pricier reverse holo', () => {
    expect(
      primaryPrice([
        { productId: 1, subTypeName: 'Reverse Holofoil', marketPrice: 9.5, lowPrice: 8 },
        { productId: 1, subTypeName: 'Holofoil', marketPrice: 4.25, lowPrice: 3 },
      ]),
    ).toEqual({ market_cents: 425, low_cents: 300 });
  });
  it('falls back to the reverse holo when it is the only price', () => {
    expect(primaryPrice([{ productId: 1, subTypeName: 'Reverse Holofoil', marketPrice: 2 }])).toEqual({ market_cents: 200, low_cents: null });
  });
  it('is empty with no prices', () => {
    expect(primaryPrice([{ productId: 1, subTypeName: 'Normal', marketPrice: null }])).toEqual({ market_cents: null, low_cents: null });
  });
});

describe('printings', () => {
  it('lists every priced printing, the base one first', () => {
    expect(
      printings([
        { productId: 1, subTypeName: 'Reverse Holofoil', marketPrice: 9.5, lowPrice: 8 },
        { productId: 1, subTypeName: 'Holofoil', marketPrice: 4.25, lowPrice: 3 },
        { productId: 1, subTypeName: '1st Edition Holofoil', marketPrice: null, lowPrice: null },
      ]),
    ).toEqual([
      { name: 'Holofoil', market_cents: 425, low_cents: 300 },
      { name: 'Reverse Holofoil', market_cents: 950, low_cents: 800 },
    ]);
  });
});

describe('catalogRows', () => {
  const cat = { id: 3, game: 'pokemon', language: 'en' };
  const group = { groupId: 604, name: 'SWSH07: Evolving Skies', abbreviation: 'EVS' };
  it('keeps singles and tags sealed product, joins prices', () => {
    const rows = catalogRows(
      cat,
      group,
      [
        { productId: 10, groupId: 604, name: 'Umbreon VMAX (Alternate Art Secret)', extendedData: [{ name: 'Number', value: '215/203' }, { name: 'Rarity', value: 'Secret Rare' }] },
        { productId: 11, groupId: 604, name: 'Evolving Skies Booster Box', extendedData: [] },
        { productId: 12, groupId: 604, name: 'Evolving Skies Code Card', extendedData: [] },
      ],
      [
        { productId: 10, subTypeName: 'Holofoil', marketPrice: 1420.5, lowPrice: 1300 },
        { productId: 11, subTypeName: 'Normal', marketPrice: 1899.99, lowPrice: 1750 },
      ],
    );
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ product_id: 11, number: null, rarity: null, sealed_type: 'booster_box', market_cents: 189999, printings: [] });
    expect(rows[0].sealed_type).toBeNull();
    expect(rows[0]).toMatchObject({
      product_id: 10,
      game: 'pokemon',
      number: '215/203',
      rarity: 'Secret Rare',
      set_code: 'EVS',
      market_cents: 142050,
      image_url: 'https://tcgplayer-cdn.tcgplayer.com/product/10_400w.jpg',
      printings: [{ name: 'Holofoil', market_cents: 142050, low_cents: 130000 }],
    });
  });
});

describe('summarize', () => {
  it('takes the latest day and orders the series', () => {
    const s = summarize([
      { day: '2026-11-02', market_cents: 200, low_cents: 150, high_cents: 250, sales_30d: 4 },
      { day: '2026-11-01', market_cents: 100, low_cents: 90, high_cents: 110, sales_30d: 3 },
    ]);
    expect(s).toEqual({ marketCents: 200, lowCents: 150, highCents: 250, sales30d: 4, asOf: '2026-11-02', series90: [100, 200] });
    expect(summarize([])).toBeNull();
  });
});

describe('isFresh', () => {
  const now = Date.parse('2026-11-06T12:00:00Z');
  it('reuses an answer for 24 hours', () => {
    expect(isFresh('2026-11-06T00:00:00Z', now)).toBe(true);
    expect(isFresh('2026-11-05T11:00:00Z', now)).toBe(false);
    expect(isFresh(null, now)).toBe(false);
  });
});

describe('packPrice', () => {
  const prod = (productId: number, name: string, number?: string) => ({
    productId,
    name,
    groupId: 1,
    extendedData: number ? [{ name: 'Number', value: number }] : [],
  });
  it('picks the plain booster pack, not bundles, boxes or singles', () => {
    const products = [
      prod(1, 'Pikachu ex', '238/191'),
      prod(2, 'Surging Sparks Booster Box'),
      prod(3, 'Surging Sparks Booster Pack Art Bundle [Set of 4]'),
      prod(4, 'Surging Sparks Sleeved Booster Pack'),
      prod(5, 'Surging Sparks Booster Pack'),
    ];
    const prices = [1, 2, 3, 4, 5].map((productId) => ({ productId, marketPrice: productId * 10 }));
    expect(packPrice(products, prices)).toEqual({ name: 'Surging Sparks Booster Pack', cents: 5_000 });
  });
  it('is null when a set has no priced pack', () => {
    expect(packPrice([prod(5, 'Base Set Booster Pack')], [])).toBeNull();
    expect(packPrice([prod(1, 'Pikachu', '58/102')], [{ productId: 1, marketPrice: 3 }])).toBeNull();
  });
});

describe('sealedType', () => {
  it.each([
    ['Surging Sparks Booster Box', 'booster_box'],
    ['Booster Box Case', 'case'],
    ['Prismatic Evolutions Elite Trainer Box', 'etb'],
    ['Pokemon Center Elite Trainer Box', 'etb'],
    ['Surging Sparks Booster Bundle', 'booster_bundle'],
    ['Surging Sparks Booster Pack', 'booster_pack'],
    ['Sleeved Booster Pack', 'booster_pack'],
    ['Surging Sparks 3 Pack Blister [Pikachu]', 'blister'],
    ['Paldean Fates Tin [Charizard ex]', 'tin'],
    ['Charizard ex Premium Collection', 'collection'],
    ['Build & Battle Box', 'collection'],
    ['Pikachu ex Box', 'collection'],
    ['Surging Sparks Pin Collection', 'collection'],
    ['League Battle Deck [Miraidon ex]', 'deck'],
    ['Booster Display Box (24 Packs)', 'booster_box'],
  ])('%s → %s', (name, kind) => expect(sealedType(name)).toBe(kind));
  it.each(['Surging Sparks Code Card', 'Card Sleeves [Pikachu]', 'Jumbo Card Pikachu', 'Deck Box', 'Playmat', 'Binder', 'Random Thing'])(
    'drops %s',
    (name) => expect(sealedType(name)).toBeNull(),
  );
});

describe('catalogSummary', () => {
  it('charts the nightly history, newest market last', () => {
    expect(catalogSummary({ market_cents: 1250, low_cents: 1100, market_hist: [1000, 1100, 1200], updated_on: '2026-11-07' })).toEqual({
      marketCents: 1250,
      lowCents: 1100,
      highCents: 1250,
      sales30d: 0,
      asOf: '2026-11-07',
      series90: [1000, 1100, 1250],
      points: 3,
      since: '2026-11-05',
      lastReal: '2026-11-07',
    });
  });
  it('is one point without history, null without a price', () => {
    expect(catalogSummary({ market_cents: 500, low_cents: null, market_hist: [], updated_on: '2026-11-07' })?.series90).toEqual([500]);
    expect(catalogSummary({ market_cents: null, low_cents: null, market_hist: [400], updated_on: '2026-11-07' })).toBeNull();
  });
});

describe('catalogRows: number-less promos', () => {
  it('keeps a single with a rarity but no number, as a card', () => {
    const rows = catalogRows(
      { id: 3, game: 'pokemon', language: 'en' },
      { groupId: 1418, name: 'WoTC Promo', abbreviation: 'PR' },
      [
        { productId: 20, groupId: 1418, name: 'Ancient Mew', extendedData: [{ name: 'Rarity', value: 'Promo' }] },
        { productId: 21, groupId: 1418, name: 'Random Accessory', extendedData: [] },
      ],
      [{ productId: 20, subTypeName: 'Holofoil', marketPrice: 25, lowPrice: 20 }],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ product_id: 20, number: null, rarity: 'Promo', sealed_type: null, market_cents: 2500 });
  });
});
