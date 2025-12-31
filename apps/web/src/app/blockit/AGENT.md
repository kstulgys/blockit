# Blockit - Gablok-Style Floor Plan Modeler

A keyboard-driven 3D floor plan modeler for Gablok-style modular house construction using React Three Fiber and Valtio.

## Tech Stack
- **React Three Fiber** (`@react-three/fiber`) - 3D rendering
- **Drei** (`@react-three/drei`) - R3F helpers (Grid, KeyboardControls, OrbitControls)
- **Valtio** - State management with proxy-based reactivity
- **Three.js** - 3D graphics

## Core Data Model

### Corner
Shared point between walls. Multiple walls can reference the same corner.
```typescript
interface Corner {
  id: string;
  x: number;  // mm from origin
  y: number;  // mm from origin (maps to Z in 3D)
}
```

### Wall
Connects two corners. Can be exterior (300mm thick) or interior (150mm thick).
```typescript
interface Wall {
  id: string;
  type: "exterior" | "interior";
  startCornerId: string;
  endCornerId: string;
}
```

### Space (Room)
Bounded area defined by ordered corner IDs forming a polygon.
```typescript
interface Space {
  id: string;
  name: string;
  cornerIds: string[];  // Ordered, forms polygon perimeter
}
```

## Constants
- `WALL_THICKNESS.exterior = 300` (mm)
- `WALL_THICKNESS.interior = 150` (mm)
- `STEP_SIZE.exterior = 300` (mm) - Grid snap for exterior walls
- `STEP_SIZE.interior = 150` (mm) - Grid snap for interior walls
- `WALL_HEIGHT = 2700` (mm)
- `SCALE = 0.001` - Convert mm to Three.js units (meters)

## Keyboard Controls
| Key | Action |
|-----|--------|
| Click | Select wall |
| Tab | Cycle through walls |
| Arrow keys | Move selected wall (snaps to grid) |
| Space | Split room at selected wall |
| Delete/Backspace | Remove interior wall (merges rooms) |
| Escape | Deselect |

## Key Actions (in `actions` object)

### `splitAtSelectedWall()`
Creates a new interior wall perpendicular to the selected wall, splitting the room.

**Algorithm:**
1. Find midpoint of selected wall (snap to wall's grid size)
2. Create `midCorner` at midpoint ON the wall line (horizontal wall: snap X, keep Y; vertical wall: snap Y, keep X)
3. Split selected wall into 2 segments at `midCorner`
4. Find opposite parallel edge in the space
5. Create `oppCorner` on opposite edge at same perpendicular position
6. Split opposite wall into 2 segments at `oppCorner`
7. **IMPORTANT:** Update ALL other spaces that share these edges (insert new corners)
8. Create interior wall from `midCorner` to `oppCorner`
9. Split original space into 2 new spaces

### `deleteSelectedWall()`
Removes an interior wall and merges the two adjacent rooms.

**Algorithm:**
1. Only works on interior walls (exterior protected)
2. Find all spaces containing BOTH wall corners
3. If exactly 2 spaces found, merge them:
   - Collect corners from both spaces excluding wall corners
   - Remove duplicates while maintaining polygon order
4. Delete the wall
5. Clean up orphaned corners (remove from store and all space.cornerIds)

### `moveSelectedWall(direction)`
Moves wall perpendicular to its orientation, snapping to grid.
- Horizontal walls: move up/down
- Vertical walls: move left/right
- Connected walls auto-adjust (shared corners)

## Important Implementation Notes

### Corner Sharing
When a wall is split, the new corner must be added to ALL spaces that share that edge, not just the space being split. This is critical for delete/merge to work correctly.

### Polygon Winding
Space `cornerIds` must maintain consistent winding order for:
- Area calculation (shoelace formula)
- Proper merge when deleting walls

### Grid Snapping
- Midpoint corner snaps to the SAME grid as the wall being split (exterior=300mm, interior=150mm)
- Midpoint stays ON the wall line (don't snap perpendicular coordinate)

### 3D Coordinate Mapping
- 2D floor plan: X (horizontal), Y (vertical/depth)
- 3D scene: X (horizontal), Y (height/up), Z (depth)
- Wall position: `[x * SCALE, (WALL_HEIGHT/2) * SCALE, y * SCALE]`

## Initial State
L-shaped floor plan with 7 corners, 8 walls (7 exterior + 1 interior), 2 rooms.

```
C5 ─────────────────── C4
 │                      │
 │       Room 1         │
 │                      │
C6 ═══════ C2 ───────── C3
 │          │
 │  Room 2  │
 │          │
C0 ──────── C1

─── Exterior wall (300mm)
═══ Interior wall (150mm)
```

## File Structure
- `/apps/web/src/app/blockit/page.tsx` - Main component with all logic
- Uses `"use client"` directive for client-side rendering

## MUST NOT Do
- ❌ Move grid with building (user explicitly disliked this)
- ❌ Delete exterior walls
- ❌ Use orthographic camera (perspective 3D view required)
- ❌ Render floor polygons (was buggy, removed)
- ❌ Add comments unless absolutely necessary (ASCII diagrams for spatial data OK)
