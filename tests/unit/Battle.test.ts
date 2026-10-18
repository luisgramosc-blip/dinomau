import { afterEach, describe, expect, it } from 'vitest';
import { BATTLE_CONFIG } from '@/config/battle.config';
import { getDino } from '@/config/dinos.config';
import { RIVALS } from '@/config/rivals.config';
import { events } from '@/core/EventBus';
import { BattleController, type BattleSetup } from '@/battle/BattleController';
import {
  battleAccuracy, battleCoinDelta, buildTimeline, damageModel, decideWinner, gradeDodge, powerFactor, selectRival,
} from '@/battle/BattleRules';

afterEach(() => events.clear());

describe('rivales', () => {
  it('cada batalla el rival es más fuerte, también después de la escalera', () => {
    let prev = 0;
    for (let n = 0; n < RIVALS.length + 5; n++) {
      const r = selectRival(n);
      expect(r.power).toBeGreaterThan(prev);
      prev = r.power;
    }
  });
});

describe('línea de tiempo', () => {
  it('dura 15–20 s, empieza atacando y alterna fases sin solaparse', () => {
    for (let seed = 1; seed < 50; seed++) {
      const { duration, phases } = buildTimeline(seed, selectRival(seed % 12));
      expect(duration).toBeGreaterThanOrEqual(15);
      expect(duration).toBeLessThanOrEqual(20);
      expect(phases[0].kind).toBe('attack');
      for (let i = 1; i < phases.length; i++) {
        expect(phases[i].kind).not.toBe(phases[i - 1].kind);
        expect(phases[i].start).toBeCloseTo(phases[i - 1].end);
      }
      for (const p of phases) {
        if (p.kind !== 'defend') continue;
        for (const a of p.attacks) expect(a.impact + BATTLE_CONFIG.defend.goodWindow).toBeLessThanOrEqual(duration + 1e-9);
      }
    }
  });

  it('los rivales fuertes avisan con menos tiempo', () => {
    const tele = (n: number) => {
      const defend = buildTimeline(3, selectRival(n)).phases.find((p) => p.kind === 'defend');
      const a = defend!.kind === 'defend' ? defend!.attacks[0] : undefined;
      return a!.impact - a!.telegraphStart;
    };
    expect(tele(8)).toBeLessThan(tele(0));
  });
});

describe('daño y calificación', () => {
  it('el factor de poder premia al más fuerte pero está acotado', () => {
    expect(powerFactor(50, 50)).toBeCloseTo(1);
    expect(powerFactor(100, 10)).toBeGreaterThan(1);
    expect(powerFactor(1, 1000)).toBeCloseTo(Math.pow(BATTLE_CONFIG.powerRatioClamp[0], BATTLE_CONFIG.powerInfluence));
  });

  it('califica esquivas por dirección y timing', () => {
    expect(gradeDodge('left', 'left', 0.05)).toBe('perfect');
    expect(gradeDodge('left', 'left', -0.2)).toBe('good');
    expect(gradeDodge('left', 'left', 0.5)).toBe('miss');
    expect(gradeDodge('left', 'right', 0)).toBe('miss');
  });

  it('cola-maza duplica el contraataque y el T-Rex pega más fuerte', () => {
    const base = damageModel(50, 50, 'none');
    expect(damageModel(50, 50, 'tail_club').counter).toBeCloseTo(base.counter * 2);
    expect(damageModel(50, 50, 'apex_power').tap).toBeGreaterThan(base.tap);
  });

  it('decide el ganador por KO o por vida restante', () => {
    expect(decideWinner(10, 0)).toBe('player');
    expect(decideWinner(0, 50)).toBe('rival');
    expect(decideWinner(40, 60)).toBe('rival');
    expect(decideWinner(50, 50)).toBe('player');
  });

  it('la precisión está entre 0 y 1', () => {
    expect(battleAccuracy(0, 5, ['miss', 'miss'])).toBe(0);
    expect(battleAccuracy(100, 5, ['perfect'])).toBe(1);
  });
});

describe('efecto en monedas', () => {
  it('ganar duplica las monedas de la partida, con tope', () => {
    expect(battleCoinDelta(true, 600, 0)).toBe(600);
    expect(battleCoinDelta(true, 9000, 0)).toBe(BATTLE_CONFIG.maxGainPerBattle);
  });

  it('perder resta la penalización sin bajar de 0', () => {
    expect(battleCoinDelta(false, 600, 0)).toBe(-100);
    expect(battleCoinDelta(false, 40, 0)).toBe(-40);
  });

  it("con multiplyTarget 'total' usa el saldo total", () => {
    const cfg = { ...BATTLE_CONFIG, multiplyTarget: 'total' as const };
    expect(battleCoinDelta(true, 500, 1500, cfg)).toBe(2000);
  });
});

describe('BattleController', () => {
  const setup = (dino: Parameters<typeof getDino>[0], rivalIndex: number): BattleSetup => ({
    seed: 42, player: getDino(dino), rival: selectRival(rivalIndex), runCoins: 600, walletCoins: 0, sequence: 1, atMs: 30000,
  });

  /** Simula un jugador: toca a `tapsPerSecond` y esquiva con calidad `skill` (0–1). */
  function play(c: BattleController, tapsPerSecond: number, skill: number) {
    let tapAcc = 0;
    for (let i = 0; i < 60 * 30 && c.stage !== 'outro'; i++) {
      c.update(1 / 60);
      const phase = c.phase;
      if (phase?.kind === 'attack') {
        tapAcc += tapsPerSecond / 60;
        while (tapAcc >= 1) { c.tap(); tapAcc--; }
      }
      const a = c.activeAttack;
      if (a && skill > 0 && Math.abs(c.time - a.impact) < (skill > 0.8 ? 0.05 : 0.2)) c.dodge(a.direction);
    }
    return c.result!;
  }

  it('un jugador hábil vence a un rival parejo y gana el doble de monedas', () => {
    const r = play(new BattleController(setup('velociraptor', 3)), 7, 1);
    expect(r.won).toBe(true);
    expect(r.coinsDelta).toBe(600);
    expect(r.accuracy).toBeGreaterThan(0.8);
  });

  it('sin hacer nada se pierde y se paga la penalización', () => {
    const r = play(new BattleController(setup('velociraptor', 3)), 0, 0);
    expect(r.won).toBe(false);
    expect(r.coinsDelta).toBe(-100);
  });

  it('el poder importa: el mismo jugador mediocre gana con T-Rex y pierde con Compsognathus', () => {
    expect(play(new BattleController(setup('tyrannosaurus', 5)), 4, 0.5).won).toBe(true);
    expect(play(new BattleController(setup('compsognathus', 5)), 4, 0.5).won).toBe(false);
  });

  it('limita los toques por segundo', () => {
    const c = new BattleController(setup('compsognathus', 0));
    while (c.stage !== 'fight') c.update(0.1);
    c.update(0.01);
    for (let i = 0; i < 100; i++) c.tap(); // todos en el mismo instante
    expect(c.rivalHp).toBeCloseTo(BATTLE_CONFIG.maxHp - c.damage.tap);
  });

  it('solo se puede cerrar tras la animación final', () => {
    const c = new BattleController(setup('tyrannosaurus', 0));
    play(c, 10, 1);
    c.close();
    expect(c.stage).toBe('outro');
    c.update(BATTLE_CONFIG.outroTime);
    c.close();
    expect(c.stage).toBe('done');
  });
});
