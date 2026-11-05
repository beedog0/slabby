// Scan: camera decodes the PSA label QR on device → cert → cache-first lookup → sheet →
// "Add to vault". Reference: 02-scan.png. Comps never run on this path.

import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { CardThumb } from '../src/components/CardThumb';
import { Segmented } from '../src/components/Segmented';
import { Hairline, PrimaryButton } from '../src/components/ui';
import { gradeLabel, money, rowTitle } from '../src/lib/format';
import { cardFromCert, lookupCert, parseCertFromQr, type CertResult } from '../src/services/psa';
import { priceFor } from '../src/services/comps';
import { useVault } from '../src/store/vault';
import { color, radius, size, space, type } from '../src/theme/tokens';

const LANG_NAME: Record<string, string> = { ja: 'Japanese', en: 'English', ko: 'Korean', zh: 'Chinese' };
const SCAN_BG = '#2A2A2C'; // camera chrome only; never used on app UI

export default function Scan() {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [result, setResult] = useState<CertResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState('');
  const [paid, setPaid] = useState('');
  const [plan, setPlan] = useState<'hold' | 'sell'>('hold');
  const add = useVault((s) => s.add);
  const existing = useVault((s) => s.cards);
  const lastCert = useRef<string | null>(null);

  const handle = async (data: string) => {
    const cert = parseCertFromQr(data);
    if (!cert || cert === lastCert.current || busy) return;
    lastCert.current = cert;
    setBusy(true);
    Haptics.selectionAsync().catch(() => {});
    const r = await lookupCert(cert);
    setResult(r);
    setBusy(false);
    if (r.status === 'found') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  const preview = result?.status === 'found' ? cardFromCert(result.payload, { paidCents: null, plan }) : null;
  const price = preview ? priceFor(preview) : null;
  const already = preview ? existing.some((c) => c.certNumber === preview.certNumber && c.status === 'owned') : false;

  const addToVault = () => {
    if (result?.status !== 'found') return;
    const dollars = parseInt(paid.replace(/[^0-9]/g, ''), 10);
    add(cardFromCert(result.payload, { paidCents: Number.isFinite(dollars) ? dollars * 100 : null, plan }));
    router.back();
  };

  const rescan = () => {
    lastCert.current = null;
    setResult(null);
  };

  const canUseCamera = Platform.OS !== 'web' && permission?.granted;

  return (
    <View style={{ flex: 1, backgroundColor: SCAN_BG }}>
      {canUseCamera ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torch}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={result ? undefined : ({ data }) => handle(data)}
        />
      ) : null}

      <View style={[styles.nav, { paddingTop: insets.top + space.s }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.back()} style={styles.navBtn}>
          <Svg width={22} height={22} viewBox="0 0 24 24" stroke={color.onInk} strokeWidth={2} strokeLinecap="round">
            <Path d="M5 5l14 14M19 5L5 19" />
          </Svg>
        </Pressable>
        <Text style={[type.body, { color: color.onInk }]}>Scan slab</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Flashlight" onPress={() => setTorch((t) => !t)} style={styles.navBtn}>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill={torch ? color.onInk : 'none'} stroke={color.onInk} strokeWidth={1.75} strokeLinejoin="round">
            <Path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
          </Svg>
        </Pressable>
      </View>

      <View style={styles.viewfinder}>
        <View style={styles.frame}>
          {['tl', 'tr', 'bl', 'br'].map((c) => (
            <View key={c} style={[styles.corner, corner(c)]} />
          ))}
        </View>
        <Text style={[type.text, { color: 'rgba(255,255,255,0.75)', textAlign: 'center', paddingTop: space.xl }]}>
          {busy ? 'Checking with PSA' : 'Line up the QR on the PSA label'}
        </Text>
        {!canUseCamera ? (
          <View style={styles.manual}>
            {Platform.OS !== 'web' && permission && !permission.granted ? (
              <PrimaryButton title="Allow camera" onPress={requestPermission} style={{ backgroundColor: color.canvas }} />
            ) : null}
            <TextInput
              value={manual}
              onChangeText={setManual}
              onSubmitEditing={() => handle(manual)}
              placeholder="Or type the cert number"
              placeholderTextColor="rgba(255,255,255,0.5)"
              keyboardType="number-pad"
              returnKeyType="search"
              style={[type.body, styles.manualInput]}
            />
          </View>
        ) : null}
      </View>

      {result ? (
        <View style={[styles.sheet, { paddingBottom: insets.bottom + space.l }]}>
          <View style={styles.grabber} />
          {result.status === 'found' && preview ? (
            <>
              <Text style={[type.text, { color: color.gain, fontWeight: '500' }]}>
                {result.source === 'mock' ? `Cert ${result.cert} · sample data` : `✓ Cert ${result.cert} verified with PSA`}
              </Text>
              <View style={styles.cardRow}>
                <CardThumb card={preview} />
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={[type.title, { color: color.ink }]}>
                    {rowTitle(preview)}
                  </Text>
                  <Text style={[type.text, { color: color.secondary }]}>
                    {LANG_NAME[preview.language] ?? preview.language} · {gradeLabel(preview.grader, preview.grade)}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[type.displayS, { color: color.ink, fontSize: 26 }]}>{price ? money(price.marketCents) : '—'}</Text>
                  <Text style={[type.secondary, { color: color.secondary }]}>{price ? 'market' : 'comps pending'}</Text>
                </View>
              </View>
              <Hairline />
              <View style={styles.field}>
                <Text numberOfLines={1} style={[type.body, { color: color.ink, flexShrink: 0 }]}>What you paid</Text>
                <TextInput
                  value={paid ? `$${paid}` : ''}
                  onChangeText={(t) => setPaid(t.replace(/[^0-9]/g, '').slice(0, 6))}
                  placeholder="$0"
                  placeholderTextColor={color.secondary}
                  keyboardType="number-pad"
                  style={[type.rowPrice, styles.paidInput]}
                  accessibilityLabel="What you paid"
                />
              </View>
              <Hairline />
              <View style={styles.field}>
                <Text style={[type.body, { color: color.ink }]}>Plan</Text>
                <Segmented
                  style={{ width: 150 }}
                  value={plan}
                  onChange={setPlan}
                  options={[
                    { value: 'hold', label: 'Hold' },
                    { value: 'sell', label: 'Sell' },
                  ]}
                />
              </View>
              <Hairline />
              <PrimaryButton
                style={{ marginTop: space.l }}
                title={already ? 'Already in your vault' : 'Add to vault'}
                onPress={already ? () => router.back() : addToVault}
              />
            </>
          ) : (
            <>
              <Text style={[type.section, { color: color.ink }]}>
                {result.status === 'pending'
                  ? 'Queued for PSA'
                  : result.status === 'not_found'
                    ? `PSA has no cert ${result.cert}`
                    : 'Couldn’t check that cert'}
              </Text>
              <Text style={[type.text, { color: color.secondary, paddingVertical: space.m }]}>
                {result.status === 'pending'
                  ? 'PSA’s daily lookup limit is used up. It will fill in tomorrow.'
                  : result.status === 'error'
                    ? result.message
                    : 'Check the number on the label and try again.'}
              </Text>
              <PrimaryButton title="Scan again" onPress={rescan} />
            </>
          )}
        </View>
      ) : null}
    </View>
  );
}

