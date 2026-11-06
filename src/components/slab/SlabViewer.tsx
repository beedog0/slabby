// Full-screen slab viewer: tap the slab on the card screen to open it. Drag sideways to spin
// it all the way round (it settles on the front or the back), drag up and down to tilt, pinch
// to zoom, double-tap to reset. A modal, so there is no back-swipe to fight with.

import * as Haptics from 'expo-haptics';
import { useEffect, useRef } from 'react';
import { Animated, Modal, PanResponder, StyleSheet, Text, View, useWindowDimensions, type GestureResponderEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { color, slabPose, space, type } from '../../theme/tokens';
import type { Card } from '../../types';
import { IconButton } from '../ui';
import { SLAB_ASPECT } from './geometry';
import { Slab3D } from './Slab3D';

const REST_YAW = parseFloat(slabPose.rotateY);
const REST_PITCH = parseFloat(slabPose.rotateX);
const DEG_PER_PT = 0.55; // sideways drag → spin
const PITCH_MAX = 38;
const ZOOM_MAX = 2.4;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const spread = (e: GestureResponderEvent) => {
  const [a, b] = e.nativeEvent.touches;
  return a && b ? Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY) : 0;
};

export function SlabViewer({ card, visible, onClose }: { card: Card; visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { width: sw, height: sh } = useWindowDimensions();
  const slabW = Math.min(sw * 0.74, (sh * 0.6) / SLAB_ASPECT);

  const yaw = useRef(new Animated.Value(REST_YAW)).current;
  const pitch = useRef(new Animated.Value(REST_PITCH)).current;
  const zoom = useRef(new Animated.Value(1)).current;
  const enter = useRef(new Animated.Value(0)).current;
  const hint = useRef(new Animated.Value(1)).current;
  const g = useRef({ yaw: REST_YAW, zoom: 1, startYaw: 0, startZoom: 1, pinch0: 0, lastTap: 0, moved: false, t0: 0 }).current;

  useEffect(() => {
    if (!visible) return;
    yaw.setValue(REST_YAW - 40);
    pitch.setValue(REST_PITCH);
    zoom.setValue(1);
    hint.setValue(1);
    g.yaw = REST_YAW;
    g.zoom = 1;
    enter.setValue(0);
    Animated.parallel([
      Animated.spring(enter, { toValue: 1, friction: 8, tension: 70, useNativeDriver: true }),
      Animated.spring(yaw, { toValue: REST_YAW, friction: 7, tension: 40, useNativeDriver: false }),
    ]).start();
  }, [visible, yaw, pitch, zoom, enter, hint, g]);

  const settle = (vx: number) => {
    // Carry the flick a little, then come to rest on whichever face is nearest.
    const projected = g.yaw + vx * 1000 * DEG_PER_PT * 0.18;
    const target = REST_YAW + Math.round((projected - REST_YAW) / 180) * 180;
    const flipped = Math.round((target - REST_YAW) / 180) % 2 !== 0;
    const was = Math.round((g.startYaw - REST_YAW) / 180) % 2 !== 0;
    if (flipped !== was) Haptics.selectionAsync().catch(() => {});
    g.yaw = target;
    Animated.spring(yaw, { toValue: target, velocity: vx * 1000 * DEG_PER_PT, friction: 9, tension: 38, useNativeDriver: false }).start();
    Animated.spring(pitch, { toValue: REST_PITCH, friction: 7, tension: 50, useNativeDriver: false }).start();
  };

  const reset = () => {
    const target = REST_YAW + Math.round((g.yaw - REST_YAW) / 360) * 360;
    g.yaw = target;
    g.zoom = 1;
    Animated.parallel([
      Animated.spring(yaw, { toValue: target, friction: 8, tension: 50, useNativeDriver: false }),
      Animated.spring(pitch, { toValue: REST_PITCH, friction: 8, tension: 50, useNativeDriver: false }),
      Animated.spring(zoom, { toValue: 1, friction: 8, tension: 60, useNativeDriver: true }),
    ]).start();
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        yaw.stopAnimation((v) => (g.yaw = v));
        pitch.stopAnimation();
        g.startYaw = g.yaw;
        g.startZoom = g.zoom;
        g.pinch0 = 0;
        g.moved = false;
        g.t0 = Date.now();
      },
      onPanResponderMove: (e, s) => {
        if (s.numberActiveTouches >= 2) {
          const d = spread(e);
          if (!g.pinch0) g.pinch0 = d;
          else if (d) {
            g.zoom = clamp(g.startZoom * (d / g.pinch0), 1, ZOOM_MAX);
            zoom.setValue(g.zoom);
          }
          g.moved = true;
          return;
        }
        if (Math.abs(s.dx) + Math.abs(s.dy) > 6 && !g.moved) {
          g.moved = true;
          Animated.timing(hint, { toValue: 0, duration: 240, useNativeDriver: true }).start();
        }
        g.yaw = g.startYaw + s.dx * DEG_PER_PT;
        yaw.setValue(g.yaw);
        pitch.setValue(REST_PITCH - PITCH_MAX * Math.tanh(s.dy / 160));
      },
      onPanResponderRelease: (_, s) => {
        if (!g.moved && Date.now() - g.t0 < 280) {
          const now = Date.now();
          if (now - g.lastTap < 300) {
            g.lastTap = 0;
            reset();
          } else g.lastTap = now;
          return;
        }
        settle(g.pinch0 ? 0 : s.vx);
      },
      onPanResponderTerminate: () => settle(0),
    }),
  ).current;

  // The slab is laid out at full-zoom size and scaled down, so iOS draws its text, edges and
  // art at the zoomed resolution. Scaling a small render up is what made it pixelate.
  const scale = Animated.multiply(
    Animated.multiply(zoom, 1 / ZOOM_MAX),
    enter.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] }),
  );

  return (
    <Modal visible={visible} animationType="fade" presentationStyle="overFullScreen" transparent statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.page} {...pan.panHandlers}>
        <Animated.View style={{ transform: [{ scale }], opacity: enter }}>
          <Slab3D card={card} width={slabW * ZOOM_MAX} yaw={yaw} pitch={pitch} sharp />
        </Animated.View>
        <Animated.Text style={[type.secondary, styles.hint, { bottom: insets.bottom + space.xxl, opacity: hint }]}>
          Drag to turn · pinch to zoom
        </Animated.Text>
      </View>
      <View style={[styles.close, { top: insets.top + space.s }]}>
        <IconButton label="Close" onPress={onClose}>
          <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color.ink} strokeWidth={2} strokeLinecap="round">
            <Path d="M6 6l12 12M18 6L6 18" />
          </Svg>
        </IconButton>
      </View>
      <View pointerEvents="none" style={[styles.title, { top: insets.top + space.s }]}>
        <Text numberOfLines={1} style={[type.body, { color: color.ink }]}>
          {card.name}
        </Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: color.canvas, alignItems: 'center', justifyContent: 'center', userSelect: 'none' },
  hint: { position: 'absolute', color: color.secondary },
  close: { position: 'absolute', right: space.s },
  title: { position: 'absolute', left: 64, right: 64, height: 44, alignItems: 'center', justifyContent: 'center' },
});
