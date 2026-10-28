import { useEffect, useState } from 'react';

export interface VisualViewportState {
  width: number;
  height: number;
  offsetTop: number;
  offsetLeft: number;
  pageTop: number;
  pageLeft: number;
  scale: number;
  isKeyboardOpen: boolean;
  keyboardHeight: number;
  isCompactLandscape: boolean;
}

/**
 * Reads the current visual viewport state from window.visualViewport
 * with fallbacks for browsers/environments that do not support it.
 */
export function readVisualViewportState(
  win: Window | typeof globalThis = typeof window !== 'undefined' ? window : ({} as Window)
): VisualViewportState {
  const vv = (win as Window).visualViewport;
  const innerWidth = (win as Window).innerWidth ?? 1024;
  const innerHeight = (win as Window).innerHeight ?? 768;

  const width = vv ? vv.width : innerWidth;
  const height = vv ? vv.height : innerHeight;
  const offsetTop = vv ? vv.offsetTop : 0;
  const offsetLeft = vv ? vv.offsetLeft : 0;
  const pageTop = vv ? vv.pageTop : 0;
  const pageLeft = vv ? vv.pageLeft : 0;
  const scale = vv ? vv.scale : 1;

  // On touch/mobile devices, virtual keyboard reduces visualViewport.height relative to window.innerHeight
  // When keyboard opens, height delta is typically >= 120px and scale is 1.
  const heightDelta = Math.max(0, innerHeight - height);
  const isKeyboardOpen = heightDelta > 120 && Math.abs(scale - 1) < 0.15;
  const keyboardHeight = isKeyboardOpen ? heightDelta : 0;

  // Compact landscape: small height (<= 450px) where horizontal space exceeds vertical space
  const isCompactLandscape = height <= 450 && width > height;

  return {
    width,
    height,
    offsetTop,
    offsetLeft,
    pageTop,
    pageLeft,
    scale,
    isKeyboardOpen,
    keyboardHeight,
    isCompactLandscape,
  };
}

/**
 * Sets CSS custom properties on document.documentElement for responsive styling and dvh fallback.
 */
export function syncViewportCssVariables(
  state: VisualViewportState,
  doc: Document = typeof document !== 'undefined' ? document : ({} as Document)
): void {
  if (!doc?.documentElement?.style) return;
  const style = doc.documentElement.style;
  style.setProperty('--visual-viewport-height', `${state.height}px`);
  style.setProperty('--visual-viewport-width', `${state.width}px`);
  style.setProperty('--visual-viewport-offset-top', `${state.offsetTop}px`);
  style.setProperty('--visual-viewport-offset-left', `${state.offsetLeft}px`);
  style.setProperty('--visual-viewport-scale', `${state.scale}`);
  style.setProperty('--keyboard-height', `${state.keyboardHeight}px`);
  style.setProperty('--is-keyboard-open', state.isKeyboardOpen ? '1' : '0');
  style.setProperty('--is-compact-landscape', state.isCompactLandscape ? '1' : '0');
}

/**
 * Subscribes to visual viewport resize & scroll events as well as window orientation changes.
 */
export function subscribeVisualViewport(
  callback: (state: VisualViewportState) => void,
  win: Window = typeof window !== 'undefined' ? window : ({} as Window),
  doc: Document = typeof document !== 'undefined' ? document : ({} as Document)
): () => void {
  const handleUpdate = () => {
    const state = readVisualViewportState(win);
    syncViewportCssVariables(state, doc);
    callback(state);
  };

  const vv = win.visualViewport;
  if (vv) {
    vv.addEventListener('resize', handleUpdate);
    vv.addEventListener('scroll', handleUpdate);
  }
  win.addEventListener?.('resize', handleUpdate);
  win.addEventListener?.('orientationchange', handleUpdate);

  // Sync immediately
  handleUpdate();

  return () => {
    if (vv) {
      vv.removeEventListener('resize', handleUpdate);
      vv.removeEventListener('scroll', handleUpdate);
    }
    win.removeEventListener?.('resize', handleUpdate);
    win.removeEventListener?.('orientationchange', handleUpdate);
  };
}

