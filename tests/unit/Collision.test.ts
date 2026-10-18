import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '@/config/game.config';
import { OBSTACLES } from '@/config/obstacles.config';
import { POWERUP_CONFIG } from '@/config/powerups.config';
import { createAABB, intersects, setBox } from '@/runner/systems/CollisionSystem';

const P = GAME_CONFIG.player;

function playerBox(y: number, rolling: boolean) {
  const b = createAABB();
  b.minX = -P.width / 2; b.maxX = P.width / 2;
  b.minY = y; b.maxY = y + (rolling ? P.rollHeight : P.height);
  b.minZ = -P.depth / 2; b.maxZ = P.depth / 2;
  return b;
}

describe('colisiones según cómo se supera cada obstáculo', () => {
  const at = (type: keyof typeof OBSTACLES) => setBox(createAABB(), 0, 0, OBSTACLES[type].hitbox);

  it('el tronco se supera saltando por encima de su altura', () => {
    expect(intersects(playerBox(0, false), at('log'))).toBe(true);
    expect(intersects(playerBox(OBSTACLES.log.hitbox.height + 0.01, false), at('log'))).toBe(false);
    expect(OBSTACLES.log.hitbox.height).toBeLessThan(P.jumpHeight);
  });

  it('la rama baja se supera rodando, no de pie ni saltando', () => {
    expect(intersects(playerBox(0, false), at('lowBranch'))).toBe(true);
    expect(intersects(playerBox(0, true), at('lowBranch'))).toBe(false);
    expect(intersects(playerBox(P.jumpHeight, false), at('lowBranch'))).toBe(true);
  });

  it('el pterodáctilo en vuelo rasante obliga a rodar', () => {
    expect(intersects(playerBox(0, false), at('pterodactyl'))).toBe(true);
    expect(intersects(playerBox(0, true), at('pterodactyl'))).toBe(false);
    expect(intersects(playerBox(P.jumpHeight, false), at('pterodactyl'))).toBe(true);
  });

  it('el súper salto supera rocas y árboles', () => {
    const top = Math.max(OBSTACLES.rock.hitbox.height, OBSTACLES.tree.hitbox.height, OBSTACLES.geyser.hitbox.height);
    expect(POWERUP_CONFIG.superJump.jumpHeight).toBeGreaterThan(Math.min(OBSTACLES.rock.hitbox.height, OBSTACLES.tree.hitbox.height));
    expect(intersects(playerBox(POWERUP_CONFIG.superJump.jumpHeight, false), at('rock'))).toBe(false);
    expect(intersects(playerBox(POWERUP_CONFIG.superJump.jumpHeight, false), at('tree'))).toBe(false);
    expect(top).toBeGreaterThan(P.jumpHeight);
  });

  it('roca y árbol no se pueden saltar', () => {
    expect(intersects(playerBox(P.jumpHeight, false), at('rock'))).toBe(true);
    expect(intersects(playerBox(P.jumpHeight, false), at('tree'))).toBe(true);
  });

  it('un obstáculo en el carril vecino no colisiona', () => {
    const b = setBox(createAABB(), GAME_CONFIG.lanes.width, 0, OBSTACLES.rock.hitbox);
    expect(intersects(playerBox(0, false), b)).toBe(false);
  });
});
