"use client";

import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ReactFlow,
  Background,
  MiniMap,
  type Node,
  type Edge,
  type NodeProps,
  Position,
  Handle,
} from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import "@xyflow/react/dist/style.css";

interface GuideNode {
  id: string;
  topic: string;
  slug: string;
  completionStatus: "not_started" | "in_progress" | "completed";
  sourceCount: number;
  status: string;
}

interface LearningPathGraphProps {
  guides: GuideNode[];
  guideOrder: string[];
}

const NODE_WIDTH = 220;
const NODE_HEIGHT = 60;

/* ---------- Custom node ---------- */

function GuideNodeComponent({ data }: NodeProps) {
  const d = data as {
    topic: string;
    slug: string;
    completionStatus: string;
    sourceCount: number;
    status: string;
    onClick: (slug: string) => void;
  };

  const statusColor =
    d.completionStatus === "completed"
      ? "oklch(0.55 0.15 150)"
      : d.completionStatus === "in_progress"
      ? "var(--primary)"
      : "var(--muted-foreground)";

  const borderColor =
    d.completionStatus === "completed"
      ? "oklch(0.55 0.15 150 / 0.4)"
      : d.completionStatus === "in_progress"
      ? "hsl(var(--primary) / 0.4)"
      : "var(--border)";

  return (
    <>
      <Handle type="target" position={Position.Top} className="!bg-transparent !border-none !w-0 !h-0" />
      <div
        onClick={() => d.onClick(d.slug)}
        className="bg-card rounded-lg border px-4 py-3 cursor-pointer hover:shadow-md transition-shadow"
        style={{ borderColor, width: NODE_WIDTH }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: statusColor }}
          />
          <span
            className="text-sm font-medium truncate"
            style={{ fontFamily: "var(--font-cormorant)", fontWeight: 600 }}
          >
            {d.topic as string}
          </span>
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="label-mono text-muted-foreground/60 text-[10px]">
            {(d.sourceCount as number)} source{(d.sourceCount as number) !== 1 ? "s" : ""}
          </span>
          <span
            className="label-mono text-[10px]"
            style={{ color: statusColor, opacity: d.completionStatus === "not_started" ? 0.5 : 1 }}
          >
            {d.completionStatus === "completed"
              ? "Done"
              : d.completionStatus === "in_progress"
              ? "In Progress"
              : "Not Started"}
          </span>
        </div>
        {d.status === "generating" && (
          <div className="label-mono text-primary text-[10px] mt-0.5 animate-pulse">
            Generating...
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-transparent !border-none !w-0 !h-0" />
    </>
  );
}

const nodeTypes = { guide: GuideNodeComponent };

/* ---------- Layout helper ---------- */

function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", ranksep: 60, nodesep: 40 });

  nodes.forEach((node) => {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });

  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  dagre.layout(g);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = g.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - NODE_WIDTH / 2,
        y: nodeWithPosition.y - NODE_HEIGHT / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}

/* ---------- Main component ---------- */

export function LearningPathGraph({ guides, guideOrder }: LearningPathGraphProps) {
  const router = useRouter();

  const handleNodeClick = useCallback(
    (slug: string) => {
      router.push(`/learn/${slug}`);
    },
    [router],
  );

  const { nodes, edges } = useMemo(() => {
    // Build ordered guide list
    const orderedGuides = guideOrder
      .map((id) => guides.find((g) => g.id === id))
      .filter(Boolean) as GuideNode[];

    // Add any guides not in guideOrder at the end
    const orderedIds = new Set(guideOrder);
    const unordered = guides.filter((g) => !orderedIds.has(g.id));
    const allGuides = [...orderedGuides, ...unordered];

    const rawNodes: Node[] = allGuides.map((guide, i) => ({
      id: guide.id,
      type: "guide",
      position: { x: 0, y: i * 100 },
      data: {
        topic: guide.topic,
        slug: guide.slug,
        completionStatus: guide.completionStatus,
        sourceCount: guide.sourceCount,
        status: guide.status,
        onClick: handleNodeClick,
      },
    }));

    // Create sequence edges from guide order
    const rawEdges: Edge[] = [];
    for (let i = 0; i < orderedGuides.length - 1; i++) {
      rawEdges.push({
        id: `seq-${orderedGuides[i].id}-${orderedGuides[i + 1].id}`,
        source: orderedGuides[i].id,
        target: orderedGuides[i + 1].id,
        type: "smoothstep",
        animated: orderedGuides[i].completionStatus !== "completed",
        style: {
          stroke:
            orderedGuides[i].completionStatus === "completed"
              ? "oklch(0.55 0.15 150 / 0.5)"
              : "var(--border)",
          strokeWidth: 1.5,
        },
      });
    }

    return getLayoutedElements(rawNodes, rawEdges);
  }, [guides, guideOrder, handleNodeClick]);

  if (guides.length === 0) return null;

  const graphHeight = Math.min(Math.max(guides.length * 100 + 80, 250), 500);

  return (
    <div
      className="border border-border rounded-lg bg-card/50 overflow-hidden"
      style={{ height: graphHeight }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag
        zoomOnScroll
        minZoom={0.5}
        maxZoom={1.5}
      >
        <Background gap={20} size={1} color="var(--border)" />
        {guides.length >= 5 && (
          <MiniMap
            nodeColor={(node) => {
              const status = (node.data as Record<string, unknown>).completionStatus;
              return status === "completed"
                ? "oklch(0.55 0.15 150)"
                : status === "in_progress"
                ? "hsl(var(--primary))"
                : "hsl(var(--muted))";
            }}
            maskColor="hsl(var(--background) / 0.8)"
            style={{ border: "1px solid var(--border)", borderRadius: 4 }}
          />
        )}
      </ReactFlow>
    </div>
  );
}
