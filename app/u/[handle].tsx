// Someone else's profile, opened from Find friends, a scanned profile code, or a slabby://u/ link.
// One button for what you can do next: Add friend, or Accept when they asked you. Friends see the
// collection if its owner shows it to friends; everyone sees it if they show it to everyone.

import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { openMenu } from '../../src/components/menu/Menu';
import { MoreIcon } from '../../src/components/profile/MoreIcon';
import { ProfileCase } from '../../src/components/profile/ProfileCase';
import { BackIcon, IconButton, PrimaryButton } from '../../src/components/ui';
import { acceptFriend, addFriend, fetchProfile, removeFriend, type Relation } from '../../src/services/friends';
import { supabase } from '../../src/services/supabase';
import { useAccount } from '../../src/store/account';
import { useProfile } from '../../src/store/profile';
import { size, space, type } from '../../src/theme/tokens';
import { useColors } from '../../src/theme/theme';
import type { PublicProfile } from '../../src/profile/publicProfile';

type Loaded = { profile: PublicProfile; relation: Relation; friendCount: number | null };

export default function PersonScreen() {
  const color = useColors();
  const insets = useSafeAreaInsets();
  const { handle } = useLocalSearchParams<{ handle: string }>();
  const guest = useAccount((s) => s.guest) && !!supabase;
  const myHandle = useProfile((s) => s.handle);
  const [state, setState] = useState<Loaded | null | 'loading'>('loading');

  const load = useCallback(() => {
    fetchProfile(String(handle ?? ''))
      .then((r) => setState(r))
      .catch(() => setState(null));
  }, [handle]);
  useEffect(load, [load]);

  // Your own handle: show your profile as others see it.
  useEffect(() => {
    if (handle && myHandle && handle.toLowerCase() === myHandle) router.replace('/preview-profile');
  }, [handle, myHandle]);

  const act = async (fn: (id: string) => Promise<Relation | { error: string }>) => {
    if (state === 'loading' || !state) return;
    const r = await fn(state.profile.userId);
    if (typeof r === 'object') return Alert.alert(r.error);
    load();
  };

  const loaded = state !== 'loading' && state ? state : null;
  const p = loaded?.profile;
  const first = p?.name.split(' ')[0] || (p ? `@${p.handle}` : '');

  const more = () => {
    if (!loaded || !p) return;
    const rel = loaded.relation;
    const items =
      rel === 'friends'
        ? [{ label: 'Remove friend', onPress: () => act(removeFriend) }]
        : rel === 'sent'
          ? [{ label: 'Cancel request', onPress: () => act(removeFriend) }]
          : rel === 'received'
            ? [{ label: 'Decline request', onPress: () => act(removeFriend) }]
            : [];
    if (items.length) openMenu({ title: p.name || `@${p.handle}`, subtitle: `@${p.handle}`, items });
  };

  const action = !loaded
    ? null
    : guest
      ? <PrimaryButton title="Sign in to add friends" onPress={() => router.push('/settings/account')} />
      : loaded.relation === 'none'
        ? <PrimaryButton title="Add friend" onPress={() => act(addFriend)} />
        : loaded.relation === 'received'
          ? <PrimaryButton title="Accept friend request" onPress={() => act(acceptFriend)} />
          : null;

  const note = !loaded ? null : loaded.relation === 'friends' ? (
    <Text style={[type.secondary, { color: color.secondary }]}>Friends</Text>
  ) : loaded.relation === 'sent' ? (
    <Text style={[type.secondary, { color: color.secondary }]}>Request sent</Text>
  ) : null;

  const hiddenText = !p
    ? undefined
    : p.audience === 'friends' && loaded?.relation !== 'friends'
      ? `${first} shows their collection to friends.`
      : 'This collection is private.';

  return (
    <View style={{ flex: 1, backgroundColor: color.canvas }}>
      <View style={[styles.bar, { paddingTop: insets.top }]}>
        <IconButton label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
          <BackIcon />
        </IconButton>
        {loaded && loaded.relation !== 'none' && loaded.relation !== 'self' ? (
          <IconButton label="More" onPress={more}>
            <MoreIcon />
          </IconButton>
        ) : null}
      </View>
      {state === 'loading' ? (
        <ActivityIndicator style={{ marginTop: space.xxxl }} color={color.secondary} />
      ) : !p ? (
        <View style={styles.missing}>
          <Text style={[type.body, { color: color.ink }]}>No one has that handle</Text>
          <Text style={[type.text, { color: color.secondary, textAlign: 'center' }]}>Check the spelling, or ask them for their profile code.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingTop: space.s, paddingBottom: insets.bottom + space.xxxl }}>
          <ProfileCase profile={p} friendCount={loaded?.friendCount} action={action} note={note} hiddenText={hiddenText} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { height: undefined, minHeight: size.touch, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: space.gutter - 10 },
  missing: { alignItems: 'center', gap: space.s, paddingHorizontal: space.gutter, paddingTop: space.xxxl },
});
