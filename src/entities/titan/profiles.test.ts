import { describe, expect, it } from 'vitest';
import { COMBAT } from '../../config/combat';
import { TITAN_BODY, TITAN_MOVEMENT } from '../../config/titan';
import { bodyFor, combatFor, movementFor, multipliersFor, RATING_BUDGET, RATING_KEYS, type TitanProfile } from './profiles';
import { ROSTER, specFor } from './roster';

const reference: TitanProfile = {
  height: 100, length: 200, weight: 90000, classification: '', origin: '', abilities: [],
  ratings: { power: 3, armor: 3, speed: 3, agility: 3, beam: 3 },
};

describe('titan profiles', () => {
  it('every specimen spends exactly the rating budget, each rating 1..5', () => {
    for (const t of ROSTER) {
      const r = t.profile.ratings;
      for (const k of RATING_KEYS) {
        expect(r[k], `${t.name} ${k}`).toBeGreaterThanOrEqual(1);
        expect(r[k], `${t.name} ${k}`).toBeLessThanOrEqual(5);
      }
      expect(RATING_KEYS.reduce((sum, k) => sum + r[k], 0), t.name).toBe(RATING_BUDGET);
    }
  });

  it('the reference profile leaves the tuned configs untouched', () => {
    const m = multipliersFor(reference);
    expect(Object.values(m).every((v) => v === 1)).toBe(true);
    expect(bodyFor(TITAN_BODY, reference)).toEqual(TITAN_BODY);
    expect(movementFor(TITAN_MOVEMENT, reference).walkSpeed).toBe(TITAN_MOVEMENT.walkSpeed);
    expect(combatFor(COMBAT, reference).health.maxHealth).toBe(COMBAT.health.maxHealth);
  });

  it('turns ratings and mass into trade-offs', () => {
    const tank = { ...reference, weight: 160000, ratings: { power: 4, armor: 5, speed: 1, agility: 2, beam: 3 } };
    const c = combatFor(COMBAT, tank);
    expect(c.health.maxHealth).toBeGreaterThan(COMBAT.health.maxHealth);
    expect(c.health.maxPoise).toBeGreaterThan(COMBAT.health.maxPoise);
    expect(c.claw.titanDamage).toBeGreaterThan(COMBAT.claw.titanDamage);
    expect(movementFor(TITAN_MOVEMENT, tank).sprintSpeed).toBeLessThan(TITAN_MOVEMENT.sprintSpeed);
  });

  it('sizes the body and hitbox to the profile height', () => {
    const s = specFor({ titan: 'testudrax', color: 0 });
    const t = ROSTER.find((r) => r.id === 'testudrax')!;
    expect(s.body.height).toBe(t.profile.height);
    expect(s.body.capsuleHalfHeight).toBeLessThan(TITAN_BODY.capsuleHalfHeight);
    expect(s.weight).toBe(t.profile.weight);
  });
});
