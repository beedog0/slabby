import { parseLabel, steadyKey } from '../label';
import { cardFromCert } from '../psa';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

describe('parseLabel', () => {
  it('reads a modern two-column Japanese label', () => {
    const r = parseLabel([
      '2023 POKEMON JAPANESE SV2a-POKEMON CARD 151',
      '#205',
      'MEW ex',
      'GEM MT',
      'SPECIAL ART RARE',
      '10',
      '81234560',
    ]);
    expect(r?.complete).toBe(true);
    expect(r?.payload.PSACert).toMatchObject({
      CertNumber: '81234560',
      Year: '2023',
      Brand: 'POKEMON JAPANESE SV2a-POKEMON CARD 151',
      CardNumber: '205',
      Subject: 'MEW ex',
      Variety: 'SPECIAL ART RARE',
      CardGrade: 'GEM MT 10',
    });
    const card = cardFromCert(r!.payload, { paidCents: null, plan: 'hold' });
    expect(card).toMatchObject({ name: 'Mew ex', grade: 10, language: 'ja', setCode: 'SV2a', setName: '151', number: '205', year: 2023 });
  });

  it('reads a label where the number shares the brand line', () => {
    const r = parseLabel(['2023 POKEMON SV3.5 EN-151 #199', 'CHARIZARD ex', 'SPECIAL ILLUSTRATION RARE', 'GEM MT 10', '91550127']);
    expect(r?.payload.PSACert).toMatchObject({ CardNumber: '199', Subject: 'CHARIZARD ex', CardGrade: 'GEM MT 10', CertNumber: '91550127' });
  });

  it('reads an older single-line label', () => {
    const r = parseLabel(['2016 POKEMON XY EVOLUTIONS #11 CHARIZARD-HOLO GEM MT 10 26474744']);
    expect(r?.payload.PSACert).toMatchObject({
      Year: '2016',
      Brand: 'POKEMON XY EVOLUTIONS',
      CardNumber: '11',
      Subject: 'CHARIZARD-HOLO',
      CardGrade: 'GEM MT 10',
      CertNumber: '26474744',
    });
  });

  it('handles MINT 9 and half grades', () => {
    expect(parseLabel(['2021 POKEMON SWSH EVOLVING SKIES #215', 'UMBREON VMAX', 'MINT 9', '12345678'])?.payload.PSACert.CardGrade).toBe('MINT 9');
    expect(parseLabel(['1999 POKEMON GAME #4', 'CHARIZARD-HOLO', 'NM-MT+ 8.5', '12345679'])?.payload.PSACert.CardGrade).toBe('NM-MT+ 8.5');
  });

  it('is incomplete without a cert and null for non-labels', () => {
    expect(parseLabel(['2023 POKEMON JAPANESE SV2a-POKEMON CARD 151', 'MEW ex', 'GEM MT 10'])?.complete).toBe(false);
    expect(parseLabel(['hello world'])).toBeNull();
    expect(parseLabel([])).toBeNull();
  });

  it('reads a label with the year and brand on separate lines and OCR slips', () => {
    const r = parseLabel(['2023', 'POKEM0N JPN SV2a-POKEMON CARD 151', '#205', 'MEW ex', 'GEM MT 10', '81234560']);
    expect(r?.payload.PSACert).toMatchObject({ Year: '2023', CardNumber: '205', Subject: 'MEW ex', CardGrade: 'GEM MT 10', CertNumber: '81234560' });
    expect(r?.payload.PSACert.Brand).toBe('POKEMON JAPANESE SV2a-POKEMON CARD 151');
    expect(r?.complete).toBe(true);
  });
});

describe('steadyKey', () => {
  const label = ['2021 POKEMON CELEBRATIONS #009', 'SURFING PIKACHU VMAX', 'GEM MT', 'FULL ART', '10', '138092551'];

  it('matches two reads of the same label despite spacing noise', () => {
    const a = steadyKey(parseLabel(label));
    const b = steadyKey(parseLabel(label.map((l) => l.replace(/ /g, '  '))));
    expect(a).not.toBeNull();
    expect(a).toBe(b);
  });

  it('needs a name and a grade before reading on its own', () => {
    expect(steadyKey(parseLabel(['2021 POKEMON CELEBRATIONS #009']))).toBeNull();
    expect(steadyKey(parseLabel(['Surfing Pikachu VMAX', 'HP 310', 'Max Surfer']))).toBeNull();
    expect(steadyKey(null)).toBeNull();
  });

  it('tells a misread cert apart', () => {
    expect(steadyKey(parseLabel(label))).not.toBe(steadyKey(parseLabel([...label.slice(0, 5), '138092557'])));
  });
});
