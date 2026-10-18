import type * as THREE from 'three';
import { OBSTACLES, type ObstacleDefinition, type ObstacleType } from '@/config/obstacles.config';
import { createAABB, setBox, type AABB } from '../systems/CollisionSystem';
import { OBSTACLE_BEHAVIORS, type ObstacleBehavior } from './obstacleBehaviors';

/** Obstáculo reutilizable (vive en un ObjectPool por tipo). */
export class Obstacle {
  readonly def: ObstacleDefinition;
  readonly box: AABB = createAABB();
  private readonly behavior?: ObstacleBehavior;
  lane = 0;
  /** Distancia absoluta en metros desde el inicio de la partida. */
  d = 0;
  /** Tras un choque lateral o un escudo se ignora para no golpear dos veces. */
  ignoreCollisions = false;
  /** Falso cuando el obstáculo es inofensivo en este momento (p. ej. géiser en reposo). */
  harmful = true;
  /** Aturdido por un rugido: momento (tiempo de partida) en que ocurrió, o -1. */
  stunnedAt = -1;

  constructor(
    readonly type: ObstacleType,
    readonly object: THREE.Object3D,
  ) {
    this.def = OBSTACLES[type];
    this.behavior = OBSTACLE_BEHAVIORS[type];
  }

  /** Coloca el obstáculo y ejecuta su comportamiento (si tiene). */
  place(x: number, z: number, time = 0): void {
    this.object.position.set(x, 0, z);
    setBox(this.box, x, z, this.def.hitbox);
    this.behavior?.(this, time, z);
  }

  reset(): void {
    this.ignoreCollisions = false;
    this.harmful = true;
    this.stunnedAt = -1;
    this.object.rotation.set(0, 0, 0);
  }
}
