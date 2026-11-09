// Add a slab by hand: used when PSA can't look the cert up, and for BGS/CGC slabs (v1 scans PSA
// only). The card is matched to its price source after it's added, same as a scanned one.
// Card search opens it prefilled (name, set, number, grade, photo) with the product already known.
// Sealed product from search (?sealed=booster_box) gets its own short form: how many, what you
// paid for each, hold or sell. Its photo and price come from the catalog by product id.

import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { KEYBOARD_DONE, KeyboardDone } from '../src/components/KeyboardDone';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Segmented } from '../src/components/Segmented';
import { SlabView } from '../src/components/SlabView';
import { BackIcon, Hairline, IconButton, PrimaryButton, Stepper } from '../src/components/ui';
import { centsFromTyped, dollarsTyped, money, ordinal } from '../src/lib/format';
import { isSealedType, sealedLabel } from '../src/lib/sealed';
import { uuid } from '../src/services/sync';
import { cardKey } from '../src/pricing/cardKey';
import { matchNewCard, refreshPrices } from '../src/services/comps';
import { GAMES, GAME_LIST, LANGUAGE_NAME } from '../src/lib/games';
import { cardFromDetails } from '../src/services/psa';
import type { Game, SealedType } from '../src/types';
import { useVault } from '../src/store/vault';
import { size, space, type } from '../src/theme/tokens';
import { themed, useColors } from '../src/theme/theme';
import type { Card } from '../src/types';

type Grader = 'psa' | 'bgs' | 'cgc' | 'raw';

export default function AddByHand() {
  const color = useColors();
  const styles = useStyles();
  const p = useLocalSearchParams<{
    cert?: string;
    name?: string;
    set?: string;
    setCode?: string;
    number?: string;
    language?: string;
    game?: string;
    grader?: Grader;
    grade?: string;
    productId?: string;
    image?: string;
    sealed?: string;
  }>();
  if (isSealedType(p.sealed) && Number(p.productId) > 0) return <AddSealed p={{ ...p, sealed: p.sealed, productId: p.productId! }} />;
  return <AddCard p={p} />;
}

type AddParams = {
  cert?: string;
  name?: string;
  set?: string;
  setCode?: string;
  number?: string;
  language?: string;
  game?: string;
  grader?: Grader;
  grade?: string;
  productId?: string;
  image?: string;
};

