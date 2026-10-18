import * as THREE from 'three';
import { GAME_CONFIG } from '@/config/game.config';
import { PALETTE } from './materials';

/**
 * Iluminación cálida de atardecer jurásico + niebla que oculta el punto donde
 * aparecen los objetos. Sin shadow maps (se usan sombras falsas).
 */
export function setupLighting(scene: THREE.Scene): void {
  scene.background = createSkyTexture();
  scene.fog = new THREE.Fog(PALETTE.fog, GAME_CONFIG.render.fogNear, GAME_CONFIG.render.fogFar);

  const hemi = new THREE.HemisphereLight(0xfff1d6, 0x6a8a3a, 1.6);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffe0b0, 1.8);
  sun.position.set(-6, 12, 6);
  scene.add(sun);
}

/** Degradado vertical de cielo dibujado en un canvas de 2×256 px. */
function createSkyTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#7cc6e0');
  g.addColorStop(0.55, '#f6d6a0');
  g.addColorStop(1, '#f2c590');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 2, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
