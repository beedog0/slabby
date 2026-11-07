// Pull-down-to-dismiss for every bottom sheet, in one place so all sheets feel the same.
//
// The rule that makes it work anywhere on the sheet: the sheet takes the touch in the CAPTURE
// phase as soon as it is clearly a downward drag. Bubbling (onMoveShouldSetPanResponder) only
// reaches the sheet when nothing under the finger wants the touch, which in practice meant only
// the grabber and the title: rows, buttons, text fields and scroll views all claimed it first.
//
// A scroll view inside the sheet keeps its scroll: the sheet only takes a downward drag when every
// scroll view in it is at its top (see SheetScrollView), the same as an iOS sheet.
//
// Pure config (no React) so it can be unit-tested; useSheetDrag wraps it for components.

export type Gesture = { dx: number; dy: number; vy: number };

/** Movement before a drag counts as a pull. Small, so the sheet claims it before a list scrolls. */
export const PULL_SLOP = 6;
/** Release past this distance (pt) or faster than this speed (pt/ms) and the sheet closes. */
export const DISMISS_DISTANCE = 80;
export const DISMISS_VELOCITY = 0.8;

/** A mostly-vertical drag downward. Sideways drags (segmented controls, sliders) are left alone. */
export function isPullDown(g: Pick<Gesture, 'dx' | 'dy'>): boolean {
  return g.dy > PULL_SLOP && Math.abs(g.dy) > Math.abs(g.dx) * 1.5;
}

export function shouldDismiss(g: Pick<Gesture, 'dy' | 'vy'>): boolean {
  return g.dy > DISMISS_DISTANCE || (g.dy > PULL_SLOP && g.vy > DISMISS_VELOCITY);
}

export type SheetDragTarget = {
  /** False while a scroll view inside the sheet is scrolled down: then a downward drag scrolls. */
  canPull: () => boolean;
  /** Follow the finger (already clamped to ≥ 0). */
  onDrag: (dy: number) => void;
  /** Let go past the threshold. */
  onDismiss: () => void;
  /** Let go short of it, or the gesture was taken away: slide back. */
  onCancel: () => void;
};

/**
 * PanResponder config for a sheet. Spread into PanResponder.create(...).
 * Capture, not bubble, is the whole point; see the note at the top.
 */
export function sheetPanConfig(t: SheetDragTarget) {
  return {
    onMoveShouldSetPanResponderCapture: (_e: unknown, g: Gesture) => t.canPull() && isPullDown(g),
    // Also bubble, for the case nothing under the finger is a responder at all.
    onMoveShouldSetPanResponder: (_e: unknown, g: Gesture) => t.canPull() && isPullDown(g),
    // Once pulling, a row or a scroll view can't take the touch back mid-drag.
    onPanResponderTerminationRequest: () => false,
    // Block native responders (a ScrollView under the finger) while the sheet is being pulled.
    onShouldBlockNativeResponder: () => true,
    onPanResponderMove: (_e: unknown, g: Gesture) => t.onDrag(Math.max(0, g.dy)),
    onPanResponderRelease: (_e: unknown, g: Gesture) => (shouldDismiss(g) ? t.onDismiss() : t.onCancel()),
    onPanResponderTerminate: () => t.onCancel(),
  };
}