/** A sealed item from search: count, paid each, plan. Adds one vault item per copy (they stack). */
function AddSealed({ p }: { p: AddParams & { sealed: SealedType; productId: string } }) {
  const color = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const add = useVault((s) => s.add);
  const [paid, setPaid] = useState('');
  const [count, setCount] = useState(1);
  const [plan, setPlan] = useState<'hold' | 'sell'>('hold');
  const productId = Number(p.productId);
  const base: Card = {
    id: `add-preview-${productId}`,
    game: p.game && p.game in GAMES ? (p.game as Game) : 'pokemon',
    certNumber: null,
    grader: 'raw',
    grade: null,
    name: (p.name ?? '').trim() || sealedLabel(p.sealed),
    setName: p.set?.trim() || null,
    setCode: p.setCode || null,
    number: null,
    language: p.language === 'ja' ? 'ja' : 'en',
    year: null,
    imageFrontUrl: p.image || null,
    sealed: p.sealed,
    productId,
    paidCents: null,
    paidAt: null,
    plan,
    floorOverrideCents: null,
    askOverrideCents: null,
    status: 'owned',
    soldCents: null,
    soldAt: null,
    soldWhere: null,
    createdAt: new Date(0).toISOString(),
  };
  const owned = useVault((s) => s.cards).filter((c) => c.status === 'owned' && c.sealed && c.productId === productId).length;
  const paidCents = centsFromTyped(paid);

  const save = () => {
    const now = new Date().toISOString();
    const saved: Card[] = Array.from({ length: count }, () => ({
      ...base,
      id: uuid(),
      paidCents,
      paidAt: now.slice(0, 10),
      createdAt: now,
    }));
    for (const c of saved) add(c);
    refreshPrices(saved.slice(0, 1)).catch(() => {});
    router.dismissTo('/');
    router.push(`/card/${saved[0].id}`);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: color.canvas }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentContainerStyle={{ paddingTop: insets.top, paddingBottom: space.xxl }}>
        <View style={styles.nav}>
          <IconButton label="Back" onPress={() => router.back()}>
            <BackIcon />
          </IconButton>
        </View>
        <View style={styles.gutter}>
          <Text style={[type.title, { color: color.ink }]}>Add to vault</Text>
          <Text style={[type.text, { color: color.secondary, paddingTop: 2, paddingBottom: space.l }]}>How many, and what you paid for each.</Text>
          <View style={styles.preview}>
            <SlabView card={base} width={size.heroW * 0.75} posed={false} />
          </View>
          <Text style={[type.body, { color: color.ink, fontWeight: '600' }]}>{base.name}</Text>
          <Text style={[type.text, { color: color.secondary, paddingTop: 2, paddingBottom: space.m }]}>
            {[sealedLabel(p.sealed), base.language === 'ja' ? 'Japanese' : null].filter(Boolean).join(' · ')}
          </Text>
          <Hairline />
          <Field label="How many">
            <Stepper label="how many" value={String(count)} onMinus={() => setCount((n) => Math.max(1, n - 1))} onPlus={() => setCount((n) => Math.min(99, n + 1))} />
          </Field>
          <Field label={count > 1 ? 'What you paid each' : 'What you paid'}>
            <TextInput
              value={paid ? `$${paid}` : ''}
              onChangeText={(t) => setPaid(dollarsTyped(t))}
              placeholder="$0"
              placeholderTextColor={color.secondary}
              keyboardType="decimal-pad"
              inputAccessoryViewID={KEYBOARD_DONE}
              style={[type.body, styles.input]}
            />
          </Field>
          <Field label="Plan" last>
            <Segmented
              style={{ width: 150 }}
              value={plan}
              onChange={setPlan}
              options={[
                { value: 'hold', label: 'Hold' },
                { value: 'sell', label: 'Sell' },
              ]}
            />
          </Field>
        </View>
      </ScrollView>
      <View style={[styles.gutter, { paddingBottom: insets.bottom + space.l, paddingTop: space.m }]}>
        {owned ? (
          <Text style={[type.secondary, { color: color.secondary, paddingBottom: space.m, textAlign: 'center' }]}>
            {`You already have ${owned}. This would make ${owned + count}.`}
          </Text>
        ) : null}
        <PrimaryButton
          title={count > 1 ? `Add ${count} to vault${paidCents ? ` · ${money(paidCents * count)}` : ''}` : 'Add to vault'}
          onPress={save}
        />
      </View>
      <KeyboardDone />
    </KeyboardAvoidingView>
  );
}

