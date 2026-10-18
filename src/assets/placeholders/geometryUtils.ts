import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Utilidades para construir placeholders low-poly.
 *
 * Cada pieza lleva su color como atributo de vértice y todas se fusionan en
 * UNA geometría: un objeto compuesto de 20 piezas cuesta 1 draw call en lugar
 * de 20. Es la clave para mantener 60 FPS en móviles de gama media.
 */
export interface ColoredPart {
  geometry: THREE.BufferGeometry;
  color: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number] | number;
}

const tmpColor = new THREE.Color();
const tmpMatrix = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpEuler = new THREE.Euler();
const tmpPos = new THREE.Vector3();
const tmpScale = new THREE.Vector3();

export function mergeColoredParts(parts: ColoredPart[]): THREE.BufferGeometry {
  const prepared = parts.map((p) => {
    // No indexada: cada cara tiene sus propios vértices (look facetado y atributos homogéneos)
    const g = p.geometry.index ? p.geometry.toNonIndexed() : p.geometry.clone();
    g.deleteAttribute('uv');

    tmpPos.set(...(p.position ?? [0, 0, 0]));
    tmpEuler.set(...(p.rotation ?? [0, 0, 0]));
    tmpQuat.setFromEuler(tmpEuler);
    const s = p.scale ?? 1;
    if (typeof s === 'number') tmpScale.setScalar(s);
    else tmpScale.set(...s);
    g.applyMatrix4(tmpMatrix.compose(tmpPos, tmpQuat, tmpScale));

    tmpColor.setHex(p.color, THREE.SRGBColorSpace);
    const count = g.attributes.position.count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = tmpColor.r;
      colors[i * 3 + 1] = tmpColor.g;
      colors[i * 3 + 2] = tmpColor.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return g;
  });

  const merged = mergeGeometries(prepared, false);
  prepared.forEach((g) => g.dispose());
  if (!merged) throw new Error('No se pudieron fusionar las piezas del placeholder');
  merged.computeBoundingSphere();
  return merged;
}

let vertexColorMaterial: THREE.MeshLambertMaterial | undefined;

/** Material único compartido por todas las geometrías con color por vértice. */
export function vertexColorMat(): THREE.MeshLambertMaterial {
  vertexColorMaterial ??= new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  return vertexColorMaterial;
}

/** Geometrías base reutilizables (se clonan al fusionar). */
export const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  ico: new THREE.IcosahedronGeometry(1, 0),
  dodeca: new THREE.DodecahedronGeometry(1, 0),
  cone4: new THREE.ConeGeometry(1, 1, 4),
  cone5: new THREE.ConeGeometry(1, 1, 5),
  cone6: new THREE.ConeGeometry(1, 1, 6),
  cyl6: new THREE.CylinderGeometry(1, 1, 1, 6),
  cyl8: new THREE.CylinderGeometry(1, 1, 1, 8),
  torus: new THREE.TorusGeometry(1, 0.35, 4, 8),
  sphere: new THREE.SphereGeometry(1, 6, 4),
  circle: new THREE.CircleGeometry(1, 10),
} as const;
