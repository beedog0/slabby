// The Profile tab: the page you'd show someone. Who you are, what the collection is worth, the
// slabs you're proudest of, and a few numbers worth bragging about. One button: Share profile.
//
// Top to bottom: your photo (tap it to change it), name, @handle and bio, centered; Value · Slabs ·
// Sold; your most valuable slab posed on its own with the next six under it; collection stats
// (gain on what you paid, best buy, grades, sets, added this month, sales); Share profile.
// Settings (Edit profile, Account, Pricing rules, Appearance) live in the … menu at the top.

import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { Avatar } from '../../src/components/Avatar';
import { SlabView } from '../../src/components/SlabView';
import { openDropdown } from '../../src/components/menu/Dropdown';
import { APPEARANCE_LABEL, openAppearance } from '../../src/components/menu/appearanceMenu';
import { shareSlabs } from '../../src/components/share/ShareCard';
import { IconButton, PrimaryButton } from '../../src/components/ui';
import { changeText, money } from '../../src/lib/format';
import { rowFor } from '../../src/pricing/portfolio';
import { profileStats, showcase } from '../../src/pricing/profileStats';
import { publishProfile } from '../../src/services/profile';
import { choosePhoto } from '../../src/components/photoChoice';
import { useAccount } from '../../src/store/account';
import { useAppearance } from '../../src/store/appearance';
import { usePrices } from '../../src/store/prices';
import { initialOf, useProfile } from '../../src/store/profile';
import { useRules } from '../../src/store/rules';
import { useVault } from '../../src/store/vault';
import { size, space, type } from '../../src/theme/tokens';
import { themed, useColors } from '../../src/theme/theme';

