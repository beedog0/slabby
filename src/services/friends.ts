// Friends and public profiles. Reads go through RLS (0030_friends.sql): anyone signed in can find
// a profile by handle, but a showcase is only returned to the people its owner allows. Without a
// server (web preview) everything runs on src/mocks/profiles.ts.
//
// A friendship is one friend_requests row: pending until the other person accepts. Asking someone
// who already asked you accepts theirs instead.

import { MOCK_PROFILES } from '../mocks/profiles';
import { buildShowcase, type Audience, type PublicProfile, type Showcase } from '../profile/publicProfile';
import { rowFor } from '../pricing/portfolio';
import { useAccount } from '../store/account';
import { useDisplay } from '../store/display';
import { useRules } from '../store/rules';
import { useSharing } from '../store/sharing';
import { useVault } from '../store/vault';
import { supabase } from './supabase';

export type Person = { userId: string; handle: string; name: string; photo: string | null };

/** Where you stand with someone. */
export type Relation = 'self' | 'none' | 'sent' | 'received' | 'friends';

export type FriendLists = { friends: Person[]; received: Person[]; sent: Person[] };

type ProfileRow = { user_id: string; handle: string | null; name: string | null; bio?: string | null; photo: string | null };

const person = (p: ProfileRow): Person => ({ userId: p.user_id, handle: p.handle ?? '', name: p.name ?? '', photo: p.photo });

const me = () => useAccount.getState();
const signedIn = () => !!supabase && !me().guest && !!me().uid;

/** Without a server: who's a friend in the preview. */
const mockRelations = new Map<string, Relation>([
  ['mock-ava', 'friends'],
  ['mock-jun', 'received'],
]);

/** Profiles whose handle or name starts with what you typed. Never yourself. */
export async function searchPeople(query: string): Promise<Person[]> {
  const q = query.trim().replace(/^@/, '').toLowerCase().replace(/[%_,()]/g, '');
  if (q.length < 2) return [];
  if (!supabase) {
    return MOCK_PROFILES.filter((p) => p.handle.startsWith(q) || p.name.toLowerCase().includes(q)).map((p) => ({
      userId: p.userId,
      handle: p.handle,
      name: p.name,
      photo: p.photo,
    }));
  }
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, handle, name, photo')
    .not('handle', 'is', null)
    .or(`handle.ilike.${q}%,name.ilike.%${q}%`)
    .limit(20);
  if (error || !data) return [];
  const uid = me().uid;
  return (data as ProfileRow[]).filter((p) => p.user_id !== uid).map(person);
}

/** Someone's profile by handle, with their showcase if you're allowed to see it. */
export async function fetchProfile(handle: string): Promise<{ profile: PublicProfile; relation: Relation; friendCount: number | null } | null> {
  const h = handle.toLowerCase();
  if (!supabase) {
    const p = MOCK_PROFILES.find((x) => x.handle === h);
    if (!p) return null;
    const relation = mockRelations.get(p.userId) ?? 'none';
    const visible = p.audience === 'everyone' || (p.audience === 'friends' && relation === 'friends');
    return { profile: { ...p, showcase: visible ? p.showcase : null }, relation, friendCount: 12 };
  }
  const { data: row, error } = await supabase.from('profiles').select('user_id, handle, name, bio, photo').eq('handle', h).maybeSingle();
  if (error || !row) return null;
  const p = row as ProfileRow;
  const [show, relation, count] = await Promise.all([
    supabase.from('showcases').select('audience, showcase').eq('user_id', p.user_id).maybeSingle(),
    relationTo(p.user_id),
    supabase.rpc('friend_count', { u: p.user_id }),
  ]);
  const s = show.data as { audience: Audience; showcase: Showcase } | null;
  return {
    profile: {
      userId: p.user_id,
      handle: p.handle ?? h,
      name: p.name ?? '',
      bio: p.bio ?? '',
      photo: p.photo,
      audience: s?.audience ?? 'friends',
      showcase: s?.showcase ?? null,
    },
    relation,
    friendCount: typeof count.data === 'number' ? count.data : null,
  };
}

export async function relationTo(userId: string): Promise<Relation> {
  const uid = me().uid;
  if (!supabase) return mockRelations.get(userId) ?? 'none';
  if (!uid) return 'none';
  if (uid === userId) return 'self';
  const { data } = await supabase
    .from('friend_requests')
    .select('from_id, to_id, status')
    .or(`and(from_id.eq.${uid},to_id.eq.${userId}),and(from_id.eq.${userId},to_id.eq.${uid})`)
    .maybeSingle();
  if (!data) return 'none';
  if (data.status === 'accepted') return 'friends';
  return data.from_id === uid ? 'sent' : 'received';
}

