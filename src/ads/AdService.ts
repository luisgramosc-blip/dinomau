import {
  ADS_CONFIG, ADSENSE_CLIENT, resolveAdProvider,
  type AdProviderName, type InterstitialPlacement, type RewardedPlacement,
} from '@/config/ads.config';
import { events } from '@/core/EventBus';
import { AdPacer } from './AdPacer';
import { NoAdProvider, type AdProvider, type RewardedOutcome } from './AdProvider';
import { AdSenseProvider } from './AdSenseProvider';
import { MockAdProvider } from './MockAdProvider';

/**
 * Punto único para mostrar anuncios. El resto del juego no sabe qué red se
 * usa: pide "un anuncio con recompensa para revivir" o "un anuncio entre
 * partidas si toca" y recibe el resultado.
 *
 * Mientras se muestra un anuncio emite `ad:start` / `ad:end` (el audio se
 * silencia) y no deja abrir otro a la vez.
 */
export class AdService {
  private busy = false;

  constructor(
    private readonly provider: AdProvider,
    private readonly pacer = new AdPacer(),
    private readonly now: () => number = () => Date.now(),
  ) {}

  static create(name: AdProviderName = resolveAdProvider()): AdService {
    const env = import.meta.env;
    const provider =
      name === 'adsense'
        ? new AdSenseProvider(ADSENSE_CLIENT, { test: env.VITE_ADSENSE_TEST === 'on', frequencyHint: '30s' })
        : name === 'mock'
          ? new MockAdProvider()
          : new NoAdProvider();
    return new AdService(provider);
  }

  get providerName(): string {
    return this.provider.name;
  }

  /** ¿Hay anuncios con recompensa? (false con VITE_ADS_PROVIDER=none). */
  get rewardedEnabled(): boolean {
    return this.provider.name !== 'none';
  }

  get isShowing(): boolean {
    return this.busy;
  }

  init(): Promise<void> {
    return this.provider.init().catch((err) => console.warn('[anuncios] error al iniciar', err));
  }

  /** ¿Se ofrece revivir? Una vez por partida y solo si la partida no fue muy corta. */
  canOfferRevive(revivesUsed: number, distance: number): boolean {
    const r = ADS_CONFIG.revive;
    return r.enabled && this.rewardedEnabled && revivesUsed < r.maxPerRun && distance >= r.minDistance;
  }

  async showRewarded(placement: RewardedPlacement): Promise<RewardedOutcome> {
    if (this.busy || !this.rewardedEnabled) return 'unavailable';
    const outcome = await this.run(() => this.provider.showRewarded(placement), 'unavailable' as RewardedOutcome);
    if (outcome !== 'unavailable') this.pacer.rewardedShown(this.now());
    return outcome;
  }

  /** Llamar al terminar cada partida (cuenta para el ritmo de anuncios). */
  runFinished(): void {
    this.pacer.runFinished();
  }

  /** Muestra un anuncio entre partidas solo si toca. Resuelve cuando se puede seguir. */
  async maybeShowInterstitial(placement: InterstitialPlacement): Promise<void> {
    if (this.busy || this.provider.name === 'none' || !this.pacer.shouldShowInterstitial(this.now())) return;
    const shown = await this.run(() => this.provider.showInterstitial(placement), false);
    if (shown) this.pacer.interstitialShown(this.now());
  }

  /** Muestra el anuncio con el audio en silencio; si la red falla, devuelve `fallback`. */
  private async run<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
    this.busy = true;
    events.emit('ad:start');
    try {
      return await fn();
    } catch (err) {
      console.warn('[anuncios] error al mostrar', err);
      return fallback;
    } finally {
      this.busy = false;
      events.emit('ad:end');
    }
  }
}