/**
 * Ensures an active element (e.g. focused input) is scrolled into view within the visual viewport,
 * avoiding occlusion from virtual keyboards or off-screen offset.
 */
export function ensureElementInVisualViewport(
  element: Element | null | undefined,
  win: Window = typeof window !== 'undefined' ? window : ({} as Window),
  options: { padding?: number; behavior?: ScrollBehavior } = {}
): boolean {
  if (!element || typeof element.getBoundingClientRect !== 'function') return false;

  const padding = options.padding ?? 16;
  const rect = element.getBoundingClientRect();
  const vv = win.visualViewport;

  const viewportTop = vv ? vv.offsetTop : 0;
  const viewportHeight = vv ? vv.height : (win.innerHeight ?? 768);
  const viewportBottom = viewportTop + viewportHeight;

  const isAbove = rect.top < viewportTop + padding;
  const isBelow = rect.bottom > viewportBottom - padding;

  if (isAbove || isBelow) {
    if (typeof element.scrollIntoView === 'function') {
      element.scrollIntoView({
        behavior: options.behavior ?? 'smooth',
        block: isAbove ? 'start' : 'nearest',
        inline: 'nearest',
      });
    }
    return true;
  }
  return false;
}

/**
 * React hook that connects components to the Visual Viewport API,
 * synchronizing state and CSS variables.
 * Centralizes focus auto-scrolling when autoScrollOnFocus is enabled.
 */
export function useVisualViewport(
  options: { autoScrollOnFocus?: boolean; win?: Window; doc?: Document } = {}
): VisualViewportState {
  const win = options.win ?? (typeof window !== 'undefined' ? window : ({} as Window));
  const doc = options.doc ?? (typeof document !== 'undefined' ? document : ({} as Document));

  const [state, setState] = useState<VisualViewportState>(() => readVisualViewportState(win));

  useEffect(() => {
    const unsubscribe = subscribeVisualViewport(setState, win, doc);
    return unsubscribe;
  }, [win, doc]);

  // Centralized focusin handler: ensures focused inputs are in visual viewport
  useEffect(() => {
    if (!options.autoScrollOnFocus) return;

    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
        ensureElementInVisualViewport(target, win);
      }
    };

    doc.addEventListener?.('focusin', handleFocusIn as EventListener);
    return () => {
      doc.removeEventListener?.('focusin', handleFocusIn as EventListener);
    };
  }, [options.autoScrollOnFocus, doc, win]);

  // Readjust active element whenever viewport dimensions or offsets change,
  // regardless of keyboard heuristic (e.g. interactive-widget=resizes-content)
  useEffect(() => {
    if (!options.autoScrollOnFocus) return;
    const active = doc?.activeElement;
    if (active instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName)) {
      ensureElementInVisualViewport(active, win);
    }
  }, [state.height, state.width, state.offsetTop, state.offsetLeft, options.autoScrollOnFocus, doc, win]);

  return state;
}

/**
 * React hook to listen to a media query matching against the layout viewport.
 * Avoids visual-viewport / pinch-zoom desynchronization with CSS media queries.
 */
export function useMediaQuery(
  query: string,
  win: Window | typeof globalThis = typeof window !== 'undefined' ? window : ({} as Window)
): boolean {
  const getMatches = (): boolean => {
    const w = win as Window;
    if (typeof w.matchMedia === 'function') {
      return w.matchMedia(query).matches;
    }
    // Fallback if matchMedia is unavailable in test / SSR environment
    if (query.includes('max-width: 760px')) {
      return (w.innerWidth ?? 1024) <= 760;
    }
    return false;
  };

  const [matches, setMatches] = useState<boolean>(getMatches);

  useEffect(() => {
    const w = win as Window;
    if (typeof w.matchMedia !== 'function') return;

    const media = w.matchMedia(query);
    setMatches(media.matches);

    const listener = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    if (media.addEventListener) {
      media.addEventListener('change', listener);
      return () => media.removeEventListener('change', listener);
    } else if (media.addListener) {
      media.addListener(listener);
      return () => media.removeListener(listener);
    }
  }, [query, win]);

  return matches;
}
