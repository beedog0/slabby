// Import a collection exported from another app: Collectr, TCGplayer, PriceCharting, or any
// spreadsheet saved as CSV. Pure: text in, rows out. Matching to our catalog is importMatch.ts.
//
// Columns are found by name, not position, so one reader covers every app: each field below
// lists the header names apps use for it. Their price columns (Market Price, Loose Price…) are
// never read. Prices come from real sales, not from the app the list came from.

import type { Game, Grader } from '../types';

export type ImportSource = 'collectr' | 'tcgplayer' | 'pricecharting' | 'spreadsheet';

export const SOURCE_NAME: Record<ImportSource, string> = {
  collectr: 'Collectr',
  tcgplayer: 'TCGplayer',
  pricecharting: 'PriceCharting',
  spreadsheet: 'spreadsheet',
};

export type ImportRow = {
  /** Line in the file, for "line 12 has no card name". */
  line: number;
  game: Game | null;
  name: string;
  setName: string | null;
  number: string | null;
  language: string;
  grader: Grader;
  /** Null for raw cards. */
  grade: number | null;
  cert: string | null;
  /** Raw cards: "near mint". */
  condition: string | null;
  quantity: number;
  /** What one copy cost. */
  paidCents: number | null;
  /** TCGplayer product id when the export has it (TCGplayer, some Collectr exports). */
  productId: number | null;
  /** Holofoil, Reverse Holofoil, 1st Edition… */
  printing: string | null;
};

export type ParsedImport = {
  source: ImportSource;
  rows: ImportRow[];
  /** Lines skipped: no card name, or a sealed product. */
  skipped: number;
};

/** The most copies one row can add; a typo of 1000 shouldn't flood the vault. */
export const MAX_QUANTITY = 50;

// ── CSV ──────────────────────────────────────────────────────────────────────────────────────

/** Comma, tab or semicolon: whichever splits the header line into the most columns. */
function delimiterOf(text: string): string {
  const first = text.split(/\r?\n/, 1)[0] ?? '';
  const counts = [',', '\t', ';'].map((d) => [d, first.split(d).length] as const);
  return counts.sort((a, b) => b[1] - a[1])[0][0];
}

/** RFC 4180 CSV: quoted fields, doubled quotes, newlines inside quotes, CRLF, a leading BOM. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, '');
  const d = delimiterOf(text);
  const out: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === d) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      out.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    out.push(row);
  }
  return out.filter((r) => r.some((f) => f.trim() !== ''));
}

// ── Columns ──────────────────────────────────────────────────────────────────────────────────

// "#" alone is the card number column.
const key = (h: string) => (h.trim() === '#' ? 'no' : h.toLowerCase().replace(/[^a-z0-9]/g, ''));

/** Header names per field, compared without case, spaces or punctuation. First found wins. */
const COLUMNS = {
  name: ['productname', 'cardname', 'name', 'card', 'simplename', 'title', 'product', 'item', 'itemname'],
  set: ['set', 'setname', 'consolename', 'console', 'expansion', 'series', 'edition'],
  number: ['cardnumber', 'number', 'no', 'num', 'collectornumber', 'cardno', 'cardnum'],
  quantity: ['quantity', 'qty', 'count', 'copies', 'owned', 'quantityowned', 'totalquantity', 'addtoquantity'],
  paid: [
    'averagecostpaid',
    'avgcostpaid',
    'costpaid',
    'pricepaid',
    'paid',
    'purchaseprice',
    'boughtfor',
    'costbasis',
    'cost',
    'paidprice',
    'yourpricepaid',
  ],
  grade: ['grade', 'graded', 'psagrade', 'slabgrade'],
  grader: ['grader', 'gradingcompany', 'gradedby', 'company', 'gradingservice'],
  cert: ['cert', 'certnumber', 'certno', 'certificationnumber', 'certificationid', 'certificate', 'psacert', 'psacertnumber', 'serial', 'serialnumber'],
  condition: ['cardcondition', 'condition', 'conditionname'],
  language: ['language', 'lang'],
  productId: ['productid', 'tcgplayerid', 'tcgplayerproductid', 'tcgproductid', 'tcgid'],
  printing: ['printing', 'variance', 'variant', 'finish', 'foil', 'printingname'],
  category: ['category', 'game', 'productline', 'categoryname', 'tcg'],
  // Only read to leave sealed products out.
  kind: ['producttype', 'type', 'kind', 'producttypename'],
} as const;

type Field = keyof typeof COLUMNS;

