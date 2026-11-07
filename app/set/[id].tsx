// A whole set: its logo (or name set in display type when there's no logo), a few set-level
// numbers, then every single as a picture grid with sorts and a rarity filter. Opened from a
// searched card's set name or "See all". Reads our catalog only.

import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArtImage } from '../../src/components/ArtImage';
import { BackIcon, Hairline, IconButton } from '../../src/components/ui';
import { money, pct } from '../../src/lib/format';
import { cardNumber, displayName, type Game } from '../../src/services/search';
import type { Found } from '../../src/services/searchFilters';
import { arrangeSet, cardsInSet, rarities, SET_SORTS, setMeta, type SetMeta, type SetSort } from '../../src/services/setCards';
import { color, radius, shadow, size, space, type } from '../../src/theme/tokens';

const COLS = 3;
const GAP = space.m;
const fmtDate = (d: string) => new Date(d.replace(/\//g, '-') + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const titleOf = (name: string) => name.replace(/^[A-Za-z0-9.\- ]{1,10}:\s+/, '');

export default function SetPage() {
  const p = useLocalSearchParams<{ id: string; name?: string; language?: string; game?: string }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [cards, setCards] = useState<Found[] | null | 'error'>(null);
  const [meta, setMetaState] = useState<SetMeta | null>(null);
  const [sort, setSort] = useState<SetSort>('price_high');
  const [picked, setPicked] = useState<string[]>([]);
  const [sortOpen, setSortOpen] = useState(false);
  const [menuTop, setMenuTop] = useState(0);
  const controlsRef = useRef<ComponentRef<typeof View>>(null);
  const openSort = () =>
    controlsRef.current?.measureInWindow((_x, y, _w, h) => {
      setMenuTop(y + h);
      setSortOpen(true);
    });
  const toggle = (r: string) => setPicked((p) => (p.includes(r) ? p.filter((x) => x !== r) : [...p, r]));

  useEffect(() => {
    let live = true;
    cardsInSet(Number(p.id))
      .then((c) => live && setCards(c))
      .catch(() => live && setCards('error'));
    return () => {
      live = false;
    };
  }, [p.id]);

  const list = Array.isArray(cards) ? cards : [];
  const first = list[0];
  const setName = first?.setName ?? p.name ?? '';
  const language = first?.language ?? p.language ?? 'en';
  const game = (first?.game ?? p.game ?? 'pokemon') as Game;

  useEffect(() => {
    let live = true;
    if (setName) setMeta({ setName, language, game }).then((m) => live && setMetaState(m)).catch(() => {});
    return () => {
      live = false;
    };
  }, [setName, language, game]);

  const shown = useMemo(() => arrangeSet(list, sort, picked), [list, sort, picked]);
  const kinds = useMemo(() => rarities(list), [list]);
  const priced = list.filter((c) => c.marketCents != null);
  const value = priced.reduce((t, c) => t + (c.marketCents ?? 0), 0);
  const up = list.filter((c) => (c.change7d ?? 0) > 0.03).length;
  const down = list.filter((c) => (c.change7d ?? 0) < -0.03).length;
  const cellW = Math.floor((width - space.gutter * 2 - GAP * (COLS - 1)) / COLS);

  const facts = [
    meta?.series,
    meta?.releaseDate ? fmtDate(meta.releaseDate) : null,
    list.length ? `${list.length} cards` : null,
    language === 'ja' ? 'Japanese' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const header = (
    <View>
      <View style={styles.nav}>
        <IconButton label="Back" onPress={() => router.back()}>
          <BackIcon />
        </IconButton>
      </View>
      <View style={styles.gutter}>
        {meta?.logo ? (
          <Image
            source={{ uri: meta.logo }}
            style={styles.logo}
            contentFit="contain"
            contentPosition="left"
            accessibilityLabel={titleOf(setName)}
            transition={150}
          />
        ) : (
          <Text style={[type.displayS, { color: color.ink }]} numberOfLines={2}>
            {titleOf(setName)}
          </Text>
        )}
        {facts ? <Text style={[type.text, { color: color.secondary, paddingTop: space.s }]}>{facts}</Text> : null}

        {priced.length ? (
          <View style={styles.stats}>
            <Stat label="Raw set value" value={money(value)} />
            <Stat label="Up this week" value={String(up)} tint={up ? color.gain : undefined} />
            <Stat label="Down this week" value={String(down)} tint={down ? color.loss : undefined} />
          </View>
        ) : null}
        <Hairline />

        {/* Same row as search: what's shown on the left, the sort on the right. Rarity pills
            below filter; the sort applies on top of whatever they leave. */}
        <View ref={controlsRef} style={styles.controls}>
          <Text style={[type.secondary, { color: color.secondary }]}>
            {list.length ? (picked.length ? `${shown.length} of ${list.length} cards` : `${list.length} cards`) : ''}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Sort" onPress={openSort} hitSlop={8} style={styles.control}>
            <Text style={[type.secondary, { color: color.ink, fontWeight: '500' }]}>{SET_SORTS.find((o) => o.value === sort)!.label} ▾</Text>
          </Pressable>
        </View>
        {kinds.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.gutter }} contentContainerStyle={styles.chips}>
            <Chip label="All" on={!picked.length} onPress={() => setPicked([])} />
            {kinds.map((k) => (
              <Chip key={k.rarity} label={`${k.rarity} ${k.n}`} on={picked.includes(k.rarity)} onPress={() => toggle(k.rarity)} />
            ))}
          </ScrollView>
        ) : null}
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: color.canvas, paddingTop: insets.top }}>
      <FlatList
        data={shown}
        key={COLS}
        numColumns={COLS}
        keyExtractor={(c) => String(c.productId)}
        ListHeaderComponent={header}
        columnWrapperStyle={{ gap: GAP, paddingHorizontal: space.gutter }}
        contentContainerStyle={{ paddingBottom: insets.bottom + space.xl, gap: space.l }}
        ListEmptyComponent={
          <Text style={[type.text, styles.gutter, { color: color.secondary, paddingTop: space.l }]}>
            {cards === null ? 'Loading the set…' : cards === 'error' ? 'Can’t load this set right now.' : sort === 'rising' || sort === 'falling' ? 'No price moves this week yet.' : picked.length ? 'No cards with those rarities.' : 'No cards here.'}
          </Text>
        }
        renderItem={({ item }) => <Tile card={item} w={cellW} />}
      />
      <Modal visible={sortOpen} transparent animationType="fade" onRequestClose={() => setSortOpen(false)}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setSortOpen(false)} accessibilityLabel="Close" />
        <View style={[styles.menu, { top: menuTop }]}>
          {SET_SORTS.map((o) => (
            <Pressable
              key={o.value}
              accessibilityRole="menuitem"
              accessibilityState={{ selected: o.value === sort }}
              onPress={() => {
                setSort(o.value);
                setSortOpen(false);
              }}
              style={({ pressed }) => [styles.menuRow, pressed && { backgroundColor: color.well }]}
            >
              <Text style={[type.text, { color: color.ink, flex: 1 }]}>{o.label}</Text>
              <Text style={[type.text, { color: color.ink, width: 16, textAlign: 'right' }]}>{o.value === sort ? '✓' : ''}</Text>
            </Pressable>
          ))}
        </View>
      </Modal>
    </View>
  );
}

