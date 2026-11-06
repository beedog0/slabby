// Card search: any card in TCGplayer's catalog (Pokémon EN/JP, One Piece, Riftbound), not just
// the vault. Results show tonight's raw market; open a card for PSA prices with charts.
// Typing, filtering and sorting only query our own catalog table, never a paid API.
// Quiet controls under the field: "Filter" (language, rarity, set), the sort dropdown, and
// List / Grid (remembered, like home's view switch). Scrolling down slides the title, field and
// game tabs away and keeps that control row pinned; scrolling up brings them back.

import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Animated, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArtImage } from '../../src/components/ArtImage';
import { SEARCH_MODES, ViewSwitch } from '../../src/components/collection/ViewSwitch';
import { Segmented } from '../../src/components/Segmented';
import { BackIcon, Hairline, IconButton, PrimaryButton, SearchIcon } from '../../src/components/ui';
import { money, pct } from '../../src/lib/format';
import { buyPrices, cardNumber, displayName, type Game } from '../../src/services/search';
import {
  catalogProgress,
  changeOf,
  EMPTY_QUERY,
  filterCount,
  findCards,
  findFacets,
  runnable,
  SORTS,
  type Facets,
  type Found,
  type Query,
  type Sort,
} from '../../src/services/searchFilters';
import { useDisplay } from '../../src/store/display';
import { useRules } from '../../src/store/rules';
import { color, radius, shadow, size, space, type } from '../../src/theme/tokens';
import type { PricingRules } from '../../src/types';

type GameFilter = 'all' | Game;
const GRID_GAP = space.l;

