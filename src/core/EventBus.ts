import type { ObstacleType } from '@/config/obstacles.config';
import type { PowerUpType } from '@/config/powerups.config';
import type { DinoAbility, DinoId } from '@/config/dinos.config';
import type { BattleResult } from '@/battle/BattleController';
import type { DodgeGrade } from '@/battle/BattleRules';

/**
 * Eventos del juego. Los sistemas emiten, la UI/audio escuchan, y así ninguno
 * depende directamente del otro. Para un evento nuevo basta con añadirlo aquí.
 */
export interface GameEvents {
  'run:start': void;
  'run:pause': void;
  'run:resume': void;
  /** Cuenta regresiva antes de reanudar (3, 2, 1, 0 = ¡ya!). */
  'run:countdown': { value: number };
  'run:over': { distance: number; score: number; coins: number; durationMs: number; battles: BattleResult[] };
  /** Las monedas de la partida cambiaron por algo distinto a recogerlas (batallas). */
  'run:coins': { total: number; delta: number };
  'score:update': { distance: number; score: number; speed: number };
  'coin:collected': { total: number; amount: number };
  'player:jump': { super: boolean };
  'player:roll': void;
  'player:lane': { lane: number };
  'player:stumble': void;
  'player:hit': { obstacle: ObstacleType };
  'powerup:start': { type: PowerUpType; duration: number };
  'powerup:end': { type: PowerUpType };
  'powerups:tick': { items: Array<{ type: PowerUpType; remaining: number; duration: number }> };
  'shield:break': void;
  /** Una habilidad especial del dino se activó (para UI/audio). */
  'ability:used': { ability: DinoAbility };
  /** El saldo de monedas del jugador cambió. */
  'wallet:changed': { coins: number };
  /** Se equipó otro dino. */
  'dino:equipped': { id: DinoId };

  // --- Batallas ---
  /** El runner alcanzó el umbral de monedas: hay que lanzar una batalla. */
  'battle:trigger': { runCoins: number; sequence: number; atMs: number };
  'battle:phase': { kind: 'attack' | 'defend' };
  'battle:hit': { target: 'player' | 'rival'; amount: number; grade?: DodgeGrade; source?: 'tap' | 'counter' };
  'battle:finished': BattleResult;
}

type Handler<T> = (payload: T) => void;

export class EventBus<Events extends object = GameEvents> {
  private handlers = new Map<keyof Events, Set<Handler<never>>>();

  on<K extends keyof Events>(event: K, handler: Handler<Events[K]>): () => void {
    let set = this.handlers.get(event);
    if (!set) this.handlers.set(event, (set = new Set()));
    set.add(handler as Handler<never>);
    return () => set!.delete(handler as Handler<never>);
  }

  emit<K extends keyof Events>(
    event: K,
    ...payload: Events[K] extends void ? [] : [Events[K]]
  ): void {
    this.handlers.get(event)?.forEach((h) => (h as Handler<Events[K]>)(payload[0] as Events[K]));
  }

  clear(): void {
    this.handlers.clear();
  }
}

/** Bus global del juego. */
export const events = new EventBus<GameEvents>();
