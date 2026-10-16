import { describe, expect, it } from 'vitest';
import { ENCOUNTERS } from '../../config/encounters';
import { constrainToCircle, EncounterSystem, type EncounterAction, type EncounterWorld } from './EncounterSystem';

const world = (over: Partial<EncounterWorld> = {}): EncounterWorld => ({
  score: 0, playerX: 0, playerZ: 0, rivalX: 1000, rivalZ: 0, playerDefeated: false, rivalDefeated: false, ...over,
});

function run(e: EncounterSystem, seconds: number, w: EncounterWorld): EncounterAction[] {
  const all: EncounterAction[] = [];
  for (let i = 0; i < Math.round(seconds * 10); i++) all.push(...e.update(0.1, w));
  return all;
}

describe('EncounterSystem', () => {
  it('warns after the first delay, with tremors, then spawns the first rival at distance', () => {
    const e = new EncounterSystem(ENCOUNTERS, () => 0.25);
    expect(run(e, ENCOUNTERS.firstDelay - 1, world())).toEqual([]);
    const actions = run(e, 1 + ENCOUNTERS.warningSeconds + 0.2, world());
    expect(actions[0]).toMatchObject({ type: 'warn', rival: ENCOUNTERS.rotation[0] });
    expect(actions.filter((a) => a.type === 'tremor').length).toBeGreaterThanOrEqual(3);
    const spawn = actions.find((a) => a.type === 'spawn');
    expect(spawn).toBeDefined();
    if (spawn?.type === 'spawn') {
      const d = Math.hypot(spawn.x, spawn.z);
      expect(d).toBeGreaterThanOrEqual(ENCOUNTERS.spawnDistance - ENCOUNTERS.spawnJitter);
    }
    expect(e.phase).toBe('approaching');
  });

  it('triggers early on enough destruction', () => {
    const e = new EncounterSystem(ENCOUNTERS);
    expect(e.update(0.1, world({ score: ENCOUNTERS.destructionThreshold }))[0]?.type).toBe('warn');
  });

  it('raises the barrier when the kaiju close in, centered between them', () => {
    const e = new EncounterSystem(ENCOUNTERS);
    e.forceStart();
    run(e, ENCOUNTERS.warningSeconds + 0.5, world());
    const actions = e.update(0.1, world({ rivalX: 200, rivalZ: 0 }));
    expect(actions[0]).toMatchObject({ type: 'barrierUp', x: 100, z: 0 });
    expect(e.phase).toBe('arena');
    expect(e.arena.active).toBe(true);
  });

  it('forces the barrier if the approach takes too long', () => {
    const e = new EncounterSystem(ENCOUNTERS);
    e.forceStart();
    run(e, ENCOUNTERS.warningSeconds + 0.5, world());
    const actions = run(e, ENCOUNTERS.maxApproachSeconds + 0.5, world({ rivalX: 900 }));
    expect(actions.some((a) => a.type === 'barrierUp')).toBe(true);
  });

  it('victory: outro, then roaming again with the next rival in rotation', () => {
    const e = new EncounterSystem(ENCOUNTERS);
    e.forceStart();
    run(e, ENCOUNTERS.warningSeconds + 0.5, world());
    e.update(0.1, world({ rivalX: 100 }));
    expect(e.update(0.1, world({ rivalX: 100, rivalDefeated: true }))[0]).toMatchObject({ type: 'victory' });
    const end = run(e, ENCOUNTERS.outroSeconds + 0.2, world({ rivalX: 100, rivalDefeated: true }));
    expect(end.find((a) => a.type === 'end')).toMatchObject({ victory: true });
    expect(e.phase).toBe('roaming');
    expect(e.arena.active).toBe(false);
    e.forceStart();
    expect(e.update(0.1, world())[0]).toMatchObject({ type: 'warn', rival: ENCOUNTERS.rotation[1] });
  });

  it('player defeat ends the encounter without victory', () => {
    const e = new EncounterSystem(ENCOUNTERS);
    e.forceStart();
    run(e, ENCOUNTERS.warningSeconds + 0.5, world());
    expect(e.update(0.1, world({ playerDefeated: true }))[0]).toMatchObject({ type: 'playerDefeated' });
    const end = run(e, ENCOUNTERS.outroSeconds + 0.2, world({ playerDefeated: true }));
    expect(end.find((a) => a.type === 'end')).toMatchObject({ victory: false });
  });

  it('resets the destruction trigger after an encounter', () => {
    const e = new EncounterSystem(ENCOUNTERS);
    e.forceStart();
    run(e, ENCOUNTERS.warningSeconds + 0.5, world());
    e.update(0.1, world({ playerDefeated: true }));
    run(e, ENCOUNTERS.outroSeconds + 0.2, world({ score: 9000 }));
    expect(e.update(0.1, world({ score: 9000 }))).toEqual([]);
  });
});

describe('constrainToCircle', () => {
  it('leaves inside points alone and projects outside points onto the edge', () => {
    const p = { x: 10, z: 0 };
    expect(constrainToCircle(p, 0, 0, 50)).toBe(false);
    const q = { x: 100, z: 0 };
    expect(constrainToCircle(q, 0, 0, 50)).toBe(true);
    expect(q).toEqual({ x: 50, z: 0 });
  });
});
