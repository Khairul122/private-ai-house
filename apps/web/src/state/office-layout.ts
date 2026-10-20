import { ROSTER, type OfficeAgent, type RoomKey } from './office-state.js';

// Floor plan in world units (x right, z toward the viewer). Shared by the 3D scene and the minimap.
export type P2 = [number, number];
export type Spot = { x: number; z: number; y: number; facing: number; seated: boolean; via: P2[] };

export const FLOOR = { minX: -19.5, maxX: 18.7, minZ: -13, maxZ: 13 };
export const SPINE_X = 1.5;
export const POD_SIZE = 5;
const POD_XS = [-16, -9.5, -3];
const POD_ZS = [-9.5, -3, 3.5];
export const LEAD_ID = 'lead-agent';
// The lead has its own desk (LEAD_DESK); the other nine agents fill the 3×3 pod grid.
export const PODS = ROSTER.filter((entry) => entry.id !== LEAD_ID && !entry.floor).map((entry, i) => ({ ...entry, x: POD_XS[i % 3]!, z: POD_ZS[Math.floor(i / 3)]! }));
export const BROWSER_DESK = {x:-16,z:9.2};
export const PROJECTS_CO_ID_DESK = { x: -12.5, z: 9.2 };
export const MANAGER_DESK = {x:-9,z:9.2};
export const FLOOR_TWO_PODS = PODS.map((pod,index)=>{const entry=ROSTER.filter(a=>a.floor===2 && a.id!=='delivery-manager')[index];return {...pod,...(entry ?? {id:`vacant-${index}`,name:'Meja tersedia',role:'Belum ditempati',color:'#8b928e'})};});
/** Lift at the back end of the central corridor, shared by both floors; stepping onto its doorstep rides it to the other floor. */
export const LIFT = { x: 1.5, z: -12, w: 2.4, d: 1.8, h: 2.5, exit: { x: 1.5, z: -8.6 } };
export const liftDoorReached = (x: number, z: number) => Math.abs(x - LIFT.x) <= LIFT.w / 2 - 0.3 && z <= LIFT.z + LIFT.d / 2 + 0.55;
export const LEAD_DESK = { x: -4, z: 10.4 };
const corridorZ = (podZ: number) => podZ + POD_SIZE / 2 + 0.75;
export const OWNER_SPOT: Spot = { x: -17.1, z: 8.2, y: 0, facing: 0, seated: false, via: [[SPINE_X, corridorZ(POD_ZS[2]!)], [-17.1, corridorZ(POD_ZS[2]!)]] };

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
  ...[7.6, 9, 10.4, 11.8].map((z) => ({ x: 11.2, z, y: 0, facing: Math.PI / 2, seated: false, via: [[SPINE_X, z], [9.5, z]] as P2[] })),
  { x: 9.5, z: 11.8, y: 0, facing: Math.PI / 2, seated: false, via: [[SPINE_X, 11.8], [9.5, 11.8]] },
  { x: 9.5, z: 6.2, y: 0, facing: Math.PI / 2, seated: false, via: [[SPINE_X, 6.2], [9.5, 6.2]] },
];

const MEETING_SEATS: Spot[] = [6.75, 8.25, 9.75, 11.25].flatMap((x) => [
  { x, z: -7.6, y: 0.5, facing: Math.PI, seated: true, via: [[SPINE_X, -6.5], [5, -6.5]] as P2[] },
  { x, z: -10.4, y: 0.5, facing: 0, seated: true, via: [[SPINE_X, -6.5], [5, -6.5], [5, -10.4]] as P2[] },
]);

const LOBBY_SLOTS: Spot[] = [-16.5, -15, -13.5, -12, -10.5].flatMap((x) => [9.4, 10.6].map((z) => ({
  x, z, y: 0, facing: 0, seated: false, via: [[SPINE_X, corridorZ(POD_ZS[2]!)], [x, corridorZ(POD_ZS[2]!)]] as P2[],
})));
LOBBY_SLOTS.push({x:-11,z:7.7,y:0,facing:0,seated:false,via:[[SPINE_X,6.75],[-11,6.75]]});
LOBBY_SLOTS.push({x:-7.5,z:7.7,y:0,facing:0,seated:false,via:[[SPINE_X,6.75],[-7.5,6.75]]});

