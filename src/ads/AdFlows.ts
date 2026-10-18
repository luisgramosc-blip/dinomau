import { ADS_CONFIG } from '@/config/ads.config';
import { audio } from '@/audio/AudioManager';
import { events } from '@/core/EventBus';
import { formatNumber, t, type TranslationKey } from '@/i18n/i18n';
import type { RunnerScene } from '@/runner/RunnerScene';
import { canOfferDouble, doubleBonus, type AdRewardError, type AdRewardService } from '@/services/AdRewardService';
import type { UIManager } from '@/ui/UIManager';
import type { AdService } from './AdService';
import type { RewardedOutcome } from './AdProvider';

export interface AdFlowDeps {
  ads: AdService;
  rewards: AdRewardService;
  runner: RunnerScene;
  ui: UIManager;
}

const ERROR_TEXT: Record<AdRewardError, TranslationKey> = {
  LIMIT_REACHED: 'ads.limit',
  ALREADY_CLAIMED: 'ads.limit',
  NOT_ELIGIBLE: 'ads.error',
  AUTH_REQUIRED: 'gift.login',
  NETWORK: 'ads.error',
};

/**
 * Los recorridos completos de cada anuncio: revivir, duplicar monedas,
 * regalo diario y anuncio entre partidas. Une AdService (mostrar el anuncio),
 * AdRewardService (dar las monedas), el runner y la UI.
 */
export class AdFlows {
  /** Partida que se puede duplicar en el fin de partida actual. */
  private doubleOffer: { runId: string | null; earned: number } | null = null;

  constructor(private readonly d: AdFlowDeps) {
    d.runner.reviveGate = (used, distance) => d.ads.canOfferRevive(used, distance);
    events.on('run:over', () => {
      d.ads.runFinished();
      this.doubleOffer = null;
    });
    events.on('wallet:changed', () => this.refreshGift());
    this.refreshGift();
  }

  // --- Revivir ----------------------------------------------------------------

  async watchRevive(): Promise<void> {
    const outcome = await this.d.ads.showRewarded('revive');
    if (outcome === 'rewarded') {
      this.d.runner.revive();
    } else {
      this.toastOutcome(outcome);
      this.d.runner.declineRevive();
    }
  }

  skipRevive(): void {
    this.d.runner.declineRevive();
  }

  // --- Duplicar monedas -------------------------------------------------------

  /**
   * Con las monedas ya acreditadas: muestra "x2" si se puede.
   * `runId` es la partida en el servidor (null en modo local).
   */
  offerDouble(runId: string | null, earned: number): void {
    const { ads, rewards, ui } = this.d;
    const can = ads.rewardedEnabled && rewards.available && rewards.remaining('double') > 0 && canOfferDouble(earned);
    this.doubleOffer = can ? { runId, earned } : null;
    ui.gameOver.setDoubleOffer(can ? doubleBonus(earned) : null);
  }

  async watchDouble(): Promise<void> {
    const offer = this.doubleOffer;
    const { ui } = this.d;
    if (!offer || this.d.ads.isShowing) return;
    ui.gameOver.setDoubleBusy(true);
    const outcome = await this.d.ads.showRewarded('double_coins');
    if (outcome !== 'rewarded') {
      this.toastOutcome(outcome);
      ui.gameOver.setDoubleBusy(false);
      return;
    }
    const res = await this.d.rewards.claimDouble(offer.runId, offer.earned);
    if (res.ok) {
      this.doubleOffer = null;
      ui.gameOver.setDoubleOffer(null);
      ui.gameOverDoubled(offer.earned + res.bonus, res.coins);
      ui.toast.show(t('double.done', { value: formatNumber(res.bonus) }), 2500);
      audio.sfx('powerup');
    } else {
      ui.toast.show(t(ERROR_TEXT[res.error]), 3000);
      if (res.error === 'NETWORK') ui.gameOver.setDoubleBusy(false);
      else ui.gameOver.setDoubleOffer(null);
    }
  }

  // --- Regalo diario ----------------------------------------------------------

  refreshGift(): void {
    const { ads, rewards, ui } = this.d;
    const cfg = ADS_CONFIG.dailyGift;
    // Invitado con servidor: se muestra igual y al tocarlo se invita a crear cuenta
    const left = rewards.available ? rewards.remaining('gift') : cfg.dailyLimit;
    ui.menu.setGift(cfg.enabled && ads.rewardedEnabled && left > 0 ? { bonus: cfg.coins, left } : null);
  }

  async watchGift(): Promise<void> {
    const { ads, rewards, ui } = this.d;
    if (ads.isShowing) return;
    if (!rewards.available) return ui.openAuth('save', 'signup');
    if (rewards.remaining('gift') <= 0) {
      ui.toast.show(t('ads.limit'));
      return this.refreshGift();
    }
    ui.menu.setGiftBusy(true);
    try {
      const outcome = await ads.showRewarded('daily_gift');
      if (outcome !== 'rewarded') return this.toastOutcome(outcome);
      const res = await rewards.claimGift();
      if (res.ok) {
        ui.toast.show(t('gift.done', { value: formatNumber(res.bonus) }), 2500);
        audio.sfx('powerup');
      } else {
        ui.toast.show(t(ERROR_TEXT[res.error]), 3000);
      }
    } finally {
      ui.menu.setGiftBusy(false);
      this.refreshGift();
    }
  }

  // --- Entre partidas ---------------------------------------------------------

  /** Antes de "Revancha" o de volver al menú: anuncio de pantalla completa si toca. */
  beforeNextRun(placement: 'retry' | 'menu'): Promise<void> {
    return this.d.ads.maybeShowInterstitial(placement);
  }

  get isShowingAd(): boolean {
    return this.d.ads.isShowing;
  }

  private toastOutcome(outcome: RewardedOutcome): void {
    if (outcome === 'dismissed') this.d.ui.toast.show(t('ads.dismissed'), 2500);
    else if (outcome === 'unavailable') this.d.ui.toast.show(t('ads.unavailable'), 2500);
  }
}
