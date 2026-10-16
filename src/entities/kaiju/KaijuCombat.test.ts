import { describe, expect, it } from 'vitest';
import { COMBAT } from '../../config/combat';
import { KaijuCombat, type CombatInput } from './KaijuCombat';
import type { KaijuState } from './locomotion';

const DT = 1 / 60;
const none: CombatInput = { claw: false, tail: false, stomp: false, roar: false, beamHeld: false, aim: null };

function setup(energy = 100) {
  const body = {
    position: { x: 0, y: 0, z: 0 },
    yaw: 0,
    mouthHeight: 95,
    mouthForward: 38,
    state: 'idle' as KaijuState,
    setState(s: KaijuState) {
      this.state = s;
    },
  };
  const pool = {
    energy,
    spend(n: number) {
      if (this.energy < n) return false;
      this.energy -= n;
      return true;
    },
  };
  return { body, pool, combat: new KaijuCombat(body, pool, COMBAT) };
}

function run(c: KaijuCombat, seconds: number, input: CombatInput = none) {
  const attacks = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    c.update(DT, input);
    attacks.push(...c.attacks);
  }
  return attacks;
}

describe('KaijuCombat', () => {
  it('claw emits exactly one front-arc attack during its active window, then returns to idle', () => {
    const { body, combat } = setup();
    combat.update(DT, { ...none, claw: true });
    expect(body.state).toBe('attack');
    const attacks = run(combat, 1);
    expect(attacks).toHaveLength(1);
    expect(attacks[0]).toMatchObject({ type: 'area', move: 'claw' });
    expect(body.state).toBe('idle');
  });

  it('stomp goes on cooldown', () => {
    const { body, combat } = setup();
    combat.update(DT, { ...none, stomp: true });
    run(combat, 2);
    combat.update(DT, { ...none, stomp: true });
    expect(body.state).toBe('idle');
    run(combat, COMBAT.stomp.cooldown);
    combat.update(DT, { ...none, stomp: true });
    expect(body.state).toBe('stomp');
  });

  it('buffers a press made during another move', () => {
    const { body, combat } = setup();
    combat.update(DT, { ...none, stomp: true });
    run(combat, COMBAT.stomp.windup + COMBAT.stomp.active + COMBAT.stomp.recovery - 0.1);
    combat.update(DT, { ...none, tail: true });
    run(combat, 0.2);
    expect(body.state).toBe('attack');
  });

  it('beam: charge, release, fire spends energy and emits beam ticks', () => {
    const { body, pool, combat } = setup();
    run(combat, COMBAT.beam.chargeTime + 0.1, { ...none, beamHeld: true });
    expect(body.state).toBe('beamCharge');
    expect(combat.charge).toBe(1);
    combat.update(DT, none);
    expect(body.state).toBe('beamFire');
    const attacks = run(combat, COMBAT.beam.startup + COMBAT.beam.durationMax + COMBAT.beam.recovery + 0.1);
    expect(attacks.filter((a) => a.type === 'beam').length).toBeGreaterThan(100);
    expect(pool.energy).toBeLessThan(100 - COMBAT.beam.energyPerSecond * COMBAT.beam.durationMax * 0.9);
    expect(body.state).toBe('idle');
  });

  it('beam fizzles on a quick tap and needs energy to charge', () => {
    const { body, combat } = setup();
    run(combat, 0.1, { ...none, beamHeld: true });
    combat.update(DT, none);
    expect(body.state).toBe('idle');
    const poor = setup(0);
    poor.combat.update(DT, { ...none, beamHeld: true });
    expect(poor.body.state).toBe('idle');
  });

  it('running out of energy cuts the beam short', () => {
    const { body, combat } = setup(20);
    run(combat, COMBAT.beam.chargeTime, { ...none, beamHeld: true });
    combat.update(DT, none);
    run(combat, COMBAT.beam.startup + 1.5 + COMBAT.beam.recovery);
    expect(body.state).toBe('idle');
  });

  it('a big hit interrupts and knocks down, then grants invulnerability', () => {
    const { body, combat } = setup();
    combat.update(DT, { ...none, tail: true });
    expect(combat.takeHit(COMBAT.health.knockdownThreshold)).toBe('knockdown');
    expect(body.state).toBe('knockdown');
    run(combat, COMBAT.health.knockdownSeconds + 0.05);
    expect(body.state).toBe('idle');
    expect(combat.health.isInvulnerable).toBe(true);
  });

  it('pulse needs the upgrade and costs energy', () => {
    const { body, pool, combat } = setup(100);
    combat.update(DT, { ...none, pulse: true });
    expect(body.state).toBe('idle'); // locked
    combat.mods = { ...combat.mods, pulse: true };
    combat.update(DT, { ...none, pulse: true });
    expect(body.state).toBe('attack');
    expect(pool.energy).toBe(100 - COMBAT.pulse!.energyCost!);
    const poor = setup(10);
    poor.combat.mods = { ...poor.combat.mods, pulse: true };
    poor.combat.update(DT, { ...none, pulse: true });
    expect(poor.body.state).toBe('idle');
  });

  it('charge-time upgrades charge the beam faster', () => {
    const { combat } = setup();
    combat.mods = { ...combat.mods, chargeTime: 0.5 };
    run(combat, COMBAT.beam.chargeTime * 0.5 + 0.05, { ...none, beamHeld: true });
    expect(combat.charge).toBe(1);
  });

  it('defeat holds until respawn', () => {
    const { body, combat } = setup();
    combat.takeHit(1e6);
    run(combat, 5, { ...none, claw: true });
    expect(body.state).toBe('defeated');
    combat.respawn();
    expect(body.state).toBe('idle');
    expect(combat.health.fraction).toBe(1);
  });
});