export default function Search() {
  const insets = useSafeAreaInsets();
  // Con mode opens search with ?con=1: each result also shows what to pay, from the buying rules.
  const con = useLocalSearchParams<{ con?: string }>().con === '1';
  const rules = useRules((s) => s.rules);
  const { searchLayout: layout, setSearchLayout } = useDisplay();
  const { width } = useWindowDimensions();
  const cellW = Math.floor((width - space.gutter * 2 - GRID_GAP) / 2);
  const [f, setF] = useState<Query>(EMPTY_QUERY);
  const set = (patch: Partial<Query>) => setF((prev) => ({ ...prev, ...patch }));
  const [results, setResults] = useState<Found[]>([]);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [sortOpen, setSortOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [menuTop, setMenuTop] = useState(0);
  const [topH, setTopH] = useState(0); // the part that slides away
  const [headerH, setHeaderH] = useState(0); // all of it, pinned row included
  const controlsRef = useRef<ComponentRef<typeof View>>(null);
  const listRef = useRef<FlatList<Found>>(null);
  const scrollY = useRef(new Animated.Value(0)).current;
  // Follows scroll direction: down hides up to topH, any scroll up reveals again.
  const slide = useMemo(
    () =>
      Animated.diffClamp(scrollY.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolateLeft: 'clamp' }), 0, Math.max(topH, 1)).interpolate({
        inputRange: [0, Math.max(topH, 1)],
        outputRange: [0, -Math.max(topH, 1)],
      }),
    [scrollY, topH],
  );
  const openSort = () => {
    // The row moves with the header, so measure where it is now.
    controlsRef.current?.measureInWindow((_x, y, _w, h) => {
      setMenuTop(y + h);
      setSortOpen(true);
    });
  };
  const latest = useRef(0);

  useEffect(() => {
    catalogProgress().then(setProgress).catch(() => {});
  }, []);

  useEffect(() => {
    if (!runnable(f)) {
      setResults([]);
      setFacets(null);
      setState('idle');
      return;
    }
    const id = ++latest.current;
    setState('loading');
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
    const t = setTimeout(() => {
      findCards(f)
        .then((r) => {
          if (id !== latest.current) return;
          setResults(r);
          setState('done');
        })
        .catch(() => id === latest.current && setState('error'));
      findFacets(f)
        .then((x) => id === latest.current && setFacets(x))
        .catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [f]);

  const loading = progress != null && progress.total > 0 && progress.done < progress.total;
  const loadingLine = loading ? ` The catalog is still loading (${progress!.done} of ${progress!.total} sets), so some cards aren’t in yet.` : '';
  const nFilters = filterCount(f);
  const changeKey = changeOf(f.sort);
  const hint =
    state === 'idle'
      ? `Search any card by name, set or number.${loadingLine}`
      : state === 'error'
        ? 'Search isn’t reachable right now.'
        : state === 'done' && !results.length
          ? changeKey
            ? 'No price changes yet for these cards. Rise and drop sorts fill in as nightly prices build up (7 days for 7-day change).'
            : `No cards match${nFilters ? ' with these filters' : ` “${f.q.trim()}”`}.${loadingLine}`
          : null;
  const sortLabel = SORTS.find((s) => s.value === f.sort)!.label;

  return (
    <View style={{ flex: 1, backgroundColor: color.canvas }}>
      <Animated.View
        style={[styles.header, { top: insets.top, transform: [{ translateY: slide }] }]}
        onLayout={(e) => setHeaderH(e.nativeEvent.layout.height)}
      >
        <View onLayout={(e) => setTopH(e.nativeEvent.layout.height)}>
          <View style={styles.nav}>
            <IconButton label="Back" onPress={() => router.back()}>
              <BackIcon />
            </IconButton>
          </View>
          <View style={styles.gutter}>
            <Text style={[type.title, { color: color.ink, paddingBottom: space.l }]}>{con ? 'Search to buy' : 'Search'}</Text>
            <View style={styles.field}>
              <SearchIcon s={18} tint={color.secondary} />
              <TextInput
                value={f.q}
                onChangeText={(q) => set({ q })}
                autoFocus
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
                clearButtonMode="while-editing"
                placeholder={f.set ? `Search ${f.set.name}` : 'Umbreon VMAX 215'}
                placeholderTextColor={color.secondary}
                style={[type.body, styles.input]}
                accessibilityLabel="Search cards"
              />
            </View>
            <Segmented<GameFilter>
              style={{ marginTop: space.m }}
              value={f.game ?? 'all'}
              onChange={(g) =>
                // Sets and rarities belong to one game; Japanese only exists for Pokémon.
                set({
                  game: g === 'all' ? null : g,
                  set: null,
                  rarities: [],
                  language: g === 'all' || g === 'pokemon' ? f.language : null,
                })
              }
              options={[
                { value: 'all', label: 'All' },
                { value: 'pokemon', label: 'Pokémon' },
                { value: 'onepiece', label: 'One Piece' },
                { value: 'riftbound', label: 'Riftbound' },
              ]}
            />
          </View>
        </View>

        {runnable(f) ? (
          <View ref={controlsRef} style={styles.controls}>
            <Pressable accessibilityRole="button" accessibilityLabel="Filter" onPress={() => setFilterOpen(true)} hitSlop={8} style={styles.control}>
              <Text style={[type.secondary, { color: color.ink, fontWeight: '500' }]}>{nFilters ? `Filter · ${nFilters}` : 'Filter'}</Text>
            </Pressable>
            <View style={styles.controlsRight}>
              <Pressable accessibilityRole="button" accessibilityLabel="Sort" onPress={openSort} hitSlop={8} style={styles.control}>
                <Text style={[type.secondary, { color: color.ink, fontWeight: '500' }]}>{sortLabel} ▾</Text>
              </Pressable>
              <ViewSwitch value={layout} onChange={setSearchLayout} modes={SEARCH_MODES} />
            </View>
          </View>
        ) : null}
        {/* A hairline under the pinned row once results scroll beneath it. */}
        <Animated.View
          style={{
            height: StyleSheet.hairlineWidth * 2,
            backgroundColor: color.hairline,
            opacity: scrollY.interpolate({ inputRange: [0, 8], outputRange: [0, 1], extrapolate: 'clamp' }),
          }}
        />
      </Animated.View>
      {/* Covers the status bar so the header slides under it. */}
      <View style={[styles.statusCover, { height: insets.top }]} />

      {headerH ? (
        <Animated.FlatList
          ref={listRef}
          key={layout}
          data={hint ? [] : results}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
          scrollEventThrottle={16}
          scrollIndicatorInsets={{ top: headerH }}
          style={{ paddingTop: insets.top }}
          ListEmptyComponent={hint ? <Text style={[type.text, styles.gutter, { color: color.secondary, paddingTop: space.l }]}>{hint}</Text> : undefined}
          numColumns={layout === 'grid' ? 2 : 1}
          keyExtractor={(c) => String(c.productId)}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingBottom: insets.bottom + space.xl, paddingTop: headerH + (layout === 'grid' ? space.m : 0) }}
          columnWrapperStyle={layout === 'grid' ? styles.gridRow : undefined}
          ItemSeparatorComponent={layout === 'grid' ? undefined : () => <Hairline inset={space.gutter + size.thumbW + space.m} />}
          renderItem={({ item }) =>
            layout === 'grid' ? (
              <ResultTile card={item} width={cellW} con={con} rules={rules} change={changeKey ? item[changeKey] : null} days={changeKey === 'change7d' ? 7 : 30} />
            ) : (
              <ResultRow card={item} con={con} rules={rules} change={changeKey ? item[changeKey] : null} days={changeKey === 'change7d' ? 7 : 30} />
            )
          }
        />
      ) : null}

      <SortMenu open={sortOpen} top={menuTop} sort={f.sort} onSort={(sort) => set({ sort })} onClose={() => setSortOpen(false)} />
      <FilterSheet
        open={filterOpen}
        query={f}
        facets={facets}
        count={results.length}
        onChange={set}
        onClose={() => setFilterOpen(false)}
        bottom={insets.bottom}
      />
    </View>
  );
}

