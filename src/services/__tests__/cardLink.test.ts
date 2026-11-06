import { catalogFor, choiceFor, sameCard } from '../cardLink';
import type { Card } from '../../types';

const base = { grader: 'psa', grade: 10, setCode: 'EVS', number: '215', language: 'en', name: 'Umbreon VMAX alt art', game: 'pokemon' } as Card;

describe('choiceFor', () => {
  it('opens a card at its own grade, raw for raw', () => {
    expect(choiceFor({ grader: 'psa', grade: 10 })).toBe('psa10');
    expect(choiceFor({ grader: 'psa', grade: 7 })).toBe('psa7');
    expect(choiceFor({ grader: 'raw', grade: null })).toBe('raw');
  });
  it('maps BGS/CGC half grades to the PSA whole grade', () => {
    expect(choiceFor({ grader: 'bgs', grade: 9.5 })).toBe('psa9');
    expect(choiceFor({ grader: 'cgc', grade: 10 })).toBe('psa10');
  });
});

describe('sameCard', () => {
  const cat = { number: '215/203', setCode: 'EVS', language: 'en' };
  it('matches on number, set code and language', () => {
    expect(sameCard(cat, base)).toBe(true);
    expect(sameCard(cat, { ...base, number: '189' })).toBe(false);
    expect(sameCard(cat, { ...base, language: 'ja' })).toBe(false);
    expect(sameCard(cat, { ...base, setCode: 'FST' })).toBe(false);
  });
  it('ignores a missing set code', () => {
    expect(sameCard({ ...cat, setCode: null }, base)).toBe(true);
  });
});

describe('catalogFor (mocks)', () => {
  it('finds the catalog product for a vault card', async () => {
    expect((await catalogFor(base))?.productId).toBe(9000001);
    expect((await catalogFor({ ...base, setCode: 'SV2a', number: '205', language: 'ja', name: 'Mew ex' }))?.productId).toBe(9000004);
  });
  it('returns null when nothing matches', async () => {
    expect(await catalogFor({ ...base, number: '999' })).toBeNull();
  });
});
