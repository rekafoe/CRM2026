import React, { useEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { printAreaSceneSize } from './scale';
import type { PrintAreaConfig } from './types';
import { isTshirtBackPrintArea } from './types';

type GltfPrintModelProps = {
  url: string;
  printArea: PrintAreaConfig;
  printTexture: THREE.Texture | null;
};

function parentNameChain(obj: THREE.Object3D): string {
  const parts: string[] = [];
  let cur: THREE.Object3D | null = obj;
  while (cur) {
    if (cur.name) parts.push(cur.name);
    cur = cur.parent;
  }
  return parts.join(' ').toLowerCase();
}

function collectBodyMeshes(root: THREE.Object3D, wantBack: boolean): THREE.Mesh[] {
  const found: THREE.Mesh[] = [];
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const chain = parentNameChain(mesh);
    if (wantBack) {
      if (/body_back|print_back/.test(chain)) found.push(mesh);
    } else if (/body_front|print_front/.test(chain)) {
      found.push(mesh);
    }
  });
  return found;
}

function fitCloneToStudio(source: THREE.Object3D, targetSize = 2.35): THREE.Object3D {
  const root = source.clone(true);
  root.updateMatrixWorld(true);

  let box = new THREE.Box3().setFromObject(root);
  let size = box.getSize(new THREE.Vector3());
  let center = box.getCenter(new THREE.Vector3());
  root.position.sub(center);

  const maxDim = Math.max(size.x, size.y, size.z, 0.001);
  root.scale.setScalar(targetSize / maxDim);
  root.updateMatrixWorld(true);

  box = new THREE.Box3().setFromObject(root);
  root.position.y -= box.min.y;
  root.updateMatrixWorld(true);

  box = new THREE.Box3().setFromObject(root);
  center = box.getCenter(new THREE.Vector3());
  root.position.x -= center.x;
  root.position.z -= center.z;
  root.updateMatrixWorld(true);

  return root;
}

/** Внешний слой груди (max.z) или спины (min.z), с приоритетом плотности. */
function pickSurfaceMesh(meshes: THREE.Mesh[], isBack: boolean): THREE.Mesh | null {
  if (!meshes.length) return null;
  let best: THREE.Mesh | null = null;
  let bestScore = -Infinity;
  for (const mesh of meshes) {
    const box = new THREE.Box3().setFromObject(mesh);
    const verts = mesh.geometry.attributes.position?.count ?? 0;
    const depthScore = isBack ? -box.min.z : box.max.z;
    const score = depthScore * 1e6 + verts;
    if (score > bestScore) {
      bestScore = score;
      best = mesh;
    }
  }
  return best;
}

/**
 * Оболочка по реальной геометрии Body_Front/Back.
 * Сдвиг только по оси Z (наружу) — НЕ по вершинным нормалям:
 * иначе соседние грани расходятся и сквозь «трещины» видна белая майка.
 * UV модели (~±255) непригодны — своя проекция плоскости X/Y.
 */
