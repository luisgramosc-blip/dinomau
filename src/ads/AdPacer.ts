import { ADS_CONFIG } from '@/config/ads.config';

export interface InterstitialRules {
  enabled: boolean;
  graceRuns: number;
  everyNRuns: number;
  minIntervalSeconds: number;
  afterRewardedSeconds: number;
}

/**
 * Decide cuándo toca un anuncio entre partidas para que no moleste: nunca en
 * las primeras partidas, como mucho uno cada N partidas, con un mínimo de
 * tiempo entre anuncios y un respiro tras ver uno con recompensa.
 * Lógica pura (el reloj se pasa por parámetro) para poder probarla.
 */
export class AdPacer {
  private runsFinished = 0;
  private runsSinceInterstitial = 0;
  private lastInterstitialAt = -Infinity;
  private lastRewardedAt = -Infinity;

  constructor(private readonly rules: InterstitialRules = ADS_CONFIG.interstitial) {}

  /** Llamar al terminar cada partida. */
  runFinished(): void {
    this.runsFinished++;
    this.runsSinceInterstitial++;
  }

  rewardedShown(nowMs: number): void {
    this.lastRewardedAt = nowMs;
  }

  interstitialShown(nowMs: number): void {
    this.lastInterstitialAt = nowMs;
    this.runsSinceInterstitial = 0;
  }

  shouldShowInterstitial(nowMs: number): boolean {
    const r = this.rules;
    if (!r.enabled) return false;
    if (this.runsFinished <= r.graceRuns) return false;
    if (this.runsSinceInterstitial < r.everyNRuns) return false;
    if (nowMs - this.lastInterstitialAt < r.minIntervalSeconds * 1000) return false;
    if (nowMs - this.lastRewardedAt < r.afterRewardedSeconds * 1000) return false;
    return true;
  }
}
