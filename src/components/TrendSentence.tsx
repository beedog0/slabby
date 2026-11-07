// The trend sentence ("Up 21% on 62 sales"), always one line: the percent in gain/loss, the rest
// secondary. Copy comes from pricing/trend.ts.

import { Text, type TextStyle } from 'react-native';
import type { Part } from '../pricing/trend';
import { type } from '../theme/tokens';
import { useColors } from '../theme/theme';

export function TrendSentence({ parts, style }: { parts: Part[]; style?: TextStyle }) {
  const color = useColors();
  return (
    <Text numberOfLines={1} style={[type.text, { color: color.secondary }, style]}>
      {parts.map((p, i) => (
        <Text key={i} style={p.tone === 'gain' ? { color: color.gain } : p.tone === 'loss' ? { color: color.loss } : undefined}>
          {p.text}
        </Text>
      ))}
    </Text>
  );
}
