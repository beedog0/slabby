import { parseLabel, stepAutoRead } from '../label';
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

describe('stepAutoRead', () => {
  const full = ['2021 POKEMON CELEBRATIONS #009', 'SURFING PIKACHU VMAX', 'GEM MT', 'FULL ART', '10', '138092551'];

  it('adds on one clean frame', () => {
    const r = stepAutoRead(null, parseLabel(full));
    expect(r.ready?.payload.PSACert).toMatchObject({ CardGrade: 'GEM MT 10', CertNumber: '138092551' });
  });

  it('takes the grade from one frame and the cert from the next', () => {
    const a = stepAutoRead(null, parseLabel(['2021 POKEMON CELEBRATIONS #009', 'SURFING PIKACHU VMAX', 'GEM MT', '138092551']));
    expect(a.ready).toBeNull();
    const b = stepAutoRead(a.state, parseLabel(['2021 POKEMON CELEBRATIONS #009', 'SURFING PIKACHU VMAX GEM MT', 'FULL ART 10']));
    expect(b.ready?.payload.PSACert).toMatchObject({ Subject: 'SURFING PIKACHU VMAX', CardGrade: 'GEM MT 10', CertNumber: '138092551' });
  });

  it('adds name and grade without a cert once two frames agree', () => {
    const lines = ['2021 POKEMON CELEBRATIONS #009', 'SURFING PIKACHU VMAX', 'GEM MT', 'FULL ART', '10'];
    const a = stepAutoRead(null, parseLabel(lines));
    expect(a.ready).toBeNull();
    expect(stepAutoRead(a.state, parseLabel(lines)).ready).not.toBeNull();
  });

  it('never adds without a grade number, however many frames', () => {
    let s = stepAutoRead(null, parseLabel(['2021 POKEMON CELEBRATIONS #009', 'SURFING PIKACHU VMAX', 'GEM MT', '138092551']));
    for (let i = 0; i < 4; i++) {
      s = stepAutoRead(s.state, parseLabel(['2021 POKEMON CELEBRATIONS #009', 'SURFING PIKACHU VMAX', 'GEM MT', '138092551']));
      expect(s.ready).toBeNull();
    }
  });

  it('survives a couple of blurry frames, then forgets', () => {
    let s = stepAutoRead(null, parseLabel(['2021 POKEMON CELEBRATIONS #009', 'SURFING PIKACHU VMAX', 'GEM MT', '138092551']));
    s = stepAutoRead(s.state, null);
    s = stepAutoRead(s.state, null);
    expect(s.state).not.toBeNull();
    s = stepAutoRead(s.state, null);
    expect(s.state).toBeNull();
  });

  it('starts over when a different card comes into frame', () => {
    const a = stepAutoRead(null, parseLabel(['2021 POKEMON CELEBRATIONS #009', 'SURFING PIKACHU VMAX', 'GEM MT', '138092551']));
    const b = stepAutoRead(a.state, parseLabel(['2023 POKEMON SV #199', 'MEW EX GEM MT', 'SPECIAL ART RARE 10']));
    expect(b.ready).toBeNull();
    expect(b.state?.label.payload.PSACert.Subject).toBe('MEW EX');
  });
});

describe('two-column labels joined by OCR', () => {
  it('reads the grade when it lands on the variety line', () => {
    const r = parseLabel([
      '2021 POKEMON CELEBRATIONS #009',
      'SURFING PIKACHU VMAX GEM MT',
      'FULL ART 10',
      '138092551',
    ]);
    expect(r?.payload.PSACert).toMatchObject({
      Subject: 'SURFING PIKACHU VMAX',
      CardGrade: 'GEM MT 10',
      Variety: 'FULL ART',
      CertNumber: '138092551',
      CardNumber: '9',
    });
    expect(r?.complete).toBe(true);
    expect(stepAutoRead(null, r).ready).not.toBeNull();
  });

  it('never auto-reads a half-framed label with no grade number', () => {
    const r = parseLabel(['2021 POKEMON CELEBRATIONS #009', 'SURFING PIKACHU VMAX', 'GEM MT']);
    expect(r?.payload.PSACert.Subject).toBe('SURFING PIKACHU VMAX');
    expect(stepAutoRead(null, r).ready).toBeNull();
  });
});

it('keeps EX in a name when OCR joins the grade onto it', () => {
  const r = parseLabel(['2023 POKEMON SV #199', 'MEW EX GEM MT', 'SPECIAL ART RARE 10', '81234560']);
  expect(r?.payload.PSACert).toMatchObject({ Subject: 'MEW EX', CardGrade: 'GEM MT 10', CertNumber: '81234560' });
});
