import { afterEach, describe, expect, it } from 'vitest';
import { POWERUPS } from '@/config/powerups.config';
import { events } from '@/core/EventBus';
import { PowerUpSystem } from '@/runner/systems/PowerUpSystem';

describe('PowerUpSystem', () => {
  afterEach(() => events.clear());

  it('activa y expira según la duración', () => {
    const ended: string[] = [];
    events.on('powerup:end', ({ type }) => ended.push(type));
    const sys = new PowerUpSystem();
    sys.activate('magnet');
    sys.update(POWERUPS.magnet.duration - 0.1);
    expect(sys.isActive('magnet')).toBe(true);
    sys.update(0.2);
    expect(sys.isActive('magnet')).toBe(false);
    expect(ended).toEqual(['magnet']);
  });

  it('recoger otra vez reinicia el tiempo', () => {
    const sys = new PowerUpSystem();
    sys.activate('multiplier');
    sys.update(10);
    sys.activate('multiplier');
    expect(sys.list[0].remaining).toBe(POWERUPS.multiplier.duration);
  });

  it('el escudo se gasta una sola vez', () => {
    const sys = new PowerUpSystem();
    expect(sys.consumeShield()).toBe(false);
    sys.activate('shield');
    expect(sys.consumeShield()).toBe(true);
    expect(sys.consumeShield()).toBe(false);
  });
});
