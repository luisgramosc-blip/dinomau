import { AuthService } from './AuthService';
import { LeaderboardService } from './LeaderboardService';
import { ReferralService } from './ReferralService';
import { RunService } from './RunService';
import { SupabaseAdRewards } from './SupabaseAdRewards';
import { SupabaseEconomyService } from './SupabaseEconomyService';
import { supabase } from './supabaseClient';

/**
 * Servicios con servidor. main.ts importa este módulo de forma dinámica y
 * solo si hay Supabase configurado: así, en modo local, supabase-js ni se
 * descarga.
 */
export async function createBackend() {
  if (!supabase) throw new Error('Supabase no configurado');
  const auth = new AuthService(supabase);
  const serverEconomy = new SupabaseEconomyService(supabase, auth);
  const backend = {
    auth,
    serverEconomy,
    leaderboard: new LeaderboardService(supabase),
    referrals: new ReferralService(supabase, auth),
    runs: new RunService(auth),
    adRewards: new SupabaseAdRewards(supabase, auth, serverEconomy),
  };
  try {
    await auth.init();
    await Promise.all([serverEconomy.refresh(), backend.adRewards.refresh()]);
  } catch (err) {
    console.warn('[backend] sin conexión al iniciar', err);
  }
  return backend;
}

export type Backend = Awaited<ReturnType<typeof createBackend>>;