export function columnsOf(headers: string[]): Partial<Record<Field, number>> {
  const keys = headers.map(key);
  const out: Partial<Record<Field, number>> = {};
  for (const f of Object.keys(COLUMNS) as Field[]) {
    for (const name of COLUMNS[f]) {
      const i = keys.indexOf(name);
      if (i >= 0) {
        out[f] = i;
        break;
      }
    }
  }
  return out;
}

/** Which app wrote the file, from the header names it uses. Only for the summary line. */
export function sourceOf(headers: string[]): ImportSource {
  const k = new Set(headers.map(key));
  if (k.has('averagecostpaid') || k.has('portfolioname') || k.has('variance')) return 'collectr';
  if (k.has('consolename') || k.has('looseprice') || k.has('pricechartingid')) return 'pricecharting';
  if (k.has('tcgplayerid') || k.has('simplename') || (k.has('productid') && k.has('printing'))) return 'tcgplayer';
  return 'spreadsheet';
}

// ── Values ───────────────────────────────────────────────────────────────────────────────────

/** "$1,234.50" → 123450. Blank, zero or unreadable → null. */
export function moneyCents(s: string | undefined): number | null {
  if (!s) return null;
  const t = s.replace(/[^0-9.,-]/g, '');
  if (!t) return null;
  // "1.234,50" (European) vs "1,234.50": the last separator is the decimal point.
  const lastComma = t.lastIndexOf(',');
  const lastDot = t.lastIndexOf('.');
  const norm = lastComma > lastDot && t.length - lastComma === 3 ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  const n = Number(norm);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}

const GRADERS: [RegExp, Grader][] = [
  [/\bpsa\b/i, 'psa'],
  [/\b(bgs|beckett|bvg)\b/i, 'bgs'],
  [/\bcgc\b/i, 'cgc'],
];

/**
 * A grade column, often with the grader in it: "PSA 10", "BGS 9.5", "CGC Pristine 10", "Grade 9",
 * "10". "Ungraded", "Raw", blank → raw. Slabby only renders PSA, BGS and CGC slabs, so other graders
 * (SGC, TAG, ACE) come in as raw with their grade kept in the condition line.
 */
export function gradeOf(gradeCell: string, graderCell = ''): { grader: Grader; grade: number | null; other: string | null } {
  const g = gradeCell.trim();
  const both = `${graderCell} ${g}`.trim();
  if (!g || /^(ungraded|raw|none|n\/?a|-|0)$/i.test(g)) return { grader: 'raw', grade: null, other: null };
  const num = g.match(/(\d+(?:\.5)?)\s*$/) ?? g.match(/(\d+(?:\.5)?)/);
  const grade = num ? Number(num[1]) : null;
  if (grade == null || grade < 1 || grade > 10) return { grader: 'raw', grade: null, other: null };
  const named = GRADERS.find(([re]) => re.test(both))?.[1];
  if (named) return { grader: named, grade, other: null };
  if (/\b(sgc|tag|ace|ags|gma|hga|mnt|isa)\b/i.test(both)) return { grader: 'raw', grade: null, other: both };
  // A bare number ("10", "Grade 9") is almost always PSA.
  return { grader: 'psa', grade, other: null };
}

/** Collectr writes raw condition as "Near Mint", TCGplayer "Near Mint Holofoil". Lowercase, no finish. */
function conditionOf(s: string): string | null {
  const t = s.trim().toLowerCase();
  if (!t) return null;
  const m = t.match(/near mint|lightly played|moderately played|heavily played|damaged|mint/);
  return m ? m[0] : null;
}

export function gameOf(s: string): Game | null {
  const t = s.toLowerCase();
  if (/pok[eé]mon/.test(t)) return 'pokemon';
  if (/one\s*piece/.test(t)) return 'onepiece';
  if (/riftbound|league of legends/.test(t)) return 'riftbound';
  return null;
}

/** Language from a Language column, or a hint in the set name ("Japanese", "(JP)", "SV2a"). */
export function languageOf(langCell: string, setName: string): string {
  const l = langCell.trim().toLowerCase();
  if (/^(ja|jp|jpn|japanese)/.test(l)) return 'ja';
  if (/^(ko|kr|kor|korean)/.test(l)) return 'ko';
  if (/^(zh|cn|chinese|tc|sc)/.test(l)) return 'zh';
  if (/^(id|indonesian)/.test(l)) return 'id';
  if (l) return 'en';
  if (/\bjapanese\b|\(jp\)|\bjpn\b/i.test(setName)) return 'ja';
  if (/\bkorean\b/i.test(setName)) return 'ko';
  if (/\bchinese\b/i.test(setName)) return 'zh';
  return 'en';
}

