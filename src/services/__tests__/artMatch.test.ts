import { artDistance, artPrint, colorDistance, hamming, pHash, resizeArea, trimMargin, type Rgb } from '../../../supabase/functions/_shared/art-hash';
import { artBonus, artRead, artSure, combine, decodeBase64, rankArt, rotate180, type ArtHit } from '../artMatch';
import type { CatalogCard } from '../search';
import type { ParsedCard } from '../cardScan';

// A made-up "card": border, art window with shapes, text-ish stripes. seed changes the art.
function card(seed: number, w = 200, h = 280): Rgb {
  const data = new Uint8Array(w * h * 3);
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const blobs = Array.from({ length: 7 }, () => ({ x: rnd() * w, y: rnd() * h * 0.5 + h * 0.1, r: (0.08 + rnd() * 0.2) * w, c: [rnd() * 255, rnd() * 255, rnd() * 255] }));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      let c = [230, 200, 60]; // yellow border
      if (x > w * 0.05 && x < w * 0.95 && y > h * 0.04 && y < h * 0.96) c = [235, 235, 225];
      if (x > w * 0.09 && x < w * 0.91 && y > h * 0.11 && y < h * 0.49) {
        c = [90 + 60 * Math.sin((x / w) * 12 + seed), 120, 160 + 50 * Math.cos((y / h) * 12 + seed)];
        for (const b of blobs) if ((x - b.x) ** 2 + (y - b.y) ** 2 < b.r ** 2) c = b.c;
      }
      if (y > h * 0.6 && y < h * 0.9 && Math.floor((y / h) * 31) % 3 === 0 && x > w * 0.1 && x < w * (0.5 + ((seed + Math.floor((y / h) * 31)) % 4) / 10)) c = [40, 40, 40];
      data.set(c.map((v) => Math.max(0, Math.min(255, Math.round(v)))), i);
    }
  return { data, width: w, height: h };
}

// Photo-like changes: darker and warmer, a glare spot, slightly off-centre crop.
function photographed(img: Rgb): Rgb {
  const { width: w, height: h } = img;
  const out = new Uint8Array(w * h * 3);
  const dx = 3;
  const dy = 4;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const sx = Math.min(w - 1, Math.max(0, Math.round(x * 0.97 + dx)));
      const sy = Math.min(h - 1, Math.max(0, Math.round(y * 0.97 + dy)));
      const i = (sy * w + sx) * 3;
      const glare = Math.max(0, 1 - Math.hypot(x - w * 0.7, y - h * 0.3) / 30) * 120;
      const o = (y * w + x) * 3;
      out[o] = Math.min(255, img.data[i] * 0.8 + 20 + glare);
      out[o + 1] = Math.min(255, img.data[i + 1] * 0.75 + glare);
      out[o + 2] = Math.min(255, img.data[i + 2] * 0.65 + glare);
    }
  return { data: out, width: w, height: h };
}

const dist = (a: ReturnType<typeof artPrint>, b: ReturnType<typeof artPrint>) =>
  artDistance(hamming(a.face, b.face), hamming(a.art, b.art), colorDistance(a.color, b.color));

describe('art fingerprint', () => {
  it('is 64 bits per hash and 60 colour values', () => {
    const p = artPrint(card(1));
    expect(p.face).toMatch(/^[01]{64}$/);
    expect(p.art).toMatch(/^[01]{64}$/);
    expect(p.color).toHaveLength(60);
  });

  it('keeps a photographed card close to its catalog image and far from other cards', () => {
    const scan = artPrint(card(3));
    const photo = artPrint(photographed(card(3)));
    const same = dist(scan, photo);
    const others = [5, 8, 11, 14, 17].map((s) => dist(artPrint(card(s)), photo));
    expect(same).toBeLessThan(Math.min(...others) - 10);
  });

  it('is the same at any input size', () => {
    const big = artPrint(card(4, 400, 560));
    const small = artPrint(card(4, 200, 280));
    expect(dist(big, small)).toBeLessThan(10);
  });

  it('trims a white margin round a catalog scan', () => {
    const c = card(2, 180, 252);
    const w = 200;
    const h = 280;
    const data = new Uint8Array(w * h * 3).fill(255);
    for (let y = 0; y < 252; y++) for (let x = 0; x < 180; x++) data.set((c.data as Uint8Array).subarray((y * 180 + x) * 3, (y * 180 + x) * 3 + 3), ((y + 14) * w + x + 10) * 3);
    const trimmed = trimMargin({ data, width: w, height: h });
    expect([trimmed.width, trimmed.height]).toEqual([180, 252]);
    expect(dist(artPrint(trimmed), artPrint(c))).toBeLessThan(4);
  });

  it('leaves an all-white image alone', () => {
    const white = { data: new Uint8Array(30 * 40 * 3).fill(255), width: 30, height: 40 };
    expect(trimMargin(white)).toBe(white);
  });

  it('resizes by area', () => {
    const img = { data: new Uint8Array([0, 0, 0, 255, 255, 255, 0, 0, 0, 255, 255, 255]), width: 2, height: 2 };
    expect([...resizeArea(img, 1, 1).data]).toEqual([128, 128, 128]);
    expect(pHash(card(1))).toHaveLength(64);
  });
});

