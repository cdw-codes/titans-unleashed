import { describe, expect, it } from 'vitest';
import { SlotAllocator } from './SlotAllocator';

describe('SlotAllocator', () => {
  it('allocates sequentially and reuses freed slots', () => {
    const a = new SlotAllocator();
    expect([a.alloc(), a.alloc(), a.alloc()]).toEqual([0, 1, 2]);
    a.free(1);
    expect(a.alloc()).toBe(1);
    expect(a.highWater).toBe(3);
    expect(a.used).toBe(3);
  });

  it('shrinks the high-water mark when the tail is freed', () => {
    const a = new SlotAllocator();
    for (let i = 0; i < 5; i++) a.alloc();
    a.free(3);
    a.free(4);
    expect(a.highWater).toBe(3);
    expect(a.alloc()).toBe(3);
  });

  it('rejects invalid frees', () => {
    const a = new SlotAllocator();
    expect(() => a.free(0)).toThrow();
  });
});
