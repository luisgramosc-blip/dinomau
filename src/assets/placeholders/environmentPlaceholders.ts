import * as THREE from 'three';
import { GAME_CONFIG, laneX } from '@/config/game.config';
import { SeededRandom } from '@/core/SeededRandom';
import { PALETTE } from '@/engine/materials';
import { GEO, mergeColoredParts, type ColoredPart } from './geometryUtils';

/**
 * Escenario placeholder.
 *
 * Cada tramo de suelo (suelo + bordes + decoración lateral) se fusiona en una
 * sola geometría. Se generan varias VARIANTES al iniciar y los tramos del pool
 * solo intercambian de geometría al reciclarse → 1 draw call por tramo y cero
 * asignaciones de memoria durante la partida.
 */
const L = GAME_CONFIG.world.tileLength;
const PATH_HALF = (GAME_CONFIG.lanes.count * GAME_CONFIG.lanes.width) / 2 + 0.4;

type DecorBuilder = (rng: SeededRandom, x: number, z: number) => ColoredPart[];

// --- Decoraciones -------------------------------------------------------------

const palm: DecorBuilder = (rng, x, z) => {
  const h = rng.range(4, 7);
  const lean = rng.range(-0.15, 0.15);
  const parts: ColoredPart[] = [
    { geometry: GEO.cyl6, color: PALETTE.trunk, position: [x, h / 2, z], rotation: [0, 0, lean], scale: [0.22, h, 0.22] },
  ];
  const topX = x - Math.sin(lean) * h;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rng.range(0, 0.4);
    parts.push({
      geometry: GEO.cone4,
      color: i % 2 ? PALETTE.leaf : PALETTE.leafDark,
      position: [topX + Math.cos(a) * 0.9, h - 0.15, z + Math.sin(a) * 0.9],
      rotation: [Math.sin(a) * 1.25, 0, -Math.cos(a) * 1.25],
      scale: [0.35, 2.0, 0.12],
    });
  }
  return parts;
};

const broadTree: DecorBuilder = (rng, x, z) => {
  const h = rng.range(3, 5);
  return [
    { geometry: GEO.cyl6, color: PALETTE.trunk, position: [x, h / 2, z], scale: [0.35, h, 0.35] },
    { geometry: GEO.ico, color: PALETTE.leafDark, position: [x, h + 0.6, z], scale: [rng.range(1.6, 2.4), rng.range(1.2, 1.8), rng.range(1.6, 2.4)] },
    { geometry: GEO.ico, color: PALETTE.leaf, position: [x + 0.6, h + 1.3, z - 0.3], scale: 1.1 },
  ];
};

const fern: DecorBuilder = (rng, x, z) => {
  const parts: ColoredPart[] = [];
  const n = rng.int(4, 6);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    parts.push({
      geometry: GEO.cone4, color: rng.chance(0.5) ? PALETTE.grass : PALETTE.grassDark,
      position: [x + Math.cos(a) * 0.3, 0.45, z + Math.sin(a) * 0.3],
      rotation: [Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7], scale: [0.18, 1.0, 0.08],
    });
  }
  return parts;
};

const boulder: DecorBuilder = (rng, x, z) => [
  { geometry: GEO.dodeca, color: PALETTE.rock, position: [x, 0.4, z], scale: [rng.range(0.6, 1.2), rng.range(0.5, 0.9), rng.range(0.6, 1.1)] },
  { geometry: GEO.dodeca, color: PALETTE.rockDark, position: [x + 0.7, 0.2, z + 0.3], scale: 0.35 },
];

const bones: DecorBuilder = (rng, x, z) => {
  // Costillar semienterrado + cráneo
  const parts: ColoredPart[] = [
    { geometry: GEO.cyl6, color: PALETTE.bone, position: [x, 0.12, z], rotation: [Math.PI / 2, 0, 0], scale: [0.08, 2.2, 0.08] },
    { geometry: GEO.box, color: PALETTE.bone, position: [x, 0.25, z - 1.4], scale: [0.5, 0.4, 0.7] },
    { geometry: GEO.box, color: PALETTE.black, position: [x + 0.2, 0.32, z - 1.5], scale: [0.12, 0.1, 0.15] },
  ];
  for (let i = 0; i < 4; i++) {
    const rz = z - 0.7 + i * 0.45;
    const r = rng.range(0.55, 0.75);
    parts.push({ geometry: GEO.torus, color: PALETTE.bone, position: [x, 0.05, rz], rotation: [0, 0, 0], scale: [r, r, r * 0.6] });
  }
  return parts;
};

const nest: DecorBuilder = (rng, x, z) => {
  const parts: ColoredPart[] = [
    { geometry: GEO.torus, color: PALETTE.nest, position: [x, 0.15, z], rotation: [Math.PI / 2, 0, 0], scale: [0.7, 0.7, 0.9] },
  ];
  const eggs = rng.int(2, 4);
  for (let i = 0; i < eggs; i++) {
    parts.push({
      geometry: GEO.sphere, color: PALETTE.egg,
      position: [x + rng.range(-0.25, 0.25), 0.3, z + rng.range(-0.25, 0.25)], scale: [0.2, 0.27, 0.2],
    });
  }
  return parts;
};

const lavaPool: DecorBuilder = (rng, x, z) => {
  const r = rng.range(1.2, 2.2);
  return [
    { geometry: GEO.circle, color: PALETTE.volcano, position: [x, 0.02, z], rotation: [-Math.PI / 2, 0, 0], scale: [r + 0.4, r + 0.6, 1] },
    { geometry: GEO.circle, color: PALETTE.lava, position: [x, 0.04, z], rotation: [-Math.PI / 2, 0, 0], scale: [r, r * 1.2, 1] },
    { geometry: GEO.circle, color: PALETTE.lavaGlow, position: [x + 0.2, 0.05, z], rotation: [-Math.PI / 2, 0, 0], scale: [r * 0.4, r * 0.5, 1] },
  ];
};

