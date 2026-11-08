// PSA cert lookup, cache-first. See TECH.md "services/psa.ts".
//   1. The QR is decoded on device; we parse the cert number out of it and never open the URL.
//   2. Local cache (this device) → shared cert_cache (Supabase) → psa-lookup Edge Function.
//   3. The PSA token lives only in Edge Function secrets.
// Screens call `lookupCert`; nothing else talks to PSA.

import { setLine } from './label';
import AsyncStorage from '@react-native-async-storage/async-storage';
import certsJson from '../mocks/certs.json';
import { GAMES, gameFromBrand, gameOf } from '../lib/games';
import type { Card, Game } from '../types';
import { supabase } from './supabase';
import { uuid } from './sync';

/** Raw PSA public API response body (GetByCertNumber). Only the fields we use. */
export type PsaCertPayload = {
  PSACert: {
    CertNumber: string;
    Year?: string;
    Brand?: string;
    Category?: string;
    CardNumber?: string;
    Subject?: string;
    Variety?: string;
    CardGrade?: string;
    GradeDescription?: string;
    TotalPopulation?: number | null;
  };
};

export type CertResult =
  | { status: 'found'; cert: string; payload: PsaCertPayload; source: 'device' | 'cache' | 'psa' | 'mock' | 'label' }
  | { status: 'pending'; cert: string } // PSA daily quota hit; the Edge Function queued it
  | { status: 'not_found'; cert: string }
  | { status: 'error'; cert: string; message: string };

const CERT = /^\d{7,10}$/;

/**
 * Cert number from a PSA label QR. The QR encodes a URL ending in the cert, e.g.
 * "https://www.psacard.com/cert/88142203" or ".../cert/88142203/psa". Bare numbers are accepted
 * for manual entry. Returns null for anything else.
 */
