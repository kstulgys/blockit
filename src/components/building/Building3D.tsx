"use client";

import { useEffect, useMemo } from "react";
import { useBuilding, actions, deriveWallsFromGraph, getWallAsLegacyFormat } from "~/utils/use-building";
import { Wall3D } from "./Wall3D";

export function Building3D() {
  const building = useBuilding();

  // Derive walls from graph structure (memoized for performance)
  const walls = useMemo(() => {
    // Trigger re-computation when junctions or walls change
    const _ = building.junctions;
    const __ = building.walls;
    return deriveWallsFromGraph();
  }, [building.junctions, building.walls]);

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
