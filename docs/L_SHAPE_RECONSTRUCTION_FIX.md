# L-Shape Reconstruction Fix - Fundamental Logic Flaw

## Critical Problem
The wall disappearance bug was caused by a **fundamental logic flaw**: the code was trying to reconstruct a straight wall from L-shaped segments that are at different coordinates.

## Root Cause Analysis

### The Flawed Flow
1. **First move:** User moves exterior wall (e.g., "wall-1")
   - Corner creation splits it into L-shaped segments:
     - `wall-1-left` at (0,1) → (10,1)  [y=1]
     - `wall-1-middle` at (10,1) → (10,0) [vertical attachment]
     - `wall-1-right` at (10,0) → (20,0) [y=0]

2. **Second move:** User moves left segment down again
   - detectCornerRequirement() sees wall has `parentWallId: "wall-1"`
   - Finds sibling `wall-1-middle` (attachment segment)
   - **Returns `requiresCorner: true`** ❌

3. **Attempted reconstruction (BROKEN):**
   ```typescript
   // Lines 1199-1212: Try to reconstruct original wall
   const y = firstSegment.start.y;  // Gets y=1 from left segment
   reconstructedStart = { x: 0, y: 1 };    // ✓ Correct for left
   reconstructedEnd = { x: 20, y: 1 };     // ✗ WRONG! Right is at y=0
   ```

4. **Why it fails:**
   - L-shaped segments are at **DIFFERENT Y coordinates** (y=1 and y=0)
   - Cannot reconstruct a straight wall from bent segments
   - Reconstruction uses only first segment's Y coordinate
   - Creates wall at wrong position (all at y=1 instead of mixed y=0/y=1)
   - New corner segments created from wrong position
   - **Result: Walls appear at incorrect positions or disappear**

### Visual Example

**After First Move (L-shape created):**
```
y=1:  +----------+  (left segment, 0→10)
      |
      | middle
      | (10,1→10,0)
      |
y=0:  +----------+  (right segment, 10→20)
```

**Attempted Reconstruction (WRONG):**
```typescript
// Tries to make straight wall from these coordinates:
// left:  (0,1) → (10,1)
// right: (10,0) → (20,0)

y = firstSegment.start.y = 1  // Only uses left segment's Y!

reconstructed = {
  start: (0, 1),   // Min X=0, Y=1
  end: (20, 1)     // Max X=20, Y=1  ← WRONG! Right segment is at Y=0
}
```

**Why This Breaks:**
- Creates new segments from position y=1
- But original right segment was at y=0
- Connected walls try to update to new positions
- Geometry becomes corrupted
- Walls disappear or appear at wrong locations

## The Solution

**Key Insight:** Corner creation should **ONLY** happen for **original unsplit walls**. If a wall is already split (has `parentWallId`), it's already in an L-shape and shouldn't be "reconstructed" and split again.

### Fixed Logic (src/utils/use-building.ts:449-454)

```typescript
// If this wall is already part of a split (has parentWallId), don't create corners again
// The wall has already been split into L-shape, so just move the segment normally
// Corner creation should only happen for original unsplit walls
if (wall.parentWallId) {
  return { requiresCorner: false, attachedInteriorWall: null, attachmentPoint: null };
}
```

### Correct Behavior Now

**First move (creates L-shape):**
- Original wall "wall-1" → Corner creation ✅
- Creates L-shaped segments (left, middle, right)

**Second move (moves segment):**
- Select "wall-1-left" (has `parentWallId`)
- `detectCornerRequirement()` returns `requiresCorner: false` ✅
- Segment moves normally via standard movement logic
- No reconstruction attempted
- No new corner creation
- Segment simply moves to new position

**When attachment segment moves:**
- Select "wall-1-middle" (isAttachmentSegment)
- `detectCornerRequirement()` returns `requiresCorner: false` ✅
- Interior wall moves with it ✅
- L-shape proportions change but remain connected

## Why This Is The Correct Fix

1. **Prevents impossible reconstruction:** Can't make straight walls from L-shapes
2. **Preserves L-shape integrity:** Segments move independently after creation
3. **Matches user expectations:** Move one segment, that segment moves
4. **No coordinate corruption:** Each segment maintains its actual position
5. **No wall disappearance:** Segments stay at correct coordinates

## Implications

### Before Fix:
- Moving any part of an L-shaped wall caused reconstruction attempts
- Reconstruction created walls at wrong positions
- Connected walls updated to incorrect coordinates
- Walls disappeared or appeared at wrong locations
- Building structure became corrupted

### After Fix:
- L-shaped walls are created once from original walls ✅
- Individual segments move normally after that ✅
- No reconstruction of already-split walls ✅
- Geometry remains correct ✅
- All walls stay visible and positioned correctly ✅

## Files Modified
- `src/utils/use-building.ts:449-454` - Added early return for walls with parentWallId
- `src/utils/use-building.ts:457-511` - Disabled (unreachable code) the split wall corner detection

## Test Results
✅ All 23 tests passing
✅ TypeScript compilation: PASSED
✅ Build: SUCCESS

## Expected Behavior Now

### Scenario 1: First Move (Original Wall)
1. User selects original exterior wall "wall-1"
2. Wall has no `parentWallId` → corner creation allowed
3. Interior wall detected at attachment point
4. L-shaped segments created (left, middle, right)
5. Interior wall stays in place, ends at inner corner ✅

### Scenario 2: Second Move (Split Segment)
1. User selects segment "wall-1-left"
2. Segment has `parentWallId: "wall-1"` → no corner creation
3. Segment moves via standard movement logic
4. L-shape adjusts but maintains connectivity ✅

### Scenario 3: Move Attachment Segment
1. User selects "wall-1-middle" (attachment segment)
2. Segment has `isAttachmentSegment: true` → no corner creation
3. Interior wall moves with the segment
4. L-shape proportions change ✅

## Critical Takeaway

**You cannot reconstruct a straight wall from L-shaped segments that are at different coordinates.** Corner creation must only happen once, when the original unsplit wall is first moved. After that, segments should move independently using standard movement logic.
