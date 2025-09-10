import fs from 'fs';
import path from 'path';

// Resolve backend root that works for both dev (src) and prod (dist/src)
function resolveBackendRoot(currentDir: string): string {
  const candidate = path.resolve(currentDir, '..');
  const templatesAtCandidate = path.join(candidate, 'templates');
  if (fs.existsSync(templatesAtCandidate)) return candidate;
  return path.resolve(currentDir, '..', '..');
}
const BACKEND_ROOT = resolveBackendRoot(__dirname);

// Perlin noise implementation
class Perlin2D {
  private permutation: number[];
  private p: number[];

  constructor(seed: number = 1337) {
    this.permutation = this.generatePermutation(seed);
    this.p = new Array(512);
    for (let i = 0; i < 512; i++) {
      this.p[i] = this.permutation[i % 256];
    }
  }

  private generatePermutation(seed: number): number[] {
    const perm = Array.from({ length: 256 }, (_, i) => i);
    let s = seed >>> 0;
    const rand = () => (s = (s * 1664525 + 1013904223) >>> 0) / 0xffffffff;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [perm[i], perm[j]] = [perm[j], perm[i]];
    }
    return perm;
  }

  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  private lerp(t: number, a: number, b: number): number {
    return a + t * (b - a);
  }

  private grad(hash: number, x: number, y: number): number {
    const h = hash & 3;
    const u = h < 2 ? x : y;
    const v = h < 2 ? y : x;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  noise(x: number, y: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);

    const u = this.fade(xf);
    const v = this.fade(yf);

    const aa = this.p[this.p[X] + Y];
    const ab = this.p[this.p[X] + Y + 1];
    const ba = this.p[this.p[X + 1] + Y];
    const bb = this.p[this.p[X + 1] + Y + 1];

    const x1 = this.lerp(
      u,
      this.grad(aa, xf, yf),
      this.grad(ba, xf - 1, yf)
    );
    const x2 = this.lerp(
      u,
      this.grad(ab, xf, yf - 1),
      this.grad(bb, xf - 1, yf - 1)
    );

    return (this.lerp(v, x1, x2) + 1) / 2;
  }
}

// Terrain height function with octaves
const perlin = new Perlin2D(90210);
export function getHeightAt(x: number, y: number): number {
  const offset_x = 14;
  const offset_y = 24;
  x += offset_x;
  y += offset_y;
  
  const baseFrequency = 0.05;
  let amplitude = 1;
  let frequency = baseFrequency;
  let maxAmplitude = 0;
  let value = 0;
  const octaves = 4;
  const persistence = 0.5;

  for (let i = 0; i < octaves; i++) {
    value += perlin.noise(x * frequency, y * frequency) * amplitude;
    maxAmplitude += amplitude;
    amplitude *= persistence;
    frequency *= 2;
  }

  return value / maxAmplitude;
}

// Map height to biome template file
export function getBiomeTemplatePath(height: number, folder: string | undefined = undefined): string | null {
  const subFolder = folder || 'templates';
  const templatesDir = path.join(BACKEND_ROOT, subFolder);
  const entries: Array<{ threshold: number; file: string }> = [
    { threshold: 0.50, file: 'water.png' },
    { threshold: 0.51, file: 'sand.png' },
    { threshold: 0.60, file: 'gras.png' },
    { threshold: 0.65, file: 'mountain.png' },
    { threshold: 1.75, file: 'snow.png' },
  ];

  for (const entry of entries) {
    if (height <= entry.threshold) {
      const full = path.join(templatesDir, entry.file);
      if (fs.existsSync(full)) {
        return full;
      }
      break;
    }
  }
  return null;
}
