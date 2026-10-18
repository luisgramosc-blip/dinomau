import type { InputAction } from './InputManager';

const KEY_MAP: Record<string, InputAction> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'jump',
  KeyW: 'jump',
  Space: 'jump',
  ArrowDown: 'roll',
  KeyS: 'roll',
  Escape: 'pause',
  KeyP: 'pause',
};

/** Flechas + WASD + Espacio (saltar) + Esc/P (pausa). */
export class KeyboardInput {
  constructor(private readonly emit: (a: InputAction) => void) {
    window.addEventListener('keydown', this.onKeyDown);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    const action = KEY_MAP[e.code];
    if (!action || e.repeat) return;
    // No robar teclas cuando se escribe en un formulario
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    e.preventDefault();
    this.emit(action);
  };

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
  }
}
