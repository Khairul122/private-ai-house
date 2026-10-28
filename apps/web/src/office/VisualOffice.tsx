import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { BOARD_SIZE, BOARDS, FLOOR, FLOOR_TWO_PODS, PROJECTS_CO_ID_DESK, LEAD_DESK, LIFT, liftDoorReached, LEAD_ID, MANAGER_DESK, OWNER_SPOT, PODS, POD_SIZE, spotsFor, ZONES, type BoardId, type BoardSlot, type dayPhase, type P2, type Spot } from '../state/office-layout.js';
import type { OfficeAgent } from '../state/office-state.js';
import type { OfficeLearningStatus } from '../../../server/src/models/office-learning-types.js';
import type { OwnerInput } from '../state/owner-input.js';
import { createOwnerMotion, setOwnerDestination, stepOwnerMotion, stopOwnerMotion } from '../state/owner-motion.js';
import { OfficeAgent as OfficeAgentCharacter, spokenOfficeTurn } from './OfficeAgent.js';
import { OfficeEnvironment } from './OfficeEnvironment.js';
import OfficeObjects from './OfficeObjects.js';
import { bindCanvasGestureIsolation, createGestureTracker, invitationSpot, type GestureTracker, type OfficeInvitation } from '../state/office-interaction.js';
import { createOfficeLife, updateOfficeLife, type OfficeLife } from '../state/office-life.js';
import { clampCameraPan, followCamera } from '../state/camera-motion.js';

export type CameraCommand = { kind: 'overview' | 'zone' | 'agent' | 'board' | 'owner'; id?: string; n: number };
/** Live summary drawn on a wall board; lines come from real API data. */
export type BoardContent = { id: BoardId; title: string; lines: string[]; accent: string; alert?: boolean };
type Phase = ReturnType<typeof dayPhase>;
type V3 = [number, number, number];

export type VisualOfficeProps = {
  invitation: OfficeInvitation;
  floor: 1 | 2;
  ownerStart: P2;
  onLift: () => void;
  agents: OfficeAgent[];
  learning?: OfficeLearningStatus | null | undefined;
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
  onOpenCommunity?: (() => void) | undefined;
};

const GLASS = '#dff1f7';
const FRAME = '#f4f5f2';

function B({ p, s, c, e, o, shadow = true, roughness = 0.72, metalness = 0 }: { p: V3; s: V3; c: string; e?: string | undefined; o?: number; shadow?: boolean; roughness?: number; metalness?: number }) {
  return <mesh position={p} castShadow={shadow && o === undefined} receiveShadow>
    <boxGeometry args={s} />
    <meshStandardMaterial color={c} {...(o !== undefined ? { transparent: true, opacity: o, depthWrite: false, roughness: 0.18, metalness: 0.08 } : { roughness, metalness })} {...(e ? { emissive: e, emissiveIntensity: 0.65 } : {})} />
  </mesh>;
}

function Plant({ p, scale = 1 }: { p: V3; scale?: number }) {
  return <group position={p} scale={scale}>
    <mesh position={[0, 0.3, 0]} castShadow><cylinderGeometry args={[0.32, 0.26, 0.6, 8]} /><meshStandardMaterial roughness={0.76} color="#f2f0ea" /></mesh>
    <mesh position={[0, 1.05, 0]} castShadow><icosahedronGeometry args={[0.62, 0]} /><meshStandardMaterial roughness={0.76} color="#4f9d5d" flatShading /></mesh>
    <mesh position={[0.15, 1.5, 0.1]} castShadow><icosahedronGeometry args={[0.38, 0]} /><meshStandardMaterial roughness={0.76} color="#5fb36c" flatShading /></mesh>
  </group>;
}

function Beanbag({ p, c }: { p: V3; c: string }) {
  return <mesh position={p} scale={[1, 0.6, 1]} castShadow><sphereGeometry args={[0.55, 10, 8]} /><meshStandardMaterial roughness={0.88} color={c} flatShading /></mesh>;
}

function Rug({ p, s, c, edge = '#b8734f' }: { p: V3; s: [number, number]; c: string; edge?: string }) {
  return <group position={p}>
    <B p={[0, 0, 0]} s={[s[0], 0.025, s[1]]} c={edge} shadow={false} roughness={0.95} />
    <B p={[0, 0.014, 0]} s={[s[0] - 0.18, 0.018, s[1] - 0.18]} c={c} shadow={false} roughness={0.98} />
  </group>;
}

