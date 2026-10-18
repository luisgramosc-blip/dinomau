import * as THREE from 'three';
import type { AssetLoader } from '@/assets/AssetLoader';
import type { DinoVisual } from '@/assets/DinoVisual';
import { GEO, mergeColoredParts, vertexColorMat, type ColoredPart } from '@/assets/placeholders/geometryUtils';
import type { DinoDefinition, DinoId } from '@/config/dinos.config';
import type { RivalDefinition } from '@/config/rivals.config';
import { events } from '@/core/EventBus';
import type { Renderable, Updatable } from '@/core/Game';
import { SeededRandom } from '@/core/SeededRandom';
import { blobShadowMat, PALETTE } from '@/engine/materials';
import type { Renderer } from '@/engine/Renderer';
import type { InputManager } from '@/input/InputManager';
import { BattleController, type BattleResult, type BattleSetup } from './BattleController';

const PLAYER_X = -1.6;
const RIVAL_X = 1.6;

/** Animación simple tipo "muelle" para embestidas y retrocesos. */
class Spring {
  value = 0;
  private velocity = 0;
  kick(v: number): void {
    this.velocity += v;
  }
  update(dt: number, stiffness = 120, damping = 14): void {
    this.velocity += (-stiffness * this.value - damping * this.velocity) * dt;
    this.value += this.velocity * dt;
  }
  reset(): void {
    this.value = this.velocity = 0;
  }
}

interface Fighter {
  visual: DinoVisual;
  holder: THREE.Group;
  lunge: Spring;
  hop: Spring;
  flash: number;
}

/**
 * Escena de batalla: arena volcánica con el dino del jugador (izquierda) y
 * el rival (derecha). Conduce al BattleController con la entrada del jugador
 * y anima a los luchadores según sus eventos.
 */
export class BattleScene implements Updatable, Renderable {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
  private controller?: BattleController;
  private player?: Fighter;
  private rival?: Fighter;
  private readonly playerVisuals = new Map<DinoId, DinoVisual>();
  private readonly rivalVisuals = new Map<string, DinoVisual>();
  private shake = 0;
  private onClose?: (result: BattleResult) => void;
  private readonly unsubscribe: Array<() => void> = [];

