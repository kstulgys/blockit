"use client";

import React, { useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Grid } from "@react-three/drei";
import { Box as ChakraBox, SimpleGrid } from "@chakra-ui/react";
import { Building3D } from "~/components/building/Building3D";
import { actions } from "~/utils/use-building";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsType } from "three-stdlib";

export default function Home() {
  return (
    <ChakraBox>
      <ChakraBox as="main">
        <SimpleGrid columns={1} gap={0} h="100vh" w="100vw">
          {/* <NodeEditor /> */}
          <BlockitModel />
        </SimpleGrid>
      </ChakraBox>
    </ChakraBox>
  );
}

function ClickToRotate() {
  const { camera, raycaster, scene, gl } = useThree();
  const controlsRef = useRef<OrbitControlsType | null>(null);
  const [rotationCenter, setRotationCenter] =
    React.useState<THREE.Vector3 | null>(null);

  const handleClick = (event: MouseEvent) => {
    // Only update rotation center on middle mouse button or Ctrl+Click
    // This prevents unwanted jumping during regular wall selection
    if (event.button !== 1 && !event.ctrlKey) return;

    const canvas = gl.domElement;
    const rect = canvas.getBoundingClientRect();

    // Calculate normalized device coordinates (-1 to +1)
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // Update raycaster
    raycaster.setFromCamera(new THREE.Vector2(x, y), camera);

    // Raycast against all objects in the scene (excluding the invisible ground plane)
    const intersects = raycaster
      .intersectObjects(scene.children, true)
      .filter((hit) => hit.object.visible && hit.object.type === "Mesh");

    if (intersects.length > 0 && controlsRef.current) {
      // Get the first solid object hit (should be a wall)
      const point = intersects[0].point;

      // Smoothly transition to new target without jumping
      // Store current camera position relative to old target
      const oldTarget = controlsRef.current.target.clone();
      const cameraOffset = camera.position.clone().sub(oldTarget);

      // Set new target
      controlsRef.current.target.copy(point);

      // Maintain camera's relative position
      camera.position.copy(point).add(cameraOffset);

      controlsRef.current.update();

      // Update visual indicator
      setRotationCenter(point.clone());

      // Auto-hide indicator after 2 seconds
      setTimeout(() => setRotationCenter(null), 2000);
    }
  };

  React.useEffect(() => {
    const canvas = gl.domElement;
    canvas.addEventListener("mousedown", handleClick);
    return () => canvas.removeEventListener("mousedown", handleClick);
  }, [gl, camera, raycaster, scene]);

  return (
    <>
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping
        dampingFactor={0.1}
        rotateSpeed={0.8}
        zoomSpeed={1.2}
        panSpeed={0.8}
        minDistance={2}
        maxDistance={50}
        minPolarAngle={0}
        maxPolarAngle={Math.PI / 2}
      />

      {/* Visual indicator for rotation center */}
      {rotationCenter && (
        <group position={rotationCenter}>
          {/* Small sphere at rotation point */}
          <mesh>
            <sphereGeometry args={[0.1, 16, 16]} />
            <meshBasicMaterial color="#60a5fa" transparent opacity={0.6} />
          </mesh>
          {/* Ring around rotation point */}
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.15, 0.2, 32]} />
            <meshBasicMaterial
              color="#3b82f6"
              transparent
              opacity={0.4}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      )}
    </>
  );
}

