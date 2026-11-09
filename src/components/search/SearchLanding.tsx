// What Search shows before you type, so the tab opens onto something to look at (Bryan: the empty
// tab felt "claustrophobic, trapped"; then "spice up that page"). Top to bottom:
//   Recent or popular searches (chips) · (Wishlist is a button on the game-tab row above) ·
//   Top movers (Up / Down, big 2-across grid) · New sealed (3-across) · Sealed pick of the day ·
//   Sets moving (or Newest sets) · Recently viewed.
// The local parts (wishlist, searches, recently viewed) show at once and offline; the discovery
// parts come from one server call (src/services/landing.ts), start from the last copy saved on
// the phone, and simply don't show when there's nothing (no signal, an old server, a new game).

import { router } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { cardPrice } from '../../lib/format';
import { cachedLanding, EMPTY_LANDING, fetchLanding, type HotSet, type Landing } from '../../services/landing';
import { displayName } from '../../services/search';
import type { Found } from '../../services/searchFilters';
import { useRecent } from '../../store/recent';
import type { Game } from '../../types';
import { radius, size, space, type } from '../../theme/tokens';
import { themed, useColors } from '../../theme/theme';
import { ArtImage, prefetchArt } from '../ArtImage';
import { Hairline } from '../ui';
import { CatalogTile, ChangeText, cardH } from './CatalogTile';

const POPULAR: Record<Game | 'all', string[]> = {
  all: ['Charizard', 'Umbreon', 'Pikachu', 'Mew', 'Gengar', 'Rayquaza'],
  pokemon: ['Charizard', 'Umbreon', 'Pikachu', 'Mew', 'Gengar', 'Rayquaza'],
  onepiece: ['Luffy', 'Zoro', 'Shanks', 'Nami', 'Ace', 'Yamato'],
  riftbound: ['Jinx', 'Ahri', 'Yasuo', 'Lux', 'Viktor', 'Teemo'],
};
/** Rail tiles: two and a half across, so the next one peeks in. */
const railW = (screen: number) => Math.floor((screen - space.gutter - space.m * 2) / 2.6);
const MOVERS_SHOWN = 4;
const SEALED_SHOWN = 6;

