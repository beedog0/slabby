// Edit profile: photo, name, @handle and a short bio. One decision: Save.
//
// Saved on the phone right away and with the account like everything else; once signed in it's
// also published so friends can find you by handle later (src/services/profile.ts). Handles are
// unique: while you type one, Slabby checks it's free when it can.

import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '../../src/components/Avatar';
import { openMenu } from '../../src/components/menu/Menu';
import { BackIcon, Hairline, IconButton, PrimaryButton } from '../../src/components/ui';
import { handleTaken, pickProfilePhoto, publishProfile } from '../../src/services/profile';
import { useAccount } from '../../src/store/account';
import { BIO_MAX, NAME_MAX, cleanHandle, handleProblem, initialOf, useProfile } from '../../src/store/profile';
import { size, space, type } from '../../src/theme/tokens';
import { themed, useColors } from '../../src/theme/theme';

export default function EditProfile() {
  const color = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const saved = useProfile();
  const { guest, email } = useAccount();

  const [name, setName] = useState(saved.name);
  const [handle, setHandle] = useState(saved.handle);
  const [bio, setBio] = useState(saved.bio);
  const [photo, setPhoto] = useState(saved.photo);
  const [taken, setTaken] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/profile'));

  const problem = handleProblem(handle);
  // Check the handle a moment after typing stops; your own saved handle is never "taken".
  useEffect(() => {
    setTaken(null);
    if (!handle || problem || handle === saved.handle) return;
    const t = setTimeout(() => handleTaken(handle).then(setTaken).catch(() => {}), 400);
    return () => clearTimeout(t);
  }, [handle, problem, saved.handle]);

  const hint = problem
    ? problem
    : taken
      ? 'Someone already has this handle.'
      : guest
        ? 'Sign in under Account to keep your handle and share your profile.'
        : taken === false
          ? 'Available.'
          : 'Friends will find you by this.';
  const hintColor = problem || taken ? color.loss : color.secondary;

  const changePhoto = () =>
    openMenu({
      title: 'Profile photo',
      items: [
        {
          label: 'Choose from photos',
          // The sheet runs this once it has closed, so the photo picker can open over the page.
          onPress: () =>
            pickProfilePhoto()
              .then((p) => p && setPhoto(p))
              .catch(() => setError('Couldn’t open that photo.')),
        },
        ...(photo ? [{ label: 'Remove photo', onPress: () => setPhoto(null) }] : []),
      ],
    });

  const save = async () => {
    if (busy || problem || taken) return;
    setBusy(true);
    setError(null);
    const next = { name: name.slice(0, NAME_MAX), handle, bio: bio.slice(0, BIO_MAX), photo };
    const e = await publishProfile(next).catch((x: Error) => x.message);
    setBusy(false);
    if (e) {
      setError(e);
      return;
    }
    useProfile.getState().save(next);
    back();
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: color.canvas, paddingTop: insets.top }}
    >
      <View style={styles.nav}>
        <IconButton label="Back" onPress={back}>
          <BackIcon />
        </IconButton>
        <Text style={[type.body, { color: color.ink }]}>Edit profile</Text>
        <View style={{ width: size.touch }} />
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
        <Pressable accessibilityRole="button" accessibilityLabel="Change photo" onPress={changePhoto} style={styles.photo}>
          <Avatar photo={photo} letter={initialOf(name, handle, email)} px={size.avatarEdit} />
          <Text style={[type.text, { color: color.ink, marginTop: space.m }]}>{photo ? 'Change photo' : 'Add photo'}</Text>
        </Pressable>

        <Hairline />
        <View style={styles.field}>
          <Text style={[type.body, styles.label, { color: color.ink }]}>Name</Text>
          <TextInput
            value={name}
            onChangeText={(t) => setName(t.slice(0, NAME_MAX))}
            placeholder="Your name"
            placeholderTextColor={color.secondary}
            autoComplete="name"
            textContentType="name"
            returnKeyType="next"
            style={[type.body, styles.input]}
          />
        </View>
        <Hairline />
        <View style={styles.field}>
          <Text style={[type.body, styles.label, { color: color.ink }]}>Handle</Text>
          <Text style={[type.body, { color: color.secondary }]}>@</Text>
          <TextInput
            value={handle}
            onChangeText={(t) => setHandle(cleanHandle(t))}
            placeholder="yourname"
            placeholderTextColor={color.secondary}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            textContentType="username"
            returnKeyType="next"
            style={[type.body, styles.input, { textAlign: 'left' }]}
          />
        </View>
        <Hairline />
        <Text style={[type.secondary, styles.hint, { color: hintColor }]}>{hint}</Text>

        <View style={[styles.field, { alignItems: 'flex-start', paddingTop: space.m }]}>
          <Text style={[type.body, styles.label, { color: color.ink }]}>Bio</Text>
          <TextInput
            value={bio}
            onChangeText={(t) => setBio(t.replace(/\n/g, ' ').slice(0, BIO_MAX))}
            placeholder="What you collect"
            placeholderTextColor={color.secondary}
            multiline
            blurOnSubmit
            returnKeyType="done"
            style={[type.body, styles.input, styles.bio]}
          />
        </View>
        <Hairline />
        <Text style={[type.secondary, styles.hint, { color: color.secondary }]}>
          {bio.length ? `${BIO_MAX - bio.length} left` : `Up to ${BIO_MAX} characters.`}
        </Text>

        {error ? <Text style={[type.text, { color: color.loss, marginTop: space.l }]}>{error}</Text> : null}
      </ScrollView>

      <View style={{ paddingHorizontal: space.gutter, paddingBottom: insets.bottom + space.l, paddingTop: space.s }}>
        <PrimaryButton title={busy ? 'Saving…' : 'Save'} onPress={save} style={problem || taken ? { opacity: 0.4 } : undefined} />
      </View>
    </KeyboardAvoidingView>
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
  body: { paddingHorizontal: space.gutter, paddingBottom: space.xl },
  photo: { alignItems: 'center' as const, paddingTop: space.l, paddingBottom: space.xxl },
  field: { minHeight: 56, flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.xs },
  label: { width: 84 },
  input: { flex: 1, color: color.ink, paddingVertical: space.m },
  bio: { minHeight: 72, paddingTop: 0, textAlignVertical: 'top' as const },
  hint: { paddingTop: space.s, paddingBottom: space.l },
}));
