import { BATTLE_CONFIG, type BattleConfig } from '@/config/battle.config';
import type { DinoAbility } from '@/config/dinos.config';
import { POWER_GROWTH_AFTER_LADDER, RIVALS, type RivalDefinition } from '@/config/rivals.config';
import { SeededRandom } from '@/core/SeededRandom';

/**
 * Reglas puras de las batallas (sin DOM ni Three.js) para poder testearlas y
 * replicar la parte económica en el servidor.
 */

// --- Rival ----------------------------------------------------------------------

/**
 * Rival según el progreso: `battlesWon` = batallas ganadas en total por el
 * jugador. Cada victoria sube un escalón; si pierdes, repites el mismo rival
 * (así un jugador nuevo no se queda atrás por perder).
 */
export function selectRival(battlesWon: number): RivalDefinition {
  const n = Math.max(0, Math.floor(battlesWon));
  if (n < RIVALS.length) return RIVALS[n];
  const last = RIVALS[RIVALS.length - 1];
  return { ...last, power: last.power + (n - RIVALS.length + 1) * POWER_GROWTH_AFTER_LADDER };
}

/** 0 = rival más débil de la escalera, 1 = el más fuerte (o más allá). */
export function rivalTier(rival: RivalDefinition): number {
  const min = RIVALS[0].power;
  const max = RIVALS[RIVALS.length - 1].power;
  return Math.min(1, Math.max(0, (rival.power - min) / (max - min)));
}

// --- Línea de tiempo ------------------------------------------------------------

export type DodgeDirection = 'left' | 'right' | 'jump' | 'roll';

export type BattlePhase =
  | { kind: 'attack'; start: number; end: number }
  | { kind: 'defend'; start: number; end: number; attacks: Array<{ direction: DodgeDirection; telegraphStart: number; impact: number }> };

const DIRECTIONS: DodgeDirection[] = ['left', 'right', 'jump', 'roll'];

/**
 * Genera las fases del minijuego: ataque y defensa alternados hasta completar
 * la duración. Siempre empieza atacando el jugador. Los tiempos son relativos
 * al inicio del combate (después de la intro).
 */
export function buildTimeline(seed: number, rival: RivalDefinition, cfg: BattleConfig = BATTLE_CONFIG): {
  duration: number;
  phases: BattlePhase[];
} {
  const rng = new SeededRandom(seed);
  const [minD, maxD] = cfg.durationRange;
  const duration = rng.range(minD, maxD);
  const tier = rivalTier(rival);
  const telegraph = cfg.defend.telegraph.easy + (cfg.defend.telegraph.hard - cfg.defend.telegraph.easy) * tier;

  const phases: BattlePhase[] = [];
  let t = 0;
  let attacking = true;
  while (t < duration - 0.5) {
    if (attacking) {
      const end = Math.min(duration, t + cfg.attack.duration);
      phases.push({ kind: 'attack', start: t, end });
      t = end;
    } else {
      const count = rng.int(cfg.defend.attacksPerPhase[0], cfg.defend.attacksPerPhase[1]);
      const attacks: Array<{ direction: DodgeDirection; telegraphStart: number; impact: number }> = [];
      let cursor = t;
      let previous: DodgeDirection | undefined;
      for (let i = 0; i < count; i++) {
        const impact = cursor + telegraph;
        // Ningún ataque puede quedar cortado por el final del combate
        if (impact + cfg.defend.goodWindow > duration) break;
        let direction = rng.pick(DIRECTIONS);
        if (direction === previous) direction = rng.pick(DIRECTIONS);
        attacks.push({ direction, telegraphStart: cursor, impact });
        previous = direction;
        cursor = impact + cfg.defend.goodWindow + cfg.defend.gapBetweenAttacks;
      }
      if (attacks.length === 0) break;
      phases.push({ kind: 'defend', start: t, end: cursor, attacks });
      t = cursor;
    }
    attacking = !attacking;
  }
  return { duration, phases };
}

// --- Daño -----------------------------------------------------------------------

