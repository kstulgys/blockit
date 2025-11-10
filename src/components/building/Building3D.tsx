"use client";

import { useEffect } from "react";
import { useBuilding, actions } from "~/utils/use-building";
import { Wall3D } from "./Wall3D";

export function Building3D() {
  const building = useBuilding();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Deselect on Escape
      if (e.key === "Escape") {
        actions.selectWall(null);
        return;
      }

      // Move selected wall with arrow keys
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

  return (
    <group>
      {building.floorIds.map((floorId) => {
        const floor = building.floors[floorId];
        return (
          <group key={floor.id} position={[0, floor.level * floor.height, 0]}>
            {floor.wallIds.map((wallId) => {
              const wall = floor.walls[wallId];
              return <Wall3D key={wall.id} wall={wall} floorId={floorId} />;
            })}
          </group>
        );
      })}
    </group>
  );
}
