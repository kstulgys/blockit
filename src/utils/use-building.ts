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

/**
 * A vertex in 2D space (floor plan)
 */
export type Vertex = {
  x: number;
  z: number;
};

/**
 * A room defined as a closed polygon (vertices in clockwise order)
 * All edges must be axis-aligned (horizontal or vertical)
 */
export type Room = {
  id: string;
  name: string;
  vertices: Vertex[]; // Clockwise order, axis-aligned edges only
};

/**
 * A derived wall segment (computed from room edges)
 */
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

// =============================================================================
// INITIAL L-SHAPE BUILDING DATA
// =============================================================================

/*
  L-shaped building with 2 rooms using polygon vertices:
  
  Room 1 (left, rectangular): 
    (0,0) -> (4.5,0) -> (4.5,6) -> (0,6) -> back to start
  
  Room 2 (right, L-shaped):
    (4.5,0) -> (9,0) -> (9,9) -> (4.5,9) -> (4.5,6) -> (4.5,0)
    Wait, that's not right. Let me think...
    
    Actually Room 2 is rectangular: (4.5,0) -> (9,0) -> (9,9) -> (4.5,9)
    
  Layout:
     0    4.5    9
   0 +-----+-----+
     |     |     |
     |  1  |     |
     |     |  2  |
   6 +-----+     |
           |     |
   9       +-----+
*/

const createInitialRooms = (): Record<string, Room> => ({
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
    ],
  },
});

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
// GEOMETRY UTILITIES
// =============================================================================

/**
 * Get edges from a polygon room
 */
function getRoomEdges(room: Room): { start: Vertex; end: Vertex; roomId: string }[] {
  const edges: { start: Vertex; end: Vertex; roomId: string }[] = [];
  const vertices = room.vertices;
  
  for (let i = 0; i < vertices.length; i++) {
    const start = vertices[i];
    const end = vertices[(i + 1) % vertices.length];
    edges.push({ start, end, roomId: room.id });
  }
  
  return edges;
}

/**
 * Normalize an edge so start is always "less than" end
 * For horizontal edges: smaller x first
 * For vertical edges: smaller z first
 */
function normalizeEdge(start: Vertex, end: Vertex): { start: Vertex; end: Vertex; orientation: "horizontal" | "vertical" } {
  const isHorizontal = Math.abs(start.z - end.z) < 0.01;
  
  if (isHorizontal) {
    if (start.x <= end.x) {
      return { start, end, orientation: "horizontal" };
    } else {
      return { start: end, end: start, orientation: "horizontal" };
    }
  } else {
    if (start.z <= end.z) {
      return { start, end, orientation: "vertical" };
    } else {
      return { start: end, end: start, orientation: "vertical" };
    }
  }
}

// =============================================================================
// DERIVE WALLS FROM ROOMS
// =============================================================================

