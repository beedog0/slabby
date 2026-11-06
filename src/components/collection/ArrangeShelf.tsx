// Arrange shelf: press and hold a slab until it lifts, drag it to a new spot, let go. The other
// slabs slide aside as it passes, across shelves too. The ledges stay put; only slabs move.
// Built on PanResponder + Animated (no gesture library), the same tools as the menu sheet.
// Same size and spacing as the normal shelf (Bryan didn't want a zoomed-out arrange view);
// holding a slab near the top or bottom edge scrolls the page to reach far shelves.

import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Platform, Pressable, View } from 'react-native';
import { dropOrder, moveTo, slotAt } from '../../pricing/arrange';
import type { CardRow } from '../../pricing/portfolio';
import { motion, size, space } from '../../theme/tokens';
import { SlabView } from '../SlabView';
import { Ledge, SHELF_GAP, shelfLayout } from './ShelfView';

const native = Platform.OS !== 'web';
/** How close to the screen edge (pt) a lifted slab starts the page scrolling, and how fast. */
const EDGE = 90;
const EDGE_SPEED = 9;

/** The page around the shelf, so a lifted slab can scroll it. */
export type PageScroll = {
  /** Current scroll offset. */
  y: () => number;
  /** Scroll by this much (clamped by the page); returns how far it actually moved. */
  by: (dy: number) => number;
  /** Visible band of the screen in page coordinates (pageY). */
  band: () => { top: number; bottom: number };
};

type Props = {
  rows: CardRow[];
  width: number;
  /** The pinned slab stays first and can't be moved. */
  pinnedId?: string | null;
  /** Saved order as it is now; slabs hidden by a tab or search keep their places after the shown ones. */
  order: string[];
  onOrder: (order: string[]) => void;
  /** True while a slab is lifted, so the page stops scrolling under the finger. */
  onDragChange?: (dragging: boolean) => void;
  scroll?: PageScroll;
  /** Slabs per shelf, 1 to 5. */
  perRow: number;
};

