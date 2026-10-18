import * as THREE from 'three';
import { BATTLE_CONFIG } from '@/config/battle.config';
import type { BattleResult } from '@/battle/BattleController';
import { GAME_CONFIG, laneX } from '@/config/game.config';
import { OBSTACLES, type ObstacleType } from '@/config/obstacles.config';
import { POWERUPS, POWERUP_CONFIG, type PowerUpType } from '@/config/powerups.config';
import { dinoModifiers, getDino, type DinoId } from '@/config/dinos.config';
import type { DinoVisual } from '@/assets/DinoVisual';
import { AssetLoader } from '@/assets/AssetLoader';
import { createBackdrop } from '@/assets/placeholders/environmentPlaceholders';
import { events } from '@/core/EventBus';
import { ObjectPool } from '@/core/ObjectPool';
import { SeededRandom } from '@/core/SeededRandom';
import type { Updatable, Renderable } from '@/core/Game';
import { CameraRig } from '@/engine/CameraRig';
import { setupLighting } from '@/engine/Lighting';
import type { Renderer } from '@/engine/Renderer';
import type { InputManager } from '@/input/InputManager';
import { Player } from './player/Player';
import { Obstacle } from './entities/Obstacle';
import { Coin } from './entities/Coin';
import { PowerUp } from './entities/PowerUp';
import { ChunkGenerator, type SpawnCommand } from './world/ChunkGenerator';
import { GroundSystem } from './world/GroundSystem';
import { ScoreSystem } from './systems/ScoreSystem';
import { PowerUpSystem } from './systems/PowerUpSystem';
import { speedAt } from './systems/DifficultySystem';
import { vibrate } from '@/utils/haptics';
import { createAABB, intersects, overlap } from './systems/CollisionSystem';
import { DebrisSystem } from './systems/DebrisSystem';
import { createAbility, type AbilityContext, type AbilityHandler } from './abilities/abilities';

export type RunState = 'ready' | 'running' | 'paused' | 'countdown' | 'battle' | 'dying' | 'gameover';

const W = GAME_CONFIG.world;
const SPEED = GAME_CONFIG.speed;
const COIN = GAME_CONFIG.coins;
/** Tiempo entre el choque y la pantalla de fin de partida. */
const DEATH_DELAY = 1.1;
const COIN_COLLECT_TIME = 0.25;
const POWERUP_PICKUP_RADIUS = 1.1;

/**
 * Escena principal del runner. Orquesta jugador, mundo, generación, pools,
 * colisiones, power-ups y puntaje. No sabe nada de la UI: comunica todo por
 * eventos (ver core/EventBus.ts).
 */
export class RunnerScene implements Updatable, Renderable {
  readonly scene = new THREE.Scene();
  readonly cameraRig = new CameraRig();
  private readonly player: Player;
  private readonly ground: GroundSystem;
  private generator: ChunkGenerator;
  private readonly score = new ScoreSystem();
  private readonly powerUps = new PowerUpSystem();
  private readonly debris = new DebrisSystem();
  private ability: AbilityHandler;
  private readonly abilityCtx: AbilityContext;
  /** Modelos ya creados por dino, para cambiar de equipado sin recrearlos. */
  private readonly dinoVisuals = new Map<DinoId, DinoVisual>();
  private speedMultiplier = 1;

  // --- Batallas ---
  /** Monedas recogidas en pista (con x2), sin contar efectos de batalla. */
  private collectedForBattles = 0;
  private nextBattleAt: number = BATTLE_CONFIG.coinThreshold;
  private pendingBattle = false;
  private readonly battles: BattleResult[] = [];

  private readonly obstaclePools = new Map<ObstacleType, ObjectPool<Obstacle>>();
  private readonly powerUpPools = new Map<PowerUpType, ObjectPool<PowerUp>>();
  private readonly coinPool: ObjectPool<Coin>;
  private readonly spawnQueue: SpawnCommand[] = [];

  private readonly playerBox = createAABB();
  private state: RunState = 'ready';
  private speed: number = SPEED.start;
  private deathTimer = 0;
  private countdownTimer = 0;
  private lastCountdownValue = 0;
  private fxTime = 0;
  private lastEmittedScore = -1;

