// Appearance: follow the phone, or always light, or always dark. A pick-one sheet like Sort by.

import { useAppearance, type AppearanceMode } from '../../store/appearance';
import { openMenu } from './Menu';

export const APPEARANCE_LABEL: Record<AppearanceMode, string> = { system: 'System', light: 'Light', dark: 'Dark' };

const ORDER: AppearanceMode[] = ['system', 'light', 'dark'];

export function openAppearance() {
  const { mode, setMode } = useAppearance.getState();
  openMenu({
    title: 'Appearance',
    items: ORDER.map((m) => ({ label: APPEARANCE_LABEL[m], selected: m === mode, onPress: () => setMode(m) })),
  });
}
