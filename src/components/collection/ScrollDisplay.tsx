// One slab at a time, full size, swipe sideways through the collection.
// The centered slab is posed and full scale; its neighbours sit smaller and quieter. Each slab
// stands on a soft reflection (the Shoulder photo spread: flipped copy at 28%, faded within the
// top third). Rows are memoized and art is prefetched, so nothing re-renders or reloads mid-swipe.

import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Animated, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { CardRow } from '../../pricing/portfolio';
import { color, size, space, type } from '../../theme/tokens';
import { prefetchArt } from '../ArtImage';
import { SlabView } from '../SlabView';
import { Caption } from './GridView';

const GAP = space.s;
const REFLECTION = { opacity: 0.28, height: 0.34, fadeAt: 0.38 } as const;

type ItemProps = {
  row: CardRow;
  n: number;
  x: Animated.Value;
  step: number;
  slabW: number;
  slabH: number;
  onPress: (n: number) => void;
};

const Item = memo(function Item({ row, n, x, step, slabW, slabH, onPress }: ItemProps) {
  const range = [(n - 1) * step, n * step, (n + 1) * step];
  const scale = x.interpolate({ inputRange: range, outputRange: [0.86, 1, 0.86], extrapolate: 'clamp' });
  const opacity = x.interpolate({ inputRange: range, outputRange: [0.45, 1, 0.45], extrapolate: 'clamp' });
  const reflH = slabH * REFLECTION.height;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={row.card.name}
      onPress={() => onPress(n)}
      style={{ width: step, alignItems: 'center', paddingTop: space.xl }}
    >
      <Animated.View style={{ transform: [{ scale }], opacity, alignItems: 'center' }}>
        <SlabView card={row.card} width={slabW} />
        <View pointerEvents="none" style={{ width: slabW, height: reflH, overflow: 'hidden', marginTop: 3 }}>
          <View style={{ height: slabH, opacity: REFLECTION.opacity, transform: [{ scaleY: -1 }], marginTop: reflH - slabH }}>
            <SlabView card={row.card} width={slabW} />
          </View>
          <LinearGradient
            colors={[`${color.canvas}00`, color.canvas]}
            // Fade within the top 38% of the slab's height (the visible strip is 34%), as in Shoulder.
            locations={[0, 1]}
            style={StyleSheet.absoluteFill}
          />
        </View>
      </Animated.View>
    </Pressable>
  );
});

export function ScrollDisplay({ rows, screenW }: { rows: CardRow[]; screenW: number }) {
  const slabW = Math.min(size.carouselSlabW, screenW - space.gutter * 2 - 80);
  const slabH = (slabW * size.heroH) / size.heroW;
  const step = slabW + GAP;
  const side = (screenW - slabW) / 2;
  const x = useRef(new Animated.Value(0)).current;
  const list = useRef<FlatList<CardRow>>(null);
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const i = Math.min(index, Math.max(0, rows.length - 1));
  const current = rows[i];

  useEffect(() => {
    prefetchArt(rows.map((r) => r.card.imageFrontUrl));
  }, [rows]);

  const onPress = useCallback(
    (n: number) => {
      if (n === indexRef.current) router.push(`/card/${rows[n].card.id}`);
      else list.current?.scrollToOffset({ offset: n * step, animated: true });
    },
    [rows, step],
  );

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
        // Keep neighbours mounted so their art is already decoded when they slide in.
        windowSize={7}
        initialNumToRender={5}
        maxToRenderPerBatch={5}
        removeClippedSubviews={false}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x } } }], {
          useNativeDriver: true,
          listener: (e: { nativeEvent: { contentOffset: { x: number } } }) => {
            const n = Math.max(0, Math.min(rows.length - 1, Math.round(e.nativeEvent.contentOffset.x / step)));
            if (n !== indexRef.current) {
              indexRef.current = n;
              setIndex(n);
            }
          },
        })}
        scrollEventThrottle={16}
        getItemLayout={(_, n) => ({ length: step, offset: step * n, index: n })}
        renderItem={({ item, index: n }) => (
          <Item row={item} n={n} x={x} step={step} slabW={slabW} slabH={slabH} onPress={onPress} />
        )}
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
