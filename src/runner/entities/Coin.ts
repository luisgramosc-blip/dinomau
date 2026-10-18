import type * as THREE from 'three';

/** Moneda reutilizable. Al recogerla vuela hacia arriba y se encoge. */
export class Coin {
  lane = 0;
  d = 0;
  y = 0;
  collected = false;
  /** Atraída por el imán: ya no sigue al mundo, vuela hacia el jugador. */
  attracted = false;
  /** Tiempo de la animación de recogida. */
  collectTimer = 0;

  constructor(readonly object: THREE.Object3D) {}

  reset(): void {
    this.collected = false;
    this.attracted = false;
    this.collectTimer = 0;
    this.object.scale.setScalar(1);
  }
}
