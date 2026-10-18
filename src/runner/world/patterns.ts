import { OBSTACLES, type ObstacleType } from '@/config/obstacles.config';

/**
 * Plantillas de filas de obstáculos. Cada letra es un carril:
 *   B = bloqueo (roca, árbol o géiser: hay que cambiar de carril)
 *   J = tronco (saltar)
 *   R = rama baja o pterodáctilo (rodar)
 *   W = río (saltar; el Spinosaurus nada)
 *   . = libre
 *
 * El orden de los carriles se baraja al usar la plantilla. Regla de oro:
 * ninguna plantilla puede tener los 3 carriles en 'B' (siempre hay salida).
 *
 * Para añadir variedad basta con añadir filas aquí.
 */
export type LaneSymbol = 'B' | 'J' | 'R' | 'W' | '.';

export interface RowTemplate {
  lanes: [LaneSymbol, LaneSymbol, LaneSymbol];
  weight: number;
  /** Dificultad mínima (0–1) a partir de la cual aparece. */
  minDifficulty: number;
  /** Si es false, se usa tal cual sin barajar (patrones simétricos). */
  shuffle?: boolean;
}

export const ROW_TEMPLATES: RowTemplate[] = [
  { lanes: ['B', '.', '.'], weight: 6, minDifficulty: 0 },
  { lanes: ['J', '.', '.'], weight: 4, minDifficulty: 0 },
  { lanes: ['R', '.', '.'], weight: 3, minDifficulty: 0 },
  { lanes: ['.', '.', '.'], weight: 2, minDifficulty: 0 }, // fila solo de monedas
  { lanes: ['B', 'B', '.'], weight: 4, minDifficulty: 0.1 },
  { lanes: ['J', 'J', 'J'], weight: 2, minDifficulty: 0.1, shuffle: false },
  { lanes: ['R', 'R', 'R'], weight: 2, minDifficulty: 0.2, shuffle: false },
  { lanes: ['B', 'J', '.'], weight: 3, minDifficulty: 0.2 },
  { lanes: ['J', 'R', '.'], weight: 2, minDifficulty: 0.25 },
  { lanes: ['B', 'J', 'B'], weight: 2, minDifficulty: 0.35, shuffle: false },
  { lanes: ['B', 'R', 'B'], weight: 2, minDifficulty: 0.4, shuffle: false },
  { lanes: ['B', 'J', 'R'], weight: 3, minDifficulty: 0.45 },
  { lanes: ['B', 'B', 'J'], weight: 3, minDifficulty: 0.55 },
  { lanes: ['B', 'B', 'R'], weight: 3, minDifficulty: 0.6 },
  // Zona de río: cruza los 3 carriles
  { lanes: ['W', 'W', 'W'], weight: 2, minDifficulty: 0.1, shuffle: false },
];

/**
 * Variantes de cada símbolo con su peso. Las que tienen `minDifficulty` solo
 * aparecen a partir de esa dificultad (ver OBSTACLES).
 */
const SYMBOL_VARIANTS: Record<Exclude<LaneSymbol, '.'>, Array<{ type: ObstacleType; weight: number }>> = {
  B: [
    { type: 'rock', weight: 5 },
    { type: 'tree', weight: 3 },
    { type: 'geyser', weight: 2 },
  ],
  J: [{ type: 'log', weight: 1 }],
  W: [{ type: 'river', weight: 1 }],
  R: [
    { type: 'lowBranch', weight: 3 },
    { type: 'pterodactyl', weight: 2 },
  ],
};

/**
 * Convierte un símbolo en un tipo de obstáculo.
 * @param roll número aleatorio en [0, 1)
 */
export function symbolToObstacle(symbol: LaneSymbol, roll: number, difficulty = 1): ObstacleType | null {
  if (symbol === '.') return null;
  const options = SYMBOL_VARIANTS[symbol].filter((v) => OBSTACLES[v.type].minDifficulty <= difficulty);
  const total = options.reduce((sum, v) => sum + v.weight, 0);
  let r = roll * total;
  for (const v of options) {
    r -= v.weight;
    if (r < 0) return v.type;
  }
  return options[options.length - 1].type;
}

/** Una fila es justa si al menos un carril no es un bloqueo total. */
export function isRowPassable(lanes: readonly LaneSymbol[]): boolean {
  return lanes.some((s) => s !== 'B');
}
