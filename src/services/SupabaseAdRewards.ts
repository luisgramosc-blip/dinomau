import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdRewardKind } from '@/config/ads.config';
import type { AuthService } from './AuthService';
import { canOfferDouble, dailyLimit, utcDay, type AdRewardError, type AdRewardResult, type AdRewardService } from './AdRewardService';
import type { EconomyService } from './EconomyService';
import { BackendError } from './env';
import { callFunction } from './supabaseClient';

/**
 * Recompensas por anuncio con servidor: la Edge Function `ad-reward` aplica
 * los límites diarios, comprueba la partida y acredita las monedas. Aquí solo
 * se leen los usos de hoy (RLS: los propios) para pintar los botones.
 */
export class SupabaseAdRewards implements AdRewardService {
  private used: Record<AdRewardKind, number> = { double: 0, gift: 0 };
  private day = '';

  constructor(
    private readonly sb: SupabaseClient,
    private readonly auth: AuthService,
    private readonly economy: EconomyService,
  ) {}

  get available(): boolean {
    return !!this.auth.user;
  }

  remaining(kind: AdRewardKind): number {
    if (this.day !== utcDay(new Date())) this.used = { double: 0, gift: 0 };
    return Math.max(0, dailyLimit(kind) - this.used[kind]);
  }

  async refresh(): Promise<void> {
    this.used = { double: 0, gift: 0 };
    this.day = utcDay(new Date());
    if (!this.auth.user) return;
    const { data, error } = await this.sb
      .from('ad_rewards')
      .select('kind')
      .eq('user_id', this.auth.user.id)
      .gte('created_at', `${this.day}T00:00:00Z`);
    if (error) return console.warn('[anuncios] no se pudieron leer los usos de hoy', error);
    for (const row of data ?? []) if (row.kind === 'double' || row.kind === 'gift') this.used[row.kind as AdRewardKind]++;
  }

  claimGift(): Promise<AdRewardResult> {
    return this.claim('gift', null);
  }

  claimDouble(runId: string | null, runCoins: number): Promise<AdRewardResult> {
    if (!runId || !canOfferDouble(runCoins)) return Promise.resolve({ ok: false, error: 'NOT_ELIGIBLE' });
    return this.claim('double', runId);
  }

  private async claim(kind: AdRewardKind, runId: string | null): Promise<AdRewardResult> {
    if (!this.auth.user) return { ok: false, error: 'AUTH_REQUIRED' };
    try {
      const res = await callFunction<{ coins: number; bonus: number; remaining: number }>('ad-reward', { kind, runId });
      this.used[kind] = dailyLimit(kind) - res.remaining;
      this.economy.setCoins(res.coins);
      return { ok: true, bonus: res.bonus, coins: res.coins };
    } catch (err) {
      const code = err instanceof BackendError ? err.code : 'NETWORK';
      if (code === 'AD_LIMIT_REACHED') this.used[kind] = dailyLimit(kind);
      return { ok: false, error: toError(code) };
    }
  }
}

function toError(code: string): AdRewardError {
  switch (code) {
    case 'AD_LIMIT_REACHED': return 'LIMIT_REACHED';
    case 'ALREADY_CLAIMED': return 'ALREADY_CLAIMED';
    case 'RUN_NOT_ELIGIBLE':
    case 'RUN_NOT_FOUND': return 'NOT_ELIGIBLE';
    case 'UNAUTHORIZED': return 'AUTH_REQUIRED';
    default: return 'NETWORK';
  }
}
