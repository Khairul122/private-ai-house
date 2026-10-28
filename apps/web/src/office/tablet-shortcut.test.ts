import { describe, expect, it } from 'vitest';
import { isTabletShortcut } from './tablet-shortcut.js';

const base = { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, repeat: false, isComposing: false, defaultPrevented: false };
const enter = { ...base, key: 'Enter' };
const space = { ...base, key: ' ' };
const tab = { ...base, key: 'Tab' };

describe('tablet shortcut', () => {
  it('opens only from the office surface with an unmodified Enter or Space', () => {
    expect(isTabletShortcut(enter, true)).toBe(true);
    expect(isTabletShortcut(space, true)).toBe(true);
    expect(isTabletShortcut({ ...base, key: 'Spacebar' }, true)).toBe(true);
    expect(isTabletShortcut(tab, true)).toBe(false);
    expect(isTabletShortcut(enter, false)).toBe(false);
    expect(isTabletShortcut({ ...enter, shiftKey: true }, true)).toBe(false);
    expect(isTabletShortcut({ ...enter, ctrlKey: true }, true)).toBe(false);
    expect(isTabletShortcut({ ...enter, defaultPrevented: true }, true)).toBe(false);
    expect(isTabletShortcut({ ...enter, repeat: true }, true)).toBe(false);
  });
});
