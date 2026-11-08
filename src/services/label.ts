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
//
//   2023 ONE PIECE JAPANESE OP05-AWAKENING OF THE NEW ERA  #119
//   2025 RIFTBOUND: LEAGUE OF LEGENDS SFD-SPIRITFORGED     #T03a

import type { PsaCertPayload } from './psa';

/** One recognized line. x/y are the line's left edge and vertical centre, 0..1 from top-left. */
export type LabelLine = { text: string; x: number; y: number };

// Case-sensitive on purpose: labels print grades in capitals, card names use "ex"/"EX" too.
const GRADE_WORDS = /(?:^|\s)(GEM MT|GEM MINT|MINT|NM-MT\+?|NM\+?|EX-MT\+?|EX\+?|VG-EX\+?|VG\+?|GOOD\+?|FAIR|PR|AUTHENTIC|AUTH)(?=\s|$|\d)/;
// Grade words OCR may join onto the end of the name line. Not EX/NM/VG alone: "MEW EX" is a name.
const JOINED_GRADE = /\s(GEM MT|GEM MINT|NM-MT\+?|EX-MT\+?|VG-EX\+?|MINT)$/;
const GRADE_NUM = /^\s*(10|[1-9](?:\.5)?)(?!\d)/;
// The brand opens the set line: Pokémon (OCR reads O as 0, old labels print "P.M."), One Piece, Riftbound.
const BRAND_START = String.raw`(?:P(?:OK[EÉ]M[O0]N|\.?M\.?)|[O0]NE\s?P[I1]ECE|R[I1]FTB[O0]UND)`;
const YEAR_BRAND = new RegExp(String.raw`\b((?:19|20)\d{2})\s+(${BRAND_START}(?:\b|:).*)$`, 'i');
// Some labels (and some photos) split the year and the brand onto separate lines.
const BRAND_ONLY = new RegExp(String.raw`^(${BRAND_START}(?:\b|:).*)$`, 'i');
// Riftbound's brand is long and wraps: "2025 RIFTBOUND: LEAGUE OF" / "LEGENDS OGN-ORIGINS".
const BRAND_WRAP = /^(?:LEAGUE OF LEGENDS|OF LEGENDS|LEGENDS)\b/i;
const YEAR_ONLY = /^((?:19|20)\d{2})$/;
const CERT = /^\d{8,10}$/;
const VARIETY = /^(HOLO|REVERSE HOLO|1ST EDITION|SHADOWLESS|FULL ART|ALT(?:ERNATE)? ART|SPECIAL ART RARE|ILLUSTRATION RARE|SPECIAL ILLUSTRATION RARE|SECRET|RAINBOW|GOLD|PROMO|STAFF|ART RARE|SUPER RARE|ULTRA RARE|HYPER RARE|PARALLEL|MANGA|SP|SPECIAL|1ST ANNIVERSARY|TREASURE RARE|SIGNATURE|OVERNUMBERED|SHOWCASE|FOIL)\b/i;

// Product and event lines PSA prints where a set or variety goes, never a card name:
// "25TH ANNIV-GOLDEN BOX", "METAMONG PROJECT STMP RLY", "PRIZE PACK SERIES".
const SET_LINE = /\b(?:ANNIV(?:ERSARY)?|BOX|COLLECTION|PROMO|DECK|STMP|STAMP|PROJECT|TOURNAMENT|PRIZE|CHAMPIONSHIPS?|PREMIUM|GIFT|TIN|BLISTER|STARTER|SERIES|PACK)\b|\b\d+(?:ST|ND|RD|TH)\b/i;

// Short words real card names use: "M CHARIZARD EX", "MR. MIME", "N", "PIKACHU V".
const SHORT_WORDS = new Set(['EX', 'GX', 'V', 'M', 'MR', 'DR', 'JR', 'LV', 'X', 'Y', 'N', 'OF', 'UP', 'ON', 'TO', 'DE']);

/** A misread line: mostly one- and two-letter fragments ("TT TH AN NY - COLDEN BOX"). */
function garbled(t: string): boolean {
  const words = t.split(/[\s-]+/).filter((w) => /[A-Z]/i.test(w));
  if (words.length < 3) return false;
  const frags = words.filter((w) => {
    const l = w.replace(/[^A-Z]/gi, '').toUpperCase();
    return l.length <= 2 && !SHORT_WORDS.has(l);
  }).length;
  return frags >= 2 && frags * 2 >= words.length;
}

/** A product or event line ("25TH ANNIV-GOLDEN BOX"): it names the set when the brand line doesn't. */
export function setLine(t: string | null | undefined): boolean {
  return !!t && SET_LINE.test(t);
}