/** Small dropdown under the sort control. */
function SortMenu({ open, top, sort, onSort, onClose }: { open: boolean; top: number; sort: Sort; onSort: (s: Sort) => void; onClose: () => void }) {
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.menu, { top }]}>
        {SORTS.map((s) => (
          <CheckRow
            key={s.value}
            label={s.label}
            on={s.value === sort}
            onPress={() => {
              onSort(s.value);
              onClose();
            }}
          />
        ))}
      </View>
    </Modal>
  );
}

/**
 * Filters for the current search, from what actually matches it (with counts): language
 * (Pokémon only), rarity (pick several) and one set. Changes apply as you tap.
 */
function FilterSheet({
  open,
  query: f,
  facets,
  count,
  onChange,
  onClose,
  bottom,
}: {
  open: boolean;
  query: Query;
  facets: Facets | null;
  count: number;
  onChange: (p: Partial<Query>) => void;
  onClose: () => void;
  bottom: number;
}) {
  const showLanguage = !f.game || f.game === 'pokemon';
  const sets = facets?.sets ?? [];
  const rarities = facets?.rarities ?? [];
  // Keep a picked set or rarity visible even when it falls out of the facet list.
  const setRows = f.set && !sets.some((s) => s.id === f.set!.id) ? [{ ...f.set, n: 0 }, ...sets] : sets;
  const rarityRows = [...f.rarities.filter((r) => !rarities.some((x) => x.key === r)).map((key) => ({ key, n: 0 })), ...rarities];
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={[StyleSheet.absoluteFill, styles.scrim]} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: bottom + space.l }]}>
        <View style={styles.grabber} />
        <View style={styles.sheetHead}>
          <Text style={[type.section, { color: color.ink }]}>Filter</Text>
          {filterCount(f) ? (
            <Pressable accessibilityRole="button" onPress={() => onChange({ language: null, set: null, rarities: [] })} hitSlop={8}>
              <Text style={[type.text, { color: color.secondary }]}>Clear</Text>
            </Pressable>
          ) : null}
        </View>
        <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingBottom: space.l }}>
          {showLanguage ? (
            <View style={styles.sheetSection}>
              <Text style={[type.body, styles.sectionTitle]}>Language</Text>
              <View style={styles.gutter}>
                <Segmented<'all' | 'en' | 'ja'>
                  value={f.language ?? 'all'}
                  onChange={(l) => onChange({ language: l === 'all' ? null : l, set: null, rarities: [] })}
                  options={[
                    { value: 'all', label: 'All' },
                    { value: 'en', label: 'English' },
                    { value: 'ja', label: 'Japanese' },
                  ]}
                />
              </View>
            </View>
          ) : null}

          {rarityRows.length ? (
            <View style={styles.sheetSection}>
              <Text style={[type.body, styles.sectionTitle]}>Rarity</Text>
              {rarityRows.map((r) => (
                <CheckRow
                  key={r.key}
                  label={r.key}
                  detail={r.n ? String(r.n) : undefined}
                  on={f.rarities.includes(r.key)}
                  onPress={() =>
                    onChange({ rarities: f.rarities.includes(r.key) ? f.rarities.filter((x) => x !== r.key) : [...f.rarities, r.key] })
                  }
                />
              ))}
            </View>
          ) : null}

          {setRows.length ? (
            <View style={styles.sheetSection}>
              <Text style={[type.body, styles.sectionTitle]}>Set</Text>
              {setRows.slice(0, 40).map((s) => (
                <CheckRow
                  key={s.id}
                  label={s.name}
                  detail={s.n ? String(s.n) : undefined}
                  on={f.set?.id === s.id}
                  onPress={() => onChange({ set: f.set?.id === s.id ? null : { id: s.id, name: s.name } })}
                />
              ))}
            </View>
          ) : null}

          {!facets ? (
            <Text style={[type.text, styles.gutter, { color: color.secondary }]}>Type a search to see its sets and rarities.</Text>
          ) : null}
        </ScrollView>
        <View style={styles.gutter}>
          <PrimaryButton title={`Show ${count} ${count === 1 ? 'card' : 'cards'}`} onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

