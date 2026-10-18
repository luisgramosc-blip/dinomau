/**
 * Bonos de referidos. Espejo para la UI de `game_config.referral` en Supabase:
 * quien los otorga y valida es SIEMPRE el servidor (Edge Function claim-referral
 * y finalize_run). Si cambias un valor, cámbialo también en la migración.
 */
export const REFERRAL_CONFIG = {
  /** Monedas para quien se registra con un link de referido. */
  welcomeBonus: 500,
  /** Monedas para quien invitó, cuando su amigo termina su primera partida. */
  inviterBonus: 250,
  inviterBonusEnabled: true,
  /** Horas desde el registro durante las que se puede canjear un código. */
  claimWindowHours: 72,
} as const;

/** Clave de localStorage donde se guarda el código de un link /r/CODIGO. */
export const PENDING_REFERRAL_KEY = 'dinomau:ref';
