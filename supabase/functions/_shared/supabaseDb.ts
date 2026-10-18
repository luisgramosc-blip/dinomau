// Implementación de `Db` con supabase-js y la clave service_role (solo Deno).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0';
import type { Db, FinalizeArgs, RunRow } from './handlers.ts';

export function adminClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Usuario autenticado a partir del JWT de la petición (o null). */
export async function getUserId(sb: SupabaseClient, req: Request): Promise<string | null> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

function unwrap(res: { data: unknown; error: { message: string } | null }): unknown {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

export function supabaseDb(sb: SupabaseClient): Db {
  return {
    async getConfig(key) {
      const row = unwrap(await sb.from('game_config').select('value').eq('key', key).single());
      return (row as { value: unknown }).value as never;
    },
    async getRun(runId) {
      const res = await sb.from('runs').select('id,user_id,status,started_at,dino_id').eq('id', runId).maybeSingle();
      return unwrap(res) as RunRow | null;
    },
    async getCoins(userId) {
      const row = unwrap(await sb.from('profiles').select('coins').eq('id', userId).single());
      return Number((row as { coins: number }).coins);
    },
    async startRun(userId, dinoId, clientVersion) {
      const rows = unwrap(await sb.rpc('start_run', { p_user: userId, p_dino: dinoId, p_client_version: clientVersion }));
      const row = (rows as Array<{ run_id: string; seed: number }>)[0];
      return { runId: row.run_id, seed: Number(row.seed) };
    },
    async finalizeRun(a: FinalizeArgs) {
      return unwrap(await sb.rpc('finalize_run', {
        p_run_id: a.runId,
        p_status: a.status,
        p_duration_ms: a.durationMs,
        p_distance: a.distance,
        p_score: a.score,
        p_coins_collected: a.coinsCollected,
        p_coins_awarded: a.coinsAwarded,
        p_battles: a.battles,
        p_rejection_reason: a.rejectionReason,
      })) as { status: string; coins?: number; awarded?: number; newRecord?: boolean };
    },
    async purchaseDino(userId, dinoId) {
      return Number(unwrap(await sb.rpc('purchase_dino', { p_user: userId, p_dino: dinoId })));
    },
    async getAuthUser(userId) {
      const { data, error } = await sb.auth.admin.getUserById(userId);
      if (error || !data.user) return null;
      const u = data.user;
      // Google y otros proveedores OAuth ya verifican el correo
      const verified = !!u.email_confirmed_at || (u.app_metadata?.provider ?? 'email') !== 'email';
      const code = typeof u.user_metadata?.referral_code === 'string' ? u.user_metadata.referral_code : null;
      return { emailVerified: verified, referralCode: code };
    },
    async claimReferral(userId, code) {
      return Number(unwrap(await sb.rpc('claim_referral', { p_invitee: userId, p_code: code })));
    },
    now: () => new Date(),
  };
}
