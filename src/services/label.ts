// Reads a PSA label from on-device text recognition. PSA's cert API needs account approval, so the
// front label is the source of truth for scans: it prints the year, brand/set, name, card number,
// variety, grade and cert number. The output has the same shape as PSA's API payload, so
// cardFromCert() turns it into a vault card the same way.
//
// Typical labels (line breaks and column order vary with the photo):
//   2023 POKEMON JAPANESE SV2a-POKEMON CARD 151   #205
//   MEW ex                                         GEM MT
//   SPECIAL ART RARE                               10
//                                                  81234560
//
//   2016 POKEMON XY EVOLUTIONS #11  CHARIZARD-HOLO  GEM MT 10  26474744

import type { PsaCertPayload } from './psa';

/** One recognized line. x/y are the line's left edge and vertical centre, 0..1 from top-left. */
export type LabelLine = { text: string; x: number; y: number };

// Case-sensitive on purpose: labels print grades in capitals, card names use "ex"/"EX" too.
const GRADE_WORDS = /(?:^|\s)(GEM MT|GEM MINT|MINT|NM-MT\+?|NM\+?|EX-MT\+?|EX\+?|VG-EX\+?|VG\+?|GOOD\+?|FAIR|PR|AUTHENTIC|AUTH)(?=\s|$|\d)/;
const GRADE_NUM = /^\s*(10|[1-9](?:\.5)?)(?!\d)/;
const YEAR_BRAND = /\b((?:19|20)\d{2})\s+(P(?:OK[EÉ]M[O0]N|\.?M\.?)\b.*)$/i;
// Some labels (and some photos) split the year and the brand onto separate lines.
const BRAND_ONLY = /^(P(?:OK[EÉ]M[O0]N|\.?M\.?)\b.*)$/i;
const YEAR_ONLY = /^((?:19|20)\d{2})$/;
const CERT = /^\d{8,10}$/;
const VARIETY = /^(HOLO|REVERSE HOLO|1ST EDITION|SHADOWLESS|FULL ART|ALT(?:ERNATE)? ART|SPECIAL ART RARE|ILLUSTRATION RARE|SPECIAL ILLUSTRATION RARE|SECRET|RAINBOW|GOLD|PROMO|STAFF|ART RARE|SUPER RARE|ULTRA RARE|HYPER RARE)\b/i;

export type ParsedLabel = {
  payload: PsaCertPayload;
  /** True when name, grade and cert were all found. */
  complete: boolean;
};

/** Parse recognized label text into a PSA-shaped payload. Null when it doesn't look like a PSA label. */
export function parseLabel(input: (LabelLine | string)[]): ParsedLabel | null {
  const lines = input
    .map((l) => (typeof l === 'string' ? { text: l, x: 0, y: 0 } : l))
    .map((l) => ({ ...l, text: l.text.replace(/\s+/g, ' ').trim() }))
    .filter((l) => l.text.length > 0);
  if (!lines.length) return null;

  let year: string | undefined;
  let brand: string | undefined;
  let number: string | undefined;
  let grade: string | undefined;
  let gradeWord: string | undefined;
  let cert: string | undefined;
  let name: string | undefined;
  let variety: string | undefined;
  let brandIndex = -1;

  // Pass 1: the fixed-format pieces.
  lines.forEach((l, i) => {
    const t = l.text;

    const num = t.match(/#\s*([A-Z0-9-]{1,8})\b/i);
    if (num && !number) number = num[1].replace(/^0+(?=\d)/, '');

    const yb = t.match(YEAR_BRAND);
    if (yb && !brand) {
      year = yb[1];
      brand = yb[2].replace(/#\s*[A-Z0-9-]+.*$/i, '').trim();
      brandIndex = i;
      // Single-line labels carry the name after the number: "... #11 CHARIZARD-HOLO GEM MT 10 2647..."
      const after = yb[2].match(/#\s*[A-Z0-9-]+\s+(.+)$/i)?.[1];
      if (after) {
        const nameOnly = after.split(GRADE_WORDS)[0].replace(/\b\d{8,10}\b/, '').trim();
        if (nameOnly) name = nameOnly;
      }
    }

    // A grade is the grade words followed by a number, or a line that is only the grade words.
    const gw = t.match(GRADE_WORDS);
    if (gw && !grade) {
      const g = t.slice((gw.index ?? 0) + gw[0].length).match(GRADE_NUM);
      const alone = t.trim() === gw[1];
      if (g || alone) {
        gradeWord = gw[1];
        if (g) grade = g[1];
      }
    }

    for (const token of t.split(' ')) if (CERT.test(token) && !cert) cert = token;
  });

  // Year and brand on separate lines: "2023" then "POKEMON JAPANESE SV2a-...".
  if (!brand) {
    const i = lines.findIndex((l) => BRAND_ONLY.test(l.text));
    if (i >= 0) {
      brand = lines[i].text.replace(/#\s*[A-Z0-9-]+.*$/i, '').trim();
      brandIndex = i;
      year = lines.map((l) => l.text.match(YEAR_ONLY)?.[1]).find(Boolean);
    }
  }
  // OCR reads O as 0 and drops accents; parseBrand expects "POKEMON".
  if (brand) brand = brand.replace(/^P(?:OK[EÉ]M[O0]N)\b/i, 'POKEMON').replace(/\bJPN\b/i, 'JAPANESE');

  // A grade on its own line ("10") next to the grade words.
  if (gradeWord && !grade) {
    const lone = lines.find((l) => /^(10|[1-9](?:\.5)?)$/.test(l.text));
    if (lone) grade = lone.text;
  }
  if (gradeWord === 'AUTHENTIC' || gradeWord === 'AUTH') grade = undefined;

  // Pass 2: the name is the first free-text line after the year/brand line that isn't a grade,
  // number, cert or variety. Labels put it directly under the brand line.
  if (!name && brandIndex >= 0) {
    for (const l of lines.slice(brandIndex + 1)) {
      const t = l.text.replace(/#\s*[A-Z0-9-]+/i, '').trim();
      if (!t || YEAR_ONLY.test(t) || t === gradeWord || (gradeWord && t.startsWith(gradeWord + ' ')) || CERT.test(t) || /^(10|[1-9](?:\.5)?)$/.test(t)) continue;
      if (VARIETY.test(t)) {
        variety ??= t;
        continue;
      }
      name = t;
      break;
    }
  }
  if (!variety) variety = lines.map((l) => l.text).find((t) => VARIETY.test(t) && t !== name);

  if (!brand && !name) return null;

  return {
    payload: {
      PSACert: {
        CertNumber: cert ?? '',
        Year: year,
        Brand: brand,
        CardNumber: number,
        Subject: name,
        Variety: variety,
        CardGrade: gradeWord && grade ? `${gradeWord} ${grade}` : gradeWord,
      },
    },
    complete: !!(name && grade && cert),
  };
}

/**
 * Auto-read on the scan screen: a key for a read that's good enough to act on without a tap (name
 * and grade found), or null. Two reads in a row with the same key mean the label is in frame and
 * held steady, so a blurry or half-framed read never adds the wrong card.
 */
export function steadyKey(p: ParsedLabel | null): string | null {
  const c = p?.payload.PSACert;
  if (!c?.Subject || !c.CardGrade) return null;
  const norm = (s?: string) => (s ?? '').toUpperCase().replace(/[^A-Z0-9.]/g, '');
  return [c.Subject, c.CardNumber, c.CardGrade, c.CertNumber].map(norm).join('|');
}
