import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebglLifecycleController } from './webgl-lifecycle.js';

describe('WebglLifecycleController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initializes in ready status and normal mode', () => {
    const controller = new WebglLifecycleController();
    expect(controller.getStatus()).toBe('ready');
    expect(controller.getCurrentMode()).toBe('normal');
    expect(controller.getRetryCount()).toBe(0);
  });

  it('handles webglcontextlost event: calls preventDefault, stops loop, enters context-lost', () => {
    const loopControl = vi.fn();
    const statusChange = vi.fn();
    const controller = new WebglLifecycleController({
      onLoopControl: loopControl,
      onStatusChange: statusChange,
    });

    const preventDefault = vi.fn();
    controller.handleContextLost({ preventDefault });

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(loopControl).toHaveBeenCalledWith(false);
    expect(controller.getStatus()).toBe('context-lost');
    expect(statusChange).toHaveBeenCalledWith('context-lost');
  });

  it('triggers fallback when 5-second restore timeout expires', () => {
    const fallbackFn = vi.fn();
    const controller = new WebglLifecycleController({
      restoreTimeoutMs: 5000,
      onFallback: fallbackFn,
    });

    controller.handleContextLost({ preventDefault: () => {} });
    expect(controller.getStatus()).toBe('context-lost');

    // Advance 4999 ms -> still waiting
    vi.advanceTimersByTime(4999);
    expect(controller.getStatus()).toBe('context-lost');
    expect(fallbackFn).not.toHaveBeenCalled();

    // Advance past 5000 ms -> timeout triggers fallback
    vi.advanceTimersByTime(1);
    expect(controller.getStatus()).toBe('fallback');
    expect(controller.getFallbackReason()).toBe('context_lost_timeout');
    expect(fallbackFn).toHaveBeenCalledWith('context_lost_timeout', undefined);
  });

  it('restores successfully when webglcontextrestored arrives within 5 seconds', () => {
    const loopControl = vi.fn();
    const restoreFn = vi.fn();
    const controller = new WebglLifecycleController({
      restoreTimeoutMs: 5000,
      onLoopControl: loopControl,
      onRestore: restoreFn,
    });

    controller.handleContextLost({ preventDefault: () => {} });
    vi.advanceTimersByTime(2000);

    controller.handleContextRestored('reduced-effects');

    expect(controller.getStatus()).toBe('ready');
    expect(controller.getCurrentMode()).toBe('reduced-effects');
    expect(controller.getRetryCount()).toBe(1);
    expect(loopControl).toHaveBeenCalledWith(true);
    expect(restoreFn).toHaveBeenCalledWith('reduced-effects');

    // Further advancing the timer should NOT trigger timeout
    vi.advanceTimersByTime(5000);
    expect(controller.getStatus()).toBe('ready');
  });

  it('enforces retry limit of 1 per context loss sequence', () => {
    const fallbackFn = vi.fn();
    const controller = new WebglLifecycleController({
      maxRetriesPerLoss: 1,
      onFallback: fallbackFn,
    });

    // 1st context loss and restore
    controller.handleContextLost({ preventDefault: () => {} });
    controller.handleContextRestored('normal');
    expect(controller.getStatus()).toBe('ready');
    expect(controller.getRetryCount()).toBe(1);

    // 2nd context loss and restore without markStable()
    controller.handleContextLost({ preventDefault: () => {} });
    controller.handleContextRestored('normal');

    expect(controller.getStatus()).toBe('fallback');
    expect(controller.getFallbackReason()).toBe('retry_limit_exceeded');
    expect(fallbackFn).toHaveBeenCalledWith('retry_limit_exceeded', undefined);
  });

  it('allows future restores once markStable() is called', () => {
    const controller = new WebglLifecycleController({ maxRetriesPerLoss: 1 });

    // 1st loss & restore
    controller.handleContextLost({ preventDefault: () => {} });
    controller.handleContextRestored('normal');
    expect(controller.getRetryCount()).toBe(1);

    // Stable rendering achieved
    controller.markStable();
    expect(controller.getRetryCount()).toBe(0);

    // 2nd loss & restore now succeeds
    controller.handleContextLost({ preventDefault: () => {} });
    controller.handleContextRestored('normal');
    expect(controller.getStatus()).toBe('ready');
  });

  it('attaches and detaches canvas event listeners cleanly', () => {
    const controller = new WebglLifecycleController();
    const listeners: Record<string, EventListener> = {};
    const mockCanvas = {
      addEventListener: vi.fn((event: string, cb: EventListener) => {
        listeners[event] = cb;
      }),
      removeEventListener: vi.fn((event: string) => {
        delete listeners[event];
      }),
    } as unknown as HTMLCanvasElement;

    const unbind = controller.attachToCanvas(mockCanvas);
    expect(mockCanvas.addEventListener).toHaveBeenCalledWith('webglcontextlost', expect.any(Function));
    expect(mockCanvas.addEventListener).toHaveBeenCalledWith('webglcontextrestored', expect.any(Function));

    // Simulate event on canvas
    const preventDefault = vi.fn();
    listeners['webglcontextlost']?.({ preventDefault } as unknown as Event);
    expect(preventDefault).toHaveBeenCalled();
    expect(controller.getStatus()).toBe('context-lost');

    unbind();
    expect(mockCanvas.removeEventListener).toHaveBeenCalledWith('webglcontextlost', expect.any(Function));
    expect(mockCanvas.removeEventListener).toHaveBeenCalledWith('webglcontextrestored', expect.any(Function));
  });

  it('supports explicit retry from fallback state', () => {
    const controller = new WebglLifecycleController();
    controller.triggerFallback('scene_error');
    expect(controller.getStatus()).toBe('fallback');
    expect(controller.getFallbackReason()).toBe('scene_error');

    controller.retry();
    expect(controller.getStatus()).toBe('ready');
    expect(controller.getFallbackReason()).toBeUndefined();
    expect(controller.getRetryCount()).toBe(0);
  });
});