function podSeat(id: string): Spot {
  if (id === 'projects-co-id-scout') return { x: PROJECTS_CO_ID_DESK.x, z: PROJECTS_CO_ID_DESK.z - 1, y: 0.5, facing: 0, seated: true, via: [[SPINE_X, 6.75], [PROJECTS_CO_ID_DESK.x + 1.6, 6.75], [PROJECTS_CO_ID_DESK.x + 1.6, PROJECTS_CO_ID_DESK.z - 1]] };
  if(id==='browser-bid-operator') return {x:BROWSER_DESK.x,z:BROWSER_DESK.z-1,y:0.5,facing:0,seated:true,via:[[SPINE_X,6.75],[BROWSER_DESK.x+1.8,6.75],[BROWSER_DESK.x+1.8,BROWSER_DESK.z-1]]};
  if(id==='floor-one-manager') return {x:MANAGER_DESK.x,z:MANAGER_DESK.z-1,y:0.5,facing:0,seated:true,via:[[SPINE_X,corridorZ(POD_ZS[2]!)],[MANAGER_DESK.x+1.8,corridorZ(POD_ZS[2]!)],[MANAGER_DESK.x+1.8,MANAGER_DESK.z-1]]};
  if (id === LEAD_ID || id==='delivery-manager') return { x: LEAD_DESK.x, z: LEAD_DESK.z - 1, y: 0.5, facing: 0, seated: true, via: [[SPINE_X, corridorZ(POD_ZS[2]!)], [LEAD_DESK.x + 1.8, corridorZ(POD_ZS[2]!)], [LEAD_DESK.x + 1.8, LEAD_DESK.z - 1]] };
  const pod = [...PODS,...FLOOR_TWO_PODS].find((entry) => entry.id === id)!;
  const cz = corridorZ(pod.z);
  // Walk in through the opening on the right of the pod front, then around the desk.
  return { x: pod.x, z: pod.z - 0.9, y: 0.5, facing: 0, seated: true, via: [[SPINE_X, cz], [pod.x + 1.6, cz], [pod.x + 1.6, pod.z - 0.9]] };
}

/** Destination spot of every agent that is placed on the floor (offline agents are not placed). */
const rosterOrder = new Map(ROSTER.map((entry, index) => [entry.id, index]));

/**
 * Assign shared-room seats from stable roster order, not input order or current
 * room population. This keeps unrelated agents from jumping when one changes
 * state. Linear probing only handles more agents than preferred seat indexes.
 */
function stableRoomSpots(agents: OfficeAgent[], room: Exclude<RoomKey, 'workspace'>, seats: Spot[]): Map<string, Spot> {
  const placed = new Map<string, Spot>();
  for (const floor of [1, 2] as const) {
    const used = new Set<number>();
    const candidates = agents
      .filter((agent) => (agent.floor ?? 1) === floor && agent.room === room)
      .sort((a, b) => (rosterOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rosterOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id));
    candidates.forEach((agent) => {
      const preferred = (rosterOrder.get(agent.id) ?? 0) % seats.length;
      let index = preferred;
      while (used.has(index) && used.size < seats.length) index = (index + 1) % seats.length;
      used.add(index);
      placed.set(agent.id, seats[index % seats.length]!);
    });
  }
  return placed;
}

export function spotsFor(agents: OfficeAgent[]): Map<string, Spot> {
  const spots = new Map<string, Spot>();
  for (const agent of agents) {
    if (agent.room === 'workspace') spots.set(agent.id, podSeat(agent.id));
  }
  for (const [room, seats] of [['meeting', MEETING_SEATS], ['lounge', BREAK_SLOTS], ['lobby', LOBBY_SLOTS] ] as const) {
    for (const [id, spot] of stableRoomSpots(agents, room, seats)) spots.set(id, spot);
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

export type BoardId = 'opportunities' | 'pipeline' | 'tasks' | 'calendar' | 'inbox' | 'work' | 'activity' | 'agents' | 'profile' | 'policy' | 'knowledge' | 'capabilities' | 'operations' | 'projects-co-id';
export type BoardSlot = { id: BoardId; route: string; label: string; x: number; y: number; z: number; rotY: number; normal: P2; floor?: 1 | 2 };

export const BOARD_SIZE = { w: 4.2, h: 1.5 };
const BACK_BOARDS: Array<[BoardId, string, string]> = [
  ['opportunities', '/opportunities', 'Peluang'], ['pipeline', '/pipeline', 'Pipeline'], ['tasks', '/tasks', 'Papan Tugas'],
  ['calendar', '/calendar', 'Kalender'], ['inbox', '/inbox', 'Kotak Masuk'], ['work', '/work', 'Proyek & Pendapatan'], ['activity', '/activity', 'Aktivitas'],
  ['projects-co-id', '/projects-co-id', 'projects.co.id'],
];
const LEFT_BOARDS: Array<[BoardId, string, string]> = [
  ['agents', '/agents', 'Tim AI'], ['profile', '/profile', 'Profil'], ['policy', '/policy', 'Kebijakan'],
  ['knowledge', '/knowledge', 'Knowledge Hub'], ['capabilities', '/capabilities', 'Status Integrasi'],
];

/** Wall-mounted boards: the back wall faces +z and the left wall faces +x, both toward the default camera. */
export const BOARDS: BoardSlot[] = [
  {id:'operations',route:'/operations',label:'Operasional Klien · Lt 2',x:-9.5,y:3.4,z:FLOOR.minZ+0.16,rotY:0,normal:[0,1],floor:2},
  ...BACK_BOARDS.map(([id, route, label], i) => ({ id, route, label, x: -16.8 + i * 4.7, y: 3.4, z: FLOOR.minZ + 0.16, rotY: 0, normal: [0, 1] as P2 })),
  ...LEFT_BOARDS.map(([id, route, label], i) => ({ id, route, label, x: FLOOR.minX + 0.16, y: 3.4, z: -10.2 + i * 5.1, rotY: Math.PI / 2, normal: [1, 0] as P2 })),
];
