import { describe, it, expect } from "vitest";
import { deriveWalls, type Room, type DerivedWall, type Vertex } from "./use-building";

// Mock initial rooms
const createTestRooms = (): Record<string, Room> => ({
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

// Helper to find wall by criteria
function findWall(walls: DerivedWall[], criteria: {
  orientation?: "horizontal" | "vertical";
  type?: "interior" | "exterior";
  position?: number; // x for vertical, z for horizontal
  rangeStart?: number;
  rangeEnd?: number;
}): DerivedWall | undefined {
  return walls.find(w => {
    if (criteria.orientation && w.orientation !== criteria.orientation) return false;
    if (criteria.type && w.type !== criteria.type) return false;
    
    const pos = w.orientation === "horizontal" ? w.start.z : w.start.x;
    if (criteria.position !== undefined && Math.abs(pos - criteria.position) > 0.01) return false;
    
    const start = w.orientation === "horizontal" 
      ? Math.min(w.start.x, w.end.x) 
      : Math.min(w.start.z, w.end.z);
    const end = w.orientation === "horizontal"
      ? Math.max(w.start.x, w.end.x)
      : Math.max(w.start.z, w.end.z);
      
    if (criteria.rangeStart !== undefined && Math.abs(start - criteria.rangeStart) > 0.01) return false;
    if (criteria.rangeEnd !== undefined && Math.abs(end - criteria.rangeEnd) > 0.01) return false;
    
    return true;
  });
}

/**
 * Standalone move wall implementation for testing
 * This mirrors the logic in actions.moveWall but works on a copy of rooms
 */
function moveWallInRooms(
  rooms: Record<string, Room>,
  wallId: string,
  direction: "up" | "down" | "left" | "right"
): Record<string, Room> | null {
  const walls = deriveWalls(rooms);
  const wall = walls.find(w => w.id === wallId);
  if (!wall) return null;

  const isHorizontal = wall.orientation === "horizontal";
  const isValidDirection = isHorizontal
    ? (direction === "up" || direction === "down")
    : (direction === "left" || direction === "right");

  if (!isValidDirection) return null;

  const moveStep = wall.type === "exterior" ? 0.3 : 0.1;
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

  // For interior walls, check that ALL rooms have a full edge match
  // If any room only partially contains the wall, block the move
  if (wall.type === "interior") {
    for (const roomId of wall.roomIds) {
      const room = rooms[roomId];
      if (!room) continue;

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
        // This room doesn't have a full edge match - block the move
        return null;
      }
    }
  }

  // Deep clone rooms
  const newRooms: Record<string, Room> = {};
  for (const [key, room] of Object.entries(rooms)) {
    newRooms[key] = {
      ...room,
      vertices: room.vertices.map(v => ({ ...v })),
    };
  }

  let moved = false;

  // For each room that owns this wall
  for (const roomId of wall.roomIds) {
    const room = newRooms[roomId];
    if (!room) continue;

    // Find the edge(s) in this room that contain the wall segment
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
        continue;
      }

      // Determine if this is a full edge match or partial
      const isFullEdgeMatch =
        Math.abs(edgeMin - wallRangeStart) < 0.01 &&
        Math.abs(edgeMax - wallRangeEnd) < 0.01;

      if (isFullEdgeMatch) {
        // CASE 1: Full edge move
        if (isHorizontal) {
          room.vertices[i].z = newPosition;
          room.vertices[(i + 1) % room.vertices.length].z = newPosition;
        } else {
          room.vertices[i].x = newPosition;
          room.vertices[(i + 1) % room.vertices.length].x = newPosition;
        }
        moved = true;
        break;
      } else {
        // CASE 2: Partial edge - need to insert/modify vertices
        const newVerts: Vertex[] = [];

        for (let j = 0; j < room.vertices.length; j++) {
          const curr = room.vertices[j];
          const next = room.vertices[(j + 1) % room.vertices.length];

          if (j !== i) {
            newVerts.push({ ...curr });
          } else {
            const currCoord = isHorizontal ? curr.x : curr.z;
            const nextCoord = isHorizontal ? next.x : next.z;
            const goingPositive = nextCoord > currCoord;

            if (goingPositive) {
              if (currCoord < wallRangeStart - 0.01) {
                newVerts.push({ ...curr });
                if (isHorizontal) {
                  newVerts.push({ x: wallRangeStart, z: wallPosition });
                } else {
                  newVerts.push({ x: wallPosition, z: wallRangeStart });
                }
              }
              if (isHorizontal) {
                newVerts.push({ x: wallRangeStart, z: newPosition });
                newVerts.push({ x: wallRangeEnd, z: newPosition });
              } else {
                newVerts.push({ x: newPosition, z: wallRangeStart });
                newVerts.push({ x: newPosition, z: wallRangeEnd });
              }
              if (nextCoord > wallRangeEnd + 0.01) {
                if (isHorizontal) {
                  newVerts.push({ x: wallRangeEnd, z: wallPosition });
                } else {
                  newVerts.push({ x: wallPosition, z: wallRangeEnd });
                }
              }
            } else {
              if (currCoord > wallRangeEnd + 0.01) {
                newVerts.push({ ...curr });
                if (isHorizontal) {
                  newVerts.push({ x: wallRangeEnd, z: wallPosition });
                } else {
                  newVerts.push({ x: wallPosition, z: wallRangeEnd });
                }
              }
              if (isHorizontal) {
                newVerts.push({ x: wallRangeEnd, z: newPosition });
                newVerts.push({ x: wallRangeStart, z: newPosition });
              } else {
                newVerts.push({ x: newPosition, z: wallRangeEnd });
                newVerts.push({ x: newPosition, z: wallRangeStart });
              }
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

        // Clean up duplicates
        const cleaned: Vertex[] = [];
        for (const v of newVerts) {
          const prev = cleaned[cleaned.length - 1];
          if (!prev || Math.abs(prev.x - v.x) > 0.01 || Math.abs(prev.z - v.z) > 0.01) {
            cleaned.push(v);
          }
        }
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
        break;
      }
    }
  }

  return moved ? newRooms : null;
}

describe("deriveWalls", () => {
  it("should derive walls from L-shape rooms", () => {
    const rooms = createTestRooms();
    const walls = deriveWalls(rooms);
    
    console.log("\n=== Derived Walls ===");
    for (const wall of walls) {
      console.log(`${wall.id}: ${wall.type} [${wall.roomIds.join(", ")}]`);
      console.log(`  start: (${wall.start.x}, ${wall.start.z})`);
      console.log(`  end: (${wall.end.x}, ${wall.end.z})`);
    }
    
    // Should have multiple walls
    expect(walls.length).toBeGreaterThan(0);
    
    // Find interior wall at x=4.5 (shared between room1 and room2)
    const interiorWalls = walls.filter(w => w.type === "interior");
    console.log("\n=== Interior Walls ===");
    for (const wall of interiorWalls) {
      console.log(`${wall.id}: [${wall.roomIds.join(", ")}]`);
    }
    
    // There should be at least one interior wall
    expect(interiorWalls.length).toBeGreaterThan(0);
    
    // Interior wall should be the shared segment at x=4.5 from z=0 to z=6
    const sharedWall = interiorWalls.find(w => 
      w.orientation === "vertical" && 
      Math.abs(w.start.x - 4.5) < 0.01
    );
    expect(sharedWall).toBeDefined();
    expect(sharedWall?.roomIds).toContain("room1");
    expect(sharedWall?.roomIds).toContain("room2");
  });
  
  it("should identify exterior walls correctly", () => {
    const rooms = createTestRooms();
    const walls = deriveWalls(rooms);
    
    const exteriorWalls = walls.filter(w => w.type === "exterior");
    console.log("\n=== Exterior Walls ===");
    for (const wall of exteriorWalls) {
      console.log(`${wall.id}: [${wall.roomIds.join(", ")}]`);
    }
    
    // Exterior walls should only belong to one room
    for (const wall of exteriorWalls) {
      expect(wall.roomIds.length).toBe(1);
    }
    
    // Room 2's right wall at x=9 should be exterior
    const rightWall = exteriorWalls.find(w => 
      w.orientation === "vertical" && 
      Math.abs(w.start.x - 9) < 0.01
    );
    expect(rightWall).toBeDefined();
    expect(rightWall?.roomIds).toContain("room2");
  });
});

describe("moveWall", () => {
  it("should BLOCK interior wall move to right (room2 has partial edge at corner)", () => {
    const rooms = createTestRooms();
    const walls = deriveWalls(rooms);
    
    // Find interior wall at x=4.5 (z: 0 to 6)
    const interiorWall = findWall(walls, {
      orientation: "vertical",
      type: "interior",
      position: 4.5,
    });
    
    expect(interiorWall).toBeDefined();
    console.log("\n=== Attempting to move interior wall RIGHT (should be blocked) ===");
    console.log(`Wall ID: ${interiorWall!.id}`);
    console.log(`Wall range: z=${interiorWall!.start.z} to z=${interiorWall!.end.z}`);
    
    // Try to move it right - this should be BLOCKED because:
    // - Room 1 has full edge match (z: 0-6)
    // - Room 2 has partial edge (wall is z: 0-6, but room2's edge is z: 0-9)
    // Moving right would push the wall past the exterior corner
    const newRooms = moveWallInRooms(rooms, interiorWall!.id, "right");
    
    // Move should be blocked
    expect(newRooms).toBeNull();
    console.log("Move blocked as expected - interior wall sits at exterior corner");
  });
  
  it("should ALLOW interior wall move to left (shrinks room1)", () => {
    const rooms = createTestRooms();
    const walls = deriveWalls(rooms);
    
    // Find interior wall at x=4.5 (z: 0 to 6)
    const interiorWall = findWall(walls, {
      orientation: "vertical",
      type: "interior",
      position: 4.5,
    });
    
    expect(interiorWall).toBeDefined();
    console.log("\n=== Moving interior wall LEFT (should be allowed) ===");
    console.log(`Wall ID: ${interiorWall!.id}`);
    console.log(`Wall range: z=${interiorWall!.start.z} to z=${interiorWall!.end.z}`);
    
    // Move it left - this should work because:
    // - Room 1 has full edge match at x=4.5 (z: 0-6)
    // - Room 2 also has a full edge match for the z: 0-6 segment
    // Wait, actually room2's left edge goes from z=0 to z=9, so it's still partial
    // The constraint should block this too
    const newRooms = moveWallInRooms(rooms, interiorWall!.id, "left");
    
    // This should also be blocked because room2 doesn't have a full edge match
    expect(newRooms).toBeNull();
    console.log("Move blocked - room2 has partial edge match");
  });
  
  it("should move interior wall when both rooms have full edge match", () => {
    // Create two rectangular rooms that share a complete edge
    const rooms: Record<string, Room> = {
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
          { x: 9, z: 6 },  // Same height as room1!
          { x: 4.5, z: 6 },
        ],
      },
    };
    
    const walls = deriveWalls(rooms);
    
    // Find interior wall at x=4.5 (z: 0 to 6)
    const interiorWall = findWall(walls, {
      orientation: "vertical",
      type: "interior",
      position: 4.5,
    });
    
    expect(interiorWall).toBeDefined();
    console.log("\n=== Moving interior wall (both rooms full edge match) ===");
    console.log(`Wall ID: ${interiorWall!.id}`);
    
    // Move it right by 0.1m (interior step)
    const newRooms = moveWallInRooms(rooms, interiorWall!.id, "right");
    expect(newRooms).not.toBeNull();
    
    if (newRooms) {
      console.log("\n--- Room 1 vertices after move ---");
      for (const v of newRooms.room1.vertices) {
        console.log(`  (${v.x}, ${v.z})`);
      }
      
      console.log("\n--- Room 2 vertices after move ---");
      for (const v of newRooms.room2.vertices) {
        console.log(`  (${v.x}, ${v.z})`);
      }
      
      // Room 1's right edge should now be at x=4.6 (full edge move)
      const room1RightX = Math.max(...newRooms.room1.vertices.map(v => v.x));
      console.log(`Room 1 right edge: ${room1RightX}`);
      expect(Math.abs(room1RightX - 4.6)).toBeLessThan(0.01);
      
      // Room 2's left edge should now be at x=4.6
      const room2LeftX = Math.min(...newRooms.room2.vertices.map(v => v.x));
      console.log(`Room 2 left edge: ${room2LeftX}`);
      expect(Math.abs(room2LeftX - 4.6)).toBeLessThan(0.01);
      
      // Both rooms should still be rectangles (4 vertices each)
      expect(newRooms.room1.vertices.length).toBe(4);
      expect(newRooms.room2.vertices.length).toBe(4);
      
      // Derive walls again
      const newWalls = deriveWalls(newRooms);
      console.log("\n=== Walls after move ===");
      for (const w of newWalls) {
        console.log(`${w.id}: ${w.type}`);
      }
      
      // Interior wall should now be at x=4.6 for z: 0-6
      const movedInteriorWall = findWall(newWalls, {
        orientation: "vertical",
        type: "interior",
        position: 4.6,
        rangeStart: 0,
        rangeEnd: 6,
      });
      
      expect(movedInteriorWall).toBeDefined();
    }
  });
  
  it("should move exterior wall (full edge) on room1 bottom", () => {
    const rooms = createTestRooms();
    const walls = deriveWalls(rooms);
    
    // Find room1's bottom wall at z=0 (x: 0 to 4.5)
    const bottomWall = findWall(walls, {
      orientation: "horizontal",
      type: "exterior",
      position: 0,
      rangeStart: 0,
      rangeEnd: 4.5,
    });
    
    expect(bottomWall).toBeDefined();
    console.log("\n=== Moving room1 bottom exterior wall ===");
    console.log(`Wall ID: ${bottomWall!.id}`);
    
    // Move it down (positive z) by 0.3m (exterior step)
    const newRooms = moveWallInRooms(rooms, bottomWall!.id, "down");
    expect(newRooms).not.toBeNull();
    
    if (newRooms) {
      // Room 1's bottom edge should now be at z=0.3
      const room1 = newRooms.room1;
      const room1MinZ = Math.min(...room1.vertices.map(v => v.z));
      console.log(`Room 1 min Z: ${room1MinZ}`);
      expect(Math.abs(room1MinZ - 0.3)).toBeLessThan(0.01);
      
      // Room 1 should still be valid (4 vertices for rectangle)
      expect(room1.vertices.length).toBe(4);
      
      console.log("Room 1 vertices after move:");
      for (const v of room1.vertices) {
        console.log(`  (${v.x}, ${v.z})`);
      }
    }
  });
  
  it("should move partial exterior wall (room2 top at z=0)", () => {
    const rooms = createTestRooms();
    const walls = deriveWalls(rooms);
    
    // Find room2's top wall at z=0 (x: 4.5 to 9)
    const topWall = findWall(walls, {
      orientation: "horizontal",
      type: "exterior",
      position: 0,
      rangeStart: 4.5,
      rangeEnd: 9,
    });
    
    expect(topWall).toBeDefined();
    console.log("\n=== Moving room2 top exterior wall ===");
    console.log(`Wall ID: ${topWall!.id}`);
    
    // Move it up (negative z) by 0.3m (exterior step)
    const newRooms = moveWallInRooms(rooms, topWall!.id, "up");
    expect(newRooms).not.toBeNull();
    
    if (newRooms) {
      console.log("\n--- Room 2 vertices after move ---");
      for (const v of newRooms.room2.vertices) {
        console.log(`  (${v.x}, ${v.z})`);
      }
      
      // Room 2 should have z=-0.3 on some vertices
      const room2MinZ = Math.min(...newRooms.room2.vertices.map(v => v.z));
      console.log(`Room 2 min Z: ${room2MinZ}`);
      expect(Math.abs(room2MinZ - (-0.3))).toBeLessThan(0.01);
      
      // Room 2 should still be valid (4 vertices)
      expect(newRooms.room2.vertices.length).toBe(4);
    }
  });
  
  it("should move left exterior wall right and shrink connected horizontal walls", () => {
    const rooms = createTestRooms();
    const walls = deriveWalls(rooms);
    
    // Find room1's left wall at x=0 (z: 0 to 6)
    const leftWall = findWall(walls, {
      orientation: "vertical",
      type: "exterior",
      position: 0,
      rangeStart: 0,
      rangeEnd: 6,
    });
    
    expect(leftWall).toBeDefined();
    console.log("\n=== Moving room1 left exterior wall right ===");
    console.log(`Wall ID: ${leftWall!.id}`);
    
    // Move it right (positive x) by 0.3m (exterior step)
    const newRooms = moveWallInRooms(rooms, leftWall!.id, "right");
    expect(newRooms).not.toBeNull();
    
    if (newRooms) {
      console.log("\n--- Room 1 vertices after move ---");
      for (const v of newRooms.room1.vertices) {
        console.log(`  (${v.x}, ${v.z})`);
      }
      
      // Room 1's left edge should now be at x=0.3
      const room1 = newRooms.room1;
      const room1MinX = Math.min(...room1.vertices.map(v => v.x));
      console.log(`Room 1 min X: ${room1MinX}`);
      expect(Math.abs(room1MinX - 0.3)).toBeLessThan(0.01);
      
      // The top wall should now start at x=0.3 (shrunk)
      const newWalls = deriveWalls(newRooms);
      const newTopWall = findWall(newWalls, {
        orientation: "horizontal",
        type: "exterior",
        position: 0,
        rangeStart: 0.3,
      });
      
      console.log("\n--- Walls after left wall moved ---");
      for (const w of newWalls) {
        if (w.orientation === "horizontal" && Math.abs(w.start.z) < 0.01) {
          console.log(`  ${w.id}: x=${w.start.x}→${w.end.x}`);
        }
      }
      
      expect(newTopWall).toBeDefined();
      expect(newTopWall!.start.x).toBeCloseTo(0.3, 1);
      
      // The bottom wall should also start at x=0.3 (shrunk)
      const newBottomWall = findWall(newWalls, {
        orientation: "horizontal",
        type: "exterior",
        position: 6,
        rangeStart: 0.3,
      });
      
      expect(newBottomWall).toBeDefined();
    }
  });
  
  it("should move exterior wall after interior wall has been moved (with matching rooms)", () => {
    // Create two rectangular rooms with matching heights (full edge match)
    let rooms: Record<string, Room> = {
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
          { x: 9, z: 6 },  // Same height!
          { x: 4.5, z: 6 },
        ],
      },
    };
    let walls = deriveWalls(rooms);
    
    // First, move the interior wall at x=4.5 to the right
    const interiorWall = findWall(walls, {
      orientation: "vertical",
      type: "interior",
      position: 4.5,
    });
    
    expect(interiorWall).toBeDefined();
    console.log("\n=== Step 1: Move interior wall right ===");
    
    rooms = moveWallInRooms(rooms, interiorWall!.id, "right")!;
    expect(rooms).not.toBeNull();
    
    console.log("Room 1 after interior move:");
    for (const v of rooms.room1.vertices) {
      console.log(`  (${v.x}, ${v.z})`);
    }
    console.log("Room 2 after interior move:");
    for (const v of rooms.room2.vertices) {
      console.log(`  (${v.x}, ${v.z})`);
    }
    
    // Now get the new walls
    walls = deriveWalls(rooms);
    console.log("\nWalls after interior move:");
    for (const w of walls) {
      console.log(`  ${w.id}: ${w.type}`);
    }
    
    // Now try to move the left exterior wall at x=0 to the right
    const leftWall = findWall(walls, {
      orientation: "vertical",
      type: "exterior",
      position: 0,
    });
    
    expect(leftWall).toBeDefined();
    console.log("\n=== Step 2: Move left exterior wall right ===");
    console.log(`Wall ID: ${leftWall!.id}`);
    
    const finalRooms = moveWallInRooms(rooms, leftWall!.id, "right");
    expect(finalRooms).not.toBeNull();
    
    if (finalRooms) {
      console.log("\nRoom 1 after left wall move:");
      for (const v of finalRooms.room1.vertices) {
        console.log(`  (${v.x}, ${v.z})`);
      }
      
      // Room 1's left edge should now be at x=0.3
      const room1MinX = Math.min(...finalRooms.room1.vertices.map(v => v.x));
      console.log(`Room 1 min X: ${room1MinX}`);
      expect(Math.abs(room1MinX - 0.3)).toBeLessThan(0.01);
      
      // Derive walls and check
      const finalWalls = deriveWalls(finalRooms);
      console.log("\nFinal walls:");
      for (const w of finalWalls) {
        console.log(`  ${w.id}: ${w.type}`);
      }
      
      // The top wall of room1 should now go from x=0.3
      const topWall = finalWalls.find(w => 
        w.orientation === "horizontal" && 
        Math.abs(w.start.z) < 0.01 &&
        Math.abs(w.start.x - 0.3) < 0.01
      );
      expect(topWall).toBeDefined();
    }
  });
  
  it("should move bottom wall and keep corners connected (exterior wall partial)", () => {
    // Start with the L-shape rooms
    const rooms = createTestRooms();
    const walls = deriveWalls(rooms);
    
    console.log("\n=== Testing bottom wall move (partial exterior) ===");
    console.log("Room 1 vertices:");
    for (const v of rooms.room1.vertices) {
      console.log(`  (${v.x}, ${v.z})`);
    }
    
    // Find the bottom wall of room1 at z=6 (x: 0 to 4.5)
    const bottomWall = findWall(walls, {
      orientation: "horizontal",
      type: "exterior", 
      position: 6,
      rangeStart: 0,
      rangeEnd: 4.5,
    });
    
    expect(bottomWall).toBeDefined();
    console.log(`Bottom wall: ${bottomWall!.id}`);
    console.log(`  Range: x=${bottomWall!.start.x} to x=${bottomWall!.end.x}`);
    
    // Move it down - this should work since it's a full edge match for room1
    const finalRooms = moveWallInRooms(rooms, bottomWall!.id, "down");
    expect(finalRooms).not.toBeNull();
    
    console.log("\nRoom 1 after bottom wall move:");
    if (finalRooms) {
      for (const v of finalRooms.room1.vertices) {
        console.log(`  (${v.x}, ${v.z})`);
      }
      
      // Room 1's bottom edge should now be at z=6.3
      const room1MaxZ = Math.max(...finalRooms.room1.vertices.map(v => v.z));
      console.log(`Room 1 max Z: ${room1MaxZ}`);
      expect(Math.abs(room1MaxZ - 6.3)).toBeLessThan(0.01);
    }
  });
});

