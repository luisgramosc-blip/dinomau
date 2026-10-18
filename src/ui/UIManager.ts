import type { DinoDefinition } from '@/config/dinos.config';
import { events } from '@/core/EventBus';
import { t } from '@/i18n/i18n';
import type { AuthService } from '@/services/AuthService';
import type { EconomyService } from '@/services/EconomyService';
import type { LeaderboardService } from '@/services/LeaderboardService';
import type { ReferralService } from '@/services/ReferralService';
import type { FinishResult } from '@/services/RunTracker';
import type { SupabaseEconomyService } from '@/services/SupabaseEconomyService';
import { LocalStore } from '@/storage/LocalStore';
import { Toast } from './components/Toast';
import { createRotateNotice } from './components/RotateNotice';
import { hide, show, stopSwipe } from './dom';
import { AuthScreen, type AuthReason } from './screens/AuthScreen';
import { BattleScreen } from './screens/BattleScreen';
import { Countdown } from './screens/Countdown';
import { GameOverScreen } from './screens/GameOverScreen';
import { Hud } from './screens/Hud';
import { InviteScreen } from './screens/InviteScreen';
import { IosInstallSheet } from './screens/IosInstallSheet';
import type { PwaService } from '@/pwa/PwaService';
import { LeaderboardScreen } from './screens/LeaderboardScreen';
import { MainMenuScreen } from './screens/MainMenuScreen';
import { PauseScreen } from './screens/PauseScreen';
import { ReviveScreen } from './screens/ReviveScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { ShopScreen } from './screens/ShopScreen';
import { ShareSheet, type ShareDeps, type ShareRun } from './screens/ShareSheet';
import { getDino } from '@/config/dinos.config';

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
  // Anuncios con recompensa
  onReviveWatch(): void;
  onReviveSkip(): void;
  onDouble(): void;
  onGift(): void;
}

/** Servicios con servidor; todos null en modo local (sin Supabase). */
export interface BackendServices {
  auth: AuthService | null;
  serverEconomy: SupabaseEconomyService | null;
  leaderboard: LeaderboardService | null;
  referrals: ReferralService | null;
}

export class UIManager {
  readonly menu: MainMenuScreen;
  readonly shop: ShopScreen;
  readonly toast = new Toast();
  readonly battle: BattleScreen;
  private readonly hud: Hud;
  private readonly pause: PauseScreen;
  private readonly settings: SettingsScreen;
  readonly gameOver: GameOverScreen;
  readonly revive: ReviveScreen;
  private readonly ranking: LeaderboardScreen;
  private readonly invite: InviteScreen;
  readonly share: ShareSheet;
  private readonly iosInstall: IosInstallSheet;
  /** Última partida, para la imagen de compartir. */
  private lastRun?: ShareRun;
  private readonly authScreen?: AuthScreen;
  private readonly profile?: ProfileScreen;

