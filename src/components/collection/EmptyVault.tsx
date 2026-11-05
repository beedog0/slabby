// Empty states. An outlined slab is the same outline a scanned slab fades in from.

import { StyleSheet, Text, View } from 'react-native';
import type { DisplayMode } from '../../store/display';
import { color, radius, size, space, type } from '../../theme/tokens';
import { Ledge } from './ShelfView';

/** First run: no slabs at all. */
export function EmptyVault() {
  return (
    <View style={styles.wrap}>
      <GhostSlab width={size.heroW * 0.8} />
      <Text style={[type.section, { color: color.ink, paddingTop: space.xxl }]}>Your collection starts here</Text>
      <Text style={[type.text, { color: color.secondary, textAlign: 'center', paddingTop: space.s, maxWidth: 280 }]}>
        Scan the QR code on a PSA label to add your first slab.
      </Text>
    </View>
  );
}

export function GhostSlab({ width }: { width: number }) {
  const k = width / size.heroW;
  return (
    <View style={[styles.slab, { width, height: (width * size.heroH) / size.heroW, padding: 8 * k, gap: 6 * k }]}>
      <View style={[styles.label, { height: 48 * k }]} />
      <View style={styles.art} />
    </View>
  );
}

/** A filter with nothing in it: empty slots laid out like the current view, then one line of copy. */
export function EmptyFilter({ mode, width, title, hint }: { mode: DisplayMode; width: number; title: string; hint: string }) {
  let slots;
  if (mode === 'shelf') {
    const w = Math.floor((width - space.m * 2 - space.l * 2) / 3);
    slots = (
      <View>
        <View style={[styles.row, { paddingHorizontal: space.m, gap: space.l, marginBottom: -2 }]}>
          {[0, 1, 2].map((i) => (
            <GhostSlab key={i} width={w} />
          ))}
        </View>
        <Ledge />
      </View>
    );
  } else if (mode === 'grid') {
    const cell = Math.floor((width - space.l) / 2);
    slots = (
      <View style={[styles.row, { gap: space.l }]}>
        {[0, 1].map((i) => (
          <View key={i} style={{ width: cell, alignItems: 'center' }}>
            <GhostSlab width={Math.floor(cell * 0.82)} />
          </View>
        ))}
      </View>
    );
  } else {
    slots = (
      <View style={{ alignItems: 'center' }}>
        <GhostSlab width={size.heroW} />
      </View>
    );
  }
  return (
    <View>
      {slots}
      <View style={{ alignItems: 'center', paddingTop: space.xl, gap: space.xs }}>
        <Text style={[type.body, { color: color.ink }]}>{title}</Text>
        <Text style={[type.text, { color: color.secondary, textAlign: 'center', maxWidth: 300 }]}>{hint}</Text>
      </View>
    </View>
  );
}

const line = { borderWidth: 1.5, borderColor: color.ghost } as const;

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingTop: space.xxl, paddingHorizontal: space.gutter },
  row: { flexDirection: 'row', alignItems: 'flex-end' },
  slab: { borderRadius: radius.slab, ...line },
  label: { borderRadius: 3, ...line },
  art: { flex: 1, borderRadius: 4, ...line },
});
