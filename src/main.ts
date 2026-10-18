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
import { LocalEconomyService } from './services/EconomyService';
import { ShopScene } from './shop/ShopScene';
import { LocalStore } from './storage/LocalStore';
import { UIManager } from './ui/UIManager';
import { setLanguage, t } from './i18n/i18n';

/** Tiempo mínimo del splash para que el logo no "parpadee" en equipos rápidos. */
const MIN_SPLASH_MS = 700;

/**
 * Punto de entrada: crea servicios y escenas y conecta la UI.
 * Flujo: splash → menú principal → (tienda | partida → fin de partida).
 */
async function bootstrap(): Promise<void> {
  const splashStart = performance.now();
  setLanguage(LocalStore.settings.language);

  const container = document.getElementById('game')!;
  const uiRoot = document.getElementById('ui')!;
  const splashBar = document.querySelector<HTMLElement>('.splash__bar > span');

  const assets = new AssetLoader();
  await assets.preload((ratio) => splashBar && (splashBar.style.transform = `scaleX(${ratio})`));

  // ⚠️ Monedero local provisional; en la Fase 5 pasa a Supabase
  const economy = new LocalEconomyService();

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

  const ui = new UIManager(uiRoot, economy, {
    onPlay: () => runner.start(),
    onPauseToggle: () => runner.togglePause(),
    onRetry: () => runner.start(),
    onMenu: () => {
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
      } else {
        ui.toast.show(t('shop.error'));
      }
    },
    onBattleContinue: () => battle.close(),
    onEquip: async (dino) => {
      const result = await economy.equip(dino.id);
      if (result.ok) ui.toast.show(`✅ ${t('shop.equippedToast', { name: dino.name })}`);
    },
  });

  // Batallas: el runner avisa al llegar al umbral de monedas
  events.on('battle:trigger', ({ runCoins, sequence, atMs }) => {
    const controller = battle.start(
      {
        seed: SeededRandom.randomSeed(),
        player: getDino(economy.snapshot.equipped),
        rival: selectRival(LocalStore.battlesWon),
        runCoins,
        walletCoins: economy.snapshot.coins,
        sequence,
        atMs,
      },
      (result) => {
        LocalStore.recordBattle(result.won);
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

  // Monedas de la partida → monedero
  events.on('run:over', async ({ coins }) => {
    await economy.creditRun(coins);
    ui.refreshGameOverBalance();
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
    if (runner.runState === 'ready' && ui.isMenuVisible) runner.start();
    else if (runner.runState === 'gameover' && ui.isGameOverVisible) runner.start();
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
  if (import.meta.env.DEV) Object.assign(window, { dinoMau: { game, runner, shop, battle, renderer, audio, economy, ui } });
}

bootstrap().catch((err) => {
  console.error(err);
  document.getElementById('ui')!.innerHTML =
    `<div class="screen"><p class="error">No se pudo iniciar el juego 😢<br><small>${String(err)}</small></p></div>`;
});
