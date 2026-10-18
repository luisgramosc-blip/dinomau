import type * as THREE from 'three';
import type { PowerUpType } from '@/config/powerups.config';

/** Power-up recogible en la pista (vive en un ObjectPool por tipo). */
export class PowerUp {
  lane = 0;
  d = 0;
  collected = false;

  constructor(
    readonly type: PowerUpType,
    readonly object: THREE.Object3D,
  ) {}

  /** Flota y gira; el halo mira siempre a cámara (gira solo el objeto interior). */
  animate(time: number): void {
    const item = this.object.children[0];
    if (item) {
      item.rotation.y = time * 2.5;
      item.position.y = Math.sin(time * 3 + this.d) * 0.12;
    }
    const halo = this.object.children[1];
    if (halo) halo.scale.setScalar(1 + Math.sin(time * 5) * 0.08);
  }
}
