import { formatNumber, t } from '@/i18n/i18n';
import { $, hide, html, show } from '../dom';

export interface RunSummary {
  score: number;
  distance: number;
  coins: number;
  bestScore: number;
  isRecord: boolean;
}

export interface WalletSummary {
  coins: number;
}

/** Fin de partida: puntaje, distancia, monedas, récord, guardado y compartir. */
export class GameOverScreen {
  readonly el: HTMLElement;

  constructor(actions: { onRetry(): void; onMenu(): void; onCreateAccount(): void; onShare(): void; onDouble(): void }) {
    this.el = html(/* html */ `
      <section class="screen screen--modal hidden">
        <div class="card card--gameover">
          <p class="record-banner hidden" data-ref="record">🏆 ${t('gameover.newRecord')}</p>
          <h2>${t('gameover.title')}</h2>
          <p class="big-score" data-ref="score">0</p>
          <p class="earned"><span class="coin-icon"></span><b data-ref="earned"></b><small data-ref="balance"></small></p>
          <p class="save-status" data-ref="save"></p>
          <button class="btn btn--reward hidden" data-action="double"></button>
          <button class="btn btn--google hidden" data-action="create-account">${t('gameover.createAccount')}</button>
          <dl class="stats">
            <div><dt>${t('gameover.distance')}</dt><dd data-ref="distance">0</dd></div>
            <div><dt>${t('gameover.coins')}</dt><dd data-ref="coins">0</dd></div>
            <div><dt>${t('gameover.best')}</dt><dd data-ref="best">0</dd></div>
          </dl>
          <button class="btn btn--primary" data-action="retry">${t('gameover.retry')}</button>
          <div class="btn-row">
            <button class="btn btn--ghost" data-action="menu">${t('gameover.menu')}</button>
            <button class="btn btn--share" data-action="share">📤 ${t('gameover.share')}</button>
          </div>
        </div>
      </section>
    `);
    $(this.el, '[data-action="retry"]').addEventListener('click', actions.onRetry);
    $(this.el, '[data-action="menu"]').addEventListener('click', actions.onMenu);
    $(this.el, '[data-action="create-account"]').addEventListener('click', actions.onCreateAccount);
    $(this.el, '[data-action="share"]').addEventListener('click', actions.onShare);
    $(this.el, '[data-action="double"]').addEventListener('click', actions.onDouble);
  }

  /** Botón "🎬 x2 monedas (+N)"; null lo oculta. */
  setDoubleOffer(bonus: number | null): void {
    const btn = $<HTMLButtonElement>(this.el, '[data-action="double"]');
    btn.disabled = false;
    if (bonus === null) return hide(btn);
    btn.textContent = t('double.button', { value: formatNumber(bonus) });
    show(btn);
  }

  setDoubleBusy(busy: boolean): void {
    $<HTMLButtonElement>(this.el, '[data-action="double"]').disabled = busy;
  }

  /** Estado del guardado en el servidor (texto vacío = ocultar). */
  setSaveStatus(text: string, kind: 'info' | 'ok' | 'warn' = 'info', showCreateAccount = false): void {
    const el = $(this.el, '[data-ref="save"]');
    el.textContent = text;
    el.dataset.kind = kind;
    const cta = $(this.el, '[data-action="create-account"]');
    if (showCreateAccount) show(cta);
    else hide(cta);
  }

  /** Banner de récord y récord mostrado (el servidor puede corregirlo). */
  setRecord(isRecord: boolean, bestScore: number): void {
    $(this.el, '[data-ref="best"]').textContent = formatNumber(bestScore);
    const banner = $(this.el, '[data-ref="record"]');
    if (isRecord) show(banner);
    else hide(banner);
    this.el.querySelector('.card')!.classList.toggle('card--record', isRecord);
  }

  /** Corrige las monedas ganadas con lo que acreditó el servidor. */
  setEarned(coins: number): void {
    $(this.el, '[data-ref="earned"]').textContent = t('gameover.earned', { value: formatNumber(coins) });
  }

  /** Saldo total tras acreditar las monedas de la partida. */
  setBalance(wallet: WalletSummary): void {
    $(this.el, '[data-ref="balance"]').textContent = t('gameover.balance', { value: formatNumber(wallet.coins) });
  }

  fill(run: RunSummary): void {
    $(this.el, '[data-ref="earned"]').textContent = t('gameover.earned', { value: formatNumber(run.coins) });
    $(this.el, '[data-ref="balance"]').textContent = '';
    this.setSaveStatus('');
    this.setDoubleOffer(null);
    $(this.el, '[data-ref="score"]').textContent = formatNumber(run.score);
    $(this.el, '[data-ref="distance"]').textContent = t('units.meters', { value: formatNumber(run.distance) });
    $(this.el, '[data-ref="coins"]').textContent = formatNumber(run.coins);
    this.setRecord(run.isRecord, run.bestScore);
  }
}