export function parseCertFromQr(data: string): string | null {
  const s = data.trim();
  if (CERT.test(s)) return s;
  const m = s.match(/psacard\.com\/cert\/(\d{7,10})(?:[/?#]|$)/i);
  return m ? m[1] : null;
}

const deviceKey = (cert: string) => `slabby.cert.${cert}`;

export async function lookupCert(cert: string): Promise<CertResult> {
  if (!CERT.test(cert)) return { status: 'error', cert, message: 'Not a PSA cert number' };

  try {
    const local = await AsyncStorage.getItem(deviceKey(cert));
    if (local) return { status: 'found', cert, payload: JSON.parse(local), source: 'device' };
  } catch {
    // Storage unavailable: fall through to the network.
  }

  if (!supabase) {
    const mock = (certsJson as Record<string, PsaCertPayload>)[cert];
    return mock ? { status: 'found', cert, payload: mock, source: 'mock' } : { status: 'not_found', cert };
  }

  const cached = await supabase.from('cert_cache').select('payload').eq('cert_number', cert).maybeSingle();
  if (cached.data?.payload) {
    await remember(cert, cached.data.payload);
    return { status: 'found', cert, payload: cached.data.payload as PsaCertPayload, source: 'cache' };
  }

  const res = await supabase.functions.invoke<{ status: string; payload?: PsaCertPayload; message?: string }>('psa-lookup', {
    body: { cert },
  });
  if (res.data?.status === 'found' && res.data.payload) {
    await remember(cert, res.data.payload);
    return { status: 'found', cert, payload: res.data.payload, source: 'psa' };
  }
  if (res.data?.status === 'not_found') return { status: 'not_found', cert };

  // The server's PSA token isn't approved yet, and PSA's keyless daily allowance is per network,
  // so a shared cloud IP runs out but the phone's own connection usually doesn't.
  const direct = await psaFromDevice(cert);
  if (direct.status !== 'error') return direct;
  if (res.data?.status === 'pending') return { status: 'pending', cert };
  return { status: 'error', cert, message: res.error?.message ?? direct.message };
}

const PSA_URL = 'https://api.psacard.com/publicapi/cert/GetByCertNumber/';

/** PSA's public cert endpoint, called from the phone without a token. No secrets on the device. */
export async function psaFromDevice(cert: string): Promise<CertResult> {
  try {
    const r = await fetch(PSA_URL + cert, { headers: { Accept: 'application/json' } });
    if (r.status === 429) return { status: 'pending', cert };
    if (!r.ok) return { status: 'error', cert, message: `PSA ${r.status}` };
    const body = (await r.json()) as PsaCertPayload & { IsValidRequest?: boolean; ServerMessage?: string };
    if (!body?.PSACert?.CertNumber) return { status: 'not_found', cert };
    const payload: PsaCertPayload = { PSACert: body.PSACert };
    await remember(cert, payload);
    return { status: 'found', cert, payload, source: 'psa' };
  } catch (e) {
    return { status: 'error', cert, message: e instanceof Error ? e.message : 'PSA unreachable' };
  }
}

async function remember(cert: string, payload: unknown) {
  try {
    await AsyncStorage.setItem(deviceKey(cert), JSON.stringify(payload));
  } catch {
    // Best effort.
  }
}

/** "GEM MT 10" → 10, "MINT 9" → 9, "NM-MT 8.5" → 8.5. */
export function gradeFrom(s?: string): number | null {
  const m = s?.match(/(\d+(?:\.\d)?)\s*$/);
  return m ? Number(m[1]) : null;
}

/** "MEW ex" → "Mew ex", "CHARIZARD-HOLO" → "Charizard-holo". Keeps suffixes like ex, V, VMAX. */
export function titleName(subject: string): string {
  return subject
    .split(' ')
    .map((w, i) => {
      if (/^(ex|EX|GX|V|VMAX|VSTAR|SAR|SIR)$/.test(w)) return w;
      const lower = w.toLowerCase();
      if (!(i === 0 || w === w.toUpperCase())) return w;
      // One Piece names run initials together: "MONKEY.D.LUFFY" → "Monkey.D.Luffy".
      return lower.replace(/(^|\.)([a-z])/g, (_, dot, l) => dot + l.toUpperCase());
    })
    .join(' ');
}

/**
 * PSA's Brand is free text like "POKEMON JAPANESE SV2a-POKEMON CARD 151",
 * "ONE PIECE JAPANESE OP05-AWAKENING OF THE NEW ERA" or "RIFTBOUND: LEAGUE OF LEGENDS SFD-SPIRITFORGED".
 * Pull out the game, the language and, when present, a set code and a short set name. Best
 * effort; the user can edit later. A brand naming no known game is read as Pokémon.
 */
export function parseBrand(brand = ''): { game: Game; language: string; setCode: string | null; setName: string | null } {
  const game = gameFromBrand(brand) ?? 'pokemon';
  // Newer labels print "SV8a JP-..." or "SV-P JP PROMO" instead of "JAPANESE SV2a-...".
  // Newer Korean labels print "SV-P KO" (Korea-only promos like the Metamong Project Ditto).
  let language = /JAPANESE|\bJPN?\b/i.test(brand) ? 'ja' : /KOREAN|\bKOR?\b|\bKR\b/i.test(brand) ? 'ko' : /CHINESE|\bCHN\b/i.test(brand) ? 'zh' : 'en';
  const rest = brand
    .trim()
    .replace(GAMES[game].brand, '')
    .replace(/^(?:(?:SIMPLIFIED|TRADITIONAL)\s+)?(JAPANESE|KOREAN|CHINESE|JPN?)\s*/i, '');
  // Pokémon and One Piece codes are letters then digits (SV2a, SV-P, OP05, ST10, EB01, PRB01).
  // Riftbound's are letters only (OGN, SFD), so they only count with the hyphen after them.
  const code =
    rest.match(/^((?:[A-Z]{1,4}\d{1,2}[a-z]?)|(?:[A-Z]{1,3}-P))(?:\s+(?:JPN?|KOR?|KR|CHN))?(?=[-\s]|$)-?/i) ??
    (game === 'riftbound' ? rest.match(/^([A-Z]{2,4})-/i) : null);
  const setName = (code ? rest.slice(code[0].length) : rest)
    .replace(/^(?:JPN?|KOR?|KR|CHN)\b-?\s*/i, '')
    .replace(/^POKEMON CARD\s*/i, '')
    .trim();
  // Set codes print as letters, digits, then a lowercase variant letter: SV2a, SV-P, S12a.
  const setCode = code ? code[1].replace(/^[a-z]+/i, (l) => l.toUpperCase()).replace(/-p$/, '-P') : null;
  // English promos print "SVP" or "SV BLACK STAR"; a hyphenated "SV-P" / "S-P" code is an Asian promo,
  // Japanese unless the label names another language.
  if (game === 'pokemon' && language === 'en' && setCode && /-P$/.test(setCode)) language = 'ja';
  return { game, language, setCode, setName: setName ? titleName(setName) : null };
}

/**
 * Fix cards saved by earlier label reads: "Sv8a Jp" as the set (language left English, no set
 * code) and "Pikachuex" with the suffix glued on. Returns the same object when nothing changes.
 */
export function repairCard(c: Card): Card {
  let next = c;
  if (gameOf(c) === 'pokemon' && c.grader !== 'raw' && !c.setCode && c.setName && /\bjpn?\b/i.test(c.setName)) {
    const b = parseBrand(`POKEMON ${c.setName}`);
    next = { ...next, language: b.language, setCode: b.setCode ?? next.setCode, setName: b.setName };
  }
  const name = gameOf(c) === 'pokemon' ? splitSuffix(c.name) : c.name;
  if (name !== c.name) next = { ...next, name };
  return next;
}

// Words that don't tell two card names apart.
const NAME_FILLER = new Set(['ex', 'gx', 'v', 'vmax', 'vstar', 'holo', 'the', 'and', 'of']);
const nameWords = (t: string) =>
  t
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !NAME_FILLER.has(w));

/**
 * The name to show once a card is matched to its catalog product: the product's name, whenever the
 * label read has a word the product's name doesn't. That covers a code printed where the name goes
 * ("PZA #236" on SV8a) and OCR slips through glare ("SHIONG MAGIKARP-HOLO" for Shining Magikarp).
 * A read that agrees ("Charizard-holo" vs "Charizard", "Pikachu" vs "Pikachu ex") is kept, so a
 * correct name isn't rewritten for nothing. Null when nothing should change.
 */
export function nameFromMatch(current: string, matched: string | null | undefined): string | null {
  const m = matched?.trim();
  if (!m || m === current) return null;
  const have = nameWords(current);
  const want = new Set(nameWords(m));
  if (!want.size) return null;
  return have.every((w) => want.has(w)) ? null : m;
}

/** OCR often drops the space before the suffix: "PIKACHUex" → "PIKACHU ex". */
export function splitSuffix(name: string): string {
  return name.replace(/([a-z]{3,})(ex|GX|VMAX|VSTAR)$/i, '$1 $2');
}

/** A new vault card from a PSA payload. Paid and plan come from the scan sheet. */
export function cardFromCert(payload: PsaCertPayload, extra: { paidCents: number | null; plan: Card['plan'] }): Card {
  const p = payload.PSACert;
  const brand = parseBrand(p.Brand);
  return {
    id: uuid(),
    game: brand.game,
    certNumber: p.CertNumber,
    grader: 'psa',
    grade: gradeFrom(p.CardGrade ?? p.GradeDescription),
    // The glued-suffix fix ("PIKACHUex") is Pokémon-only; other games have names ending in "ex".
    name: titleName(brand.game === 'pokemon' ? splitSuffix(p.Subject ?? 'Unknown card') : p.Subject ?? 'Unknown card'),
    // "2021 POKEMON JPN" names no set; PSA puts the product on the variety line ("25TH ANNIV-GOLDEN BOX").
    setName: brand.setName ?? (!brand.setCode && setLine(p.Variety) ? titleName(p.Variety!.trim()) : null),
    setCode: brand.setCode,
    number: p.CardNumber ?? null,
    variety: p.Variety?.trim() || null,
    language: brand.language,
    year: p.Year ? Number(p.Year) || null : null,
    imageFrontUrl: null,
    paidCents: extra.paidCents,
    paidAt: new Date().toISOString().slice(0, 10),
    plan: extra.plan,
    floorOverrideCents: null,
    askOverrideCents: null,
    status: 'owned',
    soldCents: null,
    soldAt: null,
    soldWhere: null,
    createdAt: new Date().toISOString(),
  };
}

/**
 * One Piece and Riftbound collectors name sets by code ("OP05", "ST10", "OGN"), and the code is
 * what tells two #119s apart, so a typed code becomes the set code. Pokémon is left as typed.
 */
function manualSet(game: Game, typed: string): { setName: string | null; setCode: string | null } {
  const t = typed.trim();
  if (game !== 'pokemon' && /^[A-Z]{2,4}-?\d{0,2}$/i.test(t)) return { setName: null, setCode: t.toUpperCase() };
  return { setName: t || null, setCode: null };
}

export type ManualDetails = {
  game: Game;
  cert: string | null;
  grader: Card['grader'];
  grade: number;
  name: string;
  setName: string;
  number: string;
  /** Parallel, manga, alt art: what the label prints under the name. Optional. */
  variety?: string;
  language: string;
  paidCents: number | null;
  plan: Card['plan'];
  /** From card search: the set code and card photo are already known. */
  setCode?: string | null;
  imageFrontUrl?: string | null;
};

/** A vault card typed in by hand: when PSA can't look the cert up, or for BGS/CGC slabs. */
export function cardFromDetails(d: ManualDetails): Card {
  const now = new Date().toISOString();
  return {
    id: uuid(),
    game: d.game,
    certNumber: d.cert,
    grader: d.grader,
    grade: d.grade,
    name: d.name.trim(),
    ...(d.setCode?.trim() ? { setName: d.setName.trim() || null, setCode: d.setCode.trim() } : manualSet(d.game, d.setName)),
    number: d.number.trim().replace(/^#/, '') || null,
    variety: d.variety?.trim() || null,
    language: d.language,
    year: null,
    imageFrontUrl: d.imageFrontUrl || null,
    paidCents: d.paidCents,
    paidAt: now.slice(0, 10),
    plan: d.plan,
    floorOverrideCents: null,
    askOverrideCents: null,
    status: 'owned',
    soldCents: null,
    soldAt: null,
    soldWhere: null,
    createdAt: now,
  };
}
