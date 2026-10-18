import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { handleClaimReferral, handleFinishRun, handleStartRun } from '../../supabase/functions/_shared/handlers.ts';
import { asUser, pgDb } from './pgDb';

/** Referidos y bonos contra Postgres real (`npm run test:db`). */
const url = process.env.DATABASE_URL;

describe.runIf(url)('referidos (integración)', () => {
  let pool: pg.Pool;
  const clock = { now: new Date() };
  let db: ReturnType<typeof pgDb>;

  const newUser = async (email: string, opts: { verified?: boolean; code?: string } = {}) => {
    const { rows } = await pool.query(
      `insert into auth.users (email, email_confirmed_at, raw_user_meta_data) values ($1, $2, $3) returning id`,
      [email, opts.verified === false ? null : new Date(), opts.code ? { referral_code: opts.code } : {}],
    );
    return rows[0].id as string;
  };
  const codeOf = async (id: string) => (await pool.query('select referral_code from profiles where id = $1', [id])).rows[0].referral_code as string;
  const coinsOf = async (id: string) => Number((await pool.query('select coins from profiles where id = $1', [id])).rows[0].coins);
  const playRun = async (id: string) => {
    const { runId } = (await handleStartRun(db, id, { dinoId: 'compsognathus' })).body as { runId: string };
    await pool.query(`update runs set started_at = started_at - interval '90 seconds' where id = $1`, [runId]);
    return handleFinishRun(db, id, { runId, distance: 1500, score: 1500, coinsCollected: 100, durationMs: 80_000, battles: [] });
  };

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: url, max: 4 });
    db = pgDb(pool, clock);
  });
  afterAll(async () => pool?.end());

  it('bono de bienvenida de 500 con el código del link', async () => {
    const inviter = await newUser('inv1@test.dev');
    const invitee = await newUser('new1@test.dev');
    const res = await handleClaimReferral(db, invitee, { code: (await codeOf(inviter)).toLowerCase() });
    expect(res).toMatchObject({ status: 200, body: { coins: 500, bonus: 500 } });
    expect(await coinsOf(invitee)).toBe(500);
  });

  it('usa el código guardado al registrarse si no llega en la petición', async () => {
    const inviter = await newUser('inv2@test.dev');
    const invitee = await newUser('new2@test.dev', { code: await codeOf(inviter) });
    expect((await handleClaimReferral(db, invitee, {})).body).toMatchObject({ coins: 500 });
  });

  it('una sola vez por cuenta', async () => {
    const a = await newUser('inv3@test.dev');
    const b = await newUser('inv3b@test.dev');
    const invitee = await newUser('new3@test.dev');
    await handleClaimReferral(db, invitee, { code: await codeOf(a) });
    expect((await handleClaimReferral(db, invitee, { code: await codeOf(a) })).body).toEqual({ error: 'ALREADY_REFERRED' });
    expect((await handleClaimReferral(db, invitee, { code: await codeOf(b) })).body).toEqual({ error: 'ALREADY_REFERRED' });
    expect(await coinsOf(invitee)).toBe(500);
  });

  it('exige correo verificado', async () => {
    const inviter = await newUser('inv4@test.dev');
    const invitee = await newUser('new4@test.dev', { verified: false });
    expect(await handleClaimReferral(db, invitee, { code: await codeOf(inviter) })).toMatchObject({ status: 403, body: { error: 'EMAIL_NOT_VERIFIED' } });
    expect(await coinsOf(invitee)).toBe(0);
  });

  it('bloquea autorreferidos, referidos cruzados y códigos inexistentes', async () => {
    const a = await newUser('inv5@test.dev');
    const b = await newUser('new5@test.dev');
    expect((await handleClaimReferral(db, a, { code: await codeOf(a) })).body).toEqual({ error: 'SELF_REFERRAL' });
    await handleClaimReferral(db, b, { code: await codeOf(a) });
    expect((await handleClaimReferral(db, a, { code: await codeOf(b) })).body).toEqual({ error: 'SELF_REFERRAL' });
    expect((await handleClaimReferral(db, b, { code: 'ZZZZZZZ' })).body).toEqual({ error: 'INVALID_CODE' });
    const c = await newUser('new5c@test.dev');
    expect((await handleClaimReferral(db, c, { code: 'ZZZZZZZ' })).body).toEqual({ error: 'INVALID_CODE' });
    expect((await handleClaimReferral(db, c, { code: "x'; drop table--" })).body).toEqual({ error: 'INVALID_CODE' });
  });

  it('caduca pasada la ventana de canje (cuentas antiguas)', async () => {
    const inviter = await newUser('inv6@test.dev');
    const invitee = await newUser('new6@test.dev');
    await pool.query(`update profiles set created_at = now() - interval '4 days' where id = $1`, [invitee]);
    expect((await handleClaimReferral(db, invitee, { code: await codeOf(inviter) })).body).toEqual({ error: 'CLAIM_WINDOW_EXPIRED' });
  });

  it('el invitador recibe 250 solo con la PRIMERA partida terminada del referido', async () => {
    const inviter = await newUser('inv7@test.dev');
    const invitee = await newUser('new7@test.dev');
    await handleClaimReferral(db, invitee, { code: await codeOf(inviter) });
    expect(await coinsOf(inviter)).toBe(0);
    await playRun(invitee);
    expect(await coinsOf(inviter)).toBe(250);
    await playRun(invitee);
    expect(await coinsOf(inviter)).toBe(250);
    const ledger = await pool.query(`select count(*)::int as n from coin_ledger where user_id = $1 and reason = 'referral_inviter'`, [inviter]);
    expect(ledger.rows[0].n).toBe(1);
  });

  it('una partida rechazada (trampa) no da bono al invitador', async () => {
    const inviter = await newUser('inv8@test.dev');
    const invitee = await newUser('new8@test.dev');
    await handleClaimReferral(db, invitee, { code: await codeOf(inviter) });
    const { runId } = (await handleStartRun(db, invitee, { dinoId: 'compsognathus' })).body as { runId: string };
    await handleFinishRun(db, invitee, { runId, distance: 99_999, score: 99_999, coinsCollected: 0, durationMs: 1000, battles: [] });
    expect(await coinsOf(inviter)).toBe(0);
  });

  it('tope diario de bonos por invitador', async () => {
    await pool.query(`update game_config set value = jsonb_set(value, '{maxInviterBonusesPerDay}', '2') where key = 'referral'`);
    try {
      const inviter = await newUser('inv9@test.dev');
      for (let i = 0; i < 3; i++) {
        const invitee = await newUser(`new9-${i}@test.dev`);
        await handleClaimReferral(db, invitee, { code: await codeOf(inviter) });
        await playRun(invitee);
      }
      expect(await coinsOf(inviter)).toBe(500);
    } finally {
      await pool.query(`update game_config set value = jsonb_set(value, '{maxInviterBonusesPerDay}', '20') where key = 'referral'`);
    }
  });

  it('el invitador ve sus referidos (RLS) pero no los de otros', async () => {
    const inviter = await newUser('inv10@test.dev');
    const other = await newUser('inv10b@test.dev');
    for (let i = 0; i < 2; i++) {
      const invitee = await newUser(`new10-${i}@test.dev`);
      await handleClaimReferral(db, invitee, { code: await codeOf(inviter) });
    }
    const mine = await asUser(pool, inviter, (c) => c.query('select count(*)::int as n from referrals'));
    expect(mine.rows[0].n).toBe(2);
    const theirs = await asUser(pool, other, (c) => c.query('select count(*)::int as n from referrals'));
    expect(theirs.rows[0].n).toBe(0);
    // El cliente no puede canjear directamente saltándose la Edge Function
    await expect(asUser(pool, other, (c) => c.query(`select claim_referral($1, $2)`, [other, 'ABCDEFG']))).rejects.toThrow(/permission denied/);
  });
});
