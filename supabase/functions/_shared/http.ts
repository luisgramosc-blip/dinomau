// Utilidades HTTP comunes a las Edge Functions (solo Deno).
import type { Db, HandlerResult } from './handlers.ts';
import { adminClient, getUserId, supabaseDb } from './supabaseDb.ts';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

/**
 * Envuelve un handler: CORS, método, autenticación y errores inesperados.
 * El handler recibe la base de datos (service_role) y el id del usuario.
 */
export function serveAuthed(handler: (db: Db, userId: string, body: unknown) => Promise<HandlerResult>): void {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json(405, { error: 'METHOD_NOT_ALLOWED' });
    try {
      const sb = adminClient();
      const userId = await getUserId(sb, req);
      if (!userId) return json(401, { error: 'UNAUTHORIZED' });
      const body = await req.json().catch(() => null);
      const result = await handler(supabaseDb(sb), userId, body);
      return json(result.status, result.body);
    } catch (err) {
      console.error(err);
      return json(500, { error: 'INTERNAL' });
    }
  });
}
