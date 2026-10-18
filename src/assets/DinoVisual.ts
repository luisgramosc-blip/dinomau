import * as THREE from 'three';
import type { DinoRig } from './placeholders/dinoPlaceholder';

export type DinoAnimState = 'idle' | 'run' | 'jump' | 'roll' | 'hit';

/**
 * Representación visual de un dino, independiente de si viene de un GLB o de
 * un placeholder. El jugador solo conoce esta interfaz.
 */
export interface DinoVisual {
  readonly root: THREE.Object3D;
  setState(state: DinoAnimState): void;
  /** `pace` ≈ velocidad relativa (1 = velocidad inicial) para acelerar la carrera. */
  update(dt: number, pace: number): void;
}

/** Animación procedural del placeholder (sin clips). */
export class PlaceholderDinoVisual implements DinoVisual {
  readonly root: THREE.Object3D;
  private state: DinoAnimState = 'idle';
  private t = 0;
  private stateTime = 0;

  constructor(private readonly rig: DinoRig) {
    this.root = rig.root;
  }

  setState(state: DinoAnimState): void {
    if (state === this.state) return;
    this.state = state;
    this.stateTime = 0;
  }

  update(dt: number, pace: number): void {
    this.t += dt;
    this.stateTime += dt;
    const { body, head, tail, legL, legR, armL, armR } = this.rig;
    const freq = 11 * Math.min(pace, 1.8);

    // Valores por defecto (se sobreescriben por estado)
    body.rotation.set(0, 0, 0);
    body.position.set(0, 0, 0);
    body.scale.set(1, 1, 1);

    switch (this.state) {
      case 'run': {
        const s = Math.sin(this.t * freq);
        legL.rotation.x = s * 0.9;
        legR.rotation.x = -s * 0.9;
        armL.rotation.x = -s * 0.5;
        armR.rotation.x = s * 0.5;
        body.position.y = Math.abs(Math.cos(this.t * freq)) * 0.08;
        body.rotation.x = -0.12;
        tail.rotation.y = Math.sin(this.t * freq * 0.5) * 0.25;
        tail.rotation.x = 0.1;
        head.rotation.x = Math.sin(this.t * freq) * 0.06;
        break;
      }
      case 'jump': {
        legL.rotation.x = -0.6;
        legR.rotation.x = -0.4;
        armL.rotation.x = armR.rotation.x = -0.8;
        tail.rotation.x = -0.35;
        body.rotation.x = -0.2;
        break;
      }
      case 'roll': {
        // Hecho bola: aplastado y girando sobre sí mismo
        body.scale.set(1.05, 0.55, 1);
        body.position.y = 0.05;
        body.rotation.x = -this.stateTime * 16;
        legL.rotation.x = legR.rotation.x = -1.2;
        tail.rotation.x = -0.9;
        break;
      }
      case 'hit': {
        body.rotation.z = Math.min(this.stateTime * 6, 1.4);
        body.rotation.x = 0.3;
        legL.rotation.x = 0.8;
        legR.rotation.x = -0.4;
        break;
      }
      case 'idle':
      default: {
        const b = Math.sin(this.t * 2.5);
        body.position.y = b * 0.02;
        tail.rotation.y = b * 0.15;
        head.rotation.x = Math.sin(this.t * 1.3) * 0.08;
        legL.rotation.x = legR.rotation.x = 0;
        armL.rotation.x = armR.rotation.x = 0;
      }
    }
  }
}

/**
 * Dino desde un GLB con clips de animación. Los clips deben llamarse como los
 * estados: run, jump, roll, hit, idle.
 */
export class GltfDinoVisual implements DinoVisual {
  readonly root: THREE.Object3D;
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private current?: THREE.AnimationAction;

  constructor(scene: THREE.Object3D, clips: THREE.AnimationClip[]) {
    this.root = scene;
    this.mixer = new THREE.AnimationMixer(scene);
    for (const clip of clips) this.actions.set(clip.name.toLowerCase(), this.mixer.clipAction(clip));
    this.setState('idle');
  }

  setState(state: DinoAnimState): void {
    const next = this.actions.get(state) ?? this.actions.get('run');
    if (!next || next === this.current) return;
    next.reset().fadeIn(0.12).play();
    if (state === 'hit') next.setLoop(THREE.LoopOnce, 1).clampWhenFinished = true;
    this.current?.fadeOut(0.12);
    this.current = next;
  }

  update(dt: number, pace: number): void {
    this.mixer.timeScale = Math.min(pace, 1.8);
    this.mixer.update(dt);
  }
}