const COLS = 3;
const GAP = space.m;

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
  useFocusEffect(
    useCallback(() => {
      if (!guest) publishProfile(useProfile.getState()).catch(() => {});
    }, [guest]),
  );

  const rows = useMemo(() => cards.map((c) => rowFor(c, rules)), [cards, rules, prices]);
  const stats = useMemo(() => profileStats(rows), [rows]);
  const shelf = useMemo(() => showcase(rows, 1 + COLS * 2), [rows]);
  const [hero, ...rest] = shelf;

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
      [{ label: 'Edit profile', onPress: edit }],
      [
        { label: 'Account', detail: accountDetail, onPress: () => router.push('/settings/account') },
        { label: 'Pricing rules', onPress: () => router.push('/settings/pricing') },
        { label: 'Appearance', detail: APPEARANCE_LABEL[appearance], onPress: openAppearance },
      ],
    ]);

  const cellW = Math.floor((width - space.gutter * 2 - GAP * (COLS - 1)) / COLS);
  const month = changeText(stats.monthDeltaCents, stats.valueCents);
  const gainPct = stats.paidCents ? Math.round((stats.gainCents / stats.paidCents) * 100) : null;
  const signed = (c: number) => `${c >= 0 ? '+' : '−'}${money(Math.abs(c))}`;
  const upDown = (c: number) => (c >= 0 ? color.gain : color.loss);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: color.canvas }}
      contentContainerStyle={{ paddingTop: insets.top + space.s, paddingBottom: insets.bottom + space.xxl }}
    >
      <View style={styles.header}>
        <View ref={moreRef} collapsable={false}>
          <IconButton label="Settings" onPress={more}>
            <MoreIcon />
          </IconButton>
        </View>
      </View>

      {/* Who you are. Tap the photo to change it, the name to edit the rest. */}
      <View style={styles.who}>
        <Pressable accessibilityRole="button" accessibilityLabel={profile.photo ? 'Change photo' : 'Add a photo'} onPress={changePhoto} disabled={picking}>
          <Avatar photo={profile.photo} letter={initialOf(profile.name, profile.handle, email)} px={size.avatarEdit} busy={picking} />
          {!profile.photo ? (
            <View style={styles.camera}>
              <CameraIcon />
            </View>
          ) : null}
        </Pressable>
        <Pressable accessibilityRole="button" onPress={edit} style={styles.names}>
          {profile.name ? (
            <Text style={[type.title, styles.center, { color: color.ink }]}>{profile.name}</Text>
          ) : (
            <Text style={[type.body, styles.center, { color: color.ink }]}>Add your name ›</Text>
          )}
          <Text style={[type.text, styles.center, { color: color.secondary }]}>
            {profile.handle ? `@${profile.handle}` : 'Pick a handle so friends can find you'}
          </Text>
          {profile.bio ? <Text style={[type.text, styles.center, { color: color.ink, paddingTop: space.s }]}>{profile.bio}</Text> : null}
        </Pressable>
        {guest ? (
          <Pressable accessibilityRole="link" onPress={() => router.push('/settings/account')} hitSlop={8}>
            <Text style={[type.secondary, { color: color.secondary }]}>
              Not saved to an account · <Text style={{ color: color.ink }}>Sign in</Text>
            </Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.stats}>
        <Stat value={money(stats.valueCents)} label="Value" />
        <View style={styles.divider} />
        <Stat value={String(stats.owned)} label={stats.owned === 1 ? 'Slab' : 'Slabs'} />
        <View style={styles.divider} />
        <Stat value={String(stats.sold)} label="Sold" />
      </View>
      {month ? (
        <Text style={[type.secondary, styles.center, { color: color.secondary, paddingTop: space.s }]}>
          <Text style={{ color: upDown(stats.monthDeltaCents) }}>{month}</Text> this month
        </Text>
      ) : null}

      {/* The showcase: the most valuable slab on its own, the next six under it. */}
      {hero ? (
        <>
          <Pressable accessibilityRole="button" onPress={() => router.push(`/card/${hero.card.id}`)} style={styles.hero}>
            <SlabView card={hero.card} width={size.carouselSlabW} />
            <Text style={[type.body, styles.center, { color: color.ink, paddingTop: space.xl }]}>{hero.card.name}</Text>
            <Text style={[type.numberM, styles.center, { color: color.ink }]}>{money(hero.price!.marketCents)}</Text>
          </Pressable>
          {rest.length ? (
            <View style={styles.grid}>
              {rest.map((r) => (
                <Pressable key={r.card.id} accessibilityRole="button" onPress={() => router.push(`/card/${r.card.id}`)}>
                  <SlabView card={r.card} width={cellW} posed={false} />
                </Pressable>
              ))}
            </View>
          ) : null}
          <Pressable accessibilityRole="link" onPress={() => router.navigate('/')} style={styles.seeAll} hitSlop={8}>
            <Text style={[type.text, { color: color.secondary }]}>See collection ›</Text>
          </Pressable>
        </>
      ) : (
        <View style={styles.hero}>
          <View style={[styles.ghost, { width: size.carouselSlabW * 0.6, height: (size.carouselSlabW * 0.6 * size.heroH) / size.heroW }]} />
          <Text style={[type.body, styles.center, { color: color.ink, paddingTop: space.xl }]}>Your best slabs show here</Text>
          <Text style={[type.text, styles.center, { color: color.secondary }]}>Scan your first slab to start the showcase.</Text>
        </View>
      )}

      {/* Numbers worth showing off. Pairs, so nothing crowds. */}
      {stats.owned ? (
        <View style={styles.section}>
          <Text style={[type.section, { color: color.ink, paddingBottom: space.l }]}>Collection stats</Text>
          <View style={styles.pairs}>
            {stats.paidCents ? (
              <Fact label="Gain on what you paid">
                <Text style={{ color: upDown(stats.gainCents) }}>{signed(stats.gainCents)}</Text>
                <Fact.Sub>{`${gainPct != null ? `${gainPct >= 0 ? '+' : '−'}${Math.abs(gainPct)}% on ` : 'on '}${money(stats.paidCents)} paid`}</Fact.Sub>
              </Fact>
            ) : null}
            {stats.bestBuy ? (
              <Fact label="Best buy">
                <Text style={{ color: color.gain }}>{signed(stats.bestBuy.gainCents)}</Text>
                <Fact.Sub>{stats.bestBuy.row.card.name}</Fact.Sub>
              </Fact>
            ) : null}
            {stats.grades.length ? (
              <Fact label="Grades">
                {stats.grades
                  .slice(0, 3)
                  .map(([g, n]) => `${n}× ${g}`)
                  .join('  ')}
                <Fact.Sub>{stats.raw ? `${stats.graded} graded · ${stats.raw} raw` : `${stats.graded} graded`}</Fact.Sub>
              </Fact>
            ) : null}
            <Fact label="Sets">
              {String(stats.sets)}
              <Fact.Sub>{stats.addedMonth ? `${stats.addedMonth} added this month` : 'Nothing added this month'}</Fact.Sub>
            </Fact>
            {stats.sold ? (
              <Fact label="Sold">
                {money(stats.soldCents)}
                <Fact.Sub>
                  <Text style={{ color: upDown(stats.profitCents) }}>{signed(stats.profitCents)}</Text> profit
                </Fact.Sub>
              </Fact>
            ) : null}
          </View>
        </View>
      ) : null}

      <View style={styles.share}>
        {hero ? (
          <PrimaryButton title="Share profile" onPress={() => shareSlabs(shelf.map((r) => r.card))} />
        ) : (
          <PrimaryButton title="Scan a slab" onPress={() => router.push('/scan')} />
        )}
      </View>
    </ScrollView>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  const color = useColors();
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <Text numberOfLines={1} adjustsFontSizeToFit style={[type.rowPrice, { color: color.ink }]}>
        {value}
      </Text>
      <Text style={[type.secondary, { color: color.secondary }]}>{label}</Text>
    </View>
  );
}