  constructor(
    private readonly renderer: Renderer,
    private readonly input: InputManager,
    private readonly assets: AssetLoader,
    dinoId: DinoId,
  ) {
    setupLighting(this.scene);
    this.scene.add(createBackdrop());

    this.ground = new GroundSystem(SeededRandom.randomSeed());
    this.scene.add(this.ground.group);

    const dino = getDino(dinoId);
    this.player = new Player(this.getDinoVisual(dinoId), dino);
    this.scene.add(this.player.object);
    this.scene.add(this.debris.group);
    this.ability = createAbility(dino.ability);
    this.score.scoreMultiplier = dinoModifiers(dino).scoreMultiplier;

    // Contexto que reciben las habilidades (solo lo que necesitan, no toda la escena)
    const scene = this;
    this.abilityCtx = {
      player: this.player,
      get distance() { return scene.score.distance; },
      get time() { return scene.score.elapsed; },
      forEachObstacle: (fn) => this.obstaclePools.forEach((p) => p.forEachActive(fn)),
      setSpeedMultiplier: (m) => (this.speedMultiplier = m),
      shake: (strength, duration) => this.cameraRig.shake(strength, duration),
    };

    // Pools pre-calentados: no se crea ninguna malla durante la partida
    for (const def of Object.values(OBSTACLES)) {
      this.obstaclePools.set(
        def.type,
        this.createPool(() => new Obstacle(def.type, this.assets.createObstacle(def.type)), def.poolSize, (o) => o.reset()),
      );
    }
    for (const def of Object.values(POWERUPS)) {
      this.powerUpPools.set(
        def.type,
        this.createPool(() => new PowerUp(def.type, this.assets.createPowerUp(def.type)), 2, (p) => (p.collected = false)),
      );
    }
    this.coinPool = this.createPool(() => new Coin(this.assets.createCoin(COIN.radius)), 140, (c) => c.reset());

    // El escudo se ve en el dino mientras esté activo
    events.on('powerup:start', ({ type }) => type === 'shield' && this.player.setShieldVisible(true));
    events.on('powerup:end', ({ type }) => type === 'shield' && this.player.setShieldVisible(false));

    this.generator = new ChunkGenerator(SeededRandom.randomSeed());
    renderer.onResize((w, h) => this.cameraRig.resize(w, h));
    this.resetWorld();
  }

  /** Pool de entidades con malla: la añade a la escena y la oculta al liberarla. */
  private createPool<T extends { object: THREE.Object3D }>(
    factory: () => T,
    size: number,
    onAcquire: (item: T) => void,
  ): ObjectPool<T> {
    return new ObjectPool(
      () => {
        const item = factory();
        this.scene.add(item.object);
        return item;
      },
      (item) => {
        onAcquire(item);
        item.object.visible = true;
      },
      (item) => (item.object.visible = false),
      size,
    );
  }

  get runState(): RunState {
    return this.state;
  }

  private getDinoVisual(id: DinoId): DinoVisual {
    let visual = this.dinoVisuals.get(id);
    if (!visual) {
      visual = this.assets.createDino(getDino(id));
      this.dinoVisuals.set(id, visual);
    }
    return visual;
  }

  /** Equipa otro dino (solo fuera de partida). */
  setDino(id: DinoId): void {
    if (this.player.definition.id === id) return;
    const dino = getDino(id);
    this.player.setVisual(this.getDinoVisual(id), dino);
    this.ability = createAbility(dino.ability);
    this.score.scoreMultiplier = dinoModifiers(dino).scoreMultiplier;
    this.resetWorld();
  }

  // --- Control de la partida --------------------------------------------------

  /** Empieza una partida nueva. `seed` vendrá del servidor en la Fase 5. */
  start(seed = SeededRandom.randomSeed()): void {
    this.generator = new ChunkGenerator(seed);
    this.resetWorld();
    this.state = 'running';
    this.input.clear();
    this.input.setEnabled(true);
    this.player.startRunning();
    events.emit('run:start');
  }

  pause(): void {
    if (this.state !== 'running' && this.state !== 'countdown') return;
    this.state = 'paused';
    this.input.setEnabled(false);
    this.player.showModel();
    events.emit('run:pause');
  }

