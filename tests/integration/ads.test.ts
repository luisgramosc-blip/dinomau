import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { handleAdReward, handleFinishRun, handleStartRun } from '../../supabase/functions/_shared/handlers.ts';
import { asUser, pgDb } from './pgDb';

/** Recompensas por anuncio contra Postgres real (`npm run test:db`). */
const url = process.env.DATABASE_URL;

describe.runIf(url)('recompensas por anuncio (integración)', () => {
  let pool: pg.Pool;
  const clock = { now: new Date() };
  let db: ReturnType<typeof pgDb>;

  const newUser = async (email: string): Promise<string> => {
    const { rows } = await pool.query(
      `insert into auth.users (email, email_confirmed_at) values ($1, now()) returning id`, [email],
    );
    return rows[0].id;
  };
  const coins = async (id: string) => Number((await pool.query('select coins from profiles where id = $1', [id])).rows[0].coins);

  /** Partida válida terminada con `collected` monedas. */
  const finishedRun = async (userId: string, collected = 600): Promise<string> => {
    const start = await handleStartRun(db, userId, { dinoId: 'compsognathus', clientVersion: 'test' });
    const { runId } = start.body as { runId: string };
    await pool.query(`update runs set started_at = started_at - interval '90 seconds' where id = $1`, [runId]);
    const fin = await handleFinishRun(db, userId, {
      runId, distance: 1500, score: 1500, coinsCollected: collected, durationMs: 80_000, battles: [],
    });
    expect(fin.body).toMatchObject({ status: 'finished', awarded: collected });
    return runId;
  };

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url, max: 4 });
    db = pgDb(pool, clock);
  });
  afterAll(async () => pool?.end());

  it('regalo diario: acredita y respeta el tope del día', async () => {
    const id = await newUser('gift@test.dev');
    for (let i = 3; i > 0; i--) {
      const res = await handleAdReward(db, id, { kind: 'gift' });
      expect(res.body).toMatchObject({ bonus: 150, remaining: i - 1 });
    }
    const over = await handleAdReward(db, id, { kind: 'gift' });
    expect(over).toEqual({ status: 429, body: { error: 'AD_LIMIT_REACHED' } });
    expect(await coins(id)).toBe(450);
    const { rows } = await pool.query(`select reason, count(*)::int as n from coin_ledger where user_id = $1 group by reason`, [id]);
    expect(rows).toEqual([{ reason: 'ad_gift', n: 3 }]);
  });

  it('los usos de ayer no cuentan', async () => {
    const id = await newUser('yesterday@test.dev');
    for (let i = 0; i < 3; i++) await handleAdReward(db, id, { kind: 'gift' });
    await pool.query(`update ad_rewards set created_at = now() - interval '1 day' where user_id = $1`, [id]);
    expect((await handleAdReward(db, id, { kind: 'gift' })).status).toBe(200);
  });

  it('duplicar: una sola vez por partida', async () => {
    const id = await newUser('double@test.dev');
    const runId = await finishedRun(id, 600);
    const res = await handleAdReward(db, id, { kind: 'double', runId });
    expect(res.body).toMatchObject({ bonus: 600, coins: 1200 });
    expect(await handleAdReward(db, id, { kind: 'double', runId })).toEqual({ status: 409, body: { error: 'ALREADY_CLAIMED' } });
    expect(await coins(id)).toBe(1200);
  });

  it('duplicar: tope de monedas extra', async () => {
    const id = await newUser('cap@test.dev');
    const runId = await finishedRun(id, 600);
    // Simula una partida con muchas monedas (p. ej. por batallas ganadas)
    await pool.query(`update runs set coins_awarded = 9000 where id = $1`, [runId]);
    const res = await handleAdReward(db, id, { kind: 'double', runId });
    expect(res.body).toMatchObject({ bonus: 2000 });
  });

  it('duplicar: no vale con partidas ajenas, abiertas o antiguas', async () => {
    const owner = await newUser('owner@test.dev');
    const other = await newUser('other@test.dev');
    const runId = await finishedRun(owner);
    expect((await handleAdReward(db, other, { kind: 'double', runId })).body).toEqual({ error: 'RUN_NOT_ELIGIBLE' });

    const open = await handleStartRun(db, owner, { dinoId: 'compsognathus' });
    const openId = (open.body as { runId: string }).runId;
    expect((await handleAdReward(db, owner, { kind: 'double', runId: openId })).body).toEqual({ error: 'RUN_NOT_ELIGIBLE' });

    const oldRun = await finishedRun(owner);
    await pool.query(`update runs set finished_at = now() - interval '20 minutes' where id = $1`, [oldRun]);
    expect((await handleAdReward(db, owner, { kind: 'double', runId: oldRun })).body).toEqual({ error: 'RUN_NOT_ELIGIBLE' });
  });

  it('peticiones mal formadas', async () => {
    const id = await newUser('bad@test.dev');
    expect((await handleAdReward(db, id, { kind: 'coins' })).status).toBe(400);
    expect((await handleAdReward(db, id, { kind: 'double' })).status).toBe(400);
    expect((await handleAdReward(db, id, { kind: 'double', runId: 'x' })).status).toBe(400);
  });

  it('el cliente ve sus canjes pero no puede crearlos ni canjear directamente', async () => {
    const id = await newUser('rls@test.dev');
    await handleAdReward(db, id, { kind: 'gift' });
    const mine = await asUser(pool, id, (c) => c.query('select kind from ad_rewards'));
    expect(mine.rows).toEqual([{ kind: 'gift' }]);
    await expect(asUser(pool, id, (c) => c.query(`insert into ad_rewards (user_id, kind, coins) values ($1, 'gift', 999)`, [id])))
      .rejects.toThrow(/permission denied/);
    await expect(asUser(pool, id, (c) => c.query(`select claim_ad_reward($1, 'gift')`, [id])))
      .rejects.toThrow(/permission denied/);
  });
});
