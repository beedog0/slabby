// Share profile: a picture of your display case to post or send. Pick which cards (top value,
// pinned, best grades, newest, or your own pick dragged into place), 1 to 3 across, and how many
// shelves; the image updates as you choose. One button makes it, then Save to Photos or Share.

import { router } from 'expo-router';
import { useMemo, useRef, useState, type ComponentRef } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { openMenu } from '../src/components/menu/Menu';
import { Segmented } from '../src/components/Segmented';
import { openImageSheet } from '../src/components/share/ShareCard';
import { IMG_W, ShelfImage, shelfImageLayout, type PerRow } from '../src/components/share/ShelfImage';
import { OptionRow as Row } from '../src/components/share/OptionRow';
import { BackIcon, Hairline, IconButton, PrimaryButton, Toggle } from '../src/components/ui';
import { rowFor } from '../src/pricing/portfolio';
import { ORDER_LABEL, ORDERS, publicStats } from '../src/profile/publicProfile';
import { profileImageCards, statsLine, type ImageOrder } from '../src/profile/shareImage';
import { useDisplay } from '../src/store/display';
import { usePrices } from '../src/store/prices';
import { initialOf, useProfile } from '../src/store/profile';
import { useRules } from '../src/store/rules';
import { useSharing } from '../src/store/sharing';
import { useVault } from '../src/store/vault';
import { size, space, type } from '../src/theme/tokens';
import { useColors } from '../src/theme/theme';

const ONE_TWO_THREE = [
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
];

const IMAGE_ORDER_LABEL: Record<ImageOrder, string> = { ...ORDER_LABEL, custom: 'My own pick' };

export default function ShareProfile() {
  const color = useColors();
  const insets = useSafeAreaInsets();
  const profile = useProfile();
  const s = useSharing();
  const cards = useVault((st) => st.cards);
  const rules = useRules((st) => st.rules);
  const prices = usePrices((st) => st.byKey);
  const shelfOrder = useDisplay((st) => st.order);
  const pinnedId = useDisplay((st) => st.pinnedId);
  const rows = useMemo(() => cards.map((c) => rowFor(c, rules)), [cards, rules, prices]);
  const custom = s.imageOrder === 'custom';
  const shown = useMemo(
    () =>
      profileImageCards(rows, {
        order: s.imageOrder,
        customIds: s.imageIds,
        count: s.perRow * s.rows,
        showValue: s.showValue,
        shelfOrder,
        pinnedId,
      }),
    [rows, s.imageOrder, s.imageIds, s.perRow, s.rows, s.showValue, shelfOrder, pinnedId],
  );
  const stats = useMemo(() => publicStats(rows, s.showValue), [rows, s.showValue]);
  const ref = useRef<ComponentRef<typeof View>>(null);
  const [busy, setBusy] = useState(false);
  const { height } = shelfImageLayout(shown.length, s.perRow);
  const handle = profile.handle || 'yourhandle';

  const pickCards = () => router.push('/share-pick?kind=profile');
  const pickOrder = () =>
    openMenu({
      title: 'Cards',
      subtitle: 'Your first card leads the image',
      items: [
        ORDERS.map((o) => ({ label: ORDER_LABEL[o], selected: s.imageOrder === o, onPress: () => s.set({ imageOrder: o }) })),
        [
          {
            label: 'Choose my own',
            detail: s.imageIds.length ? `${s.imageIds.length} picked` : undefined,
            selected: custom,
            onPress: () => {
              s.set({ imageOrder: 'custom' });
              pickCards();
            },
          },
        ],
      ],
    });

  const make = async () => {
    if (busy || Platform.OS === 'web' || !shown.length) return;
    setBusy(true);
    try {
      const uri = await captureRef(ref as never, { format: 'png', quality: 1, width: IMG_W * 3, height: height * 3 });
      openImageSheet(uri, IMG_W / height, profile.name || `@${handle}`);
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
        <Text style={[type.title, { color: color.ink, paddingHorizontal: space.gutter, paddingBottom: space.l }]}>Share profile</Text>
        {/* The image itself, at the size it's made; a hairline shows where it ends. */}
        <View style={[styles.frame, { borderColor: color.hairline }]}>
          {shown.length ? (
            <ShelfImage
              ref={ref}
              perRow={s.perRow}
              items={shown.map((card) => ({ card }))}
              footer={statsLine(stats)}
              title={profile.name || `@${handle}`}
              subtitle={profile.name ? `@${handle}` : null}
              avatar={{ photo: profile.photo, letter: initialOf(profile.name, handle) }}
            />
          ) : (
            <Pressable onPress={pickCards} style={[styles.empty, { backgroundColor: color.canvas }]}>
              <Text style={[type.body, { color: color.ink }]}>No cards picked</Text>
              <Text style={[type.text, { color: color.secondary }]}>Choose cards ›</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.options}>
          <Row label="Cards" detail={IMAGE_ORDER_LABEL[s.imageOrder]} onPress={pickOrder} />
          {custom ? (
            <>
              <Hairline />
              <Row label="Choose and arrange" detail={`${shown.length} of 9`} onPress={pickCards} />
            </>
          ) : null}
          <Hairline />
          <View style={styles.row}>
            <Text style={[type.body, { color: color.ink, flex: 1 }]}>Per shelf</Text>
            <Segmented options={ONE_TWO_THREE} value={String(s.perRow)} onChange={(v) => s.set({ perRow: Number(v) as PerRow })} style={styles.seg} />
          </View>
          {!custom ? (
            <>
              <Hairline />
              <View style={styles.row}>
                <Text style={[type.body, { color: color.ink, flex: 1 }]}>Shelves</Text>
                <Segmented options={ONE_TWO_THREE} value={String(s.rows)} onChange={(v) => s.set({ rows: Number(v) })} style={styles.seg} />
              </View>
            </>
          ) : null}
          <Hairline />
          <View style={styles.row}>
            <Text style={[type.body, { color: color.ink, flex: 1 }]}>Show values</Text>
            <Toggle label="Show values" value={s.showValue} onChange={(v) => s.set({ showValue: v })} />
          </View>
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
  empty: { width: IMG_W, height: IMG_W, alignItems: 'center', justifyContent: 'center', gap: space.xs },
  options: { paddingHorizontal: space.gutter, paddingTop: space.xl },
  row: { minHeight: size.menuRow, flexDirection: 'row', alignItems: 'center', gap: space.m },
  seg: { width: 168 },
  footer: { paddingHorizontal: space.gutter, paddingTop: space.m },
});
