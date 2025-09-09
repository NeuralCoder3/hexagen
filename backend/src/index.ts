import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { getHeightAt, getBiomeTemplatePath } from './terrain';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Serve static files from images, thumbnails, and templates directories
app.use('/images', express.static(path.join(__dirname, '../images')));
app.use('/thumbnails', express.static(path.join(__dirname, '../thumbnails')));
app.use('/templates', express.static(path.join(__dirname, '../templates')));

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
      const biomePath = getBiomeTemplatePath(height);
      if (biomePath) {
        res.setHeader('Content-Type', 'image/png');
        res.sendFile(biomePath);
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
      const biomePath = getBiomeTemplatePath(height);
      if (biomePath) {
        return { buffer: fs.readFileSync(biomePath), contentType: 'image/png' };
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
