"use client";

import { useEffect, useMemo } from "react";
import { useBuilding, actions, deriveWalls, getWallAsLegacyFormat } from "~/utils/use-building";
import { Wall3D } from "./Wall3D";

export function Building3D() {
  const building = useBuilding();

  // Derive walls from rooms (memoized for performance)
  const walls = useMemo(() => {
    // Convert readonly snapshot to mutable for deriveWalls
    const mutableRooms: Record<string, { id: string; name: string; vertices: { x: number; z: number }[] }> = {};
    for (const [key, room] of Object.entries(building.rooms)) {
      mutableRooms[key] = {
        id: room.id,
        name: room.name,
        vertices: room.vertices.map(v => ({ x: v.x, z: v.z })),
      };
    }
    return deriveWalls(mutableRooms);
  }, [building.rooms]);

  // Keyboard event handler for wall movement
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Deselect on Escape
      if (e.key === "Escape") {
        actions.clearSelection();
        return;
      }

      // Only handle arrow keys if we have a selection
      if (!building.selectedWallId) return;

      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          actions.moveSelectedWall("up");
          break;
        case "ArrowDown":
          e.preventDefault();
          actions.moveSelectedWall("down");
          break;
        case "ArrowLeft":
          e.preventDefault();
          actions.moveSelectedWall("left");
          break;
        case "ArrowRight":
          e.preventDefault();
          actions.moveSelectedWall("right");
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [building.selectedWallId]);

  // Handle wall selection
  const handleWallSelect = (wallId: string, _shiftKey: boolean) => {
    // For simplicity, just single selection (no multi-select with rooms model)
    if (building.selectedWallId === wallId) {
      actions.clearSelection();
    } else {
      actions.selectWall(wallId);
    }
  };

  // Handle wall hover
  const handleWallHover = (wallId: string | null) => {
    actions.setHoveredWall(wallId);
  };

  return (
    <group>
      {walls.map((wall) => {
        const { wall: legacyWall, startJunction, endJunction } = getWallAsLegacyFormat(wall);

        return (
          <Wall3D
            key={wall.id}
            wall={legacyWall}
            startJunction={startJunction}
            endJunction={endJunction}
            isSelected={building.selectedWallId === wall.id}
            isHovered={building.hoveredWallId === wall.id}
            onSelectAction={handleWallSelect}
            onHoverAction={handleWallHover}
          />
        );
      })}
    </group>
  );
}
