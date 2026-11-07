// useSheetDrag: pull a bottom sheet down from anywhere on it to dismiss it.
// SheetScrollView: the scroll view to use inside a sheet, so the pull and the scroll get along.
//
//   const sheet = useSheetDrag(close);
//   <Animated.View {...sheet.panHandlers} style={{ transform: [{ translateY: Animated.add(slide, sheet.drag) }] }}>
//     <SheetScope value={sheet.scope}>…<SheetScrollView>…</SheetScrollView>…</SheetScope>
//   </Animated.View>
//
// The gesture rules live in sheetGesture.ts (pure, unit-tested).

import { createContext, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, PanResponder, Platform, ScrollView, type ScrollViewProps } from 'react-native';
import { sheetPanConfig } from './sheetGesture';

const native = Platform.OS !== 'web';

/** What scroll views inside a sheet tell the sheet: which of them are scrolled away from the top. */
export type SheetScopeValue = { setScrolled: (id: string, scrolled: boolean) => void };

const Scope = createContext<SheetScopeValue | null>(null);

export function SheetScope({ value, children }: { value: SheetScopeValue; children: ReactNode }) {
  return <Scope.Provider value={value}>{children}</Scope.Provider>;
}

export function useSheetDrag(onDismiss: () => void) {
  const drag = useRef(new Animated.Value(0)).current;
  const scrolled = useRef(new Set<string>());
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  const pan = useRef(
    PanResponder.create(
      sheetPanConfig({
        canPull: () => scrolled.current.size === 0,
        onDrag: (dy) => drag.setValue(dy),
        onDismiss: () => dismissRef.current(),
        onCancel: () => Animated.spring(drag, { toValue: 0, useNativeDriver: native, bounciness: 0 }).start(),
      }),
    ),
  ).current;

  const scope = useMemo<SheetScopeValue>(
    () => ({
      setScrolled: (id, isScrolled) => {
        if (isScrolled) scrolled.current.add(id);
        else scrolled.current.delete(id);
      },
    }),
    [],
  );

  return {
    /** Add to the sheet's translateY. */
    drag,
    panHandlers: pan.panHandlers,
    scope,
    /** Put the sheet back at rest (call after it has closed, before it opens again). */
    reset: () => {
      drag.stopAnimation();
      drag.setValue(0);
      scrolled.current.clear();
    },
  };
}

/**
 * ScrollView for sheet content. No bounce (a bounce at the top would eat the pull), scrolling only
 * when the content is taller than the view (a short list is just rows), and it tells the sheet when
 * it's scrolled down so a downward drag scrolls back up first.
 */
export function SheetScrollView({ onScroll, onLayout, onContentSizeChange, scrollEventThrottle, ...rest }: ScrollViewProps) {
  const scope = useContext(Scope);
  const id = useId();
  const [box, setBox] = useState(0);
  const [content, setContent] = useState(0);
  const scrollable = content > box + 1;

  useEffect(() => () => scope?.setScrolled(id, false), [scope, id]);

  return (
    <ScrollView
      {...rest}
      bounces={false}
      alwaysBounceVertical={false}
      overScrollMode="never"
      scrollEnabled={rest.scrollEnabled ?? scrollable}
      scrollEventThrottle={scrollEventThrottle ?? 16}
      onLayout={(e) => {
        setBox(e.nativeEvent.layout.height);
        onLayout?.(e);
      }}
      onContentSizeChange={(w, h) => {
        setContent(h);
        onContentSizeChange?.(w, h);
      }}
      onScroll={(e) => {
        scope?.setScrolled(id, e.nativeEvent.contentOffset.y > 0);
        onScroll?.(e);
      }}
    />
  );
}
