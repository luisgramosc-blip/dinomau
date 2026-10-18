import { t } from '@/i18n/i18n';
import { $, hide, html, show } from '../dom';

/** Instrucciones para instalar en iPhone/iPad (Safari no ofrece aviso de instalación). */
export class IosInstallSheet {
  readonly el: HTMLElement;

  constructor() {
    this.el = html(/* html */ `
      <section class="screen screen--modal hidden">
        <div class="card">
          <h2>${t('pwa.iosTitle')}</h2>
          <p class="ios-steps">${t('pwa.iosSteps')}</p>
          <button class="btn btn--primary" data-action="ok">${t('pwa.ok')}</button>
        </div>
      </section>
    `);
    $(this.el, '[data-action="ok"]').addEventListener('click', () => hide(this.el));
  }

  open(): void {
    show(this.el);
  }
}
