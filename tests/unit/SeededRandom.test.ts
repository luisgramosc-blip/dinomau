import { describe, expect, it } from 'vitest';
import { SeededRandom } from '@/core/SeededRandom';

describe('SeededRandom', () => {
  it('es determinista con la misma semilla', () => {
    const a = new SeededRandom(42);
    const b = new SeededRandom(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('produce valores en [0, 1) y enteros en rango', () => {
    const r = new SeededRandom(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      const n = r.int(0, 2);
      expect([0, 1, 2]).toContain(n);
    }
  });
});
