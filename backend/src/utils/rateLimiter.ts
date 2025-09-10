import fs from 'fs';
import path from 'path';
import { getBackendRoot, getBackendPaths } from './paths';
import dotenv from 'dotenv';

// Load environment variables FIRST, before any other imports
dotenv.config();

// Rate limiting configuration
const RATE_LIMIT_SECONDS = 60;
const EXEMPT_USERNAME = 'Marcel.Ullrich';
const PREVENT_CONCURRENT_GENERATION = process.env.PREVENT_CONCURRENT_GENERATION !== '0'; // Default: true


interface RateLimitEntry {
  username: string;
  lastGeneration: number; // timestamp in milliseconds
}

interface ActiveGeneration {
  username: string;
  startTime: number; // timestamp in milliseconds
  coordinates: { x: number; y: number };
}

// Get rate limit file path
function getRateLimitFilePath(): string {
  const backendRoot = getBackendRoot();
  const paths = getBackendPaths(backendRoot);
  return path.join(paths.logs, 'rate_limits.json');
}

// Get active generations file path
function getActiveGenerationsFilePath(): string {
  const backendRoot = getBackendRoot();
  const paths = getBackendPaths(backendRoot);
  return path.join(paths.logs, 'active_generations.json');
}

// Load rate limit data
function loadRateLimits(): Map<string, RateLimitEntry> {
  const filePath = getRateLimitFilePath();
  const limits = new Map<string, RateLimitEntry>();
  
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      const entries: RateLimitEntry[] = JSON.parse(data);
      entries.forEach(entry => {
        limits.set(entry.username, entry);
      });
    }
  } catch (error) {
    console.warn('Failed to load rate limits:', error);
  }
  
  return limits;
}

// Save rate limit data
function saveRateLimits(limits: Map<string, RateLimitEntry>): void {
  const filePath = getRateLimitFilePath();
  
  try {
    // Ensure logs directory exists
    const logsDir = path.dirname(filePath);
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    const entries = Array.from(limits.values());
    fs.writeFileSync(filePath, JSON.stringify(entries, null, 2));
  } catch (error) {
    console.error('Failed to save rate limits:', error);
  }
}

// Check if user can generate an image
export function canUserGenerateImage(username: string, coordinates?: { x: number; y: number }): { 
  allowed: boolean; 
  timeUntilNext?: number; 
  reason?: string;
  isGenerating?: boolean;
  generatingCoordinates?: { x: number; y: number };
} {
  // Clean up stale active generations first
  cleanupStaleActiveGenerations();
  
  // Exempt user can always generate (bypasses both rate limiting and concurrent prevention)
  if (username === EXEMPT_USERNAME) {
    return { allowed: true };
  }
  
  // Check for active generation by this user
  if (PREVENT_CONCURRENT_GENERATION) {
    const activeGenerations = loadActiveGenerations();
    const activeGeneration = activeGenerations.get(username);
    
    if (activeGeneration) {
      return {
        allowed: false,
        reason: `User is already generating an image at (${activeGeneration.coordinates.x}, ${activeGeneration.coordinates.y}). Please wait for it to complete.`,
        isGenerating: true,
        generatingCoordinates: activeGeneration.coordinates
      };
    }
  }
  
  // Check rate limiting
  const limits = loadRateLimits();
  const now = Date.now();
  const entry = limits.get(username);
  
  if (!entry) {
    // First time user, can generate
    return { allowed: true };
  }
  
  const timeSinceLastGeneration = now - entry.lastGeneration;
  const timeUntilNext = RATE_LIMIT_SECONDS * 1000 - timeSinceLastGeneration;
  
  if (timeUntilNext > 0) {
    return {
      allowed: false,
      timeUntilNext: Math.ceil(timeUntilNext / 1000), // return seconds
      reason: `Rate limited. Next generation available in ${Math.ceil(timeUntilNext / 1000)} seconds.`
    };
  }
  
  return { allowed: true };
}

// Record that user has generated an image
export function recordImageGeneration(username: string): void {
  // Don't record for exempt user
  if (username === EXEMPT_USERNAME) {
    return;
  }
  
  const limits = loadRateLimits();
  limits.set(username, {
    username,
    lastGeneration: Date.now()
  });
  
  saveRateLimits(limits);
}

