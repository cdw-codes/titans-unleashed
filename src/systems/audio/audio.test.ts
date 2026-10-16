import { describe, expect, it } from 'vitest';
import { VoiceLimiter } from './VoiceLimiter';

describe('VoiceLimiter', () => {
  it('steals the oldest voice of the same sound past its cap', () => {
    const v = new VoiceLimiter<'a' | 'b'>(10);
    const a1 = v.start('a', 2, 0).id;
    v.start('a', 2, 1);
    const r = v.start('a', 2, 2);
    expect(r.steal).toEqual([a1]);
    expect(v.count).toBe(2);
  });

  it('steals the oldest voice overall past the global cap', () => {
    const v = new VoiceLimiter<'a' | 'b'>(2);
    const first = v.start('a', 5, 0).id;
    v.start('b', 5, 1);
    expect(v.start('b', 5, 2).steal).toEqual([first]);
  });

  it('frees slots when voices end', () => {
    const v = new VoiceLimiter<'a'>(1);
    const id = v.start('a', 1, 0).id;
    v.remove(id);
    expect(v.start('a', 1, 1).steal).toEqual([]);
  });
});
