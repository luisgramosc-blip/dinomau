import * as THREE from 'three';
import { GAME_CONFIG } from '@/config/game.config';

const CAM = GAME_CONFIG.camera;

/**
 * Cámara en tercera persona detrás del dino. Sigue suavemente la X y la
 * altura del jugador, y ajusta el FOV para que en pantallas verticales
 * (móvil) se vean siempre los tres carriles.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  private readonly lookTarget = new THREE.Vector3();
  private shakeTime = 0;
  private shakeStrength = 0;

  constructor() {
    this.camera = new THREE.PerspectiveCamera(CAM.baseFov, 1, 0.1, 400);
    this.camera.position.set(0, CAM.height, CAM.distance);
    this.lookTarget.set(0, CAM.lookHeight, -CAM.lookAhead);
    this.camera.lookAt(this.lookTarget);
  }

  resize(width: number, height: number): void {
    const aspect = width / Math.max(height, 1);
    this.camera.aspect = aspect;
    // FOV vertical necesario para garantizar el FOV horizontal mínimo
    const minH = THREE.MathUtils.degToRad(CAM.minHorizontalFov);
    const neededV = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(minH / 2) / aspect));
    this.camera.fov = THREE.MathUtils.clamp(Math.max(CAM.baseFov, neededV), CAM.baseFov, CAM.maxFov);
    this.camera.updateProjectionMatrix();
  }

  /** Sacudida al chocar. */
  shake(strength = 0.35, duration = 0.35): void {
    this.shakeStrength = strength;
    this.shakeTime = duration;
  }

  update(dt: number, playerX: number, playerY: number): void {
    const k = 1 - Math.exp(-CAM.followLerp * dt);
    const pos = this.camera.position;
    pos.x += (playerX * 0.75 - pos.x) * k;
    pos.y += (CAM.height + playerY * 0.35 - pos.y) * k;
    pos.z = CAM.distance;

    this.lookTarget.x += (playerX * 0.6 - this.lookTarget.x) * k;
    this.lookTarget.y += (CAM.lookHeight + playerY * 0.25 - this.lookTarget.y) * k;

    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      const s = this.shakeStrength * Math.max(this.shakeTime, 0) * 3;
      pos.x += (Math.random() - 0.5) * s;
      pos.y += (Math.random() - 0.5) * s;
    }
    this.camera.lookAt(this.lookTarget);
  }

  reset(): void {
    this.camera.position.set(0, CAM.height, CAM.distance);
    this.lookTarget.set(0, CAM.lookHeight, -CAM.lookAhead);
    this.shakeTime = 0;
    this.camera.lookAt(this.lookTarget);
  }
}
