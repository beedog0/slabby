// Sold together: several cards, one deal price. You often remember what the whole deal went for
// and not what each card did, so this asks for the one number you know, then shows how it splits
// (by market, src/pricing/split.ts splitDeal) with each slab and its share. Tap a card to set its
// share yourself; the others rebalance so the deal still adds up. Confirm marks them all sold with
// one timestamp, which is what makes them one deal later (src/pricing/deals.ts).
//
// The same sheet edits a deal you already saved ("Edit deal split" in a sold slab's menu): it
// opens on the split, keeps the sale's date and place, and only changes the prices.
//
// Used by Select mode on home (Sold together, and Move… → Mark sold), con mode's Sold together and
// the bundle's sold screen.

import * as Haptics from 'expo-haptics';
import { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { cardPrice, gradeLabel, money, rowTitle } from '../../lib/format';
import { dealsByCard } from '../../pricing/deals';
import { maxShare, splitDeal } from '../../pricing/split';
import { useCardRows } from '../../pricing/useCardRow';
import { useCon } from '../../store/con';
import { useVault } from '../../store/vault';
import { size, space, type } from '../../theme/tokens';
import { themed, useColors } from '../../theme/theme';
import type { Card } from '../../types';
import { Keypad } from '../Keypad';
import { closeMenu, openMenu } from '../menu/Menu';
import { SheetScrollView } from '../sheet/useSheetDrag';
import { SlabView } from '../SlabView';
import { PrimaryButton } from '../ui';

type Opts = {
  /** Runs once they're saved, e.g. leave Select mode or go back to con mode. */
  after?: () => void;
  /** Where it sold; defaults to the running con, if any. */
  where?: string | null;
};

const MAX_DIGITS = 7;
const SLAB_W = 34;
const native = Platform.OS !== 'web';

/** Pick up to here: one card goes to the plain Mark sold sheet's job, so this needs two or more. */
export function openSoldTogether(cards: Card[], opts: Opts = {}) {
  if (!cards.length) return;
  const n = cards.length;
  openMenu({
    title: n === 1 ? 'Mark sold' : `Sold ${n} together`,
    subtitle: n === 1 ? rowTitle(cards[0]) : 'One price for the whole deal',
    items: [],
    body: <SoldTogetherBody ids={cards.map((c) => c.id)} opts={opts} />,
  });
}

/** Change how a saved deal splits (or its total). `card` is any card in the deal. */
export function openEditDeal(card: Card) {
  const cards = useVault.getState().cards;
  const deal = dealsByCard(cards).get(card.id);
  if (!deal) return;
  openMenu({
    title: `Deal of ${deal.ids.length}`,
    subtitle: `Sold ${shortDay(deal.soldAt)}${deal.soldWhere ? ` · ${deal.soldWhere}` : ''}`,
    items: [],
    body: <SoldTogetherBody ids={deal.ids} opts={{}} edit />,
  });
}

/** A sold card's sale: the deal's split when it sold with others, else its own price. */
export function openEditSale(card: Card) {
  if (dealsByCard(useVault.getState().cards).has(card.id)) return openEditDeal(card);
  openMenu({
    card,
    title: rowTitle(card),
    subtitle: card.soldAt ? `Sold ${shortDay(card.soldAt)}${card.soldWhere ? ` · ${card.soldWhere}` : ''}` : 'Sold',
    items: [],
    body: <SoldTogetherBody ids={[card.id]} opts={{}} edit />,
  });
}

const shortDay = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const signed = (cents: number) => `${cents >= 0 ? '+' : '−'}${money(Math.abs(cents))}`;
const typed = (v: string, d: string) => (v.length >= MAX_DIGITS || (!v && d === '0') ? v : v + d);

function SoldTogetherBody({ ids, opts, edit }: { ids: string[]; opts: Opts; edit?: boolean }) {
  const color = useColors();
  const styles = useStyles();
  const rows = useCardRows(ids);
  const update = useVault((s) => s.update);
  const con = useCon((s) => s.session);

  // Editing a saved deal starts from what's saved: its total, with only the cards whose price was
  // clearly set by hand (more than $1 off the market split) held; the rest stay free to rebalance.
  const start = useMemo(() => {
    if (!edit) return { total: null as number | null, fixed: ids.map(() => null as number | null) };
    const priced = rows.filter((r) => r.card.soldCents != null);
    const total = priced.length ? priced.reduce((a, r) => a + r.card.soldCents!, 0) : null;
    const byMarket = total != null ? splitDeal(total, rows.map((r) => r.price?.marketCents ?? null)) : [];
    const fixed = rows.map((r, i) =>
      r.card.soldCents != null && Math.abs(r.card.soldCents - byMarket[i]) > 100 ? r.card.soldCents : null,
    );
    // Every card hand-set: keep them, but setting one later frees the rest (see setShare).
    return { total, fixed };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // null = untouched (an edit shows the saved total); typing starts a fresh number.
  const [digits, setDigits] = useState<string | null>(null);
  const [fixed, setFixed] = useState<(number | null)[]>(start.fixed);
  const [step, setStep] = useState<'total' | 'split' | 'share'>(edit && start.total != null && ids.length > 1 ? 'split' : 'total');
  /** A sale under what they cost waits for a second tap, at this amount. */
  const [lossOk, setLossOk] = useState<number | null>(null);
  const [editing, setEditing] = useState(0);
  const [shareDigits, setShareDigits] = useState('');

  const n = rows.length;
  if (!n) return null;
  const total = digits == null ? start.total : digits ? parseInt(digits, 10) * 100 : null;
  const weights = rows.map((r) => r.price?.marketCents ?? null);
  const shares = total != null ? splitDeal(total, weights, fixed) : rows.map(() => 0);
  const sum = shares.reduce((a, b) => a + b, 0);
  const paid = rows.reduce((a, r) => a + (r.card.paidCents ?? 0), 0);
  const anyPaid = rows.some((r) => r.card.paidCents != null);
  const anyFixed = fixed.some((f) => f != null);
  const priced = rows.filter((r) => r.price);
  const market = priced.reduce((a, r) => a + r.price!.marketCents, 0);

  // Others hold the total's rest; when every other card is already set, they're freed to rebalance.
  const othersSet = (i: number) => fixed.every((f, k) => k === i || f != null);
  const capFor = (i: number) => (othersSet(i) ? total ?? 0 : maxShare(total ?? 0, fixed, i));
  const setShare = (i: number, cents: number) =>
    setFixed((f) => {
      const all = f.every((v, k) => k === i || v != null);
      return f.map((v, k) => (k === i ? cents : all ? null : v));
    });

  const save = (withPrice: boolean) => {
    // "Never sell at a loss": a sale under what they cost asks for a second tap.
    const amount = withPrice ? (step === 'total' ? total ?? 0 : sum) : null;
    if (!edit && amount != null && anyPaid && amount < paid && lossOk !== amount) {
      setLossOk(amount);
      if (native) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      return;
    }
    closeMenu(() => {
      const at = new Date().toISOString();
      rows.forEach((r, i) => {
        const soldCents = withPrice ? shares[i] : null;
        // An edit keeps the sale's date and place: they're what tie the deal together.
        if (edit) update(r.card.id, { soldCents });
        else update(r.card.id, { status: 'sold', soldCents, soldAt: at, soldWhere: opts.where !== undefined ? opts.where : con?.name ?? null });
      });
      if (native) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      opts.after?.();
    });
  };
  const lossTitle = (amount: number) =>
    lossOk === amount ? `Sold at a ${money(paid - amount)} loss · tap again` : null;

  // ── 1. The one number you remember ──
  if (step === 'total') {
    const vsPaid = total != null && anyPaid ? total - paid : null;
    return (
      <View>
        <View style={styles.amount}>
          <Text style={[type.text, styles.muted]}>{n === 1 ? 'Sold for' : 'The whole deal went for'}</Text>
          <Text style={[type.displayS, { color: total != null ? color.ink : color.secondary }]}>{total != null ? money(total) : '$0'}</Text>
          <Text style={[type.secondary, { color: vsPaid == null ? color.secondary : vsPaid >= 0 ? color.gain : color.loss }]}>
            {vsPaid != null
              ? `${signed(vsPaid)} on ${money(paid)} paid`
              : total == null
                ? n === 1
                  ? 'Type the price, or leave it blank'
                  : 'Type the total, or leave it blank'
                : ' '}
          </Text>
          {n > 1 && priced.length ? (
            <Text style={[type.secondary, styles.muted]}>
              Market {priced.length < n ? `for ${priced.length} of ${n}` : 'together'} {money(market)}
            </Text>
          ) : null}
        </View>
        <View style={styles.pad}>
          <Keypad
            onDigit={(d) => {
              setDigits((v) => typed(v ?? '', d));
              setFixed(ids.map(() => null));
            }}
            onBackspace={() => {
              setDigits((v) => (v ?? '').slice(0, -1));
              setFixed(ids.map(() => null));
            }}
          />
        </View>
        {total == null ? (
          <PrimaryButton
            title={edit ? 'Save, price not set' : n === 1 ? 'Mark sold, price not set' : `Mark ${n} sold, price not set`}
            onPress={() => save(false)}
          />
        ) : n === 1 ? (
          <PrimaryButton title={edit ? `Save · ${money(total)}` : lossTitle(total) ?? `Mark sold for ${money(total)}`} onPress={() => save(true)} />
        ) : (
          <PrimaryButton title="See how it splits" onPress={() => setStep('split')} />
        )}
      </View>
    );
  }

  // ── 3. One card's share, typed ──
  if (step === 'share') {
    const r = rows[editing];
    const cap = capFor(editing);
    const cents = shareDigits ? parseInt(shareDigits, 10) * 100 : null;
    const over = cents != null && cents > cap;
    const vsPaid = cents != null && r.card.paidCents != null ? cents - r.card.paidCents : null;
    return (
      <View>
        <View style={styles.shareHead}>
          <SlabView card={r.card} width={SLAB_W} posed={false} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[type.text, { color: color.ink, fontWeight: '500' }]}>{rowTitle(r.card)}</Text>
            <Text style={[type.secondary, styles.muted]}>
              {gradeLabel(r.card.grader, r.card.grade, r.card.condition)}
              {r.price ? ` · market ${cardPrice(r.price.marketCents)}` : ''}
            </Text>
          </View>
        </View>
        <View style={styles.amount}>
          <Text style={[type.text, styles.muted]}>Its share of {money(total ?? 0)}</Text>
          <Text style={[type.displayS, { color: cents != null ? color.ink : color.secondary }]}>
            {money(cents ?? shares[editing])}
          </Text>
          <Text style={[type.secondary, { color: over ? color.loss : vsPaid == null ? color.secondary : vsPaid >= 0 ? color.gain : color.loss }]}>
            {over
              ? `Up to ${money(cap)} with the shares you’ve set`
              : vsPaid != null
                ? `${signed(vsPaid)} vs paid`
                : `Up to ${money(cap)}. The others share the rest.`}
          </Text>
        </View>
        <View style={styles.pad}>
          <Keypad onDigit={(d) => setShareDigits((v) => typed(v, d))} onBackspace={() => setShareDigits((v) => v.slice(0, -1))} />
        </View>
        <PrimaryButton
          title={cents == null ? 'Back to the split' : over ? `Set to ${money(cap)}` : `Set share to ${money(cents)}`}
          onPress={() => {
            if (cents != null) setShare(editing, Math.min(cents, cap));
            setStep('split');
          }}
        />
      </View>
    );
  }

  // ── 2. The split: each slab and its share ──
  const off = total != null ? sum - total : 0;
  const profit = anyPaid ? sum - paid : null;
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityHint="Change the deal total"
        onPress={() => {
          setDigits('');
          setStep('total');
        }}
        style={({ pressed }) => [styles.totalRow, pressed && { opacity: 0.6 }]}
      >
        <View>
          <Text style={[type.text, styles.muted]}>Deal total</Text>
          {profit != null ? (
            <Text style={[type.secondary, styles.muted]}>
              <Text style={{ color: profit >= 0 ? color.gain : color.loss }}>{signed(profit)}</Text> on {money(paid)} paid
            </Text>
          ) : null}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[type.rowPrice, { color: color.ink }]}>{money(total ?? 0)}</Text>
          <Text style={[type.secondary, { color: color.ink }]}>Change</Text>
        </View>
      </Pressable>

      <SheetScrollView style={{ maxHeight: 4 * ROW_H + space.s }}>
        {rows.map((r, i) => {
          const share = shares[i];
          const gain = r.card.paidCents != null ? share - r.card.paidCents : null;
          return (
            <Pressable
              key={r.card.id}
              accessibilityRole="button"
              accessibilityLabel={`${rowTitle(r.card)}, ${money(share)}`}
              accessibilityHint="Set this card's share"
              onPress={() => {
                setEditing(i);
                setShareDigits('');
                setStep('share');
              }}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
            >
              <SlabView card={r.card} width={SLAB_W} posed={false} />
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text style={[type.text, { color: color.ink, fontWeight: '500' }]}>{rowTitle(r.card)}</Text>
                <Text style={[type.secondary, styles.muted]}>
                  {gradeLabel(r.card.grader, r.card.grade, r.card.condition)}
                  {r.price ? ` · market ${cardPrice(r.price.marketCents)}` : ' · no market yet'}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 2, minWidth: 76 }}>
                <Text style={[type.numberM, { color: color.ink }]}>{money(share)}</Text>
                <Text style={[type.secondary, gain == null ? styles.muted : { color: gain >= 0 ? color.gain : color.loss }]}>
                  {gain != null ? signed(gain) : fixed[i] != null ? 'set by you' : 'by market'}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </SheetScrollView>

      <View style={styles.noteRow}>
        <Text style={[type.secondary, { flex: 1, color: off ? color.ink : color.secondary }]}>
          {off
            ? `Shares add up to ${money(sum)}, ${money(Math.abs(off))} ${off > 0 ? 'over' : 'under'} the deal.`
            : anyFixed
              ? 'The rest splits by market.'
              : 'Split by market. Tap a card to set its share.'}
        </Text>
        {anyFixed ? (
          <Pressable accessibilityRole="button" onPress={() => setFixed(ids.map(() => null))} hitSlop={8}>
            <Text style={[type.secondary, { color: color.ink }]}>Split by market</Text>
          </Pressable>
        ) : null}
      </View>

      <PrimaryButton title={edit ? `Save split · ${money(sum)}` : lossTitle(sum) ?? `Mark ${n} sold for ${money(sum)}`} onPress={() => save(true)} />
    </View>
  );
}

const ROW_H = 64;

const useStyles = themed((color) =>
  StyleSheet.create({
    muted: { color: color.secondary },
    amount: { alignItems: 'center', paddingTop: space.l, paddingBottom: space.m, gap: 2 },
    // The keypad spans the sheet edge to edge, like the system number pad.
    pad: { marginHorizontal: -space.gutter, marginBottom: space.m },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: size.touch + space.l, paddingVertical: space.m },
    row: { height: ROW_H, flexDirection: 'row', alignItems: 'center', gap: space.m },
    shareHead: { flexDirection: 'row', alignItems: 'center', gap: space.m, paddingTop: space.m },
    noteRow: { flexDirection: 'row', alignItems: 'center', gap: space.m, paddingTop: space.m, paddingBottom: space.l },
  }),
);