  /** Reanuda tras una cuenta regresiva (también la usará la vuelta de las batallas). */
  resume(): void {
    if (this.state !== 'paused') return;
    this.state = 'countdown';
    this.countdownTimer = BATTLE_CONFIG.resumeCountdown;
    this.lastCountdownValue = Math.ceil(this.countdownTimer);
    events.emit('run:resume');
    events.emit('run:countdown', { value: this.lastCountdownValue });
  }

  togglePause(): void {
    if (this.state === 'running' || this.state === 'countdown') this.pause();
    else if (this.state === 'paused') this.resume();
  }

  private resetWorld(): void {
    this.obstaclePools.forEach((p) => p.releaseAll());
    this.powerUpPools.forEach((p) => p.releaseAll());
    this.coinPool.releaseAll();
    this.spawnQueue.length = 0;
    this.score.reset();
    this.powerUps.reset();
    this.debris.reset();
    this.speedMultiplier = 1;
    this.collectedForBattles = 0;
    this.nextBattleAt = BATTLE_CONFIG.coinThreshold;
    this.pendingBattle = false;
    this.battles.length = 0;
    this.speed = SPEED.start;
    this.deathTimer = 0;
    this.lastEmittedScore = -1;
    this.player.reset();
    this.ability.reset(this.abilityCtx);
    this.ground.reset();
    this.cameraRig.reset();
    this.state = 'ready';
    this.ground.update(0);
  }

  // --- Bucle ------------------------------------------------------------------

  update(dt: number): void {
    this.fxTime += dt;

    switch (this.state) {
      case 'running':
        this.updateRunning(dt);
        break;
      case 'countdown':
        this.updateCountdown(dt);
        return;
      case 'dying':
        // El mundo frena en seco y el dino cae
        this.speed = Math.max(0, this.speed - this.speed * 8 * dt);
        this.advanceWorld(dt);
        this.deathTimer -= dt;
        if (this.deathTimer <= 0) this.finishRun();
        break;
      case 'paused':
      case 'gameover':
        return;
      case 'ready':
        break;
    }

    // En carrera el jugador se mueve dentro de updateRunning (antes de las colisiones)
    if (this.state !== 'running') this.player.update(dt, 1);
    this.debris.update(dt, this.state === 'running' ? this.speed : 0);
    this.animateCollectibles(dt);
    this.cameraRig.update(dt, this.player.x, this.player.y);
  }

  render(): void {
    this.renderer.render(this.scene, this.cameraRig.camera);
  }

  private updateCountdown(dt: number): void {
    this.countdownTimer -= dt;
    const value = Math.max(0, Math.ceil(this.countdownTimer));
    if (value !== this.lastCountdownValue) {
      this.lastCountdownValue = value;
      events.emit('run:countdown', { value });
    }
    if (this.countdownTimer <= 0) {
      this.state = 'running';
      this.input.clear();
      this.input.setEnabled(true);
    }
  }

  private updateRunning(dt: number): void {
    this.score.elapsed += dt;
    this.speed = speedAt(this.score.elapsed) * this.speedMultiplier;

    this.handleInput();
    this.ability.update(dt, this.abilityCtx);
    this.powerUps.update(dt);
    this.player.superJump = this.powerUps.isActive('superJump');
    // Orden importante: mover al jugador y al mundo, y DESPUÉS comprobar choques
    this.player.update(dt, this.speed / SPEED.start);
    this.advanceWorld(dt);
    this.checkCollisions();
    this.checkCollectibles(dt);

    const s = this.score.score;
    if (s !== this.lastEmittedScore) {
      this.lastEmittedScore = s;
      events.emit('score:update', { distance: this.score.distance, score: s, speed: this.speed });
    }

    if (this.pendingBattle && this.state === 'running') this.enterBattle();
  }

  // --- Batallas ---------------------------------------------------------------

  /** Congela el runner y pide una batalla (main.ts abre la escena de batalla). */
  private enterBattle(): void {
    this.pendingBattle = false;
    this.state = 'battle';
    this.input.setEnabled(false);
    this.player.showModel();
    events.emit('battle:trigger', {
      runCoins: this.score.coins,
      sequence: this.battles.length + 1,
      atMs: Math.round(this.score.elapsed * 1000),
    });
  }

