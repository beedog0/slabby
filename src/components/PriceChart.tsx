// Price chart: the line stays clean, with light reference points. Two faint gridlines labeled on
// the right, the high and low marked on the line, the paid price as a dashed line, the start and
// end dates underneath, and a dot on today. Press and drag to read any day's price.
// Reference: 03-slab-detail.png. Also used small on home (compact).

import { useMemo, useRef, useState } from 'react';
import { PanResponder, Text, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { money } from '../lib/format';
import { color, type } from '../theme/tokens';
import { downsample } from './Sparkline';

type Props = {
  values: number[];
  paidCents: number | null;
  width: number;
  height?: number;
  /** Line and dot color: green when the window is up, red when down. */
  tint?: string;
  /** Date of the last value (YYYY-MM-DD). Values are one per day ending there. */
  asOf?: string;
  /** Smaller type, no paid label, no scrubbing: for the home value line. */
  compact?: boolean;
};

const PAD = 8;
const LABEL_W = 56; // right gutter for gridline prices
const DATES_H = 18;

const shortDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const dayBefore = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

/** Two round gridline prices inside [lo, hi], e.g. $1,200 and $1,400. */
export function gridPrices(lo: number, hi: number): number[] {
  const span = hi - lo;
  if (span <= 0) return [lo];
  const raw = span / 2;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const first = Math.ceil(lo / step) * step;
  const out: number[] = [];
  for (let v = first; v <= hi && out.length < 3; v += step) out.push(v);
  return out.length > 2 ? [out[0], out[out.length - 1]] : out;
}

/** Space for a high/low price label between its point and the plot edge. */
const POINT_ROOM = 20;

export function PriceChart({ values: raw, paidCents, width, height = 160, tint = color.ink, asOf, compact = false }: Props) {
  const values = downsample(raw, compact ? 24 : 32);
  const [scrub, setScrub] = useState<number | null>(null); // index into raw
  const plotW = width - LABEL_W;
  const plotH = height - (asOf ? DATES_H : 0);

  const geo = useMemo(() => {
    const all = paidCents != null && !compact ? [...raw, paidCents] : raw;
    const lo = Math.min(...all);
    const hi = Math.max(...all);
    const span = hi - lo || 1;
    const x = (i: number, n: number) => (n <= 1 ? 0 : (i / (n - 1)) * (plotW - PAD));
    // On detail, leave room above the high and below the low for their price labels.
    const edge = compact ? PAD : PAD + POINT_ROOM;
    const y = (v: number) => edge + (1 - (v - lo) / span) * (plotH - edge * 2);
    return { lo, hi, x, y };
  }, [raw, paidCents, plotW, plotH, compact]);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !compact,
      onMoveShouldSetPanResponder: () => !compact,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => setScrub(indexAt(e.nativeEvent.locationX)),
      onPanResponderMove: (e) => setScrub(indexAt(e.nativeEvent.locationX)),
      onPanResponderRelease: () => setScrub(null),
      onPanResponderTerminate: () => setScrub(null),
    }),
  ).current;
  const rawRef = useRef(raw);
  rawRef.current = raw;
  function indexAt(px: number) {
    const n = rawRef.current.length;
    return Math.max(0, Math.min(n - 1, Math.round((px / Math.max(1, plotW - PAD)) * (n - 1))));
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
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i, n).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const last = raw[raw.length - 1];
  const hiI = raw.indexOf(Math.max(...raw));
  const loI = raw.indexOf(Math.min(...raw));
  const rx = (i: number) => x(i, raw.length);
  const grid = gridPrices(Math.min(...raw), Math.max(...raw));
  const paidY = paidCents != null && !compact ? y(paidCents) : null;
  const labelStyle = [type.secondary, { color: color.secondary, fontSize: compact ? 11 : 12 }];

  // Labels go above (high) or below (low) their point, flipped when that would leave the plot,
  // so a low near the bottom never runs into the date row.
  const POINT_LABEL_H = 16;
  const pointTop = (py: number, above: boolean) => {
    const up = py - 22;
    const down = py + 6;
    if (above) return up >= 0 ? up : down;
    return down + POINT_LABEL_H <= plotH ? down : up;
  };
  // The low isn't worth marking when it's today's price: the big dot and the header already say it.
  const markLow = loI !== raw.length - 1 && loI !== hiI && raw[loI] !== last;

  const point = (i: number, label: string, above: boolean) => {
    const px = rx(i);
    const left = Math.max(0, Math.min(plotW - 64, px - 32));
    return (
      <Text key={label + i} style={[labelStyle, { position: 'absolute', left, width: 64, textAlign: 'center', top: pointTop(y(raw[i]), above) }]}>
        {label}
      </Text>
    );
  };

  const s = scrub;
  return (
    <View style={{ width, height }} {...pan.panHandlers} accessibilityLabel={`Price chart, now ${money(last)}`}>
      <Svg width={width} height={plotH}>
        {grid.map((g) => (
          <Line key={g} x1={0} x2={plotW} y1={y(g)} y2={y(g)} stroke={color.hairline} strokeWidth={1} />
        ))}
        {paidY != null ? (
          <Line x1={0} x2={plotW} y1={paidY} y2={paidY} stroke={color.secondary} strokeOpacity={0.5} strokeWidth={1.25} strokeDasharray="3 5" />
        ) : null}
        <Path d={d} stroke={tint} strokeWidth={compact ? 1.75 : 2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        {!compact && hiI !== raw.length - 1 ? <Circle cx={rx(hiI)} cy={y(raw[hiI])} r={3} fill={color.ink} /> : null}
        {!compact && markLow ? <Circle cx={rx(loI)} cy={y(raw[loI])} r={3} fill={color.ink} /> : null}
        <Circle cx={rx(raw.length - 1)} cy={y(last)} r={compact ? 3.5 : 6} fill={tint} />
        {s != null ? (
          <>
            <Line x1={rx(s)} x2={rx(s)} y1={0} y2={plotH} stroke={color.secondary} strokeWidth={1} />
            <Circle cx={rx(s)} cy={y(raw[s])} r={5} fill={color.canvas} stroke={tint} strokeWidth={2} />
          </>
        ) : null}
      </Svg>

      {/* Gridline prices on the right. */}
      {grid.filter((g) => paidY == null || s != null || Math.abs(y(g) - paidY) > 14).map((g) => (
        <Text key={`g${g}`} style={[labelStyle, { position: 'absolute', right: 0, width: LABEL_W - 6, textAlign: 'right', top: y(g) - 8 }]}>
          {money(g)}
        </Text>
      ))}

      {/* High and low on the line (detail only, hidden while scrubbing). */}
      {!compact && s == null && hiI !== raw.length - 1 ? point(hiI, money(raw[hiI]), true) : null}
      {!compact && s == null && markLow ? point(loI, money(raw[loI]), false) : null}

      {paidY != null && s == null ? (
        <Text style={[labelStyle, { position: 'absolute', right: 0, width: LABEL_W - 6, textAlign: 'right', top: paidY - 8 }]}>paid</Text>
      ) : null}

      {/* Scrub readout: price and date above the plot. */}
      {s != null ? (
        <View style={{ position: 'absolute', top: -2, left: Math.max(0, Math.min(plotW - 120, rx(s) - 60)), width: 120, alignItems: 'center' }}>
          <Text style={[type.text, { color: color.ink, fontWeight: '600', fontVariant: ['tabular-nums'] }]}>{money(raw[s])}</Text>
          {asOf ? <Text style={labelStyle}>{shortDate(dayBefore(asOf, raw.length - 1 - s))}</Text> : null}
        </View>
      ) : null}

      {asOf ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: plotW, height: DATES_H, alignItems: 'flex-end' }}>
          <Text style={labelStyle}>{shortDate(dayBefore(asOf, raw.length - 1))}</Text>
          <Text style={labelStyle}>{shortDate(asOf)}</Text>
        </View>
      ) : null}
    </View>
  );
}
