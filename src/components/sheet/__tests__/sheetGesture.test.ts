// Pull-to-dismiss, driven through React Native's real PanResponder with simulated touches.
// The case that was broken: a drag that STARTS on a row or a button (which takes the touch first)
// must still end up pulling the sheet down.

import { PanResponder } from 'react-native';
import { DISMISS_DISTANCE, isPullDown, sheetPanConfig, shouldDismiss } from '../sheetGesture';

type Handlers = ReturnType<typeof PanResponder.create>['panHandlers'];

/** One finger, as the responder system reports it (touchHistory is what PanResponder reads). */
function finger(x0: number, y0: number) {
  let t = 1000;
  const track = {
    touchActive: true,
    startPageX: x0,
    startPageY: y0,
    startTimeStamp: t,
    currentPageX: x0,
    currentPageY: y0,
    currentTimeStamp: t,
    previousPageX: x0,
    previousPageY: y0,
    previousTimeStamp: t,
  };
  const history = { touchBank: [track], numberActiveTouches: 1, indexOfSingleActiveTouch: 0, mostRecentTimeStamp: t };
  const event = () => ({ nativeEvent: { touches: track.touchActive ? [{}] : [] }, touchHistory: history }) as never;
  return {
    event,
    move(dx: number, dy: number, ms = 16) {
      t += ms;
      track.previousPageX = track.currentPageX;
      track.previousPageY = track.currentPageY;
      track.previousTimeStamp = track.currentTimeStamp;
      track.currentPageX += dx;
      track.currentPageY += dy;
      track.currentTimeStamp = t;
      history.mostRecentTimeStamp = t;
      return event();
    },
    lift() {
      track.touchActive = false;
      history.numberActiveTouches = 0;
      return event();
    },
  };
}

/**
 * A sheet whose content (a row, a button, a list) takes the touch when the finger lands, which is
 * what Pressable and ScrollView do. Returns what happened to the sheet.
 */
function dragOnSheet(steps: [number, number][], opts: { scrolled?: boolean; ms?: number } = {}) {
  const log = { drags: [] as number[], dismissed: false, cancelled: false, granted: false };
  const pan = PanResponder.create(
    sheetPanConfig({
      canPull: () => !opts.scrolled,
      onDrag: (dy) => log.drags.push(dy),
      onDismiss: () => (log.dismissed = true),
      onCancel: () => (log.cancelled = true),
    }),
  );
  const h: Handlers = pan.panHandlers;
  const f = finger(200, 600);

  // Touch down: capture phase runs root → target. The sheet doesn't want a plain tap...
  expect(h.onStartShouldSetResponderCapture!(f.event())).toBe(false);
  // ...so the row under the finger becomes the responder.
  let sheetIsResponder = false;
  for (const [dx, dy] of steps) {
    const e = f.move(dx, dy, opts.ms);
    if (!sheetIsResponder) {
      // Each move, the capture phase asks the sheet (an ancestor) before the row.
      if (h.onMoveShouldSetResponderCapture!(e)) {
        // The row (Pressable) lets go when asked; the sheet is granted the touch.
        log.granted = true;
        sheetIsResponder = true;
        expect(h.onResponderGrant!(e)).toBe(true); // blocks native scrolling while pulling
      }
    } else {
      // Nothing can take the touch back mid-pull.
      expect(h.onResponderTerminationRequest!(e)).toBe(false);
      h.onResponderMove!(e);
    }
  }
  if (sheetIsResponder) h.onResponderRelease!(f.lift());
  return log;
}

describe('pull a sheet down from anywhere on it', () => {
  it('a slow pull that starts on a row closes the sheet', () => {
    const r = dragOnSheet(Array.from({ length: 12 }, () => [0, 10] as [number, number]), { ms: 40 });
    expect(r.granted).toBe(true);
    expect(Math.max(...r.drags)).toBeGreaterThan(DISMISS_DISTANCE);
    expect(r.dismissed).toBe(true);
  });

  it('a quick flick down closes it even when short', () => {
    const r = dragOnSheet([[0, 10], [0, 25], [0, 25]], { ms: 16 });
    expect(r.dismissed).toBe(true);
  });

  it('a short slow pull slides back instead', () => {
    const r = dragOnSheet([[0, 10], [0, 10], [0, 10]], { ms: 60 });
    expect(r.granted).toBe(true);
    expect(r.dismissed).toBe(false);
    expect(r.cancelled).toBe(true);
  });

  it('the sheet follows the finger but never goes above its resting place', () => {
    const r = dragOnSheet([[0, 10], [0, 30], [0, -80]], { ms: 60 });
    expect(r.drags.every((d) => d >= 0)).toBe(true);
    expect(r.drags[r.drags.length - 1]).toBe(0);
  });

  it('a sideways drag (segmented control, horizontal chips) is left to the control', () => {
    const r = dragOnSheet([[12, 2], [20, 3], [20, 4]]);
    expect(r.granted).toBe(false);
  });

  it('an upward drag is left alone (scrolls a list)', () => {
    const r = dragOnSheet([[0, -10], [0, -20]]);
    expect(r.granted).toBe(false);
  });

  it('while a list in the sheet is scrolled down, a downward drag scrolls it instead', () => {
    const r = dragOnSheet([[0, 10], [0, 40], [0, 60]], { scrolled: true });
    expect(r.granted).toBe(false);
    expect(r.dismissed).toBe(false);
  });

  it('a tap is still a tap', () => {
    const r = dragOnSheet([[0, 2], [1, 1]]);
    expect(r.granted).toBe(false);
  });
});

describe('gesture rules', () => {
  it('isPullDown', () => {
    expect(isPullDown({ dx: 0, dy: 10 })).toBe(true);
    expect(isPullDown({ dx: 0, dy: 3 })).toBe(false);
    expect(isPullDown({ dx: 10, dy: 10 })).toBe(false);
    expect(isPullDown({ dx: 0, dy: -20 })).toBe(false);
  });
  it('shouldDismiss', () => {
    expect(shouldDismiss({ dy: DISMISS_DISTANCE + 1, vy: 0 })).toBe(true);
    expect(shouldDismiss({ dy: 30, vy: 1.2 })).toBe(true);
    expect(shouldDismiss({ dy: 30, vy: 0.2 })).toBe(false);
    // Flicking back up after pulling never closes it.
    expect(shouldDismiss({ dy: 2, vy: 2 })).toBe(false);
  });
  it('the sheet claims the drag in the capture phase, so rows and buttons under the finger cannot keep it', () => {
    const cfg = sheetPanConfig({ canPull: () => true, onDrag: () => {}, onDismiss: () => {}, onCancel: () => {} });
    expect(cfg.onMoveShouldSetPanResponderCapture(null, { dx: 0, dy: 20, vy: 0 })).toBe(true);
    expect(cfg.onPanResponderTerminationRequest()).toBe(false);
  });
});
