// Your profile code: a QR of your profile link, for adding friends face to face at a con. The
// other person points Slabby's Scan at it. Drawn as one SVG path, ink on the page, no logo in it.

import qrcode from 'qrcode-generator';
import { useMemo } from 'react';
import { Share, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { profileLink } from '../../profile/publicProfile';
import { light, space, type } from '../../theme/tokens';
import { useColors } from '../../theme/theme';
import { openMenu } from '../menu/Menu';

/** The dark modules of a QR for `text`, as an SVG path on a 1-unit grid, and the grid's size. */
export function qrPath(text: string): { d: string; n: number } {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  let d = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
  }
  return { d, n };
}

export function ProfileCode({ text, px }: { text: string; px: number }) {
  const { d, n } = useMemo(() => qrPath(text), [text]);
  const quiet = 2; // modules of margin, so it scans off a dark phone edge
  const total = n + quiet * 2;
  return (
    <Svg width={px} height={px} viewBox={`${-quiet} ${-quiet} ${total} ${total}`} accessibilityLabel="Profile code">
      {/* Always dark on light, even in dark mode: inverted codes scan poorly on older cameras. */}
      <Rect x={-quiet} y={-quiet} width={total} height={total} fill={light.canvas} rx={1} />
      <Path d={d} fill={light.ink} />
    </Svg>
  );
}

/** The sheet with your profile code, big enough to scan across a table. */
export function openProfileCode(handle: string, name: string) {
  openMenu({
    title: name || `@${handle}`,
    subtitle: `@${handle}`,
    body: <CodeBody handle={handle} />,
    items: [{ label: 'Share link', onPress: () => Share.share({ message: profileLink(handle) }).catch(() => {}) }],
  });
}

function CodeBody({ handle }: { handle: string }) {
  const color = useColors();
  return (
    <View style={{ alignItems: 'center', paddingVertical: space.xl, gap: space.l }}>
      <ProfileCode text={profileLink(handle)} px={220} />
      <Text style={[type.secondary, { color: color.secondary, textAlign: 'center' }]}>Scan with Slabby to add each other</Text>
    </View>
  );
}

