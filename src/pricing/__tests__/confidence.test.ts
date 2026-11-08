import { ladderGrades } from '../../components/scan/PriceCheck';
import { priceConfidence } from '../confidence';

describe('priceConfidence', () => {
  it('reads a liquid card as solid', () => {
    expect(priceConfidence({ sales30d: 12, sales90d: 30 })).toEqual({ level: 'solid', line: 'From 12 sales in 30 days' });
  });

  it('a handful of sales is a real price but not a solid one', () => {
    expect(priceConfidence({ sales30d: 4 })).toEqual({ level: 'thin', line: 'From 4 sales in 30 days' });
  });

  it('one or two sales says thin', () => {
    expect(priceConfidence({ sales30d: 1, sales90d: 1 }).line).toBe('Thin · 1 sale in 30 days');
    expect(priceConfidence({ sales30d: 2 }).level).toBe('thin');
  });

  it('falls back to the 90-day count when the month is empty', () => {
    expect(priceConfidence({ sales30d: 0, sales90d: 3 })).toEqual({ level: 'thin', line: 'Thin · no sales in 30 days, 3 in 90' });
  });

  it('no sales at all names the last sale when there is one', () => {
    expect(priceConfidence({ sales30d: 0, sales90d: 0, lastSaleDay: '2026-07-04' })).toEqual({
      level: 'none',
      line: 'No sales in 90 days · last sold Jul 4',
    });
    expect(priceConfidence({ sales30d: 0 }).line).toBe('No sales in 90 days');
    expect(priceConfidence(null).level).toBe('none');
  });

  it('raw prices name TCGplayer instead of a sale count', () => {
    expect(priceConfidence({ sales30d: 0 }, { raw: true })).toEqual({ level: 'solid', line: 'TCGplayer market price' });
    expect(priceConfidence(null, { raw: true }).level).toBe('none');
  });
});

describe('ladderGrades', () => {
  it('shows Raw and the top three PSA grades', () => {
    expect(ladderGrades('psa10')).toEqual(['raw', 'psa10', 'psa9', 'psa8']);
    expect(ladderGrades(null)).toEqual(['raw', 'psa10', 'psa9', 'psa8']);
  });
  it('puts a lower scanned grade in place of PSA 8', () => {
    expect(ladderGrades('psa6')).toEqual(['raw', 'psa10', 'psa9', 'psa6']);
  });
});
