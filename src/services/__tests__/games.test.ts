import { labelSetLine } from '../../components/slab/label';
import { gameFromBrand } from '../../lib/games';
import { cardKey } from '../../pricing/cardKey';
import { parseLabel } from '../label';
import { cardFromCert, cardFromDetails, parseBrand, repairCard, titleName } from '../psa';
import { fromRow, toRow } from '../sync';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

describe('games from PSA brands', () => {
  it('names the game', () => {
    expect(gameFromBrand('POKEMON JAPANESE SV2a-POKEMON CARD 151')).toBe('pokemon');
    expect(gameFromBrand('ONE PIECE JAPANESE OP05-AWAKENING OF THE NEW ERA')).toBe('onepiece');
    expect(gameFromBrand('RIFTBOUND: LEAGUE OF LEGENDS SFD-SPIRITFORGED')).toBe('riftbound');
    expect(gameFromBrand('TOPPS CHROME')).toBeNull();
  });

  it('parses One Piece brands', () => {
    expect(parseBrand('ONE PIECE JAPANESE OP05-AWAKENING OF THE NEW ERA')).toEqual({
      game: 'onepiece',
      language: 'ja',
      setCode: 'OP05',
      setName: 'Awakening Of The New Era',
    });
    expect(parseBrand('ONE PIECE ST10-THE THREE CAPTAINS')).toMatchObject({ game: 'onepiece', language: 'en', setCode: 'ST10' });
    expect(parseBrand('ONE PIECE PRB01-PREMIUM BOOSTER')).toMatchObject({ setCode: 'PRB01' });
  });

  it('parses Riftbound brands, including Chinese', () => {
    expect(parseBrand('RIFTBOUND: LEAGUE OF LEGENDS SFD-SPIRITFORGED')).toEqual({
      game: 'riftbound',
      language: 'en',
      setCode: 'SFD',
      setName: 'Spiritforged',
    });
    expect(parseBrand('RIFTBOUND: LEAGUE OF LEGENDS SIMPLIFIED CHINESE OGN-ORIGINS')).toMatchObject({
      game: 'riftbound',
      language: 'zh',
      setCode: 'OGN',
      setName: 'Origins',
    });
  });

  it('title-cases One Piece names with initials', () => {
    expect(titleName('MONKEY.D.LUFFY')).toBe('Monkey.D.Luffy');
    expect(titleName('MONKEY D. LUFFY')).toBe('Monkey D. Luffy');
  });
});

describe('labels for other games', () => {
  it('reads a One Piece label with a parallel', () => {
    const r = parseLabel(['2023 ONE PIECE JAPANESE OP05-AWAKENING OF THE NEW ERA', '#119', 'MONKEY.D.LUFFY', 'GEM MT', 'PARALLEL', '10', '91234567']);
    expect(r?.complete).toBe(true);
    expect(r?.payload.PSACert).toMatchObject({ CardNumber: '119', Subject: 'MONKEY.D.LUFFY', Variety: 'PARALLEL', CardGrade: 'GEM MT 10' });
    const card = cardFromCert(r!.payload, { paidCents: null, plan: 'hold' });
    expect(card).toMatchObject({ game: 'onepiece', name: 'Monkey.D.Luffy', setCode: 'OP05', language: 'ja', variety: 'PARALLEL', number: '119' });
    expect(cardKey(card)).toBe('psa:10:OP05:119:ja:onepiece:parallel');
  });

  it('reads a Riftbound label whose brand wraps onto a second line', () => {
    const r = parseLabel(['2025 RIFTBOUND: LEAGUE OF', 'LEGENDS SFD-SPIRITFORGED', '#T03a', 'BUFF', 'GEM MT 10', '81234567']);
    expect(r?.payload.PSACert).toMatchObject({ Brand: 'RIFTBOUND: LEAGUE OF LEGENDS SFD-SPIRITFORGED', CardNumber: 'T03a', Subject: 'BUFF' });
    const card = cardFromCert(r!.payload, { paidCents: null, plan: 'sell' });
    expect(card).toMatchObject({ game: 'riftbound', setCode: 'SFD', name: 'Buff' });
  });

  it('fixes OCR slips in the brand', () => {
    const r = parseLabel(['2023 0NE PIECE OP01-ROMANCE DAWN #120', 'SHANKS', 'GEM MT 10', '81234568']);
    expect(r?.payload.PSACert.Brand).toBe('ONE PIECE OP01-ROMANCE DAWN');
  });

  it('leaves names ending in ex alone outside Pokémon', () => {
    const r = parseLabel(['2025 RIFTBOUND: LEAGUE OF LEGENDS OGN-ORIGINS #050', 'TEEMOEX', 'MINT 9', '81234569'])!;
    expect(cardFromCert(r.payload, { paidCents: null, plan: 'hold' }).name).toBe('Teemoex');
    expect(repairCard({ game: 'riftbound', grader: 'psa', setCode: 'OGN', setName: null, name: 'Teemoex', language: 'en' } as never).name).toBe('Teemoex');
  });

  it('prints the game on the slab label', () => {
    expect(labelSetLine({ game: 'onepiece', year: 2023, language: 'ja', setCode: 'OP05' } as never)).toBe('2023 ONE PIECE JPN OP05');
    expect(labelSetLine({ year: 2023, language: 'ja', setCode: 'SV2a' } as never)).toBe('2023 POKEMON JPN SV2a');
  });
});

describe('keys and sync', () => {
  it('keeps Pokémon keys unchanged', () => {
    expect(cardKey({ grader: 'psa', grade: 10, setCode: 'SV2a', number: '205', language: 'ja' })).toBe('psa:10:SV2a:205:ja');
    expect(cardKey({ game: 'pokemon', variety: 'SPECIAL ART RARE', grader: 'psa', grade: 10, setCode: 'SV2a', number: '205', language: 'ja' })).toBe(
      'psa:10:SV2a:205:ja',
    );
  });

  it('treats a typed set code as the set code for other games', () => {
    const base = { cert: null, grader: 'psa' as const, grade: 10, name: 'Shanks', number: '#120', language: 'en', paidCents: null, plan: 'hold' as const };
    expect(cardFromDetails({ ...base, game: 'onepiece', setName: 'op01', variety: 'Alternate Art' })).toMatchObject({
      setCode: 'OP01',
      setName: null,
      number: '120',
      variety: 'Alternate Art',
    });
    expect(cardFromDetails({ ...base, game: 'pokemon', setName: '151' })).toMatchObject({ setCode: null, setName: '151' });
  });

  it('round-trips game and variety', () => {
    const card = cardFromDetails({ game: 'riftbound', cert: null, grader: 'raw' as never, grade: 0, name: 'Jinx', setName: 'OGN', number: '1', variety: 'Overnumbered', language: 'en', paidCents: null, plan: 'hold' });
    const row = toRow(card, 'u');
    expect(row).toMatchObject({ game: 'riftbound', variety: 'Overnumbered', card_key: 'raw:0:OGN:1:en:riftbound:overnumbered' });
    expect(fromRow(row)).toEqual(card);
  });
});
