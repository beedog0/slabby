// "Got an offer" from the con list: pick which card the offer is on, then go to Offer.

import { router } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ConRow } from '../../src/components/ConRow';
import { BackIcon, Hairline, IconButton } from '../../src/components/ui';
import { rowFor } from '../../src/pricing/portfolio';
import { usePrices } from '../../src/store/prices';
import { useRules } from '../../src/store/rules';
import { useVault } from '../../src/store/vault';
import { size, space, type } from '../../src/theme/tokens';
import { useColors } from '../../src/theme/theme';

export default function PickCard() {
  const color = useColors();
  const insets = useSafeAreaInsets();
  const cards = useVault((s) => s.cards);
  const rules = useRules((s) => s.rules);
  const prices = usePrices((s) => s.byKey);
  const rows = useMemo(
    () => cards.filter((c) => c.status === 'owned' && c.plan !== 'hold').map((c) => rowFor(c, rules)),
    [cards, rules, prices],
  );

  return (
    <View style={{ flex: 1, backgroundColor: color.canvas, paddingTop: insets.top }}>
      <View style={styles.nav}>
        <IconButton label="Back" onPress={() => router.back()}>
          <BackIcon />
        </IconButton>
        <Text style={[type.body, { color: color.ink }]}>Offer on which card?</Text>
        <View style={{ width: size.touch }} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.gutter, paddingBottom: insets.bottom + space.xxl }}>
        {rows.map((r) => (
          <View key={r.card.id}>
            <ConRow row={r} onPress={() => router.replace(`/con/offer/${r.card.id}`)} />
            <Hairline inset={size.thumbW + space.m} />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  nav: {
    height: size.touch + space.l,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.gutter - 12,
  },
});
