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
// Grade words OCR may join onto the end of the name line. Not EX/NM/VG alone: "MEW EX" is a name.
const JOINED_GRADE = /\s(GEM MT|GEM MINT|NM-MT\+?|EX-MT\+?|VG-EX\+?|MINT)$/;
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
      // Only the grade words, or grade words OCR joined onto the end of the name line.
      const joined = t.match(JOINED_GRADE)?.[1];
      const alone = t.trim() === gw[1] || !!joined;
      if (g || alone) {
        gradeWord = g ? gw[1] : (joined ?? gw[1]);
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
  // Two-column labels where OCR joins the left column to the grade number: "FULL ART 10".
  if (gradeWord && !grade) {
    const gi = lines.findIndex((l) => GRADE_WORDS.test(l.text));
    const tail = lines
      .slice(gi + 1, gi + 3)
      .map((l) => l.text.match(/\s(10|[1-9](?:\.5)?)$/)?.[1])
      .find(Boolean);
    if (tail) grade = tail;
  }
  if (gradeWord === 'AUTHENTIC' || gradeWord === 'AUTH') grade = undefined;

  // Pass 2: the name is the first free-text line after the year/brand line that isn't a grade,
  // number, cert or variety. Labels put it directly under the brand line.
  if (!name && brandIndex >= 0) {
    for (const l of lines.slice(brandIndex + 1)) {
      // OCR can join the right column on: "SURFING PIKACHU VMAX GEM MT", "FULL ART 10".
      const t = l.text
        .replace(/#\s*[A-Z0-9-]+/i, '')
        .replace(JOINED_GRADE, '')
        .replace(/\s(10|[1-9](?:\.5)?)$/, '')
        .trim();
      if (!t || YEAR_ONLY.test(t) || t === gradeWord || (gradeWord && t.startsWith(gradeWord + ' ')) || CERT.test(t) || /^(10|[1-9](?:\.5)?)$/.test(t)) continue;
      if (VARIETY.test(t)) {
        variety ??= t.replace(/\s(10|[1-9](?:\.5)?)$/, '');
        continue;
      }
      name = t;
      break;
    }
  }
  if (!variety) variety = lines.map((l) => l.text).find((t) => VARIETY.test(t) && t !== name)?.replace(/\s(10|[1-9](?:\.5)?)$/, '');

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
    complete: !!(name && cert && (grade || gradeWord === 'AUTHENTIC' || gradeWord === 'AUTH')),
  };
}

// ── Auto-read on the scan screen ────────────────────────────────────────────────────────────────
// Each frame is read on its own and the frames vote. A blurry frame still yields text, just wrong
// text ("TT TH AN NY - COLDEN BOX" for "25TH ANNIV-GOLDEN BOX"), and different wrong text each
// time, so the name must come out the same in two frames before it counts. The grade and cert are
// strict formats (a garbled one doesn't parse at all), so one frame is enough for those, and they
// can come from different frames. The grade is never guessed.

type Vote = { value: string; count: number };
export type AutoRead = {
  /** Name votes, by normalized name, with the last frame that read it (for set, number, variety). */
  names: Record<string, Vote & { label: ParsedLabel }>;
  grade: Vote | null;
  cert: Vote | null;
  misses: number;
} | null;

/** What the frames have confirmed so far, for the pills on the scan screen. */
type Field = { state: 'none' | 'seen' | 'done'; value?: string };
export type AutoProgress = { name: Field; grade: Field; cert: Field };

