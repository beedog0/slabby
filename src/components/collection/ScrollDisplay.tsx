// One slab at a time, full size, swipe sideways through the collection.
// Cover Flow style: every slab stays full size (scaling makes iOS resample the art, which reads
// as blur while swiping); neighbours lean away, drop back a little and dim. Each slab stands on a
// reflection of its own bottom edge (flipped copy at 28%, fading out). Rows are memoized and art
// is prefetched, so nothing re-renders or reloads mid-swipe.

import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import type React from 'react';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { CardRow } from '../../pricing/portfolio';
import { color, size, space, type } from '../../theme/tokens';
import { prefetchArt } from '../ArtImage';
import { gradeLabel, money, rowTitle } from '../../lib/format';
import { SlabView } from '../SlabView';

// Room between cases: the slab now has a real case edge and shadow, so neighbours need air.
const GAP = space.xxxl;
// Kept short so the caption sits above the fold under the home header.
const REFLECTION = { opacity: 0.18, height: 0.12 } as const;
// Room above the slab for the neighbours' lean.
const ITEM_TOP = space.m;
// Name, value, one line, then "1 of 9": a fixed block so the slab can be sized to what's left.
const CAPTION_H = 110;
const MIN_SLAB_W = 130;

type ItemProps = {
  row: CardRow;
  n: number;
  x: Animated.Value;
  step: number;
  slabW: number;
  slabH: number;
  onPress: (n: number) => void;
  onLongPress?: (row: CardRow) => void;
};

const Item = memo(function Item({ row, n, x, step, slabW, slabH, onPress, onLongPress }: ItemProps) {
  const range = [(n - 1) * step, n * step, (n + 1) * step];
  const opacity = x.interpolate({ inputRange: range, outputRange: [0.5, 1, 0.5], extrapolate: 'clamp' });
  // Whole-degree lean and whole-point drop only, so the slab lands on exact pixels at rest.
  const rotate = x.interpolate({ inputRange: range, outputRange: ['6deg', '0deg', '-6deg'], extrapolate: 'clamp' });
  const translateY = x.interpolate({ inputRange: range, outputRange: [14, 0, 14], extrapolate: 'clamp' });
  const reflH = slabH * REFLECTION.height;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={row.card.name}
      onPress={() => onPress(n)}
      onLongPress={onLongPress ? () => onLongPress(row) : undefined}
      style={{ width: step, alignItems: 'center', paddingTop: ITEM_TOP }}
    >
      <Animated.View style={{ transform: [{ translateY }, { rotate }], opacity, alignItems: 'center' }}>
        {/* Flat, not posed: the reflection meets a straight bottom edge, as in Cover Flow. */}
        <SlabView card={row.card} width={slabW} posed={false} />
        <View pointerEvents="none" style={{ width: slabW, height: reflH, overflow: 'hidden', marginTop: 3 }}>
          {/* Flipped about its centre, the slab's bottom edge lands at the top of this strip. */}
          <View style={{ height: slabH, opacity: REFLECTION.opacity, transform: [{ scaleY: -1 }] }}>
            <SlabView card={row.card} width={slabW} posed={false} />
          </View>
          <LinearGradient
            colors={[`${color.canvas}00`, color.canvas]}
            locations={[0, 1]}
            style={StyleSheet.absoluteFill}
          />
        </View>
      </Animated.View>
    </Pressable>
  );
});

/**
 * `fitHeight` is the room left on screen below the tabs. The slab is sized so slab, reflection
 * and caption all fit in it, between MIN_SLAB_W and the full carousel size.
 */
