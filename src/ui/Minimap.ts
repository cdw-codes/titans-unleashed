import type { LoadedChunk } from '../world/city/ChunkManager';
import { ROAD_COLOR } from '../world/city/CityGenerator';
import { terrain } from '../world/terrain/Terrain';

export interface MinimapState {
  playerX: number;
  playerZ: number;
  /** Camera yaw (0 = camera at +Z looking -Z); the map is heading-up. */
  cameraYaw: number;
  chunks: Iterable<LoadedChunk>;
  chunkSize: number;
  rival: { x: number; z: number; yaw: number } | null;
  arena: { x: number; z: number; radius: number } | null;
  units: (cb: (kind: 'tank' | 'heli', x: number, z: number) => void) => void;
}

/**
 * Heading-up radar (bottom right): terrain (water, forest, fields), streets,
 * buildings (wrecked ones darker), arena ring, rival and military. Redrawn a few
 * times per second; each chunk's ground is baked once into a tiny image.
 */
export class Minimap {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private timer = 0;
  private readonly px: number;
  private readonly groundImages = new WeakMap<LoadedChunk, HTMLCanvasElement>();

  constructor(parent: HTMLElement, private readonly range = 900, size = 190) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.px = size * dpr;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'minimap';
    this.canvas.width = this.canvas.height = this.px;
    this.canvas.style.width = this.canvas.style.height = `${size}px`;
    this.ctx = this.canvas.getContext('2d')!;
    parent.appendChild(this.canvas);
  }

  set visible(v: boolean) {
    this.canvas.style.display = v ? '' : 'none';
  }

  update(dt: number, s: MinimapState): void {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.12;
    this.draw(s);
  }

  private draw(s: MinimapState): void {
    const g = this.ctx;
    const n = this.px;
    const c = n / 2;
    const scale = c / this.range;
    // World (dx, dz) → map: heading up. Camera looks along th = yaw + PI.
    const th = s.cameraYaw + Math.PI;
    const cos = Math.cos(th);
    const sin = Math.sin(th);
    const toMap = () => g.setTransform(-cos * scale, -sin * scale, sin * scale, -cos * scale, c, c);

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, n, n);
    g.save();
    g.beginPath();
    g.arc(c, c, c - 2, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = 'rgba(12, 18, 22, 0.78)';
    g.fillRect(0, 0, n, n);

    toMap();
    const R = this.range;
    const ox = s.playerX;
    const oz = s.playerZ;

    // Ground and streets. (`s.chunks` may be a one-shot iterator: walk it once.)
    const chunks = [...s.chunks];
    const S = s.chunkSize;
    g.imageSmoothingEnabled = true;
    g.fillStyle = 'rgba(255, 255, 255, 0.1)';
    for (const chunk of chunks) {
      const x0 = chunk.cx * S - ox;
      const z0 = chunk.cz * S - oz;
      if (Math.abs(x0 + S / 2) > R * 1.5 + S || Math.abs(z0 + S / 2) > R * 1.5 + S) continue;
      g.drawImage(this.groundImage(chunk), x0, z0, S, S);
      for (const f of chunk.spec.flats) {
        if (f.color !== ROAD_COLOR) continue;
        if (!f.rotY) {
          g.fillRect(f.x - ox - f.sx / 2, f.z - oz - f.sz / 2, f.sx, f.sz);
          continue;
        }
        // Real-map roads run at any angle.
        g.save();
        g.translate(f.x - ox, f.z - oz);
        g.rotate(-f.rotY);
        g.fillRect(-f.sx / 2, -f.sz / 2, f.sx, f.sz);
        g.restore();
      }
    }

    // Buildings.
    for (const chunk of chunks) {
      for (const st of chunk.structures) {
        const sp = st.spec;
        if (sp.size === 'prop') continue;
        const dx = sp.x - ox;
        const dz = sp.z - oz;
        if (Math.abs(dx) > R * 1.5 || Math.abs(dz) > R * 1.5) continue;
        const swap = Math.abs(Math.sin(sp.rotY)) > 0.5;
        const hw = swap ? sp.halfD : sp.halfW;
        const hd = swap ? sp.halfW : sp.halfD;
        g.fillStyle = st.state === 'intact'
          ? sp.size === 'large' ? 'rgba(200, 205, 210, 0.75)' : 'rgba(170, 175, 160, 0.5)'
          : 'rgba(110, 70, 50, 0.6)';
        g.fillRect(dx - hw, dz - hd, hw * 2, hd * 2);
      }
    }

    if (s.arena) {
      g.strokeStyle = 'rgba(111, 214, 255, 0.9)';
      g.lineWidth = 8;
      g.beginPath();
      g.arc(s.arena.x - ox, s.arena.z - oz, s.arena.radius, 0, Math.PI * 2);
      g.stroke();
    }

    // Military.
    s.units((kind, x, z) => {
      g.fillStyle = kind === 'tank' ? '#ffb347' : '#ffe066';
      g.beginPath();
      g.arc(x - ox, z - oz, kind === 'tank' ? 14 : 18, 0, Math.PI * 2);
      g.fill();
    });

    if (s.rival) this.arrow(s.rival.x - ox, s.rival.z - oz, s.rival.yaw, 60, '#ff5a3c');
    this.arrow(0, 0, th, 60, '#ffffff');
    g.restore();

    // Ring and north marker (screen space).
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(c, c, c - 2, 0, Math.PI * 2);
    g.stroke();
    // North = world -Z; through the map transform that is (-sin, cos) on screen.
    const sx = c - sin * (c - 14);
    const sy = c + cos * (c - 14);
    g.fillStyle = 'rgba(255, 255, 255, 0.8)';
    g.font = `bold ${Math.round(n / 14)}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('N', sx, sy);
  }

  /** The chunk's ground colors (dimmed) with water in blue, baked once. */
  private groundImage(chunk: LoadedChunk): HTMLCanvasElement {
    let img = this.groundImages.get(chunk);
    if (img) return img;
    const gd = chunk.spec.ground;
    const m = gd.n + 1;
    img = document.createElement('canvas');
    img.width = img.height = m;
    const ctx = img.getContext('2d')!;
    const data = ctx.createImageData(m, m);
    for (let k = 0; k < m * m; k++) {
      const wet = gd.heights[k]! < terrain.waterLevel;
      const o = k * 4;
      data.data[o] = wet ? 40 : gd.colors[k * 3]! * 120;
      data.data[o + 1] = wet ? 90 : gd.colors[k * 3 + 1]! * 120;
      data.data[o + 2] = wet ? 125 : gd.colors[k * 3 + 2]! * 120;
      data.data[o + 3] = 230;
    }
    ctx.putImageData(data, 0, 0);
    this.groundImages.set(chunk, img);
    return img;
  }

  /** Triangle at (dx, dz) pointing along yaw (0 = +Z), in map space. */
  private arrow(dx: number, dz: number, yaw: number, size: number, color: string): void {
    const g = this.ctx;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(dx + fx * size, dz + fz * size);
    g.lineTo(dx - fx * size * 0.6 + fz * size * 0.6, dz - fz * size * 0.6 - fx * size * 0.6);
    g.lineTo(dx - fx * size * 0.6 - fz * size * 0.6, dz - fz * size * 0.6 + fx * size * 0.6);
    g.closePath();
    g.fill();
  }
}
