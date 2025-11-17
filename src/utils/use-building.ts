import { proxy, useSnapshot } from "valtio";

// All measurements in meters (300mm = 0.3m grid)
export const GRID_SIZE = 0.3; // 300mm
export const WALL_THICKNESS = 0.3; // 300mm for exterior walls
export const INTERIOR_WALL_THICKNESS = 0.15; // 150mm for interior walls (0.5 grid units)
export const DEFAULT_WALL_HEIGHT = 2.7; // 2700mm standard ceiling height

export type Point2D = {
  x: number; // in grid units (multiply by GRID_SIZE to get meters)
  y: number; // in grid units
};

export type Wall = {
  id: string;
  start: Point2D;
  end: Point2D;
  thickness: number; // always 0.3m for now
  height: number; // wall height in meters
  isExterior: boolean;
};

// Connectivity index: maps point coordinates to wall IDs at that point
type PointKey = string; // Format: "x,y"
type ConnectivityIndex = Record<PointKey, string[]>; // point -> wallIds

export type Floor = {
  id: string;
  level: number; // 0 for ground floor, 1 for first floor, etc.
  walls: Record<string, Wall>; // wallId -> Wall (O(1) access) - exterior walls
  wallIds: string[]; // Ordered list for iteration/rendering - exterior walls
  interiorWalls: Record<string, Wall>; // wallId -> Wall - interior walls
  interiorWallIds: string[]; // Ordered list for interior walls
  connectivity: ConnectivityIndex; // point -> wallIds at that point
  height: number; // floor-to-ceiling height
};

export type Building = {
  floors: Record<string, Floor>; // floorId -> Floor (O(1) access)
  floorIds: string[]; // Ordered list for iteration
  selectedWallId: string | null;
  selectedFloorId: string | null; // Track which floor the selected wall is on
};

export type WallOrientation = "horizontal" | "vertical";

// Segment types for visual rendering
export type SegmentType = "NORMAL" | "ATTACHMENT_POINT";

export type WallSegment = {
  startPos: number; // Position along wall (0 to 1)
  endPos: number;
  type: SegmentType;
};

// Helper function to determine wall orientation
export function getWallOrientation(wall: Wall): WallOrientation {
  return wall.start.y === wall.end.y ? "horizontal" : "vertical";
}

// Find attachment points where interior walls intersect an exterior wall
export function findAttachmentPoints(
  exteriorWall: Wall,
  floor: Floor
): number[] {
  const attachmentPoints: number[] = [];
  const orientation = getWallOrientation(exteriorWall);

  // Check each interior wall
  for (const interiorWallId of floor.interiorWallIds) {
    const interiorWall = floor.interiorWalls[interiorWallId];
    if (!interiorWall) continue;

    const interiorOrientation = getWallOrientation(interiorWall);

    // Only perpendicular walls can create attachments
    if (orientation === interiorOrientation) continue;

    if (orientation === "horizontal") {
      // Horizontal exterior wall (constant Y)
      // Check if vertical interior wall intersects
      const interiorX = interiorWall.start.x;
      const exteriorY = exteriorWall.start.y;
      const halfThickness = WALL_THICKNESS / GRID_SIZE / 2; // 0.5 grid units

      // Interior wall endpoints are offset by halfThickness
      const interiorStartY = interiorWall.start.y;
      const interiorEndY = interiorWall.end.y;

      // Check if interior wall touches this horizontal exterior wall
      const touchesStart = Math.abs(interiorStartY - exteriorY) < halfThickness + 0.01;
      const touchesEnd = Math.abs(interiorEndY - exteriorY) < halfThickness + 0.01;

      if (touchesStart || touchesEnd) {
        // Calculate position along exterior wall (0 to 1)
        const wallLength = Math.abs(exteriorWall.end.x - exteriorWall.start.x);
        const position = Math.abs(interiorX - exteriorWall.start.x) / wallLength;

        if (position >= 0 && position <= 1) {
          attachmentPoints.push(position);
        }
      }
    } else {
      // Vertical exterior wall (constant X)
      // Check if horizontal interior wall intersects
      const interiorY = interiorWall.start.y;
      const exteriorX = exteriorWall.start.x;
      const halfThickness = WALL_THICKNESS / GRID_SIZE / 2;

      const interiorStartX = interiorWall.start.x;
      const interiorEndX = interiorWall.end.x;

      const touchesStart = Math.abs(interiorStartX - exteriorX) < halfThickness + 0.01;
      const touchesEnd = Math.abs(interiorEndX - exteriorX) < halfThickness + 0.01;

      if (touchesStart || touchesEnd) {
        const wallLength = Math.abs(exteriorWall.end.y - exteriorWall.start.y);
        const position = Math.abs(interiorY - exteriorWall.start.y) / wallLength;

        if (position >= 0 && position <= 1) {
          attachmentPoints.push(position);
        }
      }
    }
  }

  return attachmentPoints.sort((a, b) => a - b);
}

