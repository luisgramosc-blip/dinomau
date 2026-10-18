// Fuentes empaquetadas con el juego (funcionan sin conexión): solo alfabeto latino
import '@fontsource/lilita-one/latin-400.css';
import '@fontsource/nunito/latin-600.css';
import '@fontsource/nunito/latin-800.css';
import './ui/styles/main.css';
import { DINOS, getDino } from './config/dinos.config';
import { PENDING_REFERRAL_KEY } from './config/referral.config';
import { AssetLoader } from './assets/AssetLoader';
import { BattleScene } from './battle/BattleScene';
import { selectRival } from './battle/BattleRules';
import { audio } from './audio/AudioManager';
import { events } from './core/EventBus';
import { Game } from './core/Game';
import { SceneManager, type GameScene } from './core/SceneManager';
import { SeededRandom } from './core/SeededRandom';
import { Renderer } from './engine/Renderer';
import { InputManager } from './input/InputManager';
import { RunnerScene } from './runner/RunnerScene';
import { LocalEconomyService, type EconomyService } from './services/EconomyService';
import { isBackendConfigured, referralLink, SITE_URL } from './services/env';
import { localRunTracker } from './services/RunTracker';
import { ShopScene } from './shop/ShopScene';
import { LocalStore } from './storage/LocalStore';
import { PwaService } from './pwa/PwaService';
import { QualityManager } from './engine/QualityManager';
import { allowScreenOff, keepScreenOn } from './utils/wakeLock';
import { UIManager } from './ui/UIManager';
import { PHONE_LANDSCAPE_QUERY } from './ui/components/RotateNotice';
import { setLanguage, t } from './i18n/i18n';
import { AdService } from './ads/AdService';
import { AdFlows } from './ads/AdFlows';
import { LocalAdRewards } from './services/AdRewardService';

/** Tiempo mínimo del splash para que el logo no "parpadee" en equipos rápidos. */
const MIN_SPLASH_MS = 700;

/** Guarda el código de un link de referido (/r/CODIGO) para usarlo al registrarse. */
function captureReferralLink(): void {
  const match = window.location.pathname.match(/^\/r\/([A-Za-z0-9]{4,12})\/?$/);
  if (!match) return;
  try {
    localStorage.setItem(PENDING_REFERRAL_KEY, match[1].toUpperCase());
  } catch {
    /* sin almacenamiento */
  }
  window.history.replaceState(null, '', '/');
}

function hasPendingReferral(): boolean {
  try {
    return !!localStorage.getItem(PENDING_REFERRAL_KEY);
  } catch {
    return false;
  }
}

/**
 * Punto de entrada: crea servicios y escenas y conecta la UI.
 * Flujo: splash → menú principal → (tienda | ranking | partida → fin de partida).
 *
 * Con VITE_SUPABASE_URL/ANON_KEY definidas, monedas, compras, partidas y ranking
 * van al servidor. Sin ellas el juego funciona entero en "modo local".
 */
