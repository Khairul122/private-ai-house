import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { BOARD_SIZE, BOARDS, FLOOR, LEAD_DESK, LEAD_ID, OWNER_SPOT, PODS, POD_SIZE, planPath, spotsFor, ZONES, type BoardId, type BoardSlot, type dayPhase, type P2, type Spot } from './office-layout.js';
import { STATE_COLORS, type OfficeAgent } from './office-state.js';
import type { OwnerInput } from './owner-input.js';
import { createOwnerMotion, setOwnerDestination, stepOwnerMotion, stopOwnerMotion } from './owner-motion.js';

export type CameraCommand = { kind: 'overview' | 'zone' | 'agent' | 'board' | 'owner'; id?: string; n: number };
/** Live summary drawn on a wall board; lines come from real API data. */
export type BoardContent = { id: BoardId; title: string; lines: string[]; accent: string; alert?: boolean };
type Phase = ReturnType<typeof dayPhase>;
type V3 = [number, number, number];

export type VisualOfficeProps = {
  agents: OfficeAgent[];
  ready: boolean;
  selectedId: string | null;
  ownerSelected: boolean;
  ownerInput: OwnerInput;
  ownerTarget: Spot | null;
  ownerVisitVersion: number;
  onOwnerMoving: (moving: boolean) => void;
  followId: string | null;
  onSelect: (id: string | null) => void;
  onOwnerSelect: () => void;
  onCameraInteract: () => void;
  command: CameraCommand;
  view: '3d' | 'top';
  tour: boolean;
  phase: Phase;
  reducedMotion: boolean;
  boards: BoardContent[];
  onOpenBoard: (id: BoardId) => void;
};

const GLASS = '#dff1f7';
const FRAME = '#f4f5f2';

function B({ p, s, c, e, o, shadow = true }: { p: V3; s: V3; c: string; e?: string | undefined; o?: number; shadow?: boolean }) {
  return <mesh position={p} castShadow={shadow && o === undefined} receiveShadow>
    <boxGeometry args={s} />
    <meshLambertMaterial color={c} {...(e ? { emissive: e, emissiveIntensity: 0.9 } : {})} {...(o !== undefined ? { transparent: true, opacity: o, depthWrite: false } : {})} />
  </mesh>;
}

function Plant({ p, scale = 1 }: { p: V3; scale?: number }) {
  return <group position={p} scale={scale}>
    <mesh position={[0, 0.3, 0]} castShadow><cylinderGeometry args={[0.32, 0.26, 0.6, 8]} /><meshLambertMaterial color="#f2f0ea" /></mesh>
    <mesh position={[0, 1.05, 0]} castShadow><icosahedronGeometry args={[0.62, 0]} /><meshLambertMaterial color="#4f9d5d" flatShading /></mesh>
    <mesh position={[0.15, 1.5, 0.1]} castShadow><icosahedronGeometry args={[0.38, 0]} /><meshLambertMaterial color="#5fb36c" flatShading /></mesh>
  </group>;
}

function Beanbag({ p, c }: { p: V3; c: string }) {
  return <mesh position={p} scale={[1, 0.6, 1]} castShadow><sphereGeometry args={[0.55, 10, 8]} /><meshLambertMaterial color={c} flatShading /></mesh>;
}

function Chair({ p, c = '#8fbf9f', rotY = 0 }: { p: V3; c?: string; rotY?: number }) {
  return <group position={p} rotation={[0, rotY, 0]}>
    <B p={[0, 0.45, 0]} s={[0.6, 0.1, 0.6]} c={c} />
    <B p={[0, 0.8, -0.27]} s={[0.6, 0.65, 0.08]} c={c} />
    <B p={[0, 0.22, 0]} s={[0.08, 0.44, 0.08]} c="#3d4148" />
  </group>;
}

/** Glass partition from (x1,z1) to (x2,z2) with white frame. */
function Glass({ a, b, h = 1.7 }: { a: P2; b: P2; h?: number }) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const mid: V3 = [(a[0] + b[0]) / 2, h / 2, (a[1] + b[1]) / 2];
  const rotY = Math.atan2(b[1] - a[1], b[0] - a[0]);
  return <group position={mid} rotation={[0, -rotY, 0]}>
    <B p={[0, 0, 0]} s={[len, h, 0.05]} c={GLASS} o={0.28} />
    <B p={[0, h / 2, 0]} s={[len + 0.1, 0.08, 0.12]} c={FRAME} />
    <B p={[-len / 2, 0, 0]} s={[0.1, h, 0.12]} c={FRAME} />
    <B p={[len / 2, 0, 0]} s={[0.1, h, 0.12]} c={FRAME} />
  </group>;
}