// Calculate segments for a wall based on attachment points
export function calculateWallSegments(
  wall: Wall,
  floor: Floor
): WallSegment[] {
  // Only exterior walls can have segments
  if (!wall.isExterior) {
    return [{ startPos: 0, endPos: 1, type: "NORMAL" }];
  }

  const attachmentPoints = findAttachmentPoints(wall, floor);

  if (attachmentPoints.length === 0) {
    return [{ startPos: 0, endPos: 1, type: "NORMAL" }];
  }

  const segments: WallSegment[] = [];
  const orientation = getWallOrientation(wall);
  const wallLength = orientation === "horizontal"
    ? Math.abs(wall.end.x - wall.start.x)
    : Math.abs(wall.end.y - wall.start.y);

  // Interior wall width in grid units (0.5)
  const interiorWidthGridUnits = INTERIOR_WALL_THICKNESS / GRID_SIZE;
  // Half width as a fraction of the wall length
  const halfWidth = (interiorWidthGridUnits / 2) / wallLength;

  let currentPos = 0;

  for (const attachPoint of attachmentPoints) {
    // Add normal segment before attachment point
    if (attachPoint - halfWidth > currentPos) {
      segments.push({
        startPos: currentPos,
        endPos: attachPoint - halfWidth,
        type: "NORMAL"
      });
    }

    // Add attachment point segment (150mm wide)
    segments.push({
      startPos: attachPoint - halfWidth,
      endPos: attachPoint + halfWidth,
      type: "ATTACHMENT_POINT"
    });

    currentPos = attachPoint + halfWidth;
  }

  // Add final normal segment
  if (currentPos < 1) {
    segments.push({
      startPos: currentPos,
      endPos: 1,
      type: "NORMAL"
    });
  }

  return segments;
}

// Helper function to create point key for connectivity index
function pointKey(x: number, y: number): PointKey {
  return `${x},${y}`;
}

// Helper function to create a wall
function createWall(
  id: string,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  isExterior = true
): Wall {
  return {
    id,
    start: { x: startX, y: startY },
    end: { x: endX, y: endY },
    thickness: isExterior ? WALL_THICKNESS : INTERIOR_WALL_THICKNESS,
    height: DEFAULT_WALL_HEIGHT,
    isExterior,
  };
}

// Build connectivity index for a floor
function buildConnectivityIndex(
  walls: Record<string, Wall>
): ConnectivityIndex {
  const index: ConnectivityIndex = {};

  for (const wall of Object.values(walls)) {
    const startKey = pointKey(wall.start.x, wall.start.y);
    const endKey = pointKey(wall.end.x, wall.end.y);

    if (!index[startKey]) index[startKey] = [];
    if (!index[endKey]) index[endKey] = [];

    index[startKey].push(wall.id);
    index[endKey].push(wall.id);
  }

  return index;
}

