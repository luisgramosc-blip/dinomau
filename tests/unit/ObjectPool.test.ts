import { describe, expect, it } from 'vitest';
import { ObjectPool } from '@/core/ObjectPool';

describe('ObjectPool', () => {
  it('pre-crea instancias y las reutiliza', () => {
    let created = 0;
    const pool = new ObjectPool(() => ({ id: created++ }), undefined, undefined, 3);
    expect(created).toBe(3);
    const a = pool.acquire();
    pool.release(a);
    expect(pool.acquire()).toBe(a);
    expect(created).toBe(3);
  });

  it('crece si se agota', () => {
    const pool = new ObjectPool(() => ({}), undefined, undefined, 1);
    pool.acquire();
    pool.acquire();
    expect(pool.totalCount).toBe(2);
    expect(pool.activeCount).toBe(2);
  });

  it('permite liberar durante forEachActive sin saltarse elementos', () => {
    const pool = new ObjectPool(() => ({ v: 0 }));
    const items = Array.from({ length: 6 }, (_, i) => Object.assign(pool.acquire(), { v: i }));
    const seen: number[] = [];
    pool.forEachActive((it) => {
      seen.push(it.v);
      if (it.v % 2 === 0) pool.release(it);
    });
    expect(seen.sort()).toEqual([0, 1, 2, 3, 4, 5]);
    expect(pool.activeCount).toBe(3);
    pool.release(items[1]);
    pool.release(items[1]); // doble release es inocuo
    expect(pool.activeCount).toBe(2);
  });

  it('llama a los hooks de acquire/release', () => {
    const log: string[] = [];
    const pool = new ObjectPool(() => ({}), () => log.push('in'), () => log.push('out'));
    const x = pool.acquire();
    pool.release(x);
    expect(log).toEqual(['in', 'out']);
  });
});
