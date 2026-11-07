// Dark mode only: a soft pool of light behind a hero slab or single, as if it stood in a lit
// display case, so a white case doesn't read as a flat photo on black. Drawn behind the object,
// never over it. Light mode returns nothing: the page is already white.

import { memo } from 'react';
import { View } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import { useIsDark } from '../../theme/theme';

/** Peak brightness and color of the pool (a warm display-case bulb), and how far past the object it spreads. */
export const SPOTLIGHT = { color: '#FFD27A', opacity: 0.16, spreadX: 1.9, spreadY: 1.12 } as const;

export const Spotlight = memo(function Spotlight({ width, height }: { width: number; height: number }) {
  const dark = useIsDark();
  if (!dark) return null;
  const w = width * SPOTLIGHT.spreadX;
  const h = height * SPOTLIGHT.spreadY;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: (width - w) / 2, top: (height - h) / 2, width: w, height: h }}>
      <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        <Defs>
          <RadialGradient id="spot" cx="50" cy="50" rx="50" ry="50" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={SPOTLIGHT.color} stopOpacity={SPOTLIGHT.opacity} />
            <Stop offset="0.45" stopColor={SPOTLIGHT.color} stopOpacity={SPOTLIGHT.opacity * 0.45} />
            <Stop offset="1" stopColor={SPOTLIGHT.color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx="50" cy="50" rx="50" ry="50" fill="url(#spot)" />
      </Svg>
    </View>
  );
});
