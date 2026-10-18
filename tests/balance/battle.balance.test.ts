/**
 * Tabla de balance de batallas: % de victorias de cada dino contra cada rival
 * para tres perfiles de jugador simulados. No corre con `npm test`; úsala con
 * `npm run balance` tras tocar battle.config.ts o rivals.config.ts.
 */
import { it } from 'vitest';
import { DINOS } from '@/config/dinos.config';
import { RIVALS } from '@/config/rivals.config';
import { BattleController } from '@/battle/BattleController';
import { selectRival } from '@/battle/BattleRules';
function play(c: BattleController, tps: number, skill: number) {
  let acc = 0;
  for (let i = 0; i < 60 * 30 && c.stage !== 'outro'; i++) {
    c.update(1 / 60);
    if (c.phase?.kind === 'attack') { acc += tps / 60; while (acc >= 1) { c.tap(); acc--; } }
    const a = c.activeAttack;
    if (a && skill > 0 && Math.abs(c.time - a.impact) < (skill > 0.8 ? 0.05 : 0.2)) c.dodge(a.direction);
  }
  return c.result!;
}
it.runIf(process.env.BALANCE)('balance de batallas', () => {
  for (const [label, tps, skill] of [['casual', 3, 0], ['medio', 5, 0.5], ['bueno', 7, 1]] as const) {
    console.log(`\n${label}: filas=dino, cols=rival 1..9 (% victorias en 20 semillas)`);
    for (const d of DINOS) {
      const row = RIVALS.map((_, ri) => {
        let w = 0;
        for (let s = 1; s <= 20; s++) w += play(new BattleController({ seed: s, player: d, rival: selectRival(ri), runCoins: 500, walletCoins: 0, sequence: 1, atMs: 0 }), tps, skill).won ? 1 : 0;
        return String(w * 5).padStart(4);
      }).join('');
      console.log(d.name.padEnd(18), row);
    }
  }
});
