// The slab hero: a PSA-proportion acrylic case with depth, the label in its pocket and the card
// seated in the clear insert below it (src/components/slab). Static in lists; on the card screen
// (`interactive`) drag tilts it and a tap opens the full-screen viewer to spin it 360°. A raw
// card in its sleeve tilts the same way.
// When the Blender render lands (SLAB_ASSET_BRIEF.md), it replaces the drawn faces; the props
// stay the same.

import { useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, View, type ViewStyle } from 'react-native';
import { ArtImage } from './ArtImage';
import { color, shadow, size, slabPose } from '../theme/tokens';
import { Slab3D } from './slab/Slab3D';
import { SlabViewer } from './slab/SlabViewer';
import type { Card } from '../types';

export { labelNameLine, labelSetLine } from './slab/label';

type Props = {
  card: Card;
  width?: number;
  /** Apply the hero pose (rotateY −7°, rotateX +3°). Off for flat uses. */
  posed?: boolean;
  /** Floor shadow under the slab. Defaults to on when posed; the share card keeps it while flat. */
  shadow?: boolean;
  /** Drag to tilt, tap to open the 360° viewer (card screen). */
  interactive?: boolean;
  /** Tells the screen a tilt drag is under way, so it can hold its scroll still. */
  onDragChange?: (dragging: boolean) => void;
};

const REST_YAW = parseFloat(slabPose.rotateY);
const REST_PITCH = parseFloat(slabPose.rotateX);
const TILT_YAW = 28;
const TILT_PITCH = 22;

export function SlabView({ card, width = size.heroW, posed = true, shadow: floorShadow, interactive = false, onDragChange }: Props) {
  const label = `${card.name}, ${card.grader === 'raw' ? 'raw' : `${card.grader.toUpperCase()} ${card.grade}`}`;
  const height = (width * size.heroH) / size.heroW;

  if (card.grader === 'raw' && !interactive) {
    return (
      <View style={{ width, height, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel={label}>
        <Sleeve card={card} width={width} transform={posed ? [{ perspective: slabPose.perspective }, { rotateY: slabPose.rotateY }, { rotateX: slabPose.rotateX }] : undefined} />
      </View>
    );
  }

  if (!interactive) {
    return (
      <View style={{ width, height, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel={label}>
        <Slab3D card={card} width={width} yaw={posed ? REST_YAW : 0} pitch={posed ? REST_PITCH : 0} shadow={floorShadow ?? posed} />
      </View>
    );
  }
  return <TiltSlab card={card} width={width} height={height} label={label} onDragChange={onDragChange} />;
}

/** Raw cards: penny sleeve at the same card scale, no slab. */
function Sleeve({ card, width, transform }: { card: Card; width: number; transform?: ViewStyle['transform'] }) {
  const w = width * 0.86;
  return (
    <Animated.View
      style={[
        { width: w, height: w * (88 / 63), borderRadius: w * 0.045, backgroundColor: card.artColor ?? color.well },
        shadow.slabContact,
        transform ? { transform } : null,
      ]}
    >
      {card.imageFrontUrl ? (
        <ArtImage uri={card.imageFrontUrl} recyclingKey={card.id} style={[StyleSheet.absoluteFill, { borderRadius: w * 0.045 }]} />
      ) : null}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.sleeve, { borderRadius: w * 0.045 }]} />
    </Animated.View>
  );
}

function TiltSlab({ card, width, height, label, onDragChange }: { card: Card; width: number; height: number; label: string; onDragChange?: (d: boolean) => void }) {
  const yaw = useRef(new Animated.Value(REST_YAW)).current;
  const pitch = useRef(new Animated.Value(REST_PITCH)).current;
  const [open, setOpen] = useState(false);
  const cb = useRef(onDragChange);
  cb.current = onDragChange;
  const raw = card.grader === 'raw';
  const rawRef = useRef(raw); // the pan handlers are made once; the card can change grade under them
  rawRef.current = raw;

  const pan = useRef(
    PanResponder.create({
      // Claim the touch the moment it lands on the slab, and keep it: the scroll view and the
      // screen's swipe-back never see a drag that started here.
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: () => {
        yaw.stopAnimation();
        pitch.stopAnimation();
        cb.current?.(true);
      },
      onPanResponderMove: (_, s) => {
        yaw.setValue(REST_YAW + TILT_YAW * Math.tanh(s.dx / 110));
        pitch.setValue(REST_PITCH - TILT_PITCH * Math.tanh(s.dy / 110));
      },
      onPanResponderRelease: (_, s) => {
        cb.current?.(false);
        const tap = Math.abs(s.dx) < 6 && Math.abs(s.dy) < 6;
        springBack();
        if (tap && !rawRef.current) setOpen(true);
      },
      onPanResponderTerminate: () => {
        cb.current?.(false);
        springBack();
      },
    }),
  ).current;

  function springBack() {
    Animated.parallel([
      Animated.spring(yaw, { toValue: REST_YAW, friction: 5, tension: 55, useNativeDriver: false }),
      Animated.spring(pitch, { toValue: REST_PITCH, friction: 5, tension: 55, useNativeDriver: false }),
    ]).start();
  }

  return (
    <>
    <View
      style={{ width, height, alignItems: 'center', justifyContent: 'center' }}
      accessible
      accessibilityRole={raw ? 'image' : 'imagebutton'}
      accessibilityLabel={label}
      accessibilityHint={raw ? undefined : 'Opens the slab full screen'}
      onAccessibilityTap={raw ? undefined : () => setOpen(true)}
      {...pan.panHandlers}
    >
      {raw ? (
        // A sleeved single tilts the same way; it has no 360° viewer (there's no case to turn).
        <Sleeve
          card={card}
          width={width}
          transform={[
            { perspective: slabPose.perspective },
            { rotateY: yaw.interpolate({ inputRange: [-360, 360], outputRange: ['-360deg', '360deg'] }) },
            { rotateX: pitch.interpolate({ inputRange: [-360, 360], outputRange: ['-360deg', '360deg'] }) },
          ]}
        />
      ) : (
        <Slab3D card={card} width={width} yaw={yaw} pitch={pitch} />
      )}
    </View>
    {raw ? null : <SlabViewer card={card} visible={open} onClose={() => setOpen(false)} />}
    </>
  );
}

const styles = StyleSheet.create({
  sleeve: { borderWidth: StyleSheet.hairlineWidth * 2, borderColor: 'rgba(0,0,0,0.10)', backgroundColor: 'rgba(255,255,255,0.06)' },
});
