import { describe, expect, it } from 'vitest';
import { isTabletShortcut } from './tablet-shortcut.js';

const tab = { key: 'Tab', shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, repeat: false, isComposing: false, defaultPrevented: false };

describe('tablet shortcut', () => {
  it('opens only from the office surface with an unmodified Tab', () => {
    expect(isTabletShortcut(tab, true)).toBe(true);
    expect(isTabletShortcut(tab, false)).toBe(false);
    expect(isTabletShortcut({ ...tab, shiftKey: true }, true)).toBe(false);
    expect(isTabletShortcut({ ...tab, ctrlKey: true }, true)).toBe(false);
    expect(isTabletShortcut({ ...tab, defaultPrevented: true }, true)).toBe(false);
    expect(isTabletShortcut({ ...tab, repeat: true }, true)).toBe(false);
  });
});
