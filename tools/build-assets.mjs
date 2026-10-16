#!/usr/bin/env node
/**
 * Process raw downloads in assets-src/ into game-ready files:
 *  - public/models/cars.glb    13 Kenney cars merged (one scene each), meshopt + WebP
 *  - public/models/tank-a|b.glb Quaternius tanks, meshopt
 *  - public/audio/*            selected sounds; big WAVs downmixed to mono 22.05 kHz
 * Run: npm run assets   (re-run after changing the lists below)
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const SRC = join(root, 'assets-src');
const MODELS = join(root, 'public/models');
const AUDIO = join(root, 'public/audio');
const TMP = join(root, 'node_modules/.cache/build-assets');
for (const d of [MODELS, AUDIO, TMP]) mkdirSync(d, { recursive: true });

const gt = (...args) => execFileSync(join(root, 'node_modules/.bin/gltf-transform'), args, { stdio: ['ignore', 'ignore', 'inherit'] });
const need = (f) => {
  if (!existsSync(join(SRC, f))) throw new Error(`Missing assets-src/${f}`);
  return join(SRC, f);
};

// ------------------------------------------------------------ models
export const CARS = ['sedan', 'sedan-sports', 'hatchback-sports', 'suv', 'suv-luxury', 'taxi', 'police', 'van', 'delivery', 'truck', 'ambulance', 'firetruck', 'garbage-truck'];
const merged = join(TMP, 'cars-merged.glb');
gt('merge', ...CARS.map((c) => need(`${c}.glb`)), merged);
gt('optimize', merged, join(MODELS, 'cars.glb'), '--compress', 'meshopt', '--texture-compress', 'webp', '--simplify', 'false', '--join', 'false', '--instance', 'false', '--flatten', 'false', '--palette', 'false');
console.log('models: cars.glb');

const TANKS = { 'tank-a.glb': 'Tank by Quaternius - Dc4k4CooN3.glb', 'tank-b.glb': 'Tank by Quaternius - j59k7ctnZM.glb' };
for (const [out, src] of Object.entries(TANKS)) {
  gt('optimize', need(src), join(MODELS, out), '--compress', 'meshopt', '--simplify', 'false', '--palette', 'false');
  console.log(`models: ${out}`);
}

// ------------------------------------------------------------ audio
/** dest name → source file. Sources: see docs/ASSETS.md. */
const COPY = {
  // Footsteps / impacts (Kenney Impact Sounds)
  ...range('step', 'impactSoft_heavy_00', 0, 4, 'ogg'),
  ...range('stepsprint', 'impactPunch_heavy_00', 0, 4, 'ogg'),
  ...range('crush', 'impactMetal_heavy_00', 0, 4, 'ogg'),
  ...range('crunch', 'explosionCrunch_00', 0, 4, 'ogg'),
  ...range('hit', 'impactPunch_medium_00', 0, 4, 'ogg'),
  // Creatures (rubberduck CC0 packs)
  ...rangeTwoDigit('rivalroar', 'roar_', 1, 6, 'ogg'),
  ...rangeTwoDigit('hurt', 'hurt_', 1, 5, 'ogg'),
  ...rangeTwoDigit('grunt', 'grunt_', 1, 5, 'ogg'),
  'howl.ogg': 'howl.ogg',
  'stomp.ogg': 'stomp_01.ogg',
  // Explosions / weapons
  ...rangeTwoDigit('bang', 'bang_', 1, 10, 'ogg'),
  ...rangeTwoDigit('cannon', 'cannon_', 1, 5, 'ogg'),
  ...range('rocket', 'thrusterFire_00', 0, 4, 'ogg'),
  ...range('lowboom', 'lowFrequency_explosion_00', 0, 1, 'ogg'),
  ...range('forcefield', 'forceField_00', 0, 4, 'ogg'),
  'helicopter.mp3': 'helicopter.mp3',
  // Beam (Kenney digital SFX + loops)
  ...rangeOne('powerup', 'powerUp', 1, 12, 'mp3'),
  ...rangeOne('phaserdown', 'phaserDown', 1, 3, 'mp3'),
  'beamhum.ogg': 'movingshield_sound.ogg',
  'victory.mp3': 'highUp.mp3',
  'defeat.mp3': 'lowDown.mp3',
  // Music / ambience
  'music-combat.mp3': 'Battle.mp3',
  'ambience-city.ogg': 'busy_cyberworld.ogg',
};
/** WAVs: downmixed to mono and resampled (no ffmpeg available). */
const WAV = {
  'roar.wav': ['monster_roar.wav', 32000],
  'rumble.wav': ['rumble.wav', 22050],
  'beam.wav': ['laserbeam.wav', 32000],
  'music-explore.wav': ['determined_pursuit_loop.wav', 22050],
};

