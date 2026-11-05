// Search field and sort choice under the filter tabs. Always shown, so nothing below jumps.

import { ActionSheetIOS, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { SORT_LABEL, type SortKey } from '../../pricing/arrange';
import { color, radius, size, space, type } from '../../theme/tokens';

const SORTS: SortKey[] = ['value', 'gain', 'newest', 'name', 'mine'];

type Props = {
  query: string;
  onQuery: (q: string) => void;
  sort: SortKey;
  onSort: (s: SortKey) => void;
};

export function SearchSort({ query, onQuery, sort, onSort }: Props) {
  const pickSort = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { title: 'Sort by', options: [...SORTS.map((s) => SORT_LABEL[s]), 'Cancel'], cancelButtonIndex: SORTS.length },
        (i) => i < SORTS.length && onSort(SORTS[i]),
      );
    } else {
      onSort(SORTS[(SORTS.indexOf(sort) + 1) % SORTS.length]);
    }
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
      <Pressable accessibilityRole="button" accessibilityLabel={`Sort by ${SORT_LABEL[sort]}`} onPress={pickSort} style={styles.sort}>
        <Text style={[type.text, { color: color.ink }]}>{SORT_LABEL[sort]}</Text>
        <Svg width={10} height={10} viewBox="0 0 10 10" fill="none" stroke={color.secondary} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M2 3.5l3 3 3-3" />
        </Svg>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
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
});
