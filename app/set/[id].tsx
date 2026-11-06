// A whole set: its logo (or name set in display type when there's no logo), a few set-level
// numbers, then every single as a picture grid with sorts and a rarity filter. Opened from a
// searched card's set name or "See all". Reads our catalog only.

import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArtImage } from '../../src/components/ArtImage';
import { BackIcon, Hairline, IconButton } from '../../src/components/ui';
import { money, pct } from '../../src/lib/format';
import { cardNumber, displayName, type Game } from '../../src/services/search';
import type { Found } from '../../src/services/searchFilters';
import { arrangeSet, cardsInSet, rarities, SET_SORTS, setMeta, type SetMeta, type SetSort } from '../../src/services/setCards';
import { color, radius, shadow, space, type } from '../../src/theme/tokens';

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
  const [sort, setSort] = useState<SetSort>('price');
  const [rarity, setRarity] = useState<string | null>(null);

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

  const shown = useMemo(() => arrangeSet(list, sort, rarity), [list, sort, rarity]);
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

        <Tabs value={sort} onChange={setSort} options={SET_SORTS} />
        {kinds.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.gutter }} contentContainerStyle={styles.chips}>
            <Chip label="All" on={rarity == null} onPress={() => setRarity(null)} />
            {kinds.map((k) => (
              <Chip key={k.rarity} label={`${k.rarity} ${k.n}`} on={rarity === k.rarity} onPress={() => setRarity(rarity === k.rarity ? null : k.rarity)} />
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
            {cards === null ? 'Loading the set…' : cards === 'error' ? 'Can’t load this set right now.' : sort === 'rising' || sort === 'falling' ? 'No price moves this week yet.' : 'No cards here.'}
          </Text>
        }
        renderItem={({ item }) => <Tile card={item} w={cellW} />}
      />
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

/** Text tabs with a short ink mark under the picked one (same as the grade row on a card). */
function Tabs<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <View style={styles.tabs} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} accessibilityRole="tab" accessibilityState={{ selected: on }} style={styles.tab}>
            <Text style={[type.text, { color: on ? color.ink : color.secondary, fontWeight: on ? '600' : '400' }]}>{o.label}</Text>
            <View style={[styles.mark, on && { backgroundColor: color.ink }]} />
          </Pressable>
        );
      })}
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
  tabs: { flexDirection: 'row', gap: space.xl, paddingTop: space.m },
  tab: { height: 44, justifyContent: 'center' },
  mark: { height: 2, borderRadius: 1, marginTop: 4, backgroundColor: 'transparent' },
  chips: { paddingHorizontal: space.gutter, gap: space.s, paddingTop: space.s, paddingBottom: space.m },
  chip: { height: 32, paddingHorizontal: space.m, borderRadius: 16, backgroundColor: color.well, justifyContent: 'center' },
});
