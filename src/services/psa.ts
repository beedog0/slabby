// PSA cert lookup, cache-first. See TECH.md "services/psa.ts".
//   1. The QR is decoded on device; we parse the cert number out of it and never open the URL.
//   2. Local cache (this device) → shared cert_cache (Supabase) → psa-lookup Edge Function.
//   3. The PSA token lives only in Edge Function secrets.
// Screens call `lookupCert`; nothing else talks to PSA.

import AsyncStorage from '@react-native-async-storage/async-storage';
import certsJson from '../mocks/certs.json';
import type { Card } from '../types';
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
  | { status: 'found'; cert: string; payload: PsaCertPayload; source: 'device' | 'cache' | 'psa' | 'mock' }
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
  if (res.error || !res.data) return { status: 'error', cert, message: res.error?.message ?? 'Lookup failed' };
  if (res.data.status === 'pending') return { status: 'pending', cert };
  if (res.data.status === 'not_found' || !res.data.payload) return { status: 'not_found', cert };
  await remember(cert, res.data.payload);
  return { status: 'found', cert, payload: res.data.payload, source: 'psa' };
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
      return i === 0 || w === w.toUpperCase() ? lower.charAt(0).toUpperCase() + lower.slice(1) : w;
    })
    .join(' ');
}

/**
 * PSA's Brand is free text like "POKEMON JAPANESE SV2a-POKEMON CARD 151". Pull out the language
 * and, when present, a set code and a short set name. Best effort; the user can edit later.
 */
export function parseBrand(brand = ''): { language: string; setCode: string | null; setName: string | null } {
  const language = /JAPANESE/i.test(brand) ? 'ja' : /KOREAN/i.test(brand) ? 'ko' : /CHINESE/i.test(brand) ? 'zh' : 'en';
  const rest = brand.replace(/^POKEMON\s*/i, '').replace(/^(JAPANESE|KOREAN|CHINESE)\s*/i, '');
  const code = rest.match(/^([A-Z]{1,4}\d{1,2}[a-z]?)-/);
  const setName = (code ? rest.slice(code[0].length) : rest).replace(/^POKEMON CARD\s*/i, '').trim();
  return { language, setCode: code ? code[1] : null, setName: setName ? titleName(setName) : null };
}

/** A new vault card from a PSA payload. Paid and plan come from the scan sheet. */
export function cardFromCert(payload: PsaCertPayload, extra: { paidCents: number | null; plan: Card['plan'] }): Card {
  const p = payload.PSACert;
  const brand = parseBrand(p.Brand);
  return {
    id: uuid(),
    certNumber: p.CertNumber,
    grader: 'psa',
    grade: gradeFrom(p.CardGrade ?? p.GradeDescription),
    name: titleName(p.Subject ?? 'Unknown card'),
    setName: brand.setName,
    setCode: brand.setCode,
    number: p.CardNumber ?? null,
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
