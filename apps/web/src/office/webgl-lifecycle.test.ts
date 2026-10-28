import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebglLifecycleController, type FallbackReason } from './webgl-lifecycle.js';

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

  it('keeps recovery pending until a stable render is verified', () => {
    const controller = new WebglLifecycleController();
    controller.handleContextLost({ preventDefault: () => {} });
    controller.handleContextRestored();
    expect(controller.getStatus()).toBe('restoring');
    expect(controller.getRetryCount()).toBe(1);
    vi.advanceTimersByTime(5000);
    expect(controller.getFallbackReason()).toBe('context_lost_timeout');
    controller.markStable();
    expect(controller.getStatus()).toBe('fallback');
    expect(controller.getRetryCount()).toBe(1);
  });

  it('does not postpone recovery timeout for duplicate context loss events', () => {
    const controller = new WebglLifecycleController();
    controller.handleContextLost();
    vi.advanceTimersByTime(4999);
    controller.handleContextLost();
    vi.advanceTimersByTime(1);
    expect(controller.getFallbackReason()).toBe('context_lost_timeout');
  });

  it('rejects events from a foreign canvas without preventing their default', () => {
    const controller = new WebglLifecycleController();
    const canvas = new EventTarget() as HTMLCanvasElement;
    const otherCanvas = new EventTarget() as HTMLCanvasElement;
    controller.attachToCanvas(canvas);
    const preventDefault = vi.fn();
    controller.handleContextLost({ target: otherCanvas, preventDefault });
    expect(preventDefault).not.toHaveBeenCalled();
    expect(controller.getStatus()).toBe('ready');
    expect(vi.getTimerCount()).toBe(0);
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

    expect(controller.getStatus()).toBe('restoring');
    expect(controller.getCurrentMode()).toBe('reduced-effects');
    expect(controller.getRetryCount()).toBe(1);
    expect(loopControl).toHaveBeenCalledWith(true);
    expect(restoreFn).toHaveBeenCalledWith('reduced-effects');

    controller.markStable();
    // Further advancing the timer should NOT trigger timeout
    vi.advanceTimersByTime(5000);
    expect(controller.getStatus()).toBe('ready');
  });

  it('allows two separate context losses where each loss gets one restore attempt', () => {
    const restoreFn = vi.fn();
    const controller = new WebglLifecycleController({
      maxRetriesPerLoss: 1,
      onRestore: restoreFn,
    });

    // 1st context loss and restore
    controller.handleContextLost({ preventDefault: () => {} });
    expect(controller.getStatus()).toBe('context-lost');
    controller.handleContextRestored('normal');
    expect(controller.getStatus()).toBe('restoring');
    expect(controller.getRetryCount()).toBe(1);
    expect(restoreFn).toHaveBeenCalledTimes(1);

    controller.markStable();
    // 2nd separate context loss and restore (both allowed without fallback)
    controller.handleContextLost({ preventDefault: () => {} });
    expect(controller.getStatus()).toBe('context-lost');
    controller.handleContextRestored('reduced-effects');
    expect(controller.getStatus()).toBe('restoring');
    expect(controller.getRetryCount()).toBe(1);
    expect(restoreFn).toHaveBeenCalledTimes(2);
    expect(controller.getCurrentMode()).toBe('reduced-effects');
  });

  it('ignores duplicate webglcontextrestored events when already restored and ready', () => {
    const restoreFn = vi.fn();
    const controller = new WebglLifecycleController({
      onRestore: restoreFn,
    });

    controller.handleContextLost({ preventDefault: () => {} });
    controller.handleContextRestored('normal');
    controller.markStable();
    expect(controller.getStatus()).toBe('ready');
    expect(restoreFn).toHaveBeenCalledTimes(1);

    // Duplicate restore event while already in ready state
    controller.handleContextRestored('reduced-effects');
    expect(controller.getStatus()).toBe('ready');
    expect(restoreFn).toHaveBeenCalledTimes(1); // Not called again
    expect(controller.getCurrentMode()).toBe('normal');
  });

  it('ignores late webglcontextrestored events arriving after timeout fallback', () => {
    const restoreFn = vi.fn();
    const fallbackFn = vi.fn();
    const controller = new WebglLifecycleController({
      restoreTimeoutMs: 5000,
      onRestore: restoreFn,
      onFallback: fallbackFn,
    });

    controller.handleContextLost({ preventDefault: () => {} });
    vi.advanceTimersByTime(5000);
    expect(controller.getStatus()).toBe('fallback');
    expect(controller.getFallbackReason()).toBe('context_lost_timeout');
    expect(fallbackFn).toHaveBeenCalledWith('context_lost_timeout', undefined);

    // Late webglcontextrestored arrives after timeout has activated fallback
    controller.handleContextRestored('normal');
    expect(controller.getStatus()).toBe('fallback');
    expect(controller.getFallbackReason()).toBe('context_lost_timeout');
    expect(restoreFn).not.toHaveBeenCalled();
  });

  it('enforces retry limit when maxRetriesPerLoss is exceeded', () => {
    const fallbackFn = vi.fn();
    const controller = new WebglLifecycleController({
      maxRetriesPerLoss: 0,
      onFallback: fallbackFn,
    });

    controller.handleContextLost({ preventDefault: () => {} });
    controller.handleContextRestored('normal');

    expect(controller.getStatus()).toBe('fallback');
    expect(controller.getFallbackReason()).toBe('retry_limit_exceeded');
    expect(fallbackFn).toHaveBeenCalledWith('retry_limit_exceeded', undefined);
  });

  it('enforces retry limit of 1 per context loss sequence if consecutive loss occurs during restore', () => {
    const fallbackFn = vi.fn();
    const controllerInstance: WebglLifecycleController = new WebglLifecycleController({
      maxRetriesPerLoss: 1,
      onFallback: fallbackFn,
      onRestore: () => {
        // Simulate immediate context loss during restore before achieving stability
        controllerInstance.handleContextLost({ preventDefault: () => {} });
      },
    });

    controllerInstance.handleContextLost({ preventDefault: () => {} });
    controllerInstance.handleContextRestored('normal');

    // Context is now lost again with retryCount already at 1
    expect(controllerInstance.getStatus()).toBe('context-lost');
    expect(controllerInstance.getRetryCount()).toBe(1);

    // Second restore attempt on the same unstable sequence exceeds retry limit
    controllerInstance.handleContextRestored('normal');
    expect(controllerInstance.getStatus()).toBe('fallback');
    expect(controllerInstance.getFallbackReason()).toBe('retry_limit_exceeded');
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
    expect(controller.getStatus()).toBe('restoring');
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
    listeners['webglcontextlost']?.({ target: mockCanvas, preventDefault } as unknown as Event);
    expect(preventDefault).toHaveBeenCalled();
    expect(controller.getStatus()).toBe('context-lost');

    unbind();
    expect(mockCanvas.removeEventListener).toHaveBeenCalledWith('webglcontextlost', expect.any(Function));
    expect(mockCanvas.removeEventListener).toHaveBeenCalledWith('webglcontextrestored', expect.any(Function));

    // Advancing timers should not trigger fallback because unbind cleared the timeout timer
    vi.advanceTimersByTime(5000);
    // Remains in context-lost because unbind cancelled the pending timer
    expect(controller.getStatus()).toBe('context-lost');
  });

  it('supports explicit retry from fallback state', () => {
    const controller = new WebglLifecycleController();
    controller.triggerFallback('scene_error');
    expect(controller.getStatus()).toBe('fallback');
    expect(controller.getFallbackReason()).toBe('scene_error');

    controller.retry();
    expect(controller.getStatus()).toBe('restoring');
    expect(controller.getFallbackReason()).toBeUndefined();
    expect(controller.getRetryCount()).toBe(1);
  });

  it('keeps retry budget spent until two stable frames even after an explicit retry', () => {
    const controller = new WebglLifecycleController();
    controller.handleContextLost();
    controller.handleContextRestored();
    controller.triggerFallback('scene_error');
    controller.retry();
    expect(controller.getStatus()).toBe('restoring');
    expect(controller.getRetryCount()).toBe(1);
    controller.markStable();
    expect(controller.getStatus()).toBe('ready');
    expect(controller.getRetryCount()).toBe(0);
  });

  it('retains the most severe fallback reason regardless of callback order', () => {
    const reasons: FallbackReason[] = ['user_choice', 'low_fps', 'context_lost_timeout', 'retry_limit_exceeded', 'scene_error', 'unsupported'];
    const forward = new WebglLifecycleController();
    for (const reason of reasons) {
      forward.triggerFallback(reason);
      expect(forward.getFallbackReason()).toBe(reason);
    }
    const onFallback = vi.fn();
    const reverse = new WebglLifecycleController({ onFallback });
    for (const reason of reasons.slice().reverse()) reverse.triggerFallback(reason);
    expect(reverse.getFallbackReason()).toBe('unsupported');
    expect(onFallback).toHaveBeenCalledOnce();
  });

  it('keeps the retry timeout when R3F attaches the replacement before old cleanup', () => {
    const controller = new WebglLifecycleController();
    const oldCanvas = new EventTarget() as HTMLCanvasElement;
    const detachOld = controller.attachToCanvas(oldCanvas);
    controller.triggerFallback('scene_error');
    controller.retry();
    const newCanvas = new EventTarget() as HTMLCanvasElement;
    controller.attachToCanvas(newCanvas);
    detachOld();
    expect(controller.isCurrentCanvas(newCanvas)).toBe(true);
    vi.advanceTimersByTime(5000);
    expect(controller.getFallbackReason()).toBe('context_lost_timeout');
  });

  it('removes listeners and timers on destroy and ignores subsequent callbacks', () => {
    const onStatusChange = vi.fn();
    const controller = new WebglLifecycleController({ onStatusChange });
    const canvas = new EventTarget() as HTMLCanvasElement;
    const remove = vi.spyOn(canvas, 'removeEventListener');
    controller.attachToCanvas(canvas);
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    controller.destroy();
    controller.destroy();
    expect(remove).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
    onStatusChange.mockClear();
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    controller.handleContextLost();
    controller.handleContextRestored();
    controller.retry();
    controller.markStable();
    controller.triggerFallback('scene_error');
    vi.advanceTimersByTime(10000);
    expect(onStatusChange).not.toHaveBeenCalled();
  });

  it('ignores restore in initial ready and duplicate restore while still restoring', () => {
    const onRestore = vi.fn();
    const controller = new WebglLifecycleController({ onRestore });
    controller.handleContextRestored();
    expect(onRestore).not.toHaveBeenCalled();
    controller.handleContextLost();
    controller.handleContextRestored('normal');
    controller.handleContextRestored('reduced-effects');
    expect(controller.getStatus()).toBe('restoring');
    expect(controller.getRetryCount()).toBe(1);
    expect(controller.getCurrentMode()).toBe('normal');
    expect(onRestore).toHaveBeenCalledOnce();
  });

  it('cannot reset the retry budget while context is lost', () => {
    const controller = new WebglLifecycleController();
    controller.handleContextLost();
    controller.handleContextRestored();
    controller.handleContextLost();
    controller.markStable();
    expect(controller.getRetryCount()).toBe(1);
    controller.handleContextRestored();
    expect(controller.getFallbackReason()).toBe('retry_limit_exceeded');
  });

  it('caps automatic recovery at one attempt even if configured higher', () => {
    const controller = new WebglLifecycleController({ maxRetriesPerLoss: 10 });
    controller.handleContextLost();
    controller.handleContextRestored();
    controller.handleContextLost();
    controller.handleContextRestored();
    expect(controller.getFallbackReason()).toBe('retry_limit_exceeded');
    expect(controller.getRetryCount()).toBe(1);
  });

  it('does not extend the original loss deadline when restoration begins', () => {
    const controller = new WebglLifecycleController();
    controller.handleContextLost();
    vi.advanceTimersByTime(4999);
    controller.handleContextRestored();
    vi.advanceTimersByTime(1);
    expect(controller.getFallbackReason()).toBe('context_lost_timeout');
  });

  it('falls back if resource restoration throws', () => {
    const error = new Error('restore failed');
    const onFallback = vi.fn();
    const controller = new WebglLifecycleController({ onRestore: () => { throw error; }, onFallback });
    controller.handleContextLost();
    controller.handleContextRestored();
    expect(controller.getFallbackReason()).toBe('scene_error');
    expect(onFallback).toHaveBeenCalledWith('scene_error', error);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('ignores repeated retry calls and remains bounded by the first retry deadline', () => {
    const onRestore = vi.fn();
    const controller = new WebglLifecycleController({ onRestore });
    controller.retry();
    expect(onRestore).not.toHaveBeenCalled();
    controller.triggerFallback('low_fps');
    controller.retry();
    vi.advanceTimersByTime(4999);
    controller.retry();
    vi.advanceTimersByTime(1);
    expect(onRestore).toHaveBeenCalledOnce();
    expect(controller.getFallbackReason()).toBe('context_lost_timeout');
  });

  it('rejects stale loss and restore callbacks after switching canvas', () => {
    const controller = new WebglLifecycleController();
    const oldCanvas = new EventTarget() as HTMLCanvasElement;
    const add = vi.spyOn(oldCanvas, 'addEventListener');
    const detachOld = controller.attachToCanvas(oldCanvas);
    const newCanvas = new EventTarget() as HTMLCanvasElement;
    controller.attachToCanvas(newCanvas);
    newCanvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    for (const [name, listener] of add.mock.calls) {
      const event = new Event(name, { cancelable: true });
      Object.defineProperty(event, 'target', { value: oldCanvas });
      if (typeof listener === 'function') listener(event);
      expect(event.defaultPrevented).toBe(false);
    }
    detachOld();
    expect(controller.getStatus()).toBe('context-lost');
    expect(controller.getRetryCount()).toBe(0);
    expect(controller.isCurrentCanvas(newCanvas)).toBe(true);
    vi.advanceTimersByTime(5000);
    expect(controller.getFallbackReason()).toBe('context_lost_timeout');
  });
});
