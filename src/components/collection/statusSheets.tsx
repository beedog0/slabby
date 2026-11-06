// What you can do to one slab from its … menu besides look at it: put it up for sale, hold it,
// mark it sold, or remove it. Each one confirms in the same themed sheet, with the slab's live
// numbers in view (market and its 30-day move, what you paid) and only the input it needs:
// Sold asks what it went for, and "Not sure" saves it without a price.

import * as Haptics from 'expo-haptics';
import { useState, type ReactNode } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { gradeLabel, money, pct, rowTitle } from '../../lib/format';
import { useCardRow } from '../../pricing/useCardRow';
import { useCon } from '../../store/con';
import { useVault } from '../../store/vault';
import { color, space, type } from '../../theme/tokens';
import type { Card } from '../../types';
import { Keypad } from '../Keypad';
import { closeMenu, openMenu, type MenuItem } from '../menu/Menu';
import { PrimaryButton } from '../ui';
import { removeSlabs } from './remove';

type Kind = 'sell' | 'hold' | 'sold' | 'remove';

/** The status and remove rows for a slab's … menu, as two groups. */
export function statusItems(card: Card, opts: { onRemoved?: () => void } = {}): MenuItem[][] {
  const sold = card.status === 'sold';
  const status: MenuItem[] = sold
    ? [{ label: 'Back to holds', onPress: () => openStatusSheet(card, 'hold') }]
    : [
        ...(card.plan !== 'sell' ? [{ label: 'Put up for sale', onPress: () => openStatusSheet(card, 'sell') }] : []),
        ...(card.plan !== 'hold' ? [{ label: 'Move to holds', onPress: () => openStatusSheet(card, 'hold') }] : []),
        { label: 'Mark sold', onPress: () => openStatusSheet(card, 'sold') },
      ];
  return [status, [{ label: 'Remove from vault', onPress: () => openStatusSheet(card, 'remove', opts.onRemoved) }]];
}

export function openStatusSheet(card: Card, kind: Kind, after?: () => void) {
  const body: Record<Kind, ReactNode> = {
    sell: <SellBody id={card.id} />,
    hold: <HoldBody id={card.id} />,
    sold: <SoldBody id={card.id} />,
    remove: <RemoveBody id={card.id} after={after} />,
  };
  openMenu({ card, title: rowTitle(card), subtitle: gradeLabel(card.grader, card.grade, card.condition), items: [], body: body[kind] });
}

/** Remove several at once (Select mode): the count, what they're worth, one button. */
export function confirmRemoveMany(cards: Card[], after?: () => void) {
  if (cards.length === 1) return openStatusSheet(cards[0], 'remove', after);
  openMenu({ title: `Remove ${cards.length} slabs?`, items: [], body: <RemoveManyBody cards={cards} after={after} /> });
}

const native = Platform.OS !== 'web';
const done = () => {
  if (native) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
};

/** Market and its 30-day move, then paid and the gain on it. Live: updates if prices refresh. */
function Live({ id, children }: { id: string; children?: ReactNode }) {
  const row = useCardRow(id);
  if (!row) return null;
  const { card, price } = row;
  const gainCents = price && card.paidCents != null ? price.marketCents - card.paidCents : null;
  return (
    <View style={styles.live}>
      <Line label={card.grader === 'raw' ? 'TCGplayer market' : 'Market, eBay 30 days'}>
        {price ? (
          <>
            <Text style={ink}>{money(price.marketCents)}</Text>
            {row.trend30 ? <Text style={{ color: row.trend30 >= 0 ? color.gain : color.loss }}>{`  ${pct(row.trend30)}`}</Text> : null}
          </>
        ) : (
          <Text style={muted}>No sales yet</Text>
        )}
      </Line>
      {card.paidCents != null ? (
        <Line label="Paid">
          <Text style={ink}>{money(card.paidCents)}</Text>
          {gainCents != null ? (
            <Text style={{ color: gainCents >= 0 ? color.gain : color.loss }}>{`  ${gainCents >= 0 ? '+' : ''}${money(gainCents)}`}</Text>
          ) : null}
        </Line>
      ) : null}
      {children}
    </View>
  );
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.line}>
      <Text style={[type.text, muted]}>{label}</Text>
      <Text style={[type.body, { fontWeight: '500' }]}>{children}</Text>
    </View>
  );
}

function SellBody({ id }: { id: string }) {
  const row = useCardRow(id);
  const update = useVault((s) => s.update);
  if (!row) return null;
  return (
    <View>
      <Live id={id}>
        {row.ask != null ? (
          <Line label="Ask · floor">
            <Text style={ink}>{money(row.ask)}</Text>
            <Text style={muted}>{'  ·  '}</Text>
            <Text style={ink}>{row.floor != null ? money(row.floor) : '—'}</Text>
          </Line>
        ) : null}
      </Live>
      <Text style={[type.secondary, styles.note]}>From your pricing rules. Change them for this slab on its page.</Text>
      <PrimaryButton title="Put up for sale" onPress={() =>
          closeMenu(() => {
            update(id, { plan: 'sell' });
            done();
          })
        } />
    </View>
  );
}

