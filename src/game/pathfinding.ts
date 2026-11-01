/**
 * A* Pathfinding system for Dhaka sidewalk pedestrian network.
 * Generates an interconnected waypoint graph running along pavements,
 * corners, and crosswalks.
 */

export interface SidewalkNode {
  id: number;
  x: number;
  z: number;
  neighbors: number[]; // Connected node IDs
}

export class SidewalkGraph {
  nodes: SidewalkNode[] = [];
  private nodeMap = new Map<number, SidewalkNode>();

  constructor() {
    this.buildDhakaSidewalkNetwork();
  }

  private addNode(x: number, z: number): number {
    const id = this.nodes.length;
    const node: SidewalkNode = { id, x, z, neighbors: [] };
    this.nodes.push(node);
    this.nodeMap.set(id, node);
    return id;
  }

  private addEdge(id1: number, id2: number) {
    const n1 = this.nodeMap.get(id1);
    const n2 = this.nodeMap.get(id2);
    if (!n1 || !n2 || id1 === id2) return;
    if (!n1.neighbors.includes(id2)) n1.neighbors.push(id2);
    if (!n2.neighbors.includes(id1)) n2.neighbors.push(id1);
  }

  private buildDhakaSidewalkNetwork() {
    const streets = [-80, -40, 0, 40, 80];
    const offset = 8.1; // Distance from street centerline to sidewalk center
    const bounds = [-105, 105];

    // Map to store corner nodes: key = `${sx}_${sz}_${cornerIndex}`
    // cornerIndex: 0: (-offset, -offset), 1: (+offset, -offset), 2: (-offset, +offset), 3: (+offset, +offset)
    const corners = new Map<string, number>();

    // 1. Create intersection corners and crosswalk connections
    for (const sx of streets) {
      for (const sz of streets) {
        const c0 = this.addNode(sx - offset, sz - offset); // Top-Left
        const c1 = this.addNode(sx + offset, sz - offset); // Top-Right
        const c2 = this.addNode(sx - offset, sz + offset); // Bottom-Left
        const c3 = this.addNode(sx + offset, sz + offset); // Bottom-Right

        corners.set(`${sx}_${sz}_0`, c0);
        corners.set(`${sx}_${sz}_1`, c1);
        corners.set(`${sx}_${sz}_2`, c2);
        corners.set(`${sx}_${sz}_3`, c3);

        // Crosswalk edges across the intersections
        this.addEdge(c0, c1); // Cross vertical street (top)
        this.addEdge(c2, c3); // Cross vertical street (bottom)
        this.addEdge(c0, c2); // Cross horizontal street (left)
        this.addEdge(c1, c3); // Cross horizontal street (right)
      }
    }

    // 2. Connect sidewalk segments between consecutive intersections
    for (let i = 0; i < streets.length; i++) {
      const sx = streets[i];

      for (let j = 0; j < streets.length; j++) {
        const sz = streets[j];

        // Horizontal sidewalk segments between sx and next sx
        if (i < streets.length - 1) {
          const nextSx = streets[i + 1];
          const midX = (sx + nextSx) / 2;

          // Upper sidewalk (z = sz - offset)
          const leftTop = corners.get(`${sx}_${sz}_1`)!;
          const rightTop = corners.get(`${nextSx}_${sz}_0`)!;
          const midTop = this.addNode(midX, sz - offset);
          this.addEdge(leftTop, midTop);
          this.addEdge(midTop, rightTop);

          // Lower sidewalk (z = sz + offset)
          const leftBottom = corners.get(`${sx}_${sz}_3`)!;
          const rightBottom = corners.get(`${nextSx}_${sz}_2`)!;
          const midBottom = this.addNode(midX, sz + offset);
          this.addEdge(leftBottom, midBottom);
          this.addEdge(midBottom, rightBottom);
        }

        // Vertical sidewalk segments between sz and next sz
        if (j < streets.length - 1) {
          const nextSz = streets[j + 1];
          const midZ = (sz + nextSz) / 2;

          // Left sidewalk (x = sx - offset)
          const topLeft = corners.get(`${sx}_${sz}_2`)!;
          const bottomLeft = corners.get(`${sx}_${nextSz}_0`)!;
          const midLeft = this.addNode(sx - offset, midZ);
          this.addEdge(topLeft, midLeft);
          this.addEdge(midLeft, bottomLeft);

          // Right sidewalk (x = sx + offset)
          const topRight = corners.get(`${sx}_${sz}_3`)!;
          const bottomRight = corners.get(`${sx}_${nextSz}_1`)!;
          const midRight = this.addNode(sx + offset, midZ);
          this.addEdge(topRight, midRight);
          this.addEdge(midRight, bottomRight);
        }
      }
    }

    // 3. Connect perimeter sidewalks to outer boundaries
    for (const sx of streets) {
      // North boundary
      const topL = corners.get(`${sx}_-80_0`)!;
      const topR = corners.get(`${sx}_-80_1`)!;
      const northL = this.addNode(sx - offset, bounds[0]);
      const northR = this.addNode(sx + offset, bounds[0]);
      this.addEdge(topL, northL);
      this.addEdge(topR, northR);
      this.addEdge(northL, northR);

      // South boundary
      const botL = corners.get(`${sx}_80_2`)!;
      const botR = corners.get(`${sx}_80_3`)!;
      const southL = this.addNode(sx - offset, bounds[1]);
      const southR = this.addNode(sx + offset, bounds[1]);
      this.addEdge(botL, southL);
      this.addEdge(botR, southR);
      this.addEdge(southL, southR);
    }

    for (const sz of streets) {
      // West boundary
      const westT = corners.get(`-80_${sz}_0`)!;
      const westB = corners.get(`-80_${sz}_2`)!;
      const westNodeT = this.addNode(bounds[0], sz - offset);
      const westNodeB = this.addNode(bounds[0], sz + offset);
      this.addEdge(westT, westNodeT);
      this.addEdge(westB, westNodeB);
      this.addEdge(westNodeT, westNodeB);

      // East boundary
      const eastT = corners.get(`80_${sz}_1`)!;
      const eastB = corners.get(`80_${sz}_3`)!;
      const eastNodeT = this.addNode(bounds[1], sz - offset);
      const eastNodeB = this.addNode(bounds[1], sz + offset);
      this.addEdge(eastT, eastNodeT);
      this.addEdge(eastB, eastNodeB);
      this.addEdge(eastNodeT, eastNodeB);
    }
  }

