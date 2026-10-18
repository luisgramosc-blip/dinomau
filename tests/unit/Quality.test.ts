import { beforeEach, describe, expect, it } from 'vitest';
import { QualityManager } from '@/engine/QualityManager';
import type { Renderer } from '@/engine/Renderer';

function fakeRenderer(max = 2) {
  let ratio = max;
  return {
    maxPixelRatio: max,
    get pixelRatio() { return ratio; },
    setPixelRatio(r: number) { ratio = r; },
  } as unknown as Renderer & { pixelRatio: number };
}

/** Simula `seconds` segundos a `fps` constantes (60 actualizaciones por segundo). */
function run(q: QualityManager, seconds: number, fps: number, active = true) {
  for (let i = 0; i < seconds * 60; i++) q.update(1 / 60, fps, active);
}

describe('QualityManager', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    globalThis.localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    } as Storage;
  });

  it('baja la resolución si los FPS caen de forma sostenida', () => {
    const r = fakeRenderer();
    const q = new QualityManager(r);
    expect(r.pixelRatio).toBe(2);
    run(q, 2, 30);
    expect(q.currentLevel).toBe(0); // 2 s no bastan
    run(q, 2, 30);
    expect(q.currentLevel).toBe(1);
    expect(r.pixelRatio).toBeCloseTo(1.6);
  });

  it('no baja de un mínimo legible', () => {
    const r = fakeRenderer(1);
    const q = new QualityManager(r);
    run(q, 60, 10);
    expect(r.pixelRatio).toBeGreaterThanOrEqual(0.75);
  });

  it('no mide en los menús', () => {
    const q = new QualityManager(fakeRenderer());
    run(q, 30, 10, false);
    expect(q.currentLevel).toBe(0);
  });

  it('sube una sola vez si va sobrado y recuerda el nivel', () => {
    const r = fakeRenderer();
    const q = new QualityManager(r);
    run(q, 8, 30); // baja 2 niveles
    expect(q.currentLevel).toBe(2);
    run(q, 25, 60);
    expect(q.currentLevel).toBe(1);
    run(q, 60, 60);
    expect(q.currentLevel).toBe(1); // no vuelve a subir
    expect(new QualityManager(fakeRenderer()).currentLevel).toBe(1); // recordado
  });
});