/** Whether a line can be a card name, not a set/product line or an OCR misread. */
export function nameLike(t: string): boolean {
  return !!t && !SET_LINE.test(t) && !garbled(t);
}

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
        if (nameOnly && nameLike(nameOnly)) name = nameOnly;
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
  // A wrapped brand continues on the next line; that line isn't the card name.
  if (brand && /RIFTB/i.test(brand)) {
    const next = lines[brandIndex + 1]?.text;
    if (next && BRAND_WRAP.test(next) && !/LEGENDS/i.test(brand)) {
      brand = `${brand} ${next.replace(/#\s*[A-Z0-9-]+.*$/i, '').trim()}`;
      brandIndex += 1;
    }
  }
  // OCR reads O as 0 and drops accents; parseBrand expects the brand as PSA spells it.
  if (brand)
    brand = brand
      .replace(/^P(?:OK[EÉ]M[O0]N)\b/i, 'POKEMON')
      .replace(/^[O0]NE\s?P[I1]ECE\b/i, 'ONE PIECE')
      .replace(/^R[I1]FTB[O0]UND\b/i, 'RIFTBOUND')
      .replace(/\bJPN\b/i, 'JAPANESE');

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
  // OCR can join the right column on: "SURFING PIKACHU VMAX GEM MT", "FULL ART 10".
  const freeText = (text: string) => {
    const t = text
      .replace(/#\s*[A-Z0-9-]+/i, '')
      .replace(JOINED_GRADE, '')
      .replace(/\s(10|[1-9](?:\.5)?)$/, '')
      .trim();
    const skip = !t || YEAR_ONLY.test(t) || t === gradeWord || (gradeWord && t.startsWith(gradeWord + ' ')) || CERT.test(t) || /^(10|[1-9](?:\.5)?)$/.test(t);
    return skip ? null : t;
  };
  let nameIndex = -1;
  if (!name && brandIndex >= 0) {
    for (let i = brandIndex + 1; i < lines.length; i++) {
      const t = freeText(lines[i].text);
      if (!t) continue;
      if (VARIETY.test(t) || SET_LINE.test(t)) {
        variety ??= t.replace(/\s(10|[1-9](?:\.5)?)$/, '');
        continue;
      }
      // A misread name line: better no name (the next frame tries again) than a wrong one.
      if (garbled(t)) break;
      name = t;
      nameIndex = i;
      break;
    }
  }
  // The line under the name is the variety when it isn't a known word: promo stamps and events
  // ("METAMONG PROJECT STMP RLY", "POKEMON CENTER STAMP").
  if (!variety && nameIndex >= 0) {
    const next = lines.slice(nameIndex + 1).map((l) => freeText(l.text)).find(Boolean);
    if (next && !BRAND_ONLY.test(next) && /[A-Z]{3,}/.test(next)) variety = next;
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
  /** Set/variety line, card number and brand from any frame: the frame that reads the name best
   * often misses them (a tilted label loses "25TH ANNIV-GOLDEN BOX"). */
  variety?: string;
  number?: string;
  brand?: string;
  /** Frames waited for a set line after everything else was read. */
  waits?: number;
  misses: number;
} | null;

/** What the frames have confirmed so far, for the pills on the scan screen. */
type Field = { state: 'none' | 'seen' | 'done'; value?: string };
export type AutoProgress = { name: Field; grade: Field; cert: Field };

const norm = (s?: string) => (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const graded = (g?: string) => !!g && (/\d$/.test(g) || /^AUTH/.test(g));
/** Brand lines that name only the language, no set: "POKEMON JAPANESE" (from "2021 POKEMON JPN"). */
const NO_SET = /^POKEMON(?:\s+(?:JAPANESE|KOREAN|CHINESE|JPN?|KOR?|KR))?\s*$/i;
/** Extra frames to wait for a missing set line before adding without it. Auto-read runs ~1/s. */
const SET_WAIT = 3;
/** The fuller of two reads of the brand line (a tilted frame can cut it short). */
const longer = (a?: string, b?: string) => ((b?.length ?? 0) > (a?.length ?? 0) ? b : a);

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
    variety: state?.variety ?? c.Variety ?? undefined,
    number: state?.number ?? c.CardNumber ?? undefined,
    brand: longer(state?.brand, c.Brand),
    waits: state?.waits ?? 0,
    misses: 0,
  };
  const top = topName(s)!;
  const ok = top.count >= 2 && !!s.grade && (!!s.cert || s.grade.count >= 2);
  if (!ok) return { state: s, ready: null };
  // "2021 POKEMON JPN" names no set: PSA prints it on its own line. Without that line the card
  // can't be told from every other Japanese #3, so give the next few frames a chance to read it.
  if (!s.variety && NO_SET.test(s.brand ?? '') && s.waits! < SET_WAIT) return { state: { ...s, waits: s.waits! + 1 }, ready: null };
  const base = top.label.payload.PSACert;
  const PSACert = {
    ...base,
    Subject: top.value,
    CardGrade: s.grade!.value,
    CertNumber: s.cert?.value ?? '',
    Variety: base.Variety ?? s.variety,
    CardNumber: base.CardNumber ?? s.number,
    Brand: longer(base.Brand, s.brand),
  };
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

/**
 * The on-screen frame as a share of the photo (0..1 from the top-left), the inverse of
 * linesInFrame's mapping: where to look for the card in a live frame.
 */
export function frameInPhoto(photo: { width: number; height: number }, view: { width: number; height: number }, frame: Rect): Rect | null {
  if (!photo.width || !photo.height || !frame.width || !frame.height) return null;
  if (photo.width > photo.height !== view.width > view.height) photo = { width: photo.height, height: photo.width };
  const scale = Math.max(view.width / photo.width, view.height / photo.height);
  const dx = (photo.width * scale - view.width) / 2;
  const dy = (photo.height * scale - view.height) / 2;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const x0 = clamp((frame.x + dx) / scale / photo.width);
  const y0 = clamp((frame.y + dy) / scale / photo.height);
  const x1 = clamp((frame.x + frame.width + dx) / scale / photo.width);
  const y1 = clamp((frame.y + frame.height + dy) / scale / photo.height);
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}
