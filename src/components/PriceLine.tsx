// The price line: a 2 px rule with ticks, a filled span, and a dot. Used at the same size on
// Slab detail, Before the table, and Offer. See DESIGN.md "The price line".

import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { color, type } from '../theme/tokens';

export type Tick = {
  value: number;
  label?: string;
  /** Tick color; label uses labelColor or secondary. */
  color: string;
  labelColor?: string;
  height?: number;
};

type Props = {
  ticks: Tick[];
  /** Filled span [from, to]. */
  fill?: { from: number; to: number; color: string };
  dot?: { value: number; color: string };
};

const RULE = 2;
const DOT = 14;
const TRACK_H = 16;
const LABEL_W = 92;
const CHAR_W = 7; // rough width per caption character, for overlap culling

/** Position as 0..1 across the domain spanned by every value on the line. */
export function scale(values: number[]) {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  return (v: number) => Math.min(1, Math.max(0, (v - lo) / span));
}

export function PriceLine({ ticks, fill, dot }: Props) {
  const [w, setW] = useState(0);
  const all = [...ticks.map((t) => t.value), ...(dot ? [dot.value] : []), ...(fill ? [fill.from, fill.to] : [])];
  const pos = scale(all);
  const x = (v: number) => pos(v) * w;

  // Drop labels that would collide with the previous visible one (left to right).
  const sorted = [...ticks].sort((a, b) => a.value - b.value);
  let lastRight = -Infinity;
  const visible = new Set<Tick>();
  for (const t of sorted) {
    if (!t.label) continue;
    const half = (t.label.length * CHAR_W) / 2;
    const left = Math.max(0, Math.min(w - half * 2, x(t.value) - half));
    if (left >= lastRight + 6) {
      visible.add(t);
      lastRight = left + half * 2;
    }
  }

  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height: TRACK_H + 28 }}>
      {w > 0 ? (
        <>
          <View style={[styles.rule, { width: w }]} />
          {fill ? (
            <View
              style={[
                styles.rule,
                { left: Math.min(x(fill.from), x(fill.to)), width: Math.abs(x(fill.to) - x(fill.from)), backgroundColor: fill.color },
              ]}
            />
          ) : null}
          {ticks.map((t, i) => {
            const h = t.height ?? 10;
            return (
              <View
                key={`t${i}`}
                style={{ position: 'absolute', width: 2, height: h, top: (TRACK_H - h) / 2, left: Math.min(w - 2, Math.max(0, x(t.value) - 1)), backgroundColor: t.color }}
              />
            );
          })}
          {dot ? (
            <View
              style={{
                position: 'absolute',
                width: DOT,
                height: DOT,
                borderRadius: DOT / 2,
                top: (TRACK_H - DOT) / 2,
                left: Math.min(w - DOT, Math.max(0, x(dot.value) - DOT / 2)),
                backgroundColor: dot.color,
              }}
            />
          ) : null}
          {ticks.map((t, i) => {
            if (!visible.has(t)) return null;
            const cx = x(t.value);
            const atLeft = cx < LABEL_W / 2;
            const atRight = cx > w - LABEL_W / 2;
            const left = atLeft ? 0 : atRight ? w - LABEL_W : cx - LABEL_W / 2;
            return (
              <Text
                key={`l${i}`}
                numberOfLines={1}
                style={[
                  type.caption,
                  styles.label,
                  { left, textAlign: atLeft ? 'left' : atRight ? 'right' : 'center', color: t.labelColor ?? color.secondary },
                ]}
              >
                {t.label}
              </Text>
            );
          })}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  rule: { position: 'absolute', height: RULE, top: (TRACK_H - RULE) / 2, backgroundColor: color.hairline },
  label: { position: 'absolute', top: TRACK_H + 8, width: LABEL_W },
});
