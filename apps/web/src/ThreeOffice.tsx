import { Canvas } from '@react-three/fiber';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';

type Department = { name: string; to: string; note: string };

function Workstation({ position, color, onSelect }: { position: [number, number, number]; color: string; onSelect: () => void }) {
  return <group position={position} onClick={onSelect}>
    <mesh position={[0, 0.58, 0]} castShadow receiveShadow><boxGeometry args={[1.2, 0.14, 0.62]} /><meshStandardMaterial color="#d4c5ad" roughness={0.8} /></mesh>
    <mesh position={[-0.43, 0.27, -0.19]}><boxGeometry args={[0.09, 0.55, 0.09]} /><meshStandardMaterial color="#56675a" roughness={0.9} /></mesh>
    <mesh position={[0.43, 0.27, -0.19]}><boxGeometry args={[0.09, 0.55, 0.09]} /><meshStandardMaterial color="#56675a" roughness={0.9} /></mesh>
    <mesh position={[-0.43, 0.27, 0.19]}><boxGeometry args={[0.09, 0.55, 0.09]} /><meshStandardMaterial color="#56675a" roughness={0.9} /></mesh>
    <mesh position={[0.43, 0.27, 0.19]}><boxGeometry args={[0.09, 0.55, 0.09]} /><meshStandardMaterial color="#56675a" roughness={0.9} /></mesh>
    <mesh position={[0.2, 0.82, -0.1]}><boxGeometry args={[0.36, 0.25, 0.05]} /><meshStandardMaterial color={color} roughness={0.72} /></mesh>
    <mesh position={[-0.33, 0.7, 0.15]}><cylinderGeometry args={[0.12, 0.12, 0.07, 5]} /><meshStandardMaterial color="#557657" roughness={0.9} /></mesh>
    <mesh position={[0, 1.05, 0]}><boxGeometry args={[1.35, 0.04, 0.75]} /><meshStandardMaterial color={color} transparent opacity={0.01} /></mesh>
  </group>;
}

function StudioRoom({ departments, onSelect }: { departments: Department[]; onSelect: (department: Department) => void }) {
  const positions: Array<[number, number, number]> = [
    [-4, 0, 0], [-2, 0, -0.3], [0, 0, 0], [2, 0, -0.3], [4, 0, 0],
  ];
  const colors = ['#a95032', '#294237', '#7d9274', '#9b704d', '#586c58'];
  return <>
    <ambientLight intensity={1.2} />
    <directionalLight position={[-3, 7, 5]} intensity={2.1} castShadow />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, 0]} receiveShadow><planeGeometry args={[11, 7]} /><meshStandardMaterial color="#e6dfd0" roughness={1} /></mesh>
    <mesh position={[0, 1.8, -3.45]} receiveShadow><boxGeometry args={[11, 3.7, 0.12]} /><meshStandardMaterial color="#d6dfd1" roughness={1} /></mesh>
    <mesh position={[-5.45, 1.8, 0]} receiveShadow><boxGeometry args={[0.12, 3.7, 7]} /><meshStandardMaterial color="#e7dfd1" roughness={1} /></mesh>
    <mesh position={[5.45, 1.8, 0]} receiveShadow><boxGeometry args={[0.12, 3.7, 7]} /><meshStandardMaterial color="#e7dfd1" roughness={1} /></mesh>
    {departments.map((department, index) => <Workstation key={department.name} position={positions[index] ?? [0, 0, 0]} color={colors[index] ?? '#294237'} onSelect={() => onSelect(department)} />)}
  </>;
}

export default function ThreeOffice({ departments }: { departments: Department[] }) {
  const navigate = useNavigate();
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === 'dark');
  useEffect(() => {
    const observer = new MutationObserver(() => setDark(document.documentElement.dataset.theme === 'dark'));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);
  const background = dark ? '#202a23' : '#e5e5da';
  return <section className="office-scene" aria-label="Ruang kantor tiga dimensi">
    <div className="scene-caption" aria-hidden="true">Pilih meja untuk membuka ruang kerja terkait</div>
    <div aria-hidden="true" style={{ width: '100%', height: '100%' }}>
      <Canvas camera={{ position: [7, 6.5, 9.4], fov: 43 }} dpr={[1, 1.5]} shadows="percentage">
        <color attach="background" args={[background]} />
        <StudioRoom departments={departments} onSelect={(department) => navigate(department.to)} />
      </Canvas>
    </div>
  </section>;
}
