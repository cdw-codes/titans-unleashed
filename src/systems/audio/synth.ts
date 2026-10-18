/**
 * Placeholder sounds generated in code (no files). Each recipe renders mono
 * samples; AudioSystem wraps them in AudioBuffers at load time and uses them
 * for any sound whose files are missing. Pure (no Web Audio), so it is tested.
 */
export type SynthId =
  | 'thud' | 'crunch' | 'rumble' | 'boom' | 'whoosh' | 'roar' | 'growl'
  | 'charge' | 'hum' | 'zapDown' | 'pulse' | 'cannon' | 'rocket' | 'rotor'
  | 'fanfare' | 'lament' | 'padMusic' | 'drumMusic' | 'wind';

export interface SynthResult {
  readonly samples: Float32Array;
  readonly sampleRate: number;
}

const RATE = 22050;
const TAU = Math.PI * 2;

/** Deterministic noise so placeholder sounds are the same every load. */
function noiseGen(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  };
}

/** One-pole low-pass with a cutoff (Hz) that may change per sample. */
function lowpass(): (x: number, cutoff: number) => number {
  let y = 0;
  return (x, cutoff) => {
    const a = 1 - Math.exp((-TAU * cutoff) / RATE);
    y += a * (x - y);
    return y;
  };
}

const env = (t: number, attack: number, decay: number): number => (t < attack ? t / attack : Math.exp(-(t - attack) / decay));

function render(seconds: number, fn: (t: number, i: number) => number): Float32Array {
  const n = Math.floor(seconds * RATE);
  const out = new Float32Array(n);
  let peak = 1e-6;
  for (let i = 0; i < n; i++) {
    out[i] = fn(i / RATE, i);
    peak = Math.max(peak, Math.abs(out[i]!));
  }
  // Normalize to -1 dBFS so recipes don't need hand-tuned gains.
  const g = 0.89 / peak;
  for (let i = 0; i < n; i++) out[i]! *= g;
  return out;
}

/** Crossfade the tail into the head so the buffer loops without a click. */
function makeLoop(s: Float32Array, fadeSeconds: number): Float32Array {
  const f = Math.floor(fadeSeconds * RATE);
  const out = s.slice(0, s.length - f);
  for (let i = 0; i < f; i++) {
    const k = i / f;
    out[i] = out[i]! * k + s[s.length - f + i]! * (1 - k);
  }
  return out;
}

