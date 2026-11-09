// Wishlist: every card you're hunting, what it goes for now, and what you'll pay. A sheet over
// Search, Profile or the Con tab (Bryan: it was "weird" sitting at the bottom of Search).
//
// Cards at or under your price come first, under their own heading, with how far under in green;
// the rest are "Watching", newest first. Tap a card to change your price or remove it. One
// button: Add a card. Share wishlist lives in the … menu.

import { router } from 'expo-router';
import { useMemo, useRef, type ComponentRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArtImage } from '../src/components/ArtImage';
import { ChangeText } from '../src/components/search/CatalogTile';
import { openDropdown } from '../src/components/menu/Dropdown';
import { Hairline, IconButton, MoreIcon, PrimaryButton } from '../src/components/ui';
import { cardPrice, langTag, money, savedAgo } from '../src/lib/format';
import { underBy, wishView } from '../src/pricing/wishlistView';
import { displayName, gradeLabel } from '../src/services/search';
import { useWishlist, type WishItem } from '../src/store/wishlist';
import { radius, size, space, type } from '../src/theme/tokens';
import { themed, useColors } from '../src/theme/theme';

const ART_W = 44;
const ART_H = Math.round((ART_W * 88) / 63);

export default function Wishlist() {
  const color = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const items = useWishlist((s) => s.items);
  const view = useMemo(() => wishView(items), [items]);
  const moreRef = useRef<ComponentRef<typeof View>>(null);

  const add = () => router.push('/search?want=1');
  const more = () =>
    openDropdown(moreRef, [
      [
        {
          label: 'Share wishlist',
          onPress: () => router.push('/share-wishlist'),
        },
        { label: 'Add a card', onPress: add },
      ],
    ]);

  return (
    <View style={{ flex: 1, backgroundColor: color.canvas }}>
      <View style={styles.bar}>
        <View style={styles.grabber} />
        <View style={styles.barRow}>
          <Pressable accessibilityRole="button" onPress={() => (router.canGoBack() ? router.back() : router.replace('/find'))} hitSlop={10} style={styles.done}>
            <Text style={[type.text, { color: color.ink }]}>Done</Text>
          </Pressable>
          {items.length ? (
            <View ref={moreRef} collapsable={false}>
              <IconButton label="More" onPress={more}>
                <MoreIcon />
              </IconButton>
            </View>
          ) : null}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + space.xxl }}>
        <View style={styles.gutter}>
          <Text style={[type.title, { color: color.ink }]}>Wishlist</Text>
          {items.length ? (
            <>
              <Text style={[type.text, { color: color.secondary, paddingTop: space.xs }]}>
                {view.count} {view.count === 1 ? 'card' : 'cards'} · {money(view.totalCents)} at your prices
              </Text>
              <Text style={[type.secondary, { color: color.secondary, paddingTop: space.xs }]}>
                Market for each grade from the last time you opened the card.
              </Text>
            </>
          ) : null}
        </View>

        {!items.length ? (
          <View style={[styles.gutter, { paddingTop: space.xxl, gap: space.xl }]}>
            <Text style={[type.body, { color: color.secondary }]}>
              Add cards you’re hunting and what you’d pay. Slabby shows when one goes for your price or less.
            </Text>
            <PrimaryButton title="Search a card" onPress={add} />
          </View>
        ) : (
          <>
            {view.below.length ? <Group title="At or under your price" items={view.below} /> : null}
            {view.watching.length ? <Group title={view.below.length ? 'Watching' : 'Cards'} items={view.watching} /> : null}
            <View style={[styles.gutter, { paddingTop: space.xxl }]}>
              <PrimaryButton title="Add a card" onPress={add} />
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Group({ title, items }: { title: string; items: WishItem[] }) {
  const color = useColors();
  const styles = useStyles();
  return (
    <View style={{ paddingTop: space.xxl }}>
      <Text style={[type.section, styles.gutter, { color: color.ink, paddingBottom: space.s }]}>{title}</Text>
      <View style={styles.gutter}>
        {items.map((w, i) => (
          <View key={w.key}>
            {i ? <Hairline inset={ART_W + space.m} /> : null}
            <WishRow item={w} />
          </View>
        ))}
      </View>
    </View>
  );
}

/** Picture · name, grade and set · market now, and your price under it. */
function WishRow({ item: w }: { item: WishItem }) {
  const color = useColors();
  const styles = useStyles();
  const under = underBy(w);
  const tag = langTag(w.language);
  const checked = savedAgo(w.marketAsOf);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${displayName(w.name)}, ${gradeLabel(w.grade)}`}
      onPress={() =>
        router.push({
          pathname: '/con/want/[id]',
          params: { id: String(w.productId), grade: w.grade },
        })
      }
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
    >
      <View style={styles.art}>
        <ArtImage uri={w.imageUrl} label={w.name} recyclingKey={w.key} style={{ flex: 1 }} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text numberOfLines={2} style={[type.body, { color: color.ink }]}>
          {displayName(w.name)}
          {tag ? <Text style={[type.secondary, { color: color.secondary }]}>{`  ${tag}`}</Text> : null}
        </Text>
        <Text numberOfLines={2} style={[type.secondary, { color: color.secondary }]}>
          {gradeLabel(w.grade)} · {w.setName}
        </Text>
        {checked ? <Text style={[type.caption, { color: color.secondary }]}>Checked {checked}</Text> : null}
      </View>
      <View style={styles.right}>
        <Text style={[type.numberM, { color: w.marketCents != null ? color.ink : color.secondary }]}>
          {w.marketCents != null ? cardPrice(w.marketCents) : 'No price yet'}
        </Text>
        {w.change7d != null ? <ChangeText fraction={w.change7d} suffix=" 7d" style={type.secondary} /> : null}
        <Text style={[type.secondary, { color: color.secondary }]}>
          {under != null ? (
            under ? (
              <>
                <Text style={{ color: color.gain }}>{money(under)}</Text> under {money(w.targetCents)}
              </>
            ) : (
              `At your ${money(w.targetCents)}`
            )
          ) : (
            `You pay ${money(w.targetCents)}`
          )}
        </Text>
      </View>
    </Pressable>
  );
}

const useStyles = themed((color) =>
  StyleSheet.create({
    gutter: { paddingHorizontal: space.gutter },
    bar: { paddingTop: space.s },
    grabber: {
      alignSelf: 'center',
      width: size.grabberW,
      height: size.grabberH,
      borderRadius: size.grabberH,
      backgroundColor: color.ghost,
    },
    barRow: {
      height: size.touch,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingLeft: space.gutter,
      paddingRight: space.gutter - space.m,
    },
    done: { minHeight: size.touch, justifyContent: 'center' },
    row: {
      minHeight: size.rowCon + space.m,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.m,
      paddingVertical: space.m,
    },
    art: {
      width: ART_W,
      height: ART_H,
      borderRadius: radius.thumb,
      overflow: 'hidden',
      backgroundColor: color.well,
    },
    right: { alignItems: 'flex-end', gap: 2 },
  }),
);
