// Edit what you paid, in the same themed sheet as the status confirms. Opened from "Edit price
// paid" in a slab's … menu (home long-press, card page, con mode) and from the paid line on the
// card page. The keypad starts on the saved price, the first key types over it, Clear leaves it
// unset, and 0 means you paid nothing. Captions, gain, floors and sold profit all read paidCents,
// so they follow the moment it saves.
//
// Stacked raw singles and sealed copies: a stack first asks which one, "All N copies" or a single
// copy, each listed with its own price, so copies bought at different prices stay honest.

import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { cardLabel, cardPrice, money, rowTitle } from '../../lib/format';
import { copiesOf } from '../../pricing/arrange';
import { centsToDigits, digitsToCents, nextDigits, sharedPaid } from '../../pricing/paid';
import { useCardRows } from '../../pricing/useCardRow';
import { useVault } from '../../store/vault';
import { space, type } from '../../theme/tokens';
import { themed, useColors } from '../../theme/theme';
import type { Card } from '../../types';
import { Keypad } from '../Keypad';
import { closeMenu, openMenu, type MenuItem } from '../menu/Menu';
import { PrimaryButton } from '../ui';

const native = Platform.OS !== 'web';

/** "$1,301", "$2.50", "Not set": the quiet right-hand text on the menu row. */
export function paidDetail(cents: number | null | undefined): string {
  if (cents === undefined) return 'Different prices';
  if (cents == null) return 'Not set';
  return cents === 0 ? 'Paid nothing' : cardPrice(cents);
}

/** The menu row. A stack's row shows the shared price, or that the copies differ. */
export function paidItem(card: Card): MenuItem {
  const copies = copiesOf(useVault.getState().cards, card);
  return {
    label: 'Edit price paid',
    detail: paidDetail(sharedPaid(copies)),
    onPress: () => openPaidSheet(card),
  };
}

/** Open the editor for this card, or for a stack, ask which copies first. */
export function openPaidSheet(card: Card) {
  const copies = copiesOf(useVault.getState().cards, card);
  if (copies.length < 2) return openEditor(card, [card.id]);
  const n = copies.length;
  openMenu({
    card,
    title: rowTitle(card),
    subtitle: `${n} copies`,
    items: [
      [{ label: `All ${n} copies`, detail: paidDetail(sharedPaid(copies)), onPress: () => openEditor(card, copies.map((c) => c.id), `All ${n} copies`) }],
      copies.map((c, i) => ({
        label: `Copy ${i + 1}`,
        detail: paidDetail(c.paidCents),
        onPress: () => openEditor(c, [c.id], `Copy ${i + 1}`),
      })),
    ],
  });
}

function openEditor(card: Card, ids: string[], which?: string) {
  openMenu({
    card,
    title: rowTitle(card),
    subtitle: which ? `${cardLabel(card)} · ${which}` : cardLabel(card),
    items: [],
    body: <PaidBody ids={ids} />,
  });
}

function PaidBody({ ids }: { ids: string[] }) {
  const color = useColors();
  const styles = useStyles();
  const rows = useCardRows(ids);
  const update = useVault((s) => s.update);
  const start = sharedPaid(rows.map((r) => r.card));
  const [digits, setDigits] = useState(centsToDigits(start ?? null));
  const [touched, setTouched] = useState(false);
  if (!rows.length) return null;

  const { card, price } = rows[0];
  const many = ids.length > 1;
  // Untouched keeps the saved price to the cent; once typed, whole dollars.
  const cents = touched ? digitsToCents(digits) : start ?? null;
  const sold = card.status === 'sold';
  // What the new price means: profit on the sale, or gain against today's market.
  const against = sold ? card.soldCents : price?.marketCents ?? null;
  const diff = cents != null && against != null ? against - cents : null;
  const each = many ? ' each' : '';

  const key = (d: string) => {
    setDigits((v) => nextDigits(v, d, !touched));
    setTouched(true);
  };
  const save = () =>
    closeMenu(() => {
      for (const id of ids) update(id, { paidCents: cents });
      if (native) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    });

  return (
    <View>
      <View style={styles.live}>
        <View style={styles.line}>
          <Text style={[type.text, styles.muted]}>
            {sold ? 'Sold for' : card.grader === 'raw' ? 'TCGplayer market' : 'Market, eBay 30 days'}
          </Text>
          <Text style={[type.body, styles.ink, { fontWeight: '500', fontVariant: ['tabular-nums'] }]}>
            {against != null ? cardPrice(against) : sold ? 'Not set' : 'No sales yet'}
          </Text>
        </View>
      </View>

      <View style={styles.amount}>
        <Text style={[type.text, styles.muted]}>{many ? 'Paid each' : 'Paid'}</Text>
        <Text style={[type.displayS, { color: cents != null ? color.ink : color.secondary, fontVariant: ['tabular-nums'] }]}>
          {cents != null ? cardPrice(cents) : '$0'}
        </Text>
        <Text style={[type.secondary, styles.muted, { fontVariant: ['tabular-nums'] }]}>
          {diff != null ? (
            <>
              <Text style={{ color: diff >= 0 ? color.gain : color.loss }}>{`${diff >= 0 ? '+' : ''}${money(diff)}`}</Text>
              {sold ? ` profit${each}` : ` vs market${each}`}
            </>
          ) : cents == null ? (
            'Not set. Type what you paid'
          ) : (
            ' '
          )}
        </Text>
      </View>

      <View style={styles.pad}>
        <Keypad
          onDigit={key}
          onBackspace={() => {
            setDigits((v) => v.slice(0, -1));
            setTouched(true);
          }}
          onClear={() => {
            setDigits('');
            setTouched(true);
          }}
        />
      </View>
      {many ? <Text style={[type.secondary, styles.note]}>Every copy gets this price.</Text> : null}
      <PrimaryButton
        title={cents == null ? 'Save, price not set' : cents === 0 ? 'Save, paid nothing' : `Save ${cardPrice(cents)} paid${each}`}
        onPress={save}
      />
    </View>
  );
}

const useStyles = themed((color) =>
  StyleSheet.create({
    ink: { color: color.ink },
    muted: { color: color.secondary },
    live: { paddingTop: space.m },
    line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', minHeight: 28 },
    amount: { alignItems: 'center', paddingTop: space.l, paddingBottom: space.m, gap: 2 },
    note: { color: color.secondary, textAlign: 'center', paddingBottom: space.m },
    // The keypad spans the sheet edge to edge, like the system number pad.
    pad: { marginHorizontal: -space.gutter, marginBottom: space.m },
  }),
);
