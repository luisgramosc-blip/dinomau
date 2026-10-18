/**
 * Parámetros generales del runner. Todas las distancias en metros, tiempos en
 * segundos y velocidades en m/s.
 *
 * Convención de ejes (Three.js): el jugador corre hacia −Z, +Y es arriba y los
 * carriles se reparten en X. El jugador permanece en z = 0 y es el mundo el que
 * se desplaza hacia +Z (evita problemas de precisión en partidas largas).
 */
export const GAME_CONFIG = {
  lanes: {
    count: 3,
    width: 2.2,
    /** Tiempo para cambiar de un carril al contiguo. */
    changeTime: 0.13,
  },

  player: {
    /** Caja de colisión de pie / rodando. */
    width: 0.8,
    depth: 0.8,
    height: 1.6,
    rollHeight: 0.7,
    jumpHeight: 1.8,
    gravity: 42,
    /** Gravedad extra al deslizar hacia abajo en el aire (caída rápida). */
    fastFallGravity: 140,
    rollDuration: 0.65,
    /** Una entrada de salto recibida justo antes de aterrizar se ejecuta al tocar suelo. */
    inputBuffer: 0.15,
  },

  speed: {
    start: 13,
    max: 32,
    /**
     * Constante de tiempo (s) de la curva de velocidad:
     * v(t) = start + (max − start) · (1 − e^(−t / rampTime)).
     * Con 150 s: ~19 m/s al minuto, ~24 a los 2 min, ~28 a los 4 min.
     */
    rampTime: 150,
  },

  difficulty: {
    /** Metros (desde el final de la zona segura) hasta llegar a dificultad máxima. */
    fullAtDistance: 3000,
  },

  world: {
    /** Longitud de cada tramo de suelo reciclable. */
    tileLength: 20,
    /** Distancia hacia delante en la que se generan obstáculos. */
    spawnAhead: 130,
    /** Los objetos que pasan esta z (detrás de la cámara) vuelven al pool. */
    despawnZ: 12,
    /**
     * Tiempo de reacción entre filas de obstáculos (se convierte en metros
     * según la velocidad). Se interpola de `easy` a `hard` con la dificultad.
     */
    rowReactionTime: { easy: 1.05, hard: 0.78 },
    minRowSpacing: 13,
    /** Primeros metros sin obstáculos para que el jugador se ubique. */
    safeStart: 45,
  },

  coins: {
    spacing: 1.7,
    height: 0.9,
    radius: 0.42,
    /** Radio de recogida (más generoso que el visual para que se sienta bien). */
    pickupRadius: 0.9,
  },

  camera: {
    height: 4.3,
    distance: 7.6,
    lookAhead: 7,
    lookHeight: 1.1,
    /** FOV vertical base y límites; en vertical (móvil) se amplía para ver los 3 carriles. */
    baseFov: 62,
    minHorizontalFov: 50,
    maxFov: 84,
    followLerp: 10,
  },

  render: {
    maxPixelRatio: 2,
    fogNear: 45,
    fogFar: 135,
  },

  /** Puntos por metro recorrido. */
  scorePerMeter: 1,
} as const;

export type GameConfig = typeof GAME_CONFIG;

/** Posición X del centro de un carril (0 = izquierda, 1 = centro, 2 = derecha). */
export function laneX(lane: number): number {
  return (lane - (GAME_CONFIG.lanes.count - 1) / 2) * GAME_CONFIG.lanes.width;
}
