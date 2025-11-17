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
  isAttachmentSegment?: boolean; // Middle segment where interior wall attaches (non-selectable)
  parentWallId?: string; // Original wall ID before splitting
  segmentType?: "left" | "middle" | "right"; // Which segment this is
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

// Helper function to determine wall orientation
export function getWallOrientation(wall: Wall): WallOrientation {
  return wall.start.y === wall.end.y ? "horizontal" : "vertical";
}

// Helper function to create point key for connectivity index
function pointKey(x: number, y: number): PointKey {
  return `${x},${y}`;
}

// Merge wall segments back into their parent walls
function mergeSegments(floor: Floor): void {
  const segmentsByParent: Record<string, Wall[]> = {};

  // Group segments by parent
  for (const wallId of [...floor.wallIds]) {
    const wall = floor.walls[wallId];
    if (wall?.parentWallId) {
      if (!segmentsByParent[wall.parentWallId]) {
        segmentsByParent[wall.parentWallId] = [];
      }
      segmentsByParent[wall.parentWallId].push(wall);
    }
  }

  // Merge each group back into parent
  for (const [parentId, segments] of Object.entries(segmentsByParent)) {
    if (segments.length === 0) continue;

    // Sort segments by position to find original start and end
    const firstSegment = segments.find(s => s.segmentType === "left");
    const lastSegment = segments.find(s => s.segmentType === "right");

    if (!firstSegment || !lastSegment) continue;

    // Recreate parent wall
    const parentWall: Wall = {
      id: parentId,
      start: firstSegment.start,
      end: lastSegment.end,
      thickness: firstSegment.thickness,
      height: firstSegment.height,
      isExterior: firstSegment.isExterior
    };

    // Remove all segments
    for (const segment of segments) {
      delete floor.walls[segment.id];
      floor.wallIds = floor.wallIds.filter(id => id !== segment.id);

      // Remove from connectivity
      const startKey = pointKey(segment.start.x, segment.start.y);
      const endKey = pointKey(segment.end.x, segment.end.y);
      if (floor.connectivity[startKey]) {
        floor.connectivity[startKey] = floor.connectivity[startKey].filter(id => id !== segment.id);
        if (floor.connectivity[startKey].length === 0) delete floor.connectivity[startKey];
      }
      if (floor.connectivity[endKey]) {
        floor.connectivity[endKey] = floor.connectivity[endKey].filter(id => id !== segment.id);
        if (floor.connectivity[endKey].length === 0) delete floor.connectivity[endKey];
      }
    }

    // Add parent wall back
    floor.walls[parentId] = parentWall;
    floor.wallIds.push(parentId);

    // Update connectivity
    const startKey = pointKey(parentWall.start.x, parentWall.start.y);
    const endKey = pointKey(parentWall.end.x, parentWall.end.y);
    if (!floor.connectivity[startKey]) floor.connectivity[startKey] = [];
    if (!floor.connectivity[endKey]) floor.connectivity[endKey] = [];
    if (!floor.connectivity[startKey].includes(parentId)) {
      floor.connectivity[startKey].push(parentId);
    }
    if (!floor.connectivity[endKey].includes(parentId)) {
      floor.connectivity[endKey].push(parentId);
    }
  }
}

