import type { Renderable, Updatable } from './Game';

export type GameScene = Updatable & Renderable;

/**
 * Escena activa (runner, tienda y, en la Fase 4, batalla). Solo la activa se
 * actualiza y se dibuja; las demás quedan congeladas sin coste.
 */
export class SceneManager implements Updatable, Renderable {
  private active: GameScene;

  constructor(initial: GameScene) {
    this.active = initial;
  }

  set(scene: GameScene): void {
    this.active = scene;
  }

  is(scene: GameScene): boolean {
    return this.active === scene;
  }

  update(dt: number): void {
    this.active.update(dt);
  }

  render(alpha: number): void {
    this.active.render(alpha);
  }
}
