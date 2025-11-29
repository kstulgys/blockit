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
// TYPES
// =============================================================================

export type Vertex = {
  x: number;
  z: number;
};

export type Room = {
  id: string;
  name: string;
  vertices: Vertex[]; // Clockwise ordered polygon vertices
};

export type DerivedWall = {
  id: string;
  type: "exterior" | "interior";
  orientation: "horizontal" | "vertical";
  start: Vertex;
  end: Vertex;
  roomIds: string[];
};

export type BuildingState = {
  rooms: Record<string, Room>;
  selectedWallId: string | null;
  hoveredWallId: string | null;
};

// For Wall3D component compatibility
export type Junction = {
  id: string;
  x: number;
  z: number;
};

export type LegacyWall = {
  id: string;
  type: "exterior" | "interior";
  start: string;
  end: string;
};

// =============================================================================
// INITIAL L-SHAPE BUILDING DATA
// =============================================================================

/*
  L-shaped building with 2 rooms:
  
       0    4.5    9
    0  +-----+-----+
       |     |     |
       | R1  |     |
       |     | R2  |
    6  +-----+     |
             |     |
    9        +-----+
*/

function createInitialRooms(): Record<string, Room> {
  return {
    room1: {
      id: "room1",
      name: "Room 1",
      vertices: [
        { x: 0, z: 0 },
        { x: 4.5, z: 0 },
        { x: 4.5, z: 6 },
        { x: 0, z: 6 },
      ],
    },
    room2: {
      id: "room2",
      name: "Room 2",
      vertices: [
        { x: 4.5, z: 0 },
        { x: 9, z: 0 },
        { x: 9, z: 9 },
        { x: 4.5, z: 9 },
        { x: 4.5, z: 6 },
      ],
    },
  };
}

// =============================================================================
// STATE
// =============================================================================

