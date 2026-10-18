import type { Renderer } from './Renderer';

/**
 * Calidad adaptativa: si el juego no llega a ~50 FPS de forma sostenida baja
 * la resolución interna (el mayor coste en móviles de gama media); si va
 * sobrado, la sube una vez. Recuerda el último nivel para la próxima sesión.
 *
 * Solo mide durante la partida (los menús no cuentan).
 */
const STORAGE_KEY = 'dinomau:quality';
/** Factores sobre el pixel ratio máximo del dispositivo. */
const LEVELS = [1, 0.8, 0.65, 0.5];
const MIN_RATIO = 0.75;
const LOW_FPS = 48;
const HIGH_FPS = 58;
const SECONDS_TO_DROP = 3;
const SECONDS_TO_RAISE = 20;

export class QualityManager {
  private level: number;
  private lowSeconds = 0;
  private highSeconds = 0;
  private acc = 0;
  private samples = 0;
  private sum = 0;
  private raisedOnce = false;

  constructor(private readonly renderer: Renderer) {
    this.level = Math.min(LEVELS.length - 1, Math.max(0, Number(read() ?? 0) || 0));
    this.apply();
  }

  get currentLevel(): number {
    return this.level;
  }

  /** Llamar cada frame con los FPS medidos y si se está jugando. */
  update(dt: number, fps: number, active: boolean): void {
    if (!active) return;
    this.acc += dt;
    this.sum += fps;
    this.samples++;
    if (this.acc < 1) return;

    const avg = this.sum / this.samples;
    this.acc = this.sum = this.samples = 0;
    if (avg < LOW_FPS) {
      this.lowSeconds++;
      this.highSeconds = 0;
    } else if (avg > HIGH_FPS) {
      this.highSeconds++;
      this.lowSeconds = 0;
    } else {
      this.lowSeconds = this.highSeconds = 0;
    }

    if (this.lowSeconds >= SECONDS_TO_DROP && this.level < LEVELS.length - 1) {
      this.setLevel(this.level + 1);
    } else if (this.highSeconds >= SECONDS_TO_RAISE && this.level > 0 && !this.raisedOnce) {
      // Solo se sube una vez por sesión para no oscilar
      this.raisedOnce = true;
      this.setLevel(this.level - 1);
    }
  }

  private setLevel(level: number): void {
    this.level = level;
    this.lowSeconds = this.highSeconds = 0;
    this.apply();
    write(String(level));
    console.info(`[calidad] nivel ${level} → pixel ratio ${this.renderer.pixelRatio.toFixed(2)}`);
  }

  private apply(): void {
    const ratio = Math.max(MIN_RATIO, this.renderer.maxPixelRatio * LEVELS[this.level]);
    this.renderer.setPixelRatio(ratio);
  }
}

function read(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
function write(value: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* sin almacenamiento */
  }
}
