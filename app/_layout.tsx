import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DropdownHost } from '../src/components/menu/Dropdown';
import { MenuHost } from '../src/components/menu/Menu';
import { ShareCardHost } from '../src/components/share/ShareCard';
import { useSync } from '../src/services/useSync';
import { color } from '../src/theme/tokens';

export default function RootLayout() {
  useSync();
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.canvas } }} />
      <ShareCardHost />
      <MenuHost />
      <DropdownHost />
    </SafeAreaProvider>
  );
}
