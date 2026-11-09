// "Put on the table": con mode's one sheet for getting slabs out. Pick a slab from the vault and a
// small dropdown on its row sets Hold, For sale, Trade only or Sold. The first three apply at once
// and the sheet stays open, so you can lay out a table without leaving it. Sold slides the same
// sheet to a price step with the keypad. "Scan a new slab" is the only way out to another screen.
//
// The dropdown is drawn inside this sheet (not through a second Modal, which iOS can refuse to
// present over a Modal). Pull down anywhere to dismiss, like any iOS sheet (useSheetDrag): the sheet
// takes a downward drag in the capture phase when the list is already at its top, so scrolling the
// list still works.

import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CON_STATUS_LABEL, CON_STATUS_ORDER, CON_STATUSES, conStatusOf, planPatch, type ConStatus } from '../../lib/conStatus';
import { cardLabel, money, rowTitle } from '../../lib/format';
import { rowFor } from '../../pricing/portfolio';
import { DEFAULT_CON_NAME, useCon } from '../../store/con';
import { usePrices } from '../../store/prices';
import { useRules } from '../../store/rules';
import { useVault } from '../../store/vault';
import { motion, radius, size, space, type } from '../../theme/tokens';
import { themed, useColors } from '../../theme/theme';
import type { Card } from '../../types';
import { CardThumb } from '../CardThumb';
import { Keypad } from '../Keypad';
import { Check } from '../menu/Menu';
import { SheetScope, SheetScrollView, useSheetDrag } from '../sheet/useSheetDrag';
import { BackIcon, Hairline, IconButton, PrimaryButton } from '../ui';

export type TableSheetOpen = { step: 'list' } | { step: 'price'; id: string };

type Props = {
  open: TableSheetOpen | null;
  /** Closed. `changed` is every slab whose status moved while the sheet was up, last one last. */
  onClose: (changed: { id: string; status: ConStatus }[]) => void;
  onScan: () => void;
};

const MAX_DIGITS = 6;
const native = Platform.OS !== 'web';

export function TableSheet({ open, onClose, onScan }: Props) {
  const color = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const progress = useRef(new Animated.Value(0)).current;
  const closeRef = useRef(() => {});
  const sheet = useSheetDrag(() => closeRef.current());
  const drag = sheet.drag;
  const closing = useRef(false);
  const changed = useRef<{ id: string; status: ConStatus }[]>([]);
  const [step, setStep] = useState<TableSheetOpen | null>(null);
  /** Price step opened straight from a con row: back closes the sheet instead of showing the list. */
  const priceOnly = useRef(false);

  useEffect(() => {
    if (!open) return;
    closing.current = false;
    changed.current = [];
    priceOnly.current = open.step === 'price';
    sheet.reset();
    progress.setValue(0);
    setStep(open);
    Animated.timing(progress, { toValue: 1, duration: motion.sheetIn, easing: Easing.out(Easing.cubic), useNativeDriver: native }).start();
  }, [open, progress, drag]);

  const close = () => {
    if (closing.current) return;
    closing.current = true;
    Animated.timing(progress, { toValue: 0, duration: motion.sheetOut, easing: Easing.in(Easing.cubic), useNativeDriver: native }).start(() => {
      setStep(null);
      onClose(changed.current);
    });
  };
  closeRef.current = close;

  if (!step) return null;
  // Tall enough for the keypad step; full height on small phones.
  const sheetH = Math.min(screenH - insets.top - space.s, Math.max(Math.round(screenH * 0.88), 640));
  const translateY = Animated.add(progress.interpolate({ inputRange: [0, 1], outputRange: [sheetH, 0] }), drag);

  const record = (id: string, status: ConStatus) => {
    changed.current = [...changed.current.filter((c) => c.id !== id), { id, status }];
  };

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={close}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: color.scrim, opacity: progress }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" style={StyleSheet.absoluteFill} onPress={close} />
      </Animated.View>
      <Animated.View
        accessibilityViewIsModal
        style={[styles.sheet, { height: sheetH, transform: [{ translateY }] }]}
        {...sheet.panHandlers}
      >
        <SheetScope value={sheet.scope}>
        <View style={styles.grabber} />
        {step.step === 'list' ? (
          <ListStep
            bottomInset={insets.bottom}
            onDone={close}
            onScan={() => {
              closing.current = true;
              Animated.timing(progress, { toValue: 0, duration: motion.sheetOut, useNativeDriver: native }).start(() => {
                setStep(null);
                onClose(changed.current);
                onScan();
              });
            }}
            onSet={(card, s) => {
              record(card.id, s);
            }}
            onSold={(card) => {
              setStep({ step: 'price', id: card.id });
            }}
          />
        ) : (
          <PriceStep
            id={step.id}
            bottomInset={insets.bottom}
            onBack={() => {
              if (priceOnly.current) return close();
              setStep({ step: 'list' });
            }}
            onSold={(id) => {
              record(id, 'sold');
              close();
            }}
          />
        )}
        </SheetScope>
      </Animated.View>
    </Modal>
  );
}

