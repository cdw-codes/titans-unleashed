import { Terrain } from '../world/terrain/Terrain';

/**
 * Top view of the procedural open world (data URL), drawn from a fresh Terrain
 * so it shows the invented layout even while a city map is loaded.
 */
export function openWorldPreview(size: number, range = 11000): string {
  const t = new Terrain();
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const rgb = [0, 0, 0];
  const step = (2 * range) / size;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = -range + (i + 0.5) * step;
      const z = -range + (j + 0.5) * step;
      const h = t.heightAt(x, z);
      const o = (j * size + i) * 4;
      if (h < t.waterLevel) {
        img.data.set([74, 124, 178, 255], o);
        continue;
      }
      t.colorAt(x, z, h, 0, 128, rgb);
      const town = t.urbanWeight(x, z) > 0.99 || t.townEdge(t.island, x, z) < 0;
      const k = 0.85 + Math.min(0.3, h / 900);
      img.data.set(town ? [214, 208, 196, 255] : [rgb[0]! * 255 * k, rgb[1]! * 255 * k, rgb[2]! * 255 * k, 255], o);
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}
