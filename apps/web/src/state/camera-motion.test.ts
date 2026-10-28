import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { FLOOR } from './office-layout.js';
import {
  COMPACT_CAMERA_BOUNDS,
  clampCameraBounds,
  clampCameraPan,
  followCamera,
  getBoardCameraFraming,
  getCompactCameraFit,
  isCompactViewport,
  isUltraCompactViewport,
  resolveOfficeDpr,
} from './camera-motion.js';

describe('camera motion', () => {
  it('keeps third-person distance and angle while smoothly following a moving character', () => {
    const target = new Vector3(0, 1.2, 0);
    const camera = new Vector3(4, 8, 9);
    const offset = camera.clone().sub(target);
    const tracked = new Vector3(8, 0, -3);
    followCamera(camera, target, tracked, 1 / 60, false);
    expect(target.x).toBeGreaterThan(0);
    expect(target.x).toBeLessThan(8);
    expect(camera.clone().sub(target).distanceTo(offset)).toBeLessThan(1e-10);
    for (let i = 0; i < 180; i++) followCamera(camera, target, tracked, 1 / 60, false);
    expect(target.distanceTo(new Vector3(8, 1.2, -3))).toBeLessThan(0.001);
    expect(camera.clone().sub(target).distanceTo(offset)).toBeLessThan(1e-10);
  });

  it('snaps only for reduced motion and limits delayed frames', () => {
    const target = new Vector3(0, 1.2, 0);
    const camera = new Vector3(4, 8, 9);
    const tracked = new Vector3(10, 0, 0);
    followCamera(camera, target, tracked, 20, false);
    expect(target.x).toBeLessThan(10);
    followCamera(camera, target, tracked, 1 / 60, true);
    expect(target.x).toBe(10);
    expect(camera.x - target.x).toBeCloseTo(4);
  });

  it('keeps the orbit offset while clamping manual pan to both floor edges', () => {
    const target = new Vector3(FLOOR.maxX + 10, 1, FLOOR.minZ - 10);
    const camera = target.clone().add(new Vector3(4, 8, 9));
    clampCameraPan(camera, target);
    expect(target.x).toBe(FLOOR.maxX);
    expect(target.z).toBe(FLOOR.minZ);
    expect(camera.clone().sub(target).distanceTo(new Vector3(4, 8, 9))).toBeLessThan(1e-10);
  });

  it('allows the board framing margin without unbounded panning', () => {
    const target = new Vector3(FLOOR.maxX + 8, 3.4, FLOOR.minZ - 8);
    const camera = target.clone().add(new Vector3(9, 2.5, 0));
    clampCameraPan(camera, target, 4);
    expect(target.x).toBe(FLOOR.maxX + 4);
    expect(target.z).toBe(FLOOR.minZ - 4);
    expect(camera.clone().sub(target).distanceTo(new Vector3(9, 2.5, 0))).toBeLessThan(1e-10);
  });
});

describe('DPR policy (resolveOfficeDpr)', () => {
  it('caps DPR at 1.5 on screens <= 760px regardless of high device DPR', () => {
    expect(resolveOfficeDpr(760, 2)).toBe(1.5);
    expect(resolveOfficeDpr(760, 3)).toBe(1.5);
    expect(resolveOfficeDpr(420, 2.5)).toBe(1.5);
    expect(resolveOfficeDpr(360, 3)).toBe(1.5);
    expect(resolveOfficeDpr(320, 2)).toBe(1.5);
  });

  it('preserves exact DPR <= 1.5 on screens <= 760px', () => {
    expect(resolveOfficeDpr(760, 1)).toBe(1);
    expect(resolveOfficeDpr(420, 1.25)).toBe(1.25);
    expect(resolveOfficeDpr(360, 1.5)).toBe(1.5);
  });

  it('caps high DPR at 1.5 even on desktop screens (> 760px)', () => {
    expect(resolveOfficeDpr(1200, 2)).toBe(1.5);
    expect(resolveOfficeDpr(1440, 3)).toBe(1.5);
    expect(resolveOfficeDpr(1920, 2.25)).toBe(1.5);
  });

  it('allows normal DPR <= 1.5 on desktop screens (> 760px)', () => {
    expect(resolveOfficeDpr(1200, 1)).toBe(1);
    expect(resolveOfficeDpr(1440, 1.25)).toBe(1.25);
    expect(resolveOfficeDpr(1920, 1.5)).toBe(1.5);
  });

  it('falls back to 1 for non-positive or invalid DPR values including Infinity', () => {
    expect(resolveOfficeDpr(1200, 0)).toBe(1);
    expect(resolveOfficeDpr(760, -2)).toBe(1);
    expect(resolveOfficeDpr(360, Number.NaN)).toBe(1);
    expect(resolveOfficeDpr(760, Number.POSITIVE_INFINITY)).toBe(1);
    expect(resolveOfficeDpr(1200, Number.NEGATIVE_INFINITY)).toBe(1);
  });

  it('accurately tests boundary conditions around 760px vs 761px', () => {
    // 760px boundary (compact)
    expect(resolveOfficeDpr(760, 1)).toBe(1);
    expect(resolveOfficeDpr(760, 1.25)).toBe(1.25);
    expect(resolveOfficeDpr(760, 1.5)).toBe(1.5);
    expect(resolveOfficeDpr(760, 2)).toBe(1.5);
    expect(resolveOfficeDpr(760, 3)).toBe(1.5);

    // 761px boundary (desktop)
    expect(resolveOfficeDpr(761, 1)).toBe(1);
    expect(resolveOfficeDpr(761, 1.25)).toBe(1.25);
    expect(resolveOfficeDpr(761, 1.5)).toBe(1.5);
    expect(resolveOfficeDpr(761, 2)).toBe(1.5);
    expect(resolveOfficeDpr(761, 3)).toBe(1.5);
  });
});