function ListStep({
  bottomInset,
  onDone,
  onScan,
  onSet,
  onSold,
}: {
  bottomInset: number;
  onDone: () => void;
  onScan: () => void;
  onSet: (card: Card, s: ConStatus) => void;
  onSold: (card: Card) => void;
}) {
  const color = useColors();
  const styles = useStyles();
  const cards = useVault((s) => s.cards);
  const update = useVault((s) => s.update);
  const rules = useRules((s) => s.rules);
  const prices = usePrices((s) => s.byKey);
  const [q, setQ] = useState('');
  const [menu, setMenu] = useState<{ card: Card; y: number; up: boolean } | null>(null);
  const listBox = useRef<ComponentRef<typeof View>>(null);
  const rowRefs = useRef(new Map<string, ComponentRef<typeof View> | null>());
  // Holds stay first even after you change one, so the list doesn't jump under your thumb.
  const [order] = useState(() => new Map(cards.map((c) => [c.id, CON_STATUS_ORDER[conStatusOf(c)]])));

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return cards
      .filter((c) => c.status === 'owned')
      .filter((c) => !needle || `${c.name} ${c.setName ?? ''} ${c.certNumber ?? ''}`.toLowerCase().includes(needle))
      .map((c) => rowFor(c, rules))
      .sort((a, b) => (order.get(a.card.id) ?? 0) - (order.get(b.card.id) ?? 0));
  }, [cards, rules, prices, q, order]);

  const openMenuFor = (card: Card) => {
    const row = rowRefs.current.get(card.id);
    const box = listBox.current;
    if (!row || !box) return;
    row.measureInWindow((_x, ry, _w, rh) =>
      box.measureInWindow((_bx, by, _bw, bh) => {
        const top = ry - by;
        // Flip above the row when there isn't room for four rows under it.
        const up = top + rh + DROP_H + space.l > bh;
        setMenu({ card, y: up ? top : top + rh, up });
        if (native) Haptics.selectionAsync().catch(() => {});
      }),
    );
  };

  const choose = (card: Card, s: ConStatus) => {
    setMenu(null);
    if (s === 'sold') return onSold(card);
    update(card.id, planPatch(s));
    onSet(card, s);
    if (native) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.header}>
        <Text style={[type.section, { color: color.ink, flex: 1 }]}>Put on the table</Text>
        <Pressable accessibilityRole="button" onPress={onDone} hitSlop={8} style={styles.headerBtn}>
          <Text style={[type.body, { color: color.ink }]}>Done</Text>
        </Pressable>
      </View>

      <Pressable accessibilityRole="button" onPress={onScan} style={({ pressed }) => [styles.scanRow, pressed && { opacity: 0.5 }]}>
        <Text style={[type.body, { color: color.ink, flex: 1 }]}>Scan a new slab</Text>
        <Text style={[type.body, { color: color.secondary }]}>›</Text>
      </Pressable>
      <View style={{ marginHorizontal: space.gutter }}>
        <Hairline />
      </View>

      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder="Search your collection"
        placeholderTextColor={color.secondary}
        autoCorrect={false}
        clearButtonMode="while-editing"
        returnKeyType="search"
        accessibilityLabel="Search your collection"
        style={[type.text, styles.search]}
      />

      <View ref={listBox} collapsable={false} style={{ flex: 1 }}>
        <SheetScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onScrollBeginDrag={() => setMenu(null)}
          contentContainerStyle={{ paddingBottom: bottomInset + space.xxl }}
        >
          {rows.map((r) => {
            const s = conStatusOf(r.card);
            return (
              <View key={r.card.id} ref={(v) => void rowRefs.current.set(r.card.id, v)} collapsable={false}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityHint="Choose hold, for sale, trade only or sold"
                  onPress={() => openMenuFor(r.card)}
                  style={({ pressed }) => [styles.row, (pressed || menu?.card.id === r.card.id) && { opacity: 0.55 }]}
                >
                  <CardThumb card={r.card} />
                  <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
                    <Text numberOfLines={1} style={[type.body, { color: color.ink }]}>
                      {rowTitle(r.card)}
                    </Text>
                    <Text numberOfLines={1} style={[type.secondary, { color: color.secondary }]}>
                      {cardLabel(r.card)} ·{' '}
                      <Text style={{ color: s === 'hold' ? color.secondary : color.ink }}>{CON_STATUS_LABEL[s]}</Text>
                    </Text>
                  </View>
                  <Text style={[type.numberM, { color: color.ink }]}>{r.price ? money(r.price.marketCents) : '—'}</Text>
                </Pressable>
                <Hairline inset={size.thumbW + space.m} />
              </View>
            );
          })}
          {rows.length === 0 ? (
            <Text style={[type.text, { color: color.secondary, paddingTop: space.xl }]}>
              {q ? 'Nothing in your collection matches.' : 'Nothing in your collection yet. Scan a slab to add one.'}
            </Text>
          ) : null}
        </SheetScrollView>

        {menu ? (
          <>
            <Pressable
              accessibilityLabel="Close menu"
              style={[StyleSheet.absoluteFill, { backgroundColor: color.scrimLight }]}
              onPress={() => setMenu(null)}
            />
            <View
              style={[
                styles.dropdown,
                menu.up ? { top: menu.y - DROP_H - space.xs } : { top: menu.y + space.xs },
              ]}
            >
              {CON_STATUSES.map((s, i) => (
                <View key={s}>
                  {i > 0 ? <Hairline inset={space.l} /> : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: conStatusOf(menu.card) === s }}
                    onPress={() => choose(menu.card, s)}
                    style={({ pressed }) => [styles.dropRow, pressed && { opacity: 0.45 }]}
                  >
                    <Text style={[type.body, { color: color.ink, flex: 1 }]}>{CON_STATUS_LABEL[s]}</Text>
                    {conStatusOf(menu.card) === s ? <Check /> : null}
                  </Pressable>
                </View>
              ))}
            </View>
          </>
        ) : null}
      </View>
    </View>
  );
}

