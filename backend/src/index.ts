import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import session from 'express-session';
import crypto from 'crypto';
import { getHeightAt, getBiomeTemplatePath } from './terrain';
import { generateCoordinateImage } from '../scripts/generateCoordinateImage';
import { DEFAULT_HEX_SIZE, DEFAULT_CANVAS_SIZE, extractCenterHexagon } from '../scripts/utils/extractCenterHexagon';
import dotenv from 'dotenv';
import { getHexagonNeighbors, getNeighborsWithinRadiusTwo } from '../scripts/utils/hexGrid';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Trust proxy if behind a reverse proxy (Docker, Nginx, etc.)
app.set('trust proxy', 1);

// Session setup
const SESSION_NAME = process.env.SESSION_NAME || 'hexagen_session';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
app.use(session({
  name: SESSION_NAME,
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: false, // set true behind TLS/https
    maxAge: 7 * 24 * 60 * 60 * 1000
  }
}));

// Resolve backend root that works for both dev (src) and prod (dist/src)
function resolveBackendRoot(currentDir: string): string {
  const candidate = path.resolve(currentDir, '..'); // dev: backend/src -> backend; prod: dist/src -> dist
  const templatesAtCandidate = path.join(candidate, 'templates');
  if (fs.existsSync(templatesAtCandidate)) return candidate;
  // Fallback: go one more up (prod): dist/src -> backend
  return path.resolve(currentDir, '..', '..');
}
const BACKEND_ROOT = resolveBackendRoot(__dirname);
const IMAGES_DIR = path.join(BACKEND_ROOT, 'images');
const THUMBNAILS_DIR = path.join(BACKEND_ROOT, 'thumbnails');
const TEMPLATES_DIR = path.join(BACKEND_ROOT, 'templates');
const METADATA_DIR = path.join(BACKEND_ROOT, 'metadata');
if (!fs.existsSync(METADATA_DIR)) {
  try { fs.mkdirSync(METADATA_DIR, { recursive: true }); } catch {}
}

// Middleware
const CORS_ORIGIN = process.env.CORS_ORIGIN || undefined; // undefined -> reflect request origin if using cors()
app.use(cors({
  origin: CORS_ORIGIN || true,
  credentials: true
}));
app.use(express.json({ limit: '2mb' }));

// Serve static files from images, thumbnails, and templates directories
app.use('/images', express.static(IMAGES_DIR));
app.use('/thumbnails', express.static(THUMBNAILS_DIR));
app.use('/templates', express.static(TEMPLATES_DIR));

// Simple auth helpers
declare module 'express-session' {
  interface SessionData {
    authenticated?: boolean;
    realname?: string;
    username?: string;
    email?: string;
    csrf_token?: string;
    auth_token?: string;
  }
}

function ensureCsrfToken(req: express.Request) {
  if (!req.session.csrf_token) {
    req.session.csrf_token = crypto.randomBytes(16).toString('base64');
  }
}

function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (req.session.authenticated) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

// CMS-like SSO endpoints (simplified)
const CMS_SECRET = process.env.CMS_SECRET || '';
const CMS_ENDPOINT = process.env.CMS_ENDPOINT || '';
const BASEPATH = process.env.BASEPATH || '';

