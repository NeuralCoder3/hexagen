export interface HexCoord {
  x: number;
  y: number;
}

// Returns the 6 neighbors of a hexagon in this grid layout
export function getHexagonNeighbors(x: number, y: number): HexCoord[] {
  const neighbors: HexCoord[] = [];
  // Horizontal neighbors (note spacing in this axial-like system uses steps of 2 on x)
  neighbors.push({ x: x - 2, y: y });
  neighbors.push({ x: x + 2, y: y });

  // Parity-based neighbors
  if (x % 2 === 0) {
    neighbors.push({ x: x - 1, y: y - 1 });
    neighbors.push({ x: x + 1, y: y - 1 });
    neighbors.push({ x: x - 1, y: y });
    neighbors.push({ x: x + 1, y: y });
  } else {
    neighbors.push({ x: x - 1, y: y + 0 });
    neighbors.push({ x: x + 1, y: y + 0 });
    neighbors.push({ x: x - 1, y: y + 1 });
    neighbors.push({ x: x + 1, y: y + 1 });
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