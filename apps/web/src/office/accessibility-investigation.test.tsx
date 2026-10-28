import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { isTabletShortcut, handleDrawerFocusTrap, type FocusTrapTarget } from './tablet-shortcut.js';
import { SkipLink, LiveAnnouncer, VisuallyHidden } from '../components/ui.js';

function parseHex(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  return [(num >> 16) & 0xff, (num >> 8) & 0xff, num & 0xff];
}

function luminance([r, g, b]: [number, number, number]): number {
  const transform = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const rs = transform(r);
  const gs = transform(g);
  const bs = transform(b);
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(hex1: string, hex2: string): number {
  const l1 = luminance(parseHex(hex1));
  const l2 = luminance(parseHex(hex2));
  const [lighter, darker] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (lighter + 0.05) / (darker + 0.05);
}

describe('WCAG 1.4.11 / 2.4.13 Focus Contrast Verification', () => {
  it('light theme focus ring meets 3:1 non-text contrast against page background', () => {
    const ratio = contrastRatio('#9a472d', '#f2efe7');
    expect(ratio).toBeGreaterThanOrEqual(3.0);
    expect(ratio).toBeCloseTo(5.5, 0.5);
  });

  it('dark theme focus ring meets 3:1 non-text contrast against dark page background', () => {
    const ratio = contrastRatio('#ffc2a4', '#151c18');
    expect(ratio).toBeGreaterThanOrEqual(3.0);
    expect(ratio).toBeCloseTo(11.1, 0.5);
  });

  it('3D canvas amber focus ring meets 3:1 non-text contrast against dark pine surface', () => {
    const ratio = contrastRatio('#e8a317', '#294237');
    expect(ratio).toBeGreaterThanOrEqual(3.0);
    expect(ratio).toBeCloseTo(5.02, 0.5);
  });
});

describe('3D Surface & Keyboard Flow (Eliminasi Keyboard Trap)', () => {
  const base = { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, repeat: false, isComposing: false, defaultPrevented: false };

  it('never intercepts Tab on the office surface, eliminating keyboard trap', () => {
    const tabEvent = { ...base, key: 'Tab' };
    expect(isTabletShortcut(tabEvent, true)).toBe(false);
    expect(isTabletShortcut(tabEvent, false)).toBe(false);
  });

  it('activates tablet via Enter or Space when focused on the office surface', () => {
    expect(isTabletShortcut({ ...base, key: 'Enter' }, true)).toBe(true);
    expect(isTabletShortcut({ ...base, key: ' ' }, true)).toBe(true);
    expect(isTabletShortcut({ ...base, key: 'Spacebar' }, true)).toBe(true);
    expect(isTabletShortcut({ ...base, key: 'Enter', shiftKey: true }, true)).toBe(false);
    expect(isTabletShortcut({ ...base, key: 'Enter', ctrlKey: true }, true)).toBe(false);
  });
});

describe('Focus Trap Specification (Modal & Drawer)', () => {
  type MockElement = FocusTrapTarget & { id: string };

  function createHarness() {
    let active: MockElement | null = null;
    const heading: MockElement = { id: 'heading', focus: () => { active = heading; } };
    const btnFirst: MockElement = { id: 'first', focus: () => { active = btnFirst; } };
    const inputInterior: MockElement = { id: 'interior', focus: () => { active = inputInterior; } };
    const btnLast: MockElement = { id: 'last', focus: () => { active = btnLast; } };

    const items = [btnFirst, inputInterior, btnLast];
    const drawerElements = [heading, ...items];
    const contains = (el: MockElement | null) => Boolean(el && drawerElements.includes(el));

    const runTab = (activeElement: MockElement | null, shiftKey = false) => {
      active = activeElement;
      let prevented = false;
      const event = {
        key: 'Tab',
        shiftKey,
        preventDefault: () => { prevented = true; },
      };
      handleDrawerFocusTrap(event, {
        items,
        heading,
        activeElement,
        contains,
      });
      return { active, prevented };
    };

    return { heading, btnFirst, inputInterior, btnLast, runTab };
  }

  it('wraps focus to first element when Tab is pressed on the last element', () => {
    const { btnLast, btnFirst, runTab } = createHarness();
    const result = runTab(btnLast, false);
    expect(result.prevented).toBe(true);
    expect(result.active).toBe(btnFirst);
  });

  it('wraps focus to last element when Shift+Tab is pressed on the first element', () => {
    const { btnFirst, btnLast, runTab } = createHarness();
    const result = runTab(btnFirst, true);
    expect(result.prevented).toBe(true);
    expect(result.active).toBe(btnLast);
  });

  it('allows natural tab order for interior form controls without resetting', () => {
    const { inputInterior, runTab } = createHarness();
    const result = runTab(inputInterior, false);
    expect(result.prevented).toBe(false);
    expect(result.active).toBe(inputInterior);
  });
});

describe('Accessible Primitives Rendering', () => {
  it('renders SkipLink with hidden styling class and valid target id anchor', () => {
    const html = renderToStaticMarkup(<SkipLink targetId="vo3d-controls" label="Lewati ke kontrol kantor" />);
    expect(html).toContain('class="vo3d-skip-link"');
    expect(html).toContain('href="#vo3d-controls"');
    expect(html).toContain('Lewati ke kontrol kantor');
  });

  it('renders LiveAnnouncer with appropriate aria-live mode and sr-only container', () => {
    const politeHtml = renderToStaticMarkup(<LiveAnnouncer message="Berpindah ke Lantai 2" politeness="polite" />);
    expect(politeHtml).toContain('role="status"');
    expect(politeHtml).toContain('aria-live="polite"');
    expect(politeHtml).toContain('class="sr-only"');
    expect(politeHtml).toContain('Berpindah ke Lantai 2');

    const assertiveHtml = renderToStaticMarkup(<LiveAnnouncer message="Jeda automasi aktif" politeness="assertive" />);
    expect(assertiveHtml).toContain('role="alert"');
    expect(assertiveHtml).toContain('aria-live="assertive"');
    expect(assertiveHtml).toContain('Jeda automasi aktif');
  });

  it('renders VisuallyHidden with sr-only semantic accessibility markup', () => {
    const html = renderToStaticMarkup(<VisuallyHidden>Deskripsi pembaca layar</VisuallyHidden>);
    expect(html).toContain('class="sr-only"');
    expect(html).toContain('Deskripsi pembaca layar');
  });
});
