// The Profile tab: the page you'd show someone, and the one that changes as you collect.
//
// Top to bottom: you (photo, name, @handle, friends, how long you've collected); what the
// collection is worth with its 30-day line; the slab doing best for you (biggest gain on what you
// paid, else the most valuable); your grade mix as one bar; recent activity (added and sold);
// your wishlist; a few numbers; Share profile, the one button. Settings live in the … menu.
// (Bryan: the old page felt "stale and blank": setup chores up top, a slab grid that repeated
// the Collection tab, and nothing that changed day to day.)

import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { Avatar } from '../../src/components/Avatar';
import { SlabView } from '../../src/components/SlabView';
import { openDropdown } from '../../src/components/menu/Dropdown';
import { APPEARANCE_LABEL, openAppearance } from '../../src/components/menu/appearanceMenu';
import { Hairline, IconButton, PrimaryButton } from '../../src/components/ui';
import { MiniChart } from '../../src/components/MiniChart';
import { Fan } from '../../src/components/Fan';
import { cardLabel, changeText, money, saleDay } from '../../src/lib/format';
import { collectionSeries, rowFor } from '../../src/pricing/portfolio';
import { gradeMix, profileStats, recentActivity, spotlight } from '../../src/pricing/profileStats';
import { wishView } from '../../src/pricing/wishlistView';
import { fetchFriends, publishShowcase } from '../../src/services/friends';
import { publishProfile } from '../../src/services/profile';
import { choosePhoto } from '../../src/components/photoChoice';
import { useAccount } from '../../src/store/account';
import { useAppearance } from '../../src/store/appearance';
import { usePrices } from '../../src/store/prices';
import { initialOf, useProfile } from '../../src/store/profile';
import { useRules } from '../../src/store/rules';
import { useVault } from '../../src/store/vault';
import { useWishlist } from '../../src/store/wishlist';
import { radius, size, space, type } from '../../src/theme/tokens';
import { themed, useColors } from '../../src/theme/theme';

/** Ink tones for the grade bar: PSA 10 darkest, raw lightest. */
const BAND_OPACITY = { '10': 1, '9': 0.62, lower: 0.36, raw: 0.16 } as const;

