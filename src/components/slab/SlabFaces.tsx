// The two printed faces of the slab: the front (label pocket, card well, the card in its clear
// insert) and the back (label reverse with the cert barcode, the card's back). Static content;
// the 3D pose, glare and shading are layered on by Slab3D.

import { LinearGradient } from 'expo-linear-gradient';
import { memo, type ReactNode } from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import type { Card } from '../../types';
import { ArtImage } from '../ArtImage';
import { gameOf } from '../../lib/games';
import { cardBack, cardBackPlain } from './cardBacks';
import { code128B } from './code128';
import { gradeDescriptor, labelInk, type LabelInk, type SlabLayout } from './geometry';
import { labelNameLine, labelSetLine } from './label';

export const ACRYLIC = {
  face: ['#F9FAFB', '#EEF0F3', '#F6F7F9'] as const,
  well: ['#EDEFF2', '#E4E7EB'] as const,
  edge: '#DADEE3',
  edgeDark: '#C9CED5',
  outline: 'rgba(0,0,0,0.16)',
  highlight: 'rgba(255,255,255,0.95)',
  recessDark: 'rgba(0,0,0,0.10)',
  recessLight: 'rgba(255,255,255,0.9)',
};


/** The case body shared by both faces: acrylic, bevelled outer edge, the frame step. */
function CaseBody({ L, children }: { L: SlabLayout; children: ReactNode }) {
  const hair = Math.max(StyleSheet.hairlineWidth, 0.35 * L.k);
  return (
    <View style={{ width: L.w, height: L.h, borderRadius: L.corner, overflow: 'hidden' }}>
      <LinearGradient colors={ACRYLIC.face} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      {/* Frame step: a soft recess 3.5 mm in from the edge. */}
      <View
        style={[
          styles.abs,
          {
            left: L.frame - hair * 2,
            top: L.frame - hair * 2,
            right: L.frame - hair * 2,
            bottom: L.frame - hair * 2,
            borderRadius: L.corner * 0.6,
            borderWidth: hair * 2.2,
            borderTopColor: ACRYLIC.recessDark,
            borderLeftColor: ACRYLIC.recessDark,
            borderBottomColor: ACRYLIC.recessLight,
            borderRightColor: ACRYLIC.recessLight,
          },
        ]}
      />
      {children}
      {/* Bevel: a chamfer around the edge (bright band, then a grey lip), the edge of the acrylic. */}
      <View
        pointerEvents="none"
        style={[styles.abs, { inset: hair, borderRadius: L.corner - hair, borderWidth: 1.1 * L.k, borderColor: ACRYLIC.highlight }]}
      />
      <View
        pointerEvents="none"
        style={[styles.abs, { inset: hair + 1.1 * L.k, borderRadius: Math.max(0, L.corner - 1.1 * L.k), borderWidth: hair, borderColor: 'rgba(0,0,0,0.12)' }]}
      />
      <View pointerEvents="none" style={[styles.abs, { inset: 0, borderRadius: L.corner, borderWidth: hair, borderColor: ACRYLIC.outline }]} />
    </View>
  );
}

/** A pocket pressed into the case: darker top-left lip, light bottom-right lip. */
function Recess({ box, radius, hair, children, style }: { box: SlabLayout['label']; radius: number; hair: number; children?: ReactNode; style?: ViewStyle }) {
  return (
    <View style={[styles.abs, { left: box.x, top: box.y, width: box.w, height: box.h, borderRadius: radius, overflow: 'hidden' }, style]}>
      {children}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(0,0,0,0.09)', 'rgba(0,0,0,0)']}
        style={[styles.abs, { left: 0, right: 0, top: 0, height: hair * 5 }]}
      />
      <View
        pointerEvents="none"
        style={[
          styles.abs,
          {
            inset: 0,
            borderRadius: radius,
            borderWidth: hair,
            borderTopColor: 'rgba(0,0,0,0.14)',
            borderLeftColor: 'rgba(0,0,0,0.10)',
            borderRightColor: 'rgba(255,255,255,0.8)',
            borderBottomColor: 'rgba(255,255,255,0.9)',
          },
        ]}
      />
    </View>
  );
}

