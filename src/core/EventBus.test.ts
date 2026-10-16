import { describe, expect, it, vi } from 'vitest';
import { EventBus } from './EventBus';

interface TestEvents {
  hit: { damage: number };
  pause: boolean;
}

describe('EventBus', () => {
  it('delivers typed payloads to subscribers', () => {
    const bus = new EventBus<TestEvents>();
    const fn = vi.fn();
    bus.on('hit', fn);
    bus.emit('hit', { damage: 5 });
    expect(fn).toHaveBeenCalledWith({ damage: 5 });
  });

  it('unsubscribes via the returned disposer', () => {
    const bus = new EventBus<TestEvents>();
    const fn = vi.fn();
    const off = bus.on('pause', fn);
    off();
    bus.emit('pause', true);
    expect(fn).not.toHaveBeenCalled();
  });

  it('tolerates handlers unsubscribing during emit', () => {
    const bus = new EventBus<TestEvents>();
    const second = vi.fn();
    const off = bus.on('pause', () => off());
    bus.on('pause', second);
    bus.emit('pause', false);
    expect(second).toHaveBeenCalledOnce();
  });
});
