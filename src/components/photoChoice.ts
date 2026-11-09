// Profile photo: Take photo / Choose from photos / Remove, on our own sheet. The picker or camera
// opens only once the sheet is fully gone: iOS drops a picker presented while another screen is
// still closing, which looked like "nothing happens".

import { pickProfilePhoto } from '../services/profile';
import { openMenu } from './menu/Menu';

/** Long enough for the sheet's native screen to finish closing before the picker opens. */
const SHEET_GONE_MS = 450;

export function choosePhoto(o: {
  hasPhoto: boolean;
  /** True from the tap until the photo is back (or you backed out): show a spinner meanwhile. */
  onBusy: (busy: boolean) => void;
  onPicked: (dataUri: string) => void;
  onRemove: () => void;
  onError: (message: string) => void;
}) {
  const run = (from: 'library' | 'camera') => {
    o.onBusy(true);
    setTimeout(() => {
      pickProfilePhoto(from)
        .then((p) => p && o.onPicked(p))
        .catch((e: Error) => o.onError(e?.message || 'Try again.'))
        .finally(() => o.onBusy(false));
    }, SHEET_GONE_MS);
  };
  openMenu({
    title: 'Profile photo',
    items: [
      { label: 'Take photo', onPress: () => run('camera') },
      { label: 'Choose from photos', onPress: () => run('library') },
      ...(o.hasPhoto ? [{ label: 'Remove photo', onPress: o.onRemove }] : []),
    ],
  });
}
