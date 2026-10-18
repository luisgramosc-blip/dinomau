import * as THREE from 'three';
import type { ObstacleType } from '@/config/obstacles.config';
import { POWERUPS, type PowerUpType } from '@/config/powerups.config';
import { blobShadowMat, PALETTE } from '@/engine/materials';
import { GEO, mergeColoredParts, vertexColorMat, type ColoredPart } from './geometryUtils';

/**
 * Geometrías placeholder de obstáculos y coleccionables. Cada tipo se
 * construye una vez y todas las instancias del pool comparten geometría.
 * El origen está en el suelo, centrado en el carril.
 */
const builders: Record<Exclude<ObstacleType, 'pterodactyl' | 'geyser'>, () => ColoredPart[]> = {
  // Tronco caído: hay que saltarlo
  log: () => [
    { geometry: GEO.cyl8, color: PALETTE.trunk, position: [0, 0.37, 0], rotation: [0, 0, Math.PI / 2], scale: [0.37, 1.9, 0.37] },
    { geometry: GEO.cyl8, color: 0xc89a5e, position: [0.96, 0.37, 0], rotation: [0, 0, Math.PI / 2], scale: [0.3, 0.03, 0.3] },
    { geometry: GEO.cyl8, color: 0xc89a5e, position: [-0.96, 0.37, 0], rotation: [0, 0, Math.PI / 2], scale: [0.3, 0.03, 0.3] },
    // Musgo y una ramita
    { geometry: GEO.ico, color: PALETTE.grass, position: [0.3, 0.7, 0.05], scale: [0.35, 0.1, 0.25] },
    { geometry: GEO.cone4, color: PALETTE.trunk, position: [-0.45, 0.85, 0], rotation: [0, 0, 0.5], scale: [0.06, 0.5, 0.06] },
  ],

  // Rama baja con lianas: hay que agacharse
  lowBranch: () => {
    const parts: ColoredPart[] = [
      { geometry: GEO.cyl6, color: PALETTE.trunk, position: [0, 1.45, 0], rotation: [0, 0, Math.PI / 2], scale: [0.2, 2.3, 0.2] },
      { geometry: GEO.cyl6, color: PALETTE.trunk, position: [1.12, 1.4, 0], scale: [0.16, 2.8, 0.16] },
      { geometry: GEO.cyl6, color: PALETTE.trunk, position: [-1.12, 1.4, 0], scale: [0.16, 2.8, 0.16] },
      { geometry: GEO.ico, color: PALETTE.leaf, position: [0.5, 1.75, 0], scale: [0.55, 0.3, 0.4] },
      { geometry: GEO.ico, color: PALETTE.leafDark, position: [-0.55, 1.7, 0.05], scale: [0.5, 0.28, 0.4] },
    ];
    // Lianas colgando (terminan por encima de la altura de rodar)
    for (const x of [-0.75, -0.25, 0.3, 0.8]) {
      parts.push({ geometry: GEO.box, color: PALETTE.grassDark, position: [x, 1.18, 0], scale: [0.05, 0.5, 0.05] });
      parts.push({ geometry: GEO.cone4, color: PALETTE.leaf, position: [x, 0.92, 0], rotation: [Math.PI, 0, 0], scale: [0.1, 0.18, 0.1] });
    }
    return parts;
  },

  // Roca grande: esquivar cambiando de carril
  rock: () => [
    { geometry: GEO.dodeca, color: PALETTE.rock, position: [0, 1.2, 0], scale: [0.85, 1.3, 0.8] },
    { geometry: GEO.dodeca, color: PALETTE.rockDark, position: [0.55, 0.35, 0.3], scale: [0.4, 0.35, 0.4] },
    { geometry: GEO.dodeca, color: PALETTE.rockDark, position: [-0.5, 0.25, -0.35], scale: [0.3, 0.25, 0.3] },
    { geometry: GEO.ico, color: PALETTE.grass, position: [0.1, 2.35, 0.1], scale: [0.35, 0.12, 0.3] },
  ],

  // Pieza de río (una por carril; tres juntas forman el cruce completo)
  river: () => [
    { geometry: GEO.box, color: 0x2f8fcf, position: [0, 0.02, 0], scale: [2.26, 0.05, 2.6] },
    { geometry: GEO.box, color: 0x58b4e8, position: [0, 0.035, 0], scale: [2.26, 0.04, 1.4] },
    // Espuma en las orillas
    { geometry: GEO.box, color: 0xe6f6ff, position: [0, 0.05, 1.3], scale: [2.26, 0.03, 0.18] },
    { geometry: GEO.box, color: 0xe6f6ff, position: [0, 0.05, -1.3], scale: [2.26, 0.03, 0.18] },
    // Reflejos
    { geometry: GEO.box, color: 0xbfe6ff, position: [-0.5, 0.06, 0.3], scale: [0.5, 0.02, 0.08] },
    { geometry: GEO.box, color: 0xbfe6ff, position: [0.6, 0.06, -0.4], scale: [0.35, 0.02, 0.08] },
  ],

  // Árbol en medio del camino: esquivar
  tree: () => [
    { geometry: GEO.cyl6, color: PALETTE.trunk, position: [0, 1.6, 0], scale: [0.5, 3.2, 0.5] },
    { geometry: GEO.cone5, color: PALETTE.trunk, position: [0, 0.25, 0], scale: [0.85, 0.5, 0.85] },
    { geometry: GEO.ico, color: PALETTE.leafDark, position: [0, 3.9, 0], scale: [1.6, 1.1, 1.5] },
    { geometry: GEO.ico, color: PALETTE.leaf, position: [0.5, 4.5, 0.3], scale: [1.0, 0.8, 1.0] },
    { geometry: GEO.ico, color: PALETTE.leaf, position: [-0.6, 4.2, -0.3], scale: [0.9, 0.7, 0.9] },
  ],
};

