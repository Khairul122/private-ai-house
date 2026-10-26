import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { FLOOR } from './office-layout.js';
import { clampCameraPan, followCamera } from './camera-motion.js';

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
