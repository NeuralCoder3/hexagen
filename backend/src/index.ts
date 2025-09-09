import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

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
      // Return template hexagon image
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
        // If no template exists, create a simple SVG hexagon
        const svgHexagon = createSVGHexagon(xNum, yNum);
        res.setHeader('Content-Type', 'image/svg+xml');
        res.send(svgHexagon);
      }
    }
  } catch (error) {
    console.error('Error serving hexagon:', error);
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