async function bootstrap(): Promise<void> {
  const splashStart = performance.now();
  setLanguage(LocalStore.settings.language);
  captureReferralLink();
  const pwa = new PwaService();
  pwa.register();

  const container = document.getElementById('game')!;
  const uiRoot = document.getElementById('ui')!;
  const splashBar = document.querySelector<HTMLElement>('.splash__bar > span');

  // --- Servicios: servidor (Supabase, carga diferida) o local -----------------
  // Se empieza a descargar ya, en paralelo con los modelos
  const backendPromise = isBackendConfigured
    ? import('./services/backend').then((m) => m.createBackend())
    : Promise.resolve(null);

  const assets = new AssetLoader();
  await assets.preload((ratio) => splashBar && (splashBar.style.transform = `scaleX(${ratio})`));

  const backend = await backendPromise;
  const auth = backend?.auth ?? null;
  const serverEconomy = backend?.serverEconomy ?? null;
  const leaderboard = backend?.leaderboard ?? null;
  const referrals = backend?.referrals ?? null;
  const runs = backend?.runs ?? localRunTracker;
  const economy: EconomyService = serverEconomy ?? new LocalEconomyService();
  // Anuncios: el SDK se carga en segundo plano (si falla o hay bloqueador, el juego sigue)
  const ads = AdService.create();
  void ads.init();
  const adRewards = backend?.adRewards ?? new LocalAdRewards(economy);
  /** Victorias en batallas de la partida en curso (el perfil se actualiza al terminarla). */
  let battlesWonThisRun = 0;
  const battlesWon = () =>
    (serverEconomy && auth?.user ? serverEconomy.battlesWon : LocalStore.battlesWon) + battlesWonThisRun;

  const renderer = new Renderer(container);
  const input = new InputManager(container);
  const runner = new RunnerScene(renderer, input, assets, economy.snapshot.equipped);
  const shop = new ShopScene(renderer, assets, container);
  const battle = new BattleScene(renderer, assets, input, container);
  const scenes = new SceneManager(runner);
  // La batalla también refresca su capa de UI en cada frame
  const battleView: GameScene = {
    update: (dt) => {
      battle.update(dt);
      ui.battle.sync();
    },
    render: () => battle.render(),
  };

  /** Empieza una partida: con sesión, la semilla y el id los da el servidor. */
  let starting = false;
  const startRun = async () => {
    if (starting) return;
    starting = true;
    try {
      const run = await runs.start(economy.snapshot.equipped);
      if (auth?.user && !run) ui.toast.show(t('toast.notTracked'));
      battlesWonThisRun = 0;
      runner.start(run?.seed);
    } finally {
      starting = false;
    }
  };

  /** "Revancha": anuncio entre partidas si toca y nueva partida. */
  const retry = async () => {
    if (flows.isShowingAd || starting) return;
    await flows.beforeNextRun('retry');
    await startRun();
  };

  /** Link para compartir: el de referido si hay cuenta con código, si no la web del juego. */
  const shareLink = () => {
    const code = auth?.user ? serverEconomy?.profile?.referralCode : null;
    return code ? { url: referralLink(code), isReferral: true } : { url: SITE_URL, isReferral: false };
  };

  const ui = new UIManager(uiRoot, economy, { auth, serverEconomy, leaderboard, referrals }, {
    onPlay: () => void startRun(),
    onPauseToggle: () => runner.togglePause(),
    onRetry: () => void retry(),
    onMenu: async () => {
      if (flows.isShowingAd) return;
      // Salir a mitad de partida la abandona (no se guarda)
      if (runner.runState !== 'gameover') runs.discard();
      else await flows.beforeNextRun('menu');
      allowScreenOff();
      runner.backToReady();
      scenes.set(runner);
      ui.showMenu();
    },
    onOpenShop: () => {
      scenes.set(shop);
      ui.showShop();
    },
    onCloseShop: () => {
      scenes.set(runner);
      ui.showMenu();
    },
    onShopSelect: (index, direction) => {
      const dino = DINOS[index];
      const w = economy.snapshot;
      shop.show(dino.id, direction, !w.owned.has(dino.id) && w.coins < dino.price);
    },
    onBuy: async (dino) => {
      const result = await economy.purchase(dino.id);
      if (result.ok) {
        shop.setLocked(false);
        ui.toast.show(`🎉 ${t('shop.unlocked', { name: dino.name })}`);
        audio.sfx('powerup');
      } else if (result.error === 'AUTH_REQUIRED') {
        ui.openAuth('buy', 'signup');
      } else {
        ui.toast.show(t('shop.error'));
      }
    },
    onBattleContinue: () => battle.close(),
    onReviveWatch: () => void flows.watchRevive(),
    onReviveSkip: () => flows.skipRevive(),
    onDouble: () => void flows.watchDouble(),
    onGift: () => void flows.watchGift(),
    onEquip: async (dino) => {
      const result = await economy.equip(dino.id);
      if (result.ok) ui.toast.show(`✅ ${t('shop.equippedToast', { name: dino.name })}`);
      else if (result.error === 'AUTH_REQUIRED') ui.openAuth('buy');
    },
  }, { assets, getLink: shareLink }, pwa);
  const flows = new AdFlows({ ads, rewards: adRewards, runner, ui });

  // Batallas: el runner avisa al llegar al umbral de monedas
  events.on('battle:trigger', ({ runCoins, sequence, atMs }) => {
    const controller = battle.start(
      {
        seed: SeededRandom.randomSeed(),
        player: getDino(economy.snapshot.equipped),
        rival: selectRival(battlesWon()),
        runCoins,
        walletCoins: economy.snapshot.coins,
        sequence,
        atMs,
      },
      (result) => {
        // Con sesión el servidor cuenta las victorias al cerrar la partida
        if (serverEconomy && auth?.user) battlesWonThisRun += result.won ? 1 : 0;
        else LocalStore.recordBattle(result.won);
        ui.battle.close();
        scenes.set(runner);
        runner.resumeAfterBattle(result);
      },
    );
    ui.battle.open(controller);
    scenes.set(battleView);
  });

  // Al equipar, el runner cambia de dino (y de habilidad)
  events.on('dino:equipped', ({ id }) => runner.setDino(id));

  // Fin de partida → monedas al monedero (servidor o local)
  events.on('run:over', async ({ coins, coinsCollected, distance, score, durationMs, battles }) => {
    if (economy.mode === 'local') {
      await economy.creditRun(coins);
      ui.refreshGameOverBalance();
      flows.offerDouble(null, coins);
      return;
    }
    if (!runs.isTracked) {
      if (!auth?.user) ui.gameOverGuest();
      else ui.gameOverResult(null);
      return;
    }
    ui.gameOverSaving();
    const result = await runs.finish({ distance, score, coinsCollected, durationMs, battles });
    if (result && result.status !== 'error') {
      economy.setCoins(result.coins);
      await serverEconomy?.refresh();
    }
    battlesWonThisRun = 0;
    ui.gameOverResult(result);
    if (result?.status === 'finished') flows.offerDouble(runs.lastFinishedRunId, result.awarded);
  });

  /** Canjea el bono de bienvenida si el jugador llegó por un link de amigo. */
  const claimReferral = async () => {
    const outcome = await referrals?.claimPending();
    if (outcome?.status === 'granted') {
      economy.setCoins(outcome.coins);
      ui.toast.show(t('toast.referralBonus', { value: outcome.bonus }), 3500);
      audio.sfx('powerup');
    } else if (outcome?.status === 'retry-later' && outcome.reason === 'EMAIL_NOT_VERIFIED') {
      ui.toast.show(t('toast.referralPending'), 3500);
    }
  };

  // Iniciar / cerrar sesión: recargar monedero, dino equipado y bono de referido
  auth?.onChange(async (user) => {
    await Promise.all([serverEconomy?.refresh(), adRewards.refresh()]);
    flows.refreshGift();
    if (user) {
      const name = serverEconomy?.profile?.username;
      if (name) ui.toast.show(t('toast.welcome', { name }));
      ui.promptUsernameIfMissing();
      await claimReferral();
    }
  });
  if (auth?.user) void claimReferral();
  // Llegó por un link de amigo sin cuenta: mostrar la invitación de entrada
  else if (auth && hasPendingReferral()) ui.openAuth('referral', 'signup');

  // Audio: los navegadores solo permiten sonar tras un gesto del usuario
  audio.bindGameEvents();
  audio.startMusic();
  const unlockAudio = () => audio.unlock();
  window.addEventListener('pointerdown', unlockAudio);
  window.addEventListener('keydown', unlockAudio);

  // Teclado: Esc pausa; Espacio/Enter juega desde el menú o reintenta
  input.onAction((action) => {
    if (action === 'pause') runner.togglePause();
  });
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Enter' && e.code !== 'Space') return;
    if ((e.target as HTMLElement | null)?.closest('input, form') || ui.share.isOpen || flows.isShowingAd) return;
    if (runner.runState === 'ready' && ui.isMenuVisible) void startRun();
    else if (runner.runState === 'gameover' && ui.isGameOverVisible) void retry();
  });
  // Tienda con teclado: flechas para cambiar de dino
  window.addEventListener('keydown', (e) => {
    if (!ui.shop.isOpen) return;
    if (e.code === 'ArrowLeft') ui.shop.move(-1);
    if (e.code === 'ArrowRight') ui.shop.move(1);
    if (e.code === 'Escape') {
      scenes.set(runner);
      ui.showMenu();
    }
  });

  // Pausa automática al cambiar de app o pestaña
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) runner.pause();
  });
  // Y al girar el móvil a horizontal (se muestra el aviso "gira tu teléfono")
  matchMedia(PHONE_LANDSCAPE_QUERY).addEventListener('change', (e) => {
    if (e.matches) runner.pause();
  });

  // Calidad adaptativa: mide los FPS solo durante la partida
  const quality = new QualityManager(renderer);
  const game: Game = new Game(
    {
      update: (dt) => {
        quality.update(dt, game.fps, runner.runState === 'running' && scenes.is(runner));
        scenes.update(dt);
      },
    },
    scenes,
  );
  game.start();

  // Pantalla siempre encendida mientras se juega
  events.on('run:start', () => void keepScreenOn());
  events.on('run:countdown', () => void keepScreenOn());
  events.on('run:pause', allowScreenOff);
  events.on('run:over', allowScreenOff);

  // Fuera splash
  const wait = Math.max(0, MIN_SPLASH_MS - (performance.now() - splashStart));
  window.setTimeout(() => {
    document.body.classList.add('ready');
    document.getElementById('splash')?.remove();
  }, wait);

  // Acceso para depurar desde la consola en desarrollo
  if (import.meta.env.DEV) Object.assign(window, { dinoMau: { game, runner, shop, battle, renderer, audio, economy, ui, auth, runs, quality, pwa, ads, adRewards, flows } });
}

bootstrap().catch((err) => {
  console.error(err);
  document.getElementById('ui')!.innerHTML =
    `<div class="screen"><p class="error">No se pudo iniciar el juego 😢<br><small>${String(err)}</small></p></div>`;
});
