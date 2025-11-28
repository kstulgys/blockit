import { proxy, useSnapshot } from "valtio";

// =============================================================================
// CONSTANTS
// =============================================================================

export const EXTERIOR_WALL_THICKNESS = 0.3; // 300mm
export const INTERIOR_WALL_THICKNESS = 0.1; // 100mm
export const WALL_HEIGHT = 2.7; // 2700mm
export const EXTERIOR_MOVE_STEP = 0.3; // 300mm
export const INTERIOR_MOVE_STEP = 0.1; // 100mm
export const MIN_ROOM_SIZE = 0.6; // 600mm minimum room dimension

// =============================================================================
// TYPES - Graph-based data structure
// =============================================================================

/**
 * A junction is a point where walls meet
 */
export type Junction = {
  id: string;
  x: number;
  z: number;
};

/**
 * A wall segment connecting two junctions
 * - For interior walls: both leftRoomId and rightRoomId are set
 * - For exterior walls: one side is null (the outside)
 */
export type Wall = {
  id: string;
  startJunctionId: string;
  endJunctionId: string;
  leftRoomId: string | null;  // Room on the left side (when facing from start to end)
  rightRoomId: string | null; // Room on the right side
};

/**
 * A room is defined by an ordered list of walls forming its boundary
 */
export type Room = {
  id: string;
  name: string;
  wallIds: string[]; // Ordered clockwise
};

/**
 * The complete building state using graph structure
 */
export type BuildingState = {
  junctions: Record<string, Junction>;
  walls: Record<string, Wall>;
  rooms: Record<string, Room>;
  selectedWallId: string | null;
  hoveredWallId: string | null;
};

// =============================================================================
// LEGACY TYPES - For backward compatibility
// =============================================================================

export type Vertex = {
  x: number;
  z: number;
};

export type LegacyRoom = {
  id: string;
  name: string;
  vertices: Vertex[];
};

/**
 * Derived wall format for rendering (backward compatible)
 */
export type DerivedWall = {
  id: string;
  type: "exterior" | "interior";
  orientation: "horizontal" | "vertical";
  start: Vertex;
  end: Vertex;
  roomIds: string[];
};

// =============================================================================
// INITIAL L-SHAPE BUILDING DATA
// =============================================================================

/*
  L-shaped building with 2 rooms using graph structure:
  
  Junction layout:
       0    4.5    9
    0  j1----j2----j3
       |     |     |
       | R1  |     |
       |     | R2  |
    6  j4----j5    |
             |     |
    9        j6----j7
  
  Walls:
  - w1: j1→j2 (top of R1, exterior)
  - w2: j2→j3 (top of R2, exterior)  
  - w3: j2→j5 (shared wall, interior)
  - w4: j1→j4 (left of R1, exterior)
  - w5: j4→j5 (bottom of R1, exterior)
  - w6: j3→j7 (right of R2, exterior)
  - w7: j5→j6 (left of R2 lower section, exterior)
  - w8: j6→j7 (bottom of R2, exterior)
*/

