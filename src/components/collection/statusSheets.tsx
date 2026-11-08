// What you can do to one slab from its … menu besides look at it: put it up for sale, hold it,
// mark it sold, or remove it. Each one confirms in the same themed sheet, with the slab's live
// numbers in view (market and its 30-day move, what you paid) and only the input it needs:
// Sold asks what it went for, and "Not sure" saves it without a price.

import * as Haptics from 'expo-haptics';
import { useState, type ReactNode } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { cardLabel, money, pct, rowTitle } from '../../lib/format';
import { splitTotal } from '../../pricing/split';
import { useCardRow, useCardRows } from '../../pricing/useCardRow';
import { useCon } from '../../store/con';
import { useVault } from '../../store/vault';
import { space, type } from '../../theme/tokens';
import { themed, useColors } from '../../theme/theme';
import type { Card } from '../../types';
import { Keypad } from '../Keypad';
import { closeMenu, openMenu, type MenuItem } from '../menu/Menu';
import { PrimaryButton } from '../ui';
import { paidItem } from './paidSheet';
import { removeSlabs } from './remove';

type Kind = 'sell' | 'hold' | 'sold' | 'remove';

/** Edit price paid, the status rows, and remove, for a slab's … menu, as two groups. */
export function statusItems(card: Card, opts: { onRemoved?: () => void } = {}): MenuItem[][] {
  const sold = card.status === 'sold';
  const status: MenuItem[] = sold
    ? [{ label: 'Back to holds', onPress: () => openStatusSheet(card, 'hold') }]
    : [
        ...(card.plan !== 'sell' ? [{ label: 'Put up for sale', onPress: () => openStatusSheet(card, 'sell') }] : []),
        ...(card.plan !== 'hold' ? [{ label: 'Move to holds', onPress: () => openStatusSheet(card, 'hold') }] : []),
        { label: 'Mark sold', onPress: () => openStatusSheet(card, 'sold') },
      ];
  return [[paidItem(card), ...status], [{ label: 'Remove from vault', onPress: () => openStatusSheet(card, 'remove', opts.onRemoved) }]];
}

export function openStatusSheet(card: Card, kind: Kind, after?: () => void) {
  const body: Record<Kind, ReactNode> = {
    sell: <SellBody id={card.id} />,
    hold: <HoldBody id={card.id} />,
    sold: <SoldBody id={card.id} />,
    remove: <RemoveBody id={card.id} after={after} />,
  };
  openMenu({ card, title: rowTitle(card), subtitle: cardLabel(card), items: [], body: body[kind] });
}

/** Remove several at once (Select mode): the count, what they're worth, one button. */
export function confirmRemoveMany(cards: Card[], after?: () => void) {
  if (cards.length === 1) return openStatusSheet(cards[0], 'remove', after);
  openMenu({ title: `Remove ${cards.length} slabs?`, items: [], body: <RemoveManyBody cards={cards} after={after} /> });
}

/**
 * Select mode's Move: one menu with the same three destinations, then one confirm sheet for all
 * of them with the combined live numbers. `after` runs once they've moved (leave select mode).
 */
export function openMoveMany(cards: Card[], after?: () => void) {
  if (!cards.length) return;
  const n = cards.length;
  const open = (kind: 'sell' | 'hold' | 'sold') =>
    openMenu({ title: MANY_TITLE[kind](n), items: [], body: <MoveManyBody ids={cards.map((c) => c.id)} kind={kind} after={after} /> });
  openMenu({
    title: `Move ${n} ${n === 1 ? 'slab' : 'slabs'}`,
    items: [
      { label: 'Put up for sale', onPress: () => open('sell') },
      { label: 'Move to holds', onPress: () => open('hold') },
      { label: 'Mark sold', onPress: () => open('sold') },
    ],
  });
}

const MANY_TITLE = {
  sell: (n: number) => `Put ${n} up for sale?`,
  hold: (n: number) => `Move ${n} to holds?`,
  sold: (n: number) => `Mark ${n} sold`,
};

const native = Platform.OS !== 'web';
const done = () => {
  if (native) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
};

