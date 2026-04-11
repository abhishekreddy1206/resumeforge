"use client";

import { useEffect, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";

interface GraphNode {
  id: string;
  label: string;
  slug: string;
  status: "not_started" | "in_progress" | "completed";
  pathId: string | null;
  pathTitle: string | null;
  category: string | null;
}

interface GraphEdge {
  source: string;
  target: string;
  type: "path_sequence" | "shared_source" | "related_concept";
  label?: string;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  paths: Array<{ id: string; title: string }>;
}

interface SimNode extends SimulationNodeDatum {
  id: string;
  label: string;
  slug: string;
  status: string;
  pathId: string | null;
}

interface SimLink extends SimulationLinkDatum<SimNode> {
  type: string;
  label?: string;
}

interface RenderedNode {
  id: string;
  label: string;
  slug: string;
  status: string;
  pathId: string | null;
  x: number;
  y: number;
}

interface RenderedLink {
  sourceId: string;
  targetId: string;
  type: string;
  label?: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const HEIGHT = 450;
const NODE_R = 20;
const NODE_R_HOVER = 22;

function truncateLabel(label: string, maxLen = 20): string {
  return label.length > maxLen ? label.slice(0, maxLen) + "…" : label;
}

function nodeColor(status: string): React.CSSProperties {
  if (status === "completed") return { fill: "oklch(0.55 0.15 150)" };
  if (status === "in_progress") return { fill: "var(--primary)" };
  return { fill: "var(--muted-foreground)", opacity: 0.3 };
}

function edgeStyle(
  type: string,
  highlighted: boolean,
  dimmed: boolean
): React.SVGProps<SVGLineElement> {
  const baseOpacity = type === "path_sequence" ? 0.4 : type === "shared_source" ? 0.3 : 0.2;
  const opacity = highlighted ? 0.8 : dimmed ? 0.05 : baseOpacity;

  if (type === "path_sequence") {
    return {
      stroke: "var(--muted-foreground)",
      strokeWidth: 1.5,
      opacity,
      markerEnd: "url(#arrowhead)",
    };
  }
  if (type === "shared_source") {
    return {
      stroke: "var(--primary)",
      strokeWidth: 1,
      strokeDasharray: "6 3",
      opacity,
    };
  }
  return {
    stroke: "var(--muted-foreground)",
    strokeWidth: 1,
    strokeDasharray: "2 4",
    opacity,
  };
}

export function KnowledgeGraph() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [loading, setLoading] = useState(true);
  const [nodes, setNodes] = useState<RenderedNode[]>([]);
  const [links, setLinks] = useState<RenderedLink[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Measure container width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setWidth(el.getBoundingClientRect().width || 600);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fetch graph data and run simulation
  useEffect(() => {
    fetch("/api/learn/knowledge-graph")
      .then((r) => (r.ok ? r.json() : { nodes: [], edges: [], paths: [] }))
      .then((data: GraphData) => {
        if (!data.nodes || data.nodes.length === 0) {
          setNodes([]);
          setLinks([]);
          setLoading(false);
          return;
        }

        // Build sim nodes
        const simNodes: SimNode[] = data.nodes.map((n) => ({
          id: n.id,
          label: n.label,
          slug: n.slug,
          status: n.status,
          pathId: n.pathId,
        }));

        // Build sim links (d3-force resolves string IDs)
        const simLinks: SimLink[] = data.edges.map((e) => ({
          source: e.source,
          target: e.target,
          type: e.type,
          label: e.label,
        }));

        const sim = forceSimulation<SimNode>(simNodes)
          .force(
            "link",
            forceLink<SimNode, SimLink>(simLinks)
              .id((d) => d.id)
              .distance(120)
          )
          .force("charge", forceManyBody<SimNode>().strength(-200))
          .force("center", forceCenter(width / 2, HEIGHT / 2))
          .force("collide", forceCollide<SimNode>(40));

        // Run synchronously
        sim.tick(100);
        sim.stop();

        // Extract positions
        const renderedNodes: RenderedNode[] = simNodes.map((n) => ({
          id: n.id,
          label: n.label,
          slug: n.slug,
          status: n.status,
          pathId: n.pathId,
          x: n.x ?? width / 2,
          y: n.y ?? HEIGHT / 2,
        }));

        // After simulation, SimLink source/target are resolved to SimNode objects
        const nodeById = new Map(renderedNodes.map((n) => [n.id, n]));
        const renderedLinks: RenderedLink[] = simLinks.map((l) => {
          const src = l.source as SimNode;
          const tgt = l.target as SimNode;
          const srcNode = nodeById.get(src.id ?? (l.source as string));
          const tgtNode = nodeById.get(tgt.id ?? (l.target as string));
          return {
            sourceId: src.id ?? (l.source as string),
            targetId: tgt.id ?? (l.target as string),
            type: l.type,
            label: l.label,
            x1: srcNode?.x ?? 0,
            y1: srcNode?.y ?? 0,
            x2: tgtNode?.x ?? 0,
            y2: tgtNode?.y ?? 0,
          };
        });

        setNodes(renderedNodes);
        setLinks(renderedLinks);
        setLoading(false);
      })
      .catch(() => {
        setNodes([]);
        setLinks([]);
        setLoading(false);
      });
    // Re-run when width changes so layout fills the container
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width]);

  // Determine which edges connect to hovered node
  const connectedEdgeIndices = hoveredId
    ? new Set(
        links
          .map((l, i) => (l.sourceId === hoveredId || l.targetId === hoveredId ? i : -1))
          .filter((i) => i !== -1)
      )
    : null;

  const connectedNodeIds = hoveredId
    ? new Set(
        links
          .filter((l) => l.sourceId === hoveredId || l.targetId === hoveredId)
          .flatMap((l) => [l.sourceId, l.targetId])
      )
    : null;

  if (loading) {
    return (
      <div ref={containerRef} className="w-full">
        <Skeleton className="w-full rounded skeleton-shimmer" style={{ height: HEIGHT }} />
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div
        ref={containerRef}
        className="w-full flex items-center justify-center text-muted-foreground text-sm"
        style={{ height: HEIGHT }}
      >
        Generate a few guides to see your knowledge map
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full overflow-hidden" style={{ height: HEIGHT }}>
      <svg
        width={width}
        height={HEIGHT}
        style={{ fontFamily: "var(--font-geist-sans)" }}
      >
        <defs>
          <marker
            id="arrowhead"
            viewBox="0 0 10 6"
            refX="10"
            refY="3"
            markerWidth="8"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 3 L 0 6 z" fill="var(--muted-foreground)" opacity="0.5" />
          </marker>
        </defs>

        {/* Edges */}
        {links.map((link, i) => {
          const highlighted = hoveredId !== null && connectedEdgeIndices!.has(i);
          const dimmed = hoveredId !== null && !connectedEdgeIndices!.has(i);
          return (
            <line
              key={i}
              x1={link.x1}
              y1={link.y1}
              x2={link.x2}
              y2={link.y2}
              {...edgeStyle(link.type, highlighted, dimmed)}
            />
          );
        })}

        {/* Nodes */}
        {nodes.map((node) => {
          const isHovered = node.id === hoveredId;
          const isDimmed =
            hoveredId !== null &&
            !isHovered &&
            connectedNodeIds !== null &&
            !connectedNodeIds.has(node.id);
          const r = isHovered ? NODE_R_HOVER : NODE_R;
          const colorStyle = nodeColor(node.status);
          const circleOpacity = isDimmed ? 0.2 : isHovered ? 1 : colorStyle.opacity ?? 1;

          return (
            <g
              key={node.id}
              transform={`translate(${node.x},${node.y})`}
              style={{ cursor: "pointer" }}
              onClick={() => {
                window.location.href = `/learn/${node.slug}`;
              }}
              onMouseEnter={() => setHoveredId(node.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <circle
                r={r}
                style={{
                  fill: colorStyle.fill,
                  opacity: circleOpacity,
                  stroke: "var(--border)",
                  strokeWidth: 1.5,
                  transition: "r 0.1s ease, opacity 0.15s ease",
                }}
              />
              <text
                y={NODE_R_HOVER + 15}
                textAnchor="middle"
                fontSize={10}
                style={{
                  fill: "var(--foreground)",
                  opacity: isDimmed ? 0.2 : 1,
                  transition: "opacity 0.15s ease",
                  userSelect: "none",
                }}
              >
                {truncateLabel(node.label)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
