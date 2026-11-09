// The tabs under the bottom bar: Collection (home), Search, Con and Profile. Scan is a button in
// the same bar that opens the camera full screen over the tabs (src/components/TabBar.tsx).
//
// The bar floats over the page, so each tab screen sees it as part of its bottom safe-area inset:
// every bottom dock, scroll padding and fit-to-screen measure already built on that inset keeps
// working above the bar, and drops back to the phone's own inset while the bar is hidden.

import { Tabs } from 'expo-router';
import type { ReactNode } from 'react';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';
import { TabBar, useTabBarHidden } from '../../src/components/TabBar';
import { size } from '../../src/theme/tokens';
import { useColors } from '../../src/theme/theme';

function AboveTabBar({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const hidden = useTabBarHidden((s) => s.hidden);
  return (
    <SafeAreaInsetsContext.Provider value={{ ...insets, bottom: insets.bottom + (hidden ? 0 : size.tabBar) }}>
      {children}
    </SafeAreaInsetsContext.Provider>
  );
}

export default function TabsLayout() {
  const color = useColors();
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenLayout={({ children }) => <AboveTabBar>{children}</AboveTabBar>}
      screenOptions={{ headerShown: false, animation: 'none', sceneStyle: { backgroundColor: color.canvas } }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="find" />
      <Tabs.Screen name="cons" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
