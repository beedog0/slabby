// Import a collection from another app (Collectr, TCGplayer, PriceCharting, a spreadsheet).
// Choose the CSV the other app exported, check the list, add. One decision per step: the file,
// then the list. Their prices are never read: every card is priced from real sales once matched.

import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CardThumb } from '../src/components/CardThumb';
import { Segmented } from '../src/components/Segmented';
import { BackIcon, Hairline, IconButton, PrimaryButton } from '../src/components/ui';
import { cardLabel, cardPrice } from '../src/lib/format';
import { matchNewCard, refreshPrices } from '../src/services/comps';
import { ImportError, parseImport, SOURCE_NAME, type ImportSource } from '../src/services/importCsv';
import { cardsFor, matchAll, type Matched } from '../src/services/importMatch';
import { useVault } from '../src/store/vault';
import { color, size, space, type } from '../src/theme/tokens';
import type { Card } from '../src/types';

type Step =
  | { kind: 'start'; error?: string }
  | { kind: 'matching'; total: number; done: number }
  | { kind: 'review'; source: ImportSource; items: Item[]; skipped: number };

type Item = Matched & { key: string; preview: Card; owned: boolean };

/** File text from the picker's uri. fetch reads file:// on iOS; web gets a blob url. */
async function readText(uri: string): Promise<string> {
  const res = await fetch(uri);
  return res.text();
}

