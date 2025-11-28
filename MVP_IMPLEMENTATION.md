# BlockIt - 3D Floor Plan Modeler MVP Implementation

## Overview

A web app for modifying floor plans by selecting and moving wall segments with keyboard arrows. Moving segments automatically creates new perpendicular walls to maintain building envelope integrity.

---

## Data Model

### Room-Based Polygon Approach

Rooms are stored as **closed polygons** (array of vertices in clockwise order). All edges must be axis-aligned (horizontal or vertical). Walls are **derived** from room edges:
- **Exterior walls**: Edges that belong to only one room
- **Interior walls**: Edges shared by two adjacent rooms

```ts
type Vertex = {
  x: number
  z: number
}

type Room = {
  id: string
  name: string
  vertices: Vertex[]  // Clockwise order, axis-aligned edges only
}

type DerivedWall = {
  id: string
  type: 'exterior' | 'interior'
  orientation: 'horizontal' | 'vertical'
  start: Vertex
  end: Vertex
  roomIds: string[]  // Which rooms this wall belongs to
}

type BuildingState = {
  rooms: Record<string, Room>
  selectedWallId: string | null
  hoveredWallId: string | null
}
```

### Why Polygon-Based Rooms?

1. **Walls are derived, not stored**: No duplicate data, no sync issues
2. **Interior/exterior automatic**: Determined by shared edges
3. **Non-rectangular rooms**: Polygons can represent L-shapes, U-shapes, etc.
4. **Simpler movement**: Update vertices, walls update automatically
5. **Step insertion**: Moving partial edges creates step vertices

### Constants

```ts
const EXTERIOR_WALL_THICKNESS = 0.3  // 300mm
const INTERIOR_WALL_THICKNESS = 0.1  // 100mm
const WALL_HEIGHT = 2.7              // 2700mm
const EXTERIOR_MOVE_STEP = 0.3       // 300mm
const INTERIOR_MOVE_STEP = 0.1       // 100mm
const MIN_ROOM_SIZE = 0.6            // 600mm minimum room dimension
```

---

## Wall Derivation Algorithm

The `deriveWalls()` function:

1. **Collect all edges** from all rooms with normalized start/end (smaller coordinate first)
2. **Group edges** by orientation (horizontal/vertical) and position (z for horizontal, x for vertical)
3. **Split edges at intersection points** to create sub-segments
4. **Determine wall type** for each sub-segment:
   - If 2+ rooms share the segment → **interior wall**
   - If only 1 room has the segment → **exterior wall**

```ts
// Example: Two rooms sharing edge at x=4.5 from z=0 to z=6
// Room 1 edge: (4.5, 0) → (4.5, 6) - full edge
// Room 2 edge: (4.5, 0) → (4.5, 9) - longer edge

// After derivation:
// Wall 1: x=4.5, z=0→6 - INTERIOR (shared by Room1 + Room2)
// Wall 2: x=4.5, z=6→9 - EXTERIOR (Room2 only)
```

---

## Wall Movement Algorithm

The `moveWall()` function handles two cases:

### Case 1: Full Edge Move
When a wall exactly matches a room's edge (same start and end vertices):
- Simply move both boundary vertices to the new position
- Example: Moving Room1's right edge at x=4.5 to x=4.6

### Case 2: Partial Edge Move (Step Insertion)
When a wall is a subsegment of a room's edge:
- Insert new vertices to create a "step" in the polygon
- This creates non-rectangular rooms

```
Before (Room 2 is rectangle):     After moving interior wall right:
(4.5,0)---(9,0)                   (4.5,0)---(4.6,0)
   |         |                        |         |
   |         |                    (4.5,6)---(4.6,6)
   |         |                        |         |
(4.5,9)---(9,9)                   (4.5,9)-------(9,9)
                                              (unchanged right side)
```

The step insertion ensures:
- Interior walls can move independently of exterior walls
- Rooms can become non-rectangular when needed
- Building envelope integrity is maintained

---

## Initial Floor Plan

L-shaped building with 2 rooms:

```
     0      4.5      9
   0 +-------+-------+
     |       |       |
     | Room1 | Room2 |
     |       |       |
   6 +-------+       |
             |       |
             |       |
   9         +-------+
```

### Rooms (Polygon Vertices)

