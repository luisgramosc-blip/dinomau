/**
 * Tipos de obstáculo y su caja de colisión.
 *
 * `avoid` indica cómo se supera:
 *   - 'jump'   → saltar por encima (la caja es baja)
 *   - 'roll'   → agacharse por debajo (la caja empieza en altura)
 *   - 'dodge'  → cambiar de carril (demasiado alto para saltarlo)
 *
 * Comportamientos especiales (ver runner/entities/obstacleBehaviors.ts):
 *   - pterodactyl: baja en picada hasta vuelo rasante al acercarse.
 *   - geyser: erupciona de forma intermitente; solo hace daño en erupción.
 *   - river: franja de agua que cruza el camino; hay que saltarla
 *     (el Spinosaurus la cruza nadando).
 */
export type ObstacleType = 'log' | 'lowBranch' | 'rock' | 'tree' | 'pterodactyl' | 'geyser' | 'river';
export type AvoidMethod = 'jump' | 'roll' | 'dodge';

export interface ObstacleDefinition {
  type: ObstacleType;
  avoid: AvoidMethod;
  /** Caja de colisión: ancho (X), alto (Y), fondo (Z) y altura de la base. */
  hitbox: { width: number; height: number; depth: number; baseY: number };
  /** Instancias pre-creadas en el pool. */
  poolSize: number;
  /** Dificultad mínima (0–1) a partir de la que puede aparecer. */
  minDifficulty: number;
}

export const OBSTACLES: Record<ObstacleType, ObstacleDefinition> = {
  log: {
    type: 'log', avoid: 'jump', minDifficulty: 0,
    hitbox: { width: 1.9, height: 0.75, depth: 0.8, baseY: 0 },
    poolSize: 18,
  },
  lowBranch: {
    type: 'lowBranch', avoid: 'roll', minDifficulty: 0,
    hitbox: { width: 2.0, height: 1.6, depth: 0.6, baseY: 1.0 },
    poolSize: 18,
  },
  rock: {
    type: 'rock', avoid: 'dodge', minDifficulty: 0,
    hitbox: { width: 1.7, height: 2.6, depth: 1.6, baseY: 0 },
    poolSize: 18,
  },
  tree: {
    type: 'tree', avoid: 'dodge', minDifficulty: 0,
    hitbox: { width: 1.3, height: 4, depth: 1.3, baseY: 0 },
    poolSize: 14,
  },
  pterodactyl: {
    type: 'pterodactyl', avoid: 'roll', minDifficulty: 0.2,
    hitbox: { width: 1.8, height: 1.3, depth: 1.0, baseY: 1.0 },
    poolSize: 10,
  },
  geyser: {
    type: 'geyser', avoid: 'dodge', minDifficulty: 0.3,
    hitbox: { width: 1.4, height: 5, depth: 1.4, baseY: 0 },
    poolSize: 10,
  },
  river: {
    type: 'river', avoid: 'jump', minDifficulty: 0.1,
    // Ocupa todo el carril (2,2 m) para que tres piezas formen un río continuo
    hitbox: { width: 2.2, height: 0.3, depth: 2.4, baseY: 0 },
    poolSize: 12,
  },
};

/** Ciclo del géiser (s): reposo → aviso (burbujeo) → erupción. */
export const GEYSER_CYCLE = { rest: 1.1, warning: 0.45, erupt: 1.0 } as const;

/** Picada del pterodáctilo: altura inicial y distancia (m) a la que termina de bajar. */
export const PTERODACTYL_FLIGHT = { startHeight: 7, diveStartZ: -55, diveEndZ: -18, cruiseY: 1.0 } as const;