const SEALED = /\b(booster box|booster pack|elite trainer box|etb|blister|collection box|tin|bundle|case|display|starter deck|build & battle|premium collection|sealed)\b/i;

/**
 * "Charizard - 4/102", "Mew ex #205", "Pikachu [Holo] #58" → the name and the number apart.
 * TCGplayer and PriceCharting titles carry the number; Collectr has its own column.
 */
export function splitTitle(title: string): { name: string; number: string | null } {
  let t = title.trim();
  let number: string | null = null;
  const hash = t.match(/\s#\s*([A-Za-z0-9-]+(?:\/[A-Za-z0-9-]+)?)\s*$/);
  if (hash) {
    number = hash[1];
    t = t.slice(0, hash.index).trim();
  } else {
    const dash = t.match(/\s+-\s+([A-Za-z0-9-]*\d[A-Za-z0-9-]*(?:\/[A-Za-z0-9-]+)?)(\s*\([^()]*\))?\s*$/);
    if (dash) {
      number = dash[1];
      t = (t.slice(0, dash.index) + (dash[2] ?? '')).trim();
    }
  }
  // PriceCharting puts the finish in brackets: "Charizard [1st Edition]". Keep it as a variant.
  t = t.replace(/\s*\[([^\]]+)\]/g, ' ($1)').replace(/\s+/g, ' ').trim();
  return { name: t, number };
}

/** The printed number without the set size: "4/102" → "4", "#205" → "205". "OP05-119" stays. */
export function numberOf(s: string | null | undefined): string | null {
  const t = (s ?? '').trim().replace(/^#/, '');
  if (!t) return null;
  return t.split('/')[0].trim() || null;
}

// ── Rows ─────────────────────────────────────────────────────────────────────────────────────

/** Read an exported collection. Throws when the file has no card-name column. */
export function parseImport(text: string): ParsedImport {
  const table = parseCsv(text);
  if (table.length < 2) throw new ImportError('This file has no rows.');
  // Some exports start with a title line ("My Collection, exported …"): use the first line
  // that has a name column as the header.
  const h = table.findIndex((r) => columnsOf(r).name != null);
  if (h < 0) throw new ImportError('No card name column. Check the file is a collection export.');
  const headers = table[h];
  const col = columnsOf(headers);
  const source = sourceOf(headers);
  const at = (r: string[], f: Field) => (col[f] != null ? (r[col[f]!] ?? '').trim() : '');

  const rows: ImportRow[] = [];
  let skipped = 0;
  for (let i = h + 1; i < table.length; i++) {
    const r = table[i];
    const title = at(r, 'name');
    const kind = at(r, 'kind');
    if (!title || SEALED.test(kind) || (!at(r, 'number') && SEALED.test(title))) {
      skipped++;
      continue;
    }
    const split = splitTitle(title);
    const setName = at(r, 'set') || null;
    const g = gradeOf(at(r, 'grade'), at(r, 'grader'));
    // Collectr puts "PSA 10" in Card Condition for graded cards on some exports.
    const fromCondition = g.grader === 'raw' && !g.other ? gradeOf(/\b(psa|bgs|beckett|cgc)\b/i.test(at(r, 'condition')) ? at(r, 'condition') : '') : null;
    const grade = fromCondition && fromCondition.grader !== 'raw' ? fromCondition : g;
    const qty = Math.round(Number(at(r, 'quantity').replace(/[^0-9.]/g, '')));
    const pid = Number(at(r, 'productId'));
    const cert = at(r, 'cert').replace(/[^0-9]/g, '') || null;
    rows.push({
      line: i + 1,
      game: gameOf(at(r, 'category')) ?? gameOf(setName ?? ''),
      name: split.name,
      setName,
      number: numberOf(at(r, 'number') || split.number),
      language: languageOf(at(r, 'language'), setName ?? ''),
      grader: grade.grader,
      grade: grade.grade,
      cert: grade.grader === 'raw' ? null : cert,
      condition: grade.other ?? (grade.grader === 'raw' ? conditionOf(at(r, 'condition')) : null),
      // One cert is one slab, whatever the quantity says.
      quantity: cert ? 1 : Math.min(MAX_QUANTITY, Number.isFinite(qty) && qty > 0 ? qty : 1),
      paidCents: moneyCents(at(r, 'paid')),
      productId: Number.isInteger(pid) && pid > 0 ? pid : null,
      printing: at(r, 'printing') || null,
    });
  }
  return { source, rows, skipped };
}

export class ImportError extends Error {}
