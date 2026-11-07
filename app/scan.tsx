// Scan: point at the front label. Slabby reads a frame about once a second on device (Apple Vision)
// and opens the sheet once two reads in a row agree (label in frame, held steady); "Read label"
// reads right away as the manual fallback. → sheet → "Add to vault". Opened from con mode (con=1), the sheet asks
// Hold / For sale / Trade only / Sold instead of Hold / Sell; Sold takes the sale price right here. "Add and scan
// another" keeps the camera up for a batch; closing goes back to con mode on the tab of the last slab added. No PSA call on this path:
// PSA's API is closed to us for now, so label reading is the default. The QR → PSA lookup only runs where the label reader isn't built in
// (web, Expo Go). Reference: 02-scan.png. As soon as a scan resolves, card-match runs for the card
// (photo + first comps), so a quick scan at a table shows art and market without adding anything.
// Adding (vault or con mode) then saves what the sheet already fetched; card-match isn't asked twice.
//
// Raw cards scan on the same screen, from the same reads: a frame with a grader label is a slab;
// a frame with a collector number ("199/165") and no label is a loose card, found in our TCGplayer
// catalog by number, set code and name (src/services/cardScan.ts) and priced at TCGplayer market.
//
// Sell: picking Sell on either sheet asks what you want for it (AskStep), then opens the card's
// full page in sell mode (app/search/[id].tsx ?sell=1, or app/sell.tsx when the card isn't in our
// catalog) with where that ask sits against market and a rating against what you paid. "What you
// paid" also takes "Pulled it" (rated against the set's pack price, else $0) or "Not sure".
// After an add the camera stays up for the next card, with a line at the top to open the one just added; X closes.

import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, AppState, Easing, Keyboard, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { backToCon } from '../src/components/conStatusMenu';
import { KEYBOARD_DONE, KeyboardDone, useKeyboardHeight } from '../src/components/KeyboardDone';
import { SlabView } from '../src/components/SlabView';
import { AskStep } from '../src/components/sell/AskStep';
import { CostField, EMPTY_COST, paidCentsOf, toCost, type CostInput } from '../src/components/sell/CostField';
import { ask as ruleAsk } from '../src/pricing/rules';
import { useRules } from '../src/store/rules';
import { useSellDraft, type SellDraft } from '../src/store/sellDraft';
import { Segmented } from '../src/components/Segmented';
import { Hairline, PrimaryButton } from '../src/components/ui';
import { CON_STATUSES, CON_STATUS_LABEL, planPatch, type ConStatus } from '../src/lib/conStatus';
import { DEFAULT_CON_NAME, useCon } from '../src/store/con';
import { gradeLabel, money, rowTitle } from '../src/lib/format';
import { GAMES, LANGUAGE_NAME, gameOf } from '../src/lib/games';
import { cardFromCert, cardFromDetails, lookupCert, parseCertFromQr, type CertResult } from '../src/services/psa';
import { cardSteadyKey, findScannedCard, isConfident, looksLikeSlab, parseCardText, printOptions, type CardMatch, type ParsedCard } from '../src/services/cardScan';
import { cardNumber, displayName, mockProductId, type CatalogCard } from '../src/services/search';
import { artFor, matchNewCard, priceFor, refreshPrices, type CardRef } from '../src/services/comps';
import { supabase } from '../src/services/supabase';
import { cardKey } from '../src/pricing/cardKey';
import { usePrices } from '../src/store/prices';
import { parseLabel, stepAutoRead, type AutoRead, type ParsedLabel } from '../src/services/label';
import { useVault } from '../src/store/vault';
import { LabelReader } from '../modules/label-reader';
import type { Card } from '../src/types';
import { color, radius, size, space, type } from '../src/theme/tokens';

const SCAN_BG = '#2A2A2C'; // camera chrome only; never used on app UI
const AUTO_START_MS = 700; // let exposure and focus settle first
const AUTO_GAP_MS = 350; // between auto reads; each read itself takes ~0.5–1 s
const NAV_H = 44;
// The label band at the top of a PSA slab, as a share of its height.
const LABEL_SHARE = 0.2;
const LOCK_MS = 450; // the locked frame and its check stay up this long before the sheet rises
const SHEET_IN_MS = 260;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A read's identity: the cert, else name and grade. */
const readId = (p: ParsedLabel) => {
  const c = p.payload.PSACert;
  return c.CertNumber || `${(c.Subject ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')}|${c.CardGrade ?? ''}`;
};

