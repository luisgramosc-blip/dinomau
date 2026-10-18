import { BATTLE_CONFIG } from '@/config/battle.config';
import { events } from '@/core/EventBus';
import { formatNumber, t, type TranslationKey } from '@/i18n/i18n';
import type { BattleController } from '@/battle/BattleController';
import type { DodgeDirection } from '@/battle/BattleRules';
import { $, escapeHtml, hide, html, replayAnimation, show } from '../dom';

const ARROWS: Record<DodgeDirection, string> = { left: '←', right: '→', jump: '↑', roll: '↓' };

/**
 * Capa de UI de la batalla. Lee el estado del BattleController cada frame
 * (`sync`) y reacciona a sus eventos para los mensajes de acierto/fallo.
 */
export class BattleScreen {
  readonly el: HTMLElement;
  private controller?: BattleController;
  private readonly unsubscribe: Array<() => void> = [];
  private lastStage = '';
  private readonly refs = new Map<string, HTMLElement>();

  constructor(private readonly onContinue: () => void) {
    const isTouch = matchMedia('(pointer: coarse)').matches;
    this.el = html(/* html */ `
      <section class="battle hidden">
        <header class="battle__top">
          <div class="fighter fighter--player">
            <p class="fighter__name" data-ref="p-name"></p>
            <div class="hp"><span data-ref="p-hp"></span></div>
            <small data-ref="p-power"></small>
          </div>
          <div class="battle__timer" data-ref="timer"></div>
          <div class="fighter fighter--rival">
            <p class="fighter__name" data-ref="r-name"></p>
            <div class="hp"><span data-ref="r-hp"></span></div>
            <small data-ref="r-power"></small>
          </div>
        </header>

        <div class="battle__intro" data-ref="intro">
          <h2 class="battle__title">${t('battle.title')}</h2>
          <p class="battle__versus" data-ref="versus"></p>
          <p class="battle__howto">${t(isTouch ? 'battle.howto' : 'battle.howtoKeys')}</p>
        </div>

        <div class="battle__prompt hidden" data-ref="tap">
          <div class="tap-target">👊</div>
          <p>${t('battle.tap')}</p>
        </div>

        <div class="battle__prompt hidden" data-ref="dodge">
          <div class="dodge-target">
            <span class="dodge-ring" data-ref="ring"></span>
            <span class="dodge-arrow" data-ref="arrow"></span>
          </div>
          <p>${t('battle.dodge')}</p>
        </div>

        <p class="battle__feedback hidden" data-ref="feedback"></p>

        <div class="battle__outro hidden" data-ref="outro">
          <div class="card">
            <h2 data-ref="outro-title"></h2>
            <p class="battle__coins" data-ref="outro-coins"></p>
            <small data-ref="outro-cap"></small>
            <button class="btn btn--primary" data-action="continue" disabled>${t('battle.continue')}</button>
          </div>
        </div>
      </section>
    `);
    $(this.el, '[data-action="continue"]').addEventListener('click', () => this.onContinue());
  }

  open(controller: BattleController): void {
    this.controller = controller;
    const { player, rival } = controller.setup;
    const q = (r: string) => this.ref(r);
    q('p-name').textContent = `${t('battle.you')} · ${player.name}`;
    q('r-name').textContent = rival.name;
    q('p-power').textContent = t('battle.power', { value: player.battlePower });
    q('r-power').textContent = t('battle.power', { value: rival.power });
    q('versus').innerHTML = `${escapeHtml(t('battle.vs'))} <b>${escapeHtml(rival.name)}</b> · ${escapeHtml(t('battle.power', { value: rival.power }))}`;
    show(q('intro'));
    hide(q('tap'), q('dodge'), q('feedback'), q('outro'));
    $<HTMLButtonElement>(this.el, '[data-action="continue"]').disabled = true;
    this.lastStage = '';
    show(this.el);

    this.unsubscribe.push(
      events.on('battle:hit', ({ target, grade }) => {
        if (target === 'player' && grade) this.feedback(t(`battle.${grade}` as TranslationKey), grade);
      }),
      events.on('battle:finished', (r) => this.showOutro(r.won, r.runCoinsBefore, r.coinsDelta)),
    );
  }

  close(): void {
    this.unsubscribe.splice(0).forEach((u) => u());
    this.controller = undefined;
    hide(this.el);
  }

  /** Actualiza barras, temporizador e indicaciones (llamar cada frame). */
  sync(): void {
    const c = this.controller;
    if (!c) return;
    const q = (r: string) => this.ref(r);
    q('p-hp').style.transform = `scaleX(${c.playerHp / BATTLE_CONFIG.maxHp})`;
    q('r-hp').style.transform = `scaleX(${c.rivalHp / BATTLE_CONFIG.maxHp})`;
    q('timer').textContent = c.stage === 'fight' ? String(Math.ceil(c.timeLeft)) : '';

    if (c.stage !== this.lastStage) {
      this.lastStage = c.stage;
      if (c.stage !== 'intro') hide(q('intro'));
    }

    const phase = c.phase;
    const tap = q('tap');
    const dodge = q('dodge');
    if (phase?.kind === 'attack') show(tap);
    else hide(tap);

    const attack = c.activeAttack;
    if (attack) {
      show(dodge);
      q('arrow').textContent = ARROWS[attack.direction];
      // El anillo se cierra justo en el momento del impacto
      const progress = Math.min(1, (c.time - attack.telegraphStart) / (attack.impact - attack.telegraphStart));
      q('ring').style.transform = `scale(${2.4 - 1.4 * progress})`;
      q('ring').classList.toggle('dodge-ring--now', Math.abs(c.time - attack.impact) <= BATTLE_CONFIG.defend.perfectWindow);
    } else {
      hide(dodge);
    }

    if (c.canClose) $<HTMLButtonElement>(this.el, '[data-action="continue"]').disabled = false;
  }

  /** Elemento con data-ref (cacheado: sync() corre cada frame). */
  private ref(name: string): HTMLElement {
    let el = this.refs.get(name);
    if (!el) {
      el = $(this.el, `[data-ref="${name}"]`);
      this.refs.set(name, el);
    }
    return el;
  }

  private feedback(text: string, kind: string): void {
    const el = this.ref('feedback');
    el.textContent = text;
    el.dataset.kind = kind;
    show(el);
    replayAnimation(el, 'battle__feedback--pop');
  }

  private showOutro(won: boolean, before: number, delta: number): void {
    const q = (r: string) => this.ref(r);
    hide(q('tap'), q('dodge'), q('feedback'));
    q('outro-title').textContent = t(won ? 'battle.win' : 'battle.lose');
    q('outro').dataset.won = String(won);
    q('outro-coins').textContent = won
      ? t('battle.coinsWin', { before: formatNumber(before), after: formatNumber(before + delta) })
      : t('battle.coinsLose', { value: formatNumber(-delta) });
    const capped = won && delta >= BATTLE_CONFIG.maxGainPerBattle;
    q('outro-cap').textContent = capped ? t('battle.coinsCapped', { cap: formatNumber(BATTLE_CONFIG.maxGainPerBattle) }) : '';
    show(q('outro'));
  }
}