/** The raised grey frame of the inner holder, hugging the card like a picture mat. */
function CardFrame({ L, hair }: { L: SlabLayout; hair: number }) {
  const w = 2.6 * L.k;
  const box = { left: L.card.x - w, top: L.card.y - w, width: L.card.w + w * 2, height: L.card.h + w * 2, borderRadius: L.card.r + w * 0.7 };
  return (
    <View style={[styles.abs, box, styles.ridge, { overflow: 'hidden' }]}>
      <LinearGradient colors={['#E9ECEF', '#CDD2D8', '#DDE1E5', '#C3C8CF']} locations={[0, 0.35, 0.6, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={[styles.abs, { inset: 0, borderRadius: box.borderRadius, borderWidth: hair * 1.6, borderTopColor: 'rgba(255,255,255,0.95)', borderLeftColor: 'rgba(255,255,255,0.85)', borderRightColor: 'rgba(0,0,0,0.12)', borderBottomColor: 'rgba(0,0,0,0.16)' }]} />
      <View style={[styles.abs, { inset: w - hair * 1.2, borderRadius: L.card.r + hair, borderWidth: hair * 1.2, borderColor: 'rgba(0,0,0,0.22)' }]} />
    </View>
  );
}

/** The label's paper colour and its printed frame: the grader's colour cue. */
function LabelPaper({ ink, k }: { ink: LabelInk; k: number }) {
  return (
    <>
      {ink.paper2 ? (
        <LinearGradient colors={[ink.paper, ink.paper2]} start={{ x: 0, y: 0 }} end={{ x: 0.7, y: 1 }} style={StyleSheet.absoluteFill} />
      ) : null}
      <View pointerEvents="none" style={[styles.abs, { inset: 0.9 * k, borderRadius: 0.4 * k, borderWidth: 0.5 * k, borderColor: ink.frame }]} />
    </>
  );
}

function Barcode({ value, width, height, ink }: { value: string; width: number; height: number; ink: string }) {
  const modules = code128B(value);
  if (!modules.length) return null;
  const total = modules.reduce((a, b) => a + b, 0) + 20; // 10-module quiet zone each side
  const u = width / total;
  let x = 10 * u;
  const bars: ReactNode[] = [];
  modules.forEach((m, i) => {
    if (i % 2 === 0) bars.push(<Rect key={i} x={x} y={0} width={m * u} height={height} fill={ink} />);
    x += m * u;
  });
  return (
    <Svg width={width} height={height}>
      {bars}
    </Svg>
  );
}

export const FrontFace = memo(function FrontFace({ card, L, sharp = false }: { card: Card; L: SlabLayout; sharp?: boolean }) {
  const hair = Math.max(StyleSheet.hairlineWidth, 0.35 * L.k);
  const ink = labelInk(card.grader, card.grade);
  const k = L.k;
  const pad = 2.8 * k;
  const descriptor = gradeDescriptor(card.grader, card.grade);
  const showCert = !!card.certNumber && L.w >= 90;
  const showBarcode = !!card.certNumber && L.w >= 140;

  return (
    <CaseBody L={L}>
      {/* Label pocket and the label paper sitting in it. */}
      <Recess box={L.label} radius={0.8 * k} hair={hair} style={{ backgroundColor: ink.paper }}>
        <LabelPaper ink={ink} k={k} />
        <View style={[styles.labelRow, { paddingHorizontal: pad, paddingVertical: 1.8 * k, gap: 1.5 * k }]}>
          <View style={{ flex: 1, minWidth: 0, justifyContent: 'center' }}>
            <Text numberOfLines={1} style={[styles.label, { color: ink.ink, fontSize: 3.1 * k, lineHeight: 3.8 * k }]}>
              {labelSetLine(card)}
            </Text>
            <Text numberOfLines={1} style={[styles.label, { color: ink.ink, fontSize: 3.2 * k, lineHeight: 3.9 * k, fontWeight: '700' }]}>
              {labelNameLine(card)}
            </Text>
            {showCert ? (
              <Text numberOfLines={1} style={[styles.label, { color: ink.sub, fontSize: 2.7 * k, lineHeight: 3.4 * k }]}>
                {card.certNumber}
              </Text>
            ) : null}
            {showBarcode ? (
              <View style={{ marginTop: 0.6 * k }}>
                <Barcode value={card.certNumber!} width={26 * k} height={2.4 * k} ink={ink.ink} />
              </View>
            ) : null}
          </View>
          <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
            {descriptor ? (
              <Text style={[styles.label, { color: ink.ink, fontSize: 2.9 * k, lineHeight: 3.6 * k, letterSpacing: 0.1 * k }]}>{descriptor}</Text>
            ) : null}
            {card.grade != null ? (
              <Text style={[styles.grade, { color: ink.grade, fontSize: 9.6 * k, lineHeight: 10.4 * k }]}>{card.grade}</Text>
            ) : null}
          </View>
        </View>
      </Recess>

      {/* The card well, then the clear insert, then the card. */}
      <Recess box={L.well} radius={1.2 * k} hair={hair}>
        <LinearGradient colors={ACRYLIC.well} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 1 }} style={StyleSheet.absoluteFill} />
      </Recess>
      <CardFrame L={L} hair={hair} />
      <View
        style={[
          styles.abs,
          styles.contact,
          { left: L.card.x, top: L.card.y, width: L.card.w, height: L.card.h, borderRadius: L.card.r, backgroundColor: card.artColor ?? '#D8DBE0' },
        ]}
      >
        {card.imageFrontUrl ? (
          <ArtImage uri={card.imageFrontUrl} recyclingKey={card.id} sharp={sharp} style={[StyleSheet.absoluteFill, { borderRadius: L.card.r }]} />
        ) : null}
        <View pointerEvents="none" style={[styles.abs, { inset: 0, borderRadius: L.card.r, borderWidth: hair, borderColor: 'rgba(0,0,0,0.18)' }]} />
      </View>
    </CaseBody>
  );
});

