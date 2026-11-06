// Card search: any card in TCGplayer's catalog (Pokémon EN/JP, One Piece, Riftbound), not just
// the vault. Results show tonight's raw market; open a card for PSA 10/9/8 with charts.
// Typing only queries our own catalog table, never a paid API.

import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArtImage } from '../../src/components/ArtImage';
import { Segmented } from '../../src/components/Segmented';
import { BackIcon, Hairline, IconButton, SearchIcon } from '../../src/components/ui';
import { money } from '../../src/lib/format';
import {
  arrange,
  buyPrices,
  cardNumber,
  displayName,
  searchCards,
  SORT_LABEL,
  type CatalogCard,
  type Game,
  type SearchLanguage,
  type SearchSort,
} from '../../src/services/search';
import { useRules } from '../../src/store/rules';
import { color, radius, shadow, size, space, type } from '../../src/theme/tokens';
import type { PricingRules } from '../../src/types';

type GameFilter = 'all' | Game;

export default function Search() {
  const insets = useSafeAreaInsets();
  // Con mode opens search with ?con=1: each result also shows what to pay, from the buying rules.
  const con = useLocalSearchParams<{ con?: string }>().con === '1';
  const rules = useRules((s) => s.rules);
  const [q, setQ] = useState('');
  const [game, setGame] = useState<GameFilter>('all');
  const [results, setResults] = useState<CatalogCard[]>([]);
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [sort, setSort] = useState<SearchSort>('best');
  const [language, setLanguage] = useState<SearchLanguage>('all');
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuTop, setMenuTop] = useState(0);
  const latest = useRef(0);
  const shown = useMemo(() => arrange(results, sort, language), [results, sort, language]);
  // Japanese only exists for Pokémon; other games drop the language filter.
  const showLanguage = game === 'all' || game === 'pokemon';
  useEffect(() => {
    if (!showLanguage) setLanguage('all');
  }, [showLanguage]);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setResults([]);
      setState('idle');
      return;
    }
    const id = ++latest.current;
    setState('loading');
    const t = setTimeout(() => {
      searchCards(query, game === 'all' ? null : game)
        .then((r) => {
          if (id !== latest.current) return;
          setResults(r);
          setState('done');
        })
        .catch(() => id === latest.current && setState('error'));
    }, 250);
    return () => clearTimeout(t);
  }, [q, game]);

  const hint =
    state === 'idle'
      ? 'Search any card by name, set or number.'
      : state === 'error'
        ? 'Search isn’t reachable right now.'
        : state === 'done' && !results.length
          ? `No cards match “${q.trim()}”.`
          : state === 'done' && !shown.length
            ? `No ${language === 'ja' ? 'Japanese' : 'English'} cards match “${q.trim()}”.`
            : null;
  const sortLine = [language === 'ja' ? 'Japanese' : language === 'en' ? 'English' : null, SORT_LABEL[sort]].filter(Boolean).join(' · ');

  return (
    <View style={{ flex: 1, backgroundColor: color.canvas, paddingTop: insets.top }}>
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
            value={q}
            onChangeText={setQ}
            autoFocus
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            clearButtonMode="while-editing"
            placeholder="Umbreon VMAX 215"
            placeholderTextColor={color.secondary}
            style={[type.body, styles.input]}
            accessibilityLabel="Search cards"
          />
        </View>
        <Segmented<GameFilter>
          style={{ marginTop: space.m, marginBottom: space.s }}
          value={game}
          onChange={setGame}
          options={[
            { value: 'all', label: 'All' },
            { value: 'pokemon', label: 'Pokémon' },
            { value: 'onepiece', label: 'One Piece' },
            { value: 'riftbound', label: 'Riftbound' },
          ]}
        />
      </View>

      {results.length ? (
        <View style={styles.controls} onLayout={(e) => setMenuTop(e.nativeEvent.layout.y + e.nativeEvent.layout.height)}>
          <Text style={[type.secondary, { color: color.secondary }]}>
            {shown.length} {shown.length === 1 ? 'card' : 'cards'}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Sort and filter" onPress={() => setMenuOpen(true)} hitSlop={8} style={styles.sortButton}>
            <Text style={[type.secondary, { color: color.ink, fontWeight: '500' }]}>{sortLine} ▾</Text>
          </Pressable>
        </View>
      ) : null}

      {hint ? (
        <Text style={[type.text, styles.gutter, { color: color.secondary, paddingTop: space.xl }]}>{hint}</Text>
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(c) => String(c.productId)}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingBottom: insets.bottom + space.xl }}
          ItemSeparatorComponent={() => <Hairline inset={space.gutter + size.thumbW + space.m} />}
          renderItem={({ item }) => <ResultRow card={item} con={con} rules={rules} />}
        />
      )}
      <SortMenu
        open={menuOpen}
        top={menuTop}
        sort={sort}
        language={language}
        showLanguage={showLanguage}
        onSort={setSort}
        onLanguage={setLanguage}
        onClose={() => setMenuOpen(false)}
      />
    </View>
  );
}

/** Small dropdown under the sort control: sort first, then language (Pokémon only). */
function SortMenu({
  open,
  top,
  sort,
  language,
  showLanguage,
  onSort,
  onLanguage,
  onClose,
}: {
  open: boolean;
  top: number;
  sort: SearchSort;
  language: SearchLanguage;
  showLanguage: boolean;
  onSort: (s: SearchSort) => void;
  onLanguage: (l: SearchLanguage) => void;
  onClose: () => void;
}) {
  const row = (label: string, on: boolean, press: () => void) => (
    <Pressable
      key={label}
      accessibilityRole="menuitem"
      accessibilityState={{ selected: on }}
      onPress={() => {
        press();
        onClose();
      }}
      style={({ pressed }) => [styles.menuRow, pressed && { backgroundColor: color.well }]}
    >
      <Text style={[type.text, { color: color.ink }]}>{label}</Text>
      {on ? <Text style={[type.text, { color: color.ink }]}>✓</Text> : null}
    </Pressable>
  );
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.menu, { top }]}>
        {(Object.keys(SORT_LABEL) as SearchSort[]).map((s) => row(SORT_LABEL[s], s === sort, () => onSort(s)))}
        {showLanguage ? (
          <>
            <Hairline />
            {(
              [
                ['all', 'All languages'],
                ['en', 'English'],
                ['ja', 'Japanese'],
              ] as const
            ).map(([l, label]) => row(label, l === language, () => onLanguage(l)))}
          </>
        ) : null}
      </View>
    </Modal>
  );
}

function ResultRow({ card, con, rules }: { card: CatalogCard; con: boolean; rules: PricingRules }) {
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
        <Text style={[type.caption, { color: color.secondary }]}>raw</Text>
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
  },
  sortButton: { minHeight: size.touch - 12, justifyContent: 'center' },
  menu: {
    position: 'absolute',
    right: space.gutter,
    width: 210,
    borderRadius: radius.field,
    backgroundColor: color.canvas,
    paddingVertical: space.xs,
    ...shadow.menu,
  },
  menuRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: space.l, height: size.touch },
  thumb: { width: size.thumbW, height: size.thumbH, borderRadius: radius.thumb, backgroundColor: color.well, overflow: 'hidden' },
});
