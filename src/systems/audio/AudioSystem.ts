import * as THREE from 'three';
import { AUDIO, type AudioConfig, type Bus, type SoundId } from '../../config/audio';
import { VoiceLimiter } from './VoiceLimiter';

export interface Voice {
  readonly id: number;
  readonly sound: SoundId;
  readonly source: AudioBufferSourceNode;
  readonly gain: GainNode;
  readonly panner: PannerNode | null;
}

const _fwd = new THREE.Vector3();
const _up = new THREE.Vector3();

/**
 * Web Audio engine: buses (sfx / music / ambience) under a master gain,
 * positional voices via PannerNodes with the listener on the camera, per-sound
 * and global voice limits, random pitch variation. Sounds without files (or
 * whose files are missing) are skipped silently, so the game runs without audio.
 */
export class AudioSystem {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly buses = new Map<Bus, GainNode>();
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly voices = new Map<number, Voice>();
  private readonly limiter: VoiceLimiter<SoundId>;
  private loading: Promise<void> | null = null;
  private music: { id: SoundId; voice: Voice } | null = null;

  constructor(private readonly cfg: AudioConfig = AUDIO) {
    this.limiter = new VoiceLimiter(cfg.maxVoices);
  }

  get ready(): boolean {
    return this.ctx !== null;
  }

  get loadedCount(): number {
    return this.buffers.size;
  }

  /** Must be called from a user gesture (browsers block audio until then). */
  unlock(): void {
    if (!this.ctx) {
      const ctx = new AudioContext();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.cfg.master;
      // Gentle limiting so stacked explosions don't clip.
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -10;
      comp.ratio.value = 6;
      this.master.connect(comp).connect(ctx.destination);
      for (const bus of ['sfx', 'music', 'ambience'] as Bus[]) {
        const g = ctx.createGain();
        g.gain.value = this.cfg.buses[bus];
        g.connect(this.master);
        this.buses.set(bus, g);
      }
      this.loading = this.preload();
    }
    void this.ctx.resume();
  }

  setPaused(paused: boolean): void {
    if (!this.ctx) return;
    void (paused ? this.ctx.suspend() : this.ctx.resume());
  }

  /** Has at least one file loaded for this sound? */
  has(id: SoundId): boolean {
    return this.cfg.sounds[id].files.some((f) => this.buffers.has(f));
  }

  play(id: SoundId, pos?: THREE.Vector3Like, opts: { volume?: number; pitch?: number } = {}): Voice | null {
    const ctx = this.ctx;
    const def = this.cfg.sounds[id];
    if (!ctx || ctx.state !== 'running') return null;
    const files = def.files.filter((f) => this.buffers.has(f));
    if (!files.length) return null;
    const buffer = this.buffers.get(files[Math.floor(Math.random() * files.length)]!)!;

    const { id: vid, steal } = this.limiter.start(id, def.maxInstances, ctx.currentTime);
    for (const s of steal) this.stop(s, 0.05);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = def.loop ?? false;
    source.playbackRate.value = opts.pitch ?? def.pitchMin + Math.random() * (def.pitchMax - def.pitchMin);
    const gain = ctx.createGain();
    gain.gain.value = def.volume * (opts.volume ?? 1);
    let panner: PannerNode | null = null;
    if (def.spatial && pos) {
      panner = ctx.createPanner();
      panner.panningModel = 'equalpower';
      panner.distanceModel = 'inverse';
      panner.refDistance = this.cfg.refDistance;
      panner.maxDistance = this.cfg.maxDistance;
      panner.rolloffFactor = this.cfg.rolloff;
      panner.positionX.value = pos.x;
      panner.positionY.value = pos.y;
      panner.positionZ.value = pos.z;
      source.connect(gain).connect(panner).connect(this.buses.get(def.bus)!);
    } else {
      source.connect(gain).connect(this.buses.get(def.bus)!);
    }
    const voice: Voice = { id: vid, sound: id, source, gain, panner };
    this.voices.set(vid, voice);
    source.onended = () => {
      this.voices.delete(vid);
      this.limiter.remove(vid);
    };
    source.start();
    return voice;
  }

  stop(voiceOrId: Voice | number, fade = 0.15): void {
    const v = typeof voiceOrId === 'number' ? this.voices.get(voiceOrId) : voiceOrId;
    if (!v || !this.ctx) return;
    const t = this.ctx.currentTime;
    v.gain.gain.setTargetAtTime(0, t, Math.max(0.01, fade / 3));
    v.source.stop(t + fade);
    this.voices.delete(v.id);
    this.limiter.remove(v.id);
  }

  moveVoice(v: Voice, pos: THREE.Vector3Like): void {
    if (!v.panner) return;
    v.panner.positionX.value = pos.x;
    v.panner.positionY.value = pos.y;
    v.panner.positionZ.value = pos.z;
  }

  /** Crossfade to a music track (or silence). */
  setMusic(id: SoundId | null): void {
    if (this.music?.id === id) return;
    if (this.music) this.stop(this.music.voice, this.cfg.musicFade);
    this.music = null;
    if (!id || !this.ctx) return;
    const v = this.play(id, undefined, { volume: 0.0001 });
    if (!v) return;
    v.gain.gain.setTargetAtTime(this.cfg.sounds[id].volume, this.ctx.currentTime, this.cfg.musicFade / 3);
    this.music = { id, voice: v };
  }

  /** Listener follows the camera every frame. */
  updateListener(camera: THREE.Camera): void {
    const l = this.ctx?.listener;
    if (!l) return;
    camera.getWorldDirection(_fwd);
    _up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    const p = camera.position;
    l.positionX.value = p.x;
    l.positionY.value = p.y;
    l.positionZ.value = p.z;
    l.forwardX.value = _fwd.x;
    l.forwardY.value = _fwd.y;
    l.forwardZ.value = _fwd.z;
    l.upX.value = _up.x;
    l.upY.value = _up.y;
    l.upZ.value = _up.z;
  }

  private async preload(): Promise<void> {
    const files = new Set(Object.values(this.cfg.sounds).flatMap((s) => s.files));
    await Promise.all([...files].map((f) => this.loadFile(f)));
    if (import.meta.env.DEV) console.info(`[audio] loaded ${this.buffers.size}/${files.size} files`);
  }

  private async loadFile(file: string): Promise<void> {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}audio/${file}`);
      if (!res.ok || res.headers.get('content-type')?.includes('text/html')) return;
      const buf = await this.ctx!.decodeAudioData(await res.arrayBuffer());
      this.buffers.set(file, buf);
    } catch {
      // Missing or undecodable: that sound stays silent.
    }
  }

  get loadingDone(): Promise<void> {
    return this.loading ?? Promise.resolve();
  }
}
