import * as THREE from 'three';
import { GAME_CONFIG, laneX } from '@/config/game.config';
import { ABILITY_CONFIG, dinoModifiers, type DinoDefinition } from '@/config/dinos.config';
import type { DinoVisual } from '@/assets/DinoVisual';
import { events } from '@/core/EventBus';
import { POWERUP_CONFIG } from '@/config/powerups.config';
import { blobShadowMat } from '@/engine/materials';
import type { AABB } from '../systems/CollisionSystem';

const P = GAME_CONFIG.player;
const jumpVelocity = (height: number) => Math.sqrt(2 * P.gravity * height);

/**
 * El dinosaurio del jugador: carriles, salto, rodar y caja de colisión.
 * Vive siempre en z = 0; solo se mueve en X (carriles) e Y (salto).
 *
 * Las estadísticas del dino (agilidad) y las habilidades que afectan al
 * movimiento (doble salto, nadar) se aplican aquí; el resto vive en
 * runner/abilities/.
 */
export class Player {
  readonly object = new THREE.Group();
  private visual: DinoVisual;
  private readonly shadow: THREE.Mesh;
  private readonly shieldBubble: THREE.Mesh;

  lane = 1;
  private previousLane = 1;
  x = laneX(1);
  y = 0;
  private vy = 0;
  private grounded = true;
  private rolling = false;
  private rollTimer = 0;
  private fastFall = false;
  private jumpBuffer = 0;
  private invulnerableTimer = 0;
  private blinkTime = 0;
  /** Lo activa el power-up de súper salto. */
  superJump = false;
  /** Lo activa la habilidad del Spinosaurus al cruzar un río. */
  swimming = false;
  private laneSpeed = 0;
  private rollDuration: number = P.rollDuration;
  private airJumpsLeft = 0;
  private maxAirJumps = 0;
  dead = false;

