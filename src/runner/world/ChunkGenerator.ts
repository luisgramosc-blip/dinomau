import { GAME_CONFIG } from '@/config/game.config';
import type { ObstacleType } from '@/config/obstacles.config';
import { POWERUPS, POWERUP_CONFIG, type PowerUpType } from '@/config/powerups.config';
import { SeededRandom } from '@/core/SeededRandom';
import { difficultyAt, rowSpacing } from '../systems/DifficultySystem';
import { isRowPassable, ROW_TEMPLATES, symbolToObstacle, type LaneSymbol } from './patterns';

/**
 * Generador procedural del recorrido. Es lógica pura (no toca Three.js):
 * devuelve órdenes de aparición con la distancia absoluta (en metros desde el
 * inicio de la partida) donde va cada objeto. Con la misma semilla y la misma
 * velocidad produce siempre el mismo recorrido.
 */
export type SpawnCommand =
  | { kind: 'obstacle'; type: ObstacleType; lane: number; d: number }
  | { kind: 'coin'; lane: number; d: number; y: number }
  | { kind: 'powerup'; type: PowerUpType; lane: number; d: number };

const W = GAME_CONFIG.world;
const C = GAME_CONFIG.coins;
const LANES = GAME_CONFIG.lanes.count;
const POWERUP_LIST = Object.values(POWERUPS);
/** Probabilidad de que una fila con obstáculos traiga monedas. */
const COIN_ROW_CHANCE = 0.9;
/** Probabilidad de una segunda línea de monedas en otro carril. */
const SECOND_LINE_CHANCE = 0.4;

export class ChunkGenerator {
  private readonly rng: SeededRandom;
  private nextRowD: number;
  private lastPowerUpD = -Infinity;

  constructor(seed: number) {
    this.rng = new SeededRandom(seed);
    this.nextRowD = W.safeStart;
  }

  /**
   * Genera filas hasta `untilD` y las añade a `out`.
   * @param speed velocidad actual (afecta a la separación entre filas)
   */
  generateUntil(untilD: number, speed: number, out: SpawnCommand[]): void {
    while (this.nextRowD < untilD) {
      const d = this.nextRowD;
      const spacing = rowSpacing(speed, difficultyAt(d)) * this.rng.range(1, 1.45);
      this.generateRow(d, spacing, out);
      this.nextRowD = d + spacing;
    }
  }

  private generateRow(d: number, spacing: number, out: SpawnCommand[]): void {
    const rowStart = out.length;
    const difficulty = difficultyAt(d);
    const candidates = ROW_TEMPLATES.filter((t) => t.minDifficulty <= difficulty);
    const template = this.rng.weighted(candidates, (t) => t.weight);
    const lanes = [...template.lanes] as LaneSymbol[];
    if (template.shuffle !== false) this.rng.shuffle(lanes);
    if (!isRowPassable(lanes)) lanes[this.rng.int(0, LANES - 1)] = '.';

    lanes.forEach((symbol, lane) => {
      const type = symbolToObstacle(symbol, this.rng.next(), difficulty);
      if (type) out.push({ kind: 'obstacle', type, lane, d });
    });

    this.placeCoins(d, spacing, lanes, out);
    this.maybePlacePowerUp(d, spacing, lanes, out, rowStart);
  }

  private placeCoins(d: number, spacing: number, lanes: LaneSymbol[], out: SpawnCommand[]): void {
    const allFree = lanes.every((s) => s === '.');
    if (!allFree && !this.rng.chance(COIN_ROW_CHANCE)) return;

    const options = this.rng.shuffle(lanes.map((s, i) => ({ s, i })).filter((o) => o.s !== 'B'));
    // Las monedas nunca deben invadir la fila siguiente
    const maxLength = spacing - 5;

    if (allFree) {
      this.placeLongLine(d, maxLength, options[0].i, out);
      return;
    }
    this.placeLaneCoins(d, maxLength, options[0].s, options[0].i, out);
    // A veces, una segunda línea en otro carril libre (premia arriesgarse)
    if (options.length > 1 && this.rng.chance(SECOND_LINE_CHANCE)) {
      this.placeLaneCoins(d, maxLength, options[1].s, options[1].i, out);
    }
  }

  /** Monedas que atraviesan la fila en un carril: arco sobre el tronco o línea recta. */
  private placeLaneCoins(d: number, maxLength: number, s: LaneSymbol, lane: number, out: SpawnCommand[]): void {
    if (s === 'J' || s === 'W') {
      // Arco sobre el tronco o el río: sigue la trayectoria de un salto
      const n = 7;
      const half = (n - 1) / 2;
      for (let k = 0; k < n; k++) {
        const t = (k - half) / (half + 0.6);
        out.push({ kind: 'coin', lane, d: d + (k - half) * C.spacing, y: C.height + 1.5 * (1 - t * t) });
      }
      return;
    }
    // Línea recta que pasa por la fila (por debajo de la rama si toca rodar)
    const count = Math.min(this.rng.int(7, 12), Math.floor(maxLength / C.spacing));
    const start = d - Math.floor(count / 2) * C.spacing;
    for (let k = 0; k < count; k++) {
      const cd = start + k * C.spacing;
      const underBranch = s === 'R' && Math.abs(cd - d) < 1.5;
      out.push({ kind: 'coin', lane, d: cd, y: underBranch ? 0.45 : C.height });
    }
  }

  /** Fila solo de monedas: línea larga que puede cambiar de carril a mitad. */
  private placeLongLine(d: number, maxLength: number, lane: number, out: SpawnCommand[]): void {
    const count = Math.min(18, Math.floor(maxLength / C.spacing));
    let current = lane;
    const switchAt = this.rng.chance(0.5) ? Math.floor(count / 2) : -1;
    for (let k = 0; k < count; k++) {
      if (k === switchAt) current = Math.max(0, Math.min(LANES - 1, current + (this.rng.chance(0.5) ? 1 : -1)));
      out.push({ kind: 'coin', lane: current, d: d - 4 + k * C.spacing, y: C.height });
    }
  }

  /** Power-up a mitad de camino hasta la fila siguiente, en un carril sin bloqueo. */
  private maybePlacePowerUp(
    d: number,
    spacing: number,
    lanes: LaneSymbol[],
    out: SpawnCommand[],
    rowStart: number,
  ): void {
    if (d < POWERUP_CONFIG.minDistance || d - this.lastPowerUpD < POWERUP_CONFIG.minGap) return;
    if (!this.rng.chance(POWERUP_CONFIG.spawnChancePerRow)) return;

    const free = lanes.map((s, i) => ({ s, i })).filter((o) => o.s !== 'B');
    const lane = this.rng.pick(free).i;
    const pd = d + spacing * 0.5;
    const type = this.rng.weighted(POWERUP_LIST, (p) => p.weight).type;

    // Quita las monedas de esta fila que ocuparían su sitio
    for (let k = out.length - 1; k >= rowStart; k--) {
      const c = out[k];
      if (c.kind === 'coin' && c.lane === lane && Math.abs(c.d - pd) < 1.5) out.splice(k, 1);
    }
    out.push({ kind: 'powerup', type, lane, d: pd });
    this.lastPowerUpD = d;
  }
}
