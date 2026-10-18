/**
 * Validación de partidas en el servidor (sin dependencias: corre en Deno y en
 * los tests de Node).
 *
 * El cliente informa lo que pasó; el servidor:
 *   1. comprueba que sea físicamente posible (tiempo, distancia, monedas),
 *   2. RECALCULA el efecto de cada batalla con sus propias reglas,
 *   3. decide cuántas monedas se acreditan (nunca usa el total del cliente).
 */

export interface AnticheatConfig {
  maxCoinsPerSecond: number;
  maxCoinsPerMeter: number;
  speedStart: number;
  speedMax: number;
  speedRampTime: number;
  sprintBonusMeters: number;
  distanceTolerance: number;
  maxScorePerMeter: number;
  clockToleranceMs: number;
  minRunDurationMs: number;
  maxRunDurationMs: number;
  runExpiryMinutes: number;
  maxBattlesPerRun: number;
}

export interface BattleEconomyConfig {
  coinThreshold: number;
  winMultiplier: number;
  lossPenalty: number;
  multiplyTarget: 'run' | 'total';
  maxGainPerBattle: number;
}

export interface ReportedBattle {
  sequence: number;
  rivalId: string;
  rivalPower: number;
  playerPower: number;
  won: boolean;
  accuracy: number;
  runCoinsBefore: number;
  atMs: number;
}

export interface RunReport {
  runId: string;
  distance: number;
  score: number;
  /** Monedas recogidas en pista (con x2), sin efectos de batalla. */
  coinsCollected: number;
  durationMs: number;
  battles: ReportedBattle[];
}

/** Fila de batalla tal como la espera `finalize_run` (p_battles). */
export interface BattleRow {
  sequence: number;
  rival_id: string;
  rival_power: number;
  player_power: number;
  qte_accuracy: number;
  result: 'win' | 'loss';
  run_coins_before: number;
  coins_delta: number;
  at_ms: number;
}

export type RejectReason =
  | 'invalid_payload'
  | 'run_expired'
  | 'duration_mismatch'
  | 'too_long'
  | 'distance_impossible'
  | 'coins_impossible'
  | 'score_impossible'
  | 'battles_invalid';

export type ValidationResult =
  | { ok: true; coinsAwarded: number; battles: BattleRow[] }
  | { ok: false; reason: RejectReason; detail?: string };

// --- Reglas compartidas con el cliente ------------------------------------------

/** Distancia máxima en `t` s con la curva de velocidad (integral exacta). */
export function maxDistanceAt(t: number, c: Pick<AnticheatConfig, 'speedStart' | 'speedMax' | 'speedRampTime'>): number {
  const k = c.speedRampTime;
  return c.speedStart * t + (c.speedMax - c.speedStart) * (t - k * (1 - Math.exp(-t / k)));
}

/** Efecto en monedas de una batalla. Misma fórmula que el cliente (BattleRules.battleCoinDelta). */
export function battleCoinDelta(won: boolean, runCoins: number, walletCoins: number, cfg: BattleEconomyConfig): number {
  if (!won) return -Math.min(cfg.lossPenalty, Math.max(0, runCoins));
  const base = cfg.multiplyTarget === 'total' ? runCoins + walletCoins : runCoins;
  const gain = Math.floor(base * (cfg.winMultiplier - 1));
  return Math.max(0, Math.min(gain, cfg.maxGainPerBattle));
}

// --- Validación -------------------------------------------------------------------

const isInt = (v: unknown, min = 0): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min;
const isNum = (v: unknown, min = 0): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min;

/** Comprueba la forma del JSON recibido. */
export function parseReport(body: unknown): RunReport | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (typeof b.runId !== 'string' || !/^[0-9a-f-]{36}$/i.test(b.runId)) return null;
  if (!isNum(b.distance) || !isInt(b.score) || !isInt(b.coinsCollected) || !isInt(b.durationMs)) return null;
  if (!Array.isArray(b.battles) || b.battles.length > 1000) return null;
  const battles: ReportedBattle[] = [];
  for (const raw of b.battles) {
    if (!raw || typeof raw !== 'object') return null;
    const x = raw as Record<string, unknown>;
    if (!isInt(x.sequence, 1) || typeof x.rivalId !== 'string' || x.rivalId.length > 40) return null;
    if (!isInt(x.rivalPower, 1) || !isInt(x.playerPower, 1) || typeof x.won !== 'boolean') return null;
    if (!isNum(x.accuracy) || x.accuracy > 1 || !isInt(x.runCoinsBefore) || !isInt(x.atMs)) return null;
    battles.push({
      sequence: x.sequence, rivalId: x.rivalId, rivalPower: x.rivalPower, playerPower: x.playerPower,
      won: x.won, accuracy: x.accuracy, runCoinsBefore: x.runCoinsBefore, atMs: x.atMs,
    });
  }
  return {
    runId: b.runId, distance: b.distance, score: b.score, coinsCollected: b.coinsCollected,
    durationMs: b.durationMs, battles,
  };
}