  constructor(visual: DinoVisual, private dino: DinoDefinition) {
    this.visual = visual;
    this.object.add(visual.root);
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.55, 12), blobShadowMat());
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.02;
    this.object.add(this.shadow);

    // Burbuja de ámbar del escudo
    this.shieldBubble = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.15, 1),
      new THREE.MeshLambertMaterial({
        color: 0xffb13b, emissive: 0xff8a00, emissiveIntensity: 0.4,
        transparent: true, opacity: 0.3, flatShading: true, depthWrite: false,
      }),
    );
    this.shieldBubble.position.y = 0.85;
    this.shieldBubble.visible = false;
    this.object.add(this.shieldBubble);
    this.object.name = 'player';
    this.applyDinoStats();
  }

  /** Aplica agilidad y habilidades de movimiento del dino actual. */
  private applyDinoStats(): void {
    const { agilityFactor } = dinoModifiers(this.dino);
    this.laneSpeed = GAME_CONFIG.lanes.width / (GAME_CONFIG.lanes.changeTime * agilityFactor);
    this.rollDuration = P.rollDuration * agilityFactor;
    this.maxAirJumps = this.dino.ability === 'double_jump' ? ABILITY_CONFIG.double_jump.extraJumps : 0;
  }

  get definition(): DinoDefinition {
    return this.dino;
  }

  /** Cambia el modelo (al equipar otro dino en la tienda). */
  setVisual(visual: DinoVisual, dino: DinoDefinition): void {
    this.object.remove(this.visual.root);
    this.visual = visual;
    this.dino = dino;
    this.object.add(visual.root);
    this.applyDinoStats();
    this.visual.setState('idle');
  }

  reset(): void {
    this.lane = this.previousLane = 1;
    this.x = laneX(1);
    this.y = this.vy = 0;
    this.grounded = true;
    this.rolling = this.fastFall = false;
    this.rollTimer = this.jumpBuffer = 0;
    this.invulnerableTimer = 0;
    this.superJump = false;
    this.swimming = false;
    this.airJumpsLeft = this.maxAirJumps;
    this.dead = false;
    this.shieldBubble.visible = false;
    this.visual.root.visible = true;
    this.visual.setState('idle');
    this.syncTransform();
  }

  // --- Acciones ---------------------------------------------------------------

  moveLeft(): void {
    this.changeLane(-1);
  }

  moveRight(): void {
    this.changeLane(1);
  }

  private changeLane(dir: -1 | 1): void {
    const target = this.lane + dir;
    if (target < 0 || target >= GAME_CONFIG.lanes.count) return;
    this.previousLane = this.lane;
    this.lane = target;
    events.emit('player:lane', { lane: target });
  }

  jump(): void {
    if (!this.grounded) {
      if (this.airJumpsLeft > 0) {
        // Doble salto (Velociraptor)
        this.airJumpsLeft--;
        this.fastFall = false;
        this.vy = jumpVelocity(ABILITY_CONFIG.double_jump.secondJumpHeight);
        this.visual.setState('jump');
        events.emit('player:jump', { super: false });
        events.emit('ability:used', { ability: 'double_jump' });
        return;
      }
      this.jumpBuffer = P.inputBuffer;
      return;
    }
    this.rolling = false;
    this.grounded = false;
    this.vy = jumpVelocity(this.superJump ? POWERUP_CONFIG.superJump.jumpHeight : P.jumpHeight);
    this.visual.setState('jump');
    events.emit('player:jump', { super: this.superJump });
  }

  roll(): void {
    if (!this.grounded) {
      // En el aire: caída rápida y rueda al aterrizar
      this.fastFall = true;
      this.vy = Math.min(this.vy, 0);
      return;
    }
    this.rolling = true;
    this.rollTimer = this.rollDuration;
    this.visual.setState('roll');
    events.emit('player:roll');
  }

  /** Choque lateral: vuelve al carril anterior. */
  bounceBack(): void {
    this.lane = this.previousLane;
    events.emit('player:stumble');
  }

  /** ¿Está a mitad de un cambio de carril? */
  get isChangingLane(): boolean {
    return Math.abs(this.x - laneX(this.lane)) > 0.05;
  }

  get isRolling(): boolean {
    return this.rolling;
  }

  die(): void {
    this.dead = true;
    this.visual.root.visible = true;
    this.shieldBubble.visible = false;
    this.visual.setState('hit');
  }

  /** Vuelve a la vida tras ver el anuncio de revivir: de pie en su carril y parpadeando. */
  revive(invulnerableSeconds: number): void {
    this.dead = false;
    this.x = laneX(this.lane);
    this.previousLane = this.lane;
    this.y = this.vy = 0;
    this.grounded = true;
    this.rolling = this.fastFall = false;
    this.rollTimer = this.jumpBuffer = 0;
    this.airJumpsLeft = this.maxAirJumps;
    this.visual.root.visible = true;
    this.visual.setState('run');
    this.makeInvulnerable(invulnerableSeconds);
    this.syncTransform();
  }

  /** Muestra u oculta la burbuja del escudo. */
  setShieldVisible(visible: boolean): void {
    this.shieldBubble.visible = visible;
  }

  /** Invulnerable durante `seconds` (parpadea). */
  makeInvulnerable(seconds: number): void {
    this.invulnerableTimer = seconds;
  }

  /** Asegura que el modelo se vea (p. ej. al pausar en mitad del parpadeo). */
  showModel(): void {
    this.visual.root.visible = true;
  }

  get isInvulnerable(): boolean {
    return this.invulnerableTimer > 0;
  }

  // --- Simulación -------------------------------------------------------------

  update(dt: number, pace: number): void {
    if (!this.dead) {
      // Movimiento lateral a velocidad constante
      const targetX = laneX(this.lane);
      const dx = targetX - this.x;
      const step = this.laneSpeed * dt;
      this.x = Math.abs(dx) <= step ? targetX : this.x + Math.sign(dx) * step;

      // Salto / gravedad
      if (!this.grounded) {
        this.vy -= (this.fastFall ? P.fastFallGravity : P.gravity) * dt;
        this.y += this.vy * dt;
        if (this.y <= 0) this.land();
      }

      if (this.jumpBuffer > 0) this.jumpBuffer -= dt;

      this.blinkTime += dt;
      if (this.invulnerableTimer > 0) {
        this.invulnerableTimer -= dt;
        this.visual.root.visible = this.invulnerableTimer <= 0 || Math.floor(this.blinkTime * 14) % 2 === 0;
      }
      if (this.shieldBubble.visible) {
        this.shieldBubble.rotation.y += dt * 1.5;
        this.shieldBubble.scale.setScalar(1 + Math.sin(this.blinkTime * 4) * 0.03);
      }

      if (this.rolling) {
        this.rollTimer -= dt;
        if (this.rollTimer <= 0) {
          this.rolling = false;
          this.visual.setState('run');
        }
      }
    }

    this.visual.update(dt, pace);
    this.syncTransform();
  }

  private land(): void {
    this.y = 0;
    this.vy = 0;
    this.grounded = true;
    this.airJumpsLeft = this.maxAirJumps;
    const wasFastFall = this.fastFall;
    this.fastFall = false;

    if (this.jumpBuffer > 0) {
      this.jumpBuffer = 0;
      this.jump();
    } else if (wasFastFall) {
      this.roll();
    } else {
      this.visual.setState('run');
    }
  }

  private syncTransform(): void {
    this.object.position.set(this.x, 0, 0);
    // Nadando: medio cuerpo bajo el agua
    this.visual.root.position.y = this.y - (this.swimming && this.y < 0.05 ? ABILITY_CONFIG.swimmer.dip : 0);
    this.shieldBubble.position.y = 0.85 + this.y;
    // Inclinación al cambiar de carril
    const lean = (laneX(this.lane) - this.x) * -0.12;
    this.visual.root.rotation.z = lean;
    this.visual.root.rotation.y = lean * 0.8;
    // La sombra se encoge con la altura
    const s = Math.max(0.35, 1 - this.y * 0.25);
    this.shadow.scale.set(s, s, s);
  }

  /** Caja de colisión actual (en coordenadas de mundo). */
  getHitbox(out: AABB): AABB {
    const h = this.rolling ? P.rollHeight : P.height;
    out.minX = this.x - P.width / 2;
    out.maxX = this.x + P.width / 2;
    out.minY = this.y;
    out.maxY = this.y + h;
    out.minZ = -P.depth / 2;
    out.maxZ = P.depth / 2;
    return out;
  }

  /** Centro del cuerpo, para recoger monedas. */
  get centerY(): number {
    return this.y + (this.rolling ? P.rollHeight : P.height) / 2;
  }

  startRunning(): void {
    this.visual.setState('run');
  }
}
