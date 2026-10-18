import type { InterstitialPlacement, RewardedPlacement } from '@/config/ads.config';
import type { AdProvider, RewardedOutcome } from './AdProvider';

/**
 * Google AdSense para juegos (H5 Games Ads, "Ad Placement API").
 * Documentación: https://developers.google.com/ad-placement
 *
 * Necesita una cuenta de AdSense aprobada para el dominio del juego y
 * VITE_ADSENSE_CLIENT=ca-pub-XXXXXXXXXXXXXXXX. Con VITE_ADSENSE_TEST=on Google
 * sirve anuncios de prueba (úsalo mientras desarrollas: hacer clic en tus
 * propios anuncios reales puede cerrar la cuenta).
 *
 * El aviso de consentimiento de cookies (Europa/Reino Unido) lo muestra Google
 * con este mismo script si lo activas en AdSense → Privacidad y mensajes.
 */
interface PlacementInfo {
  breakStatus: 'notReady' | 'timeout' | 'error' | 'noAdPreloaded' | 'frequencyCapped' | 'ignored' | 'other' | 'dismissed' | 'viewed';
}

interface AdBreakConfig {
  type: 'reward' | 'next' | 'start' | 'pause' | 'browse';
  name: string;
  beforeAd?: () => void;
  afterAd?: () => void;
  beforeReward?: (showAdFn: () => void) => void;
  adDismissed?: () => void;
  adViewed?: () => void;
  adBreakDone?: (info: PlacementInfo) => void;
}

type AdsQueue = Array<Record<string, unknown>>;
declare global {
  interface Window {
    adsbygoogle?: AdsQueue;
    adBreak?: (o: AdBreakConfig) => void;
    adConfig?: (o: Record<string, unknown>) => void;
  }
}

const SCRIPT_URL = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js';
/** Si Google no responde en este tiempo, el anuncio cuenta como no disponible. */
const BREAK_TIMEOUT_MS = 12_000;

export class AdSenseProvider implements AdProvider {
  readonly name = 'adsense';
  private ready = false;

  constructor(
    private readonly client: string,
    private readonly options: { test: boolean; frequencyHint?: string } = { test: false },
  ) {}

  async init(): Promise<void> {
    if (document.querySelector(`script[src^="${SCRIPT_URL}"]`)) return;
    window.adsbygoogle = window.adsbygoogle ?? [];
    const push = (o: Record<string, unknown>) => window.adsbygoogle!.push(o);
    window.adBreak = push as unknown as Window['adBreak'];
    window.adConfig = push;

    const s = document.createElement('script');
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.src = `${SCRIPT_URL}?client=${encodeURIComponent(this.client)}`;
    s.dataset.adClient = this.client;
    if (this.options.test) s.dataset.adbreakTest = 'on';
    if (this.options.frequencyHint) s.dataset.adFrequencyHint = this.options.frequencyHint;
    // Con bloqueador de anuncios el script no carga: el juego sigue igual
    s.onerror = () => console.warn('[anuncios] no se pudo cargar AdSense');
    document.head.append(s);

    window.adConfig({
      preloadAdBreaks: 'on',
      sound: 'on',
      onReady: () => (this.ready = true),
    });
  }

  showRewarded(placement: RewardedPlacement): Promise<RewardedOutcome> {
    return new Promise((resolve) => {
      let outcome: RewardedOutcome = 'unavailable';
      const done = settleOnce(() => resolve(outcome));
      const timer = window.setTimeout(done, BREAK_TIMEOUT_MS);
      window.adBreak!({
        type: 'reward',
        name: placement,
        // El jugador ya eligió ver el anuncio con nuestro botón: se muestra directamente
        beforeReward: (showAdFn) => {
          window.clearTimeout(timer);
          showAdFn();
        },
        adViewed: () => (outcome = 'rewarded'),
        adDismissed: () => (outcome = 'dismissed'),
        adBreakDone: () => {
          window.clearTimeout(timer);
          done();
        },
      });
    });
  }

  showInterstitial(placement: InterstitialPlacement): Promise<boolean> {
    return new Promise((resolve) => {
      let shown = false;
      const done = settleOnce(() => resolve(shown));
      const timer = window.setTimeout(done, BREAK_TIMEOUT_MS);
      window.adBreak!({
        type: 'next',
        name: placement,
        beforeAd: () => {
          window.clearTimeout(timer);
          shown = true;
        },
        adBreakDone: () => {
          window.clearTimeout(timer);
          done();
        },
      });
    });
  }

  /** Google avisó de que ya puede servir anuncios. */
  get isReady(): boolean {
    return this.ready;
  }
}

function settleOnce(fn: () => void): () => void {
  let called = false;
  return () => {
    if (called) return;
    called = true;
    fn();
  };
}
