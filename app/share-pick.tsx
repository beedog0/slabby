// Choose the cards for a share image, then drag them into place. Two steps, one button each:
// tap cards to pick them (an ink outline marks a pick, up to nine), then hold one and drag it to
// any spot on the shelves. The profile image picks from your collection; the wishlist image from
// your wishlist, or any card in the catalog: search it, pick the grade and what you'd pay, and it
// joins your wishlist and the image.

import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArtImage } from '../src/components/ArtImage';
import { ArrangeShelf } from '../src/components/collection/ArrangeShelf';
import { openMenu } from '../src/components/menu/Menu';
import { SelectOutline } from '../src/components/collection/SelectOutline';
import { SlabView } from '../src/components/SlabView';
import { BackIcon, Hairline, IconButton, PrimaryButton, SearchIcon } from '../src/components/ui';
import { rowTitle } from '../src/lib/format';
import { rowFor, type CardRow } from '../src/pricing/portfolio';
import { IMAGE_MAX, wishCard } from '../src/profile/shareImage';
import { useRules } from '../src/store/rules';
import { useSharing } from '../src/store/sharing';
import { useVault } from '../src/store/vault';
import { displayName, searchCards, shownNumber, type CatalogCard } from '../src/services/search';
import { useWishlist, wishKey, type WishGrade } from '../src/store/wishlist';
import { radius, size, space, type } from '../src/theme/tokens';
import { useColors } from '../src/theme/theme';

const COLS = 3;
const THUMB_W = 44;
const GAP = space.l;

