import { ABILITY_CONFIG, type DinoAbility } from '@/config/dinos.config';
import { events } from '@/core/EventBus';
import type { Obstacle } from '../entities/Obstacle';
import type { Player } from '../player/Player';

/**
 * Habilidades especiales de los dinosaurios en el runner.
 *
 * Cada habilidad es un objeto con ganchos opcionales que RunnerScene llama en
 * momentos concretos. Para añadir una nueva: crea su handler aquí y regístralo
 * en `createAbility`. Las que solo afectan al movimiento (doble salto) viven en
 * Player; las de batalla (cola-maza, poder máximo) en la Fase 4.
 */
export interface AbilityContext {
  readonly player: Player;
  /** Distancia recorrida en la partida (m). */
  readonly distance: number;
  /** Tiempo de partida (s). */
  readonly time: number;
  forEachObstacle(fn: (o: Obstacle) => void): void;
  setSpeedMultiplier(multiplier: number): void;
  shake(strength: number, duration: number): void;
}

/** Cómo resuelve una habilidad un choque frontal. */
export type HitResponse = 'ignore' | 'destroy' | null;

export interface AbilityHandler {
  reset(ctx: AbilityContext): void;
  update(dt: number, ctx: AbilityContext): void;
  /** Si devuelve true, el obstáculo no colisiona (sin gastar nada). */
  passesThrough(o: Obstacle, ctx: AbilityContext): boolean;
  /** Último recurso ante un golpe frontal (antes del escudo de ámbar). */
  onHit(o: Obstacle, ctx: AbilityContext): HitResponse;
}

const noop: AbilityHandler = {
  reset: () => {},
  update: () => {},
  passesThrough: () => false,
  onHit: () => null,
};

/** Gallimimus: arranque veloz e invencible durante los primeros metros. */
function fastRunner(): AbilityHandler {
  const cfg = ABILITY_CONFIG.fast_runner;
  let sprinting = false;
  let announced = false;
  return {
    ...noop,
    reset(ctx) {
      sprinting = true;
      announced = false;
      ctx.setSpeedMultiplier(cfg.speedMultiplier);
    },
    update(_dt, ctx) {
      if (!sprinting) return;
      if (!announced) {
        announced = true;
        events.emit('ability:used', { ability: 'fast_runner' });
      }
      if (ctx.distance >= cfg.sprintDistance) {
        sprinting = false;
        ctx.setSpeedMultiplier(1);
      }
    },
    // Durante el sprint atraviesa todo
    passesThrough: () => sprinting,
  };
}

/** Parasaurolophus: su rugido aturde a los pterodáctilos que se acercan. */
function stunRoar(): AbilityHandler {
  const cfg = ABILITY_CONFIG.stun_roar;
  let cooldown = 0;
  return {
    ...noop,
    reset() {
      cooldown = 0;
    },
    update(dt, ctx) {
      cooldown -= dt;
      if (cooldown > 0) return;
      let roared = false;
      ctx.forEachObstacle((o) => {
        const z = o.object.position.z;
        if (o.type === 'pterodactyl' && o.stunnedAt < 0 && z > -cfg.range && z < -4) {
          o.stunnedAt = ctx.time;
          roared = true;
        }
      });
      if (roared) {
        cooldown = cfg.cooldown;
        ctx.shake(0.12, 0.3);
        events.emit('ability:used', { ability: 'stun_roar' });
      }
    },
  };
}

/** Stegosaurus: sus placas aguantan un golpe por partida. */
function plateShield(): AbilityHandler {
  const cfg = ABILITY_CONFIG.plate_shield;
  let hitsLeft = 0;
  return {
    ...noop,
    reset() {
      hitsLeft = cfg.hitsPerRun;
    },
    onHit(_o, ctx) {
      if (hitsLeft <= 0) return null;
      hitsLeft--;
      ctx.player.makeInvulnerable(cfg.graceTime);
      ctx.shake(0.3, 0.3);
      events.emit('ability:used', { ability: 'plate_shield' });
      return 'ignore';
    },
  };
}

/** Triceratops: embiste y rompe rocas pequeñas. */
function rockBreaker(): AbilityHandler {
  const breakable = new Set<string>(ABILITY_CONFIG.rock_breaker.breaks);
  return {
    ...noop,
    onHit(o, ctx) {
      if (!breakable.has(o.type)) return null;
      ctx.shake(0.25, 0.25);
      events.emit('ability:used', { ability: 'rock_breaker' });
      return 'destroy';
    },
  };
}

/** Spinosaurus: cruza los ríos nadando. */
function swimmer(): AbilityHandler {
  return {
    ...noop,
    reset(ctx) {
      ctx.player.swimming = false;
    },
    update(_dt, ctx) {
      let inWater = false;
      ctx.forEachObstacle((o) => {
        if (o.type === 'river' && Math.abs(o.object.position.z) < o.def.hitbox.depth / 2 + 0.4) inWater = true;
      });
      if (inWater && !ctx.player.swimming) events.emit('ability:used', { ability: 'swimmer' });
      ctx.player.swimming = inWater;
    },
    passesThrough: (o) => o.type === 'river',
  };
}

export function createAbility(ability: DinoAbility): AbilityHandler {
  switch (ability) {
    case 'fast_runner': return fastRunner();
    case 'stun_roar': return stunRoar();
    case 'plate_shield': return plateShield();
    case 'rock_breaker': return rockBreaker();
    case 'swimmer': return swimmer();
    // double_jump se aplica en Player; tail_club y apex_power son de batalla (Fase 4)
    default: return noop;
  }
}
