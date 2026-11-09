// The slab hero: a PSA-proportion acrylic case with depth, the label in its pocket and the card
// seated in the clear insert below it (src/components/slab). Static in lists; on the card screen
// (`interactive`) drag tilts it and a tap opens the full-screen viewer to spin it 360°. A raw
// card in its sleeve tilts the same way, and a tap opens it full screen to tilt and zoom.
// When the Blender render lands (SLAB_ASSET_BRIEF.md), it replaces the drawn faces; the props
// stay the same.

import { useRef, useState } from 'react';
import { Animated, PanResponder, View } from 'react-native';
import { size, slabPose } from '../theme/tokens';
import { SealedPhoto } from './SealedPhoto';
import { Slab3D } from './slab/Slab3D';
import { Sleeve } from './slab/Sleeve';
import { SlabViewer } from './slab/SlabViewer';
import { Spotlight } from './slab/Spotlight';
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
  /** Dark mode: a soft pool of light behind it. For a slab shown on its own (card page, swipe view). */
  spotlight?: boolean;
  /** Where a raw single sits in the slab-sized box. Bottom lets it stand on a reflection. */
  anchor?: 'center' | 'bottom';
};

const REST_YAW = parseFloat(slabPose.rotateY);
const REST_PITCH = parseFloat(slabPose.rotateX);
/** The card screen's slab rests square to the screen; it only angles while you tilt it. */
const UPRIGHT = 0;
const TILT_YAW = 28;
const TILT_PITCH = 22;

export function SlabView({ card, width = size.heroW, posed = true, shadow: floorShadow, interactive = false, onDragChange, spotlight = false, anchor = 'center' }: Props) {
  const label = `${card.name}, ${card.grader === 'raw' ? 'raw' : `${card.grader.toUpperCase()} ${card.grade}`}`;
  const height = (width * size.heroH) / size.heroW;

  // Sealed product is its box photo, never a slab or a sleeve.
  if (card.sealed) return <SealedPhoto card={card} width={width} height={height} sharp={interactive} />;

  if (card.grader === 'raw' && !interactive) {
    return (
      <View style={{ width, height, alignItems: 'center', justifyContent: anchor === 'bottom' ? 'flex-end' : 'center' }} accessibilityLabel={label}>
        {spotlight ? <Spotlight width={width} height={height} /> : null}
        <Sleeve card={card} width={width} transform={posed ? [{ perspective: slabPose.perspective }, { rotateY: slabPose.rotateY }, { rotateX: slabPose.rotateX }] : undefined} />
      </View>
    );
  }

  if (!interactive) {
    return (
      <View style={{ width, height, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel={label}>
        {spotlight ? <Spotlight width={width} height={height} /> : null}
        <Slab3D card={card} width={width} yaw={posed ? REST_YAW : 0} pitch={posed ? REST_PITCH : 0} shadow={floorShadow ?? posed} />
      </View>
    );
  }
  return <TiltSlab card={card} width={width} height={height} label={label} onDragChange={onDragChange} spotlight={spotlight} />;
}


function TiltSlab({ card, width, height, label, onDragChange, spotlight }: { card: Card; width: number; height: number; label: string; onDragChange?: (d: boolean) => void; spotlight?: boolean }) {
  const yaw = useRef(new Animated.Value(UPRIGHT)).current;
  const pitch = useRef(new Animated.Value(UPRIGHT)).current;
  const [open, setOpen] = useState(false);
  const cb = useRef(onDragChange);
  cb.current = onDragChange;
  const raw = card.grader === 'raw';

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
        yaw.setValue(UPRIGHT + TILT_YAW * Math.tanh(s.dx / 110));
        pitch.setValue(UPRIGHT - TILT_PITCH * Math.tanh(s.dy / 110));
      },
      onPanResponderRelease: (_, s) => {
        cb.current?.(false);
        const tap = Math.abs(s.dx) < 6 && Math.abs(s.dy) < 6;
        springBack();
        if (tap) setOpen(true);
      },
      onPanResponderTerminate: () => {
        cb.current?.(false);
        springBack();
      },
    }),
  ).current;

  function springBack() {
    Animated.parallel([
      Animated.spring(yaw, { toValue: UPRIGHT, friction: 5, tension: 55, useNativeDriver: false }),
      Animated.spring(pitch, { toValue: UPRIGHT, friction: 5, tension: 55, useNativeDriver: false }),
    ]).start();
  }

  return (
    <>
    <View
      style={{ width, height, alignItems: 'center', justifyContent: 'center' }}
      accessible
      accessibilityRole="imagebutton"
      accessibilityLabel={label}
      accessibilityHint={raw ? 'Opens the card full screen' : 'Opens the slab full screen'}
      onAccessibilityTap={() => setOpen(true)}
      {...pan.panHandlers}
    >
      {spotlight ? <Spotlight width={width} height={height} /> : null}
      {raw ? (
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
    <SlabViewer card={card} visible={open} onClose={() => setOpen(false)} />
    </>
  );
}
