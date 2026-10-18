import { describe, expect, it } from 'vitest';
import { getDino } from '@/config/dinos.config';
import { dinoShopState, LocalEconomyService } from '@/services/EconomyService';

function memoryStorage(initial?: string) {
  const data = new Map<string, string>();
  if (initial) data.set('dinomau:wallet:v1', initial);
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
}

describe('LocalEconomyService', () => {
  it('empieza con el Compsognathus equipado y 0 monedas', () => {
    const eco = new LocalEconomyService(memoryStorage());
    expect(eco.snapshot.coins).toBe(0);
    expect(eco.snapshot.equipped).toBe('compsognathus');
    expect(eco.snapshot.owned.has('compsognathus')).toBe(true);
  });

  it('no permite comprar sin saldo suficiente', async () => {
    const eco = new LocalEconomyService(memoryStorage());
    await eco.creditRun(1999);
    expect(await eco.purchase('gallimimus')).toEqual({ ok: false, error: 'INSUFFICIENT_COINS' });
  });

  it('compra, descuenta el precio exacto y no deja comprar dos veces', async () => {
    const eco = new LocalEconomyService(memoryStorage());
    await eco.creditRun(2500);
    expect(await eco.purchase('gallimimus')).toEqual({ ok: true, coins: 2500 - getDino('gallimimus').price });
    expect(await eco.purchase('gallimimus')).toEqual({ ok: false, error: 'ALREADY_OWNED' });
  });

  it('solo equipa dinos comprados', async () => {
    const eco = new LocalEconomyService(memoryStorage());
    expect((await eco.equip('tyrannosaurus')).ok).toBe(false);
    await eco.creditRun(2000);
    await eco.purchase('gallimimus');
    expect((await eco.equip('gallimimus')).ok).toBe(true);
    expect(eco.snapshot.equipped).toBe('gallimimus');
  });

  it('persiste y sanea datos manipulados', async () => {
    const storage = memoryStorage();
    const eco = new LocalEconomyService(storage);
    await eco.creditRun(300);
    expect(new LocalEconomyService(storage).snapshot.coins).toBe(300);

    const tampered = memoryStorage(JSON.stringify({ coins: -50, owned: ['dragon'], equipped: 'tyrannosaurus' }));
    const snap = new LocalEconomyService(tampered).snapshot;
    expect(snap.coins).toBe(0);
    expect([...snap.owned]).toEqual(['compsognathus']);
    expect(snap.equipped).toBe('compsognathus');
  });

  it('ignora créditos negativos o decimales', async () => {
    const eco = new LocalEconomyService(memoryStorage());
    await eco.creditRun(-100);
    await eco.creditRun(10.9);
    expect(eco.snapshot.coins).toBe(10);
  });
});

describe('dinoShopState', () => {
  const wallet = { coins: 5000, owned: new Set(['compsognathus', 'gallimimus'] as const), equipped: 'gallimimus' as const };
  it('distingue los 4 estados', () => {
    expect(dinoShopState('gallimimus', wallet)).toBe('equipped');
    expect(dinoShopState('compsognathus', wallet)).toBe('owned');
    expect(dinoShopState('parasaurolophus', wallet)).toBe('buyable'); // 5.000 exactos
    expect(dinoShopState('velociraptor', wallet)).toBe('locked');
  });
});
