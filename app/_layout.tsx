import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DropdownHost } from '../src/components/menu/Dropdown';
import { MenuHost } from '../src/components/menu/Menu';
import { ShareCardHost } from '../src/components/share/ShareCard';
import { useSync } from '../src/services/useSync';
import { useLastDayExpiry } from '../src/store/useLastDayExpiry';
import { color } from '../src/theme/tokens';

export default function RootLayout() {
  useLastDayExpiry();
  useSync();
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.canvas } }}>
        {/* Con mode's Buying: search, then "They're asking", each a sheet over the last (swipe down
            to go back a step) instead of full pages. */}
        <Stack.Screen
          name="search/index"
          options={({ route }) => ({ presentation: (route.params as { con?: string } | undefined)?.con === '1' ? 'modal' : 'card' })}
        />
        <Stack.Screen name="con/buy/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="con/want/[id]" options={{ presentation: 'modal' }} />
      </Stack>
      <ShareCardHost />
      <MenuHost />
      <DropdownHost />
    </SafeAreaProvider>
  );
}
