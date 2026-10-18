import type { BattleResult } from '@/battle/BattleController';
import type { DinoId } from '@/config/dinos.config';

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

/** Registro de partidas en el servidor (RunService) o nada (modo local). */
export interface RunTracker {
  start(dinoId: DinoId): Promise<StartedRun | null>;
  readonly isTracked: boolean;
  finish(input: RunReportInput): Promise<FinishResult | null>;
  discard(): void;
}

/** Modo local: las partidas no se registran en ningún servidor. */
export const localRunTracker: RunTracker = {
  start: async () => null,
  isTracked: false,
  finish: async () => null,
  discard: () => {},
};