describe("exterior wall edge cases", () => {
  it("should move exterior wall at x=4.5 z=6-9 and keep corner connected", () => {
    // Start with rooms after interior wall move
    const rooms: Record<string, Room> = {
      room1: {
        id: "room1",
        name: "Room 1",
        vertices: [
          { x: 0, z: 0 },
          { x: 4.6, z: 0 },
          { x: 4.6, z: 6 },
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
          { x: 4.6, z: 6 },
          { x: 4.6, z: 0 },
        ],
      },
    };
    
    let walls = deriveWalls(rooms);
    
    // Find exterior wall at x=4.5, z=6→9
    const exteriorWall = walls.find(w => 
      w.orientation === "vertical" &&
      w.type === "exterior" &&
      Math.abs(w.start.x - 4.5) < 0.01 &&
      Math.abs(Math.min(w.start.z, w.end.z) - 6) < 0.01
    );
    
    expect(exteriorWall).toBeDefined();
    console.log("\n=== Moving exterior wall at x=4.5, z=6-9 ===");
    console.log(`Wall: ${exteriorWall!.id}`);
    
    // Move it right
    const newRooms = moveWallInRooms(rooms, exteriorWall!.id, "right");
    expect(newRooms).not.toBeNull();
    
    if (newRooms) {
      console.log("\n--- Room 2 vertices after move ---");
      for (const v of newRooms.room2.vertices) {
        console.log(`  (${v.x}, ${v.z})`);
      }
      
      // The vertex that was at (4.5, 9) should have moved to (4.8, 9)
      const movedVertexAtZ9 = newRooms.room2.vertices.find(v => 
        Math.abs(v.z - 9) < 0.01 && Math.abs(v.x - 4.8) < 0.01
      );
      console.log(`Vertex at z=9: ${movedVertexAtZ9 ? `(${movedVertexAtZ9.x}, ${movedVertexAtZ9.z})` : "NOT FOUND at x=4.8"}`);
      expect(movedVertexAtZ9).toBeDefined();
      
      // The vertex at z=6 (corner) should also have moved from x=4.5 to x=4.8
      // This ensures the horizontal wall stretches
      const cornerVertex = newRooms.room2.vertices.find(v => 
        Math.abs(v.z - 6) < 0.01 && Math.abs(v.x - 4.8) < 0.01
      );
      console.log(`Corner vertex at z=6: ${cornerVertex ? `(${cornerVertex.x}, ${cornerVertex.z})` : "NOT FOUND at x=4.8"}`);
      expect(cornerVertex).toBeDefined();
    }
  });
});