export function ScrollDisplay({
  rows,
  screenW,
  fitHeight,
  onLongPress,
}: {
  rows: CardRow[];
  screenW: number;
  fitHeight?: number;
  onLongPress?: (row: CardRow) => void;
}) {
  const maxW = Math.min(size.carouselSlabW, screenW - space.gutter * 2 - 80);
  const fitSlabH = fitHeight ? (fitHeight - ITEM_TOP - 3 - CAPTION_H) / (1 + REFLECTION.height) : Infinity;
  const slabW = Math.round(Math.max(MIN_SLAB_W, Math.min(maxW, (fitSlabH * size.heroW) / size.heroH)));
  const slabH = (slabW * size.heroH) / size.heroW;
  const step = slabW + GAP;
  const side = (screenW - slabW) / 2;
  const x = useRef(new Animated.Value(0)).current;
  const list = useRef<FlatList<CardRow>>(null);
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const i = Math.min(index, Math.max(0, rows.length - 1));
  const current = rows[i];

  // The caption fades out with the drag and is invisible at the halfway point, which is exactly
  // where the index rounds over, so its text swaps unseen and fades back in with the next slab.
  const captionOpacity = useMemo(() => {
    if (rows.length < 2) return 1;
    const input: number[] = [];
    const output: number[] = [];
    rows.forEach((_, n) => {
      if (n > 0) {
        input.push((n - 0.5) * step);
        output.push(0);
      }
      input.push(n * step);
      output.push(1);
    });
    return x.interpolate({ inputRange: input, outputRange: output, extrapolate: 'clamp' });
  }, [rows, step, x]);

  useEffect(() => {
    prefetchArt(rows.map((r) => r.card.imageFrontUrl));
  }, [rows]);

  // Put slab n in the middle and tell the lean/dim/caption animations so directly. The scroll
  // position only reaches `x` through scroll events, and iOS sends none when the list re-sorts,
  // re-filters or changes size under a resting finger, so `x` could keep an old offset and draw
  // the centred slab as a dimmed, leaning neighbour (the "1 of 3" slab sitting off to one side).
  const settle = useCallback(
    (n: number) => {
      const k = Math.max(0, Math.min(rows.length - 1, n));
      indexRef.current = k;
      setIndex(k);
      list.current?.scrollToOffset({ offset: k * step, animated: false });
      x.setValue(k * step);
    },
    [rows.length, step, x],
  );

  // A new sort, filter or search gives a new order: start again from its first slab.
  const order = rows.map((r) => r.card.id).join('|');
  const lastOrder = useRef(order);
  useLayoutEffect(() => {
    if (order === lastOrder.current) return;
    lastOrder.current = order;
    settle(0);
  }, [order, settle]);

  // The slab is resized once the room below the tabs is known; keep the same slab centred.
  const lastStep = useRef(step);
  useLayoutEffect(() => {
    if (step === lastStep.current) return;
    lastStep.current = step;
    settle(indexRef.current);
  }, [step, settle]);

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
        // Fires on mount and whenever the slabs change width or count, with no scroll event of
        // its own: re-centre so the animations match what's on screen.
        onContentSizeChange={() => settle(indexRef.current)}
        getItemLayout={(_, n) => ({ length: step, offset: step * n, index: n })}
        renderItem={({ item, index: n }) => (
          <Item row={item} n={n} x={x} step={step} slabW={slabW} slabH={slabH} onPress={onPress} onLongPress={onLongPress} />
        )}
      />
      {current ? (
        <Animated.View style={{ opacity: captionOpacity }}>
          <Pressable
            accessibilityRole="button"
            accessibilityHint="Opens this slab"
            onPress={() => router.push(`/card/${current.card.id}`)}
            style={styles.caption}
          >
            <SwipeCaption row={current} />
            <Text style={[type.caption, { color: color.secondary, paddingTop: space.s }]}>
              {i + 1} of {rows.length}
            </Text>
          </Pressable>
        </Animated.View>
      ) : null}
    </View>
  );
}

/**
 * Name, value, then one line that depends on the slab: gain vs paid for holds, ask and floor for
 * slabs for sale, the sale vs paid for sold ones. The 30-day chart lives on the detail screen.
 */
function SwipeCaption({ row }: { row: CardRow }) {
  const { card, price } = row;
  const sold = card.status === 'sold';
  const selling = !sold && (card.plan === 'sell' || card.plan === 'trade');
  const value = sold ? card.soldCents : price?.marketCents;
  const muted = { color: color.secondary };
  const ink = { color: color.ink };
  const signed = (cents: number) => (
    <Text style={{ color: cents >= 0 ? color.gain : color.loss }}>{`${cents >= 0 ? '+' : ''}${money(cents)}`}</Text>
  );

  let line: React.ReactNode;
  if (selling && row.ask != null) {
    line = (
      <>
        Ask <Text style={ink}>{money(row.ask)}</Text>
        {row.floor != null ? (
          <>
            {' · '}floor <Text style={{ color: color.loss }}>{money(row.floor)}</Text>
          </>
        ) : null}
      </>
    );
  } else if (value != null && card.paidCents != null) {
    line = (
      <>
        {signed(value - card.paidCents)}
        {sold ? ' · sold, paid ' : ' · paid '}
        <Text style={ink}>{money(card.paidCents)}</Text>
      </>
    );
  } else if (sold) {
    line = 'Sold';
  } else if (price) {
    line = card.grader === 'raw' ? 'TCGplayer market' : 'eBay sold, 30 days';
  } else {
    line = 'No sales found yet';
  }

  return (
    <View style={{ alignItems: 'center' }}>
      <Text numberOfLines={1} style={[type.body, ink]}>
        {rowTitle(card)}
        {/* Graded slabs show their grade on the label; raw cards say so here. */}
        {card.grader === 'raw' ? <Text style={muted}>{` · ${gradeLabel(card.grader, card.grade, card.condition)}`}</Text> : null}
      </Text>
      <Text style={[type.rowPrice, ink, { paddingTop: space.xs }]}>{value != null ? money(value) : '—'}</Text>
      <Text numberOfLines={1} style={[type.secondary, muted, { paddingTop: 2 }]}>
        {line}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  caption: { alignItems: 'center', height: CAPTION_H, paddingHorizontal: space.gutter, paddingTop: space.m },
});
