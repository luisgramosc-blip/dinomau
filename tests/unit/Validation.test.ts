import { describe, expect, it } from 'vitest';
import {
  battleCoinDelta, maxDistanceAt, parseReport, validateRun,
  type AnticheatConfig, type BattleEconomyConfig, type RunReport,
} from '../../supabase/functions/_shared/validation.ts';
import { readServerConfig } from './serverConfig';

const AC = readServerConfig<AnticheatConfig>('anticheat');
const BATTLE = readServerConfig<BattleEconomyConfig>('battle');

const RUN_ID = '11111111-2222-3333-4444-555555555555';
const base = (over: Partial<RunReport> = {}): RunReport => ({
  runId: RUN_ID, distance: 1500, score: 1500, coinsCollected: 600, durationMs: 80_000, battles: [], ...over,
});
const battle = (seq: number, runCoinsBefore: number, won: boolean, atMs = seq * 10_000) => ({
  sequence: seq, rivalId: 'dilophosaurus', rivalPower: 10, playerPower: 8, won, accuracy: 0.8, runCoinsBefore, atMs,
});

describe('validateRun', () => {
  it('acepta una partida normal y acredita lo recogido', () => {
    expect(validateRun(base(), 90_000, 0, AC, BATTLE)).toEqual({ ok: true, coinsAwarded: 600, battles: [] });
  });

  it('rechaza si dice haber jugado más tiempo del que pasó en el servidor', () => {
    const r = validateRun(base({ durationMs: 120_000 }), 60_000, 0, AC, BATTLE);
    expect(r).toMatchObject({ ok: false, reason: 'duration_mismatch' });
  });

  it('rechaza distancias imposibles para el tiempo jugado', () => {
    const r = validateRun(base({ distance: 5000, score: 5000 }), 90_000, 0, AC, BATTLE);
    expect(r).toMatchObject({ ok: false, reason: 'distance_impossible' });
  });

  it('acepta la distancia máxima real (velocidad tope + sprint del Gallimimus)', () => {
    const d = maxDistanceAt(80, AC) + 140;
    expect(validateRun(base({ distance: d, score: Math.floor(d) }), 90_000, 0, AC, BATTLE).ok).toBe(true);
  });

  it('rechaza demasiadas monedas por metro', () => {
    const r = validateRun(base({ coinsCollected: 5000 }), 90_000, 0, AC, BATTLE);
    expect(r).toMatchObject({ ok: false, reason: 'coins_impossible' });
  });

  it('rechaza puntajes inflados', () => {
    expect(validateRun(base({ score: 99_999 }), 90_000, 0, AC, BATTLE)).toMatchObject({ reason: 'score_impossible' });
  });

  it('recalcula las batallas con las reglas del servidor (ignora lo que diga el cliente)', () => {
    // Recoge 550, gana (550 → 1100), recoge 50 más → 1150
    const r = validateRun(base({ coinsCollected: 600, battles: [battle(1, 550, true)] }), 90_000, 0, AC, BATTLE);
    expect(r).toMatchObject({ ok: true, coinsAwarded: 1150 });
    if (r.ok) expect(r.battles[0]).toMatchObject({ coins_delta: 550, result: 'win', run_coins_before: 550 });
  });

  it('aplica la penalización por perder', () => {
    const r = validateRun(base({ coinsCollected: 600, battles: [battle(1, 520, false)] }), 90_000, 0, AC, BATTLE);
    expect(r).toMatchObject({ ok: true, coinsAwarded: 500 });
  });

  it('respeta el tope de ganancia por batalla', () => {
    const report = base({ distance: 20_000, score: 20_000, coinsCollected: 9000, durationMs: 900_000, battles: [battle(1, 9000, true)] });
    const r = validateRun(report, 1_000_000, 0, AC, BATTLE);
    expect(r).toMatchObject({ ok: true, coinsAwarded: 9000 + BATTLE.maxGainPerBattle });
  });

  it('rechaza batallas antes del umbral de monedas', () => {
    const r = validateRun(base({ battles: [battle(1, 100, true)] }), 90_000, 0, AC, BATTLE);
    expect(r).toMatchObject({ ok: false, reason: 'battles_invalid', detail: 'threshold' });
  });

  it('rechaza monedas de batalla inventadas (cadena incoherente)', () => {
    // Dice tener 5.000 antes de la batalla habiendo recogido solo 600
    const r = validateRun(base({ battles: [battle(1, 5000, true)] }), 90_000, 0, AC, BATTLE);
    expect(r).toMatchObject({ ok: false, reason: 'battles_invalid', detail: 'coins_chain' });
  });

  it('rechaza secuencias desordenadas o duplicadas', () => {
    const report = base({ coinsCollected: 1200, battles: [battle(1, 500, true), battle(1, 1600, true)] });
    expect(validateRun(report, 90_000, 0, AC, BATTLE)).toMatchObject({ reason: 'battles_invalid' });
  });

  it('acepta dos batallas encadenadas correctamente', () => {
    // 500 → gana → 1000; recoge 500 más (total recogido 1000) → 1500 → pierde → 1400; recoge 100 → 1500
    const report = base({ distance: 3000, score: 3000, coinsCollected: 1100, durationMs: 160_000, battles: [battle(1, 500, true, 30_000), battle(2, 1500, false, 90_000)] });
    expect(validateRun(report, 200_000, 0, AC, BATTLE)).toMatchObject({ ok: true, coinsAwarded: 1500 });
  });

  it('las partidas demasiado cortas no dan monedas', () => {
    const r = validateRun(base({ distance: 20, score: 20, coinsCollected: 5, durationMs: 1500 }), 3000, 0, AC, BATTLE);
    expect(r).toMatchObject({ ok: true, coinsAwarded: 0 });
  });

  it('rechaza partidas caducadas', () => {
    expect(validateRun(base(), AC.runExpiryMinutes * 60_000 + 1, 0, AC, BATTLE)).toMatchObject({ reason: 'run_expired' });
  });
});

describe('parseReport', () => {
  it('rechaza payloads mal formados', () => {
    expect(parseReport(null)).toBeNull();
    expect(parseReport({ ...base(), runId: 'x' })).toBeNull();
    expect(parseReport({ ...base(), coinsCollected: -5 })).toBeNull();
    expect(parseReport({ ...base(), coinsCollected: 1.5 })).toBeNull();
    expect(parseReport({ ...base(), battles: [{ ...battle(1, 500, true), accuracy: 2 }] })).toBeNull();
    expect(parseReport(base())).not.toBeNull();
  });
});

describe('battleCoinDelta del servidor', () => {
  it('coincide con la fórmula del cliente', async () => {
    const client = await import('@/battle/BattleRules');
    for (const [won, run, wallet] of [[true, 600, 0], [false, 600, 0], [false, 30, 0], [true, 9000, 0]] as const) {
      expect(battleCoinDelta(won, run, wallet, BATTLE)).toBe(client.battleCoinDelta(won, run, wallet));
    }
  });
});
