import { ROSTER, type OfficeAgent, type RoomKey } from './office-state.js';

// Floor plan in world units (x right, z toward the viewer). Shared by the 3D scene and the minimap.
export type P2 = [number, number];
export type Spot = { x: number; z: number; y: number; facing: number; seated: boolean; via: P2[] };

export const FLOOR = { minX: -19.5, maxX: 14, minZ: -13, maxZ: 13 };
export const SPINE_X = 1.5;
export const POD_SIZE = 5;
const POD_XS = [-16, -9.5, -3];
const POD_ZS = [-9.5, -3, 3.5];
export const PODS = ROSTER.map((entry, i) => ({ ...entry, x: POD_XS[i % 3]!, z: POD_ZS[Math.floor(i / 3)]! }));
const corridorZ = (podZ: number) => podZ + POD_SIZE / 2 + 0.75;

export type ZoneId = 'workspace' | 'meeting' | 'lounge' | 'pantry' | 'lobby';
export const ZONES: Array<{ id: ZoneId; label: string; x: number; z: number; w: number; d: number }> = [
  { id: 'workspace', label: 'Workspace', x: -9.5, z: -2.75, w: 19, d: 19.5 },
  { id: 'meeting', label: 'Ruang Rapat', x: 8.5, z: -9, w: 10, d: 7 },
  { id: 'lounge', label: 'Lounge', x: 8.5, z: 0.25, w: 10, d: 8.5 },
  { id: 'pantry', label: 'Pantry', x: 8.5, z: 9.25, w: 10, d: 6.5 },
  { id: 'lobby', label: 'Lobby', x: -13.5, z: 10.25, w: 11, d: 5 },
];

const towardTv = (x: number, z: number) => Math.atan2(13.2 - x, 0.25 - z);
const LOUNGE_VIA = (z: number): P2[] => [[SPINE_X, -3.6], [7.6, -3.6], [7.6, z]];

// Sofa, armchairs and beanbags first, then standing spots at the pantry counter.
const BREAK_SLOTS: Spot[] = [
  ...[-1.2, 0, 1.2].map((z) => ({ x: 6.3, z, y: 0.5, facing: Math.PI / 2, seated: true, via: LOUNGE_VIA(z) })),
  { x: 9, z: -2.9, y: 0.5, facing: towardTv(9, -2.9), seated: true, via: LOUNGE_VIA(-2.9) },
  { x: 9, z: 3.4, y: 0.5, facing: towardTv(9, 3.4), seated: true, via: LOUNGE_VIA(3.4) },
  { x: 10.8, z: 2.4, y: 0.3, facing: towardTv(10.8, 2.4), seated: true, via: LOUNGE_VIA(2.4) },
  ...[7.6, 9, 10.4].map((z) => ({ x: 11.2, z, y: 0, facing: Math.PI / 2, seated: false, via: [[SPINE_X, z], [9.5, z]] as P2[] })),
];

const MEETING_SEATS: Spot[] = [6.75, 8.25, 9.75, 11.25].flatMap((x) => [
  { x, z: -7.6, y: 0.5, facing: Math.PI, seated: true, via: [[SPINE_X, -6.5], [5, -6.5]] as P2[] },
  { x, z: -10.4, y: 0.5, facing: 0, seated: true, via: [[SPINE_X, -6.5], [5, -6.5], [5, -10.4]] as P2[] },
]);

const LOBBY_SLOTS: Spot[] = [-16.5, -15, -13.5, -12, -10.5].flatMap((x) => [9.4, 10.6].map((z) => ({
  x, z, y: 0, facing: 0, seated: false, via: [[SPINE_X, corridorZ(POD_ZS[2]!)], [x, corridorZ(POD_ZS[2]!)]] as P2[],
})));

function podSeat(index: number): Spot {
  const pod = PODS[index]!;
  const cz = corridorZ(pod.z);
  // Walk in through the opening on the right of the pod front, then around the desk.
  return { x: pod.x, z: pod.z - 0.9, y: 0.5, facing: 0, seated: true, via: [[SPINE_X, cz], [pod.x + 1.6, cz], [pod.x + 1.6, pod.z - 0.9]] };
}

/** Destination spot of every agent that is placed on the floor (offline agents are not placed). */
export function spotsFor(agents: OfficeAgent[]): Map<string, Spot> {
  const spots = new Map<string, Spot>();
  const rank: Record<RoomKey, number> = { workspace: 0, meeting: 0, lounge: 0, lobby: 0 };
  for (const agent of agents) {
    if (!agent.room) continue;
    const index = ROSTER.findIndex((entry) => entry.id === agent.id);
    const n = rank[agent.room]++;
    const spot = agent.room === 'workspace' ? podSeat(index)
      : agent.room === 'meeting' ? MEETING_SEATS[n % MEETING_SEATS.length]
        : agent.room === 'lounge' ? BREAK_SLOTS[n % BREAK_SLOTS.length]
          : LOBBY_SLOTS[n % LOBBY_SLOTS.length];
    if (spot) spots.set(agent.id, spot);
  }
  return spots;
}

/** Corridor route between two spots: back out along the old spot's approach, then in along the new one. */
export function planPath(from: Spot | null, to: Spot): P2[] {
  const target: P2 = [to.x, to.z];
  if (!from) return [target];
  let shared = 0;
  while (shared < from.via.length && shared < to.via.length && from.via[shared]![0] === to.via[shared]![0] && from.via[shared]![1] === to.via[shared]![1]) shared += 1;
  const points = [...from.via.slice(shared).reverse(), ...to.via.slice(shared), target];
  return points.filter((point, i) => i === 0 || point[0] !== points[i - 1]![0] || point[1] !== points[i - 1]![1]);
}

/** Lighting phase from the viewer's real local clock. */
export function dayPhase(hour: number) {
  if (hour >= 5 && hour < 10) return { label: 'Pagi', sky: '#cfe4f2', grass: '#b8d8a0', ambient: 1.15, sun: 2.3, sunColor: '#ffe9c9', night: false };
  if (hour >= 10 && hour < 15) return { label: 'Siang', sky: '#d9edf7', grass: '#bfdca8', ambient: 1.3, sun: 2.6, sunColor: '#ffffff', night: false };
  if (hour >= 15 && hour < 18) return { label: 'Sore', sky: '#f1dcc4', grass: '#b7cf96', ambient: 1.05, sun: 2.1, sunColor: '#ffcf96', night: false };
  return { label: 'Malam', sky: '#18202e', grass: '#2f3d33', ambient: 0.55, sun: 0.6, sunColor: '#a9bcff', night: true };
}