function Chair({ p, c = '#8fbf9f', rotY = 0 }: { p: V3; c?: string; rotY?: number }) {
  return <group position={p} rotation={[0, rotY, 0]}>
    <B p={[0, 0.45, 0]} s={[0.6, 0.1, 0.6]} c={c} roughness={0.9} />
    <B p={[0, 0.8, -0.27]} s={[0.6, 0.65, 0.08]} c={c} roughness={0.9} />
    <B p={[0, 0.22, 0]} s={[0.08, 0.44, 0.08]} c="#343940" metalness={0.35} />
    <B p={[-0.22, 0.04, 0]} s={[0.08, 0.08, 0.5]} c="#343940" metalness={0.35} />
    <B p={[0.22, 0.04, 0]} s={[0.08, 0.08, 0.5]} c="#343940" metalness={0.35} />
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

function Lift({ floor, onUse }: { floor: 1 | 2; onUse: () => void }) {
  const { x, z, w, d, h } = LIFT;
  const front = z + d / 2;
  const target = floor === 1 ? 2 : 1;
  return <group onClick={(event) => { event.stopPropagation(); onUse(); }}
    onPointerOver={(event) => { event.stopPropagation(); document.body.style.cursor = 'pointer'; }}
    onPointerOut={() => { document.body.style.cursor = ''; }}>
    <B p={[x, 0.04, z]} s={[w, 0.08, d]} c="#b9bec4" />
    <B p={[x, h / 2, z - d / 2 + 0.05]} s={[w, h, 0.1]} c="#6f7a84" />
    {[-1, 1].map((sx) => <B key={sx} p={[x + sx * (w / 2 - 0.05), h / 2, z]} s={[0.1, h, d]} c={GLASS} o={0.55} />)}
    <B p={[x, h + 0.06, z]} s={[w + 0.1, 0.12, d + 0.1]} c={FRAME} />
    <B p={[x, 0.09, z]} s={[w - 0.3, 0.02, d - 0.3]} c="#ffe9a8" e="#ffd36b" shadow={false} />
    {[-1, 1].map((sx) => <B key={sx} p={[x + sx * (w / 2 - 0.3), (h - 0.15) / 2, front - 0.05]} s={[0.6, h - 0.15, 0.08]} c="#aab3bb" />)}
    <B p={[x, h - 0.1, front - 0.03]} s={[w, 0.2, 0.1]} c={FRAME} />
    <B p={[x + w / 2 + 0.15, 1.2, front - 0.02]} s={[0.12, 0.24, 0.05]} c="#2f9e5b" e="#2f9e5b" shadow={false} />
    <B p={[x, 0.025, front + 0.35]} s={[w - 0.6, 0.03, 0.5]} c="#2f9e5b" shadow={false} />
    <Label text={`Lift · ke Lantai ${target}`} p={[x, h + 0.25, front]} dot="#2f9e5b" size={0.034} onClick={onUse} />
  </group>;
}

function Pod({ x, z, color, screenOn, night }: { x: number; z: number; color: string; screenOn: boolean; night: boolean }) {
  const h = POD_SIZE / 2;
  return <group position={[x, 0, z]}>
    <B p={[0.5, 0.66, -h + 0.16]} s={[2.95, 1.32, 0.12]} c="#687568" roughness={0.98} />
    <B p={[0.5, 1.34, -h + 0.16]} s={[3.05, 0.06, 0.18]} c="#bd976d" />
    <B p={[-0.83, 0.9, -h + 0.24]} s={[0.13, 0.35, 0.025]} c={color} shadow={false} />
    <B p={[0, 0.75, 0.1]} s={[2.45, 0.11, 1.05]} c="#bd976d" roughness={0.65} />
    {[-1, 1].map((sx) => <group key={sx}>
      <B p={[sx * 1.03, 0.37, 0.1]} s={[0.12, 0.74, 0.72]} c="#38483e" />
      <B p={[sx * 1.03, 0.06, 0.1]} s={[0.32, 0.1, 0.95]} c="#38483e" />
    </group>)}
    <B p={[0, 0.816, 0.09]} s={[1.32, 0.014, 0.73]} c="#596558" roughness={0.98} shadow={false} />
    <B p={[0, 1.22, 0.42]} s={[0.95, 0.6, 0.06]} c="#1d2228" />
    <B p={[0, 1.22, 0.385]} s={[0.85, 0.5, 0.01]} c={screenOn ? '#b6d5bf' : '#36423d'} e={screenOn ? '#547e65' : undefined} />
    <B p={[0, 0.88, 0.42]} s={[0.12, 0.2, 0.08]} c="#1d2228" />
    <B p={[0, 0.8, -0.05]} s={[0.6, 0.03, 0.22]} c="#d7d3c8" />
    <Chair p={[0, 0, -0.95]} c="#4c5c51" />
    <B p={[0.91, 0.84, -0.05]} s={[0.37, 0.06, 0.42]} c="#b8734f" roughness={0.85} />
    <mesh position={[-0.91, 0.92, 0.18]}><cylinderGeometry args={[0.1, 0.09, 0.23, 12]} /><meshStandardMaterial color={night ? '#e0cc9d' : '#e7dfcd'} /></mesh>
    <B p={[-1.85, 0.38, 0.3]} s={[0.66, 0.76, 0.8]} c="#ded8c9" />
    <B p={[-1.85, 0.57, 0.712]} s={[0.44, 0.04, 0.035]} c="#7a745f" />
    <Plant p={[-h + 0.55, 0, -h + 0.55]} scale={0.65} />
  </group>;
}

function MeetingRoom({ active }: { active: boolean }) {
  return <group>
    <Rug p={[8.5, 0.045, -9]} s={[9.8, 6.8]} c="#496354" edge="#6d7e6a" />
    <B p={[9, 0.75, -9]} s={[6, 0.14, 1.8]} c="#ad835c" roughness={0.65} />
    <B p={[9, 0.83, -9]} s={[4.4, 0.016, 0.55]} c="#3f5348" shadow={false} />
    {[6.5, 11.5].map((x) => <B key={x} p={[x, 0.37, -9]} s={[0.38, 0.74, 1.25]} c="#344d3d" />)}
    {[6.75, 8.25, 9.75, 11.25].flatMap((x) => [<Chair key={`${x}a`} p={[x, 0, -10.45]} c="#cfbf9d" />, <Chair key={`${x}b`} p={[x, 0, -7.55]} rotY={Math.PI} c="#cfbf9d" />])}
    <B p={[13.4, 0.6, -9]} s={[0.38, 1.2, 3.1]} c="#a4825e" />
    <B p={[13.35, 1.6, -9]} s={[0.08, 1.4, 2.6]} c="#1d2228" />
    <B p={[13.3, 1.6, -9]} s={[0.02, 1.2, 2.4]} c={active ? '#bdcdb8' : '#35433c'} e={active ? '#50694f' : undefined} />
    <Plant p={[4.3, 0, -11.7]} />
  </group>;
}

function Lounge() {
  return <group>
    <Rug p={[8.6, 0.055, 0.25]} s={[8.1, 7.5]} c="#c7ac87" edge="#ece0ca" />
    <B p={[5.92, 0.19, 0]} s={[1.26, 0.24, 3.9]} c="#704d37" />
    <B p={[5.43, 0.69, 0]} s={[0.3, 0.95, 3.9]} c="#a3634b" roughness={0.98} />
    {[-1.2, 0, 1.2].map((z) => <group key={z}>
      <B p={[6.04, 0.42, z]} s={[1.05, 0.23, 1.12]} c="#bb7c60" roughness={1} />
      <B p={[5.62, 0.83, z]} s={[0.28, 0.62, 1.1]} c="#b67659" roughness={1} />
    </group>)}
    {[-1.94, 1.94].map((z) => <B key={z} p={[5.98, 0.57, z]} s={[1.38, 0.5, 0.18]} c="#a3634b" />)}
    {[-2.9, 3.4].map((z) => <group key={z} position={[9, 0, z]} rotation={[0, z < 0 ? 0 : Math.PI, 0]}>
      <B p={[0, 0.22, 0]} s={[0.86, 0.35, 0.86]} c="#765a3d" />
      <B p={[0, 0.46, 0]} s={[0.98, 0.18, 0.95]} c="#d5c4a3" roughness={1} />
      <B p={[0, 0.75, -0.44]} s={[1.02, 0.76, 0.18]} c="#bca786" roughness={1} />
    </group>)}
    <mesh position={[8.6, 0.36, 0.2]} scale={[0.8, 1, 1.2]} castShadow receiveShadow><cylinderGeometry args={[0.85, 0.85, 0.14, 32]} /><meshStandardMaterial color="#78583d" roughness={0.6} /></mesh>
    <B p={[8.6, 0.17, 0.2]} s={[0.52, 0.34, 0.65]} c="#554432" />
    <Beanbag p={[10.8, 0.3, 2.4]} c="#6c7b62" />
    <Beanbag p={[11.6, 0.3, -2.2]} c="#c8b492" />
    <B p={[13.25, 0.4, 0.25]} s={[0.5, 0.8, 2.8]} c="#a5825a" />
    <B p={[13.3, 1.65, 0.25]} s={[0.1, 1.2, 2.2]} c="#805c40" />
    <B p={[13.24, 1.65, 0.25]} s={[0.02, 1.0, 2.0]} c="#e5dfcc" />
    <Plant p={[4.3, 0, -3.3]} /><Plant p={[12.9, 0, 3.9]} /><Plant p={[12.9, 0, -3.4]} scale={0.8} />
  </group>;
}

function Pantry() {
  return <group>
    <Rug p={[8.5, 0.04, 9.25]} s={[9.8, 6.3]} c="#ded7c8" edge="#a99b80" />
    <B p={[12.9, 0.5, 9]} s={[1, 1, 4.6]} c="#355748" />
    <B p={[12.9, 1.02, 9]} s={[1.12, 0.1, 4.8]} c="#e8dfca" />
    {[7.3, 8.45, 9.6, 10.75].map((z) => <group key={z}>
      <B p={[12.385, 0.55, z]} s={[0.035, 0.74, 1.02]} c="#486652" />
      <B p={[12.35, 0.8, z]} s={[0.04, 0.045, 0.35]} c="#bf9e69" metalness={0.4} />
    </group>)}
    <B p={[13, 1.1, 10.5]} s={[0.4, 0.06, 0.65]} c="#737d75" metalness={0.35} />
    <B p={[13.15, 1.28, 10.65]} s={[0.05, 0.35, 0.05]} c="#737d75" metalness={0.55} />
    <B p={[13, 1.2, 12.2]} s={[0.9, 2.4, 0.9]} c="#d9d5c8" />
    <B p={[12.53, 1.45, 12.2]} s={[0.04, 0.64, 0.055]} c="#626b5e" metalness={0.35} />
    <mesh position={[7, 0.72, 9.5]} castShadow><cylinderGeometry args={[0.82, 0.82, 0.1, 24]} /><meshStandardMaterial roughness={0.8} color="#ab8157" /></mesh>
    <mesh position={[7, 0.35, 9.5]}><cylinderGeometry args={[0.12, 0.35, 0.7, 12]} /><meshStandardMaterial color="#405546" /></mesh>
    {[[6.1, 9.5], [7.9, 9.5], [7, 10.4]].map(([x, z]) => <group key={`${x}${z}`} position={[x!, 0, z!]}>
      <mesh position={[0, 0.48, 0]} castShadow><cylinderGeometry args={[0.28, 0.28, 0.12, 16]} /><meshStandardMaterial color="#b68b60" /></mesh>
      <B p={[0, 0.23, 0]} s={[0.2, 0.46, 0.2]} c="#486652" />
    </group>)}
    <Plant p={[4.3, 0, 12]} />
  </group>;
}

function LeadDesk({ active }: { active: boolean }) {
  const screen = active ? { c: '#8fe3b0', e: '#5ad08b' } : { c: '#2a3038', e: undefined };
  return <group position={[LEAD_DESK.x, 0, LEAD_DESK.z]}>
    <mesh position={[0, 0.02, -0.4]} receiveShadow><cylinderGeometry args={[2.2, 2.2, 0.04, 28]} /><meshStandardMaterial roughness={0.76} color="#343a40" transparent opacity={0.18} /></mesh>
    <B p={[0, 0.75, 0]} s={[2.8, 0.1, 1]} c="#5b4636" />
    {[-1.25, 1.25].map((x) => <B key={x} p={[x, 0.37, 0]} s={[0.12, 0.74, 0.9]} c="#3d2f25" />)}
    {[-0.55, 0.55].map((x) => <group key={x}>
      <B p={[x, 1.25, 0.25]} s={[0.95, 0.6, 0.06]} c="#1d2228" />
      <B p={[x, 1.25, 0.215]} s={[0.85, 0.5, 0.01]} c={screen.c} e={screen.e} />
    </group>)}
    <Chair p={[0, 0, -0.95]} c="#343a40" />
    <Plant p={[1.9, 0, -0.6]} scale={0.9} />
  </group>;
}

function Lobby() {
  return <group>
    <mesh position={[-13.5, 0.02, 10.25]} receiveShadow><boxGeometry args={[11, 0.04, 5]} /><meshStandardMaterial roughness={0.76} color="#ece5d6" /></mesh>
    <B p={[-13.5, 0.55, 12.1]} s={[3.6, 1.1, 0.7]} c="#47624f" />
    <B p={[-13.5, 1.12, 12.1]} s={[3.8, 0.09, 0.8]} c="#b99268" />
    <B p={[-13.5, 0.63, 12.47]} s={[2.8, 0.48, 0.025]} c="#d8c9ab" />
    <B p={[-18.6, 0.3, 10.3]} s={[0.8, 0.6, 2.6]} c="#a97c5e" />
    <Plant p={[-9, 0, 12.2]} /><Plant p={[-18.7, 0, 12.3]} scale={0.9} />
  </group>;
}

function Tree({ p, s = 1 }: { p: V3; s?: number }) {
  return <group position={p} scale={s}>
    <B p={[0, 0.8, 0]} s={[0.3, 1.6, 0.3]} c="#8a6a4a" />
    <mesh position={[0, 2.3, 0]} castShadow><icosahedronGeometry args={[1.2, 0]} /><meshStandardMaterial roughness={0.76} color="#5a9e5c" flatShading /></mesh>
  </group>;
}

function LampPost({ p, night }: { p: V3; night: boolean }) {
  return <group position={p}>
    <B p={[0, 1.4, 0]} s={[0.14, 2.8, 0.14]} c="#2b2f36" />
    <B p={[0, 2.9, 0]} s={[0.7, 0.18, 0.7]} c="#2b2f36" />
    <B p={[0, 2.78, 0]} s={[0.5, 0.06, 0.5]} c={night ? '#ffe6a3' : '#d9d6cc'} e={night ? '#ffd36b' : undefined} />
  </group>;
}

function WallPanel({ p, rotY = 0, color = '#52695c' }: { p: V3; rotY?: number; color?: string }) {
  return <group position={p} rotation={[0, rotY, 0]}>
    <B p={[0, 0, 0]} s={[2.2, 1.6, 0.08]} c="#b5845d" />
    <B p={[0, 0, 0.02]} s={[1.98, 1.38, 0.035]} c={color} roughness={0.98} />
    <B p={[-0.7, 0, 0.045]} s={[0.08, 1.22, 0.04]} c="#d4b27e" shadow={false} />
    <B p={[0.7, 0, 0.045]} s={[0.08, 1.22, 0.04]} c="#d4b27e" shadow={false} />
  </group>;
}

function Building({ agents, phase, floor }: { agents: OfficeAgent[]; phase: Phase; floor:1|2 }) {
  const { minX, maxX, minZ, maxZ } = FLOOR;
  const w = maxX - minX;
  const d = maxZ - minZ;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const working = new Set(agents.filter((agent) => agent.room === 'workspace').map((agent) => agent.id));
  return <group>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, -0.05, cz]} receiveShadow><planeGeometry args={[140, 140]} /><meshStandardMaterial roughness={0.94} color={phase.grass} /></mesh>
    <mesh position={[cx, -0.02, cz]} receiveShadow><boxGeometry args={[w, 0.06, d]} /><meshStandardMaterial roughness={0.9} color={phase.night ? '#aaa393' : '#d8d0bf'} /></mesh>
    <mesh position={[1.5, 0.026, 0]} receiveShadow><boxGeometry args={[1.6, 0.02, d - 0.4]} /><meshStandardMaterial roughness={0.82} color="#eee8da" /></mesh>
    <B p={[1.5, 0.034, 0]} s={[0.12, 0.02, d - 1]} c="#b8734f" shadow={false} metalness={0.15} />
    <B p={[cx, 2.15, minZ]} s={[w, 4.3, 0.25]} c="#e8e2d6" roughness={0.88} />
    <B p={[minX, 2.15, cz]} s={[0.25, 4.3, d]} c="#e8e2d6" roughness={0.88} />
    <B p={[cx, 0.16, minZ + 0.16]} s={[w - 0.2, 0.22, 0.12]} c="#355c4b" roughness={0.6} />
    <B p={[minX + 0.16, 0.16, cz]} s={[0.12, 0.22, d - 0.2]} c="#355c4b" roughness={0.6} />
    <B p={[cx, 4.16, minZ + 0.16]} s={[w - 0.2, 0.12, 0.12]} c="#b8734f" metalness={0.2} />
    <B p={[minX + 0.16, 4.16, cz]} s={[0.12, 0.12, d - 0.2]} c="#b8734f" metalness={0.2} />
    <B p={[cx, 0.2, maxZ]} s={[w, 0.4, 0.2]} c="#f4f2ec" />
    <B p={[maxX, 0.2, cz]} s={[0.2, 0.4, d]} c="#f4f2ec" />
    {(floor===1?PODS:FLOOR_TWO_PODS).map((pod) => <Pod key={pod.id} x={pod.x} z={pod.z} color={pod.color} screenOn={working.has(pod.id)} night={phase.night} />)}
    <MeetingRoom active={agents.some((agent) => agent.room === 'meeting')} />
    <WallPanel p={[3.8, 2.05, minZ + 0.35]} color="#496354" />
    <WallPanel p={[maxX - 0.35, 2.05, -5.2]} rotY={Math.PI / 2} color="#6c806f" />
    <Lounge /><Pantry /><Lobby />
    <LeadDesk active={agents.some((agent) => agent.id === (floor===1?LEAD_ID:'delivery-manager') && agent.room === 'workspace')} />
    <group position={[PROJECTS_CO_ID_DESK.x, 0, PROJECTS_CO_ID_DESK.z]}><B p={[0,0.75,0]} s={[2.8,0.12,1]} c="#67523f"/><B p={[0,0.36,0]} s={[0.15,0.72,0.8]} c="#343a40"/><Chair p={[0,0,-0.95]}/></group>
    <group position={[MANAGER_DESK.x,0,MANAGER_DESK.z]}><B p={[0,0.75,0]} s={[2.8,0.12,1]} c="#67523f"/><B p={[0,0.36,0]} s={[0.15,0.72,0.8]} c="#343a40"/><Chair p={[0,0,-0.95]}/></group>
    {[[-24, 0, -8], [-25, 0, 6], [maxX + 5, 0, -10], [maxX + 6, 0, 4], [-8, 0, 18], [6, 0, 19], [maxX + 4, 0, 16]].map((p, i) => <Tree key={i} p={p as V3} s={0.9 + (i % 3) * 0.2} />)}
    {[[-6, 0, 14.5], [3, 0, 14.5], [maxX + 1.5, 0, -2], [maxX + 1.5, 0, 8]].map((p, i) => <LampPost key={i} p={p as V3} night={phase.night} />)}
  </group>;
}

