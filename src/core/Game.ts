/**
 * Bucle principal. La lógica avanza en subpasos de como máximo 1/60 s para que
 * las colisiones sigan siendo fiables a alta velocidad o con FPS bajos, y el
 * render se hace una vez por frame.
 */
export interface Updatable {
  update(dt: number): void;
}

export interface Renderable {
  render(alpha: number): void;
}

const MAX_STEP = 1 / 60;
/** Si la pestaña se congela, no intentamos "recuperar" más de esto. */
const MAX_FRAME = 0.1;

export class Game {
  private running = false;
  private lastTime = 0;
  private rafId = 0;

  /** FPS medidos (media móvil), útil para el modo de calidad adaptativa. */
  fps = 60;

  constructor(
    private readonly logic: Updatable,
    private readonly view: Renderable,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  private frame = (now: number): void => {
    if (!this.running) return;
    let elapsed = Math.min((now - this.lastTime) / 1000, MAX_FRAME);
    this.lastTime = now;

    if (elapsed > 0) this.fps += (1 / elapsed - this.fps) * 0.05;

    while (elapsed > 0) {
      const step = Math.min(elapsed, MAX_STEP);
      this.logic.update(step);
      elapsed -= step;
    }
    this.view.render(1);
    this.rafId = requestAnimationFrame(this.frame);
  };
}
