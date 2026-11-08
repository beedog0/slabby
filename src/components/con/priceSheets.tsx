// Price list edits, in the shared themed sheet (openMenu, so it pulls down to close like every sheet).
//
// One card: Ask or Floor on a keypad, starting on today's number; the first key types over it. An
// ask under the floor brings the floor down with it; under what you paid (never sell at a loss on)
// it can't save, and the button offers what you paid instead. "Use rule price" drops the override.
//
// Edit total: type the whole table's new total, or tap 5 / 10 / 15 / 20% off. The change spreads
// across the cards in proportion to their asks, each stops at its floor (src/pricing/priceList.ts),
// and only asks change, never floors. "Back to rule prices" clears every hand-set ask.
//
// Both report what they changed so the price list can offer Undo.

import * as Haptics from 'expo-haptics';
import { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { cardLabel, money, pct, rowTitle } from '../../lib/format';
import { digitsToCents, nextDigits } from '../../pricing/paid';
import { rowFor } from '../../pricing/portfolio';
import { askOverrideFor, checkAsk, checkFloor, discounted, minAsk, priceList, spreadTotal } from '../../pricing/priceList';
import { useCardRow } from '../../pricing/useCardRow';
import { usePrices } from '../../store/prices';
import { useRules } from '../../store/rules';
import { useVault } from '../../store/vault';
import { radius, space, type } from '../../theme/tokens';
import { themed, useColors } from '../../theme/theme';
import type { Card } from '../../types';
import { Keypad } from '../Keypad';
import { Segmented } from '../Segmented';
import { closeMenu, openMenu } from '../menu/Menu';
import { PrimaryButton } from '../ui';

const native = Platform.OS !== 'web';

/** What a save changed, so it can be put back. */
export type PriceSnapshot = { id: string; askOverrideCents: number | null; floorOverrideCents: number | null }[];

const snapshot = (cards: Card[]): PriceSnapshot =>
  cards.map((c) => ({ id: c.id, askOverrideCents: c.askOverrideCents, floorOverrideCents: c.floorOverrideCents }));

/** Put prices back as they were before a save. */
export function restorePrices(s: PriceSnapshot) {
  const update = useVault.getState().update;
  for (const p of s) update(p.id, { askOverrideCents: p.askOverrideCents, floorOverrideCents: p.floorOverrideCents });
}

const success = () => {
  if (native) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
};

// ── One card ─────────────────────────────────────────────────────────────────────────────────

type Field = 'ask' | 'floor';

export function openCardPriceSheet(card: Card, onSaved: (before: PriceSnapshot, what: string) => void, field: Field = 'ask') {
  openMenu({
    card,
    title: rowTitle(card),
    subtitle: cardLabel(card),
    items: [],
    body: <CardPriceBody id={card.id} start={field} onSaved={onSaved} />,
  });
}

function CardPriceBody({ id, start, onSaved }: { id: string; start: Field; onSaved: (before: PriceSnapshot, what: string) => void }) {
  const color = useColors();
  const styles = useStyles();
  const row = useCardRow(id);
  const rules = useRules((s) => s.rules);
  const update = useVault((s) => s.update);
  const [field, setField] = useState<Field>(start);
  const [digits, setDigits] = useState('');
  const [touched, setTouched] = useState(false);
  if (!row || !row.price || row.ask == null || row.floor == null) return null;
  const { card, price } = row;

  const current = field === 'ask' ? row.ask : row.floor;
  const cents = touched ? digitsToCents(digits) : current;
  const min = minAsk(card, rules);
  const raw = card.grader === 'raw';
  const overridden = field === 'ask' ? card.askOverrideCents != null : card.floorOverrideCents != null;

  const switchTo = (f: Field) => {
    if (f === field) return;
    setField(f);
    setDigits('');
    setTouched(false);
  };
  const key = (d: string) => {
    setDigits((v) => nextDigits(v, d, !touched));
    setTouched(true);
  };
  const save = (patch: Partial<Card>, what: string) => {
    const before = snapshot([card]);
    closeMenu(() => {
      update(card.id, patch);
      success();
      onSaved(before, what);
    });
  };

  // What the typed number means, and the one button.
  let note: React.ReactNode = ' ';
  let button: { title: string; onPress: () => void };
  const name = rowTitle(card);
  if (cents == null) {
    note = field === 'ask' ? 'Type what to ask' : 'Type the lowest you’ll take';
    button = { title: 'Keep ' + money(current), onPress: () => closeMenu() };
  } else if (field === 'ask') {
    const c = checkAsk(cents, row.floor, min);
    const vs = cents - price.marketCents;
    if (c.kind === 'underPaid') {
      note = (
        <>
          Under what you paid, <Text style={{ color: color.loss }}>{money(c.minCents)}</Text>
        </>
      );
      button = { title: `Ask ${money(c.minCents)}, what you paid`, onPress: () => save({ askOverrideCents: askOverrideFor(card, row, rules, c.minCents) }, `${name} ask`) };
    } else {
      note =
        c.kind === 'floorDrops'
          ? `Floor comes down to ${money(c.floorCents)} with it`
          : vs === 0
            ? 'At market'
            : `${money(Math.abs(vs))} ${vs > 0 ? 'over' : 'under'} market (${pct(vs / price.marketCents)})`;
      button = {
        title: cents === row.ask && !touched ? 'Keep ' + money(cents) : `Ask ${money(cents)}`,
        onPress: () => save({ askOverrideCents: askOverrideFor(card, row, rules, cents) }, `${name} ask`),
      };
    }
  } else {
    const c = checkFloor(cents, row.ask, min);
    if (c.kind === 'underPaid') {
      note = (
        <>
          Under what you paid, <Text style={{ color: color.loss }}>{money(c.minCents)}</Text>
        </>
      );
      button = { title: `Floor ${money(c.minCents)}, what you paid`, onPress: () => save({ floorOverrideCents: c.minCents }, `${name} floor`) };
    } else if (c.kind === 'overAsk') {
      note = `Over your ask, ${money(c.askCents)}`;
      button = { title: `Floor ${money(c.askCents)}, same as ask`, onPress: () => save({ floorOverrideCents: c.askCents }, `${name} floor`) };
    } else {
      note = card.paidCents != null ? `${cents - card.paidCents >= 0 ? '+' : '−'}${money(Math.abs(cents - card.paidCents))} on what you paid` : 'Walk away under this';
      button = { title: cents === row.floor && !touched ? 'Keep ' + money(cents) : `Floor ${money(cents)}`, onPress: () => save({ floorOverrideCents: cents }, `${name} floor`) };
    }
  }

  return (
    <View>
      <Segmented<Field>
        style={{ marginTop: space.m }}
        value={field}
        onChange={switchTo}
        options={[
          { value: 'ask', label: `Ask ${money(row.ask)}` },
          { value: 'floor', label: `Floor ${money(row.floor)}` },
        ]}
      />
      <View style={styles.lines}>
        <Line label={raw ? 'TCGplayer market' : 'Market, eBay 30 days'} value={money(price.marketCents)} />
        {card.paidCents != null ? <Line label="Paid" value={card.paidCents === 0 ? 'Nothing' : money(card.paidCents)} /> : null}
      </View>

      <View style={styles.amount}>
        <Text style={[type.text, styles.muted]}>{field === 'ask' ? 'Ask' : 'Floor'}</Text>
        <Text style={[type.displayS, { color: cents != null ? color.ink : color.secondary }]}>{money(cents ?? 0)}</Text>
        <Text style={[type.secondary, styles.muted]}>{note}</Text>
      </View>

      <View style={styles.pad}>
        <Keypad
          onDigit={key}
          onBackspace={() => {
            setDigits((v) => (touched ? v.slice(0, -1) : ''));
            setTouched(true);
          }}
          onClear={() => {
            setDigits('');
            setTouched(true);
          }}
        />
      </View>
      <PrimaryButton title={button.title} onPress={button.onPress} />
      {overridden ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => save(field === 'ask' ? { askOverrideCents: null } : { floorOverrideCents: null }, `${name} ${field}`)}
          style={styles.quiet}
        >
          <Text style={[type.text, styles.ink]}>{field === 'ask' ? 'Use rule price' : 'Use rule floor'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ── The whole table ──────────────────────────────────────────────────────────────────────────

const CUTS = [5, 10, 15, 20];

export function openTotalSheet(onSaved: (before: PriceSnapshot, what: string) => void) {
  openMenu({ title: 'Edit total', subtitle: 'Spread across your cards by price. Floors hold.', items: [], body: <TotalBody onSaved={onSaved} /> });
}

function TotalBody({ onSaved }: { onSaved: (before: PriceSnapshot, what: string) => void }) {
  const color = useColors();
  const styles = useStyles();
  const cards = useVault((s) => s.cards);
  const update = useVault((s) => s.update);
  const rules = useRules((s) => s.rules);
  const prices = usePrices((s) => s.byKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const list = useMemo(() => priceList(cards.map((c) => rowFor(c, rules))), [cards, rules, prices]);
  const [digits, setDigits] = useState('');
  const [touched, setTouched] = useState(false);
  const [cut, setCut] = useState<number | null>(null);
  if (!list.items.length) return null;

  const now = list.askCents;
  const typed = touched ? digitsToCents(digits) : now;
  const target = typed == null ? null : Math.max(typed, list.floorCents);
  const underFloors = typed != null && typed < list.floorCents;
  const step = rules.roundToCents || 100;
  const asks = target != null ? spreadTotal(list.items, target, step) : list.items.map((i) => i.askCents);
  const changing = asks.filter((a, k) => a !== list.items[k].askCents).length;
  const diff = target != null ? target - now : 0;

  const key = (d: string) => {
    setDigits((v) => nextDigits(v, d, !touched));
    setTouched(true);
    setCut(null);
  };
  const pickCut = (p: number) => {
    if (native) Haptics.selectionAsync().catch(() => {});
    setDigits(String(discounted(now, p, step) / 100));
    setTouched(true);
    setCut(p);
  };
  const apply = (next: (k: number) => number | null, what: string) => {
    const before = snapshot(list.items.map((i) => i.row.card));
    closeMenu(() => {
      list.items.forEach((it, k) => update(it.row.card.id, { askOverrideCents: next(k) }));
      success();
      onSaved(before, what);
    });
  };
  const save = () =>
    target == null || !changing
      ? closeMenu()
      : apply((k) => askOverrideFor(list.items[k].row.card, list.items[k].row, rules, asks[k]), `Total ${money(target)}`);

  return (
    <View>
      <View style={styles.chips}>
        {CUTS.map((p) => (
          <Pressable
            key={p}
            accessibilityRole="button"
            accessibilityState={{ selected: cut === p }}
            onPress={() => pickCut(p)}
            style={[styles.chip, cut === p && styles.chipOn]}
          >
            <Text style={[type.secondary, { color: cut === p ? color.onInk : color.ink, fontWeight: '500' }]}>{p}% off</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.lines}>
        <Line label="Now" value={money(now)} />
        <Line label="Market" value={money(list.marketCents)} />
        <Line label="Every card at its floor" value={money(list.floorCents)} />
      </View>

      <View style={styles.amount}>
        <Text style={[type.text, styles.muted]}>New total</Text>
        <Text style={[type.displayS, { color: typed != null ? color.ink : color.secondary }]}>{money(typed ?? 0)}</Text>
        <Text style={[type.secondary, styles.muted]}>
          {typed == null ? (
            'Type the total for the table'
          ) : underFloors ? (
            <>
              Under your floors. Lowest is <Text style={{ color: color.loss }}>{money(list.floorCents)}</Text>
            </>
          ) : diff === 0 ? (
            `${list.items.length} cards`
          ) : (
            `${diff > 0 ? '+' : '−'}${money(Math.abs(diff))} (${pct(diff / now)}) · ${changing} of ${list.items.length} cards change`
          )}
        </Text>
      </View>

      <View style={styles.pad}>
        <Keypad
          onDigit={key}
          onBackspace={() => {
            setDigits((v) => (touched ? v.slice(0, -1) : ''));
            setTouched(true);
            setCut(null);
          }}
          onClear={() => {
            setDigits('');
            setTouched(true);
            setCut(null);
          }}
        />
      </View>
      <PrimaryButton
        title={
          target == null || !changing ? 'Keep ' + money(now) : underFloors ? `Every card at its floor · ${money(target)}` : `Set total ${money(target)}`
        }
        onPress={save}
      />
      {list.overridden ? (
        <Pressable accessibilityRole="button" onPress={() => apply(() => null, 'Rule prices')} style={styles.quiet}>
          <Text style={[type.text, styles.ink]}>Back to rule prices</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  return (
    <View style={styles.line}>
      <Text style={[type.text, styles.muted]}>{label}</Text>
      <Text style={[type.body, styles.ink, { fontWeight: '500' }]}>{value}</Text>
    </View>
  );
}

/** A price tag: the footer button that opens the price list. */
export function PriceListIcon({ s = 24 }: { s?: number }) {
  const color = useColors();
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color.ink} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3.5 12.6V4.5a1 1 0 0 1 1-1h8.1a1 1 0 0 1 .7.3l7.2 7.2a1 1 0 0 1 0 1.4l-8.1 8.1a1 1 0 0 1-1.4 0l-7.2-7.2a1 1 0 0 1-.3-.7z" />
      <Path d="M8.2 8.2h.01" strokeWidth={2.6} />
    </Svg>
  );
}

const useStyles = themed((color) =>
  StyleSheet.create({
    ink: { color: color.ink },
    muted: { color: color.secondary },
    lines: { paddingTop: space.m },
    line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', minHeight: 28 },
    amount: { alignItems: 'center', paddingTop: space.m, paddingBottom: space.m, gap: 2 },
    chips: { flexDirection: 'row', gap: space.s, paddingTop: space.m },
    chip: { flex: 1, height: 34, borderRadius: radius.button, backgroundColor: color.well, alignItems: 'center', justifyContent: 'center' },
    chipOn: { backgroundColor: color.ink },
    // The keypad spans the sheet edge to edge, like the system number pad.
    pad: { marginHorizontal: -space.gutter, marginBottom: space.m },
    quiet: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: space.xs },
  }),
);
