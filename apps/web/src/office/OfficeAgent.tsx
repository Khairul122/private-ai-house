import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { type P2, type Spot } from '../state/office-layout.js';
import { planOfficeRoute, updateOfficeLife, type OfficeLife } from '../state/office-life.js';
import { ownerCanStand } from '../state/owner-motion.js';
import { STATE_COLORS, type OfficeAgent as AgentData } from '../state/office-state.js';

type V3 = [number, number, number];

export function spokenOfficeTurn(learning: { available: boolean; busy: boolean; activeSpeakerId?: string | null; sessions: Array<{ state: string; turns: Array<{ employeeId: string; message: string }> }> } | null | undefined, agentId: string): string | undefined {
  if (!learning?.available || !learning.busy) return undefined;
  const session = learning.sessions.find(item => item.state === 'running');
  const last = session?.turns.at(-1);
  return last?.employeeId === agentId ? `${last.message.slice(0, 42)}${last.message.length > 42 ? '…' : ''}` : undefined;
}
type Props = {
  agent: AgentData;
  index: number;
  spot: Spot;
  selected: boolean;
  hovered: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  reducedMotion: boolean;
  positions: Map<string, THREE.Vector3>;
  life: OfficeLife;
  agents?: AgentData[];
  spokenMessage?: string | undefined;
};

function Box({ p, s, color, shadow = true }: { p: V3; s: V3; color: string; shadow?: boolean }) {
  return <mesh position={p} castShadow={shadow} receiveShadow><boxGeometry args={s} /><meshStandardMaterial color={color} roughness={0.78} /></mesh>;
}

function Label({ text, dot, p, bubble = false }: { text: string; dot?: string; p: V3; bubble?: boolean }) {
  const { texture, aspect } = useMemo(() => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    context.font = `${bubble ? 36 : 52}px "Segoe UI", Arial, sans-serif`;
    canvas.width = Math.ceil(context.measureText(text).width + (dot ? 130 : 80));
    canvas.height = bubble ? 128 : 112;
    context.font = `${bubble ? 36 : 52}px "Segoe UI", Arial, sans-serif`;
    context.fillStyle = bubble ? '#fffdf7' : '#ffffff';
    context.beginPath(); context.roundRect(4, 4, canvas.width - 8, 100, 50); context.fill();
    if (bubble) {
      context.beginPath(); context.moveTo(42, 98); context.lineTo(58, 98); context.lineTo(48, 116); context.closePath(); context.fill();
      context.strokeStyle = '#d9cdbb'; context.lineWidth = 3; context.stroke();
    }
    if (dot) { context.fillStyle = dot; context.beginPath(); context.arc(45, 54, 14, 0, Math.PI * 2); context.fill(); }
    context.fillStyle = '#1f2933';
    context.textBaseline = 'middle';
    context.fillText(text, dot ? 80 : 40, 54);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return { texture, aspect: canvas.width / canvas.height };
  }, [text, dot]);
  useEffect(() => () => texture.dispose(), [texture]);
  const viewport = useThree((state) => state.size);
  const height = 0.032 * THREE.MathUtils.clamp(viewport.width / viewport.height / 1.4, 0.55, 1);
  return <sprite position={p} scale={[height * aspect, height, 1]} center={new THREE.Vector2(0.5, 0)} renderOrder={20}>
    <spriteMaterial map={texture} depthTest={false} transparent sizeAttenuation={false} />
  </sprite>;
}

const SKIN = ['#f1c27d', '#e0ac69', '#c68642', '#ffdbac', '#8d5524'];
const HAIR = ['#3b2a20', '#1f1a17', '#6b4423', '#a0522d', '#2e2e2e'];