function range(prefix, src, a, b, ext) {
  const o = {};
  for (let i = a; i <= b; i++) o[`${prefix}${i}.${ext}`] = `${src}${i}.${ext}`;
  return o;
}
function rangeTwoDigit(prefix, src, a, b, ext) {
  const o = {};
  for (let i = a; i <= b; i++) o[`${prefix}${i}.${ext}`] = `${src}${String(i).padStart(2, '0')}.${ext}`;
  return o;
}
function rangeOne(prefix, src, a, b, ext) {
  const o = {};
  for (let i = a; i <= b; i++) o[`${prefix}${i}.${ext}`] = `${src}${i}.${ext}`;
  return o;
}

let copied = 0;
const missing = [];
for (const [dest, src] of Object.entries(COPY)) {
  if (!existsSync(join(SRC, src))) {
    missing.push(src);
    continue;
  }
  copyFileSync(join(SRC, src), join(AUDIO, dest));
  copied++;
}
for (const [dest, [src, rate]] of Object.entries(WAV)) {
  if (!existsSync(join(SRC, src))) {
    missing.push(src);
    continue;
  }
  writeFileSync(join(AUDIO, dest), downmixWav(readFileSync(join(SRC, src)), rate));
  copied++;
}
console.log(`audio: ${copied} files${missing.length ? `, missing: ${missing.join(', ')}` : ''}`);
rmSync(TMP, { recursive: true, force: true });

/** PCM/float WAV → mono 16-bit at `rate` (box-filtered resample). */
function downmixWav(buf, rate) {
  let pos = 12;
  let fmt = null;
  let data = null;
  while (pos + 8 <= buf.length) {
    const id = buf.toString('ascii', pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    if (id === 'fmt ') fmt = { format: buf.readUInt16LE(pos + 8), channels: buf.readUInt16LE(pos + 10), rate: buf.readUInt32LE(pos + 12), bits: buf.readUInt16LE(pos + 22) };
    if (id === 'data') data = buf.subarray(pos + 8, pos + 8 + size);
    pos += 8 + size + (size & 1);
  }
  if (!fmt || !data) throw new Error('Unsupported WAV');
  const bytes = fmt.bits / 8;
  const frames = Math.floor(data.length / (bytes * fmt.channels));
  const read = (i) => {
    if (fmt.format === 3 && fmt.bits === 32) return data.readFloatLE(i);
    if (fmt.bits === 16) return data.readInt16LE(i) / 32768;
    if (fmt.bits === 24) return data.readIntLE(i, 3) / 8388608;
    if (fmt.bits === 32) return data.readInt32LE(i) / 2147483648;
    if (fmt.bits === 8) return (data.readUInt8(i) - 128) / 128;
    throw new Error(`Unsupported WAV bit depth ${fmt.bits}`);
  };
  const mono = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let s = 0;
    for (let c = 0; c < fmt.channels; c++) s += read((f * fmt.channels + c) * bytes);
    mono[f] = s / fmt.channels;
  }
  const ratio = fmt.rate / Math.min(rate, fmt.rate);
  const outFrames = Math.floor(frames / ratio);
  const out = Buffer.alloc(44 + outFrames * 2);
  for (let i = 0; i < outFrames; i++) {
    // Average the source frames this output sample covers (cheap low-pass).
    const a = Math.floor(i * ratio);
    const b = Math.max(a + 1, Math.floor((i + 1) * ratio));
    let s = 0;
    for (let j = a; j < b && j < frames; j++) s += mono[j];
    const v = Math.max(-1, Math.min(1, s / (b - a)));
    out.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  const outRate = Math.round(fmt.rate / ratio);
  out.write('RIFF', 0);
  out.writeUInt32LE(36 + outFrames * 2, 4);
  out.write('WAVEfmt ', 8);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(1, 22);
  out.writeUInt32LE(outRate, 24);
  out.writeUInt32LE(outRate * 2, 28);
  out.writeUInt16LE(2, 32);
  out.writeUInt16LE(16, 34);
  out.write('data', 36);
  out.writeUInt32LE(outFrames * 2, 40);
  return out;
}
