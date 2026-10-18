import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Cliente de Supabase del navegador (clave `anon`, pública). Si faltan las
 * variables de entorno el juego funciona en "modo sin servidor" con el
 * monedero local (útil para desarrollar sin backend).
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
      })
    : null;

export const isBackendEnabled = supabase !== null;

/** URL pública del juego (links de referido, redirecciones de login). */
export const SITE_URL: string = (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined) ?? window.location.origin;

/** Error de negocio devuelto por una Edge Function (p. ej. INSUFFICIENT_COINS). */
export class BackendError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

/** Llama a una Edge Function y devuelve su JSON o lanza BackendError con el código. */
export async function callFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new BackendError('BACKEND_DISABLED');
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let code = 'NETWORK';
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        code = ((await ctx.json()) as { error?: string }).error ?? code;
      } catch {
        /* respuesta sin JSON */
      }
    }
    throw new BackendError(code);
  }
  return data as T;
}
