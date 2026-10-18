import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Lee el JSON de `game_config` (clave dada) de las migraciones SQL. */
export function readServerConfig<T>(key: string): T {
  const dir = join(__dirname, '../../supabase/migrations');
  const sql = readdirSync(dir).sort().map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
  const match = sql.match(new RegExp(`\\('${key}',\\s*'([\\s\\S]*?)'\\)`));
  if (!match) throw new Error(`No se encontró game_config.${key} en las migraciones`);
  return JSON.parse(match[1]) as T;
}

/** Precios de la tabla `dinos` en la migración inicial. */
export function readServerDinoPrices(): Record<string, number> {
  const sql = readFileSync(join(__dirname, '../../supabase/migrations/20261018000000_init.sql'), 'utf8');
  const prices: Record<string, number> = {};
  for (const m of sql.matchAll(/\('([a-z_]+)',\s*'[^']+',\s*(\d+),/g)) prices[m[1]] = Number(m[2]);
  return prices;
}