  findNearestNode(x: number, z: number): number {
    let bestId = 0;
    let minDistSq = Infinity;
    for (const n of this.nodes) {
      const dx = n.x - x;
      const dz = n.z - z;
      const dsq = dx * dx + dz * dz;
      if (dsq < minDistSq) {
        minDistSq = dsq;
        bestId = n.id;
      }
    }
    return bestId;
  }

  getRandomDestination(fromId: number, minDistance = 35): number {
    const fromNode = this.nodes[fromId] || this.nodes[0];
    const candidates: number[] = [];
    for (const n of this.nodes) {
      const dist = Math.hypot(n.x - fromNode.x, n.z - fromNode.z);
      if (dist >= minDistance) {
        candidates.push(n.id);
      }
    }
    if (candidates.length === 0) {
      return (Math.random() * this.nodes.length) | 0;
    }
    return candidates[(Math.random() * candidates.length) | 0];
  }

  /**
   * Fast A* Search returning array of 2D waypoints.
   */
  findAStarPath(startId: number, goalId: number): Array<{ x: number; z: number }> {
    if (startId === goalId) {
      const n = this.nodes[startId];
      return [{ x: n.x, z: n.z }];
    }

    const openSet: number[] = [startId];
    const cameFrom = new Map<number, number>();
    const gScore = new Map<number, number>();
    const fScore = new Map<number, number>();

    gScore.set(startId, 0);
    const goalNode = this.nodes[goalId];
    const startNode = this.nodes[startId];
    fScore.set(startId, Math.hypot(goalNode.x - startNode.x, goalNode.z - startNode.z));

    while (openSet.length > 0) {
      // Find node in openSet with lowest fScore
      let lowestIndex = 0;
      let lowestF = fScore.get(openSet[0]) ?? Infinity;
      for (let i = 1; i < openSet.length; i++) {
        const f = fScore.get(openSet[i]) ?? Infinity;
        if (f < lowestF) {
          lowestF = f;
          lowestIndex = i;
        }
      }

      const current = openSet.splice(lowestIndex, 1)[0];
      if (current === goalId) {
        // Reconstruct path
        const path: Array<{ x: number; z: number }> = [];
        let curr: number | undefined = current;
        while (curr !== undefined) {
          const n = this.nodes[curr];
          path.unshift({ x: n.x, z: n.z });
          curr = cameFrom.get(curr);
        }
        return path;
      }

      const currNode = this.nodes[current];
      const currentG = gScore.get(current) ?? Infinity;

      for (const neighborId of currNode.neighbors) {
        const neighbor = this.nodes[neighborId];
        const dist = Math.hypot(neighbor.x - currNode.x, neighbor.z - currNode.z);
        const tentativeG = currentG + dist;

        if (tentativeG < (gScore.get(neighborId) ?? Infinity)) {
          cameFrom.set(neighborId, current);
          gScore.set(neighborId, tentativeG);
          const h = Math.hypot(goalNode.x - neighbor.x, goalNode.z - neighbor.z);
          fScore.set(neighborId, tentativeG + h);

          if (!openSet.includes(neighborId)) {
            openSet.push(neighborId);
          }
        }
      }
    }

    // Fallback if no path found
    return [
      { x: this.nodes[startId].x, z: this.nodes[startId].z },
      { x: this.nodes[goalId].x, z: this.nodes[goalId].z }
    ];
  }
}
