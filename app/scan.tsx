// Scan: point at the front label. Slabby reads a frame about once a second on device (Apple Vision)
// and opens the sheet once two reads in a row agree (label in frame, held steady); "Read label"
// reads right away as the manual fallback. → sheet → "Add to vault". No PSA call on this path:
// PSA's API is closed to us for now, so label reading is the default. The QR → PSA lookup only runs where the label reader isn't built in
// (web, Expo Go). Reference: 02-scan.png. Comps never run on this path.

import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, AppState, Easing, Linking, Platform, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { SlabView } from '../src/components/SlabView';
import { Segmented } from '../src/components/Segmented';
import { Hairline, PrimaryButton } from '../src/components/ui';
import { gradeLabel, money, rowTitle } from '../src/lib/format';
import { cardFromCert, lookupCert, parseCertFromQr, type CertResult } from '../src/services/psa';
import { matchNewCard, priceFor, refreshPrices } from '../src/services/comps';
import { parseLabel, stepAutoRead, type AutoRead, type ParsedLabel } from '../src/services/label';
import { useVault } from '../src/store/vault';
import { LabelReader } from '../modules/label-reader';
import { color, radius, size, space, type } from '../src/theme/tokens';

const LANG_NAME: Record<string, string> = { ja: 'Japanese', en: 'English', ko: 'Korean', zh: 'Chinese' };
const SCAN_BG = '#2A2A2C'; // camera chrome only; never used on app UI
const AUTO_START_MS = 700; // let exposure and focus settle first
const AUTO_GAP_MS = 350; // between auto reads; each read itself takes ~0.5–1 s
const NAV_H = 44;
// The label band at the top of a PSA slab, as a share of its height.
const LABEL_SHARE = 0.2;
const LOCK_MS = 450; // the locked frame and its check stay up this long before the sheet rises
const SHEET_IN_MS = 260;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
  const camera = useRef<CameraView>(null);
  const [reading, setReading] = useState(false);
  const [labelMiss, setLabelMiss] = useState(false);
  const [seen, setSeen] = useState('');
  const [cameraReady, setCameraReady] = useState(false);
  const [active, setActive] = useState(AppState.currentState === 'active');
  // A label was read once and we're waiting for a second matching read.
  const [spotted, setSpotted] = useState(false);
  // The read succeeded: the frame closes solid with a check for a beat, then the sheet rises.
  const [locked, setLocked] = useState(false);
  const sheetIn = useRef(new Animated.Value(0)).current;
  const inFlight = useRef(false);
  const manualAsk = useRef(false);
  // What auto-read has gathered so far for the card in frame (fields merge across frames).
  const auto = useRef<AutoRead>(null);
  const win = useWindowDimensions();
  // Label reading is the scan. QR decoding and PSA lookups are off while it's available.
  const labelMode = !!LabelReader;

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
  // A label read without its grade number can't be priced: a gradeless PSA card fell back to the
  // raw price ($5 for a PSA 10 Surfing Pikachu). Show no price and say what's missing instead.
  const gradeMissing = !!preview && preview.grader !== 'raw' && preview.grade == null;
  const price = preview && !gradeMissing ? priceFor(preview) : null;
  const already = preview?.certNumber ? existing.some((c) => c.certNumber === preview.certNumber && c.status === 'owned') : false;

  const addToVault = () => {
    if (result?.status !== 'found') return;
    const dollars = parseInt(paid.replace(/[^0-9]/g, ''), 10);
    const card = cardFromCert(result.payload, { paidCents: Number.isFinite(dollars) ? dollars * 100 : null, plan });
    add(card);
    matchNewCard(card)
      .then(() => refreshPrices([card]))
      .catch(() => {});
    router.replace(`/card/${card.id}`);
  };

  const rescan = () => {
    lastCert.current = null;
    auto.current = null;
    setSpotted(false);
    setLabelMiss(false);
    setResult(null);
  };

  const accept = (parsed: ParsedLabel) => {
    const cert = result?.cert ?? lastCert.current ?? parsed.payload.PSACert.CertNumber;
    parsed.payload.PSACert.CertNumber = cert ?? '';
    lastCert.current = cert || null;
    auto.current = null;
    setSpotted(false);
    setLabelMiss(false);
    setLocked(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)
      .then(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success))
      .catch(() => {});
    setTimeout(() => {
      setLocked(false);
      setResult({ status: 'found', cert: cert ?? '', payload: parsed.payload, source: 'label' });
    }, LOCK_MS);
  };

  // Photograph the front label and read it on device. A cert from the back's code wins over OCR.
  // Auto reads are silent and only act on two matching reads; a tap acts on one read and says so
  // when it can't find a label. A tap during an auto read takes that read over.
  const capture = async (manual: boolean) => {
    if (!LabelReader || !camera.current) return;
    if (manual) {
      setReading(true);
      setLabelMiss(false);
      manualAsk.current = true;
    }
    if (inFlight.current) return;
    inFlight.current = true;
    let uri: string | undefined;
    try {
      const photo = await camera.current.takePictureAsync({ quality: manual ? 0.9 : 0.7, shutterSound: false });
      uri = photo?.uri;
      const lines = uri ? await LabelReader.recognize(uri) : [];
      const parsed = parseLabel(lines);
      const asked = manualAsk.current;
      const step = stepAutoRead(auto.current, parsed);
      if (asked) {
        // A tap takes whatever is readable, topped up with what earlier frames saw of the same card.
        const best = step.ready ?? step.state?.label ?? parsed;
        if (best?.payload.PSACert.Subject) return accept(best);
        setSeen(lines.slice(0, 4).map((l) => l.text).join(' · '));
        setLabelMiss(true);
        auto.current = null;
        setSpotted(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        return;
      }
      if (step.ready) return accept(step.ready);
      if (step.state && !auto.current) Haptics.selectionAsync().catch(() => {});
      auto.current = step.state;
      setSpotted(!!step.state);
      if (step.state) setLabelMiss(false);
    } catch {
      if (manualAsk.current) setLabelMiss(true);
    } finally {
      if (uri) {
        try {
          LabelReader.discard?.(uri);
        } catch {}
      }
      manualAsk.current = false;
      inFlight.current = false;
      setReading(false);
    }
  };
  const captureRef = useRef(capture);
  captureRef.current = capture;

  // From a failed lookup: close the sheet but keep the cert, so the label read can use it.
  const toLabel = () => {
    setLabelMiss(false);
    setResult(null);
  };

  // Ask for the camera as soon as the screen opens; the system prompt only shows once.
  useEffect(() => {
    if (Platform.OS !== 'web' && permission && !permission.granted && permission.canAskAgain) requestPermission();
  }, [permission?.status]);

  const canUseCamera = Platform.OS !== 'web' && permission?.granted;
  const denied = Platform.OS !== 'web' && !!permission && !permission.granted && !permission.canAskAgain;

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setActive(s === 'active'));
    return () => sub.remove();
  }, []);

  // Auto read: while the camera is up and no sheet is open, read a frame, pause, repeat.
  const autoOn = labelMode && !!canUseCamera && cameraReady && active && !result && !locked;

  // The sheet slides up whenever a result arrives.
  useEffect(() => {
    if (!result) return;
    sheetIn.setValue(0);
    Animated.timing(sheetIn, {
      toValue: 1,
      duration: SHEET_IN_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [result]);
  useEffect(() => {
    if (!autoOn) return;
    let alive = true;
    (async () => {
      await wait(AUTO_START_MS);
      while (alive) {
        await captureRef.current(false);
        await wait(AUTO_GAP_MS);
      }
    })();
    return () => {
      alive = false;
      auto.current = null;
      setSpotted(false);
    };
  }, [autoOn]);

  // Slab-shaped window, the same proportions as a PSA slab (83.9 × 134.6 mm), sized so the whole
  // slab fits between the nav and the button. The picture outside it is dimmed.
  const slabRatio = size.heroH / size.heroW;
  const frameRoom = win.height - (insets.top + space.s + NAV_H + space.xl) - (insets.bottom + space.l + size.button + space.xxxl * 2 + space.xl);
  const frameW = labelMode ? Math.round(Math.min(win.width * 0.66, frameRoom / slabRatio)) : 240;
  const frameH = labelMode ? Math.round(frameW * slabRatio) : frameW;
  const labelH = Math.round(frameH * LABEL_SHARE);
  const frameTop = insets.top + space.s + NAV_H + (labelMode ? space.xl : space.xxxl);
  const hint = locked
    ? 'Got it'
    : busy
    ? 'Checking with PSA'
    : reading
      ? 'Reading the label'
      : labelMiss
        ? seen
          ? `Couldn’t find a PSA label in “${seen.slice(0, 80)}”. Fit the label in the frame and hold steady.`
          : 'Couldn’t read any text. Move closer so the label fills the frame.'
        : spotted
          ? 'Hold still'
          : labelMode
            ? 'Fit the slab in the frame, label at the top'
            : 'Line up the QR or barcode on the back of the slab';

  return (
    <View style={{ flex: 1, backgroundColor: SCAN_BG }}>
      {canUseCamera ? (
        <CameraView
          ref={camera}
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torch}
          // Auto-read takes a photo about once a second: no shutter blink over the preview and no
          // auto flash in dim light, or the screen flickers before anything is scanned.
          animateShutter={false}
          flash="off"
          onCameraReady={() => setCameraReady(true)}
          barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'code39'] }}
          onBarcodeScanned={result || labelMode ? undefined : ({ data }) => handle(data)}
        />
      ) : null}

      {/* Scrim: four flat panels around the label window, so the picture behind the hint is dimmed. */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={[styles.scrim, { height: frameTop }]} />
        <View style={{ flexDirection: 'row', height: frameH }}>
          <View style={[styles.scrim, { flex: 1 }]} />
          <View style={{ width: frameW, height: frameH }}>
            {labelMode ? <View style={[styles.labelLine, { top: labelH }]} /> : null}
            {spotted || locked ? <View style={[styles.frameLocked, locked && styles.frameDone]} /> : null}
            {locked ? (
              <View style={styles.check}>
                <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color.ink} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M5 12.5l4.5 4.5L19 7.5" />
                </Svg>
              </View>
            ) : null}
            {['tl', 'tr', 'bl', 'br'].map((c) => (
              <View key={c} style={[styles.corner, corner(c)]} />
            ))}
          </View>
          <View style={[styles.scrim, { flex: 1 }]} />
        </View>
        <View style={[styles.scrim, { flex: 1 }]} />
      </View>

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

      <View style={[styles.below, { top: frameTop + frameH + space.xl }]}>
        <View style={styles.hint}>
          <Text style={[type.text, { color: color.onInk, textAlign: 'center' }]}>{hint}</Text>
        </View>
        {!canUseCamera ? (
          <View style={styles.manual}>
            {Platform.OS !== 'web' && permission && !permission.granted ? (
              <Pressable
                accessibilityRole="button"
                onPress={denied ? () => Linking.openSettings() : requestPermission}
                style={({ pressed }) => [styles.lightButton, pressed && { opacity: 0.8 }]}
              >
                <Text style={[type.button, { color: color.ink }]}>{denied ? 'Turn on camera in Settings' : 'Allow camera'}</Text>
              </Pressable>
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

      {canUseCamera && LabelReader && !result ? (
        <View style={[styles.capture, { paddingBottom: insets.bottom + space.l }]}>
          <Pressable
            accessibilityRole="button"
            onPress={() => capture(true)}
            disabled={reading}
            style={({ pressed }) => [styles.lightButton, (pressed || reading) && { opacity: 0.7 }]}
          >
            <Text style={[type.button, { color: color.ink }]}>{reading ? 'Reading…' : 'Read label'}</Text>
          </Pressable>
        </View>
      ) : null}

      {result ? (
        <Animated.View
          style={[
            styles.sheet,
            { paddingBottom: insets.bottom + space.l },
            { transform: [{ translateY: sheetIn.interpolate({ inputRange: [0, 1], outputRange: [win.height * 0.6, 0] }) }] },
          ]}
        >
          <View style={styles.grabber} />
          {result.status === 'found' && preview ? (
            <>
              {gradeMissing ? (
                <View style={styles.unsure}>
                  <Text style={[type.text, { color: color.secondary, flex: 1 }]}>Couldn’t read the grade. Check it before adding.</Text>
                  <Pressable accessibilityRole="button" onPress={rescan} hitSlop={space.m}>
                    <Text style={[type.text, { color: color.ink, fontWeight: '500' }]}>Scan again</Text>
                  </Pressable>
                </View>
              ) : (
              <Text style={[type.text, { color: color.gain, fontWeight: '500' }]}>
                {result.source === 'mock'
                  ? `Cert ${result.cert} · sample data`
                  : result.source === 'label'
                    ? result.cert
                      ? `Read from the label · cert ${result.cert}`
                      : 'Read from the label'
                    : `✓ Cert ${result.cert} verified with PSA`}
              </Text>
              )}
              <View style={styles.cardRow}>
                {/* The real slab, label and all (the 36×50 row thumb's grey strip read as a cut-off top). */}
                <SlabView card={preview} width={size.sheetSlabW} posed={false} />
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
                  ? 'PSA’s daily lookup limit is used up. Slabby can read the front label instead.'
                  : LabelReader
                    ? 'Turn the slab over and Slabby will read the front label instead.'
                    : 'Check the number on the label, or add the details by hand.'}
              </Text>
              {LabelReader ? (
                <PrimaryButton title="Read front label" onPress={toLabel} />
              ) : (
                <PrimaryButton
                  title="Add details by hand"
                  onPress={() => router.push({ pathname: '/add', params: { cert: result.cert } })}
                />
              )}
              <Pressable accessibilityRole="button" onPress={rescan} style={styles.quiet}>
                <Text style={[type.text, { color: color.secondary }]}>Scan again</Text>
              </Pressable>
            </>
          )}
        </Animated.View>
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
  lightButton: {
    height: size.button,
    borderRadius: radius.button,
    backgroundColor: color.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  capture: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: space.gutter },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.s },
  quiet: { minHeight: size.touch, alignItems: 'center', justifyContent: 'center', marginTop: space.s },
  navBtn: { width: size.touch, height: size.touch, alignItems: 'center', justifyContent: 'center' },
  scrim: { backgroundColor: color.scanScrim },
  below: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: space.gutter },
  hint: {
    maxWidth: '100%',
    backgroundColor: color.scanHint,
    borderRadius: radius.button,
    paddingHorizontal: space.l,
    paddingVertical: space.s,
  },
  corner: { position: 'absolute', width: 24, height: 24, borderColor: color.conFill, borderRadius: 4 },
  labelLine: { position: 'absolute', left: space.s, right: space.s, height: size.hairline, backgroundColor: color.scanGuide },
  frameDone: { borderWidth: 3, backgroundColor: color.scanLocked },
  check: {
    position: 'absolute',
    alignSelf: 'center',
    top: '50%',
    marginTop: -20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: color.conFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unsure: { flexDirection: 'row', alignItems: 'center', gap: space.m },
  frameLocked: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderWidth: 2, borderColor: color.conFill, borderRadius: 6 },
  manual: { width: '100%', paddingTop: space.xxl, gap: space.m },
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