export default function ImportCollection() {
  const insets = useSafeAreaInsets();
  const add = useVault((s) => s.add);
  const vault = useVault((s) => s.cards);
  const [step, setStep] = useState<Step>({ kind: 'start' });
  const [plan, setPlan] = useState<'hold' | 'sell'>('hold');
  const [left, setLeft] = useState<Set<string>>(new Set());

  const choose = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: ['text/csv', 'text/comma-separated-values', 'text/plain', 'text/tab-separated-values', 'public.comma-separated-values-text'],
      copyToCacheDirectory: true,
    }).catch(() => null);
    if (!res || res.canceled || !res.assets?.[0]) return;
    let parsed;
    try {
      parsed = parseImport(await readText(res.assets[0].uri));
    } catch (e) {
      setStep({ kind: 'start', error: e instanceof ImportError ? e.message : 'Couldn’t read that file. Save it as CSV and try again.' });
      return;
    }
    if (!parsed.rows.length) {
      setStep({ kind: 'start', error: 'No cards in that file.' });
      return;
    }
    setStep({ kind: 'matching', total: parsed.rows.length, done: 0 });
    const matched = await matchAll(parsed.rows, (done) =>
      setStep((s) => (s.kind === 'matching' ? { ...s, done } : s)),
    );
    const certs = new Set(vault.filter((c) => c.status === 'owned' && c.certNumber).map((c) => c.certNumber));
    const items: Item[] = matched.map((m, i) => {
      const [preview] = cardsFor(m, 'hold');
      return { ...m, key: `${m.row.line}-${i}`, preview, owned: !!m.row.cert && certs.has(m.row.cert) };
    });
    setLeft(new Set(items.filter((x) => x.owned).map((x) => x.key)));
    setStep({ kind: 'review', source: parsed.source, items, skipped: parsed.skipped });
  };

  const review = step.kind === 'review' ? step : null;
  const counts = useMemo(() => {
    if (!review) return { cards: 0, matched: 0, unmatched: 0 };
    const kept = review.items.filter((x) => !left.has(x.key));
    const cards = kept.reduce((n, x) => n + x.row.quantity, 0);
    const matched = kept.filter((x) => x.card).reduce((n, x) => n + x.row.quantity, 0);
    return { cards, matched, unmatched: cards - matched };
  }, [review, left]);

  const toggle = (k: string) =>
    setLeft((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  const save = () => {
    if (!review || !counts.cards) return;
    const added: { card: Card; productId?: string }[] = [];
    // Oldest row last, so the vault (newest first) keeps the file's order.
    for (const x of [...review.items].reverse()) {
      if (left.has(x.key)) continue;
      for (const card of cardsFor(x, plan)) {
        add(card);
        added.push({ card, productId: x.card ? String(x.card.productId) : undefined });
      }
    }
    linkAll(added).catch(() => {});
    router.back();
  };

  return (
    <View style={{ flex: 1, backgroundColor: color.canvas, paddingTop: insets.top }}>
      <View style={styles.nav}>
        <IconButton label="Back" onPress={() => router.back()}>
          <BackIcon />
        </IconButton>
      </View>

      {step.kind === 'start' ? (
        <View style={[styles.gutter, { flex: 1 }]}>
          <Text style={[type.title, { color: color.ink }]}>Import collection</Text>
          <Text style={[type.text, styles.lead]}>
            Export your collection as a CSV file from Collectr, TCGplayer, PriceCharting or a spreadsheet, then choose it
            here. Slabs keep their grade and cert number, and what you paid comes along.
          </Text>
          <Text style={[type.text, styles.lead]}>
            Their prices aren’t imported. Slabby prices every card from real sales.
          </Text>
          {step.error ? <Text style={[type.text, { color: color.ink, paddingTop: space.l }]}>{step.error}</Text> : null}
          <View style={{ flex: 1 }} />
          <PrimaryButton title="Choose file" onPress={choose} style={{ marginBottom: insets.bottom + space.l }} />
        </View>
      ) : step.kind === 'matching' ? (
        <View style={[styles.gutter, { flex: 1 }]}>
          <Text style={[type.title, { color: color.ink }]}>Import collection</Text>
          <View style={styles.center}>
            <ActivityIndicator color={color.secondary} />
            <Text style={[type.text, { color: color.secondary, paddingTop: space.m }]}>
              Matching {step.done} of {step.total}
            </Text>
          </View>
        </View>
      ) : (
        <>
          <FlatList
            data={step.items}
            keyExtractor={(x) => x.key}
            initialNumToRender={20}
            ItemSeparatorComponent={() => <Hairline inset={space.gutter + size.thumbW + space.m} />}
            ListHeaderComponent={
              <View style={[styles.gutter, { paddingBottom: space.l }]}>
                <Text style={[type.title, { color: color.ink }]}>
                  {counts.cards} {counts.cards === 1 ? 'card' : 'cards'}
                </Text>
                <Text style={[type.text, styles.lead]}>{summary(step.source, counts, step.skipped)}</Text>
                <Segmented<'hold' | 'sell'>
                  style={{ width: 220, marginTop: space.l }}
                  value={plan}
                  onChange={setPlan}
                  options={[
                    { value: 'hold', label: 'Hold' },
                    { value: 'sell', label: 'For sale' },
                  ]}
                />
              </View>
            }
            renderItem={({ item }) => <ImportRowView item={item} out={left.has(item.key)} onPress={() => toggle(item.key)} />}
            contentContainerStyle={{ paddingBottom: space.xxl }}
          />
          <View style={[styles.gutter, { paddingTop: space.m, paddingBottom: insets.bottom + space.l }]}>
            <PrimaryButton
              title={counts.cards ? `Add ${counts.cards} to vault` : 'Nothing to add'}
              onPress={save}
              style={counts.cards ? undefined : { opacity: 0.4 }}
            />
          </View>
        </>
      )}
    </View>
  );
}

function summary(source: ImportSource, c: { matched: number; unmatched: number }, skipped: number): string {
  const from = source === 'spreadsheet' ? 'From your spreadsheet.' : `From ${SOURCE_NAME[source]}.`;
  const parts = [from];
  if (c.unmatched === 0) parts.push('Every card matched our catalog.');
  else
    parts.push(
      `${c.matched} matched our catalog. ${c.unmatched} we couldn’t place come in as written and get a price if we find them later.`,
    );
  if (skipped) parts.push(`${skipped} sealed or blank ${skipped === 1 ? 'line' : 'lines'} left out.`);
  parts.push('Tap a card to leave it out.');
  return parts.join(' ');
}

function ImportRowView({ item, out, onPress }: { item: Item; out: boolean; onPress: () => void }) {
  const { row, card, preview } = item;
  const second = [
    preview.setName ?? row.setName,
    preview.number ? `#${preview.number}` : null,
    cardLabel(preview),
  ]
    .filter(Boolean)
    .join(' · ');
  const third = item.owned
    ? `Cert ${row.cert} is already in your vault`
    : out
      ? 'Left out'
      : !card
        ? 'Not matched, kept as written'
        : row.cert
          ? `Cert ${row.cert}`
          : null;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.row, out && { opacity: 0.4 }]}>
      <CardThumb card={preview} />
      <View style={{ flex: 1 }}>
        <Text style={[type.body, { color: color.ink }]}>
          {preview.name}
          {row.quantity > 1 ? <Text style={{ color: color.secondary }}>{`  ${row.quantity}x`}</Text> : null}
        </Text>
        <Text style={[type.secondary, { color: color.secondary, paddingTop: 2 }]}>{second}</Text>
        {third ? <Text style={[type.secondary, { color: color.secondary, paddingTop: 2 }]}>{third}</Text> : null}
      </View>
      {row.paidCents != null ? (
        <Text style={[type.text, { color: color.secondary }]}>
          {row.quantity > 1 ? `${cardPrice(row.paidCents)} each` : cardPrice(row.paidCents)}
        </Text>
      ) : null}
    </Pressable>
  );
}

/**
 * Tie each new card to its price source on the server, a few at a time, then load prices.
 * Matched cards pass their product so the server skips matching; the rest are matched there,
 * the same as a card added by hand.
 */
async function linkAll(added: { card: Card; productId?: string }[], width = 3): Promise<void> {
  const seen = new Set<string>();
  const jobs = added.filter((a) => {
    // Copies of one card share a price: link it once.
    const k = `${a.card.grader}:${a.card.grade}:${a.card.name}:${a.card.number}:${a.card.setName}:${a.card.language}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const j = jobs[next++];
      await matchNewCard(j.card, j.productId).catch(() => null);
    }
  };
  await Promise.all(Array.from({ length: Math.min(width, jobs.length) }, worker));
  await refreshPrices(added.map((a) => a.card));
}

const styles = StyleSheet.create({
  gutter: { paddingHorizontal: space.gutter },
  nav: { flexDirection: 'row', paddingHorizontal: space.gutter - 10 },
  lead: { color: color.secondary, paddingTop: space.s },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.gutter, paddingVertical: space.m },
});
