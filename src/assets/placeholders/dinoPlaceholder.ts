import * as THREE from 'three';
import type { DinoDefinition } from '@/config/dinos.config';
import { PALETTE } from '@/engine/materials';
import { GEO, mergeColoredParts, vertexColorMat, type ColoredPart } from './geometryUtils';

/**
 * Dinosaurio low-poly hecho con primitivas. Mira hacia −Z con los pies en y=0.
 * Las piezas animables (cabeza, cola, patas, brazos) son mallas separadas con
 * su pivote en la articulación; todo lo demás está fusionado.
 *
 * Al reemplazarlo por un GLB, el modelo debe exponer los mismos nombres de
 * animación (run, jump, roll, hit, idle) — ver public/assets/README.md.
 */
export interface DinoRig {
  root: THREE.Group;
  /** Grupo que se inclina/rota (rodar, tropezar) sin afectar a la sombra. */
  body: THREE.Group;
  head: THREE.Object3D;
  tail: THREE.Object3D;
  legL: THREE.Object3D;
  legR: THREE.Object3D;
  armL: THREE.Object3D;
  armR: THREE.Object3D;
}

export function createDinoPlaceholder(def: DinoDefinition): DinoRig {
  const { body: cBody, belly: cBelly, accent: cAccent, features, scale } = def.look;
  const has = (f: (typeof features)[number]) => features.includes(f);
  const mat = vertexColorMat();

  const root = new THREE.Group();
  root.name = `dino-${def.id}`;
  const body = new THREE.Group();
  root.add(body);

  // --- Torso -----------------------------------------------------------------
  const torsoParts: ColoredPart[] = [
    { geometry: GEO.ico, color: cBody, position: [0, 0.95, 0], scale: [0.42, 0.4, 0.62] },
    { geometry: GEO.ico, color: cBelly, position: [0, 0.82, -0.12], scale: [0.32, 0.28, 0.45] },
  ];
  if (has('longNeck')) {
    torsoParts.push({
      geometry: GEO.cyl6, color: cBody, position: [0, 1.3, -0.5],
      rotation: [-0.6, 0, 0], scale: [0.13, 0.7, 0.13],
    });
  }
  if (has('plates')) {
    for (let i = 0; i < 5; i++) {
      const z = -0.35 + i * 0.2;
      torsoParts.push({
        geometry: GEO.cone4, color: cAccent, position: [0, 1.38 - Math.abs(i - 2) * 0.05, z],
        scale: [0.13, 0.32 - Math.abs(i - 2) * 0.05, 0.04],
      });
    }
  }
  if (has('sail')) {
    torsoParts.push({
      geometry: GEO.cone4, color: cAccent, position: [0, 1.6, 0.05],
      rotation: [0, Math.PI / 4, 0], scale: [0.04, 0.95, 0.55],
    });
  }
  const torso = new THREE.Mesh(mergeColoredParts(torsoParts), mat);
  body.add(torso);

  // --- Cabeza (pivote en el cuello) -------------------------------------------
  const big = has('bigHead') ? 1.35 : 1;
  const headY = has('longNeck') ? 1.68 : 1.32;
  const headZ = has('longNeck') ? -0.78 : -0.55;
  const headParts: ColoredPart[] = [
    { geometry: GEO.box, color: cBody, position: [0, 0.06, -0.18], scale: [0.36 * big, 0.32 * big, 0.48 * big] },
    { geometry: GEO.box, color: cBelly, position: [0, -0.08 * big, -0.3 * big], scale: [0.3 * big, 0.1, 0.36 * big] },
    // Ojos (blanco + pupila)
    { geometry: GEO.box, color: PALETTE.white, position: [0.17 * big, 0.14 * big, -0.25 * big], scale: [0.06, 0.1, 0.1] },
    { geometry: GEO.box, color: PALETTE.white, position: [-0.17 * big, 0.14 * big, -0.25 * big], scale: [0.06, 0.1, 0.1] },
    { geometry: GEO.box, color: PALETTE.black, position: [0.2 * big, 0.14 * big, -0.27 * big], scale: [0.03, 0.06, 0.05] },
    { geometry: GEO.box, color: PALETTE.black, position: [-0.2 * big, 0.14 * big, -0.27 * big], scale: [0.03, 0.06, 0.05] },
  ];
  if (has('crest')) {
    headParts.push({
      geometry: GEO.cone4, color: cAccent, position: [0, 0.32, 0.25],
      rotation: [-2.1, 0, 0], scale: [0.07, 0.7, 0.07],
    });
  }
  if (has('horns')) {
    headParts.push(
      { geometry: GEO.cone4, color: cAccent, position: [0.12, 0.26, -0.3], rotation: [-1.1, 0, 0], scale: [0.05, 0.4, 0.05] },
      { geometry: GEO.cone4, color: cAccent, position: [-0.12, 0.26, -0.3], rotation: [-1.1, 0, 0], scale: [0.05, 0.4, 0.05] },
      { geometry: GEO.cone4, color: cAccent, position: [0, 0.05, -0.5], rotation: [-1.3, 0, 0], scale: [0.04, 0.2, 0.04] },
      // Gola
      { geometry: GEO.cyl6, color: cAccent, position: [0, 0.15, 0.1], rotation: [Math.PI / 2 - 0.3, 0, 0], scale: [0.36, 0.05, 0.36] },
    );
  }
  const head = new THREE.Mesh(mergeColoredParts(headParts), mat);
  head.position.set(0, headY, headZ);
  body.add(head);

  // --- Cola (pivote en la cadera) ---------------------------------------------
  const tailParts: ColoredPart[] = [
    { geometry: GEO.cone5, color: cBody, position: [0, 0, 0.55], rotation: [Math.PI / 2 + 0.15, 0, 0], scale: [0.24, 1.1, 0.2] },
  ];
  if (has('club')) {
    tailParts.push({ geometry: GEO.dodeca, color: cAccent, position: [0, -0.12, 1.1], scale: [0.2, 0.15, 0.2] });
  }
  const tail = new THREE.Mesh(mergeColoredParts(tailParts), mat);
  tail.position.set(0, 0.98, 0.45);
  body.add(tail);

  // --- Patas y brazos ---------------------------------------------------------
  const legGeo = mergeColoredParts([
    { geometry: GEO.box, color: cBody, position: [0, -0.28, 0], scale: [0.2, 0.56, 0.26] },
    { geometry: GEO.box, color: cAccent, position: [0, -0.62, -0.06], scale: [0.22, 0.1, 0.34] },
  ]);
  const legL = new THREE.Mesh(legGeo, mat);
  const legR = new THREE.Mesh(legGeo, mat);
  legL.position.set(0.22, 0.68, 0.08);
  legR.position.set(-0.22, 0.68, 0.08);
  body.add(legL, legR);

  const armGeo = mergeColoredParts([
    { geometry: GEO.box, color: cBody, position: [0, -0.12, -0.05], rotation: [-0.5, 0, 0], scale: [0.09, 0.28, 0.09] },
  ]);
  const armL = new THREE.Mesh(armGeo, mat);
  const armR = new THREE.Mesh(armGeo, mat);
  armL.position.set(0.25, 1.0, -0.42);
  armR.position.set(-0.25, 1.0, -0.42);
  body.add(armL, armR);

  root.scale.setScalar(scale);
  return { root, body, head, tail, legL, legR, armL, armR };
}
