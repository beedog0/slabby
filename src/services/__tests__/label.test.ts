import { autoProgress, linesInFrame, parseLabel, stepAutoRead, withVotes } from '../label';
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
  const run = (frames: (string[] | null)[]) => {
    let r: ReturnType<typeof stepAutoRead> = { state: null, ready: null };
    for (const f of frames) {
      r = stepAutoRead(r.state, f ? parseLabel(f) : null);
      if (r.ready) return r;
    }
    return r;
  };

  it('needs the name the same in two frames, even when one frame has everything', () => {
    expect(run([full]).ready).toBeNull();
    expect(run([full, full]).ready?.payload.PSACert).toMatchObject({ Subject: 'SURFING PIKACHU VMAX', CardGrade: 'GEM MT 10', CertNumber: '138092551' });
  });

  it('outvotes a blurry frame that garbles the name', () => {
    const jp = (name: string) => ['2021 POKEMON JPN', name, 'GEM MT 10', '166947927'];
    const r = run([jp('TT TH AN NY - COLDEN BOX'), jp('PIKACHU'), jp('PIKACHU')]);
    expect(r.ready?.payload.PSACert.Subject).toBe('PIKACHU');
  });

  it('never commits on two different garbled names', () => {
    const jp = (name: string) => ['2021 POKEMON JPN', name, 'GEM MT 10', '166947927'];
    expect(run([jp('TT TH AN NY'), jp('PIKACHJ')]).ready).toBeNull();
  });

  it('takes the grade from one frame and the cert from another', () => {
    const r = run([
      ['2021 POKEMON CELEBRATIONS #009', 'SURFING PIKACHU VMAX', 'GEM MT', '138092551'],
      ['2021 POKEMON CELEBRATIONS #009', 'SURFING PIKACHU VMAX GEM MT', 'FULL ART 10'],
    ]);
    expect(r.ready?.payload.PSACert).toMatchObject({ CardGrade: 'GEM MT 10', CertNumber: '138092551' });
  });

  it('adds without a cert once name and grade each agree twice', () => {
    const lines = ['2021 POKEMON CELEBRATIONS #009', 'SURFING PIKACHU VMAX', 'GEM MT', 'FULL ART', '10'];
    expect(run([lines, lines]).ready?.payload.PSACert.CertNumber).toBe('');
  });

  it('never adds without a grade number, however many frames', () => {
    const lines = ['2021 POKEMON CELEBRATIONS #009', 'SURFING PIKACHU VMAX', 'GEM MT', '138092551'];
    expect(run([lines, lines, lines, lines]).ready).toBeNull();
  });

  it('survives a couple of blurry frames, then forgets', () => {
    expect(run([full, null, null]).state).not.toBeNull();
    expect(run([full, null, null, null]).state).toBeNull();
    expect(run([full, null, null, full]).ready).not.toBeNull();
  });

  it('starts over when a different slab comes into frame', () => {
    const r = run([full, ['2023 POKEMON SV #199', 'MEW EX GEM MT', 'SPECIAL ART RARE 10', '81234560']]);
    expect(r.ready).toBeNull();
    expect(Object.keys(r.state!.names)).toEqual(['MEWEX']);
  });

  it('reports progress', () => {
    expect(autoProgress(null)).toEqual({ name: 'none', grade: false, cert: false });
    const one = run([['2021 POKEMON CELEBRATIONS #009', 'SURFING PIKACHU VMAX', 'GEM MT', '138092551']]);
    expect(autoProgress(one.state)).toEqual({ name: 'seen', grade: false, cert: true });
  });
});

describe('withVotes', () => {
  it('fills a tapped frame from earlier frames', () => {
    const s = stepAutoRead(null, parseLabel(['2021 POKEMON CELEBRATIONS #009', 'SURFING PIKACHU VMAX', 'GEM MT 10'])).state;
    const r = withVotes(s, parseLabel(['2021 POKEMON CELEBRATIONS #009', 'SURFING PIKACHU VMAX', 'GEM MT', '138092551']));
    expect(r?.payload.PSACert).toMatchObject({ CardGrade: 'GEM MT 10', CertNumber: '138092551' });
  });
});

describe('linesInFrame', () => {
  // 3:4 photo on a 440×956 view: shown 717×956, 138.5 pt cropped off each side.
  const photo = { width: 3024, height: 4032 };
  const view = { width: 440, height: 956 };
  const frame = { x: 75, y: 134, width: 290, height: 466 };
  it('keeps text on the slab and drops text around it', () => {
    const on = { text: '2021 POKEMON JPN', x: (138.5 + 100) / 717, y: 180 / 956 };
    const off = { text: 'POKEMON chat on a laptop', x: (138.5 + 400) / 717, y: 800 / 956 };
    expect(linesInFrame([on, off], photo, view, frame)).toEqual([on]);
    expect(linesInFrame([on, off], { width: 4032, height: 3024 }, view, frame)).toEqual([on]);
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
    expect(stepAutoRead(stepAutoRead(null, r).state, r).ready).not.toBeNull();
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