const geometryCache = new Map<string, THREE.BufferGeometry>();

function cachedGeometry(key: string, build: () => ColoredPart[]): THREE.BufferGeometry {
  let geo = geometryCache.get(key);
  if (!geo) {
    geo = mergeColoredParts(build());
    geometryCache.set(key, geo);
  }
  return geo;
}

type StaticObstacle = Exclude<ObstacleType, 'pterodactyl' | 'geyser'>;

export function createObstacleMesh(type: ObstacleType): THREE.Object3D {
  if (type === 'pterodactyl') return createPterodactyl();
  if (type === 'geyser') return createGeyser();
  const mesh = new THREE.Mesh(cachedGeometry(type, builders[type as StaticObstacle]), vertexColorMat());
  mesh.name = `obstacle-${type}`;
  return mesh;
}

/**
 * Pterodáctilo: cuerpo + dos alas con pivote en el hombro (se animan en
 * obstacleBehaviors). Mira hacia +Z (viene de frente hacia el jugador).
 */
function createPterodactyl(): THREE.Object3D {
  const mat = vertexColorMat();
  const body = cachedGeometry('ptero-body', () => [
    { geometry: GEO.ico, color: 0x8e5a9c, position: [0, 0, 0], scale: [0.3, 0.28, 0.75] },
    { geometry: GEO.ico, color: 0xd9c3e0, position: [0, -0.1, 0.05], scale: [0.22, 0.16, 0.55] },
    // Cabeza con pico largo y cresta hacia atrás
    { geometry: GEO.box, color: 0x8e5a9c, position: [0, 0.18, 0.75], scale: [0.26, 0.24, 0.32] },
    { geometry: GEO.cone4, color: 0xf2b134, position: [0, 0.14, 1.15], rotation: [Math.PI / 2, 0, 0], scale: [0.09, 0.55, 0.07] },
    { geometry: GEO.cone4, color: 0xe0603a, position: [0, 0.38, 0.45], rotation: [-2.2, 0, 0], scale: [0.06, 0.5, 0.05] },
    { geometry: GEO.box, color: PALETTE.white, position: [0.13, 0.24, 0.85], scale: [0.04, 0.08, 0.08] },
    { geometry: GEO.box, color: PALETTE.white, position: [-0.13, 0.24, 0.85], scale: [0.04, 0.08, 0.08] },
    { geometry: GEO.box, color: PALETTE.black, position: [0.15, 0.24, 0.87], scale: [0.02, 0.05, 0.04] },
    { geometry: GEO.box, color: PALETTE.black, position: [-0.15, 0.24, 0.87], scale: [0.02, 0.05, 0.04] },
    // Patas colgando
    { geometry: GEO.box, color: 0xf2b134, position: [0.1, -0.3, -0.35], scale: [0.05, 0.25, 0.05] },
    { geometry: GEO.box, color: 0xf2b134, position: [-0.1, -0.3, -0.35], scale: [0.05, 0.25, 0.05] },
  ]);
  const wing = cachedGeometry('ptero-wing', () => [
    // Membrana triangular (cono de 3 caras aplastado) que sale hacia +X
    { geometry: GEO.cone4, color: 0xb07cc0, position: [0.75, 0, -0.05], rotation: [0, 0, -Math.PI / 2], scale: [0.05, 1.5, 0.55] },
    { geometry: GEO.box, color: 0x6e3f7c, position: [0.75, 0.04, 0.3], scale: [1.5, 0.06, 0.08] },
  ]);

  const root = new THREE.Group();
  root.name = 'obstacle-pterodactyl';
  const flier = new THREE.Group();
  flier.name = 'flier';
  flier.add(new THREE.Mesh(body, mat));
  const wingR = new THREE.Mesh(wing, mat);
  wingR.name = 'wingR';
  wingR.position.set(0.2, 0.1, 0);
  const wingL = new THREE.Mesh(wing, mat);
  wingL.name = 'wingL';
  wingL.position.set(-0.2, 0.1, 0);
  wingL.scale.x = -1;
  flier.add(wingR, wingL);
  root.add(flier);

  // Sombra en el suelo para leer su carril aunque vuele alto
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.8, 10), blobShadowMat());
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.03;
  shadow.scale.set(1.4, 0.7, 1);
  shadow.name = 'shadow';
  root.add(shadow);
  return root;
}