app.get(`${BASEPATH}/login`, (req, res) => {
  console.log(`[auth] GET ${BASEPATH}/login`);
  ensureCsrfToken(req);
  const authToken = crypto.randomBytes(16).toString('base64');
  req.session.auth_token = authToken;
  const nonce = Buffer.from(`${authToken}|${Math.floor(Date.now()/1000) + 16*60}`).toString('base64');
  const payload = Buffer.from(`nonce=${encodeURIComponent(nonce)}`).toString('base64');
  const sig = crypto.createHmac('sha256', CMS_SECRET).update(payload).digest('hex');
  const url = `${CMS_ENDPOINT}?sso=${encodeURIComponent(payload)}&sig=${encodeURIComponent(sig)}`;
  res.redirect(url);
});
// Also provide non-BASEPATH login for convenience
if (BASEPATH) {
  app.get(`/login`, (req, res) => {
    console.log('[auth] GET /login');
    ensureCsrfToken(req);
    const authToken = crypto.randomBytes(16).toString('base64');
    req.session.auth_token = authToken;
    const nonce = Buffer.from(`${authToken}|${Math.floor(Date.now()/1000) + 16*60}`).toString('base64');
    const payload = Buffer.from(`nonce=${encodeURIComponent(nonce)}`).toString('base64');
    const sig = crypto.createHmac('sha256', CMS_SECRET).update(payload).digest('hex');
    const url = `${CMS_ENDPOINT}?sso=${encodeURIComponent(payload)}&sig=${encodeURIComponent(sig)}`;
    res.redirect(url);
  });
}

const handleAuthCallback: express.RequestHandler = (req, res) => {
  console.log('[auth] Auth callback hit', req.query);
  const sso = req.query.sso as string;
  const sig = req.query.sig as string;
  if (!sso || !sig) return res.status(400).send('Invalid request');
  const expected = crypto.createHmac('sha256', CMS_SECRET).update(sso).digest('hex');
  if (sig !== expected) return res.status(400).send('Invalid signature');
  const decoded = Buffer.from(sso, 'base64').toString('utf8');
  const parts = decoded.split('&').map(kv => kv.split('='));
  const map: Record<string, string> = {};
  for (const [k, v] of parts) map[k] = decodeURIComponent(v);
  const [authToken, expiryStr] = Buffer.from(map['nonce'] || '', 'base64').toString('utf8').split('|');
  const expiry = parseInt(expiryStr || '0', 10);
  if (!req.session.auth_token || req.session.auth_token !== authToken) return res.status(400).send('Invalid auth token');
  if (Math.floor(Date.now()/1000) > expiry) return res.status(400).send('Token expired');
  req.session.authenticated = true;
  req.session.realname = map['name'];
  req.session.username = map['username'];
  req.session.email = map['email'];
  console.log(`[auth] User logged in: username=${req.session.username || ''} email=${req.session.email || ''} at ${new Date().toISOString()} from ip=${req.ip}`);
  res.redirect(BASEPATH || '/');
};

app.get(`${BASEPATH}/auth_cb`, handleAuthCallback);
// Also provide non-BASEPATH callback route
if (BASEPATH) {
  app.get('/auth_cb', handleAuthCallback);
}

app.post(`${BASEPATH}/logout`, (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// Auth status endpoint
app.get('/api/auth/status', (req, res) => {
  res.json({ authenticated: !!req.session?.authenticated });
});

// Check if tile can be generated here (adjacency rule)
app.get('/api/hexagon/:x/:y/can-generate', (req, res) => {
  const xNum = parseInt(req.params.x as string);
  const yNum = parseInt(req.params.y as string);
  if (Number.isNaN(xNum) || Number.isNaN(yNum)) {
    return res.status(400).json({ allowed: false, reason: 'Invalid coordinates' });
  }
  // Already exists? Then no need to generate
  const jpg = path.join(IMAGES_DIR, `${xNum}_${yNum}.jpg`);
  const png = path.join(IMAGES_DIR, `${xNum}_${yNum}.png`);
  const svg = path.join(IMAGES_DIR, `${xNum}_${yNum}.svg`);
  if (fs.existsSync(jpg) || fs.existsSync(png) || fs.existsSync(svg)) {
    return res.json({ allowed: false, reason: 'Tile already exists' });
  }
  const neighbors = getNeighborsWithinRadiusTwo(xNum, yNum);
  let hasNeighbor = false;
  for (const n of neighbors) {
    const nJpg = path.join(IMAGES_DIR, `${n.x}_${n.y}.jpg`);
    const nPng = path.join(IMAGES_DIR, `${n.x}_${n.y}.png`);
    const nSvg = path.join(IMAGES_DIR, `${n.x}_${n.y}.svg`);
    if (fs.existsSync(nJpg) || fs.existsSync(nPng) || fs.existsSync(nSvg)) {
      hasNeighbor = true;
      break;
    }
  }
  if (!hasNeighbor) {
    return res.json({ allowed: false, reason: 'Tile generation is only allowed adjacent (or one apart) to an existing tile.' });
  }
  return res.json({ allowed: true });
});

// Serve frontend build (optional single-port mode)
if (process.env.SERVE_FRONTEND === '1') {
  const FRONTEND_DIR = path.join(BACKEND_ROOT, 'public');
  if (fs.existsSync(FRONTEND_DIR)) {
    app.use(express.static(FRONTEND_DIR));
    // API is under /api; everything else falls back to index.html
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/images') || req.path.startsWith('/thumbnails') || req.path.startsWith('/templates')) {
        return next();
      }
      const indexPath = path.join(FRONTEND_DIR, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('frontend index not found');
      }
    });
  }
}

