import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '@/config/game.config';
import { OBSTACLES } from '@/config/obstacles.config';
import { ChunkGenerator, type SpawnCommand } from '@/runner/world/ChunkGenerator';
import { ROW_TEMPLATES, isRowPassable, symbolToObstacle } from '@/runner/world/patterns';
import { difficultyAt, rowSpacing } from '@/runner/systems/DifficultySystem';
import { POWERUP_CONFIG } from '@/config/powerups.config';

function generate(seed: number, until: number, speed: number): SpawnCommand[] {
  const out: SpawnCommand[] = [];
  new ChunkGenerator(seed).generateUntil(until, speed, out);
  return out;
}

describe('patrones', () => {
  it('ninguna plantilla bloquea los 3 carriles', () => {
    for (const t of ROW_TEMPLATES) expect(isRowPassable(t.lanes)).toBe(true);
  });
});

describe('symbolToObstacle', () => {
  it('respeta la dificultad mínima de cada variante', () => {
    for (let r = 0; r < 1; r += 0.01) {
      expect(['rock', 'tree']).toContain(symbolToObstacle('B', r, 0));
      expect(symbolToObstacle('R', r, 0)).toBe('lowBranch');
    }
    const late = new Set(Array.from({ length: 100 }, (_, i) => symbolToObstacle('B', i / 100, 1)));
    expect(late.has('geyser')).toBe(true);
  });
});

describe('ChunkGenerator', () => {
  it('es determinista', () => {
    expect(generate(99, 2000, 20)).toEqual(generate(99, 2000, 20));
  });

  it('respeta la zona segura inicial', () => {
    const cmds = generate(1, 500, 13).filter((c) => c.kind === 'obstacle');
    expect(Math.min(...cmds.map((c) => c.d))).toBeGreaterThanOrEqual(GAME_CONFIG.world.safeStart);
  });

  it('siempre deja al menos un carril sin bloqueo total en cada fila', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const rows = new Map<number, string[]>();
      for (const c of generate(seed, 6000, 30)) {
        if (c.kind !== 'obstacle') continue;
        const list = rows.get(c.d) ?? [];
        list.push(OBSTACLES[c.type].avoid);
        rows.set(c.d, list);
      }
      for (const avoids of rows.values()) {
        expect(avoids.filter((a) => a === 'dodge').length).toBeLessThan(GAME_CONFIG.lanes.count);
      }
    }
  });

  it('separa las filas lo suficiente para reaccionar a la velocidad dada', () => {
    const speed = 30;
    const ds = [...new Set(generate(3, 5000, speed).filter((c) => c.kind === 'obstacle').map((c) => c.d))].sort((a, b) => a - b);
    for (let i = 1; i < ds.length; i++) {
      expect(ds[i] - ds[i - 1]).toBeGreaterThanOrEqual(rowSpacing(speed, difficultyAt(ds[i - 1])) - 1e-9);
      // Nunca menos que el tiempo de reacción "difícil"
      expect((ds[i] - ds[i - 1]) / speed).toBeGreaterThanOrEqual(GAME_CONFIG.world.rowReactionTime.hard - 1e-9);
    }
  });

  it('no usa obstáculos avanzados antes de su dificultad mínima', () => {
    for (const c of generate(8, 8000, 25)) {
      if (c.kind !== 'obstacle') continue;
      expect(OBSTACLES[c.type].minDifficulty).toBeLessThanOrEqual(difficultyAt(c.d));
    }
  });

  it('coloca power-ups con separación mínima y lejos de obstáculos y monedas', () => {
    const cmds = generate(21, 20000, 25);
    const powerups = cmds.filter((c) => c.kind === 'powerup');
    expect(powerups.length).toBeGreaterThan(5);
    for (let i = 0; i < powerups.length; i++) {
      const p = powerups[i];
      expect(p.d).toBeGreaterThanOrEqual(POWERUP_CONFIG.minDistance);
      if (i > 0) expect(p.d - powerups[i - 1].d).toBeGreaterThanOrEqual(POWERUP_CONFIG.minGap);
      for (const c of cmds) {
        if (c === p || c.lane !== p.lane) continue;
        if (c.kind === 'obstacle') expect(Math.abs(c.d - p.d)).toBeGreaterThan(3);
        if (c.kind === 'coin') expect(Math.abs(c.d - p.d)).toBeGreaterThanOrEqual(1.5);
      }
    }
  });

  it('nunca pone monedas dentro de un obstáculo de bloqueo', () => {
    const cmds = generate(11, 5000, 20);
    const blockers = cmds.filter((c) => c.kind === 'obstacle' && OBSTACLES[c.type].avoid === 'dodge');
    for (const coin of cmds.filter((c) => c.kind === 'coin')) {
      for (const b of blockers) {
        if (b.lane !== coin.lane || b.kind !== 'obstacle') continue;
        const depth = OBSTACLES[b.type].hitbox.depth;
        expect(Math.abs(coin.d - b.d)).toBeGreaterThan(depth / 2);
      }
    }
  });
});
