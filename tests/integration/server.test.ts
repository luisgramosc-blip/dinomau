import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { handleFinishRun, handlePurchase, handleStartRun } from '../../supabase/functions/_shared/handlers.ts';
import { asUser, pgDb } from './pgDb';

/**
 * Flujos completos del servidor contra Postgres real (migraciones aplicadas).
 * Se ejecutan con `npm run test:db`; con `npm test` se saltan.
 */
const url = process.env.DATABASE_URL;

describe.runIf(url)('servidor (integración)', () => {
  let pool: pg.Pool;
  const clock = { now: new Date() };
  let db: ReturnType<typeof pgDb>;

  const newUser = async (email: string): Promise<string> => {
    const { rows } = await pool.query(
      `insert into auth.users (email, email_confirmed_at) values ($1, now()) returning id`, [email],
    );
    return rows[0].id;
  };
  /** Avanza el reloj del servidor (y retrasa el inicio de la partida en la BD). */
  const elapse = async (runId: string, ms: number) => {
    await pool.query(`update runs set started_at = started_at - make_interval(secs => $2::float / 1000) where id = $1`, [runId, ms]);
  };
  const report = (runId: string, over: Record<string, unknown> = {}) => ({
    runId, distance: 1500, score: 1500, coinsCollected: 600, durationMs: 80_000, battles: [], ...over,
  });

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url, max: 4 });
    db = pgDb(pool, clock);
  });
  afterAll(async () => pool?.end());

  it('al registrarse: perfil, código de referido y dino inicial', async () => {
    const id = await newUser('a@test.dev');
    const { rows } = await pool.query('select coins, referral_code, equipped_dino_id from profiles where id = $1', [id]);
    expect(rows[0]).toMatchObject({ coins: '0', equipped_dino_id: 'compsognathus' });
    expect(rows[0].referral_code).toMatch(/^[A-Z2-9]{7}$/);
  });

  it('partida válida: abre con semilla, cierra y acredita monedas en el ledger', async () => {
    const id = await newUser('b@test.dev');
    const start = await handleStartRun(db, id, { dinoId: 'compsognathus', clientVersion: 'test' });
    expect(start.status).toBe(200);
    const { runId, seed } = start.body as { runId: string; seed: number };
    expect(seed).toBeGreaterThanOrEqual(0);

    await elapse(runId, 90_000);
    const fin = await handleFinishRun(db, id, report(runId));
    expect(fin.body).toMatchObject({ status: 'finished', awarded: 600, coins: 600, newRecord: true });

    const { rows } = await pool.query(`select delta, reason from coin_ledger where user_id = $1`, [id]);
    expect(rows).toEqual([{ delta: '600', reason: 'run_reward' }]);
    // No se puede cerrar dos veces
    expect((await handleFinishRun(db, id, report(runId))).status).toBe(409);
  });

  it('partida con trampa: se rechaza y no da monedas', async () => {
    const id = await newUser('c@test.dev');
    const { runId } = (await handleStartRun(db, id, { dinoId: 'compsognathus' })).body as { runId: string };
    await elapse(runId, 10_000); // solo pasaron 10 s reales
    const fin = await handleFinishRun(db, id, report(runId, { durationMs: 600_000, distance: 15_000, score: 15_000, coinsCollected: 6000 }));
    expect(fin.body).toMatchObject({ status: 'rejected', reason: 'duration_mismatch', awarded: 0 });
    const { rows } = await pool.query('select coins from profiles where id = $1', [id]);
    expect(rows[0].coins).toBe('0');
    const run = await pool.query('select status, rejection_reason from runs where id = $1', [runId]);
    expect(run.rows[0].status).toBe('rejected');
  });

  it('batallas: el servidor recalcula el efecto y guarda cada una', async () => {
    const id = await newUser('d@test.dev');
    const { runId } = (await handleStartRun(db, id, { dinoId: 'compsognathus' })).body as { runId: string };
    await elapse(runId, 120_000);
    const battles = [{ sequence: 1, rivalId: 'dilophosaurus', rivalPower: 10, playerPower: 8, won: true, accuracy: 0.9, runCoinsBefore: 520, atMs: 40_000 }];
    const fin = await handleFinishRun(db, id, report(runId, { coinsCollected: 600, battles }));
    expect(fin.body).toMatchObject({ status: 'finished', awarded: 1120 });
    const { rows } = await pool.query('select result, coins_delta from battles where run_id = $1', [runId]);
    expect(rows).toEqual([{ result: 'win', coins_delta: 520 }]);
    const prof = await pool.query('select battles_won from profiles where id = $1', [id]);
    expect(prof.rows[0].battles_won).toBe(1);
  });

  it('no se puede cerrar la partida de otro jugador', async () => {
    const owner = await newUser('e@test.dev');
    const thief = await newUser('f@test.dev');
    const { runId } = (await handleStartRun(db, owner, { dinoId: 'compsognathus' })).body as { runId: string };
    expect((await handleFinishRun(db, thief, report(runId))).status).toBe(404);
  });

  it('abrir otra partida caduca la anterior', async () => {
    const id = await newUser('g@test.dev');
    const first = (await handleStartRun(db, id, { dinoId: 'compsognathus' })).body as { runId: string };
    await handleStartRun(db, id, { dinoId: 'compsognathus' });
    const { rows } = await pool.query('select status from runs where id = $1', [first.runId]);
    expect(rows[0].status).toBe('expired');
  });

  it('no se puede jugar con un dino no comprado', async () => {
    const id = await newUser('h@test.dev');
    expect(await handleStartRun(db, id, { dinoId: 'tyrannosaurus' })).toMatchObject({ status: 409, body: { error: 'DINO_NOT_OWNED' } });
  });

  it('compras: saldo insuficiente, compra correcta y no duplicada', async () => {
    const id = await newUser('i@test.dev');
    expect((await handlePurchase(db, id, { dinoId: 'gallimimus' })).body).toEqual({ error: 'INSUFFICIENT_COINS' });
    await pool.query(`select apply_coin_delta($1, 2500, 'adjustment', 'test')`, [id]);
    expect((await handlePurchase(db, id, { dinoId: 'gallimimus' })).body).toEqual({ coins: 500 });
    expect((await handlePurchase(db, id, { dinoId: 'gallimimus' })).body).toEqual({ error: 'ALREADY_OWNED' });
  });

  it('RLS: el cliente puede equipar dinos propios pero no tocar sus monedas', async () => {
    const id = await newUser('j@test.dev');
    await pool.query(`select apply_coin_delta($1, 2000, 'adjustment', 'test')`, [id]);
    await pool.query(`select purchase_dino($1, 'gallimimus')`, [id]);
    await asUser(pool, id, (c) => c.query(`update profiles set equipped_dino_id = 'gallimimus', username = 'Rexi_1' where id = $1`, [id]));
    await expect(asUser(pool, id, (c) => c.query(`update profiles set equipped_dino_id = 'tyrannosaurus' where id = $1`, [id]))).rejects.toThrow(/DINO_NOT_OWNED/);
    await expect(asUser(pool, id, (c) => c.query(`update profiles set coins = 999999 where id = $1`, [id]))).rejects.toThrow(/permission denied/);
    await expect(asUser(pool, id, (c) => c.query(`select purchase_dino($1, 'stegosaurus')`, [id]))).rejects.toThrow(/permission denied/);
    // Ninguna otra tabla es modificable desde el cliente
    await expect(asUser(pool, id, (c) => c.query(`update coin_ledger set delta = 1000000 where user_id = $1`, [id]))).rejects.toThrow(/permission denied/);
    await expect(asUser(pool, id, (c) => c.query(`update runs set coins_awarded = 99999 where user_id = $1`, [id]))).rejects.toThrow(/permission denied/);
    await expect(asUser(pool, id, (c) => c.query(`insert into user_dinos (user_id, dino_id) values ($1, 'tyrannosaurus')`, [id]))).rejects.toThrow(/permission denied/);
    await expect(asUser(pool, id, (c) => c.query(`update game_config set value = '{}' where key = 'battle'`))).rejects.toThrow(/permission denied/);
    await expect(asUser(pool, id, (c) => c.query(`select * from start_run($1, 'compsognathus')`, [id]))).rejects.toThrow(/permission denied/);
    // Solo ve su propio perfil
    const seen = await asUser(pool, id, (c) => c.query('select id from profiles'));
    expect(seen.rows).toEqual([{ id }]);
  });

  it('ranking global y semanal con nombres únicos sin distinguir mayúsculas', async () => {
    const a = await newUser('k@test.dev');
    const b = await newUser('l@test.dev');
    await pool.query(`update profiles set username = 'TriceKing' where id = $1`, [a]);
    await expect(pool.query(`update profiles set username = 'triceking' where id = $1`, [b])).rejects.toThrow(/unique/);
    await pool.query(`update profiles set username = 'RaptorQueen' where id = $1`, [b]);

    for (const [user, dist] of [[a, 2000], [b, 2600]] as const) {
      const { runId } = (await handleStartRun(db, user, { dinoId: 'compsognathus' })).body as { runId: string };
      await elapse(runId, 150_000);
      await handleFinishRun(db, user, report(runId, { distance: dist, score: dist, durationMs: 140_000 }));
    }
    const all = await asUser(pool, a, (c) => c.query(`select username, score from get_leaderboard('all', 10)`));
    const names = all.rows.map((r) => r.username);
    expect(names.indexOf('RaptorQueen')).toBeLessThan(names.indexOf('TriceKing'));
    const weekly = await asUser(pool, a, (c) => c.query(`select username from get_leaderboard('weekly', 10)`));
    expect(weekly.rows.map((r) => r.username)).toContain('TriceKing');
    const mine = await asUser(pool, a, (c) => c.query(`select rank, score from get_my_rank('all')`));
    expect(Number(mine.rows[0].score)).toBe(2000);
    // El ranking no expone datos privados (emails, monedas)
    expect(Object.keys(all.rows[0]).sort()).toEqual(['score', 'username']);
  });
});