function HoldBody({ id }: { id: string }) {
  const row = useCardRow(id);
  const update = useVault((s) => s.update);
  if (!row) return null;
  const sold = row.card.status === 'sold';
  const save = () =>
    update(id, sold ? { plan: 'hold', status: 'owned', soldCents: null, soldAt: null, soldWhere: null } : { plan: 'hold' });
  return (
    <View>
      <Live id={id}>
        {sold && row.card.soldCents != null ? (
          <Line label="Sold for">
            <Text style={ink}>{money(row.card.soldCents)}</Text>
          </Line>
        ) : null}
      </Live>
      <Text style={[type.secondary, styles.note]}>
        {sold ? 'The sale is cleared and it’s back in your vault.' : 'Holds stay out of con mode and the sell sheet.'}
      </Text>
      <PrimaryButton title={sold ? 'Back to holds' : 'Move to holds'} onPress={() =>
          closeMenu(() => {
            save();
            done();
          })
        } />
    </View>
  );
}

function SoldBody({ id }: { id: string }) {
  const row = useCardRow(id);
  const update = useVault((s) => s.update);
  const con = useCon((s) => s.session);
  const [digits, setDigits] = useState('');
  if (!row) return null;
  const { card } = row;
  const cents = digits ? parseInt(digits, 10) * 100 : null;
  const vsPaid = cents != null && card.paidCents != null ? cents - card.paidCents : null;
  const save = () =>
    closeMenu(() => {
      update(id, { status: 'sold', soldCents: cents, soldAt: new Date().toISOString(), soldWhere: con?.name ?? null });
      done();
    });
  return (
    <View>
      <Live id={id} />
      <View style={styles.amount}>
        <Text style={[type.text, muted]}>Sold for</Text>
        <Text style={[type.displayS, { color: cents != null ? color.ink : color.secondary }]}>
          {cents != null ? money(cents) : '$0'}
        </Text>
        <Text style={[type.secondary, { color: vsPaid == null ? color.secondary : vsPaid >= 0 ? color.gain : color.loss }]}>
          {vsPaid != null ? `${vsPaid >= 0 ? '+' : ''}${money(vsPaid)} vs paid` : cents == null ? 'Type the price, or leave it blank' : ' '}
        </Text>
      </View>
      <View style={styles.pad}>
        <Keypad
          onDigit={(d) => setDigits((v) => (v.length >= 7 || (!v && d === '0') ? v : v + d))}
          onBackspace={() => setDigits((v) => v.slice(0, -1))}
        />
      </View>
      <PrimaryButton title={cents != null ? `Mark sold for ${money(cents)}` : 'Mark sold, price not set'} onPress={save} />
    </View>
  );
}

function RemoveBody({ id, after }: { id: string; after?: () => void }) {
  return (
    <View>
      <Live id={id} />
      <Text style={[type.secondary, styles.note]}>What you paid and its history go with it. This can’t be undone.</Text>
      <PrimaryButton title="Remove from vault" onPress={() => closeMenu(() => removeSlabs([id], after))} />
    </View>
  );
}

function RemoveManyBody({ cards, after }: { cards: Card[]; after?: () => void }) {
  const ids = cards.map((c) => c.id);
  const paid = cards.reduce((n, c) => n + (c.paidCents ?? 0), 0);
  return (
    <View>
      <View style={styles.live}>
        <Line label="Slabs">
          <Text style={ink}>{cards.length}</Text>
        </Line>
        {paid ? (
          <Line label="Paid in total">
            <Text style={ink}>{money(paid)}</Text>
          </Line>
        ) : null}
      </View>
      <Text style={[type.secondary, styles.note]}>What you paid and their history go with them. This can’t be undone.</Text>
      <PrimaryButton title={`Remove ${cards.length} slabs`} onPress={() => closeMenu(() => removeSlabs(ids, after))} />
    </View>
  );
}

const ink = { color: color.ink };
const muted = { color: color.secondary };

const styles = StyleSheet.create({
  live: { paddingTop: space.m, gap: space.xs },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', minHeight: 28 },
  note: { color: color.secondary, paddingTop: space.s, paddingBottom: space.l },
  amount: { alignItems: 'center', paddingTop: space.l, paddingBottom: space.m, gap: 2 },
  // The keypad spans the sheet edge to edge, like the system number pad.
  pad: { marginHorizontal: -space.gutter, marginBottom: space.m },
});
