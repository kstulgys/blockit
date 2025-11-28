"use client";

import { useRef } from "react";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import {
  type Wall,
  type Junction,
  getWallThickness,
  WALL_HEIGHT,
} from "~/utils/use-building";

// Colors
const COLORS = {
  exteriorWall: "#d4d4d4",
  interiorWall: "#a3a3a3",
  selectedWall: "#3b82f6",
  hoveredWall: "#60a5fa",
};

type Wall3DProps = {
  wall: Wall;
  startJunction: Junction;
  endJunction: Junction;
  isSelected: boolean;
  isHovered: boolean;
  onSelectAction: (wallId: string, shiftKey: boolean) => void;
  onHoverAction: (wallId: string | null) => void;
};

export function Wall3D({
  wall,
  startJunction,
  endJunction,
  isSelected,
  isHovered,
  onSelectAction,
  onHoverAction,
}: Wall3DProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  // Calculate wall geometry
  const thickness = getWallThickness(wall.type);
  const height = WALL_HEIGHT;

  // Calculate position (center of wall)
  const centerX = (startJunction.x + endJunction.x) / 2;
  const centerZ = (startJunction.z + endJunction.z) / 2;
  const centerY = height / 2; // Walls start at ground level

  // Calculate length and rotation
  const dx = endJunction.x - startJunction.x;
  const dz = endJunction.z - startJunction.z;
  const length = Math.sqrt(dx * dx + dz * dz);
  const angle = Math.atan2(dz, dx);

  // Determine color based on state
  let color = wall.type === "exterior" ? COLORS.exteriorWall : COLORS.interiorWall;
  if (isSelected) {
    color = COLORS.selectedWall;
  } else if (isHovered) {
    color = COLORS.hoveredWall;
  }

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onSelectAction(wall.id, event.nativeEvent.shiftKey);
  };

  const handlePointerOver = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    onHoverAction(wall.id);
    document.body.style.cursor = "pointer";
  };

  const handlePointerOut = () => {
    onHoverAction(null);
    document.body.style.cursor = "auto";
  };

  return (
    <mesh
      ref={meshRef}
      position={[centerX, centerY, centerZ]}
      rotation={[0, -angle, 0]}
      onClick={handleClick}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
      castShadow
      receiveShadow
    >
      {/* Wall geometry: length along X, height along Y, thickness along Z */}
      <boxGeometry args={[length, height, thickness]} />
      <meshStandardMaterial
        color={color}
        roughness={0.8}
        metalness={0.1}
      />
    </mesh>
  );
}
