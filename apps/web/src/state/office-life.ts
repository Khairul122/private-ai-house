import { type P2, type Spot } from './office-layout.js';
import { ownerCanStand, planOwnerPath } from './owner-motion.js';
import type { OfficeAgent } from './office-state.js';

export type IdleActivity = 'rest' | 'read' | 'coffee' | 'stretch' | 'social';
// These are ambient poses, never evidence of a Hermes task or conversation.
const idleLocations: Array<[number, number, IdleActivity]> = [
  [7.4, -2.4, 'social'], [7.4, -0.9, 'social'], [7.4, 1.8, 'read'], [7.4, 3.9, 'stretch'],
  [10.1, -1.5, 'read'], [10.1, 0.8, 'rest'], [11.6, -0.1, 'social'], [11.6, 1.2, 'social'],
  [9, 6.3, 'coffee'], [11, 6.3, 'coffee'], [9, 7.8, 'social'], [11, 7.8, 'social'],
  [9, 10.8, 'coffee'], [11, 10.8, 'coffee'], [9, 12, 'stretch'], [11, 12, 'rest'],
  [15, -2, 'read'], [15, 0, 'stretch'], [15, 2, 'rest'], [15, 7, 'social'], [15, 9, 'social'], [15, 11, 'read'],
];
export const IDLE_SPOTS: Array<Spot & { activity: IdleActivity }> = idleLocations.map(([x, z, activity]) => ({ x, z, activity, y: 0, facing: Math.PI / 2, seated: false, via: [] }));

export type IdleRoutine = { slot: number; spot: Spot; activity: IdleActivity; nextMoveAt: number; visits: number; floor: 1 | 2 };
export type OfficeLife = { routines: Map<string, IdleRoutine>; updatedAt: number; signature: string; reducedMotion: boolean };

export function createOfficeLife(): OfficeLife {
  return { routines: new Map(), updatedAt: -1, signature: '', reducedMotion: false };
}

export function updateOfficeLife(life: OfficeLife, agents: OfficeAgent[], elapsedSeconds: number, reducedMotion: boolean) {
  const now = Math.max(0, Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0);
  const idle = agents.filter((agent) => agent.state === 'idle').sort((a, b) => a.id.localeCompare(b.id));
  const signature = idle.map((agent) => `${agent.id}:${agent.floor ?? 1}`).join('|');
  if (life.updatedAt === now && life.signature === signature && life.reducedMotion === reducedMotion) return;
  life.updatedAt = now;
  life.signature = signature;
  life.reducedMotion = reducedMotion;
  for (const [id, routine] of life.routines) {
    if (!idle.some((agent) => agent.id === id && (agent.floor ?? 1) === routine.floor)) life.routines.delete(id);
  }
  const occupied = (floor: number, slot: number) => [...life.routines.values()].some((routine) => routine.floor === floor && routine.slot === slot);
  for (const [index, agent] of idle.entries()) {
    const floor = agent.floor ?? 1;
    let routine = life.routines.get(agent.id);
    if (!routine) {
      const slot = IDLE_SPOTS.findIndex((spot, index) => ownerCanStand(spot.x, spot.z) && !occupied(floor, index));
      if (slot < 0) continue;
      const spot = IDLE_SPOTS[slot]!;
      routine = { slot, spot, activity: spot.activity, floor, visits: 0, nextMoveAt: now + 10 + index * 2.5 };
      life.routines.set(agent.id, routine);
    }
    if (reducedMotion) { routine.nextMoveAt = now + 12; continue; }
    if (now < routine.nextMoveAt) continue;
    // Reserve destinations before another employee chooses one in the same frame.
    for (let offset = 1; offset < IDLE_SPOTS.length; offset++) {
      const slot = (routine.slot + offset) % IDLE_SPOTS.length;
      const spot = IDLE_SPOTS[slot]!;
      if (occupied(floor, slot) || !ownerCanStand(spot.x, spot.z)) continue;
      if (!planOwnerPath([routine.spot.x, routine.spot.z], [spot.x, spot.z]).length) continue;
      routine.slot = slot; routine.spot = spot; routine.activity = spot.activity; routine.visits++;
      break;
    }
    routine.nextMoveAt = now + 28 + index % 4 * 4;
  }
}

/** Seated characters may leave their chair; all free-floor travel uses the furniture collision map. */
export function planOfficeRoute(from: P2, source: Spot, target: Spot): P2[] {
  const startExit = ownerCanStand(...from) ? [] : [...source.via].reverse();
  const exitIndex = startExit.findIndex((point) => ownerCanStand(...point));
  const exit = exitIndex < 0 ? [] : startExit.slice(0, exitIndex + 1);
  const start = exit.at(-1) ?? from;
  const destination: P2 = [target.x, target.z];
  const approach = ownerCanStand(...destination) ? [] : [...target.via].reverse();
  const approachIndex = approach.findIndex((point) => ownerCanStand(...point));
  const entry = approachIndex < 0 ? [] : approach.slice(0, approachIndex + 1).reverse();
  const end = entry[0] ?? destination;
  const path = planOwnerPath(start, end);
  if (!path.length) return [];
  return [...exit, ...path, ...entry.slice(1), ...(entry.length ? [destination] : [])];
}