function OwnerCharacter({ start, onLift, destination, request, selected, hovered, input, onMoving, onSelect, onHover, reducedMotion, positions }: {
  start: P2; onLift: () => void;
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
  const sim = useRef(createOwnerMotion(start));
  const inLift = useRef(false);
  const lastStop = useRef(input.stopVersion);
  const moving = useRef(false);
  const livePosition = useMemo(() => new THREE.Vector3(start[0], 0, start[1]), []);

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
    const atDoor = liftDoorReached(state.x, state.z);
    if (atDoor && !inLift.current) onLift();
    inLift.current = atDoor;
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
  ctx.fillStyle = '#f3efe5';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#233c31';
  ctx.fillRect(0, 0, canvas.width, 88);
  ctx.fillStyle = '#ba7650';
  ctx.fillRect(0, 88, canvas.width, 8);
  ctx.fillStyle = content.accent;
  ctx.fillRect(0, 96, 14, canvas.height - 96);
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f3efe5';
  ctx.font = '600 54px "Segoe UI", Arial, sans-serif';
  ctx.fillText(fit(content.title, canvas.width - 128), 38, 44);
  if (content.alert) { ctx.beginPath(); ctx.arc(canvas.width - 52, 44, 15, 0, Math.PI * 2); ctx.fillStyle = '#e4b76c'; ctx.fill(); }
  const [headline = '', ...details] = content.lines;
  ctx.fillStyle = '#233c31';
  ctx.font = '700 78px "Segoe UI", Arial, sans-serif';
  ctx.fillText(fit(headline, canvas.width - 100), 40, 190);
  ctx.fillStyle = '#475b50';
  ctx.font = '500 42px "Segoe UI", Arial, sans-serif';
  ctx.fillText(fit(details.join(' · '), canvas.width - 100), 40, 290);
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
    <B p={[0, -0.08, -0.18]} s={[w + 0.34, h + 0.34, 0.12]} c="#b8734f" metalness={0.25} />
    <B p={[0, 0, -0.09]} s={[w + 0.16, h + 0.16, 0.12]} c={hovered ? content.accent : '#22372d'} roughness={0.5} />
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
  const manual = useRef(false);
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
    const cancel = () => { manual.current = true; fly.current = null; interact.current(); };
    controls.addEventListener('start', cancel);
    return () => { controls.removeEventListener('start', cancel); controls.dispose(); };
  }, [controls, gl]);

  useEffect(() => {
    controls.enableRotate = view === '3d';
    controls.maxPolarAngle = view === 'top' ? 0.001 : 1.2;
  }, [controls, view]);

  useEffect(() => {
    // Narrow screens need the camera further back to fit the same floor.
    const fit = Math.max(1, 1.5 / aspect);
    let target = { x: -3, z: 0, dist: 41 * fit };
    if (command.kind === 'zone') target = zoneTarget(command.id) ?? target;
    if (command.kind === 'agent' && command.id) {
      const spot = positions.get(command.id) ?? spots.get(command.id);
      if (spot) target = { x: spot.x, z: spot.z, dist: 11 };
    }
    if (command.kind === 'owner') {
      const owner = positions.get('owner') ?? OWNER_SPOT;
      target = { x: owner.x, z: owner.z, dist: 11 };
    }
    if (command.kind === 'zone') target.dist *= fit;
    const direction = view === 'top' ? new THREE.Vector3(0, 1, 0.001) : new THREE.Vector3(0.62, 0.72, 1).normalize();
    const character = command.kind === 'owner' || command.kind === 'agent';
    if (view === '3d' && character) direction.set(0.65, 0.8, 1).normalize();
    const focus = new THREE.Vector3(target.x, character ? 1.2 : 0, target.z);
    let goal = { target: focus, position: focus.clone().addScaledVector(direction, target.dist) };
    const board = command.kind === 'board' && view === '3d' ? BOARDS.find((slot) => slot.id === command.id) : undefined;
    if (board) {
      // Face the board square-on from slightly above so its text is readable.
      // Boards open alongside a card on the right, so aim right of the board to keep it in the free left area.
      const [nx, nz] = board.normal;
      const boardFocus = new THREE.Vector3(board.x + nz * 4.5, board.y, board.z - nx * 4.5);
      goal = { target: boardFocus, position: boardFocus.clone().add(new THREE.Vector3(nx * 9 * fit, 2.5, nz * 9 * fit)) };
    }
    manual.current = false;
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
      const k = 1 - Math.exp(-Math.min(dt, 0.1) * 3.5);
      controls.target.lerp(goal.target, k);
      camera.position.lerp(goal.position, k);
      if (camera.position.distanceTo(goal.position) < 0.05 && controls.target.distanceTo(goal.target) < 0.05) fly.current = null;
    } else if (followId && !manual.current) {
      const tracked = positions.get(followId);
      if (tracked) followCamera(camera.position, controls.target, tracked, dt, reducedMotion);
    }
    controls.enableDamping = !fly.current && (!followId || manual.current);
    controls.minPolarAngle = view === 'top' || fly.current ? 0 : 0.25;
    controls.autoRotate = tour && !followId && !manual.current && !reducedMotion && view === '3d';
    controls.autoRotateSpeed = 0.7;
    controls.update();
    clampCameraPan(camera.position, controls.target, command.kind === 'board' && view === '3d' ? 4 : 0);
  });
  return null;
}

