import type { SupabaseClient } from '@supabase/supabase-js';
import { PENDING_REFERRAL_KEY } from '@/config/referral.config';
import type { AuthService } from './AuthService';
import { BackendError, callFunction, SITE_URL } from './supabaseClient';

export type ClaimOutcome =
  | { status: 'granted'; bonus: number; coins: number }
  | { status: 'none' }
  | { status: 'retry-later'; reason: 'EMAIL_NOT_VERIFIED' | 'NETWORK' }
  | { status: 'rejected'; reason: string };

/** Respuestas tras las que no tiene sentido volver a intentarlo. */
const FINAL_ERRORS = ['ALREADY_REFERRED', 'SELF_REFERRAL', 'INVALID_CODE', 'CLAIM_WINDOW_EXPIRED', 'NO_CODE', 'USER_NOT_FOUND'];

/**
 * Referidos: link personal, canje del bono de bienvenida y contador de
 * amigos invitados. El bono lo concede SIEMPRE la Edge Function
 * `claim-referral` (aquí solo se le pide que lo intente).
 */
export class ReferralService {
  constructor(
    private readonly sb: SupabaseClient,
    private readonly auth: AuthService,
  ) {}

  static linkFor(code: string): string {
    return `${SITE_URL.replace(/\/$/, '')}/r/${code}`;
  }

  /**
   * Si el jugador llegó por un link (o se registró con código), intenta
   * canjear el bono. Seguro de llamar en cada inicio de sesión: solo pregunta
   * al servidor cuando hay un código pendiente.
   */
  async claimPending(): Promise<ClaimOutcome> {
    const user = this.auth.user;
    if (!user) return { status: 'none' };
    const doneKey = `dinomau:refDone:${user.id}`;
    const local = read(PENDING_REFERRAL_KEY);
    // Esta cuenta ya resolvió su bono en este dispositivo: no hay nada que pedir
    if (read(doneKey)) {
      if (local) remove(PENDING_REFERRAL_KEY);
      return { status: 'none' };
    }
    if (!local && !user.referralCode) return { status: 'none' };

    try {
      const res = await callFunction<{ coins: number; bonus: number }>('claim-referral', local ? { code: local } : {});
      this.finish(doneKey);
      return { status: 'granted', bonus: res.bonus, coins: res.coins };
    } catch (err) {
      const code = err instanceof BackendError ? err.code : 'NETWORK';
      if (code === 'EMAIL_NOT_VERIFIED') return { status: 'retry-later', reason: 'EMAIL_NOT_VERIFIED' };
      if (FINAL_ERRORS.includes(code)) {
        this.finish(doneKey);
        return { status: 'rejected', reason: code };
      }
      return { status: 'retry-later', reason: 'NETWORK' };
    }
  }

  private finish(doneKey: string): void {
    remove(PENDING_REFERRAL_KEY);
    write(doneKey, '1');
  }

  /** Amigos que se registraron con tu código y monedas ganadas por ellos. */
  async stats(): Promise<{ invited: number; played: number; earned: number }> {
    const user = this.auth.user;
    if (!user) return { invited: 0, played: 0, earned: 0 };
    const [refs, ledger] = await Promise.all([
      this.sb.from('referrals').select('inviter_bonus_granted_at').eq('inviter_id', user.id),
      this.sb.from('coin_ledger').select('delta').eq('user_id', user.id).eq('reason', 'referral_inviter'),
    ]);
    const rows = (refs.data ?? []) as Array<{ inviter_bonus_granted_at: string | null }>;
    return {
      invited: rows.length,
      played: rows.filter((r) => r.inviter_bonus_granted_at).length,
      earned: ((ledger.data ?? []) as Array<{ delta: number }>).reduce((s, r) => s + Number(r.delta), 0),
    };
  }
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* sin almacenamiento */
  }
}
function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* sin almacenamiento */
  }
}