function Stat({ label, value, tint }: { label: string; value: string; tint?: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={[type.secondary, { color: color.secondary }]}>{label}</Text>
      <Text style={[type.numberM, { color: tint ?? color.ink }]}>{value}</Text>
    </View>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }} style={[styles.chip, on && { backgroundColor: color.ink }]}>
      <Text style={[type.secondary, { color: on ? color.onInk : color.ink, fontWeight: on ? '600' : '400' }]}>{label}</Text>
    </Pressable>
  );
}

function Tile({ card, w }: { card: Found; w: number }) {
  const no = cardNumber(card.number);
  return (
    <Pressable
      style={{ width: w }}
      onPress={() => router.push(`/search/${card.productId}`)}
      accessibilityRole="button"
      accessibilityLabel={`${displayName(card.name)}${no ? ` number ${no}` : ''}, ${card.marketCents != null ? money(card.marketCents) : 'no price'}`}
    >
      <View style={[{ width: w, height: Math.round(w * (88 / 63)), borderRadius: radius.thumb * 2, backgroundColor: color.well }, shadow.thumb]}>
        {card.imageUrl ? <ArtImage uri={card.imageUrl} recyclingKey={String(card.productId)} fit="contain" style={{ flex: 1, borderRadius: radius.thumb * 2 }} /> : null}
      </View>
      <Text numberOfLines={1} style={[type.secondary, { color: color.ink, paddingTop: space.s }]}>
        {displayName(card.name)}
      </Text>
      <Text numberOfLines={1} style={[type.secondary, { color: color.ink, fontWeight: '600' }]}>
        {card.marketCents != null ? money(card.marketCents) : '—'}
        {card.change7d != null && Math.abs(card.change7d) >= 0.005 ? (
          <Text style={{ color: card.change7d > 0 ? color.gain : color.loss, fontWeight: '400' }}> {pct(card.change7d)}</Text>
        ) : null}
      </Text>
      {no ? <Text style={[type.caption, { color: color.secondary }]}>#{no}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  gutter: { paddingHorizontal: space.gutter },
  nav: { flexDirection: 'row', paddingHorizontal: space.gutter - 10 },
  logo: { width: '70%', height: 76, marginTop: space.s },
  stats: { flexDirection: 'row', gap: space.l, paddingTop: space.xl, paddingBottom: space.l },
  controls: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: space.s },
  control: { minHeight: size.touch - 12, justifyContent: 'center' },
  menu: { position: 'absolute', right: space.gutter, width: 230, borderRadius: radius.field, backgroundColor: color.canvas, paddingVertical: space.xs, ...shadow.menu },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: space.s, paddingHorizontal: space.gutter, minHeight: size.touch },
  chips: { paddingHorizontal: space.gutter, gap: space.s, paddingTop: space.s, paddingBottom: space.m },
  chip: { height: 32, paddingHorizontal: space.m, borderRadius: 16, backgroundColor: color.well, justifyContent: 'center' },
});
