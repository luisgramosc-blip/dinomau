import { describe, expect, it } from 'vitest';
import { BATTLE_CONFIG } from '@/config/battle.config';
import { DINOS } from '@/config/dinos.config';
import { GAME_CONFIG } from '@/config/game.config';
import { ABILITY_CONFIG, STAT_EFFECTS } from '@/config/dinos.config';
import { readServerConfig, readServerDinoPrices } from './serverConfig';

/**
 * El servidor es la autoridad, pero el cliente necesita los mismos números para
 * que la experiencia coincida. Si alguien cambia uno sin el otro, esto falla.
 */
describe('configuración cliente ↔ servidor', () => {
  it('precios y estadísticas de dinos', () => {
    const prices = readServerDinoPrices();
    for (const d of DINOS) expect(prices[d.id], d.id).toBe(d.price);
    expect(Object.keys(prices).length).toBe(DINOS.length);
  });

  it('reglas económicas de batalla', () => {
    const server = readServerConfig<Record<string, unknown>>('battle');
    for (const k of ['coinThreshold', 'winMultiplier', 'lossPenalty', 'multiplyTarget', 'maxGainPerBattle'] as const) {
      expect(server[k], k).toBe(BATTLE_CONFIG[k]);
    }
  });

  it('curva de velocidad y límites del antitrampas', () => {
    const ac = readServerConfig<Record<string, number>>('anticheat');
    expect(ac.speedStart).toBe(GAME_CONFIG.speed.start);
    expect(ac.speedMax).toBe(GAME_CONFIG.speed.max);
    expect(ac.speedRampTime).toBe(GAME_CONFIG.speed.rampTime);
    // El sprint del Gallimimus añade como mucho distancia × (multiplicador − 1)
    const sprint = ABILITY_CONFIG.fast_runner;
    expect(ac.sprintBonusMeters).toBeGreaterThanOrEqual(Math.round(sprint.sprintDistance * (sprint.speedMultiplier - 1)));
    // Puntaje máximo por metro ≥ el del dino más rápido
    const maxSpeed = Math.max(...DINOS.map((d) => d.speed));
    expect(ac.maxScorePerMeter).toBeGreaterThanOrEqual(1 + (maxSpeed - 3) * STAT_EFFECTS.scorePerSpeedPoint);
  });
});