const state = proxy<BuildingState>({
  rooms: createInitialRooms(),
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
// DERIVE WALLS FROM ROOM POLYGONS
// =============================================================================

type EdgeInfo = {
  roomId: string;
  orientation: "horizontal" | "vertical";
  position: number; // x for vertical, z for horizontal
  start: number;    // start coordinate along the edge
  end: number;      // end coordinate along the edge
  direction: 1 | -1; // direction of traversal (for determining interior/exterior)
};

/**
 * Derive walls from room polygons.
 * Interior walls are detected where two rooms share an edge.
 */
export function deriveWallsFromRooms(rooms: Record<string, Room>): DerivedWall[] {
  const walls: DerivedWall[] = [];
  const allEdges: EdgeInfo[] = [];

  // Extract all edges from all rooms
  for (const room of Object.values(rooms)) {
    const vertices = room.vertices;
    for (let i = 0; i < vertices.length; i++) {
      const start = vertices[i];
      const end = vertices[(i + 1) % vertices.length];

      const isHorizontal = Math.abs(start.z - end.z) < 0.001;

      if (isHorizontal) {
        const direction = end.x > start.x ? 1 : -1;
        allEdges.push({
          roomId: room.id,
          orientation: "horizontal",
          position: start.z,
          start: Math.min(start.x, end.x),
          end: Math.max(start.x, end.x),
          direction: direction as 1 | -1,
        });
      } else {
        const direction = end.z > start.z ? 1 : -1;
        allEdges.push({
          roomId: room.id,
          orientation: "vertical",
          position: start.x,
          start: Math.min(start.z, end.z),
          end: Math.max(start.z, end.z),
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

  // Process each group to find wall segments
  for (const [, edges] of edgeGroups) {
    if (edges.length === 0) continue;

    const orientation = edges[0].orientation;
    const position = edges[0].position;

    // Collect all unique points along this line
    const points = new Set<number>();
    for (const edge of edges) {
      points.add(edge.start);
      points.add(edge.end);
    }
    const sortedPoints = Array.from(points).sort((a, b) => a - b);

    // For each segment between consecutive points
    for (let i = 0; i < sortedPoints.length - 1; i++) {
      const segStart = sortedPoints[i];
      const segEnd = sortedPoints[i + 1];

      // Find which rooms have edges covering this segment
      const roomsWithPositiveDir: string[] = [];
      const roomsWithNegativeDir: string[] = [];

      for (const edge of edges) {
        if (edge.start <= segStart + 0.001 && edge.end >= segEnd - 0.001) {
          if (edge.direction === 1) {
            roomsWithPositiveDir.push(edge.roomId);
          } else {
            roomsWithNegativeDir.push(edge.roomId);
          }
        }
      }

      // Determine if this is an interior or exterior wall
      const uniqueRooms = [...new Set([...roomsWithPositiveDir, ...roomsWithNegativeDir])];
      if (uniqueRooms.length === 0) continue;

      // Interior wall: two different rooms share this edge (opposite directions)
      const isInterior = roomsWithPositiveDir.length > 0 && 
                         roomsWithNegativeDir.length > 0 &&
                         !roomsWithPositiveDir.some(r => roomsWithNegativeDir.includes(r));

      // Create wall
      let startVertex: Vertex, endVertex: Vertex;
      if (orientation === "horizontal") {
        startVertex = { x: segStart, z: position };
        endVertex = { x: segEnd, z: position };
      } else {
        startVertex = { x: position, z: segStart };
        endVertex = { x: position, z: segEnd };
      }

      const wallId = `wall-${orientation}-${position.toFixed(4)}-${segStart.toFixed(4)}-${segEnd.toFixed(4)}`;

      walls.push({
        id: wallId,
        type: isInterior ? "interior" : "exterior",
        orientation,
        start: startVertex,
        end: endVertex,
        roomIds: uniqueRooms,
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

// =============================================================================
// WALL MOVEMENT
// =============================================================================

/**
 * Find which room edges match a derived wall
 */
function findRoomEdgesForWall(
  wall: DerivedWall,
  rooms: Record<string, Room>
): { roomId: string; edgeIndex: number; isStart: boolean }[] {
  const results: { roomId: string; edgeIndex: number; isStart: boolean }[] = [];

  for (const room of Object.values(rooms)) {
    const vertices = room.vertices;
    for (let i = 0; i < vertices.length; i++) {
      const v1 = vertices[i];
      const v2 = vertices[(i + 1) % vertices.length];

      // Check if this edge matches the wall
      const edgeIsHorizontal = Math.abs(v1.z - v2.z) < 0.001;
      const wallIsHorizontal = wall.orientation === "horizontal";

      if (edgeIsHorizontal !== wallIsHorizontal) continue;

      if (wallIsHorizontal) {
        // Check if z position matches and x range overlaps
        if (Math.abs(v1.z - wall.start.z) < 0.001) {
          const edgeMinX = Math.min(v1.x, v2.x);
          const edgeMaxX = Math.max(v1.x, v2.x);
          const wallMinX = Math.min(wall.start.x, wall.end.x);
          const wallMaxX = Math.max(wall.start.x, wall.end.x);

          if (edgeMinX <= wallMinX + 0.001 && edgeMaxX >= wallMaxX - 0.001) {
            results.push({ roomId: room.id, edgeIndex: i, isStart: v1.x < v2.x });
          }
        }
      } else {
        // Vertical wall - check if x position matches and z range overlaps
        if (Math.abs(v1.x - wall.start.x) < 0.001) {
          const edgeMinZ = Math.min(v1.z, v2.z);
          const edgeMaxZ = Math.max(v1.z, v2.z);
          const wallMinZ = Math.min(wall.start.z, wall.end.z);
          const wallMaxZ = Math.max(wall.start.z, wall.end.z);

          if (edgeMinZ <= wallMinZ + 0.001 && edgeMaxZ >= wallMaxZ - 0.001) {
            results.push({ roomId: room.id, edgeIndex: i, isStart: v1.z < v2.z });
          }
        }
      }
    }
  }

  return results;
}

/**
 * Move a wall by updating the room polygon vertices
 */
function moveWallInRooms(
  wall: DerivedWall,
  direction: "up" | "down" | "left" | "right",
  rooms: Record<string, Room>
): boolean {
  const moveStep = wall.type === "exterior" ? EXTERIOR_MOVE_STEP : INTERIOR_MOVE_STEP;
  const delta = (direction === "up" || direction === "left") ? -moveStep : moveStep;

  // Find all room edges that correspond to this wall
  const roomEdges = findRoomEdgesForWall(wall, rooms);
  if (roomEdges.length === 0) return false;

  // For each room, update the vertices
  for (const { roomId, edgeIndex } of roomEdges) {
    const room = rooms[roomId];
    const vertices = room.vertices;
    const v1Index = edgeIndex;
    const v2Index = (edgeIndex + 1) % vertices.length;

    if (wall.orientation === "horizontal") {
      // Moving up/down changes z coordinate
      vertices[v1Index] = { ...vertices[v1Index], z: vertices[v1Index].z + delta };
      vertices[v2Index] = { ...vertices[v2Index], z: vertices[v2Index].z + delta };
    } else {
      // Moving left/right changes x coordinate
      vertices[v1Index] = { ...vertices[v1Index], x: vertices[v1Index].x + delta };
      vertices[v2Index] = { ...vertices[v2Index], x: vertices[v2Index].x + delta };
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

  moveWall(wallId: string, direction: "up" | "down" | "left" | "right"): string | null {
    // Derive current walls to find the one being moved
    const walls = deriveWallsFromRooms(state.rooms);
    const wall = walls.find(w => w.id === wallId);
    if (!wall) return null;

    // Validate direction matches wall orientation
    const isHorizontal = wall.orientation === "horizontal";
    const isValidDirection = isHorizontal
      ? (direction === "up" || direction === "down")
      : (direction === "left" || direction === "right");

    if (!isValidDirection) return null;

    // Move the wall by updating room vertices
    const moved = moveWallInRooms(wall, direction, state.rooms);
    if (!moved) return null;

    // Calculate new wall ID (position changed)
    const moveStep = wall.type === "exterior" ? EXTERIOR_MOVE_STEP : INTERIOR_MOVE_STEP;
    const delta = (direction === "up" || direction === "left") ? -moveStep : moveStep;

    let newPosition: number;
    if (isHorizontal) {
      newPosition = wall.start.z + delta;
    } else {
      newPosition = wall.start.x + delta;
    }

    const rangeStart = isHorizontal
      ? Math.min(wall.start.x, wall.end.x)
      : Math.min(wall.start.z, wall.end.z);
    const rangeEnd = isHorizontal
      ? Math.max(wall.start.x, wall.end.x)
      : Math.max(wall.start.z, wall.end.z);

    const newWallId = `wall-${wall.orientation}-${newPosition.toFixed(4)}-${rangeStart.toFixed(4)}-${rangeEnd.toFixed(4)}`;

    return newWallId;
  },

  moveSelectedWall(direction: "up" | "down" | "left" | "right") {
    if (!state.selectedWallId) return;

    const newWallId = this.moveWall(state.selectedWallId, direction);

    if (newWallId) {
      state.selectedWallId = newWallId;
    }
  },

  resetBuilding() {
    state.rooms = createInitialRooms();
    state.selectedWallId = null;
    state.hoveredWallId = null;
  },
};

// =============================================================================
// EXPORTS FOR BACKWARD COMPATIBILITY
// =============================================================================

export type LegacyRoom = Room;

export function deriveWalls(rooms: Record<string, Room>): DerivedWall[] {
  return deriveWallsFromRooms(rooms);
}
