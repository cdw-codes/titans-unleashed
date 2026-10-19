import { describe, expect, it } from 'vitest';
import { ENCOUNTERS } from '../../config/encounters';
import { EncounterSystem } from '../../systems/encounters/EncounterSystem';
import { designFor, parseChoice, ROSTER } from './roster';

describe('titan roster', () => {
  it('parses the choice from the URL, falling back to the default', () => {
    expect(parseChoice('?titan=vesperion&color=3')).toEqual({ titan: 'vesperion', color: 3 });
    expect(parseChoice('?titan=nope&color=99')).toEqual({ titan: 'tidecaller', color: 0 });
    expect(parseChoice('?titan=thornmaw&color=-1')).toEqual({ titan: 'thornmaw', color: 0 });
  });

  it('applies the colorway to the design', () => {
    const t = ROSTER[1]!;
    const d = designFor({ titan: t.id, color: 2 });
    expect(d.palette).toEqual(t.colors[2]!.palette);
    expect(d.glowColor).toBe(t.colors[2]!.glow);
    expect(d.back).toBe(t.design.back);
  });

  it('keeps the player’s look-alike out of the rival rotation', () => {
    const e = new EncounterSystem({ ...ENCOUNTERS, rotation: ['thornmaw', 'vesperion'] });
    e.excludeRival('thornmaw');
    e.forceStart();
    const warn = e.update(0.1, { score: 0, playerX: 0, playerZ: 0, rivalX: 0, rivalZ: 0, playerDefeated: false, rivalDefeated: false, hiddenDistance: 2000, maxX: Infinity });
    expect(warn[0]).toMatchObject({ type: 'warn', rival: 'vesperion' });
  });
});
