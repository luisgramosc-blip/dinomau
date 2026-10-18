import type { InputAction } from './InputManager';

/** Distancia mínima (en px CSS) para reconocer un swipe. */
const MIN_DISTANCE = 28;
/** Un swipe más lento que esto se ignora. */
const MAX_DURATION = 600;

/**
 * Detecta swipes. Se dispara en `pointermove` en cuanto se supera el umbral
 * (no hay que esperar a levantar el dedo), lo que da respuesta inmediata.
 * Un gesto = una acción; hay que levantar el dedo para el siguiente.
 */
export class SwipeInput {
  private startX = 0;
  private startY = 0;
  private startTime = 0;
  private tracking = false;
  private pointerId = -1;

  constructor(
    private readonly target: HTMLElement,
    private readonly emit: (a: InputAction) => void,
  ) {
    target.addEventListener('pointerdown', this.onDown, { passive: true });
    target.addEventListener('pointermove', this.onMove, { passive: true });
    target.addEventListener('pointerup', this.onUp, { passive: true });
    target.addEventListener('pointercancel', this.onUp, { passive: true });
  }

  private onDown = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.tracking = true;
    this.pointerId = e.pointerId;
    this.startX = e.clientX;
    this.startY = e.clientY;
    this.startTime = performance.now();
  };

  private onMove = (e: PointerEvent): void => {
    if (!this.tracking || e.pointerId !== this.pointerId) return;
    if (performance.now() - this.startTime > MAX_DURATION) {
      // Gesto lento: reinicia el origen para permitir "arrastrar y luego swipe"
      this.startX = e.clientX;
      this.startY = e.clientY;
      this.startTime = performance.now();
      return;
    }
    const dx = e.clientX - this.startX;
    const dy = e.clientY - this.startY;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < MIN_DISTANCE) return;

    this.tracking = false;
    if (Math.abs(dx) > Math.abs(dy)) this.emit(dx > 0 ? 'right' : 'left');
    else this.emit(dy > 0 ? 'roll' : 'jump');
  };

  private onUp = (e: PointerEvent): void => {
    if (e.pointerId === this.pointerId) this.tracking = false;
  };

  dispose(): void {
    this.target.removeEventListener('pointerdown', this.onDown);
    this.target.removeEventListener('pointermove', this.onMove);
    this.target.removeEventListener('pointerup', this.onUp);
    this.target.removeEventListener('pointercancel', this.onUp);
  }
}
