import { Platform } from 'react-native';
import { space } from '../theme/tokens';

/**
 * Top padding for a screen shown as an iOS sheet (presentation: 'modal'). The sheet already sits
 * below the status bar, so the safe-area top would leave a gap; elsewhere (web, a pushed page) the
 * inset applies as usual.
 */
export function sheetTop(insetTop: number, isSheet = true): number {
  return isSheet && Platform.OS === 'ios' ? space.s : insetTop;
}