export default function Scan() {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [result, setResult] = useState<CertResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState('');
  const [cost, setCost] = useState<CostInput>(EMPTY_COST);
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
  // Sell picked: the sheet asks for a price before opening the sell page.
  const [asking, setAsking] = useState(false);
  const add = useVault((s) => s.add);
  const rules = useRules((s) => s.rules);
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
  // The read succeeded: the frame closes solid with a check for a beat, then the sheet rises.
  const [locked, setLocked] = useState(false);
  const sheetIn = useRef(new Animated.Value(0)).current;
  const inFlight = useRef(false);
  const manualAsk = useRef(false);
  const lastKey = useRef<string | null>(null);
  // A loose card read from the frame: matches is null while the catalog lookup runs.
  const [raw, setRaw] = useState<RawRead | null>(null);
  // What auto-read has gathered so far for the card in frame (fields merge across frames).
  const auto = useRef<AutoRead>(null);
  // The last card read. Once it's in the vault, auto-read ignores it, so the slab just added (and
  // still in frame after the sheet closes) isn't read again. A tap still reads it.
  const lastRead = useRef<string | null>(null);
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
  // A label read without its grade number can't be priced: a gradeless PSA card fell back to the
  // raw price ($5 for a PSA 10 Surfing Pikachu). Show no price and say what's missing instead.
  const gradeMissing = !!preview && preview.grader !== 'raw' && preview.grade == null;
  const price = preview && !gradeMissing ? (livePrice ?? priceFor(preview)) : null;

  // Match the scanned card right away: photo, then prices. One card-match call per scan; Add reuses it.
  const [matched, setMatched] = useState<{ key: string; art: string | null; productId: number | null } | null>(null);
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
      const pid = ref?.tcgplayer_id ? Number(ref.tcgplayer_id) : NaN;
      setMatched({ key: previewKey, art: artFor(ref), productId: Number.isFinite(pid) ? pid : null });
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
  // Copies of this card (same card, grader and grade) already in the vault, whatever their cert.
  const copies = previewKey ? existing.filter((c) => c.status === 'owned' && cardKey(c) === previewKey).length : 0;
  // The same cert twice is almost always a re-scan, so Add asks once before saving it again.
  const [confirmAgain, setConfirmAgain] = useState(false);
  /** The last slab added on this visit, and how many so far. */
  const [added, setAdded] = useState<{ id: string; title: string; count: number } | null>(null);
  useEffect(() => setConfirmAgain(false), [previewKey]);

  // Con mode: what you paid from the cost field, else what the vault already has for this cert.
  const paidCents = paidCentsOf(cost) ?? owned?.paidCents ?? null;
  const soldCents = (parseInt(soldFor || '0', 10) || 0) * 100;
  const soldLoss = conStatus === 'sold' && paidCents != null && soldCents > 0 && soldCents < paidCents ? paidCents - soldCents : 0;

  // The sheet's match is reused once the card is saved (from here or from the sell page).
  const afterSave = (card: Card) => {
    const pending = match.current?.key === cardKey(card) ? match.current.done : Promise.resolve(null);
    pending
      .then((ref) => ref ?? matchNewCard(card))
      .then(() => refreshPrices([card]))
      .catch(() => {});
  };

  const addToVault = () => {
    if (result?.status !== 'found') return;
    const card = cardFromCert(result.payload, { paidCents: paidCentsOf(cost), plan });
    if (art) card.imageFrontUrl = art;
    add(card);
    afterSave(card);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setAdded((a) => ({ id: card.id, title: rowTitle(card), count: (a?.count ?? 0) + 1 }));
    setManual('');
    rescan();
  };

  const startSell = useSellDraft((s) => s.start);
  const toSell = (askCents: number) => {
    if (result?.status !== 'found') return;
    const card = cardFromCert(result.payload, { paidCents: paidCentsOf(cost), plan: 'sell' });
    if (art) card.imageFrontUrl = art;
    const productId = (matched?.key === previewKey ? matched.productId : null) ?? mockProductId(card);
    openSell({ card, productId, marketCents: price?.marketCents ?? null, askCents, cost: toCost(cost), afterSave }, startSell);
  };

  const rescan = () => {
    lastCert.current = null;
    auto.current = null;
    lastKey.current = null;
    setSpotted(false);
    match.current = null;
    setConfirmAgain(false);
    setAsking(false);
    setLabelMiss(false);
    setResult(null);
    setCost(EMPTY_COST);
    setSoldFor('');
    setLossConfirm(false);
    setRaw(null);
  };

  const acceptCard = (read: ParsedCard) => {
    lastKey.current = null;
    setSpotted(false);
    setLabelMiss(false);
    setRaw({ read, matches: null, pick: 0, choosing: false });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    findScannedCard(read)
      .catch(() => [] as CardMatch[])
      .then((matches) => setRaw((r) => (r && r.read === read ? { ...r, matches, choosing: matches.length > 1 && !isConfident(matches) } : r)));
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
      afterSave(card);
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
    auto.current = null;
    lastRead.current = readId(parsed);
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
      // A grader label means slab. Otherwise a collector number means a loose card. Raw cards print
      // "©2023 Pokémon", which can pass for a label's year and brand, so the number decides.
      const slabbed = looksLikeSlab(lines);
      const loose = slabbed ? null : parseCardText(lines);
      const asked = manualAsk.current;
      // Slab reads gather across frames; a loose card's frame doesn't feed the slab reader.
      const step = stepAutoRead(auto.current, slabbed || !loose ? parsed : null);
      if (asked) {
        // A tap takes whatever is readable, topped up with what earlier frames saw of the same card.
        const best = step.ready ?? step.state?.label ?? parsed;
        if (best?.payload.PSACert.Subject && (slabbed || !loose)) return accept(best);
        if (loose) return acceptCard(loose);
        setSeen(lines.slice(0, 4).map((l) => l.text).join(' · '));
        setLabelMiss(true);
        auto.current = null;
        setSpotted(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        return;
      }
      if (loose && !step.state) {
        // A loose card: two matching reads of its number in a row add it.
        auto.current = step.state;
        const key = cardSteadyKey(loose);
        if (!key) {
          lastKey.current = null;
          setSpotted(false);
        } else if (key === lastKey.current) {
          acceptCard(loose);
        } else {
          if (!lastKey.current) Haptics.selectionAsync().catch(() => {});
          lastKey.current = key;
          setSpotted(true);
          setLabelMiss(false);
        }
        return;
      }
      lastKey.current = null;
      if (step.ready && justAdded(step.ready)) {
        auto.current = null;
        setSpotted(false);
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
  // The card auto-read just read, now owned (cert match), or with no cert to check by.
  const justAdded = (p: ParsedLabel) => {
    if (readId(p) !== lastRead.current) return false;
    const cert = p.payload.PSACert.CertNumber;
    return !cert || useVault.getState().cards.some((c) => c.certNumber === cert && c.status === 'owned');
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
  const autoOn = labelMode && !!canUseCamera && cameraReady && active && !result && !raw && !locked;

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
      lastKey.current = null;
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
      ? 'Reading'
      : labelMiss
        ? seen
          ? `Couldn’t find a slab label or card number in “${seen.slice(0, 80)}”. Fit the slab or card in the frame and hold steady.`
          : 'Couldn’t read any text. Move closer so the slab or card fills the frame.'
        : spotted
          ? 'Hold still'
          : addedNote
            ? `${addedNote}. Scan the next slab`
            : added
              ? `${added.count} added. Scan the next card`
            : labelMode
              ? 'Fit the slab or card in the frame'
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
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={close} style={styles.navBtn}>
          <Svg width={22} height={22} viewBox="0 0 24 24" stroke={color.onInk} strokeWidth={2} strokeLinecap="round">
            <Path d="M5 5l14 14M19 5L5 19" />
          </Svg>
        </Pressable>
        <Text style={[type.body, { color: color.onInk }]}>Scan</Text>
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
        {added ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Added ${added.title}. Open it`}
            onPress={() => router.push(`/card/${added.id}`)}
            style={({ pressed }) => [styles.added, pressed && { opacity: 0.7 }]}
          >
            <Text numberOfLines={1} style={[type.text, { color: color.onInk, flex: 1 }]}>
              Added · {added.title}
            </Text>
            <Text style={[type.text, { color: color.onInk, fontWeight: '600' }]}>View</Text>
          </Pressable>
        ) : null}
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

      {canUseCamera && LabelReader && !result && !raw ? (
        <View style={[styles.capture, { paddingBottom: insets.bottom + space.l }]}>
          <Pressable
            accessibilityRole="button"
            onPress={() => capture(true)}
            disabled={reading}
            style={({ pressed }) => [styles.lightButton, (pressed || reading) && { opacity: 0.7 }]}
          >
            <Text style={[type.button, { color: color.ink }]}>{reading ? 'Reading…' : 'Scan now'}</Text>
          </Pressable>
        </View>
      ) : null}

      {(result || raw) && keyboardH > 0 ? (
        // Tap above the sheet to close the number pad.
        <Pressable accessibilityLabel="Close keyboard" style={StyleSheet.absoluteFill} onPress={() => Keyboard.dismiss()} />
      ) : null}

      {raw ? <RawSheet raw={raw} setRaw={setRaw} rescan={rescan} bottom={insets.bottom} keyboardH={keyboardH} /> : null}

      {result ? (
        <Animated.View
          style={[
            styles.sheet,
            keyboardH > 0 ? { bottom: keyboardH, paddingBottom: space.l } : { paddingBottom: insets.bottom + space.l },
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
                <SlabView card={shown ?? preview} width={size.sheetSlabW} posed={false} />
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
                    {price
                      ? 'market'
                      : gameOf(preview) === 'pokemon' && preview.language !== 'en' && preview.language !== 'ja'
                        ? 'no price source yet'
                        : matching
                          ? 'finding comps'
                          : 'no comps yet'}
                  </Text>
                </View>
              </View>
              {already || copies ? (
                <Text style={[type.text, { color: color.secondary, paddingBottom: space.m }]}>
                  {already
                    ? copies > 1
                      ? `This slab is already in your vault. You have ${copies} of this card.`
                      : 'This slab is already in your vault.'
                    : `You already have ${copies} of this card. This would be your ${ordinal(copies + 1)}.`}
                </Text>
              ) : null}
              <Hairline />
              {fromCon ? (
                <>
                  <CostField value={cost} onChange={setCost} />
                  <Hairline />
                  <View style={styles.field}>
                  <Segmented<ConStatus>
                    style={{ flex: 1 }}
                    value={conStatus}
                    onChange={(v) => {
                      setLossConfirm(false);
                      setConStatusChoice(v);
                    }}
                    options={CON_STATUSES.map((v) => ({ value: v, label: CON_STATUS_LABEL[v] }))}
                  />
                  </View>
              {conStatus === 'sold' ? (
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
              ) : asking ? (
                <View style={{ paddingTop: space.l }}>
                  <AskStep
                    marketCents={price?.marketCents ?? null}
                    suggestedCents={price ? ruleAsk({ marketCents: price.marketCents, low30Cents: price.lowCents, rules }) : null}
                    onContinue={toSell}
                    onBack={() => setAsking(false)}
                  />
                </View>
              ) : (
                <>
                  <CostField value={cost} onChange={setCost} />
                  <Hairline />
                  <View style={styles.field}>
                    <Text style={[type.body, { color: color.ink }]}>Plan</Text>
                    <Segmented
                      style={{ width: 150 }}
                      value={plan}
                      onChange={(v) => {
                        setPlan(v);
                        if (v === 'sell') setAsking(true);
                      }}
                      options={[
                        { value: 'hold', label: 'Hold' },
                        { value: 'sell', label: 'Sell' },
                      ]}
                    />
                  </View>
                  <Hairline />
                  {confirmAgain ? (
                    <>
                      <Text style={[type.body, { color: color.ink, paddingTop: space.l }]}>
                        {result.cert ? `Cert ${result.cert} is already in your vault.` : 'This slab is already in your vault.'} Add it
                        again?
                      </Text>
                      <PrimaryButton style={{ marginTop: space.l }} title="Add again" onPress={addToVault} />
                      <Pressable accessibilityRole="button" onPress={() => setConfirmAgain(false)} style={styles.quiet}>
                        <Text style={[type.text, { color: color.secondary }]}>Cancel</Text>
                      </Pressable>
                    </>
                  ) : plan === 'sell' ? (
                    <PrimaryButton style={{ marginTop: space.l }} title="Set your price" onPress={() => setAsking(true)} />
                  ) : (
                    <PrimaryButton
                      style={{ marginTop: space.l }}
                      title="Add to vault"
                      onPress={already ? () => setConfirmAgain(true) : addToVault}
                    />
                  )}
                </>
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
        </Animated.View>
      ) : null}
      <KeyboardDone />
    </View>
  );
}

type RawRead = { read: ParsedCard; matches: CardMatch[] | null; pick: number; choosing: boolean };

/**
 * A loose card as it would be saved: raw, priced at TCGplayer market. A print the scan can't see
 * (reverse holo, 1st Edition…) goes in the name the way TCGplayer names its pattern cards.
 */
function rawCard(c: CatalogCard, paidCents: number | null, plan: 'hold' | 'sell', print: string | null = null): Card {
  const card = cardFromDetails({
    cert: null,
    grader: 'raw',
    grade: 0,
    name: print ? `${displayName(c.name)} (${print})` : displayName(c.name),
    setName: c.setName,
    setCode: c.setCode,
    number: cardNumber(c.number),
    language: c.language === 'ja' ? 'ja' : 'en',
    paidCents,
    plan,
    imageFrontUrl: c.imageUrl,
    game: c.game,
  });
  return { ...card, grade: null };
}

/** Result sheet for a loose card: the best catalog match, or a short pick list when it's unclear. */
function RawSheet({
  raw,
  setRaw,
  rescan,
  bottom,
  keyboardH,
}: {
  raw: RawRead;
  setRaw: (f: (r: RawRead | null) => RawRead | null) => void;
  rescan: () => void;
  bottom: number;
  keyboardH: number;
}) {
  const [cost, setCost] = useState<CostInput>(EMPTY_COST);
  const [plan, setPlan] = useState<'hold' | 'sell'>('hold');
  const [asking, setAsking] = useState(false);
  const add = useVault((s) => s.add);
  const owned = useVault((s) => s.cards);
  const rules = useRules((s) => s.rules);
  const startSell = useSellDraft((s) => s.start);
  const n = raw.read.numbers[0];
  const printed = n.total ? `${n.num}/${n.total}` : n.num;
  const best = raw.matches?.[raw.pick]?.card ?? null;
  // Print: null is the catalog's own (base) printing. Holo vs reverse holo can't be told from a photo.
  const [print, setPrint] = useState<number | null>(null);
  const [choosingPrint, setChoosingPrint] = useState(false);
  useEffect(() => {
    setPrint(null);
    setChoosingPrint(false);
  }, [best?.productId]);
  const prints = best ? printOptions(best) : [];
  const known = !!best?.printings?.length;
  const chosen = print != null ? prints[print] : null;
  // The base printing needs no suffix; an unpriced fallback choice always gets one.
  const printSuffix = chosen && (!known || print! > 0) ? chosen.name : null;
  const printLabel = chosen?.name ?? (known ? prints[0].name : 'As listed');
  const priceCents = chosen?.marketCents ?? best?.marketCents ?? null;
  const preview = best ? rawCard(best, null, plan, printSuffix) : null;
  const copies = preview ? owned.filter((c) => c.status === 'owned' && cardKey(c) === cardKey(preview)).length : 0;

  // The product is known, so card-match skips matching and spends no search credit.
  const afterSave = (card: Card) => {
    if (!best) return;
    matchNewCard(card, String(best.productId))
      .then(() => refreshPrices([card]))
      .catch(() => {});
  };
  const save = () => {
    if (!best) return;
    const card = rawCard(best, paidCentsOf(cost), plan, printSuffix);
    add(card);
    afterSave(card);
    router.replace(`/card/${card.id}`);
  };
  const toSell = (askCents: number) => {
    if (!best) return;
    const card = rawCard(best, paidCentsOf(cost), 'sell', printSuffix);
    openSell({ card, productId: best.productId, marketCents: priceCents, askCents, cost: toCost(cost), afterSave }, startSell);
  };

  const choose = (i: number) => setRaw((r) => (r ? { ...r, pick: i, choosing: false } : r));
  const again = (
    <Pressable accessibilityRole="button" onPress={rescan} style={styles.quiet}>
      <Text style={[type.text, { color: color.secondary }]}>Scan again</Text>
    </Pressable>
  );

  return (
    <View style={[styles.sheet, keyboardH > 0 ? { bottom: keyboardH, paddingBottom: space.l } : { paddingBottom: bottom + space.l }]}>
      <View style={styles.grabber} />
      {raw.matches === null ? (
        <>
          <Text style={[type.text, { color: color.secondary }]}>Read from the card · {printed}</Text>
          <Text style={[type.body, { color: color.ink, paddingVertical: space.l }]}>Finding the card</Text>
        </>
      ) : !best || !preview ? (
        <>
          <Text style={[type.section, { color: color.ink }]}>Couldn’t find card {printed}</Text>
          <Text style={[type.text, { color: color.secondary, paddingVertical: space.m }]}>
            It may be misread or not in the catalog yet. Search for it by name instead.
          </Text>
          <PrimaryButton title="Search cards" onPress={() => router.replace('/search')} />
          {again}
        </>
      ) : choosingPrint ? (
        <>
          <Text style={[type.section, { color: color.ink }]}>Which print is it?</Text>
          <Text style={[type.text, { color: color.secondary, paddingTop: space.xs, paddingBottom: space.s }]}>
            A photo can’t tell holo from reverse holo. Pick the one in your hand.
          </Text>
          <ScrollView style={{ maxHeight: size.rowVault * 5 }}>
            {prints.map((x, i) => (
              <View key={x.name}>
                {i ? <Hairline /> : null}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setPrint(i);
                    setChoosingPrint(false);
                  }}
                  style={({ pressed }) => [styles.field, pressed && { opacity: 0.6 }]}
                >
                  <Text style={[type.body, { color: color.ink, fontWeight: printLabel === x.name ? '600' : '400' }]}>{x.name}</Text>
                  <Text style={[type.rowPrice, { color: color.ink }]}>{x.marketCents ? money(x.marketCents) : ''}</Text>
                </Pressable>
              </View>
            ))}
          </ScrollView>
          <Pressable accessibilityRole="button" onPress={() => setChoosingPrint(false)} style={styles.quiet}>
            <Text style={[type.text, { color: color.secondary }]}>Cancel</Text>
          </Pressable>
        </>
      ) : raw.choosing ? (
        <>
          <Text style={[type.section, { color: color.ink }]}>Which card is it?</Text>
          <Text style={[type.text, { color: color.secondary, paddingTop: space.xs, paddingBottom: space.s }]}>
            {raw.matches.length} cards are numbered {printed}.
          </Text>
          <ScrollView style={{ maxHeight: size.rowVault * 5 }}>
            {raw.matches.map((m, i) => (
              <View key={m.card.productId}>
                {i ? <Hairline /> : null}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => choose(i)}
                  style={({ pressed }) => [styles.pickRow, pressed && { opacity: 0.6 }]}
                >
                  <SlabView card={rawCard(m.card, null, 'hold')} width={size.thumbW} posed={false} />
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={[type.body, { color: color.ink }]}>
                      {displayName(m.card.name)}
                    </Text>
                    <Text numberOfLines={1} style={[type.secondary, { color: color.secondary }]}>
                      {m.card.setName}
                      {m.card.language === 'ja' ? ' · Japanese' : ''}
                    </Text>
                  </View>
                  <Text style={[type.rowPrice, { color: color.ink }]}>{m.card.marketCents ? money(m.card.marketCents) : '—'}</Text>
                </Pressable>
              </View>
            ))}
          </ScrollView>
          {again}
        </>
      ) : (
        <>
          <Text style={[type.text, { color: color.secondary }]}>Read from the card · {printed}</Text>
          <View style={styles.cardRow}>
            <SlabView card={preview} width={size.sheetSlabW} posed={false} />
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={[type.title, { color: color.ink }]}>
                {preview.name}
              </Text>
              <Text numberOfLines={1} style={[type.text, { color: color.secondary }]}>
                {best.setName} · {LANGUAGE_NAME[preview.language] ?? preview.language} · Raw
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[type.displayS, { color: color.ink, fontSize: 26 }]}>{priceCents ? money(priceCents) : '—'}</Text>
              <Text style={[type.secondary, { color: color.secondary }]}>{priceCents ? 'TCGplayer market' : 'no price yet'}</Text>
            </View>
          </View>
          {copies ? (
            <Text style={[type.text, { color: color.secondary, paddingBottom: space.m }]}>
              You already have {copies} of this card raw. This would be your {ordinal(copies + 1)}.
            </Text>
          ) : null}
          {raw.matches.length > 1 ? (
            <Pressable accessibilityRole="button" onPress={() => setRaw((r) => (r ? { ...r, choosing: true } : r))} style={styles.notThis}>
              <Text style={[type.text, { color: color.secondary }]}>
                Not this card? {raw.matches.length - 1} other{raw.matches.length > 2 ? 's' : ''} ›
              </Text>
            </Pressable>
          ) : null}
          {prints.length > 1 ? (
            <>
              <Hairline />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Print, ${printLabel}`}
                onPress={() => setChoosingPrint(true)}
                style={({ pressed }) => [styles.field, pressed && { opacity: 0.6 }]}
              >
                <Text style={[type.body, { color: color.ink }]}>Print</Text>
                <Text style={[type.body, { color: color.secondary }]}>{printLabel} ›</Text>
              </Pressable>
            </>
          ) : null}
          <Hairline />
          {asking ? (
            <View style={{ paddingTop: space.l }}>
              <AskStep
                marketCents={priceCents}
                suggestedCents={priceCents ? ruleAsk({ marketCents: priceCents, low30Cents: priceCents, rules }) : null}
                onContinue={toSell}
                onBack={() => setAsking(false)}
              />
            </View>
          ) : (
            <>
              <CostField value={cost} onChange={setCost} />
              <Hairline />
              <View style={styles.field}>
                <Text style={[type.body, { color: color.ink }]}>Plan</Text>
                <Segmented
                  style={{ width: 150 }}
                  value={plan}
                  onChange={(v) => {
                    setPlan(v);
                    if (v === 'sell') setAsking(true);
                  }}
                  options={[
                    { value: 'hold', label: 'Hold' },
                    { value: 'sell', label: 'Sell' },
                  ]}
                />
              </View>
              <Hairline />
              {plan === 'sell' ? (
                <PrimaryButton style={{ marginTop: space.l }} title="Set your price" onPress={() => setAsking(true)} />
              ) : (
                <PrimaryButton style={{ marginTop: space.l }} title="Add to vault" onPress={save} />
              )}
              {again}
            </>
          )}
        </>
      )}
    </View>
  );
}

/** Hand the scanned card to the sell page: the full card page when it's in our catalog. */
function openSell(d: SellDraft, start: (d: SellDraft) => void) {
  start(d);
  if (d.productId != null) router.push({ pathname: '/search/[id]', params: { id: String(d.productId), sell: '1' } });
  else router.push('/sell');
}

/** 2 → "2nd", 3 → "3rd", 11 → "11th". */
function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${suffix}`;
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
  added: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    marginTop: space.s,
    minHeight: size.touch,
    paddingHorizontal: space.l,
    borderRadius: radius.field,
    backgroundColor: color.scanHint,
  },
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
  pickRow: { minHeight: size.rowVault, flexDirection: 'row', alignItems: 'center', gap: space.m },
  notThis: { minHeight: size.touch, justifyContent: 'center' },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: space.l, paddingVertical: space.l },
  field: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  paidInput: { color: color.ink, textAlign: 'right', width: 120 },
});