export function SearchLanding({
  onQuery,
  onOpen,
  game,
  note,
}: {
  onQuery: (q: string) => void;
  /** Open a catalog card or sealed item (adds it to Recently viewed). */
  onOpen: (card: Found) => void;
  /** The game tab picked above the field; null = all. */
  game: Game | null;
  /** e.g. the catalog still loading. */
  note?: string | null;
}) {
  const color = useColors();
  const styles = useStyles();
  const { width } = useWindowDimensions();
  const { queries, viewed: allViewed, clearQueries } = useRecent();
  const viewed = useMemo(() => (game ? allViewed.filter((c) => c.game === game) : allViewed), [allViewed, game]);
  const feed = useLanding(game);
  const [dir, setDir] = useState<'up' | 'down'>('up');
  const openList = (kind: 'up' | 'down' | 'sealed') => router.push({ pathname: '/movers', params: { kind, game: game ?? 'all' } });

  const half = Math.floor((width - space.gutter * 2 - space.l) / 2);
  const third = Math.floor((width - space.gutter * 2 - space.m * 2) / 3);
  const searches = queries.length ? queries : POPULAR[game ?? 'all'];

  // Up and Down: show whichever has cards; the toggle only when both do.
  const side = dir === 'up' ? (feed.up.length ? 'up' : 'down') : feed.down.length ? 'down' : 'up';
  const movers = (side === 'up' ? feed.up : feed.down).slice(0, MOVERS_SHOWN);
  const dayList = movers.map((m) => m.days);
  const moverDays = dayList.length && Math.min(...dayList) === Math.max(...dayList) ? dayList[0] : null;
  const sealed = feed.sealedNew.slice(0, SEALED_SHOWN);
  const hot = feed.sets.length && feed.sets[0].why === 'hot';
  const waitDay =
    feed.moversFrom && feed.moversFrom > new Date().toISOString().slice(0, 10)
      ? new Date(`${feed.moversFrom}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
      : null;

  return (
    <View style={{ paddingTop: space.l }}>
      <Section
        title={queries.length ? 'Recent searches' : 'Popular searches'}
        action={queries.length ? { label: 'Clear', onPress: clearQueries } : undefined}
        first
      >
        <View style={styles.chips}>
          {searches.map((q) => (
            <Pressable key={q} accessibilityRole="button" onPress={() => onQuery(q)} style={({ pressed }) => [styles.chip, pressed && { opacity: 0.6 }]}>
              <Text numberOfLines={1} style={[type.text, { color: color.ink }]}>
                {q}
              </Text>
            </Pressable>
          ))}
        </View>
      </Section>

      {movers.length ? (
        <Section
          title="Top movers"
          sub={`TCGplayer market · this week vs last, steady prices only${moverDays != null && moverDays < 7 ? ` · ${moverDays} days` : ''}`}
          right={
            feed.up.length && feed.down.length ? (
              <View style={styles.toggle}>
                {(['up', 'down'] as const).map((d) => (
                  <Pressable key={d} accessibilityRole="tab" accessibilityState={{ selected: side === d }} onPress={() => setDir(d)} hitSlop={10}>
                    <Text style={[type.text, { color: side === d ? color.ink : color.secondary, fontWeight: side === d ? '600' : '400' }]}>
                      {d === 'up' ? 'Up' : 'Down'}
                    </Text>
                    <View style={[styles.underline, { backgroundColor: side === d ? color.ink : 'transparent' }]} />
                  </Pressable>
                ))}
              </View>
            ) : undefined
          }
        >
          <View style={[styles.grid, { rowGap: space.xl, columnGap: space.l }]}>
            {movers.map((m) => (
              <CatalogTile key={m.productId} item={m} width={half} change={m.change} hist={m.hist} onPress={() => onOpen(m)} />
            ))}
          </View>
          {(side === 'up' ? feed.up : feed.down).length > MOVERS_SHOWN ? (
            <More label={`See all ${(side === 'up' ? feed.up : feed.down).length} ${side === 'up' ? 'rising' : 'falling'}`} onPress={() => openList(side)} />
          ) : null}
        </Section>
      ) : null}

      {!movers.length && waitDay ? (
        <Section title="Top movers" sub={`Starts ${waitDay}, once there’s a full week of TCGplayer prices to compare.`} compact>
          {null}
        </Section>
      ) : null}

      {sealed.length ? (
        <Section title="New sealed" sub="Boxes, ETBs, bundles and collections from the newest sets">
          <View style={[styles.grid, { rowGap: space.xl, columnGap: space.m }]}>
            {sealed.map((s) => (
              <CatalogTile key={s.productId} item={s} width={third} change={s.change} hist={s.hist} onPress={() => onOpen(s)} />
            ))}
          </View>
          {feed.sealedNew.length > SEALED_SHOWN ? <More label={`See all ${feed.sealedNew.length}`} onPress={() => openList('sealed')} /> : null}
        </Section>
      ) : null}

      {feed.sealedPick.length ? (
        <Section title="Sealed pick of the day" sub="A different handful every day">
          <Rail items={feed.sealedPick} width={railW(width)} onOpen={onOpen} />
        </Section>
      ) : null}

      {feed.sets.length ? (
        <Section title={hot ? 'Sets rising' : 'Newest sets'} sub={hot ? 'Median move of each set’s $5+ cards · TCGplayer market' : undefined}>
          <View style={styles.gutter}>
            {feed.sets.slice(0, 6).map((s, i) => (
              <View key={s.groupId}>
                {i ? <Hairline inset={size.thumbW + space.m} /> : null}
                <SetRow set={s} />
              </View>
            ))}
          </View>
        </Section>
      ) : null}

      {viewed.length ? (
        <Section title="Recently viewed">
          <Rail items={viewed} width={railW(width)} onOpen={onOpen} />
        </Section>
      ) : null}

      {note ? <Text style={[type.caption, styles.gutter, { color: color.secondary, paddingBottom: space.xl }]}>{note}</Text> : null}
    </View>
  );
}

/** The feed for a game: the saved copy first, then the server's. Errors keep what's showing. */
function useLanding(game: Game | null): Landing {
  const [feed, setFeed] = useState<Landing>(EMPTY_LANDING);
  useEffect(() => {
    let live = true;
    let fresh = false;
    setFeed(EMPTY_LANDING);
    cachedLanding(game).then((c) => {
      if (live && c && !fresh) setFeed(c);
    });
    fetchLanding(game)
      .then((l) => {
        if (!live) return;
        fresh = true;
        setFeed(l);
        prefetchArt([...l.up.slice(0, MOVERS_SHOWN), ...l.sealedNew.slice(0, SEALED_SHOWN)].map((c) => c.imageUrl));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [game]);
  return feed;
}

function Section({
  title,
  sub,
  action,
  right,
  first,
  compact,
  children,
}: {
  title: string;
  sub?: string;
  action?: { label: string; onPress: () => void };
  right?: ReactNode;
  first?: boolean;
  /** Header only (no content under it): no space left for content. */
  compact?: boolean;
  children: ReactNode;
}) {
  const color = useColors();
  const styles = useStyles();
  return (
    <View style={[styles.section, first && { paddingTop: 0 }]}>
      {first ? null : (
        <View style={[styles.gutter, { paddingBottom: space.xl }]}>
          <Hairline />
        </View>
      )}
      <View style={[styles.sectionHead, compact && { paddingBottom: 0 }]}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[type.section, { color: color.ink }]}>{title}</Text>
          {sub ? <Text style={[type.secondary, { color: color.secondary, paddingTop: 2 }]}>{sub}</Text> : null}
        </View>
        {action ? (
          <Pressable accessibilityRole="button" onPress={action.onPress} style={styles.action}>
            <Text style={[type.text, { color: color.secondary }]}>{action.label}</Text>
          </Pressable>
        ) : null}
        {right}
      </View>
      {children}
    </View>
  );
}

function More({ label, onPress }: { label: string; onPress: () => void }) {
  const color = useColors();
  const styles = useStyles();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.more}>
      <Text style={[type.text, { color: color.ink }]}>
        {label} <Text style={{ color: color.secondary }}>›</Text>
      </Text>
    </Pressable>
  );
}

/** A sideways row of catalog tiles. */
function Rail({ items, width, onOpen }: { items: (Found & { change?: number | null; hist?: number[] })[]; width: number; onOpen: (c: Found) => void }) {
  const styles = useStyles();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail} keyboardShouldPersistTaps="handled">
      {items.map((c) => (
        <CatalogTile key={c.productId} item={c} width={width} change={c.change !== undefined ? c.change : c.change7d} hist={c.hist} onPress={() => onOpen(c)} />
      ))}
    </ScrollView>
  );
}

/** A set: its most valuable card's picture, the set name, and its move or its top card's price. */
function SetRow({ set }: { set: HotSet }) {
  const color = useColors();
  const styles = useStyles();
  const open = () =>
    router.push({ pathname: '/set/[id]', params: { id: String(set.groupId), name: set.setName, language: set.language, game: set.game } });
  return (
    <Pressable accessibilityRole="button" onPress={open} style={({ pressed }) => [styles.setRow, pressed && { opacity: 0.6 }]}>
      <View style={styles.thumb}>
        <ArtImage uri={set.topImage} label={set.setName} recyclingKey={`set:${set.groupId}`} style={{ flex: 1 }} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[type.body, { color: color.ink }]}>{set.setName}</Text>
        {set.topName ? (
          <Text numberOfLines={2} style={[type.secondary, { color: color.secondary }]}>
            Top card {displayName(set.topName)}
            {set.topCents != null ? ` · ${cardPrice(set.topCents)}` : ''}
          </Text>
        ) : null}
      </View>
      {set.change != null ? <ChangeText fraction={set.change} style={type.numberM} /> : <Text style={[type.text, { color: color.secondary }]}>›</Text>}
    </Pressable>
  );
}

const useStyles = themed((color) =>
  StyleSheet.create({
    gutter: { paddingHorizontal: space.gutter },
    section: { paddingTop: space.xxl },
    sectionHead: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: space.m,
      paddingHorizontal: space.gutter,
      paddingBottom: space.l,
    },
    action: { minHeight: size.touch, justifyContent: 'flex-end', paddingBottom: 2 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s, paddingHorizontal: space.gutter },
    chip: {
      height: size.chip + space.s,
      paddingHorizontal: space.l,
      borderRadius: radius.chip + space.xs,
      backgroundColor: color.well,
      justifyContent: 'center',
    },
    toggle: { flexDirection: 'row', gap: space.l, paddingBottom: 2 },
    underline: { height: 2, marginTop: space.xs, borderRadius: 1 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: space.gutter },
    more: { alignSelf: 'center', minHeight: size.touch, justifyContent: 'center', paddingTop: space.m },
    rail: { paddingHorizontal: space.gutter, gap: space.m },
    setRow: { minHeight: size.rowVault, flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.s },
    thumb: { width: size.thumbW, height: size.thumbH, borderRadius: radius.thumb, overflow: 'hidden', backgroundColor: color.well },
  }),
);

