# Segment Coordinate Fix - Critical Bug

## Problem
Walls were disappearing when moved because the `createCornerSegments()` function was creating segments with incorrect coordinates for walls that go in reverse direction (right-to-left or top-to-bottom).

## Root Cause
In the `createCornerSegments()` function (src/utils/use-building.ts:568-788), the code for handling reverse-direction walls was **identical** to forward-direction walls. This caused segments to be created with swapped coordinates.

### The Bug (Lines 636-667 and 738-769)

**For horizontal walls going right-to-left:**
```typescript
} else {
  // Right to left orientation
  leftSegment = {
    start: { x: wall.start.x, y: newY },  // ❌ WRONG! wall.start.x is LARGER
    end: { x: attachmentX, y: newY },
  };

  rightSegment = {
    start: { x: attachmentX, y: wall.start.y },
    end: { x: wall.end.x, y: wall.start.y },  // ❌ WRONG! wall.end.x is SMALLER
  };
}
```

**Example of the problem:**
- Wall goes from (20, 0) to (0, 0) (right-to-left)
- Attachment at x=10
- Expected: Left segment at smaller X (0→10), Right segment at larger X (10→20)
- **ACTUAL**: Left segment from 20→10 (on right!), Right segment from 10→0 (on left!)

This created segments in the wrong positions, causing walls to appear incorrect or disappear entirely.

## Solution

### Fixed Horizontal Walls (Lines 636-667)
Now correctly uses `wall.end.x` (smaller X) for left segment and `wall.start.x` (larger X) for right segment when going right-to-left:

```typescript
} else {
  // Right to left orientation (start.x > end.x)
  // Left segment should be at smaller X values (wall.end.x)
  // Right segment should be at larger X values (wall.start.x)
  leftSegment = {
    ...wall,
    id: `${wallId}-left`,
    start: { x: wall.end.x, y: newY },  // ✅ Correct! Smaller X
    end: { x: attachmentX, y: newY },
    parentWallId: wallId,
    segmentType: "left"
  };

  rightSegment = {
    ...wall,
    id: `${wallId}-right`,
    start: { x: attachmentX, y: wall.start.y },
    end: { x: wall.start.x, y: wall.start.y },  // ✅ Correct! Larger X
    parentWallId: wallId,
    segmentType: "right"
  };
}
```

### Fixed Vertical Walls (Lines 738-769)
Similarly fixed for vertical walls going top-to-bottom:

```typescript
} else {
  // Top to bottom orientation (start.y > end.y)
  // Left segment should be at smaller Y values (wall.end.y, bottom)
  // Right segment should be at larger Y values (wall.start.y, top)
  leftSegment = {
    ...wall,
    id: `${wallId}-left`,
    start: { x: newX, y: wall.end.y },  // ✅ Correct! Smaller Y (bottom)
    end: { x: newX, y: attachmentY },
    parentWallId: wallId,
    segmentType: "left"
  };

  rightSegment = {
    ...wall,
    id: `${wallId}-right`,
    start: { x: wall.start.x, y: attachmentY },
    end: { x: wall.start.x, y: wall.start.y },  // ✅ Correct! Larger Y (top)
    parentWallId: wallId,
    segmentType: "right"
  };
}
```

## Why This Matters

When segments are created with incorrect coordinates:
1. The left segment appears on the right side, right segment on the left
2. Corner geometry is backwards
3. Connected walls try to attach to wrong positions
4. Walls appear to disappear or jump to incorrect locations
5. Building structure becomes corrupted

With the fix:
1. ✅ Left segment is always at smaller coordinate values
2. ✅ Right segment is always at larger coordinate values
3. ✅ Corner geometry is correct regardless of wall direction
4. ✅ Connected walls attach to correct positions
5. ✅ All walls remain visible and properly positioned

## Files Modified
- `src/utils/use-building.ts` - Fixed segment coordinate calculation for reverse-direction walls

## Test Results
✅ All 23 tests passing
✅ TypeScript compilation: PASSED
✅ Build: SUCCESS

## Expected Behavior Now

When you move any exterior wall segment (regardless of original wall direction):
1. ✅ Segments are created with correct coordinates
2. ✅ Left segment always at smaller coordinate values
3. ✅ Right segment always at larger coordinate values
4. ✅ Corner geometry appears correct
5. ✅ All walls remain visible
6. ✅ Building structure maintains integrity
