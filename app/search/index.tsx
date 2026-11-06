// Card search: any card in TCGplayer's catalog (Pokémon EN/JP, One Piece, Riftbound), not just
// the vault. Results show tonight's raw market; open a card for PSA 10/9/8 with charts.
// Typing only queries our own catalog table, never a paid API.

import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArtImage } from '../../src/components/ArtImage';
import { Segmented } from '../../src/components/Segmented';
import { BackIcon, Hairline, IconButton, SearchIcon } from '../../src/components/ui';
import { money } from '../../src/lib/format';
import { cardNumber, displayName, searchCards, type CatalogCard, type Game } from '../../src/services/search';
import { color, radius, size, space, type } from '../../src/theme/tokens';

type GameFilter = 'all' | Game;

export default function Search() {
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');
  const [game, setGame] = useState<GameFilter>('all');
  const [results, setResults] = useState<CatalogCard[]>([]);
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const latest = useRef(0);

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
          : null;

  return (
    <View style={{ flex: 1, backgroundColor: color.canvas, paddingTop: insets.top }}>
      <View style={styles.nav}>
        <IconButton label="Back" onPress={() => router.back()}>
          <BackIcon />
        </IconButton>
      </View>
      <View style={styles.gutter}>
        <Text style={[type.title, { color: color.ink, paddingBottom: space.l }]}>Search</Text>
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

      {hint ? (
        <Text style={[type.text, styles.gutter, { color: color.secondary, paddingTop: space.xl }]}>{hint}</Text>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(c) => String(c.productId)}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingBottom: insets.bottom + space.xl }}
          ItemSeparatorComponent={() => <Hairline inset={space.gutter + size.thumbW + space.m} />}
          renderItem={({ item }) => <ResultRow card={item} />}
        />
      )}
    </View>
  );
}

function ResultRow({ card }: { card: CatalogCard }) {
  const no = cardNumber(card.number);
  const sub = [card.setName, no && `#${no}`, card.language === 'ja' ? 'JP' : null].filter(Boolean).join(' · ');
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/search/${card.productId}`)}
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
  thumb: { width: size.thumbW, height: size.thumbH, borderRadius: radius.thumb, backgroundColor: color.well, overflow: 'hidden' },
});
