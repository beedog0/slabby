// Signing in. Every phone starts on a guest session (useSync), so the first sign-in turns that guest
// into a real account in place: same user id, so everything already on the server stays put and
// nothing has to move. Only when the email or Apple ID already has an account (a second phone, or
// a reinstall) does it sign in to that account instead; useSync then merges this phone's things
// into it and clears the guest's server copy so the same slab ids can be saved under the account.

import * as AppleAuthentication from 'expo-apple-authentication';
import { createClient } from '@supabase/supabase-js';
import { supabase } from './supabase';

/** Sign in with Apple needs the capability on the app id and the Apple provider in Supabase. */
export const appleEnabled = process.env.EXPO_PUBLIC_APPLE_SIGN_IN === '1';

type Guest = { id: string; token: string };
let leaving: Guest | null = null;

/** The guest session being left for an existing account, once (read by useSync on sign-in). */
export function takeLeavingGuest(): Guest | null {
  const g = leaving;
  leaving = null;
  return g;
}

async function currentGuest(): Promise<Guest | null> {
  const { data } = await supabase!.auth.getSession();
  const s = data.session;
  return s?.user.is_anonymous ? { id: s.user.id, token: s.access_token } : null;
}

/**
 * Remove a guest's server copy after its things were brought into an account. Uses the guest's own
 * token (still valid for a while after leaving it), so row security needs nothing new.
 */
export async function clearGuest(g: Guest): Promise<void> {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return;
  const client = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${g.token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  await client.from('slabs').delete().eq('user_id', g.id);
  await client.from('user_state').delete().eq('user_id', g.id);
}

function friendly(e: { message?: string; code?: string; status?: number } | null | undefined): string {
  const code = e?.code ?? '';
  const msg = e?.message ?? 'Something went wrong';
  if (code.includes('rate_limit') || e?.status === 429) return 'Too many codes sent. Wait a minute, then try again.';
  if (code === 'email_address_invalid' || /invalid.*email|email.*invalid/i.test(msg)) return 'That email doesn’t look right.';
  if (code === 'otp_expired' || /expired|invalid|token/i.test(msg)) return 'That code didn’t work. Check it, or send a new one.';
  if (/network|fetch/i.test(msg)) return 'No connection. Try again when you have signal.';
  return msg;
}

const exists = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === 'email_exists' || e.code === 'identity_already_exists' || /already (been )?registered|already exists|already linked/i.test(e.message ?? ''));

/** How the code that was sent gets checked: 'link' keeps the guest's id, 'signin' joins an account. */
export type CodeMode = 'link' | 'signin';

/** Email a 6-digit sign-in code. */
export async function sendCode(emailRaw: string): Promise<{ mode: CodeMode } | { error: string }> {
  const email = emailRaw.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: 'That email doesn’t look right.' };
  if (!supabase) return { error: 'This build has no server.' };
  const guest = await currentGuest();
  if (guest) {
    const { error } = await supabase.auth.updateUser({ email });
    if (!error) return { mode: 'link' };
    if (!exists(error)) return { error: friendly(error) };
    // This email already has an account: sign in to it and bring this phone's things along.
    const r = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    return r.error ? { error: friendly(r.error) } : { mode: 'signin' };
  }
  const r = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  return r.error ? { error: friendly(r.error) } : { mode: 'signin' };
}

export async function verifyCode(emailRaw: string, codeRaw: string, mode: CodeMode): Promise<string | null> {
  const email = emailRaw.trim().toLowerCase();
  const token = codeRaw.replace(/\D/g, '');
  if (token.length < 6) return 'Enter the code from the email.';
  if (!supabase) return 'This build has no server.';
  if (mode === 'signin') leaving = await currentGuest();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: mode === 'link' ? 'email_change' : 'email' });
  if (error) {
    leaving = null;
    return friendly(error);
  }
  // A linked guest keeps its id; refresh so the session carries the email.
  if (mode === 'link') await supabase.auth.refreshSession();
  return null;
}

/** Sign in with Apple. Resolves to an error message, or null when signed in (or cancelled). */
export async function signInWithApple(): Promise<string | null> {
  if (!supabase) return 'This build has no server.';
  let token: string | null = null;
  try {
    const cred = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL],
    });
    token = cred.identityToken;
  } catch (e) {
    if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') return null;
    return 'Sign in with Apple isn’t set up in this build yet. Use email.';
  }
  if (!token) return 'Apple didn’t return a sign-in. Try again.';
  const guest = await currentGuest();
  if (guest) {
    const { error } = await supabase.auth.linkIdentity({ provider: 'apple', token });
    if (!error) {
      await supabase.auth.refreshSession();
      return null;
    }
    if (!exists(error)) return friendly(error);
    leaving = guest;
  }
  const { error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token });
  if (error) {
    leaving = null;
    return friendly(error);
  }
  return null;
}

/** Sign out. Your things stay on this phone and in the account; the phone goes back to a guest. */
export async function signOut(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut({ scope: 'local' });
  await supabase.auth.signInAnonymously().catch(() => {});
}