export function deriveWalls(rooms: Record<string, Room>): DerivedWall[] {
  const walls: DerivedWall[] = [];
  
  // Collect all edges with their normalized form AND direction
  // Direction is important: for interior walls, edges must face each other (opposite directions)
  type EdgeInfo = {
    roomId: string;
    orientation: "horizontal" | "vertical";
    position: number; // z for horizontal, x for vertical
    start: number;    // x for horizontal, z for vertical (normalized: start < end)
    end: number;
    direction: 1 | -1; // +1 if original went positive direction, -1 if negative
  };
  
  const allEdges: EdgeInfo[] = [];
  
  for (const room of Object.values(rooms)) {
    const edges = getRoomEdges(room);
    for (const edge of edges) {
      const normalized = normalizeEdge(edge.start, edge.end);
      
      if (normalized.orientation === "horizontal") {
        // For horizontal edges, direction is based on x movement
        // If original went left-to-right (x increasing), direction = +1
        const direction = edge.end.x > edge.start.x ? 1 : -1;
        allEdges.push({
          roomId: room.id,
          orientation: "horizontal",
          position: normalized.start.z,
          start: normalized.start.x,
          end: normalized.end.x,
          direction: direction as 1 | -1,
        });
      } else {
        // For vertical edges, direction is based on z movement
        // If original went top-to-bottom (z increasing), direction = +1
        const direction = edge.end.z > edge.start.z ? 1 : -1;
        allEdges.push({
          roomId: room.id,
          orientation: "vertical",
          position: normalized.start.x,
          start: normalized.start.z,
          end: normalized.end.z,
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
    
    // Collect all segment points
    const points = new Set<number>();
    for (const edge of edges) {
      points.add(edge.start);
      points.add(edge.end);
    }
    const sortedPoints = Array.from(points).sort((a, b) => a - b);
    
    // For each sub-segment, determine which rooms it belongs to
    for (let i = 0; i < sortedPoints.length - 1; i++) {
      const segStart = sortedPoints[i];
      const segEnd = sortedPoints[i + 1];
      
      // Find edges that contain this segment, tracking direction
      const positiveEdges: string[] = []; // rooms with edges going in positive direction
      const negativeEdges: string[] = []; // rooms with edges going in negative direction
      
      for (const edge of edges) {
        if (edge.start <= segStart + 0.01 && edge.end >= segEnd - 0.01) {
          if (edge.direction === 1) {
            positiveEdges.push(edge.roomId);
          } else {
            negativeEdges.push(edge.roomId);
          }
        }
      }
      
      // Interior wall detection:
      // For clockwise polygons, the "inside" of the room is on the RIGHT side of each edge.
      // 
      // For VERTICAL edges at position x:
      //   - Positive direction (z increasing, going down) → inside is at x- (left)
      //   - Negative direction (z decreasing, going up) → inside is at x+ (right)
      //   - Opposite directions → insides face TOWARD each other (one left, one right of wall)
      //   - This IS an interior wall!
      //
      // For HORIZONTAL edges at position z:
      //   - Positive direction (x increasing, going right) → inside is at z+ (below)
      //   - Negative direction (x decreasing, going left) → inside is at z- (above)
      //   - Opposite directions → insides face AWAY from each other (one above, one below)
      //   - This is NOT an interior wall!
      //
      // So for VERTICAL walls: opposite directions = interior
      // For HORIZONTAL walls: SAME direction from different rooms = interior
      
      // Get unique rooms for each direction
      const uniquePositive = [...new Set(positiveEdges)];
      const uniqueNegative = [...new Set(negativeEdges)];
      
      // Remove rooms that have BOTH directions on this segment (it's a notch in their boundary)
      // These rooms don't count for interior wall detection
      const positiveOnly = uniquePositive.filter(r => !uniqueNegative.includes(r));
      const negativeOnly = uniqueNegative.filter(r => !uniquePositive.includes(r));
      
      let isInterior = false;
      
      if (orientation === "vertical") {
        // Vertical walls: different rooms with opposite directions = interior
        // (their interiors face toward each other)
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
        // Horizontal walls: different rooms with SAME direction = interior
        // (because same direction means their interiors face the same way,
        //  which only happens when rooms are stacked vertically and share a wall)
        if (positiveOnly.length >= 2) {
          isInterior = true;
        } else if (negativeOnly.length >= 2) {
          isInterior = true;
        }
      }
      
      // Combine all rooms that have this edge
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
   * Move a wall by adjusting room vertices
   * 
   * Three cases to handle:
   * 1. Full edge move: Room's edge exactly matches the wall segment
   *    -> Simply move the boundary vertices
   * 2. Partial edge move: Wall is a subsegment of room's edge
   *    -> Insert step vertices to create a notch (ONLY for exterior walls)
   * 3. No match: Room doesn't have this wall as an edge
   *    -> Skip (shouldn't happen if wall.roomIds is correct)
   * 
   * IMPORTANT: Interior walls can ONLY move if ALL rooms have a full edge match.
   * This prevents interior walls from moving past exterior wall corners.
   */
  moveWall(wallId: string, direction: "up" | "down" | "left" | "right"): string | null {
    const walls = deriveWalls(state.rooms);
    const wall = walls.find(w => w.id === wallId);
    if (!wall) {
      return null;
    }

    const isHorizontal = wall.orientation === "horizontal";
    const isValidDirection = isHorizontal 
      ? (direction === "up" || direction === "down")
      : (direction === "left" || direction === "right");

    if (!isValidDirection) {
      return null;
    }

    const moveStep = wall.type === "exterior" ? EXTERIOR_MOVE_STEP : INTERIOR_MOVE_STEP;

    let delta = 0;
    if (direction === "up" || direction === "left") {
      delta = -moveStep;
    } else {
      delta = moveStep;
    }

    const wallPosition = isHorizontal ? wall.start.z : wall.start.x;
    const wallRangeStart = isHorizontal 
      ? Math.min(wall.start.x, wall.end.x) 
      : Math.min(wall.start.z, wall.end.z);
    const wallRangeEnd = isHorizontal 
      ? Math.max(wall.start.x, wall.end.x) 
      : Math.max(wall.start.z, wall.end.z);
    const newPosition = wallPosition + delta;

    // For interior walls, check that the SHRINKING room has a full edge match.
    // The shrinking room is the one where the wall moves INTO it.
    // If that room has a partial edge, moving would push the wall past an exterior corner.
    //
    // For vertical wall moving right (delta > 0): room on RIGHT shrinks
    // For vertical wall moving left (delta < 0): room on LEFT shrinks
    // For horizontal wall moving down (delta > 0): room BELOW shrinks
    // For horizontal wall moving up (delta < 0): room ABOVE shrinks
    if (wall.type === "interior") {
      for (const roomId of wall.roomIds) {
        const room = state.rooms[roomId];
        if (!room) continue;

        // Determine if this room is on the shrinking side
        // Find the room's center relative to the wall
        const roomCenter = isHorizontal
          ? room.vertices.reduce((sum, v) => sum + v.z, 0) / room.vertices.length
          : room.vertices.reduce((sum, v) => sum + v.x, 0) / room.vertices.length;
        
        const roomIsOnPositiveSide = roomCenter > wallPosition;
        const movingPositive = delta > 0;
        
        // Room shrinks when: moving positive AND room is on positive side
        //                 OR moving negative AND room is on negative side
        const roomShrinks = (movingPositive && roomIsOnPositiveSide) || 
                           (!movingPositive && !roomIsOnPositiveSide);
        
        if (!roomShrinks) {
          // This room expands - no constraint needed
          continue;
        }

        // Check if the shrinking room has a full edge match
        let hasFullEdgeMatch = false;
        
        for (let i = 0; i < room.vertices.length; i++) {
          const v1 = room.vertices[i];
          const v2 = room.vertices[(i + 1) % room.vertices.length];
          
          const isEdgeOnWallLine = isHorizontal
            ? (Math.abs(v1.z - wallPosition) < 0.01 && Math.abs(v2.z - wallPosition) < 0.01)
            : (Math.abs(v1.x - wallPosition) < 0.01 && Math.abs(v2.x - wallPosition) < 0.01);
          
          if (!isEdgeOnWallLine) continue;
          
          const edgeMin = isHorizontal ? Math.min(v1.x, v2.x) : Math.min(v1.z, v2.z);
          const edgeMax = isHorizontal ? Math.max(v1.x, v2.x) : Math.max(v1.z, v2.z);
          
          // Check if this edge exactly matches the wall range
          if (Math.abs(edgeMin - wallRangeStart) < 0.01 && Math.abs(edgeMax - wallRangeEnd) < 0.01) {
            hasFullEdgeMatch = true;
            break;
          }
        }
        
        if (!hasFullEdgeMatch) {
          // Shrinking room doesn't have a full edge match - block the move
          return null;
        }
      }
    }

    let moved = false;

    // For each room that owns this wall
    for (const roomId of wall.roomIds) {
      const room = state.rooms[roomId];
      if (!room) continue;

      // Find the edge(s) in this room that contain the wall segment
      // An edge is on the wall line if both vertices are at wallPosition
      for (let i = 0; i < room.vertices.length; i++) {
        const v1 = room.vertices[i];
        const v2 = room.vertices[(i + 1) % room.vertices.length];
        
        const isEdgeOnWallLine = isHorizontal
          ? (Math.abs(v1.z - wallPosition) < 0.01 && Math.abs(v2.z - wallPosition) < 0.01)
          : (Math.abs(v1.x - wallPosition) < 0.01 && Math.abs(v2.x - wallPosition) < 0.01);
        
        if (!isEdgeOnWallLine) continue;
        
        const edgeMin = isHorizontal ? Math.min(v1.x, v2.x) : Math.min(v1.z, v2.z);
        const edgeMax = isHorizontal ? Math.max(v1.x, v2.x) : Math.max(v1.z, v2.z);
        
        // Check if wall range overlaps with this edge
        if (wallRangeEnd <= edgeMin + 0.01 || wallRangeStart >= edgeMax - 0.01) {
          // No overlap
          continue;
        }
        
        // Determine if this is a full edge match or partial
        const isFullEdgeMatch = 
          Math.abs(edgeMin - wallRangeStart) < 0.01 && 
          Math.abs(edgeMax - wallRangeEnd) < 0.01;
        
        if (isFullEdgeMatch) {
          // CASE 1: Full edge move - just move the boundary vertices
          if (isHorizontal) {
            room.vertices[i].z = newPosition;
            room.vertices[(i + 1) % room.vertices.length].z = newPosition;
          } else {
            room.vertices[i].x = newPosition;
            room.vertices[(i + 1) % room.vertices.length].x = newPosition;
          }
          moved = true;
          break; // Done with this room
        } else {
          // CASE 2: Partial edge - need to insert/modify vertices
          // The wall is a subsegment of this edge
          // 
          // Key insight: we need to ensure vertices exist at wallRangeStart and wallRangeEnd,
          // then move the vertices within that range to the new position.
          
          const newVerts: Vertex[] = [];
          const nextVertexIndex = (i + 1) % room.vertices.length;
          
          for (let j = 0; j < room.vertices.length; j++) {
            const curr = room.vertices[j];
            const next = room.vertices[(j + 1) % room.vertices.length];
            
            if (j !== i) {
              // Not the edge we're modifying
              // But also skip if this vertex is the END of the modified edge
              // (it will be handled by the edge modification)
              if (j === nextVertexIndex) {
                // Check if this vertex is ON the wall line and within wall range
                // If so, it's being replaced by the moved segment
                const vertOnWallLine = isHorizontal
                  ? Math.abs(curr.z - wallPosition) < 0.01
                  : Math.abs(curr.x - wallPosition) < 0.01;
                const vertCoord = isHorizontal ? curr.x : curr.z;
                const vertInWallRange = vertCoord >= wallRangeStart - 0.01 && vertCoord <= wallRangeEnd + 0.01;
                
                if (vertOnWallLine && vertInWallRange) {
                  // Skip this vertex - it's being replaced
                  continue;
                }
              }
              newVerts.push({ ...curr });
            } else {
              // This is the edge we need to modify
              // The edge goes from curr to next along the wall line
              // We need to:
              // 1. Keep the part before wallRangeStart at original position
              // 2. Move the part from wallRangeStart to wallRangeEnd to newPosition
              // 3. Keep the part after wallRangeEnd at original position
              
              const currCoord = isHorizontal ? curr.x : curr.z;
              const nextCoord = isHorizontal ? next.x : next.z;
              const goingPositive = nextCoord > currCoord;
              
              if (goingPositive) {
                // Edge goes from smaller to larger coordinate
                // curr is at edgeMin, next is at edgeMax
                
                // Add curr if it's before wallRangeStart
                if (currCoord < wallRangeStart - 0.01) {
                  newVerts.push({ ...curr });
                  // Add point at wallRangeStart on original line
                  if (isHorizontal) {
                    newVerts.push({ x: wallRangeStart, z: wallPosition });
                  } else {
                    newVerts.push({ x: wallPosition, z: wallRangeStart });
                  }
                }
                
                // Add the moved segment
                if (isHorizontal) {
                  newVerts.push({ x: wallRangeStart, z: newPosition });
                  newVerts.push({ x: wallRangeEnd, z: newPosition });
                } else {
                  newVerts.push({ x: newPosition, z: wallRangeStart });
                  newVerts.push({ x: newPosition, z: wallRangeEnd });
                }
                
                // Add point at wallRangeEnd on original line if there's more edge after
                if (nextCoord > wallRangeEnd + 0.01) {
                  if (isHorizontal) {
                    newVerts.push({ x: wallRangeEnd, z: wallPosition });
                  } else {
                    newVerts.push({ x: wallPosition, z: wallRangeEnd });
                  }
                }
              } else {
                // Edge goes from larger to smaller coordinate
                // curr is at edgeMax, next is at edgeMin
                
                // Add curr if it's after wallRangeEnd
                if (currCoord > wallRangeEnd + 0.01) {
                  newVerts.push({ ...curr });
                  // Add point at wallRangeEnd on original line
                  if (isHorizontal) {
                    newVerts.push({ x: wallRangeEnd, z: wallPosition });
                  } else {
                    newVerts.push({ x: wallPosition, z: wallRangeEnd });
                  }
                }
                
                // Add the moved segment (in reverse order since we're going negative)
                if (isHorizontal) {
                  newVerts.push({ x: wallRangeEnd, z: newPosition });
                  newVerts.push({ x: wallRangeStart, z: newPosition });
                } else {
                  newVerts.push({ x: newPosition, z: wallRangeEnd });
                  newVerts.push({ x: newPosition, z: wallRangeStart });
                }
                
                // Add point at wallRangeStart on original line if there's more edge before
                if (nextCoord < wallRangeStart - 0.01) {
                  if (isHorizontal) {
                    newVerts.push({ x: wallRangeStart, z: wallPosition });
                  } else {
                    newVerts.push({ x: wallPosition, z: wallRangeStart });
                  }
                }
              }
            }
          }
          
          // Clean up duplicate consecutive vertices
          const cleaned: Vertex[] = [];
          for (const v of newVerts) {
            const prev = cleaned[cleaned.length - 1];
            if (!prev || Math.abs(prev.x - v.x) > 0.01 || Math.abs(prev.z - v.z) > 0.01) {
              cleaned.push(v);
            }
          }
          // Check if first and last are the same (closed polygon)
          if (cleaned.length > 1) {
            const first = cleaned[0];
            const last = cleaned[cleaned.length - 1];
            if (Math.abs(first.x - last.x) < 0.01 && Math.abs(first.z - last.z) < 0.01) {
              cleaned.pop();
            }
          }
          
          if (cleaned.length >= 3) {
            room.vertices = cleaned;
            moved = true;
          }
          break; // Done with this room
        }
      }
    }

    if (moved) {
      const newWallId = `wall-${wall.orientation}-${newPosition.toFixed(4)}-${wallRangeStart.toFixed(4)}-${wallRangeEnd.toFixed(4)}`;
      return newWallId;
    }

    return wallId;
  },

  moveSelectedWall(direction: "up" | "down" | "left" | "right") {
    if (!state.selectedWallId) return;
    
    const newWallId = this.moveWall(state.selectedWallId, direction);
    
    if (newWallId && newWallId !== state.selectedWallId) {
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
// COMPATIBILITY LAYER
// =============================================================================

export type Wall = {
  id: string;
  type: "exterior" | "interior";
  start: string;
  end: string;
};

export type Junction = {
  id: string;
  x: number;
  z: number;
};

export function getWallAsLegacyFormat(wall: DerivedWall): {
  wall: Wall;
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