// Rebuild wall splits based on current interior wall positions
function rebuildWallSplits(floor: Floor): void {
  const interiorWidthInGridUnits = INTERIOR_WALL_THICKNESS / GRID_SIZE; // 0.5

  for (const interiorWallId of floor.interiorWallIds) {
    const interiorWall = floor.interiorWalls[interiorWallId];
    if (!interiorWall) continue;

    const interiorOrientation = getWallOrientation(interiorWall);

    // Find exterior walls to split
    for (const wallId of [...floor.wallIds]) {
      const exteriorWall = floor.walls[wallId];
      if (!exteriorWall || exteriorWall.isAttachmentSegment) continue;

      const exteriorOrientation = getWallOrientation(exteriorWall);

      // Only split perpendicular walls
      if (interiorOrientation === exteriorOrientation) continue;

      if (exteriorOrientation === "horizontal") {
        // Check if vertical interior wall intersects this horizontal wall
        const interiorX = interiorWall.start.x;
        const exteriorY = exteriorWall.start.y;
        const halfThickness = WALL_THICKNESS / GRID_SIZE / 2;

        const touchesStart = Math.abs(interiorWall.start.y - exteriorY) < halfThickness + 0.01;
        const touchesEnd = Math.abs(interiorWall.end.y - exteriorY) < halfThickness + 0.01;

        if (touchesStart || touchesEnd) {
          // Calculate attachment position
          const minX = Math.min(exteriorWall.start.x, exteriorWall.end.x);
          const maxX = Math.max(exteriorWall.start.x, exteriorWall.end.x);
          const wallLength = maxX - minX;
          const attachmentPosition = (interiorX - minX) / wallLength;

          if (attachmentPosition >= 0 && attachmentPosition <= 1) {
            splitWallAtAttachment(floor, wallId, attachmentPosition, interiorWidthInGridUnits);
          }
        }
      } else {
        // Check if horizontal interior wall intersects this vertical wall
        const interiorY = interiorWall.start.y;
        const exteriorX = exteriorWall.start.x;
        const halfThickness = WALL_THICKNESS / GRID_SIZE / 2;

        const touchesStart = Math.abs(interiorWall.start.x - exteriorX) < halfThickness + 0.01;
        const touchesEnd = Math.abs(interiorWall.end.x - exteriorX) < halfThickness + 0.01;

        if (touchesStart || touchesEnd) {
          const minY = Math.min(exteriorWall.start.y, exteriorWall.end.y);
          const maxY = Math.max(exteriorWall.start.y, exteriorWall.end.y);
          const wallLength = maxY - minY;
          const attachmentPosition = (interiorY - minY) / wallLength;

          if (attachmentPosition >= 0 && attachmentPosition <= 1) {
            splitWallAtAttachment(floor, wallId, attachmentPosition, interiorWidthInGridUnits);
          }
        }
      }
    }
  }
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

  const floor: Floor = {
    id: "floor-0",
    level: 0,
    height: DEFAULT_WALL_HEIGHT,
    walls,
    wallIds,
    interiorWalls,
    interiorWallIds,
    connectivity: buildConnectivityIndex(walls),
  };

  // Split exterior walls where interior wall attaches
  const interiorWidthInGridUnits = INTERIOR_WALL_THICKNESS / GRID_SIZE; // 0.5

  // Find bottom and top walls to split
  const bottomWall = wallIds
    .map(id => walls[id])
    .find(w => getWallOrientation(w) === "horizontal" &&
               w.start.y === 0);
  const topWall = wallIds
    .map(id => walls[id])
    .find(w => getWallOrientation(w) === "horizontal" &&
               w.start.y === length);

  // Calculate attachment position (interior wall at x=10, wall width=20)
  const attachmentX = 10;
  const wallWidth = 20;
  const attachmentPosition = attachmentX / wallWidth; // 0.5

  // Split bottom wall
  if (bottomWall) {
    splitWallAtAttachment(floor, bottomWall.id, attachmentPosition, interiorWidthInGridUnits);
  }

  // Split top wall
  if (topWall) {
    splitWallAtAttachment(floor, topWall.id, attachmentPosition, interiorWidthInGridUnits);
  }

  return floor;
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

// Split a wall into 3 segments at an attachment point
function splitWallAtAttachment(
  floor: Floor,
  wallId: string,
  attachmentPosition: number, // Position along wall (0 to 1)
  interiorWallWidth: number // Width of interior wall in grid units (0.5)
): void {
  const wall = floor.walls[wallId];
  if (!wall || wall.isAttachmentSegment) return;

  const orientation = getWallOrientation(wall);

  // Calculate wall length to convert interior width to fraction
  const wallLength = orientation === "horizontal"
    ? Math.abs(wall.end.x - wall.start.x)
    : Math.abs(wall.end.y - wall.start.y);

  // Convert interior wall width from grid units to fraction of this wall's length
  const widthAsFraction = interiorWallWidth / wallLength;
  const halfWidth = widthAsFraction / 2;

  // Calculate segment boundaries
  const leftEnd = attachmentPosition - halfWidth;
  const rightStart = attachmentPosition + halfWidth;

  // Create 3 new wall segments
  let leftWall: Wall;
  let middleWall: Wall;
  let rightWall: Wall;

  if (orientation === "horizontal") {
    // Horizontal wall splits along X axis
    // Handle both directions (left-to-right and right-to-left)
    const minX = Math.min(wall.start.x, wall.end.x);
    const maxX = Math.max(wall.start.x, wall.end.x);
    const totalLength = maxX - minX;
    const y = wall.start.y;

    // Calculate split points
    const splitX1 = minX + totalLength * leftEnd;
    const splitX2 = minX + totalLength * rightStart;

    // Determine if wall goes left-to-right or right-to-left
    const goesRight = wall.end.x > wall.start.x;

    if (goesRight) {
      // Left to right: start.x < end.x
      leftWall = {
        ...wall,
        id: `${wallId}-left`,
        start: { x: wall.start.x, y },
        end: { x: splitX1, y },
        parentWallId: wallId,
        segmentType: "left"
      };

      middleWall = {
        ...wall,
        id: `${wallId}-middle`,
        start: { x: splitX1, y },
        end: { x: splitX2, y },
        isAttachmentSegment: true,
        parentWallId: wallId,
        segmentType: "middle"
      };

      rightWall = {
        ...wall,
        id: `${wallId}-right`,
        start: { x: splitX2, y },
        end: { x: wall.end.x, y },
        parentWallId: wallId,
        segmentType: "right"
      };
    } else {
      // Right to left: start.x > end.x
      leftWall = {
        ...wall,
        id: `${wallId}-left`,
        start: { x: wall.start.x, y },
        end: { x: splitX2, y },
        parentWallId: wallId,
        segmentType: "left"
      };

      middleWall = {
        ...wall,
        id: `${wallId}-middle`,
        start: { x: splitX2, y },
        end: { x: splitX1, y },
        isAttachmentSegment: true,
        parentWallId: wallId,
        segmentType: "middle"
      };

      rightWall = {
        ...wall,
        id: `${wallId}-right`,
        start: { x: splitX1, y },
        end: { x: wall.end.x, y },
        parentWallId: wallId,
        segmentType: "right"
      };
    }
  } else {
    // Vertical wall splits along Y axis
    // Handle both directions (bottom-to-top and top-to-bottom)
    const minY = Math.min(wall.start.y, wall.end.y);
    const maxY = Math.max(wall.start.y, wall.end.y);
    const totalLength = maxY - minY;
    const x = wall.start.x;

    // Calculate split points
    const splitY1 = minY + totalLength * leftEnd;
    const splitY2 = minY + totalLength * rightStart;

    // Determine if wall goes bottom-to-top or top-to-bottom
    const goesUp = wall.end.y > wall.start.y;

    if (goesUp) {
      // Bottom to top: start.y < end.y
      leftWall = {
        ...wall,
        id: `${wallId}-left`,
        start: { x, y: wall.start.y },
        end: { x, y: splitY1 },
        parentWallId: wallId,
        segmentType: "left"
      };

      middleWall = {
        ...wall,
        id: `${wallId}-middle`,
        start: { x, y: splitY1 },
        end: { x, y: splitY2 },
        isAttachmentSegment: true,
        parentWallId: wallId,
        segmentType: "middle"
      };

      rightWall = {
        ...wall,
        id: `${wallId}-right`,
        start: { x, y: splitY2 },
        end: { x, y: wall.end.y },
        parentWallId: wallId,
        segmentType: "right"
      };
    } else {
      // Top to bottom: start.y > end.y
      leftWall = {
        ...wall,
        id: `${wallId}-left`,
        start: { x, y: wall.start.y },
        end: { x, y: splitY2 },
        parentWallId: wallId,
        segmentType: "left"
      };

      middleWall = {
        ...wall,
        id: `${wallId}-middle`,
        start: { x, y: splitY2 },
        end: { x, y: splitY1 },
        isAttachmentSegment: true,
        parentWallId: wallId,
        segmentType: "middle"
      };

      rightWall = {
        ...wall,
        id: `${wallId}-right`,
        start: { x, y: splitY1 },
        end: { x, y: wall.end.y },
        parentWallId: wallId,
        segmentType: "right"
      };
    }
  }

  // Remove original wall from connectivity
  const startKey = pointKey(wall.start.x, wall.start.y);
  const endKey = pointKey(wall.end.x, wall.end.y);
  if (floor.connectivity[startKey]) {
    floor.connectivity[startKey] = floor.connectivity[startKey].filter(id => id !== wallId);
  }
  if (floor.connectivity[endKey]) {
    floor.connectivity[endKey] = floor.connectivity[endKey].filter(id => id !== wallId);
  }

  // Remove original wall
  delete floor.walls[wallId];
  floor.wallIds = floor.wallIds.filter(id => id !== wallId);

  // Add new segments
  floor.walls[leftWall.id] = leftWall;
  floor.walls[middleWall.id] = middleWall;
  floor.walls[rightWall.id] = rightWall;
  floor.wallIds.push(leftWall.id, middleWall.id, rightWall.id);

  // Update connectivity for new segments
  const leftStartKey = pointKey(leftWall.start.x, leftWall.start.y);
  const leftEndKey = pointKey(leftWall.end.x, leftWall.end.y);
  const middleStartKey = pointKey(middleWall.start.x, middleWall.start.y);
  const middleEndKey = pointKey(middleWall.end.x, middleWall.end.y);
  const rightStartKey = pointKey(rightWall.start.x, rightWall.start.y);
  const rightEndKey = pointKey(rightWall.end.x, rightWall.end.y);

  if (!floor.connectivity[leftStartKey]) floor.connectivity[leftStartKey] = [];
  if (!floor.connectivity[leftEndKey]) floor.connectivity[leftEndKey] = [];
  if (!floor.connectivity[middleStartKey]) floor.connectivity[middleStartKey] = [];
  if (!floor.connectivity[middleEndKey]) floor.connectivity[middleEndKey] = [];
  if (!floor.connectivity[rightStartKey]) floor.connectivity[rightStartKey] = [];
  if (!floor.connectivity[rightEndKey]) floor.connectivity[rightEndKey] = [];

  floor.connectivity[leftStartKey].push(leftWall.id);
  floor.connectivity[leftEndKey].push(leftWall.id);
  floor.connectivity[middleStartKey].push(middleWall.id);
  floor.connectivity[middleEndKey].push(middleWall.id);
  floor.connectivity[rightStartKey].push(rightWall.id);
  floor.connectivity[rightEndKey].push(rightWall.id);
}

// Actions object - all state mutations go here
export const actions = {
  selectWall(wallId: string | null, floorId?: string | null) {
    // Don't allow selection of attachment segments
    if (wallId) {
      // Check in the specified floor or all floors
      const floorsToCheck = floorId ? [floorId] : state.floorIds;
      for (const fId of floorsToCheck) {
        const floor = state.floors[fId];
        const wall = floor.walls[wallId] || floor.interiorWalls[wallId];
        if (wall?.isAttachmentSegment) {
          return; // Skip attachment segments - don't select them
        }
      }
    }

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
          .find(w => {
            const orientation = getWallOrientation(w);
            return orientation === "horizontal" && !w.parentWallId &&
                   w.start.y === Math.min(...floor.wallIds
                     .map(id => floor.walls[id])
                     .filter(w2 => !w2.parentWallId && getWallOrientation(w2) === "horizontal")
                     .map(w2 => w2.start.y));
          });
        const topWall = floor.wallIds
          .map(id => floor.walls[id])
          .find(w => {
            const orientation = getWallOrientation(w);
            return orientation === "horizontal" && !w.parentWallId &&
                   w.start.y === Math.max(...floor.wallIds
                     .map(id => floor.walls[id])
                     .filter(w2 => !w2.parentWallId && getWallOrientation(w2) === "horizontal")
                     .map(w2 => w2.start.y));
          });

        if (bottomWall) {
          wall.start.y = bottomWall.start.y + halfExteriorThickness;
        }
        if (topWall) {
          wall.end.y = topWall.start.y - halfExteriorThickness;
        }
      }

      // Rebuild wall splits at new interior wall position
      mergeSegments(floor);
      rebuildWallSplits(floor);

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
