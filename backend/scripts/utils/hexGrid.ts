export interface HexCoord {
  x: number;
  y: number;
}

// Returns the 6 neighbors of a hexagon in this grid layout
// Based on frontend positioning: hexX = x * size * 1.0, hexY = y * size * sqrt(3) * 1.4 + (x % 2) * size * sqrt(3) * 0.7
export function getHexagonNeighbors(x: number, y: number): HexCoord[] {
  const neighbors: HexCoord[] = [];
  
  // Horizontal neighbors (left and right) - always x-2 and x+2
  neighbors.push({ x: x - 2, y: y });
  neighbors.push({ x: x + 2, y: y });
  
  // Vertical neighbors (north and south) - always x-1 and x+1
  neighbors.push({ x: x - 1, y: y });
  neighbors.push({ x: x + 1, y: y });
  
  // Diagonal neighbors depend on x parity and coordinate signs
  if (x % 2 === 0) {
    // Even x: diagonal neighbors depend on both x and y signs
    if (x < 0 && y < 0) {
      // Negative x, negative y: southwest and southeast
      neighbors.push({ x: x - 1, y: y + 1 });
      neighbors.push({ x: x + 1, y: y + 1 });
    } else if (x < 0 && y > 0) {
      // Negative x, positive y: southwest and southeast
      neighbors.push({ x: x - 1, y: y + 1 });
      neighbors.push({ x: x + 1, y: y + 1 });
    } else if (x > 0 && y < 0) {
      // Positive x, negative y: northwest and northeast
      neighbors.push({ x: x - 1, y: y - 1 });
      neighbors.push({ x: x + 1, y: y - 1 });
    } else {
      // Positive x, positive y: northwest and northeast
      neighbors.push({ x: x - 1, y: y - 1 });
      neighbors.push({ x: x + 1, y: y - 1 });
    }
  } else {
    // Odd x: diagonal neighbors depend on both x and y signs
    if (x < 0 && y < 0) {
      // Negative x, negative y: northwest and northeast
      neighbors.push({ x: x - 1, y: y - 1 });
      neighbors.push({ x: x + 1, y: y - 1 });
    } else if (x < 0 && y > 0) {
      // Negative x, positive y: northwest and northeast
      neighbors.push({ x: x - 1, y: y - 1 });
      neighbors.push({ x: x + 1, y: y - 1 });
    } else if (x > 0 && y < 0) {
      // Positive x, negative y: southwest and southeast
      neighbors.push({ x: x - 1, y: y + 1 });
      neighbors.push({ x: x + 1, y: y + 1 });
    } else {
      // Positive x, positive y: southwest and southeast
      neighbors.push({ x: x - 1, y: y + 1 });
      neighbors.push({ x: x + 1, y: y + 1 });
    }
  }
  
  return neighbors;
}

// Returns all coordinates within radius 2 (distance 1 and 2), excluding the center
export function getNeighborsWithinRadiusTwo(x: number, y: number): HexCoord[] {
  const visited = new Set<string>();
  const result: HexCoord[] = [];

  const add = (c: HexCoord) => {
    const key = `${c.x}_${c.y}`;
    if (!visited.has(key) && !(c.x === x && c.y === y)) {
      visited.add(key);
      result.push(c);
    }
  };

  // Distance 1
  const d1 = getHexagonNeighbors(x, y);
  d1.forEach(add);

  // Distance 2 = neighbors of each distance-1 neighbor, excluding center and existing adds
  for (const n of d1) {
    const d2 = getHexagonNeighbors(n.x, n.y);
    for (const c of d2) add(c);
  }

  return result;
} 