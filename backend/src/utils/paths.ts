import path from 'path';
import fs from 'fs';

/**
 * Resolve backend project root that works for both dev and prod environments
 * 
 * In development:
 * - From src/: goes up to backend/
 * - From scripts/: goes up to backend/
 * 
 * In production (Docker):
 * - From dist/src/: goes up to dist/, then up to backend/
 * - From dist/scripts/: goes up to dist/, then up to backend/
 */
export function resolveBackendRoot(currentDir: string): string {
  // In Docker: currentDir = /app/backend/dist/src or /app/backend/dist/scripts, we want /app/backend
  // In dev: currentDir = /path/to/backend/src or /path/to/backend/scripts, we want /path/to/backend
  
  console.log('resolveBackendRoot: currentDir =', currentDir);
  
  // First try: go up three levels (prod: dist/src/utils -> backend)
  const candidate3 = path.resolve(currentDir, '..', '..', '..');
  const templatesAtCandidate3 = path.join(candidate3, 'templates');
  console.log('candidate3 =', candidate3, 'templates exists:', fs.existsSync(templatesAtCandidate3));
  if (fs.existsSync(templatesAtCandidate3)) {
    console.log('Using candidate3:', candidate3);
    return candidate3;
  }
  
  // Second try: go up two levels (prod: dist/src/scripts -> dist)
  const candidate2 = path.resolve(currentDir, '..', '..');
  const templatesAtCandidate2 = path.join(candidate2, 'templates');
  console.log('candidate2 =', candidate2, 'templates exists:', fs.existsSync(templatesAtCandidate2));
  if (fs.existsSync(templatesAtCandidate2)) {
    console.log('Using candidate2:', candidate2);
    return candidate2;
  }
  
  // Third try: go up one level (dev: src/scripts -> backend; prod: dist/src/scripts -> dist)
  const candidate1 = path.resolve(currentDir, '..');
  const templatesAtCandidate1 = path.join(candidate1, 'templates');
  console.log('candidate1 =', candidate1, 'templates exists:', fs.existsSync(templatesAtCandidate1));
  if (fs.existsSync(templatesAtCandidate1)) {
    console.log('Using candidate1:', candidate1);
    return candidate1;
  }
  
  // Fallback: return the three-levels-up path (should be /app/backend in Docker)
  console.log('Using fallback candidate3:', candidate3);
  return candidate3;
}

/**
 * Get the backend root directory based on the current file's location
 */
export function getBackendRoot(): string {
  return resolveBackendRoot(__dirname);
}

/**
 * Get common directory paths relative to the backend root
 */
export function getBackendPaths(backendRoot?: string): {
  images: string;
  thumbnails: string;
  templates: string;
  metadata: string;
  logs: string;
  coordinateImages: string;
  temp: string;
} {
  const root = backendRoot || getBackendRoot();
  
  return {
    images: path.join(root, 'images'),
    thumbnails: path.join(root, 'thumbnails'),
    templates: path.join(root, 'templates'),
    metadata: path.join(root, 'metadata'),
    logs: path.join(root, 'logs'),
    coordinateImages: path.join(root, 'coordinate_images'),
    temp: path.join(root, 'temp')
  };
}

/**
 * Check if a hexagon image exists (jpg, png, or svg)
 */
export function getHexagonImagePath(x: number, y: number, imagesDir: string): string | null {
  const suffixes = ["jpg", "png", "svg"];
  
  for (const suffix of suffixes) {
    const imagePath = path.join(imagesDir, `${x}_${y}.${suffix}`);
    if (fs.existsSync(imagePath)) return imagePath;
  }
  
  return null;
}

/**
 * Check if a hexagon image exists and return all possible paths
 */
export function getHexagonImagePaths(x: number, y: number, imagesDir: string): {
  jpg: string;
  png: string;
  svg: string;
  exists: boolean;
} {
  const jpg = path.join(imagesDir, `${x}_${y}.jpg`);
  const png = path.join(imagesDir, `${x}_${y}.png`);
  const svg = path.join(imagesDir, `${x}_${y}.svg`);
  
  return {
    jpg,
    png,
    svg,
    exists: fs.existsSync(jpg) || fs.existsSync(png) || fs.existsSync(svg)
  };
}