export default function SharePick() {
  const color = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { kind } = useLocalSearchParams<{ kind?: string }>();
  const wish = kind === 'wish';
  const sharing = useSharing();
  const vault = useVault((s) => s.cards);
  const rules = useRules((s) => s.rules);
  const wishlist = useWishlist((s) => s.items);

  // Everything you can pick from, as rows the shelf views can draw.
  const all: CardRow[] = useMemo(
    () =>
      wish
        ? wishlist.map((w) => rowFor(wishCard(w), rules, null))
        : vault.filter((c) => c.status === 'owned').map((c) => rowFor(c, rules, null)),
    [wish, wishlist, vault, rules],
  );
  const byId = useMemo(() => new Map(all.map((r) => [r.card.id, r])), [all]);
  const saved = wish ? sharing.wishKeys : sharing.imageIds;
  const [picked, setPicked] = useState<string[]>(() => saved.filter((id) => byId.has(id)).slice(0, IMAGE_MAX));
  const [step, setStep] = useState<'pick' | 'arrange'>('pick');
  const [dragging, setDragging] = useState(false);
  const [full, setFull] = useState(false);
  const perRow = wish ? sharing.wishPerRow : sharing.perRow;

  const toggle = (id: string) => {
    setFull(false);
    if (picked.includes(id)) return setPicked(picked.filter((x) => x !== id));
    if (picked.length >= IMAGE_MAX) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      return setFull(true);
    }
    Haptics.selectionAsync().catch(() => {});
    setPicked([...picked, id]);
  };

  // Any card in the catalog (wishlist image only): search, choose a grade, set what you'd pay on
  // the wishlist price page; when it lands in the wishlist it's picked here too.
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<CatalogCard[] | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => {
    if (!wish || query.trim().length < 2) return setFound(null);
    const t = setTimeout(() => searchCards(query, null).then(setFound).catch(() => setFound([])), 250);
    return () => clearTimeout(t);
  }, [query, wish]);
  useEffect(() => {
    if (!pending || !byId.has(pending)) return;
    setPicked((p) => (p.includes(pending) || p.length >= IMAGE_MAX ? p : [...p, pending]));
    setPending(null);
    setQuery('');
  }, [pending, byId]);
  const addFromCatalog = (c: CatalogCard) => {
    const go = (g: WishGrade) => {
      const key = wishKey(c.productId, g);
      if (byId.has(key)) {
        setPicked((p) => (p.includes(key) || p.length >= IMAGE_MAX ? p : [...p, key]));
        setQuery('');
        return;
      }
      setPending(key);
      router.push(`/con/want/${c.productId}?grade=${g}`);
    };
    openMenu({
      title: displayName(c.name),
      subtitle: [c.setName, c.number ? shownNumber(c.number) : null].filter(Boolean).join(' · '),
      items: [
        (['psa10', 'psa9', 'psa8'] as WishGrade[]).map((g) => ({ label: `PSA ${g.slice(3)}`, onPress: () => go(g) })),
        [{ label: 'Raw', onPress: () => go('raw') }],
      ],
    });
  };

  const pickedRows = useMemo(() => picked.map((id) => byId.get(id)).filter((r): r is CardRow => !!r), [picked, byId]);

  const done = () => {
    sharing.set(wish ? { wishKeys: picked } : { imageIds: picked, imageOrder: 'custom' });
    router.back();
  };

  const cellW = Math.floor((width - space.gutter * 2 - GAP * (COLS - 1)) / COLS);
  const back = () => (step === 'arrange' ? setStep('pick') : router.back());

  return (
    <View style={{ flex: 1, backgroundColor: color.canvas }}>
      <View style={[styles.bar, { paddingTop: insets.top }]}>
        <IconButton label="Back" onPress={back}>
          <BackIcon />
        </IconButton>
      </View>
      <View style={styles.head}>
        <Text style={[type.title, { color: color.ink }]}>{step === 'pick' ? 'Choose cards' : 'Arrange'}</Text>
        <Text style={[type.text, { color: color.secondary }]}>
          {step === 'pick'
            ? full
              ? `That’s the most: ${IMAGE_MAX} cards`
              : `${picked.length} of ${IMAGE_MAX} · in the order you tap`
            : 'Hold a card, then drag it to any spot'}
        </Text>
      </View>

      <ScrollView scrollEnabled={!dragging} contentContainerStyle={{ paddingHorizontal: space.gutter, paddingTop: space.xl, paddingBottom: space.xxl }}>
        {step === 'pick' && wish ? (
          <View style={[styles.search, { backgroundColor: color.well }]}>
            <SearchIcon s={18} tint={color.secondary} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search any card"
              placeholderTextColor={color.secondary}
              autoCorrect={false}
              returnKeyType="search"
              clearButtonMode="while-editing"
              style={[type.body, { flex: 1, color: color.ink, fontWeight: '400', paddingVertical: 0 }]}
            />
          </View>
        ) : null}
        {step === 'pick' && found ? (
          found.length ? (
            found.map((c) => (
              <View key={c.productId}>
                <Pressable accessibilityRole="button" onPress={() => addFromCatalog(c)} style={({ pressed }) => [styles.result, pressed && { opacity: 0.6 }]}>
                  <View style={[styles.thumb, { backgroundColor: color.well }]}>
                    {c.imageUrl ? <ArtImage uri={c.imageUrl} recyclingKey={String(c.productId)} style={{ flex: 1 }} /> : null}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[type.body, { color: color.ink }]}>{displayName(c.name)}</Text>
                    <Text style={[type.secondary, { color: color.secondary }]}>
                      {[c.setName, c.number ? shownNumber(c.number) : null].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <Text style={[type.text, { color: color.ink }]}>Add</Text>
                </Pressable>
                <Hairline inset={THUMB_W + space.m} />
              </View>
            ))
          ) : (
            <Text style={[type.text, { color: color.secondary }]}>No cards match that.</Text>
          )
        ) : step === 'pick' ? (
          all.length ? (
            <View style={[styles.grid, { columnGap: GAP }]}>
              {all.map((r) => (
                <Pressable
                  key={r.card.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: picked.includes(r.card.id) }}
                  accessibilityLabel={rowTitle(r.card)}
                  onPress={() => toggle(r.card.id)}
                  style={{ width: cellW, alignItems: 'center' }}
                >
                  <View>
                    <SlabView card={r.card} width={cellW - size.selectGap * 2} posed={false} />
                    <SelectOutline on={picked.includes(r.card.id)} slabW={cellW - size.selectGap * 2} />
                  </View>
                </Pressable>
              ))}
            </View>
          ) : (
            <Text style={[type.text, { color: color.secondary }]}>
              {wish ? 'Search any card above to add it.' : 'Scan a slab first, then pick it here.'}
            </Text>
          )
        ) : (
          <ArrangeShelf
            rows={pickedRows}
            width={width - space.gutter * 2}
            order={picked}
            onOrder={(o) => setPicked(o.filter((id) => picked.includes(id)))}
            onDragChange={setDragging}
            perRow={perRow}
          />
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.l }]}>
        {step === 'pick' ? (
          <PrimaryButton
            title={picked.length ? `Arrange ${picked.length} ${picked.length === 1 ? 'card' : 'cards'}` : 'Pick at least one card'}
            onPress={() => picked.length && setStep('arrange')}
          />
        ) : (
          <PrimaryButton title="Done" onPress={done} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { minHeight: size.touch, flexDirection: 'row', paddingHorizontal: space.gutter - 10 },
  head: { paddingHorizontal: space.gutter, gap: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space.xl },
  search: { height: 44, borderRadius: radius.field, flexDirection: 'row', alignItems: 'center', gap: space.s, paddingHorizontal: space.m, marginBottom: space.xl },
  result: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: space.m },
  thumb: { width: THUMB_W, height: Math.round(THUMB_W * 1.4), borderRadius: radius.thumb, overflow: 'hidden' },
  footer: { paddingHorizontal: space.gutter, paddingTop: space.m },
});
