import * as THREE from 'three';

/**
 * Paleta del juego (selva, volcán, tierra) y caché de materiales.
 * Compartir materiales reduce cambios de estado en la GPU: cada color se crea
 * una sola vez.
 */
export const PALETTE = {
  sky: 0xf7c88a,
  skyTop: 0x8fd3e8,
  fog: 0xf2c590,
  ground: 0xb8864b,
  groundDark: 0x9a6d3a,
  laneLine: 0xd9ad6a,
  grass: 0x5da93a,
  grassDark: 0x3f8a2a,
  leaf: 0x48a23a,
  leafDark: 0x2e7a2a,
  trunk: 0x7a4a26,
  rock: 0x8c857a,
  rockDark: 0x6b655c,
  bone: 0xf1e7cf,
  lava: 0xff6a1a,
  lavaGlow: 0xffb13b,
  volcano: 0x5a3b2e,
  nest: 0xa47a43,
  egg: 0xf5efdc,
  coin: 0xffcc2e,
  coinEdge: 0xe0a100,
  white: 0xffffff,
  black: 0x1c1410,
  shadow: 0x000000,
} as const;

const cache = new Map<string, THREE.Material>();

/** Material low-poly de sombreado plano. */
export function flatMat(color: number): THREE.MeshLambertMaterial {
  const key = `flat:${color}`;
  let m = cache.get(key) as THREE.MeshLambertMaterial | undefined;
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, flatShading: true });
    cache.set(key, m);
  }
  return m;
}

/** Material que emite luz propia (lava, monedas). No le afecta la iluminación. */
export function glowMat(color: number, emissive = color, intensity = 0.6): THREE.MeshLambertMaterial {
  const key = `glow:${color}:${emissive}:${intensity}`;
  let m = cache.get(key) as THREE.MeshLambertMaterial | undefined;
  if (!m) {
    m = new THREE.MeshLambertMaterial({
      color,
      emissive,
      emissiveIntensity: intensity,
      flatShading: true,
    });
    cache.set(key, m);
  }
  return m;
}

/** Sombra circular falsa (mucho más barata que shadow maps). */
export function blobShadowMat(): THREE.MeshBasicMaterial {
  const key = 'blob-shadow';
  let m = cache.get(key) as THREE.MeshBasicMaterial | undefined;
  if (!m) {
    m = new THREE.MeshBasicMaterial({
      color: PALETTE.shadow,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    });
    cache.set(key, m);
  }
  return m;
}
