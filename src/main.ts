import './ui/styles/main.css';
import { DINOS, getDino } from './config/dinos.config';
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
import { AuthService } from './services/AuthService';
import { LocalEconomyService, type EconomyService } from './services/EconomyService';
import { LeaderboardService } from './services/LeaderboardService';
import { RunService } from './services/RunService';
import { SupabaseEconomyService } from './services/SupabaseEconomyService';
import { supabase } from './services/supabaseClient';
import { ShopScene } from './shop/ShopScene';
import { LocalStore } from './storage/LocalStore';
import { UIManager } from './ui/UIManager';
import { setLanguage, t } from './i18n/i18n';

/** Tiempo mínimo del splash para que el logo no "parpadee" en equipos rápidos. */
const MIN_SPLASH_MS = 700;

/** Guarda el código de un link de referido (/r/CODIGO) para usarlo al registrarse. */
function captureReferralLink(): void {
  const match = window.location.pathname.match(/^\/r\/([A-Za-z0-9]{4,12})\/?$/);
  if (!match) return;
  try {
    localStorage.setItem('dinomau:ref', match[1].toUpperCase());
  } catch {
    /* sin almacenamiento */
  }
  window.history.replaceState(null, '', '/');
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

  const container = document.getElementById('game')!;
  const uiRoot = document.getElementById('ui')!;
  const splashBar = document.querySelector<HTMLElement>('.splash__bar > span');

  const assets = new AssetLoader();
  await assets.preload((ratio) => splashBar && (splashBar.style.transform = `scaleX(${ratio})`));

  // --- Servicios: servidor (Supabase) o local --------------------------------
  const auth = supabase ? new AuthService(supabase) : null;
  const serverEconomy = supabase && auth ? new SupabaseEconomyService(supabase, auth) : null;
  const leaderboard = supabase ? new LeaderboardService(supabase) : null;
  const economy: EconomyService = serverEconomy ?? new LocalEconomyService();
  const runs = new RunService(auth);
  if (auth && serverEconomy) {
    try {
      await auth.init();
      await serverEconomy.refresh();
    } catch (err) {
      console.warn('[backend] sin conexión al iniciar', err);
    }
  }
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

  const ui = new UIManager(uiRoot, economy, { auth, serverEconomy, leaderboard }, {
    onPlay: () => void startRun(),
    onPauseToggle: () => runner.togglePause(),
    onRetry: () => void startRun(),
    onMenu: () => {
      // Salir a mitad de partida la abandona (no se guarda)
      if (runner.runState !== 'gameover') runs.discard();
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
    onEquip: async (dino) => {
      const result = await economy.equip(dino.id);
      if (result.ok) ui.toast.show(`✅ ${t('shop.equippedToast', { name: dino.name })}`);
      else if (result.error === 'AUTH_REQUIRED') ui.openAuth('buy');
    },
  });

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
  });

  // Iniciar / cerrar sesión: recargar monedero y dino equipado
  auth?.onChange(async (user) => {
    await serverEconomy?.refresh();
    if (user) {
      const name = serverEconomy?.profile?.username;
      if (name) ui.toast.show(t('toast.welcome', { name }));
      ui.promptUsernameIfMissing();
    }
  });

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
    if ((e.target as HTMLElement | null)?.closest('input, form')) return;
    if (runner.runState === 'ready' && ui.isMenuVisible) void startRun();
    else if (runner.runState === 'gameover' && ui.isGameOverVisible) void startRun();
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

  const game = new Game(scenes, scenes);
  game.start();

  // Fuera splash
  const wait = Math.max(0, MIN_SPLASH_MS - (performance.now() - splashStart));
  window.setTimeout(() => {
    document.body.classList.add('ready');
    document.getElementById('splash')?.remove();
  }, wait);

  // Acceso para depurar desde la consola en desarrollo
  if (import.meta.env.DEV) Object.assign(window, { dinoMau: { game, runner, shop, battle, renderer, audio, economy, ui, auth, runs } });
}

bootstrap().catch((err) => {
  console.error(err);
  document.getElementById('ui')!.innerHTML =
    `<div class="screen"><p class="error">No se pudo iniciar el juego 😢<br><small>${String(err)}</small></p></div>`;
});
