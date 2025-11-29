# BlockIt - 3D Floor Plan Modeler MVP Implementation

## Overview

A web app for modifying floor plans by selecting and moving wall segments with keyboard arrows. Rooms are stored as polygons, and walls are derived automatically from room edges.

---

## Data Model

### Room-Based Polygon Approach

Rooms are stored as **closed polygons** (array of vertices in clockwise order). All edges must be axis-aligned (horizontal or vertical). Walls are **derived** from room edges:
- **Exterior walls**: Edges that belong to only one room
- **Interior walls**: Edges shared by two adjacent rooms (detected by opposite traversal directions)

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
2. **Interior/exterior automatic**: Determined by shared edges with opposite directions
3. **Non-rectangular rooms**: Polygons can represent L-shapes, U-shapes, etc.
4. **Simpler movement**: Update vertices, walls update automatically
5. **No junction management**: No need to track junction splitting or wall connections

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

The `deriveWallsFromRooms()` function:

1. **Extract all edges** from all rooms, recording:
   - Orientation (horizontal/vertical)
   - Position (z for horizontal, x for vertical)
   - Start/end coordinates (normalized to min/max)
   - Direction (+1 or -1 based on traversal order)
   - Room ID

2. **Group edges** by orientation and position

3. **Split into segments** at all unique points along each line

4. **Determine wall type** for each segment:
   - If rooms traverse the segment in **opposite directions** → **interior wall**
   - If only one room has the segment → **exterior wall**

```ts
// Example: Two rooms sharing edge at x=4.5
// Room 1: traverses downward (direction = +1)
// Room 2: traverses upward (direction = -1)
// Result: Interior wall (opposite directions = shared edge)

// Wall segment at x=4.5, z=6→9:
// Only Room 2 has this edge → Exterior wall
```

---

## Wall Movement Algorithm

The `moveWall()` function:

1. **Find the derived wall** by ID
2. **Validate direction** (horizontal walls move up/down, vertical walls move left/right)
3. **Find room edges** that correspond to this wall
4. **Update vertices** of affected rooms

```ts
function moveWallInRooms(wall, direction, rooms) {
  const delta = calculateDelta(direction, wall.type);
  
  for (each room edge matching the wall) {
    if (wall.orientation === "horizontal") {
      // Move vertices in Z direction
      vertex1.z += delta;
      vertex2.z += delta;
    } else {
      // Move vertices in X direction
      vertex1.x += delta;
      vertex2.x += delta;
    }
  }
}
```

### Movement Behavior

- **Exterior walls**: Move freely, extending/shrinking connected perpendicular walls
- **Interior walls**: Move both adjacent room boundaries together
- **Connected walls**: Perpendicular walls automatically extend/shrink as shared vertices move

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

**Room 2** (L-shaped, 5 vertices):
```ts
vertices: [
  { x: 4.5, z: 0 },  // top-left
  { x: 9, z: 0 },    // top-right
  { x: 9, z: 9 },    // bottom-right
  { x: 4.5, z: 9 },  // bottom-left
  { x: 4.5, z: 6 },  // inner corner (creates L-shape)
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
| Click selected wall | Deselect |
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
3. **Automatic updates**: Connected perpendicular walls extend/shrink automatically

---

## Visual Design

### Colors

```ts
const COLORS = {
  exteriorWall: '#d4d4d4',      // light gray
  interiorWall: '#a3a3a3',      // slightly darker gray
  selectedWall: '#3b82f6',      // blue
  hoveredWall: '#60a5fa',       // light blue
}
```

### 3D Rendering

- Walls: BoxGeometry centered on edge line
- Grid: 300mm cells (0.3m), section lines every 3m
- Lighting: Ambient + Hemisphere + Directional with shadows
- Controls: OrbitControls with Ctrl+Click to set rotation center

---

## File Structure

```
src/
├── utils/
│   ├── use-building.ts       # Valtio state, types, actions, deriveWallsFromRooms
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

### `deriveWallsFromRooms(rooms)`
Converts room polygons into wall segments with interior/exterior classification based on edge directions.

### `actions.moveWall(wallId, direction)`
Moves a wall by updating room polygon vertices. Returns the new wall ID (since position changes).

### `actions.moveSelectedWall(direction)`
Moves the currently selected wall and updates the selection to the new wall ID.

### `actions.selectWall(wallId)`
Selects a wall by ID (or deselects if null).

### `actions.resetBuilding()`
Resets to initial L-shape configuration.

---

## Testing

Tests in `src/utils/use-building.test.ts`:

1. **Wall derivation**: Verify interior/exterior classification from room polygons
2. **Interior wall move**: Both rooms update together
3. **Exterior wall move**: Single room updates, connected walls extend/shrink
4. **Direction validation**: Only valid directions allowed per wall orientation

Run tests: `npm test` or `bun test`

---

## Implementation Status

- [x] Polygon-based room model
- [x] Wall derivation from room edges
- [x] Interior/exterior wall classification (by edge direction)
- [x] Wall selection with visual feedback
- [x] Arrow key movement
- [x] Exterior wall movement (extends/shrinks connected walls)
- [x] Interior wall movement (moves both room boundaries)
- [x] 3D rendering with proper wall thickness
- [x] Grid overlay (300mm cells)
- [x] Reset button
- [x] Help overlay
- [x] Unit tests

---

## Architecture Notes

### Reactive State (Valtio)

- State is a Valtio proxy containing rooms, selectedWallId, hoveredWallId
- `useBuilding()` hook returns a snapshot for React components
- Actions mutate the proxy directly; Valtio handles reactivity

### Wall Derivation Flow

```
Room Polygons → deriveWallsFromRooms() → DerivedWall[]
     ↑                                        ↓
  mutations                              Wall3D components
     ↑                                        ↓
  actions                               user interactions
```

### Coordinate System

- X = left/right (negative = left, positive = right)
- Y = height (up)
- Z = forward/back (negative = up/north, positive = down/south)
- All measurements in meters
- Walls are rendered centered on the edge line
- Wall thickness extends equally on both sides

---

## Notes

- Room vertices must be in clockwise order for proper edge direction detection
- Interior walls are detected when two rooms share an edge with opposite traversal directions
- Wall IDs are generated from position: `wall-{orientation}-{position}-{start}-{end}`
- Moving a wall changes its ID (since position is part of the ID)
