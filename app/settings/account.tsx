// Back up the vault: Sign in with Apple → Supabase session → sync starts (useSync).

import * as AppleAuthentication from 'expo-apple-authentication';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackIcon, IconButton, PrimaryButton } from '../../src/components/ui';
import { supabase } from '../../src/services/supabase';
import { radius, size, space, type } from '../../src/theme/tokens';
import { useColors } from '../../src/theme/theme';

export default function Account() {
  const color = useColors();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSignedIn(!!data.session);
      setEmail(data.session?.user.email ?? null);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      setSignedIn(!!s);
      setEmail(s?.user.email ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const signIn = async () => {
    setError(null);
    try {
      const cred = await AppleAuthentication.signInAsync({
        requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL],
      });
      if (!cred.identityToken) throw new Error('Apple didn’t return a token');
      const { error: e } = await supabase!.auth.signInWithIdToken({ provider: 'apple', token: cred.identityToken });
      if (e) throw e;
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code !== 'ERR_REQUEST_CANCELED') setError((e as Error).message);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: color.canvas, paddingTop: insets.top }}>
      <View style={styles.nav}>
        <IconButton label="Back" onPress={() => router.back()}>
          <BackIcon />
        </IconButton>
        <Text style={[type.body, { color: color.ink }]}>Back up</Text>
        <View style={{ width: size.touch }} />
      </View>
      <View style={styles.body}>
        <Text style={[type.title, { color: color.ink }]}>{signedIn ? 'Your vault is backed up' : 'Back up your vault'}</Text>
        <Text style={[type.text, { color: color.secondary }]}>
          {!supabase
            ? 'This build runs on sample data. Add the Supabase keys to turn on backup.'
            : signedIn
              ? `Signed in${email ? ` as ${email}` : ''}. Changes sync whenever you have signal.`
              : 'Sign in to keep your slabs, prices paid, and rules if you change phones. Everything still works offline at a con.'}
        </Text>
        {error ? <Text style={[type.text, { color: color.loss }]}>{error}</Text> : null}
      </View>
      <View style={{ paddingHorizontal: space.gutter, paddingBottom: insets.bottom + space.l }}>
        {supabase && !signedIn && Platform.OS === 'ios' ? (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={radius.button}
            style={{ height: size.button }}
            onPress={signIn}
          />
        ) : supabase && signedIn ? (
          <PrimaryButton title="Done" onPress={() => router.back()} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  nav: {
    height: size.touch + space.l,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.gutter - 12,
  },
  body: { flex: 1, paddingHorizontal: space.gutter, paddingTop: space.xxl, gap: space.m },
});
