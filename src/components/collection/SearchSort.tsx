// Search field and sort choice under the filter tabs. Always shown, so nothing below jumps.

import { useRef, type ComponentRef } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { SORT_LABEL, type SortKey } from '../../pricing/arrange';
import { openDropdown } from '../menu/Dropdown';
import { GAMES, hasChoices, setsFor, type CardPick, type FilterMenu } from '../../lib/games';
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
   * Game and set filter: a quiet button after the sort, shown when there's something to pick (two
   * games, or one game with two sets). Its dropdown lists the games; tapping one picks it and opens
   * a second dropdown with that game's sets. It fills in black while anything is picked.
   */
  filter?: { menu: FilterMenu; value: CardPick; onChange: (p: CardPick) => void };
};

export function SearchSort({ query, onQuery, sort, onSort, sorts = SORTS, filter }: Props) {
  const color = useColors();
  const styles = useStyles();
  // Opens right under the sort button, like the home … menu.
  const sortRef = useRef<ComponentRef<typeof View>>(null);
  const pickSort = () =>
    openDropdown(
      sortRef,
      sorts.map((s) => ({ label: SORT_LABEL[s], selected: s === sort, onPress: () => onSort(s) })),
    );
  const filterRef = useRef<ComponentRef<typeof View>>(null);
  const showFilter = !!filter && hasChoices(filter.menu);
  const filterOn = showFilter && (filter.value.game !== 'all' || !!filter.value.set);
  // Second level: one game's sets (or, in a one-game vault, the only level).
  const pickSet = (g: Game | 'all', value: CardPick) => {
    if (!filter) return;
    const { menu, onChange } = filter;
    const sets = setsFor(menu, g);
    const allLabel = g === 'all' ? 'All sets' : `All ${GAMES[g].name}`;
    openDropdown(filterRef, [
      [{ label: allLabel, selected: value.game === g && !value.set, onPress: () => onChange({ game: g, set: null }) }],
      sets.map((st) => ({
        label: st.name,
        detail: String(st.count),
        selected: value.game === g && value.set === st.name,
        onPress: () => onChange({ game: g, set: st.name }),
      })),
    ]);
  };
  const openFilter = () => {
    if (!filter) return;
    const { menu, value, onChange } = filter;
    if (menu.games.length < 2) return pickSet('all', value);
    openDropdown(filterRef, [
      [{ label: 'All games', selected: value.game === 'all', onPress: () => onChange({ game: 'all', set: null }) }],
      menu.games.map((g) => ({
        label: GAMES[g].name,
        // The picked set, or how many cards; the chevron says a list of sets follows.
        detail: `${value.game === g && value.set ? value.set : (menu.counts[g] ?? 0)} ›`,
        selected: value.game === g,
        onPress: () => {
          // Picking the game applies at once; the sets dropdown narrows it further if wanted.
          const next = value.game === g ? value : { game: g, set: null };
          if (next !== value) onChange(next);
          if ((menu.sets[g]?.length ?? 0) > 1) pickSet(g, next);
        },
      })),
    ]);
  };
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
      {showFilter ? (
        <View ref={filterRef} collapsable={false}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={filterOn ? 'Filter on. Change game or set' : 'Filter by game or set'}
            onPress={openFilter}
            hitSlop={{ left: 4, right: 4 }}
            style={styles.filter}
          >
            <View style={[styles.filterDisc, filterOn && { backgroundColor: color.ink }]}>
              <Svg width={16} height={16} viewBox="0 0 16 16" fill="none" stroke={filterOn ? color.onInk : color.ink} strokeWidth={1.6} strokeLinecap="round">
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
