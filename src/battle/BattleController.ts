import { BATTLE_CONFIG } from '@/config/battle.config';
import type { DinoDefinition } from '@/config/dinos.config';
import type { RivalDefinition } from '@/config/rivals.config';
import { events } from '@/core/EventBus';
import {
  battleAccuracy, battleCoinDelta, buildTimeline, damageModel, decideWinner, gradeDodge,
  type BattlePhase, type DamageModel, type DodgeDirection, type DodgeGrade,
} from './BattleRules';

export type BattleStage = 'intro' | 'fight' | 'outro' | 'done';

export interface BattleSetup {
  seed: number;
  player: DinoDefinition;
  rival: RivalDefinition;
  /** Monedas de la partida y saldo total en el momento de la batalla. */
  runCoins: number;
  walletCoins: number;
  /** Nº de batalla dentro de la partida (1, 2, ...). */
  sequence: number;
  /** Milisegundos desde el inicio de la partida. */
  atMs: number;
}

/** Lo que se guarda de cada batalla (y se enviará al servidor en la Fase 5). */
export interface BattleResult {
  sequence: number;
  rivalId: string;
  rivalPower: number;
  playerPower: number;
  won: boolean;
  accuracy: number;
  runCoinsBefore: number;
  coinsDelta: number;
  atMs: number;
}

type Attack = Extract<BattlePhase, { kind: 'defend' }>['attacks'][number];

/**
 * Lógica del minijuego: tiempos, toques, esquivas y vida. No sabe nada de
 * DOM ni de Three.js; la escena y la UI leen su estado cada frame.
 */
export class BattleController {
  stage: BattleStage = 'intro';
  /** Tiempo en la etapa actual (s). */
  stageTime = 0;
  /** Tiempo de combate transcurrido (s). */
  time = 0;
  playerHp: number = BATTLE_CONFIG.maxHp;
  rivalHp: number = BATTLE_CONFIG.maxHp;
  readonly duration: number;
  readonly phases: BattlePhase[];
  readonly damage: DamageModel;
  private taps = 0;
  private lastTapTime = -1;
  private readonly grades: DodgeGrade[] = [];
  private readonly resolved = new Set<Attack>();
  private phaseIndex = 0;
  private resultCache?: BattleResult;

  constructor(readonly setup: BattleSetup) {
    const timeline = buildTimeline(setup.seed, setup.rival);
    this.duration = timeline.duration;
    this.phases = timeline.phases;
    this.damage = damageModel(setup.player.battlePower, setup.rival.power, setup.player.ability);
  }

  get phase(): BattlePhase | undefined {
    return this.stage === 'fight' ? this.phases[this.phaseIndex] : undefined;
  }

  get timeLeft(): number {
    return Math.max(0, this.duration - this.time);
  }

  /** Ataque del rival que se puede esquivar ahora mismo (si lo hay). */
  get activeAttack(): Attack | undefined {
    const phase = this.phase;
    if (!phase || phase.kind !== 'defend') return undefined;
    return phase.attacks.find(
      (a) => !this.resolved.has(a) && this.time >= a.telegraphStart && this.time <= a.impact + BATTLE_CONFIG.defend.goodWindow,
    );
  }

  get result(): BattleResult | undefined {
    return this.resultCache;
  }

  update(dt: number): void {
    this.stageTime += dt;
    switch (this.stage) {
      case 'intro':
        if (this.stageTime >= BATTLE_CONFIG.introTime) this.setStage('fight');
        break;
      case 'fight':
        this.time += dt;
        this.updateFight();
        break;
      case 'outro':
      case 'done':
        break;
    }
  }

  private updateFight(): void {
    // Avanza de fase
    while (this.phaseIndex < this.phases.length && this.time >= this.phases[this.phaseIndex].end) {
      this.phaseIndex++;
      const next = this.phases[this.phaseIndex];
      if (next) events.emit('battle:phase', { kind: next.kind });
    }
    // Ataques que nadie esquivó → fallo
    for (const phase of this.phases) {
      if (phase.kind !== 'defend') continue;
      for (const a of phase.attacks) {
        if (!this.resolved.has(a) && this.time > a.impact + BATTLE_CONFIG.defend.goodWindow) this.resolveAttack(a, 'miss');
      }
    }
    if (this.playerHp <= 0 || this.rivalHp <= 0 || this.time >= this.duration) this.finish();
  }

  /** Toque en fase de ataque. */
  tap(): void {
    const phase = this.phase;
    if (!phase || phase.kind !== 'attack') return;
    // Límite de toques por segundo (evita autoclickers)
    if (this.time - this.lastTapTime < 1 / BATTLE_CONFIG.attack.maxTapsPerSecond) return;
    this.lastTapTime = this.time;
    this.taps++;
    this.hitRival(this.damage.tap, 'tap');
    if (this.rivalHp <= 0) this.finish();
  }

  /** Swipe / tecla en fase de defensa. */
  dodge(direction: DodgeDirection): void {
    const attack = this.activeAttack;
    if (!attack) return;
    this.resolveAttack(attack, gradeDodge(attack.direction, direction, this.time - attack.impact));
    if (this.playerHp <= 0 || this.rivalHp <= 0) this.finish();
  }

  private resolveAttack(attack: Attack, grade: DodgeGrade): void {
    this.resolved.add(attack);
    this.grades.push(grade);
    const taken = this.damage.taken[grade];
    if (taken > 0) {
      this.playerHp = Math.max(0, this.playerHp - taken);
      events.emit('battle:hit', { target: 'player', amount: taken, grade });
    } else {
      events.emit('battle:hit', { target: 'player', amount: 0, grade });
    }
    if (grade === 'perfect') this.hitRival(this.damage.counter, 'counter');
  }

  private hitRival(amount: number, source: 'tap' | 'counter'): void {
    this.rivalHp = Math.max(0, this.rivalHp - amount);
    events.emit('battle:hit', { target: 'rival', amount, source });
  }

  private finish(): void {
    if (this.stage !== 'fight') return;
    const winner = decideWinner(this.playerHp, this.rivalHp);
    const won = winner === 'player';
    const attackSeconds = this.phases
      .filter((p) => p.kind === 'attack' && p.start < this.time)
      .reduce((s, p) => s + Math.min(p.end, this.time) - p.start, 0);
    const { setup } = this;
    this.resultCache = {
      sequence: setup.sequence,
      rivalId: setup.rival.id,
      rivalPower: setup.rival.power,
      playerPower: setup.player.battlePower,
      won,
      accuracy: battleAccuracy(this.taps, attackSeconds, this.grades),
      runCoinsBefore: setup.runCoins,
      coinsDelta: battleCoinDelta(won, setup.runCoins, setup.walletCoins),
      atMs: setup.atMs,
    };
    this.setStage('outro');
    events.emit('battle:finished', this.resultCache);
  }

  /** Cierra la batalla tras la animación final. */
  close(): void {
    if (this.stage === 'outro' && this.stageTime >= BATTLE_CONFIG.outroTime) this.setStage('done');
  }

  get canClose(): boolean {
    return this.stage === 'outro' && this.stageTime >= BATTLE_CONFIG.outroTime;
  }

  private setStage(stage: BattleStage): void {
    this.stage = stage;
    this.stageTime = 0;
    if (stage === 'fight') events.emit('battle:phase', { kind: this.phases[0]?.kind ?? 'attack' });
  }
}
