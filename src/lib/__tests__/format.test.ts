import { saleDay, saleLine, salesWord } from '../format';

const NOW = Date.parse('2026-11-06T12:00:00Z');

it('sale dates show the year only when it is not this year', () => {
  expect(saleDay('2026-11-05', NOW)).toBe('Nov 5');
  expect(saleDay('2025-12-30', NOW)).toBe('Dec 30, 2025');
});

it('sale lines name the source and how it sold', () => {
  expect(saleLine({ source: 'ebay', kind: 'auction' })).toBe('eBay · Auction');
  expect(saleLine({ source: 'fanatics', kind: 'bin' })).toBe('Fanatics · Buy It Now');
  expect(saleLine({ source: 'ebay', kind: 'offer' })).toBe('eBay · Best Offer · accepted offer');
  expect(saleLine({ source: 'goldin', kind: null })).toBe('Goldin');
});

it('counts sales', () => {
  expect(salesWord(1)).toBe('1 sale');
  expect(salesWord(3)).toBe('3 sales');
});

describe('cardLabel for sealed', () => {
  it('names the kind instead of a grade', () => {
    const { cardLabel } = require('../format');
    expect(cardLabel({ language: 'ja', grader: 'raw', grade: null, sealed: 'booster_box' })).toBe('JP · Booster box');
    expect(cardLabel({ language: 'en', grader: 'raw', grade: null, sealed: 'etb' })).toBe('Elite Trainer Box');
    expect(cardLabel({ language: 'en', grader: 'raw', grade: null })).toBe('Raw');
  });
});
