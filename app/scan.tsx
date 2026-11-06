// Scan: point at the front label. Slabby reads a frame about once a second on device (Apple Vision)
// and opens the sheet once two reads in a row agree (label in frame, held steady); "Read label"
// reads right away as the manual fallback. → sheet → "Add to vault". Opened from con mode (con=1), the sheet asks
// Hold / For sale / Trade only / Sold instead of Hold / Sell; Sold takes the sale price right here. "Add and scan
// another" keeps the camera up for a batch; closing goes back to con mode on the tab of the last slab added. No PSA call on this path:
// PSA's API is closed to us for now, so label reading is the default. The QR → PSA lookup only runs where the label reader isn't built in
// (web, Expo Go). Reference: 02-scan.png. As soon as a scan resolves, card-match runs for the card
// (photo + first comps), so a quick scan at a table shows art and market without adding anything.
// Adding (vault or con mode) then saves what the sheet already fetched; card-match isn't asked twice.

import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState, Keyboard, Linking, Platform, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { CardThumb } from '../src/components/CardThumb';
import { backToCon } from '../src/components/conStatusMenu';
import { KEYBOARD_DONE, KeyboardDone, useKeyboardHeight } from '../src/components/KeyboardDone';
import { Segmented } from '../src/components/Segmented';
import { Hairline, PrimaryButton } from '../src/components/ui';
import { CON_STATUSES, CON_STATUS_LABEL, planPatch, type ConStatus } from '../src/lib/conStatus';
import { DEFAULT_CON_NAME, useCon } from '../src/store/con';
import { gradeLabel, money, rowTitle } from '../src/lib/format';
import { GAMES, LANGUAGE_NAME, gameOf } from '../src/lib/games';
import { cardFromCert, lookupCert, parseCertFromQr, type CertResult } from '../src/services/psa';
import { artFor, matchNewCard, priceFor, refreshPrices, type CardRef } from '../src/services/comps';
import { supabase } from '../src/services/supabase';
import { cardKey } from '../src/pricing/cardKey';
import { usePrices } from '../src/store/prices';
import { parseLabel, steadyKey, type ParsedLabel } from '../src/services/label';
import { useVault } from '../src/store/vault';
import { LabelReader } from '../modules/label-reader';
import { color, radius, size, space, type } from '../src/theme/tokens';

