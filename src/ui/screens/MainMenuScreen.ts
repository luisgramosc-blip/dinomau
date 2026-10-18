import { ABILITY_ICONS, getDino, type DinoId } from '@/config/dinos.config';
import { formatNumber, t } from '@/i18n/i18n';
import { $, html } from '../dom';

export interface MainMenuActions {
  onPlay(): void;
  onShop(): void;
  onRanking(): void;
  onInvite(): void;
  onSettings(): void;
  onAccount(): void;
}

/**
 * Menú principal. Detrás se ve la escena del runner con el dino equipado en
 * reposo, así el jugador ve con qué va a correr.
 */
export class MainMenuScreen {
  readonly el: HTMLElement;

  constructor(actions: MainMenuActions) {
    this.el = html(/* html */ `
      <section class="screen screen--menu">
        <header class="menu__top">
          <div class="chip chip--coins"><span class="coin-icon"></span><span data-ref="coins">0</span></div>
          <div class="menu__top-right">
            <button class="chip chip--account" data-action="account">👤 <span data-ref="account"></span></button>
            <button class="icon-btn" data-action="settings" aria-label="${t('menu.settings')}">⚙️</button>
          </div>
        </header>

        <h1 class="logo">dino<span>Mau</span></h1>
        <p class="tagline">${t('app.tagline')}</p>
        <p class="best-chip" data-ref="best"></p>

        <div class="menu__spacer"></div>

        <p class="chip chip--dino" data-ref="dino"></p>
        <button class="btn btn--play" data-action="play">▶ ${t('menu.play')}</button>
        <nav class="menu__grid">
          <button class="tile" data-action="shop"><span>🛒</span>${t('menu.shop')}</button>
          <button class="tile" data-action="ranking"><span>🏆</span>${t('menu.ranking')}</button>
          <button class="tile" data-action="invite"><span>👥</span>${t('menu.invite')}</button>
        </nav>
        <p class="hint">${t(matchMedia('(pointer: coarse)').matches ? 'start.controls.touch' : 'start.controls.keys')}</p>
      </section>
    `);
    const map: Record<string, () => void> = {
      play: actions.onPlay,
      shop: actions.onShop,
      ranking: actions.onRanking,
      invite: actions.onInvite,
      settings: actions.onSettings,
      account: actions.onAccount,
    };
    this.el.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((b) =>
      b.addEventListener('click', () => map[b.dataset.action!]?.()),
    );
  }

  /** Etiqueta del botón de cuenta: nombre, "Invitado · Entrar" o "Sin conexión". */
  setAccount(label: string, enabled: boolean): void {
    $(this.el, '[data-ref="account"]').textContent = label;
    $<HTMLButtonElement>(this.el, '[data-action="account"]').disabled = !enabled;
  }

  update(state: { coins: number; best: number; equipped: DinoId }): void {
    $(this.el, '[data-ref="coins"]').textContent = formatNumber(state.coins);
    const best = $(this.el, '[data-ref="best"]');
    best.textContent = state.best > 0 ? `🏆 ${t('hud.best')}: ${formatNumber(state.best)}` : '';
    best.style.visibility = state.best > 0 ? 'visible' : 'hidden';
    const dino = getDino(state.equipped);
    $(this.el, '[data-ref="dino"]').textContent = `${ABILITY_ICONS[dino.ability]} ${dino.name}`;
  }
}