/** Market and its 30-day move, then paid and the gain on it. Live: updates if prices refresh. */
function Live({ id, children }: { id: string; children?: ReactNode }) {
  const color = useColors();
  const styles = useStyles();
  const row = useCardRow(id);
  if (!row) return null;
  const { card, price } = row;
  const gainCents = price && card.paidCents != null ? price.marketCents - card.paidCents : null;
  return (
    <View style={styles.live}>
      <Line label={card.grader === 'raw' ? 'TCGplayer market' : 'Market, eBay 30 days'}>
        {price ? (
          <>
            <Text style={styles.ink}>{money(price.marketCents)}</Text>
            {row.trend30 ? <Text style={{ color: row.trend30 >= 0 ? color.gain : color.loss }}>{`  ${pct(row.trend30)}`}</Text> : null}
          </>
        ) : (
          <Text style={styles.muted}>No sales yet</Text>
        )}
      </Line>
      {card.paidCents != null ? (
        <Line label="Paid">
          <Text style={styles.ink}>{money(card.paidCents)}</Text>
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
  const styles = useStyles();
  return (
    <View style={styles.line}>
      <Text style={[type.text, styles.muted]}>{label}</Text>
      <Text style={[type.body, { fontWeight: '500' }]}>{children}</Text>
    </View>
  );
}

function SellBody({ id }: { id: string }) {
  const styles = useStyles();
  const row = useCardRow(id);
  const update = useVault((s) => s.update);
  if (!row) return null;
  return (
    <View>
      <Live id={id}>
        {row.ask != null ? (
          <Line label="Ask · floor">
            <Text style={styles.ink}>{money(row.ask)}</Text>
            <Text style={styles.muted}>{'  ·  '}</Text>
            <Text style={styles.ink}>{row.floor != null ? money(row.floor) : '—'}</Text>
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
  const styles = useStyles();
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
            <Text style={styles.ink}>{money(row.card.soldCents)}</Text>
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
  const color = useColors();
  const styles = useStyles();
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
        <Text style={[type.text, styles.muted]}>Sold for</Text>
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
  const styles = useStyles();
  return (
    <View>
      <Live id={id} />
      <Text style={[type.secondary, styles.note]}>What you paid and its history go with it. This can’t be undone.</Text>
      <PrimaryButton title="Remove from vault" onPress={() => closeMenu(() => removeSlabs([id], after))} />
    </View>
  );
}

function RemoveManyBody({ cards, after }: { cards: Card[]; after?: () => void }) {
  const styles = useStyles();
  const ids = cards.map((c) => c.id);
  const paid = cards.reduce((n, c) => n + (c.paidCents ?? 0), 0);
  return (
    <View>
      <View style={styles.live}>
        <Line label="Slabs">
          <Text style={styles.ink}>{cards.length}</Text>
        </Line>
        {paid ? (
          <Line label="Paid in total">
            <Text style={styles.ink}>{money(paid)}</Text>
          </Line>
        ) : null}
      </View>
      <Text style={[type.secondary, styles.note]}>What you paid and their history go with them. This can’t be undone.</Text>
      <PrimaryButton title={`Remove ${cards.length} slabs`} onPress={() => closeMenu(() => removeSlabs(ids, after))} />
    </View>
  );
}

/** Combined numbers for several slabs: market (and its 30-day move), paid and the gain on it. */
function LiveMany({ ids, children }: { ids: string[]; children?: ReactNode }) {
  const color = useColors();
  const styles = useStyles();
  const rows = useCardRows(ids);
  let market = 0, before = 0, paid = 0, paidOfPriced = 0, priced = 0;
  for (const r of rows) {
    if (r.card.paidCents != null) paid += r.card.paidCents;
    if (!r.price) continue;
    priced++;
    market += r.price.marketCents;
    before += r.price.marketCents / (1 + r.trend30);
    if (r.card.paidCents != null) paidOfPriced += r.card.paidCents;
  }
  const move = before > 0 ? market / before - 1 : 0;
  const gain = priced ? market - paidOfPriced : null;
  return (
    <View style={styles.live}>
      <Line label={priced < rows.length ? `Market, ${priced} of ${rows.length} priced` : 'Market together'}>
        {priced ? (
          <>
            <Text style={styles.ink}>{money(market)}</Text>
            {Math.round(move * 100) ? <Text style={{ color: move >= 0 ? color.gain : color.loss }}>{`  ${pct(move)}`}</Text> : null}
          </>
        ) : (
          <Text style={styles.muted}>No sales yet</Text>
        )}
      </Line>
      {paid ? (
        <Line label="Paid">
          <Text style={styles.ink}>{money(paid)}</Text>
          {gain != null && paidOfPriced ? (
            <Text style={{ color: gain >= 0 ? color.gain : color.loss }}>{`  ${gain >= 0 ? '+' : ''}${money(gain)}`}</Text>
          ) : null}
        </Line>
      ) : null}
      {children}
    </View>
  );
}

function MoveManyBody({ ids, kind, after }: { ids: string[]; kind: 'sell' | 'hold' | 'sold'; after?: () => void }) {
  const color = useColors();
  const styles = useStyles();
  const rows = useCardRows(ids);
  const update = useVault((s) => s.update);
  const con = useCon((s) => s.session);
  const [digits, setDigits] = useState('');
  const n = rows.length;
  const finish = () => {
    after?.();
    done();
  };

  if (kind !== 'sold') {
    const sell = kind === 'sell';
    const ask = rows.reduce((a, r) => a + (r.ask ?? 0), 0);
    const floor = rows.reduce((a, r) => a + (r.floor ?? 0), 0);
    return (
      <View>
        <LiveMany ids={ids}>
          {sell && ask ? (
            <Line label="Asks · floors">
              <Text style={styles.ink}>{money(ask)}</Text>
              <Text style={styles.muted}>{'  ·  '}</Text>
              <Text style={styles.ink}>{money(floor)}</Text>
            </Line>
          ) : null}
        </LiveMany>
        <Text style={[type.secondary, styles.note]}>
          {sell
            ? 'Each gets its ask and floor from your pricing rules.'
            : 'Holds stay out of con mode and the sell sheet. Sold ones go back in your vault.'}
        </Text>
        <PrimaryButton
          title={sell ? `Put ${n} up for sale` : `Move ${n} to holds`}
          onPress={() =>
            closeMenu(() => {
              for (const r of rows) {
                if (sell) {
                  if (r.card.status === 'owned') update(r.card.id, { plan: 'sell' });
                } else {
                  update(r.card.id, r.card.status === 'sold' ? { plan: 'hold', status: 'owned', soldCents: null, soldAt: null, soldWhere: null } : { plan: 'hold' });
                }
              }
              finish();
            })
          }
        />
      </View>
    );
  }

  // Sold together: one total, split across the slabs by market price so each keeps a fair share.
  const total = digits ? parseInt(digits, 10) * 100 : null;
  const paid = rows.reduce((a, r) => a + (r.card.paidCents ?? 0), 0);
  const vsPaid = total != null && paid ? total - paid : null;
  const save = () =>
    closeMenu(() => {
      const shares = total != null ? splitTotal(total, rows.map((r) => r.price?.marketCents ?? null)) : null;
      const at = new Date().toISOString();
      rows.forEach((r, i) =>
        update(r.card.id, { status: 'sold', soldCents: shares ? shares[i] : null, soldAt: at, soldWhere: con?.name ?? null }),
      );
      finish();
    });
  return (
    <View>
      <LiveMany ids={ids} />
      <View style={styles.amount}>
        <Text style={[type.text, styles.muted]}>Sold together for</Text>
        <Text style={[type.displayS, { color: total != null ? color.ink : color.secondary }]}>{total != null ? money(total) : '$0'}</Text>
        <Text style={[type.secondary, { color: vsPaid == null ? color.secondary : vsPaid >= 0 ? color.gain : color.loss }]}>
          {vsPaid != null ? `${vsPaid >= 0 ? '+' : ''}${money(vsPaid)} vs paid` : total == null ? 'Type the total, or leave it blank' : ' '}
        </Text>
      </View>
      <View style={styles.pad}>
        <Keypad
          onDigit={(d) => setDigits((v) => (v.length >= 7 || (!v && d === '0') ? v : v + d))}
          onBackspace={() => setDigits((v) => v.slice(0, -1))}
        />
      </View>
      <Text style={[type.secondary, styles.note, { paddingTop: 0, paddingBottom: space.m }]}>
        The total is split across them by market price.
      </Text>
      <PrimaryButton title={total != null ? `Mark ${n} sold for ${money(total)}` : `Mark ${n} sold, price not set`} onPress={save} />
    </View>
  );
}

const useStyles = themed((color) => StyleSheet.create({
  ink: { color: color.ink },
  muted: { color: color.secondary },
  live: { paddingTop: space.m, gap: space.xs },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', minHeight: 28 },
  note: { color: color.secondary, paddingTop: space.s, paddingBottom: space.l },
  amount: { alignItems: 'center', paddingTop: space.l, paddingBottom: space.m, gap: 2 },
  // The keypad spans the sheet edge to edge, like the system number pad.
  pad: { marginHorizontal: -space.gutter, marginBottom: space.m },
}));
