import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { DINOS, dinoModifiers, getDino } from '@/config/dinos.config';
import type { DinoVisual } from '@/assets/DinoVisual';
import { createAbility, type AbilityContext } from '@/runner/abilities/abilities';
import { Obstacle } from '@/runner/entities/Obstacle';
import { Player } from '@/runner/player/Player';
import type { ObstacleType } from '@/config/obstacles.config';

const fakeVisual = (): DinoVisual => ({ root: new THREE.Group(), setState: () => {}, update: () => {} });

function setup(dinoId: Parameters<typeof getDino>[0], obstacles: Obstacle[] = []) {
  const player = new Player(fakeVisual(), getDino(dinoId));
  let speedMultiplier = 1;
  const ctx: AbilityContext = {
    player,
    distance: 0,
    time: 10,
    forEachObstacle: (fn) => obstacles.forEach(fn),
    setSpeedMultiplier: (m) => (speedMultiplier = m),
    shake: () => {},
  };
  const ability = createAbility(getDino(dinoId).ability);
  ability.reset(ctx);
  return { player, ctx, ability, speed: () => speedMultiplier };
}

const obstacle = (type: ObstacleType, z = 0) => {
  const o = new Obstacle(type, new THREE.Object3D());
  o.object.position.z = z;
  return o;
};

describe('estadísticas', () => {
  it('la velocidad da bonus de puntaje y la agilidad acorta movimientos', () => {
    expect(dinoModifiers(getDino('compsognathus')).scoreMultiplier).toBe(1);
    expect(dinoModifiers(getDino('gallimimus')).scoreMultiplier).toBeCloseTo(1.2);
    expect(dinoModifiers(getDino('velociraptor')).agilityFactor).toBeLessThan(1);
    expect(dinoModifiers(getDino('ankylosaurus')).agilityFactor).toBeGreaterThan(1);
  });

  it('los precios siguen el orden del catálogo y el inicial es gratis', () => {
    expect(DINOS[0].price).toBe(0);
    for (let i = 1; i < DINOS.length; i++) expect(DINOS[i].price).toBeGreaterThan(DINOS[i - 1].price);
  });
});

describe('habilidades', () => {
  it('Stegosaurus: las placas aguantan exactamente 1 golpe por partida', () => {
    const { ability, ctx } = setup('stegosaurus');
    expect(ability.onHit(obstacle('rock'), ctx)).toBe('ignore');
    expect(ctx.player.isInvulnerable).toBe(true);
    expect(ability.onHit(obstacle('rock'), ctx)).toBeNull();
    ability.reset(ctx);
    expect(ability.onHit(obstacle('rock'), ctx)).toBe('ignore');
  });

  it('Triceratops: rompe rocas pero no árboles ni géiseres', () => {
    const { ability, ctx } = setup('triceratops');
    expect(ability.onHit(obstacle('rock'), ctx)).toBe('destroy');
    expect(ability.onHit(obstacle('tree'), ctx)).toBeNull();
    expect(ability.onHit(obstacle('geyser'), ctx)).toBeNull();
  });

  it('Spinosaurus: atraviesa ríos nadando', () => {
    const river = obstacle('river', 0);
    const { ability, ctx, player } = setup('spinosaurus', [river]);
    expect(ability.passesThrough(river, ctx)).toBe(true);
    expect(ability.passesThrough(obstacle('log'), ctx)).toBe(false);
    ability.update(0.016, ctx);
    expect(player.swimming).toBe(true);
  });

  it('Parasaurolophus: el rugido aturde pterodáctilos cercanos y tiene enfriamiento', () => {
    const near = obstacle('pterodactyl', -15);
    const far = obstacle('pterodactyl', -60);
    const { ability, ctx } = setup('parasaurolophus', [near, far]);
    ability.update(0.016, ctx);
    expect(near.stunnedAt).toBe(10);
    expect(far.stunnedAt).toBe(-1);
    const another = obstacle('pterodactyl', -10);
    const s2 = setup('parasaurolophus', [another]);
    s2.ability.update(0.016, s2.ctx); // primero ruge
    const late = obstacle('pterodactyl', -12);
    ctx.forEachObstacle = (fn) => [late].forEach(fn);
    ability.update(1, ctx); // aún en enfriamiento
    expect(late.stunnedAt).toBe(-1);
  });

  it('Gallimimus: sprint inicial más rápido y atravesando obstáculos', () => {
    const { ability, ctx, speed } = setup('gallimimus');
    expect(speed()).toBeGreaterThan(1);
    expect(ability.passesThrough(obstacle('rock'), ctx)).toBe(true);
    (ctx as { distance: number }).distance = 300;
    ability.update(0.016, ctx);
    expect(speed()).toBe(1);
    expect(ability.passesThrough(obstacle('rock'), ctx)).toBe(false);
  });

  it('Velociraptor: doble salto; el resto de dinos no', () => {
    const raptor = new Player(fakeVisual(), getDino('velociraptor'));
    raptor.reset();
    raptor.jump();
    for (let i = 0; i < 6; i++) raptor.update(0.016, 1);
    const yBefore = raptor.y;
    raptor.jump(); // salto en el aire
    raptor.update(0.05, 1);
    expect(raptor.y).toBeGreaterThan(yBefore);

    const compy = new Player(fakeVisual(), getDino('compsognathus'));
    compy.reset();
    compy.jump();
    for (let i = 0; i < 22; i++) compy.update(0.016, 1); // ya cayendo (pasó el punto más alto)
    const before = compy.y;
    compy.jump();
    compy.update(0.05, 1);
    expect(compy.y).toBeLessThan(before);
  });
});
