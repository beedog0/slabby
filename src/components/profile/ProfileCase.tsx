// Someone's profile as others see it: a display case. Their photo, name and @handle; a few
// numbers; then their best slab on its own lit ledge, and the rest standing on wood shelves, three
// across, like the cabinet at a card shop. Prices only if they chose to show them.
//
// The action (Add friend, Accept, Share profile) is passed in, so this one view serves a visitor,
// a friend, and you previewing your own.

import { router } from 'expo-router';
import { useMemo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { cardLabel, money, rowTitle } from '../../lib/format';
import type { CardRow } from '../../pricing/portfolio';
import { asCard, topGradeText, type PublicCard, type PublicProfile } from '../../profile/publicProfile';
import { size, space, type } from '../../theme/tokens';
import { themed, useColors } from '../../theme/theme';
import { Avatar } from '../Avatar';
import { Ledge, ShelfView } from '../collection/ShelfView';
import { openMenu } from '../menu/Menu';
import { SlabView } from '../SlabView';
import { initialOf } from '../../store/profile';

type Props = {
  profile: PublicProfile;
  friendCount?: number | null;
  /** The one button under the name. */
  action?: ReactNode;
  /** A quiet line under the button, e.g. "Friends" or "Request sent". */
  note?: ReactNode;
  /** Shown instead of the case when the collection is hidden from you. */
  hiddenText?: string;
};

const asRow = (p: PublicCard): CardRow => ({
  card: asCard(p),
  price: null,
  gain: null,
  trend30: 0,
  ask: null,
  floor: null,
  floorBasis: null,
  buyTarget: null,
  buyMax: null,
});

/** Their slab, large, with a way to look the card up. Read-only: it isn't yours. */
function openTheirSlab(p: PublicCard) {
  const card = asCard(p);
  openMenu({
    card,
    title: rowTitle(card),
    subtitle: [cardLabel(card), p.valueCents != null ? money(p.valueCents) : null].filter(Boolean).join(' · '),
    items: [{ label: 'Look up this card', onPress: () => router.push(`/search?q=${encodeURIComponent([p.name, p.number].filter(Boolean).join(' '))}`) }],
  });
}

export function ProfileCase({ profile, friendCount, action, note, hiddenText }: Props) {
  const color = useColors();
  const styles = useStyles();
  const { width } = useWindowDimensions();
  const sc = profile.showcase;
  const [hero, ...rest] = sc?.cards ?? [];
  const rows = useMemo(() => rest.map(asRow), [sc]);
  const top = sc ? topGradeText(sc.stats) : null;

  const stats: { value: string; label: string }[] = sc
    ? [
        ...(sc.stats.valueCents != null ? [{ value: money(sc.stats.valueCents), label: 'Value' }] : []),
        { value: String(sc.stats.owned), label: sc.stats.owned === 1 ? 'Slab' : 'Slabs' },
        ...(top ? [{ value: top, label: 'Top grade' }] : []),
        { value: String(sc.stats.sets), label: sc.stats.sets === 1 ? 'Set' : 'Sets' },
      ]
    : [];

  return (
    <View>
      <View style={styles.who}>
        <Avatar photo={profile.photo} letter={initialOf(profile.name, profile.handle)} px={size.avatarEdit} />
        <View style={styles.names}>
          <Text style={[type.title, styles.center, { color: color.ink }]}>{profile.name || `@${profile.handle}`}</Text>
          <Text style={[type.text, styles.center, { color: color.secondary }]}>
            {profile.name ? `@${profile.handle}` : null}
            {profile.name && friendCount ? ' · ' : null}
            {friendCount ? `${friendCount} ${friendCount === 1 ? 'friend' : 'friends'}` : null}
          </Text>
          {profile.bio ? <Text style={[type.text, styles.center, { color: color.ink, paddingTop: space.s }]}>{profile.bio}</Text> : null}
        </View>
      </View>

      {action ? <View style={styles.action}>{action}</View> : null}
      {note ? <View style={styles.note}>{note}</View> : null}

      {stats.length ? (
        <View style={styles.stats}>
          {stats.map((s, i) => (
            <View key={s.label} style={styles.statWrap}>
              {i > 0 ? <View style={styles.divider} /> : null}
              <View style={styles.stat}>
                <Text numberOfLines={1} adjustsFontSizeToFit style={[type.rowPrice, { color: color.ink }]}>
                  {s.value}
                </Text>
                <Text style={[type.secondary, { color: color.secondary }]}>{s.label}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {hero ? (
        <>
          {/* The centrepiece: posed, lit in dark mode, on a ledge of its own. */}
          <View style={styles.case}>
            <Pressable accessibilityRole="button" onPress={() => openTheirSlab(hero)} style={styles.heroSlab}>
              <SlabView card={asCard(hero)} width={size.carouselSlabW} spotlight />
            </Pressable>
            <View style={{ width: size.carouselSlabW + space.xxxl * 2 }}>
              <Ledge />
            </View>
            <Text style={[type.body, styles.center, { color: color.ink, paddingTop: space.l }]}>{rowTitle(asCard(hero))}</Text>
            <Text style={[type.text, styles.center, { color: color.secondary }]}>
              {[cardLabel(asCard(hero)), hero.valueCents != null ? money(hero.valueCents) : null].filter(Boolean).join(' · ')}
            </Text>
          </View>
          {rows.length ? (
            <View style={styles.shelves}>
              <ShelfView
                rows={rows}
                width={width - space.gutter * 2}
                perRow={3}
                actions={{ onPress: (r) => openTheirSlab(rest.find((p) => p.id === r.card.id)!) }}
              />
            </View>
          ) : null}
        </>
      ) : (
        <View style={styles.hidden}>
          <View style={[styles.ghost, { width: size.carouselSlabW * 0.55, height: (size.carouselSlabW * 0.55 * size.heroH) / size.heroW }]} />
          <Text style={[type.text, styles.center, { color: color.secondary, paddingTop: space.xl }]}>
            {hiddenText ?? (sc ? 'No slabs to show yet.' : 'This collection is private.')}
          </Text>
        </View>
      )}
    </View>
  );
}

const useStyles = themed((color) =>
  StyleSheet.create({
    who: { alignItems: 'center', paddingHorizontal: space.gutter, gap: space.l },
    names: { alignItems: 'center', gap: 2 },
    center: { textAlign: 'center' },
    action: { paddingHorizontal: space.gutter, paddingTop: space.xl },
    note: { alignItems: 'center', paddingTop: space.m },
    stats: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.gutter, paddingTop: space.xxl },
    statWrap: { flex: 1, flexDirection: 'row', alignItems: 'center' },
    stat: { flex: 1, alignItems: 'center', gap: 2 },
    divider: { width: StyleSheet.hairlineWidth * 2, height: 28, backgroundColor: color.hairline },
    case: { alignItems: 'center', paddingTop: space.xxxl },
    heroSlab: { marginBottom: -2, zIndex: 1 },
    shelves: { paddingHorizontal: space.gutter, paddingTop: space.xxxl },
    hidden: { alignItems: 'center', paddingHorizontal: space.gutter, paddingTop: space.xxxl },
    ghost: { borderRadius: 12, borderWidth: 2, borderColor: color.ghost, borderStyle: 'dashed' },
  }),
);
