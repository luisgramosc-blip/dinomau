import { ADS_CONFIG, type InterstitialPlacement, type RewardedPlacement } from '@/config/ads.config';
import { t } from '@/i18n/i18n';
import { $, html } from '@/ui/dom';
import type { AdProvider, RewardedOutcome } from './AdProvider';

/**
 * Anuncio de prueba: una pantalla con cuenta atrás que se comporta como uno
 * real (se puede cerrar antes y perder la recompensa). Sirve para probar todo
 * el recorrido sin cuenta de anuncios.
 */
export class MockAdProvider implements AdProvider {
  readonly name = 'mock';

  constructor(
    private readonly timing: { rewardedSeconds: number; interstitialSeconds: number } = ADS_CONFIG.mock,
    private readonly root: HTMLElement = document.body,
  ) {}

  async init(): Promise<void> {}

  showRewarded(placement: RewardedPlacement): Promise<RewardedOutcome> {
    return this.show(this.timing.rewardedSeconds, true, placement).then((done) => (done ? 'rewarded' : 'dismissed'));
  }

  async showInterstitial(placement: InterstitialPlacement): Promise<boolean> {
    await this.show(this.timing.interstitialSeconds, false, placement);
    return true;
  }

  /** Resuelve true si se esperó hasta el final. */
  private show(seconds: number, rewarded: boolean, placement: string): Promise<boolean> {
    return new Promise((resolve) => {
      const el = html(/* html */ `
        <div class="mock-ad" role="dialog" aria-modal="true" data-placement="${placement}">
          <div class="mock-ad__top">
            <span class="mock-ad__badge">${t('ads.testBadge')}</span>
            <button class="mock-ad__close" data-action="close" aria-label="${t('ads.close')}">✕</button>
          </div>
          <div class="mock-ad__body">
            <div class="mock-ad__art" aria-hidden="true">🦕</div>
            <p class="mock-ad__title">${t('ads.testTitle')}</p>
            <p class="mock-ad__text">${t(rewarded ? 'ads.testRewardedText' : 'ads.testInterstitialText')}</p>
          </div>
          <div class="mock-ad__bar"><span data-ref="bar"></span></div>
          <p class="mock-ad__timer" data-ref="timer"></p>
        </div>
      `);
      this.root.append(el);
      const bar = $(el, '[data-ref="bar"]');
      const timer = $(el, '[data-ref="timer"]');
      const close = $<HTMLButtonElement>(el, '[data-action="close"]');
      // En los de pantalla completa la X aparece al terminar, como en los reales
      if (!rewarded) close.hidden = true;

      const start = performance.now();
      let finished = false;
      const tick = () => {
        const left = Math.max(0, seconds - (performance.now() - start) / 1000);
        bar.style.transform = `scaleX(${1 - left / seconds})`;
        if (left > 0) {
          timer.textContent = t(rewarded ? 'ads.rewardIn' : 'ads.closeIn', { value: Math.ceil(left) });
          return;
        }
        if (!finished) {
          finished = true;
          timer.textContent = rewarded ? t('ads.rewardReady') : '';
          close.hidden = false;
          el.classList.add('mock-ad--done');
        }
      };
      tick();
      const interval = window.setInterval(tick, 100);
      close.addEventListener('click', () => {
        window.clearInterval(interval);
        el.remove();
        resolve(finished);
      });
    });
  }
}
