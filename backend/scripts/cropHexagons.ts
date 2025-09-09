#!/usr/bin/env tsx

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface CropOptions {
  inputDir: string;
  outputDir: string;
  imageSize: number;
  hexagonSize: number;
}

class HexagonCropper {
  private options: CropOptions;

  constructor(options: CropOptions) {
    this.options = options;
  }

  async cropHexagons(): Promise<void> {
    const { inputDir, outputDir, imageSize, hexagonSize } = this.options;
    
    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Get all image files from input directory
    const files = fs.readdirSync(inputDir).filter(file => 
      /\.(jpg|jpeg|png|svg)$/i.test(file)
    );

    console.log(`Found ${files.length} images to crop`);

    for (const file of files) {
      const inputPath = path.join(inputDir, file);
      const outputPath = path.join(outputDir, file.replace(/\.(jpg|jpeg|png|svg)$/i, '.jpg'));
      
      try {
        await this.cropHexagon(inputPath, outputPath, imageSize, hexagonSize);
        console.log(`✓ Cropped hexagon: ${file}`);
      } catch (error) {
        console.error(`✗ Failed to crop hexagon for ${file}:`, error);
      }
    }

    console.log('Hexagon cropping complete!');
  }

  private async cropHexagon(inputPath: string, outputPath: string, imageSize: number, hexagonSize: number): Promise<void> {
    // Calculate the center and crop area
    const centerX = imageSize / 2;
    const centerY = imageSize / 2;
    const cropSize = hexagonSize;
    
    // Create a mask for the hexagon shape
    const maskPath = path.join("templates", "mask.png");
    
    try {
      // Apply mask and crop
      const command = `magick "${inputPath}" "${maskPath}" -alpha off -compose copyopacity -composite "${outputPath}"`;
      await execAsync(command);
    } catch (error) {
      throw error;
    }
  }

  async cropSingleFile(inputPath: string, outputPath: string): Promise<void> {
    const { imageSize, hexagonSize } = this.options;
    
    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    await this.cropHexagon(inputPath, outputPath, imageSize, hexagonSize);
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage:');
    console.log('  npm run crop-hexagons                        # Crop all hexagons');
    console.log('  npm run crop-hexagon <input> <output>          # Crop single hexagon');
    console.log('');
    console.log('Examples:');
    console.log('  npm run crop-hexagons');
    console.log('  npm run crop-hexagon images/0_0.jpg cropped/0_0.jpg');
    process.exit(1);
  }

  const cropper = new HexagonCropper({
    inputDir: path.join(__dirname, '../images'),
    outputDir: path.join(__dirname, '../cropped'),
    imageSize: 512,
    hexagonSize: 400
  });

  if (args[0] === 'all' || args.length === 0) {
    await cropper.cropHexagons();
  } else if (args.length === 2) {
    const [inputPath, outputPath] = args;
    await cropper.cropSingleFile(inputPath, outputPath);
    console.log(`✓ Cropped hexagon: ${outputPath}`);
  } else {
    console.error('Invalid arguments');
    process.exit(1);
  }
}

// Export for use in other modules
export { HexagonCropper };

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}
