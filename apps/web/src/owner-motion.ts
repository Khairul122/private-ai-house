import { FLOOR, BROWSER_DESK, LEAD_DESK, LIFT, MANAGER_DESK, OWNER_SPOT, PODS, POD_SIZE, type P2, type Spot } from './office-layout.js';
import type { OwnerMoveInput } from './owner-input.js';

const RADIUS = 0.38;
const GRID = 0.25;
type Obstacle = { minX: number; maxX: number; minZ: number; maxZ: number };
const box = (x: number, z: number, w: number, d: number): Obstacle => ({ minX: x - w / 2 - RADIUS, maxX: x + w / 2 + RADIUS, minZ: z - d / 2 - RADIUS, maxZ: z + d / 2 + RADIUS });

// Ground footprints of the solid furniture and partitions rendered in VisualOffice.
const obstacles: Obstacle[] = [
  box(LIFT.x, LIFT.z, LIFT.w, LIFT.d),
  box(BROWSER_DESK.x,BROWSER_DESK.z,2.8,1),box(BROWSER_DESK.x,BROWSER_DESK.z-0.95,0.6,0.6),
  box(MANAGER_DESK.x,MANAGER_DESK.z,2.8,1),box(MANAGER_DESK.x,MANAGER_DESK.z-0.95,0.6,0.6),
  ...PODS.flatMap(({ x, z }) => [
    box(x, z - POD_SIZE / 2, POD_SIZE, 0.12), box(x - POD_SIZE / 2, z, 0.12, POD_SIZE), box(x + POD_SIZE / 2, z, 0.12, POD_SIZE),
    box(x - 0.9, z + POD_SIZE / 2, 3.2, 0.12), box(x, z + 0.1, 2.2, 0.9), box(x, z - 0.95, 0.6, 0.6),
    box(x - 1.95, z - 1.95, 0.8, 0.8), box(x - 1.35, z + 1.45, 1.1, 1.1),
  ]),
  box(8.5, -12.5, 10, 0.12), box(13.5, -9, 0.12, 7), box(3.5, -9.9, 0.12, 5.2), box(8.5, -5.5, 10, 0.12),
  box(9, -9, 6, 1.8), ...[6.75, 8.25, 9.75, 11.25].flatMap((x) => [box(x, -10.45, 0.6, 0.6), box(x, -7.55, 0.6, 0.6)]),
  box(4.3, -11.7, 0.9, 0.9),
  box(5.7, 0, 1.1, 4.05), box(9, -2.9, 0.9, 0.9), box(9, 3.4, 0.9, 0.9), box(8.6, 0.2, 1.2, 1.8),
  box(10.8, 2.4, 1.1, 1.1), box(11.6, -2.2, 1.1, 1.1), box(13.25, 0.25, 0.5, 2.8),
  box(4.3, -3.3, 0.9, 0.9), box(12.9, 3.9, 0.9, 0.9), box(12.9, -3.4, 0.8, 0.8),
  box(12.9, 9, 1.05, 4.7), box(13, 12.2, 0.9, 0.9), box(7, 9.5, 1.4, 1.4),
  ...[[6.1, 9.5], [7.9, 9.5], [7, 10.4]].map(([x, z]) => box(x!, z!, 0.48, 0.48)), box(4.3, 12, 0.9, 0.9),
  box(LEAD_DESK.x, LEAD_DESK.z, 2.8, 1), box(LEAD_DESK.x, LEAD_DESK.z - 0.95, 0.6, 0.6), box(LEAD_DESK.x + 1.9, LEAD_DESK.z - 0.6, 0.9, 0.9),
  box(-13.5, 12.1, 3.8, 0.8), box(-18.6, 10.3, 0.8, 2.6), box(-9, 12.2, 0.9, 0.9), box(-18.7, 12.3, 0.8, 0.8),
];

export function ownerCanStand(x: number, z: number) {
  return x >= FLOOR.minX + 0.6 && x <= FLOOR.maxX - 0.6 && z >= FLOOR.minZ + 0.6 && z <= FLOOR.maxZ - 0.6
    && !obstacles.some((item) => x > item.minX && x < item.maxX && z > item.minZ && z < item.maxZ);
}

export function ownerCanWalk(from: P2, to: P2) {
  const steps = Math.max(1, Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / 0.1));
  for (let i = 0; i <= steps; i++) if (!ownerCanStand(from[0] + (to[0] - from[0]) * i / steps, from[1] + (to[1] - from[1]) * i / steps)) return false;
  return true;
}

const columns = Math.floor((FLOOR.maxX - FLOOR.minX) / GRID) + 1;
const rows = Math.floor((FLOOR.maxZ - FLOOR.minZ) / GRID) + 1;
const pointAt = (index: number): P2 => [FLOOR.minX + index % columns * GRID, FLOOR.minZ + Math.floor(index / columns) * GRID];
const walkable = Uint8Array.from({ length: columns * rows }, (_, i) => { const [x, z] = pointAt(i); return ownerCanStand(x, z) ? 1 : 0; });

function gridAnchor(point: P2): number | undefined {
  const col = Math.round((point[0] - FLOOR.minX) / GRID);
  const row = Math.round((point[1] - FLOOR.minZ) / GRID);
  const candidates: number[] = [];
  for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
    const x = col + dx; const z = row + dz;
    const index = z * columns + x;
    if (x >= 0 && x < columns && z >= 0 && z < rows && walkable[index]) candidates.push(index);
  }
  candidates.sort((a, b) => { const pa = pointAt(a); const pb = pointAt(b); return Math.hypot(pa[0] - point[0], pa[1] - point[1]) - Math.hypot(pb[0] - point[0], pb[1] - point[1]); });
  return candidates.find((index) => ownerCanWalk(point, pointAt(index)));
}

