#!/usr/bin/env tsx

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface ThumbnailOptions {
  inputDir: string;
  outputDir: string;
  thumbnailSize: number;
  imageSize: number;
}

class ThumbnailGenerator {
  private options: ThumbnailOptions;

  constructor(options: ThumbnailOptions) {
    this.options = options;
  }

  async generateThumbnails(): Promise<void> {
    const { inputDir, outputDir, thumbnailSize } = this.options;
    
    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Get all image files from input directory
    const files = fs.readdirSync(inputDir).filter(file => 
      /\.(jpg|jpeg|png|svg)$/i.test(file)
    );

    console.log(`Found ${files.length} images to process`);

    for (const file of files) {
      const inputPath = path.join(inputDir, file);
      const outputPath = path.join(outputDir, file.replace(/\.(jpg|jpeg|png|svg)$/i, '.jpg'));
      
      try {
        await this.createThumbnail(inputPath, outputPath, thumbnailSize);
        console.log(`✓ Created thumbnail: ${file}`);
      } catch (error) {
        console.error(`✗ Failed to create thumbnail for ${file}:`, error);
      }
    }

    console.log('Thumbnail generation complete!');
  }

  private async createThumbnail(inputPath: string, outputPath: string, size: number): Promise<void> {
    // Use ImageMagick to create thumbnail
    const command = `magick "${inputPath}" -resize ${size}x${size} "${outputPath}"`;
    
    try {
      await execAsync(command);
    } catch (error) {
      throw new Error(`ImageMagick failed: ${error}`);
    }
  }

  async generateThumbnailForFile(inputPath: string, outputPath: string): Promise<void> {
    const { thumbnailSize } = this.options;
    
    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    await this.createThumbnail(inputPath, outputPath, thumbnailSize);
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage:');
    console.log('  npm run generate-thumbnails                    # Generate all thumbnails');
    console.log('  npm run generate-thumbnail <input> <output>      # Generate single thumbnail');
    console.log('');
    console.log('Examples:');
    console.log('  npm run generate-thumbnails');
    console.log('  npm run generate-thumbnail images/0_0.jpg thumbnails/0_0.jpg');
    process.exit(1);
  }

  const generator = new ThumbnailGenerator({
    inputDir: path.join(__dirname, '../images'),
    outputDir: path.join(__dirname, '../thumbnails'),
    thumbnailSize: 100,
    imageSize: 512
  });

  if (args[0] === 'all' || args.length === 0) {
    await generator.generateThumbnails();
  } else if (args.length === 2) {
    const [inputPath, outputPath] = args;
    await generator.generateThumbnailForFile(inputPath, outputPath);
    console.log(`✓ Created thumbnail: ${outputPath}`);
  } else {
    console.error('Invalid arguments');
    process.exit(1);
  }
}

// Export for use in other modules
export { ThumbnailGenerator };

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}
