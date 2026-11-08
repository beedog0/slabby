import { fromVision, readPhoto } from '../photoScan';

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

describe('fromVision', () => {
  it('reads a slab from the label lines it wrote down', () => {
    const r = fromVision({ kind: 'slab', labelLines: ['2023 POKEMON SV3.5 EN-151 #199', 'CHARIZARD ex', 'GEM MT 10', '91550127'] });
    expect(r.kind).toBe('slab');
    if (r.kind === 'slab') expect(r.label.payload.PSACert).toMatchObject({ Subject: 'CHARIZARD ex', CertNumber: '91550127' });
  });

  it('reads a loose card from its number and set code', () => {
    const r = fromVision({ kind: 'card', name: 'ミュウex', englishName: 'Mew ex', number: '205/165', setCode: 'SV2a', language: 'ja' });
    expect(r.kind).toBe('card');
    if (r.kind === 'card') {
      expect(r.card.numbers[0]).toEqual({ num: '205', total: '165' });
      expect(r.card.codes).toContain('SV2A');
      expect(r.card.language).toBe('ja');
      expect(r.card.name).toBe('Mew ex');
      expect(r.card.words.has('MEW')).toBe(true);
    }
  });

  it('keeps a card with a name and no number, so the sheet can offer cards by name', () => {
    const r = fromVision({ kind: 'card', name: 'Pikachu', englishName: 'Pikachu', number: null, setCode: null, language: 'en' });
    expect(r.kind).toBe('card');
    if (r.kind === 'card') expect(r.card).toMatchObject({ numbers: [], name: 'Pikachu', language: 'en' });
  });

  it('misses on nothing usable', () => {
    expect(fromVision(null).kind).toBe('miss');
    expect(fromVision({ kind: 'none' }).kind).toBe('miss');
    expect(fromVision({ kind: 'slab', labelLines: [] }).kind).toBe('miss');
    expect(fromVision({ kind: 'card', name: null, englishName: null, number: null }).kind).toBe('miss');
  });
});

describe('readPhoto on a promo held in a toploader', () => {
  it('finds the Mega Evolution promo number once the small print is read', () => {
    const r = readPhoto(['BASIC', 'Oshawott', 'Razor Shell OaR', '10+', 'J MEP EN 051 ★']);
    expect(r.kind).toBe('card');
    if (r.kind === 'card') {
      expect(r.card.numbers[0]).toMatchObject({ num: '051', code: 'MEP' });
      expect(r.card.name).toBe('Oshawott');
    }
  });
});