// Hexagon endpoint
app.get('/api/hexagon/:x/:y', async (req, res) => {
  const { x, y } = req.params;
  const { thumbnail, checkExists } = req.query;
  
  try {
    const xNum = parseInt(x);
    const yNum = parseInt(y);
    
    if (isNaN(xNum) || isNaN(yNum)) {
      return res.status(400).json({ error: 'Invalid coordinates' });
    }
    
    // Check if specific hexagon image exists (try .jpg first, then .png, then .svg)
    const imagePathJpg = path.join(IMAGES_DIR, `${xNum}_${yNum}.jpg`);
    const imagePathPng = path.join(IMAGES_DIR, `${xNum}_${yNum}.png`);
    const imagePathSvg = path.join(IMAGES_DIR, `${xNum}_${yNum}.svg`);
    
    const hasCustomImage = fs.existsSync(imagePathJpg) || fs.existsSync(imagePathPng) || fs.existsSync(imagePathSvg);
    
    // If checkExists is true, return whether tile exists
    if (checkExists === 'true') {
      return res.json({ exists: hasCustomImage });
    }
    
    // Check if thumbnail is requested (default behavior)
    if (thumbnail !== 'false') {
      const thumbnailPathJpg = path.join(THUMBNAILS_DIR, `${xNum}_${yNum}.jpg`);
      const thumbnailPathPng = path.join(THUMBNAILS_DIR, `${xNum}_${yNum}.png`);
      const thumbnailPathSvg = path.join(THUMBNAILS_DIR, `${xNum}_${yNum}.svg`);
      
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
      
      // Thumbnail doesn't exist, but check if we have a full image to generate thumbnail from
      if (hasCustomImage) {
        console.log(`Thumbnail missing for ${xNum}_${yNum}, generating on-the-fly...`);
        try {
          const { exec } = require('child_process');
          const { promisify } = require('util');
          const execAsync = promisify(exec);
          
          // Determine which full image to use
          let sourceImagePath = null;
          if (fs.existsSync(imagePathJpg)) {
            sourceImagePath = imagePathJpg;
            console.log(`Using JPG source: ${imagePathJpg}`);
          } else if (fs.existsSync(imagePathPng)) {
            sourceImagePath = imagePathPng;
            console.log(`Using PNG source: ${imagePathPng}`);
          } else if (fs.existsSync(imagePathSvg)) {
            sourceImagePath = imagePathSvg;
            console.log(`Using SVG source: ${imagePathSvg}`);
          }
          
          if (sourceImagePath) {
            // Ensure thumbnails directory exists
            if (!fs.existsSync(THUMBNAILS_DIR)) {
              fs.mkdirSync(THUMBNAILS_DIR, { recursive: true });
              console.log('Created thumbnails directory');
            }
            
            const thumbnailPathJpg = path.join(THUMBNAILS_DIR, `${xNum}_${yNum}.jpg`);
            console.log(`Generating thumbnail: ${thumbnailPathJpg}`);
            // Generate thumbnail
            await execAsync(`magick "${sourceImagePath}" -resize 100x100 "${thumbnailPathJpg}"`);
            console.log(`Thumbnail generated successfully: ${thumbnailPathJpg}`);
            
            // Serve the newly generated thumbnail
            res.setHeader('Content-Type', 'image/jpeg');
            return res.sendFile(thumbnailPathJpg);
          } else {
            console.log('No source image found for thumbnail generation');
          }
        } catch (error) {
          console.error('Error generating thumbnail on-the-fly:', error);
          // Fall through to serve full image or biome template
        }
      } else {
        console.log(`No custom image found for ${xNum}_${yNum}, skipping thumbnail generation`);
      }
    }
    
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
        const templatePathJpg = path.join(TEMPLATES_DIR, 'hexagon_template.jpg');
        const templatePathPng = path.join(TEMPLATES_DIR, 'hexagon_template.png');
        const templatePathSvg = path.join(TEMPLATES_DIR, 'hexagon_template.svg');
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
    const thumbnailPathJpg = path.join(THUMBNAILS_DIR, `${xNum}_${yNum}.jpg`);
    const thumbnailPathPng = path.join(THUMBNAILS_DIR, `${xNum}_${yNum}.png`);
    const thumbnailPathSvg = path.join(THUMBNAILS_DIR, `${xNum}_${yNum}.svg`);
    if (fs.existsSync(thumbnailPathJpg)) {
      return { buffer: fs.readFileSync(thumbnailPathJpg), contentType: 'image/jpeg' };
    } else if (fs.existsSync(thumbnailPathPng)) {
      return { buffer: fs.readFileSync(thumbnailPathPng), contentType: 'image/png' };
    } else if (fs.existsSync(thumbnailPathSvg)) {
      return { buffer: fs.readFileSync(thumbnailPathSvg), contentType: 'image/svg+xml' };
    }
    
    // Thumbnail doesn't exist, try to generate on-the-fly
    const imagePathJpg = path.join(IMAGES_DIR, `${xNum}_${yNum}.jpg`);
    const imagePathPng = path.join(IMAGES_DIR, `${xNum}_${yNum}.png`);
    const imagePathSvg = path.join(IMAGES_DIR, `${xNum}_${yNum}.svg`);
    const hasCustomImage = fs.existsSync(imagePathJpg) || fs.existsSync(imagePathPng) || fs.existsSync(imagePathSvg);
    
    if (hasCustomImage) {
      try {
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);
        
        // Determine which full image to use
        let sourceImagePath = null;
        if (fs.existsSync(imagePathJpg)) {
          sourceImagePath = imagePathJpg;
        } else if (fs.existsSync(imagePathPng)) {
          sourceImagePath = imagePathPng;
        } else if (fs.existsSync(imagePathSvg)) {
          sourceImagePath = imagePathSvg;
        }
        
        if (sourceImagePath) {
          // Ensure thumbnails directory exists
          if (!fs.existsSync(THUMBNAILS_DIR)) {
            fs.mkdirSync(THUMBNAILS_DIR, { recursive: true });
          }
          
          const thumbnailPathJpg = path.join(THUMBNAILS_DIR, `${xNum}_${yNum}.jpg`);
          await execAsync(`magick "${sourceImagePath}" -resize 100x100 "${thumbnailPathJpg}"`);
          return { buffer: fs.readFileSync(thumbnailPathJpg), contentType: 'image/jpeg' };
        }
      } catch (error) {
        console.error('Error generating thumbnail on-the-fly:', error);
      }
    }
  }
  
  // Fall back to full image or biome template
  const imagePathJpg = path.join(IMAGES_DIR, `${xNum}_${yNum}.jpg`);
  const imagePathPng = path.join(IMAGES_DIR, `${xNum}_${yNum}.png`);
  const imagePathSvg = path.join(IMAGES_DIR, `${xNum}_${yNum}.svg`);
  if (fs.existsSync(imagePathJpg)) {
    return { buffer: fs.readFileSync(imagePathJpg), contentType: 'image/jpeg' };
  } else if (fs.existsSync(imagePathPng)) {
    return { buffer: fs.readFileSync(imagePathPng), contentType: 'image/png' };
  } else if (fs.existsSync(imagePathSvg)) {
    return { buffer: fs.readFileSync(imagePathSvg), contentType: 'image/svg+xml' };
  }
  
  const height = getHeightAt(xNum, yNum);
  const biomePath = getBiomeTemplatePath(height);
  if (biomePath) {
    return { buffer: fs.readFileSync(biomePath), contentType: 'image/png' };
  }
  
  return null;
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
  const width = size * 2;
  const height = Math.sqrt(3) * size;
  const points: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i + Math.PI / 6;
    const px = size + size * Math.cos(angle);
    const py = height / 2 + size * Math.sin(angle);
    points.push(`${px},${py}`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><polygon points="${points.join(' ')}" fill="hsl(${(x * 50 + y * 20) % 360}, 70%, 60%)" stroke="black" stroke-width="1"/></svg>`;
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

// Generate image for a tile endpoint
app.post('/api/generate-tile', requireAuth, async (req, res) => {
  // Declare variables at function scope for cleanup
  let permanentImagePath: string | null = null;
  let jpgImagePath: string | null = null;
  
  try {
    console.log('Request body:', req.body);
    console.log('Request headers:', req.headers);
    
    const { x, y, prompt } = req.body;
    
    if (x === undefined || x === null || y === undefined || y === null || !prompt) {
      console.log('Missing fields - x:', x, 'y:', y, 'prompt:', prompt);
      return res.status(400).json({ error: 'Missing required fields: x, y, prompt' });
    }
    
    const xNum = parseInt(x);
    const yNum = parseInt(y);
    
    if (isNaN(xNum) || isNaN(yNum)) {
      return res.status(400).json({ error: 'Invalid coordinates' });
    }

    // Enforce adjacency rule: at least one existing filled tile within radius 2
    const neighbors = getNeighborsWithinRadiusTwo(xNum, yNum);
    let hasNeighbor = false;
    for (const n of neighbors) {
      const jpg = path.join(IMAGES_DIR, `${n.x}_${n.y}.jpg`);
      const png = path.join(IMAGES_DIR, `${n.x}_${n.y}.png`);
      const svg = path.join(IMAGES_DIR, `${n.x}_${n.y}.svg`);
      if (fs.existsSync(jpg) || fs.existsSync(png) || fs.existsSync(svg)) {
        hasNeighbor = true;
        break;
      }
    }
    if (!hasNeighbor) {
      return res.status(403).json({ error: 'Tile generation is only allowed adjacent (or one apart) to an existing tile.' });
    }
    
    // Check if tile already exists
    const imagesDir = IMAGES_DIR;
    const imagePathJpg = path.join(imagesDir, `${xNum}_${yNum}.jpg`);
    const imagePathPng = path.join(imagesDir, `${xNum}_${yNum}.png`);
    const imagePathSvg = path.join(imagesDir, `${xNum}_${yNum}.svg`);
    
    if (fs.existsSync(imagePathJpg) || fs.existsSync(imagePathPng) || fs.existsSync(imagePathSvg)) {
      return res.status(409).json({ error: 'Tile already exists' });
    }
    
    // Generate coordinate image for the tile in a permanent location (outside temp dir)
    permanentImagePath = path.join(__dirname, '../coordinate_images', `coordinate_${xNum}_${yNum}.png`);
    
    // Ensure the coordinate_images directory exists
    const coordinateImagesDir = path.dirname(permanentImagePath);
    if (!fs.existsSync(coordinateImagesDir)) {
      fs.mkdirSync(coordinateImagesDir, { recursive: true });
    }
    
    await generateCoordinateImage(xNum, yNum, permanentImagePath);
    
    // Convert PNG to JPG to match curl command format
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    jpgImagePath = permanentImagePath.replace('.png', '.jpg');
    await execAsync(`magick "${permanentImagePath}" "${jpgImagePath}"`);
    
    // Prepare form data for API request
    const FormData = require('form-data');
    const formData = new FormData();
    formData.append('prompt', `${prompt}, isometric, illustration, cell shading`);
    formData.append('model', 'black-forest-labs/flux-krea-dev');
    formData.append('strength', '0.85');
    
    // Add the coordinate image from permanent location (JPG format)
    const imageBuffer = fs.readFileSync(jpgImagePath);
    formData.append('image[]', imageBuffer, `coordinate_${xNum}_${yNum}.jpg`);
    
    // Add mask file (convert to JPG)
    const maskPath = path.join(TEMPLATES_DIR, 'mask.png');
    if (fs.existsSync(maskPath)) {
      const maskJpgPath = path.join(TEMPLATES_DIR, 'mask.jpg');
      try {
        await execAsync(`magick "${maskPath}" "${maskJpgPath}"`);
      } catch (e) {
        console.warn('Mask JPG conversion failed, will try PNG directly:', e);
      }
      let maskFilePath = maskJpgPath;
      try {
        const stat = fs.existsSync(maskJpgPath) ? fs.statSync(maskJpgPath) : null;
        if (!stat || stat.size === 0) {
          console.warn('Mask JPG missing or empty, falling back to PNG');
          maskFilePath = maskPath;
        }
      } catch (e) {
        console.warn('Error checking mask JPG, falling back to PNG:', e);
        maskFilePath = maskPath;
      }
      const maskBuffer = fs.readFileSync(maskFilePath);
      console.log('Mask buffer size:', maskBuffer.length);

      // If configured, send mask as base64 data URI via 'maskImage' (required by some providers)
      if (process.env.USE_MASK_IMAGE_DATA_URI === '1') {
        const ext = path.extname(maskFilePath).toLowerCase();
        const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
        const dataUri = `data:${mime};base64,${maskBuffer.toString('base64')}`;
        formData.append('maskImage', dataUri);
      } else {
        // Default: send as multipart file field used locally
        formData.append('mask[]', maskBuffer, path.basename(maskFilePath));
      }
    }
    
    // Make API request
    const apiKey = process.env.IMAGEROUTER_API_KEY;
    console.log('API Key exists:', !!apiKey);
    console.log('API Key length:', apiKey ? apiKey.length : 0);
    
    if (!apiKey) {
      return res.status(500).json({ error: 'API key not configured' });
    }
    
    console.log('Making API request to imagerouter.io...');
    console.log('Form data fields:');
    console.log('- prompt:', `${prompt}, isometric, illustration, cell shading`);
    console.log('- model:', 'black-forest-labs/flux-krea-dev');
    console.log('- strength:', '0.85');
    console.log('- image file:', `coordinate_${xNum}_${yNum}.jpg`);
    console.log('- mask file:', 'mask.jpg');
    
    const axios = require('axios');
    const response = await axios.post('https://api.imagerouter.io/v1/openai/images/edits', formData, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        ...formData.getHeaders()
      }
    });
    
    console.log('API Response status:', response.status);
    console.log('API Response headers:', response.headers);
    console.log('API Response body:', response.data);
    
    const data = response.data;
    
    // Log the response
    const logPath = path.join(__dirname, '../logs', 'image_generation.log');
    const logDir = path.dirname(logPath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      coordinates: { x: xNum, y: yNum },
      prompt,
      response: data,
      success: response.status >= 200 && response.status < 300
    };
    
    fs.appendFileSync(logPath, JSON.stringify(logEntry) + '\n');
    
    if (response.status >= 400) {
      return res.status(500).json({ error: 'Image generation failed', details: data });
    }
    
    // Download the generated image
    if (data.data && data.data[0] && data.data[0].url) {
      const imageResponse = await fetch(data.data[0].url);
      const imageBuffer = await imageResponse.arrayBuffer();
      
      // Save the image
      let finalImagePath = path.join(imagesDir, `${xNum}_${yNum}_org.png`);
      fs.writeFileSync(finalImagePath, Buffer.from(imageBuffer));

      // Extract center hexagon from the generated image
      try {
        const centerHexPath = path.join(imagesDir, `${xNum}_${yNum}.png`);
        await extractCenterHexagon(finalImagePath, centerHexPath, 2*DEFAULT_HEX_SIZE, 2*DEFAULT_CANVAS_SIZE);
        fs.unlinkSync(finalImagePath);
        finalImagePath = centerHexPath;
        console.log(`Center hexagon extracted to ${centerHexPath}`);
      } catch (extractError) {
        console.error('Error extracting center hexagon:', extractError);
        // Keep the original image if extraction fails
        finalImagePath = path.join(imagesDir, `${xNum}_${yNum}_org.png`);
      }

      // Persist metadata (prompt and creation time)
      try {
        const meta = {
          x: xNum,
          y: yNum,
          prompt,
          createdAt: new Date().toISOString(),
          username: req.session?.username || null
        };
        const metaPath = path.join(METADATA_DIR, `${xNum}_${yNum}.json`);
        fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
      } catch (e) {
        console.warn('Failed to write metadata:', e);
      }
      
      // Generate thumbnail
      try {
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);
        
        const thumbnailPath = path.join(THUMBNAILS_DIR, `${xNum}_${yNum}.jpg`);
        await execAsync(`magick "${finalImagePath}" -resize 100x100 "${thumbnailPath}"`);
        console.log(`Thumbnail generated at ${thumbnailPath}`);
      } catch (thumbnailError) {
        console.error('Error generating thumbnail:', thumbnailError);
      }
      
      // Clean up temp files
      if (permanentImagePath && fs.existsSync(permanentImagePath)) {
        fs.unlinkSync(permanentImagePath);
      }
      if (jpgImagePath && fs.existsSync(jpgImagePath)) {
        fs.unlinkSync(jpgImagePath);
      }
      const maskJpgPath = path.join(TEMPLATES_DIR, 'mask.jpg');
      if (fs.existsSync(maskJpgPath)) {
        fs.unlinkSync(maskJpgPath);
      }
      
      res.json({ 
        success: true, 
        message: 'Image generated successfully',
        coordinates: { x: xNum, y: yNum },
        cost: data.cost,
        latency: data.latency
      });
    } else {
      return res.status(500).json({ error: 'No image URL in response' });
    }
    
  } catch (error) {
    console.error('Error generating tile:', error);
    
    // Clean up temp files on error
    try {
      if (permanentImagePath && fs.existsSync(permanentImagePath)) {
        fs.unlinkSync(permanentImagePath);
      }
      if (jpgImagePath && fs.existsSync(jpgImagePath)) {
        fs.unlinkSync(jpgImagePath);
      }
      const maskJpgPath = path.join(TEMPLATES_DIR, 'mask.jpg');
      if (fs.existsSync(maskJpgPath)) {
        fs.unlinkSync(maskJpgPath);
      }
    } catch (cleanupError) {
      console.error('Error cleaning up temp files:', cleanupError);
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Metadata endpoint for a hexagon
app.get('/api/hexagon/:x/:y/metadata', (req, res) => {
  const { x, y } = req.params as any;
  const xNum = parseInt(x);
  const yNum = parseInt(y);
  if (Number.isNaN(xNum) || Number.isNaN(yNum)) {
    return res.status(400).json({ error: 'Invalid coordinates' });
  }
  const metaPath = path.join(METADATA_DIR, `${xNum}_${yNum}.json`);
  if (!fs.existsSync(metaPath)) {
    return res.status(404).json({ error: 'No metadata' });
  }
  try {
    const json = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    return res.json(json);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to read metadata' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
