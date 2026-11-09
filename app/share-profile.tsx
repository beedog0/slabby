// Share profile: a picture of your display case to post or send. Pick the order and how many
// slabs; the image updates as you choose. One button makes it, then Save to Photos or Share.

import { router } from 'expo-router';
import { useMemo, useRef, useState, type ComponentRef } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { openMenu } from '../src/components/menu/Menu';
import { Segmented } from '../src/components/Segmented';
import { openImageSheet } from '../src/components/share/ShareCard';
import { IMG_W, ProfileImage, profileImageLayout } from '../src/components/share/ProfileImage';
import { BackIcon, Chevron, Hairline, IconButton, PrimaryButton, Toggle } from '../src/components/ui';
import { ORDER_LABEL, ORDERS } from '../src/profile/publicProfile';
import { myShowcase } from '../src/services/friends';
import { useDisplay } from '../src/store/display';
import { usePrices } from '../src/store/prices';
import { useProfile } from '../src/store/profile';
import { useRules } from '../src/store/rules';
import { useSharing } from '../src/store/sharing';
import { useVault } from '../src/store/vault';
import { size, space, type } from '../src/theme/tokens';
import { useColors } from '../src/theme/theme';

const COUNTS = [
  { value: '3', label: '3' },
  { value: '6', label: '6' },
  { value: '9', label: '9' },
];

export default function ShareProfile() {
  const color = useColors();
  const insets = useSafeAreaInsets();
  const profile = useProfile();
  const sharing = useSharing();
  const cards = useVault((s) => s.cards);
  const rules = useRules((s) => s.rules);
  const prices = usePrices((s) => s.byKey);
  const shelfOrder = useDisplay((s) => s.order);
  const pinnedId = useDisplay((s) => s.pinnedId);
  const showcase = useMemo(() => myShowcase(), [cards, rules, prices, sharing.order, sharing.showValue, shelfOrder, pinnedId]);
  const ref = useRef<ComponentRef<typeof View>>(null);
  const [busy, setBusy] = useState(false);
  const count = Math.min(sharing.imageCount, showcase.cards.length);
  const { height } = profileImageLayout(count);

  const pickOrder = () =>
    openMenu({
      title: 'Order',
      subtitle: 'Your first slab leads the image',
      items: ORDERS.map((o) => ({ label: ORDER_LABEL[o], selected: sharing.order === o, onPress: () => sharing.set({ order: o }) })),
    });

  const make = async () => {
    if (busy || Platform.OS === 'web') return;
    setBusy(true);
    try {
      const uri = await captureRef(ref as never, { format: 'png', quality: 1, width: IMG_W * 3, height: height * 3 });
      openImageSheet(uri, IMG_W / height, profile.name || `@${profile.handle}`);
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
        {/* The image itself, at the size it's made; a hairline frame shows where it ends. */}
        <View style={[styles.frame, { borderColor: color.hairline }]}>
          <ProfileImage ref={ref} name={profile.name} handle={profile.handle || 'yourhandle'} photo={profile.photo} showcase={showcase} count={count} />
        </View>

        <View style={styles.options}>
          <Pressable accessibilityRole="button" onPress={pickOrder} style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
            <Text style={[type.body, { color: color.ink, flex: 1 }]}>Order</Text>
            <Text style={[type.body, { color: color.secondary, fontWeight: '400' }]}>
              {ORDER_LABEL[sharing.order]}
              <Chevron />
            </Text>
          </Pressable>
          <Hairline />
          <View style={styles.row}>
            <Text style={[type.body, { color: color.ink, flex: 1 }]}>Slabs</Text>
            <Segmented options={COUNTS} value={String(sharing.imageCount)} onChange={(v) => sharing.set({ imageCount: Number(v) })} style={{ width: 168 }} />
          </View>
          <Hairline />
          <View style={styles.row}>
            <Text style={[type.body, { color: color.ink, flex: 1 }]}>Show values</Text>
            <Toggle label="Show values" value={sharing.showValue} onChange={(v) => sharing.set({ showValue: v })} />
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
  options: { paddingHorizontal: space.gutter, paddingTop: space.xl },
  row: { minHeight: size.menuRow, flexDirection: 'row', alignItems: 'center', gap: space.m },
  footer: { paddingHorizontal: space.gutter, paddingTop: space.m },
});
