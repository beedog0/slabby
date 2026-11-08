import { readPhoto } from '../photoScan';

describe('readPhoto', () => {
  it('reads a slab label from one still', () => {
    const r = readPhoto(['2023 POKEMON SV3.5 EN-151 #199', 'CHARIZARD ex', 'SPECIAL ILLUSTRATION RARE', 'GEM MT 10', '91550127']);
    expect(r.kind).toBe('slab');
    if (r.kind === 'slab') expect(r.label.payload.PSACert).toMatchObject({ Subject: 'CHARIZARD ex', CardGrade: 'GEM MT 10', CertNumber: '91550127' });
  });

  it('still opens a slab read without a grade, so the sheet can say what is missing', () => {
    const r = readPhoto(['2023 POKEMON SV3.5 EN-151 #199', 'CHARIZARD ex', '91550127']);
    expect(r.kind).toBe('slab');
    if (r.kind === 'slab') expect(r.label.payload.PSACert.CardGrade ?? '').toBe('');
  });

  it('reads a loose card by its number', () => {
    const r = readPhoto(['Charizard ex', 'HP 330', 'Illus. Mitsuhiro Arita', 'G MEW EN 199/165 ★']);
    expect(r.kind).toBe('card');
    if (r.kind === 'card') expect(r.card.numbers[0]).toEqual({ num: '199', total: '165' });
  });

  it('takes a grader label over the card number inside the slab', () => {
    const r = readPhoto(['2023 POKEMON SV3.5 EN-151 #199', 'CHARIZARD ex', 'GEM MT 10', '91550127', 'G MEW EN 199/165']);
    expect(r.kind).toBe('slab');
  });

  it('says what it saw when nothing fits', () => {
    expect(readPhoto(['Lunch special', '$12.99', '', 'Open daily'])).toEqual({ kind: 'miss', seen: 'Lunch special · $12.99 · Open daily' });
    expect(readPhoto([])).toEqual({ kind: 'miss', seen: '' });
  });
});
