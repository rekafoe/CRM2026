import React, { useMemo } from 'react';
import * as THREE from 'three';
import type { PrintAreaConfig } from './types';

type ProceduralProductProps = {
  printArea: PrintAreaConfig;
  printTexture: THREE.Texture | null;
  bodyColor?: string;
};

/** Лёгкий шум для ткани / микрорельефа керамики. */
function makeNoiseMap(size = 128, contrast = 0.35): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 128 + (Math.random() - 0.5) * 255 * contrast;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.max(0, Math.min(255, v));
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  tex.needsUpdate = true;
  return tex;
}

function usePrintMaterial(printTexture: THREE.Texture | null, fallback = '#f8fafc') {
  return useMemo(() => {
    const mat = new THREE.MeshPhysicalMaterial({
      color: printTexture ? '#ffffff' : fallback,
      map: printTexture ?? null,
      roughness: 0.72,
      metalness: 0,
      clearcoat: printTexture ? 0.12 : 0,
      clearcoatRoughness: 0.55,
      sheen: printTexture ? 0.15 : 0,
      sheenRoughness: 0.7,
      sheenColor: new THREE.Color('#ffffff'),
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      depthWrite: true,
      transparent: false,
    });
    if (printTexture) {
      printTexture.colorSpace = THREE.SRGBColorSpace;
      printTexture.needsUpdate = true;
    }
    return mat;
  }, [printTexture, fallback]);
}

function useFabricMaterial(color: string) {
  return useMemo(() => {
    const bump = makeNoiseMap(96, 0.22);
    bump.repeat.set(6, 6);
    const mat = new THREE.MeshPhysicalMaterial({
      color,
      roughness: 0.92,
      metalness: 0,
      bumpMap: bump,
      bumpScale: 0.012,
      sheen: 1,
      sheenRoughness: 0.48,
      sheenColor: new THREE.Color('#f8fafc'),
      clearcoat: 0.02,
      clearcoatRoughness: 1,
    });
    return mat;
  }, [color]);
}

function useCeramicMaterial(color: string, opts?: { gloss?: number }) {
  const gloss = opts?.gloss ?? 0.88;
  return useMemo(() => {
    const bump = makeNoiseMap(64, 0.08);
    bump.repeat.set(2, 2);
    const mat = new THREE.MeshPhysicalMaterial({
      color,
      roughness: 1 - gloss * 0.75,
      metalness: 0.04,
      bumpMap: bump,
      bumpScale: 0.004,
      clearcoat: gloss,
      clearcoatRoughness: 0.12 + (1 - gloss) * 0.35,
      reflectivity: 0.6,
      ior: 1.48,
      specularIntensity: 0.9,
    });
    return mat;
  }, [color, gloss]);
}

/** Силуэт футболки: плечи, рукава, подол, V-горловина с отверстием. */
function buildTshirtShape(): THREE.Shape {
  const s = new THREE.Shape();
  // низ → левый бок → рукав → плечо → горловина → симметрия
  s.moveTo(-0.62, -1.02);
  s.bezierCurveTo(-0.66, -0.7, -0.7, -0.2, -0.66, 0.22);
  s.bezierCurveTo(-0.64, 0.42, -0.7, 0.48, -0.95, 0.28);
  // левый рукав
  s.lineTo(-1.38, -0.02);
  s.bezierCurveTo(-1.52, 0.08, -1.55, 0.42, -1.42, 0.55);
  s.bezierCurveTo(-1.28, 0.68, -0.95, 0.92, -0.55, 1.08);
  // левое плечо → горловина
  s.bezierCurveTo(-0.42, 0.98, -0.28, 0.9, -0.18, 0.88);
  s.bezierCurveTo(-0.1, 0.78, -0.05, 0.72, 0, 0.72);
  s.bezierCurveTo(0.05, 0.72, 0.1, 0.78, 0.18, 0.88);
  s.bezierCurveTo(0.28, 0.9, 0.42, 0.98, 0.55, 1.08);
  // правый рукав
  s.bezierCurveTo(0.95, 0.92, 1.28, 0.68, 1.42, 0.55);
  s.bezierCurveTo(1.55, 0.42, 1.52, 0.08, 1.38, -0.02);
  s.lineTo(0.95, 0.28);
  s.bezierCurveTo(0.7, 0.48, 0.64, 0.42, 0.66, 0.22);
  s.bezierCurveTo(0.7, -0.2, 0.66, -0.7, 0.62, -1.02);
  s.bezierCurveTo(0.32, -1.06, -0.32, -1.06, -0.62, -1.02);

  // отверстие горловины
  const neck = new THREE.Path();
  neck.moveTo(-0.16, 0.78);
  neck.bezierCurveTo(-0.12, 0.68, -0.06, 0.62, 0, 0.62);
  neck.bezierCurveTo(0.06, 0.62, 0.12, 0.68, 0.16, 0.78);
  neck.bezierCurveTo(0.1, 0.86, -0.1, 0.86, -0.16, 0.78);
  s.holes.push(neck);

  return s;
}

