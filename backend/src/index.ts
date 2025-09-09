import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Serve static files from images, thumbnails, and templates directories
app.use('/images', express.static(path.join(__dirname, '../images')));
app.use('/thumbnails', express.static(path.join(__dirname, '../thumbnails')));
app.use('/templates', express.static(path.join(__dirname, '../templates')));

// --- Perlin noise implementation (deterministic, no external deps) ---
// Adapted lightweight Perlin noise for 2D
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
    // Simple LCG for reproducible shuffle
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

    // Scale to [0,1]
    return (this.lerp(v, x1, x2) + 1) / 2;
  }
}

// Terrain height function with octaves
const perlin = new Perlin2D(90210);
function getHeightAt(x: number, y: number): number {
  const offset_x = 14;
  const offset_y = 24;
  x += offset_x;
  y += offset_y;
  // Scale world coordinates to noise space
  const baseFrequency = 0.05; // larger -> more roughness
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

  return value / maxAmplitude; // normalize to [0,1]
}

// Map height to biome template file
function getBiomeTemplatePath(height: number): { path: string; contentType: string } | null {
  // thresholds: water < sand < grass < mountain < snow
  const templatesDir = path.join(__dirname, '../templates');
  const entries: Array<{ threshold: number; file: string }> = [
    { threshold: 0.50, file: 'water.png' },
    { threshold: 0.51, file: 'sand.png' },
    // here is gras
    { threshold: 0.60, file: 'gras.png' },
    { threshold: 0.65, file: 'mountain.png' },
    { threshold: 1.75, file: 'snow.png' },
  ];

  for (const entry of entries) {
    if (height <= entry.threshold) {
      const full = path.join(templatesDir, entry.file);
      if (fs.existsSync(full)) {
        return { path: full, contentType: 'image/png' };
      }
      break; // if missing, fall back below
    }
  }
  return null;
}

