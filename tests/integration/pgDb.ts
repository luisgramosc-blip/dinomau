import pg from 'pg';
import type { Db, FinalizeArgs, RunRow } from '../../supabase/functions/_shared/handlers.ts';

/**
 * Implementación de `Db` con node-postgres para las pruebas: hace lo mismo
 * que `supabaseDb.ts` (service_role) pero conectando directo a Postgres.
 */
export function pgDb(pool: pg.Pool, clock: { now: Date }): Db {
  return {
    async getConfig(key) {
      const { rows } = await pool.query('select value from game_config where key = $1', [key]);
      return rows[0].value;
    },
    async getRun(runId) {
      const { rows } = await pool.query<RunRow>(
        'select id, user_id, status, started_at::text, dino_id from runs where id = $1', [runId],
      );
      return rows[0] ?? null;
    },
    async getCoins(userId) {
      const { rows } = await pool.query('select coins from profiles where id = $1', [userId]);
      return Number(rows[0].coins);
    },
    async startRun(userId, dinoId, clientVersion) {
      const { rows } = await pool.query('select * from start_run($1, $2, $3)', [userId, dinoId, clientVersion]);
      return { runId: rows[0].run_id, seed: Number(rows[0].seed) };
    },
    async finalizeRun(a: FinalizeArgs) {
      const { rows } = await pool.query(
        'select finalize_run($1, $2::run_status, $3, $4, $5, $6, $7, $8::jsonb, $9) as r',
        [a.runId, a.status, a.durationMs, a.distance, a.score, a.coinsCollected, a.coinsAwarded, JSON.stringify(a.battles), a.rejectionReason],
      );
      return rows[0].r;
    },
    async purchaseDino(userId, dinoId) {
      const { rows } = await pool.query('select purchase_dino($1, $2) as coins', [userId, dinoId]);
      return Number(rows[0].coins);
    },
    async getAuthUser(userId) {
      const { rows } = await pool.query('select email_confirmed_at, raw_user_meta_data from auth.users where id = $1', [userId]);
      if (!rows[0]) return null;
      const code = rows[0].raw_user_meta_data?.referral_code;
      return { emailVerified: !!rows[0].email_confirmed_at, referralCode: typeof code === 'string' ? code : null };
    },
    async claimReferral(userId, code) {
      const { rows } = await pool.query('select claim_referral($1, $2) as coins', [userId, code]);
      return Number(rows[0].coins);
    },
    async claimAdReward(userId, kind, runId) {
      const { rows } = await pool.query('select claim_ad_reward($1, $2, $3) as r', [userId, kind, runId]);
      return rows[0].r;
    },
    now: () => clock.now,
  };
}

/** Ejecuta `fn` como un usuario autenticado (rol + JWT simulado), como hace PostgREST. */
export async function asUser<T>(pool: pg.Pool, userId: string, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId]);
    await client.query('set local role authenticated');
    const out = await fn(client);
    await client.query('commit');
    return out;
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}