export function planOwnerPath(from: P2, to: P2): P2[] {
  if (ownerCanWalk(from, to)) return [to];
  const start = gridAnchor(from); const end = gridAnchor(to);
  if (start === undefined || end === undefined) return [];
  const previous = new Int32Array(walkable.length).fill(-1);
  const queue = new Int32Array(walkable.length);
  let head = 0; let tail = 1;
  queue[0] = start; previous[start] = start;
  while (head < tail && previous[end] === -1) {
    const index = queue[head++]!;
    const col = index % columns; const row = Math.floor(index / columns);
    for (const next of [col > 0 ? index - 1 : -1, col < columns - 1 ? index + 1 : -1, row > 0 ? index - columns : -1, row < rows - 1 ? index + columns : -1]) {
      if (next < 0 || !walkable[next] || previous[next] !== -1) continue;
      previous[next] = index; queue[tail++] = next;
    }
  }
  if (previous[end] === -1) return [];
  const route: P2[] = [to];
  for (let index = end; index !== start; index = previous[index]!) route.push(pointAt(index));
  route.push(pointAt(start)); route.reverse();
  const path: P2[] = [];
  let current = from; let i = 0;
  while (i < route.length) {
    let next = i;
    while (next + 1 < route.length && ownerCanWalk(current, route[next + 1]!)) next++;
    current = route[next]!; path.push(current); i = next + 1;
  }
  return path;
}

export function ownerVisitDestination(target: Spot): P2 | null {
  for (const distance of [1.35, 1.75, 2.15]) for (const angle of [Math.PI / 2, Math.PI, -Math.PI / 2, 0, Math.PI * 0.75, -Math.PI * 0.75, Math.PI / 4, -Math.PI / 4]) {
    const x = target.x + Math.sin(target.facing + angle) * distance;
    const z = target.z + Math.cos(target.facing + angle) * distance;
    if (ownerCanStand(x, z)) return [x, z];
  }
  return null;
}

export function createOwnerMotion(start: P2 = [OWNER_SPOT.x, OWNER_SPOT.z]) {
  return { x: start[0], z: start[1], heading: OWNER_SPOT.facing, facing: OWNER_SPOT.facing, path: [] as P2[], targetKey: '', gait: 0, blend: 0, swing: 0, bob: 0, moving: false };
}
export type OwnerMotion = ReturnType<typeof createOwnerMotion>;

export function setOwnerDestination(state: OwnerMotion, target: Spot | null, request = 0) {
  const key = target ? `${request}:${target.x}:${target.z}:${target.facing}` : '';
  if (state.targetKey === key) return false;
  state.targetKey = key;
  const destination = target ? ownerVisitDestination(target) : null;
  state.path = destination ? planOwnerPath([state.x, state.z], destination) : [];
  if (target && destination) state.facing = Math.atan2(target.x - destination[0], target.z - destination[1]);
  else state.facing = state.heading;
  return true;
}

export function stopOwnerMotion(state: OwnerMotion) { state.path = []; state.facing = state.heading; }

export function stepOwnerMotion(state: OwnerMotion, input: OwnerMoveInput, cameraRight: P2, rawDt: number, reducedMotion = false) {
  const dt = Math.max(0, Math.min(Number.isFinite(rawDt) ? rawDt : 0, 0.1));
  const startX = state.x; const startZ = state.z;
  const horizontal = Number(input.right) - Number(input.left);
  const vertical = Number(input.up) - Number(input.down);
  const length = Math.hypot(horizontal, vertical);
  if (input.up || input.down || input.left || input.right) state.path = [];
  if (length) {
    const yawLength = Math.hypot(...cameraRight) || 1;
    const rx = cameraRight[0] / yawLength; const rz = cameraRight[1] / yawLength;
    const dx = (rx * horizontal + rz * vertical) / length * 4.2 * dt;
    const dz = (rz * horizontal - rx * vertical) / length * 4.2 * dt;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.08));
    for (let i = 0; i < steps; i++) {
      if (ownerCanStand(state.x + dx / steps, state.z)) state.x += dx / steps;
      if (ownerCanStand(state.x, state.z + dz / steps)) state.z += dz / steps;
    }
  } else {
    let remaining = 2.8 * dt;
    while (state.path.length && remaining > 0) {
      const next = state.path[0]!;
      const distance = Math.hypot(next[0] - state.x, next[1] - state.z);
      if (distance <= remaining) { state.x = next[0]; state.z = next[1]; state.path.shift(); remaining -= distance; }
      else { state.x += (next[0] - state.x) / distance * remaining; state.z += (next[1] - state.z) / distance * remaining; remaining = 0; }
    }
  }
  const dx = state.x - startX; const dz = state.z - startZ;
  const distance = Math.hypot(dx, dz);
  const moving = distance > 0.00001;
  state.moving = moving;
  const heading = moving ? Math.atan2(dx, dz) : state.path.length ? state.heading : state.facing;
  if (length && moving) state.facing = heading;
  const turn = Math.atan2(Math.sin(heading - state.heading), Math.cos(heading - state.heading));
  state.heading += turn * (reducedMotion ? 1 : 1 - Math.exp(-dt * 12));
  state.gait += distance * 2.6;
  state.blend += ((moving ? 1 : 0) - state.blend) * (1 - Math.exp(-dt * 18));
  state.swing = reducedMotion ? 0 : Math.sin(state.gait) * 0.6 * state.blend;
  state.bob = reducedMotion ? 0 : Math.abs(Math.sin(state.gait)) * 0.035 * state.blend;
}
