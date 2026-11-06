// The trend sentence ("Up 8% in 30 days on 14 sales"): the percent in gain/loss, the rest
// secondary. Copy comes from pricing/trend.ts.

import { Text, type TextStyle } from 'react-native';
import type { Part } from '../pricing/trend';
import { color, type } from '../theme/tokens';

export function TrendSentence({ parts, style }: { parts: Part[]; style?: TextStyle }) {
  return (
    <Text style={[type.text, { color: color.secondary }, style]}>
      {parts.map((p, i) => (
        <Text key={i} style={p.tone === 'gain' ? { color: color.gain } : p.tone === 'loss' ? { color: color.loss } : undefined}>
          {p.text}
        </Text>
      ))}
    </Text>
  );
}
