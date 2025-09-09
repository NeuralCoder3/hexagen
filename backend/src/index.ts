import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { getHeightAt, getBiomeTemplatePath } from './terrain';
import { generateCoordinateImage } from '../scripts/generateCoordinateImage';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

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
    const imagePathJpg = path.join(__dirname, '../images', `${xNum}_${yNum}.jpg`);
    const imagePathPng = path.join(__dirname, '../images', `${xNum}_${yNum}.png`);
    const imagePathSvg = path.join(__dirname, '../images', `${xNum}_${yNum}.svg`);
    
    const hasCustomImage = fs.existsSync(imagePathJpg) || fs.existsSync(imagePathPng) || fs.existsSync(imagePathSvg);
    
    // If checkExists is true, return whether tile exists
    if (checkExists === 'true') {
      return res.json({ exists: hasCustomImage });
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
            const thumbnailsDir = path.join(__dirname, '../thumbnails');
            if (!fs.existsSync(thumbnailsDir)) {
              fs.mkdirSync(thumbnailsDir, { recursive: true });
              console.log('Created thumbnails directory');
            }
            
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
    
    // Thumbnail doesn't exist, try to generate on-the-fly
    const imagePathJpg = path.join(__dirname, '../images', `${xNum}_${yNum}.jpg`);
    const imagePathPng = path.join(__dirname, '../images', `${xNum}_${yNum}.png`);
    const imagePathSvg = path.join(__dirname, '../images', `${xNum}_${yNum}.svg`);
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
          const thumbnailsDir = path.join(__dirname, '../thumbnails');
          if (!fs.existsSync(thumbnailsDir)) {
            fs.mkdirSync(thumbnailsDir, { recursive: true });
          }
          
          // Generate thumbnail
          await execAsync(`magick "${sourceImagePath}" -resize 100x100 "${thumbnailPathJpg}"`);
          
          // Return the newly generated thumbnail
          return { buffer: fs.readFileSync(thumbnailPathJpg), contentType: 'image/jpeg' };
        }
      } catch (error) {
        console.error(`Error generating thumbnail for ${xNum}_${yNum}:`, error);
        // Fall through to serve full image
      }
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

// Generate image for a tile endpoint
app.post('/api/generate-tile', async (req, res) => {
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
    
    // Check if tile already exists
    const imagesDir = path.join(__dirname, '../images');
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
    const maskPath = path.join(__dirname, '../templates', 'mask.png');
    if (fs.existsSync(maskPath)) {
      const maskJpgPath = path.join(__dirname, '../templates', 'mask.jpg');
      await execAsync(`magick "${maskPath}" "${maskJpgPath}"`);
      const maskBuffer = fs.readFileSync(maskJpgPath);
      formData.append('mask[]', maskBuffer, 'mask.jpg');
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
      const finalImagePath = path.join(imagesDir, `${xNum}_${yNum}.png`);
      fs.writeFileSync(finalImagePath, Buffer.from(imageBuffer));
      
      // Generate thumbnail
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      const thumbnailPath = path.join(__dirname, '../thumbnails', `${xNum}_${yNum}.jpg`);
      await execAsync(`magick "${finalImagePath}" -resize 100x100 "${thumbnailPath}"`);
      
      // Clean up temp files
      if (permanentImagePath && fs.existsSync(permanentImagePath)) {
        fs.unlinkSync(permanentImagePath);
      }
      if (jpgImagePath && fs.existsSync(jpgImagePath)) {
        fs.unlinkSync(jpgImagePath);
      }
      const maskJpgPath = path.join(__dirname, '../templates', 'mask.jpg');
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
      const maskJpgPath = path.join(__dirname, '../templates', 'mask.jpg');
      if (fs.existsSync(maskJpgPath)) {
        fs.unlinkSync(maskJpgPath);
      }
    } catch (cleanupError) {
      console.error('Error cleaning up temp files:', cleanupError);
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
