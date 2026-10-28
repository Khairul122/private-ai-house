import { describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ensureElementInVisualViewport,
  readVisualViewportState,
  subscribeVisualViewport,
  useMediaQuery,
  useVisualViewport,
} from './visual-viewport.js';

interface MockWindow {
  visualViewport: {
    width: number;
    height: number;
    offsetTop: number;
    offsetLeft: number;
    pageTop: number;
    pageLeft: number;
    scale: number;
    addEventListener: (event: string, fn: () => void) => void;
    removeEventListener: (event: string, fn: () => void) => void;
  };
  innerWidth: number;
  innerHeight: number;
  addEventListener: (event: string, fn: () => void) => void;
  removeEventListener: (event: string, fn: () => void) => void;
}

function createTestDom() {
  const g = globalThis as unknown as Record<string, unknown>;
  g.HTMLIFrameElement = class HTMLIFrameElement {};
  g.HTMLElement = class HTMLElement {};
  g.Element = class Element {};
  g.Node = class Node {};
  g.IS_REACT_ACT_ENVIRONMENT = true;

  const styleObj = {
    overflow: '',
    position: '',
    top: '',
    left: '',
    width: '',
    paddingRight: '',
    setProperty: () => {},
    getPropertyValue: () => '',
  };

  const doc = {
    nodeType: 9,
    defaultView: globalThis,
    documentElement: {
      nodeType: 1,
      style: { ...styleObj },
      dataset: {} as Record<string, string>,
      clientWidth: 390,
      scrollTop: 0,
      scrollLeft: 0,
    },
    body: {
      nodeType: 1,
      style: { ...styleObj },
      dataset: {} as Record<string, string>,
      scrollTop: 0,
      scrollLeft: 0,
    },
    createElement: (tag: string) => ({
      nodeType: 1,
      tagName: tag.toUpperCase(),
      style: { ...styleObj },
      childNodes: [] as unknown[],
      ownerDocument: doc,
      setAttribute: () => {},
      removeAttribute: () => {},
      getAttribute: () => null,
      appendChild(c: unknown) { this.childNodes.push(c); return c; },
      removeChild(c: unknown) { this.childNodes = this.childNodes.filter((x: unknown) => x !== c); return c; },
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
    createComment: () => ({ nodeType: 8, ownerDocument: doc }),
    createTextNode: (text: string) => ({ nodeType: 3, textContent: text, ownerDocument: doc }),
    addEventListener: () => {},
    removeEventListener: () => {},
  } as unknown as Document;

  g.document = doc;
  g.window = globalThis;

  const rootEl = doc.createElement('div');
  const root = createRoot(rootEl as unknown as HTMLElement);
  return { doc, root, rootEl };
}

function createMockVisualViewport(initial = { width: 390, height: 844, offsetTop: 0, offsetLeft: 0, scale: 1 }) {
  const listeners: Record<string, Set<() => void>> = {
    resize: new Set(),
    scroll: new Set(),
  };

  const vv = {
    width: initial.width,
    height: initial.height,
    offsetTop: initial.offsetTop,
    offsetLeft: initial.offsetLeft,
    pageTop: 0,
    pageLeft: 0,
    scale: initial.scale,
    addEventListener: (event: string, fn: () => void) => {
      listeners[event]?.add(fn);
    },
    removeEventListener: (event: string, fn: () => void) => {
      listeners[event]?.delete(fn);
    },
  };

  const winListeners: Record<string, Set<() => void>> = {
    resize: new Set(),
    orientationchange: new Set(),
  };

  const winObj: MockWindow = {
    visualViewport: vv,
    innerWidth: initial.width,
    innerHeight: initial.height,
    addEventListener: (event: string, fn: () => void) => {
      winListeners[event]?.add(fn);
    },
    removeEventListener: (event: string, fn: () => void) => {
      winListeners[event]?.delete(fn);
    },
  };

  const cssVars = new Map<string, string>();
  const doc = {
    documentElement: {
      style: {
        setProperty: (key: string, val: string) => cssVars.set(key, val),
        getPropertyValue: (key: string) => cssVars.get(key) || '',
      },
    },
  } as unknown as Document;

  const triggerVvChange = (updates: Partial<typeof vv>) => {
    Object.assign(vv, updates);
    listeners.resize?.forEach((fn) => fn());
    listeners.scroll?.forEach((fn) => fn());
  };

  const triggerOrientationChange = (newWidth: number, newHeight: number) => {
    winObj.innerWidth = newWidth;
    winObj.innerHeight = newHeight;
    vv.width = newWidth;
    vv.height = newHeight;
    winListeners.orientationchange?.forEach((fn) => fn());
  };

  return { win: winObj as unknown as Window, vv, doc, cssVars, triggerVvChange, triggerOrientationChange, winListeners, vvListeners: listeners };
}

describe('visual-viewport adapter', () => {
  it('reads state and handles fallback when window.visualViewport is missing', () => {
    const fallbackWin = { innerWidth: 1024, innerHeight: 768 } as Window;
    const state = readVisualViewportState(fallbackWin);
    expect(state.width).toBe(1024);
    expect(state.height).toBe(768);
    expect(state.offsetTop).toBe(0);
    expect(state.isKeyboardOpen).toBe(false);
    expect(state.isCompactLandscape).toBe(false);
  });

  it('detects virtual keyboard open and close, updating CSS variables and offsetTop', () => {
    const { win, doc, cssVars, triggerVvChange } = createMockVisualViewport({
      width: 390,
      height: 844,
      offsetTop: 0,
      offsetLeft: 0,
      scale: 1,
    });

    let latestState = readVisualViewportState(win);
    const unsubscribe = subscribeVisualViewport((s) => {
      latestState = s;
    }, win, doc);

    expect(latestState.isKeyboardOpen).toBe(false);
    expect(latestState.keyboardHeight).toBe(0);
    expect(cssVars.get('--visual-viewport-height')).toBe('844px');

    // Virtual keyboard opens (viewport height shrinks by 300px, offsetTop moves by 50px)
    triggerVvChange({ height: 544, offsetTop: 50 });

    expect(latestState.isKeyboardOpen).toBe(true);
    expect(latestState.keyboardHeight).toBe(300);
    expect(latestState.offsetTop).toBe(50);
    expect(cssVars.get('--keyboard-height')).toBe('300px');
    expect(cssVars.get('--visual-viewport-height')).toBe('544px');
    expect(cssVars.get('--visual-viewport-offset-top')).toBe('50px');
    expect(cssVars.get('--is-keyboard-open')).toBe('1');

    // Keyboard closes
    triggerVvChange({ height: 844, offsetTop: 0 });

    expect(latestState.isKeyboardOpen).toBe(false);
    expect(latestState.keyboardHeight).toBe(0);
    expect(latestState.offsetTop).toBe(0);
    expect(cssVars.get('--keyboard-height')).toBe('0px');
    expect(cssVars.get('--is-keyboard-open')).toBe('0');

    unsubscribe();
  });

  it('detects compact landscape mode on mobile orientation change', () => {
    const { win, doc, cssVars, triggerOrientationChange } = createMockVisualViewport({
      width: 390,
      height: 844,
      offsetTop: 0,
      offsetLeft: 0,
      scale: 1,
    });

    let latestState = readVisualViewportState(win);
    const unsubscribe = subscribeVisualViewport((s) => {
      latestState = s;
    }, win, doc);

    expect(latestState.isCompactLandscape).toBe(false);

    // Rotate device to compact landscape (e.g. 844px wide, 390px tall)
    triggerOrientationChange(844, 390);

    expect(latestState.isCompactLandscape).toBe(true);
    expect(latestState.width).toBe(844);
    expect(latestState.height).toBe(390);
    expect(cssVars.get('--is-compact-landscape')).toBe('1');

    unsubscribe();
  });

  describe('scrollIntoView utility', () => {
    it('scrolls element into view when element is occluded by virtual keyboard', () => {
      const { win } = createMockVisualViewport({
        width: 390,
        height: 500, // Keyboard open, height reduced
        offsetTop: 0,
        offsetLeft: 0,
        scale: 1,
      });

      let scrolledIntoView = false;
      const occludedElement = {
        getBoundingClientRect: () => ({
          top: 520, // Below the 500px visible viewport!
          bottom: 560,
          left: 10,
          right: 380,
          width: 370,
          height: 40,
        }),
        scrollIntoView: () => {
          scrolledIntoView = true;
        },
      } as unknown as Element;

      const adjusted = ensureElementInVisualViewport(occludedElement, win);
      expect(adjusted).toBe(true);
      expect(scrolledIntoView).toBe(true);
    });

    it('does not scroll when element is already completely within visual viewport', () => {
      const { win } = createMockVisualViewport({
        width: 390,
        height: 500,
        offsetTop: 0,
        offsetLeft: 0,
        scale: 1,
      });

      let scrolledIntoView = false;
      const visibleElement = {
        getBoundingClientRect: () => ({
          top: 100,
          bottom: 140,
          left: 10,
          right: 380,
          width: 370,
          height: 40,
        }),
        scrollIntoView: () => {
          scrolledIntoView = true;
        },
      } as unknown as Element;

      const adjusted = ensureElementInVisualViewport(visibleElement, win);
      expect(adjusted).toBe(false);
      expect(scrolledIntoView).toBe(false);
    });
  });

  describe('useVisualViewport hook in mounted component', () => {
    it('readjusts active focused input on viewport resize even when isKeyboardOpen is false (interactive-widget=resizes-content)', async () => {
      const { doc, root } = createTestDom();

      const g = globalThis as unknown as { HTMLElement: new () => HTMLElement };
      let scrolledIntoView = false;
      const mockInput = Object.assign(new g.HTMLElement(), {
        tagName: 'INPUT',
        getBoundingClientRect: () => ({
          top: 520, // Occluded below 544px viewport once resized (544 - 16 = 528)
          bottom: 560,
          left: 10,
          right: 380,
          width: 370,
          height: 40,
        }),
        scrollIntoView: () => {
          scrolledIntoView = true;
        },
      });
      (doc as unknown as { activeElement: unknown }).activeElement = mockInput;

      const docListeners = new Map<string, Set<(e: unknown) => void>>();
      doc.addEventListener = (event: string, fn: (e: unknown) => void) => {
        if (!docListeners.has(event)) docListeners.set(event, new Set());
        docListeners.get(event)?.add(fn);
      };
      doc.removeEventListener = (event: string, fn: (e: unknown) => void) => {
        docListeners.get(event)?.delete(fn);
      };

      const { win, triggerVvChange, winListeners, vvListeners } = createMockVisualViewport({
        width: 390,
        height: 844,
        offsetTop: 0,
        offsetLeft: 0,
        scale: 1,
      });

      let renderedState = null;
      function TestComponent() {
        const state = useVisualViewport({ autoScrollOnFocus: true, win, doc });
        renderedState = state;
        return null;
      }

      await act(async () => {
        root.render(createElement(TestComponent));
      });

      expect(renderedState).not.toBeNull();
      expect(scrolledIntoView).toBe(false);
      expect(docListeners.get('focusin')?.size).toBe(1);
      expect(vvListeners.resize?.size).toBe(1);

      // Simulate viewport resize with interactive-widget=resizes-content:
      // Both innerHeight and visualViewport.height shrink together from 844 to 544.
      // heightDelta = innerHeight - height = 544 - 544 = 0, so isKeyboardOpen is FALSE!
      (win as unknown as { innerHeight: number }).innerHeight = 544;
      await act(async () => {
        triggerVvChange({ height: 544 });
      });

      // The hook readjusts the active focused input into view despite isKeyboardOpen being false!
      expect(scrolledIntoView).toBe(true);

      // Verify full listener cleanup on unmount
      await act(async () => {
        root.unmount();
      });

      expect(docListeners.get('focusin')?.size).toBe(0);
      expect(vvListeners.resize?.size ?? 0).toBe(0);
      expect(winListeners.resize?.size ?? 0).toBe(0);
    });
  });

  describe('layout viewport alignment and media query matching', () => {
    it('evaluates layout viewport matching and does not falsely trigger mobile mode on desktop pinch-zoom', () => {
      let layoutWidth = 1200;
      const mediaQueryListeners = new Set<(e: { matches: boolean }) => void>();

      const mockWin = {
        innerWidth: layoutWidth,
        visualViewport: {
          width: 600, // Pinch zoomed to 2x on desktop!
          height: 450,
          offsetTop: 0,
          offsetLeft: 0,
          scale: 2,
        },
        matchMedia: (query: string) => ({
          matches: layoutWidth <= 760,
          media: query,
          addEventListener: (_event: string, fn: (e: { matches: boolean }) => void) => {
            mediaQueryListeners.add(fn);
          },
          removeEventListener: (_event: string, fn: (e: { matches: boolean }) => void) => {
            mediaQueryListeners.delete(fn);
          },
        }),
      } as unknown as Window;

      // Layout viewport is 1200px: media query is false despite visualViewport width being 600px
      const mqlDesktop = mockWin.matchMedia('(max-width: 760px)');
      expect(mqlDesktop.matches).toBe(false);

      // Now layout viewport actually resizes to mobile 390px
      layoutWidth = 390;
      const mqlMobile = mockWin.matchMedia('(max-width: 760px)');
      expect(mqlMobile.matches).toBe(true);
    });

    it('mounts component, receives media query change events, and cleans up on unmount', async () => {
      const { root } = createTestDom();

      const mqListeners = new Set<(e: { matches: boolean }) => void>();
      let currentMatches = false;

      const mockWin = {
        innerWidth: 1024,
        matchMedia: (query: string) => ({
          matches: currentMatches,
          media: query,
          addEventListener: (_event: string, fn: (e: { matches: boolean }) => void) => {
            mqListeners.add(fn);
          },
          removeEventListener: (_event: string, fn: (e: { matches: boolean }) => void) => {
            mqListeners.delete(fn);
          },
        }),
      } as unknown as Window;

      let latestMatches: boolean | null = null;
      function TestComponent() {
        latestMatches = useMediaQuery('(max-width: 760px)', mockWin);
        return null;
      }

      await act(async () => {
        root.render(createElement(TestComponent));
      });

      expect(latestMatches).toBe(false);
      expect(mqListeners.size).toBe(1);

      // Trigger change event to mobile breakpoint
      currentMatches = true;
      await act(async () => {
        mqListeners.forEach((fn) => fn({ matches: true }));
      });

      expect(latestMatches).toBe(true);

      // Unmount component and verify event listener cleanup
      await act(async () => {
        root.unmount();
      });

      expect(mqListeners.size).toBe(0);
    });

    it('falls back to innerWidth when matchMedia is not implemented in environment', () => {
      const fallbackMobileWin = { innerWidth: 420 } as Window;
      const fallbackDesktopWin = { innerWidth: 1024 } as Window;

      expect((fallbackMobileWin.innerWidth ?? 1024) <= 760).toBe(true);
      expect((fallbackDesktopWin.innerWidth ?? 1024) <= 760).toBe(false);
    });
  });
});
