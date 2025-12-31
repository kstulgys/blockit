"use client";

import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import {
  Grid,
  KeyboardControls,
  useKeyboardControls,
  OrbitControls,
} from "@react-three/drei";
import { proxy, useSnapshot } from "valtio";
import { useEffect, useRef, useMemo, useState } from "react";
import * as THREE from "three";

interface Corner {
  id: string;
  x: number;
  y: number;
}

interface Wall {
  id: string;
  type: "exterior" | "interior";
  startCornerId: string;
  endCornerId: string;
}

interface Space {
  id: string;
  name: string;
  cornerIds: string[];
}

interface BuildingState {
  corners: Record<string, Corner>;
  walls: Record<string, Wall>;
  spaces: Record<string, Space>;
  selectedWallId: string | null;
  hoveredWallId: string | null;
}

const WALL_THICKNESS = {
  exterior: 300,
  interior: 150,
} as const;

const STEP_SIZE = {
  exterior: 300,
  interior: 150,
} as const;

const WALL_HEIGHT = 2700;
const SCALE = 0.001;

const COLORS = {
  exteriorWall: "#475569",
  interiorWall: "#64748b",
  selectedWall: "#3b82f6",
  hoveredWall: "#60a5fa",
  floor: "#f1f5f9",
  grid: "#cbd5e1",
};

enum Controls {
  up = "up",
  down = "down",
  left = "left",
  right = "right",
  deselect = "deselect",
}

const keyboardMap = [
  { name: Controls.up, keys: ["ArrowUp", "KeyW"] },
  { name: Controls.down, keys: ["ArrowDown", "KeyS"] },
  { name: Controls.left, keys: ["ArrowLeft", "KeyA"] },
  { name: Controls.right, keys: ["ArrowRight", "KeyD"] },
  { name: Controls.deselect, keys: ["Escape"] },
];

/**
 * L-shaped floor plan layout:
 *
 * C5 (0,8000) ─────────────────── C4 (8000,8000)
 *     │                               │
 *     │           Room 1              │
 *     │           (upper)             │
 *     │                               │
 * C6 (0,4000) ═══════ C2 (4000,4000) ─ C3 (8000,4000)
 *     │               │
 *     │    Room 2     │
 *     │    (lower)    │
 *     │               │
 * C0 (0,0) ───────── C1 (4000,0)
 *
 * ─── Exterior wall (300mm)
 * ═══ Interior wall (150mm)
 */
function createInitialState(): BuildingState {
  const corners: Record<string, Corner> = {
    c0: { id: "c0", x: 0, y: 0 },
    c1: { id: "c1", x: 4000, y: 0 },
    c2: { id: "c2", x: 4000, y: 4000 },
    c3: { id: "c3", x: 8000, y: 4000 },
    c4: { id: "c4", x: 8000, y: 8000 },
    c5: { id: "c5", x: 0, y: 8000 },
    c6: { id: "c6", x: 0, y: 4000 },
  };

  const walls: Record<string, Wall> = {
    w0: { id: "w0", type: "exterior", startCornerId: "c0", endCornerId: "c1" },
    w1: { id: "w1", type: "exterior", startCornerId: "c1", endCornerId: "c2" },
    w2: { id: "w2", type: "exterior", startCornerId: "c2", endCornerId: "c3" },
    w3: { id: "w3", type: "exterior", startCornerId: "c3", endCornerId: "c4" },
    w4: { id: "w4", type: "exterior", startCornerId: "c4", endCornerId: "c5" },
    w5: { id: "w5", type: "exterior", startCornerId: "c5", endCornerId: "c6" },
    w6: { id: "w6", type: "exterior", startCornerId: "c6", endCornerId: "c0" },
    w7: { id: "w7", type: "interior", startCornerId: "c6", endCornerId: "c2" },
  };

  const spaces: Record<string, Space> = {
    room1: {
      id: "room1",
      name: "Room 1",
      cornerIds: ["c6", "c2", "c3", "c4", "c5"],
    },
    room2: {
      id: "room2",
      name: "Room 2",
      cornerIds: ["c0", "c1", "c2", "c6"],
    },
  };

  return {
    corners,
    walls,
    spaces,
    selectedWallId: null,
    hoveredWallId: null,
  };
}