const C = 3; // corner stroke
const corner = (c: string) => ({
  top: c[0] === 't' ? 0 : undefined,
  bottom: c[0] === 'b' ? 0 : undefined,
  left: c[1] === 'l' ? 0 : undefined,
  right: c[1] === 'r' ? 0 : undefined,
  borderTopWidth: c[0] === 't' ? C : 0,
  borderBottomWidth: c[0] === 'b' ? C : 0,
  borderLeftWidth: c[1] === 'l' ? C : 0,
  borderRightWidth: c[1] === 'r' ? C : 0,
});

const styles = StyleSheet.create({
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.s },
  navBtn: { width: size.touch, height: size.touch, alignItems: 'center', justifyContent: 'center' },
  viewfinder: { flex: 1, alignItems: 'center', paddingTop: space.xxxl },
  frame: { width: 240, height: 110 },
  corner: { position: 'absolute', width: 28, height: 28, borderColor: color.conFill, borderRadius: 4 },
  manual: { width: '100%', paddingHorizontal: space.gutter, paddingTop: space.xxl, gap: space.m },
  manualInput: {
    height: size.button,
    borderRadius: radius.field,
    backgroundColor: 'rgba(255,255,255,0.12)',
    color: color.onInk,
    paddingHorizontal: space.l,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: color.canvas,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: space.gutter,
    paddingTop: space.m,
  },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, backgroundColor: color.hairline, marginBottom: space.l },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: space.l, paddingVertical: space.l },
  field: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  paidInput: { color: color.ink, textAlign: 'right', width: 120 },
});
