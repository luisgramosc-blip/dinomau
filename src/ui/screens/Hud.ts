import { POWERUPS, type PowerUpType } from '@/config/powerups.config';
import { events } from '@/core/EventBus';
import { formatNumber, t, type TranslationKey } from '@/i18n/i18n';
import { $, hide, html, replayAnimation, show } from '../dom';

/**
 * HUD de la partida: monedas, puntaje, power-ups activos con barra de tiempo
 * y botón de pausa.
 */
export class Hud {
  readonly el: HTMLElement;
  private readonly coins: HTMLElement;
  private readonly coinsBox: HTMLElement;
  private readonly score: HTMLElement;
  private readonly best: HTMLElement;
  private readonly multiplier: HTMLElement;
  private readonly powerList: HTMLElement;
  private readonly toast: HTMLElement;
  private readonly slots = new Map<PowerUpType, { el: HTMLElement; bar: HTMLElement }>();
  private toastTimer = 0;

  constructor(onPause: () => void) {
    this.el = html(/* html */ `
      <div class="hud hidden">
        <header class="hud__top">
          <div class="hud__coins" data-ref="coins-box">
            <span class="coin-icon"></span><span data-ref="coins">0</span>
            <span class="hud__x2 hidden" data-ref="x2">x2</span>
          </div>
          <div class="hud__right">
            <div class="hud__score">
              <span data-ref="score">0</span>
              <small data-ref="best"></small>
            </div>
            <button class="hud__pause" data-action="pause" aria-label="${t('hud.pause')}">
              <span></span><span></span>
            </button>
          </div>
        </header>
        <ul class="hud__powerups" data-ref="powerups"></ul>
        <div class="toast hidden" data-ref="toast"></div>
      </div>
    `);
    this.coins = $(this.el, '[data-ref="coins"]');
    this.coinsBox = $(this.el, '[data-ref="coins-box"]');
    this.score = $(this.el, '[data-ref="score"]');
    this.best = $(this.el, '[data-ref="best"]');
    this.multiplier = $(this.el, '[data-ref="x2"]');
    this.powerList = $(this.el, '[data-ref="powerups"]');
    this.toast = $(this.el, '[data-ref="toast"]');
    $(this.el, '[data-action="pause"]').addEventListener('click', onPause);

    events.on('coin:collected', ({ total }) => {
      this.coins.textContent = formatNumber(total);
      replayAnimation(this.coinsBox, 'bump');
    });
    events.on('score:update', ({ score }) => (this.score.textContent = formatNumber(score)));
    events.on('run:coins', ({ total }) => {
      this.coins.textContent = formatNumber(total);
      replayAnimation(this.coinsBox, 'bump');
    });
    events.on('powerups:tick', ({ items }) => this.renderPowerUps(items));
    events.on('powerup:start', ({ type }) => {
      if (type === 'multiplier') show(this.multiplier);
      this.showToast(`${POWERUPS[type].icon} ${t(`powerup.${type}` as TranslationKey)}`);
    });
    events.on('powerup:end', ({ type }) => type === 'multiplier' && hide(this.multiplier));
    events.on('shield:break', () => this.showToast(`🛡️ ${t('toast.shieldBreak')}`));
    events.on('ability:used', ({ ability }) => {
      const text = t(`toast.ability.${ability}` as TranslationKey);
      if (text && text !== `toast.ability.${ability}`) this.showToast(text);
    });
  }

  reset(bestScore: number): void {
    this.coins.textContent = '0';
    this.score.textContent = '0';
    this.best.textContent = bestScore > 0 ? `${t('hud.best')} ${formatNumber(bestScore)}` : '';
    hide(this.multiplier, this.toast);
    this.powerList.innerHTML = '';
    this.slots.clear();
  }

  private renderPowerUps(items: Array<{ type: PowerUpType; remaining: number; duration: number }>): void {
    const activeTypes = new Set(items.map((i) => i.type));
    for (const [type, slot] of this.slots) {
      if (!activeTypes.has(type)) {
        slot.el.remove();
        this.slots.delete(type);
      }
    }
    for (const item of items) {
      let slot = this.slots.get(item.type);
      if (!slot) {
        const el = html(/* html */ `
          <li class="powerup" style="--pu-color: #${POWERUPS[item.type].color.toString(16).padStart(6, '0')}">
            <span class="powerup__icon">${POWERUPS[item.type].icon}</span>
            <span class="powerup__bar"><span></span></span>
          </li>`);
        slot = { el, bar: $(el, '.powerup__bar > span') };
        this.slots.set(item.type, slot);
        this.powerList.appendChild(el);
      }
      const ratio = Math.max(0, item.remaining / item.duration);
      slot.bar.style.transform = `scaleX(${ratio})`;
      slot.el.classList.toggle('powerup--ending', item.remaining < 2.5);
    }
  }

  private showToast(text: string): void {
    this.toast.textContent = text;
    show(this.toast);
    replayAnimation(this.toast, 'toast--in');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => hide(this.toast), 1600);
  }
}