export function ArrangeShelf({ rows, width, pinnedId, order, onOrder, onDragChange, scroll, perRow: PER_ROW }: Props) {
  const { slabW, gap: GAP, left: INSET } = shelfLayout(width, PER_ROW);
  const slabH = (slabW * size.heroH) / size.heroW;
  // One shelf: slabs rest 2 pt into the ledge, then the ledge, then the gap to the next shelf.
  const pitch = slabH - 2 + size.shelfTop + size.shelfFront + SHELF_GAP;
  const step = slabW + GAP;
  const slot = (i: number) => ({ x: INSET + (i % PER_ROW) * step, y: Math.floor(i / PER_ROW) * pitch });

  const [ids, setIds] = useState(() => rows.map((r) => r.card.id));
  const idsRef = useRef(ids);
  idsRef.current = ids;
  const [lifted, setLifted] = useState<string | null>(null);
  const liftedRef = useRef<string | null>(null);
  const byId = useMemo(() => new Map(rows.map((r) => [r.card.id, r])), [rows]);

  // Follow the list from outside (a slab added or removed) when nothing is being dragged.
  useEffect(() => {
    if (!liftedRef.current) setIds(rows.map((r) => r.card.id));
  }, [rows]);

  const xy = useRef(new Map<string, Animated.ValueXY>()).current;
  const scale = useRef(new Map<string, Animated.Value>()).current;
  const valueFor = (id: string, i: number) => {
    if (!xy.has(id)) xy.set(id, new Animated.ValueXY(slot(i)));
    if (!scale.has(id)) scale.set(id, new Animated.Value(1));
    return { pos: xy.get(id)!, scale: scale.get(id)! };
  };

  // Every slab but the lifted one glides to its slot whenever the order or size changes.
  useEffect(() => {
    ids.forEach((id, i) => {
      if (id === lifted) return;
      Animated.spring(valueFor(id, i).pos, { toValue: slot(i), useNativeDriver: native, bounciness: 0, speed: 18 }).start();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, lifted, slabW, PER_ROW]);

  const start = useRef({ x: 0, y: 0 });
  // Page scroll since the lift, so the slab stays under the finger while the page moves.
  const scrolled = useRef(0);
  const last = useRef({ dx: 0, dy: 0, pageY: 0 });
  const edgeLoop = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopEdge = () => {
    if (edgeLoop.current) clearInterval(edgeLoop.current);
    edgeLoop.current = null;
  };
  useEffect(() => stopEdge, []);

  const lift = (id: string) => {
    if (id === pinnedId) return;
    const i = idsRef.current.indexOf(id);
    start.current = slot(i);
    scrolled.current = 0;
    last.current = { dx: 0, dy: 0, pageY: 0 };
    liftedRef.current = id;
    setLifted(id);
    onDragChange?.(true);
    if (native) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    Animated.timing(valueFor(id, i).scale, { toValue: 1.06, duration: motion.dropIn, useNativeDriver: native }).start();
  };

  const move = (dx: number, dy: number, pageY?: number) => {
    const id = liftedRef.current;
    if (!id) return;
    last.current = { dx, dy, pageY: pageY ?? last.current.pageY };
    const p = { x: start.current.x + dx, y: start.current.y + dy + scrolled.current };
    xy.get(id)?.setValue(p);
    const list = idsRef.current;
    const lowest = pinnedId && list[0] === pinnedId ? 1 : 0;
    const to = Math.max(lowest, slotAt(p.x + slabW / 2, p.y + slabH / 2, { cols: PER_ROW, inset: INSET - GAP / 2, step, pitch, count: list.length }));
    if (list.indexOf(id) !== to) {
      const next = moveTo(list, id, to);
      idsRef.current = next;
      setIds(next);
      if (native) Haptics.selectionAsync().catch(() => {});
    }
    edge();
  };

  // Near the top or bottom edge: keep scrolling the page while the slab is held there.
  const edge = () => {
    if (!scroll || !liftedRef.current) return stopEdge();
    const { top, bottom } = scroll.band();
    const y = last.current.pageY;
    const dir = y && y < top + EDGE ? -1 : y && y > bottom - EDGE ? 1 : 0;
    if (!dir) return stopEdge();
    if (edgeLoop.current) return;
    edgeLoop.current = setInterval(() => {
      const { top: t, bottom: b } = scroll.band();
      const py = last.current.pageY;
      const d = py < t + EDGE ? -1 : py > b - EDGE ? 1 : 0;
      const moved = d ? scroll.by(d * EDGE_SPEED) : 0;
      if (!moved || !liftedRef.current) return stopEdge();
      scrolled.current += moved;
      handlers.current.move(last.current.dx, last.current.dy);
    }, 16);
  };

  const drop = () => {
    stopEdge();
    const id = liftedRef.current;
    if (!id) return;
    const i = idsRef.current.indexOf(id);
    liftedRef.current = null;
    Animated.parallel([
      Animated.spring(xy.get(id)!, { toValue: slot(i), useNativeDriver: native, bounciness: 0, speed: 18 }),
      Animated.timing(scale.get(id)!, { toValue: 1, duration: motion.dropOut, useNativeDriver: native }),
    ]).start(() => setLifted(null));
    onDragChange?.(false);
    onOrder(dropOrder(order, idsRef.current));
  };

  // One responder for the whole shelf; it only takes the touch once a slab has lifted.
  const handlers = useRef({ move, drop });
  handlers.current = { move, drop };
  const panning = useRef(false);
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: () => !!liftedRef.current,
      onMoveShouldSetPanResponderCapture: () => !!liftedRef.current,
      onPanResponderGrant: () => {
        panning.current = true;
      },
      onPanResponderMove: (e, g) => handlers.current.move(g.dx, g.dy, e.nativeEvent.pageY),
      onPanResponderRelease: () => {
        panning.current = false;
        handlers.current.drop();
      },
      onPanResponderTerminate: () => {
        panning.current = false;
        handlers.current.drop();
      },
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;

  const shelves = Math.max(1, Math.ceil(ids.length / PER_ROW));
  return (
    <View {...pan.panHandlers} style={{ height: shelves * pitch - SHELF_GAP }}>
      {Array.from({ length: shelves }, (_, s) => (
        <View key={s} style={{ position: 'absolute', left: 0, right: 0, top: s * pitch + slabH - 2 }}>
          <Ledge />
        </View>
      ))}
      {ids.map((id, i) => {
        const row = byId.get(id);
        if (!row) return null;
        const v = valueFor(id, i);
        const up = id === lifted;
        return (
          <Animated.View
            key={id}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              zIndex: up ? 10 : 1,
              transform: [{ translateX: v.pos.x }, { translateY: v.pos.y }, { scale: v.scale }],
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityHint={id === pinnedId ? 'Pinned slabs stay first' : 'Hold, then drag to move'}
              delayLongPress={220}
              onLongPress={() => lift(id)}
              onPressOut={() => {
                // Lifted and let go without moving: the shelf never took the touch, so drop here.
                // Deferred a tick: when a drag starts, the shelf's grant lands around this call.
                setTimeout(() => {
                  if (liftedRef.current === id && !panning.current) handlers.current.drop();
                }, 0);
              }}
              style={{ opacity: id === pinnedId ? 0.5 : 1 }}
            >
              <SlabView card={row.card} width={slabW} posed={false} />
            </Pressable>
          </Animated.View>
        );
      })}
    </View>
  );
}
