# Segment Alignment Check Fix

## Critical Discovery
The initial building setup **already splits walls** at interior wall attachment points! This means segments start with `parentWallId` from the beginning, not just after corner creation.

## The Problem

### Initial Building State (src/utils/use-building.ts:302-304)
```typescript
// Initial setup SPLITS the bottom wall at x=10 where interior wall attaches:
// wall-1-left:   (0, 0) → (9.75, 0)
// wall-1-middle: (9.75, 0) → (10.25, 0)  [attachment segment]
// wall-1-right:  (10.25, 0) → (20, 0)

// Interior wall: (10, 0.15) → (10, 15.85)  [vertical]
```

### What Was Broken
My previous fix completely disabled corner creation for segments with `parentWallId`:
```typescript
if (wall.parentWallId) {
  return { requiresCorner: false, ... };  // ❌ Too broad!
}
```

This prevented corner creation even for **aligned segments from initial split**, which should be allowed to reconstruct and create L-corners.

### Two Different Cases

**Case 1: Aligned Segments (Initial Split) - SAFE TO RECONSTRUCT ✅**
```
All segments at same Y coordinate (y=0):
wall-1-left:   (0, 0) → (9.75, 0)
wall-1-middle: (9.75, 0) → (10.25, 0)
wall-1-right:  (10.25, 0) → (20, 0)

Can safely reconstruct:
wall-1: (0, 0) → (20, 0)  ✅ All at y=0
```

**Case 2: L-Shaped Segments (After First Move) - CANNOT RECONSTRUCT ❌**
```
Segments at DIFFERENT Y coordinates:
wall-1-left:   (0, 1) → (10, 1)    [y=1]
wall-1-middle: (10, 1) → (10, 0)   [vertical]
wall-1-right:  (10, 0) → (20, 0)   [y=0]

Cannot reconstruct straight wall:
y = firstSegment.start.y = 1
reconstructed = (0, 1) → (20, 1)   ❌ Right is at y=0, not y=1!
```

## The Solution (src/utils/use-building.ts:449-477)

Check if sibling segments are **aligned** before allowing reconstruction:

```typescript
if (wall.parentWallId) {
  const siblingSegments = floor.wallIds
    .map(id => floor.walls[id])
    .filter(w => w && (w.parentWallId === wall.parentWallId || w.id === wall.parentWallId));

  if (siblingSegments.length > 0) {
    // Check if all segments are aligned (at same Y for horizontal, same X for vertical)
    const orientation = getWallOrientation(wall);
    const allAligned = siblingSegments.every(seg => {
      if (orientation === "horizontal") {
        return seg.start.y === siblingSegments[0].start.y &&
               seg.end.y === siblingSegments[0].end.y;
      } else {
        return seg.start.x === siblingSegments[0].start.x &&
               seg.end.x === siblingSegments[0].end.x;
      }
    });

    if (!allAligned) {
      // Segments at different coordinates (L-shape already exists)
      // Don't reconstruct - use standard movement
      return { requiresCorner: false, attachedInteriorWall: null, attachmentPoint: null };
    }

    // All segments aligned - safe to reconstruct and create L-corner
    // Continue to check for interior wall attachment
  }
}
```

## Correct Behavior Now

### Scenario 1: First Move (Aligned Segments → L-Shape)
1. User selects `wall-1-left` (has `parentWallId: "wall-1"`)
2. All siblings at y=0 (aligned) ✅
3. Reconstruction allowed
4. Creates L-corner:
   ```
   wall-1-left:   (0, 1) → (10, 1)    [moved down]
   wall-1-middle: (10, 1) → (10, 0)   [vertical connector]
   wall-1-right:  (10, 0) → (20, 0)   [stayed in place]
   ```

### Scenario 2: Second Move (L-Shaped Segments)
1. User selects `wall-1-left` (now at y=1)
2. Siblings at different Y values (not aligned) ❌
3. Reconstruction prevented
4. Uses standard movement:
   ```
   wall-1-left moves to (0, 2) → (10, 2)
   Other segments stay in place
   ```

### Scenario 3: Move Attachment Segment
1. User selects `wall-1-middle` (isAttachmentSegment)
2. Early return (line 445-447)
3. Interior wall moves with it ✅

## Why This Fix Works

1. **Allows initial corner creation**: Aligned segments from initial split can be reconstructed
2. **Prevents impossible reconstruction**: L-shaped segments at different coordinates skip reconstruction
3. **Maintains geometry**: Each case handles coordinates correctly
4. **No wall disappearance**: Segments stay at valid positions

## Files Modified
- `src/utils/use-building.ts:449-477` - Added alignment check for split wall segments

## Test Results
✅ All 23 tests passing
✅ TypeScript compilation: PASSED
✅ Build: SUCCESS

## Expected Behavior

**Moving initially-split segment:**
1. ✅ Segments are aligned (same Y/X coordinate)
2. ✅ Reconstruction proceeds
3. ✅ L-corner created correctly
4. ✅ Interior wall adjusts to inner corner
5. ✅ All walls stay visible

**Moving already-L-shaped segment:**
1. ✅ Segments not aligned (different Y/X coordinates)
2. ✅ Reconstruction skipped
3. ✅ Standard movement used
4. ✅ Segment moves independently
5. ✅ No geometry corruption
