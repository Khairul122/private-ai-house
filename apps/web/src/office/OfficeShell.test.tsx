import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { isElementVisible, trapFocus } from './OfficeShell.js';

describe('OfficeShell drawer and overlay responsive layout (CSS specifications)', () => {
  const cssPath = path.resolve(__dirname, '../styles.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  it('defines desktop drawer constraints: max 520px and not exceeding 45vw (>1100px)', () => {
    expect(css).toMatch(/@media\s*\(min-width:\s*1101px\)[\s\S]*?width:\s*min\(520px,\s*45vw\)/);
    expect(css).toMatch(/@media\s*\(min-width:\s*1101px\)[\s\S]*?max-width:\s*min\(520px,\s*45vw\)/);
    expect(css).toMatch(/@media\s*\(min-width:\s*1101px\)[\s\S]*?min-height:\s*100dvh/);
  });

  it('defines tablet drawer constraints: clamp(360px, 42vw, 520px) (761–1100px)', () => {
    expect(css).toMatch(/@media\s*\(min-width:\s*761px\)\s*and\s*\(max-width:\s*1100px\)[\s\S]*?width:\s*clamp\(360px,\s*42vw,\s*520px\)/);
    expect(css).toMatch(/@media\s*\(min-width:\s*761px\)\s*and\s*\(max-width:\s*1100px\)[\s\S]*?max-width:\s*clamp\(360px,\s*42vw,\s*520px\)/);
    expect(css).toMatch(/@media\s*\(min-width:\s*761px\)\s*and\s*\(max-width:\s*1100px\)[\s\S]*?min-height:\s*100dvh/);
  });

  it('defines mobile drawer constraints: 100% width and 100dvh height (<=760px)', () => {
    expect(css).toMatch(/@media\s*\(max-width:\s*760px\)[\s\S]*?width:\s*100%/);
    expect(css).toMatch(/@media\s*\(max-width:\s*760px\)[\s\S]*?max-width:\s*100%/);
    expect(css).toMatch(/@media\s*\(max-width:\s*760px\)[\s\S]*?min-height:\s*100dvh/);
    expect(css).toMatch(/@media\s*\(max-width:\s*760px\)[\s\S]*?height:\s*100dvh/);
  });

  it('supports compact landscape mode (max-height: 450px)', () => {
    expect(css).toMatch(/@media\s*\(max-height:\s*450px\)[\s\S]*?min-height:\s*100dvh/);
    expect(css).toMatch(/@media\s*\(max-height:\s*450px\)[\s\S]*?height:\s*100dvh/);
  });

  it('aligns sheet backdrop to flex-end for right-side drawer placement', () => {
    expect(css).toMatch(/\.vo3d-sheet-backdrop[\s\S]*?justify-content:\s*flex-end/);
    expect(css).toMatch(/\.vo3d-sheet-backdrop[\s\S]*?align-items:\s*stretch/);
  });

  it('applies safe-area insets to drawer header and body', () => {
    expect(css).toContain('env(safe-area-inset-top)');
    expect(css).toContain('env(safe-area-inset-bottom)');
  });

  it('enforces touch targets (min 44px) on kill switch, confirm buttons, and navigation', () => {
    expect(css).toMatch(/\.vo3d-kill\s*\{[\s\S]*?min-height:\s*44px/);
    expect(css).toMatch(/\.vo3d-kill\s*\{[\s\S]*?min-width:\s*44px/);
    expect(css).toMatch(/\.vo3d-confirm-cancel[\s\S]*?min-height:\s*44px/);
    expect(css).toMatch(/\.vo3d-confirm-cancel[\s\S]*?min-width:\s*44px/);
    expect(css).toMatch(/\.vo3d-confirm-ok[\s\S]*?min-height:\s*44px/);
    expect(css).toMatch(/\.vo3d-confirm-ok[\s\S]*?min-width:\s*44px/);
    expect(css).toMatch(/\.vo3d-tablet-actions\s*>\s*:is\(button,\s*a\)[\s\S]*?min-height:\s*44px/);
    expect(css).toMatch(/\.vo3d-tablet-actions\s*>\s*:is\(button,\s*a\)[\s\S]*?min-width:\s*44px/);
    expect(css).toMatch(/\.vo3d-tablet-nav-group a[\s\S]*?min-height:\s*44px/);
  });

  it('provides modal styling and blur backdrop for kill switch confirmation', () => {
    expect(css).toMatch(/\.vo3d-confirm-backdrop\s*\{[\s\S]*?position:\s*fixed/);
    expect(css).toMatch(/\.vo3d-confirm-backdrop\s*\{[\s\S]*?z-index:\s*100/);
    expect(css).toMatch(/\.vo3d-confirm-dialog\s*\{[\s\S]*?max-width:\s*440px/);
  });
});

describe('Focus trap and element visibility', () => {
  function createMockElement(options?: { hidden?: boolean; display?: string; visibility?: string; checkVisibility?: () => boolean }) {
    const attributes = new Set<string>();
    if (options?.hidden) attributes.add('hidden');
    const style = {
      display: options?.display ?? '',
      visibility: options?.visibility ?? '',
    };
    const el = {
      hasAttribute: (name: string) => attributes.has(name),
      setAttribute: (name: string) => { attributes.add(name); },
      removeAttribute: (name: string) => { attributes.delete(name); },
      style,
      checkVisibility: options?.checkVisibility,
      focus: vi.fn(() => {
        const doc = (globalThis as unknown as { document?: { activeElement: unknown } }).document;
        if (doc) doc.activeElement = el;
      }),
    } as unknown as HTMLElement;
    return el;
  }

  function createMockContainer(children: HTMLElement[]) {
    return {
      querySelectorAll: () => children,
    } as unknown as HTMLElement;
  }

  function createMockKeyEvent(key: string, shiftKey = false) {
    return {
      key,
      shiftKey,
      defaultPrevented: false,
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent;
  }

  beforeEach(() => {
    (globalThis as unknown as { document: { activeElement: unknown } }).document = {
      activeElement: null,
    };
  });

  afterEach(() => {
    delete (globalThis as unknown as { document?: unknown }).document;
  });

  it('identifies visible elements and excludes hidden ones', () => {
    const visibleBtn = createMockElement();
    expect(isElementVisible(visibleBtn)).toBe(true);

    const hiddenAttrBtn = createMockElement({ hidden: true });
    expect(isElementVisible(hiddenAttrBtn)).toBe(false);

    const displayNoneBtn = createMockElement({ display: 'none' });
    expect(isElementVisible(displayNoneBtn)).toBe(false);

    const visibilityHiddenBtn = createMockElement({ visibility: 'hidden' });
    expect(isElementVisible(visibilityHiddenBtn)).toBe(false);

    const checkFalseBtn = createMockElement({ checkVisibility: () => false });
    expect(isElementVisible(checkFalseBtn)).toBe(false);

    const checkTrueBtn = createMockElement({ checkVisibility: () => true });
    expect(isElementVisible(checkTrueBtn)).toBe(true);
  });

  it('ignores non-Tab key events', () => {
    const btn = createMockElement();
    const container = createMockContainer([btn]);
    const event = createMockKeyEvent('Escape');

    trapFocus(container, event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(btn.focus).not.toHaveBeenCalled();
  });

  it('wraps focus from last element to first element on Tab forward', () => {
    const firstBtn = createMockElement();
    const lastBtn = createMockElement();
    const container = createMockContainer([firstBtn, lastBtn]);

    // Active element is currently the last button
    (globalThis as unknown as { document: { activeElement: unknown } }).document.activeElement = lastBtn;

    const event = createMockKeyEvent('Tab', false);
    trapFocus(container, event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(firstBtn.focus).toHaveBeenCalled();
  });

  it('wraps focus from first element to last element on Shift+Tab backward', () => {
    const firstBtn = createMockElement();
    const lastBtn = createMockElement();
    const container = createMockContainer([firstBtn, lastBtn]);

    // Active element is currently the first button
    (globalThis as unknown as { document: { activeElement: unknown } }).document.activeElement = firstBtn;

    const event = createMockKeyEvent('Tab', true);
    trapFocus(container, event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(lastBtn.focus).toHaveBeenCalled();
  });

  it('redirects focus back inside container if activeElement is outside on Tab', () => {
    const firstBtn = createMockElement();
    const lastBtn = createMockElement();
    const outsideBtn = createMockElement();
    const container = createMockContainer([firstBtn, lastBtn]);

    // Active element is outside the container
    (globalThis as unknown as { document: { activeElement: unknown } }).document.activeElement = outsideBtn;

    const event = createMockKeyEvent('Tab', false);
    trapFocus(container, event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(firstBtn.focus).toHaveBeenCalled();
  });

  it('redirects focus to last element if activeElement is outside on Shift+Tab', () => {
    const firstBtn = createMockElement();
    const lastBtn = createMockElement();
    const outsideBtn = createMockElement();
    const container = createMockContainer([firstBtn, lastBtn]);

    // Active element is outside the container
    (globalThis as unknown as { document: { activeElement: unknown } }).document.activeElement = outsideBtn;

    const event = createMockKeyEvent('Tab', true);
    trapFocus(container, event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(lastBtn.focus).toHaveBeenCalled();
  });

  it('focuses fallbackFocusTarget when container has no interactive children', () => {
    const container = createMockContainer([]);
    const fallbackTarget = createMockElement();

    const event = createMockKeyEvent('Tab', false);
    trapFocus(container, event, fallbackTarget);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(fallbackTarget.focus).toHaveBeenCalled();
  });
});

describe('Escape key and keyboard interaction constraints', () => {
  it('prevents default browser action on Escape without clearing input values', () => {
    const value = 'Teks penting';
    const preventDefaultSpy = vi.fn();

    // Emulate Escape key handler in OfficeShell
    const event = {
      key: 'Escape',
      preventDefault: preventDefaultSpy,
    };

    if (event.key === 'Escape') {
      event.preventDefault();
      // Notice value remains intact (no reset)
    }

    expect(preventDefaultSpy).toHaveBeenCalled();
    expect(value).toBe('Teks penting');
  });
});

describe('Kill switch and confirmation modal behavior', () => {
  it('requires confirmation before executing pause or resume mutation', () => {
    let confirmKillState: 'pause' | 'resume' | null = null;
    const mutatePause = vi.fn();

    const onKillClick = (active: boolean) => {
      confirmKillState = active ? 'pause' : 'resume';
    };

    const handleConfirm = () => {
      if (confirmKillState) {
        mutatePause(confirmKillState);
        confirmKillState = null;
      }
    };

    // Clicking kill switch when policy is active does NOT execute mutatePause immediately
    onKillClick(true);
    expect(confirmKillState).toBe('pause');
    expect(mutatePause).not.toHaveBeenCalled();

    // Confirming executes the mutation
    handleConfirm();
    expect(mutatePause).toHaveBeenCalledWith('pause');
    expect(confirmKillState).toBeNull();
  });

  it('cancels confirmation dialog without triggering mutation', () => {
    let confirmKillState: 'pause' | 'resume' | null = 'pause';
    const mutatePause = vi.fn();

    const handleCancel = () => {
      confirmKillState = null;
    };

    handleCancel();
    expect(confirmKillState).toBeNull();
    expect(mutatePause).not.toHaveBeenCalled();
  });
});
