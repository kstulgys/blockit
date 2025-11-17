import {
  type Wall,
  type WallSegment,
  GRID_SIZE,
  actions,
  useBuilding,
  calculateWallSegments,
  getWallOrientation
} from "~/utils/use-building";
import { ThreeEvent } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";

interface Wall3DProps {
  wall: Wall;
  floorId: string;
}

interface SegmentMeshProps {
  segment: WallSegment;
  segmentIndex: number;
  totalSegments: number;
  wall: Wall;
  baseLength: number;
  angle: number;
  startX: number;
  startZ: number;
  dx: number;
  dz: number;
  centerY: number;
  halfThickness: number;
  startConnected: boolean;
  endConnected: boolean;
  isSelected: boolean;
  handleClick: (e: ThreeEvent<MouseEvent>) => void;
}

function SegmentMesh({
  segment,
  segmentIndex,
  totalSegments,
  wall,
  baseLength,
  angle,
  startX,
  startZ,
  dx,
  dz,
  centerY,
  halfThickness,
  startConnected,
  endConnected,
  isSelected,
  handleClick
}: SegmentMeshProps) {
  const { thickness, height } = wall;

  // Calculate segment dimensions
  const segmentLength = (segment.endPos - segment.startPos) * baseLength;
  const segmentCenter = (segment.startPos + segment.endPos) / 2;

  // Position along the wall
  const t = segmentCenter;
  const segmentCenterX = startX + dx * t;
  const segmentCenterZ = startZ + dz * t;

  // Apply extensions for connected ends (only for first and last segments)
  const isFirstSegment = segmentIndex === 0;
  const isLastSegment = segmentIndex === totalSegments - 1;

  const segStartExtension = isFirstSegment && startConnected ? halfThickness : 0;
  const segEndExtension = isLastSegment && endConnected ? halfThickness : 0;
  const totalSegLength = segmentLength + segStartExtension + segEndExtension;

  const segExtensionOffset = (segEndExtension - segStartExtension) / 2;
  const finalCenterX = segmentCenterX + Math.cos(angle) * segExtensionOffset;
  const finalCenterZ = segmentCenterZ + Math.sin(angle) * segExtensionOffset;

  // Create geometry for this segment
  const segGeometry = useMemo(() => {
    const halfLen = totalSegLength / 2;
    const halfHeight = height / 2;
    const halfThick = thickness / 2;

    const positions: number[] = [];
    const indices: number[] = [];

    const startFrontX = -halfLen;
    const startBackX = (isFirstSegment && startConnected) ? -halfLen + thickness : -halfLen;
    const endFrontX = +halfLen;
    const endBackX = (isLastSegment && endConnected) ? +halfLen - thickness : +halfLen;

    // Bottom vertices
    positions.push(
      startFrontX, -halfHeight, -halfThick,
      startBackX, -halfHeight, +halfThick,
      endBackX, -halfHeight, +halfThick,
      endFrontX, -halfHeight, -halfThick
    );

    // Top vertices
    positions.push(
      startFrontX, +halfHeight, -halfThick,
      startBackX, +halfHeight, +halfThick,
      endBackX, +halfHeight, +halfThick,
      endFrontX, +halfHeight, -halfThick
    );

    // Faces
    indices.push(0, 3, 7, 0, 7, 4); // Front
    indices.push(1, 5, 6, 1, 6, 2); // Back
    indices.push(4, 7, 6, 4, 6, 5); // Top
    indices.push(0, 1, 2, 0, 2, 3); // Bottom
    indices.push(0, 4, 5, 0, 5, 1); // Start
    indices.push(3, 2, 6, 3, 6, 7); // End

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    return geo;
  }, [totalSegLength, height, thickness, isFirstSegment, isLastSegment, startConnected, endConnected]);

  // Determine segment color
  const getSegmentColor = () => {
    if (isSelected) return "#3b82f6";
    if (segment.type === "ATTACHMENT_POINT") return "#a0a0a0"; // Gray for attachment
    return wall.isExterior ? "#8b7355" : "#d4c5b9";
  };

  return (
    <group>
      <mesh
        position={[finalCenterX, centerY, finalCenterZ]}
        rotation={[0, -angle, 0]}
        onClick={handleClick}
        geometry={segGeometry}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial
          color={getSegmentColor()}
          roughness={0.8}
          metalness={0}
          side={THREE.DoubleSide}
          depthWrite={true}
          depthTest={true}
        />
      </mesh>

      {/* Selection outline */}
      {isSelected && (
        <mesh
          position={[finalCenterX, centerY, finalCenterZ]}
          rotation={[0, -angle, 0]}
          geometry={segGeometry}
        >
          <meshBasicMaterial
            color="#60a5fa"
            transparent
            opacity={0.3}
            depthTest={false}
          />
        </mesh>
      )}
    </group>
  );
}