describe('artMatch helpers', () => {
  it('decodes base64 and turns pixels round', () => {
    expect([...decodeBase64('AAEC/w==')]).toEqual([0, 1, 2, 255]);
    const img = { data: new Uint8Array([1, 2, 3, 4, 5, 6]), width: 2, height: 1 };
    expect([...rotate180(img).data]).toEqual([4, 5, 6, 1, 2, 3]);
  });

  it('finds an upside-down photo through the turned fingerprint', () => {
    const photo = card(6);
    const prints = [artPrint(rotate180(photo)), artPrint(photo)] as const;
    const catalog = artPrint(card(6));
    const row = {
      product_id: 1, game: 'pokemon' as const, language: 'en', name: 'Oshawott', number: '051', rarity: null, set_name: 'MEP', set_code: 'MEP',
      image_url: null, market_cents: 500, low_cents: null, color: catalog.color,
      d_face: hamming(catalog.face, prints[0].face), d_art: hamming(catalog.art, prints[0].art),
      d_face2: hamming(catalog.face, prints[1].face), d_art2: hamming(catalog.art, prints[1].art),
    };
    expect(rankArt([row], [prints[0], prints[1]])[0].distance).toBeLessThan(5);
  });
});

const cardOf = (id: number, name: string, number = '051', setCode = 'MEP'): CatalogCard => ({
  productId: id, game: 'pokemon', language: 'en', name, number, rarity: null, setName: setCode, setCode, imageUrl: null, marketCents: 100, lowCents: null,
});
const hit = (id: number, name: string, distance: number): ArtHit => ({ card: cardOf(id, name), distance });
const noRead: ParsedCard = { numbers: [], codes: [], language: null, words: new Set(), name: null };

describe('combine', () => {
  it('takes the art alone when it is close and nothing else is', () => {
    const id = combine([], { hits: [hit(1, 'Oshawott', 14), hit(2, 'Snivy', 58)], edge: true }, noRead);
    expect(id.confident).toBe(true);
    expect(id.byArt).toBe(true);
    expect(id.matches[0].card.productId).toBe(1);
  });

  it('asks when two cards share the art', () => {
    const id = combine([], { hits: [hit(1, 'Oshawott', 14), hit(2, 'Oshawott', 15), hit(3, 'Snivy', 60)], edge: true }, noRead);
    expect(id.confident).toBe(false);
    expect(id.matches.map((m) => m.card.productId)).toEqual([1, 2]);
  });

  it('is stricter without a card edge', () => {
    expect(combine([], { hits: [hit(1, 'Oshawott', 30), hit(2, 'Snivy', 60)], edge: false }, noRead).confident).toBe(false);
    expect(combine([], { hits: [hit(1, 'Oshawott', 30), hit(2, 'Snivy', 60)], edge: true }, noRead).confident).toBe(true);
  });

  it('lets a read name settle it and refuses art the name contradicts', () => {
    const read = artRead(['BASIC', 'Oshawott', 'Razor Shell'], () => 'Oshawott');
    const close = combine([], { hits: [hit(2, 'Snivy', 30), hit(1, 'Oshawott', 33)], edge: true }, read);
    expect(close.matches[0].card.name).toBe('Oshawott');
    expect(close.confident).toBe(true);
    const wrong = combine([], { hits: [hit(2, 'Snivy', 12)], edge: true }, { ...noRead, name: 'Oshawott', words: new Set(['OSHAWOTT']) });
    expect(wrong.confident).toBe(false);
  });

  it('never trusts art over a read number that found nothing', () => {
    const read: ParsedCard = { ...noRead, numbers: [{ num: '051', total: null, code: 'MEP' }] };
    expect(combine([], { hits: [hit(1, 'Oshawott', 10)], edge: true }, read).confident).toBe(false);
  });

  it('uses the art to order cards found by number', () => {
    const byNumber = [{ card: cardOf(1, 'Pikachu'), score: 3 }, { card: cardOf(2, 'Oshawott'), score: 3 }];
    const id = combine(byNumber, { hits: [hit(2, 'Oshawott', 12), hit(1, 'Pikachu', 50)], edge: true }, noRead);
    expect(id.matches[0].card.productId).toBe(2);
    expect(id.confident).toBe(true);
    expect(id.byArt).toBe(false);
  });

  it('keeps a remembered correction first', () => {
    const byNumber = [{ card: cardOf(1, 'Pikachu'), score: Infinity }, { card: cardOf(2, 'Oshawott'), score: 3 }];
    expect(combine(byNumber, { hits: [hit(2, 'Oshawott', 5)], edge: true }, noRead).matches[0].card.productId).toBe(1);
  });

  it('finds nothing without art', () => {
    expect(combine([], null, noRead)).toEqual({ matches: [], confident: false, byArt: true });
    expect(artBonus(undefined)).toBe(0);
    expect(artSure([], true)).toBe(false);
  });
});

describe('combine with a short bare number', () => {
  const read: ParsedCard = { numbers: [{ num: '6', total: null }], codes: [], language: null, words: new Set(), name: null };
  it('lets a sure art match overrule it', () => {
    const id = combine([{ card: cardOf(9, 'Pikachu', '6'), score: 3 }], { hits: [hit(1, 'Sylveon', 10), hit(2, 'Eevee', 50)], edge: true }, read);
    expect(id.matches[0].card.productId).toBe(1);
    expect(id.confident).toBe(true);
  });
  it('keeps the number when the art is unsure or agrees', () => {
    expect(combine([{ card: cardOf(9, 'Pikachu', '6'), score: 3 }], { hits: [hit(1, 'Sylveon', 40)], edge: true }, read).matches[0].card.productId).toBe(9);
    const full: ParsedCard = { ...read, numbers: [{ num: '6', total: '102' }] };
    expect(combine([{ card: cardOf(9, 'Pikachu', '6'), score: 3 }], { hits: [hit(1, 'Sylveon', 10)], edge: true }, full).matches[0].card.productId).toBe(9);
  });
});
