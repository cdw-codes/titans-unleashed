import { describe, expect, it } from 'vitest';
import { StateMachine } from './StateMachine';

type S = 'idle' | 'walk' | 'stagger';

describe('StateMachine', () => {
  it('runs enter/exit hooks and tracks time in state', () => {
    const log: string[] = [];
    const ctx = { speed: 0 };
    const sm = new StateMachine<S, typeof ctx>(
      'idle',
      {
        idle: { enter: () => log.push('enter idle'), exit: () => log.push('exit idle'), update: (c) => (c.speed > 0 ? 'walk' : undefined) },
        walk: { enter: (_c, from) => log.push(`enter walk from ${from}`) },
      },
      ctx,
    );
    sm.update(0.5);
    expect(sm.timeInState).toBeCloseTo(0.5);
    ctx.speed = 1;
    sm.update(0.1);
    expect(sm.state).toBe('walk');
    expect(sm.timeInState).toBe(0);
    expect(log).toEqual(['enter idle', 'exit idle', 'enter walk from idle']);
  });

  it('timed states can exit themselves', () => {
    const sm = new StateMachine<S, null>('stagger', { stagger: { update: (_c, _dt, t) => (t >= 1 ? 'idle' : undefined) } }, null);
    for (let i = 0; i < 59; i++) sm.update(1 / 60);
    expect(sm.state).toBe('stagger');
    sm.update(1 / 30);
    expect(sm.state).toBe('idle');
  });

  it('ignores transitions to the current state', () => {
    let enters = 0;
    const sm = new StateMachine<S, null>('idle', { idle: { enter: () => enters++ } }, null);
    sm.transition('idle');
    expect(enters).toBe(1);
  });
});
