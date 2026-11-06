// Offer: type their offer → verdict vs floor → one action per verdict (Sold for / Counter /
// Walk away). A counter waits for their answer; selling at a loss takes a second tap; a sold
// card shows the sale with undo. Reference: 06-offer.png.

import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Keypad } from '../../../src/components/Keypad';
import { PriceLine, type Tick } from '../../../src/components/PriceLine';
import { SoldState } from '../../../src/components/SoldState';
import { BackIcon, Hairline, IconButton, PrimaryButton } from '../../../src/components/ui';
import { gradeLabel, money, rowTitle } from '../../../src/lib/format';
import { inputsFor } from '../../../src/pricing/portfolio';
import { ebayNet, looksLikeTypo, verdict, vsEbay } from '../../../src/pricing/rules';
import { useCardRow } from '../../../src/pricing/useCardRow';
import { DEFAULT_CON_NAME, useCon } from '../../../src/store/con';
import { useRules } from '../../../src/store/rules';
import { useVault } from '../../../src/store/vault';
import { color, size, space, type } from '../../../src/theme/tokens';

const MAX_DIGITS = 6;

type Confirm = { key: 'primary' | 'quiet'; message: string } | null;

export default function Offer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const row = useCardRow(id);
  const rules = useRules((s) => s.rules);
  const update = useVault((s) => s.update);
  const session = useCon((s) => s.session);
  const startCon = useCon((s) => s.start);
  const [digits, setDigits] = useState('');
  /** Your counter, once you've made one. The next key typed is their answer. */
  const [counter, setCounter] = useState<number | null>(null);
  const [awaitingAnswer, setAwaitingAnswer] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prev = useRef(0);

  useEffect(() => () => {
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
  }, []);

  if (!row) return null;
  const { card, price } = row;

  if (card.status === 'sold') {
    return (
      <View style={{ flex: 1, backgroundColor: color.canvas, paddingTop: insets.top }}>
        <Nav title={`${rowTitle(card)} · ${gradeLabel(card.grader, card.grade, card.condition)}`} />
        <SoldState row={row} bottomInset={insets.bottom} />
      </View>
    );
  }

  const offer = (parseInt(digits || '0', 10) || 0) * 100;
  const hasOffer = digits.length > 0;
  const v = price ? verdict(offer, inputsFor(card, price, rules)) : null;
  const floor = row.floor;
  const raw = card.grader === 'raw';
  const typo = hasOffer && price != null && looksLikeTypo(offer, price.marketCents);

  const clearConfirm = () => {
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    setConfirm(null);
  };

  const setOffer = (next: string) => {
    const cents = (parseInt(next || '0', 10) || 0) * 100;
    // Detents: crossing the floor is a light tick, crossing what you paid is heavier.
    const crossed = (line: number | null | undefined) =>
      line != null && (prev.current < line) !== (cents < line);
    if (crossed(card.paidCents)) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    else if (crossed(floor)) Haptics.selectionAsync().catch(() => {});
    prev.current = cents;
    clearConfirm();
    setDigits(next);
  };

  const type_ = (d: string) => {
    // After a counter, the first key starts their answer instead of appending to your number.
    if (awaitingAnswer) {
      setAwaitingAnswer(false);
      if (d !== '0') setOffer(d);
      else setOffer('');
      return;
    }
    if (digits.length >= MAX_DIGITS || (d === '0' && !digits)) return;
    setOffer(digits + d);
  };

  const makeCounter = (cents: number) => {
    setCounter(cents);
    setOffer(String(cents / 100));
    setAwaitingAnswer(true);
  };

  /** Sell, but ask for a second tap when it's at a loss or the number looks like a typo. */
  const sell = (cents: number, key: 'primary' | 'quiet', alwaysConfirm = false) => {
    const loss = card.paidCents != null && cents < card.paidCents ? card.paidCents - cents : 0;
    const risky = alwaysConfirm || loss > 0 || typo;
    if (risky && confirm?.key !== key) {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      setConfirm({
        key,
        message: loss > 0 ? `Tap again to sell at a ${money(loss)} loss` : `Tap again to sell for ${money(cents)}`,
      });
      confirmTimer.current = setTimeout(() => setConfirm(null), 4000);
      return;
    }
    clearConfirm();
    // Every sale here is a con sale, so it counts in today's totals.
    let where = session?.name ?? null;
    if (!session) {
      startCon(DEFAULT_CON_NAME);
      where = DEFAULT_CON_NAME;
    }
    update(card.id, { status: 'sold', soldCents: cents, soldAt: new Date().toISOString(), soldWhere: where });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  // Verdict line: what the number means.
  let verdictNode: React.ReactNode = null;
  if (awaitingAnswer) {
    verdictNode = <Text style={{ color: color.secondary }}>Type their answer</Text>;
  } else if (typo && price) {
    verdictNode = (
      <Text style={{ color: color.secondary }}>
        That's {Math.round(offer / price.marketCents)}× market. Check the number
      </Text>
    );
  } else if (v && hasOffer) {
    const amt = money(Math.abs(v.delta));
    if (v.kind === 'take') {
      verdictNode = <Text style={{ color: color.gain }}>{v.delta === 0 ? 'At your floor' : `${amt} over floor`}</Text>;
    } else {
      verdictNode = <Text style={{ color: v.kind === 'counter' ? color.conText : color.loss }}>{amt} under floor</Text>;
    }
  }

  const ticks: Tick[] = [];
  if (card.paidCents) ticks.push({ value: card.paidCents, label: 'Paid', color: color.ink });
  if (floor != null) ticks.push({ value: floor, label: 'Floor', color: color.loss, labelColor: color.loss, height: 14 });
  if (price) ticks.push({ value: price.marketCents, label: 'Market', color: color.secondary });

  // "Keeps $25 · beats eBay by $8": what this offer means against holding out for eBay.
  const keeps = card.paidCents != null && hasOffer ? offer - card.paidCents : null;
  const vs = hasOffer && price && !raw ? vsEbay(offer, price.marketCents) : null;
  const summary: React.ReactNode[] = [];
  if (keeps != null) {
    summary.push(
      <Text key="k">
        {keeps >= 0 ? 'Keeps ' : 'Loses '}
        <Text style={{ color: keeps >= 0 ? color.gain : color.loss }}>{money(Math.abs(keeps))}</Text>
      </Text>,
    );
  }
  if (vs != null) {
    summary.push(
      vs === 0 ? (
        <Text key="e">same as eBay</Text>
      ) : vs > 0 ? (
        <Text key="e">
          beats eBay by <Text style={{ color: color.gain }}>{money(vs)}</Text>
        </Text>
      ) : (
        <Text key="e">
          eBay nets <Text style={{ color: color.loss }}>{money(-vs)}</Text> more
        </Text>
      ),
    );
  } else if (!hasOffer && price && !raw) {
    summary.push(<Text key="e">eBay nets {money(ebayNet(price.marketCents))} after fees</Text>);
  }

  // One primary action per verdict, quiet text for the alternative.
  let primary: { title: string; onPress: () => void } | null = null;
  let quiet: { title: string; onPress: () => void } | null = null;
  if (awaitingAnswer && counter != null) {
    primary = { title: `Sold for ${money(counter)}`, onPress: () => sell(counter, 'primary') };
  } else if (v && hasOffer) {
    if (v.kind === 'take') {
      primary = { title: `Sold for ${money(offer)}`, onPress: () => sell(offer, 'primary') };
    } else if (v.kind === 'counter') {
      primary = { title: `Counter ${money(v.counterAt)}`, onPress: () => makeCounter(v.counterAt) };
      quiet = { title: `Take ${money(offer)} anyway`, onPress: () => sell(offer, 'quiet') };
    } else {
      // A lowball: walking away is the answer. Once you've countered and they're still far
      // under, taking it is possible but always takes a second tap.
      primary = { title: 'Walk away', onPress: () => router.back() };
      quiet =
        counter == null
          ? { title: `Counter ${money(v.counterAt)}`, onPress: () => makeCounter(v.counterAt) }
          : { title: `Take ${money(offer)} anyway`, onPress: () => sell(offer, 'quiet', true) };
    }
  }
  const quietText = confirm ? confirm.message : quiet?.title;
  const quietPress = confirm?.key === 'primary' ? primary?.onPress : quiet?.onPress;

  return (
    <View style={{ flex: 1, backgroundColor: color.canvas, paddingTop: insets.top }}>
      <Nav title={`${rowTitle(card)} · ${gradeLabel(card.grader, card.grade, card.condition)}`} />

      <View style={{ flex: 1, paddingHorizontal: space.gutter, justifyContent: 'space-evenly' }}>
        <View style={{ alignItems: 'center' }}>
          <Text style={[type.text, { color: color.secondary }]}>{awaitingAnswer ? 'You countered' : 'Their offer'}</Text>
          <Text adjustsFontSizeToFit numberOfLines={1} style={[type.displayL, { color: hasOffer ? color.ink : color.hairline }]}>
            {money(offer)}
          </Text>
          <Text style={[type.section, { minHeight: 26 }]}>{verdictNode}</Text>
          <Text style={[type.secondary, { color: color.secondary, minHeight: 18 }]}>
            {counter != null && !awaitingAnswer ? `You countered ${money(counter)}` : ''}
          </Text>
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
          <Text style={[type.text, { color: color.ink, paddingVertical: space.l, minHeight: 52 }]}>
            {summary.map((n, i) => (
              <Text key={i}>
                {i ? ' · ' : ''}
                {n}
              </Text>
            ))}
          </Text>
          <Hairline />
        </View>

        {primary ? (
          <View style={{ gap: space.s }}>
            <PrimaryButton title={primary.title} onPress={primary.onPress} />
            <Pressable
              accessibilityRole="button"
              disabled={!quietText}
              onPress={quietPress}
              style={styles.quiet}
            >
              <Text style={[type.body, { color: color.ink }]}>{quietText ?? ''}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ height: size.button + size.touch + space.s }} />
        )}
      </View>

      <Keypad
        bottomInset={insets.bottom}
        onDigit={type_}
        onBackspace={() => {
          setAwaitingAnswer(false);
          setOffer(digits.slice(0, -1));
        }}
        onClear={() => {
          // Clear starts over, as if with a new buyer.
          setAwaitingAnswer(false);
          setCounter(null);
          setOffer('');
        }}
      />
    </View>
  );
}

function Nav({ title }: { title: string }) {
  return (
    <View style={styles.nav}>
      <IconButton label="Back" onPress={() => router.back()}>
        <BackIcon />
      </IconButton>
      <Text numberOfLines={1} style={[type.body, { color: color.ink, flex: 1, textAlign: 'center' }]}>
        {title}
      </Text>
      <View style={{ width: size.touch }} />
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
