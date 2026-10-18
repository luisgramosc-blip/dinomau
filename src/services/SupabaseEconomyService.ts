import type { SupabaseClient } from '@supabase/supabase-js';
import { DINOS, STARTER_DINO, type DinoId } from '@/config/dinos.config';
import { events } from '@/core/EventBus';
import type { AuthService } from './AuthService';
import type { EconomyError, EconomyResult, EconomyService, WalletSnapshot } from './EconomyService';
import { BackendError, callFunction } from './supabaseClient';

export interface Profile {
  id: string;
  username: string | null;
  coins: number;
  equippedDino: DinoId;
  bestScore: number;
  totalRuns: number;
  battlesWon: number;
  battlesLost: number;
  referralCode: string;
}

const VALID_IDS = new Set<string>(DINOS.map((d) => d.id));
const GUEST: WalletSnapshot = { coins: 0, owned: new Set([STARTER_DINO]), equipped: STARTER_DINO };

/**
 * Monedero en Supabase. Lee perfil y dinos con la clave anon (RLS: solo los
 * propios); las compras pasan por la Edge Function `purchase-dino`. Equipar es
 * un UPDATE directo: la BD solo deja cambiar esa columna y comprueba que el
 * dino sea del jugador.
 *
 * Como invitado el monedero está vacío y comprar devuelve AUTH_REQUIRED.
 */
export class SupabaseEconomyService implements EconomyService {
  readonly mode = 'server' as const;
  private wallet: WalletSnapshot = GUEST;
  private profileCache: Profile | null = null;

  /** Tras iniciar o cerrar sesión hay que llamar a `refresh()` (lo hace main.ts). */
  constructor(
    private readonly sb: SupabaseClient,
    private readonly auth: AuthService,
  ) {}

  get snapshot(): WalletSnapshot {
    return { coins: this.wallet.coins, owned: new Set(this.wallet.owned), equipped: this.wallet.equipped };
  }

  get profile(): Profile | null {
    return this.profileCache;
  }

  async refresh(): Promise<void> {
    const user = this.auth.user;
    if (!user) {
      this.profileCache = null;
      this.apply(GUEST);
      return;
    }
    const [profileRes, dinosRes] = await Promise.all([
      this.sb.from('profiles')
        .select('id, username, coins, equipped_dino_id, best_score, total_runs, battles_won, battles_lost, referral_code')
        .eq('id', user.id).single(),
      this.sb.from('user_dinos').select('dino_id').eq('user_id', user.id),
    ]);
    if (profileRes.error || !profileRes.data) {
      console.warn('[economía] no se pudo leer el perfil', profileRes.error);
      return;
    }
    const p = profileRes.data;
    this.profileCache = {
      id: p.id,
      username: p.username,
      coins: Number(p.coins),
      equippedDino: VALID_IDS.has(p.equipped_dino_id) ? p.equipped_dino_id : STARTER_DINO,
      bestScore: Number(p.best_score),
      totalRuns: p.total_runs,
      battlesWon: p.battles_won,
      battlesLost: p.battles_lost,
      referralCode: p.referral_code,
    };
    const owned = new Set<DinoId>([STARTER_DINO]);
    for (const row of dinosRes.data ?? []) if (VALID_IDS.has(row.dino_id)) owned.add(row.dino_id as DinoId);
    this.apply({ coins: this.profileCache.coins, owned, equipped: this.profileCache.equippedDino });
    events.emit('profile:changed', { username: this.profileCache.username });
  }

  private apply(next: WalletSnapshot): void {
    const equippedChanged = next.equipped !== this.wallet.equipped;
    this.wallet = next;
    events.emit('wallet:changed', { coins: next.coins });
    if (equippedChanged) events.emit('dino:equipped', { id: next.equipped });
  }

  async purchase(id: DinoId): Promise<EconomyResult> {
    if (!this.auth.user) return { ok: false, error: 'AUTH_REQUIRED' };
    try {
      const { coins } = await callFunction<{ coins: number }>('purchase-dino', { dinoId: id });
      const owned = new Set(this.wallet.owned).add(id);
      this.apply({ ...this.wallet, coins, owned });
      return { ok: true, coins };
    } catch (err) {
      return { ok: false, error: toEconomyError(err) };
    }
  }

  async equip(id: DinoId): Promise<EconomyResult> {
    const user = this.auth.user;
    if (!user) return { ok: false, error: 'AUTH_REQUIRED' };
    if (!this.wallet.owned.has(id)) return { ok: false, error: 'NOT_OWNED' };
    const { error } = await this.sb.from('profiles').update({ equipped_dino_id: id }).eq('id', user.id);
    if (error) return { ok: false, error: error.message.includes('DINO_NOT_OWNED') ? 'NOT_OWNED' : 'NETWORK' };
    if (this.profileCache) this.profileCache.equippedDino = id;
    this.apply({ ...this.wallet, equipped: id });
    return { ok: true, coins: this.wallet.coins };
  }

  async creditRun(): Promise<EconomyResult> {
    // Con servidor las monedas las acredita finish-run (ver RunService)
    return { ok: true, coins: this.wallet.coins };
  }

  setCoins(coins: number): void {
    if (this.profileCache) this.profileCache.coins = coins;
    this.apply({ ...this.wallet, coins });
  }

  /** Cambia el nombre público. Devuelve un código de error o null. */
  async setUsername(username: string): Promise<'INVALID' | 'TAKEN' | 'NETWORK' | null> {
    const user = this.auth.user;
    if (!user) return 'NETWORK';
    if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) return 'INVALID';
    const { error } = await this.sb.from('profiles').update({ username }).eq('id', user.id);
    if (error) return error.code === '23505' ? 'TAKEN' : error.code === '23514' ? 'INVALID' : 'NETWORK';
    if (this.profileCache) this.profileCache.username = username;
    events.emit('profile:changed', { username });
    return null;
  }

  /** Batallas ganadas (progreso de la escalera de rivales). */
  get battlesWon(): number {
    return this.profileCache?.battlesWon ?? 0;
  }
}

function toEconomyError(err: unknown): EconomyError {
  const code = err instanceof BackendError ? err.code : 'NETWORK';
  const known: EconomyError[] = ['INSUFFICIENT_COINS', 'ALREADY_OWNED', 'NOT_OWNED', 'DINO_NOT_FOUND', 'AUTH_REQUIRED'];
  if (code === 'UNAUTHORIZED') return 'AUTH_REQUIRED';
  return (known as string[]).includes(code) ? (code as EconomyError) : 'NETWORK';
}