function OfficeLifeTick({ life, agents, reducedMotion }: { life: OfficeLife; agents: OfficeAgent[]; reducedMotion: boolean }) {
  useFrame(({ clock }) => updateOfficeLife(life, agents, clock.elapsedTime, reducedMotion), -1);
  return null;
}

function Lights({ phase }: { phase: Phase }) {
  return <>
    <color attach="background" args={[phase.sky]} />
    <hemisphereLight args={['#f5eddb', '#65715c', phase.ambient * 0.7]} />
    <ambientLight intensity={phase.ambient * 0.22} />
    <directionalLight position={[-12, 20, 12]} intensity={phase.sun * 1.1} color={phase.sunColor} castShadow
      shadow-mapSize={[1024, 1024]} shadow-camera-left={-30} shadow-camera-right={30} shadow-camera-top={26} shadow-camera-bottom={-26} shadow-camera-far={80} shadow-bias={-0.0002} shadow-normalBias={0.04} />
    <directionalLight position={[16, 9, -5]} intensity={phase.night ? 0.65 : 0.35} color={phase.night ? '#e6cba1' : '#f7edd7'} />
    <pointLight position={[-10, 3.1, 2]} intensity={phase.night ? 1.2 : 0.28} distance={12} color="#ffd79a" />
    <pointLight position={[8, 3.1, -7]} intensity={phase.night ? 1.1 : 0.22} distance={11} color="#c7dcff" />
    <pointLight position={[11, 3.1, 9]} intensity={phase.night ? 0.9 : 0.2} distance={10} color="#ffe3b0" />
  </>;
}

