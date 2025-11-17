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
        <SimpleGrid columns={2} gap={2} h="100vh" w="100vw">
          <NodeEditor />
          <BlockitModel />
        </SimpleGrid>
      </ChakraBox>
    </ChakraBox>
  );
}

function ClickToRotate() {
  const { camera, raycaster, scene, gl } = useThree();
  const controlsRef = useRef<OrbitControlsType | null>(null);

  const handleClick = (event: MouseEvent) => {
    // Shift + Click to set rotation center
    if (!event.shiftKey) return;

    const canvas = gl.domElement;
    const rect = canvas.getBoundingClientRect();

    // Calculate normalized device coordinates (-1 to +1)
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // Update raycaster
    raycaster.setFromCamera(new THREE.Vector2(x, y), camera);

    // Raycast against all objects in the scene
    const intersects = raycaster.intersectObjects(scene.children, true);

    if (intersects.length > 0 && controlsRef.current) {
      // Set orbit controls target to the clicked point
      const point = intersects[0].point;
      controlsRef.current.target.copy(point);
      controlsRef.current.update();
    }
  };

  React.useEffect(() => {
    const canvas = gl.domElement;
    canvas.addEventListener("click", handleClick);
    return () => canvas.removeEventListener("click", handleClick);
  }, [gl]);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.05}
      minDistance={2}
      maxDistance={50}
    />
  );
}

function BlockitModel() {
  const handleBackgroundClick = () => {
    actions.selectWall(null);
  };

  return (
    <div id="canvas-container" style={{ width: "100%", height: "100%" }}>
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
