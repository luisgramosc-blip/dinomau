import { ADS_CONFIG } from '@/config/ads.config';
import { t } from '@/i18n/i18n';
import { $, hide, html, show } from '../dom';

/**
 * "¿Revivir?" tras chocar: anillo con cuenta atrás, botón para ver el anuncio
 * y "No, gracias". Si se acaba el tiempo cuenta como "no".
 */
export class ReviveScreen {
  readonly el: HTMLElement;
  private timer = 0;
  private deadline = 0;
  private decided = false;

  constructor(private readonly actions: { onWatch(): void; onSkip(): void }) {
    this.el = html(/* html */ `
      <section class="screen screen--modal hidden">
        <div class="card card--revive">
          <h2>${t('revive.title')}</h2>
          <div class="revive__ring" data-ref="ring" style="--p:1"><span data-ref="seconds"></span></div>
          <p class="revive__hint">${t('revive.hint')}</p>
          <button class="btn btn--primary btn--revive" data-action="watch">${t('revive.watch')}</button>
          <button class="btn btn--ghost" data-action="skip">${t('revive.skip')}</button>
        </div>
      </section>
    `);
    $(this.el, '[data-action="watch"]').addEventListener('click', () => this.decide(actions.onWatch));
    $(this.el, '[data-action="skip"]').addEventListener('click', () => this.decide(actions.onSkip));
  }

  get isOpen(): boolean {
    return !this.el.classList.contains('hidden');
  }

  open(): void {
    this.decided = false;
    const total = ADS_CONFIG.revive.offerSeconds;
    this.deadline = performance.now() + total * 1000;
    show(this.el);
    const ring = $(this.el, '[data-ref="ring"]');
    const seconds = $(this.el, '[data-ref="seconds"]');
    const tick = () => {
      const left = Math.max(0, (this.deadline - performance.now()) / 1000);
      ring.style.setProperty('--p', String(left / total));
      seconds.textContent = String(Math.ceil(left));
      if (left <= 0) this.decide(this.actions.onSkip);
    };
    tick();
    window.clearInterval(this.timer);
    this.timer = window.setInterval(tick, 100);
  }

  close(): void {
    window.clearInterval(this.timer);
    hide(this.el);
  }

  private decide(fn: () => void): void {
    if (this.decided) return;
    this.decided = true;
    this.close();
    fn();
  }
}