const SCAN_BG = '#2A2A2C'; // camera chrome only; never used on app UI
const AUTO_START_MS = 700; // let exposure and focus settle first
const AUTO_GAP_MS = 350; // between auto reads; each read itself takes ~0.5–1 s
const NAV_H = 44;
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
  const fromCon = useLocalSearchParams<{ con?: string }>().con === '1';
  const [conStatus, setConStatusChoice] = useState<ConStatus>('sale');
  const [soldFor, setSoldFor] = useState('');
  const [lossConfirm, setLossConfirm] = useState(false);
  /** Con batch: the last slab added, so closing lands on its tab; and a short "Added" line. */
  const [lastAdded, setLastAdded] = useState<{ id: string; status: ConStatus } | null>(null);
  const [addedNote, setAddedNote] = useState('');
  const update = useVault((s) => s.update);
  const session = useCon((s) => s.session);
  const startCon = useCon((s) => s.start);
  const add = useVault((s) => s.add);
  const existing = useVault((s) => s.cards);
  const lastCert = useRef<string | null>(null);
  const camera = useRef<CameraView>(null);
  const [reading, setReading] = useState(false);
  const [labelMiss, setLabelMiss] = useState(false);
  const [seen, setSeen] = useState('');
  // The sheet sits on the bottom edge; lift it above the number pad while typing what you paid.
  const keyboardH = useKeyboardHeight();
  const [cameraReady, setCameraReady] = useState(false);
  const [active, setActive] = useState(AppState.currentState === 'active');
  // A label was read once and we're waiting for a second matching read.
  const [spotted, setSpotted] = useState(false);
  const inFlight = useRef(false);
  const manualAsk = useRef(false);
  const lastKey = useRef<string | null>(null);
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
  const previewKey = preview ? cardKey(preview) : null;
  // Re-render when this card's comps land in the store.
  const livePrice = usePrices((s) => (previewKey ? s.byKey[previewKey] : undefined));
  const price = preview ? (livePrice ?? priceFor(preview)) : null;

  // Match the scanned card right away: photo, then prices. One card-match call per scan; Add reuses it.
  const [matched, setMatched] = useState<{ key: string; art: string | null } | null>(null);
  const [matching, setMatching] = useState(false);
  const match = useRef<{ key: string; done: Promise<CardRef | null> } | null>(null);
  useEffect(() => {
    if (!preview || !previewKey || !supabase) return;
    // A second read of the same card reuses the call already made.
    if (match.current?.key !== previewKey) {
      const card = preview;
      const done = matchNewCard(card)
        .catch(() => null)
        .then(async (ref) => {
          if (ref) await refreshPrices([card]).catch(() => {});
          return ref;
        });
      match.current = { key: previewKey, done };
    }
    let live = true;
    setMatching(true);
    match.current.done.then((ref) => {
      if (!live) return;
      setMatched({ key: previewKey, art: artFor(ref) });
      setMatching(false);
    });
    return () => {
      live = false;
    };
  }, [previewKey]);
  const art = matched && matched.key === previewKey ? matched.art : null;
  const shown = preview && art ? { ...preview, imageFrontUrl: art } : preview;
  const owned = preview?.certNumber ? existing.find((c) => c.certNumber === preview.certNumber && c.status === 'owned') : undefined;
  const already = !!owned;

  const paidDollars = parseInt(paid.replace(/[^0-9]/g, ''), 10);
  const paidCents = Number.isFinite(paidDollars) ? paidDollars * 100 : (owned?.paidCents ?? null);
  const soldCents = (parseInt(soldFor || '0', 10) || 0) * 100;
  const soldLoss = conStatus === 'sold' && paidCents != null && soldCents > 0 && soldCents < paidCents ? paidCents - soldCents : 0;

  // The sheet's match is reused (when it lands, matchNewCard puts the photo on this vault card).
  // Only a call that failed outright (offline, no session) is made again; that costs no credit.
  const addedMatch = (card: ReturnType<typeof cardFromCert>) => {
    const pending = match.current?.key === cardKey(card) ? match.current.done : Promise.resolve(null);
    pending
      .then((ref) => ref ?? matchNewCard(card))
      .then(() => refreshPrices([card]))
      .catch(() => {});
  };

  const addToVault = () => {
    if (result?.status !== 'found') return;
    const card = cardFromCert(result.payload, { paidCents, plan });
    if (art) card.imageFrontUrl = art;
    add(card);
    addedMatch(card);
    router.replace(`/card/${card.id}`);
  };

  const rescan = () => {
    lastCert.current = null;
    lastKey.current = null;
    setSpotted(false);
    match.current = null;
    setLabelMiss(false);
    setResult(null);
    setPaid('');
    setSoldFor('');
    setLossConfirm(false);
  };

  /** Con mode: add (or re-mark) the slab with the chosen status. `again` keeps the camera up. */
  const addForCon = (again: boolean) => {
    if (result?.status !== 'found') return;
    if (conStatus === 'sold' && !soldCents) return;
    if (soldLoss > 0 && !lossConfirm) {
      setLossConfirm(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      return;
    }
    Keyboard.dismiss();
    let id = owned?.id;
    if (!owned) {
      const card = cardFromCert(result.payload, { paidCents, plan: conStatus === 'sold' ? 'sell' : planPatch(conStatus).plan });
      if (art) card.imageFrontUrl = art;
      add(card);
      addedMatch(card);
      id = card.id;
    } else if (conStatus !== 'sold') {
      update(owned.id, planPatch(conStatus));
    }
    if (!id) return;
    if (conStatus === 'sold') {
      let where = session?.name ?? null;
      if (!session) {
        startCon(DEFAULT_CON_NAME);
        where = DEFAULT_CON_NAME;
      }
      update(id, { status: 'sold', soldCents, soldAt: new Date().toISOString(), soldWhere: where });
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (again) {
      setLastAdded({ id, status: conStatus });
      setAddedNote(`Added · ${CON_STATUS_LABEL[conStatus]}`);
      rescan();
    } else {
      backToCon(conStatus, id);
    }
  };

  const close = () => (fromCon && lastAdded ? backToCon(lastAdded.status, lastAdded.id) : router.back());

  const accept = (parsed: ParsedLabel) => {
    const cert = result?.cert ?? lastCert.current ?? parsed.payload.PSACert.CertNumber;
    parsed.payload.PSACert.CertNumber = cert ?? '';
    lastCert.current = cert || null;
    lastKey.current = null;
    setSpotted(false);
    setLabelMiss(false);
    setResult({ status: 'found', cert: cert ?? '', payload: parsed.payload, source: 'label' });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
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
      if (asked) {
        if (parsed?.payload.PSACert.Subject) return accept(parsed);
        setSeen(lines.slice(0, 4).map((l) => l.text).join(' · '));
        setLabelMiss(true);
        lastKey.current = null;
        setSpotted(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        return;
      }
      const key = steadyKey(parsed);
      if (!key || !parsed) {
        lastKey.current = null;
        setSpotted(false);
      } else if (key === lastKey.current) {
        accept(parsed);
      } else {
        if (!lastKey.current) Haptics.selectionAsync().catch(() => {});
        lastKey.current = key;
        setSpotted(true);
        setLabelMiss(false);
      }
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
  const autoOn = labelMode && !!canUseCamera && cameraReady && active && !result;
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
      lastKey.current = null;
      setSpotted(false);
    };
  }, [autoOn]);

  // Label-shaped window (PSA labels are about 3:1). The picture outside it is dimmed.
  const frameW = labelMode ? Math.min(win.width - space.xxxl * 2 + space.l, 340) : 240;
  const frameH = labelMode ? Math.round(frameW / 2.9) : frameW;
  const frameTop = insets.top + space.s + NAV_H + space.xxxl;
  const hint = busy
    ? 'Checking with PSA'
    : reading
      ? 'Reading the label'
      : labelMiss
        ? seen
          ? `Couldn’t find a PSA label in “${seen.slice(0, 80)}”. Fit the label in the frame and hold steady.`
          : 'Couldn’t read any text. Move closer so the label fills the frame.'
        : spotted
          ? 'Hold still'
          : addedNote
            ? `${addedNote}. Scan the next slab`
            : labelMode
              ? 'Fit the front label in the frame'
              : 'Line up the QR or barcode on the back of the slab';

  return (
    <View style={{ flex: 1, backgroundColor: SCAN_BG }}>
      {canUseCamera ? (
        <CameraView
          ref={camera}
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torch}
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
            {spotted ? <View style={styles.frameLocked} /> : null}
            {['tl', 'tr', 'bl', 'br'].map((c) => (
              <View key={c} style={[styles.corner, corner(c)]} />
            ))}
          </View>
          <View style={[styles.scrim, { flex: 1 }]} />
        </View>
        <View style={[styles.scrim, { flex: 1 }]} />
      </View>

      <View style={[styles.nav, { paddingTop: insets.top + space.s }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={close} style={styles.navBtn}>
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
                  inputAccessoryViewID={KEYBOARD_DONE}
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

      {result && keyboardH > 0 ? (
        // Tap above the sheet to close the number pad.
        <Pressable accessibilityLabel="Close keyboard" style={StyleSheet.absoluteFill} onPress={() => Keyboard.dismiss()} />
      ) : null}

      {result ? (
        <View style={[styles.sheet, keyboardH > 0 ? { bottom: keyboardH, paddingBottom: space.l } : { paddingBottom: insets.bottom + space.l }]}>
          <View style={styles.grabber} />
          {result.status === 'found' && preview ? (
            <>
              <Text style={[type.text, { color: color.gain, fontWeight: '500' }]}>
                {result.source === 'mock'
                  ? `Cert ${result.cert} · sample data`
                  : result.source === 'label'
                    ? result.cert
                      ? `Read from the label · cert ${result.cert}`
                      : 'Read from the label'
                    : `✓ Cert ${result.cert} verified with PSA`}
              </Text>
              <View style={styles.cardRow}>
                <CardThumb card={shown ?? preview} />
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={[type.title, { color: color.ink }]}>
                    {rowTitle(preview)}
                  </Text>
                  <Text style={[type.text, { color: color.secondary }]}>
                    {[gameOf(preview) === 'pokemon' ? null : GAMES[gameOf(preview)].name, LANGUAGE_NAME[preview.language] ?? preview.language, gradeLabel(preview.grader, preview.grade)]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[type.displayS, { color: color.ink, fontSize: 26 }]}>{price ? money(price.marketCents) : '—'}</Text>
                  <Text style={[type.secondary, { color: color.secondary }]}>
                    {price ? 'market' : matching ? 'finding comps' : 'no comps yet'}
                  </Text>
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
                  inputAccessoryViewID={KEYBOARD_DONE}
                  style={[type.rowPrice, styles.paidInput]}
                  accessibilityLabel="What you paid"
                />
              </View>
              <Hairline />
              <View style={styles.field}>
                {fromCon ? (
                  <Segmented<ConStatus>
                    style={{ flex: 1 }}
                    value={conStatus}
                    onChange={(v) => {
                      setLossConfirm(false);
                      setConStatusChoice(v);
                    }}
                    options={CON_STATUSES.map((v) => ({ value: v, label: CON_STATUS_LABEL[v] }))}
                  />
                ) : (
                  <Text style={[type.body, { color: color.ink }]}>Plan</Text>
                )}
                {fromCon ? null : (
                  <Segmented
                    style={{ width: 150 }}
                    value={plan}
                    onChange={setPlan}
                    options={[
                      { value: 'hold', label: 'Hold' },
                      { value: 'sell', label: 'Sell' },
                    ]}
                  />
                )}
              </View>
              {fromCon && conStatus === 'sold' ? (
                <>
                  <Hairline />
                  <View style={styles.field}>
                    <Text numberOfLines={1} style={[type.body, { color: color.ink, flexShrink: 0 }]}>Sold for</Text>
                    <TextInput
                      value={soldFor ? `$${soldFor}` : ''}
                      onChangeText={(t) => {
                        setLossConfirm(false);
                        setSoldFor(t.replace(/[^0-9]/g, '').replace(/^0+/, '').slice(0, 6));
                      }}
                      placeholder="$0"
                      placeholderTextColor={color.secondary}
                      keyboardType="number-pad"
                      inputAccessoryViewID={KEYBOARD_DONE}
                      autoFocus
                      style={[type.rowPrice, styles.paidInput]}
                      accessibilityLabel="Sold for"
                    />
                  </View>
                </>
              ) : null}
              <Hairline />
              {fromCon ? (
                <>
                  <PrimaryButton
                    style={{ marginTop: space.l, opacity: conStatus === 'sold' && !soldCents ? 0.35 : 1 }}
                    title={conButtonTitle(conStatus, soldCents, !!owned)}
                    onPress={() => addForCon(false)}
                  />
                  <Pressable accessibilityRole="button" onPress={() => addForCon(true)} style={styles.quiet}>
                    <Text style={[type.body, { color: color.ink }]}>
                      {lossConfirm ? `Tap again to sell at a ${money(soldLoss)} loss` : owned ? 'Save and scan another' : 'Add and scan another'}
                    </Text>
                  </Pressable>
                </>
              ) : (
                <PrimaryButton
                  style={{ marginTop: space.l }}
                  title={already ? 'Already in your vault' : 'Add to vault'}
                  onPress={already ? () => router.back() : addToVault}
                />
              )}
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
        </View>
      ) : null}
      <KeyboardDone />
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

function conButtonTitle(s: ConStatus, soldCents: number, owned: boolean): string {
  if (s === 'sold') return soldCents ? `Sold for ${money(soldCents)}` : 'Type the sale price';
  if (owned) return s === 'hold' ? 'Already yours · move to holds' : `Already yours · mark ${CON_STATUS_LABEL[s].toLowerCase()}`;
  return s === 'hold' ? 'Add to holds' : s === 'sale' ? 'Add for sale' : 'Add as trade only';
}

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
