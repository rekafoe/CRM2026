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
  /** Инкремент при каждом новом кадре с Fabric (для live-обновления текстуры). */
  textureRevision?: number;
  className?: string;
  /** Подпись для оператора / клиента. */
  caption?: string;
};

function textureFromSource(source: string | HTMLCanvasElement | null): THREE.CanvasTexture | THREE.Texture | null {
  if (!source) return null;
  if (typeof source !== 'string') {
    const tex = new THREE.CanvasTexture(source);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.flipY = true;
    tex.needsUpdate = true;
    return tex;
  }
  // Data URL: синхроннее через Image, иначе TextureLoader иногда «молчит» до следующего кадра.
  const img = new Image();
  const tex = new THREE.Texture(img);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.flipY = true;
  img.onload = () => {
    tex.needsUpdate = true;
  };
  img.src = source;
  if (img.complete) tex.needsUpdate = true;
  return tex;
}

const SceneBody: React.FC<{
  printArea: PrintAreaConfig;
  printTexture: THREE.Texture | null;
}> = ({ printArea, printTexture }) => {
  const hasGltf = Boolean(printArea.modelUrl);
  const isMug = printArea.procedural === 'mug' || printArea.id === 'wrap';
  return (
    <>
      <color attach="background" args={['#e8eef5']} />
      <fog attach="fog" args={['#e8eef5', 8, 18]} />
      <ambientLight intensity={0.35} />
      <hemisphereLight args={['#ffffff', '#94a3b8', 0.45]} />
      <directionalLight
        position={[3.2, 5.5, 2.8]}
        intensity={1.35}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <directionalLight position={[-2.5, 2.2, -1.5]} intensity={0.28} />
      <spotLight position={[0, 4.5, 3]} angle={0.45} penumbra={0.55} intensity={0.55} castShadow />
      <Suspense fallback={null}>
        <Environment preset="studio" />
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
        <group position={[0, isMug ? 0.05 : 0.02, 0]}>
          <ProceduralProduct printArea={printArea} printTexture={printTexture} />
        </group>
      )}
      <ContactShadows
        position={[0, isMug ? -0.72 : -1.08, 0]}
        opacity={0.45}
        scale={isMug ? 4.5 : 6.5}
        blur={2.4}
        far={2.5}
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, isMug ? -0.725 : -1.085, 0]} receiveShadow>
        <circleGeometry args={[isMug ? 1.4 : 2.1, 48]} />
        <meshStandardMaterial color="#d8e0ea" roughness={0.95} metalness={0} />
      </mesh>
      <OrbitControls
        enablePan={false}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI / 1.7}
        minDistance={isMug ? 1.7 : 2.3}
        maxDistance={isMug ? 4.8 : 6.2}
        target={[0, isMug ? 0.05 : 0.08, 0]}
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
  textureRevision = 0,
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
  }, [textureSource, textureRevision]);

  const rootClass = ['souvenir3d-preview', className].filter(Boolean).join(' ');
  const label = caption ?? `${printArea.label} · ${printArea.widthMm}×${printArea.heightMm} мм`;

  const cameraPos = useMemo<[number, number, number]>(
    () => (printArea.procedural === 'mug' || printArea.id === 'wrap' ? [2.15, 1.15, 2.35] : [0.15, 0.55, 3.55]),
    [printArea.id, printArea.procedural],
  );

  return (
    <div className={rootClass}>
      <div className="souvenir3d-preview__viewport" aria-label="3D-превью изделия">
        <Canvas
          key={`${printArea.id}-${cameraPos.join(',')}`}
          shadows
          dpr={[1, 2]}
          camera={{ position: cameraPos, fov: 38 }}
          gl={{
            antialias: true,
            alpha: true,
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.05,
          }}
        >
          <SceneBody printArea={printArea} printTexture={printTexture} />
        </Canvas>
      </div>
      <p className="souvenir3d-preview__caption">{label}</p>
    </div>
  );
};

export default Souvenir3dPreview;
