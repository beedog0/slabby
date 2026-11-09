// Share your wishlist as a picture: the cards you're hunting on shelves, titled Looking to buy or
// Wishlist, with what you'd pay under each if you want. Prices come from your wishlist; tap
// "Prices" to set one per card. Pick and arrange the cards, 1 to 3 across.

import { router } from 'expo-router';
import { useMemo, useRef, useState, type ComponentRef } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { openMenu } from '../src/components/menu/Menu';
import { Segmented } from '../src/components/Segmented';
import { OptionRow } from '../src/components/share/OptionRow';
import { openImageSheet } from '../src/components/share/ShareCard';
import { IMG_W, ShelfImage, shelfImageLayout, type PerRow } from '../src/components/share/ShelfImage';
import { BackIcon, Hairline, IconButton, PrimaryButton, Toggle } from '../src/components/ui';
import { money } from '../src/lib/format';
import { WISH_TITLE, wishCaption, wishCard, wishPicks, type WishTitle } from '../src/profile/shareImage';
import { useProfile } from '../src/store/profile';
import { useSharing } from '../src/store/sharing';
import { useWishlist } from '../src/store/wishlist';
import { size, space, type } from '../src/theme/tokens';
import { useColors } from '../src/theme/theme';

const ONE_TWO_THREE = [
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
];
const TITLES: { value: WishTitle; label: string }[] = [
  { value: 'buying', label: WISH_TITLE.buying },
  { value: 'wishlist', label: WISH_TITLE.wishlist },
];

export default function ShareWishlist() {
  const color = useColors();
  const insets = useSafeAreaInsets();
  const profile = useProfile();
  const s = useSharing();
  const items = useWishlist((st) => st.items);
  const picks = useMemo(() => wishPicks(items, s.wishKeys), [items, s.wishKeys]);
  const ref = useRef<ComponentRef<typeof View>>(null);
  const [busy, setBusy] = useState(false);
  const shelfItems = picks.map((w) => ({ card: wishCard(w), caption: wishCaption(w, s.wishTitle, s.wishPrices) }));
  const { height } = shelfImageLayout(shelfItems.length, s.wishPerRow, true);
  const handle = profile.handle ? `@${profile.handle}` : profile.name || null;

  // Prices per card: open that card's wishlist price, where the chart shows how it rates.
  const editPrices = () =>
    openMenu({
      title: 'Prices',
      subtitle: 'Tap a card to change what you’d pay',
      items: picks.map((w) => ({
        label: w.name,
        detail: money(w.targetCents),
        onPress: () => router.push(`/con/want/${w.productId}?grade=${w.grade}`),
      })),
    });

  const make = async () => {
    if (busy || Platform.OS === 'web' || !picks.length) return;
    setBusy(true);
    try {
      const uri = await captureRef(ref as never, { format: 'png', quality: 1, width: IMG_W * 3, height: height * 3 });
      openImageSheet(uri, IMG_W / height, WISH_TITLE[s.wishTitle]);
    } catch {
      Alert.alert('Couldn’t make the image', 'Try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: color.canvas }}>
      <View style={[styles.bar, { paddingTop: insets.top }]}>
        <IconButton label="Back" onPress={() => router.back()}>
          <BackIcon />
        </IconButton>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: space.xl }}>
        <Text style={[type.title, { color: color.ink, paddingHorizontal: space.gutter, paddingBottom: space.l }]}>Share wishlist</Text>
        {picks.length ? (
          <View style={[styles.frame, { borderColor: color.hairline }]}>
            <ShelfImage ref={ref} perRow={s.wishPerRow} items={shelfItems} title={WISH_TITLE[s.wishTitle]} subtitle={handle} />
          </View>
        ) : (
          <Text style={[type.text, { color: color.secondary, paddingHorizontal: space.gutter }]}>
            Your wishlist is empty. Search a card and add it with what you’d pay, then share it here.
          </Text>
        )}

        <View style={styles.options}>
          <View style={styles.row}>
            <Segmented options={TITLES} value={s.wishTitle} onChange={(v) => s.set({ wishTitle: v })} style={{ flex: 1 }} />
          </View>
          <Hairline />
          <OptionRow label="Cards" detail={s.wishKeys.length ? `${picks.length} picked` : 'Newest'} onPress={() => router.push('/share-pick?kind=wish')} />
          <Hairline />
          <View style={styles.row}>
            <Text style={[type.body, { color: color.ink, flex: 1 }]}>Per shelf</Text>
            <Segmented options={ONE_TWO_THREE} value={String(s.wishPerRow)} onChange={(v) => s.set({ wishPerRow: Number(v) as PerRow })} style={{ width: 168 }} />
          </View>
          <Hairline />
          <View style={styles.row}>
            <Text style={[type.body, { color: color.ink, flex: 1 }]}>Show prices</Text>
            <Toggle label="Show prices" value={s.wishPrices} onChange={(v) => s.set({ wishPrices: v })} />
          </View>
          {s.wishPrices && picks.length ? (
            <>
              <Hairline />
              <OptionRow label="Prices" detail="Per card" onPress={editPrices} />
            </>
          ) : null}
        </View>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + space.l }]}>
        <PrimaryButton title={busy ? 'Making image…' : 'Save or share'} onPress={make} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { minHeight: size.touch, flexDirection: 'row', paddingHorizontal: space.gutter - 10 },
  frame: { alignSelf: 'center', borderWidth: StyleSheet.hairlineWidth * 2, borderRadius: 4, overflow: 'hidden' },
  options: { paddingHorizontal: space.gutter, paddingTop: space.xl },
  row: { minHeight: size.menuRow, flexDirection: 'row', alignItems: 'center', gap: space.m },
  footer: { paddingHorizontal: space.gutter, paddingTop: space.m },
});
