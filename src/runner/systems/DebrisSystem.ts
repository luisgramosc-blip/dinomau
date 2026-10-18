import * as THREE from 'three';
import { GEO, mergeColoredParts, vertexColorMat } from '@/assets/placeholders/geometryUtils';
import { PALETTE } from '@/engine/materials';

const PIECES = 14;
const LIFETIME = 0.9;
const GRAVITY = 30;

/**
 * Trozos que salen volando al romper una roca (Triceratops). Un único grupo de
 * piezas pre-creadas que se reutiliza: romper otra roca reinicia la explosión.
 */
export class DebrisSystem {
  readonly group = new THREE.Group();
  private readonly pieces: Array<{ mesh: THREE.Mesh; v: THREE.Vector3; spin: THREE.Vector3 }> = [];
  private time = LIFETIME;

  constructor() {
    const geo = mergeColoredParts([{ geometry: GEO.dodeca, color: PALETTE.rock, scale: 0.28 }]);
    for (let i = 0; i < PIECES; i++) {
      const mesh = new THREE.Mesh(geo, vertexColorMat());
      mesh.visible = false;
      this.group.add(mesh);
      this.pieces.push({ mesh, v: new THREE.Vector3(), spin: new THREE.Vector3() });
    }
    this.group.name = 'debris';
  }

  burst(x: number, y: number, z: number): void {
    this.time = 0;
    for (const p of this.pieces) {
      p.mesh.position.set(x + (Math.random() - 0.5), y + Math.random(), z);
      p.mesh.scale.setScalar(0.6 + Math.random() * 0.9);
      p.mesh.visible = true;
      p.v.set((Math.random() - 0.5) * 10, 4 + Math.random() * 7, -2 - Math.random() * 6);
      p.spin.set(Math.random() * 10, Math.random() * 10, Math.random() * 10);
    }
  }

  /** @param worldSpeed los trozos también se alejan con el mundo */
  update(dt: number, worldSpeed: number): void {
    if (this.time >= LIFETIME) return;
    this.time += dt;
    const done = this.time >= LIFETIME;
    for (const p of this.pieces) {
      if (done) {
        p.mesh.visible = false;
        continue;
      }
      p.v.y -= GRAVITY * dt;
      p.mesh.position.x += p.v.x * dt;
      p.mesh.position.y = Math.max(0.1, p.mesh.position.y + p.v.y * dt);
      p.mesh.position.z += (p.v.z + worldSpeed) * dt;
      p.mesh.rotation.x += p.spin.x * dt;
      p.mesh.rotation.y += p.spin.y * dt;
    }
  }

  reset(): void {
    this.time = LIFETIME;
    for (const p of this.pieces) p.mesh.visible = false;
  }
}