**Room 1** (rectangle):
```ts
vertices: [
  { x: 0, z: 0 },    // top-left
  { x: 4.5, z: 0 },  // top-right
  { x: 4.5, z: 6 },  // bottom-right
  { x: 0, z: 6 },    // bottom-left
]
```

**Room 2** (rectangle):
```ts
vertices: [
  { x: 4.5, z: 0 },  // top-left
  { x: 9, z: 0 },    // top-right
  { x: 9, z: 9 },    // bottom-right
  { x: 4.5, z: 9 },  // bottom-left
]
```

### Derived Walls

| Wall | Type | Position | Range |
|------|------|----------|-------|
| Room1 top | exterior | z=0 | x: 0→4.5 |
| Room2 top | exterior | z=0 | x: 4.5→9 |
| Room1/Room2 shared | **interior** | x=4.5 | z: 0→6 |
| Room2 left (below Room1) | exterior | x=4.5 | z: 6→9 |
| Room1 bottom | exterior | z=6 | x: 0→4.5 |
| Room1 left | exterior | x=0 | z: 0→6 |
| Room2 right | exterior | x=9 | z: 0→9 |
| Room2 bottom | exterior | z=9 | x: 4.5→9 |

---

## User Interactions

### Selection

| Action | Result |
|--------|--------|
| Click on wall | Select that wall (deselect others) |
| Click again | Deselect |
| Escape | Clear selection |
| Click empty space | Clear selection |

### Movement

| Key | Action |
|-----|--------|
| Arrow Up | Move horizontal walls in -Z direction |
| Arrow Down | Move horizontal walls in +Z direction |
| Arrow Left | Move vertical walls in -X direction |
| Arrow Right | Move vertical walls in +X direction |

### Movement Rules

1. **Perpendicular only**: Horizontal walls move up/down (Z), vertical walls move left/right (X)
2. **Step size**: 0.3m for exterior walls, 0.1m for interior walls
3. **Step insertion**: Moving partial edges creates steps in room polygons

---

## Visual Design

### Colors

```ts
const COLORS = {
  exteriorWall: '#e0e0e0',      // light gray
  interiorWall: '#c0c0c0',      // slightly darker gray
  selectedWall: '#4a90d9',      // blue
  hoveredWall: '#f0f0f0',       // highlight
}
```

### 3D Rendering

- Walls: BoxGeometry centered on edge line
- Grid: 300mm cells (0.3m), section lines every 3m
- Lighting: Ambient + Hemisphere + Directional
- Controls: OrbitControls with Ctrl+Click to set rotation center

---

## File Structure

```
src/
├── utils/
│   ├── use-building.ts       # Valtio state, types, actions, deriveWalls
│   └── use-building.test.ts  # Unit tests for wall derivation & movement
├── components/
│   └── building/
│       ├── index.ts
│       ├── Building3D.tsx    # Main 3D scene, keyboard handling
│       └── Wall3D.tsx        # Individual wall mesh
└── app/
    └── page.tsx              # Main page with Canvas
```

---

## Key Functions

### `deriveWalls(rooms)`
Converts room polygons into wall segments with interior/exterior classification.

### `actions.moveWall(wallId, direction)`
Moves a wall by updating room vertices:
- **Full edge match**: Move boundary vertices directly
- **Partial edge**: Insert step vertices to create notch

### `actions.selectWall(wallId)`
Selects/deselects a wall by ID.

### `actions.resetBuilding()`
Resets to initial L-shape configuration.

---

## Testing

Tests in `src/utils/use-building.test.ts`:

1. **Wall derivation**: Verify interior/exterior classification
2. **Interior wall move**: Both exact match and partial edge cases
3. **Exterior wall move**: Full edge movement
4. **Step insertion**: Verify non-rectangular rooms are created correctly

Run tests: `bun test`

---

## Implementation Status

- [x] Polygon-based room model
- [x] Wall derivation from room edges
- [x] Interior/exterior wall classification
- [x] Wall selection with visual feedback
- [x] Arrow key movement
- [x] Full edge wall movement
- [x] Partial edge movement with step insertion
- [x] 3D rendering with proper wall thickness
- [x] Grid overlay (300mm cells)
- [x] Reset button
- [x] Help overlay
- [x] Unit tests

---

## Notes

- All measurements in meters internally
- Coordinate system: X = left/right, Y = up (height), Z = forward/back
- Walls are rendered centered on the edge line
- Wall thickness extends equally on both sides of the center line
- Room vertices must be in clockwise order for proper edge direction detection
