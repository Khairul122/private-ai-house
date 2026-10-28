import type { Vector3 } from 'three';
import { FLOOR } from './office-layout.js';

export const COMPACT_CAMERA_BOUNDS = {
  minX: FLOOR.minX - 4, // -23.5
  maxX: FLOOR.maxX + 12, // 30.7
  minY: 1.2,
  maxY: 46,
  minZ: FLOOR.minZ - 4, // -17
  maxZ: FLOOR.maxZ + 36, // 49
  minDistance: 6,
  maxDistance: 64,
} as const;

/**
 * DPR policy for 3D office canvas.
 * Enforces a maximum DPR of 1.5 on screens <= 760px or on high-DPR displays
 * to prevent excessive GPU overdraw and render stall while preserving clarity.
 */
export function resolveOfficeDpr(width: number, devicePixelRatio = 1): number {
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  if (width <= 760 || dpr > 1.5) {
    return Math.min(Math.max(dpr, 1), 1.5);
  }
  return Math.max(dpr, 1);
}

export function isCompactViewport(width: number): boolean {
  return width <= 760;
}

export function isUltraCompactViewport(width: number): boolean {
  return width <= 360;
}

/**
 * Bounds overview framing multiplier on narrow viewports to keep
 * characters, boards, and rooms visible without flying into deep sky.
 */
export function getCompactCameraFit(aspect: number, isCompact = false): number {
  const safeAspect = Math.max(0.1, aspect);
  if (isCompact) {
    return Math.min(Math.max(1, 1.4 / safeAspect), 1.55);
  }
  return Math.max(1, 1.5 / safeAspect);
}

/**
 * Computes camera focus and position for board viewing.
 * Centers board directly on compact displays and shifts rightward on desktop
 * so board remains clear of the card sheet.
 */
export function getBoardCameraFraming(
  board: { x: number; y: number; z: number; normal: [number, number] },
  fit: number,
  isCompact: boolean,
) {
  const [nx, nz] = board.normal;
  const lateralShift = isCompact ? 0 : 4.5;
  const focus = {
    x: board.x + nz * lateralShift,
    y: board.y,
    z: board.z - nx * lateralShift,
  };
  const dist = Math.min(9 * fit, isCompact ? 12 : 20);
  const position = {
    x: focus.x + nx * dist,
    y: focus.y + 2.2,
    z: focus.z + nz * dist,
  };
  return { focus, position };
}

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

/**
 * Full camera clamping that prevents target or camera position from escaping the
 * office perimeter on QA viewports and compact displays.
 */
export function clampCameraBounds(
  position: Vector3,
  target: Vector3,
  options?: { isCompact?: boolean; margin?: number; bounds?: typeof COMPACT_CAMERA_BOUNDS },
) {
  const margin = options?.margin ?? 0;
  clampCameraPan(position, target, margin);

  if (options?.isCompact) {
    const bounds = options.bounds ?? COMPACT_CAMERA_BOUNDS;

    const dx = position.x - target.x;
    const dy = position.y - target.y;
    const dz = position.z - target.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist > bounds.maxDistance && dist > 0.001) {
      const scale = bounds.maxDistance / dist;
      position.x = target.x + dx * scale;
      position.y = target.y + dy * scale;
      position.z = target.z + dz * scale;
    } else if (dist < bounds.minDistance && dist > 0.001) {
      const scale = bounds.minDistance / dist;
      position.x = target.x + dx * scale;
      position.y = target.y + dy * scale;
      position.z = target.z + dz * scale;
    }

    position.x = Math.max(bounds.minX, Math.min(bounds.maxX, position.x));
    position.y = Math.max(bounds.minY, Math.min(bounds.maxY, position.y));
    position.z = Math.max(bounds.minZ, Math.min(bounds.maxZ, position.z));
  }
}
