import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { FLOOR, FLOOR_TWO_PODS, PODS, type dayPhase } from '../state/office-layout.js';
import type { OfficeAgent } from '../state/office-state.js';

type V3 = [number, number, number];
type Phase = ReturnType<typeof dayPhase>;

export type OfficeEnvironmentProps = {
  agents: OfficeAgent[];
  phase: Phase;
  selectedId: string | null;
  floor: 1 | 2;
  reducedEffects?: boolean | undefined;
};

function Slab({ p, s, color, shadow = true }: { p: V3; s: V3; color: string; shadow?: boolean }) {
  return <mesh position={p} castShadow={shadow} receiveShadow={shadow}>
    <boxGeometry args={s} />
    <meshStandardMaterial color={color} roughness={0.85} />
  </mesh>;
}

function OakFloor({ shadow = true }: { shadow?: boolean }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#c7ab82';
      ctx.fillRect(0, 0, 512, 512);
      for (let row = 0; row < 8; row += 1) {
        ctx.fillStyle = ['#c8ad85', '#c0a37b', '#ceb38c', '#c4a67d'][row % 4]!;
        ctx.fillRect(0, row * 64, 512, 63);
        ctx.fillStyle = '#ad916d';
        ctx.fillRect((row % 3) * 170, row * 64, 1, 64);
        ctx.strokeStyle = 'rgba(101, 74, 44, 0.07)';
        for (let grain = 0; grain < 4; grain += 1) {
          ctx.beginPath();
          ctx.moveTo(0, row * 64 + 12 + grain * 12);
          ctx.bezierCurveTo(140, row * 64 + grain * 12 + 5, 330, row * 64 + grain * 12 + 19, 512, row * 64 + grain * 12 + 10);
          ctx.stroke();
        }
      }
    }
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(4, 5);
    map.anisotropy = 4;
    return map;
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  return <mesh position={[(FLOOR.minX + FLOOR.maxX) / 2, 0.018, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow={shadow}>
    <planeGeometry args={[FLOOR.maxX - FLOOR.minX - 0.2, FLOOR.maxZ - FLOOR.minZ - 0.2]} />
    <meshStandardMaterial map={texture} roughness={0.88} />
  </mesh>;
}

function Bookcase({ shadow = true }: { shadow?: boolean }) {
  return <group position={[16.8, 0, 0.3]}>
    <Slab p={[0.38, 1.1, 0]} s={[0.12, 2.2, 3.25]} color="#52624e" shadow={shadow} />
    {[-1.6, 1.6].map((z) => <Slab key={z} p={[0, 1.1, z]} s={[0.8, 2.2, 0.1]} color="#9b784f" shadow={shadow} />)}
    {[0.1, 0.8, 1.5, 2.2].map((y) => <Slab key={y} p={[0, y, 0]} s={[0.8, 0.1, 3.25]} color="#b99366" shadow={shadow} />)}
    {[0.1, 0.8, 1.5].flatMap((y, row) => Array.from({ length: 7 }, (_, i) => <Slab key={`${row}-${i}`}
      p={[0, y + 0.29, -1.28 + i * 0.39]} s={[0.46, 0.38 + (i % 2) * 0.12, 0.27]}
      color={['#d3c5a7', '#6b7d61', '#a86f50', '#8d826b'][(row + i) % 4]!} shadow={shadow} />))}
  </group>;
}

function WindowWall({ minX, maxX, minZ, shadow = true }: { minX: number; maxX: number; minZ: number; shadow?: boolean }) {
  const windows = [-13, -7, -1, 5, 11];
  return <group>
    {windows.filter((x) => x > minX + 2 && x < maxX - 2).map((x) => <group key={x} position={[x, 2.35, minZ + 0.17]}>
      <Slab p={[0, 0, 0]} s={[4.5, 2.2, 0.035]} color="#a9d0d0" shadow={shadow} />
      <Slab p={[0, 0, 0]} s={[0.08, 2.05, 0.08]} color="#d9c6a1" shadow={shadow} />
      <Slab p={[0, 0, 0]} s={[4.35, 0.08, 0.08]} color="#d9c6a1" shadow={shadow} />
      <Slab p={[0, -1.03, 0]} s={[4.35, 0.08, 0.08]} color="#d9c6a1" shadow={shadow} />
    </group>)}
    <Slab p={[(minX + maxX) / 2, 1.18, minZ + 0.24]} s={[maxX - minX - 0.5, 0.08, 0.12]} color="#7a654e" shadow={shadow} />
  </group>;
}

function CeilingStructure({ shadow = true }: { shadow?: boolean }) {
  // Keep ceiling fixtures, remove exposed cross-beams that cut through camera view.
  return <group>
    {[-8, 0, 8].map((x, index) => <group key={`fixture-${x}`} position={[x, 3.62, index === 1 ? 1 : -4]}>
      <Slab p={[0, 0, 0]} s={[0.06, 0.35, 0.06]} color="#3b403d" shadow={shadow} />
      <Slab p={[0, -0.22, 0]} s={[0.72, 0.08, 0.24]} color="#e8d4a2" shadow={shadow} />
    </group>)}
  </group>;
}

/** Raised details stay inside existing furniture footprints or beyond the east circulation aisle. */
export function OfficeEnvironment({ agents, phase, selectedId, floor, reducedEffects }: OfficeEnvironmentProps) {
  const { minX, maxX, minZ, maxZ } = FLOOR;
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const occupied = new Set(agents.filter((agent) => agent.room === 'workspace').map((agent) => agent.id));
  const shadow = !reducedEffects;

  return <group>
    <OakFloor shadow={shadow} />
    <Slab p={[centerX, 0.72, minZ + 0.14]} s={[maxX - minX - 0.35, 1.2, 0.04]} color="#355344" shadow={shadow} />
    <Slab p={[minX + 0.14, 0.72, centerZ]} s={[0.04, 1.2, maxZ - minZ - 0.35]} color="#355344" shadow={shadow} />
    <Slab p={[centerX, 1.35, minZ + 0.15]} s={[maxX - minX - 0.35, 0.07, 0.07]} color="#ae885a" shadow={shadow} />
    <Slab p={[minX + 0.15, 1.35, centerZ]} s={[0.07, 0.07, maxZ - minZ - 0.35]} color="#ae885a" shadow={shadow} />
    {(floor === 1 ? PODS : FLOOR_TWO_PODS).map((pod) => <group key={pod.id}>
      <Slab p={[pod.x, 0.039, pod.z + 0.2]} s={[4.7, 0.025, 4.8]}
        color={selectedId === pod.id ? '#d4cbb1' : '#b6baa6'} shadow={shadow} />
      <Slab p={[pod.x, 0.058, pod.z + 2.38]} s={[1.2, 0.012, 0.05]}
        color={occupied.has(pod.id) ? '#345c43' : '#777d67'} shadow={shadow} />
    </group>)}
    <Bookcase shadow={shadow} />
    <WindowWall minX={minX} maxX={maxX} minZ={minZ} shadow={shadow} />
    <CeilingStructure shadow={shadow} />
    <Slab p={[centerX, -0.07, maxZ + 1.5]} s={[maxX - minX + 3, 0.05, 3.1]} color={phase.night ? '#665f4e' : '#b5ad96'} shadow={shadow} />
    <Slab p={[maxX + 1.5, -0.07, centerZ]} s={[3.1, 0.05, maxZ - minZ + 3]} color={phase.night ? '#665f4e' : '#b5ad96'} shadow={shadow} />
    <Slab p={[centerX, -0.17, centerZ]} s={[maxX - minX + 0.25, 0.2, maxZ - minZ + 0.25]} color="#666b58" shadow={shadow} />
  </group>;
}
