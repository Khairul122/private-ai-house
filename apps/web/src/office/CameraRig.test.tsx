import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { RootState } from '@react-three/fiber';
import { PerspectiveCamera } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CameraRig, type SavedCameraState } from './VisualOffice.js';

const hooks = vi.hoisted((): {
  effects: Array<() => (() => void) | void>;
  frame: (state: RootState, dt: number) => void;
  state: RootState;
} => ({
  effects: [] as Array<() => (() => void) | void>,
  frame: () => {},
  state: {} as RootState,
}));
vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useEffect: (effect: () => (() => void) | void) => { hooks.effects.push(effect); },
}));
vi.mock('@react-three/fiber', () => ({
  Canvas: () => null,
  useThree: () => hooks.state,
  useFrame: (callback: (state: RootState, dt: number) => void) => { hooks.frame = callback; },
}));

afterEach(() => { vi.restoreAllMocks(); });

describe('CameraRig recovery', () => {
  it('restores camera position and orbit target across canvas remount and effect replay', () => {
    vi.spyOn(OrbitControls.prototype, 'connect').mockImplementation(() => {});
    vi.spyOn(OrbitControls.prototype, 'dispose').mockImplementation(() => {});
    const camera = new PerspectiveCamera(38, 1.4, 0.5, 400);
    hooks.state = { camera, gl: { domElement: {} }, size: { width: 1400, height: 1000 } } as unknown as RootState;
    hooks.effects = [];
    const snapshot: SavedCameraState = { floor: 1, commandN: 7, view: '3d', position: [10, 20, 30], target: [-2, 0, 3] };
    const savedCameraState = { current: snapshot as SavedCameraState | null };
    renderToStaticMarkup(<CameraRig command={{ kind: 'overview', n: 7 }} view="3d" tour={false}
      spots={new Map()} reducedMotion={false} followId={null} positions={new Map()} onInteract={() => {}}
      floor={1} savedCameraState={savedCameraState} />);
    const cleanups = hooks.effects.map((effect) => effect());
    hooks.frame(hooks.state, 1 / 60);
    camera.position.toArray().forEach((value, index) => expect(value).toBeCloseTo(snapshot.position[index]!));
    expect(savedCameraState.current?.target).toEqual(snapshot.target);

    cleanups.forEach((cleanup) => cleanup?.());
    hooks.effects.forEach((effect) => effect());
    hooks.frame(hooks.state, 1 / 60);
    camera.position.toArray().forEach((value, index) => expect(value).toBeCloseTo(snapshot.position[index]!));
    expect(savedCameraState.current?.target).toEqual(snapshot.target);
  });
});
