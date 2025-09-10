import fs from 'fs';
import path from 'path';
import { getBackendRoot, getBackendPaths } from './paths';

// Get backend paths
const BACKEND_ROOT = getBackendRoot();
const paths = getBackendPaths(BACKEND_ROOT);

interface GenerationEntry {
  x: number;
  y: number;
  timestamp: number; // milliseconds since epoch
  username?: string;
}

interface GenerationTracker {
  generations: Record<string, GenerationEntry>; // key: "x_y", value: GenerationEntry
  lastUpdated: number; // timestamp of last update
}

// File path for storing generation data
function getGenerationTrackerFilePath(): string {
  return path.join(paths.logs, 'generation_tracker.json');
}

// Load generation tracker data
function loadGenerationTracker(): GenerationTracker {
  const filePath = getGenerationTrackerFilePath();
  
  if (!fs.existsSync(filePath)) {
    return {
      generations: {},
      lastUpdated: 0
    };
  }
  
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.warn('Failed to load generation tracker, using empty data:', error);
    return {
      generations: {},
      lastUpdated: 0
    };
  }
}

// Save generation tracker data
function saveGenerationTracker(tracker: GenerationTracker): void {
  const filePath = getGenerationTrackerFilePath();
  const logDir = path.dirname(filePath);
  
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  
  try {
    fs.writeFileSync(filePath, JSON.stringify(tracker, null, 2));
  } catch (error) {
    console.error('Failed to save generation tracker:', error);
  }
}

// Record a successful image generation
export function recordImageGeneration(x: number, y: number, username?: string): void {
  const tracker = loadGenerationTracker();
  const key = `${x}_${y}`;
  const timestamp = Date.now();
  
  tracker.generations[key] = {
    x,
    y,
    timestamp,
    username
  };
  
  tracker.lastUpdated = timestamp;
  saveGenerationTracker(tracker);
  
  console.log(`Recorded generation for (${x}, ${y}) at ${new Date(timestamp).toISOString()}`);
}

// Get generation timestamp for a specific coordinate
export function getGenerationTimestamp(x: number, y: number): number | null {
  const tracker = loadGenerationTracker();
  const key = `${x}_${y}`;
  
  return tracker.generations[key]?.timestamp || null;
}

// Check which coordinates have been updated since a given timestamp
export function getUpdatedCoordinates(sinceTimestamp: number): Array<{x: number, y: number, timestamp: number, username?: string}> {
  const tracker = loadGenerationTracker();
  const updated: Array<{x: number, y: number, timestamp: number, username?: string}> = [];
  
  for (const [key, entry] of Object.entries(tracker.generations)) {
    if (entry.timestamp > sinceTimestamp) {
      updated.push({
        x: entry.x,
        y: entry.y,
        timestamp: entry.timestamp,
        username: entry.username
      });
    }
  }
  
  return updated.sort((a, b) => a.timestamp - b.timestamp);
}

// Get all generation timestamps for a list of coordinates
export function getGenerationTimestamps(coordinates: Array<{x: number, y: number}>): Record<string, number> {
  const tracker = loadGenerationTracker();
  const timestamps: Record<string, number> = {};
  
  for (const coord of coordinates) {
    const key = `${coord.x}_${coord.y}`;
    timestamps[key] = tracker.generations[key]?.timestamp || 0;
  }
  
  return timestamps;
}

// Get the last update timestamp for the entire system
export function getLastSystemUpdate(): number {
  const tracker = loadGenerationTracker();
  return tracker.lastUpdated;
}

// Clean up old generation records (optional, for maintenance)
export function cleanupOldGenerations(maxAgeDays: number = 30): void {
  const tracker = loadGenerationTracker();
  const cutoffTime = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);
  let removedCount = 0;
  
  for (const [key, entry] of Object.entries(tracker.generations)) {
    if (entry.timestamp < cutoffTime) {
      delete tracker.generations[key];
      removedCount++;
    }
  }
  
  if (removedCount > 0) {
    saveGenerationTracker(tracker);
    console.log(`Cleaned up ${removedCount} old generation records`);
  }
}
