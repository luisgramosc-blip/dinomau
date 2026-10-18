import type { SupabaseClient } from '@supabase/supabase-js';
import type { DinoId } from '@/config/dinos.config';

export type LeaderboardPeriod = 'all' | 'weekly';

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  dinoId: DinoId;
  score: number;
}

const CACHE_MS = 30_000;

/** Ranking global y semanal (funciones SQL públicas que exponen solo nombre, dino y puntaje). */
export class LeaderboardService {
  private cache = new Map<LeaderboardPeriod, { at: number; rows: LeaderboardEntry[] }>();

  constructor(private readonly sb: SupabaseClient) {}

  async top(period: LeaderboardPeriod, limit = 50): Promise<LeaderboardEntry[]> {
    const cached = this.cache.get(period);
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.rows;
    const { data, error } = await this.sb.rpc('get_leaderboard', { p_period: period, p_limit: limit });
    if (error) throw error;
    const rows = ((data ?? []) as Array<{ rank: number; user_id: string; username: string; dino_id: DinoId; score: number }>)
      .map((r) => ({ rank: Number(r.rank), userId: r.user_id, username: r.username, dinoId: r.dino_id, score: Number(r.score) }));
    this.cache.set(period, { at: Date.now(), rows });
    return rows;
  }

  /** Posición del jugador (null si no tiene puntaje o no tiene nombre). */
  async myRank(period: LeaderboardPeriod): Promise<{ rank: number; score: number } | null> {
    const { data, error } = await this.sb.rpc('get_my_rank', { p_period: period });
    if (error || !data || (data as unknown[]).length === 0) return null;
    const row = (data as Array<{ rank: number; score: number }>)[0];
    return { rank: Number(row.rank), score: Number(row.score) };
  }

  invalidate(): void {
    this.cache.clear();
  }
}
