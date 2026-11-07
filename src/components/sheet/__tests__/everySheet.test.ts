// Every bottom sheet in the app pulls down to dismiss from anywhere on it.
//
// sheetGesture.test.ts proves the shared gesture works when a drag starts on a row or a button.
// This file proves every sheet actually uses it, and finds new sheets on its own: anything drawn
// with the sheet's rounded top (radius.sheet) must be listed here, so a sheet can't ship without
// the pull-down again.

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../../..');
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8');

/** Every sheet, by where it lives. `count` = sheets drawn in that file. */
const SHEETS: { file: string; count: number; sheets: string[] }[] = [
  {
    file: 'src/components/menu/Menu.tsx',
    count: 1,
    sheets: [
      'Long-press slab menu (Put up for sale / Move to holds / Mark sold / Remove)',
      'Home … menu and every openMenu sheet',
      'Confirm sheets: sale, holds, sold, remove, remove several, Move… for a selection',
      'Con mode Buying menu and wishlist price',
      'Con mode status menu on a table row',
    ],
  },
  { file: 'src/components/con/TableSheet.tsx', count: 1, sheets: ['Con mode: Put on the table (list and Sold price step)'] },
  { file: 'app/search/index.tsx', count: 1, sheets: ['Card search: Filter'] },
  {
    file: 'app/scan.tsx',
    count: 2,
    sheets: [
      'Scan result for a slab (add, sell ask, sold for, duplicate cert, couldn’t read the grade)',
      'Raw card: Which card is it?, Which print is it?, the match with Print / Plan / sell ask',
    ],
  },
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of fs.readdirSync(path.join(ROOT, dir))) {
    const rel = path.join(dir, name);
    if (name === '__tests__' || name === 'node_modules') continue;
    if (fs.statSync(path.join(ROOT, rel)).isDirectory()) walk(rel, out);
    else if (/\.tsx?$/.test(name)) out.push(rel);
  }
  return out;
}

/** Each sheet's opening tag: from the `<` before the grabber back to the grabber itself. */
function sheetOpenings(src: string): string[] {
  const out: string[] = [];
  const grabber = /<View style=\{styles\.grabber\} \/>/g;
  let m: RegExpExecArray | null;
  while ((m = grabber.exec(src))) {
    const before = src.slice(0, m.index);
    const tagStart = Math.max(before.lastIndexOf('<Animated.View'), before.lastIndexOf('<View\n'), before.lastIndexOf('<View style'));
    out.push(src.slice(tagStart, m.index));
  }
  return out;
}

describe('every bottom sheet', () => {
  it('is listed here (new sheets are found by their rounded top)', () => {
    const found = walk('app')
      .concat(walk('src'))
      .filter((f) => /radius\.sheet\b/.test(read(f)) && !f.endsWith('tokens.ts'))
      .sort();
    expect(found).toEqual(SHEETS.map((s) => s.file).sort());
  });

  for (const s of SHEETS) {
    describe(s.sheets.join(' · '), () => {
      const src = read(s.file);
      const openings = sheetOpenings(src);

      it(`draws ${s.count} sheet${s.count > 1 ? 's' : ''}`, () => {
        expect(openings).toHaveLength(s.count);
      });

      it('uses the shared pull-down (useSheetDrag)', () => {
        expect(src).toMatch(/useSheetDrag\(/);
        // No home-made pan responder: those only listened on the bare header.
        expect(src).not.toMatch(/PanResponder\.create/);
      });

      it('puts the pull-down on the whole sheet, not just the header', () => {
        for (const open of openings) {
          // The handlers sit on the sheet's own outermost view, so every row inside is covered.
          expect(open).toMatch(/\{\.\.\.\w+\.panHandlers\}/);
          // And the sheet follows the finger: its translateY includes the pull.
          expect(open).toMatch(/translateY/);
        }
        expect(src).toMatch(/sheet\.drag\b/);
      });

      it('lets scroll views inside report to the sheet (SheetScope + SheetScrollView)', () => {
        expect(src).toMatch(/<SheetScope value=\{\w+\.scope\}>/);
        // A plain vertical ScrollView bounces at the top and eats the pull.
        const plain = [...src.matchAll(/<ScrollView\b[^>]*>/g)].map((m) => m[0]).filter((tag) => !/\bhorizontal\b/.test(tag));
        expect(plain).toEqual([]);
      });
    });
  }
});