const liana: DecorBuilder = (rng, x, z) => {
  // Arco de liana entre dos troncos altos al borde del camino
  const h = rng.range(5, 6.5);
  return [
    { geometry: GEO.cyl6, color: PALETTE.trunk, position: [x, h / 2, z], scale: [0.3, h, 0.3] },
    { geometry: GEO.ico, color: PALETTE.leafDark, position: [x, h + 0.3, z], scale: [1.4, 0.9, 1.4] },
    { geometry: GEO.box, color: PALETTE.grassDark, position: [x - Math.sign(x) * 0.6, h - 1.2, z], rotation: [0, 0, Math.sign(x) * 0.5], scale: [0.06, 2.4, 0.06] },
  ];
};

const DECOR: Array<{ build: DecorBuilder; weight: number; near: boolean }> = [
  { build: palm, weight: 4, near: false },
  { build: broadTree, weight: 3, near: false },
  { build: fern, weight: 5, near: true },
  { build: boulder, weight: 2, near: true },
  { build: bones, weight: 1, near: true },
  { build: nest, weight: 1, near: true },
  { build: lavaPool, weight: 1, near: false },
  { build: liana, weight: 1, near: true },
];

// --- Tramos de suelo ----------------------------------------------------------

function buildTileVariant(seed: number): THREE.BufferGeometry {
  const rng = new SeededRandom(seed);
  const parts: ColoredPart[] = [
    // Camino de tierra
    { geometry: GEO.box, color: PALETTE.ground, position: [0, -0.25, -L / 2], scale: [PATH_HALF * 2, 0.5, L] },
    // Hierba a ambos lados
    { geometry: GEO.box, color: PALETTE.grass, position: [PATH_HALF + 15, -0.2, -L / 2], scale: [30, 0.5, L] },
    { geometry: GEO.box, color: PALETTE.grass, position: [-PATH_HALF - 15, -0.2, -L / 2], scale: [30, 0.5, L] },
  ];

  // Separadores de carril (huellas de tierra más oscura)
  for (let lane = 0; lane < GAME_CONFIG.lanes.count - 1; lane++) {
    const x = (laneX(lane) + laneX(lane + 1)) / 2;
    for (let z = 1; z < L; z += 2.5) {
      parts.push({ geometry: GEO.box, color: PALETTE.groundDark, position: [x, 0.005, -z], scale: [0.12, 0.02, 1.2] });
    }
  }

  // Piedras de borde del camino
  for (let z = 0.5; z < L; z += rng.range(1.2, 2.4)) {
    for (const side of [-1, 1]) {
      if (rng.chance(0.6)) {
        parts.push({
          geometry: GEO.dodeca, color: rng.chance(0.5) ? PALETTE.rock : PALETTE.rockDark,
          position: [side * (PATH_HALF + rng.range(0.1, 0.4)), 0.05, -z], scale: rng.range(0.15, 0.3),
        });
      }
    }
  }

  // Decoración lateral (más densa cerca del camino)
  for (const side of [-1, 1]) {
    let z = rng.range(0, 3);
    while (z < L - 1) {
      const decor = rng.weighted(DECOR, (d) => d.weight);
      const dist = decor.near ? rng.range(0.8, 4) : rng.range(3, 11);
      parts.push(...decor.build(rng, side * (PATH_HALF + dist), -z));
      z += rng.range(2.5, 5);
    }
  }

  return mergeColoredParts(parts);
}

export function createGroundVariants(count: number, baseSeed = 1234): THREE.BufferGeometry[] {
  return Array.from({ length: count }, (_, i) => buildTileVariant(baseSeed + i * 7919));
}

// --- Fondo lejano -------------------------------------------------------------

/**
 * Volcanes y montañas en el horizonte. No se mueven y no les afecta la
 * niebla, así siempre se ven como silueta.
 */
export function createBackdrop(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'backdrop';
  const silhouette = (color: number) => new THREE.MeshBasicMaterial({ color, fog: false });

  const mountains: Array<[number, number, number, number]> = [
    // x, z, radio, alto
    [-70, -230, 45, 55],
    [-20, -250, 40, 45],
    [55, -240, 50, 60],
    [110, -220, 35, 40],
    [-120, -210, 40, 42],
  ];
  for (const [x, z, r, h] of mountains) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 5), silhouette(0xc9a27a));
    m.position.set(x, h / 2 - 8, z);
    group.add(m);
  }

  // Volcán principal con cráter de lava
  const volcano = new THREE.Mesh(new THREE.CylinderGeometry(14, 60, 75, 7), silhouette(0x9e6b4e));
  volcano.position.set(25, 26, -200);
  const lava = new THREE.Mesh(new THREE.CylinderGeometry(13, 14, 2, 7), silhouette(PALETTE.lava));
  lava.position.set(25, 64, -200);
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(18, 8, 6),
    new THREE.MeshBasicMaterial({ color: PALETTE.lavaGlow, transparent: true, opacity: 0.25, fog: false, depthWrite: false }),
  );
  glow.position.set(25, 68, -200);
  // Columna de humo
  const smoke = new THREE.Group();
  const smokeMat = new THREE.MeshBasicMaterial({ color: 0x8a7d75, transparent: true, opacity: 0.55, fog: false, depthWrite: false });
  for (let i = 0; i < 5; i++) {
    const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(8 + i * 3, 0), smokeMat);
    puff.position.set(25 + i * 6, 76 + i * 12, -205);
    smoke.add(puff);
  }
  group.add(volcano, lava, glow, smoke);
  return group;
}
