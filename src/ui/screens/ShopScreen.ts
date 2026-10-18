import { ABILITY_ICONS, DINOS, type DinoDefinition } from '@/config/dinos.config';
import { formatNumber, t, type TranslationKey } from '@/i18n/i18n';
import { dinoShopState, type WalletSnapshot } from '@/services/EconomyService';
import { $, escapeHtml, hide, html, show } from '../dom';

export interface ShopActions {
  onBack(): void;
  /** El índice del dino mostrado cambió (la escena 3D debe actualizarse). */
  onSelect(index: number, direction: 1 | -1): void;
  onBuy(dino: DinoDefinition): void;
  onEquip(dino: DinoDefinition): void;
}

/**
 * UI de la tienda sobre la escena 3D: carrusel de dinos, estadísticas,
 * habilidad y botón según el estado (bloqueado / comprable / comprado /
 * equipado). La confirmación de compra es un modal propio.
 */
export class ShopScreen {
  readonly el: HTMLElement;
  private index = 0;
  private wallet!: WalletSnapshot;
  private readonly confirm: HTMLElement;
  private pendingBuy?: DinoDefinition;

  constructor(private readonly actions: ShopActions, localMode: boolean) {
    this.el = html(/* html */ `
      <section class="screen screen--shop hidden">
        <header class="shop__top">
          <button class="icon-btn" data-action="back" aria-label="${t('shop.back')}">←</button>
          <h2 class="shop__title">${t('shop.title')}</h2>
          <div class="chip chip--coins"><span class="coin-icon"></span><span data-ref="coins">0</span></div>
        </header>

        <button class="shop__arrow shop__arrow--prev" data-action="prev" aria-label="${t('shop.prev')}">‹</button>
        <button class="shop__arrow shop__arrow--next" data-action="next" aria-label="${t('shop.next')}">›</button>

        <div class="card shop__panel">
          <p class="shop__index" data-ref="index"></p>
          <h3 class="shop__name" data-ref="name"></h3>
          <p class="shop__ability"><span data-ref="ability-icon"></span><b data-ref="ability-name"></b></p>
          <p class="shop__desc" data-ref="ability-desc"></p>
          <div class="stats-bars">
            ${['speed', 'agility', 'power'].map((k) => `
              <div class="stat"><span>${t(`shop.${k}` as TranslationKey)}</span>
                <span class="stat__bar"><span data-ref="bar-${k}"></span></span>
                <b data-ref="val-${k}"></b></div>`).join('')}
          </div>
          <button class="btn btn--primary shop__action" data-action="primary"></button>
          <p class="shop__hint" data-ref="hint"></p>
          ${localMode ? `<p class="shop__note">${t('shop.localNote')}</p>` : ''}
        </div>

        <div class="screen screen--modal shop__confirm hidden" data-ref="confirm">
          <div class="card">
            <h2 data-ref="confirm-title"></h2>
            <p data-ref="confirm-text"></p>
            <button class="btn btn--primary" data-action="confirm-buy">${t('shop.buy')}</button>
            <button class="btn btn--ghost" data-action="confirm-cancel">${t('shop.cancel')}</button>
          </div>
        </div>
      </section>
    `);
    this.confirm = $(this.el, '[data-ref="confirm"]');

    const on = (action: string, fn: () => void) => $(this.el, `[data-action="${action}"]`).addEventListener('click', fn);
    on('back', () => actions.onBack());
    on('prev', () => this.move(-1));
    on('next', () => this.move(1));
    on('primary', () => this.primaryAction());
    on('confirm-cancel', () => this.closeConfirm());
    on('confirm-buy', () => {
      const dino = this.pendingBuy;
      this.closeConfirm();
      if (dino) actions.onBuy(dino);
    });
  }

  get isOpen(): boolean {
    return !this.el.classList.contains('hidden');
  }

  /** Abre la tienda mostrando el dino equipado. */
  open(wallet: WalletSnapshot): void {
    this.wallet = wallet;
    this.index = Math.max(0, DINOS.findIndex((d) => d.id === wallet.equipped));
    show(this.el);
    this.render();
    this.actions.onSelect(this.index, 1);
  }

  close(): void {
    this.closeConfirm();
    hide(this.el);
  }

  setWallet(wallet: WalletSnapshot): void {
    this.wallet = wallet;
    if (this.isOpen) this.render();
  }

  get selected(): DinoDefinition {
    return DINOS[this.index];
  }

  move(direction: 1 | -1): void {
    this.index = (this.index + direction + DINOS.length) % DINOS.length;
    this.render();
    this.actions.onSelect(this.index, direction);
  }

  private primaryAction(): void {
    const dino = this.selected;
    const state = dinoShopState(dino.id, this.wallet);
    if (state === 'owned') this.actions.onEquip(dino);
    else if (state === 'buyable') this.openConfirm(dino);
  }

  private openConfirm(dino: DinoDefinition): void {
    this.pendingBuy = dino;
    $(this.confirm, '[data-ref="confirm-title"]').textContent = t('shop.confirmTitle', { name: dino.name });
    $(this.confirm, '[data-ref="confirm-text"]').textContent = t('shop.confirmText', {
      price: formatNumber(dino.price),
      left: formatNumber(this.wallet.coins - dino.price),
    });
    show(this.confirm);
  }

  private closeConfirm(): void {
    this.pendingBuy = undefined;
    hide(this.confirm);
  }

  private render(): void {
    const dino = this.selected;
    const state = dinoShopState(dino.id, this.wallet);
    const q = (ref: string) => $(this.el, `[data-ref="${ref}"]`);

    q('coins').textContent = formatNumber(this.wallet.coins);
    q('index').textContent = `${this.index + 1} / ${DINOS.length}`;
    q('name').textContent = dino.name;
    q('ability-icon').textContent = ABILITY_ICONS[dino.ability];
    q('ability-name').textContent = t(`ability.${dino.ability}.name` as TranslationKey);
    q('ability-desc').textContent = t(`ability.${dino.ability}.desc` as TranslationKey);

    const bars: Array<[string, number, number]> = [
      ['speed', dino.speed, 10],
      ['agility', dino.agility, 10],
      ['power', dino.battlePower, 100],
    ];
    for (const [k, value, max] of bars) {
      q(`bar-${k}`).style.transform = `scaleX(${value / max})`;
      q(`val-${k}`).textContent = String(value);
    }

    const button = $<HTMLButtonElement>(this.el, '[data-action="primary"]');
    const hint = q('hint');
    hint.textContent = '';
    button.disabled = state === 'equipped' || state === 'locked';
    button.dataset.state = state;
    const price = dino.price === 0 ? t('shop.free') : formatNumber(dino.price);
    switch (state) {
      case 'equipped':
        button.textContent = t('shop.equipped');
        break;
      case 'owned':
        button.textContent = t('shop.equip');
        break;
      case 'buyable':
        button.innerHTML = `${escapeHtml(t('shop.buy'))} · <span class="coin-icon"></span> ${price}`;
        break;
      case 'locked':
        button.innerHTML = `🔒 <span class="coin-icon"></span> ${price}`;
        hint.textContent = t('shop.missing', { value: formatNumber(dino.price - this.wallet.coins) });
        break;
    }
    this.el.dataset.state = state;
  }
}