function createInitialBuilding(): { 
  junctions: Record<string, Junction>; 
  walls: Record<string, Wall>; 
  rooms: Record<string, Room>;
} {
  const junctions: Record<string, Junction> = {
    j1: { id: "j1", x: 0, z: 0 },
    j2: { id: "j2", x: 4.5, z: 0 },
    j3: { id: "j3", x: 9, z: 0 },
    j4: { id: "j4", x: 0, z: 6 },
    j5: { id: "j5", x: 4.5, z: 6 },
    j6: { id: "j6", x: 4.5, z: 9 },
    j7: { id: "j7", x: 9, z: 9 },
  };

  // Walls are defined with consistent direction for room assignment
  // Left/Right is determined when looking from start to end junction
  const walls: Record<string, Wall> = {
    // Room 1 boundary (clockwise: top, right-interior, bottom, left)
    w1: { id: "w1", startJunctionId: "j1", endJunctionId: "j2", leftRoomId: null, rightRoomId: "room1" },
    w3: { id: "w3", startJunctionId: "j2", endJunctionId: "j5", leftRoomId: "room1", rightRoomId: "room2" },
    w5: { id: "w5", startJunctionId: "j5", endJunctionId: "j4", leftRoomId: null, rightRoomId: "room1" },
    w4: { id: "w4", startJunctionId: "j4", endJunctionId: "j1", leftRoomId: null, rightRoomId: "room1" },
    
    // Room 2 boundary (clockwise from top-left shared point)
    w2: { id: "w2", startJunctionId: "j2", endJunctionId: "j3", leftRoomId: null, rightRoomId: "room2" },
    w6: { id: "w6", startJunctionId: "j3", endJunctionId: "j7", leftRoomId: "room2", rightRoomId: null },
    w8: { id: "w8", startJunctionId: "j7", endJunctionId: "j6", leftRoomId: "room2", rightRoomId: null },
    w7: { id: "w7", startJunctionId: "j6", endJunctionId: "j5", leftRoomId: "room2", rightRoomId: null },
    // w3 is shared (interior wall) - already defined above
  };

  const rooms: Record<string, Room> = {
    room1: { id: "room1", name: "Room 1", wallIds: ["w1", "w3", "w5", "w4"] },
    room2: { id: "room2", name: "Room 2", wallIds: ["w2", "w6", "w8", "w7", "w3"] },
  };

  return { junctions, walls, rooms };
}

// =============================================================================
// STATE
// =============================================================================

const initialBuilding = createInitialBuilding();

const state = proxy<BuildingState>({
  junctions: initialBuilding.junctions,
  walls: initialBuilding.walls,
  rooms: initialBuilding.rooms,
  selectedWallId: null,
  hoveredWallId: null,
});

// =============================================================================
// HOOKS
// =============================================================================

export function useBuilding() {
  return useSnapshot(state);
}

// =============================================================================
// GRAPH UTILITIES
// =============================================================================

/**
 * Get wall type based on room assignments
 */
function getWallType(wall: Wall): "exterior" | "interior" {
  return (wall.leftRoomId !== null && wall.rightRoomId !== null) ? "interior" : "exterior";
}

/**
 * Get wall orientation based on junction positions
 */
function getWallOrientation(wall: Wall, junctions: Record<string, Junction>): "horizontal" | "vertical" {
  const start = junctions[wall.startJunctionId];
  const end = junctions[wall.endJunctionId];
  return Math.abs(start.z - end.z) < 0.01 ? "horizontal" : "vertical";
}

/**
 * Get all walls connected to a junction
 */
function getWallsAtJunction(junctionId: string, walls: Record<string, Wall>): Wall[] {
  return Object.values(walls).filter(
    w => w.startJunctionId === junctionId || w.endJunctionId === junctionId
  );
}

/**
 * Get the other junction of a wall
 */
function getOtherJunction(wall: Wall, junctionId: string): string {
  return wall.startJunctionId === junctionId ? wall.endJunctionId : wall.startJunctionId;
}

/**
 * Check if a wall is perpendicular to another
 */
function areWallsPerpendicular(
  wall1: Wall, 
  wall2: Wall, 
  junctions: Record<string, Junction>
): boolean {
  const o1 = getWallOrientation(wall1, junctions);
  const o2 = getWallOrientation(wall2, junctions);
  return o1 !== o2;
}

// =============================================================================
// DERIVE WALLS FOR RENDERING (Backward Compatibility)
// =============================================================================

/**
 * Convert graph structure to DerivedWall array for rendering
 * This maintains backward compatibility with existing components
 */
export function deriveWalls(rooms: Record<string, LegacyRoom>): DerivedWall[] {
  // This function now converts from legacy room format to derived walls
  // It's kept for backward compatibility with tests
  return deriveWallsFromRooms(rooms);
}

/**
 * Derive walls from the current graph state
 */
