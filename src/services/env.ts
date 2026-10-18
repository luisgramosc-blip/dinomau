/**
 * Configuración del entorno SIN dependencias pesadas. Lo que necesita saber
 * todo el juego (¿hay servidor?, URL pública) vive aquí para que supabase-js
 * solo se descargue cuando de verdad hay backend (ver services/backend.ts).
 */
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const isBackendConfigured = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

/** URL pública del juego (links de referido, redirecciones de login). */
export const SITE_URL: string = (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined) ?? window.location.origin;

/** Link de invitación de un jugador. */
export function referralLink(code: string): string {
  return `${SITE_URL.replace(/\/$/, '')}/r/${code}`;
}

/** Error de negocio devuelto por una Edge Function (p. ej. INSUFFICIENT_COINS). */
export class BackendError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
