// Add a slab by hand: used when PSA can't look the cert up, and for BGS/CGC slabs (v1 scans PSA
// only). The card is matched to its price source after it's added, same as a scanned one.

import { router, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Segmented } from '../src/components/Segmented';
import { BackIcon, Hairline, IconButton, PrimaryButton, Stepper } from '../src/components/ui';
import { matchNewCard } from '../src/services/comps';
import { cardFromDetails } from '../src/services/psa';
import { useVault } from '../src/store/vault';
import { color, space, type } from '../src/theme/tokens';

type Grader = 'psa' | 'bgs' | 'cgc';

export default function AddByHand() {
  const { cert: certParam } = useLocalSearchParams<{ cert?: string }>();
  const insets = useSafeAreaInsets();
  const add = useVault((s) => s.add);
  const [cert, setCert] = useState(certParam ?? '');
  const [grader, setGrader] = useState<Grader>('psa');
  const [grade, setGrade] = useState(10);
  const [name, setName] = useState('');
  const [setTitle, setSetTitle] = useState('');
  const [number, setNumber] = useState('');
  const [language, setLanguage] = useState<'en' | 'ja'>('en');
  const [paid, setPaid] = useState('');
  const [plan, setPlan] = useState<'hold' | 'sell'>('hold');

  const step = grader === 'psa' ? 1 : 0.5;
  const ready = name.trim().length > 0;

  const save = () => {
    if (!ready) return;
    const dollars = parseInt(paid, 10);
    const card = cardFromDetails({
      cert: cert.trim() || null,
      grader,
      grade,
      name,
      setName: setTitle,
      number,
      language,
      paidCents: Number.isFinite(dollars) ? dollars * 100 : null,
      plan,
    });
    add(card);
    matchNewCard(card).catch(() => {});
    router.dismissTo('/');
    router.push(`/card/${card.id}`);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: color.canvas }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: insets.top, paddingBottom: space.xxl }}>
        <View style={styles.nav}>
          <IconButton label="Back" onPress={() => router.back()}>
            <BackIcon />
          </IconButton>
        </View>
        <View style={styles.gutter}>
          <Text style={[type.title, { color: color.ink }]}>Add a slab</Text>
          <Text style={[type.text, { color: color.secondary, paddingTop: 2, paddingBottom: space.l }]}>
            Type what the label says. Prices fill in once the card is matched.
          </Text>

          <Field label="Card name">
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Mew ex"
              placeholderTextColor={color.secondary}
              autoCapitalize="words"
              style={[type.body, styles.input]}
            />
          </Field>
          <Field label="Set">
            <TextInput
              value={setTitle}
              onChangeText={setSetTitle}
              placeholder="151"
              placeholderTextColor={color.secondary}
              autoCapitalize="words"
              style={[type.body, styles.input]}
            />
          </Field>
          <Field label="Card number">
            <TextInput
              value={number}
              onChangeText={setNumber}
              placeholder="205"
              placeholderTextColor={color.secondary}
              keyboardType="numbers-and-punctuation"
              style={[type.body, styles.input]}
            />
          </Field>
          <Field label="Language">
            <Segmented
              style={{ width: 170 }}
              value={language}
              onChange={setLanguage}
              options={[
                { value: 'en', label: 'English' },
                { value: 'ja', label: 'Japanese' },
              ]}
            />
          </Field>
          <Field label="Grader">
            <Segmented<Grader>
              style={{ width: 170 }}
              value={grader}
              onChange={(g) => {
                setGrader(g);
                if (g === 'psa') setGrade((v) => Math.round(v));
              }}
              options={[
                { value: 'psa', label: 'PSA' },
                { value: 'bgs', label: 'BGS' },
                { value: 'cgc', label: 'CGC' },
              ]}
            />
          </Field>
          <Field label="Grade">
            <Stepper
              label="grade"
              value={String(grade)}
              onMinus={() => setGrade((g) => Math.max(1, g - step))}
              onPlus={() => setGrade((g) => Math.min(10, g + step))}
            />
          </Field>
          <Field label="Cert number">
            <TextInput
              value={cert}
              onChangeText={(t) => setCert(t.replace(/[^0-9]/g, ''))}
              placeholder="Optional"
              placeholderTextColor={color.secondary}
              keyboardType="number-pad"
              style={[type.body, styles.input]}
            />
          </Field>
          <Field label="What you paid">
            <TextInput
              value={paid ? `$${paid}` : ''}
              onChangeText={(t) => setPaid(t.replace(/[^0-9]/g, '').slice(0, 6))}
              placeholder="$0"
              placeholderTextColor={color.secondary}
              keyboardType="number-pad"
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
        <PrimaryButton title="Add to vault" onPress={save} style={ready ? undefined : { opacity: 0.4 }} />
      </View>
    </KeyboardAvoidingView>
  );
}

function Field({ label, children, last }: { label: string; children: ReactNode; last?: boolean }) {
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

const styles = StyleSheet.create({
  gutter: { paddingHorizontal: space.gutter },
  nav: { flexDirection: 'row', paddingHorizontal: space.gutter - 10 },
  field: { minHeight: 56, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.l },
  input: { flex: 1, textAlign: 'right', color: color.ink, paddingVertical: space.m },
});
