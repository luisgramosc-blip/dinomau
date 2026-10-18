import * as THREE from 'three';
import { GAME_CONFIG } from '@/config/game.config';
import { SeededRandom } from '@/core/SeededRandom';
import { createGroundVariants } from '@/assets/placeholders/environmentPlaceholders';
import { vertexColorMat } from '@/assets/placeholders/geometryUtils';

const L = GAME_CONFIG.world.tileLength;
const VARIANTS = 8;

/**
 * Cinta infinita de tramos de suelo. Hay los tramos justos para cubrir la
 * vista; el que queda detrás de la cámara salta al frente con otra variante
 * (y a veces en espejo) para que no se note la repetición.
 */
export class GroundSystem {
  readonly group = new THREE.Group();
  private readonly tiles: Array<{ mesh: THREE.Mesh; d: number }> = [];
  private readonly variants: THREE.BufferGeometry[];
  private readonly rng: SeededRandom;
  private nextD = 0;

  constructor(seed: number) {
    this.rng = new SeededRandom(seed);
    this.variants = createGroundVariants(VARIANTS);
    this.group.name = 'ground';
    const count = Math.ceil((GAME_CONFIG.render.fogFar + GAME_CONFIG.world.despawnZ) / L) + 1;
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(this.variants[0], vertexColorMat());
      mesh.matrixAutoUpdate = true;
      this.group.add(mesh);
      this.tiles.push({ mesh, d: 0 });
    }
    this.reset();
  }

  reset(): void {
    this.nextD = -GAME_CONFIG.world.despawnZ;
    for (const tile of this.tiles) this.recycle(tile);
  }

  private recycle(tile: { mesh: THREE.Mesh; d: number }): void {
    tile.d = this.nextD;
    this.nextD += L;
    tile.mesh.geometry = this.rng.pick(this.variants);
    tile.mesh.scale.x = this.rng.chance(0.5) ? 1 : -1;
  }

  /** @param distance distancia recorrida por el jugador */
  update(distance: number): void {
    for (const tile of this.tiles) {
      // La parte trasera del tramo (z local 0) está en d
      const z = distance - tile.d;
      if (z - L > GAME_CONFIG.world.despawnZ) this.recycle(tile);
      tile.mesh.position.z = distance - tile.d;
    }
  }
}