/**
 * Valida una partida y calcula las monedas a acreditar.
 * @param serverElapsedMs tiempo real (servidor) desde que se abrió la partida
 * @param walletCoins saldo actual (solo para multiplyTarget = 'total')
 */
export function validateRun(
  report: RunReport,
  serverElapsedMs: number,
  walletCoins: number,
  ac: AnticheatConfig,
  battleCfg: BattleEconomyConfig,
): ValidationResult {
  if (serverElapsedMs > ac.runExpiryMinutes * 60_000) return { ok: false, reason: 'run_expired' };
  // El tiempo de carrera (sin pausas ni batallas) no puede superar el tiempo real
  if (report.durationMs > serverElapsedMs + ac.clockToleranceMs) {
    return { ok: false, reason: 'duration_mismatch', detail: `${report.durationMs} > ${serverElapsedMs}` };
  }
  if (report.durationMs > ac.maxRunDurationMs) return { ok: false, reason: 'too_long' };

  const seconds = report.durationMs / 1000;
  const maxDistance = maxDistanceAt(seconds, ac) * (1 + ac.distanceTolerance) + ac.sprintBonusMeters + 5;
  if (report.distance > maxDistance) {
    return { ok: false, reason: 'distance_impossible', detail: `${report.distance.toFixed(0)} > ${maxDistance.toFixed(0)}` };
  }
  if (report.coinsCollected > report.distance * ac.maxCoinsPerMeter + 10 ||
      report.coinsCollected > seconds * ac.maxCoinsPerSecond + 10) {
    return { ok: false, reason: 'coins_impossible' };
  }
  if (report.score > report.distance * ac.maxScorePerMeter + 5) return { ok: false, reason: 'score_impossible' };

  // --- Batallas: se recalcula todo con las reglas del servidor ---
  const battles = report.battles;
  if (battles.length > ac.maxBattlesPerRun) return { ok: false, reason: 'battles_invalid', detail: 'too_many' };
  const rows: BattleRow[] = [];
  let deltaSum = 0;
  let prevCollected = 0;
  let prevAt = -1;
  for (let i = 0; i < battles.length; i++) {
    const b = battles[i];
    if (b.sequence !== i + 1) return { ok: false, reason: 'battles_invalid', detail: 'sequence' };
    if (b.atMs <= prevAt || b.atMs > report.durationMs + ac.clockToleranceMs) {
      return { ok: false, reason: 'battles_invalid', detail: 'time' };
    }
    // Monedas recogidas hasta esta batalla = monedas en mano − efectos de batallas anteriores
    const collectedSoFar = b.runCoinsBefore - deltaSum;
    if (collectedSoFar < prevCollected || collectedSoFar > report.coinsCollected) {
      return { ok: false, reason: 'battles_invalid', detail: 'coins_chain' };
    }
    // La batalla nº k solo puede ocurrir tras recoger k × umbral monedas
    if (collectedSoFar < battleCfg.coinThreshold * b.sequence) {
      return { ok: false, reason: 'battles_invalid', detail: 'threshold' };
    }
    const delta = battleCoinDelta(b.won, b.runCoinsBefore, walletCoins, battleCfg);
    rows.push({
      sequence: b.sequence,
      rival_id: b.rivalId,
      rival_power: b.rivalPower,
      player_power: b.playerPower,
      qte_accuracy: b.accuracy,
      result: b.won ? 'win' : 'loss',
      run_coins_before: b.runCoinsBefore,
      coins_delta: delta,
      at_ms: b.atMs,
    });
    deltaSum += delta;
    prevCollected = collectedSoFar;
    prevAt = b.atMs;
  }

  // Partidas demasiado cortas se guardan pero no dan monedas
  const coinsAwarded = report.durationMs < ac.minRunDurationMs ? 0 : Math.max(0, report.coinsCollected + deltaSum);
  return { ok: true, coinsAwarded, battles: rows };
}