  constructor(
    root: HTMLElement,
    private readonly economy: EconomyService,
    private readonly backend: BackendServices,
    actions: UIActions,
    shareDeps: Omit<ShareDeps, 'toast'>,
    private readonly pwa: PwaService,
    /** Modo infantil: sin cuenta, ranking, invitaciones ni compartir en redes. */
    options: { kidMode: boolean } = { kidMode: false },
  ) {
    root.innerHTML = '';
    const { auth, serverEconomy, leaderboard, referrals } = backend;

    this.menu = new MainMenuScreen({
      onPlay: actions.onPlay,
      onShop: actions.onOpenShop,
      onRanking: () => this.showRanking(),
      onInvite: () => this.showInvite(),
      onSettings: () => this.settings.open(),
      onAccount: () => this.openAccount(),
      onInstall: () => void this.install(),
      onUpdate: () => void this.pwa.applyUpdate(),
      onGift: actions.onGift,
    });
    this.iosInstall = new IosInstallSheet();
    this.shop = new ShopScreen({
      onBack: actions.onCloseShop,
      onSelect: actions.onShopSelect,
      onBuy: actions.onBuy,
      onEquip: actions.onEquip,
    }, economy.mode === 'local');
    this.hud = new Hud(actions.onPauseToggle);
    this.pause = new PauseScreen({ onResume: actions.onPauseToggle, onMenu: actions.onMenu });
    this.settings = new SettingsScreen(() => this.settings.close());
    this.gameOver = new GameOverScreen({
      onRetry: actions.onRetry,
      onMenu: actions.onMenu,
      onCreateAccount: () => this.openAuth('save', 'signup'),
      onShare: () => this.lastRun && void this.share.open(this.lastRun),
      onDouble: actions.onDouble,
    });
    this.revive = new ReviveScreen({ onWatch: actions.onReviveWatch, onSkip: actions.onReviveSkip });
    this.share = new ShareSheet({ ...shareDeps, toast: (text, ms) => this.toast.show(text, ms) });
    this.battle = new BattleScreen(actions.onBattleContinue);
    this.ranking = new LeaderboardScreen(
      leaderboard,
      () => ({ userId: auth?.user?.id ?? null, hasUsername: !!serverEconomy?.profile?.username }),
      () => this.showMenu(),
    );
    this.invite = new InviteScreen(
      referrals,
      () => serverEconomy?.profile?.referralCode ?? null,
      (text) => this.toast.show(text),
      () => this.showMenu(),
    );
    if (auth && serverEconomy) {
      this.authScreen = new AuthScreen(auth);
      this.profile = new ProfileScreen(auth, serverEconomy, () => {
        leaderboard?.invalidate();
        this.refreshAccount();
      });
    }

    const countdown = new Countdown();
    root.append(
      this.menu.el, this.shop.el, this.ranking.el, this.invite.el, this.hud.el, this.battle.el, countdown.el,
      this.pause.el, this.revive.el, this.gameOver.el, this.share.el, this.settings.el, this.iosInstall.el,
      ...(this.authScreen ? [this.authScreen.el] : []),
      ...(this.profile ? [this.profile.el] : []),
      this.toast.el,
      createRotateNotice(),
    );
    if (options.kidMode) {
      this.menu.setKidMode();
      this.gameOver.setKidMode();
    }
    stopSwipe(root);
    this.refreshMenu();
    this.refreshAccount();

    events.on('run:start', () => {
      this.hud.reset(this.bestScore);
      show(this.hud.el);
      hide(this.menu.el, this.pause.el, this.gameOver.el);
    });
    events.on('run:pause', () => show(this.pause.el));
    events.on('run:reviveOffer', () => this.revive.open());
    // Durante la batalla el HUD del runner se oculta; vuelve con la cuenta regresiva
    events.on('battle:trigger', () => hide(this.hud.el));
    events.on('run:countdown', () => show(this.hud.el));
    events.on('run:resume', () => hide(this.pause.el));
    events.on('run:over', ({ score, distance, coins }) => {
      const previousBest = this.bestScore;
      LocalStore.recordRun(score, distance);
      const isRecord = score > previousBest;
      this.revive.close();
      hide(this.hud.el);
      this.gameOver.fill({ score, distance, coins, bestScore: Math.max(previousBest, score), isRecord });
      this.lastRun = { score, distance, coins, isRecord, dino: getDino(this.economy.snapshot.equipped) };
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
    events.on('profile:changed', () => {
      this.refreshAccount();
      this.refreshMenu();
    });
    // PWA: botón de instalar y aviso de versión nueva (solo en el menú, nunca en partida)
    const syncPwa = () => {
      this.menu.setInstallVisible(this.pwa.installMode !== 'none');
      this.menu.setUpdateVisible(this.pwa.needsUpdate);
    };
    let offlineAnnounced = false;
    pwa.onChange(() => {
      syncPwa();
      if (pwa.offlineReady && !offlineAnnounced) {
        offlineAnnounced = true;
        this.toast.show(t('pwa.offlineReady'));
      }
    });
    syncPwa();

    auth?.onChange((user) => {
      this.refreshAccount();
      if (!user) this.profile?.close();
    });
  }

  private async install(): Promise<void> {
    if (this.pwa.installMode === 'ios') return this.iosInstall.open();
    if (await this.pwa.promptInstall()) this.toast.show(t('pwa.installed'));
  }

  /** Récord: el del servidor con sesión; el local como invitado. */
  private get bestScore(): number {
    return this.backend.serverEconomy?.profile?.bestScore ?? LocalStore.bestScore;
  }

  private refreshMenu(): void {
    const w = this.economy.snapshot;
    this.menu.update({ coins: w.coins, best: this.bestScore, equipped: w.equipped });
  }

  private refreshAccount(): void {
    const { auth, serverEconomy } = this.backend;
    if (!auth) return this.menu.setAccount(t('menu.offline'), false);
    if (!auth.user) return this.menu.setAccount(`${t('menu.guest')} · ${t('menu.login')}`, true);
    const name = serverEconomy?.profile?.username;
    this.menu.setAccount(name ?? auth.user.email?.split('@')[0] ?? t('profile.title'), true);
  }

  private openAccount(): void {
    if (!this.backend.auth) return;
    if (this.backend.auth.user) this.profile?.open();
    else this.openAuth();
  }

  /** Pide iniciar sesión explicando el motivo. */
  openAuth(reason: AuthReason = 'default', mode: 'login' | 'signup' = 'login'): void {
    this.authScreen?.open(reason, mode);
  }

  /** Tras el primer inicio de sesión: pedir nombre para el ranking si no tiene. */
  promptUsernameIfMissing(): void {
    if (this.backend.auth?.user && this.backend.serverEconomy?.profile && !this.backend.serverEconomy.profile.username) {
      this.profile?.open();
    }
  }

  // --- Fin de partida y servidor ------------------------------------------------

  gameOverSaving(): void {
    this.gameOver.setSaveStatus(t('gameover.saving'));
  }

  gameOverGuest(): void {
    this.gameOver.setSaveStatus(t('gameover.guest'), 'warn', !!this.backend.auth);
  }

  gameOverResult(result: FinishResult | null): void {
    if (!result || result.status === 'error') {
      this.gameOver.setSaveStatus(t('gameover.saveError'), 'warn');
      return;
    }
    if (result.status === 'rejected') {
      this.gameOver.setEarned(0);
      this.gameOver.setSaveStatus(t('gameover.rejected'), 'warn');
    } else {
      this.gameOver.setEarned(result.awarded);
      this.gameOver.setSaveStatus(t('gameover.saved'), 'ok');
      if (result.newRecord) this.gameOver.setRecord(true, this.bestScore);
      if (this.lastRun) this.lastRun = { ...this.lastRun, coins: result.awarded, isRecord: result.newRecord };
      this.backend.leaderboard?.invalidate();
    }
    this.gameOver.setBalance({ coins: result.coins });
  }

  /** Monedas extra por anuncio en el fin de partida: actualiza lo ganado y el saldo. */
  gameOverDoubled(totalEarned: number, coins: number): void {
    this.gameOver.setEarned(totalEarned);
    this.gameOver.setBalance({ coins });
    if (this.lastRun) this.lastRun = { ...this.lastRun, coins: totalEarned };
  }

  /** Tras acreditar las monedas de la partida (modo local), muestra el saldo nuevo. */
  refreshGameOverBalance(): void {
    this.gameOver.setBalance(this.economy.snapshot);
  }

  // --- Navegación ---------------------------------------------------------------

  /** Vuelve al menú principal. */
  showMenu(): void {
    hide(this.hud.el, this.pause.el, this.gameOver.el);
    this.share.close();
    this.shop.close();
    this.ranking.close();
    this.invite.close();
    this.refreshMenu();
    show(this.menu.el);
  }

  showShop(): void {
    hide(this.menu.el, this.gameOver.el);
    this.shop.open(this.economy.snapshot);
  }

  /** Invitar amigos; como invitado primero pide crear cuenta. */
  showInvite(): void {
    if (this.backend.auth && !this.backend.auth.user) {
      this.openAuth('default', 'signup');
      return;
    }
    hide(this.menu.el);
    this.invite.open();
  }

  showRanking(): void {
    hide(this.menu.el);
    this.ranking.open();
  }

  get isMenuVisible(): boolean {
    return !this.menu.el.classList.contains('hidden');
  }

  get isGameOverVisible(): boolean {
    return !this.gameOver.el.classList.contains('hidden');
  }
}
