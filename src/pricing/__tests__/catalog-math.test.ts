import { catalogRows, isFresh, primaryPrice, printings, summarize } from '../../../supabase/functions/_shared/catalog-math';

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
  it('keeps singles, drops sealed product, joins prices', () => {
    const rows = catalogRows(
      cat,
      group,
      [
        { productId: 10, groupId: 604, name: 'Umbreon VMAX (Alternate Art Secret)', extendedData: [{ name: 'Number', value: '215/203' }, { name: 'Rarity', value: 'Secret Rare' }] },
        { productId: 11, groupId: 604, name: 'Evolving Skies Booster Box', extendedData: [] },
      ],
      [{ productId: 10, subTypeName: 'Holofoil', marketPrice: 1420.5, lowPrice: 1300 }],
    );
    expect(rows).toHaveLength(1);
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
