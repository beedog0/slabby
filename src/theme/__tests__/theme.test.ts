import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolveScheme } from '../theme';
import { dark, light } from '../tokens';

describe('resolveScheme', () => {
  it('follows the phone on System', () => {
    expect(resolveScheme('system', 'dark')).toBe('dark');
    expect(resolveScheme('system', 'light')).toBe('light');
    expect(resolveScheme('system', null)).toBe('light');
  });
  it('a picked mode wins over the phone', () => {
    expect(resolveScheme('light', 'dark')).toBe('light');
    expect(resolveScheme('dark', 'light')).toBe('dark');
  });
});

describe('palettes', () => {
  it('dark has every light token', () => {
    expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort());
  });
  it('slab colors are the grader’s, not the theme’s', () => {
    for (const k of ['psaRed', 'slabCase', 'slabLabel'] as const) expect(dark[k]).toBe(light[k]);
  });
  it('buttons invert: onInk is the page color', () => {
    expect(light.onInk).toBe(light.canvas);
    expect(dark.onInk).toBe(dark.canvas);
  });
});

// The static light palette is only for things that never change with the theme: the slab's own
// marks, the share image, the printed sell sheet, and the camera chrome. Everything else reads
// useColors() or themed(), so a new screen can't silently stay light.
it('only fixed-light files import the light palette directly', () => {
  const root = `${__dirname}/../../..`;
  // Regex in JS, not git grep: macOS git grep has no \b.
  const out = execSync('git ls-files -- app src', { cwd: root })
    .toString()
    .split('\n')
    .filter((f) => /\.tsx?$/.test(f) && !f.includes('__tests__'))
    .filter((f) => /import \{[^}]*\blight\b[^}]*\} from '[^']*theme\/tokens'/.test(readFileSync(`${root}/${f}`, 'utf8')))
    .sort();
  expect(out).toEqual([
    'app/scan.tsx',
    'src/components/PriceLine.tsx',
    'src/components/collection/PinMark.tsx',
    'src/components/profile/ProfileCode.tsx',
    'src/components/scan/ScanPills.tsx',
    'src/components/share/ProfileImage.tsx',
    'src/components/share/ShareCard.tsx',
    'src/components/share/ShelfImage.tsx',
    'src/services/sellSheet.ts',
  ]);
});
