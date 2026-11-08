// All / Pokémon / One Piece / Riftbound, under the search field on home and in con mode.
// Shown only when the cards span more than one game; with one game there's nothing to filter.

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GAMES, type GameFilter } from '../../lib/games';
import type { Game } from '../../types';
import { radius, size, space, type } from '../../theme/tokens';
import { themed, useColors } from '../../theme/theme';

type Props = {
  /** The games in the cards being filtered, from gamesIn(). */
  games: Game[];
  value: GameFilter;
  onChange: (g: GameFilter) => void;
};

export function GamePills({ games, value, onChange }: Props) {
  const color = useColors();
  const styles = useStyles();
  if (games.length < 2) return null;
  const options: { id: GameFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    ...games.map((g) => ({ id: g, label: GAMES[g].name })),
  ];
  return (
    <View style={styles.row} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable
            key={o.id}
            accessibilityRole="tab"
            accessibilityLabel={o.id === 'all' ? 'All games' : o.label}
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.id)}
            hitSlop={{ top: 7, bottom: 7 }}
            style={[styles.pill, { backgroundColor: on ? color.ink : color.well }]}
          >
            <Text style={[type.text, { color: on ? color.onInk : color.ink }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = themed(() =>
  StyleSheet.create({
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s, marginTop: space.m },
    pill: {
      height: size.chip,
      paddingHorizontal: space.m,
      borderRadius: radius.chip,
      justifyContent: 'center',
    },
  }),
);
