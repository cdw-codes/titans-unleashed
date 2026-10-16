import * as THREE from 'three';
import type { GameEventBus } from '../../core/events';
import type { Kaiju } from '../../entities/kaiju/Kaiju';
import type { AudioSystem, Voice } from './AudioSystem';

export interface AudioDirectorDeps {
  player: Kaiju;
  camera: THREE.Camera;
  /** Encounter in progress (approach/fight) → combat music. */
  inEncounter(): boolean;
  threatLevel(): number;
  heliPositions(out: { x: number; y: number; z: number }[]): number;
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

  constructor(
    private readonly audio: AudioSystem,
    events: GameEventBus,
    private readonly d: AudioDirectorDeps,
  ) {
    const at = (x: number, y: number, z: number) => _p.set(x, y, z);
    events.on('kaiju:footstep', (e) => {
      if (e.isPlayer) this.audio.play(e.sprinting ? 'footstepSprint' : 'footstep');
      else this.audio.play('rivalFootstep', at(e.x, 0, e.z));
    });
    events.on('structure:destroyed', (e) => {
      const pos = at(e.x, 0, e.z);
      if (e.size === 'large') this.audio.play(e.height > 60 ? 'collapseLarge' : 'collapseSmall', pos);
      else if (e.size === 'small') this.audio.play('collapseSmall', pos, { volume: 0.5 });
      else this.audio.play('crush', pos, { volume: 0.5 });
    });
    events.on('combat:impact', (e) => {
      if (e.isPlayer) {
        if (e.move === 'claw' || e.move === 'tail' || e.move === 'stomp' || e.move === 'pulse') this.audio.play(e.move);
      }
      if (e.hits > 0) this.audio.play('impact', at(e.x, 20, e.z));
    });
    events.on('kaiju:roar', (e) => {
      if (e.isPlayer) this.audio.play('roar');
      else this.audio.play('rivalRoar', at(e.x, 80, e.z));
    });
    events.on('kaiju:hurt', (e) => {
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