describe('compact camera bounds & framing', () => {
  it('identifies compact and ultra-compact viewports', () => {
    expect(isCompactViewport(760)).toBe(true);
    expect(isCompactViewport(420)).toBe(true);
    expect(isCompactViewport(360)).toBe(true);
    expect(isCompactViewport(761)).toBe(false);
    expect(isCompactViewport(1200)).toBe(false);

    expect(isUltraCompactViewport(360)).toBe(true);
    expect(isUltraCompactViewport(320)).toBe(true);
    expect(isUltraCompactViewport(361)).toBe(false);
  });

  it('bounds overview camera fit on narrow portrait screens', () => {
    // Desktop wide aspect (16:9 ~ 1.77)
    expect(getCompactCameraFit(1.77, false)).toBeCloseTo(1, 1);

    // Narrow mobile portrait aspect (e.g. 360x740 ~ 0.486)
    // Without compact bounds, fit would balloon to > 2.8
    const compactFit = getCompactCameraFit(0.486, true);
    expect(compactFit).toBeLessThanOrEqual(1.55);
    expect(compactFit).toBeGreaterThanOrEqual(1);

    // Desktop mode with narrow window allows larger fit
    const desktopNarrowFit = getCompactCameraFit(0.486, false);
    expect(desktopNarrowFit).toBeGreaterThan(1.55);
  });

  it('clamps camera distance and position within office bounds in compact mode', () => {
    const target = new Vector3(0, 0, 0);
    // Camera placed extremely far away
    const camera = new Vector3(150, 120, 200);

    clampCameraBounds(camera, target, { isCompact: true });

    // Distance should be clamped to maxDistance
    expect(camera.distanceTo(target)).toBeLessThanOrEqual(COMPACT_CAMERA_BOUNDS.maxDistance + 0.01);
    // Position coordinates should stay within perimeter
    expect(camera.x).toBeLessThanOrEqual(COMPACT_CAMERA_BOUNDS.maxX);
    expect(camera.x).toBeGreaterThanOrEqual(COMPACT_CAMERA_BOUNDS.minX);
    expect(camera.y).toBeLessThanOrEqual(COMPACT_CAMERA_BOUNDS.maxY);
    expect(camera.y).toBeGreaterThanOrEqual(COMPACT_CAMERA_BOUNDS.minY);
    expect(camera.z).toBeLessThanOrEqual(COMPACT_CAMERA_BOUNDS.maxZ);
    expect(camera.z).toBeGreaterThanOrEqual(COMPACT_CAMERA_BOUNDS.minZ);
  });

  it('prevents camera from leaving office perimeter on QA viewports (320px, 355px, 760px)', () => {
    const qaViewports = [
      { width: 320, height: 568 },
      { width: 355, height: 700 },
      { width: 760, height: 800 },
    ];

    for (const vp of qaViewports) {
      const aspect = vp.width / vp.height;
      const fit = getCompactCameraFit(aspect, true);
      const target = new Vector3(-3, 0, 0);
      const direction = new Vector3(0.62, 0.72, 1).normalize();
      const dist = 41 * fit;
      const camera = target.clone().addScaledVector(direction, dist);

      clampCameraBounds(camera, target, { isCompact: true });

      // Camera position must not exceed office perimeter
      expect(camera.x).toBeLessThanOrEqual(COMPACT_CAMERA_BOUNDS.maxX);
      expect(camera.x).toBeGreaterThanOrEqual(COMPACT_CAMERA_BOUNDS.minX);
      expect(camera.z).toBeLessThanOrEqual(COMPACT_CAMERA_BOUNDS.maxZ);
      expect(camera.z).toBeGreaterThanOrEqual(COMPACT_CAMERA_BOUNDS.minZ);
      expect(camera.y).toBeLessThanOrEqual(COMPACT_CAMERA_BOUNDS.maxY);
      expect(camera.y).toBeGreaterThanOrEqual(COMPACT_CAMERA_BOUNDS.minY);
      expect(camera.distanceTo(target)).toBeLessThanOrEqual(COMPACT_CAMERA_BOUNDS.maxDistance);
    }
  });

  it('frames boards directly on compact displays and shifts right on desktop', () => {
    const board = { x: 0, y: 3.4, z: -12.84, normal: [0, 1] as [number, number] };

    const compactFraming = getBoardCameraFraming(board, 1.2, true);
    // On compact screens, lateral shift should be 0 (board is squarely centered)
    expect(compactFraming.focus.x).toBe(board.x);
    expect(compactFraming.position.x).toBe(board.x);
    expect(compactFraming.position.z).toBeGreaterThan(board.z);
    expect(compactFraming.position.z - compactFraming.focus.z).toBeLessThanOrEqual(12);

    const desktopFraming = getBoardCameraFraming(board, 1.2, false);
    // On desktop, lateral shift is applied so board is left-framed alongside the card sheet
    expect(desktopFraming.focus.x).toBeCloseTo(board.x + 4.5);
  });
});
