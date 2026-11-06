import { cardFromCert, gradeFrom, lookupCert, parseBrand, parseCertFromQr, repairCard, splitSuffix, titleName } from '../psa';


describe('parseCertFromQr', () => {
  it('reads the cert from PSA label URLs', () => {
    expect(parseCertFromQr('https://www.psacard.com/cert/88142203')).toBe('88142203');
    expect(parseCertFromQr('http://psacard.com/cert/88142203/psa')).toBe('88142203');
    expect(parseCertFromQr('https://www.psacard.com/cert/88142203?x=1')).toBe('88142203');
  });
  it('accepts a bare cert number', () => {
    expect(parseCertFromQr(' 88142203 ')).toBe('88142203');
  });
  it('rejects anything else', () => {
    expect(parseCertFromQr('https://evil.example/cert/88142203')).toBeNull();
    expect(parseCertFromQr('https://www.psacard.com/cert/12')).toBeNull();
    expect(parseCertFromQr('hello')).toBeNull();
  });
});

describe('PSA payload mapping', () => {
  it('parses grades', () => {
    expect(gradeFrom('GEM MT 10')).toBe(10);
    expect(gradeFrom('NM-MT 8.5')).toBe(8.5);
    expect(gradeFrom(undefined)).toBeNull();
  });
  it('title-cases subjects and keeps suffixes', () => {
    expect(titleName('MEW ex')).toBe('Mew ex');
    expect(titleName('UMBREON VMAX')).toBe('Umbreon VMAX');
  });
  it('parses the brand line', () => {
    expect(parseBrand('POKEMON JAPANESE SV2a-POKEMON CARD 151')).toEqual({ game: 'pokemon', language: 'ja', setCode: 'SV2a', setName: '151' });
    expect(parseBrand('POKEMON SWORD & SHIELD EVOLVING SKIES')).toMatchObject({ language: 'en', setCode: null });
    expect(parseBrand('POKEMON SV8a JP-TERASTAL FEST ex')).toEqual({ game: 'pokemon', language: 'ja', setCode: 'SV8a', setName: 'Terastal Fest ex' });
    expect(parseBrand('POKEMON SV-P JP PROMO')).toMatchObject({ language: 'ja', setCode: 'SV-P' });
    expect(parseBrand('POKEMON JPN SV2a-POKEMON CARD 151')).toMatchObject({ language: 'ja', setCode: 'SV2a' });
  });

  it('repairs Japanese cards saved by early label reads', () => {
    expect(splitSuffix('PIKACHUex')).toBe('PIKACHU ex');
    expect(splitSuffix('Mewtwo')).toBe('Mewtwo');
    const fixed = repairCard({ grader: 'psa', setCode: null, setName: 'Sv8a Jp', name: 'Pikachuex', language: 'en' } as never);
    expect(fixed).toMatchObject({ language: 'ja', setCode: 'SV8a', name: 'Pikachu ex' });
    const ok = { grader: 'psa', setCode: 'SV2a', setName: '151', name: 'Mew ex', language: 'ja' } as never;
    expect(repairCard(ok)).toBe(ok);
  });
});

describe('lookupCert on mocks', () => {
  it('finds a mock cert and maps it to a card', async () => {
    const r = await lookupCert('88142203');
    expect(r.status).toBe('found');
    if (r.status !== 'found') return;
    const card = cardFromCert(r.payload, { paidCents: 65_000, plan: 'hold' });
    expect(card).toMatchObject({ name: 'Mew ex', grade: 10, setCode: 'SV2a', number: '205', language: 'ja', year: 2023 });
  });
  it('reports unknown certs', async () => {
    expect((await lookupCert('12345678')).status).toBe('not_found');
  });
});

describe('cardFromDetails game', () => {
  const base = { cert: null, grader: 'raw' as const, grade: 10, name: 'Luffy', setName: 'OP05', number: 'OP05-119', language: 'en', paidCents: null, plan: 'hold' as const };
  it('keeps the game it was given', () => {
    const { cardFromDetails } = require('../psa');
    expect(cardFromDetails({ ...base, game: 'onepiece' }).game).toBe('onepiece');
    expect(cardFromDetails({ ...base, game: 'pokemon' }).game).toBe('pokemon');
  });
});
