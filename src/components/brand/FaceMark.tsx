// The Slabby mark: a slab with a label strip and a face in the card window.
// Same drawing as assets/brand/slabby-mark.svg (the app icon). Used only where
// there is no real slab to show, so it never reads as a fake slab next to real ones.

import Svg, { Path, Rect } from 'react-native-svg';
import { useColors } from '../../theme/theme';

// The mark's own box inside the 1024 icon grid.
const X = 292;
const Y = 132;
const W = 440;
const H = 760;

export function FaceMark({ height, tint, face }: { height: number; tint?: string; face?: string }) {
  // Ink on canvas, so it flips with the theme like the rest of the app.
  const color = useColors();
  tint ??= color.ink;
  face ??= color.canvas;
  return (
    <Svg width={(height * W) / H} height={height} viewBox={`${X} ${Y} ${W} ${H}`} accessibilityLabel="Slabby">
      <Rect x={292} y={132} width={440} height={760} rx={52} fill={tint} />
      <Rect x={334} y={174} width={356} height={128} rx={18} fill={face} />
      <Rect x={410} y={470} width={58} height={124} rx={29} fill={face} />
      <Rect x={556} y={470} width={58} height={124} rx={29} fill={face} />
      <Path d="M 438 690 Q 512 748 586 690" fill="none" stroke={face} strokeWidth={30} strokeLinecap="round" />
    </Svg>
  );
}
