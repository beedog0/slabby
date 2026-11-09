// Publishing your profile so others can find you by handle later (sharing, friends). The profile
// itself lives on the phone (src/store/profile.ts); this only mirrors it to the profiles table once
// you're signed in. Guests stay private. If the table isn't there yet, the profile just stays local.

import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { useAccount } from '../store/account';
import { publishKey, useProfile, type Profile } from '../store/profile';
import { supabase } from './supabase';

const AVATAR_PX = 256;

const missingTable = (e: { code?: string; message?: string }) =>
  e.code === '42P01' || e.code === 'PGRST205' || /profiles.*(does not exist|not find)/i.test(e.message ?? '');

/** True when someone else already has this handle; null when we can't tell (offline, guest). */
export async function handleTaken(handle: string): Promise<boolean | null> {
  const { uid, guest } = useAccount.getState();
  if (!supabase || !handle || guest || !uid) return null;
  const { data, error } = await supabase.from('profiles').select('user_id').eq('handle', handle).limit(1);
  if (error) return null;
  return !!data?.length && data[0].user_id !== uid;
}

/** Send the profile to the account's public row. Resolves to an error to show, or null. */
export async function publishProfile(p: Profile): Promise<string | null> {
  const { uid, guest } = useAccount.getState();
  if (!supabase || guest || !uid) return null;
  const key = publishKey(p);
  if (useProfile.getState().published === key) return null;
  const row = { user_id: uid, handle: p.handle || null, name: p.name.trim() || null, bio: p.bio.trim() || null, photo: p.photo };
  const { error } = await supabase.from('profiles').upsert(row);
  if (error) {
    if (error.code === '23505') return 'That handle is taken. Try another.';
    if (missingTable(error)) return null;
    if (/network|fetch/i.test(error.message)) return null; // tries again next time Profile opens
    return error.message;
  }
  useProfile.getState().markPublished(key);
  return null;
}

/**
 * A profile photo from the photo library or the camera, as a small square JPEG data URI, or null
 * when you back out.
 *
 * The library uses Apple's photo picker with no in-picker crop: asking for the crop makes iOS fall
 * back to the old picker, which loads the whole library first and sat silent for ~5 s on first open.
 * We crop the middle square ourselves. The picker gets the photo as it's stored (no HEIC re-encode)
 * and only the small copy is made here.
 */
export async function pickProfilePhoto(from: 'library' | 'camera' = 'library'): Promise<string | null> {
  const opts: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    quality: 1,
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
  };
  let r: ImagePicker.ImagePickerResult;
  if (from === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('Slabby needs the camera for this. Turn it on in Settings › Slabby.');
    r = await ImagePicker.launchCameraAsync({ ...opts, allowsEditing: true, aspect: [1, 1] });
  } else {
    r = await ImagePicker.launchImageLibraryAsync(opts);
  }
  const asset = r.canceled ? null : r.assets?.[0];
  if (!asset?.uri) return null;
  const side = Math.min(asset.width || AVATAR_PX, asset.height || AVATAR_PX);
  const crop =
    asset.width && asset.height
      ? [{ crop: { originX: Math.round((asset.width - side) / 2), originY: Math.round((asset.height - side) / 2), width: side, height: side } }]
      : [];
  const small = await manipulateAsync(asset.uri, [...crop, { resize: { width: AVATAR_PX, height: AVATAR_PX } }], {
    format: SaveFormat.JPEG,
    compress: 0.7,
    base64: true,
  });
  return small.base64 ? `data:image/jpeg;base64,${small.base64}` : null;
}
