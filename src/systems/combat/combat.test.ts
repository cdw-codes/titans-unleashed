import { describe, expect, it } from 'vitest';
import { COMBAT } from '../../config/combat';
import { clampBeamAim, Cooldowns, falloffDamage, inArc, movePhase } from './rules';
import { Health } from './Health';

const deg = (d: number) => (d * Math.PI) / 180;

describe('movePhase', () => {
  it('walks through windup, active, recovery, done', () => {
    const m = { windup: 0.2, active: 0.1, recovery: 0.3 };
    expect(movePhase(0, m)).toBe('windup');
    expect(movePhase(0.25, m)).toBe('active');
    expect(movePhase(0.35, m)).toBe('recovery');
    expect(movePhase(0.61, m)).toBe('done');
  });
});

describe('inArc', () => {
  it('hits targets in front within radius', () => {
    expect(inArc(0, 0, 0, 50, 110, 0, 0, 40, 5)).toBe(true);
    expect(inArc(0, 0, 0, 50, 110, 0, 0, 70, 5)).toBe(false);
  });

  it('misses targets behind a front arc but hits them with a rear arc', () => {
    expect(inArc(0, 0, 0, 90, 110, 0, 0, -40, 5)).toBe(false);
    expect(inArc(0, 0, 0, 90, 220, 180, 0, -40, 5)).toBe(true);
  });

  it('respects facing', () => {
    expect(inArc(0, 0, deg(90), 50, 60, 0, 40, 0, 2)).toBe(true);
    expect(inArc(0, 0, deg(90), 50, 60, 0, 0, 40, 2)).toBe(false);
  });

  it('counts large buildings at the arc edge', () => {
    // Center is 70° off-axis (outside a 110° arc) but a 30 m footprint reaches in.
    const x = Math.sin(deg(70)) * 45;
    const z = Math.cos(deg(70)) * 45;
    expect(inArc(0, 0, 0, 50, 110, 0, x, z, 30)).toBe(true);
  });

  it('360° arcs hit everything in range', () => {
    expect(inArc(0, 0, 0, 80, 360, 0, -50, -50, 1)).toBe(true);
  });
});

describe('falloffDamage', () => {
  it('interpolates from full at the center to edgeFalloff at the radius', () => {
    expect(falloffDamage(100, 0, 80, 0.3)).toBe(100);
    expect(falloffDamage(100, 80, 80, 0.3)).toBeCloseTo(30);
    expect(falloffDamage(100, 200, 80, 0.3)).toBeCloseTo(30);
  });
});

describe('Cooldowns', () => {
  it('tracks readiness and remaining fraction', () => {
    const c = new Cooldowns<'stomp'>();
    expect(c.isReady('stomp')).toBe(true);
    c.start('stomp', 4);
    expect(c.isReady('stomp')).toBe(false);
    c.tick(3);
    expect(c.remainingFraction('stomp', 4)).toBeCloseTo(0.25);
    c.tick(1);
    expect(c.isReady('stomp')).toBe(true);
  });
});

describe('beam', () => {
  it('a full beam costs less than max energy', () => {
    expect(COMBAT.beam.maxDuration * COMBAT.beam.energyPerSecond).toBeLessThanOrEqual(100);
  });

  it('clamps aim to the body facing and pitch limits', () => {
    const a = clampBeamAim(deg(90), deg(-80), 0, COMBAT.beam);
    expect(a.yaw).toBeCloseTo(deg(COMBAT.beam.maxYawOffsetDeg));
    expect(a.pitch).toBeCloseTo(deg(COMBAT.beam.minPitchDeg));
  });

  it('beam range stays inside the collider radius', async () => {
    const { CITY } = await import('../../config/city');
    expect(COMBAT.beam.range).toBeLessThanOrEqual(CITY.physicsRadius);
  });
});

describe('Health', () => {
  it('staggers when poise breaks, knocks down on big hits, defeats at 0', () => {
    const h = new Health(COMBAT.health);
    expect(h.hit(60)).toBe('none');
    expect(h.hit(60)).toBe('stagger');
    expect(h.hit(COMBAT.health.knockdownThreshold)).toBe('knockdown');
    expect(h.hit(10000)).toBe('defeated');
    expect(h.isDefeated).toBe(true);
    expect(h.hit(10)).toBe('none');
  });

  it('regenerates health only after a quiet period', () => {
    const h = new Health(COMBAT.health);
    h.hit(200);
    h.update(COMBAT.health.regenDelay! - 1);
    expect(h.health).toBe(COMBAT.health.maxHealth - 200);
    h.update(2);
    expect(h.health).toBeGreaterThan(COMBAT.health.maxHealth - 200);
    h.update(100);
    expect(h.health).toBe(COMBAT.health.maxHealth);
  });

  it('max-health upgrades raise the cap and heal by the gain', () => {
    const h = new Health(COMBAT.health);
    h.hit(100);
    h.setMaxMultiplier(1.25);
    expect(h.max).toBe(COMBAT.health.maxHealth * 1.25);
    expect(h.health).toBe(COMBAT.health.maxHealth * 1.25 - 100);
  });

  it('ignores hits while invulnerable and regenerates poise', () => {
    const h = new Health(COMBAT.health);
    h.makeInvulnerable(1);
    expect(h.hit(500)).toBe('none');
    expect(h.health).toBe(COMBAT.health.maxHealth);
    h.update(1.1);
    h.hit(50);
    h.update(10);
    expect(h.poise).toBe(COMBAT.health.maxPoise);
  });
});