/** Профиль кружки: дно с кольцом, конус, буртик, внутренняя стенка. */
function buildMugLathePoints(): THREE.Vector2[] {
  return [
    new THREE.Vector2(0.001, -0.64),
    new THREE.Vector2(0.36, -0.64),
    new THREE.Vector2(0.42, -0.62), // кольцо дна
    new THREE.Vector2(0.44, -0.58),
    new THREE.Vector2(0.48, -0.52),
    new THREE.Vector2(0.5, -0.28),
    new THREE.Vector2(0.52, 0.0),
    new THREE.Vector2(0.545, 0.28),
    new THREE.Vector2(0.565, 0.48),
    new THREE.Vector2(0.58, 0.54),
    new THREE.Vector2(0.6, 0.57), // наружный буртик
    new THREE.Vector2(0.575, 0.595),
    new THREE.Vector2(0.52, 0.585), // край ободка
    new THREE.Vector2(0.505, 0.52),
    new THREE.Vector2(0.485, 0.2),
    new THREE.Vector2(0.46, -0.2),
    new THREE.Vector2(0.435, -0.48),
    new THREE.Vector2(0.4, -0.55),
    new THREE.Vector2(0.001, -0.56),
  ];
}

/** Мягкая «тканевая» футболка с bevel и зоной печати на груди. */
export const ProceduralTshirt: React.FC<ProceduralProductProps> = ({
  printArea,
  printTexture,
  bodyColor = '#e8eef6',
}) => {
  const printMat = usePrintMaterial(printTexture);
  const bodyMat = useFabricMaterial(bodyColor);
  const ribMat = useFabricMaterial('#c5d0de');
  const innerMat = useFabricMaterial('#d5dee9');

  const shape = useMemo(() => buildTshirtShape(), []);
  const extrude = useMemo(
    () => ({
      depth: 0.22,
      bevelEnabled: true,
      bevelThickness: 0.055,
      bevelSize: 0.048,
      bevelOffset: -0.008,
      bevelSegments: 5,
      curveSegments: 48,
    }),
    [],
  );

  const aspect = printArea.widthMm / Math.max(1, printArea.heightMm);
  const printH = 0.68;
  const printW = Math.min(Math.max(printH * aspect, 0.42), 0.95);
  /**
   * Тело: position z=-0.11, depth=0.22 + bevelThickness≈0.055 → перед ≈0.165.
   * Принт обязан быть СНАРУЖИ, иначе текстура «пропадает» внутри mesh.
   */
  const printZ = 0.22;

  return (
    <group position={[0, 0.02, 0]}>
      <mesh material={bodyMat} castShadow receiveShadow position={[0, 0, -0.11]}>
        <extrudeGeometry args={[shape, extrude]} />
      </mesh>

      {/* Внутренняя «подкладка» — читаемая толщина */}
      <mesh material={innerMat} position={[0, 0.05, -0.02]} scale={[0.92, 0.92, 0.55]}>
        <extrudeGeometry
          args={[
            shape,
            {
              depth: 0.08,
              bevelEnabled: false,
              curveSegments: 24,
            },
          ]}
        />
      </mesh>

      {/* Ворот-резинка */}
      <mesh position={[0, 0.72, 0.04]} rotation={[1.15, 0, 0]} material={ribMat} castShadow>
        <torusGeometry args={[0.185, 0.038, 14, 56, Math.PI * 1.25]} />
      </mesh>

      {/* Манжеты */}
      <mesh position={[-1.32, 0.28, 0.02]} rotation={[0.15, 0.2, 0.85]} material={ribMat} castShadow>
        <cylinderGeometry args={[0.095, 0.105, 0.07, 24]} />
      </mesh>
      <mesh position={[1.32, 0.28, 0.02]} rotation={[0.15, -0.2, -0.85]} material={ribMat} castShadow>
        <cylinderGeometry args={[0.095, 0.105, 0.07, 24]} />
      </mesh>

      {/* Подол-резинка */}
      <mesh position={[0, -0.99, 0.02]} material={ribMat} castShadow receiveShadow>
        <boxGeometry args={[1.18, 0.055, 0.18]} />
      </mesh>

      {/* Зона печати — центр груди, поверх ткани */}
      <group position={[0, 0.06, printZ]} renderOrder={2}>
        <mesh position={[0, 0, -0.003]} receiveShadow>
          <planeGeometry args={[printW + 0.04, printH + 0.04]} />
          <meshPhysicalMaterial color="#f8fafc" roughness={0.9} sheen={0.45} sheenRoughness={0.7} />
        </mesh>
        <mesh name={printArea.meshName || 'print_front'} material={printMat} castShadow renderOrder={3}>
          <planeGeometry args={[printW, printH]} />
        </mesh>
      </group>
    </group>
  );
};

