// Price chart: one calm, smooth, full-width line with a dot on today. On the card page the paid
// price is a dashed line labeled "paid $650" (only when it is near the line's range), with start and end dates underneath; on home
// (compact) it sits over one hairline baseline. No gridlines, no price gutter, no extra markers.
// Press and hold anywhere to read that day's price and date.
// Reference: 03-slab-detail.png.

import { useMemo, useRef, useState } from 'react';
import { PanResponder, Text, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { money } from '../lib/format';
import { color, type } from '../theme/tokens';

type Props = {
  values: number[];
  paidCents: number | null;
  width: number;
  height?: number;
  /** Line and dot color: green when the window is up, red when down. */
  tint?: string;
  /** Date of the last value (YYYY-MM-DD). Values are one per day ending there. */
  asOf?: string;
  /** Smaller type, no paid label: for the home value line. */
  compact?: boolean;
  /** Hand the pressed price and date to the parent (home shows them in its big number) instead of
   * drawing the readout above the plot. Called with null on release. */
  onScrub?: (point: { cents: number; date?: string } | null) => void;
};

const PAD = 8;
const READOUT_H = 20; // scrub price and date, one line above the plot
const DATES_H = 18;
/** Never zoom in past this share of the value, so a quiet month draws a quiet line. */
const MIN_SPAN = 0.04;

const shortDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const dayBefore = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

/** Value range to draw, widened around its middle to at least `minShare` of the high, so a quiet
 * stretch draws a quiet line instead of zooming a few dollars up to full height. */
export function chartRange(vals: number[], minShare = MIN_SPAN): { lo: number; hi: number } {
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  const minSpan = Math.abs(hi) * minShare;
  if (hi - lo < minSpan) {
    const mid = (hi + lo) / 2;
    lo = mid - minSpan / 2;
    hi = mid + minSpan / 2;
  }
  return { lo, hi };
}

/** Whether the paid price earns a dashed line: only when it sits in or near the drawn range. Far
 * outside it would squash the line flat to make room; the header already says what was paid. */
export function paidOnChart(vals: number[], paidCents: number | null): boolean {
  if (paidCents == null || vals.length < 2) return false;
  const { lo, hi } = chartRange(vals);
  const reach = (hi - lo) * 0.5;
  return paidCents >= lo - reach && paidCents <= hi + reach;
}

/** Day index under a finger `px` points from the chart's left edge, on a plot `plotW` wide with `n` days. */
export function indexAtX(px: number, plotW: number, n: number): number {
  if (n <= 1) return 0;
  return Math.max(0, Math.min(n - 1, Math.round(((px - PAD) / Math.max(1, plotW - PAD * 2)) * (n - 1))));
}

/** Monotone cubic path through the points: smooth, and never overshoots a high or low. */
export function smoothPath(pts: [number, number][]): string {
  const n = pts.length;
  const f = (v: number) => v.toFixed(1);
  if (n < 3) return pts.map(([px, py], i) => `${i ? 'L' : 'M'}${f(px)} ${f(py)}`).join(' ');
  const dx = pts.slice(1).map(([px], i) => px - pts[i][0] || 1);
  const sl = pts.slice(1).map(([, py], i) => (py - pts[i][1]) / dx[i]);
  const m = pts.map((_, i) => {
    if (i === 0) return sl[0];
    if (i === n - 1) return sl[n - 2];
    const a = sl[i - 1];
    const b = sl[i];
    return a * b <= 0 ? 0 : (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / a + (dx[i] + 2 * dx[i - 1]) / b);
  });
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const h = dx[i] / 3;
    d += ` C${f(x0 + h)} ${f(y0 + m[i] * h)} ${f(x1 - h)} ${f(y1 - m[i + 1] * h)} ${f(x1)} ${f(y1)}`;
  }
  return d;
}

/** Centered moving average (5 days on a month, about 11 on 90 days, so a longer window doesn't
 * read as noise); the last point stays the real latest value. */
export function ease(vals: number[]): number[] {
  const r = Math.max(2, Math.round(vals.length / 18));
  const out = vals.map((_, i) => {
    const w = vals.slice(Math.max(0, i - r), i + r + 1);
    return w.reduce((a, b) => a + b, 0) / w.length;
  });
  if (out.length) out[out.length - 1] = vals[vals.length - 1];
  return out;
}