const norm = (s?: string) => (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const graded = (g?: string) => !!g && (/\d$/.test(g) || /^AUTH/.test(g));
/** Frames without a label we tolerate (a glare, a wobble) before forgetting what we've read. */
const MISS_LIMIT = 3;

const vote = (v: Vote | null, value: string): Vote =>
  v && v.value === value ? { value, count: v.count + 1 } : !v || v.count <= 1 ? { value, count: 1 } : v;

function topName(state: NonNullable<AutoRead>) {
  return Object.values(state.names).sort((a, b) => b.count - a.count)[0] ?? null;
}

export function autoProgress(state: AutoRead): AutoProgress {
  const top = state ? topName(state) : null;
  const one = (v?: Vote | null): Field => (v ? { state: 'done', value: v.value } : { state: 'none' });
  return {
    name: !top ? { state: 'none' } : top.count >= 2 ? { state: 'done', value: top.value } : { state: 'seen', value: top.value },
    grade: one(state?.grade),
    cert: one(state?.cert),
  };
}

/**
 * Feed one frame's parse. Returns the new state, and the label to add when it's ready: a name read
 * the same in two frames, a grade number, and the cert (or, when the cert won't read, the grade
 * read the same in two frames).
 */
export function stepAutoRead(state: AutoRead, next: ParsedLabel | null): { state: AutoRead; ready: ParsedLabel | null } {
  const c = next?.payload.PSACert;
  if (!c?.Subject) {
    if (!state) return { state: null, ready: null };
    const misses = state.misses + 1;
    return { state: misses >= MISS_LIMIT ? null : { ...state, misses }, ready: null };
  }
  // A different cert and a different name: another slab came into frame, so start over.
  if (state?.cert && c.CertNumber && state.cert.value !== c.CertNumber && !state.names[norm(c.Subject)]) state = null;
  const key = norm(c.Subject);
  const prev = state?.names[key];
  const s: NonNullable<AutoRead> = {
    names: { ...(state?.names ?? {}), [key]: { value: c.Subject, count: (prev?.count ?? 0) + 1, label: next! } },
    grade: graded(c.CardGrade) ? vote(state?.grade ?? null, c.CardGrade!) : (state?.grade ?? null),
    cert: c.CertNumber ? vote(state?.cert ?? null, c.CertNumber) : (state?.cert ?? null),
    misses: 0,
  };
  const top = topName(s)!;
  const ok = top.count >= 2 && !!s.grade && (!!s.cert || s.grade.count >= 2);
  if (!ok) return { state: s, ready: null };
  const base = top.label.payload.PSACert;
  const PSACert = { ...base, Subject: top.value, CardGrade: s.grade!.value, CertNumber: s.cert?.value ?? '' };
  return { state: null, ready: { payload: { PSACert }, complete: !!s.cert } };
}

/** A tapped read: this frame, with a grade or cert it missed filled in from earlier frames. */
export function withVotes(state: AutoRead, parsed: ParsedLabel | null): ParsedLabel | null {
  if (!parsed?.payload.PSACert.Subject) return parsed;
  const c = parsed.payload.PSACert;
  const PSACert = {
    ...c,
    CardGrade: graded(c.CardGrade) ? c.CardGrade : (state?.grade?.value ?? c.CardGrade),
    CertNumber: c.CertNumber || state?.cert?.value || '',
  };
  return { payload: { PSACert }, complete: !!(PSACert.Subject && PSACert.CertNumber && graded(PSACert.CardGrade)) };
}

type Rect = { x: number; y: number; width: number; height: number };

/**
 * Keep the lines that sit inside the on-screen frame, so text around the slab (a laptop screen, a
 * price tag on the next slab) never reaches the parser. The preview shows the photo scaled to cover
 * the view, so a line's 0..1 photo position maps to the view through that scale and crop. `margin`
 * grows the frame by that share of its size on each side.
 */
export function linesInFrame<T extends LabelLine>(lines: T[], photo: { width: number; height: number }, view: { width: number; height: number }, frame: Rect, margin = 0.12): T[] {
  if (!photo.width || !photo.height) return lines;
  // Vision's positions are in the upright photo; the reported size can be the sensor's landscape one.
  if (photo.width > photo.height !== view.width > view.height) photo = { width: photo.height, height: photo.width };
  const scale = Math.max(view.width / photo.width, view.height / photo.height);
  const dx = (photo.width * scale - view.width) / 2;
  const dy = (photo.height * scale - view.height) / 2;
  const mx = frame.width * margin;
  const my = frame.height * margin;
  return lines.filter((l) => {
    const x = l.x * photo.width * scale - dx;
    const y = l.y * photo.height * scale - dy;
    return x >= frame.x - mx && x <= frame.x + frame.width + mx && y >= frame.y - my && y <= frame.y + frame.height + my;
  });
}