export function deriveWallsFromGraph(): DerivedWall[] {
  const result: DerivedWall[] = [];
  
  for (const wall of Object.values(state.walls)) {
    const start = state.junctions[wall.startJunctionId];
    const end = state.junctions[wall.endJunctionId];
    const type = getWallType(wall);
    const orientation = getWallOrientation(wall, state.junctions);
    
    // Normalize: ensure start < end for consistent IDs
    let normalizedStart: Vertex;
    let normalizedEnd: Vertex;
    
    if (orientation === "horizontal") {
      if (start.x <= end.x) {
        normalizedStart = { x: start.x, z: start.z };
        normalizedEnd = { x: end.x, z: end.z };
      } else {
        normalizedStart = { x: end.x, z: end.z };
        normalizedEnd = { x: start.x, z: start.z };
      }
    } else {
      if (start.z <= end.z) {
        normalizedStart = { x: start.x, z: start.z };
        normalizedEnd = { x: end.x, z: end.z };
      } else {
        normalizedStart = { x: end.x, z: end.z };
        normalizedEnd = { x: start.x, z: start.z };
      }
    }
    
    const roomIds = [wall.leftRoomId, wall.rightRoomId].filter(Boolean) as string[];
    
    // Generate ID in same format as old system for compatibility
    const position = orientation === "horizontal" ? normalizedStart.z : normalizedStart.x;
    const rangeStart = orientation === "horizontal" ? normalizedStart.x : normalizedStart.z;
    const rangeEnd = orientation === "horizontal" ? normalizedEnd.x : normalizedEnd.z;
    const derivedId = `wall-${orientation}-${position.toFixed(4)}-${rangeStart.toFixed(4)}-${rangeEnd.toFixed(4)}`;
    
    result.push({
      id: derivedId,
      type,
      orientation,
      start: normalizedStart,
      end: normalizedEnd,
      roomIds,
    });
  }
  
  return result;
}

/**
 * Legacy function: derive walls from room polygon vertices
 * Kept for backward compatibility with existing tests
 */
function deriveWallsFromRooms(rooms: Record<string, LegacyRoom>): DerivedWall[] {
  const walls: DerivedWall[] = [];
  
  type EdgeInfo = {
    roomId: string;
    orientation: "horizontal" | "vertical";
    position: number;
    start: number;
    end: number;
    direction: 1 | -1;
  };
  
  const allEdges: EdgeInfo[] = [];
  
  for (const room of Object.values(rooms)) {
    const vertices = room.vertices;
    for (let i = 0; i < vertices.length; i++) {
      const start = vertices[i];
      const end = vertices[(i + 1) % vertices.length];
      
      const isHorizontal = Math.abs(start.z - end.z) < 0.01;
      
      if (isHorizontal) {
        const direction = end.x > start.x ? 1 : -1;
        const normStart = Math.min(start.x, end.x);
        const normEnd = Math.max(start.x, end.x);
        allEdges.push({
          roomId: room.id,
          orientation: "horizontal",
          position: start.z,
          start: normStart,
          end: normEnd,
          direction: direction as 1 | -1,
        });
      } else {
        const direction = end.z > start.z ? 1 : -1;
        const normStart = Math.min(start.z, end.z);
        const normEnd = Math.max(start.z, end.z);
        allEdges.push({
          roomId: room.id,
          orientation: "vertical",
          position: start.x,
          start: normStart,
          end: normEnd,
          direction: direction as 1 | -1,
        });
      }
    }
  }
  
  // Group edges by orientation and position
  const edgeGroups = new Map<string, EdgeInfo[]>();
  for (const edge of allEdges) {
    const key = `${edge.orientation}-${edge.position.toFixed(4)}`;
    if (!edgeGroups.has(key)) {
      edgeGroups.set(key, []);
    }
    edgeGroups.get(key)!.push(edge);
  }
  
  // Process each group
  for (const [, edges] of edgeGroups) {
    if (edges.length === 0) continue;
    
    const orientation = edges[0].orientation;
    const position = edges[0].position;
    
    const points = new Set<number>();
    for (const edge of edges) {
      points.add(edge.start);
      points.add(edge.end);
    }
    const sortedPoints = Array.from(points).sort((a, b) => a - b);
    
    for (let i = 0; i < sortedPoints.length - 1; i++) {
      const segStart = sortedPoints[i];
      const segEnd = sortedPoints[i + 1];
      
      const positiveEdges: string[] = [];
      const negativeEdges: string[] = [];
      
      for (const edge of edges) {
        if (edge.start <= segStart + 0.01 && edge.end >= segEnd - 0.01) {
          if (edge.direction === 1) {
            positiveEdges.push(edge.roomId);
          } else {
            negativeEdges.push(edge.roomId);
          }
        }
      }
      
      const uniquePositive = [...new Set(positiveEdges)];
      const uniqueNegative = [...new Set(negativeEdges)];
      const positiveOnly = uniquePositive.filter(r => !uniqueNegative.includes(r));
      const negativeOnly = uniqueNegative.filter(r => !uniquePositive.includes(r));
      
      let isInterior = false;
      
      if (orientation === "vertical") {
        for (const posRoom of positiveOnly) {
          for (const negRoom of negativeOnly) {
            if (posRoom !== negRoom) {
              isInterior = true;
              break;
            }
          }
          if (isInterior) break;
        }
      } else {
        if (positiveOnly.length >= 2 || negativeOnly.length >= 2) {
          isInterior = true;
        }
      }
      
      const containingRooms = [...new Set([...positiveEdges, ...negativeEdges])];
      if (containingRooms.length === 0) continue;
      
      let start: Vertex, end: Vertex;
      if (orientation === "horizontal") {
        start = { x: segStart, z: position };
        end = { x: segEnd, z: position };
      } else {
        start = { x: position, z: segStart };
        end = { x: position, z: segEnd };
      }
      
      const wallId = `wall-${orientation}-${position.toFixed(4)}-${segStart.toFixed(4)}-${segEnd.toFixed(4)}`;
      
      walls.push({
        id: wallId,
        type: isInterior ? "interior" : "exterior",
        orientation,
        start,
        end,
        roomIds: containingRooms,
      });
    }
  }
  
  return walls;
}