let steamMaterial: THREE.MeshLambertMaterial | undefined;

/** Géiser: boca de roca + columna de vapor (se anima en obstacleBehaviors). */
function createGeyser(): THREE.Object3D {
  const root = new THREE.Group();
  root.name = 'obstacle-geyser';
  const vent = cachedGeometry('geyser-vent', () => {
    const parts: ColoredPart[] = [
      { geometry: GEO.cyl8, color: PALETTE.rockDark, position: [0, 0.18, 0], scale: [0.75, 0.36, 0.75] },
      { geometry: GEO.cyl8, color: 0x3d2a20, position: [0, 0.37, 0], scale: [0.45, 0.02, 0.45] },
      { geometry: GEO.circle, color: 0xc9a86a, position: [0, 0.02, 0], rotation: [-Math.PI / 2, 0, 0], scale: [1.15, 1.15, 1] },
    ];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      parts.push({
        geometry: GEO.dodeca, color: PALETTE.rock,
        position: [Math.cos(a) * 0.75, 0.2, Math.sin(a) * 0.75], scale: 0.22 + (i % 2) * 0.08,
      });
    }
    return parts;
  });
  root.add(new THREE.Mesh(vent, vertexColorMat()));

  steamMaterial ??= new THREE.MeshLambertMaterial({
    color: 0xf4f1ec, emissive: 0xffffff, emissiveIntensity: 0.25,
    transparent: true, opacity: 0.8, flatShading: true, depthWrite: false,
  });
  const steam = new THREE.Group();
  steam.name = 'steam';
  const puffGeo = new THREE.IcosahedronGeometry(0.55, 0);
  for (let i = 0; i < 6; i++) {
    const puff = new THREE.Mesh(puffGeo, steamMaterial);
    puff.position.y = 0.6 + i * 0.8;
    puff.scale.setScalar(0.8 + i * 0.18);
    steam.add(puff);
  }
  steam.position.y = 0.3;
  root.add(steam);
  return root;
}

// --- Power-ups ----------------------------------------------------------------

