import { useEffect, useMemo } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { BoardId } from '../state/office-layout.js';

type OfficeObjectsProps = {
  floor: 1 | 2;
  onOpenBoard: (id: BoardId) => void;
  onHover: (id: string | null) => void;
};

function labelTexture(text: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#f2eee4';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#253b33';
    ctx.font = 'bold 32px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2, canvas.width - 32);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function ObjectLabel({ text, width = 1.3 }: { text: string; width?: number }) {
  const texture = useMemo(() => labelTexture(text), [text]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <mesh rotation={[-Math.PI / 2, 0, 0]}>
    <planeGeometry args={[width, width / 4]} />
    <meshBasicMaterial map={texture} toneMapped={false} />
  </mesh>;
}

function InteractiveObject({ id, board, onOpenBoard, onHover, children }: {
  id: string;
  board: BoardId;
  onOpenBoard: OfficeObjectsProps['onOpenBoard'];
  onHover: OfficeObjectsProps['onHover'];
  children: React.ReactNode;
}) {
  const enter = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    onHover(id);
  };
  const leave = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    onHover(null);
  };
  return <group
    onClick={(event) => { event.stopPropagation(); onOpenBoard(board); }}
    onPointerOver={enter} onPointerOut={leave}>
    {children}
  </group>;
}

export default function OfficeObjects({ floor, onOpenBoard, onHover }: OfficeObjectsProps) {
  return <group>
    <InteractiveObject id="object-meeting" board={floor === 1 ? 'tasks' : 'operations'} onOpenBoard={onOpenBoard} onHover={onHover}>
      <group position={[9, 0.91, -9]}>
        <mesh castShadow><boxGeometry args={[1.7, 0.08, 0.72]} /><meshStandardMaterial color="#315849" roughness={0.8} /></mesh>
        <mesh position={[0, 0.048, 0]}><boxGeometry args={[1.57, 0.012, 0.61]} /><meshStandardMaterial color="#e9e1cd" roughness={0.9} /></mesh>
        <group position={[0, 0.057, 0]}><ObjectLabel text={floor === 1 ? 'TUGAS' : 'OPERASIONAL'} width={1.36} /></group>
      </group>
    </InteractiveObject>
    <InteractiveObject id="object-inbox" board={floor === 1 ? 'inbox' : 'work'} onOpenBoard={onOpenBoard} onHover={onHover}>
      <group position={[-13.5, 1.27, 12.1]}>
        <mesh castShadow><boxGeometry args={[1.7, 0.22, 0.58]} /><meshStandardMaterial color="#ad704e" roughness={0.76} /></mesh>
        <mesh position={[0, 0.13, 0]}><boxGeometry args={[1.53, 0.03, 0.42]} /><meshStandardMaterial color="#f2eee4" roughness={0.88} /></mesh>
        <group position={[0, 0.151, 0]}><ObjectLabel text={floor === 1 ? 'PESAN' : 'PROYEK'} width={1.35} /></group>
      </group>
    </InteractiveObject>
    <InteractiveObject id="object-knowledge" board="knowledge" onOpenBoard={onOpenBoard} onHover={onHover}>
      <group position={[8.6, 0.47, 0.2]}>
        <mesh castShadow><boxGeometry args={[0.82, 0.1, 0.55]} /><meshStandardMaterial color="#b77652" roughness={0.82} /></mesh>
        <mesh position={[0, 0.058, 0]}><boxGeometry args={[0.7, 0.014, 0.45]} /><meshStandardMaterial color="#f2eee4" roughness={0.88} /></mesh>
        <group position={[0, 0.07, 0]}><ObjectLabel text="ARSIP" width={0.66} /></group>
      </group>
    </InteractiveObject>
    <InteractiveObject id="object-calendar" board="calendar" onOpenBoard={onOpenBoard} onHover={onHover}>
      <group position={[13.48, 1.55, 10.9]} rotation={[0, Math.PI / 2, 0]}>
        <mesh castShadow><boxGeometry args={[1.25, 1.1, 0.08]} /><meshStandardMaterial color="#355c4b" roughness={0.78} /></mesh>
        <mesh position={[0, 0.03, 0.05]}><boxGeometry args={[1.09, 0.83, 0.015]} /><meshStandardMaterial color="#f2eee4" roughness={0.88} /></mesh>
        <group position={[0, 0.02, 0.062]} rotation={[Math.PI / 2, 0, 0]}><ObjectLabel text="KALENDER" width={0.95} /></group>
      </group>
    </InteractiveObject>
  </group>;
}