/** Керамическая кружка: lathe + clearcoat, объёмная ручка, печатный пояс. */
export const ProceduralMug: React.FC<ProceduralProductProps> = ({
  printArea,
  printTexture,
  bodyColor = '#f5f7fa',
}) => {
  const printMat = usePrintMaterial(printTexture, '#eef2f7');
  const bodyMat = useCeramicMaterial(bodyColor, { gloss: 0.9 });
  const rimMat = useCeramicMaterial('#ffffff', { gloss: 0.95 });
  const innerMat = useCeramicMaterial('#ebeff5', { gloss: 0.75 });
  const handleMat = useCeramicMaterial(bodyColor, { gloss: 0.85 });

  const lathePoints = useMemo(() => buildMugLathePoints(), []);
  const handleCurve = useMemo(
    () =>
      new THREE.CubicBezierCurve3(
        new THREE.Vector3(0.55, 0.34, 0),
        new THREE.Vector3(1.02, 0.48, 0),
        new THREE.Vector3(1.05, -0.32, 0),
        new THREE.Vector3(0.53, -0.3, 0),
      ),
    [],
  );

  return (
    <group>
      <mesh material={bodyMat} castShadow receiveShadow>
        <latheGeometry args={[lathePoints, 128]} />
      </mesh>

      {/* Глянцевый ободок */}
      <mesh position={[0, 0.575, 0]} rotation={[Math.PI / 2, 0, 0]} material={rimMat} castShadow>
        <torusGeometry args={[0.545, 0.022, 16, 80]} />
      </mesh>

      {/* Внутренняя полость */}
      <mesh position={[0, 0.02, 0]} material={innerMat}>
        <cylinderGeometry args={[0.485, 0.43, 1.02, 80, 1, true]} />
      </mesh>
      <mesh position={[0, -0.48, 0]} rotation={[Math.PI / 2, 0, 0]} material={innerMat}>
        <circleGeometry args={[0.43, 64]} />
      </mesh>

      {/* Кольцо дна */}
      <mesh position={[0, -0.635, 0]} rotation={[Math.PI / 2, 0, 0]} material={bodyMat} castShadow>
        <torusGeometry args={[0.3, 0.028, 12, 64]} />
      </mesh>

      {/* Ручка */}
      <mesh material={handleMat} castShadow>
        <tubeGeometry args={[handleCurve, 80, 0.055, 20, false]} />
      </mesh>
      <mesh position={[0.53, 0.32, 0]} material={handleMat} castShadow>
        <sphereGeometry args={[0.072, 24, 18]} />
      </mesh>
      <mesh position={[0.51, -0.28, 0]} material={handleMat} castShadow>
        <sphereGeometry args={[0.068, 24, 18]} />
      </mesh>

      {/* Печатный пояс */}
      <mesh name={printArea.meshName || 'print_wrap'} material={printMat} castShadow>
        <cylinderGeometry args={[0.552, 0.528, 0.56, 128, 1, true]} />
      </mesh>

      {/* Маркеры зоны */}
      <mesh position={[0, 0.28, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.553, 0.005, 8, 96]} />
        <meshBasicMaterial color="#64748b" transparent opacity={0.35} />
      </mesh>
      <mesh position={[0, -0.28, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.53, 0.005, 8, 96]} />
        <meshBasicMaterial color="#64748b" transparent opacity={0.35} />
      </mesh>
    </group>
  );
};

export const ProceduralProduct: React.FC<ProceduralProductProps> = (props) => {
  const kind = props.printArea.procedural ?? (props.printArea.id === 'wrap' ? 'mug' : 'tshirt');
  if (kind === 'mug') return <ProceduralMug {...props} />;
  return <ProceduralTshirt {...props} />;
};
