// The Profile tab: who you are in Slabby, then the settings that used to sit in the home … menu.
//
// Top to bottom by how often you'd reach for it: your photo, name, @handle and bio with Edit
// profile under them; three numbers about the collection; then Account (sign in / saved),
// Pricing rules and Appearance. Share profile and Find friends are listed as coming, so the
// handle you pick now is the one people will find you by.

import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '../../src/components/Avatar';
import { APPEARANCE_LABEL, openAppearance } from '../../src/components/menu/appearanceMenu';
import { Chevron, Hairline } from '../../src/components/ui';
import { money } from '../../src/lib/format';
import { collection, rowFor } from '../../src/pricing/portfolio';
import { publishProfile } from '../../src/services/profile';
import { useAccount } from '../../src/store/account';
import { useAppearance } from '../../src/store/appearance';
import { usePrices } from '../../src/store/prices';
import { initialOf, useProfile } from '../../src/store/profile';
import { useRules } from '../../src/store/rules';
import { useVault } from '../../src/store/vault';
import { radius, size, space, type } from '../../src/theme/tokens';
import { themed, useColors } from '../../src/theme/theme';

export default function ProfileTab() {
  const color = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const profile = useProfile();
  const { guest, email, saving, error: syncError } = useAccount();
  const appearance = useAppearance((s) => s.mode);
  const cards = useVault((s) => s.cards);
  const rules = useRules((s) => s.rules);
  const prices = usePrices((s) => s.byKey);

  // Signed in: make sure the public copy matches (a guest who just signed in, or an edit made offline).
  useFocusEffect(
    useCallback(() => {
      if (!guest) publishProfile(useProfile.getState()).catch(() => {});
    }, [guest]),
  );

  const stats = useMemo(() => {
    const rows = cards.map((c) => rowFor(c, rules));
    const owned = collection(rows, 'all');
    return { owned: owned.rows.length, valueCents: owned.totalCents, sold: collection(rows, 'sold').rows.length };
  }, [cards, rules, prices]);

  const named = !!profile.name;
  const accountDetail = guest ? 'Not signed in' : saving ? 'Saving…' : syncError ? 'Not saved yet' : 'Saved';

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: color.canvas }}
      contentContainerStyle={{ paddingTop: insets.top + space.l, paddingBottom: insets.bottom + space.xxl }}
    >
      <View style={styles.header}>
        <Text style={[type.section, { color: color.ink }]}>Profile</Text>
      </View>

      <View style={styles.who}>
        <Avatar photo={profile.photo} letter={initialOf(profile.name, profile.handle, email)} px={size.avatar} />
        <View style={styles.names}>
          <Text numberOfLines={2} style={[type.title, { color: named ? color.ink : color.secondary }]}>
            {named ? profile.name : 'Your name'}
          </Text>
          <Text numberOfLines={1} style={[type.text, { color: color.secondary }]}>
            {profile.handle ? `@${profile.handle}` : 'Pick a handle so friends can find you'}
          </Text>
        </View>
      </View>
      {profile.bio ? <Text style={[type.text, styles.bio, { color: color.ink }]}>{profile.bio}</Text> : null}

      <View style={styles.gutter}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/settings/profile')}
          style={({ pressed }) => [styles.edit, pressed && { opacity: 0.7 }]}
        >
          <Text style={[type.body, { color: color.ink }]}>Edit profile</Text>
        </Pressable>
      </View>

      <View style={styles.stats}>
        <Stat value={String(stats.owned)} label={stats.owned === 1 ? 'Slab' : 'Slabs'} />
        <Stat value={money(stats.valueCents)} label="Value" />
        <Stat value={String(stats.sold)} label="Sold" />
      </View>

      <View style={styles.list}>
        <Row label="Account" detail={accountDetail} onPress={() => router.push('/settings/account')} />
        <Hairline />
        <Row label="Pricing rules" onPress={() => router.push('/settings/pricing')} />
        <Hairline />
        <Row label="Appearance" detail={APPEARANCE_LABEL[appearance]} onPress={openAppearance} />
        <Hairline />
        <Row label="Import collection" onPress={() => router.push('/import')} />
        <Hairline />
      </View>

      <View style={styles.list}>
        <Text style={[type.secondary, styles.groupTitle, { color: color.secondary }]}>Coming soon</Text>
        <Row label="Share profile" detail="Soon" />
        <Hairline />
        <Row label="Find friends" detail="Soon" />
        <Hairline />
      </View>
    </ScrollView>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  const color = useColors();
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text numberOfLines={1} adjustsFontSizeToFit style={[type.rowPrice, { color: color.ink }]}>
        {value}
      </Text>
      <Text style={[type.secondary, { color: color.secondary }]}>{label}</Text>
    </View>
  );
}

function Row({ label, detail, onPress }: { label: string; detail?: string; onPress?: () => void }) {
  const color = useColors();
  const styles = useStyles();
  const quiet = !onPress;
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={quiet}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
    >
      <Text style={[type.body, { color: quiet ? color.secondary : color.ink }]}>{label}</Text>
      <Text style={[type.body, { color: color.secondary, fontWeight: '400' }]}>
        {detail}
        {quiet ? '' : <Chevron />}
      </Text>
    </Pressable>
  );
}

const useStyles = themed((color) =>
  StyleSheet.create({
    gutter: { paddingHorizontal: space.gutter },
    header: { height: size.touch, justifyContent: 'center', paddingHorizontal: space.gutter },
    who: { flexDirection: 'row', alignItems: 'center', gap: space.l, paddingHorizontal: space.gutter, paddingTop: space.xl },
    names: { flex: 1, gap: 2 },
    bio: { paddingHorizontal: space.gutter, paddingTop: space.l },
    edit: {
      height: size.wellButton,
      borderRadius: radius.button,
      backgroundColor: color.well,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: space.xl,
    },
    stats: { flexDirection: 'row', gap: space.l, paddingHorizontal: space.gutter, paddingTop: space.xxl },
    list: { paddingHorizontal: space.gutter, paddingTop: space.xxl },
    groupTitle: { paddingBottom: space.xs },
    row: { minHeight: size.menuRow, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  }),
);
