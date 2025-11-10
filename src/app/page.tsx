"use client";

import React from "react";
import { Canvas } from "@react-three/fiber";
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

function BlockitModel() {
  const handleBackgroundClick = () => {
    actions.selectWall(null);
  };

  return (
    <div id="canvas-container" style={{ width: "100%", height: "100%" }}>
      <Canvas camera={{ position: [5, 5, 5], fov: 50 }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1} />

        {/* Origin point marker */}
        {/* <mesh position={[0, 0.05, 0]}>
          <sphereGeometry args={[0.1, 16, 16]} />
          <meshStandardMaterial color="red" />
        </mesh> */}

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
          fadeDistance={50}
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

        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.05}
          minDistance={2}
          maxDistance={50}
        />
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
