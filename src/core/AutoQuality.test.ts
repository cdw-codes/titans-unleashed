import { describe, expect, it } from 'vitest';
import { AutoQuality } from './AutoQuality';

const cfg = { budgetMs: 40, windowSeconds: 4, overBudgetFraction: 0.3, settleSeconds: 3 };
const feed = (a: AutoQuality, ms: number, seconds: number) => {
  let dropped = false;
  for (let t = 0; t < seconds * 1000; t += ms) dropped = a.sample(ms) || dropped;
  return dropped;
};

describe('AutoQuality', () => {
  it('keeps quality when frames meet the budget', () => {
    expect(feed(new AutoQuality(cfg), 33, 30)).toBe(false);
  });

  it('steps down when frames are consistently slow', () => {
    expect(feed(new AutoQuality(cfg), 55, 10)).toBe(true);
  });

  it('ignores the settle period and long pauses', () => {
    const a = new AutoQuality(cfg);
    expect(feed(a, 80, 2.9)).toBe(false); // still settling
    expect(a.sample(5000)).toBe(false); // tab switch gap
  });

  it('tolerates occasional spikes', () => {
    const a = new AutoQuality(cfg);
    let dropped = false;
    for (let i = 0; i < 1000; i++) dropped = a.sample(i % 10 === 0 ? 70 : 33) || dropped;
    expect(dropped).toBe(false);
  });
});
