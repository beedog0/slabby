import {
  cleanSales,
  dropOutliers,
  estimateIsFresh,
  median,
  parseGrade,
  summarizeEstimate,
  toUsdCents,
  usdPerFromRates,
  type FoundSale,
} from '../../../supabase/functions/_shared/estimate-math';
import { estimateLine, fallbackPrice, sourceWord } from '../estimate';

const NOW = Date.parse('2026-11-08T05:00:00Z');
const ditto = { grader: 'psa' as const, grade: 10, language: 'ko' };

const sale = (o: Partial<FoundSale> = {}): FoundSale => ({
  title: 'PSA 10 Metamong Ditto SV-P 173 Korean promo',
  url: 'https://www.ebay.com/itm/1',
  source: 'eBay',
  amount: 281,
  currency: 'USD',
  soldOn: '2026-10-28',
  language: 'ko',
  grade: 'PSA 10',
  sold: true,
  ...o,
});

describe('toUsdCents', () => {
  it('converts won, yen and dollars', () => {
    expect(toUsdCents(281, 'USD')).toBe(28100);
    expect(toUsdCents(390000, 'KRW')).toBe(28080);
    expect(toUsdCents(40000, 'jpy')).toBe(26400);
  });
  it('refuses unknown currencies and non-prices', () => {
    expect(toUsdCents(100, 'XYZ')).toBeNull();
    expect(toUsdCents(0, 'USD')).toBeNull();
    expect(toUsdCents(NaN, 'USD')).toBeNull();
  });
  it('uses live rates over the fallback', () => {
    expect(toUsdCents(1000, 'KRW', usdPerFromRates({ KRW: 1000 }))).toBe(100);
  });
});

describe('parseGrade', () => {
  it('reads grader and grade', () => {
    expect(parseGrade('PSA 10')).toEqual({ grader: 'psa', grade: 10 });
    expect(parseGrade('PSA 10 Gem Mint')).toEqual({ grader: 'psa', grade: 10 });
    expect(parseGrade('BGS 9.5')).toEqual({ grader: 'bgs', grade: 9.5 });
    expect(parseGrade('raw')).toEqual({ grader: 'raw', grade: null });
    expect(parseGrade(null)).toBeNull();
  });
});

describe('cleanSales', () => {
  const searched = ['https://www.ebay.com/itm/1', 'https://www.ebay.com/itm/2/', 'https://m.bunjang.co.kr/products/3', 'https://www.ebay.com/itm/9'];

  it('keeps a matching sale and converts it', () => {
    const out = cleanSales([sale(), sale({ url: 'https://m.bunjang.co.kr/products/3', source: 'Bunjang', amount: 390000, currency: 'KRW' })], ditto, searched, { now: NOW });
    expect(out.map((s) => s.priceCents)).toEqual([28100, 28080]);
    expect(out[1]).toMatchObject({ source: 'Bunjang', amount: 390000, currency: 'KRW' });
  });

  it('never takes a Japanese or English copy for a Korean card', () => {
    expect(cleanSales([sale({ language: 'ja' }), sale({ url: 'https://www.ebay.com/itm/2', language: 'en' })], ditto, searched, { now: NOW })).toEqual([]);
  });

  it('drops links the search never returned (made up)', () => {
    expect(cleanSales([sale({ url: 'https://www.ebay.com/itm/404' })], ditto, searched, { now: NOW })).toEqual([]);
  });

  it('matches links across a trailing slash or hash, once per link', () => {
    const out = cleanSales([sale({ url: 'https://www.ebay.com/itm/2#x' }), sale({ url: 'https://www.ebay.com/itm/2' })], ditto, searched, { now: NOW });
    expect(out).toHaveLength(1);
  });

  it('drops asking prices, other grades, raw copies and old sales', () => {
    const found = [
      sale({ sold: false }),
      sale({ url: 'https://www.ebay.com/itm/2', grade: 'PSA 9' }),
      sale({ url: 'https://m.bunjang.co.kr/products/3', grade: 'raw' }),
      sale({ url: 'https://www.ebay.com/itm/9', soldOn: '2025-06-01' }),
    ];
    expect(cleanSales(found, ditto, searched, { now: NOW })).toEqual([]);
  });

  it('keeps a raw sale for a raw card only', () => {
    const raw = { grader: 'raw' as const, grade: null, language: 'ko' };
    expect(cleanSales([sale({ grade: 'raw' })], raw, searched, { now: NOW })).toHaveLength(1);
    expect(cleanSales([sale()], raw, searched, { now: NOW })).toEqual([]);
  });

  it('keeps a sale with no date', () => {
    expect(cleanSales([sale({ soldOn: null })], ditto, searched, { now: NOW })).toHaveLength(1);
  });
});

