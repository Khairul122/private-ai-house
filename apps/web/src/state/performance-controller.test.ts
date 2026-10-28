import { afterEach, describe, expect, it, vi } from 'vitest';
import { PerformanceController, RollingFpsWindow } from './performance-controller.js';

if (typeof document === 'undefined') {
  const listeners = new Map<string, Set<EventListener>>();
  const mockDocument = {
    hidden: false,
    addEventListener(type: string, listener: EventListener) { (listeners.get(type) ?? (listeners.set(type, new Set()), listeners.get(type)!)).add(listener); },
    removeEventListener(type: string, listener: EventListener) { listeners.get(type)?.delete(listener); },
    dispatchEvent(event: Event) { listeners.get(event.type)?.forEach((listener) => listener(event)); return true; },
  } as unknown as Document;
  Object.defineProperty(globalThis, 'document', { configurable: true, value: mockDocument });
}

const frames = (controller: PerformanceController, fps: number, count: number, dtMs = 100) => {
  for (let i = 0; i < count; i += 1) controller.update(fps, dtMs);
};

describe('RollingFpsWindow', () => {
  it('averages available samples during warm-up and evicts oldest after 60 samples', () => {
    const window = new RollingFpsWindow(60);
    expect(window.add(20)).toBe(20);
    expect(window.add(40)).toBe(30);
    frames({ update: (fps: number) => { window.add(fps); return 'normal'; } } as unknown as PerformanceController, 60, 59, 1);
    expect(window.isFull).toBe(true);
    expect(window.add(90)).toBeCloseTo((59 * 60 + 90) / 60);
  });
});

describe('PerformanceController state machine', () => {
  const listeners: Record<string, ((event?: unknown) => void)[]> = {};
  const mockDoc = {
    hidden: false,
    addEventListener: vi.fn((event: string, handler: (event?: unknown) => void) => {
      listeners[event] = listeners[event] ?? [];
      listeners[event]!.push(handler);
    }),
    removeEventListener: vi.fn((event: string, handler: (event?: unknown) => void) => {
      if (listeners[event]) listeners[event] = listeners[event]!.filter((h) => h !== handler);
    }),
    dispatchEvent: vi.fn((event: { type?: string }) => {
      const type = event?.type ?? '';
      listeners[type]?.forEach((h) => h(event));
      return true;
    }),
  };

  if (typeof globalThis.document === 'undefined') {
    Object.defineProperty(globalThis, 'document', {
      value: mockDoc,
      configurable: true,
      writable: true,
    });
  }
  if (typeof globalThis.Event === 'undefined') {
    Object.defineProperty(globalThis, 'Event', {
      value: class {
        constructor(public type: string) {}
      },
      configurable: true,
      writable: true,
    });
  }

  afterEach(() => vi.restoreAllMocks());

  it('initializes in normal status with 60 FPS', () => {
    const controller = new PerformanceController();
    expect(controller.getStatus()).toBe('normal');
    expect(controller.getMetrics().lastFps).toBe(60);
  });

  it('uses moving average from first sample, not instantaneous FPS', () => {
    const controller = new PerformanceController({ reducedDurationMs: 200 });
    controller.update(10, 100);
    controller.update(60, 100);
    expect(controller.getStatus()).toBe('normal');
    expect(controller.getMetrics().lastFps).toBe(35);
  });

  it('ignores long frame gaps', () => {
    const controller = new PerformanceController();
    controller.update(10, 251);
    expect(controller.getMetrics().lastFps).toBe(60);
    expect(controller.getStatus()).toBe('normal');
  });

  it('transitions to reduced-effects after 2000ms below 30', () => {
    const controller = new PerformanceController();
    frames(controller, 20, 19);
    expect(controller.getStatus()).toBe('normal');
    frames(controller, 20, 1);
    expect(controller.getStatus()).toBe('reduced-effects');
  });

  it('transitions to fallback-offer after 5000ms below 24', () => {
    const controller = new PerformanceController();
    frames(controller, 20, 50);
    expect(controller.getStatus()).toBe('fallback-offer');
  });

  it('recovers only after 3000ms at or above 35 FPS', () => {
    const controller = new PerformanceController();
    frames(controller, 20, 20);
    expect(controller.getStatus()).toBe('reduced-effects');
    frames(controller, 50, 29);
    expect(controller.getStatus()).toBe('reduced-effects');
    frames(controller, 50, 1);
    expect(controller.getStatus()).toBe('normal');
  });

  it('resets sample window and timers when tab becomes hidden', () => {
    const controller = new PerformanceController();
    const unsubscribe = controller.subscribe();
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
    controller.update(10, 100);
    expect(controller.getMetrics().lastFps).toBe(60);
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
    controller.update(60, 100);
    expect(controller.getMetrics().lastFps).toBe(60);
    unsubscribe();
  });

  it('subscribes and cleans up visibility listener symmetrically', () => {
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    const controller = new PerformanceController();
    const unsubscribe = controller.subscribe();
    expect(add).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    unsubscribe();
    expect(remove).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(controller.getMetrics().lastFps).toBe(60);
  });

  it('resets to normal and clears fallback dismissal', () => {
    const controller = new PerformanceController();
    frames(controller, 20, 50);
    controller.reset();
    expect(controller.getStatus()).toBe('normal');
    expect(controller.getMetrics().fallbackDismissed).toBe(false);
    expect(controller.getMetrics().lastFps).toBe(60);
  });

  it('dismisses fallback offer and prevents re-prompt', () => {
    const controller = new PerformanceController();
    frames(controller, 20, 50);
    expect(controller.getStatus()).toBe('fallback-offer');
    controller.dismissFallbackOffer();
    frames(controller, 20, 60);
    expect(controller.getStatus()).toBe('reduced-effects');
    expect(controller.getMetrics().fallbackDismissed).toBe(true);
  });
});
