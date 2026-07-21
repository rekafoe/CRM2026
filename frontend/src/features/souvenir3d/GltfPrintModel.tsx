import React, { useEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { PrintAreaConfig } from './types';

type GltfPrintModelProps = {
  url: string;
  printArea: PrintAreaConfig;
  printTexture: THREE.Texture | null;
};

/**
 * Загружает GLB и вешает printTexture на mesh с именем printArea.meshName.
 * Остальные материалы не трогаем.
 */
export const GltfPrintModel: React.FC<GltfPrintModelProps> = ({ url, printArea, printTexture }) => {
  const { scene } = useGLTF(url);
  const cloned = useMemo(() => scene.clone(true), [scene]);

  useEffect(() => {
    let target: THREE.Mesh | null = null;
    cloned.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh && obj.name === printArea.meshName) {
        target = obj as THREE.Mesh;
      }
    });
    if (!target) return;

    const mesh = target as THREE.Mesh;
    const prev = mesh.material;
    const mat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      map: printTexture,
      roughness: 0.8,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });
    mesh.material = mat;

    return () => {
      mat.dispose();
      mesh.material = prev;
    };
  }, [cloned, printArea.meshName, printTexture]);

  return <primitive object={cloned} />;
};