describe('summarizeEstimate', () => {
  it('takes the median and range', () => {
    const sales = [100, 300, 200].map((c, i) => ({ title: '', url: `u${i}`, source: 'eBay', priceCents: c, amount: c / 100, currency: 'USD', soldOn: null }));
    expect(summarizeEstimate(sales, '2026-11-08T05:00:00Z')).toMatchObject({ priceCents: 200, lowCents: 100, highCents: 300 });
    expect(summarizeEstimate([], 'x')).toBeNull();
  });
  it('drops far outliers with four or more sales', () => {
    const s = [28000, 27000, 29000, 2000, 150000].map((c, i) => ({ title: '', url: `u${i}`, source: '', priceCents: c, amount: 0, currency: 'USD', soldOn: null }));
    expect(dropOutliers(s).map((x) => x.priceCents)).toEqual([28000, 27000, 29000]);
    expect(median([1, 2, 3, 4])).toBe(3);
  });
});

describe('estimateIsFresh', () => {
  it('lasts a week', () => {
    expect(estimateIsFresh('2026-11-02T05:00:00Z', NOW)).toBe(true);
    expect(estimateIsFresh('2026-10-31T05:00:00Z', NOW)).toBe(false);
    expect(estimateIsFresh(null, NOW)).toBe(false);
  });
});

describe('fallbackPrice', () => {
  const estimate = { priceCents: 28000, lowCents: 26000, highCents: 30000, sales: [], foundAt: '2026-11-08T05:00:00Z' };

  it('is nothing without an estimate or your price', () => {
    expect(fallbackPrice(undefined, undefined)).toBeNull();
    expect(fallbackPrice(undefined, { kind: 'none', foundAt: '2026-11-08T05:00:00Z' })).toBeNull();
  });
  it('labels an estimate and never shows it as eBay sales', () => {
    expect(fallbackPrice(undefined, { kind: 'found', estimate })).toMatchObject({ marketCents: 28000, lowCents: 26000, sales30d: 0, series90: [], source: 'estimate' });
  });
  it('puts your own price over the estimate', () => {
    expect(fallbackPrice(25000, { kind: 'found', estimate })).toMatchObject({ marketCents: 25000, source: 'own', estimate });
  });
  it('names the source', () => {
    expect(sourceWord(fallbackPrice(25000, undefined), false)).toBe('your price');
    expect(sourceWord(fallbackPrice(undefined, { kind: 'found', estimate }), false)).toBe('estimate');
    expect(sourceWord(null, true)).toBe('TCGplayer');
    expect(estimateLine(1)).toBe('Estimate · from 1 sale found online');
    expect(estimateLine(4)).toBe('Estimate · from 4 sales found online');
  });
});

describe('priceFor with no price source', () => {
  // Without Supabase configured (tests), real prices come from the mocks.
  const { priceFor } = require('../../services/comps') as typeof import('../../services/comps');
  const { useEstimates } = require('../../store/estimates') as typeof import('../../store/estimates');
  const base = {
    id: 'x', game: 'pokemon' as const, certNumber: null, grader: 'psa' as const, grade: 10, name: 'Ditto', setName: 'SV-P Promo',
    setCode: 'SV-P', number: '173', language: 'ko', year: 2024, imageFrontUrl: null, paidCents: null, paidAt: null, plan: 'hold' as const,
    floorOverrideCents: null, askOverrideCents: null, status: 'owned' as const, soldCents: null, soldAt: null, soldWhere: null, createdAt: '',
  };
  const estimate = { priceCents: 28000, lowCents: 26000, highCents: 30000, sales: [], foundAt: '2026-11-08T05:00:00Z' };

  it('shows the estimate, then your own price over it', () => {
    expect(priceFor(base)).toBeNull();
    useEstimates.getState().setEstimate('psa:10:SV-P:173:ko', { kind: 'found', estimate });
    expect(priceFor(base)?.source).toBe('estimate');
    useEstimates.getState().setOwn('psa:10:SV-P:173:ko', 25000);
    expect(priceFor(base)).toMatchObject({ source: 'own', marketCents: 25000 });
    useEstimates.getState().setOwn('psa:10:SV-P:173:ko', null);
    expect(priceFor(base)?.source).toBe('estimate');
  });

  it('never lets an estimate cover a card with real comps', () => {
    const real = { ...base, setCode: 'SV2a', number: '205', language: 'ja' };
    useEstimates.getState().setEstimate('psa:10:SV2a:205:ja', { kind: 'found', estimate });
    expect(priceFor(real)).toMatchObject({ marketCents: 104000 });
    expect(priceFor(real)?.source).toBeUndefined();
  });
});