const DROP_H = size.touch * 4 + space.xs * 2;

function PriceStep({
  id,
  bottomInset,
  onBack,
  onSold,
}: {
  id: string;
  bottomInset: number;
  onBack: () => void;
  onSold: (id: string) => void;
}) {
  const color = useColors();
  const styles = useStyles();
  const card = useVault((s) => s.cards.find((c) => c.id === id));
  const update = useVault((s) => s.update);
  const rules = useRules((s) => s.rules);
  const prices = usePrices((s) => s.byKey);
  const session = useCon((s) => s.session);
  const startCon = useCon((s) => s.start);
  const row = useMemo(() => (card ? rowFor(card, rules) : null), [card, rules, prices]);
  const [digits, setDigits] = useState('');
  const [confirm, setConfirm] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  if (!card || !row) return null;
  const cents = (parseInt(digits || '0', 10) || 0) * 100;
  const has = digits.length > 0;
  const keeps = card.paidCents != null && has ? cents - card.paidCents : null;

  const edit = (next: string) => {
    if (timer.current) clearTimeout(timer.current);
    setConfirm(null);
    setDigits(next);
  };

  const sell = () => {
    if (!has) return;
    const loss = keeps != null && keeps < 0 ? -keeps : 0;
    if (loss > 0 && !confirm) {
      setConfirm(`Tap again to sell at a ${money(loss)} loss`);
      timer.current = setTimeout(() => setConfirm(null), 4000);
      return;
    }
    let where = session?.name ?? null;
    if (!session) {
      startCon(DEFAULT_CON_NAME);
      where = DEFAULT_CON_NAME;
    }
    update(card.id, { status: 'sold', soldCents: cents, soldAt: new Date().toISOString(), soldWhere: where });
    if (native) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    onSold(card.id);
  };

  const facts = [
    card.paidCents != null ? `Paid ${money(card.paidCents)}` : null,
    row.floor != null ? `floor ${money(row.floor)}` : null,
    row.price ? `market ${money(row.price.marketCents)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.priceHeader}>
        <IconButton label="Back" onPress={onBack}>
          <BackIcon />
        </IconButton>
        <CardThumb card={card} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={[type.body, { color: color.ink }]}>
            {rowTitle(card)}
          </Text>
          <Text numberOfLines={1} style={[type.secondary, { color: color.secondary }]}>
            {cardLabel(card)}
          </Text>
        </View>
      </View>

      <View style={{ flex: 1, paddingHorizontal: space.gutter, justifyContent: 'space-evenly' }}>
        <View style={{ alignItems: 'center' }}>
          <Text style={[type.text, { color: color.secondary }]}>Sold for</Text>
          <Text adjustsFontSizeToFit numberOfLines={1} style={[type.displayL, { color: has ? color.ink : color.hairline }]}>
            {money(cents)}
          </Text>
          <Text style={[type.section, { color: color.secondary, minHeight: 26 }]}>
            {keeps != null ? (
              <>
                {keeps >= 0 ? 'Keeps ' : 'Loses '}
                <Text style={{ color: keeps > 0 ? color.gain : keeps < 0 ? color.loss : color.secondary }}>{money(Math.abs(keeps))}</Text>
                {row.floor != null && cents < row.floor ? (
                  <>
                    {' · '}
                    <Text style={{ color: color.loss }}>{money(row.floor - cents)}</Text> under floor
                  </>
                ) : null}
              </>
            ) : has && row.floor != null && cents < row.floor ? (
              <>
                <Text style={{ color: color.loss }}>{money(row.floor - cents)}</Text> under floor
              </>
            ) : null}
          </Text>
          <Text numberOfLines={1} style={[type.secondary, { color: color.secondary, paddingTop: space.xs }]}>
            {facts || 'No comps yet'}
          </Text>
        </View>
        <View style={{ gap: space.xs }}>
          <PrimaryButton title={has ? `Sold for ${money(cents)}` : 'Type the price'} onPress={sell} style={has ? undefined : { opacity: 0.35 }} />
          <Pressable accessibilityRole="button" disabled={!confirm} onPress={sell} style={styles.quiet}>
            <Text style={[type.body, { color: color.ink }]}>{confirm ?? ''}</Text>
          </Pressable>
        </View>
      </View>

      <Keypad
        bottomInset={bottomInset}
        onDigit={(d) => {
          if (digits.length >= MAX_DIGITS || (d === '0' && !digits)) return;
          edit(digits + d);
        }}
        onBackspace={() => edit(digits.slice(0, -1))}
        onClear={() => edit('')}
      />
    </View>
  );
}

const useStyles = themed((color) => StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: color.sheet,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    overflow: 'hidden',
  },
  grabber: {
    alignSelf: 'center',
    width: size.grabberW,
    height: size.grabberH,
    borderRadius: size.grabberH / 2,
    backgroundColor: color.hairline,
    marginTop: space.s,
    marginBottom: space.s,
  },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.gutter, paddingBottom: space.s },
  headerBtn: { minHeight: size.touch, justifyContent: 'center' },
  scanRow: { height: size.menuRow, flexDirection: 'row', alignItems: 'center', marginHorizontal: space.gutter },
  search: {
    height: size.touch,
    marginHorizontal: space.gutter,
    marginTop: space.m,
    marginBottom: space.xs,
    paddingHorizontal: space.m,
    borderRadius: radius.field,
    backgroundColor: color.well,
    color: color.ink,
  },
  row: { height: size.rowVault, flexDirection: 'row', alignItems: 'center', gap: space.m, marginHorizontal: space.gutter },
  dropdown: {
    position: 'absolute',
    right: space.gutter,
    width: size.dropdownW,
    backgroundColor: color.sheet,
    borderRadius: radius.button,
    overflow: 'hidden',
    paddingVertical: space.xs,
  },
  dropRow: { height: size.touch, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.l, gap: space.m },
  priceHeader: { flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.gutter - 12, paddingRight: space.gutter },
  quiet: { minHeight: size.touch, alignItems: 'center', justifyContent: 'center' },
}));
