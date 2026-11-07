// Sell page for a scanned card that isn't in our catalog (no TCGplayer product to load charts
// and grade prices for): your slab, your asking price against the market the scan found, and the
// rating against what you paid. Cards in the catalog get the full page (app/search/[id].tsx ?sell=1).

import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardDone } from '../src/components/KeyboardDone';
import { SellSummary } from '../src/components/sell/SellSummary';
import { SlabView } from '../src/components/SlabView';
import { BackIcon, IconButton, PrimaryButton } from '../src/components/ui';
import { gradeLabel, money, rowTitle } from '../src/lib/format';
import { useRules } from '../src/store/rules';
import { saveDraft, useSellDraft } from '../src/store/sellDraft';
import { color, size, space, type } from '../src/theme/tokens';

export default function Sell() {
  const insets = useSafeAreaInsets();
  const draft = useSellDraft((s) => s.draft);
  const patch = useSellDraft((s) => s.patch);
  const rules = useRules((s) => s.rules);

  const back = (
    <View style={[styles.nav, { top: insets.top }]}>
      <IconButton label="Back" onPress={() => router.back()}>
        <BackIcon />
      </IconButton>
    </View>
  );
  if (!draft) return <View style={{ flex: 1, backgroundColor: color.canvas }}>{back}</View>;

  const grade = gradeLabel(draft.card.grader, draft.card.grade);
  // A pull with no catalog card has no pack price to look up: it's rated as $0 cost.
  const putUp = () => {
    const saved = saveDraft(draft, { cost: draft.cost, marketCents: draft.marketCents, rules });
    router.dismissAll();
    router.push(`/card/${saved.id}`);
  };

  return (
    <View style={{ flex: 1, backgroundColor: color.canvas }}>
      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentContainerStyle={{ paddingTop: insets.top + space.s, paddingBottom: space.xl }}>
        <View style={styles.hero}>
          <SlabView card={draft.card} width={Math.round(size.heroW * 0.8)} interactive />
        </View>
        <View style={styles.gutter}>
          <Text numberOfLines={2} style={[type.title, { color: color.ink }]}>
            {rowTitle(draft.card)}
          </Text>
          <Text numberOfLines={1} style={[type.text, { color: color.secondary }]}>
            {draft.card.setName} · {grade}
          </Text>
          <View style={{ paddingTop: space.xl }}>
            <SellSummary
              askCents={draft.askCents}
              onAsk={(askCents) => patch({ askCents })}
              marketCents={draft.marketCents}
              lowCents={null}
              gradeName={grade}
              cost={draft.cost}
              rules={rules}
            />
          </View>
          <Text style={[type.secondary, { color: color.secondary, paddingTop: space.xl }]}>
            Charts and grade prices show once this card is matched to TCGplayer’s catalog.
          </Text>
        </View>
      </ScrollView>
      {back}
      <View style={[styles.gutter, { paddingBottom: Math.max(insets.bottom, space.l), paddingTop: space.m }]}>
        <PrimaryButton title={`Put up for sale at ${money(draft.askCents)}`} onPress={putUp} />
      </View>
      <KeyboardDone />
    </View>
  );
}

const styles = StyleSheet.create({
  gutter: { paddingHorizontal: space.gutter },
  nav: { position: 'absolute', left: space.gutter - 10, zIndex: 1 },
  hero: { alignItems: 'center', justifyContent: 'center', paddingVertical: space.xl },
});
