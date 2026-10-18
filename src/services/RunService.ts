import type { BattleResult } from '@/battle/BattleController';
import type { DinoId } from '@/config/dinos.config';
import type { AuthService } from './AuthService';
import { BackendError, callFunction } from './supabaseClient';

export interface StartedRun {
  runId: string;
  seed: number;
}

export interface RunReportInput {
  distance: number;
  score: number;
  coinsCollected: number;
  durationMs: number;
  battles: BattleResult[];
}

export type FinishResult =
  | { status: 'finished'; awarded: number; coins: number; newRecord: boolean }
  | { status: 'rejected'; reason: string; coins: number }
  | { status: 'error'; code: string };

const CLIENT_VERSION = `web-${import.meta.env.MODE}`;
const START_TIMEOUT_MS = 4000;

/**
 * Partidas guardadas en el servidor: `start-run` entrega la semilla y abre la
 * partida; `finish-run` la valida y acredita las monedas. Sin sesión (invitado)
 * o sin backend, las partidas no se guardan.
 */
export class RunService {
  private current: StartedRun | null = null;

  constructor(private readonly auth: AuthService | null) {}

  /**
   * Abre una partida. Devuelve null si no se guardará (invitado, sin backend o
   * sin conexión): en ese caso se juega igual con una semilla local.
   */
  async start(dinoId: DinoId): Promise<StartedRun | null> {
    this.current = null;
    if (!this.auth?.user) return null;
    try {
      const run = await withTimeout(callFunction<StartedRun>('start-run', { dinoId, clientVersion: CLIENT_VERSION }), START_TIMEOUT_MS);
      this.current = run;
      return run;
    } catch (err) {
      console.warn('[partidas] no se pudo abrir en el servidor', err);
      return null;
    }
  }

  /** ¿La partida en curso se está guardando en el servidor? */
  get isTracked(): boolean {
    return this.current !== null;
  }

  async finish(input: RunReportInput): Promise<FinishResult | null> {
    const run = this.current;
    this.current = null;
    if (!run) return null;
    try {
      return await callFunction<FinishResult>('finish-run', {
        runId: run.runId,
        distance: Math.floor(input.distance),
        score: input.score,
        coinsCollected: input.coinsCollected,
        durationMs: input.durationMs,
        battles: input.battles.map((b) => ({
          sequence: b.sequence,
          rivalId: b.rivalId,
          rivalPower: b.rivalPower,
          playerPower: b.playerPower,
          won: b.won,
          accuracy: b.accuracy,
          runCoinsBefore: b.runCoinsBefore,
          atMs: b.atMs,
        })),
      });
    } catch (err) {
      return { status: 'error', code: err instanceof BackendError ? err.code : 'NETWORK' };
    }
  }

  /** Abandona la partida (p. ej. salir al menú): no se envía. */
  discard(): void {
    this.current = null;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new BackendError('TIMEOUT')), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}
