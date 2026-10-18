import { DINOS, STARTER_DINO, getDino, type DinoId } from '@/config/dinos.config';
import { events } from '@/core/EventBus';

/**
 * Monedas e inventario de dinos del jugador.
 *
 * La interfaz es la que usará la versión con servidor (Fase 5): todas las
 * operaciones son asíncronas y devuelven un resultado explícito, así la UI no
 * cambia cuando las compras pasen a validarse en una Edge Function.
 */
export type EconomyError = 'INSUFFICIENT_COINS' | 'ALREADY_OWNED' | 'NOT_OWNED' | 'DINO_NOT_FOUND' | 'NETWORK';

export type EconomyResult = { ok: true; coins: number } | { ok: false; error: EconomyError };

export interface WalletSnapshot {
  coins: number;
  owned: ReadonlySet<DinoId>;
  equipped: DinoId;
}

export interface EconomyService {
  readonly snapshot: WalletSnapshot;
  purchase(id: DinoId): Promise<EconomyResult>;
  equip(id: DinoId): Promise<EconomyResult>;
  /** Acredita las monedas de una partida terminada. */
  creditRun(coins: number): Promise<EconomyResult>;
}

/** Estado de un dino en la tienda. */
export type DinoShopState = 'locked' | 'buyable' | 'owned' | 'equipped';

export function dinoShopState(id: DinoId, wallet: WalletSnapshot): DinoShopState {
  if (wallet.equipped === id) return 'equipped';
  if (wallet.owned.has(id)) return 'owned';
  return wallet.coins >= getDino(id).price ? 'buyable' : 'locked';
}

// --- Implementación local -----------------------------------------------------

interface StoredWallet {
  coins: number;
  owned: DinoId[];
  equipped: DinoId;
}

const KEY = 'dinomau:wallet:v1';
const VALID_IDS = new Set<string>(DINOS.map((d) => d.id));

/**
 * ⚠️ PROVISIONAL (Fases 3–4): guarda el monedero en el dispositivo para poder
 * probar la tienda sin backend. NO es seguro (se puede editar desde el
 * navegador). En la Fase 5 se sustituye por SupabaseEconomyService, que pide
 * cuenta para comprar y valida todo en el servidor.
 */
export class LocalEconomyService implements EconomyService {
  private wallet: { coins: number; owned: Set<DinoId>; equipped: DinoId };

  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | null = safeLocalStorage()) {
    this.wallet = this.load();
  }

  get snapshot(): WalletSnapshot {
    return { coins: this.wallet.coins, owned: new Set(this.wallet.owned), equipped: this.wallet.equipped };
  }

  async purchase(id: DinoId): Promise<EconomyResult> {
    if (!VALID_IDS.has(id)) return { ok: false, error: 'DINO_NOT_FOUND' };
    if (this.wallet.owned.has(id)) return { ok: false, error: 'ALREADY_OWNED' };
    const price = getDino(id).price;
    if (this.wallet.coins < price) return { ok: false, error: 'INSUFFICIENT_COINS' };
    this.wallet.coins -= price;
    this.wallet.owned.add(id);
    this.save();
    events.emit('wallet:changed', { coins: this.wallet.coins });
    return { ok: true, coins: this.wallet.coins };
  }

  async equip(id: DinoId): Promise<EconomyResult> {
    if (!this.wallet.owned.has(id)) return { ok: false, error: 'NOT_OWNED' };
    this.wallet.equipped = id;
    this.save();
    events.emit('dino:equipped', { id });
    return { ok: true, coins: this.wallet.coins };
  }

  async creditRun(coins: number): Promise<EconomyResult> {
    const amount = Math.max(0, Math.floor(coins));
    this.wallet.coins += amount;
    this.save();
    if (amount > 0) events.emit('wallet:changed', { coins: this.wallet.coins });
    return { ok: true, coins: this.wallet.coins };
  }

  private load(): { coins: number; owned: Set<DinoId>; equipped: DinoId } {
    const fallback = { coins: 0, owned: new Set<DinoId>([STARTER_DINO]), equipped: STARTER_DINO };
    try {
      const raw = this.storage?.getItem(KEY);
      if (!raw) return fallback;
      const data = JSON.parse(raw) as Partial<StoredWallet>;
      const owned = new Set<DinoId>((data.owned ?? []).filter((id) => VALID_IDS.has(id)));
      owned.add(STARTER_DINO);
      const equipped = data.equipped && owned.has(data.equipped) ? data.equipped : STARTER_DINO;
      const coins = Number.isFinite(data.coins) ? Math.max(0, Math.floor(data.coins!)) : 0;
      return { coins, owned, equipped };
    } catch {
      return fallback;
    }
  }

  private save(): void {
    const data: StoredWallet = {
      coins: this.wallet.coins,
      owned: [...this.wallet.owned],
      equipped: this.wallet.equipped,
    };
    try {
      this.storage?.setItem(KEY, JSON.stringify(data));
    } catch {
      /* sin almacenamiento: se mantiene en memoria */
    }
  }
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
