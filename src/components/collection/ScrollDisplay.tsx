// One slab at a time, full size, swipe sideways through the collection.
// The centered slab is posed and full scale; its neighbours sit smaller and quieter.

import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Animated, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { CardRow } from '../../pricing/portfolio';
import { color, size, space, type } from '../../theme/tokens';
import { SlabView } from '../SlabView';
import { Caption } from './GridView';

const GAP = space.s;

export function ScrollDisplay({ rows, screenW }: { rows: CardRow[]; screenW: number }) {
  const slabW = Math.min(size.carouselSlabW, screenW - space.gutter * 2 - 80);
  const slabH = (slabW * size.heroH) / size.heroW;
  const step = slabW + GAP;
  const side = (screenW - slabW) / 2;
  const x = useRef(new Animated.Value(0)).current;
  const list = useRef<FlatList<CardRow>>(null);
  const [index, setIndex] = useState(0);
  const i = Math.min(index, Math.max(0, rows.length - 1));
  const current = rows[i];

  return (
    <View>
      <Animated.FlatList
        ref={list}
        horizontal
        data={rows}
        keyExtractor={(r) => r.card.id}
        showsHorizontalScrollIndicator={false}
        snapToInterval={step}
        decelerationRate="fast"
        contentContainerStyle={{ paddingHorizontal: side - GAP / 2 }}
        style={{ height: slabH + space.xxxl }}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x } } }], {
          useNativeDriver: true,
          listener: (e: { nativeEvent: { contentOffset: { x: number } } }) => {
            const n = Math.round(e.nativeEvent.contentOffset.x / step);
            if (n !== index) setIndex(n);
          },
        })}
        scrollEventThrottle={16}
        getItemLayout={(_, n) => ({ length: step, offset: step * n, index: n })}
        renderItem={({ item, index: n }) => {
          const range = [(n - 1) * step, n * step, (n + 1) * step];
          const scale = x.interpolate({ inputRange: range, outputRange: [0.86, 1, 0.86], extrapolate: 'clamp' });
          const opacity = x.interpolate({ inputRange: range, outputRange: [0.45, 1, 0.45], extrapolate: 'clamp' });
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={item.card.name}
              onPress={() =>
                n === i
                  ? router.push(`/card/${item.card.id}`)
                  : list.current?.scrollToOffset({ offset: n * step, animated: true })
              }
              style={{ width: step, height: slabH + space.xxxl, alignItems: 'center', justifyContent: 'center' }}
            >
              <Animated.View style={{ transform: [{ scale }], opacity }}>
                <SlabView card={item.card} width={slabW} />
              </Animated.View>
            </Pressable>
          );
        }}
      />
      {current ? (
        <View style={styles.caption}>
          <Caption row={current} center />
          <Text style={[type.caption, { color: color.secondary }]}>
            {i + 1} of {rows.length}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  caption: { alignItems: 'center', gap: space.s, paddingHorizontal: space.gutter, paddingTop: space.s },
});
