import {
  parseReport, validateRun,
  type AnticheatConfig, type BattleEconomyConfig, type BattleRow,
} from './validation.ts';

/**
 * Lógica de las Edge Functions, independiente de Deno y de supabase-js: recibe
 * un `Db` con las pocas operaciones que necesita. En producción lo implementa
 * `supabaseDb.ts` (cliente service_role); en los tests, un cliente de Postgres.
 */
export interface RunRow {
  id: string;
  user_id: string;
  status: 'started' | 'finished' | 'rejected' | 'expired';
  started_at: string;
  dino_id: string;
}

export interface FinalizeArgs {
  runId: string;
  status: 'finished' | 'rejected';
  durationMs: number;
  distance: number;
  score: number;
  coinsCollected: number;
  coinsAwarded: number;
  battles: BattleRow[];
  rejectionReason: string | null;
}

export interface Db {
  getConfig<T>(key: 'anticheat' | 'battle' | 'referral'): Promise<T>;
  getRun(runId: string): Promise<RunRow | null>;
  getCoins(userId: string): Promise<number>;
  startRun(userId: string, dinoId: string, clientVersion: string | null): Promise<{ runId: string; seed: number }>;
  finalizeRun(args: FinalizeArgs): Promise<{ status: string; coins?: number; awarded?: number; newRecord?: boolean }>;
  purchaseDino(userId: string, dinoId: string): Promise<number>;
  /** Datos de Auth: si el correo está verificado y el código de referido guardado al registrarse. */
  getAuthUser(userId: string): Promise<{ emailVerified: boolean; referralCode: string | null } | null>;
  claimReferral(userId: string, code: string): Promise<number>;
  claimAdReward(userId: string, kind: 'double' | 'gift', runId: string | null): Promise<AdRewardOutcome>;
  now(): Date;
}

export interface ReferralConfig {
  welcomeBonus: number;
  inviterBonusEnabled: boolean;
  inviterBonus: number;
  requireEmailVerified: boolean;
  claimWindowHours: number;
  maxInviterBonusesPerDay: number;
}

export interface AdRewardOutcome {
  coins: number;
  bonus: number;
  remaining: number;
}

export type HandlerResult = { status: number; body: Record<string, unknown> };

const ok = (body: Record<string, unknown>): HandlerResult => ({ status: 200, body });
const fail = (status: number, error: string, extra: Record<string, unknown> = {}): HandlerResult =>
  ({ status, body: { error, ...extra } });

/** Errores de negocio lanzados con `raise exception 'CODIGO'` en las funciones SQL. */
const KNOWN_DB_ERRORS = [
  'INSUFFICIENT_COINS', 'ALREADY_OWNED', 'DINO_NOT_FOUND', 'DINO_NOT_OWNED', 'RUN_NOT_OPEN', 'PROFILE_NOT_FOUND',
  'INVALID_CODE', 'SELF_REFERRAL', 'ALREADY_REFERRED', 'CLAIM_WINDOW_EXPIRED',
  'AD_LIMIT_REACHED', 'ALREADY_CLAIMED', 'RUN_NOT_ELIGIBLE', 'INVALID_KIND',
] as const;

export function dbErrorCode(err: unknown): string | null {
  const msg = err instanceof Error ? err.message : typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message) : String(err);
  return KNOWN_DB_ERRORS.find((code) => msg.includes(code)) ?? null;
}

const DINO_ID = /^[a-z_]{3,30}$/;

// --- start-run ----------------------------------------------------------------

export async function handleStartRun(db: Db, userId: string, body: unknown): Promise<HandlerResult> {
  const b = (body ?? {}) as { dinoId?: unknown; clientVersion?: unknown };
  if (typeof b.dinoId !== 'string' || !DINO_ID.test(b.dinoId)) return fail(400, 'INVALID_PAYLOAD');
  const version = typeof b.clientVersion === 'string' ? b.clientVersion.slice(0, 40) : null;
  try {
    const run = await db.startRun(userId, b.dinoId, version);
    return ok(run);
  } catch (err) {
    const code = dbErrorCode(err);
    if (code) return fail(409, code);
    throw err;
  }
}

// --- finish-run ---------------------------------------------------------------

