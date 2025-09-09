#!/usr/bin/env tsx

import path from 'path';
import { extractCenterHexagon, DEFAULT_HEX_SIZE, DEFAULT_CANVAS_SIZE } from './utils/extractCenterHexagon';

// Main function
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.log('Usage: tsx extractCenterHexagon.ts <input_image> [output_path] [--hex-size=220] [--canvas-size=512]');
    console.log('Example: tsx extractCenterHexagon.ts coordinate_2_0.png center_hexagon.png');
    console.log('Example: tsx extractCenterHexagon.ts image.png --hex-size=100 --canvas-size=400');
    process.exit(1);
  }
  
  const inputPath = args[0];
  let outputPath = args[1];
  let hexSize = DEFAULT_HEX_SIZE;
  let canvasSize = DEFAULT_CANVAS_SIZE;
  
  // Parse optional arguments
  for (const arg of args.slice(2)) {
    if (arg.startsWith('--hex-size=')) {
      hexSize = parseInt(arg.split('=')[1]);
    } else if (arg.startsWith('--canvas-size=')) {
      canvasSize = parseInt(arg.split('=')[1]);
    }
  }
  
  // Generate output path if not provided
  if (!outputPath) {
    const ext = path.extname(inputPath);
    const base = path.basename(inputPath, ext);
    const dir = path.dirname(inputPath);
    outputPath = path.join(dir, `${base}_center${ext}`);
  }
  
  try {
    await extractCenterHexagon(inputPath, outputPath, hexSize, canvasSize);
    console.log('Center hexagon extraction completed successfully!');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}