function AddCard({ p }: { p: AddParams }) {
  const color = useColors();
  const styles = useStyles();
  const certParam = p.cert;
  const fromSearch = !!p.productId;
  const insets = useSafeAreaInsets();
  const add = useVault((s) => s.add);
  const [game, setGame] = useState<Game>(p.game && p.game in GAMES ? (p.game as Game) : 'pokemon');
  const [tilting, setTilting] = useState(false);
  const [cert, setCert] = useState(certParam ?? '');
  const [grader, setGrader] = useState<Grader>(p.grader ?? 'psa');
  const [grade, setGrade] = useState(Number(p.grade) || 10);
  const [name, setName] = useState(p.name ?? '');
  const [setTitle, setSetTitle] = useState(p.set ?? '');
  const [number, setNumber] = useState(p.number ?? '');
  const [variety, setVariety] = useState('');
  const [language, setLanguage] = useState(p.language && GAMES[game].languages.includes(p.language) ? p.language : 'en');
  const info = GAMES[game];
  const [paid, setPaid] = useState('');
  const [plan, setPlan] = useState<'hold' | 'sell'>('hold');

  // From search: show the card as it will look in the vault, slabbed at the chosen grade or raw.
  const preview = useMemo<Card | null>(
    () =>
      fromSearch
        ? {
            id: `add-preview-${p.productId}`,
            certNumber: cert || null,
            grader,
            grade: grader === 'raw' ? null : grade,
            name: name.trim() || ' ',
            setName: setTitle.trim() || null,
            setCode: p.setCode && setTitle === p.set ? p.setCode : null,
            number: number.trim() || null,
            language,
            year: null,
            imageFrontUrl: p.image || null,
            paidCents: null,
            paidAt: null,
            plan,
            floorOverrideCents: null,
            askOverrideCents: null,
            status: 'owned',
            soldCents: null,
            soldAt: null,
            soldWhere: null,
            createdAt: new Date(0).toISOString(),
          }
        : null,
    [fromSearch, p.productId, p.setCode, p.set, p.image, cert, grader, grade, name, setTitle, number, language, plan],
  );

  const step = grader === 'psa' ? 1 : 0.5;
  const ready = name.trim().length > 0;

  // Already own it? A cert can only be one slab, so that gets the louder line and the button
  // says "Add again". Otherwise count copies of the same card at the same grade (raw singles too).
  const owned = useVault((s) => s.cards).filter((c) => c.status === 'owned');
  const certOwned = cert.trim().length > 0 && owned.some((c) => c.certNumber === cert.trim());
  const sameKey = cardKey({
    grader,
    grade: grader === 'raw' ? null : grade,
    setCode: p.setCode && setTitle === p.set ? p.setCode : null,
    setName: setTitle.trim() || null,
    number: number.trim().replace(/^#/, '') || null,
    language,
  });
  const copies = number.trim() ? owned.filter((c) => cardKey(c) === sameKey).length : 0;
  const dupLine = certOwned
    ? `Cert ${cert.trim()} is already in your vault.`
    : copies > 0
      ? `You already have ${copies} of this card. This would be your ${ordinal(copies + 1)}.`
      : null;

  const save = () => {
    if (!ready) return;
    const card = cardFromDetails({
      game,
      cert: cert.trim() || null,
      grader,
      grade,
      name,
      setName: setTitle,
      number,
      // Pokémon numbers are unique per printing; the other games reuse them for parallels.
      variety: game === 'pokemon' ? undefined : variety,
      language,
      paidCents: centsFromTyped(paid),
      plan,
      // The set code only fits while the set is the one search picked.
      setCode: p.setCode && setTitle === p.set ? p.setCode : null,
      imageFrontUrl: p.image || null,
    });
    const saved = grader === 'raw' ? { ...card, grade: null } : card;
    add(saved);
    matchNewCard(saved, fromSearch ? p.productId : undefined)
      .then(() => refreshPrices([saved]))
      .catch(() => {});
    router.dismissTo('/');
    router.push(`/card/${saved.id}`);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: color.canvas }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* A tilt drag on the preview must not start iOS 26's swipe-back. */}
      <Stack.Screen options={{ fullScreenGestureEnabled: false }} />
      <ScrollView
        scrollEnabled={!tilting}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentContainerStyle={{ paddingTop: insets.top, paddingBottom: space.xxl }}
      >
        <View style={styles.nav}>
          <IconButton label="Back" onPress={() => router.back()}>
            <BackIcon />
          </IconButton>
        </View>
        <View style={styles.gutter}>
          <Text style={[type.title, { color: color.ink }]}>{fromSearch ? 'Add to vault' : 'Add a slab'}</Text>
          <Text style={[type.text, { color: color.secondary, paddingTop: 2, paddingBottom: space.l }]}>
            {fromSearch
              ? 'Check the grade, then add what you paid.'
              : 'Type what the label says. Prices fill in once the card is matched.'}
          </Text>

          {preview ? (
            <View style={styles.preview}>
              <SlabView card={preview} width={size.heroW * 0.75} interactive onDragChange={setTilting} />
            </View>
          ) : null}
          <Field label="Game">
            <Segmented<Game>
              style={{ width: 250 }}
              value={game}
              onChange={(g) => {
                setGame(g);
                // Riftbound prints in Chinese, not Japanese; keep the choice valid for the game.
                if (!GAMES[g].languages.includes(language)) setLanguage('en');
              }}
              options={GAME_LIST.map((g) => ({ value: g.id, label: g.name }))}
            />
          </Field>
          <Field label="Card name">
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={info.example.name}
              placeholderTextColor={color.secondary}
              autoCapitalize="words"
              style={[type.body, styles.input]}
            />
          </Field>
          <Field label="Set">
            <TextInput
              value={setTitle}
              onChangeText={setSetTitle}
              placeholder={info.example.set}
              placeholderTextColor={color.secondary}
              autoCapitalize="words"
              style={[type.body, styles.input]}
            />
          </Field>
          <Field label="Card number">
            <TextInput
              value={number}
              onChangeText={setNumber}
              placeholder={info.example.number}
              placeholderTextColor={color.secondary}
              keyboardType="numbers-and-punctuation"
              style={[type.body, styles.input]}
            />
          </Field>
          {game === 'pokemon' ? null : (
            <Field label="Variety">
              <TextInput
                value={variety}
                onChangeText={setVariety}
                placeholder="Optional, e.g. Parallel"
                placeholderTextColor={color.secondary}
                autoCapitalize="words"
                style={[type.body, styles.input]}
              />
            </Field>
          )}
          <Field label="Language">
            <Segmented
              style={{ width: 170 }}
              value={language}
              onChange={setLanguage}
              options={info.languages.map((l) => ({ value: l, label: LANGUAGE_NAME[l] ?? l }))}
            />
          </Field>
          <Field label="Grader">
            <Segmented<Grader>
              style={{ width: 220 }}
              value={grader}
              onChange={(g) => {
                setGrader(g);
                if (g === 'psa') setGrade((v) => Math.round(v));
              }}
              options={[
                { value: 'psa', label: 'PSA' },
                { value: 'bgs', label: 'BGS' },
                { value: 'cgc', label: 'CGC' },
                { value: 'raw', label: 'Raw' },
              ]}
            />
          </Field>
          {grader === 'raw' ? null : (
            <Field label="Grade">
              <Stepper
                label="grade"
                value={String(grade)}
                onMinus={() => setGrade((g) => Math.max(1, g - step))}
                onPlus={() => setGrade((g) => Math.min(10, g + step))}
              />
            </Field>
          )}
          <Field label="Cert number">
            <TextInput
              value={cert}
              onChangeText={(t) => setCert(t.replace(/[^0-9]/g, ''))}
              placeholder="Optional"
              placeholderTextColor={color.secondary}
              keyboardType="number-pad"
              inputAccessoryViewID={KEYBOARD_DONE}
              style={[type.body, styles.input]}
            />
          </Field>
          <Field label="What you paid">
            <TextInput
              value={paid ? `$${paid}` : ''}
              onChangeText={(t) => setPaid(dollarsTyped(t))}
              placeholder="$0"
              placeholderTextColor={color.secondary}
              keyboardType="decimal-pad"
              inputAccessoryViewID={KEYBOARD_DONE}
              style={[type.body, styles.input]}
            />
          </Field>
          <Field label="Plan" last>
            <Segmented
              style={{ width: 150 }}
              value={plan}
              onChange={setPlan}
              options={[
                { value: 'hold', label: 'Hold' },
                { value: 'sell', label: 'Sell' },
              ]}
            />
          </Field>
        </View>
      </ScrollView>
      <View style={[styles.gutter, { paddingBottom: insets.bottom + space.l, paddingTop: space.m }]}>
        {dupLine ? (
          <Text style={[type.secondary, { color: certOwned ? color.ink : color.secondary, paddingBottom: space.m, textAlign: 'center' }]}>
            {dupLine}
          </Text>
        ) : null}
        <PrimaryButton title={certOwned ? 'Add again' : 'Add to vault'} onPress={save} style={ready ? undefined : { opacity: 0.4 }} />
      </View>
      <KeyboardDone />
    </KeyboardAvoidingView>
  );
}

function Field({ label, children, last }: { label: string; children: ReactNode; last?: boolean }) {
  const color = useColors();
  const styles = useStyles();
  return (
    <>
      <View style={styles.field}>
        <Text numberOfLines={1} style={[type.body, { color: color.ink, flexShrink: 0 }]}>
          {label}
        </Text>
        {children}
      </View>
      {last ? null : <Hairline />}
    </>
  );
}

const useStyles = themed((color) => StyleSheet.create({
  gutter: { paddingHorizontal: space.gutter },
  preview: { alignItems: 'center', paddingBottom: space.xl },
  nav: { flexDirection: 'row', paddingHorizontal: space.gutter - 10 },
  field: { minHeight: 56, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.l },
  input: { flex: 1, textAlign: 'right', color: color.ink, paddingVertical: space.m },
}));
