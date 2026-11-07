// The live palette. Light by default; dark when the phone is dark (or the user picked Dark).
//
// Components call useColors() for inline colors, and build their StyleSheet with themed(), which
// makes one sheet per palette and hands back a hook:
//
//   const useStyles = themed((color) => StyleSheet.create({ page: { backgroundColor: color.canvas } }));
//   function Screen() { const styles = useStyles(); ... }

import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { Appearance, useColorScheme } from 'react-native';
import { useAppearance, type AppearanceMode } from '../store/appearance';
import { dark, light, type Palette } from './tokens';

export type Scheme = 'light' | 'dark';

/** Pure: what the screen shows for a picked mode and the phone's own setting. */
export function resolveScheme(mode: AppearanceMode, system: string | null | undefined): Scheme {
  if (mode === 'light' || mode === 'dark') return mode;
  return system === 'dark' ? 'dark' : 'light';
}

export const palettes: Record<Scheme, Palette> = { light, dark };

/** Pins a subtree to one palette, e.g. the share card image, which is always light. */
const Forced = createContext<Palette | null>(null);

export function PaletteScope({ palette, children }: { palette: Palette; children: ReactNode }) {
  return <Forced.Provider value={palette}>{children}</Forced.Provider>;
}

export function useScheme(): Scheme {
  const mode = useAppearance((s) => s.mode);
  const system = useColorScheme();
  return resolveScheme(mode, system);
}

export function useColors(): Palette {
  const forced = useContext(Forced);
  const scheme = useScheme();
  return forced ?? palettes[scheme];
}

/** A StyleSheet per palette, built once each, read with the returned hook. */
export function themed<T>(build: (color: Palette) => T): () => T {
  const cache = new Map<Palette, T>();
  return function useThemed() {
    const c = useColors();
    let s = cache.get(c);
    if (!s) {
      s = build(c);
      cache.set(c, s);
    }
    return s;
  };
}

/**
 * Keeps iOS's own chrome (keyboard, text selection, system sheets) in step with the picked mode.
 * Mounted once in the root layout.
 */
export function useNativeAppearance() {
  const mode = useAppearance((s) => s.mode);
  useEffect(() => {
    try {
      Appearance.setColorScheme?.(mode === 'system' ? 'unspecified' : mode);
    } catch {
      // Web and older runtimes have no override; the palette still follows the picked mode.
    }
  }, [mode]);
}
