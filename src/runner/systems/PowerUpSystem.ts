import { POWERUPS, type PowerUpType } from '@/config/powerups.config';
import { events } from '@/core/EventBus';

export interface ActivePowerUp {
  type: PowerUpType;
  remaining: number;
  duration: number;
}

/** Cada cuánto se notifica a la UI el tiempo restante (s). */
const TICK_INTERVAL = 0.1;

/**
 * Temporizadores de los power-ups activos. No aplica efectos por sí mismo:
 * los demás sistemas preguntan `isActive()` (imán, x2, súper salto) o
 * `consumeShield()` (al chocar). Así añadir uno nuevo no toca esta clase.
 */
export class PowerUpSystem {
  private readonly active = new Map<PowerUpType, ActivePowerUp>();
  private tickTimer = 0;

  activate(type: PowerUpType): void {
    const duration = POWERUPS[type].duration;
    this.active.set(type, { type, remaining: duration, duration });
    events.emit('powerup:start', { type, duration });
    this.emitTick();
  }

  isActive(type: PowerUpType): boolean {
    return this.active.has(type);
  }

  /** Si hay escudo, lo gasta y devuelve true. */
  consumeShield(): boolean {
    if (!this.active.has('shield')) return false;
    this.end('shield');
    events.emit('shield:break');
    return true;
  }

  update(dt: number): void {
    for (const p of this.active.values()) {
      p.remaining -= dt;
      if (p.remaining <= 0) this.end(p.type);
    }
    this.tickTimer -= dt;
    if (this.tickTimer <= 0 && this.active.size > 0) this.emitTick();
  }

  reset(): void {
    for (const type of [...this.active.keys()]) this.end(type);
    this.tickTimer = 0;
  }

  get list(): ActivePowerUp[] {
    return [...this.active.values()];
  }

  private end(type: PowerUpType): void {
    if (!this.active.delete(type)) return;
    events.emit('powerup:end', { type });
    this.emitTick();
  }

  private emitTick(): void {
    this.tickTimer = TICK_INTERVAL;
    events.emit('powerups:tick', { items: this.list.map((p) => ({ ...p })) });
  }
}
