// Card search: any card in TCGplayer's catalog (Pokémon EN/JP, One Piece, Riftbound), not just
// the vault. Results show tonight's raw market; open a card for PSA prices with charts.
// Typing, filtering and sorting only query our own catalog table, never a paid API.
// Quiet controls under the field: "Filter" (language, rarity, set), the sort dropdown, and
// List / Grid (remembered, like home's view switch). Scrolling down slides the whole header away
// (title, game tabs, field, control row and filter chips) so results get the screen. Scrolling up
// anywhere brings back the field and the control row under it (Bryan: no scrolling all the way up
// to search again); the title and game tabs return at the top. Also the Search tab (app/(tabs)/find).

import { router, useLocalSearchParams, useSegments } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Animated, FlatList, Modal, type NativeScrollEvent, type NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { sheetTop } from '../../src/lib/sheetTop';
import { ArtImage } from '../../src/components/ArtImage';
import { SheetScope, SheetScrollView, useSheetDrag } from '../../src/components/sheet/useSheetDrag';
import { SEARCH_MODES, ViewSwitch } from '../../src/components/collection/ViewSwitch';
import { BackIcon, Hairline, IconButton, PrimaryButton, SearchIcon } from '../../src/components/ui';
import { cardPrice, money, pct, promoTag } from '../../src/lib/format';
import { CardName } from '../../src/components/CardName';
import { buyPrices, cardNumber, displayName, type Game } from '../../src/services/search';
import { sealedLabel, typeLabel, type TypeFilter } from '../../src/lib/sealed';
import {
  catalogProgress,
  changeOf,
  chips,
  LANGUAGE_NAME,
  toggle,
  withoutChip,
  type Lang,
  EMPTY_QUERY,
  filterCount,
  findCards,
  findFacets,
  NO_FILTERS,
  runnable,
  SORTS,
  type Facets,
  type Found,
  type Query,
  type Sort,
} from '../../src/services/searchFilters';
import { useDisplay } from '../../src/store/display';
import { useRecent } from '../../src/store/recent';
import { SearchLanding } from '../../src/components/search/SearchLanding';
import { useRules } from '../../src/store/rules';
import { radius, shadow, size, space, type } from '../../src/theme/tokens';
import { themed, useColors } from '../../src/theme/theme';
import type { PricingRules } from '../../src/types';
import { ART_TYPES, ART_TYPES_BY_GAME, artLabel, type ArtType } from '../../src/lib/artType';

type GameFilter = 'all' | Game;
const GRID_GAP = space.l;

