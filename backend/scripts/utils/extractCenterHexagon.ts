import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Default constants
export const DEFAULT_HEX_SIZE = 220;
export const DEFAULT_CANVAS_SIZE = 512;

// Extract the center hexagon from any image
export async function extractCenterHexagon(
  inputPath: string, 
  outputPath: string, 
  hexSize: number = DEFAULT_HEX_SIZE, 
  canvasSize: number = DEFAULT_CANVAS_SIZE
): Promise<void> {
  try {
    // Check if input file exists
    if (!fs.existsSync(inputPath)) {
      throw new Error(`Input file does not exist: ${inputPath}`);
    }
    
    // Calculate the center position of the canvas
    const centerX = canvasSize / 2;
    const centerY = canvasSize / 2;
    
    // Calculate the hexagon dimensions
    const hexWidth = 2 * hexSize;
    const hexHeight = 2 * hexSize;
    
    // Calculate the crop area (centered on the canvas)
    const cropX = Math.round(centerX - hexWidth / 2);
    const cropY = Math.round(centerY - hexHeight / 2);
    
    console.log(`Extracting center hexagon from ${inputPath}`);
    console.log(`Canvas size: ${canvasSize}x${canvasSize}, Center: (${centerX}, ${centerY})`);
    console.log(`Hexagon size: ${hexWidth}x${hexHeight}, Crop area: (${cropX}, ${cropY})`);
    
    // Use ImageMagick to crop the center hexagon
    const cropCommand = `magick "${inputPath}" -crop ${hexWidth}x${hexHeight}+${cropX}+${cropY} "${outputPath}"`;
    await execAsync(cropCommand);
    
    console.log(`Center hexagon extracted to ${outputPath}`);
  } catch (error) {
    console.error('Error extracting center hexagon:', error);
    throw error;
  }
}