  constructor(
    private readonly renderer: Renderer,
    private readonly assets: AssetLoader,
    input: InputManager,
    tapTarget: HTMLElement,
  ) {
    this.buildArena();
    renderer.onResize((w, h) => this.resize(w, h));

    // Toques (atacar) y swipes/teclas (esquivar)
    tapTarget.addEventListener('pointerdown', () => this.controller?.tap());
    window.addEventListener('keydown', (e) => {
      if (!this.controller) return;
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        if (this.controller.canClose) this.close();
        else this.controller.tap();
      }
    });
    input.onAction((action) => {
      const c = this.controller;
      if (!c || action === 'pause') return;
      c.dodge(action);
    });
  }

  private buildArena(): void {
    this.scene.background = new THREE.Color(0x5a2e1e);
    this.scene.fog = new THREE.Fog(0x5a2e1e, 14, 40);
    this.scene.add(new THREE.HemisphereLight(0xffd9b0, 0x4a2a1a, 1.6));
    const sun = new THREE.DirectionalLight(0xffc080, 2);
    sun.position.set(-3, 8, 6);
    const lavaLight = new THREE.PointLight(0xff6a1a, 30, 18);
    lavaLight.position.set(0, 1.5, -4);
    this.scene.add(sun, lavaLight);

    const rng = new SeededRandom(7);
    const parts: ColoredPart[] = [
      { geometry: GEO.cyl8, color: PALETTE.groundDark, position: [0, -0.25, 0], scale: [9, 0.5, 6] },
      { geometry: GEO.cyl8, color: PALETTE.ground, position: [0, 0.01, 0], scale: [6.5, 0.02, 4] },
    ];
    // Grietas de lava y rocas alrededor del claro
    for (let i = 0; i < 7; i++) {
      parts.push({
        geometry: GEO.box, color: PALETTE.lava,
        position: [rng.range(-6, 6), 0.03, rng.range(-5, -2.5)], rotation: [0, rng.range(0, Math.PI), 0],
        scale: [rng.range(1, 2.5), 0.02, 0.12],
      });
    }
    // Solo en la mitad trasera, para no tapar a los luchadores
    for (let i = 0; i < 9; i++) {
      const a = Math.PI + (i / 8) * Math.PI;
      parts.push({
        geometry: GEO.dodeca, color: i % 2 ? PALETTE.rock : PALETTE.rockDark,
        position: [Math.cos(a) * 7, 0.3, Math.sin(a) * 4 - 1.5], scale: rng.range(0.5, 1.1),
      });
    }
    // Volcán detrás
    parts.push(
      { geometry: GEO.cyl8, color: PALETTE.volcano, position: [0, 4, -18], scale: [5, 9, 5] },
      { geometry: GEO.cone6, color: PALETTE.volcano, position: [0, 3, -18], scale: [12, 6, 12] },
      { geometry: GEO.cyl8, color: PALETTE.lava, position: [0, 8.55, -18], scale: [4.4, 0.2, 4.4] },
    );
    this.scene.add(new THREE.Mesh(mergeColoredParts(parts), vertexColorMat()));
  }

  private resize(width: number, height: number): void {
    const aspect = width / Math.max(height, 1);
    this.camera.aspect = aspect;
    const portrait = aspect < 1;
    // En vertical hace falta más distancia para que quepan los dos luchadores
    this.camera.fov = portrait ? 50 : 40;
    const distance = portrait ? Math.min(14, 6.2 / aspect) : 7.4;
    this.camera.position.set(0, portrait ? 3 : 2.2, distance);
    this.camera.lookAt(0, portrait ? 0.3 : 0.9, 0);
    this.camera.updateProjectionMatrix();
  }

  private makeFighter(visual: DinoVisual, x: number, facingRight: boolean): Fighter {
    const holder = new THREE.Group();
    holder.position.set(x, 0, 0);
    // Los modelos miran hacia −Z: giramos para que se miren de frente
    holder.rotation.y = facingRight ? -Math.PI / 2 : Math.PI / 2;
    visual.root.position.set(0, 0, 0);
    visual.root.rotation.set(0, 0, 0);
    visual.root.visible = true;
    visual.setState('idle');
    holder.add(visual.root);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.8, 12), blobShadowMat());
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.03;
    holder.add(shadow);
    this.scene.add(holder);
    return { visual, holder, lunge: new Spring(), hop: new Spring(), flash: 0 };
  }

  /** Empieza una batalla. `onClose` se llama al pulsar Continuar. */
  start(setup: BattleSetup, onClose: (result: BattleResult) => void): BattleController {
    this.cleanup();
    this.onClose = onClose;
    this.controller = new BattleController(setup);

    this.player = this.makeFighter(this.playerVisual(setup.player), PLAYER_X, true);
    this.rival = this.makeFighter(this.rivalVisual(setup.rival), RIVAL_X, false);

    this.unsubscribe.push(
      events.on('battle:hit', ({ target, grade, source }) => {
        const p = this.player!;
        const r = this.rival!;
        if (target === 'rival') {
          // El jugador embiste (o contraataca) y el rival retrocede
          p.lunge.kick(source === 'counter' ? 26 : 14);
          r.lunge.kick(-8);
          r.flash = 0.12;
        } else if (grade === 'miss') {
          r.lunge.kick(28);
          p.lunge.kick(-14);
          p.flash = 0.2;
          this.shake = 0.3;
        } else {
          // Esquiva: salto atrás
          p.hop.kick(grade === 'perfect' ? 9 : 6);
          r.lunge.kick(22);
        }
      }),
      events.on('battle:finished', ({ won }) => {
        (won ? this.rival! : this.player!).visual.setState('hit');
        (won ? this.player! : this.rival!).visual.setState('jump');
      }),
    );
    return this.controller;
  }

  private playerVisual(def: DinoDefinition): DinoVisual {
    let v = this.playerVisuals.get(def.id);
    if (!v) {
      v = this.assets.createDino(def);
      this.playerVisuals.set(def.id, v);
    }
    return v;
  }

  private rivalVisual(rival: RivalDefinition): DinoVisual {
    let v = this.rivalVisuals.get(rival.id);
    if (!v) {
      v = this.assets.createRival(rival);
      this.rivalVisuals.set(rival.id, v);
    }
    return v;
  }

  get active(): BattleController | undefined {
    return this.controller;
  }

  /** Cierra la batalla (botón Continuar). */
  close(): void {
    const c = this.controller;
    if (!c?.canClose) return;
    c.close();
    const result = c.result!;
    const cb = this.onClose;
    this.cleanup();
    cb?.(result);
  }

  private cleanup(): void {
    this.unsubscribe.splice(0).forEach((u) => u());
    for (const f of [this.player, this.rival]) {
      if (f) this.scene.remove(f.holder);
    }
    this.player = this.rival = undefined;
    this.controller = undefined;
  }

  update(dt: number): void {
    const c = this.controller;
    if (!c || !this.player || !this.rival) return;
    c.update(dt);

    // El rival se prepara (se echa hacia atrás) mientras avisa su ataque
    const attack = c.activeAttack;
    const windup = attack ? Math.min(1, (c.time - attack.telegraphStart) / (attack.impact - attack.telegraphStart)) : 0;

    for (const [f, sign] of [[this.player, 1], [this.rival, -1]] as const) {
      f.lunge.update(dt);
      f.hop.update(dt, 60, 9);
      f.visual.update(dt, 1);
      const baseX = sign === 1 ? PLAYER_X : RIVAL_X;
      const back = f === this.rival ? windup * 0.5 : 0;
      f.holder.position.x = baseX + sign * (f.lunge.value * 0.06 - back);
      f.holder.position.y = Math.max(0, f.hop.value * 0.12);
      f.flash = Math.max(0, f.flash - dt);
      const s = 1 + f.flash * 1.5;
      f.holder.scale.set(s, 1 / s, s);
      // Victoria: el ganador salta en el sitio
      if (c.stage === 'outro' && f.visual) {
        const winner = c.result?.won ? this.player : this.rival;
        if (f === winner) f.holder.position.y = Math.abs(Math.sin(c.stageTime * 7)) * 0.5;
      }
    }

    // Cámara con sacudida
    this.shake = Math.max(0, this.shake - dt);
    const k = this.shake * 0.6;
    this.camera.position.x = (Math.random() - 0.5) * k;
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}