const buildingStore = proxy<BuildingState>(createInitialState());

const actions = {
  selectWall(wallId: string | null) {
    buildingStore.selectedWallId = wallId;
  },

  setHoveredWall(wallId: string | null) {
    buildingStore.hoveredWallId = wallId;
  },

  moveSelectedWall(direction: "up" | "down" | "left" | "right") {
    const { selectedWallId, walls, corners } = buildingStore;
    if (!selectedWallId) return;

    const wall = walls[selectedWallId];
    if (!wall) return;

    const startCorner = corners[wall.startCornerId];
    const endCorner = corners[wall.endCornerId];
    if (!startCorner || !endCorner) return;

    const step = STEP_SIZE[wall.type];

    const dx = Math.abs(endCorner.x - startCorner.x);
    const dy = Math.abs(endCorner.y - startCorner.y);
    const isHorizontal = dx > dy;
    const isVertical = dy > dx;

    if (isHorizontal && (direction === "up" || direction === "down")) {
      const delta = direction === "up" ? step : -step;
      startCorner.y += delta;
      endCorner.y += delta;
    } else if (isVertical && (direction === "left" || direction === "right")) {
      const delta = direction === "right" ? step : -step;
      startCorner.x += delta;
      endCorner.x += delta;
    }
  },

  resetBuilding() {
    const initial = createInitialState();
    buildingStore.corners = initial.corners;
    buildingStore.walls = initial.walls;
    buildingStore.spaces = initial.spaces;
    buildingStore.selectedWallId = null;
    buildingStore.hoveredWallId = null;
  },
};

interface WallGeometry {
  position: [number, number, number];
  dimensions: [number, number, number];
  rotation: number;
}

function calculateWallGeometry(
  wall: Wall,
  corners: Record<string, Corner>
): WallGeometry | null {
  const startCorner = corners[wall.startCornerId];
  const endCorner = corners[wall.endCornerId];
  if (!startCorner || !endCorner) return null;

  const thickness = WALL_THICKNESS[wall.type];

  const centerX = (startCorner.x + endCorner.x) / 2;
  const centerY = (startCorner.y + endCorner.y) / 2;

  const dx = endCorner.x - startCorner.x;
  const dy = endCorner.y - startCorner.y;
  const length = Math.sqrt(dx * dx + dy * dy);

  const angle = Math.atan2(dy, dx);

  return {
    position: [centerX * SCALE, (WALL_HEIGHT / 2) * SCALE, centerY * SCALE],
    dimensions: [length * SCALE, WALL_HEIGHT * SCALE, thickness * SCALE],
    rotation: -angle,
  };
}

function getWallOrientation(
  wall: Wall,
  corners: Record<string, Corner>
): "horizontal" | "vertical" | "diagonal" {
  const startCorner = corners[wall.startCornerId];
  const endCorner = corners[wall.endCornerId];
  if (!startCorner || !endCorner) return "diagonal";

  const dx = Math.abs(endCorner.x - startCorner.x);
  const dy = Math.abs(endCorner.y - startCorner.y);

  if (dx > dy * 10) return "horizontal";
  if (dy > dx * 10) return "vertical";
  return "diagonal";
}

function Wall3D({ wallId }: { wallId: string }) {
  const snap = useSnapshot(buildingStore);
  const meshRef = useRef<THREE.Mesh>(null);

  const wall = snap.walls[wallId];
  const geometry = useMemo(() => {
    if (!wall) return null;
    return calculateWallGeometry(
      wall as Wall,
      snap.corners as Record<string, Corner>
    );
  }, [wall, snap.corners]);

  if (!wall || !geometry) return null;

  const isSelected = snap.selectedWallId === wallId;
  const isHovered = snap.hoveredWallId === wallId;

  let color =
    wall.type === "exterior" ? COLORS.exteriorWall : COLORS.interiorWall;
  if (isSelected) color = COLORS.selectedWall;
  else if (isHovered) color = COLORS.hoveredWall;

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    actions.selectWall(wallId);
  };

  const handlePointerOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    actions.setHoveredWall(wallId);
    document.body.style.cursor = "pointer";
  };

  const handlePointerOut = () => {
    actions.setHoveredWall(null);
    document.body.style.cursor = "default";
  };

  return (
    <mesh
      ref={meshRef}
      position={geometry.position}
      rotation={[0, geometry.rotation, 0]}
      onClick={handleClick}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    >
      <boxGeometry args={geometry.dimensions} />
      <meshStandardMaterial
        color={color}
        transparent={isHovered && !isSelected}
        opacity={isHovered && !isSelected ? 0.9 : 1}
      />
    </mesh>
  );
}

