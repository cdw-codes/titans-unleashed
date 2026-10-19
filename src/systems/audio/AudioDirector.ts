import * as THREE from 'three';
import type { GameEventBus } from '../../core/events';
import type { Titan } from '../../entities/titan/Titan';
import type { AudioSystem, Voice } from './AudioSystem';
import { terrain } from '../../world/terrain/Terrain';
import { WATER_FX } from '../../config/effects';

export interface AudioDirectorDeps {
  player: Titan;
  camera: THREE.Camera;
  /** Encounter in progress (approach/fight) → combat music. */
  inEncounter(): boolean;
  threatLevel(): number;
  heliPositions(out: { x: number; y: number; z: number }[]): number;
  /** A beam is boiling the water somewhere near. */
  steaming(): boolean;
}

const _p = new THREE.Vector3();
const MAX_HELI_LOOPS = 3;

/**
 * Maps game events and state to sounds: footsteps, destruction, combat, the
 * beam's charge/loop/stop, roars, military fire, explosions, helicopter rotor
 * loops, and explore/combat music. All sound choices live here.
 */
export class AudioDirector {
  private beamVoice: Voice | null = null;
  private beamMode: 'none' | 'charge' | 'fire' = 'none';
  private readonly heliVoices: (Voice | null)[] = [];
  private readonly heliPos: { x: number; y: number; z: number }[] = [];
  private ambience: Voice | null = null;
  private steamVoice: Voice | null = null;

  constructor(
    private readonly audio: AudioSystem,
    events: GameEventBus,
    private readonly d: AudioDirectorDeps,
  ) {
    const at = (x: number, y: number, z: number) => _p.set(x, y, z);
    events.on('titan:footstep', (e) => {
      // In water the splash carries the step; the thud underneath is muffled.
      const wet = e.depth > WATER_FX.minDepth;
      if (e.isPlayer) {
        this.audio.play(e.sprinting ? 'footstepSprint' : 'footstep', undefined, wet ? { volume: 0.35 } : undefined);
        if (wet) this.audio.play('splash');
      } else {
        this.audio.play(wet ? 'rivalSplash' : 'rivalFootstep', at(e.x, Math.max(e.y, terrain.waterLevel), e.z));
      }
    });
    events.on('structure:destroyed', (e) => {
      const pos = at(e.x, terrain.heightAt(e.x, e.z), e.z);
      if (e.size === 'large') this.audio.play(e.height > 60 ? 'collapseLarge' : 'collapseSmall', pos);
      else if (e.size === 'small') this.audio.play('collapseSmall', pos, { volume: 0.5 });
      else this.audio.play('crush', pos, { volume: 0.5 });
    });
    events.on('combat:impact', (e) => {
      if (e.isPlayer) {
        if (e.move === 'claw' || e.move === 'tail' || e.move === 'stomp' || e.move === 'pulse') this.audio.play(e.move);
      }
      if (e.hits > 0) this.audio.play('impact', at(e.x, 20, e.z));
      const wet = terrain.waterLevel - terrain.heightAt(e.x, e.z) > WATER_FX.minDepth;
      if (wet && (e.move === 'stomp' || e.move === 'pulse' || e.move === 'tail')) this.audio.play('splashBig', at(e.x, terrain.waterLevel, e.z));
    });
    events.on('titan:roar', (e) => {
      if (e.isPlayer) this.audio.play('roar');
      else this.audio.play('rivalRoar', at(e.x, 80, e.z));
    });
    events.on('titan:hurt', (e) => {
      if (e.isPlayer && e.reaction === 'knockdown') this.audio.play('knockdown');
    });
    events.on('player:damaged', () => this.audio.play('playerHit'));
    events.on('encounter:event', (e) => {
      if (e.type === 'warn') {
        this.audio.play('warning');
        this.audio.play('rivalRoar', at(e.x, 80, e.z), { volume: 0.7 });
      } else if (e.type === 'victory') this.audio.play('victory');
      else if (e.type === 'playerDefeated') this.audio.play('defeat');
    });
    events.on('military:fire', (e) => this.audio.play(e.kind === 'tank' ? 'tankFire' : 'rocketFire', at(e.x, e.y, e.z)));
    events.on('fx:explosion', (e) => this.audio.play(e.size > 0.8 ? 'explosionBig' : 'explosion', at(e.x, e.y, e.z)));
  }

  update(): void {
    const a = this.audio;
    if (!a.ready) return;
    a.updateListener(this.d.camera);
    const steaming = this.d.steaming();
    if (steaming && !this.steamVoice) this.steamVoice = a.play('steam');
    else if (!steaming && this.steamVoice) {
      a.stop(this.steamVoice, 0.3);
      this.steamVoice = null;
    }
    this.updateBeam();
    this.updateHelis();
    a.setMusic(this.d.inEncounter() || this.d.threatLevel() >= 3 ? 'musicCombat' : 'musicExplore');
    if (!this.ambience) this.ambience = a.play('ambienceCity');
  }

  private updateBeam(): void {
    const p = this.d.player;
    const mode = p.state === 'beamCharge' ? 'charge' : p.combat.isBeamFiring ? 'fire' : 'none';
    if (mode === 'charge' && this.beamVoice) {
      // The charge whine rises with the charge.
      this.beamVoice.source.playbackRate.value = 0.8 + 0.6 * p.combat.charge;
    }
    if (mode === this.beamMode) return;
    if (this.beamVoice) this.audio.stop(this.beamVoice, 0.1);
    this.beamVoice = null;
    if (this.beamMode === 'fire' && mode === 'none') this.audio.play('beamStop');
    if (mode === 'charge') this.beamVoice = this.audio.play('beamCharge', undefined, { pitch: 0.8 });
    if (mode === 'fire') this.beamVoice = this.audio.play('beamLoop');
    this.beamMode = mode;
  }

  private updateHelis(): void {
    const n = Math.min(MAX_HELI_LOOPS, this.d.heliPositions(this.heliPos));
    for (let i = 0; i < MAX_HELI_LOOPS; i++) {
      const v = this.heliVoices[i] ?? null;
      if (i < n) {
        const pos = this.heliPos[i]!;
        if (v) this.audio.moveVoice(v, pos);
        else this.heliVoices[i] = this.audio.play('heliLoop', pos);
      } else if (v) {
        this.audio.stop(v, 0.5);
        this.heliVoices[i] = null;
      }
    }
  }
}