export function Wall3D({ wall, floorId }: Wall3DProps) {
  const building = useBuilding();
  const { start, end, thickness, height } = wall;
  const isSelected = building.selectedWallId === wall.id;

  // Get floor data for connectivity
  const floor = building.floors[floorId];

  // Check connections at each end
  const startKey = `${start.x},${start.y}`;
  const endKey = `${end.x},${end.y}`;
  const startConnected = (floor.connectivity[startKey]?.length || 0) > 1;
  const endConnected = (floor.connectivity[endKey]?.length || 0) > 1;

  // Calculate segments for this wall
  const segments = useMemo(() => {
    return calculateWallSegments(wall, floor);
  }, [wall, floor]);

  // Convert grid coordinates to world coordinates
  const startX = start.x * GRID_SIZE;
  const startZ = start.y * GRID_SIZE;
  const endX = end.x * GRID_SIZE;
  const endZ = end.y * GRID_SIZE;

  // Calculate wall dimensions and position
  const dx = endX - startX;
  const dz = endZ - startZ;
  const baseLength = Math.sqrt(dx * dx + dz * dz);
  const angle = Math.atan2(dz, dx);

  // Extend wall by half thickness (150mm) at connected ends
  const halfThickness = thickness / 2;
  const startExtension = startConnected ? halfThickness : 0;
  const endExtension = endConnected ? halfThickness : 0;
  const totalLength = baseLength + startExtension + endExtension;

  // Adjust center position to account for extensions
  const extensionOffset = (endExtension - startExtension) / 2;
  const centerX = (startX + endX) / 2 + Math.cos(angle) * extensionOffset;
  const centerY = height / 2;
  const centerZ = (startZ + endZ) / 2 + Math.sin(angle) * extensionOffset;

  // Create custom geometry with 45-degree miter cuts at connected ends
  const geometry = useMemo(() => {
    const halfLen = totalLength / 2;
    const halfHeight = height / 2;
    const halfThick = thickness / 2;

    const positions: number[] = [];
    const indices: number[] = [];

    // Simple rule:
    // - Front face (z=-halfThick) always extends to full length
    // - Back face (z=+halfThick) is shortened by thickness at connected ends
    // This creates a consistent 45-degree diagonal cut

    const startFrontX = -halfLen;
    const startBackX = startConnected ? -halfLen + thickness : -halfLen;

    const endFrontX = +halfLen;
    const endBackX = endConnected ? +halfLen - thickness : +halfLen;

    // Bottom vertices (y = -halfHeight)
    positions.push(
      startFrontX, -halfHeight, -halfThick,   // 0: start front bottom
      startBackX, -halfHeight, +halfThick,    // 1: start back bottom
      endBackX, -halfHeight, +halfThick,      // 2: end back bottom
      endFrontX, -halfHeight, -halfThick      // 3: end front bottom
    );

    // Top vertices (y = +halfHeight)
    positions.push(
      startFrontX, +halfHeight, -halfThick,   // 4: start front top
      startBackX, +halfHeight, +halfThick,    // 5: start back top
      endBackX, +halfHeight, +halfThick,      // 6: end back top
      endFrontX, +halfHeight, -halfThick      // 7: end front top
    );

    // Define faces
    // Front face (z = -halfThick)
    indices.push(0, 3, 7, 0, 7, 4);
    // Back face (z = +halfThick)
    indices.push(1, 5, 6, 1, 6, 2);
    // Top face
    indices.push(4, 7, 6, 4, 6, 5);
    // Bottom face
    indices.push(0, 1, 2, 0, 2, 3);
    // Start end face (diagonal if connected)
    indices.push(0, 4, 5, 0, 5, 1);
    // End face (diagonal if connected)
    indices.push(3, 2, 6, 3, 6, 7);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    return geo;
  }, [totalLength, height, thickness, startConnected, endConnected]);

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    actions.selectWall(wall.id, floorId);
  };

  // Render each segment separately using SegmentMesh component
  return (
    <group>
      {segments.map((segment, index) => (
        <SegmentMesh
          key={`${wall.id}-segment-${index}`}
          segment={segment}
          segmentIndex={index}
          totalSegments={segments.length}
          wall={wall}
          baseLength={baseLength}
          angle={angle}
          startX={startX}
          startZ={startZ}
          dx={dx}
          dz={dz}
          centerY={centerY}
          halfThickness={halfThickness}
          startConnected={startConnected}
          endConnected={endConnected}
          isSelected={isSelected}
          handleClick={handleClick}
        />
      ))}
    </group>
  );
}