function buildSurfacePrintGeometry(
  mesh: THREE.Mesh,
  printArea: PrintAreaConfig,
  isBack: boolean,
): THREE.BufferGeometry | null {
  mesh.updateWorldMatrix(true, true);

  const source = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  const geo = source.clone();
  geo.applyMatrix4(mesh.matrixWorld);
  geo.computeVertexNormals();

  const pos = geo.attributes.position as THREE.BufferAttribute;
  const nor = geo.attributes.normal as THREE.BufferAttribute;
  if (!pos || !nor || pos.count < 3) {
    geo.dispose();
    return null;
  }

  // Единый сдвиг вдоль ±Z сохраняет связность mesh (без щелей между треугольниками).
  const inflateZ = isBack ? -0.014 : 0.014;
  for (let i = 0; i < pos.count; i += 1) {
    pos.setXYZ(i, pos.getX(i), pos.getY(i), pos.getZ(i) + inflateZ);
  }
  pos.needsUpdate = true;

  geo.computeBoundingBox();
  const box = geo.boundingBox;
  if (!box) {
    geo.dispose();
    return null;
  }

  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  // Абсолютные мм зоны (не только aspect): панель груди калибруем как ~50 см.
  const { width: printW, height: printH } = printAreaSceneSize(
    printArea.widthMm,
    printArea.heightMm,
    size.x,
    size.y,
  );
  const printCx = center.x;
  const printCy = center.y + size.y * 0.02;

  const uvAttr = new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2);
  for (let i = 0; i < pos.count; i += 1) {
    const u = (pos.getX(i) - printCx) / printW + 0.5;
    const v = (pos.getY(i) - printCy) / printH + 0.5;
    uvAttr.setXY(i, u, v);
  }
  geo.setAttribute('uv', uvAttr);

  // Оставляем только треугольники внутри зоны печати (по центроиду UV).
  const srcPos = pos.array as Float32Array;
  const srcNor = nor.array as Float32Array;
  const srcUv = uvAttr.array as Float32Array;
  const outPos: number[] = [];
  const outNor: number[] = [];
  const outUv: number[] = [];
  const pad = 0.04;

  for (let i = 0; i < pos.count; i += 3) {
    const u0 = srcUv[i * 2];
    const v0 = srcUv[i * 2 + 1];
    const u1 = srcUv[(i + 1) * 2];
    const v1 = srcUv[(i + 1) * 2 + 1];
    const u2 = srcUv[(i + 2) * 2];
    const v2 = srcUv[(i + 2) * 2 + 1];
    const cu = (u0 + u1 + u2) / 3;
    const cv = (v0 + v1 + v2) / 3;
    if (cu < -pad || cu > 1 + pad || cv < -pad || cv > 1 + pad) continue;

    for (let k = 0; k < 3; k += 1) {
      const vi = i + k;
      outPos.push(srcPos[vi * 3], srcPos[vi * 3 + 1], srcPos[vi * 3 + 2]);
      outNor.push(srcNor[vi * 3], srcNor[vi * 3 + 1], srcNor[vi * 3 + 2]);
      outUv.push(srcUv[vi * 2], srcUv[vi * 2 + 1]);
    }
  }

  geo.dispose();

  if (outPos.length < 9) return null;

  const clipped = new THREE.BufferGeometry();
  clipped.setAttribute('position', new THREE.Float32BufferAttribute(outPos, 3));
  clipped.setAttribute('normal', new THREE.Float32BufferAttribute(outNor, 3));
  clipped.setAttribute('uv', new THREE.Float32BufferAttribute(outUv, 2));
  clipped.computeBoundingSphere();
  return clipped;
}

function usePrintMaterial(printTexture: THREE.Texture | null) {
  return useMemo(() => {
    const map = printTexture
      ? (() => {
          const t = printTexture.clone();
          t.flipY = true;
          t.colorSpace = THREE.SRGBColorSpace;
          t.anisotropy = 4;
          t.wrapS = THREE.ClampToEdgeWrapping;
          t.wrapT = THREE.ClampToEdgeWrapping;
          t.needsUpdate = true;
          return t;
        })()
      : null;

    const mat = new THREE.MeshPhysicalMaterial({
      color: map ? '#ffffff' : '#e8eef5',
      map,
      roughness: 0.72,
      metalness: 0,
      clearcoat: map ? 0.06 : 0,
      clearcoatRoughness: 0.65,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -8,
      polygonOffsetUnits: -8,
      transparent: !map,
      opacity: map ? 1 : 0.55,
      depthWrite: Boolean(map),
      depthTest: true,
    });

    return { mat, map };
  }, [printTexture]);
}

/**
 * GLB-майка + макет, лежащий на реальной геометрии груди/спины (не отдельный цилиндр).
 */
export const GltfPrintModel: React.FC<GltfPrintModelProps> = ({ url, printArea, printTexture }) => {
  const { scene } = useGLTF(url);
  const fitted = useMemo(() => fitCloneToStudio(scene), [scene]);
  const isBack = isTshirtBackPrintArea(printArea);

  const printGeometry = useMemo(() => {
    const meshes = collectBodyMeshes(fitted, isBack);
    const surface = pickSurfaceMesh(meshes, isBack);
    if (!surface) return null;
    return buildSurfacePrintGeometry(surface, printArea, isBack);
  }, [fitted, printArea, isBack]);

  const { mat: printMat, map: printMap } = usePrintMaterial(printTexture);

  useEffect(() => {
    fitted.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });
  }, [fitted]);

  useEffect(() => {
    return () => {
      printGeometry?.dispose();
    };
  }, [printGeometry]);

  useEffect(() => {
    return () => {
      printMat.dispose();
      printMap?.dispose();
    };
  }, [printMat, printMap]);

  return (
    <group>
      <primitive object={fitted} />

      {printGeometry ? (
        <mesh
          name={printArea.meshName || (isBack ? 'print_back' : 'print_front')}
          geometry={printGeometry}
          material={printMat}
          renderOrder={4}
        />
      ) : null}
    </group>
  );
};

useGLTF.preload('/models/tshirt.glb');

export default GltfPrintModel;
