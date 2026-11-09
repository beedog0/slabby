// Account: sign in so the collection is saved off the phone. Every phone starts as a guest; the
// first sign-in turns that guest into the account in place (src/services/account.ts), and useSync
// keeps the account up to date from then on.
//
// Three states, one decision each: email (or Apple) → tap the emailed link (app/auth.tsx), or type
// its code when the template carries one → saved.

import * as AppleAuthentication from 'expo-apple-authentication';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { closeMenu, openMenu } from '../../src/components/menu/Menu';
import { BackIcon, Hairline, IconButton, PrimaryButton } from '../../src/components/ui';
import { appleEnabled, sendCode, signInWithApple, signOut, verifyCode, type CodeMode } from '../../src/services/account';
import { supabase } from '../../src/services/supabase';
import { useAccount } from '../../src/store/account';
import { useVault } from '../../src/store/vault';
import { useWishlist } from '../../src/store/wishlist';
import { radius, size, space, type } from '../../src/theme/tokens';
import { themed, useColors, useIsDark } from '../../src/theme/theme';
import { savedAgo } from '../../src/lib/format';

export default function Account() {
  const color = useColors();
  const styles = useStyles();
  const dark = useIsDark();
  const insets = useSafeAreaInsets();
  const { guest, email: signedEmail, provider, savedAt, saving, error: syncError } = useAccount();
  const owned = useVault((s) => s.cards.filter((c) => c.status === 'owned').length);
  const wanted = useWishlist((s) => s.items.length);

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState<CodeMode | null>(null);
  const [busy, setBusy] = useState(false);
  const params = useLocalSearchParams<{ error?: string }>();
  const [error, setError] = useState<string | null>(params.error ?? null);
  const [showCode, setShowCode] = useState(false);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const [, tick] = useState(0);

  // Keep "Saved 2 min ago" current while the screen is open.
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const run = async (fn: () => Promise<string | null>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const e = await fn().catch((x: Error) => x.message);
    setBusy(false);
    if (e) setError(e);
  };

  const send = () =>
    run(async () => {
      const r = await sendCode(email);
      if ('error' in r) return r.error;
      setSent(r.mode);
      setCode('');
      setShowCode(false);
      return null;
    });

  const verify = () =>
    run(async () => {
      const e = await verifyCode(email, code, sent ?? 'signin');
      if (!e) {
        setSent(null);
        setCode('');
      }
      return e;
    });

  const confirmSignOut = () =>
    openMenu({
      title: 'Sign out?',
      subtitle: 'Your collection stays saved and on this phone.',
      items: [{ label: 'Sign out', onPress: () => closeMenu(() => signOut().catch(() => {})) }],
    });

  const signedIn = !guest;
  const step = !supabase ? 'offline' : signedIn ? 'saved' : sent ? 'code' : 'email';

  const title = {
    offline: 'Save your collection',
    email: 'Save your collection',
    code: 'Check your email',
    saved: 'Your collection is saved',
  }[step];

  const body = {
    offline: 'This build runs on sample data, so there’s no account to save to.',
    email:
      'Sign in so your slabs, raw cards, sealed, wishlist and prices paid are kept if you reinstall or get a new phone. Everything already on this phone comes with you.',
    code: `Tap the sign-in link in the email we sent to ${email.trim()}. Open it on this phone and Slabby comes back signed in.`,
    saved:
      provider === 'apple' && (!signedEmail || signedEmail.endsWith('privaterelay.appleid.com'))
        ? 'Signed in with Apple. Changes save whenever you have signal; everything still works offline at a con.'
        : `Signed in as ${signedEmail ?? 'you'}. Changes save whenever you have signal; everything still works offline at a con.`,
  }[step];

  const ago = savedAgo(savedAt);
  const status = saving ? 'Saving…' : syncError ? 'Not saved yet' : ago ? `Saved ${ago}` : 'Waiting for signal';

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: color.canvas, paddingTop: insets.top }}
    >
      <View style={styles.nav}>
        <IconButton label="Back" onPress={back}>
          <BackIcon />
        </IconButton>
        <Text style={[type.body, { color: color.ink }]}>Account</Text>
        <View style={{ width: size.touch }} />
      </View>

      <View style={styles.body}>
        <Text style={[type.title, { color: color.ink }]}>{title}</Text>
        <Text style={[type.text, { color: color.secondary }]}>{body}</Text>

        {step === 'email' ? (
          <View style={styles.fields}>
            <Hairline />
            <View style={styles.field}>
              <Text style={[type.body, { color: color.ink }]}>Email</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={color.secondary}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                keyboardType="email-address"
                returnKeyType="send"
                onSubmitEditing={send}
                style={[type.body, styles.input]}
              />
            </View>
            <Hairline />
          </View>
        ) : null}

        {step === 'code' && !showCode ? (
          <Pressable accessibilityRole="button" onPress={() => setShowCode(true)} hitSlop={6} style={styles.codeLink}>
            <Text style={[type.body, { color: color.secondary }]}>Have a code instead?</Text>
          </Pressable>
        ) : null}

        {step === 'code' && showCode ? (
          <View style={styles.fields}>
            <Hairline />
            <View style={styles.field}>
              <Text style={[type.body, { color: color.ink }]}>Code</Text>
              <TextInput
                autoFocus
                value={code}
                onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 8))}
                placeholder="Code from the email"
                placeholderTextColor={color.secondary}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                returnKeyType="done"
                onSubmitEditing={verify}
                style={[type.numberM, styles.input, styles.code]}
              />
            </View>
            <Hairline />
          </View>
        ) : null}

        {step === 'saved' ? (
          <View style={styles.fields}>
            <Hairline />
            <View style={styles.field}>
              <Text style={[type.body, { color: color.ink }]}>In your account</Text>
              <Text style={[type.body, styles.value, { color: color.secondary }]}>
                {owned} {owned === 1 ? 'card' : 'cards'}
                {wanted ? ` · ${wanted} wanted` : ''}
              </Text>
            </View>
            <Hairline />
            <View style={styles.field}>
              <Text style={[type.body, { color: color.ink }]}>Last saved</Text>
              <Text style={[type.body, styles.value, { color: color.secondary }]}>{status}</Text>
            </View>
            <Hairline />
            {syncError && !saving ? (
              <Text style={[type.secondary, { color: color.secondary, marginTop: space.s }]}>
                {syncError}. It will try again when the app opens.
              </Text>
            ) : null}
          </View>
        ) : null}

        {error ? <Text style={[type.text, { color: color.loss }]}>{error}</Text> : null}
      </View>

      <View style={{ paddingHorizontal: space.gutter, paddingBottom: insets.bottom + space.l }}>
        {step === 'email' && appleEnabled && Platform.OS === 'ios' ? (
          <>
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
              buttonStyle={
                dark
                  ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                  : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
              }
              cornerRadius={radius.button}
              style={{ height: size.button }}
              onPress={() => run(signInWithApple)}
            />
            <Quiet label={busy ? 'Sending…' : 'Use email instead'} onPress={send} />
          </>
        ) : step === 'email' ? (
          <PrimaryButton title={busy ? 'Sending…' : 'Email me a sign-in link'} onPress={send} />
        ) : step === 'code' ? (
          <>
            {showCode ? (
              <PrimaryButton title={busy ? 'Signing in…' : 'Sign in'} onPress={verify} />
            ) : (
              <PrimaryButton title="Open Mail" onPress={() => Linking.openURL('message://').catch(() => {})} />
            )}
            <View style={styles.quietRow}>
              <Quiet label={busy ? 'Sending…' : 'Send again'} onPress={send} />
              <Quiet
                label="Change email"
                onPress={() => {
                  setSent(null);
                  setError(null);
                }}
              />
            </View>
          </>
        ) : step === 'saved' ? (
          <>
            <PrimaryButton title="Done" onPress={back} />
            <Quiet label="Sign out" onPress={confirmSignOut} />
          </>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

function Quiet({ label, onPress }: { label: string; onPress: () => void }) {
  const color = useColors();
  const styles = useStyles();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={6} style={styles.quiet}>
      <Text style={[type.body, { color: color.secondary }]}>{label}</Text>
    </Pressable>
  );
}

const useStyles = themed((color) => ({
  nav: {
    height: size.touch + space.l,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: space.gutter - 12,
  },
  body: { flex: 1, paddingHorizontal: space.gutter, paddingTop: space.xxl, gap: space.m },
  fields: { marginTop: space.l },
  field: {
    minHeight: 56,
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    gap: space.l,
  },
  input: { flex: 1, textAlign: 'right' as const, color: color.ink, paddingVertical: space.m },
  code: { letterSpacing: 2 },
  codeLink: { minHeight: size.touch, justifyContent: 'center' as const },
  value: { flexShrink: 1, textAlign: 'right' as const },
  quiet: { minHeight: size.touch, alignItems: 'center' as const, justifyContent: 'center' as const, marginTop: space.s },
  quietRow: { flexDirection: 'row' as const, justifyContent: 'center' as const, gap: space.xxl },
}));