// Create a simple rectangular floor plan (6m x 4.8m = 20 x 16 grid units)
function createDefaultFloorPlan(): Floor {
  const width = 20; // 6m
  const length = 16; // 4.8m

  const wallList = [
    // Bottom wall (along X axis)
    createWall("wall-1", 0, 0, width, 0),
    // Right wall (along Y axis)
    createWall("wall-2", width, 0, width, length),
    // Top wall (along X axis)
    createWall("wall-3", width, length, 0, length),
    // Left wall (along Y axis)
    createWall("wall-4", 0, length, 0, 0),
  ];

  const walls: Record<string, Wall> = {};
  const wallIds: string[] = [];

  for (const wall of wallList) {
    walls[wall.id] = wall;
    wallIds.push(wall.id);
  }

  // Add one interior wall that touches the inside surfaces of exterior walls
  const halfExteriorThickness = WALL_THICKNESS / GRID_SIZE / 2; // 0.5 grid units
  const interiorWall = createWall(
    "wall-5",
    10,
    0 + halfExteriorThickness,  // Start at inside surface of bottom wall
    10,
    16 - halfExteriorThickness, // End at inside surface of top wall
    false
  );
  const interiorWalls: Record<string, Wall> = {
    [interiorWall.id]: interiorWall,
  };
  const interiorWallIds: string[] = [interiorWall.id];

  return {
    id: "floor-0",
    level: 0,
    height: DEFAULT_WALL_HEIGHT,
    walls,
    wallIds,
    interiorWalls,
    interiorWallIds,
    connectivity: buildConnectivityIndex(walls),
  };
}

// Initial building state with one floor
const floor0 = createDefaultFloorPlan();
const initialBuilding: Building = {
  floors: {
    [floor0.id]: floor0,
  },
  floorIds: [floor0.id],
  selectedWallId: null,
  selectedFloorId: null,
};

const state = proxy(initialBuilding);

export function useBuilding() {
  return useSnapshot(state) as Building;
}

export function getBuildingState() {
  return state;
}

// Helper: get selected wall (O(1)) - checks both exterior and interior walls
function getSelectedWall(): { wall: Wall; floor: Floor; isInterior: boolean } | null {
  if (!state.selectedWallId || !state.selectedFloorId) return null;

  const floor = state.floors[state.selectedFloorId];
  if (!floor) return null;

  // Check exterior walls first
  let wall = floor.walls[state.selectedWallId];
  if (wall) return { wall, floor, isInterior: false };

  // Check interior walls
  wall = floor.interiorWalls[state.selectedWallId];
  if (wall) return { wall, floor, isInterior: true };

  return null;
}

// Helper function to check if two points are the same
function pointsEqual(p1: Point2D, p2: Point2D): boolean {
  return p1.x === p2.x && p1.y === p2.y;
}

// Helper function to find walls connected to a specific point using connectivity index (O(1))
function findWallsConnectedToPoint(
  floor: Floor,
  point: Point2D,
  excludeWallId: string
): Wall[] {
  const key = pointKey(point.x, point.y);
  const connectedWallIds = floor.connectivity[key] || [];

  return connectedWallIds
    .filter((id) => id !== excludeWallId)
    .map((id) => floor.walls[id])
    .filter(Boolean); // Remove any undefined entries
}