function BlockitModel() {
  const handleBackgroundClick = () => {
    actions.selectWall(null);
  };

  const handleReset = () => {
    actions.resetBuilding();
  };

  return (
    <div
      id="canvas-container"
      style={{ width: "100%", height: "100%", position: "relative" }}
    >
      {/* Help text overlay */}
      <div
        style={{
          position: "absolute",
          top: "10px",
          left: "10px",
          background: "rgba(0, 0, 0, 0.7)",
          color: "white",
          padding: "8px 12px",
          borderRadius: "6px",
          fontSize: "12px",
          zIndex: 100,
          pointerEvents: "none",
          fontFamily: "monospace",
        }}
      >
        <div style={{ fontWeight: "bold", marginBottom: "4px" }}>Controls</div>
        <div>Click wall to select</div>
        <div>Shift+Click for multi-select</div>
        <div>Arrow keys to move walls</div>
        <div>Escape to deselect</div>
        <div style={{ marginTop: "4px", borderTop: "1px solid #555", paddingTop: "4px" }}>
          Ctrl+Click to set rotation center
        </div>
        <div>Drag to rotate, Scroll to zoom</div>
      </div>

      {/* Reset button */}
      <button
        onClick={handleReset}
        style={{
          position: "absolute",
          top: "10px",
          right: "10px",
          background: "#ef4444",
          color: "white",
          padding: "8px 16px",
          borderRadius: "6px",
          fontSize: "12px",
          fontWeight: "bold",
          zIndex: 100,
          border: "none",
          cursor: "pointer",
          fontFamily: "monospace",
        }}
      >
        Reset Building
      </button>

      <Canvas
        camera={{ position: [15, 15, 15], fov: 50 }}
        shadows
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1,
          outputColorSpace: THREE.SRGBColorSpace,
        }}
      >
        {/* Lighting setup for architectural visualization */}

        {/* Ambient light - soft base illumination */}
        <ambientLight intensity={0.4} />

        {/* Hemisphere light - simulates sky/ground lighting */}
        <hemisphereLight
          color="#ffffff"
          groundColor="#444444"
          intensity={0.6}
          position={[0, 50, 0]}
        />

        {/* Main directional light - sun simulation with shadows */}
        <directionalLight
          position={[10, 10, 5]}
          intensity={0.8}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-far={50}
          shadow-camera-left={-10}
          shadow-camera-right={10}
          shadow-camera-top={10}
          shadow-camera-bottom={-10}
        />

        {/* Fill light - reduces harsh shadows */}
        <directionalLight position={[-5, 5, -5]} intensity={0.3} />

        {/* Building */}
        <Building3D />

        {/* Grid - 300x300mm cells (0.3 x 0.3 meters) */}
        <Grid
          position={[0, -0.01, 0]}
          args={[30, 30]} // 30m x 30m total size (100 cells x 100 cells)
          cellSize={0.3} // 300mm = 0.3m
          cellThickness={0.5}
          cellColor="#6b6b6b"
          sectionSize={3} // Every 10 cells (3m)
          sectionThickness={1}
          sectionColor="#3b82f6"
          fadeStrength={1}
          followCamera={false}
          infiniteGrid={false}
        />

        {/* Invisible plane to catch clicks on empty space */}
        <mesh
          position={[0, -0.01, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          onClick={handleBackgroundClick}
        >
          <planeGeometry args={[100, 100]} />
          <meshBasicMaterial transparent opacity={0} />
        </mesh>

        <ClickToRotate />
      </Canvas>
    </div>
  );
}

const initialNodes: Node[] = [
  { id: "n1", position: { x: 0, y: 0 }, data: { label: "Node 1" } },
  { id: "n2", position: { x: 0, y: 100 }, data: { label: "Node 2" } },
];

const initialEdges: Edge[] = [{ id: "n1-n2", source: "n1", target: "n2" }];

export function NodeEditor() {
  const [nodes, setNodes] = React.useState<Node[]>(initialNodes);
  const [edges, setEdges] = React.useState<Edge[]>(initialEdges);

  const onNodesChange = (changes: NodeChange[]) =>
    setNodes((nodesSnapshot) => applyNodeChanges(changes, nodesSnapshot));
  const onEdgesChange = (changes: EdgeChange[]) =>
    setEdges((edgesSnapshot) => applyEdgeChanges(changes, edgesSnapshot));
  const onConnect = (params: Connection) =>
    setEdges((edgesSnapshot) => addEdge(params, edgesSnapshot));

  return (
    <ChakraBox width="full" height="full" borderRightWidth={1}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
      >
        <Controls />
        <MiniMap />
        <Background gap={12} size={1} />
      </ReactFlow>
    </ChakraBox>
  );
}