function pillTexture(text: string, dot?: string) {
  const scale = 2;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const font = `600 ${26 * scale}px "Segoe UI", Arial, sans-serif`;
  ctx.font = font;
  const pad = 20 * scale;
  const dotSpace = dot ? 24 * scale : 0;
  const height = 52 * scale;
  const width = Math.ceil(ctx.measureText(text).width + pad * 2 + dotSpace);
  canvas.width = width;
  canvas.height = height + 8;
  ctx.font = font;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.18)';
  ctx.beginPath(); ctx.roundRect(2, 6, width - 4, height, height / 2); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.roundRect(2, 2, width - 4, height - 2, height / 2); ctx.fill();
  if (dot) { ctx.fillStyle = dot; ctx.beginPath(); ctx.arc(pad + 7 * scale, height / 2, 7 * scale, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#1f2933';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, pad + dotSpace, height / 2 + 1);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return { texture, aspect: canvas.width / canvas.height };
}

/** Screen-sized pill label that always draws on top, like map callouts. */
function Label({ text, p, dot, size = 0.03, onClick }: { text: string; p: V3; dot?: string; size?: number; onClick?: () => void }) {
  const { texture, aspect } = useMemo(() => pillTexture(text, dot), [text, dot]);
  useEffect(() => () => texture.dispose(), [texture]);
  // Sprite size is a fraction of viewport height, so shrink labels on tall, narrow screens.
  const viewport = useThree((state) => state.size);
  const h = size * THREE.MathUtils.clamp(viewport.width / viewport.height / 1.4, 0.55, 1);
  return <sprite position={p} scale={[h * aspect, h, 1]} center={new THREE.Vector2(0.5, 0)} renderOrder={20}
    {...(onClick ? { onClick: (event: ThreeEvent<MouseEvent>) => { event.stopPropagation(); onClick(); } } : {})}>
    <spriteMaterial map={texture} depthTest={false} transparent sizeAttenuation={false} />
  </sprite>;
}

function Pod({ x, z, color, name, screenOn, night, showLabel }: { x: number; z: number; color: string; name: string; screenOn: boolean; night: boolean; showLabel: boolean }) {
  const h = POD_SIZE / 2;
  return <group position={[x, 0, z]}>
    <mesh position={[0, 0.02, 0]} receiveShadow><cylinderGeometry args={[2, 2, 0.04, 28]} /><meshLambertMaterial color={color} transparent opacity={0.22} /></mesh>
    <Glass a={[-h, -h]} b={[h, -h]} />
    <Glass a={[-h, -h]} b={[-h, h]} />
    <Glass a={[h, -h]} b={[h, h]} />
    <Glass a={[-h, h]} b={[0.7, h]} h={1.1} />
    <B p={[0.6, 1.25, -h + 0.08]} s={[2.6, 1.3, 0.06]} c={color} />
    {[0.2, 0.6, 1.0].map((dx) => <B key={dx} p={[-0.2 + dx, 1.3, -h + 0.12]} s={[0.28, 0.2, 0.02]} c="#fff6d8" />)}
    <B p={[0, 0.75, 0.1]} s={[2.2, 0.08, 0.9]} c="#f3f1ea" />
    {[-1, 1].map((sx) => <B key={sx} p={[sx * 1.02, 0.37, 0.1]} s={[0.06, 0.74, 0.8]} c="#d9d6cc" />)}
    <B p={[0, 1.22, 0.42]} s={[0.95, 0.6, 0.06]} c="#1d2228" />
    <B p={[0, 1.22, 0.385]} s={[0.85, 0.5, 0.01]} c={screenOn ? '#8fe3b0' : '#2a3038'} e={screenOn ? '#5ad08b' : undefined} />
    <B p={[0, 0.88, 0.42]} s={[0.12, 0.2, 0.08]} c="#1d2228" />
    <B p={[0, 0.8, -0.05]} s={[0.6, 0.03, 0.22]} c="#d7d3c8" />
    <Chair p={[0, 0, -0.95]} c="#2f3540" />
    {night && <B p={[-0.85, 0.95, 0.25]} s={[0.18, 0.3, 0.18]} c="#ffe6a3" e="#ffd36b" />}
    <Plant p={[-h + 0.55, 0, -h + 0.55]} scale={0.8} />
    <Beanbag p={[-1.35, 0.33, 1.45]} c={color} />
    {showLabel && <Label text={name} p={[0, 2.25, -h]} />}
  </group>;
}

function MeetingRoom({ active }: { active: boolean }) {
  return <group>
    <mesh position={[8.5, 0.02, -9]} receiveShadow><boxGeometry args={[9.8, 0.04, 6.8]} /><meshLambertMaterial color="#e6efe4" /></mesh>
    <Glass a={[3.5, -12.5]} b={[13.5, -12.5]} />
    <Glass a={[13.5, -12.5]} b={[13.5, -5.5]} />
    <Glass a={[3.5, -12.5]} b={[3.5, -7.3]} />
    <Glass a={[3.5, -5.5]} b={[13.5, -5.5]} h={1.1} />
    <B p={[9, 0.75, -9]} s={[6, 0.1, 1.8]} c="#d8b98c" />
    {[6.5, 11.5].map((x) => <B key={x} p={[x, 0.37, -9]} s={[0.12, 0.74, 1.2]} c="#a8875c" />)}
    {[6.75, 8.25, 9.75, 11.25].flatMap((x) => [<Chair key={`${x}a`} p={[x, 0, -10.45]} />, <Chair key={`${x}b`} p={[x, 0, -7.55]} rotY={Math.PI} />])}
    <B p={[13.35, 1.6, -9]} s={[0.08, 1.4, 2.6]} c="#1d2228" />
    <B p={[13.3, 1.6, -9]} s={[0.02, 1.2, 2.4]} c={active ? '#9fd1ff' : '#2a3038'} e={active ? '#5aa9f0' : undefined} />
    <Plant p={[4.3, 0, -11.7]} />
  </group>;
}

function Lounge() {
  return <group>
    <mesh position={[8.6, 0.02, 0.2]} receiveShadow><cylinderGeometry args={[3.4, 3.4, 0.04, 32]} /><meshLambertMaterial color="#efd9c2" /></mesh>
    <B p={[5.75, 0.3, 0]} s={[0.9, 0.6, 3.6]} c="#d98f7b" />
    <B p={[5.4, 0.75, 0]} s={[0.25, 0.9, 3.6]} c="#c9806c" />
    {[-1.9, 1.9].map((z) => <B key={z} p={[5.75, 0.55, z]} s={[0.9, 0.5, 0.25]} c="#c9806c" />)}
    <B p={[9, 0.28, -2.9]} s={[0.9, 0.55, 0.9]} c="#8db6c9" />
    <B p={[9, 0.28, 3.4]} s={[0.9, 0.55, 0.9]} c="#8db6c9" />
    <B p={[8.6, 0.32, 0.2]} s={[1.2, 0.08, 1.8]} c="#a8875c" />
    <B p={[8.6, 0.15, 0.2]} s={[0.2, 0.3, 0.2]} c="#6f5a3e" />
    <Beanbag p={[10.8, 0.3, 2.4]} c="#e6c46a" />
    <Beanbag p={[11.6, 0.3, -2.2]} c="#b8a6e3" />
    <B p={[13.25, 0.4, 0.25]} s={[0.5, 0.8, 2.8]} c="#e9e6dd" />
    <B p={[13.3, 1.65, 0.25]} s={[0.1, 1.2, 2.2]} c="#1d2228" />
    <B p={[13.24, 1.65, 0.25]} s={[0.02, 1.0, 2.0]} c="#31556b" />
    <Plant p={[4.3, 0, -3.3]} /><Plant p={[12.9, 0, 3.9]} /><Plant p={[12.9, 0, -3.4]} scale={0.8} />
  </group>;
}

function Pantry() {
  return <group>
    <mesh position={[8.5, 0.02, 9.25]} receiveShadow><boxGeometry args={[9.8, 0.04, 6.3]} /><meshLambertMaterial color="#f1ead9" /></mesh>
    <B p={[12.9, 0.5, 9]} s={[1, 1, 4.6]} c="#ece9e2" />
    <B p={[12.9, 1.02, 9]} s={[1.05, 0.06, 4.7]} c="#a8875c" />
    <B p={[13, 1.35, 8]} s={[0.5, 0.6, 0.45]} c="#2f3540" />
    <B p={[12.75, 1.18, 8]} s={[0.12, 0.12, 0.12]} c="#f5f5f5" />
    <B p={[13, 1.1, 10.5]} s={[0.4, 0.12, 0.6]} c="#dcdcdc" />
    <B p={[13, 1.2, 12.2]} s={[0.9, 2.4, 0.9]} c="#dfe7ea" />
    <mesh position={[7, 0.72, 9.5]} castShadow><cylinderGeometry args={[0.7, 0.7, 0.06, 16]} /><meshLambertMaterial color="#f3f1ea" /></mesh>
    <B p={[7, 0.36, 9.5]} s={[0.1, 0.72, 0.1]} c="#3d4148" />
    {[[6.1, 9.5], [7.9, 9.5], [7, 10.4]].map(([x, z]) => <mesh key={`${x}${z}`} position={[x!, 0.25, z!]} castShadow><cylinderGeometry args={[0.24, 0.24, 0.5, 10]} /><meshLambertMaterial color="#e6c46a" /></mesh>)}
    <Plant p={[4.3, 0, 12]} />
  </group>;
}

function LeadDesk({ active }: { active: boolean }) {
  const screen = active ? { c: '#8fe3b0', e: '#5ad08b' } : { c: '#2a3038', e: undefined };
  return <group position={[LEAD_DESK.x, 0, LEAD_DESK.z]}>
    <mesh position={[0, 0.02, -0.4]} receiveShadow><cylinderGeometry args={[2.2, 2.2, 0.04, 28]} /><meshLambertMaterial color="#343a40" transparent opacity={0.18} /></mesh>
    <B p={[0, 0.75, 0]} s={[2.8, 0.1, 1]} c="#5b4636" />
    {[-1.25, 1.25].map((x) => <B key={x} p={[x, 0.37, 0]} s={[0.12, 0.74, 0.9]} c="#3d2f25" />)}
    {[-0.55, 0.55].map((x) => <group key={x}>
      <B p={[x, 1.25, 0.25]} s={[0.95, 0.6, 0.06]} c="#1d2228" />
      <B p={[x, 1.25, 0.215]} s={[0.85, 0.5, 0.01]} c={screen.c} e={screen.e} />
    </group>)}
    <Chair p={[0, 0, -0.95]} c="#343a40" />
    <Plant p={[1.9, 0, -0.6]} scale={0.9} />
    <Label text="Lead Agent · Hermes" p={[0, 2.1, 0.3]} />
  </group>;
}

function Lobby() {
  return <group>
    <mesh position={[-13.5, 0.02, 10.25]} receiveShadow><boxGeometry args={[11, 0.04, 5]} /><meshLambertMaterial color="#ece5d6" /></mesh>
    <B p={[-13.5, 0.55, 12.1]} s={[3.6, 1.1, 0.7]} c="#f3f1ea" />
    <B p={[-13.5, 1.12, 12.1]} s={[3.8, 0.06, 0.8]} c="#a8875c" />
    <B p={[-18.6, 0.3, 10.3]} s={[0.8, 0.6, 2.6]} c="#8db6c9" />
    <Plant p={[-9, 0, 12.2]} /><Plant p={[-18.7, 0, 12.3]} scale={0.9} />
  </group>;
}

function Tree({ p, s = 1 }: { p: V3; s?: number }) {
  return <group position={p} scale={s}>
    <B p={[0, 0.8, 0]} s={[0.3, 1.6, 0.3]} c="#8a6a4a" />
    <mesh position={[0, 2.3, 0]} castShadow><icosahedronGeometry args={[1.2, 0]} /><meshLambertMaterial color="#5a9e5c" flatShading /></mesh>
  </group>;
}

function LampPost({ p, night }: { p: V3; night: boolean }) {
  return <group position={p}>
    <B p={[0, 1.4, 0]} s={[0.14, 2.8, 0.14]} c="#2b2f36" />
    <B p={[0, 2.9, 0]} s={[0.7, 0.18, 0.7]} c="#2b2f36" />
    <B p={[0, 2.78, 0]} s={[0.5, 0.06, 0.5]} c={night ? '#ffe6a3' : '#d9d6cc'} e={night ? '#ffd36b' : undefined} />
  </group>;
}

function Building({ agents, phase, selectedId }: { agents: OfficeAgent[]; phase: Phase; selectedId: string | null }) {
  const { minX, maxX, minZ, maxZ } = FLOOR;
  const w = maxX - minX;
  const d = maxZ - minZ;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const working = new Set(agents.filter((agent) => agent.room === 'workspace').map((agent) => agent.id));
  return <group>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, -0.05, cz]} receiveShadow><planeGeometry args={[140, 140]} /><meshLambertMaterial color={phase.grass} /></mesh>
    <mesh position={[cx, -0.02, cz]} receiveShadow><boxGeometry args={[w, 0.06, d]} /><meshLambertMaterial color={phase.night ? '#cfc8b8' : '#ece6d8'} /></mesh>
    <mesh position={[1.5, 0.015, 0]} receiveShadow><boxGeometry args={[1.6, 0.02, d - 0.4]} /><meshLambertMaterial color="#f7f4ec" /></mesh>
    <B p={[cx, 2.15, minZ]} s={[w, 4.3, 0.25]} c="#f4f2ec" />
    <B p={[minX, 2.15, cz]} s={[0.25, 4.3, d]} c="#f4f2ec" />
    <B p={[cx, 0.2, maxZ]} s={[w, 0.4, 0.2]} c="#f4f2ec" />
    <B p={[maxX, 0.2, cz]} s={[0.2, 0.4, d]} c="#f4f2ec" />
    {PODS.map((pod) => <Pod key={pod.id} x={pod.x} z={pod.z} color={pod.color} name={pod.name} screenOn={working.has(pod.id)} night={phase.night} showLabel={pod.id !== selectedId} />)}
    <MeetingRoom active={agents.some((agent) => agent.room === 'meeting')} />
    <Lounge /><Pantry /><Lobby />
    <LeadDesk active={agents.some((agent) => agent.id === LEAD_ID && agent.room === 'workspace')} />
    {ZONES.filter((zone) => zone.id !== 'workspace').map((zone) => <Label key={zone.id} text={zone.label} p={[zone.x, 2.4, zone.z - zone.d / 2 + 0.3]} />)}
    {[[-24, 0, -8], [-25, 0, 6], [19, 0, -10], [20, 0, 4], [-8, 0, 18], [6, 0, 19], [18, 0, 16]].map((p, i) => <Tree key={i} p={p as V3} s={0.9 + (i % 3) * 0.2} />)}
    {[[-6, 0, 14.5], [3, 0, 14.5], [15.5, 0, -2], [15.5, 0, 8]].map((p, i) => <LampPost key={i} p={p as V3} night={phase.night} />)}
  </group>;
}

