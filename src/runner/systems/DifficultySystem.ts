import { GAME_CONFIG } from '@/config/game.config';

/**
 * Curvas de dificultad. Funciones puras para poder testearlas y para que el
 * servidor (Fase 5) pueda replicar los mismos límites al validar partidas.
 */
const S = GAME_CONFIG.speed;
const W = GAME_CONFIG.world;

/** Velocidad (m/s) tras `t` segundos de partida. Crece rápido al principio y se estabiliza. */
export function speedAt(t: number): number {
  return S.start + (S.max - S.start) * (1 - Math.exp(-Math.max(0, t) / S.rampTime));
}

/** Dificultad 0–1 en función de la distancia recorrida. */
export function difficultyAt(distance: number): number {
  return Math.min(1, Math.max(0, (distance - W.safeStart) / GAME_CONFIG.difficulty.fullAtDistance));
}

/** Tiempo de reacción entre filas según la dificultad. */
export function reactionTimeAt(difficulty: number): number {
  const { easy, hard } = W.rowReactionTime;
  return easy + (hard - easy) * difficulty;
}

/**
 * Separación mínima entre filas. Siempre deja al menos `hard` segundos para
 * reaccionar a la velocidad dada (nunca baja de minRowSpacing).
 */
export function rowSpacing(speed: number, difficulty: number): number {
  return Math.max(W.minRowSpacing, speed * reactionTimeAt(difficulty));
}

/** Máximo teórico de distancia en `t` segundos (útil para validar partidas). */
export function maxDistanceAt(t: number): number {
  // Integral de speedAt: start·t + (max−start)·(t − rampTime·(1 − e^(−t/rampTime)))
  const k = S.rampTime;
  return S.start * t + (S.max - S.start) * (t - k * (1 - Math.exp(-t / k)));
}