  /**
   * Vuelve al runner tras una batalla: aplica el efecto en monedas, limpia los
   * obstáculos cercanos (para no volver a ciegas) y hace la cuenta regresiva.
   */
  resumeAfterBattle(result: BattleResult): void {
    if (this.state !== 'battle') return;
    this.battles.push(result);
    this.score.coins = Math.max(0, this.score.coins + result.coinsDelta);
    events.emit('run:coins', { total: this.score.coins, delta: result.coinsDelta });

    const limit = this.score.distance + BATTLE_CONFIG.clearAheadOnResume;
    this.obstaclePools.forEach((pool) => pool.forEachActive((o) => o.d < limit && pool.release(o)));

    this.state = 'paused';
    this.resume();
  }

  private handleInput(): void {
    let action = this.input.poll();
    while (action) {
      switch (action) {
        case 'left': this.player.moveLeft(); break;
        case 'right': this.player.moveRight(); break;
        case 'jump': this.player.jump(); break;
        case 'roll': this.player.roll(); break;
        case 'pause': break; // la gestiona main.ts para que funcione también en pausa
      }
      action = this.input.poll();
    }
  }

  /** Desplaza el mundo, genera lo nuevo y recicla lo que ya pasó. */
  private advanceWorld(dt: number): void {
    this.score.distance += this.speed * dt;
    const distance = this.score.distance;
    const time = this.score.elapsed;

    this.generator.generateUntil(distance + W.spawnAhead, this.speed, this.spawnQueue);
    for (const cmd of this.spawnQueue) this.spawn(cmd);
    this.spawnQueue.length = 0;

    this.obstaclePools.forEach((pool) =>
      pool.forEachActive((o) => {
        const z = distance - o.d;
        if (z > W.despawnZ) pool.release(o);
        else o.place(laneX(o.lane), z, time);
      }),
    );

    this.powerUpPools.forEach((pool) =>
      pool.forEachActive((p) => {
        const z = distance - p.d;
        if (z > W.despawnZ || p.collected) pool.release(p);
        else p.object.position.z = z;
      }),
    );

    this.coinPool.forEachActive((c) => {
      if (c.attracted) return; // el imán la mueve por su cuenta
      const z = distance - c.d;
      if (z > W.despawnZ) this.coinPool.release(c);
      else c.object.position.z = z;
    });

    this.ground.update(distance);
  }

  private spawn(cmd: SpawnCommand): void {
    const z = this.score.distance - cmd.d;
    switch (cmd.kind) {
      case 'obstacle': {
        const o = this.obstaclePools.get(cmd.type)!.acquire();
        o.lane = cmd.lane;
        o.d = cmd.d;
        o.place(laneX(cmd.lane), z, this.score.elapsed);
        break;
      }
      case 'coin': {
        const c = this.coinPool.acquire();
        c.lane = cmd.lane;
        c.d = cmd.d;
        c.y = cmd.y;
        c.object.position.set(laneX(cmd.lane), cmd.y, z);
        break;
      }
      case 'powerup': {
        const p = this.powerUpPools.get(cmd.type)!.acquire();
        p.lane = cmd.lane;
        p.d = cmd.d;
        p.object.position.set(laneX(cmd.lane), 1.1, z);
        break;
      }
    }
  }

  private checkCollisions(): void {
    const box = this.player.getHitbox(this.playerBox);
    let hit: Obstacle | undefined;

    this.obstaclePools.forEach((pool) =>
      pool.forEachActive((o) => {
        if (hit || o.ignoreCollisions || !o.harmful || !intersects(box, o.box)) return;
        if (this.ability.passesThrough(o, this.abilityCtx)) return;
        const pen = overlap(box, o.box);
        if (this.player.isChangingLane && pen.x < pen.z) {
          // Choque lateral al cambiar de carril: rebota, no muere
          o.ignoreCollisions = true;
          this.player.bounceBack();
          this.cameraRig.shake(0.15, 0.2);
        } else {
          hit = o;
        }
      }),
    );

    if (!hit) return;
    if (this.player.isInvulnerable) {
      hit.ignoreCollisions = true;
      return;
    }
    const response = this.ability.onHit(hit, this.abilityCtx);
    if (response === 'ignore') {
      hit.ignoreCollisions = true;
    } else if (response === 'destroy') {
      const p = hit.object.position;
      this.debris.burst(p.x, 1, p.z);
      this.obstaclePools.get(hit.type)!.release(hit);
    } else if (this.powerUps.consumeShield()) {
      // El escudo de ámbar absorbe el golpe (la Fase 3 añadirá las placas del Stegosaurus aquí)
      hit.ignoreCollisions = true;
      this.player.makeInvulnerable(POWERUP_CONFIG.shield.graceTime);
      this.cameraRig.shake(0.3, 0.3);
      vibrate(60);
    } else {
      this.die(hit.type);
    }
  }