function Floor3D() {
  return (
    <Grid
      position={[0, 0, 0]}
      cellSize={0.3}
      cellThickness={1}
      cellColor="#64748b"
      sectionSize={3}
      sectionThickness={1.5}
      sectionColor="#334155"
      fadeDistance={50}
      fadeStrength={1}
      followCamera={false}
      infiniteGrid
    />
  );
}

function CameraSetup() {
  const { camera } = useThree();

  useEffect(() => {
    camera.position.set(15, 12, 15);
    camera.lookAt(4, 0, 4);
    camera.updateProjectionMatrix();
  }, [camera]);

  return null;
}

function KeyboardHandler() {
  const [, getKeys] = useKeyboardControls<Controls>();
  const lastKeyState = useRef<Record<Controls, boolean>>({
    [Controls.up]: false,
    [Controls.down]: false,
    [Controls.left]: false,
    [Controls.right]: false,
    [Controls.deselect]: false,
  });

  useEffect(() => {
    const handleKeyboard = () => {
      const keys = getKeys();

      if (keys.up && !lastKeyState.current.up) {
        actions.moveSelectedWall("up");
      }
      if (keys.down && !lastKeyState.current.down) {
        actions.moveSelectedWall("down");
      }
      if (keys.left && !lastKeyState.current.left) {
        actions.moveSelectedWall("left");
      }
      if (keys.right && !lastKeyState.current.right) {
        actions.moveSelectedWall("right");
      }
      if (keys.deselect && !lastKeyState.current.deselect) {
        actions.selectWall(null);
      }

      lastKeyState.current = {
        [Controls.up]: keys.up,
        [Controls.down]: keys.down,
        [Controls.left]: keys.left,
        [Controls.right]: keys.right,
        [Controls.deselect]: keys.deselect,
      };
    };

    const interval = setInterval(handleKeyboard, 16);
    return () => clearInterval(interval);
  }, [getKeys]);

  return null;
}

function BuildingModel() {
  const snap = useSnapshot(buildingStore);

  return (
    <group>
      <Floor3D />
      {Object.keys(snap.walls).map((wallId) => (
        <Wall3D key={wallId} wallId={wallId} />
      ))}
      <KeyboardHandler />
    </group>
  );
}

