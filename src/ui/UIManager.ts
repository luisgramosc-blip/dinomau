import type { DinoDefinition } from '@/config/dinos.config';
import { events } from '@/core/EventBus';
import { t } from '@/i18n/i18n';
import type { EconomyService } from '@/services/EconomyService';
import { LocalStore } from '@/storage/LocalStore';
import { Toast } from './components/Toast';
import { hide, show, stopSwipe } from './dom';
import { BattleScreen } from './screens/BattleScreen';
import { Countdown } from './screens/Countdown';
import { GameOverScreen } from './screens/GameOverScreen';
import { Hud } from './screens/Hud';
import { MainMenuScreen } from './screens/MainMenuScreen';
import { PauseScreen } from './screens/PauseScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { ShopScreen } from './screens/ShopScreen';

/**
 * Monta las pantallas sobre el canvas y decide cuál se ve. Cada pantalla vive
 * en ui/screens/ y no conoce a las demás; la navegación y las llamadas a los
 * servicios pasan por aquí o por main.ts (acciones).
 */
export interface UIActions {
  onPlay(): void;
  onPauseToggle(): void;
  onRetry(): void;
  onMenu(): void;
  onOpenShop(): void;
  onCloseShop(): void;
  onShopSelect(index: number, direction: 1 | -1): void;
  onBuy(dino: DinoDefinition): void;
  onEquip(dino: DinoDefinition): void;
  onBattleContinue(): void;
}

export class UIManager {
  readonly menu: MainMenuScreen;
  readonly shop: ShopScreen;
  readonly toast = new Toast();
  readonly battle: BattleScreen;
  private readonly hud: Hud;
  private readonly pause: PauseScreen;
  private readonly settings: SettingsScreen;
  private readonly gameOver: GameOverScreen;

  constructor(
    root: HTMLElement,
    private readonly economy: EconomyService,
    actions: UIActions,
  ) {
    root.innerHTML = '';
    this.menu = new MainMenuScreen({
      onPlay: actions.onPlay,
      onShop: actions.onOpenShop,
      onRanking: () => this.toast.show(`🏆 ${t('menu.soon')}`),
      onInvite: () => this.toast.show(`👥 ${t('menu.soon')}`),
      onSettings: () => this.settings.open(),
    });
    this.shop = new ShopScreen({
      onBack: actions.onCloseShop,
      onSelect: actions.onShopSelect,
      onBuy: actions.onBuy,
      onEquip: actions.onEquip,
    });
    this.hud = new Hud(actions.onPauseToggle);
    this.pause = new PauseScreen({ onResume: actions.onPauseToggle, onMenu: actions.onMenu });
    this.settings = new SettingsScreen(() => this.settings.close());
    this.gameOver = new GameOverScreen({ onRetry: actions.onRetry, onMenu: actions.onMenu });
    this.battle = new BattleScreen(actions.onBattleContinue);
    const countdown = new Countdown();
    root.append(
      this.menu.el, this.shop.el, this.hud.el, this.battle.el, countdown.el,
      this.pause.el, this.gameOver.el, this.settings.el, this.toast.el,
    );
    stopSwipe(root);
    this.refreshMenu();

    events.on('run:start', () => {
      this.hud.reset(LocalStore.bestScore);
      show(this.hud.el);
      hide(this.menu.el, this.pause.el, this.gameOver.el);
    });
    events.on('run:pause', () => show(this.pause.el));
    // Durante la batalla el HUD del runner se oculta; vuelve con la cuenta regresiva
    events.on('battle:trigger', () => hide(this.hud.el));
    events.on('run:countdown', () => show(this.hud.el));
    events.on('run:resume', () => hide(this.pause.el));
    events.on('run:over', ({ score, distance, coins }) => {
      const isRecord = LocalStore.recordRun(score, distance);
      hide(this.hud.el);
      this.gameOver.fill({ score, distance, coins, bestScore: LocalStore.bestScore, isRecord });
      show(this.gameOver.el);
    });
    events.on('wallet:changed', () => {
      this.refreshMenu();
      this.shop.setWallet(this.economy.snapshot);
    });
    events.on('dino:equipped', () => {
      this.refreshMenu();
      this.shop.setWallet(this.economy.snapshot);
    });
  }

  private refreshMenu(): void {
    const w = this.economy.snapshot;
    this.menu.update({ coins: w.coins, best: LocalStore.bestScore, equipped: w.equipped });
  }

  /** Tras acreditar las monedas de la partida, muestra el saldo nuevo. */
  refreshGameOverBalance(): void {
    this.gameOver.setBalance(this.economy.snapshot);
  }

  /** Vuelve al menú principal. */
  showMenu(): void {
    hide(this.hud.el, this.pause.el, this.gameOver.el);
    this.shop.close();
    this.refreshMenu();
    show(this.menu.el);
  }

  showShop(): void {
    hide(this.menu.el, this.gameOver.el);
    this.shop.open(this.economy.snapshot);
  }

  get isMenuVisible(): boolean {
    return !this.menu.el.classList.contains('hidden');
  }

  get isGameOverVisible(): boolean {
    return !this.gameOver.el.classList.contains('hidden');
  }
}