const SKIN = ['#f1c27d', '#e0ac69', '#c68642', '#ffdbac', '#8d5524'];
const HAIR = ['#3b2a20', '#1f1a17', '#6b4423', '#a0522d', '#2e2e2e'];

function shortestAngle(from: number, to: number) {
  return ((to - from + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
}

function Agent({ agent, index, spot, selected, hovered, onSelect, onHover, reducedMotion, positions }: {
  agent: OfficeAgent; index: number; spot: Spot; selected: boolean; hovered: boolean;
  onSelect: (id: string) => void; onHover: (id: string | null) => void; reducedMotion: boolean;
  positions: Map<string, THREE.Vector3>;
}) {
  const root = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const marker = useRef<THREE.Mesh>(null);
  const sim = useRef({ x: spot.x, z: spot.z, rot: spot.facing, seat: spot.seated ? 1 : 0, path: [] as P2[], spot });
  const livePosition = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    positions.set(agent.id, livePosition);
    return () => { if (positions.get(agent.id) === livePosition) positions.delete(agent.id); };
  }, [agent.id, livePosition, positions]);

  useEffect(() => {
    const state = sim.current;
    if (state.spot.x === spot.x && state.spot.z === spot.z) { state.spot = spot; return; }
    state.path = reducedMotion ? [] : planPath(state.spot, spot);
    if (reducedMotion) { state.x = spot.x; state.z = spot.z; }
    state.spot = spot;
  }, [spot, reducedMotion]);

  useFrame(({ clock }, rawDt) => {
    // Generous cap keeps walking time-correct on slow or throttled frames; only tab-switch gaps are cut.
    const dt = Math.min(rawDt, 0.5);
    const t = clock.elapsedTime + index;
    const state = sim.current;
    let walking = false;
    let heading = state.spot.facing;
    const next = state.path[0];
    if (next) {
      const dx = next[0] - state.x;
      const dz = next[1] - state.z;
      const dist = Math.hypot(dx, dz);
      const step = 2.8 * dt;
      // Stand up before walking off.
      if (state.seat > 0.05) state.seat = Math.max(0, state.seat - dt * 5);
      else if (dist <= step) { state.x = next[0]; state.z = next[1]; state.path.shift(); }
      else { state.x += (dx / dist) * step; state.z += (dz / dist) * step; }
      walking = state.seat <= 0.05;
      if (dist > 0.01) heading = Math.atan2(dx, dz);
    } else {
      state.seat += ((state.spot.seated ? 1 : 0) - state.seat) * Math.min(1, dt * 6);
    }
    state.rot += shortestAngle(state.rot, heading) * Math.min(1, dt * 8);
    const swing = walking ? Math.sin(t * 9) * 0.6 : 0;
    const seatAngle = -Math.PI / 2 * state.seat;
    if (root.current) {
      const breathe = walking ? Math.abs(Math.sin(t * 9)) * 0.06 : 0;
      root.current.position.set(state.x, state.seat * (state.spot.y - 0.7) + breathe, state.z);
      root.current.rotation.y = state.rot;
    }
    livePosition.set(state.x, 0, state.z);
    const arrived = !walking && state.path.length === 0;
    const typing = arrived && agent.state === 'working';
    const talking = arrived && agent.state === 'collaborating';
    if (legL.current) legL.current.rotation.x = seatAngle + swing;
    if (legR.current) legR.current.rotation.x = seatAngle - swing;
    if (armL.current) armL.current.rotation.x = typing ? -1.15 + Math.sin(t * 16) * 0.12 : talking ? -0.5 + Math.sin(t * 2.2) * 0.35 : -swing * 0.8;
    if (armR.current) armR.current.rotation.x = typing ? -1.15 + Math.sin(t * 16 + 1.5) * 0.12 : -(-swing * 0.8);
    if (head.current) {
      head.current.rotation.y = talking ? Math.sin(t * 0.9) * 0.5 : agent.state === 'idle' && arrived ? Math.sin(t * 0.4) * 0.25 : 0;
      head.current.rotation.x = typing ? Math.sin(t * 3) * 0.05 + 0.1 : 0;
    }
    if (marker.current) { marker.current.rotation.y = t * 2; marker.current.position.y = 2.45 + Math.sin(t * 3) * 0.08; }
  });

  const skin = SKIN[index % SKIN.length]!;
  const hair = HAIR[(index * 3) % HAIR.length]!;
  const dot = STATE_COLORS[agent.state];
  return <group ref={root}
    onClick={(event) => { event.stopPropagation(); onSelect(agent.id); }}
    onPointerOver={(event) => { event.stopPropagation(); onHover(agent.id); }}
    onPointerOut={() => onHover(null)}>
    <group position={[0, 0.7, 0]}>
      <group ref={legL} position={[-0.13, 0, 0]}><B p={[0, -0.33, 0]} s={[0.2, 0.66, 0.24]} c="#2d3240" /><B p={[0, -0.66, 0.04]} s={[0.22, 0.08, 0.32]} c="#15171c" /></group>
      <group ref={legR} position={[0.13, 0, 0]}><B p={[0, -0.33, 0]} s={[0.2, 0.66, 0.24]} c="#2d3240" /><B p={[0, -0.66, 0.04]} s={[0.22, 0.08, 0.32]} c="#15171c" /></group>
    </group>
    <B p={[0, 1.05, 0]} s={[0.56, 0.72, 0.34]} c={agent.color} />
    <B p={[0, 1.38, 0.05]} s={[0.3, 0.06, 0.3]} c="#f5f5f5" />
    <group ref={armL} position={[-0.37, 1.36, 0]}><B p={[0, -0.3, 0]} s={[0.16, 0.6, 0.2]} c={agent.color} /><B p={[0, -0.64, 0]} s={[0.15, 0.12, 0.17]} c={skin} /></group>
    <group ref={armR} position={[0.37, 1.36, 0]}><B p={[0, -0.3, 0]} s={[0.16, 0.6, 0.2]} c={agent.color} /><B p={[0, -0.64, 0]} s={[0.15, 0.12, 0.17]} c={skin} /></group>
    <group ref={head} position={[0, 1.42, 0]}>
      <B p={[0, 0.27, 0]} s={[0.5, 0.5, 0.46]} c={skin} />
      <B p={[0, 0.56, -0.02]} s={[0.54, 0.14, 0.52]} c={hair} />
      <B p={[0, 0.38, -0.22]} s={[0.54, 0.4, 0.1]} c={hair} />
      {[-0.11, 0.11].map((x) => <B key={x} p={[x, 0.3, 0.235]} s={[0.07, 0.09, 0.02]} c="#1b1b1b" shadow={false} />)}
    </group>
    <mesh position={[0, 2.25, 0]}><sphereGeometry args={[0.09, 10, 8]} /><meshBasicMaterial color={dot} /></mesh>
    {selected && <mesh ref={marker} position={[0, 2.45, 0]}><octahedronGeometry args={[0.2, 0]} /><meshBasicMaterial color="#f2b632" /></mesh>}
    {agent.state === 'unknown' && !selected && <Label text="?" p={[0, 2.45, 0]} size={0.028} />}
    {(selected || hovered) && <Label text={agent.name} dot={dot} p={[0, selected ? 2.75 : 2.45, 0]} size={0.032} />}
    <mesh position={[0, 1.1, 0]} visible={false}><boxGeometry args={[0.9, 2.3, 0.9]} /><meshBasicMaterial /></mesh>
  </group>;
}