function UIOverlay() {
  const snap = useSnapshot(buildingStore);
  const selectedWall = snap.selectedWallId
    ? snap.walls[snap.selectedWallId]
    : null;

  const spaceAreas = useMemo(() => {
    return Object.values(snap.spaces).map((space) => {
      const points = space.cornerIds.map((cornerId) => snap.corners[cornerId]);
      let area = 0;
      for (let i = 0; i < points.length; i++) {
        const current = points[i];
        const next = points[(i + 1) % points.length];
        if (current && next) {
          area += current.x * next.y - next.x * current.y;
        }
      }
      return {
        name: space.name,
        area: Math.abs(area / 2) / 1000000,
      };
    });
  }, [snap.spaces, snap.corners]);

  const getWallInfo = () => {
    if (!selectedWall) return null;

    const startCorner = snap.corners[selectedWall.startCornerId];
    const endCorner = snap.corners[selectedWall.endCornerId];
    if (!startCorner || !endCorner) return null;

    const dx = endCorner.x - startCorner.x;
    const dy = endCorner.y - startCorner.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    const orientation = getWallOrientation(
      selectedWall as Wall,
      snap.corners as Record<string, Corner>
    );

    return {
      id: selectedWall.id,
      type: selectedWall.type,
      length: (length / 1000).toFixed(2),
      thickness: WALL_THICKNESS[selectedWall.type],
      orientation,
      movementHint:
        orientation === "horizontal"
          ? "Use Up/Down arrows to move"
          : orientation === "vertical"
            ? "Use Left/Right arrows to move"
            : "Diagonal walls cannot be moved",
    };
  };

  const wallInfo = getWallInfo();

  return (
    <div className="absolute inset-0 pointer-events-none">
      <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm rounded-lg shadow-lg p-4 pointer-events-auto max-w-xs">
        <h2 className="font-semibold text-gray-900 mb-2">Building Modeler</h2>
        <div className="text-sm text-gray-600 space-y-1">
          <p>
            <span className="font-medium">Click</span> a wall to select it
          </p>
          <p>
            <span className="font-medium">Arrow keys</span> to move selected
            wall
          </p>
          <p>
            <span className="font-medium">Escape</span> to deselect
          </p>
          <p className="text-xs text-gray-400 mt-2">
            Exterior walls: 300mm, Interior: 150mm
          </p>
        </div>
      </div>

      {wallInfo && (
        <div className="absolute top-4 right-4 bg-blue-50/90 backdrop-blur-sm rounded-lg shadow-lg p-4 pointer-events-auto min-w-48">
          <h3 className="font-semibold text-blue-900 mb-2">Selected Wall</h3>
          <div className="text-sm text-blue-800 space-y-1">
            <p>
              <span className="text-blue-600">ID:</span> {wallInfo.id}
            </p>
            <p>
              <span className="text-blue-600">Type:</span>{" "}
              <span className="capitalize">{wallInfo.type}</span>
            </p>
            <p>
              <span className="text-blue-600">Length:</span> {wallInfo.length}m
            </p>
            <p>
              <span className="text-blue-600">Thickness:</span>{" "}
              {wallInfo.thickness}mm
            </p>
            <p>
              <span className="text-blue-600">Direction:</span>{" "}
              <span className="capitalize">{wallInfo.orientation}</span>
            </p>
            <p className="text-xs text-blue-500 mt-2 italic">
              {wallInfo.movementHint}
            </p>
          </div>
        </div>
      )}

      <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm rounded-lg shadow-lg p-4 pointer-events-auto">
        <h3 className="font-semibold text-gray-900 mb-2">Spaces</h3>
        <div className="text-sm text-gray-600 space-y-1">
          {spaceAreas.map((space) => (
            <p key={space.name}>
              <span className="font-medium">{space.name}:</span>{" "}
              {space.area.toFixed(2)} m&sup2;
            </p>
          ))}
        </div>
      </div>

      <div className="absolute bottom-4 right-4 pointer-events-auto">
        <button
          onClick={() => actions.resetBuilding()}
          className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg shadow transition-colors text-sm font-medium"
        >
          Reset Layout
        </button>
      </div>

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-sm rounded-lg shadow-lg p-3 pointer-events-auto flex gap-4 text-xs">
        <div className="flex items-center gap-2">
          <div
            className="w-4 h-4 rounded"
            style={{ backgroundColor: COLORS.exteriorWall }}
          />
          <span style={{ color: "#374151" }}>Exterior (300mm)</span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="w-4 h-4 rounded"
            style={{ backgroundColor: COLORS.interiorWall }}
          />
          <span style={{ color: "#374151" }}>Interior (150mm)</span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="w-4 h-4 rounded"
            style={{ backgroundColor: COLORS.selectedWall }}
          />
          <span style={{ color: "#374151" }}>Selected</span>
        </div>
      </div>
    </div>
  );
}

export default function BlockitPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="h-screen w-screen bg-slate-100 flex items-center justify-center">
        <div className="text-slate-500">Loading Building Modeler...</div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen relative bg-slate-200">
      <KeyboardControls map={keyboardMap}>
        <Canvas
          shadows
          camera={{
            position: [15, 12, 15],
            fov: 50,
            near: 0.1,
            far: 1000,
          }}
          onPointerMissed={() => actions.selectWall(null)}
          gl={{ antialias: true }}
        >
          <CameraSetup />
          <OrbitControls
            target={[4, 0, 4]}
            maxPolarAngle={Math.PI / 2.1}
            minDistance={5}
            maxDistance={50}
          />
          <ambientLight intensity={0.6} />
          <directionalLight
            position={[10, 20, 10]}
            intensity={0.8}
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
          />
          <directionalLight position={[-10, 20, -10]} intensity={0.3} />

          <BuildingModel />
        </Canvas>
      </KeyboardControls>

      <UIOverlay />
    </div>
  );
}