function shortestAngle(from: number, to: number) {
  return ((to - from + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
}

export function nearbyIdlePeer(id: string, agents: AgentData[], positions: Map<string, THREE.Vector3>, x: number, z: number): THREE.Vector3 | null {
  const self = agents.find((agent) => agent.id === id);
  if (self?.state !== 'idle') return null;
  let closest: THREE.Vector3 | null = null;
  let distanceSq = 2.4 ** 2;
  for (const peer of agents) {
    if (peer.id === id || peer.state !== 'idle' || (peer.floor ?? 1) !== (self.floor ?? 1)) continue;
    const position = positions.get(peer.id);
    if (!position) continue;
    const current = (position.x - x) ** 2 + (position.z - z) ** 2;
    if (current < distanceSq) { closest = position; distanceSq = current; }
  }
  return closest;
}

export function OfficeAgent({ agent, index, spot, selected, hovered, onSelect, onHover, reducedMotion, positions, life, agents = [], spokenMessage }: Props) {
  const root = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const marker = useRef<THREE.Mesh>(null);
  const cup = useRef<THREE.Group>(null);
  const book = useRef<THREE.Group>(null);
  const conversation = useRef<THREE.Group>(null);
  const sim = useRef({ x: spot.x, z: spot.z, rot: spot.facing, seat: spot.seated ? 1 : 0, path: [] as P2[], spot, origin: spot, initialized: false, reducedMotion });
  const livePosition = useMemo(() => new THREE.Vector3(spot.x, 0, spot.z), []);

  useEffect(() => {
    positions.set(agent.id, livePosition);
    return () => { if (positions.get(agent.id) === livePosition) positions.delete(agent.id); };
  }, [agent.id, livePosition, positions]);

  useFrame(({ clock }, rawDt) => {
    const dt = Math.max(0, Math.min(rawDt, 0.5));
    const t = clock.elapsedTime;
    const state = sim.current;
    updateOfficeLife(life, agents, t, reducedMotion);
    const routine = agent.state === 'idle' && !reducedMotion ? life.routines.get(agent.id) : undefined;
    const destination = routine?.spot ?? spot;
    if (!state.initialized || (state.reducedMotion !== reducedMotion && reducedMotion)) {
      state.x = destination.x; state.z = destination.z; state.path = []; state.seat = destination.seated ? 1 : 0;
      state.spot = destination; state.origin = destination; state.initialized = true;
    } else if (state.spot.x !== destination.x || state.spot.z !== destination.z) {
      if (ownerCanStand(state.x, state.z)) state.origin = state.spot;
      state.path = reducedMotion ? [] : planOfficeRoute([state.x, state.z], state.origin, destination);
      if (reducedMotion) { state.x = destination.x; state.z = destination.z; }
      state.spot = destination;
    }
    state.reducedMotion = reducedMotion;
    let walking = false;
    let heading = state.spot.facing;
    const next = state.path[0];
    if (next) {
      const dx = next[0] - state.x;
      const dz = next[1] - state.z;
      const dist = Math.hypot(dx, dz);
      const step = 2.8 * dt;
      if (state.seat > 0.05) state.seat = Math.max(0, state.seat - dt * 5);
      else if (dist <= step) { state.x = next[0]; state.z = next[1]; state.path.shift(); }
      else { state.x += dx / dist * step; state.z += dz / dist * step; }
      walking = state.seat <= 0.05;
      if (dist > 0.01) heading = Math.atan2(dx, dz);
    } else {
      const atDestination = Math.hypot(state.x - state.spot.x, state.z - state.spot.z) < 0.03;
      if (atDestination) state.origin = state.spot;
      state.seat += ((atDestination && state.spot.seated ? 1 : 0) - state.seat) * Math.min(1, dt * 6);
    }
    const arrived = !walking && state.path.length === 0 && Math.hypot(state.x - state.spot.x, state.z - state.spot.z) < 0.03;
    const active = arrived && (agent.state === 'working' || agent.state === 'reviewing');
    const collaborating = arrived && agent.state === 'collaborating';
    const idle = arrived && agent.state === 'idle';
    const phase = (t + index * 7.3) % 23;
    const peer = idle ? nearbyIdlePeer(agent.id, agents, positions, state.x, state.z) : null;
    const social = idle && peer && routine?.activity === 'social';
    const stretching = idle && routine?.activity === 'stretch';
    const reading = idle && routine?.activity === 'read';
    const sipping = idle && routine?.activity === 'coffee' && phase > 4 && phase < 10;
    if (social) heading = Math.atan2(peer.x - state.x, peer.z - state.z);
    state.rot += shortestAngle(state.rot, heading) * Math.min(1, dt * 8);
    const swing = walking && !reducedMotion ? Math.sin(t * 9) * 0.6 : 0;
    const seatAngle = -Math.PI / 2 * state.seat;
    if (root.current) {
      const stepBob = walking && !reducedMotion ? Math.abs(Math.sin(t * 9)) * 0.06 : 0;
      root.current.position.set(state.x, state.seat * (state.spot.y - 0.7) + stepBob, state.z);
      root.current.rotation.y = state.rot;
    }
    livePosition.set(state.x, 0, state.z);
    if (legL.current) legL.current.rotation.x = seatAngle + swing;
    if (legR.current) legR.current.rotation.x = seatAngle - swing;
    if (torso.current) torso.current.rotation.z = reducedMotion ? 0 : stretching ? Math.sin(t * 0.9) * 0.12 : idle ? Math.sin(t * 0.65 + index) * 0.025 : 0;
    if (armL.current) {
      armL.current.rotation.x = reducedMotion ? 0 : active ? -1.05 + Math.sin(t * 11 + index) * 0.16 : collaborating ? -0.5 + Math.sin(t * 2.2) * 0.35 : reading ? -1.1 : stretching ? -2.6 : -swing * 0.8;
      armL.current.rotation.z = stretching && !reducedMotion ? -0.25 : 0;
    }
    if (armR.current) {
      armR.current.rotation.x = reducedMotion ? 0 : active ? -1.05 + Math.sin(t * 11 + index + 1.5) * 0.16 : sipping ? -2.15 : reading ? -1.15 : stretching ? -2.6 : social ? -0.65 + Math.sin(t * 2.3 + index) * 0.25 : swing * 0.8;
      armR.current.rotation.z = stretching && !reducedMotion ? 0.25 : 0;
    }
    if (head.current) {
      const peerAngle = peer ? shortestAngle(state.rot, Math.atan2(peer.x - state.x, peer.z - state.z)) : 0;
      head.current.rotation.y = reducedMotion ? 0 : social ? THREE.MathUtils.clamp(peerAngle, -0.58, 0.58) : active ? Math.sin(t * 0.7) * 0.06 : idle ? Math.sin(t * 0.48 + index) * 0.18 : collaborating ? Math.sin(t * 0.9) * 0.3 : 0;
      head.current.rotation.x = reducedMotion ? 0 : active ? 0.1 + Math.sin(t * 2) * 0.035 : reading ? 0.28 : social ? Math.sin(t * 2 + index) * 0.065 : sipping ? -0.14 : 0;
    }
    if (cup.current) cup.current.visible = !!sipping && !reducedMotion;
    if (book.current) book.current.visible = !!reading && !reducedMotion;
    if (conversation.current) conversation.current.visible = Boolean(!spokenMessage && social && !walking && !reducedMotion && phase < 12);
    if (marker.current) { marker.current.rotation.y = reducedMotion ? 0 : t * 2; marker.current.position.y = reducedMotion ? 2.45 : 2.45 + Math.sin(t * 3) * 0.08; }
  });

  const skin = SKIN[index % SKIN.length]!;
  const hair = HAIR[(index * 3) % HAIR.length]!;
  const dot = STATE_COLORS[agent.state];
  return <group ref={root}
    onClick={(event) => { event.stopPropagation(); onSelect(agent.id); }}
    onPointerOver={(event) => { event.stopPropagation(); onHover(agent.id); }}
    onPointerOut={() => onHover(null)}>
    <group position={[0, 0.7, 0]}>
      <group ref={legL} position={[-0.13, 0, 0]}><Box p={[0, -0.33, 0]} s={[0.2, 0.66, 0.24]} color="#2d3240" /><Box p={[0, -0.66, 0.04]} s={[0.22, 0.08, 0.32]} color="#15171c" /></group>
      <group ref={legR} position={[0.13, 0, 0]}><Box p={[0, -0.33, 0]} s={[0.2, 0.66, 0.24]} color="#2d3240" /><Box p={[0, -0.66, 0.04]} s={[0.22, 0.08, 0.32]} color="#15171c" /></group>
    </group>
    <group ref={torso} position={[0, 1.05, 0]}><Box p={[0, 0, 0]} s={[0.56, 0.72, 0.34]} color={agent.color} /><Box p={[0, 0.33, 0.05]} s={[0.3, 0.06, 0.3]} color="#f5f5f5" /></group>
    <group ref={armL} position={[-0.37, 1.36, 0]}><Box p={[0, -0.3, 0]} s={[0.16, 0.6, 0.2]} color={agent.color} /><Box p={[0, -0.64, 0]} s={[0.15, 0.12, 0.17]} color={skin} /></group>
    <group ref={armR} position={[0.37, 1.36, 0]}><Box p={[0, -0.3, 0]} s={[0.16, 0.6, 0.2]} color={agent.color} /><Box p={[0, -0.64, 0]} s={[0.15, 0.12, 0.17]} color={skin} />
      <group ref={cup} position={[0, -0.68, 0.12]} visible={false}><mesh><cylinderGeometry args={[0.1, 0.08, 0.17, 10]} /><meshStandardMaterial color="#fff2d8" /></mesh></group>
    </group>
    <group ref={book} position={[0, 1.05, 0.6]} rotation={[-0.35, 0, 0]} visible={false}>
      <Box p={[0, 0, 0]} s={[0.58, 0.06, 0.34]} color="#365b52" /><Box p={[0, 0.04, 0]} s={[0.52, 0.035, 0.29]} color="#f4e8d5" />
    </group>
    <group ref={head} position={[0, 1.42, 0]}>
      <Box p={[0, 0.27, 0]} s={[0.5, 0.5, 0.46]} color={skin} />
      <Box p={[0, 0.56, -0.02]} s={[0.54, 0.14, 0.52]} color={hair} />
      <Box p={[0, 0.38, -0.22]} s={[0.54, 0.4, 0.1]} color={hair} />
      {[-0.11, 0.11].map((x) => <Box key={x} p={[x, 0.3, 0.235]} s={[0.07, 0.09, 0.02]} color="#1b1b1b" shadow={false} />)}
    </group>
    <mesh position={[0, 2.25, 0]}><sphereGeometry args={[0.09, 10, 8]} /><meshBasicMaterial color={dot} /></mesh>
    {selected && <mesh ref={marker} position={[0, 2.45, 0]}><octahedronGeometry args={[0.2, 0]} /><meshBasicMaterial color="#f2b632" /></mesh>}
    {agent.state === 'unknown' && !selected && <Label text="?" p={[0, 2.45, 0]} />}
    <group ref={conversation} visible={false}><Label text="•••" p={[0, 2.75, 0]} bubble /></group>
    {spokenMessage && <Label text={spokenMessage} p={[0, 2.9, 0]} bubble />}
    {(selected || hovered) && <Label text={agent.name} dot={dot} p={[0, selected ? 2.75 : 2.45, 0]} />}
    {(selected || hovered) && agent.state === 'idle' && !reducedMotion && <Label text="Gerak santai · animasi" p={[0, 2.05, 0]} />}
    <mesh position={[0, 1.1, 0]} visible={false}><boxGeometry args={[0.9, 2.3, 0.9]} /><meshBasicMaterial /></mesh>
  </group>;
}