function OwnerCharacter({ destination, request, selected, hovered, input, onMoving, onSelect, onHover, reducedMotion, positions }: {
  destination: Spot | null; selected: boolean; hovered: boolean;
  request: number; onMoving: (moving: boolean) => void;
  input: OwnerInput;
  onSelect: () => void; onHover: (id: string | null) => void; reducedMotion: boolean;
  positions: Map<string, THREE.Vector3>;
}) {
  const root = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const sim = useRef(createOwnerMotion());
  const lastStop = useRef(input.stopVersion);
  const moving = useRef(false);
  const livePosition = useMemo(() => new THREE.Vector3(OWNER_SPOT.x, 0, OWNER_SPOT.z), []);

  useEffect(() => {
    positions.set('owner', livePosition);
    return () => { if (positions.get('owner') === livePosition) positions.delete('owner'); };
  }, [livePosition, positions]);

  useEffect(() => {
    if (setOwnerDestination(sim.current, destination, request)) lastStop.current = input.stopVersion;
  }, [destination, request, input]);

  useFrame((frame, rawDt) => {
    const state = sim.current;
    if (lastStop.current !== input.stopVersion || !input.enabled) { stopOwnerMotion(state); lastStop.current = input.stopVersion; }
    const right: P2 = [frame.camera.matrixWorld.elements[0]!, frame.camera.matrixWorld.elements[2]!];
    stepOwnerMotion(state, input.read(), right, rawDt, reducedMotion);
    if (moving.current !== state.moving) { moving.current = state.moving; onMoving(state.moving); }
    if (root.current) { root.current.position.set(state.x, state.bob, state.z); root.current.rotation.y = state.heading; }
    livePosition.set(state.x, 0, state.z);
    if (legL.current) legL.current.rotation.x = state.swing;
    if (legR.current) legR.current.rotation.x = -state.swing;
    if (armL.current) armL.current.rotation.x = -state.swing * 0.8;
    if (armR.current) armR.current.rotation.x = state.swing * 0.8;
  });

  return <group ref={root}
    onClick={(event) => { event.stopPropagation(); onSelect(); }}
    onPointerOver={(event) => { event.stopPropagation(); onHover('owner'); }}
    onPointerOut={() => onHover(null)}>
    <group position={[0, 0.7, 0]}>
      <group ref={legL} position={[-0.13, 0, 0]}><B p={[0, -0.33, 0]} s={[0.2, 0.66, 0.24]} c="#303946" /><B p={[0, -0.66, 0.04]} s={[0.22, 0.08, 0.32]} c="#15171c" /></group>
      <group ref={legR} position={[0.13, 0, 0]}><B p={[0, -0.33, 0]} s={[0.2, 0.66, 0.24]} c="#303946" /><B p={[0, -0.66, 0.04]} s={[0.22, 0.08, 0.32]} c="#15171c" /></group>
    </group>
    <B p={[0, 1.05, 0]} s={[0.6, 0.74, 0.38]} c="#1f2933" />
    <B p={[0, 1.37, 0.06]} s={[0.32, 0.07, 0.32]} c="#f3f1ea" />
    <B p={[0, 1.04, 0.2]} s={[0.09, 0.34, 0.025]} c="#d5a53b" shadow={false} />
    <group ref={armL} position={[-0.38, 1.35, 0]}><B p={[0, -0.3, 0]} s={[0.16, 0.6, 0.2]} c="#1f2933" /><B p={[0, -0.64, 0]} s={[0.15, 0.12, 0.17]} c="#c68642" /></group>
    <group ref={armR} position={[0.38, 1.35, 0]}><B p={[0, -0.3, 0]} s={[0.16, 0.6, 0.2]} c="#1f2933" /><B p={[0, -0.64, 0]} s={[0.15, 0.12, 0.17]} c="#c68642" /></group>
    <group position={[0, 1.42, 0]}>
      <B p={[0, 0.27, 0]} s={[0.5, 0.5, 0.46]} c="#c68642" />
      <B p={[0, 0.56, -0.02]} s={[0.54, 0.14, 0.52]} c="#1f1a17" />
      <B p={[0, 0.38, -0.22]} s={[0.54, 0.4, 0.1]} c="#1f1a17" />
      {[-0.11, 0.11].map((x) => <B key={x} p={[x, 0.3, 0.235]} s={[0.07, 0.09, 0.02]} c="#1b1b1b" shadow={false} />)}
    </group>
    {selected && <mesh position={[0, 2.45, 0]}><octahedronGeometry args={[0.2, 0]} /><meshBasicMaterial color="#946b0f" /></mesh>}
    {(selected || hovered) && <Label text="Pemilik · Anda" dot="#946b0f" p={[0, selected ? 2.75 : 2.45, 0]} size={0.032} />}
    <mesh position={[0, 1.1, 0]} visible={false}><boxGeometry args={[0.95, 2.3, 0.95]} /><meshBasicMaterial /></mesh>
  </group>;
}

