// slabby://auth: where the email's sign-in link lands. Finishes the sign-in, then shows Account.

import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { finishLink } from '../src/services/account';
import { useColors } from '../src/theme/theme';

export default function AuthLink() {
  const color = useColors();
  const url = Linking.useURL();
  const done = useRef<string | null>(null);

  useEffect(() => {
    if (!url || done.current === url) return;
    done.current = url;
    finishLink(url)
      .catch((e: Error) => e.message)
      .then((error) => router.replace({ pathname: '/settings/account', params: error ? { error } : {} }));
  }, [url]);

  return (
    <View style={{ flex: 1, backgroundColor: color.canvas, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={color.secondary} />
    </View>
  );
}
