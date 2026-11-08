// Search field and sort choice under the filter tabs. Always shown, so nothing below jumps.

import { useRef, type ComponentRef } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { SORT_LABEL, type SortKey } from '../../pricing/arrange';
import { openDropdown } from '../menu/Dropdown';
import { GAMES, type GameFilter } from '../../lib/games';
import type { Game } from '../../types';
import { radius, size, space, type } from '../../theme/tokens';
import { themed, useColors } from '../../theme/theme';

const SORTS: SortKey[] = ['value', 'gain', 'newest', 'name', 'mine'];

type Props = {
  query: string;
  onQuery: (q: string) => void;
  sort: SortKey;
  onSort: (s: SortKey) => void;
  /** Which sorts to offer; con mode leaves out "My order". Defaults to all of them. */
  sorts?: SortKey[];
  /**
   * Game filter: a quiet filter button after the sort, shown only when the cards span more than one
   * game. It fills in black while a game is picked.
   */
  game?: { games: Game[]; value: GameFilter; onChange: (g: GameFilter) => void };
};

export function SearchSort({ query, onQuery, sort, onSort, sorts = SORTS, game }: Props) {
  const color = useColors();
  const styles = useStyles();
  // Opens right under the sort button, like the home … menu.
  const sortRef = useRef<ComponentRef<typeof View>>(null);
  const pickSort = () =>
    openDropdown(
      sortRef,
      sorts.map((s) => ({ label: SORT_LABEL[s], selected: s === sort, onPress: () => onSort(s) })),
    );
  const gameRef = useRef<ComponentRef<typeof View>>(null);
  const showGame = !!game && game.games.length > 1;
  const gameOn = showGame && game.value !== 'all';
  const pickGame = () =>
    game &&
    openDropdown(gameRef, [
      { label: 'All games', selected: game.value === 'all', onPress: () => game.onChange('all') },
      ...game.games.map((g) => ({ label: GAMES[g].name, selected: game.value === g, onPress: () => game.onChange(g) })),
    ]);
  return (
    <View style={styles.row}>
      <View style={styles.field}>
        <Svg width={16} height={16} viewBox="0 0 16 16" fill="none" stroke={color.secondary} strokeWidth={1.6} strokeLinecap="round">
          <Circle cx={7} cy={7} r={5} />
          <Path d="M11 11l3.5 3.5" />
        </Svg>
        <TextInput
          value={query}
          onChangeText={onQuery}
          placeholder="Search name, set or cert"
          placeholderTextColor={color.secondary}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          clearButtonMode="while-editing"
          style={[type.text, styles.input]}
        />
      </View>
      <View ref={sortRef} collapsable={false}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Sort by ${SORT_LABEL[sort]}`} onPress={pickSort} style={styles.sort}>
          <Text style={[type.text, { color: color.ink }]}>{SORT_LABEL[sort]}</Text>
          <Svg width={10} height={10} viewBox="0 0 10 10" fill="none" stroke={color.secondary} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M2 3.5l3 3 3-3" />
          </Svg>
        </Pressable>
      </View>
      {showGame ? (
        <View ref={gameRef} collapsable={false}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={gameOn ? `Showing ${GAMES[game.value as Game].name} only. Change game` : 'Filter by game'}
            onPress={pickGame}
            hitSlop={{ left: 4, right: 4 }}
            style={styles.filter}
          >
            <View style={[styles.filterDisc, gameOn && { backgroundColor: color.ink }]}>
              <Svg width={16} height={16} viewBox="0 0 16 16" fill="none" stroke={gameOn ? color.onInk : color.ink} strokeWidth={1.6} strokeLinecap="round">
                <Path d="M2.5 4.5h11M4.5 8h7M6.5 11.5h3" />
              </Svg>
            </View>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const useStyles = themed((color) => StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.m },
  field: {
    flex: 1,
    height: 36,
    borderRadius: radius.segmented,
    backgroundColor: color.well,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s,
    paddingHorizontal: space.m,
  },
  input: { flex: 1, color: color.ink, paddingVertical: 0, height: 36 },
  sort: { height: size.touch, flexDirection: 'row', alignItems: 'center', gap: space.xs },
  filter: { height: size.touch, justifyContent: 'center', marginLeft: -space.xs },
  filterDisc: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
}));
