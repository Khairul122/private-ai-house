import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { RootState } from '@react-three/fiber';
import { CanvasLifecycleListener } from './CanvasLifecycleListener.js';
import { WebglLifecycleController } from './webgl-lifecycle.js';
import { createGestureTracker } from '../state/office-interaction.js';

const hooks = vi.hoisted(() => ({ effect: (): (() => void) | void => {}, state: {} as RootState }));
vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useEffect: (effect: () => (() => void) | void) => { hooks.effect = effect; },
}));
vi.mock('@react-three/fiber', () => ({
  useThree: (selector: (state: RootState) => unknown) => selector(hooks.state),
}));

afterEach(() => { vi.useRealTimers(); });

describe('CanvasLifecycleListener', () => {
  it('detaches context/pointer listeners, resets the tracker, and leaves renderer disposal to R3F', () => {
    vi.useFakeTimers();
    const canvas = new EventTarget() as HTMLCanvasElement;
    const add = vi.spyOn(canvas, 'addEventListener');
    const remove = vi.spyOn(canvas, 'removeEventListener');
    const dispose = vi.fn();
    const forceContextLoss = vi.fn();
    hooks.state = { gl: { domElement: canvas, dispose, forceContextLoss } } as unknown as RootState;
    const lifecycle = new WebglLifecycleController();
    const tracker = createGestureTracker();
    renderToStaticMarkup(<CanvasLifecycleListener lifecycle={lifecycle} tracker={tracker} />);
    const cleanup = hooks.effect();
    tracker.onPointerDown({ pointerId: 1, clientX: 0, clientY: 0 });
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    expect(lifecycle.getStatus()).toBe('context-lost');
    expect(tracker.activePointerCount).toBe(1);
    cleanup?.();
    expect(tracker.activePointerCount).toBe(0);
    expect(lifecycle.isCurrentCanvas(canvas)).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    for (const [name, listener, options] of add.mock.calls) {
      const capture = typeof options === 'boolean' ? options : options?.capture;
      expect(remove.mock.calls.some(([removedName, removedListener, removedOptions]) =>
        removedName === name && removedListener === listener && Boolean(removedOptions) === Boolean(capture),
      )).toBe(true);
    }
    expect(dispose).not.toHaveBeenCalled();
    expect(forceContextLoss).not.toHaveBeenCalled();
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(lifecycle.getStatus()).toBe('context-lost');

    // React StrictMode replays setup after cleanup with the same controller.
    lifecycle.destroy();
    const replayCleanup = hooks.effect();
    expect(lifecycle.isCurrentCanvas(canvas)).toBe(true);
    replayCleanup?.();
    expect(dispose).not.toHaveBeenCalled();
  });
});
