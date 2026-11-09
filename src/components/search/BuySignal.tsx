// Buy signal on the card page: a Buy · Fair · Hold off dial for the picked grade, the read in
// words, what drove it, and one row per factor. Math lives in src/pricing/buySignal.ts; this only
// draws it. Hidden entirely when there isn't enough real data (buySignal returns null).

import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { verdictWord, type BuySignal as Signal } from '../../pricing/buySignal';
import { color, dial, signal, space, type } from '../../theme/tokens';
import { Hairline } from '../ui';
import { Section } from './CardInsights';

const GAP = 0.012; // gap between the three bands, as a share of the half circle
const cx = dial.w / 2;
const cy = dial.r + dial.stroke / 2 + 4;

/** Point on the half circle: f = 0 is the Buy end (left), 1 the Hold off end (right). */
function at(f: number, r: number) {
  const t = f * Math.PI;
  return { x: cx - r * Math.cos(t), y: cy - r * Math.sin(t) };
}

function arc(f1: number, f2: number) {
  const a = at(f1, dial.r);
  const b = at(f2, dial.r);
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${dial.r} ${dial.r} 0 0 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

/**
 * With no read (`s` null), the dial still shows, faded and without a needle, with `gap` saying
 * what's missing, so a card with a price never just loses the section.
 */
export function BuySignalDial({ signal: s, gap, graded = true }: { signal: Signal | null; gap?: string; graded?: boolean }) {
  const tint = signal.light;
  const tip = s ? at(s.needle, dial.r - dial.stroke - 6) : null;
  const word = s ? verdictWord[s.verdict] : graded ? 'Not enough sales' : 'Not enough history';
  const because = s ? s.because : (gap ?? '');
  return (
    <Section title="Buy signal" note="For buying at today’s market price">
      <View style={styles.dial} accessible accessibilityLabel={`Buy signal: ${word}. ${because}`}>
        <Svg opacity={s ? 1 : 0.45} width={dial.w} height={dial.h} viewBox={`0 0 ${dial.w} ${dial.h}`}>
          <Path d={arc(0, 1 / 3 - GAP)} stroke={tint.buy} strokeWidth={dial.stroke} strokeLinecap="round" fill="none" />
          <Path d={arc(1 / 3 + GAP, 2 / 3 - GAP)} stroke={tint.fair} strokeWidth={dial.stroke} fill="none" />
          <Path d={arc(2 / 3 + GAP, 1)} stroke={tint.hold} strokeWidth={dial.stroke} strokeLinecap="round" fill="none" />
          {tip ? <Line x1={cx} y1={cy} x2={tip.x} y2={tip.y} stroke={color.ink} strokeWidth={3} strokeLinecap="round" /> : null}
          {tip ? <Circle cx={cx} cy={cy} r={7} fill={color.ink} /> : null}
          <SvgText x={cx - dial.r - dial.stroke / 2} y={dial.h} fontSize={12} fill={color.secondary}>
            Buy
          </SvgText>
          <SvgText x={cx + dial.r + dial.stroke / 2} y={dial.h} fontSize={12} fill={color.secondary} textAnchor="end">
            Hold off
          </SvgText>
        </Svg>
      </View>
      <Text style={[type.section, styles.verdict, { color: s ? color.ink : color.secondary }]}>{word}</Text>
      <Text style={[type.text, { color: color.secondary, textAlign: 'center', paddingTop: space.xs }]}>{because}</Text>
      {s ? (
        <View style={{ paddingTop: space.l }}>
          {s.factors.map((f) => (
            <View key={f.key}>
              <Hairline />
              <View style={styles.row} accessible accessibilityLabel={`${f.label}, ${f.word}, ${f.detail}`}>
                <View style={styles.line}>
                  <Text style={[type.text, { color: color.ink, flexShrink: 1 }]}>{f.label}</Text>
                  <Text
                    style={[
                      type.text,
                      {
                        color: color.ink,
                        fontWeight: '600',
                        textAlign: 'right',
                        flexShrink: 1,
                      },
                    ]}
                  >
                    {f.word}
                  </Text>
                </View>
                <Text style={[type.secondary, { color: color.secondary }]}>{f.detail}</Text>
              </View>
            </View>
          ))}
          <Hairline />
        </View>
      ) : null}
    </Section>
  );
}

const styles = StyleSheet.create({
  dial: { alignItems: 'center', paddingTop: space.s },
  verdict: { textAlign: 'center', paddingTop: space.s },
  row: { paddingVertical: space.m, gap: 2 },
  line: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: space.m,
  },
});