export async function handleFinishRun(db: Db, userId: string, body: unknown): Promise<HandlerResult> {
  const report = parseReport(body);
  if (!report) return fail(400, 'INVALID_PAYLOAD');

  const run = await db.getRun(report.runId);
  if (!run || run.user_id !== userId) return fail(404, 'RUN_NOT_FOUND');
  if (run.status !== 'started') return fail(409, 'RUN_NOT_OPEN');

  const [ac, battleCfg, wallet] = await Promise.all([
    db.getConfig<AnticheatConfig>('anticheat'),
    db.getConfig<BattleEconomyConfig>('battle'),
    db.getCoins(userId),
  ]);
  const elapsed = db.now().getTime() - new Date(run.started_at).getTime();
  const result = validateRun(report, elapsed, wallet, ac, battleCfg);

  const base = {
    runId: report.runId,
    durationMs: report.durationMs,
    distance: Math.floor(report.distance),
    score: report.score,
    coinsCollected: report.coinsCollected,
  };
  if (!result.ok) {
    await db.finalizeRun({
      ...base, status: 'rejected', coinsAwarded: 0, battles: [],
      rejectionReason: result.detail ? `${result.reason}:${result.detail}` : result.reason,
    });
    return ok({ status: 'rejected', reason: result.reason, awarded: 0, coins: wallet, newRecord: false });
  }

  try {
    const out = await db.finalizeRun({
      ...base, status: 'finished', coinsAwarded: result.coinsAwarded, battles: result.battles, rejectionReason: null,
    });
    return ok({
      status: 'finished',
      awarded: result.coinsAwarded,
      coins: out.coins ?? wallet + result.coinsAwarded,
      newRecord: !!out.newRecord,
      battles: result.battles.map((b) => ({ sequence: b.sequence, coinsDelta: b.coins_delta })),
    });
  } catch (err) {
    const code = dbErrorCode(err);
    if (code) return fail(409, code);
    throw err;
  }
}

// --- purchase-dino ------------------------------------------------------------

export async function handlePurchase(db: Db, userId: string, body: unknown): Promise<HandlerResult> {
  const b = (body ?? {}) as { dinoId?: unknown };
  if (typeof b.dinoId !== 'string' || !DINO_ID.test(b.dinoId)) return fail(400, 'INVALID_PAYLOAD');
  try {
    const coins = await db.purchaseDino(userId, b.dinoId);
    return ok({ coins });
  } catch (err) {
    const code = dbErrorCode(err);
    if (code) return fail(409, code);
    throw err;
  }
}

// --- claim-referral -----------------------------------------------------------

const REFERRAL_CODE = /^[A-Za-z0-9]{4,12}$/;

/**
 * Canjea el código de referido del jugador recién registrado (bono de
 * bienvenida). El código llega en el cuerpo (link /r/CODIGO guardado en el
 * dispositivo) o, si no, se toma de los metadatos guardados al registrarse.
 * Todas las reglas se comprueban aquí y en SQL, nunca en el cliente:
 * correo verificado, un solo bono por cuenta, ventana de tiempo, sin
 * autorreferidos ni referidos cruzados.
 */
export async function handleClaimReferral(db: Db, userId: string, body: unknown): Promise<HandlerResult> {
  const b = (body ?? {}) as { code?: unknown };
  const authUser = await db.getAuthUser(userId);
  if (!authUser) return fail(404, 'USER_NOT_FOUND');

  const raw = typeof b.code === 'string' && b.code ? b.code : authUser.referralCode;
  if (!raw) return fail(400, 'NO_CODE');
  if (!REFERRAL_CODE.test(raw)) return fail(400, 'INVALID_CODE');

  const cfg = await db.getConfig<ReferralConfig>('referral');
  if (cfg.requireEmailVerified && !authUser.emailVerified) return fail(403, 'EMAIL_NOT_VERIFIED');

  try {
    const coins = await db.claimReferral(userId, raw.toUpperCase());
    return ok({ coins, bonus: cfg.welcomeBonus });
  } catch (err) {
    const code = dbErrorCode(err);
    if (code) return fail(409, code);
    throw err;
  }
}

// --- ad-reward ----------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Monedas por ver un anuncio: `gift` (regalo diario) o `double` (duplicar una
 * partida terminada). Los topes diarios, la ventana de tiempo y que cada
 * partida se duplique una sola vez los aplica `claim_ad_reward` en SQL.
 */
export async function handleAdReward(db: Db, userId: string, body: unknown): Promise<HandlerResult> {
  const b = (body ?? {}) as { kind?: unknown; runId?: unknown };
  if (b.kind !== 'double' && b.kind !== 'gift') return fail(400, 'INVALID_PAYLOAD');
  let runId: string | null = null;
  if (b.kind === 'double') {
    if (typeof b.runId !== 'string' || !UUID.test(b.runId)) return fail(400, 'INVALID_PAYLOAD');
    runId = b.runId;
  }
  try {
    return ok({ ...(await db.claimAdReward(userId, b.kind, runId)) });
  } catch (err) {
    const code = dbErrorCode(err);
    if (code) return fail(code === 'AD_LIMIT_REACHED' ? 429 : 409, code);
    throw err;
  }
}
