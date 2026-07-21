import React, { useMemo } from 'react';
import * as THREE from 'three';
import type { PrintAreaConfig } from './types';

type ProceduralProductProps = {
  printArea: PrintAreaConfig;
  printTexture: THREE.Texture | null;
  bodyColor?: string;
};

function usePrintMaterial(printTexture: THREE.Texture | null, fallback = '#f3f4f6') {
  return useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: printTexture ? '#ffffff' : fallback,
      map: printTexture ?? null,
      roughness: 0.85,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });
    return mat;
  }, [printTexture, fallback]);
}

/** Процедурная майка: корпус + именованная плоскость print_front. */
export const ProceduralTshirt: React.FC<ProceduralProductProps> = ({
  printArea,
  printTexture,
  bodyColor = '#e8eef5',
}) => {
  const printMat = usePrintMaterial(printTexture);
  const bodyMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.9, metalness: 0 }),
    [bodyColor],
  );

  const aspect = printArea.widthMm / Math.max(1, printArea.heightMm);
  const printH = 0.95;
  const printW = printH * aspect;

  return (
    <group>
      {/* Торс */}
      <mesh position={[0, 0.15, 0]} material={bodyMat} castShadow receiveShadow>
        <boxGeometry args={[1.6, 1.8, 0.35]} />
      </mesh>
      {/* Рукава */}
      <mesh position={[-1.05, 0.55, 0]} rotation={[0, 0, 0.35]} material={bodyMat} castShadow>
        <boxGeometry args={[0.55, 0.35, 0.3]} />
      </mesh>
      <mesh position={[1.05, 0.55, 0]} rotation={[0, 0, -0.35]} material={bodyMat} castShadow>
        <boxGeometry args={[0.55, 0.35, 0.3]} />
      </mesh>
      {/* Ворот */}
      <mesh position={[0, 1.05, 0.02]} material={bodyMat}>
        <torusGeometry args={[0.28, 0.08, 8, 24, Math.PI]} />
      </mesh>
      {/* Зона печати — имя mesh совпадает с контрактом */}
      <mesh
        name={printArea.meshName || 'print_front'}
        position={[0, 0.2, 0.185]}
        material={printMat}
      >
        <planeGeometry args={[printW, printH]} />
      </mesh>
    </group>
  );
};

/** Процедурная кружка: корпус + цилиндрический print_wrap. */
export const ProceduralMug: React.FC<ProceduralProductProps> = ({
  printArea,
  printTexture,
  bodyColor = '#f8fafc',
}) => {
  const printMat = usePrintMaterial(printTexture);
  const bodyMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: bodyColor,
        roughness: 0.35,
        metalness: 0.05,
      }),
    [bodyColor],
  );
  const rimMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.4, metalness: 0.1 }),
    [],
  );

  return (
    <group>
      <mesh material={bodyMat} castShadow receiveShadow>
        <cylinderGeometry args={[0.55, 0.5, 1.15, 48, 1, true]} />
      </mesh>
      <mesh position={[0, 0.575, 0]} material={rimMat}>
        <torusGeometry args={[0.55, 0.035, 12, 48]} />
      </mesh>
      <mesh position={[0, -0.575, 0]} rotation={[Math.PI, 0, 0]} material={bodyMat}>
        <circleGeometry args={[0.5, 48]} />
      </mesh>
      {/* Ручка */}
      <mesh position={[0.72, 0.05, 0]} rotation={[0, 0, Math.PI / 2]} material={bodyMat} castShadow>
        <torusGeometry args={[0.28, 0.06, 12, 24, Math.PI * 1.2]} />
      </mesh>
      {/* Печатный пояс — open cylinder, UV по окружности */}
      <mesh name={printArea.meshName || 'print_wrap'} material={printMat} castShadow>
        <cylinderGeometry args={[0.552, 0.502, 0.75, 64, 1, true]} />
      </mesh>
    </group>
  );
};

export const ProceduralProduct: React.FC<ProceduralProductProps> = (props) => {
  const kind = props.printArea.procedural ?? (props.printArea.id === 'wrap' ? 'mug' : 'tshirt');
  if (kind === 'mug') return <ProceduralMug {...props} />;
  return <ProceduralTshirt {...props} />;
};
