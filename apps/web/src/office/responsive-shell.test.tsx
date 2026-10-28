import { describe, expect, it } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { getScrollLockState, isScrollLocked, useScrollLock } from './scroll-lock.js';
import { syncViewportCssVariables, useMediaQuery, useVisualViewport } from './visual-viewport.js';

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

describe('Responsive shell integration and state preservation', () => {
  it('preserves route, form state, and query params in mounted component across breakpoint shifts', async () => {
    const { root } = createTestDom();

    let currentRoute = '';
    let currentSearchInput = '';
    let setInputVal: (val: string) => void = () => {};

    const listeners = {
      vvResize: new Set<() => void>(),
      winResize: new Set<() => void>(),
      mqChange: new Set<(e: { matches: boolean }) => void>(),
    };

    const mockVv = {
      width: 1200,
      height: 900,
      offsetTop: 0,
      offsetLeft: 0,
      pageTop: 0,
      pageLeft: 0,
      scale: 1,
      addEventListener: (_ev: string, fn: () => void) => { listeners.vvResize.add(fn); },
      removeEventListener: (_ev: string, fn: () => void) => { listeners.vvResize.delete(fn); },
    };

    const mockWinObj = {
      innerWidth: 1200,
      innerHeight: 900,
      visualViewport: mockVv,
      addEventListener: (_ev: string, fn: () => void) => { listeners.winResize.add(fn); },
      removeEventListener: (_ev: string, fn: () => void) => { listeners.winResize.delete(fn); },
      matchMedia: (query: string) => ({
        matches: mockWinObj.innerWidth <= 760,
        media: query,
        addEventListener: (_ev: string, fn: (e: { matches: boolean }) => void) => { listeners.mqChange.add(fn); },
        removeEventListener: (_ev: string, fn: (e: { matches: boolean }) => void) => { listeners.mqChange.delete(fn); },
      }),
    };
    const mockWin = mockWinObj as unknown as Window;

    function TestFormComponent() {
      const loc = useLocation();
      const [inputState, setInputState] = useState('fullstack developer');
      const isMobile = useMediaQuery('(max-width: 760px)', mockWin);
      const viewport = useVisualViewport({ win: mockWin });

      setInputVal = setInputState;
      currentRoute = `${loc.pathname}${loc.search}`;
      currentSearchInput = inputState;

      return createElement('div', {
        'data-route': currentRoute,
        'data-input': inputState,
        'data-mobile': String(isMobile),
        'data-width': String(viewport.width),
      });
    }

    await act(async () => {
      root.render(
        createElement(
          MemoryRouter,
          { initialEntries: ['/opportunities?source=projects_co_id'] },
          createElement(TestFormComponent)
        )
      );
    });

    expect(currentRoute).toBe('/opportunities?source=projects_co_id');
    expect(currentSearchInput).toBe('fullstack developer');

    // Simulate user editing the input
    await act(async () => {
      setInputVal('react three fiber engineer');
    });
    expect(currentSearchInput).toBe('react three fiber engineer');

    // Breakpoints: desktop (1200), tablet (760), mobile (390), compact landscape (844x390), ultra-compact (360)
    const breakpointSteps = [
      { width: 760, height: 1024, isMobile: true },
      { width: 390, height: 844, isMobile: true },
      { width: 844, height: 390, isMobile: false }, // compact landscape
      { width: 360, height: 640, isMobile: true },
      { width: 1440, height: 900, isMobile: false }, // back to large desktop
    ];

    for (const step of breakpointSteps) {
      mockWinObj.innerWidth = step.width;
      mockWinObj.innerHeight = step.height;
      mockVv.width = step.width;
      mockVv.height = step.height;

      await act(async () => {
        listeners.vvResize.forEach((fn) => fn());
        listeners.winResize.forEach((fn) => fn());
        listeners.mqChange.forEach((fn) => fn({ matches: step.isMobile }));
      });

      // Assert router location, query parameters, and form input state are completely preserved!
      expect(currentRoute).toBe('/opportunities?source=projects_co_id');
      expect(currentSearchInput).toBe('react three fiber engineer');
    }

    await act(async () => {
      root.unmount();
    });
  });

  it('manages scroll lock lifecycle in mounted component when drawer opens and closes', async () => {
    const { doc, root } = createTestDom();

    let currentScrollY = 200;
    const mockWin = {
      scrollX: 0,
      scrollY: currentScrollY,
      pageXOffset: 0,
      pageYOffset: currentScrollY,
      innerWidth: 390,
      getComputedStyle: () => ({ paddingRight: '0px' }),
      scrollTo: (_x: number, y: number) => {
        currentScrollY = y;
      },
    } as unknown as Window;

    (doc.documentElement as unknown as { clientWidth: number }).clientWidth = 390;
    (doc.documentElement as unknown as { scrollTop: number }).scrollTop = 200;

    let setDrawerOpen: (open: boolean) => void = () => {};

    function DrawerWrapper() {
      const [isOpen, setIsOpen] = useState(false);
      setDrawerOpen = setIsOpen;
      useScrollLock(isOpen, 'test-drawer', doc, mockWin);
      return null;
    }

    await act(async () => {
      root.render(createElement(DrawerWrapper));
    });

    // 1. Initial state: unlocked
    expect(isScrollLocked(doc)).toBe(false);
    expect(doc.body.style.position).toBe('');

    // 2. Open drawer: scroll lock acquired, position fixed at -200px
    await act(async () => {
      setDrawerOpen(true);
    });

    expect(isScrollLocked(doc)).toBe(true);
    expect(doc.body.style.overflow).toBe('hidden');
    expect(doc.body.style.position).toBe('fixed');
    expect(doc.body.style.top).toBe('-200px');
    expect(getScrollLockState().scrollY).toBe(200);

    // 3. Close drawer: lock released, position and scroll position restored
    await act(async () => {
      setDrawerOpen(false);
    });

    expect(isScrollLocked(doc)).toBe(false);
    expect(doc.body.style.overflow).toBe('');
    expect(doc.body.style.position).toBe('');
    expect(currentScrollY).toBe(200);

    await act(async () => {
      root.unmount();
    });
  });

  it('verifies single-compensation model in styles.css to eliminate double keyboard padding', () => {
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const cssPath = resolve(currentDir, '../styles.css');
    const css = readFileSync(cssPath, 'utf-8');

    // Verify .vo3d-panel mobile rules:
    // bottom should only use safe-area and must NOT contain --keyboard-height
    const panelRuleMatch = css.match(/\.vo3d-panel\s*\{([^}]*bottom:\s*env\(safe-area-inset-bottom,\s*0px\);[^}]*)\}/);
    expect(panelRuleMatch).not.toBeNull();
    const panelRules = panelRuleMatch?.[1] || '';

    expect(panelRules).toContain('bottom: env(safe-area-inset-bottom, 0px);');
    expect(panelRules).not.toContain('--keyboard-height');
    expect(panelRules).toContain('max-height: min(55%, calc(var(--visual-viewport-height, 100dvh) - 80px));');
    expect(panelRules).toContain('overscroll-behavior: contain;');

    // Verify .vo3d-tablet-body rules:
    // padding-bottom should only use safe-area and must NOT contain --keyboard-height
    const tabletBodyMatch = css.match(/\.vo3d-tablet-body\.vo3d-sheet-body\.page-content\s*\{([^}]*padding-bottom[^}]*)\}/);
    expect(tabletBodyMatch).not.toBeNull();
    const tabletBodyRules = tabletBodyMatch?.[1] || '';

    expect(tabletBodyRules).toContain('padding-bottom: max(32px, env(safe-area-inset-bottom, 0px));');
    expect(tabletBodyRules).not.toContain('--keyboard-height');
    expect(tabletBodyRules).toContain('overscroll-behavior: contain;');

    // Verify .vo3d-app boundaries:
    const appMatch = css.match(/\.vo3d-app\s*\{([\s\S]*?)\}/);
    expect(appMatch).not.toBeNull();
    const appRules = appMatch?.[1] || '';

    expect(appRules).toContain('height: var(--visual-viewport-height, 100dvh);');
    expect(appRules).toContain('top: var(--visual-viewport-offset-top, 0px);');
    expect(appRules).toContain('overscroll-behavior: none;');

    // Verify root tokens:
    expect(css).toContain('--visual-viewport-height: 100dvh;');
    expect(css).toContain('--keyboard-height: 0px;');
    expect(css).toContain('--is-keyboard-open: 0;');
    expect(css).toContain('--is-compact-landscape: 0;');

    // Verify compact landscape media query rule exists
    expect(css).toContain('@media (max-height: 450px) and (orientation: landscape)');
  });

  it('syncs CSS custom properties including safe area and keyboard height for 100dvh fallback', () => {
    const cssVars = new Map<string, string>();
    const mockDoc = {
      documentElement: {
        style: {
          setProperty: (k: string, v: string) => cssVars.set(k, v),
        },
      },
    } as unknown as Document;

    const state = {
      width: 390,
      height: 544,
      offsetTop: 40,
      offsetLeft: 0,
      pageTop: 0,
      pageLeft: 0,
      scale: 1,
      isKeyboardOpen: true,
      keyboardHeight: 300,
      isCompactLandscape: false,
    };

    syncViewportCssVariables(state, mockDoc);

    expect(cssVars.get('--visual-viewport-height')).toBe('544px');
    expect(cssVars.get('--visual-viewport-offset-top')).toBe('40px');
    expect(cssVars.get('--keyboard-height')).toBe('300px');
    expect(cssVars.get('--is-keyboard-open')).toBe('1');
    expect(cssVars.get('--is-compact-landscape')).toBe('0');
  });
});
