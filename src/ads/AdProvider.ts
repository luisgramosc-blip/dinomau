import type { InterstitialPlacement, RewardedPlacement } from '@/config/ads.config';

/**
 * Resultado de un anuncio con recompensa:
 *  - 'rewarded'    lo vio entero → se da la recompensa
 *  - 'dismissed'   lo cerró antes de tiempo → no hay recompensa
 *  - 'unavailable' no había anuncio (sin conexión, bloqueador, sin inventario)
 */
export type RewardedOutcome = 'rewarded' | 'dismissed' | 'unavailable';

/**
 * Una red de anuncios. Para añadir otra (AdMob, el SDK de un portal…) basta
 * con implementar esto y elegirla en AdService.
 */
export interface AdProvider {
  readonly name: string;
  /** Carga el SDK. No debe lanzar: si falla, los anuncios quedan "no disponibles". */
  init(): Promise<void>;
  showRewarded(placement: RewardedPlacement): Promise<RewardedOutcome>;
  /** Devuelve true si se llegó a mostrar un anuncio. */
  showInterstitial(placement: InterstitialPlacement): Promise<boolean>;
}

/** Sin anuncios (VITE_ADS_PROVIDER=none). */
export class NoAdProvider implements AdProvider {
  readonly name = 'none';
  async init(): Promise<void> {}
  async showRewarded(): Promise<RewardedOutcome> {
    return 'unavailable';
  }
  async showInterstitial(): Promise<boolean> {
    return false;
  }
}
