import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '@/config/game.config';
import { difficultyAt, maxDistanceAt, speedAt } from '@/runner/systems/DifficultySystem';

describe('DifficultySystem', () => {
  it('la velocidad empieza en start, crece y nunca supera max', () => {
    expect(speedAt(0)).toBe(GAME_CONFIG.speed.start);
    let prev = 0;
    for (let t = 0; t < 2000; t += 5) {
      const v = speedAt(t);
      expect(v).toBeGreaterThanOrEqual(prev);
      expect(v).toBeLessThanOrEqual(GAME_CONFIG.speed.max);
      prev = v;
    }
    expect(speedAt(60)).toBeGreaterThan(17);
    expect(speedAt(60)).toBeLessThan(21);
  });

  it('la dificultad va de 0 a 1', () => {
    expect(difficultyAt(0)).toBe(0);
    expect(difficultyAt(1e6)).toBe(1);
  });

  it('maxDistanceAt coincide con integrar la velocidad', () => {
    let d = 0;
    const dt = 0.01;
    for (let t = 0; t < 120; t += dt) d += speedAt(t + dt / 2) * dt;
    expect(Math.abs(d - maxDistanceAt(120))).toBeLessThan(1);
  });
});
