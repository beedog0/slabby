// Offer: type their offer → verdict vs floor → Counter / Take. Reference: 06-offer.png.

import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Keypad } from '../../../src/components/Keypad';
import { PriceLine, type Tick } from '../../../src/components/PriceLine';
import { BackIcon, Hairline, IconButton, PrimaryButton } from '../../../src/components/ui';
import { gradeLabel, money, rowTitle } from '../../../src/lib/format';
import { inputsFor } from '../../../src/pricing/portfolio';
import { ebayNet, verdict } from '../../../src/pricing/rules';
import { useCardRow } from '../../../src/pricing/useCardRow';
import { useCon } from '../../../src/store/con';
import { useRules } from '../../../src/store/rules';
import { useVault } from '../../../src/store/vault';
import { color, size, space, type } from '../../../src/theme/tokens';

const MAX_DIGITS = 6;

export default function Offer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const row = useCardRow(id);
  const rules = useRules((s) => s.rules);
  const update = useVault((s) => s.update);
  const session = useCon((s) => s.session);
  const [digits, setDigits] = useState('');
  const prev = useRef(0);

  if (!row) return null;
  const { card, price } = row;
  const offer = (parseInt(digits || '0', 10) || 0) * 100;
  const hasOffer = digits.length > 0;
  const v = price ? verdict(offer, inputsFor(card, price, rules)) : null;
  const floor = row.floor;

  const setOffer = (next: string) => {
    const cents = (parseInt(next || '0', 10) || 0) * 100;
    // Detents: crossing the floor is a light tick, crossing what you paid is heavier.
    const crossed = (line: number | null | undefined) =>
      line != null && (prev.current < line) !== (cents < line);
    if (crossed(card.paidCents)) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    else if (crossed(floor)) Haptics.selectionAsync().catch(() => {});
    prev.current = cents;
    setDigits(next);
  };

  const sell = (cents: number) => {
    update(card.id, {
      status: 'sold',
      soldCents: cents,
      soldAt: new Date().toISOString(),
      soldWhere: session?.name ?? null,
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    router.dismissTo('/con');
  };

  let verdictLine = '';
  let verdictColor: string = color.secondary;
  if (v && hasOffer) {
    const amt = money(Math.abs(v.delta));
    if (v.kind === 'take') {
      verdictLine = v.delta === 0 ? 'At your floor' : `${amt} over floor`;
      verdictColor = color.gain;
    } else {
      verdictLine = `${amt} under floor`;
      verdictColor = v.kind === 'counter' ? color.conText : color.loss;
    }
  }

  const ticks: Tick[] = [];
  if (card.paidCents) ticks.push({ value: card.paidCents, label: 'Paid', color: color.secondary });
  if (floor != null) ticks.push({ value: floor, label: 'Floor', color: color.ink, labelColor: color.ink, height: 14 });
  if (price) ticks.push({ value: price.marketCents, label: 'Market', color: color.secondary });

  const keeps = card.paidCents != null && hasOffer ? offer - card.paidCents : null;

  return (
    <View style={{ flex: 1, backgroundColor: color.canvas, paddingTop: insets.top }}>
      <View style={styles.nav}>
        <IconButton label="Back" onPress={() => router.back()}>
          <BackIcon />
        </IconButton>
        <Text numberOfLines={1} style={[type.body, { color: color.ink, flex: 1, textAlign: 'center' }]}>
          {rowTitle(card)} · {gradeLabel(card.grader, card.grade, card.condition)}
        </Text>
        <View style={{ width: size.touch }} />
      </View>

      <View style={{ flex: 1, paddingHorizontal: space.gutter, justifyContent: 'space-evenly' }}>
        <View style={{ alignItems: 'center' }}>
          <Text style={[type.text, { color: color.secondary }]}>Their offer</Text>
          <Text adjustsFontSizeToFit numberOfLines={1} style={[type.displayL, { color: hasOffer ? color.ink : color.hairline }]}>
            {money(offer)}
          </Text>
          <Text style={[type.section, { color: verdictColor, minHeight: 26 }]}>{verdictLine}</Text>
        </View>

        {ticks.length ? (
          <PriceLine
            ticks={ticks}
            fill={hasOffer && card.paidCents ? { from: card.paidCents, to: offer, color: color.conFill } : undefined}
            dot={hasOffer ? { value: offer, color: color.conFill } : undefined}
          />
        ) : null}

        <View>
          <Hairline />
          <Text style={[type.text, { color: color.ink, paddingVertical: space.l }]}>
            {[
              keeps != null ? `${keeps >= 0 ? 'Keeps' : 'Loses'} ${money(Math.abs(keeps))}` : null,
              price ? `eBay nets ${money(ebayNet(price.marketCents))} after fees` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          <Hairline />
        </View>

        {v && hasOffer ? (
          v.kind === 'take' ? (
            <PrimaryButton title={`Sold for ${money(offer)}`} onPress={() => sell(offer)} />
          ) : (
            <View style={{ gap: space.s }}>
              <PrimaryButton title={`Counter ${money(v.counterAt)}`} onPress={() => setOffer(String(v.counterAt / 100))} />
              <Pressable accessibilityRole="button" onPress={() => sell(offer)} style={styles.quiet}>
                <Text style={[type.body, { color: color.ink }]}>Take {money(offer)} anyway</Text>
              </Pressable>
            </View>
          )
        ) : (
          <View style={{ height: size.button + size.touch + space.s }} />
        )}
      </View>

      <Keypad
        bottomInset={insets.bottom}
        onDigit={(d) => {
          if (digits.length >= MAX_DIGITS || (d === '0' && !digits)) return;
          setOffer(digits + d);
        }}
        onBackspace={() => setOffer(digits.slice(0, -1))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  nav: {
    height: size.touch + space.l,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.gutter - 12,
  },
  quiet: { minHeight: size.touch, alignItems: 'center', justifyContent: 'center' },
});