/** Title band, one large headline value, and one short detail line; sized to stay legible from the overview camera. */
function boardTexture(content: BoardContent) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = Math.round(1024 * BOARD_SIZE.h / BOARD_SIZE.w);
  const ctx = canvas.getContext('2d')!;
  const fit = (text: string, max: number) => {
    let value = text;
    while (ctx.measureText(value).width > max && value.length > 4) value = `${value.slice(0, -2)}…`;
    return value;
  };
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = content.accent;
  ctx.fillRect(0, 0, canvas.width, 104);
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 60px "Segoe UI", Arial, sans-serif';
  ctx.fillText(fit(content.title, canvas.width - 120), 36, 54);
  if (content.alert) { ctx.beginPath(); ctx.arc(canvas.width - 52, 52, 20, 0, Math.PI * 2); ctx.fillStyle = '#ffd43b'; ctx.fill(); }
  const [headline = '', ...details] = content.lines;
  ctx.fillStyle = '#1f2933';
  ctx.font = '700 84px "Segoe UI", Arial, sans-serif';
  ctx.fillText(fit(headline, canvas.width - 72), 36, 196);
  ctx.fillStyle = '#4a5560';
  ctx.font = '500 46px "Segoe UI", Arial, sans-serif';
  ctx.fillText(fit(details.join(' · '), canvas.width - 72), 36, 296);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function Board({ slot, content, hovered, onHover, onOpen }: { slot: BoardSlot; content: BoardContent; hovered: boolean; onHover: (id: BoardId | null) => void; onOpen: (id: BoardId) => void }) {
  const key = `${content.title}|${content.accent}|${content.alert ? 1 : 0}|${content.lines.join('|')}`;
  // key covers every field the texture draws, so content objects can be rebuilt each render.
  const texture = useMemo(() => boardTexture(content), [key]);
  useEffect(() => () => texture.dispose(), [texture]);
  const { w, h } = BOARD_SIZE;
  return <group position={[slot.x, slot.y, slot.z]} rotation={[0, slot.rotY, 0]} scale={hovered ? 1.04 : 1}
    onClick={(event) => { event.stopPropagation(); onOpen(slot.id); }}
    onPointerOver={(event) => { event.stopPropagation(); onHover(slot.id); }}
    onPointerOut={() => onHover(null)}>
    <B p={[0, 0, -0.06]} s={[w + 0.16, h + 0.16, 0.06]} c={hovered ? content.accent : '#2b2f36'} />
    <mesh position={[0, 0, 0.01]}><planeGeometry args={[w, h]} /><meshBasicMaterial map={texture} toneMapped={false} /></mesh>
  </group>;
}