export default function ProfileTab() {
  const color = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const profile = useProfile();
  const { guest, email, saving, error: syncError } = useAccount();
  const appearance = useAppearance((s) => s.mode);
  const cards = useVault((s) => s.cards);
  const rules = useRules((s) => s.rules);
  const prices = usePrices((s) => s.byKey);

  // Signed in: make sure the public copy matches (a guest who just signed in, or an edit made offline).
  // The showcase goes up after the profile: its row hangs off the profile's.
  const [friendCount, setFriendCount] = useState<number | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (!guest)
        publishProfile(useProfile.getState())
          .then(() => publishShowcase())
          .catch(() => {});
      fetchFriends()
        .then((l) => setFriendCount(l.friends.length))
        .catch(() => {});
    }, [guest]),
  );

  const rows = useMemo(() => cards.map((c) => rowFor(c, rules)), [cards, rules, prices]);
  const stats = useMemo(() => profileStats(rows), [rows]);
  const spot = useMemo(() => spotlight(stats), [stats]);
  const mix = useMemo(() => gradeMix(rows), [rows]);
  const activity = useMemo(() => recentActivity(rows), [rows]);
  const series = useMemo(() => collectionSeries(rows, 30), [rows]);
  const since = useMemo(() => {
    const t = Math.min(...cards.map((c) => Date.parse(c.createdAt)).filter((n) => !Number.isNaN(n)));
    return Number.isFinite(t) ? new Date(t).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : null;
  }, [cards]);
  const wished = useWishlist((s) => s.items);
  const wish = useMemo(() => wishView(wished), [wished]);

  const edit = () => router.push('/settings/profile');
  const [picking, setPicking] = useState(false);
  const setPhoto = (photo: string | null) => {
    const p = useProfile.getState();
    p.save({ name: p.name, handle: p.handle, bio: p.bio, photo });
  };
  const changePhoto = () =>
    choosePhoto({
      hasPhoto: !!profile.photo,
      onBusy: setPicking,
      onPicked: setPhoto,
      onRemove: () => setPhoto(null),
      onError: (m) => Alert.alert('Couldn’t get that photo', m),
    });

  const moreRef = useRef<ComponentRef<typeof View>>(null);
  const accountDetail = guest ? 'Not signed in' : saving ? 'Saving…' : syncError ? 'Not saved yet' : 'Saved';
  const more = () =>
    openDropdown(moreRef, [
      [
        { label: 'Edit profile', onPress: edit },
        { label: 'Find friends', onPress: () => router.push('/friends') },
        { label: 'Sharing', onPress: () => router.push('/settings/sharing') },
        { label: 'See your profile as others do', onPress: () => router.push('/preview-profile') },
      ],
      [
        { label: 'Account', detail: accountDetail, onPress: () => router.push('/settings/account') },
        { label: 'Import collection', onPress: () => router.push('/import') },
        { label: 'Pricing rules', onPress: () => router.push('/settings/pricing') },
        { label: 'Appearance', detail: APPEARANCE_LABEL[appearance], onPress: openAppearance },
      ],
    ]);

  const month = changeText(stats.monthDeltaCents, stats.valueCents);
  const gainPct = stats.paidCents ? Math.round((stats.gainCents / stats.paidCents) * 100) : null;
  const signed = (c: number) => `${c >= 0 ? '+' : '−'}${money(Math.abs(c))}`;
  const upDown = (c: number) => (c >= 0 ? color.gain : color.loss);
  const spotW = Math.round(width * 0.36);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: color.canvas }}
      contentContainerStyle={{ paddingTop: insets.top, paddingBottom: insets.bottom + space.xxl }}
    >
      <View style={styles.header}>
        <View ref={moreRef} collapsable={false}>
          <IconButton label="Settings" onPress={more}>
            <MoreIcon />
          </IconButton>
        </View>
      </View>

      {/* You. Tap the photo to change it, the name to edit the rest. */}
      <View style={styles.who}>
        <Pressable accessibilityRole="button" accessibilityLabel={profile.photo ? 'Change photo' : 'Add a photo'} onPress={changePhoto} disabled={picking}>
          <Avatar photo={profile.photo} letter={initialOf(profile.name, profile.handle, email)} px={size.avatar} busy={picking} />
          {!profile.photo ? (
            <View style={styles.camera}>
              <CameraIcon />
            </View>
          ) : null}
        </Pressable>
        <Pressable accessibilityRole="button" onPress={edit} style={styles.names}>
          <Text numberOfLines={2} style={[type.title, { color: profile.name ? color.ink : color.secondary }]}>
            {profile.name || 'Add your name'}
          </Text>
          <Text style={[type.text, { color: color.secondary }]}>{profile.handle ? `@${profile.handle}` : 'Pick a handle ›'}</Text>
        </Pressable>
      </View>
      {profile.bio ? <Text style={[type.text, styles.gutter, { color: color.ink, paddingTop: space.m }]}>{profile.bio}</Text> : null}
      <View style={[styles.gutter, styles.metaRow]}>
        <Pressable accessibilityRole="link" onPress={() => router.push('/friends')} style={styles.metaLink}>
          <Text style={[type.text, { color: color.ink }]}>
            {friendCount ? `${friendCount} ${friendCount === 1 ? 'friend' : 'friends'}` : 'Find friends'}
          </Text>
        </Pressable>
        {since ? <Text style={[type.text, { color: color.secondary }]}>· Collecting since {since}</Text> : null}
      </View>
      {guest ? (
        <Pressable accessibilityRole="link" onPress={() => router.push('/settings/account')} style={[styles.gutter, styles.metaLink]}>
          <Text style={[type.secondary, { color: color.secondary }]}>
            Not saved to an account · <Text style={{ color: color.ink }}>Sign in</Text>
          </Text>
        </Pressable>
      ) : null}

      {/* What it's worth, and where it's been this month. */}
      {stats.owned ? (
        <View style={[styles.gutter, { paddingTop: space.xxl }]}>
          <Text style={[type.secondary, { color: color.secondary }]}>Collection value</Text>
          <Text numberOfLines={1} adjustsFontSizeToFit style={[type.displayS, { color: color.ink }]}>
            {money(stats.valueCents)}
          </Text>
          <Text style={[type.text, { color: color.secondary }]}>
            {month ? <Text style={{ color: upDown(stats.monthDeltaCents) }}>{month}</Text> : null}
            {month ? ' this month · ' : ''}
            {stats.owned} {stats.owned === 1 ? 'slab' : 'slabs'} · {stats.sets} {stats.sets === 1 ? 'set' : 'sets'}
          </Text>
          {series.length >= 2 ? (
            <View style={{ paddingTop: space.l }}>
              <MiniChart values={series} width={width - space.gutter * 2} height={size.homeChart - space.xl} />
            </View>
          ) : null}
        </View>
      ) : null}

      {/* The slab doing best for you, posed, with why it's here. */}
      {spot ? (
        <Pressable accessibilityRole="button" onPress={() => router.push(`/card/${spot.row.card.id}`)} style={styles.spot}>
          <SlabView card={spot.row.card} width={spotW} />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text style={[type.secondary, { color: color.secondary }]}>{spot.gainCents != null ? 'Best buy' : 'Top slab'}</Text>
            <Text style={[type.body, { color: color.ink }]}>{spot.row.card.name}</Text>
            <Text style={[type.secondary, { color: color.secondary }]}>{cardLabel(spot.row.card)}</Text>
            <Text style={[type.rowPrice, { color: color.ink, paddingTop: space.s }]}>{money(spot.row.price!.marketCents)}</Text>
            {spot.gainCents != null ? (
              <Text style={[type.secondary, { color: color.secondary }]}>
                <Text style={{ color: color.gain }}>{signed(spot.gainCents)}</Text> on what you paid
              </Text>
            ) : null}
          </View>
        </Pressable>
      ) : (
        <View style={styles.emptyHero}>
          <View style={[styles.ghost, { width: spotW, height: (spotW * size.heroH) / size.heroW }]} />
          <Text style={[type.body, styles.center, { color: color.ink, paddingTop: space.xl }]}>Your best slab shows here</Text>
          <Text style={[type.text, styles.center, { color: color.secondary }]}>Scan your first slab to start.</Text>
        </View>
      )}

      {/* Grade mix: one bar in ink tones, no color. */}
      {mix.length ? (
        <Block title="Grades">
          <View style={styles.bar}>
            {mix.map((b, i) => (
              <View key={b.key} style={{ flex: b.share, backgroundColor: color.ink, opacity: BAND_OPACITY[b.key], marginLeft: i ? space.xs / 2 : 0 }} />
            ))}
          </View>
          <View style={styles.legend}>
            {mix.map((b) => (
              <View key={b.key} style={styles.legendItem}>
                <View style={[styles.swatch, { backgroundColor: color.ink, opacity: BAND_OPACITY[b.key] }]} />
                <Text style={[type.secondary, { color: color.ink }]}>
                  {b.key === 'raw' || b.key === 'lower' ? b.label : `PSA ${b.label}`}
                  <Text style={{ color: color.secondary }}>{`  ${b.n}`}</Text>
                </Text>
              </View>
            ))}
          </View>
        </Block>
      ) : null}

      {/* Recent activity: what came in and what went out. */}
      {activity.length ? (
        <Block title="Recent activity">
          {activity.map((a, i) => {
            const c = a.row.card;
            const profit = a.kind === 'sold' && c.soldCents != null && c.paidCents != null ? c.soldCents - c.paidCents : null;
            const price = a.kind === 'sold' ? c.soldCents : a.row.price?.marketCents ?? null;
            return (
              <View key={`${a.kind}:${c.id}`}>
                {i ? <Hairline inset={size.thumbW + space.m} /> : null}
                <Pressable accessibilityRole="button" onPress={() => router.push(`/card/${c.id}`)} style={({ pressed }) => [styles.activity, pressed && { opacity: 0.6 }]}>
                  <SlabView card={c} width={size.thumbW} posed={false} shadow={false} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={2} style={[type.body, { color: color.ink }]}>{c.name}</Text>
                    <Text style={[type.secondary, { color: color.secondary }]}>
                      {a.kind === 'sold' ? 'Sold' : 'Added'} {saleDay(a.at)} · {cardLabel(c)}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[type.numberM, { color: color.ink }]}>{price != null ? money(price) : '—'}</Text>
                    {profit != null ? <Text style={[type.caption, { color: upDown(profit) }]}>{signed(profit)}</Text> : null}
                  </View>
                </Pressable>
              </View>
            );
          })}
        </Block>
      ) : null}

      {/* Wishlist: one row into its own page. */}
      <View style={[styles.gutter, { paddingTop: space.xxl }]}>
        <Hairline />
        <Pressable accessibilityRole="button" onPress={() => router.push('/wishlist')} style={({ pressed }) => [styles.wishRow, pressed && { opacity: 0.6 }]}>
          {wished.length ? <Fan images={wished.slice(0, 3).map((w) => ({ key: w.key, uri: w.imageUrl, label: w.name }))} /> : null}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[type.body, { color: color.ink }]}>Wishlist</Text>
            <Text style={[type.secondary, { color: color.secondary }]}>
              {wished.length ? (
                <>
                  {wish.count} {wish.count === 1 ? 'card' : 'cards'}
                  {wish.below.length ? <Text style={{ color: color.gain }}>{` · ${wish.below.length} at or under your price`}</Text> : ` · ${money(wish.totalCents)} at your prices`}
                </>
              ) : (
                'Cards you’re hunting and what you’d pay'
              )}
            </Text>
          </View>
          <Text style={[type.text, { color: color.secondary }]}>›</Text>
        </Pressable>
        <Hairline />
      </View>

      {/* A few numbers worth showing off. */}
      {stats.paidCents || stats.sold ? (
        <Block title="Numbers">
          {stats.paidCents ? (
            <Line label="Gain on what you paid" sub={`${gainPct != null ? `${gainPct >= 0 ? '+' : '−'}${Math.abs(gainPct)}% on ` : 'on '}${money(stats.paidCents)} paid`}>
              <Text style={{ color: upDown(stats.gainCents) }}>{signed(stats.gainCents)}</Text>
            </Line>
          ) : null}
          {stats.paidCents && stats.sold ? <Hairline /> : null}
          {stats.sold ? (
            <Line label={`Sold ${stats.sold} ${stats.sold === 1 ? 'card' : 'cards'}`} sub={`${signed(stats.profitCents)} profit`} subColor={upDown(stats.profitCents)}>
              {money(stats.soldCents)}
            </Line>
          ) : null}
        </Block>
      ) : null}

      <View style={styles.share}>
        {spot ? (
          <PrimaryButton title="Share profile" onPress={() => router.push('/share-profile')} />
        ) : (
          <PrimaryButton title="Scan a slab" onPress={() => router.push('/scan')} />
        )}
      </View>
    </ScrollView>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  const color = useColors();
  const styles = useStyles();
  return (
    <View style={[styles.gutter, { paddingTop: space.xxl }]}>
      <Text style={[type.section, { color: color.ink, paddingBottom: space.m }]}>{title}</Text>
      {children}
    </View>
  );
}

