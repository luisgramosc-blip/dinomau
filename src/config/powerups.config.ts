/**
 * Power-ups. Duraciones en segundos.
 * Al recoger uno que ya está activo, su tiempo se reinicia (no se acumula).
 */
export type PowerUpType = 'magnet' | 'shield' | 'multiplier' | 'superJump';

export interface PowerUpDefinition {
  type: PowerUpType;
  duration: number;
  /** Peso relativo al elegir cuál aparece. */
  weight: number;
  /** Color principal (placeholder y HUD). */
  color: number;
  /** Emoji del HUD hasta que haya iconos reales en public/assets/ui. */
  icon: string;
}

export const POWERUPS: Record<PowerUpType, PowerUpDefinition> = {
  magnet: { type: 'magnet', duration: 10, weight: 3, color: 0xe8413c, icon: '🧲' },
  shield: { type: 'shield', duration: 15, weight: 2, color: 0xff9d1c, icon: '🛡️' },
  multiplier: { type: 'multiplier', duration: 12, weight: 2, color: 0x9b59d6, icon: '💎' },
  superJump: { type: 'superJump', duration: 10, weight: 2, color: 0x2fa8e0, icon: '🦘' },
};

export const POWERUP_CONFIG = {
  /** Probabilidad de que una fila traiga un power-up. */
  spawnChancePerRow: 0.07,
  /** Metros iniciales sin power-ups. */
  minDistance: 150,
  /** Distancia mínima entre dos power-ups. */
  minGap: 220,
  magnet: {
    /** Alcance hacia delante (m) y velocidad de atracción (m/s). */
    range: 9,
    pullSpeed: 32,
  },
  shield: {
    /** Invulnerabilidad tras romperse el escudo. */
    graceTime: 1.2,
  },
  multiplier: { factor: 2 },
  superJump: {
    /** Altura del salto con el power-up (supera rocas y árboles). */
    jumpHeight: 4.8,
  },
} as const;
