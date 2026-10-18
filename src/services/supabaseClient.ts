import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { BackendError, SUPABASE_ANON_KEY, SUPABASE_URL } from './env';

/**
 * Cliente de Supabase del navegador (clave `anon`, pública). Solo se carga
 * cuando hay backend configurado (ver services/backend.ts).
 */
export const supabase: SupabaseClient | null =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
      })
    : null;

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
