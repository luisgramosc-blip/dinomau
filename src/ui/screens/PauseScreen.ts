import { t } from '@/i18n/i18n';
import { $, html } from '../dom';
import { settingsToggles } from './SettingsScreen';

/** Pausa con ajustes rápidos (sonido, música, vibración). */
export class PauseScreen {
  readonly el: HTMLElement;

  constructor(actions: { onResume(): void; onMenu(): void }) {
    this.el = html(/* html */ `
      <section class="screen screen--modal hidden">
        <div class="card">
          <h2>${t('pause.title')}</h2>
          <div data-ref="toggles"></div>
          <button class="btn btn--primary" data-action="resume">${t('pause.resume')}</button>
          <button class="btn btn--ghost" data-action="menu">${t('pause.menu')}</button>
        </div>
      </section>
    `);
    $(this.el, '[data-ref="toggles"]').replaceWith(settingsToggles());
    $(this.el, '[data-action="resume"]').addEventListener('click', actions.onResume);
    $(this.el, '[data-action="menu"]').addEventListener('click', actions.onMenu);
  }
}
