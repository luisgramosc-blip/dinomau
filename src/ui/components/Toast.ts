import { hide, html, replayAnimation, show } from '../dom';

/** Aviso breve centrado (fuera de partida: menú, tienda). */
export class Toast {
  readonly el: HTMLElement;
  private timer = 0;

  constructor() {
    this.el = html(`<div class="toast toast--global hidden" role="status"></div>`);
  }

  show(text: string, ms = 1800): void {
    this.el.textContent = text;
    show(this.el);
    replayAnimation(this.el, 'toast--in');
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => hide(this.el), ms);
  }
}