function CheckRow({ label, detail, on, onPress }: { label: string; detail?: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="menuitem"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={({ pressed }) => [styles.menuRow, pressed && { backgroundColor: color.well }]}
    >
      <Text numberOfLines={1} style={[type.text, { color: color.ink, flex: 1 }]}>
        {label}
      </Text>
      {detail ? <Text style={[type.secondary, { color: color.secondary }]}>{detail}</Text> : null}
      <Text style={[type.text, { color: color.ink, width: 16, textAlign: 'right' }]}>{on ? '✓' : ''}</Text>
    </Pressable>
  );
}

type ResultProps = { card: Found; con: boolean; rules: PricingRules; change: number | null; days: number };

const openCard = (card: Found, con: boolean) => router.push(con ? `/search/${card.productId}?con=1` : `/search/${card.productId}`);

/** Grid tile: the card photo, then name, set · number and price, like home's grid. */
function ResultTile({ card, width, con, rules, change, days }: ResultProps & { width: number }) {
  const no = cardNumber(card.number);
  const buy = con ? buyPrices(card.marketCents, rules) : null;
  return (
    <Pressable accessibilityRole="button" onPress={() => openCard(card, con)} style={({ pressed }) => [{ width }, pressed && { opacity: 0.85 }]}>
      <View style={[styles.tileArt, { width, height: Math.round((width * 88) / 63) }]}>
        {card.imageUrl ? <ArtImage uri={card.imageUrl} recyclingKey={String(card.productId)} style={{ flex: 1 }} /> : null}
      </View>
      <View style={{ gap: 2, paddingTop: space.m }}>
        <Text numberOfLines={1} style={[type.text, { color: color.ink, fontWeight: '500' }]}>
          {displayName(card.name)}
        </Text>
        <Text numberOfLines={1} style={[type.secondary, { color: color.secondary }]}>
          {[no && `#${no}`, card.language === 'ja' ? 'JP' : null, card.setName].filter(Boolean).join(' · ')}
        </Text>
        <Text numberOfLines={1} style={[type.secondary, { color: color.secondary }]}>
          raw <Text style={{ color: color.ink }}>{card.marketCents != null ? money(card.marketCents) : '—'}</Text>
          {change != null ? <Text style={{ color: change >= 0 ? color.gain : color.loss }}>{`  ${pct(change)} ${days}d`}</Text> : null}
        </Text>
        {buy ? (
          <Text numberOfLines={1} style={[type.secondary, { color: color.ink }]}>
            pay {money(buy.target)}–{money(buy.max).replace('$', '')}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function ResultRow({ card, con, rules, change, days }: { card: Found; con: boolean; rules: PricingRules; change: number | null; days: number }) {
  const no = cardNumber(card.number);
  const buy = con ? buyPrices(card.marketCents, rules) : null;
  const sub = [card.setName, no && `#${no}`, card.language === 'ja' ? 'JP' : null].filter(Boolean).join(' · ');
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(con ? `/search/${card.productId}?con=1` : `/search/${card.productId}`)}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.5 }]}
    >
      <View style={styles.thumb}>{card.imageUrl ? <ArtImage uri={card.imageUrl} recyclingKey={String(card.productId)} style={{ flex: 1 }} /> : null}</View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={[type.body, { color: color.ink }]}>
          {displayName(card.name)}
        </Text>
        <Text numberOfLines={1} style={[type.secondary, { color: color.secondary }]}>
          {sub}
        </Text>
        {buy ? (
          <Text numberOfLines={1} style={[type.secondary, { color: color.ink, paddingTop: 2 }]}>
            Raw: open {money(buy.target)} · pay up to {money(buy.max)}
          </Text>
        ) : null}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[type.numberM, { color: card.marketCents != null ? color.ink : color.secondary }]}>
          {card.marketCents != null ? money(card.marketCents) : '—'}
        </Text>
        {change != null ? (
          <Text style={[type.caption, { color: change >= 0 ? color.gain : color.loss }]}>
            {pct(change)} {days}d
          </Text>
        ) : (
          <Text style={[type.caption, { color: color.secondary }]}>raw</Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  gutter: { paddingHorizontal: space.gutter },
  nav: { flexDirection: 'row', paddingHorizontal: space.gutter - 10 },
  field: {
    height: size.touch,
    borderRadius: radius.field,
    backgroundColor: color.well,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s,
    paddingHorizontal: space.m,
  },
  input: { flex: 1, color: color.ink, paddingVertical: 0, height: size.touch },
  row: {
    minHeight: size.rowVault,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    paddingHorizontal: space.gutter,
    paddingVertical: space.s,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: space.gutter,
    paddingTop: space.m,
    paddingBottom: space.xs,
    backgroundColor: color.canvas,
  },
  control: { minHeight: size.touch - 12, justifyContent: 'center' },
  menu: {
    position: 'absolute',
    right: space.gutter,
    width: 230,
    borderRadius: radius.field,
    backgroundColor: color.canvas,
    paddingVertical: space.xs,
    ...shadow.menu,
  },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: space.s, paddingHorizontal: space.gutter, minHeight: size.touch },
  scrim: { backgroundColor: color.scrim },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '80%',
    backgroundColor: color.canvas,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingTop: space.s,
  },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, backgroundColor: color.hairline, marginBottom: space.s },
  sheetHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: space.gutter,
    paddingVertical: space.m,
  },
  sheetSection: { paddingTop: space.m, paddingBottom: space.s },
  sectionTitle: { color: color.ink, fontWeight: '600', paddingHorizontal: space.gutter, paddingBottom: space.s },
  header: { position: 'absolute', left: 0, right: 0, zIndex: 1, backgroundColor: color.canvas },
  statusCover: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2, backgroundColor: color.canvas },
  controlsRight: { flexDirection: 'row', alignItems: 'center', gap: space.s, marginRight: -10 },
  gridRow: { gap: GRID_GAP, paddingHorizontal: space.gutter, paddingBottom: space.xxl },
  tileArt: { borderRadius: radius.thumb * 2, backgroundColor: color.well, overflow: 'hidden' },
  thumb: { width: size.thumbW, height: size.thumbH, borderRadius: radius.thumb, backgroundColor: color.well, overflow: 'hidden' },
});
