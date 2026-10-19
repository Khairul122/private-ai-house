import { describe, expect, it } from 'vitest';
import { bindOwnerKeyboard, createOwnerInput } from './owner-input.js';

function keyboard(type: string, code: string, extra: Record<string, unknown> = {}) {
  return Object.assign(new Event(type, { cancelable: true }), { code, key: code === 'Escape' ? 'Escape' : code, repeat: false, ...extra });
}

function setup() {
  const surface = new EventTarget();
  const document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  const input = createOwnerInput();
  const dispose = bindOwnerKeyboard(input, surface, document);
  return { surface, document, input, dispose };
}

describe('Owner controls', () => {
  it('keeps simultaneous keyboard and pointer directions independent on release', () => {
    const { surface, input, dispose } = setup();
    surface.dispatchEvent(keyboard('keydown', 'KeyW'));
    input.press('pointer:1', 'right'); input.press('pointer:2', 'up');
    input.release('pointer:2');
    expect(input.read().up).toBe(true);
    surface.dispatchEvent(keyboard('keyup', 'KeyW'));
    expect(input.read()).toEqual({ up: false, down: false, left: false, right: true });
    input.release('pointer:1');
    expect(Object.values(input.read()).some(Boolean)).toBe(false);
    dispose();
  });

  it('clears lost releases on blur and does not resume from key repeats after focus returns', () => {
    const { surface, input, dispose } = setup();
    surface.dispatchEvent(keyboard('keydown', 'KeyD'));
    input.press('pointer:1', 'up');
    surface.dispatchEvent(new Event('blur'));
    surface.dispatchEvent(new Event('focus'));
    surface.dispatchEvent(keyboard('keydown', 'KeyD', { repeat: true }));
    expect(Object.values(input.read()).some(Boolean)).toBe(false);
    surface.dispatchEvent(keyboard('keyup', 'KeyD'));
    surface.dispatchEvent(keyboard('keydown', 'KeyD'));
    expect(input.read().right).toBe(true);
    dispose();
  });

  it('ignores shortcuts and default-prevented keys, and cannot move behind an open card', () => {
    const { surface, input, dispose } = setup();
    for (const modifier of ['ctrlKey', 'metaKey', 'altKey', 'isComposing']) {
      const event = keyboard('keydown', 'KeyW', { [modifier]: true });
      surface.dispatchEvent(event);
      expect(input.read().up).toBe(false); expect(event.defaultPrevented).toBe(false);
    }
    const prevented = keyboard('keydown', 'KeyW'); prevented.preventDefault(); surface.dispatchEvent(prevented);
    expect(input.read().up).toBe(false);
    input.setEnabled(false);
    input.press('pointer:1', 'left'); surface.dispatchEvent(keyboard('keydown', 'ArrowUp'));
    input.setEnabled(true);
    expect(Object.values(input.read()).some(Boolean)).toBe(false);
    dispose();
  });

  it('stops every input source on Escape, tab hiding, and listener cleanup', () => {
    const { surface, document, input, dispose } = setup();
    surface.dispatchEvent(keyboard('keydown', 'ArrowUp'));
    input.press('button:right', 'right');
    const before = input.stopVersion;
    surface.dispatchEvent(keyboard('keydown', 'Escape'));
    expect(input.stopVersion).toBeGreaterThan(before);
    expect(Object.values(input.read()).some(Boolean)).toBe(false);
    input.press('pointer:1', 'left');
    document.visibilityState = 'hidden'; document.dispatchEvent(new Event('visibilitychange'));
    expect(input.enabled).toBe(false);
    document.visibilityState = 'visible'; document.dispatchEvent(new Event('visibilitychange'));
    expect(Object.values(input.read()).some(Boolean)).toBe(false);
    dispose(); surface.dispatchEvent(keyboard('keydown', 'KeyW'));
    expect(input.read().up).toBe(false);
  });
});