export const BackFace = memo(function BackFace({ card, L }: { card: Card; L: SlabLayout }) {
  const game = gameOf(card);
  const back = cardBack(game, card.language);
  const hair = Math.max(StyleSheet.hairlineWidth, 0.35 * L.k);
  const ink = labelInk(card.grader, card.grade);
  const k = L.k;
  return (
    <CaseBody L={L}>
      <Recess box={L.label} radius={0.8 * k} hair={hair} style={{ backgroundColor: ink.paper }}>
        <LabelPaper ink={ink} k={k} />
        <View style={[styles.backLabel, { padding: 2 * k, gap: 1 * k }]}>
          {card.certNumber ? (
            <>
              <Barcode value={card.certNumber} width={L.label.w * 0.62} height={7 * k} ink={ink.ink} />
              <Text style={[styles.label, { color: ink.ink, fontSize: 2.8 * k, lineHeight: 3.6 * k, letterSpacing: 0.4 * k }]}>
                {card.certNumber}
              </Text>
            </>
          ) : (
            <Text style={[styles.label, { color: ink.sub, fontSize: 2.6 * k }]}>{card.grader.toUpperCase()}</Text>
          )}
        </View>
      </Recess>
      <Recess box={L.well} radius={1.2 * k} hair={hair}>
        <LinearGradient colors={ACRYLIC.well} start={{ x: 1, y: 0 }} end={{ x: 0.4, y: 1 }} style={StyleSheet.absoluteFill} />
      </Recess>
      <CardFrame L={L} hair={hair} />
      {/* Card back: the printed back for the card's language, or a plain back until we have it. */}
      <View
        style={[
          styles.abs,
          styles.contact,
          { left: L.card.x, top: L.card.y, width: L.card.w, height: L.card.h, borderRadius: L.card.r, overflow: 'hidden', backgroundColor: cardBackPlain(game) },
        ]}
      >
        <LinearGradient colors={['#2A5AC0', '#1C3C88', '#132B66']} start={{ x: 0.5, y: 0.2 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFill} />
        {back ? <ArtImage uri={back} recyclingKey={`back-${game}-${card.language}`} style={StyleSheet.absoluteFill} /> : null}
        <View
          style={[
            styles.abs,
            { inset: 2.2 * k, borderRadius: L.card.r * 0.6, borderWidth: back ? 0 : hair * 2, borderColor: 'rgba(255,255,255,0.18)' },
          ]}
        />
      </View>
    </CaseBody>
  );
});

/** One side of the case: clear acrylic seen edge-on, with the seam between the two halves. */
export function EdgeStrip({ length, depth, vertical }: { length: number; depth: number; vertical: boolean }) {
  const seam = Math.max(StyleSheet.hairlineWidth, depth * 0.04);
  const across = vertical ? { width: depth, height: length } : { width: length, height: depth };
  return (
    <View style={[across, { overflow: 'hidden', borderRadius: depth * 0.18 }]}>
      <LinearGradient
        colors={['#E9ECEF', ACRYLIC.edge, ACRYLIC.edgeDark, ACRYLIC.edge, '#EEF0F2']}
        locations={[0, 0.3, 0.5, 0.7, 1]}
        start={vertical ? { x: 0, y: 0.5 } : { x: 0.5, y: 0 }}
        end={vertical ? { x: 1, y: 0.5 } : { x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[
          styles.abs,
          vertical ? { top: 0, bottom: 0, left: depth / 2 - seam / 2, width: seam } : { left: 0, right: 0, top: depth / 2 - seam / 2, height: seam },
          { backgroundColor: 'rgba(0,0,0,0.18)' },
        ]}
      />
      <View style={[styles.abs, { inset: 0, borderRadius: depth * 0.18, borderWidth: seam, borderColor: 'rgba(0,0,0,0.12)' }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute' },
  labelRow: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  backLabel: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  label: { fontWeight: '600', includeFontPadding: false },
  grade: { fontWeight: '800', fontVariant: ['tabular-nums'], includeFontPadding: false, letterSpacing: -0.2 },
  ridge: {
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 1.2,
    shadowOffset: { width: 0, height: 0.6 },
  },
  contact: {
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 0.8,
    shadowOffset: { width: 0, height: 0.5 },
  },
});
