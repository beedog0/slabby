// The price line: a 2 px rule with ticks, a filled span, and a dot. Used at the same size on
// Slab detail, Before the table, and Offer. See DESIGN.md "The price line".
//
// Every marker carries its name and its price ("Floor" over "$130"). Labels sit under the
// line; when two would touch, the later one moves above the line instead of being dropped,
// and markers at the same price share one label ("Paid · Floor").

import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { money } from '../lib/format';
import { color, type } from '../theme/tokens';

export type Tick = {
  value: number;
  /** Marker name, e.g. "Floor". Leave out for a tick with no label. */
  label?: string;
  /** Show the price under the name. Defaults to true when there is a label. */
  showPrice?: boolean;
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
const LINE_H = 16; // caption line height
const LANE_H = LINE_H * 2; // name + price
const LANE_GAP = 6; // between the track and a lane
const LABEL_GAP = 10; // minimum space between two labels in a lane
const CHAR_W = 7; // rough width per caption character (tabular digits are ~7 pt at 12 pt)
const SAME_PX = 3; // markers closer than this share a label

/** Position as 0..1 across the domain spanned by every value on the line. */
export function scale(values: number[]) {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  return (v: number) => Math.min(1, Math.max(0, (v - lo) / span));
}

export type Placed = {
  key: string;
  names: { text: string; color: string }[];
  price: string | null;
  priceColor: string;
  left: number;
  width: number;
  align: 'left' | 'center' | 'right';
  lane: 'below' | 'above';
};

/**
 * Lay out marker labels on a line `w` wide. Pure, so it can be tested.
 * Left to right: merge markers at the same spot, then put each label under the line if it
 * clears the previous one there, else above the line, else under it nudged right.
 */
export function layoutLabels(ticks: Tick[], x: (v: number) => number, w: number): Placed[] {
  const labelled = ticks.filter((t) => t.label).sort((a, b) => a.value - b.value);

  // Merge markers that land on the same spot.
  const groups: Tick[][] = [];
  for (const t of labelled) {
    const g = groups[groups.length - 1];
    if (g && Math.abs(x(t.value) - x(g[0].value)) < SAME_PX) g.push(t);
    else groups.push([t]);
  }

  const lastRight = { below: -Infinity, above: -Infinity };
  return groups.map((g, i) => {
    const names = g.map((t) => ({ text: t.label!, color: t.labelColor ?? color.secondary }));
    const priced = g.find((t) => t.showPrice !== false);
    // Markers on the same spot show one price (the first; they are within a pixel or two).
    const price = priced ? money(priced.value) : null;
    const priceColor = g.find((t) => t.labelColor && t.labelColor !== color.secondary)?.labelColor ?? color.ink;
    const nameChars = names.reduce((n, s) => n + s.text.length, 0) + (names.length - 1) * 3;
    const width = Math.ceil(Math.max(nameChars, price?.length ?? 0) * CHAR_W);

    const cx = x(g[0].value);
    const want = Math.max(0, Math.min(w - width, cx - width / 2));
    let lane: 'below' | 'above';
    let left = want;
    if (want >= lastRight.below + LABEL_GAP) lane = 'below';
    else if (want >= lastRight.above + LABEL_GAP) lane = 'above';
    else {
      lane = 'below';
      left = Math.min(w - width, lastRight.below + LABEL_GAP);
    }
    lastRight[lane] = left + width;
    const align = left <= 0 ? 'left' : left >= w - width ? 'right' : 'center';
    return { key: `g${i}`, names, price, priceColor, left, width, align, lane };
  });
}

export function PriceLine({ ticks, fill, dot }: Props) {
  const [w, setW] = useState(0);
  const all = [...ticks.map((t) => t.value), ...(dot ? [dot.value] : []), ...(fill ? [fill.from, fill.to] : [])];
  const pos = scale(all);
  const x = (v: number) => pos(v) * w;

  const labels = w > 0 ? layoutLabels(ticks, x, w) : [];
  const above = labels.some((l) => l.lane === 'above');
  const top = above ? LANE_H + LANE_GAP : 0; // where the track starts

  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height: top + TRACK_H + LANE_GAP + LANE_H }}>
      {w > 0 ? (
        <>
          <View style={[styles.rule, { top: top + (TRACK_H - RULE) / 2, width: w }]} />
          {fill ? (
            <View
              style={[
                styles.rule,
                {
                  top: top + (TRACK_H - RULE) / 2,
                  left: Math.min(x(fill.from), x(fill.to)),
                  width: Math.abs(x(fill.to) - x(fill.from)),
                  backgroundColor: fill.color,
                },
              ]}
            />
          ) : null}
          {ticks.map((t, i) => {
            const h = t.height ?? 10;
            return (
              <View
                key={`t${i}`}
                style={{
                  position: 'absolute',
                  width: 2,
                  height: h,
                  top: top + (TRACK_H - h) / 2,
                  left: Math.min(w - 2, Math.max(0, x(t.value) - 1)),
                  backgroundColor: t.color,
                }}
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
                top: top + (TRACK_H - DOT) / 2,
                left: Math.min(w - DOT, Math.max(0, x(dot.value) - DOT / 2)),
                backgroundColor: dot.color,
              }}
            />
          ) : null}
          {labels.map((l) => {
            // Give the text room past the estimate, keeping it anchored where it was placed.
            const pad = 12;
            const boxW = l.width + pad * 2;
            const boxLeft = l.align === 'left' ? l.left : l.align === 'right' ? l.left + l.width - boxW : l.left - pad;
            return (
              <View
                key={l.key}
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: boxLeft,
                  width: boxW,
                  top: l.lane === 'below' ? top + TRACK_H + LANE_GAP : 0,
                }}
              >
                <Text numberOfLines={1} style={[type.caption, styles.line, { textAlign: l.align }]}>
                  {l.names.map((n, j) => (
                    <Text key={j} style={{ color: n.color }}>
                      {j ? ' · ' : ''}
                      {n.text}
                    </Text>
                  ))}
                </Text>
                {l.price ? (
                  <Text numberOfLines={1} style={[type.caption, styles.line, styles.price, { textAlign: l.align, color: l.priceColor }]}>
                    {l.price}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  rule: { position: 'absolute', height: RULE, backgroundColor: color.hairline },
  line: { lineHeight: LINE_H },
  price: { fontWeight: '600' },
});