// =============================================================================
// WALL UTILITIES
// =============================================================================

export function getWallThickness(type: "exterior" | "interior"): number {
  return type === "exterior" ? EXTERIOR_WALL_THICKNESS : INTERIOR_WALL_THICKNESS;
}

export function findWallAtPosition(
  walls: DerivedWall[],
  x: number,
  z: number,
  tolerance: number = 0.2
): DerivedWall | null {
  for (const wall of walls) {
    const thickness = getWallThickness(wall.type) / 2 + tolerance;
    
    if (wall.orientation === "horizontal") {
      const minX = Math.min(wall.start.x, wall.end.x);
      const maxX = Math.max(wall.start.x, wall.end.x);
      if (x >= minX && x <= maxX && Math.abs(z - wall.start.z) <= thickness) {
        return wall;
      }
    } else {
      const minZ = Math.min(wall.start.z, wall.end.z);
      const maxZ = Math.max(wall.start.z, wall.end.z);
      if (z >= minZ && z <= maxZ && Math.abs(x - wall.start.x) <= thickness) {
        return wall;
      }
    }
  }
  return null;
}

/**
 * Find the internal wall by its derived ID
 */
function findWallByDerivedId(derivedId: string): Wall | null {
  // Parse the derived ID to find matching wall
  const derivedWalls = deriveWallsFromGraph();
  const derivedWall = derivedWalls.find(w => w.id === derivedId);
  if (!derivedWall) return null;
  
  // Find the corresponding internal wall
  for (const wall of Object.values(state.walls)) {
    const start = state.junctions[wall.startJunctionId];
    const end = state.junctions[wall.endJunctionId];
    
    const wallStart = { x: Math.min(start.x, end.x), z: Math.min(start.z, end.z) };
    const wallEnd = { x: Math.max(start.x, end.x), z: Math.max(start.z, end.z) };
    const derivedStart = { x: Math.min(derivedWall.start.x, derivedWall.end.x), z: Math.min(derivedWall.start.z, derivedWall.end.z) };
    const derivedEnd = { x: Math.max(derivedWall.start.x, derivedWall.end.x), z: Math.max(derivedWall.start.z, derivedWall.end.z) };
    
    if (
      Math.abs(wallStart.x - derivedStart.x) < 0.01 &&
      Math.abs(wallStart.z - derivedStart.z) < 0.01 &&
      Math.abs(wallEnd.x - derivedEnd.x) < 0.01 &&
      Math.abs(wallEnd.z - derivedEnd.z) < 0.01
    ) {
      return wall;
    }
  }
  
  return null;
}

