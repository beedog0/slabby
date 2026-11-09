// Friends: find people by @handle or name, answer requests, and see who you're friends with.
// At a con the quickest way is face to face: show your profile code and they scan it with Slabby.

import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '../src/components/Avatar';
import { openProfileCode } from '../src/components/profile/ProfileCode';
import { BackIcon, Chevron, Hairline, IconButton, PrimaryButton, SearchIcon } from '../src/components/ui';
import { acceptFriend, fetchFriends, searchPeople, type FriendLists, type Person } from '../src/services/friends';
import { supabase } from '../src/services/supabase';
import { useAccount } from '../src/store/account';
import { initialOf, useProfile } from '../src/store/profile';
import { radius, size, space, type } from '../src/theme/tokens';
import { themed, useColors } from '../src/theme/theme';

const AVATAR = 44;

export default function Friends() {
  const color = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const guest = useAccount((s) => s.guest) && !!supabase;
  const { handle, name } = useProfile();
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Person[] | null>(null);
  const [lists, setLists] = useState<FriendLists | null>(null);

  const load = useCallback(() => {
    fetchFriends().then(setLists).catch(() => {});
  }, []);
  useFocusEffect(load);

  // Search as you type, a beat after the last key.
  useEffect(() => {
    const q = query.trim();
    if (q.replace(/^@/, '').length < 2) return setFound(null);
    const t = setTimeout(() => searchPeople(q).then(setFound).catch(() => setFound([])), 250);
    return () => clearTimeout(t);
  }, [query]);

  const open = (p: Person) => router.push(`/u/${p.handle}`);
  const accept = async (p: Person) => {
    await acceptFriend(p.userId);
    load();
  };

  type Item = { kind: 'title'; text: string } | { kind: 'person'; p: Person; request?: boolean } | { kind: 'empty'; text: string };
  const items: Item[] = [];
  if (found) {
    if (!found.length) items.push({ kind: 'empty', text: 'No one by that name or handle yet.' });
    found.forEach((p) => items.push({ kind: 'person', p }));
  } else if (lists) {
    if (lists.received.length) {
      items.push({ kind: 'title', text: 'Requests' });
      lists.received.forEach((p) => items.push({ kind: 'person', p, request: true }));
    }
    items.push({ kind: 'title', text: lists.friends.length ? `${lists.friends.length} ${lists.friends.length === 1 ? 'friend' : 'friends'}` : 'Friends' });
    if (!lists.friends.length) items.push({ kind: 'empty', text: 'No friends yet. Search for someone, or show them your profile code.' });
    lists.friends.forEach((p) => items.push({ kind: 'person', p }));
    if (lists.sent.length) {
      items.push({ kind: 'title', text: 'Waiting on them' });
      lists.sent.forEach((p) => items.push({ kind: 'person', p }));
    }
  }

  const blocked = guest ? 'guest' : !handle ? 'handle' : null;

  return (
    <View style={{ flex: 1, backgroundColor: color.canvas }}>
      <View style={[styles.bar, { paddingTop: insets.top }]}>
        <IconButton label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
          <BackIcon />
        </IconButton>
      </View>
      <Text style={[type.title, styles.title, { color: color.ink }]}>Friends</Text>

      {blocked ? (
        <View style={styles.blocked}>
          <Text style={[type.body, { color: color.ink, textAlign: 'center' }]}>
            {blocked === 'guest' ? 'Sign in to add friends' : 'Pick a handle first'}
          </Text>
          <Text style={[type.text, { color: color.secondary, textAlign: 'center' }]}>
            {blocked === 'guest' ? 'Friends need to know who you are, so it takes an account.' : 'Your @handle is how friends find you.'}
          </Text>
          <PrimaryButton
            title={blocked === 'guest' ? 'Sign in' : 'Edit profile'}
            onPress={() => router.push(blocked === 'guest' ? '/settings/account' : '/settings/profile')}
            style={{ alignSelf: 'stretch', marginTop: space.xl }}
          />
        </View>
      ) : (
        <>
          <View style={styles.search}>
            <SearchIcon s={18} tint={color.secondary} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search by @handle or name"
              placeholderTextColor={color.secondary}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              clearButtonMode="while-editing"
              style={[type.body, styles.input]}
            />
          </View>
          <FlatList
            data={items}
            keyboardShouldPersistTaps="handled"
            keyExtractor={(it, i) => (it.kind === 'person' ? `${it.p.userId}-${i}` : `${it.kind}-${i}`)}
            contentContainerStyle={{ paddingHorizontal: space.gutter, paddingBottom: space.xxl }}
            renderItem={({ item }) =>
              item.kind === 'title' ? (
                <Text style={[type.secondary, styles.section, { color: color.secondary }]}>{item.text}</Text>
              ) : item.kind === 'empty' ? (
                <Text style={[type.text, { color: color.secondary, paddingVertical: space.l }]}>{item.text}</Text>
              ) : (
                <View>
                  <Pressable accessibilityRole="button" onPress={() => open(item.p)} style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
                    <Avatar photo={item.p.photo} letter={initialOf(item.p.name, item.p.handle)} px={AVATAR} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[type.body, { color: color.ink }]}>{item.p.name || `@${item.p.handle}`}</Text>
                      {item.p.name ? <Text style={[type.secondary, { color: color.secondary }]}>@{item.p.handle}</Text> : null}
                    </View>
                    {item.request ? (
                      <Pressable accessibilityRole="button" onPress={() => accept(item.p)} hitSlop={8} style={({ pressed }) => [styles.accept, pressed && { opacity: 0.7 }]}>
                        <Text style={[type.secondary, { color: color.onInk, fontWeight: '600' }]}>Accept</Text>
                      </Pressable>
                    ) : (
                      <Chevron />
                    )}
                  </Pressable>
                  <Hairline inset={AVATAR + space.m} />
                </View>
              )
            }
          />
          <View style={[styles.footer, { paddingBottom: insets.bottom + space.l }]}>
            <PrimaryButton title="Show my profile code" onPress={() => openProfileCode(handle, name)} />
          </View>
        </>
      )}
    </View>
  );
}

const useStyles = themed((color) =>
  StyleSheet.create({
    bar: { minHeight: size.touch, flexDirection: 'row', paddingHorizontal: space.gutter - 10 },
    title: { paddingHorizontal: space.gutter, paddingBottom: space.l },
    search: {
      marginHorizontal: space.gutter,
      height: size.button - 8,
      borderRadius: radius.field,
      backgroundColor: color.well,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.s,
      paddingHorizontal: space.m,
    },
    input: { flex: 1, color: color.ink, fontWeight: '400', paddingVertical: 0 },
    section: { paddingTop: space.xl, paddingBottom: space.xs },
    row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: space.m },
    accept: { height: 32, paddingHorizontal: space.l, borderRadius: 16, backgroundColor: color.ink, alignItems: 'center', justifyContent: 'center' },
    blocked: { alignItems: 'center', gap: space.s, paddingHorizontal: space.gutter, paddingTop: space.xxl },
    footer: { paddingHorizontal: space.gutter, paddingTop: space.m },
  }),
);
