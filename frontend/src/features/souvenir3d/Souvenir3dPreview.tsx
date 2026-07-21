import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { ContactShadows, Environment, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { GltfPrintModel } from './GltfPrintModel';
import { ProceduralProduct } from './ProceduralProduct';
import type { PrintAreaConfig } from './types';
import './souvenir3dPreview.css';

export type Souvenir3dPreviewProps = {
  printArea: PrintAreaConfig;
  /** Data URL или HTMLCanvasElement с макетом (aspect = printArea мм). */
  textureSource: string | HTMLCanvasElement | null;
  className?: string;
  /** Подпись для оператора / клиента. */
  caption?: string;
};

function textureFromSource(source: string | HTMLCanvasElement | null): THREE.CanvasTexture | THREE.Texture | null {
  if (!source) return null;
  if (typeof source !== 'string') {
    const tex = new THREE.CanvasTexture(source);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.flipY = true;
    tex.needsUpdate = true;
    return tex;
  }
  const loader = new THREE.TextureLoader();
  const tex = loader.load(source);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = true;
  return tex;
}

const SceneBody: React.FC<{
  printArea: PrintAreaConfig;
  printTexture: THREE.Texture | null;
}> = ({ printArea, printTexture }) => {
  const hasGltf = Boolean(printArea.modelUrl);
  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[3, 5, 2]} intensity={1.1} castShadow />
      <Suspense fallback={null}>
        <Environment preset="city" />
      </Suspense>
      {hasGltf && printArea.modelUrl ? (
        <Suspense fallback={null}>
          <GltfPrintModel
            url={printArea.modelUrl}
            printArea={printArea}
            printTexture={printTexture}
          />
        </Suspense>
      ) : (
        <ProceduralProduct printArea={printArea} printTexture={printTexture} />
      )}
      <ContactShadows position={[0, -0.95, 0]} opacity={0.35} scale={8} blur={2.5} far={2} />
      <OrbitControls
        enablePan={false}
        minPolarAngle={Math.PI / 4}
        maxPolarAngle={Math.PI / 1.55}
        minDistance={2.2}
        maxDistance={6}
      />
    </>
  );
};

/**
 * Live 3D-превью изделия. Не участвует в production PDF — только mockup для клиента.
 */
export const Souvenir3dPreview: React.FC<Souvenir3dPreviewProps> = ({
  printArea,
  textureSource,
  className,
  caption,
}) => {
  const [printTexture, setPrintTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    const tex = textureFromSource(textureSource);
    setPrintTexture(tex);
    return () => {
      tex?.dispose();
    };
  }, [textureSource]);

  const rootClass = ['souvenir3d-preview', className].filter(Boolean).join(' ');
  const label = caption ?? `${printArea.label} · ${printArea.widthMm}×${printArea.heightMm} мм`;

  const cameraPos = useMemo<[number, number, number]>(
    () => (printArea.procedural === 'mug' || printArea.id === 'wrap' ? [2.2, 1.2, 2.4] : [0, 0.4, 3.4]),
    [printArea.id, printArea.procedural],
  );

  return (
    <div className={rootClass}>
      <div className="souvenir3d-preview__viewport" aria-label="3D-превью изделия">
        <Canvas
          shadows
          dpr={[1, 1.75]}
          camera={{ position: cameraPos, fov: 40 }}
          gl={{ antialias: true, alpha: true }}
        >
          <color attach="background" args={['#f1f5f9']} />
          <SceneBody printArea={printArea} printTexture={printTexture} />
        </Canvas>
      </div>
      <p className="souvenir3d-preview__caption">{label}</p>
    </div>
  );
};

export default Souvenir3dPreview;
