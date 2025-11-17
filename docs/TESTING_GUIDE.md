# Interior Wall Feature - Testing Guide

## 🚀 Quick Start

```bash
npm run dev
```

Open http://localhost:3000 in your browser.

## 🎯 What You Should See

### Initial Floor Plan

```
     0                  10                 20
   0 ┌──────────────────┼──────────────────┐ Top (wall-3)
     │                  │                  │
     │                  │                  │
     │    Exterior      │    Exterior      │
     │      Room        │      Room        │
     │     (Left)       │     (Right)      │
  8  │                  │ Interior Wall    │ Left (wall-4)
     │                  │   (wall-5)       │
     │                  │  [Lighter Tan]   │
     │                  │                  │
     │                  │                  │
  16 └──────────────────┼──────────────────┘ Bottom (wall-1)

   Bottom (wall-1)    Center      Right (wall-2)
```

### Visual Characteristics

**Exterior Walls** (4 walls forming rectangle):
- Color: Dark brown (#8b7355)
- Thickness: 300mm
- Form 20x16 grid unit rectangle (6m x 4.8m)

**Interior Wall** (1 wall in center):
- Color: Lighter tan (#d4c5b9) ← **NEW!**
- Thickness: 150mm ← **NEW!**
- Position: Vertical line at x=10 (center)
- Height: From y=0 to y=16 (full height)

## ✅ Testing Checklist

### 1. Visual Verification

- [ ] Interior wall is visible in the 3D view
- [ ] Interior wall is lighter in color than exterior walls
- [ ] Interior wall is thinner (150mm vs 300mm)
- [ ] Interior wall divides the floor into two rooms
- [ ] No visual glitches or gaps

### 2. Selection Testing

Click on different walls:

- [ ] Click exterior wall → should highlight in blue
- [ ] Click interior wall → should highlight in blue
- [ ] Press Escape → should deselect wall

### 3. Movement Testing

**Select the interior wall first** (click on it):

- [ ] Press ArrowUp → wall moves up (decreases Y)
- [ ] Press ArrowDown → wall moves down (increases Y)
- [ ] ArrowLeft/ArrowRight → should NOT move (vertical wall)
- [ ] Each keypress = 300mm movement (1 grid unit)

**Select an exterior wall**:

- [ ] Horizontal walls move up/down only
- [ ] Vertical walls move left/right only
- [ ] Connected walls move together

### 4. Camera Controls

- [ ] Left mouse drag → Orbit around scene
- [ ] Scroll wheel → Zoom in/out
- [ ] Shift + Click → Change rotation pivot point

## 🐛 Common Issues & Solutions

### Interior wall not visible

**Check:**
1. Open browser dev tools (F12)
2. Look for console errors
3. Verify the wall is in state: `console.log(building.floors[0].interiorWalls)`

**Solution:**
- Refresh the page
- Clear browser cache
- Check that `use-building.ts` has `wall-5` in initial state

### Interior wall same color as exterior

**Check:**
- `Wall3D.tsx` should have color logic based on `wall.isExterior`
- Interior wall should have `isExterior: false`

### Can't select interior wall

**Check:**
- 3D mesh has proper raycasting setup
- Click directly on the wall, not empty space
- Try clicking different parts of the wall

### Movement doesn't work

**Check:**
- Wall is actually selected (should be blue)
- Using arrow keys, not WASD
- Interior wall only moves up/down (it's vertical)

## 🔍 Advanced Testing

### State Inspection

Open browser console and run:

```javascript
// Get the building state
const building = window.__building_state__ // (if exposed)

// Or inspect via React DevTools
// Look for Building3D component
// Check props for interior walls
```

### Expected State Structure

```javascript
{
  floors: {
    'floor-0': {
      walls: { /* exterior walls */ },
      interiorWalls: {
        'wall-5': {
          id: 'wall-5',
          start: { x: 10, y: 0 },
          end: { x: 10, y: 16 },
          thickness: 0.5,
          isExterior: false
        }
      },
      wallIds: ['wall-1', 'wall-2', 'wall-3', 'wall-4'],
      interiorWallIds: ['wall-5'],
      attachments: {}
    }
  }
}
```

## 📸 Screenshots to Verify

Take screenshots and verify:

1. **Top view** - Should see interior wall dividing space
2. **Side view** - Should see wall height matches exterior walls
3. **Selected state** - Interior wall should turn blue when clicked
4. **After movement** - Wall should be in new position

## 🎨 Color Reference

Use a color picker tool to verify colors:

| Element | Hex Color | RGB |
|---------|-----------|-----|
| Exterior Wall | #8b7355 | rgb(139, 115, 85) |
| Interior Wall | #d4c5b9 | rgb(212, 197, 185) |
| Selected Wall | #3b82f6 | rgb(59, 130, 246) |

## 🚀 Performance Check

The app should:
- [ ] Load in < 2 seconds
- [ ] Run at 60 FPS (smooth camera movement)
- [ ] No lag when selecting/moving walls
- [ ] No memory leaks (check DevTools Performance tab)

## 📊 Grid Coordinate Testing

### Interior Wall Position
- Should be at x=10 grid units
- In world space: 10 × 0.3 = 3.0 meters from left edge
- This is exactly center of 6m wide floor (3m from each side)

### Test Movement Coordinates
After pressing ArrowDown 3 times:
- Start: y=0
- After 1 press: y=1
- After 2 presses: y=2
- After 3 presses: y=3

Wall should visually move 900mm total (3 × 300mm).

## ✨ Success Criteria

Feature is working correctly if:

1. ✅ Interior wall visible and distinguishable
2. ✅ Can select interior wall independently
3. ✅ Arrow keys move interior wall vertically
4. ✅ No errors in console
5. ✅ Exterior walls still work as before
6. ✅ Smooth 60 FPS performance

## 🎯 Next: Manual Segmentation Test

Once basic interior wall works, test segmentation manually:

```javascript
// In browser console
import { segmentWall } from './src/utils/wall-segmentation'

// Segment bottom exterior wall at center
const wall1 = building.floors['floor-0'].walls['wall-1']
const attachmentPoint = { x: 10, y: 0 }
const segments = segmentWall(wall1, attachmentPoint, 'wall-5')

console.log(segments)
// Should show 3 segments: left, middle (150mm), right
```

## 📝 Bug Reporting

If you find issues, note:
- Browser and version
- Steps to reproduce
- Expected vs actual behavior
- Console errors (if any)
- Screenshots

---

Happy testing! The interior wall feature is ready for visual verification. 🎉
