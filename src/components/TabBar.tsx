// The bottom bar: Collection · Search · Scan · Con · Profile. All but Scan are tabs (app/(tabs));
// Scan opens the camera full screen over them. The Con tab is the stop before con mode, which also
// opens full screen so the table gets the whole phone.
//
// Flat canvas with a hairline on top, outline icons, the picked tab in ink and the rest in
// secondary. Scan is the one filled thing: a black key in the middle, like the primary button.
// The bar floats over the page; tab screens read its height through their bottom safe-area inset
// (app/(tabs)/_layout.tsx), so docks and scroll padding sit above it with no per-screen math.

import { router } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { create } from 'zustand';
import { radius, size, type } from '../theme/tokens';
import { themed, useColors } from '../theme/theme';

/** Screens that bring their own bottom bar (home's Select and Arrange) hide the tabs meanwhile. */
export const useTabBarHidden = create<{ hidden: boolean }>()(() => ({ hidden: false }));

export function useHideTabBar(hide: boolean) {
  useEffect(() => {
    useTabBarHidden.setState({ hidden: hide });
    return () => useTabBarHidden.setState({ hidden: false });
  }, [hide]);
}

type Icon = (p: { tint: string; on: boolean }) => React.ReactElement;

const TABS: Record<string, { label: string; Icon: Icon }> = {
  index: { label: 'Collection', Icon: ShelfIcon },
  find: { label: 'Search', Icon: FindIcon },
  cons: { label: 'Con', Icon: TagIcon },
  profile: { label: 'Profile', Icon: PersonIcon },
};

export function TabBar({ state, emitter, navigateToTab }: BottomTabBarProps) {
  const color = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const hidden = useTabBarHidden((s) => s.hidden);
  if (hidden) return null;

  const tab = (name: string) => {
    const index = state.routes.findIndex((r) => r.name === name);
    const route = state.routes[index];
    const info = TABS[name];
    if (!route || !info) return null;
    const on = state.index === index;
    const tint = on ? color.ink : color.secondary;
    const press = () => {
      const e = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!on && !e.defaultPrevented) navigateToTab(route.key);
    };
    return (
      <Pressable
        key={name}
        accessibilityRole="tab"
        accessibilityLabel={info.label}
        accessibilityState={{ selected: on }}
        onPress={press}
        style={styles.item}
      >
        <info.Icon tint={tint} on={on} />
        <Text numberOfLines={1} style={[type.tabLabel, { color: tint, fontWeight: on ? '600' : '500' }]}>
          {info.label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom }]}>
      {tab('index')}
      {tab('find')}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Scan a slab"
        onPress={() => router.push('/scan')}
        style={styles.item}
      >
        {({ pressed }) => (
          <View style={[styles.scan, pressed && { opacity: 0.8 }]}>
            <ScanGlyph tint={color.onInk} />
          </View>
        )}
      </Pressable>
      {tab('cons')}
      {tab('profile')}
    </View>
  );
}

// Icons: 24 pt, round caps, the picked one a touch heavier. Drawn here so they share one weight.

const w = (on: boolean) => (on ? 2 : 1.75);

/** Two slabs standing on a shelf. */
function ShelfIcon({ tint, on }: { tint: string; on: boolean }) {
  return (
    <Svg width={size.tabIcon} height={size.tabIcon} viewBox="0 0 24 24" fill="none" stroke={tint} strokeWidth={w(on)} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={4} y={3.5} width={6.5} height={13.5} rx={1.5} />
      <Rect x={13.5} y={3.5} width={6.5} height={13.5} rx={1.5} />
      <Path d="M4 7.25h6.5M13.5 7.25H20M2.5 20.5h19" />
    </Svg>
  );
}

function FindIcon({ tint, on }: { tint: string; on: boolean }) {
  return (
    <Svg width={size.tabIcon} height={size.tabIcon} viewBox="0 0 24 24" fill="none" stroke={tint} strokeWidth={w(on)} strokeLinecap="round">
      <Path d="M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15ZM16 16l4.5 4.5" />
    </Svg>
  );
}

/** A price tag: con mode is where things get priced and sold. */
function TagIcon({ tint, on }: { tint: string; on: boolean }) {
  return (
    <Svg width={size.tabIcon} height={size.tabIcon} viewBox="0 0 24 24" fill="none" stroke={tint} strokeWidth={w(on)} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3.5 11.6V4.5a1 1 0 0 1 1-1h7.1l8.6 8.6a1.5 1.5 0 0 1 0 2.1l-6.9 6.9a1.5 1.5 0 0 1-2.1 0Z" />
      <Circle cx={8} cy={8} r={1.4} />
    </Svg>
  );
}

function PersonIcon({ tint, on }: { tint: string; on: boolean }) {
  return (
    <Svg width={size.tabIcon} height={size.tabIcon} viewBox="0 0 24 24" fill="none" stroke={tint} strokeWidth={w(on)} strokeLinecap="round">
      <Circle cx={12} cy={8.5} r={3.75} />
      <Path d="M4.5 20.25c.9-3.6 3.9-5.75 7.5-5.75s6.6 2.15 7.5 5.75" />
    </Svg>
  );
}

function ScanGlyph({ tint }: { tint: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={tint} strokeWidth={2} strokeLinecap="round">
      <Path d="M4 9V6a2 2 0 0 1 2-2h3M15 4h3a2 2 0 0 1 2 2v3M20 15v3a2 2 0 0 1-2 2h-3M9 20H6a2 2 0 0 1-2-2v-3" />
    </Svg>
  );
}

const useStyles = themed((color) =>
  StyleSheet.create({
    bar: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      flexDirection: 'row',
      backgroundColor: color.canvas,
      borderTopWidth: StyleSheet.hairlineWidth * 2,
      borderTopColor: color.hairline,
    },
    item: { flex: 1, height: size.tabBar, alignItems: 'center', justifyContent: 'center', gap: 3 },
    scan: {
      width: size.tabScanW,
      height: size.tabScanH,
      borderRadius: radius.button,
      backgroundColor: color.ink,
      alignItems: 'center',
      justifyContent: 'center',
    },
  }),
);