  private checkCollectibles(dt: number): void {
    const px = this.player.x;
    const py = this.player.centerY;
    const r = COIN.pickupRadius;
    const magnet = this.powerUps.isActive('magnet');
    const { range, pullSpeed } = POWERUP_CONFIG.magnet;

    this.coinPool.forEachActive((c) => {
      if (c.collected) return;
      const p = c.object.position;

      if (magnet && !c.attracted && p.z > -range && p.z < 1) c.attracted = true;
      if (c.attracted) {
        // Vuela hacia el dino
        const dx = px - p.x;
        const dy = py - p.y;
        const dz = -p.z;
        const dist = Math.hypot(dx, dy, dz);
        const step = Math.min(dist, (pullSpeed + this.speed) * dt);
        if (dist > 1e-3) p.set(p.x + (dx / dist) * step, p.y + (dy / dist) * step, p.z + (dz / dist) * step);
        if (dist < r) this.collectCoin(c);
        return;
      }

      if (Math.abs(p.z) < r && Math.abs(p.x - px) < r && Math.abs(p.y - py) < r + 0.3) this.collectCoin(c);
    });

    this.powerUpPools.forEach((pool) =>
      pool.forEachActive((pu) => {
        const p = pu.object.position;
        if (Math.abs(p.z) < POWERUP_PICKUP_RADIUS && Math.abs(p.x - px) < POWERUP_PICKUP_RADIUS &&
            Math.abs(p.y - py) < POWERUP_PICKUP_RADIUS + 0.5) {
          pu.collected = true;
          this.powerUps.activate(pu.type);
          pool.release(pu);
        }
      }),
    );
  }

  private collectCoin(c: Coin): void {
    c.collected = true;
    c.y = c.object.position.y;
    const amount = this.powerUps.isActive('multiplier') ? POWERUP_CONFIG.multiplier.factor : 1;
    events.emit('coin:collected', { total: this.score.addCoin(amount), amount });

    // Cada `coinThreshold` monedas recogidas → batalla
    this.collectedForBattles += amount;
    if (this.collectedForBattles >= this.nextBattleAt) {
      this.pendingBattle = true;
      while (this.nextBattleAt <= this.collectedForBattles) this.nextBattleAt += BATTLE_CONFIG.coinThreshold;
    }
  }

  private animateCollectibles(dt: number): void {
    const spin = this.fxTime * 4;
    this.coinPool.forEachActive((c) => {
      c.object.rotation.y = spin;
      if (c.collected) {
        c.collectTimer += dt;
        const t = c.collectTimer / COIN_COLLECT_TIME;
        c.object.position.y = c.y + t * 1.5;
        c.object.scale.setScalar(Math.max(0.01, 1 - t));
        if (t >= 1) this.coinPool.release(c);
      }
    });
    this.powerUpPools.forEach((pool) => pool.forEachActive((p) => p.animate(this.fxTime)));
  }

  private die(obstacle: ObstacleType): void {
    this.state = 'dying';
    this.deathTimer = DEATH_DELAY;
    this.input.setEnabled(false);
    this.player.die();
    this.powerUps.reset();
    this.cameraRig.shake(0.5, 0.45);
    events.emit('player:hit', { obstacle });
    vibrate([120, 40, 80]);
  }

  private finishRun(): void {
    this.state = 'gameover';
    events.emit('run:over', {
      distance: Math.floor(this.score.distance),
      score: this.score.score,
      coins: this.score.coins,
      durationMs: Math.round(this.score.elapsed * 1000),
      coinsCollected: this.collectedForBattles,
      battles: [...this.battles],
    });
  }

  /** Vuelve a la pantalla de inicio con el dino en reposo. */
  backToReady(): void {
    this.resetWorld();
  }
}
