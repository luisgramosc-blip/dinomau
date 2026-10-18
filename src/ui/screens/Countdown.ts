import { events } from '@/core/EventBus';
import { t } from '@/i18n/i18n';
import { hide, html, replayAnimation, show } from '../dom';

/** Números grandes 3 · 2 · 1 · ¡YA! al reanudar (pausa y, en la Fase 4, batallas). */
export class Countdown {
  readonly el: HTMLElement;
  private hideTimer = 0;

  constructor() {
    this.el = html(`<div class="countdown hidden" aria-live="assertive"></div>`);
    events.on('run:countdown', ({ value }) => {
      this.el.textContent = value > 0 ? String(value) : t('countdown.go');
      show(this.el);
      replayAnimation(this.el, 'countdown--pop');
      window.clearTimeout(this.hideTimer);
      if (value === 0) this.hideTimer = window.setTimeout(() => hide(this.el), 600);
    });
    events.on('run:pause', () => hide(this.el));
  }
}