const RECIPES: Record<SynthId, () => Float32Array> = {
  // Heavy footfall: a falling sub sine plus a dull noise slap.
  thud: () => {
    const n = noiseGen(1);
    const lp = lowpass();
    let ph = 0;
    return render(0.7, (t) => {
      ph += (TAU * (75 - 40 * Math.min(1, t / 0.25))) / RATE;
      return Math.sin(ph) * env(t, 0.005, 0.18) + lp(n(), 400) * env(t, 0.002, 0.05) * 1.5;
    });
  },
  // Concrete breaking: crackling grains over filtered noise.
  crunch: () => {
    const n = noiseGen(2);
    const lp = lowpass();
    return render(1.1, (t) => {
      const grain = n() > 0.992 ? 3 : 0;
      return (lp(n(), 1800 - t * 1200) + n() * grain * 0.3) * env(t, 0.01, 0.3);
    });
  },
  // Long low rumble for big collapses and tremors.
  rumble: () => {
    const n = noiseGen(3);
    const lp = lowpass();
    const lp2 = lowpass();
    return render(3, (t) => lp2(lp(n(), 140), 90) * (t < 0.4 ? t / 0.4 : Math.exp(-(t - 0.4) / 1.1)) * (1 + 0.3 * Math.sin(t * 9)));
  },
  boom: () => {
    const n = noiseGen(4);
    const lp = lowpass();
    let ph = 0;
    return render(1.8, (t) => {
      ph += (TAU * (55 - 25 * Math.min(1, t))) / RATE;
      return lp(n(), 2500 * Math.exp(-t * 3) + 120) * env(t, 0.003, 0.35) + Math.sin(ph) * env(t, 0.005, 0.5) * 0.8;
    });
  },
  whoosh: () => {
    const n = noiseGen(5);
    const lp = lowpass();
    const hp = lowpass();
    return render(0.8, (t) => {
      const cut = 300 + 2200 * Math.sin(Math.PI * Math.min(1, t / 0.6));
      const x = lp(n(), cut);
      return (x - hp(x, 150)) * Math.sin(Math.PI * Math.min(1, t / 0.8));
    });
  },
  // Monster roar: detuned saws with vibrato through a slowly opening filter, plus breath.
  roar: () => {
    const n = noiseGen(6);
    const lp = lowpass();
    const lp2 = lowpass();
    let a = 0;
    let b = 0;
    return render(2.6, (t) => {
      const f = 72 + 14 * Math.sin(t * 2.1) + 6 * Math.sin(t * 31);
      a = (a + f / RATE) % 1;
      b = (b + (f * 1.51) / RATE) % 1;
      const saw = (a * 2 - 1) + 0.6 * (b * 2 - 1) + n() * 0.5;
      const shape = t < 0.35 ? t / 0.35 : t < 1.9 ? 1 : Math.max(0, 1 - (t - 1.9) / 0.7);
      return lp2(lp(saw, 500 + 700 * shape), 1400) * shape;
    });
  },
  growl: () => {
    const n = noiseGen(7);
    const lp = lowpass();
    let a = 0;
    return render(0.5, (t) => {
      a = (a + (130 - 50 * t) / RATE) % 1;
      return lp(a * 2 - 1 + n() * 0.6, 900) * env(t, 0.02, 0.15);
    });
  },
  // Beam charge: rising tone with shimmer.
  charge: () => {
    let ph = 0;
    let ph2 = 0;
    return render(1.4, (t) => {
      const f = 180 + 700 * (t / 1.4) ** 2;
      ph += (TAU * f) / RATE;
      ph2 += (TAU * f * 2.01) / RATE;
      return (Math.sin(ph) + 0.35 * Math.sin(ph2)) * Math.min(1, t / 0.2) * (0.6 + 0.4 * (t / 1.4));
    });
  },
  // Beam loop: steady low hum with a beating overtone.
  hum: () => {
    const n = noiseGen(8);
    const lp = lowpass();
    return makeLoop(render(2.2, (t) => Math.sin(TAU * 110 * t) + 0.5 * Math.sin(TAU * 221 * t) + 0.3 * Math.sin(TAU * 333 * t) + lp(n(), 2000) * 0.4), 0.2);
  },
  zapDown: () => {
    let ph = 0;
    return render(0.7, (t) => {
      ph += (TAU * (700 * Math.exp(-t * 4) + 60)) / RATE;
      return Math.sin(ph) * env(t, 0.005, 0.25);
    });
  },
  pulse: () => {
    const n = noiseGen(9);
    const lp = lowpass();
    let ph = 0;
    return render(1.6, (t) => {
      ph += (TAU * (90 + 300 * Math.exp(-t * 5))) / RATE;
      return (Math.sin(ph) * 0.8 + lp(n(), 900) * 0.6) * env(t, 0.01, 0.45);
    });
  },
  cannon: () => {
    const n = noiseGen(10);
    const lp = lowpass();
    return render(0.9, (t) => lp(n(), 3000 * Math.exp(-t * 8) + 200) * env(t, 0.001, 0.12));
  },
  rocket: () => {
    const n = noiseGen(11);
    const lp = lowpass();
    return render(0.9, (t) => lp(n(), 1600) * env(t, 0.03, 0.35));
  },
  // Helicopter loop: noise chopped at the blade rate.
  rotor: () => {
    const n = noiseGen(12);
    const lp = lowpass();
    return makeLoop(render(2.1, (t) => lp(n(), 700) * (0.35 + 0.65 * Math.max(0, Math.sin(TAU * 11 * t)) ** 3)), 0.1);
  },
  fanfare: () => arpeggio([261.6, 329.6, 392, 523.3], 0.22),
  lament: () => arpeggio([392, 311.1, 261.6, 196], 0.32),
  // Exploring music: slow minor pad chords (A minor → F → C → G), 16 s loop.
  padMusic: () => {
    const chords = [[220, 261.6, 329.6], [174.6, 220, 261.6], [130.8, 196, 261.6], [196, 246.9, 293.7]];
    return makeLoop(render(16.5, (t) => {
      const c = chords[Math.floor(t / 4) % 4]!;
      const local = t % 4;
      const swell = Math.min(1, local / 1.2) * Math.min(1, (4 - local) / 0.8 + 0.3);
      let s = 0;
      for (const f of c) s += Math.sin(TAU * f * t) + 0.3 * Math.sin(TAU * f * 2.003 * t);
      return s * swell + 0.4 * Math.sin(TAU * (c[0]! / 2) * t);
    }), 0.5);
  },
  // Combat music: pounding low drums with a driving ostinato, 8 s loop.
  drumMusic: () => {
    const n = noiseGen(13);
    const lp = lowpass();
    const notes = [110, 110, 130.8, 110, 98, 98, 123.5, 98];
    return makeLoop(render(8.25, (t) => {
      const beat = t % 0.5;
      let ph = 0;
      ph = TAU * (60 - 30 * Math.min(1, beat / 0.15)) * beat;
      const kick = Math.sin(ph) * Math.exp(-beat * 9);
      const off = (t + 0.25) % 0.5;
      const snare = lp(n(), 1500) * Math.exp(-off * 18) * 0.6;
      const note = notes[Math.floor(t / 1) % notes.length]!;
      const osti = (((t * note) % 1) * 2 - 1) * 0.25 * (0.6 + 0.4 * Math.exp(-(t % 0.25) * 6));
      return kick * 1.2 + snare + osti;
    }), 0.25);
  },
  // Ambience: soft, slowly gusting wind.
  wind: () => {
    const n = noiseGen(14);
    const lp = lowpass();
    const lp2 = lowpass();
    return makeLoop(render(8.4, (t) => lp2(lp(n(), 500 + 300 * Math.sin(t * 0.7)), 600) * (0.6 + 0.4 * Math.sin(t * 0.45))), 0.4);
  },
};

function arpeggio(freqs: number[], step: number): Float32Array {
  return render(step * freqs.length + 1.2, (t) => {
    let s = 0;
    freqs.forEach((f, i) => {
      const lt = t - i * step;
      if (lt > 0) s += (Math.sin(TAU * f * lt) + 0.25 * Math.sin(TAU * f * 2 * lt)) * env(lt, 0.01, 0.5);
    });
    return s;
  });
}

const cache = new Map<SynthId, SynthResult>();

/** Render (once) and return a placeholder sound. */
export function synthesize(id: SynthId): SynthResult {
  let r = cache.get(id);
  if (!r) {
    r = { samples: RECIPES[id](), sampleRate: RATE };
    cache.set(id, r);
  }
  return r;
}

export const SYNTH_IDS = Object.keys(RECIPES) as SynthId[];
