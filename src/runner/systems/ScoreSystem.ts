import { GAME_CONFIG } from '@/config/game.config';

/**
 * Puntaje y monedas de la partida en curso. El x2 de monedas lo aplica
 * RunnerScene al recogerlas; los efectos de batalla llegarán en la Fase 4.
 */
export class ScoreSystem {
  distance = 0;
  coins = 0;
  elapsed = 0;
  /** Bonus de puntaje por la velocidad del dino equipado. */
  scoreMultiplier = 1;

  reset(): void {
    this.distance = 0;
    this.coins = 0;
    this.elapsed = 0;
  }

  get score(): number {
    return Math.floor(this.distance * GAME_CONFIG.scorePerMeter * this.scoreMultiplier);
  }

  addCoin(amount = 1): number {
    this.coins += amount;
    return this.coins;
  }
}