// Update a wall's endpoint and connectivity index
function updateWallEndpoint(
  floor: Floor,
  wall: Wall,
  oldPoint: Point2D,
  newPoint: Point2D
) {
  const oldKey = pointKey(oldPoint.x, oldPoint.y);
  const newKey = pointKey(newPoint.x, newPoint.y);

  // Update wall coordinates
  if (pointsEqual(wall.start, oldPoint)) {
    wall.start.x = newPoint.x;
    wall.start.y = newPoint.y;
  }
  if (pointsEqual(wall.end, oldPoint)) {
    wall.end.x = newPoint.x;
    wall.end.y = newPoint.y;
  }

  // Update connectivity index
  if (oldKey !== newKey) {
    // Remove from old point
    if (floor.connectivity[oldKey]) {
      floor.connectivity[oldKey] = floor.connectivity[oldKey].filter(
        (id) => id !== wall.id
      );
      if (floor.connectivity[oldKey].length === 0) {
        delete floor.connectivity[oldKey];
      }
    }

    // Add to new point
    if (!floor.connectivity[newKey]) {
      floor.connectivity[newKey] = [];
    }
    if (!floor.connectivity[newKey].includes(wall.id)) {
      floor.connectivity[newKey].push(wall.id);
    }
  }
}

// Actions object - all state mutations go here
export const actions = {
  selectWall(wallId: string | null, floorId?: string | null) {
    state.selectedWallId = wallId;

    // If wallId is provided but floorId isn't, find which floor it's on
    if (wallId && !floorId) {
      for (const fId of state.floorIds) {
        const floor = state.floors[fId];
        if (floor.walls[wallId] || floor.interiorWalls[wallId]) {
          state.selectedFloorId = fId;
          return;
        }
      }
    }

    state.selectedFloorId = floorId || null;
  },

  moveSelectedWall(direction: "up" | "down" | "left" | "right") {
    const selected = getSelectedWall();
    if (!selected) return;

    const { wall, floor, isInterior } = selected;
    const orientation = getWallOrientation(wall);

    // Interior walls move independently but stay attached to exterior wall surfaces
    if (isInterior) {
      const halfExteriorThickness = WALL_THICKNESS / GRID_SIZE / 2; // 0.5 grid units

      if (orientation === "vertical") {
        // Vertical interior walls move left/right
        if (direction === "left") {
          wall.start.x -= 1;
          wall.end.x -= 1;
        } else if (direction === "right") {
          wall.start.x += 1;
          wall.end.x += 1;
        }

        // Keep endpoints attached to top and bottom exterior walls (inside surface)
        const bottomWall = floor.wallIds
          .map(id => floor.walls[id])
          .find(w => getWallOrientation(w) === "horizontal" &&
                     w.start.y === Math.min(...floor.wallIds.map(id => floor.walls[id].start.y)));
        const topWall = floor.wallIds
          .map(id => floor.walls[id])
          .find(w => getWallOrientation(w) === "horizontal" &&
                     w.start.y === Math.max(...floor.wallIds.map(id => floor.walls[id].start.y)));

        if (bottomWall) {
          wall.start.y = bottomWall.start.y + halfExteriorThickness;
        }
        if (topWall) {
          wall.end.y = topWall.start.y - halfExteriorThickness;
        }
      }

      return; // Interior walls don't update connectivity for exterior walls
    }

    // Store old positions
    const oldStart = { x: wall.start.x, y: wall.start.y };
    const oldEnd = { x: wall.end.x, y: wall.end.y };

    // Calculate new positions
    let newStart = { ...oldStart };
    let newEnd = { ...oldEnd };

    // Horizontal walls can only move up/down (along Y axis)
    if (orientation === "horizontal") {
      if (direction === "up") {
        newStart.y -= 1;
        newEnd.y -= 1;
      } else if (direction === "down") {
        newStart.y += 1;
        newEnd.y += 1;
      } else {
        // Invalid direction for horizontal wall
        return;
      }
    }
    // Vertical walls can only move left/right (along X axis)
    else if (orientation === "vertical") {
      if (direction === "left") {
        newStart.x -= 1;
        newEnd.x -= 1;
      } else if (direction === "right") {
        newStart.x += 1;
        newEnd.x += 1;
      } else {
        // Invalid direction for vertical wall
        return;
      }
    }

    // Update the selected wall
    wall.start = newStart;
    wall.end = newEnd;

    // Update connectivity for the moved wall
    const oldStartKey = pointKey(oldStart.x, oldStart.y);
    const oldEndKey = pointKey(oldEnd.x, oldEnd.y);
    const newStartKey = pointKey(newStart.x, newStart.y);
    const newEndKey = pointKey(newEnd.x, newEnd.y);

    // Remove from old positions
    if (oldStartKey !== newStartKey) {
      if (floor.connectivity[oldStartKey]) {
        floor.connectivity[oldStartKey] = floor.connectivity[
          oldStartKey
        ].filter((id) => id !== wall.id);
        if (floor.connectivity[oldStartKey].length === 0) {
          delete floor.connectivity[oldStartKey];
        }
      }
      if (!floor.connectivity[newStartKey])
        floor.connectivity[newStartKey] = [];
      if (!floor.connectivity[newStartKey].includes(wall.id)) {
        floor.connectivity[newStartKey].push(wall.id);
      }
    }

    if (oldEndKey !== newEndKey) {
      if (floor.connectivity[oldEndKey]) {
        floor.connectivity[oldEndKey] = floor.connectivity[oldEndKey].filter(
          (id) => id !== wall.id
        );
        if (floor.connectivity[oldEndKey].length === 0) {
          delete floor.connectivity[oldEndKey];
        }
      }
      if (!floor.connectivity[newEndKey]) floor.connectivity[newEndKey] = [];
      if (!floor.connectivity[newEndKey].includes(wall.id)) {
        floor.connectivity[newEndKey].push(wall.id);
      }
    }

    // Find and update connected walls at the start point
    const connectedAtStart = findWallsConnectedToPoint(
      floor,
      oldStart,
      wall.id
    );
    connectedAtStart.forEach((connectedWall) => {
      updateWallEndpoint(floor, connectedWall, oldStart, newStart);
    });

    // Find and update connected walls at the end point
    const connectedAtEnd = findWallsConnectedToPoint(floor, oldEnd, wall.id);
    connectedAtEnd.forEach((connectedWall) => {
      updateWallEndpoint(floor, connectedWall, oldEnd, newEnd);
    });

    // Update interior walls that are attached to this exterior wall
    const halfExteriorThickness = WALL_THICKNESS / GRID_SIZE / 2; // 0.5 grid units

    for (const interiorWallId of floor.interiorWallIds) {
      const interiorWall = floor.interiorWalls[interiorWallId];
      if (!interiorWall) continue;

      const interiorOrientation = getWallOrientation(interiorWall);

      // If this is a horizontal exterior wall and we have vertical interior walls
      if (orientation === "horizontal" && interiorOrientation === "vertical") {
        // Check if interior wall is attached to this horizontal wall
        const isAttachedToStart = Math.abs(interiorWall.start.y - oldStart.y) < halfExteriorThickness + 0.01;
        const isAttachedToEnd = Math.abs(interiorWall.end.y - oldStart.y) < halfExteriorThickness + 0.01;

        // Update interior wall endpoints to maintain attachment
        if (isAttachedToStart) {
          interiorWall.start.y = newStart.y + halfExteriorThickness;
        }
        if (isAttachedToEnd) {
          interiorWall.end.y = newStart.y - halfExteriorThickness;
        }
      }
      // If this is a vertical exterior wall and we have horizontal interior walls
      else if (orientation === "vertical" && interiorOrientation === "horizontal") {
        // Check if interior wall is attached to this vertical wall
        const isAttachedToStart = Math.abs(interiorWall.start.x - oldStart.x) < halfExteriorThickness + 0.01;
        const isAttachedToEnd = Math.abs(interiorWall.end.x - oldStart.x) < halfExteriorThickness + 0.01;

        // Update interior wall endpoints to maintain attachment
        if (isAttachedToStart) {
          interiorWall.start.x = newStart.x + halfExteriorThickness;
        }
        if (isAttachedToEnd) {
          interiorWall.end.x = newStart.x - halfExteriorThickness;
        }
      }
    }
  },
};