/** Factor de poder (>1 si el jugador es más fuerte), suavizado y acotado. */
export function powerFactor(playerPower: number, rivalPower: number, cfg: BattleConfig = BATTLE_CONFIG): number {
  const [lo, hi] = cfg.powerRatioClamp;
  const ratio = Math.min(hi, Math.max(lo, playerPower / Math.max(1, rivalPower)));
  return Math.pow(ratio, cfg.powerInfluence);
}

export type DodgeGrade = 'perfect' | 'good' | 'miss';

/** Califica una esquiva según el desfase respecto al impacto y la dirección. */
export function gradeDodge(
  expected: DodgeDirection,
  pressed: DodgeDirection | null,
  offset: number,
  cfg: BattleConfig = BATTLE_CONFIG,
): DodgeGrade {
  if (pressed !== expected) return 'miss';
  const abs = Math.abs(offset);
  if (abs <= cfg.defend.perfectWindow) return 'perfect';
  if (abs <= cfg.defend.goodWindow) return 'good';
  return 'miss';
}

export interface DamageModel {
  /** Daño al rival por cada toque en fase de ataque. */
  tap: number;
  /** Daño que recibe el jugador según la esquiva. */
  taken: Record<DodgeGrade, number>;
  /** Daño al rival al esquivar perfecto (contraataque). */
  counter: number;
}

export function damageModel(
  playerPower: number,
  rivalPower: number,
  ability: DinoAbility,
  cfg: BattleConfig = BATTLE_CONFIG,
): DamageModel {
  const f = powerFactor(playerPower, rivalPower, cfg);
  const tapBonus = ability === 'apex_power' ? cfg.abilities.apex_power.tapMultiplier : 1;
  const counterBonus = ability === 'tail_club' ? cfg.abilities.tail_club.counterMultiplier : 1;
  return {
    tap: cfg.attack.tapDamage * f * tapBonus,
    taken: {
      // El roce solo existe contra rivales más fuertes (f < 1)
      perfect: f < 1 ? cfg.defend.perfectChip / f : 0,
      good: cfg.defend.goodDamage / f,
      miss: cfg.defend.missDamage / f,
    },
    counter: cfg.defend.perfectCounter * f * counterBonus,
  };
}

// --- Resultado ------------------------------------------------------------------

/** Ganador al acabar: quien quede sin vida pierde; si no, gana quien tenga más vida (empate = jugador). */
export function decideWinner(playerHp: number, rivalHp: number): 'player' | 'rival' {
  if (rivalHp <= 0) return 'player';
  if (playerHp <= 0) return 'rival';
  return playerHp >= rivalHp ? 'player' : 'rival';
}

/**
 * Precisión 0–1 que se envía al servidor: mitad ritmo de toques, mitad
 * calidad de las esquivas.
 */
export function battleAccuracy(taps: number, attackSeconds: number, grades: DodgeGrade[]): number {
  // ~6 toques por segundo ya se considera un ritmo excelente
  const tapScore = attackSeconds > 0 ? Math.min(1, taps / (attackSeconds * 6)) : 1;
  const dodgeScore = grades.length
    ? grades.reduce((s, g) => s + (g === 'perfect' ? 1 : g === 'good' ? 0.6 : 0), 0) / grades.length
    : 1;
  return Math.round((tapScore * 0.5 + dodgeScore * 0.5) * 1000) / 1000;
}

/**
 * Efecto en monedas de una batalla (igual que calculará el servidor).
 * @param runCoins monedas de la partida antes de la batalla
 * @param walletCoins saldo total del jugador (solo para multiplyTarget = 'total')
 * @returns variación de las monedas de la partida (puede ser negativa)
 */
export function battleCoinDelta(
  won: boolean,
  runCoins: number,
  walletCoins: number,
  cfg: Pick<BattleConfig, 'winMultiplier' | 'lossPenalty' | 'multiplyTarget' | 'maxGainPerBattle'> = BATTLE_CONFIG,
): number {
  if (!won) return -Math.min(cfg.lossPenalty, Math.max(0, runCoins));
  const base = cfg.multiplyTarget === 'total' ? runCoins + walletCoins : runCoins;
  const gain = Math.floor(base * (cfg.winMultiplier - 1));
  return Math.max(0, Math.min(gain, cfg.maxGainPerBattle));
}
