import { describe, expect, it } from 'vitest';
import { RIVALS } from '../../config/rivals';
import type { RivalAIConfig } from '../../config/rivals';
import { Random } from '../../core/random';
import { RivalAI, type Perception } from './RivalAI';

const DT = 1 / 60;

function perception(over: Partial<Perception> = {}): Perception {
  return {
    x: 0, z: 0, yaw: 0, busy: false, charging: false, charge: 0,
    canStart: () => true,
    target: { x: 0, y: 50, z: 100 },
    ...over,
  };
}

const brawler = (over: Partial<RivalAIConfig> = {}) => new RivalAI({ ...RIVALS.thornmaw.ai, ...over }, new Random(1));
const ranged = (over: Partial<RivalAIConfig> = {}) => new RivalAI({ ...RIVALS.vesperion.ai, ...over }, new Random(1));

function runUntil(ai: RivalAI, p: Perception, pred: () => boolean, seconds = 3): boolean {
  for (let i = 0; i < seconds / DT; i++) {
    ai.update(DT, p);
    if (pred()) return true;
  }
  return false;
}

describe('RivalAI', () => {
  it('approaches a distant target, sprinting beyond sprint range', () => {
    const ai = brawler({ aggression: 0 });
    ai.update(DT, perception({ target: { x: 0, y: 50, z: 1000 } }));
    expect(ai.state).toBe('approach');
    expect(ai.intent.z).toBeGreaterThan(0.9);
    expect(ai.intent.sprint).toBe(true);
  });

  it('attacks with a move that fits the range once facing the target', () => {
    const ai = brawler({ aggression: 1 });
    const p = perception({ target: { x: 0, y: 50, z: 40 } });
    expect(runUntil(ai, p, () => ai.combat.claw || ai.combat.stomp || ai.combat.tail)).toBe(true);
    expect(ai.combat.lunge).toBe(false); // lunge is for 90 m+
  });

  it('turns to face before committing', () => {
    const ai = brawler({ aggression: 1, attackFacingDeg: 10 });
    // Target behind: first decision aims, no press on the same tick.
    ai.update(DT, perception({ yaw: Math.PI, target: { x: 0, y: 50, z: 40 } }));
    expect(ai.state).toBe('aim');
    expect(ai.combat.claw || ai.combat.stomp || ai.combat.tail).toBe(false);
    expect(ai.intent.faceYaw).toBeCloseTo(0);
  });

  it('lunges from mid range', () => {
    const ai = brawler({ aggression: 1 });
    const p = perception({ target: { x: 0, y: 50, z: 150 } });
    expect(runUntil(ai, p, () => ai.combat.lunge)).toBe(true);
  });

  it('only decides every reactionDelay seconds', () => {
    const ai = brawler({ aggression: 0, reactionDelay: 1 });
    const p = perception({ target: { x: 0, y: 50, z: 1000 } });
    ai.update(DT, p);
    expect(ai.state).toBe('approach');
    // Target teleports into circling range; the AI keeps its plan until the next decision.
    p.target = { x: 0, y: 50, z: 45 };
    ai.update(DT, p);
    expect(ai.state).toBe('approach');
    expect(runUntil(ai, p, () => ai.state !== 'approach', 1.5)).toBe(true);
  });

  it('ranged rival backs off when the target gets close', () => {
    const ai = ranged({ aggression: 0 });
    ai.update(DT, perception({ target: { x: 0, y: 50, z: 80 } }));
    expect(ai.state).toBe('retreat');
    expect(ai.intent.z).toBeLessThan(0);
    expect(ai.intent.faceYaw).toBeCloseTo(0); // keeps facing the target
  });

  it('ranged rival circles at preferred range', () => {
    const ai = ranged({ aggression: 0 });
    ai.update(DT, perception({ target: { x: 0, y: 50, z: RIVALS.vesperion.ai.preferredRange } }));
    expect(ai.state).toBe('circle');
    expect(Math.abs(ai.intent.x)).toBeGreaterThan(0.5);
  });

  it('holds the beam until the charge target, then releases', () => {
    const ai = ranged();
    ai.update(DT, perception({ charging: true, charge: 0.3 }));
    expect(ai.combat.beamHeld).toBe(true);
    ai.update(DT, perception({ charging: true, charge: RIVALS.vesperion.ai.beamChargeTarget }));
    expect(ai.combat.beamHeld).toBe(false);
  });

  it('does nothing while busy (stunned, mid-move)', () => {
    const ai = brawler({ aggression: 1 });
    ai.update(DT, perception({ busy: true, target: { x: 0, y: 50, z: 40 } }));
    expect(ai.state).toBe('busy');
    expect(ai.intent.x === 0 && ai.intent.z === 0).toBe(true);
    expect(ai.combat.claw).toBe(false);
  });

  it('skips attacks on cooldown', () => {
    const ai = brawler({ aggression: 1 });
    const p = perception({ target: { x: 0, y: 50, z: 40 }, canStart: () => false });
    for (let i = 0; i < 120; i++) {
      ai.update(DT, p);
      expect(ai.combat.claw || ai.combat.stomp || ai.combat.tail).toBe(false);
    }
  });
});
