import { FLOOR, FLOOR_TWO_PODS, PODS, type dayPhase } from '../state/office-layout.js';
import type { OfficeAgent } from '../state/office-state.js';

type V3 = [number, number, number];
type Phase = ReturnType<typeof dayPhase>;

export type OfficeEnvironmentProps = {
  agents: OfficeAgent[];
  phase: Phase;
  selectedId: string | null;
  floor: 1 | 2;
};

const pine = '#294d42';
const oak = '#a77b50';
const copper = '#ba7853';

function Slab({ p, s, color, emissive, metalness = 0, roughness = 0.8 }: {
  p: V3; s: V3; color: string; emissive?: string; metalness?: number; roughness?: number;
}) {
  return <mesh position={p} receiveShadow>
    <boxGeometry args={s} />
    <meshStandardMaterial color={color} metalness={metalness} roughness={roughness}
      {...(emissive ? { emissive, emissiveIntensity: 0.45 } : {})} />
  </mesh>;
}

function CourtyardPlant({ x, z, scale = 1 }: { x: number; z: number; scale?: number }) {
  return <group position={[x, 0, z]} scale={scale}>
    <mesh position={[0, 0.35, 0]} castShadow><cylinderGeometry args={[0.46, 0.39, 0.7, 8]} /><meshStandardMaterial color="#d8c8ac" roughness={0.9} /></mesh>
    <mesh position={[0, 1.17, 0]} castShadow><icosahedronGeometry args={[0.76, 0]} /><meshStandardMaterial color={pine} flatShading /></mesh>
    <mesh position={[0.25, 1.7, -0.1]} castShadow><icosahedronGeometry args={[0.5, 0]} /><meshStandardMaterial color="#6f936d" flatShading /></mesh>
  </group>;
}

/** Detail layer for the existing room layout. All raised pieces stay off walking paths and boards. */
export function OfficeEnvironment({ agents, phase, selectedId, floor }: OfficeEnvironmentProps) {
  const { minX, maxX, minZ, maxZ } = FLOOR;
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const meeting = agents.some((agent) => agent.room === 'meeting');
  return <group>
    {/* Wainscot gives wall boards a warm architectural base without covering their text. */}
    <Slab p={[centerX, 1.39, minZ + 0.14]} s={[maxX - minX - 0.35, 1.52, 0.035]} color={pine} />
    <Slab p={[minX + 0.14, 1.39, centerZ]} s={[0.035, 1.52, maxZ - minZ - 0.35]} color={pine} />
    <Slab p={[centerX, 2.17, minZ + 0.15]} s={[maxX - minX - 0.35, 0.065, 0.07]} color={oak} />
    <Slab p={[minX + 0.15, 2.17, centerZ]} s={[0.07, 0.065, maxZ - minZ - 0.35]} color={oak} />
    {Array.from({ length: 15 }, (_, i) => <Slab key={`back-${i}`}
      p={[minX + 1.2 + i * 2.52, 1.39, minZ + 0.17]} s={[0.055, 1.42, 0.055]} color="#426658" />)}
    {Array.from({ length: 10 }, (_, i) => <Slab key={`side-${i}`}
      p={[minX + 0.17, 1.39, minZ + 1.3 + i * 2.55]} s={[0.055, 1.42, 0.055]} color="#426658" />)}
    {/* Desk pads have no collision footprint and align exactly with the existing pod grid. */}
    {(floor === 1 ? PODS : FLOOR_TWO_PODS).map((pod) => <group key={pod.id}>
      <Slab p={[pod.x, 0.061, pod.z + 0.28]} s={[3.45, 0.025, 3.5]}
        color={selectedId === pod.id ? '#b9906b' : '#d8c6aa'} />
      <Slab p={[pod.x, 0.08, pod.z + 0.28]} s={[3.22, 0.012, 3.27]}
        color={selectedId === pod.id ? '#e8cda4' : '#e8dcc8'} />
    </group>)}
    <Slab p={[8.5, 0.059, -9]} s={[7.8, 0.012, 4.9]} color={meeting ? '#bd986e' : '#567263'} />
    <Slab p={[8.5, 0.071, -9]} s={[7.5, 0.012, 4.6]} color={meeting ? '#e0c49b' : '#d5c8ad'} />
    {/* Outside landscaping frames the cutaway, with no geometry in the office. */}
    {[-13, -3, 8, 18].map((x) => <CourtyardPlant key={x} x={x} z={maxZ + 3.1} scale={0.85} />)}
    {[-8, 4].map((z) => <CourtyardPlant key={z} x={maxX + 3.2} z={z} scale={1.1} />)}
    <Slab p={[centerX, -0.07, maxZ + 1.5]} s={[maxX - minX + 3, 0.05, 3.1]} color={phase.night ? '#665f4e' : '#c6b89c'} />
    <Slab p={[maxX + 1.5, -0.07, centerZ]} s={[3.1, 0.05, maxZ - minZ + 3]} color={phase.night ? '#665f4e' : '#c6b89c'} />
    <Slab p={[maxX + 0.1, 0.12, centerZ]} s={[0.07, 0.1, maxZ - minZ]} color={copper} />
    <Slab p={[centerX, 0.12, maxZ + 0.1]} s={[maxX - minX, 0.1, 0.07]} color={copper} />
    {floor === 2 && <Slab p={[8.5, 1.2, maxZ - 0.22]} s={[7.5, 0.07, 0.07]} color="#85a69a"
      {...(phase.night ? { emissive: '#426d5d' } : {})} />}
  </group>;
}