function zoneTarget(id: string | undefined) {
  const zone = ZONES.find((item) => item.id === id);
  return zone ? { x: zone.x, z: zone.z, dist: Math.max(zone.w, zone.d) * 1.35 + 6 } : null;
}

function CameraRig({ command, view, tour, spots, reducedMotion, followId, positions, onInteract }: { command: CameraCommand; view: '3d' | 'top'; tour: boolean; spots: Map<string, Spot>; reducedMotion: boolean; followId: string | null; positions: Map<string, THREE.Vector3>; onInteract: () => void }) {
  const { camera, gl, size } = useThree();
  const controls = useMemo(() => new OrbitControls(camera), [camera]);
  const fly = useRef<{ target: THREE.Vector3; position: THREE.Vector3; trackId: string | null; anchor: THREE.Vector3 } | null>(null);
  const interact = useRef(onInteract);
  interact.current = onInteract;
  const aspect = size.width / Math.max(size.height, 1);

  useEffect(() => {
    controls.connect(gl.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 7;
    controls.maxDistance = 90;
    controls.screenSpacePanning = false;
    controls.target.set(-3, 0, 0);
    controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    const cancel = () => { fly.current = null; interact.current(); };
    controls.addEventListener('start', cancel);
    return () => { controls.removeEventListener('start', cancel); controls.dispose(); };
  }, [controls, gl]);

  useEffect(() => {
    controls.enableRotate = view === '3d';
    controls.minPolarAngle = view === 'top' ? 0 : 0.25;
    controls.maxPolarAngle = view === 'top' ? 0.001 : 1.2;
  }, [controls, view]);

  useEffect(() => {
    // Narrow screens need the camera further back to fit the same floor.
    const fit = Math.max(1, 1.5 / aspect);
    let target = { x: -3, z: 0, dist: 44 * fit };
    if (command.kind === 'zone') target = zoneTarget(command.id) ?? target;
    if (command.kind === 'agent' && command.id) {
      const spot = positions.get(command.id) ?? spots.get(command.id);
      if (spot) target = { x: spot.x, z: spot.z, dist: 13 * fit };
    }
    if (command.kind === 'owner') {
      const owner = positions.get('owner') ?? OWNER_SPOT;
      target = { x: owner.x, z: owner.z, dist: 13 * fit };
    }
    if (command.kind === 'zone') target.dist *= fit;
    const direction = view === 'top' ? new THREE.Vector3(0, 1, 0.001) : new THREE.Vector3(0.55, 0.95, 1).normalize();
    let goal = { target: new THREE.Vector3(target.x, 0, target.z), position: new THREE.Vector3(target.x, 0, target.z).addScaledVector(direction, target.dist) };
    const board = command.kind === 'board' && view === '3d' ? BOARDS.find((slot) => slot.id === command.id) : undefined;
    if (board) {
      // Face the board square-on from slightly above so its text is readable.
      // Boards open alongside a card on the right, so aim right of the board to keep it in the free left area.
      const [nx, nz] = board.normal;
      const focus = new THREE.Vector3(board.x + nz * 4.5, board.y, board.z - nx * 4.5);
      goal = { target: focus, position: focus.clone().add(new THREE.Vector3(nx * 9 * fit, 2.5, nz * 9 * fit)) };
    }
    if (reducedMotion) { controls.target.copy(goal.target); camera.position.copy(goal.position); fly.current = null; }
    else fly.current = { ...goal, trackId: followId, anchor: goal.target.clone() };
    // spots intentionally omitted: re-run only on explicit commands, not on every state poll.
  }, [command.n, view, aspect, reducedMotion]);

  useFrame((_, dt) => {
    const goal = fly.current;
    if (goal) {
      const tracked = goal.trackId ? positions.get(goal.trackId) : null;
      if (tracked) {
        const dx = tracked.x - goal.anchor.x; const dz = tracked.z - goal.anchor.z;
        goal.target.x += dx; goal.target.z += dz;
        goal.position.x += dx; goal.position.z += dz;
        goal.anchor.copy(tracked);
      }
      const k = 1 - Math.exp(-dt * 3.5);
      controls.target.lerp(goal.target, k);
      camera.position.lerp(goal.position, k);
      if (camera.position.distanceTo(goal.position) < 0.05) fly.current = null;
    } else if (followId) {
      const tracked = positions.get(followId);
      if (tracked) {
        const k = reducedMotion ? 1 : 1 - Math.exp(-dt * 4);
        const dx = (tracked.x - controls.target.x) * k;
        const dy = (0.9 - controls.target.y) * k;
        const dz = (tracked.z - controls.target.z) * k;
        controls.target.x += dx; controls.target.y += dy; controls.target.z += dz;
        camera.position.x += dx; camera.position.y += dy; camera.position.z += dz;
      }
    }
    controls.autoRotate = tour && !followId && !reducedMotion && view === '3d';
    controls.autoRotateSpeed = 0.7;
    // Keep panning on the building.
    controls.target.x = THREE.MathUtils.clamp(controls.target.x, FLOOR.minX - 4, FLOOR.maxX + 4);
    controls.target.z = THREE.MathUtils.clamp(controls.target.z, FLOOR.minZ - 4, FLOOR.maxZ + 4);
    controls.update();
  });
  return null;
}

function Lights({ phase }: { phase: Phase }) {
  return <>
    <color attach="background" args={[phase.sky]} />
    <hemisphereLight args={[phase.sky, phase.grass, phase.ambient * 0.6]} />
    <ambientLight intensity={phase.ambient * 0.55} />
    <directionalLight position={[-14, 26, 18]} intensity={phase.sun} color={phase.sunColor} castShadow
      shadow-mapSize={[2048, 2048]} shadow-camera-left={-30} shadow-camera-right={30} shadow-camera-top={26} shadow-camera-bottom={-26} shadow-camera-far={80} shadow-bias={-0.0004} />
  </>;
}

export default function VisualOffice({ agents, ready, selectedId, ownerSelected, ownerInput, ownerTarget, ownerVisitVersion, onOwnerMoving, followId, onSelect, onOwnerSelect, onCameraInteract, command, view, tour, phase, reducedMotion, boards, onOpenBoard }: VisualOfficeProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hoveredBoard, setHoveredBoard] = useState<BoardId | null>(null);
  const spots = useMemo(() => spotsFor(agents), [agents]);
  const positions = useMemo(() => new Map<string, THREE.Vector3>(), []);
  useEffect(() => { document.body.style.cursor = hoveredId || hoveredBoard ? 'pointer' : ''; return () => { document.body.style.cursor = ''; }; }, [hoveredId, hoveredBoard]);
  return <Canvas shadows dpr={[1, 2]} camera={{ position: [20, 34, 38], fov: 38, near: 0.5, far: 400 }} onPointerMissed={() => onSelect(null)}>
    <Lights phase={phase} />
    <Building agents={agents} phase={phase} selectedId={selectedId} />
    {BOARDS.map((slot) => { const content = boards.find((board) => board.id === slot.id); return content ? <Board key={slot.id} slot={slot} content={content} hovered={hoveredBoard === slot.id} onHover={setHoveredBoard} onOpen={onOpenBoard} /> : null; })}
    {ready && agents.map((agent, index) => {
      const spot = spots.get(agent.id);
      return spot ? <Agent key={agent.id} agent={agent} index={index} spot={spot} selected={agent.id === selectedId} hovered={agent.id === hoveredId}
        onSelect={onSelect} onHover={setHoveredId} reducedMotion={reducedMotion} positions={positions} /> : null;
    })}
    <OwnerCharacter destination={ownerTarget} request={ownerVisitVersion} selected={ownerSelected} hovered={hoveredId === 'owner'} input={ownerInput} onMoving={onOwnerMoving} onSelect={onOwnerSelect} onHover={setHoveredId} reducedMotion={reducedMotion} positions={positions} />
    <CameraRig command={command} view={view} tour={tour} spots={spots} reducedMotion={reducedMotion} followId={followId} positions={positions} onInteract={onCameraInteract} />
  </Canvas>;
}