// Load active generations
function loadActiveGenerations(): Map<string, ActiveGeneration> {
  const filePath = getActiveGenerationsFilePath();
  const activeGenerations = new Map<string, ActiveGeneration>();
  
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      const entries: ActiveGeneration[] = JSON.parse(data);
      entries.forEach(entry => {
        activeGenerations.set(entry.username, entry);
      });
    }
  } catch (error) {
    console.warn('Failed to load active generations:', error);
  }
  
  return activeGenerations;
}

// Save active generations
function saveActiveGenerations(activeGenerations: Map<string, ActiveGeneration>): void {
  const filePath = getActiveGenerationsFilePath();
  
  try {
    // Ensure logs directory exists
    const logsDir = path.dirname(filePath);
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    const entries = Array.from(activeGenerations.values());
    fs.writeFileSync(filePath, JSON.stringify(entries, null, 2));
  } catch (error) {
    console.error('Failed to save active generations:', error);
  }
}

// Clean up stale active generations (older than 5 minutes)
function cleanupStaleActiveGenerations(): void {
  const activeGenerations = loadActiveGenerations();
  const now = Date.now();
  const STALE_THRESHOLD = 5 * 60 * 1000; // 5 minutes
  
  let hasChanges = false;
  for (const [username, entry] of activeGenerations.entries()) {
    if (now - entry.startTime > STALE_THRESHOLD) {
      activeGenerations.delete(username);
      hasChanges = true;
      console.log(`Cleaned up stale active generation for user: ${username}`);
    }
  }
  
  if (hasChanges) {
    saveActiveGenerations(activeGenerations);
  }
}

// Get time until next generation for display purposes
export function getTimeUntilNextGeneration(username: string): number {
  if (username === EXEMPT_USERNAME) {
    return 0;
  }
  
  const limits = loadRateLimits();
  const entry = limits.get(username);
  
  if (!entry) {
    return 0;
  }
  
  const now = Date.now();
  const timeSinceLastGeneration = now - entry.lastGeneration;
  const timeUntilNext = RATE_LIMIT_SECONDS * 1000 - timeSinceLastGeneration;
  
  return Math.max(0, Math.ceil(timeUntilNext / 1000));
}

// Start tracking an active generation
export function startActiveGeneration(username: string, coordinates: { x: number; y: number }): void {
  if (!PREVENT_CONCURRENT_GENERATION || username === EXEMPT_USERNAME) {
    return; // Skip if concurrent prevention is disabled or user is exempt
  }
  
  const activeGenerations = loadActiveGenerations();
  activeGenerations.set(username, {
    username,
    startTime: Date.now(),
    coordinates
  });
  
  saveActiveGenerations(activeGenerations);
  console.log(`Started tracking active generation for ${username} at (${coordinates.x}, ${coordinates.y})`);
}

// Stop tracking an active generation
export function stopActiveGeneration(username: string): void {
  if (!PREVENT_CONCURRENT_GENERATION || username === EXEMPT_USERNAME) {
    return; // Skip if concurrent prevention is disabled or user is exempt
  }
  
  const activeGenerations = loadActiveGenerations();
  const wasActive = activeGenerations.has(username);
  
  if (wasActive) {
    activeGenerations.delete(username);
    saveActiveGenerations(activeGenerations);
    console.log(`Stopped tracking active generation for ${username}`);
  }
}

// Check if a specific coordinate is being generated by any user
export function isCoordinateBeingGenerated(coordinates: { x: number; y: number }): { 
  isGenerating: boolean; 
  generatingUser?: string 
} {
  if (!PREVENT_CONCURRENT_GENERATION) {
    return { isGenerating: false };
  }
  
  cleanupStaleActiveGenerations();
  const activeGenerations = loadActiveGenerations();
  
  for (const [username, entry] of activeGenerations.entries()) {
    if (entry.coordinates.x === coordinates.x && entry.coordinates.y === coordinates.y) {
      return { isGenerating: true, generatingUser: username };
    }
  }
  
  return { isGenerating: false };
}