// =============================================================================
// CONSTRAINT CHECKING
// =============================================================================

/**
 * Check if moving a wall would violate constraints
 * Returns true if the move is allowed
 * 
 * The key constraint for interior walls:
 * - The shrinking room must have its boundary at the current wall position along the ENTIRE wall length
 * - If there's an exterior wall on the same line beyond the interior wall's endpoints,
 *   that's an exterior corner and the move is blocked
 * 
 * Example: Interior wall at x=4.5 from z=0 to z=6
 * - Room1 has boundary at x=4.5 from z=0 to z=6 (full match) - can shrink
 * - Room2 has boundary at x=4.5 from z=0 to z=9 (extends beyond wall) - exterior corner at z=6, blocked
 */
function canMoveWall(
  wall: Wall,
  direction: "up" | "down" | "left" | "right",
  delta: number
): boolean {
  const type = getWallType(wall);
  const orientation = getWallOrientation(wall, state.junctions);
  
  // For interior walls, check exterior corner constraints
  if (type === "interior") {
    const startJunction = state.junctions[wall.startJunctionId];
    const endJunction = state.junctions[wall.endJunctionId];
    
    // Determine which room shrinks
    const movingPositive = delta > 0;
    // For vertical walls: positive delta = moving right, shrinking room is on the right
    // For horizontal walls: positive delta = moving down, shrinking room is below
    const shrinkingRoomId = movingPositive ? wall.rightRoomId : wall.leftRoomId;
    
    if (!shrinkingRoomId) return true;
    
    // Check both endpoints for exterior corners that would block the move
    // An exterior corner exists when there's a COLLINEAR exterior wall 
    // (same orientation, same position) that extends beyond this interior wall
    const junctionsToCheck = [wall.startJunctionId, wall.endJunctionId];
    
    for (const junctionId of junctionsToCheck) {
      const connectedWalls = getWallsAtJunction(junctionId, state.walls);
      
      for (const otherWall of connectedWalls) {
        if (otherWall.id === wall.id) continue;
        
        const otherType = getWallType(otherWall);
        const otherOrientation = getWallOrientation(otherWall, state.junctions);
        
        // Check for COLLINEAR exterior walls (same orientation, forms an L-corner)
        // This happens when the shrinking room has an exterior wall that continues
        // beyond the interior wall's endpoint
        if (otherOrientation === orientation && otherType === "exterior") {
          // This is a collinear exterior wall - it means the shrinking room
          // has a boundary that extends beyond this interior wall
          // Check if it belongs to the shrinking room
          const otherBelongsToShrinking = 
            otherWall.leftRoomId === shrinkingRoomId || 
            otherWall.rightRoomId === shrinkingRoomId;
          
          if (otherBelongsToShrinking) {
            // The shrinking room has an exterior wall on the same line
            // This means there's an exterior corner - block the move
            return false;
          }
        }
      }
    }
  }
  
  return true;
}

// =============================================================================
// ACTIONS
// =============================================================================

