// The card hero when we have the card's photo (TCGplayer art, like Fairmark): the art as a
// physical card with rounded corners, an edge and a contact shadow, posed in 3D. When
// `interactive`, dragging tilts it and a glare band slides across, then it springs back.
// RN Animated + PanResponder only, so no extra native modules.

import { useRef } from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';
import { ArtImage } from './ArtImage';
import { card3d, color, shadow, slabPose } from '../theme/tokens';

type Props = {
  uri: string;
  width: number;
  posed?: boolean;
  interactive?: boolean;
  accessibilityLabel?: string;
};

export function Card3D({ uri, width, posed = true, interactive = false, accessibilityLabel }: Props) {
  const height = width * card3d.aspect;
  const radius = width * card3d.cornerRatio;
  const drag = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => interactive && Math.abs(g.dx) + Math.abs(g.dy) > 4,
      onPanResponderMove: (_, g) => drag.setValue({ x: g.dx, y: g.dy }),
      onPanResponderRelease: () =>
        Animated.spring(drag, { toValue: { x: 0, y: 0 }, friction: 5, tension: 60, useNativeDriver: true }).start(),
      onPanResponderTerminate: () => drag.setValue({ x: 0, y: 0 }),
    }),
  ).current;

  const R = card3d.dragRange;
  const T = card3d.maxTilt;
  const baseY = posed ? parseFloat(slabPose.rotateY) : 0;
  const baseX = posed ? parseFloat(slabPose.rotateX) : 0;
  const rotateY = drag.x.interpolate({ inputRange: [-R, R], outputRange: [`${baseY - T}deg`, `${baseY + T}deg`], extrapolate: 'clamp' });
  const rotateX = drag.y.interpolate({ inputRange: [-R, R], outputRange: [`${baseX + T}deg`, `${baseX - T}deg`], extrapolate: 'clamp' });
  const sheenX = drag.x.interpolate({ inputRange: [-R, R], outputRange: [-width, width], extrapolate: 'clamp' });
  const sheenOpacity = drag.x.interpolate({
    inputRange: [-R, 0, R],
    outputRange: [card3d.sheenOpacity, posed ? card3d.sheenOpacity * 0.35 : 0, card3d.sheenOpacity],
    extrapolate: 'clamp',
  });

  return (
    <Animated.View
      {...(interactive ? pan.panHandlers : {})}
      accessibilityLabel={accessibilityLabel}
      style={[
        { width, height },
        posed && shadow.slabAmbient,
        { transform: [{ perspective: slabPose.perspective }, { rotateY }, { rotateX }] },
      ]}
    >
      <View style={[styles.card, { borderRadius: radius }, shadow.slabContact]}>
        <ArtImage uri={uri} recyclingKey={uri} style={StyleSheet.absoluteFill} />
        <Animated.View
          pointerEvents="none"
          style={[
            styles.sheen,
            { width: width * 0.35, height: height * 1.6, top: -height * 0.3, opacity: sheenOpacity },
            { transform: [{ translateX: sheenX }, { rotate: '20deg' }] },
          ]}
        />
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.edge, { borderRadius: radius }]} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, overflow: 'hidden', backgroundColor: color.canvas },
  sheen: { position: 'absolute', left: '32%', backgroundColor: color.canvas },
  edge: { borderWidth: StyleSheet.hairlineWidth * 2, borderColor: card3d.edge },
});