function CanvasGestureBridge({ tracker }: { tracker: GestureTracker }) {
  const { gl } = useThree();
  useEffect(() => {
    return bindCanvasGestureIsolation(gl.domElement, tracker);
  }, [gl, tracker]);
  return null;
}

export default function VisualOffice({ invitation, floor, ownerStart, onLift, agents, learning, ready, selectedId, ownerSelected, ownerInput, ownerTarget, ownerVisitVersion, onOwnerMoving, followId, onSelect, onOwnerSelect, onCameraInteract, command, view, tour, phase, reducedMotion, boards, onOpenBoard, onOpenCommunity }: VisualOfficeProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hoveredBoard, setHoveredBoard] = useState<BoardId | null>(null);
  const spots = useMemo(() => spotsFor(agents), [agents]);
  const positions = useMemo(() => new Map<string, THREE.Vector3>(), []);
  const life = useMemo(() => createOfficeLife(), []);
  const invitedSpot = useMemo(() => invitationSpot(agents, invitation), [agents, invitation]);
  const tracker = useMemo(() => createGestureTracker(), []);
  const handleSelect = (id: string | null) => {
    if (tracker.canSelectMesh()) onSelect(id);
  };
  const handleOwnerSelect = () => {
    if (tracker.canSelectMesh()) onOwnerSelect();
  };
  const handleOpenBoard = (id: BoardId) => {
    if (tracker.canSelectMesh()) onOpenBoard(id);
  };
  const handleLift = () => {
    if (tracker.canSelectMesh()) onLift();
  };
  const handleOpenCommunity = onOpenCommunity ? () => {
    if (tracker.canSelectMesh()) onOpenCommunity();
  } : undefined;
  const [visible, setVisible] = useState(() => !document.hidden);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  useEffect(() => { document.body.style.cursor = hoveredId || hoveredBoard ? 'pointer' : ''; return () => { document.body.style.cursor = ''; }; }, [hoveredId, hoveredBoard]);
  return <Canvas style={{ touchAction: 'none' }} frameloop={visible ? 'always' : 'never'} shadows dpr={1} camera={{ position: [20, 28, 38], fov: 38, near: 0.5, far: 400 }} onPointerMissed={() => handleSelect(null)}>
    <CanvasGestureBridge tracker={tracker} />
    <OfficeLifeTick life={life} agents={agents} reducedMotion={reducedMotion} />
    <Lights phase={phase} />
    <Building agents={agents} phase={phase} floor={floor} />
    <OfficeEnvironment agents={agents} phase={phase} selectedId={selectedId} floor={floor} />
    <OfficeObjects floor={floor} onOpenBoard={handleOpenBoard} onHover={setHoveredId} onOpenCommunity={handleOpenCommunity} />
    <Lift floor={floor} onUse={handleLift} />
    {BOARDS.filter(slot=>(slot.floor ?? 1)===floor).map((slot) => { const content = boards.find((board) => board.id === slot.id); return content ? <Board key={slot.id} slot={slot} content={content} hovered={hoveredBoard === slot.id} onHover={setHoveredBoard} onOpen={handleOpenBoard} /> : null; })}
    {ready && agents.map((agent, index) => {
      const spot = spots.get(agent.id);
      return spot ? <OfficeAgentCharacter key={agent.id} agent={agent} agents={agents} index={index} spot={spot} selected={agent.id === selectedId} hovered={agent.id === hoveredId}
        onSelect={handleSelect} onHover={setHoveredId} reducedMotion={reducedMotion} positions={positions} life={life} invitation={agent.id === invitation?.id ? invitedSpot : undefined} spokenMessage={spokenOfficeTurn(learning, agent.id)} /> : null;
    })}
    <OwnerCharacter start={ownerStart} onLift={handleLift} destination={ownerTarget} request={ownerVisitVersion} selected={ownerSelected} hovered={hoveredId === 'owner'} input={ownerInput} onMoving={onOwnerMoving} onSelect={handleOwnerSelect} onHover={setHoveredId} reducedMotion={reducedMotion} positions={positions} />
    <CameraRig command={command} view={view} tour={tour} spots={spots} reducedMotion={reducedMotion} followId={followId} positions={positions} onInteract={onCameraInteract} />
  </Canvas>;
}

