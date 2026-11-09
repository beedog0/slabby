// Top movers and New sealed in full, as a sheet over Search (Bryan: "Show more should open a new
// page, rather than expand down"). Stock-style rows: rank, picture, name, what's moving (Raw
// TCGplayer market, or the sealed kind), a small price line, the price and its weekly move.

import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArtImage } from '../src/components/ArtImage';
import { Sparkline } from '../src/components/Sparkline';
import { ChangeText } from '../src/components/search/CatalogTile';
import { Hairline } from '../src/components/ui';
import { cardPrice, langTag } from '../src/lib/format';
import { sealedLabel } from '../src/lib/sealed';
import { cachedLanding, EMPTY_LANDING, fetchLanding, type Landing, type Priced } from '../src/services/landing';
import { displayName } from '../src/services/search';
import { useRecent } from '../src/store/recent';
import type { Game } from '../src/types';
import { radius, size, space, type } from '../src/theme/tokens';
import { themed, useColors } from '../src/theme/theme';

type Kind = 'up' | 'down' | 'sealed';

export default function Movers() {
  const color = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const p = useLocalSearchParams<{ kind?: string; game?: string }>();
  const game = (p.game && p.game !== 'all' ? p.game : null) as Game | null;
  const [kind, setKind] = useState<Kind>(p.kind === 'down' ? 'down' : p.kind === 'sealed' ? 'sealed' : 'up');
  const [feed, setFeed] = useState<Landing>(EMPTY_LANDING);

  useEffect(() => {
    let live = true;
    cachedLanding(game).then((c) => live && c && setFeed(c));
    fetchLanding(game)
      .then((l) => live && setFeed(l))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [game]);

  const items: Priced[] = kind === 'up' ? feed.up : kind === 'down' ? feed.down : feed.sealedNew;
  const open = (c: Priced) => {
    useRecent.getState().addViewed(c);
    router.push(`/search/${c.productId}`);
  };

  return (
    <View style={{ flex: 1, backgroundColor: color.canvas }}>
      <View style={styles.grabber} />
      <View style={styles.bar}>
        <Pressable accessibilityRole="button" onPress={() => (router.canGoBack() ? router.back() : router.replace('/find'))} style={styles.done}>
          <Text style={[type.text, { color: color.ink }]}>Done</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + space.xxl }}>
        <View style={styles.gutter}>
          <Text style={[type.title, { color: color.ink }]}>{kind === 'sealed' ? 'New sealed' : 'Top movers'}</Text>
          <Text style={[type.secondary, { color: color.secondary, paddingTop: space.xs }]}>
            {kind === 'sealed'
              ? 'Boxes, ETBs, bundles and collections from the newest sets · TCGplayer market'
              : 'Raw cards, TCGplayer market · this week vs last, steady prices only'}
          </Text>
          {kind !== 'sealed' ? (
            <View style={styles.toggle}>
              {(['up', 'down'] as const).map((d) => (
                <Pressable key={d} accessibilityRole="tab" accessibilityState={{ selected: kind === d }} onPress={() => setKind(d)} style={styles.tab}>
                  <Text style={[type.text, { color: kind === d ? color.ink : color.secondary, fontWeight: kind === d ? '600' : '400' }]}>
                    {d === 'up' ? 'Rising' : 'Falling'}
                  </Text>
                  <View style={[styles.underline, { backgroundColor: kind === d ? color.ink : 'transparent' }]} />
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>

        <View style={[styles.gutter, { paddingTop: space.l }]}>
          {items.length ? (
            items.map((c, i) => (
              <View key={c.productId}>
                {i ? <Hairline inset={space.xl + size.thumbW + space.m * 2} /> : null}
                <Row item={c} rank={i + 1} onPress={() => open(c)} />
              </View>
            ))
          ) : (
            <Text style={[type.text, { color: color.secondary, paddingTop: space.l }]}>Nothing here yet.</Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function Row({ item: c, rank, onPress }: { item: Priced; rank: number; onPress: () => void }) {
  const color = useColors();
  const styles = useStyles();
  const sealed = c.sealedType;
  const tag = langTag(c.language);
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
      <Text style={[type.secondary, styles.rank, { color: color.secondary }]}>{rank}</Text>
      <View style={sealed ? styles.thumbSealed : styles.thumb}>
        <ArtImage uri={c.imageUrl} label={c.name} recyclingKey={String(c.productId)} fit={sealed ? 'contain' : 'cover'} style={{ flex: 1 }} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={2} style={[type.text, { color: color.ink, fontWeight: '500' }]}>
          {sealed ? c.name : displayName(c.name)}
          {tag ? <Text style={{ color: color.secondary }}>{`  ${tag}`}</Text> : null}
        </Text>
        <Text numberOfLines={2} style={[type.caption, { color: color.secondary }]}>
          {sealed ? sealedLabel(sealed) : `Raw · ${c.setName}`}
        </Text>
      </View>
      {c.hist.length >= 3 ? <Sparkline values={c.hist} change={c.change ?? 0} /> : null}
      <View style={styles.right}>
        <Text style={[type.numberM, { color: c.marketCents != null ? color.ink : color.secondary }]}>
          {c.marketCents != null ? cardPrice(c.marketCents) : '—'}
        </Text>
        {c.change != null ? <ChangeText fraction={c.change} style={type.secondary} /> : null}
      </View>
    </Pressable>
  );
}

const useStyles = themed((color) =>
  StyleSheet.create({
    gutter: { paddingHorizontal: space.gutter },
    grabber: { alignSelf: 'center', marginTop: space.s, width: size.grabberW, height: size.grabberH, borderRadius: size.grabberH, backgroundColor: color.ghost },
    bar: { height: size.touch, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.gutter },
    done: { minHeight: size.touch, justifyContent: 'center' },
    toggle: { flexDirection: 'row', gap: space.xl, paddingTop: space.l },
    tab: { minHeight: size.touch, justifyContent: 'center' },
    underline: { height: 2, marginTop: space.xs, borderRadius: 1 },
    row: { minHeight: size.rowCon, flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.s },
    rank: { width: space.xl, textAlign: 'right' },
    thumb: { width: size.thumbW, height: size.thumbH, borderRadius: radius.thumb, overflow: 'hidden', backgroundColor: color.well },
    thumbSealed: { width: size.thumbW, height: size.thumbH, overflow: 'hidden' },
    right: { alignItems: 'flex-end', minWidth: size.sparkW },
  }),
);
