import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { RootState } from '@react-three/fiber';
import { StabilityObserver } from './StabilityObserver.js';
import { WebglLifecycleController } from './webgl-lifecycle.js';

const frameHook = vi.hoisted((): { callback: (state: RootState) => void; priority: number } => ({ callback: () => {}, priority: 0 }));
vi.mock('@react-three/fiber', () => ({
  useFrame: (callback: (state: RootState) => void, priority: number) => {
    frameHook.callback = callback;
    frameHook.priority = priority;
  },
}));

function setup() {
  const lifecycle = new WebglLifecycleController();
  const canvas = new EventTarget() as HTMLCanvasElement;
  lifecycle.attachToCanvas(canvas);
  const context = { NO_ERROR: 0, getError: vi.fn(() => 0), isContextLost: vi.fn(() => false) };
  const gl = { domElement: canvas, render: vi.fn(), getContext: () => context };
  const state = { gl, scene: {}, camera: {} } as unknown as RootState;
  renderToStaticMarkup(<StabilityObserver lifecycle={lifecycle} />);
  const lose = () => canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
  const restore = () => canvas.dispatchEvent(new Event('webglcontextrestored'));
  return { lifecycle, canvas, context, gl, state, lose, restore, frame: () => frameHook.callback(state) };
}

afterEach(() => { vi.useRealTimers(); });

describe('StabilityObserver', () => {
  it('takes over rendering at priority 1 and verifies two completed clean frames', () => {
    const { lifecycle, gl, context, state, frame, lose, restore } = setup();
    lose();
    restore();
    context.getError.mockImplementation(() => {
      expect(gl.render).toHaveBeenCalledWith(state.scene, state.camera);
      return 0;
    });
    expect(frameHook.priority).toBe(1);
    frame();
    expect(lifecycle.getStatus()).toBe('restoring');
    expect(lifecycle.getRetryCount()).toBe(1);
    frame();
    expect(lifecycle.getStatus()).toBe('ready');
    expect(lifecycle.getRetryCount()).toBe(0);
    expect(gl.render).toHaveBeenCalledTimes(2);
  });

  it('falls back immediately on a post-render WebGL error', () => {
    const { lifecycle, gl, context, frame } = setup();
    context.getError.mockReturnValue(1282);
    frame();
    expect(gl.render).toHaveBeenCalledOnce();
    expect(lifecycle.getFallbackReason()).toBe('scene_error');
    frame();
    expect(gl.render).toHaveBeenCalledOnce();
  });

  it('catches render exceptions before counting a stable frame', () => {
    const { lifecycle, gl, context, frame } = setup();
    gl.render.mockImplementation(() => { throw new Error('render failed'); });
    frame();
    expect(lifecycle.getFallbackReason()).toBe('scene_error');
    expect(context.getError).not.toHaveBeenCalled();
  });

  it('does not combine a clean frame before loss with one after restore', () => {
    const { lifecycle, frame, lose, restore } = setup();
    frame();
    lose();
    restore();
    frame();
    expect(lifecycle.getStatus()).toBe('restoring');
    frame();
    expect(lifecycle.getStatus()).toBe('ready');
  });

  it('does not render a lost or detached canvas', () => {
    const { lifecycle, context, gl, frame, lose, restore } = setup();
    lose();
    frame();
    expect(gl.render).not.toHaveBeenCalled();
    restore();
    context.isContextLost.mockReturnValue(true);
    frame();
    expect(lifecycle.getStatus()).toBe('restoring');
    expect(gl.render).not.toHaveBeenCalled();
    context.isContextLost.mockReturnValue(false);
    lifecycle.attachToCanvas(new EventTarget() as HTMLCanvasElement);
    frame();
    expect(gl.render).not.toHaveBeenCalled();
    lifecycle.destroy();
  });

  it('stops the 5000 ms recovery deadline only after two clean frames', () => {
    vi.useFakeTimers();
    const { lifecycle, frame, lose, restore } = setup();
    lose();
    restore();
    frame();
    vi.advanceTimersByTime(4999);
    expect(lifecycle.getStatus()).toBe('restoring');
    frame();
    vi.advanceTimersByTime(1);
    expect(lifecycle.getStatus()).toBe('ready');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('marks stability once per recovery and continues detecting later rendering errors', () => {
    const { lifecycle, context, frame, lose, restore } = setup();
    const markStable = vi.spyOn(lifecycle, 'markStable');
    frame();
    frame();
    frame();
    expect(markStable).toHaveBeenCalledOnce();
    lose();
    restore();
    frame();
    frame();
    expect(markStable).toHaveBeenCalledTimes(2);
    context.getError.mockReturnValue(1285);
    frame();
    expect(lifecycle.getFallbackReason()).toBe('scene_error');
  });

  it('never certifies recovery when the second rendered frame fails', () => {
    const { lifecycle, context, frame, lose, restore } = setup();
    lose();
    restore();
    frame();
    context.getError.mockReturnValue(1282);
    frame();
    expect(lifecycle.getStatus()).toBe('fallback');
    expect(lifecycle.getRetryCount()).toBe(1);
  });
});