/** A stat line: label and a quiet line under it on the left, the number on the right. */
function Line({ label, sub, subColor, children }: { label: string; sub?: string; subColor?: string; children: ReactNode }) {
  const color = useColors();
  const styles = useStyles();
  return (
    <View style={styles.line}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[type.text, { color: color.ink }]}>{label}</Text>
        {sub ? <Text style={[type.secondary, { color: subColor ?? color.secondary }]}>{sub}</Text> : null}
      </View>
      <Text style={[type.numberM, { color: color.ink }]}>{children}</Text>
    </View>
  );
}

function MoreIcon() {
  const color = useColors();
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill={color.ink}>
      <Circle cx={5.5} cy={12} r={1.6} />
      <Circle cx={12} cy={12} r={1.6} />
      <Circle cx={18.5} cy={12} r={1.6} />
    </Svg>
  );
}

function CameraIcon() {
  const color = useColors();
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={color.onInk} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4 8.5h3l1.5-2.5h7L17 8.5h3v10H4Z" />
      <Circle cx={12} cy={13} r={3.25} />
    </Svg>
  );
}

const useStyles = themed((color) =>
  StyleSheet.create({
    gutter: { paddingHorizontal: space.gutter },
    header: { height: size.touch, flexDirection: 'row', justifyContent: 'flex-end', paddingRight: space.gutter - space.m },
    who: { flexDirection: 'row', alignItems: 'center', gap: space.l, paddingHorizontal: space.gutter },
    camera: {
      position: 'absolute',
      right: -space.xs,
      bottom: -space.xs,
      width: size.stepper - space.xs,
      height: size.stepper - space.xs,
      borderRadius: size.stepper,
      backgroundColor: color.ink,
      borderWidth: space.xs / 2 + 1,
      borderColor: color.canvas,
      alignItems: 'center',
      justifyContent: 'center',
    },
    names: { flex: 1, minWidth: 0, gap: 2 },
    metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.xs, paddingTop: space.s },
    metaLink: { minHeight: size.touch, justifyContent: 'center' },
    center: { textAlign: 'center' },
    spot: { flexDirection: 'row', alignItems: 'center', gap: space.xl, paddingHorizontal: space.gutter, paddingTop: space.xxl },
    emptyHero: { alignItems: 'center', paddingHorizontal: space.gutter, paddingTop: space.xxl },
    ghost: { borderRadius: radius.slab, borderWidth: 2, borderColor: color.ghost, borderStyle: 'dashed' },
    bar: { flexDirection: 'row', height: space.s, borderRadius: space.xs, overflow: 'hidden' },
    legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.l, rowGap: space.s, paddingTop: space.m },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: space.s },
    swatch: { width: space.s + 2, height: space.s + 2, borderRadius: 2 },
    activity: { minHeight: size.rowCon, flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.s },
    wishRow: { minHeight: size.rowCon, flexDirection: 'row', alignItems: 'center', gap: space.m },
    line: { minHeight: size.rowVault, flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.s },
    share: { paddingHorizontal: space.gutter, paddingTop: space.xxxl },
  }),
);