export default function Search() {
  const color = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  // Con mode opens search with ?con=1: each result also shows what to pay, from the buying rules.
  // The trade calculator opens it with ?trade=1: a card opens with "Add to their side".
  const params = useLocalSearchParams<{ con?: string; q?: string; trade?: string; want?: string }>();
  // From the Wishlist's "Add a card": search, then the card page, where you add it at a grade.
  const want = params.want === '1';
  const con = params.con === '1';
  const trade = params.trade === '1';
  const asTab = useSegments()[0] === '(tabs)';
  const rules = useRules((s) => s.rules);
  const { searchLayout: layout, setSearchLayout } = useDisplay();
  const { width } = useWindowDimensions();
  const cellW = Math.floor((width - space.gutter * 2 - GRID_GAP) / 2);
  // The scan's "Search cards" opens with the name it read already typed (?q=Snivy).
  const [f, setF] = useState<Query>(() => ({ ...EMPTY_QUERY, q: typeof params.q === 'string' ? params.q : '' }));
  const set = (patch: Partial<Query>) => setF((prev) => ({ ...prev, ...patch }));
  const [results, setResults] = useState<Found[]>([]);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [sortOpen, setSortOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [menuTop, setMenuTop] = useState(0);
  const [topH, setTopH] = useState(0); // title and game tabs: back only at the top
  const [headerH, setHeaderH] = useState(0); // all of it, field, control row and chips included
  const controlsRef = useRef<ComponentRef<typeof View>>(null);
  const listRef = useRef<FlatList<Found>>(null);
  const scrollY = useRef(new Animated.Value(0)).current;
  // How far the header is slid up. The top part follows the list exactly; the field and control row
  // under it hide on scroll down and come back on any scroll up, so search is always one flick away.
  const slide = useRef(new Animated.Value(0)).current;
  const scrollState = useRef({ y: 0, rowHidden: 0 });
  const onListScroll = (y: number) => {
    const st = scrollState.current;
    const rowH = Math.max(0, headerH - topH);
    const top = Math.max(0, y);
    st.rowHidden = Math.max(0, Math.min(rowH, st.rowHidden + top - st.y));
    st.y = top;
    slide.setValue(-Math.min(top, topH + st.rowHidden));
  };
  const settle = (y: number, velocity: number) => {
    if (velocity !== 0 || y <= 0 || y >= topH) return;
    listRef.current?.scrollToOffset({ offset: y < topH / 2 ? 0 : topH, animated: true });
  };
  // Switching list and grid remounts the list at the top, without a scroll event.
  useEffect(() => {
    scrollState.current = { y: 0, rowHidden: 0 };
    slide.setValue(0);
  }, [layout, slide]);
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

  // A search that found something and was left standing for a moment counts as a recent search.
  useEffect(() => {
    const q = f.q.trim();
    if (state !== 'done' || !results.length || q.length < 2) return;
    const t = setTimeout(() => useRecent.getState().addQuery(q), 1500);
    return () => clearTimeout(t);
  }, [state, results, f.q]);

  const loading = progress != null && progress.total > 0 && progress.done < progress.total;
  const loadingLine = loading ? ` The catalog is still loading (${progress!.done} of ${progress!.total} sets), so some cards aren’t in yet.` : '';
  const nFilters = filterCount(f);
  const changeKey = changeOf(f.sort);
  const hint =
    state === 'idle'
      ? `Search any card or sealed product by name, set or number.${loadingLine}`
      : state === 'error'
        ? 'Search isn’t reachable right now.'
        : state === 'done' && !results.length
          ? changeKey
            ? 'No price changes yet for these cards. Rise and drop sorts fill in as nightly prices build up (7 days for 7-day change).'
            : `No cards match${nFilters ? ' with these filters' : ` “${f.q.trim()}”`}.${loadingLine}`
          : null;
  const sortLabel = SORTS.find((s) => s.value === f.sort)!.label;
  // As a sheet (con mode) the top inset is the sheet's, not the status bar's. Header, cover and
  // list all have to use the same number, or the first results sit under the header.
  const top = sheetTop(insets.top, con);

  return (
    <View style={{ flex: 1, backgroundColor: color.canvas }}>
      <Animated.View
        style={[styles.header, { top, transform: [{ translateY: slide }] }]}
        onLayout={(e) => setHeaderH(e.nativeEvent.layout.height)}
      >
        <View onLayout={(e) => setTopH(e.nativeEvent.layout.height)}>
          {/* As the Search tab it's a top-level screen: no back button. */}
          {asTab ? (
            <View style={{ height: space.l }} />
          ) : (
            <View style={styles.nav}>
              <IconButton label="Back" onPress={() => router.back()}>
                <BackIcon />
              </IconButton>
            </View>
          )}
          <View style={styles.gutter}>
            {/* The tab bar already says Search; the tab keeps its header slim. */}
            {asTab ? null : <Text style={[type.title, { color: color.ink, paddingBottom: space.m }]}>{con ? 'Search to buy' : want ? 'Add to wishlist' : 'Search'}</Text>}
            <GameTabs
              value={f.game ?? 'all'}
              onChange={(g) =>
                // Sets and rarities belong to one game; Japanese only exists for Pokémon.
                set({
                  game: g === 'all' ? null : g,
                  sets: [],
                  rarities: [],
                  languages: g === 'all' || g === 'pokemon' ? f.languages : [],
                  // Keep art types the new game has (One Piece has no illustration rares).
                  arts: g === 'all' ? f.arts : (f.arts ?? []).filter((a) => ART_TYPES_BY_GAME[g].includes(a)),
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
        {/* The field sits just above the control row so a mid-list scroll up brings both back. */}
        <View style={styles.gutter}>
          <View style={styles.field}>
            <SearchIcon s={18} tint={color.secondary} />
            <TextInput
              value={f.q}
              onChangeText={(q) => set({ q })}
              // Pushed (con's Search to buy, a scan's name): type straight away. The tab never does:
              // it opens onto its landing, keyboard down until you tap the field.
              autoFocus={!asTab}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              clearButtonMode="while-editing"
              placeholder={f.sets.length === 1 ? `Search ${f.sets[0].name}` : 'Card, set or number'}
              placeholderTextColor={color.secondary}
              style={[type.body, styles.input]}
              accessibilityLabel="Search cards"
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
        {runnable(f) && filterCount(f) ? (
          // What's applied, newest last; tap one to take it off.
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
            {chips(f).map((c) => (
              <Pressable
                key={`${c.kind}:${c.key}`}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${c.label}`}
                onPress={() => setF((prev) => withoutChip(prev, c))}
                style={({ pressed }) => [styles.chip, pressed && { opacity: 0.6 }]}
              >
                <Text numberOfLines={1} style={[type.secondary, { color: color.ink, maxWidth: 180 }]}>
                  {c.label}
                </Text>
                <Text style={[type.secondary, { color: color.secondary }]}>×</Text>
              </Pressable>
            ))}
            {filterCount(f) > 1 ? (
              <Pressable accessibilityRole="button" onPress={() => set(NO_FILTERS)} hitSlop={8} style={styles.chipClear}>
                <Text style={[type.secondary, { color: color.secondary }]}>Clear</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        ) : null}
        {/* A hairline under the header once results scroll beneath it. */}
        <Animated.View
          style={{
            height: StyleSheet.hairlineWidth * 2,
            backgroundColor: color.hairline,
            opacity: scrollY.interpolate({ inputRange: [0, 8], outputRange: [0, 1], extrapolate: 'clamp' }),
          }}
        />
      </Animated.View>
      {/* Covers the status bar so the header slides under it. */}
      <View style={[styles.statusCover, { height: top }]} />

      {headerH ? (
        <Animated.FlatList
          ref={listRef}
          key={layout}
          data={hint ? [] : results}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
            useNativeDriver: true,
            listener: (e: NativeSyntheticEvent<NativeScrollEvent>) => onListScroll(e.nativeEvent.contentOffset.y),
          })}
          scrollEventThrottle={16}
          // Never leave the title and game tabs half under the status bar: settle shown or hidden.
          onScrollEndDrag={(e) => settle(e.nativeEvent.contentOffset.y, e.nativeEvent.velocity?.y ?? 0)}
          onMomentumScrollEnd={(e) => settle(e.nativeEvent.contentOffset.y, 0)}
          scrollIndicatorInsets={{ top: headerH }}
          style={{ paddingTop: top }}
          // Last results stay reachable above the keyboard instead of hiding behind it.
          automaticallyAdjustKeyboardInsets
          ListEmptyComponent={
            state === 'idle' && !con && !trade && !want ? (
              <SearchLanding
                onQuery={(q) => set({ q })}
                onOpen={(c) => openCard(c, false)}
                game={f.game}
                note={loading ? `The catalog is still loading (${progress!.done} of ${progress!.total} sets), so some cards aren’t in yet.` : null}
              />
            ) : hint ? (
              <Text style={[type.text, styles.gutter, { color: color.secondary, paddingTop: space.l }]}>{hint}</Text>
            ) : undefined
          }
          numColumns={layout === 'grid' ? 2 : 1}
          keyExtractor={(c) => String(c.productId)}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingBottom: insets.bottom + space.xl, paddingTop: headerH + (layout === 'grid' ? space.m : 0) }}
          columnWrapperStyle={layout === 'grid' ? styles.gridRow : undefined}
          ItemSeparatorComponent={layout === 'grid' ? undefined : () => <Hairline inset={space.gutter + size.thumbW + space.m} />}
          renderItem={({ item }) =>
            layout === 'grid' ? (
              <ResultTile card={item} width={cellW} con={con} trade={trade} rules={rules} change={changeKey ? item[changeKey] : null} days={changeKey === 'change7d' ? 7 : 30} />
            ) : (
              <ResultRow card={item} con={con} trade={trade} rules={rules} change={changeKey ? item[changeKey] : null} days={changeKey === 'change7d' ? 7 : 30} />
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
  const styles = useStyles();
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
 * Filters for the current search, from what actually matches it (with counts). Every group is
 * pick-several: art type, type (cards or sealed), languages (Pokémon only), rarities, sets. Changes apply as
 * you tap. Order (chosen in a design review, 2026-11-08): short, decisive groups first and the long
 * lists last. Art type leads (Bryan asked for it near the top); Rarity, its detailed version, sits
 * low so its 10–30 rows don't bury Language; Set, up to 40 rows, is last.
 * The scrim fades and the sheet slides as one motion, starting only once the sheet's height is
 * known, so nothing dims before the sheet is there.
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
  const color = useColors();
  const styles = useStyles();
  const [mounted, setMounted] = useState(open);
  const [sheetH, setSheetH] = useState(0);
  const progress = useRef(new Animated.Value(0)).current;
  // Pull down anywhere on the sheet, over the rows too, to close it.
  const sheet = useSheetDrag(onClose);

  useEffect(() => {
    if (open) setMounted(true);
    else if (mounted) {
      Animated.timing(progress, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setMounted(false));
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (open && mounted && sheetH) {
      sheet.reset();
      progress.setValue(0);
      Animated.timing(progress, { toValue: 1, duration: 260, useNativeDriver: true }).start();
    }
  }, [open, mounted, sheetH]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!mounted) return null;

  const showLanguage = !f.game || f.game === 'pokemon';
  const sets = facets?.sets ?? [];
  const rarities = facets?.rarities ?? [];
  const languages = (['en', 'ja'] as Lang[]).map((key) => ({ key, n: facets?.languages.find((x) => x.key === key)?.n ?? 0 }));
  // Keep picked sets and rarities visible even when they fall out of the facet list.
  const setRows = [...f.sets.filter((x) => !sets.some((s) => s.id === x.id)).map((x) => ({ ...x, n: 0 })), ...sets];
  const rarityRows = [...f.rarities.filter((r) => !rarities.some((x) => x.key === r)).map((key) => ({ key, n: 0 })), ...rarities];
  // Boxes and ETBs have no art type or rarity, so with only sealed kinds picked those groups hide.
  const sealedOnly = (f.types ?? []).length > 0 && !(f.types ?? []).includes('card');
  // Art type: what the matches have, in fixed order; with no search yet, what the game can have.
  const pickedArts = f.arts ?? [];
  const artRows: { key: ArtType; n: number }[] = facets
    ? [...facets.arts, ...pickedArts.filter((a) => !facets.arts.some((x) => x.key === a)).map((key) => ({ key, n: 0 }))].sort(
        (a, b) => ART_TYPES.indexOf(a.key) - ART_TYPES.indexOf(b.key),
      )
    : (f.game ? ART_TYPES_BY_GAME[f.game] : ART_TYPES).map((key) => ({ key, n: 0 }));
  // Type: Cards, then All sealed (once there's more than one kind), then each kind of sealed.
  const picked = f.types ?? [];
  const kinds = facets?.types ?? [];
  const sealedKinds = kinds.filter((t) => t.key !== 'card');
  const sealedN = sealedKinds.reduce((sum, t) => sum + t.n, 0);
  const typeRows: { key: TypeFilter; n: number }[] = [
    ...kinds.filter((t) => t.key === 'card'),
    ...(sealedKinds.length > 1 || picked.includes('sealed') ? [{ key: 'sealed' as TypeFilter, n: sealedN }] : []),
    ...sealedKinds,
    ...picked.filter((t) => !kinds.some((x) => x.key === t) && t !== 'sealed').map((key) => ({ key, n: 0 })),
  ];

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, { opacity: progress }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>
      <Animated.View
        onLayout={(e) => setSheetH(e.nativeEvent.layout.height)}
        {...sheet.panHandlers}
        style={[
          styles.sheet,
          { paddingBottom: bottom + space.l },
          sheetH
            ? { transform: [{ translateY: Animated.add(progress.interpolate({ inputRange: [0, 1], outputRange: [sheetH, 0] }), sheet.drag) }] }
            : { opacity: 0 },
        ]}
      >
        <SheetScope value={sheet.scope}>
        <View style={styles.grabber} />
        <View style={styles.sheetHead}>
          <Text style={[type.section, { color: color.ink }]}>Filter</Text>
          {filterCount(f) ? (
            <Pressable accessibilityRole="button" onPress={() => onChange(NO_FILTERS)} hitSlop={8}>
              <Text style={[type.text, { color: color.secondary }]}>Clear</Text>
            </Pressable>
          ) : null}
        </View>
        <SheetScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingBottom: space.l }}>
          {artRows.length && !sealedOnly ? (
            <View style={styles.sheetSection}>
              <Text style={[type.body, styles.sectionTitle]}>Art type</Text>
              {/* Pills, not rows: eight short choices fit in a few lines near the top. */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s, paddingHorizontal: space.gutter, paddingBottom: space.s }}>
                {artRows.map((a) => {
                  const on = pickedArts.includes(a.key);
                  return (
                    <Pressable
                      key={a.key}
                      accessibilityRole="button"
                      accessibilityLabel={a.n ? `${artLabel(a.key)}, ${a.n}` : artLabel(a.key)}
                      accessibilityState={{ selected: on }}
                      onPress={() => onChange({ arts: toggle(pickedArts, a.key) })}
                      hitSlop={{ top: 4, bottom: 4 }}
                      style={({ pressed }) => [
                        {
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: space.xs,
                          minHeight: size.chip + 6,
                          paddingHorizontal: space.m,
                          borderRadius: radius.chip + 3,
                          backgroundColor: on ? color.ink : color.well,
                        },
                        pressed && { opacity: 0.7 },
                      ]}
                    >
                      <Text style={[type.text, { color: on ? color.onInk : color.ink }]}>{artLabel(a.key)}</Text>
                      {a.n ? (
                        <Text style={[type.secondary, { color: on ? color.onInk : color.secondary, fontVariant: ['tabular-nums'], opacity: on ? 0.7 : 1 }]}>{a.n}</Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          {typeRows.length > 1 || picked.length ? (
            <View style={styles.sheetSection}>
              <Text style={[type.body, styles.sectionTitle]}>Type</Text>
              {typeRows.map((t) => (
                <CheckRow
                  key={t.key}
                  label={typeLabel(t.key)}
                  detail={t.n ? String(t.n) : undefined}
                  on={picked.includes(t.key)}
                  onPress={() => {
                    const types = toggle(picked, t.key);
                    // Picking only sealed drops art type and rarity picks, which no box can match.
                    onChange(types.length && !types.includes('card') ? { types, arts: [], rarities: [] } : { types });
                  }}
                />
              ))}
            </View>
          ) : null}

          {showLanguage ? (
            <View style={styles.sheetSection}>
              <Text style={[type.body, styles.sectionTitle]}>Language</Text>
              {languages.map((l) => (
                <CheckRow
                  key={l.key}
                  label={LANGUAGE_NAME[l.key]}
                  detail={l.n ? String(l.n) : undefined}
                  on={f.languages.includes(l.key)}
                  onPress={() => onChange({ languages: toggle(f.languages, l.key) })}
                />
              ))}
            </View>
          ) : null}

          {rarityRows.length && !sealedOnly ? (
            <View style={styles.sheetSection}>
              <Text style={[type.body, styles.sectionTitle]}>Rarity</Text>
              {rarityRows.map((r) => (
                <CheckRow
                  key={r.key}
                  label={r.key}
                  detail={r.n ? String(r.n) : undefined}
                  on={f.rarities.includes(r.key)}
                  onPress={() => onChange({ rarities: toggle(f.rarities, r.key) })}
                />
              ))}
            </View>
          ) : null}

          {setRows.length ? (
            <View style={styles.sheetSection}>
              <Text style={[type.body, styles.sectionTitle]}>Set</Text>
              {setRows.slice(0, 40).map((x) => (
                <CheckRow
                  key={x.id}
                  label={x.name}
                  detail={x.n ? String(x.n) : undefined}
                  on={f.sets.some((y) => y.id === x.id)}
                  onPress={() => onChange({ sets: toggle(f.sets, { id: x.id, name: x.name }, (a, b) => a.id === b.id) })}
                />
              ))}
            </View>
          ) : null}

          {!facets ? (
            <Text style={[type.text, styles.gutter, { color: color.secondary }]}>Type a search to see its sets and rarities.</Text>
          ) : null}
        </SheetScrollView>
        <View style={styles.gutter}>
          <PrimaryButton title={`Show ${count} ${count === 1 ? 'result' : 'results'}`} onPress={onClose} />
        </View>
        </SheetScope>
      </Animated.View>
    </Modal>
  );
}

function CheckRow({ label, detail, on, onPress }: { label: string; detail?: string; on: boolean; onPress: () => void }) {
  const color = useColors();
  const styles = useStyles();
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

/** Which game to search: quiet words, the picked one in ink with a short underline. */
function GameTabs({ value, onChange, options }: { value: GameFilter; onChange: (g: GameFilter) => void; options: { value: GameFilter; label: string }[] }) {
  const color = useColors();
  return (
    <View style={{ flexDirection: 'row', gap: space.xl, height: size.touch, alignItems: 'center' }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => onChange(o.value)} hitSlop={6}>
            <Text style={[type.text, { color: on ? color.ink : color.secondary, fontWeight: on ? '600' : '400' }]}>{o.label}</Text>
            <View style={{ height: size.selectLine, marginTop: 4, backgroundColor: on ? color.ink : 'transparent', borderRadius: 1 }} />
          </Pressable>
        );
      })}
    </View>
  );
}

type ResultProps = { card: Found; con: boolean; trade?: boolean; rules: PricingRules; change: number | null; days: number };

// Con mode's Buying goes straight to "They're asking" for the card (the full card page is a link
// there); the trade calculator opens the card page with "Add to their side".
const openCard = (card: Found, con: boolean, trade = false) => {
  useRecent.getState().addViewed(card);
  if (trade) router.push(`/search/${card.productId}?trade=1`);
  else if (con) router.push({ pathname: '/con/buy/[id]', params: { id: String(card.productId), grade: 'psa10' } });
  else router.push(`/search/${card.productId}`);
};

/** Grid tile: the card photo, then name, set · number and price, like home's grid. */
function ResultTile({ card, width, con, trade, rules, change, days }: ResultProps & { width: number }) {
  const color = useColors();
  const styles = useStyles();
  const no = cardNumber(card.number);
  const buy = con ? buyPrices(card.marketCents, rules) : null;
  const sealed = card.sealedType;
  return (
    <Pressable accessibilityRole="button" onPress={() => openCard(card, con, trade)} style={({ pressed }) => [{ width }, pressed && { opacity: 0.85 }]}>
      {/* A box photo sits on the canvas, whole; a card fills its card-shaped tile. */}
      <View style={[sealed ? styles.tileSealed : styles.tileArt, { width, height: Math.round((width * 88) / 63) }]}>
        <ArtImage uri={card.imageUrl} label={card.name} recyclingKey={String(card.productId)} fit={sealed ? 'contain' : 'cover'} style={{ flex: 1 }} />
      </View>
      <View style={{ gap: 2, paddingTop: space.m }}>
        <CardName name={sealed ? card.name : displayName(card.name)} language={card.language} numberOfLines={sealed ? 3 : 1} style={[type.text, { color: color.ink, fontWeight: '500' }]} />
        <Text numberOfLines={1} style={[type.secondary, { color: color.secondary }]}>
          {(sealed ? [sealedLabel(sealed)] : [no && `#${no}`, promoTag(card, { setShown: true }), card.setName]).filter(Boolean).join(' · ')}
        </Text>
        <Text numberOfLines={1} style={[type.secondary, { color: color.secondary }]}>
          {sealed ? 'market' : 'raw'} <Text style={{ color: color.ink }}>{card.marketCents != null ? cardPrice(card.marketCents) : '—'}</Text>
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

function ResultRow({ card, con, trade, rules, change, days }: ResultProps) {
  const color = useColors();
  const styles = useStyles();
  const no = cardNumber(card.number);
  const buy = con ? buyPrices(card.marketCents, rules) : null;
  const sealed = card.sealedType;
  const sub = (sealed ? [sealedLabel(sealed)] : [card.setName, no && `#${no}`, promoTag(card, { setShown: true })]).filter(Boolean).join(' · ');
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => openCard(card, con, trade)}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.5 }]}
    >
      <View style={sealed ? styles.thumbSealed : styles.thumb}>
        <ArtImage uri={card.imageUrl} label={card.name} recyclingKey={String(card.productId)} fit={sealed ? 'contain' : 'cover'} style={{ flex: 1 }} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <CardName name={sealed ? card.name : displayName(card.name)} language={card.language} numberOfLines={sealed ? 2 : 1} style={[type.body, { color: color.ink }]} />
        <Text numberOfLines={1} style={[type.secondary, { color: color.secondary }]}>
          {sub}
        </Text>
        {buy ? (
          <Text numberOfLines={1} style={[type.secondary, { color: color.ink, paddingTop: 2 }]}>
            {sealed ? 'Open' : 'Raw: open'} {money(buy.target)} · pay up to {money(buy.max)}
          </Text>
        ) : null}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[type.numberM, { color: card.marketCents != null ? color.ink : color.secondary }]}>
          {card.marketCents != null ? cardPrice(card.marketCents) : '—'}
        </Text>
        {change != null ? (
          <Text style={[type.caption, { color: change >= 0 ? color.gain : color.loss }]}>
            {pct(change)} {days}d
          </Text>
        ) : (
          <Text style={[type.caption, { color: color.secondary }]}>{sealed ? 'market' : 'raw'}</Text>
        )}
      </View>
    </Pressable>
  );
}

const useStyles = themed((color) => StyleSheet.create({
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
    backgroundColor: color.sheet,
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
    backgroundColor: color.sheet,
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
  chips: { gap: space.s, paddingHorizontal: space.gutter, paddingBottom: space.s, alignItems: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    height: size.chip,
    paddingHorizontal: space.m,
    borderRadius: radius.chip,
    backgroundColor: color.well,
  },
  chipClear: { height: size.chip, justifyContent: 'center', paddingHorizontal: space.xs },
  controlsRight: { flexDirection: 'row', alignItems: 'center', gap: space.s, marginRight: -10 },
  gridRow: { gap: GRID_GAP, paddingHorizontal: space.gutter, paddingBottom: space.xxl },
  tileArt: { borderRadius: radius.thumb * 2, backgroundColor: color.well, overflow: 'hidden' },
  thumb: { width: size.thumbW, height: size.thumbH, borderRadius: radius.thumb, backgroundColor: color.well, overflow: 'hidden' },
  tileSealed: { borderRadius: radius.thumb * 2, overflow: 'hidden' },
  thumbSealed: { width: size.thumbW, height: size.thumbH },
}));