/** Your friends and pending requests, newest first. */
export async function fetchFriends(): Promise<FriendLists> {
  if (!supabase) {
    const of = (r: Relation) => MOCK_PROFILES.filter((p) => mockRelations.get(p.userId) === r).map((p) => ({ userId: p.userId, handle: p.handle, name: p.name, photo: p.photo }));
    return { friends: of('friends'), received: of('received'), sent: of('sent') };
  }
  const uid = me().uid;
  const empty = { friends: [], received: [], sent: [] };
  if (!signedIn() || !uid) return empty;
  const cols = 'user_id, handle, name, photo';
  const { data, error } = await supabase
    .from('friend_requests')
    .select(`from_id, to_id, status, created_at, from:profiles!friend_requests_from_id_fkey(${cols}), to:profiles!friend_requests_to_id_fkey(${cols})`)
    .order('created_at', { ascending: false });
  if (error || !data) return empty;
  const out: FriendLists = { friends: [], received: [], sent: [] };
  for (const r of data as unknown as { from_id: string; status: string; from: ProfileRow; to: ProfileRow }[]) {
    const mine = r.from_id === uid;
    const other = person(mine ? r.to : r.from);
    if (r.status === 'accepted') out.friends.push(other);
    else (mine ? out.sent : out.received).push(other);
  }
  out.friends.sort((a, b) => (a.name || a.handle).localeCompare(b.name || b.handle));
  return out;
}

/** Ask to be friends, or accept if they already asked. Resolves to the new relation, or an error. */
export async function addFriend(userId: string): Promise<Relation | { error: string }> {
  if (!supabase) {
    const next: Relation = mockRelations.get(userId) === 'received' ? 'friends' : 'sent';
    mockRelations.set(userId, next);
    return next;
  }
  if (!signedIn()) return { error: 'Sign in to add friends.' };
  const current = await relationTo(userId);
  if (current === 'received') return acceptFriend(userId);
  if (current !== 'none') return current;
  const { error } = await supabase.from('friend_requests').insert({ from_id: me().uid, to_id: userId });
  if (error) {
    if (error.code === '23503') return { error: 'Add your name and @handle first, so they know who’s asking.' };
    if (error.code === '23505') return relationTo(userId);
    return { error: 'Couldn’t send the request. Try again in a moment.' };
  }
  return 'sent';
}

export async function acceptFriend(userId: string): Promise<Relation | { error: string }> {
  if (!supabase) {
    mockRelations.set(userId, 'friends');
    return 'friends';
  }
  const { error } = await supabase.from('friend_requests').update({ status: 'accepted' }).eq('from_id', userId).eq('to_id', me().uid!);
  return error ? { error: 'Couldn’t accept. Try again in a moment.' } : 'friends';
}

/** Decline, cancel a request, or unfriend: the pair's row goes either way. */
export async function removeFriend(userId: string): Promise<Relation | { error: string }> {
  if (!supabase) {
    mockRelations.delete(userId);
    return 'none';
  }
  const uid = me().uid!;
  const { error } = await supabase
    .from('friend_requests')
    .delete()
    .or(`and(from_id.eq.${uid},to_id.eq.${userId}),and(from_id.eq.${userId},to_id.eq.${uid})`);
  return error ? { error: 'Couldn’t change that. Try again in a moment.' } : 'none';
}

/** Your own showcase as others would see it, from what's on this phone. */
export function myShowcase(): Showcase {
  const rules = useRules.getState().rules;
  const rows = useVault.getState().cards.map((c) => rowFor(c, rules));
  const { order, showValue } = useSharing.getState();
  const { order: shelfOrder, pinnedId } = useDisplay.getState();
  return buildShowcase(rows, { order, showValue, shelfOrder, pinnedId });
}

/** Send your showcase to the account's row when it changed. Quiet: a failure tries again later. */
export async function publishShowcase(): Promise<void> {
  if (!signedIn()) return;
  const { audience, published, markPublished } = useSharing.getState();
  const showcase = myShowcase();
  const key = JSON.stringify([audience, showcase]);
  if (key === published) return;
  const { error } = await supabase!.from('showcases').upsert({ user_id: me().uid, audience, showcase });
  if (!error) markPublished(key);
}