export const actions = {
  selectWall(wallId: string | null) {
    state.selectedWallId = wallId;
  },

  clearSelection() {
    state.selectedWallId = null;
  },

  setHoveredWall(wallId: string | null) {
    state.hoveredWallId = wallId;
  },

  /**
   * Move a wall by adjusting its junction positions
   * This is the new simplified version using the graph structure
   */
  moveWall(wallId: string, direction: "up" | "down" | "left" | "right"): string | null {
    // Find the wall by its derived ID
    const wall = findWallByDerivedId(wallId);
    if (!wall) return null;
    
    const type = getWallType(wall);
    const orientation = getWallOrientation(wall, state.junctions);
    
    // Validate direction
    const isHorizontal = orientation === "horizontal";
    const isValidDirection = isHorizontal 
      ? (direction === "up" || direction === "down")
      : (direction === "left" || direction === "right");

    if (!isValidDirection) return null;

    const moveStep = type === "exterior" ? EXTERIOR_MOVE_STEP : INTERIOR_MOVE_STEP;
    const delta = (direction === "up" || direction === "left") ? -moveStep : moveStep;

    // Check constraints
    if (!canMoveWall(wall, direction, delta)) {
      return null;
    }

    // Move the junctions
    const startJunction = state.junctions[wall.startJunctionId];
    const endJunction = state.junctions[wall.endJunctionId];
    
    if (isHorizontal) {
      // Move in Z direction
      startJunction.z += delta;
      endJunction.z += delta;
    } else {
      // Move in X direction
      startJunction.x += delta;
      endJunction.x += delta;
    }

    // Return new wall ID (recalculated based on new position)
    const newDerivedWalls = deriveWallsFromGraph();
    const movedWall = newDerivedWalls.find(w => {
      const start = state.junctions[wall.startJunctionId];
      const end = state.junctions[wall.endJunctionId];
      const wStart = { x: Math.min(w.start.x, w.end.x), z: Math.min(w.start.z, w.end.z) };
      const wEnd = { x: Math.max(w.start.x, w.end.x), z: Math.max(w.start.z, w.end.z) };
      const wallStart = { x: Math.min(start.x, end.x), z: Math.min(start.z, end.z) };
      const wallEnd = { x: Math.max(start.x, end.x), z: Math.max(start.z, end.z) };
      
      return (
        Math.abs(wStart.x - wallStart.x) < 0.01 &&
        Math.abs(wStart.z - wallStart.z) < 0.01 &&
        Math.abs(wEnd.x - wallEnd.x) < 0.01 &&
        Math.abs(wEnd.z - wallEnd.z) < 0.01
      );
    });

    return movedWall?.id ?? wallId;
  },

  moveSelectedWall(direction: "up" | "down" | "left" | "right") {
    if (!state.selectedWallId) return;
    
    const newWallId = this.moveWall(state.selectedWallId, direction);
    
    if (newWallId && newWallId !== state.selectedWallId) {
      state.selectedWallId = newWallId;
    }
  },

  resetBuilding() {
    const initial = createInitialBuilding();
    state.junctions = initial.junctions;
    state.walls = initial.walls;
    state.rooms = initial.rooms;
    state.selectedWallId = null;
    state.hoveredWallId = null;
  },
};

// =============================================================================
// COMPATIBILITY LAYER - Legacy types and functions
// =============================================================================

// Legacy Wall type for Wall3D component
export type LegacyWall = {
  id: string;
  type: "exterior" | "interior";
  start: string;
  end: string;
};

// Re-export Junction for Wall3D (already exported above)

export function getWallAsLegacyFormat(wall: DerivedWall): {
  wall: LegacyWall;
  startJunction: Junction;
  endJunction: Junction;
} {
  return {
    wall: {
      id: wall.id,
      type: wall.type,
      start: `${wall.id}-start`,
      end: `${wall.id}-end`,
    },
    startJunction: {
      id: `${wall.id}-start`,
      x: wall.start.x,
      z: wall.start.z,
    },
    endJunction: {
      id: `${wall.id}-end`,
      x: wall.end.x,
      z: wall.end.z,
    },
  };
}

// For backward compatibility with Building3D that needs rooms in legacy format
export function getRoomsAsLegacyFormat(): Record<string, LegacyRoom> {
  const result: Record<string, LegacyRoom> = {};
  
  for (const room of Object.values(state.rooms)) {
    // Reconstruct vertices from walls
    const vertices: Vertex[] = [];
    
    // Follow walls in order to build polygon
    for (const wallId of room.wallIds) {
      const wall = state.walls[wallId];
      if (!wall) continue;
      
      const startJunction = state.junctions[wall.startJunctionId];
      const endJunction = state.junctions[wall.endJunctionId];
      
      // Determine which direction we're going around the room
      // For now, add start junction (we'll dedupe later)
      const isOnLeft = wall.leftRoomId === room.id;
      
      if (isOnLeft) {
        // Wall goes in opposite direction for this room
        vertices.push({ x: endJunction.x, z: endJunction.z });
      } else {
        vertices.push({ x: startJunction.x, z: startJunction.z });
      }
    }
    
    result[room.id] = {
      id: room.id,
      name: room.name,
      vertices,
    };
  }
  
  return result;
}
