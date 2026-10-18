import { KeyboardInput } from './KeyboardInput';
import { SwipeInput } from './SwipeInput';

/** Acciones de juego, independientes del dispositivo de entrada. */
export type InputAction = 'left' | 'right' | 'jump' | 'roll' | 'pause';

/**
 * Une teclado y gestos táctiles en una cola de acciones que el jugador
 * consume en cada paso de lógica. Así la lógica nunca depende del DOM.
 */
export class InputManager {
  private queue: InputAction[] = [];
  private enabled = true;
  private readonly sources: Array<{ dispose(): void }>;
  private listeners: Array<(a: InputAction) => void> = [];

  constructor(touchTarget: HTMLElement) {
    const push = (a: InputAction) => this.push(a);
    this.sources = [new KeyboardInput(push), new SwipeInput(touchTarget, push)];
  }

  private push(action: InputAction): void {
    for (const l of this.listeners) l(action);
    if (!this.enabled) return;
    // Cola corta: una ráfaga de swipes no debe acumular acciones viejas
    if (this.queue.length < 3) this.queue.push(action);
  }

  /** Escucha todas las acciones aunque la entrada de juego esté desactivada (p. ej. pausa). */
  onAction(listener: (a: InputAction) => void): void {
    this.listeners.push(listener);
  }

  /** Saca la siguiente acción pendiente. */
  poll(): InputAction | undefined {
    return this.queue.shift();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.queue.length = 0;
  }

  clear(): void {
    this.queue.length = 0;
  }

  dispose(): void {
    for (const s of this.sources) s.dispose();
  }
}
