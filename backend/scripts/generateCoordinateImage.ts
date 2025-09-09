import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Import terrain functions from the main backend
import { getHeightAt, getBiomeTemplatePath } from '../src/terrain';
import { HexagonCropper } from './cropHexagons';

// Get hexagon image path (specific image, biome template, or fallback)
function getHexagonImagePath(x: number, y: number, noise: boolean): string {
const suffixes = ["jpg", "png", "svg"];
  const imagesDir = path.join(__dirname, '../images');
  const templatesDir = path.join(__dirname, '../templates');
  
  // Check for specific hexagon image
  for (const suffix of suffixes) {
    const imagePath = path.join(imagesDir, `${x}_${y}.${suffix}`);
    if (fs.existsSync(imagePath)) return imagePath;
  }
  
  // Use biome template
  const height = getHeightAt(x, y);
  const biomePath = getBiomeTemplatePath(height, noise && "noise");
  if (biomePath) return biomePath;
  
  // Fallback to generic template
  for (const suffix of suffixes) {
    const templatePath = path.join(templatesDir, `hexagon_template.${suffix}`);
    if (fs.existsSync(templatePath)) return templatePath;
  }
  
  throw new Error(`No image found for hexagon ${x},${y}`);
}

// Calculate hexagon positions (matching frontend logic)
function getHexagonPosition(x: number, y: number, size: number = 100): { x: number; y: number } {
  const hexX = x * size * 1.0;
  const hexY = y * size * Math.sqrt(3) * 1.36 + (x % 2) * size * Math.sqrt(3) * 0.680;
  return { x: hexX, y: hexY };
}

// Get the 6 neighbors of a hexagon (correct hexagonal grid neighbors)
function getHexagonNeighbors(x: number, y: number): Array<{ x: number; y: number }> {
  const neighbors: Array<{ x: number; y: number }> = [];
  
  // Hexagonal grid neighbors - proper hex grid layout
  neighbors.push({ x: x + 1, y: y });     // East
  neighbors.push({ x: x - 1, y: y });     // West
  neighbors.push({ x: x-2, y: y });     // North
  neighbors.push({ x: x+2, y: y });     // South
  neighbors.push({ x: x + 1, y: y - 1 }); // Northeast
  neighbors.push({ x: x - 1, y: y + 1 }); // Southwest
  
  return neighbors;
}

// Generate coordinate image
async function generateCoordinateImage(centerX: number, centerY: number, outputPath: string): Promise<void> {
  const hexSize = 220; // Base hexagon size (matches frontend baseHexSize)
  const canvasSize = 512;
  
  // Create temporary directory for intermediate files
  const tempDir = path.join(__dirname, '../temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  // Start with white background
  let currentImage = path.join(tempDir, 'current.png');
  await execAsync(`magick -size ${canvasSize}x${canvasSize} xc:white PNG32:"${currentImage}"`);
  
  // Get center hexagon position (using same calculation as frontend)
  const centerPos = getHexagonPosition(centerX, centerY, hexSize);
  
  // Calculate offset to center the main hexagon in the canvas
  const offsetX = (canvasSize / 2) - centerPos.x - hexSize;
  const offsetY = (canvasSize / 2) - centerPos.y - hexSize;
  
  // Create cropper instance
  const cropper = new HexagonCropper({
    inputDir: path.join(__dirname, '../images'),
    outputDir: tempDir,
    imageSize: 512,
    hexagonSize: 392
  });

  // Get all hexagons to place (center + neighbors)
  const allHexagons = [{ x: centerX, y: centerY }, ...getHexagonNeighbors(centerX, centerY)];
  
  // Place each hexagon
  for (const hex of allHexagons) {
    const hexPos = getHexagonPosition(hex.x, hex.y, hexSize);
    const hexImagePath = getHexagonImagePath(hex.x, hex.y, (hex.x == centerX && hex.y == centerY));
    
    // Calculate final position on canvas
    const finalX = hexPos.x + offsetX;
    const finalY = hexPos.y + offsetY;
    
    // Only place if within reasonable canvas bounds
    if (finalX >= -hexSize * 2 && finalX <= canvasSize + hexSize * 2 && 
        finalY >= -hexSize * 2 && finalY <= canvasSize + hexSize * 2) {
      
      // Crop the hexagon image first
      const croppedHex = path.join(tempDir, `cropped_${hex.x}_${hex.y}.png`);
      await cropper.cropSingleFile(hexImagePath, croppedHex);
      
      // Resize cropped hexagon image to proper size
      const tempHex = path.join(tempDir, `hex_${hex.x}_${hex.y}.png`);
      await execAsync(`magick "${croppedHex}" -resize ${hexSize * 2}x${hexSize * 2} "${tempHex}"`);
      
      // Composite onto current image
      const nextImage = path.join(tempDir, `next_${hex.x}_${hex.y}.png`);
      await execAsync(`magick "${currentImage}" "${tempHex}" -geometry +${Math.round(finalX)}+${Math.round(finalY)} -composite "${nextImage}"`);
      
      // Update current image
      currentImage = nextImage;
    }
  }
  
  // Copy final result to output path
  await execAsync(`magick "${currentImage}" "${outputPath}"`);
  
  // Clean up temporary files
  try {
    const tempFiles = fs.readdirSync(tempDir);
    for (const file of tempFiles) {
      const filePath = path.join(tempDir, file);
      fs.unlinkSync(filePath);
    }
    fs.rmdirSync(tempDir);
    console.log('Cleaned up temporary files');
  } catch (error) {
    console.warn('Warning: Could not clean up temporary files:', error);
  }
  
  console.log(`Generated coordinate image for ${centerX},${centerY} at ${outputPath}`);
}

// Main function
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('Usage: tsx generateCoordinateImage.ts <x> <y> [output_path]');
    console.log('Example: tsx generateCoordinateImage.ts 0 0 coordinate_0_0.png');
    process.exit(1);
  }
  
  const x = parseInt(args[0]);
  const y = parseInt(args[1]);
  const outputPath = args[2] || `coordinate_${x}_${y}.png`;
  
  if (isNaN(x) || isNaN(y)) {
    console.error('Invalid coordinates. Please provide valid numbers for x and y.');
    process.exit(1);
  }
  
  try {
    await generateCoordinateImage(x, y, outputPath);
    console.log('Coordinate image generated successfully!');
  } catch (error) {
    console.error('Error generating coordinate image:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { generateCoordinateImage };