export function PriceChart({ values: raw, paidCents, width, height = 160, tint = color.ink, asOf, compact = false, onScrub }: Props) {
  // A gently eased line (moving average, today exact) so daily noise doesn't zigzag.
  const values = useMemo(() => ease(raw), [raw]);
  const [scrub, setScrub] = useState<number | null>(null); // index into raw
  const plotW = width;
  const plotH = height - (asOf ? DATES_H : 0);
  const showPaid = !compact && paidOnChart(raw, paidCents);

  const geo = useMemo(() => {
    const { lo, hi } = chartRange(showPaid ? [...raw, paidCents as number] : raw);
    const span = hi - lo || 1;
    // Inset both ends so the line's round cap, the today dot and the scrub ring never clip.
    const x = (i: number, n: number) => PAD + (n <= 1 ? 0 : (i / (n - 1)) * (plotW - PAD * 2));
    // On the card page, keep the top clear for the scrub readout so it never sits on the line.
    const top = compact ? PAD : READOUT_H + PAD;
    const y = (v: number) => top + (1 - (v - lo) / span) * (plotH - top - PAD);
    return { x, y };
  }, [raw, paidCents, showPaid, plotW, plotH, compact]);

  // The responder is made once, so everything it reads lives in refs that track the latest render.
  // The finger's x comes from pageX minus the chart's own left edge (taken on touch down), never from
  // locationX: locationX is measured from whichever child is under the finger, so pressing on a label
  // near the right edge used to read as a point near the left.
  const live = useRef({ raw, plotW, onScrub, asOf });
  live.current = { raw, plotW, onScrub, asOf };
  const originX = useRef(0);
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        const { pageX, locationX } = e.nativeEvent;
        // Every child is pointerEvents="none", so on touch down the target is this view and
        // locationX is measured from its own left edge.
        originX.current = pageX - locationX;
        scrubAt(pageX);
      },
      onPanResponderMove: (e) => scrubAt(e.nativeEvent.pageX),
      onPanResponderRelease: () => scrubTo(null),
      onPanResponderTerminate: () => scrubTo(null),
    }),
  ).current;
  function scrubAt(pageX: number) {
    const { raw: vals, plotW: w } = live.current;
    scrubTo(indexAtX(pageX - originX.current, w, vals.length));
  }
  function scrubTo(i: number | null) {
    setScrub(i);
    const { onScrub: out, asOf: end, raw: vals } = live.current;
    if (!out) return;
    out(i == null ? null : { cents: vals[i], date: end ? shortDate(dayBefore(end, vals.length - 1 - i)) : undefined });
  }

  if (values.length < 2) {
    return (
      <View style={{ height: compact ? 0 : height, justifyContent: 'center' }}>
        {compact ? null : <Text style={[type.text, { color: color.secondary }]}>Not enough sales yet to draw a chart.</Text>}
      </View>
    );
  }

  const { x, y } = geo;
  const n = values.length;
  const d = smoothPath(values.map((v, i) => [x(i, n), y(v)]));
  const last = raw[raw.length - 1];
  const paidY = showPaid ? y(paidCents as number) : null;
  const labelStyle = [type.secondary, { color: color.secondary, fontSize: compact ? 11 : 12 }];

  // "paid $650" sits right-aligned just above its dashed line, or just below when the line is near the top.
  const PAID_LABEL_H = 16;
  const paidTop = paidY == null ? 0 : paidY - PAID_LABEL_H - 2 >= 0 ? paidY - PAID_LABEL_H - 2 : paidY + 3;

  const s = scrub;
  return (
    <View style={{ width, height }} {...pan.panHandlers} accessibilityLabel={`Price chart, now ${money(last)}`}>
      {/* Nothing inside takes touches, so the chart itself always receives them. */}
      <View pointerEvents="none" style={{ width, height }}>
        <Svg width={width} height={plotH}>
          {compact ? <Line x1={0} x2={width} y1={plotH - 0.5} y2={plotH - 0.5} stroke={color.hairline} strokeWidth={1} /> : null}
          {paidY != null ? (
            <Line x1={0} x2={plotW} y1={paidY} y2={paidY} stroke={color.secondary} strokeOpacity={0.5} strokeWidth={1.25} strokeDasharray="3 5" />
          ) : null}
          <Path d={d} stroke={tint} strokeWidth={compact ? 1.75 : 2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <Circle cx={x(n - 1, n)} cy={y(values[n - 1])} r={compact ? 3.5 : 5} fill={tint} />
          {s != null ? (
            <>
              <Line x1={x(s, n)} x2={x(s, n)} y1={onScrub ? 0 : READOUT_H} y2={plotH} stroke={color.secondary} strokeWidth={1} />
              <Circle cx={x(s, n)} cy={y(values[s])} r={compact ? 4 : 5} fill={color.canvas} stroke={tint} strokeWidth={2} />
            </>
          ) : null}
        </Svg>

        {paidY != null && s == null ? (
          <Text style={[labelStyle, { position: 'absolute', right: PAD, top: paidTop, fontVariant: ['tabular-nums'] }]}>
            paid {money(paidCents as number)}
          </Text>
        ) : null}

        {/* Scrub readout: price and date on one line above the plot, so they can't stack into each other. */}
        {s != null && !onScrub ? (
          <View style={{ position: 'absolute', top: 0, height: READOUT_H, left: Math.max(0, Math.min(plotW - 160, x(s, n) - 80)), width: 160, flexDirection: 'row', justifyContent: 'center', alignItems: 'baseline', gap: 6 }}>
            <Text numberOfLines={1} style={[type.text, { color: color.ink, fontWeight: '600', fontVariant: ['tabular-nums'] }]}>{money(raw[s])}</Text>
            {asOf ? <Text numberOfLines={1} style={labelStyle}>{shortDate(dayBefore(asOf, raw.length - 1 - s))}</Text> : null}
          </View>
        ) : null}

        {asOf ? (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: plotW, height: DATES_H, alignItems: 'flex-end' }}>
            <Text style={labelStyle}>{shortDate(dayBefore(asOf, raw.length - 1))}</Text>
            <Text style={labelStyle}>{shortDate(asOf)}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
