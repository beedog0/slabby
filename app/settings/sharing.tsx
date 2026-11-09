// Sharing: who can open your collection, the order your showcase goes in, and whether values
// show. Your name, @handle and photo are always findable, so friends can add you.

import { router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { openMenu } from '../../src/components/menu/Menu';
import { BackIcon, Chevron, Hairline, IconButton, Toggle } from '../../src/components/ui';
import { AUDIENCE_LABEL, ORDER_LABEL, ORDERS, type Audience } from '../../src/profile/publicProfile';
import { publishShowcase } from '../../src/services/friends';
import { useSharing } from '../../src/store/sharing';
import { size, space, type } from '../../src/theme/tokens';
import { useColors } from '../../src/theme/theme';

const AUDIENCE_HINT: Record<Audience, string> = {
  everyone: 'Anyone with Slabby who finds your @handle',
  friends: 'Only people you’ve accepted as friends',
  nobody: 'Your name and photo still show, so friends can add you',
};

export default function SharingSettings() {
  const color = useColors();
  const insets = useSafeAreaInsets();
  const s = useSharing();

  // Leaving the screen sends the new choices up, so the next visitor sees them.
  useEffect(() => () => void publishShowcase().catch(() => {}), []);

  const pickAudience = () =>
    openMenu({
      title: 'Who can see your collection',
      items: (['everyone', 'friends', 'nobody'] as Audience[]).map((a) => ({
        label: AUDIENCE_LABEL[a],
        selected: s.audience === a,
        onPress: () => s.set({ audience: a }),
      })),
    });
  const pickOrder = () =>
    openMenu({
      title: 'Showcase order',
      subtitle: 'Your first slab is the centrepiece',
      items: ORDERS.map((o) => ({ label: ORDER_LABEL[o], selected: s.order === o, onPress: () => s.set({ order: o }) })),
    });

  return (
    <View style={{ flex: 1, backgroundColor: color.canvas }}>
      <View style={[styles.bar, { paddingTop: insets.top }]}>
        <IconButton label="Back" onPress={() => router.back()}>
          <BackIcon />
        </IconButton>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.gutter, paddingBottom: insets.bottom + space.xxl }}>
        <Text style={[type.title, { color: color.ink, paddingBottom: space.xl }]}>Sharing</Text>

        <Row label="Who can see your collection" detail={AUDIENCE_LABEL[s.audience]} onPress={pickAudience} />
        <Text style={[type.secondary, styles.hint, { color: color.secondary }]}>{AUDIENCE_HINT[s.audience]}</Text>
        <Hairline />
        <Row label="Showcase order" detail={ORDER_LABEL[s.order]} onPress={pickOrder} />
        <Hairline />
        <View style={styles.row}>
          <Text style={[type.body, { color: color.ink, flex: 1 }]}>Show values</Text>
          <Toggle label="Show values" value={s.showValue} onChange={(v) => s.set({ showValue: v })} />
        </View>
        <Text style={[type.secondary, styles.hint, { color: color.secondary }]}>
          Market value on your profile and share images. What you paid is never shown.
        </Text>
        <Hairline />
        <Row label="See your profile as others do" onPress={() => router.push('/preview-profile')} />
      </ScrollView>
    </View>
  );
}

function Row({ label, detail, onPress }: { label: string; detail?: string; onPress: () => void }) {
  const color = useColors();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
      <Text style={[type.body, { color: color.ink, flex: 1 }]}>{label}</Text>
      <Text style={[type.body, { color: color.secondary, fontWeight: '400' }]}>
        {detail}
        <Chevron />
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { minHeight: size.touch, flexDirection: 'row', paddingHorizontal: space.gutter - 10 },
  row: { minHeight: size.menuRow, flexDirection: 'row', alignItems: 'center', gap: space.m },
  hint: { marginTop: -space.s, paddingBottom: space.m },
});