const powerUpBuilders: Record<PowerUpType, () => ColoredPart[]> = {
  // Imán en U rojo con puntas plateadas
  magnet: () => [
    { geometry: GEO.torus, color: POWERUPS.magnet.color, position: [0, 0.1, 0], rotation: [0, 0, Math.PI], scale: [0.32, 0.32, 0.5] },
    { geometry: GEO.box, color: POWERUPS.magnet.color, position: [0.32, -0.1, 0], scale: [0.18, 0.4, 0.18] },
    { geometry: GEO.box, color: POWERUPS.magnet.color, position: [-0.32, -0.1, 0], scale: [0.18, 0.4, 0.18] },
    { geometry: GEO.box, color: 0xdfe6ea, position: [0.32, -0.37, 0], scale: [0.19, 0.14, 0.19] },
    { geometry: GEO.box, color: 0xdfe6ea, position: [-0.32, -0.37, 0], scale: [0.19, 0.14, 0.19] },
  ],
  // Gema de ámbar (con un mosquito dentro, claro)
  shield: () => [
    { geometry: GEO.dodeca, color: POWERUPS.shield.color, scale: [0.4, 0.5, 0.4] },
    { geometry: GEO.box, color: 0x4a2a10, position: [0, 0, 0.3], scale: [0.08, 0.05, 0.05] },
  ],
  // Diamante morado con dos monedas pequeñas
  multiplier: () => [
    { geometry: GEO.cone4, color: POWERUPS.multiplier.color, position: [0, 0.18, 0], scale: [0.36, 0.36, 0.36] },
    { geometry: GEO.cone4, color: 0x7a3db0, position: [0, -0.18, 0], rotation: [Math.PI, 0, 0], scale: [0.36, 0.36, 0.36] },
    { geometry: GEO.cyl8, color: PALETTE.coin, position: [0.45, -0.1, 0], rotation: [Math.PI / 2, 0, 0], scale: [0.16, 0.05, 0.16] },
    { geometry: GEO.cyl8, color: PALETTE.coin, position: [-0.45, -0.1, 0], rotation: [Math.PI / 2, 0, 0], scale: [0.16, 0.05, 0.16] },
  ],
  // Muelle azul con flecha hacia arriba
  superJump: () => [
    { geometry: GEO.torus, color: POWERUPS.superJump.color, position: [0, -0.3, 0], rotation: [Math.PI / 2, 0, 0], scale: [0.28, 0.28, 0.4] },
    { geometry: GEO.torus, color: POWERUPS.superJump.color, position: [0, -0.12, 0], rotation: [Math.PI / 2, 0, 0], scale: [0.28, 0.28, 0.4] },
    { geometry: GEO.cone4, color: 0x9fe3ff, position: [0, 0.3, 0], rotation: [0, Math.PI / 4, 0], scale: [0.3, 0.45, 0.3] },
  ],
};

let haloMaterial: THREE.MeshBasicMaterial | undefined;

/** Power-up flotante con halo para distinguirlo de las monedas. */
export function createPowerUpMesh(type: PowerUpType): THREE.Object3D {
  const root = new THREE.Group();
  root.name = `powerup-${type}`;
  const item = new THREE.Mesh(cachedGeometry(`powerup-${type}`, powerUpBuilders[type]), vertexColorMat());
  item.name = 'item';
  haloMaterial ??= new THREE.MeshBasicMaterial({ color: 0xfff4c2, transparent: true, opacity: 0.35, depthWrite: false });
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.05, 4, 20), haloMaterial);
  halo.name = 'halo';
  root.add(item, halo);
  return root;
}

// --- Monedas ------------------------------------------------------------------

let coinGeometry: THREE.BufferGeometry | undefined;
let coinMaterial: THREE.MeshLambertMaterial | undefined;

/** Moneda de ámbar dorado con una huella de dino en relieve. */
export function createCoinMesh(radius: number): THREE.Mesh {
  coinGeometry ??= mergeColoredParts([
    { geometry: GEO.cyl8, color: PALETTE.coinEdge, rotation: [Math.PI / 2, 0, 0], scale: [radius, 0.1, radius] },
    { geometry: GEO.cyl8, color: PALETTE.coin, rotation: [Math.PI / 2, 0, 0], scale: [radius * 0.78, 0.13, radius * 0.78] },
    // Huella: talón + tres dedos
    { geometry: GEO.box, color: PALETTE.coinEdge, position: [0, -0.06, 0.07], scale: [0.12, 0.12, 0.02] },
    { geometry: GEO.box, color: PALETTE.coinEdge, position: [0, 0.1, 0.07], rotation: [0, 0, 0], scale: [0.05, 0.16, 0.02] },
    { geometry: GEO.box, color: PALETTE.coinEdge, position: [0.08, 0.08, 0.07], rotation: [0, 0, -0.5], scale: [0.05, 0.15, 0.02] },
    { geometry: GEO.box, color: PALETTE.coinEdge, position: [-0.08, 0.08, 0.07], rotation: [0, 0, 0.5], scale: [0.05, 0.15, 0.02] },
  ]);
  coinMaterial ??= new THREE.MeshLambertMaterial({
    vertexColors: true,
    flatShading: true,
    emissive: 0xffa000,
    emissiveIntensity: 0.35,
  });
  const mesh = new THREE.Mesh(coinGeometry, coinMaterial);
  mesh.name = 'coin';
  return mesh;
}
