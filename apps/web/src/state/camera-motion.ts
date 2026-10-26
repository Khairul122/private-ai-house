import type { Vector3 } from 'three';
import { FLOOR } from './office-layout.js';

/** Move the camera and its target together so following never changes the viewing angle or distance. */
export function followCamera(position: Vector3, target: Vector3, tracked: Vector3, dt: number, reducedMotion: boolean) {
  const k = reducedMotion ? 1 : 1 - Math.exp(-Math.min(dt, 0.1) * 4);
  const dx = (tracked.x - target.x) * k;
  const dy = (tracked.y + 1.2 - target.y) * k;
  const dz = (tracked.z - target.z) * k;
  target.x += dx;
  target.y += dy;
  target.z += dz;
  position.x += dx;
  position.y += dy;
  position.z += dz;
}

/** OrbitControls applies pan during update, so clamp afterward and translate the camera with its target. */
export function clampCameraPan(position: Vector3, target: Vector3, margin = 0) {
  const x = Math.max(FLOOR.minX - margin, Math.min(FLOOR.maxX + margin, target.x));
  const z = Math.max(FLOOR.minZ - margin, Math.min(FLOOR.maxZ + margin, target.z));
  position.x += x - target.x;
  position.z += z - target.z;
  target.x = x;
  target.z = z;
}
