import { ADS_CONFIG, type AdRewardKind } from '@/config/ads.config';
import type { EconomyService } from './EconomyService';

/**
 * Monedas que se ganan viendo anuncios: duplicar las de la partida y el
 * regalo diario. Los límites diarios cuentan por día UTC (igual que el servidor).
 */
export type AdRewardError = 'LIMIT_REACHED' | 'ALREADY_CLAIMED' | 'NOT_ELIGIBLE' | 'AUTH_REQUIRED' | 'NETWORK';
export type AdRewardResult = { ok: true; bonus: number; coins: number } | { ok: false; error: AdRewardError };

export interface AdRewardService {
  /** false si ahora no se pueden ganar (p. ej. invitado con servidor: no se guardarían). */
  readonly available: boolean;
  /** Usos que quedan hoy. */
  remaining(kind: AdRewardKind): number;
  /** Vuelve a leer los usos de hoy (tras iniciar sesión, por ejemplo). */
  refresh(): Promise<void>;
  /** Regalo diario. */
  claimGift(): Promise<AdRewardResult>;
  /** Duplica las monedas de la partida `runId` (con servidor) o de la última (local). */
  claimDouble(runId: string | null, runCoins: number): Promise<AdRewardResult>;
}

export function dailyLimit(kind: AdRewardKind): number {
  return kind === 'double' ? ADS_CONFIG.doubleCoins.dailyLimit : ADS_CONFIG.dailyGift.dailyLimit;
}

/** Monedas extra por duplicar (con tope). */
export function doubleBonus(runCoins: number): number {
  return Math.max(0, Math.min(Math.floor(runCoins), ADS_CONFIG.doubleCoins.maxBonus));
}

/** ¿Se ofrece duplicar estas monedas? */
export function canOfferDouble(runCoins: number): boolean {
  return ADS_CONFIG.doubleCoins.enabled && runCoins >= ADS_CONFIG.doubleCoins.minCoins;
}

/** Día UTC 'AAAA-MM-DD'. */
export function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// --- Implementación local (sin servidor) ---------------------------------------

interface StoredCounts {
  day: string;
  double: number;
  gift: number;
}

const KEY = 'dinomau:adRewards:v1';

/**
 * Modo local: las monedas viven en el dispositivo, así que los límites también.
 * (No es seguro, igual que el monedero local; con servidor manda el servidor.)
 */
export class LocalAdRewards implements AdRewardService {
  readonly available = true;
  private counts: StoredCounts;

  constructor(
    private readonly economy: EconomyService,
    private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | null = safeStorage(),
    private readonly now: () => Date = () => new Date(),
  ) {
    this.counts = this.load();
  }

  remaining(kind: AdRewardKind): number {
    this.rollOver();
    return Math.max(0, dailyLimit(kind) - this.counts[kind]);
  }

  async refresh(): Promise<void> {
    this.rollOver();
  }

  claimGift(): Promise<AdRewardResult> {
    return this.claim('gift', ADS_CONFIG.dailyGift.coins);
  }

  claimDouble(_runId: string | null, runCoins: number): Promise<AdRewardResult> {
    if (!canOfferDouble(runCoins)) return Promise.resolve({ ok: false, error: 'NOT_ELIGIBLE' });
    return this.claim('double', doubleBonus(runCoins));
  }

  private async claim(kind: AdRewardKind, bonus: number): Promise<AdRewardResult> {
    if (this.remaining(kind) <= 0) return { ok: false, error: 'LIMIT_REACHED' };
    this.counts[kind]++;
    this.save();
    const res = await this.economy.creditRun(bonus);
    return res.ok ? { ok: true, bonus, coins: res.coins } : { ok: false, error: 'NETWORK' };
  }

  private rollOver(): void {
    const today = utcDay(this.now());
    if (this.counts.day !== today) this.counts = { day: today, double: 0, gift: 0 };
  }

  private load(): StoredCounts {
    const fresh = { day: utcDay(this.now()), double: 0, gift: 0 };
    try {
      const raw = this.storage?.getItem(KEY);
      if (!raw) return fresh;
      const d = JSON.parse(raw) as Partial<StoredCounts>;
      if (d.day !== fresh.day) return fresh;
      return { day: d.day, double: Number(d.double) || 0, gift: Number(d.gift) || 0 };
    } catch {
      return fresh;
    }
  }

  private save(): void {
    try {
      this.storage?.setItem(KEY, JSON.stringify(this.counts));
    } catch {
      /* sin almacenamiento */
    }
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