/** One stat in the two-column list: a quiet label, the number, and a line about it. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  const color = useColors();
  const styles = useStyles();
  const kids = Array.isArray(children) ? children : [children];
  const sub = kids.filter((k) => (k as { type?: unknown })?.type === FactSub);
  const main = kids.filter((k) => (k as { type?: unknown })?.type !== FactSub);
  return (
    <View style={styles.fact}>
      <Text style={[type.secondary, { color: color.secondary }]}>{label}</Text>
      <Text style={[type.numberM, { color: color.ink }]}>{main}</Text>
      {sub}
    </View>
  );
}
function FactSub({ children }: { children: ReactNode }) {
  const color = useColors();
  return <Text style={[type.secondary, { color: color.secondary }]}>{children}</Text>;
}
Fact.Sub = FactSub;

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
    header: { height: size.touch, flexDirection: 'row', justifyContent: 'flex-end', paddingRight: space.gutter - 10 },
    who: { alignItems: 'center', paddingHorizontal: space.gutter, gap: space.l },
    camera: {
      position: 'absolute',
      right: 0,
      bottom: 0,
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: color.ink,
      borderWidth: 3,
      borderColor: color.canvas,
      alignItems: 'center',
      justifyContent: 'center',
    },
    names: { alignItems: 'center', gap: 2 },
    center: { textAlign: 'center' },
    stats: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.gutter, paddingTop: space.xxl },
    divider: { width: StyleSheet.hairlineWidth * 2, height: 28, backgroundColor: color.hairline },
    hero: { alignItems: 'center', paddingHorizontal: space.gutter, paddingTop: space.xxxl },
    ghost: { borderRadius: 12, borderWidth: 2, borderColor: color.ghost, borderStyle: 'dashed' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP, paddingHorizontal: space.gutter, paddingTop: space.xxl },
    seeAll: { alignSelf: 'center', paddingTop: space.xl, minHeight: size.touch, justifyContent: 'center' },
    section: { paddingHorizontal: space.gutter, paddingTop: space.xxl },
    pairs: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space.xl },
    fact: { width: '50%', paddingRight: space.l, gap: 2 },
    share: { paddingHorizontal: space.gutter, paddingTop: space.xxxl },
  }),
);