// Hexagon endpoint
app.get('/api/hexagon/:x/:y', (req, res) => {
  const { x, y } = req.params;
  const { thumbnail } = req.query;
  
  try {
    const xNum = parseInt(x);
    const yNum = parseInt(y);
    
    if (isNaN(xNum) || isNaN(yNum)) {
      return res.status(400).json({ error: 'Invalid coordinates' });
    }
    
    // Check if thumbnail is requested (default behavior)
    if (thumbnail !== 'false') {
      const thumbnailPathJpg = path.join(__dirname, '../thumbnails', `${xNum}_${yNum}.jpg`);
      const thumbnailPathPng = path.join(__dirname, '../thumbnails', `${xNum}_${yNum}.png`);
      const thumbnailPathSvg = path.join(__dirname, '../thumbnails', `${xNum}_${yNum}.svg`);
      
      if (fs.existsSync(thumbnailPathJpg)) {
        res.setHeader('Content-Type', 'image/jpeg');
        return res.sendFile(thumbnailPathJpg);
      } else if (fs.existsSync(thumbnailPathPng)) {
        res.setHeader('Content-Type', 'image/png');
        return res.sendFile(thumbnailPathPng);
      } else if (fs.existsSync(thumbnailPathSvg)) {
        res.setHeader('Content-Type', 'image/svg+xml');
        return res.sendFile(thumbnailPathSvg);
      }
    }
    
    // Check if specific hexagon image exists (try .jpg first, then .png, then .svg)
    const imagePathJpg = path.join(__dirname, '../images', `${xNum}_${yNum}.jpg`);
    const imagePathPng = path.join(__dirname, '../images', `${xNum}_${yNum}.png`);
    const imagePathSvg = path.join(__dirname, '../images', `${xNum}_${yNum}.svg`);
    
    if (fs.existsSync(imagePathJpg)) {
      // Return the specific hexagon JPG image
      res.setHeader('Content-Type', 'image/jpeg');
      res.sendFile(imagePathJpg);
    } else if (fs.existsSync(imagePathPng)) {
      // Return the specific hexagon PNG image
      res.setHeader('Content-Type', 'image/png');
      res.sendFile(imagePathPng);
    } else if (fs.existsSync(imagePathSvg)) {
      // Return the specific hexagon SVG image
      res.setHeader('Content-Type', 'image/svg+xml');
      res.sendFile(imagePathSvg);
    } else {
      // No specific image found: compute biome by Perlin noise and return its template
      const height = getHeightAt(xNum, yNum);
      const biome = getBiomeTemplatePath(height);
      if (biome) {
        res.setHeader('Content-Type', biome.contentType);
        res.sendFile(biome.path);
      } else {
        // Fallback to legacy hexagon template if biome assets are missing
        const templatePathJpg = path.join(__dirname, '../templates', 'hexagon_template.jpg');
        const templatePathPng = path.join(__dirname, '../templates', 'hexagon_template.png');
        const templatePathSvg = path.join(__dirname, '../templates', 'hexagon_template.svg');
        if (fs.existsSync(templatePathJpg)) {
          res.setHeader('Content-Type', 'image/jpeg');
          res.sendFile(templatePathJpg);
        } else if (fs.existsSync(templatePathPng)) {
          res.setHeader('Content-Type', 'image/png');
          res.sendFile(templatePathPng);
        } else if (fs.existsSync(templatePathSvg)) {
          res.setHeader('Content-Type', 'image/svg+xml');
          res.sendFile(templatePathSvg);
        } else {
          const svgHexagon = createSVGHexagon(xNum, yNum);
          res.setHeader('Content-Type', 'image/svg+xml');
          res.send(svgHexagon);
        }
      }
    }
  } catch (error) {
    console.error('Error serving hexagon:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper to resolve a single hex image (thumbnail or full) into a Buffer and content type
async function resolveHexImage(xNum: number, yNum: number, wantThumbnail: boolean): Promise<{ buffer: Buffer; contentType: string } | null> {
  // Thumbnail preference
  if (wantThumbnail) {
    const thumbnailPathJpg = path.join(__dirname, '../thumbnails', `${xNum}_${yNum}.jpg`);
    const thumbnailPathPng = path.join(__dirname, '../thumbnails', `${xNum}_${yNum}.png`);
    const thumbnailPathSvg = path.join(__dirname, '../thumbnails', `${xNum}_${yNum}.svg`);
    if (fs.existsSync(thumbnailPathJpg)) {
      return { buffer: fs.readFileSync(thumbnailPathJpg), contentType: 'image/jpeg' };
    } else if (fs.existsSync(thumbnailPathPng)) {
      return { buffer: fs.readFileSync(thumbnailPathPng), contentType: 'image/png' };
    } else if (fs.existsSync(thumbnailPathSvg)) {
      return { buffer: fs.readFileSync(thumbnailPathSvg), contentType: 'image/svg+xml' };
    }
  }

  // Full image fallback chain
  const imagePathJpg = path.join(__dirname, '../images', `${xNum}_${yNum}.jpg`);
  const imagePathPng = path.join(__dirname, '../images', `${xNum}_${yNum}.png`);
  const imagePathSvg = path.join(__dirname, '../images', `${xNum}_${yNum}.svg`);
  if (fs.existsSync(imagePathJpg)) {
    return { buffer: fs.readFileSync(imagePathJpg), contentType: 'image/jpeg' };
  } else if (fs.existsSync(imagePathPng)) {
    return { buffer: fs.readFileSync(imagePathPng), contentType: 'image/png' };
  } else if (fs.existsSync(imagePathSvg)) {
    return { buffer: fs.readFileSync(imagePathSvg), contentType: 'image/svg+xml' };
  }

  // Procedural biome template
  const height = getHeightAt(xNum, yNum);
  const biome = getBiomeTemplatePath(height);
  if (biome) {
    return { buffer: fs.readFileSync(biome.path), contentType: biome.contentType };
  }

  // Last resort: svg
  const svgHexagon = createSVGHexagon(xNum, yNum);
  return { buffer: Buffer.from(svgHexagon, 'utf8'), contentType: 'image/svg+xml' };
}

// Batch endpoint: fetch many hexes in one request
app.post('/api/hexagons/batch', async (req, res) => {
  try {
    const { coords, thumbnail } = req.body || {};
    if (!Array.isArray(coords)) {
      return res.status(400).json({ error: 'coords must be an array of {x,y}' });
    }

    // Limit to prevent abuse
    const MAX_BATCH = 500;
    const list = coords.slice(0, MAX_BATCH);
    const wantThumbnail = thumbnail !== false;

    const results: Array<{ x: number; y: number; contentType: string; data: string }> = [];
    for (const item of list) {
      const xNum = parseInt(item?.x);
      const yNum = parseInt(item?.y);
      if (Number.isNaN(xNum) || Number.isNaN(yNum)) continue;
      const resolved = await resolveHexImage(xNum, yNum, wantThumbnail);
      if (!resolved) continue;
      const base64 = resolved.buffer.toString('base64');
      results.push({ x: xNum, y: yNum, contentType: resolved.contentType, data: base64 });
    }

    res.json({ items: results });
  } catch (err) {
    console.error('Batch fetch error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper function to create SVG hexagon
function createSVGHexagon(x: number, y: number): string {
  const size = 50;
  const color = `hsl(${(x * 137.5 + y * 89.3) % 360}, 70%, 60%)`;
  
  return `
    <svg width="${size * 2}" height="${size * 2}" xmlns="http://www.w3.org/2000/svg">
      <polygon 
        points="${size},0 ${size * 1.5},${size * 0.866} ${size * 1.5},${size * 1.732} ${size},${size * 2} ${size * 0.5},${size * 1.732} ${size * 0.5},${size * 0.866}" 
        fill="${color}" 
        stroke="#333" 
        stroke-width="2"
      />
      <text x="${size}" y="${size + 5}" text-anchor="middle" font-family="Arial" font-size="12" fill="#333">
        ${x},${y}
      </text>
    </svg>
  `;
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Thumbnail generation endpoint
app.post('/api/generate-thumbnails', async (req, res) => {
  try {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    await execAsync('npm run generate-thumbnails', { cwd: __dirname });
    res.json({ success: true, message: 'Thumbnails generated successfully' });
  } catch (error) {
    console.error('Error generating thumbnails:', error);
    res.status(500).json({ error: 'Failed to generate thumbnails' });
  }
});

// Hexagon cropping endpoint
app.post('/api/crop-hexagons', async (req, res) => {
  try {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    await execAsync('npm run crop-hexagons', { cwd: __dirname });
    res.json({ success: true, message: 'Hexagons cropped successfully' });
  } catch (error) {
    console.error('Error cropping hexagons:', error);
    res.status(500).json({ error: 'Failed to crop hexagons' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
