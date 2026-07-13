import { EDGE_LABELS, iconForNode, markerForEdge, styleForEdge } from "../domain/catalog.js";
import type { BuildMapViewInput, CanonicalEdge, MapEdgeDTO, MapViewDTO } from "../domain/types.js";
import { validateMapView } from "./validate-map-view.js";

const clamp = (value: number) => Math.min(0.95, Math.max(0.05, value));

function collapseEdges(edges: CanonicalEdge[], knownEdgeIds: Set<string>): Array<{ primary: CanonicalEdge; reverse?: CanonicalEdge }> {
  const byId = new Map(edges.map((edge) => [edge.id, edge]));
  const consumed = new Set<string>();
  const result: Array<{ primary: CanonicalEdge; reverse?: CanonicalEdge }> = [];
  for (const edge of edges) {
    if (consumed.has(edge.id) || !knownEdgeIds.has(edge.id) || edge.edgeType === "contains") continue;
    const reverse = edge.reverseEdgeId ? byId.get(edge.reverseEdgeId) : undefined;
    consumed.add(edge.id);
    if (reverse && knownEdgeIds.has(reverse.id)) consumed.add(reverse.id);
    result.push({ primary: edge, reverse });
  }
  return result;
}

export function buildMapView(input: BuildMapViewInput): MapViewDTO {
  if (input.layout.parentNodeId !== input.parentNodeId || input.layout.level !== input.level) {
    throw new Error("map_layout_mismatch");
  }
  if (input.layout.status !== "approved" && input.layout.status !== "auto_validated") {
    throw new Error("map_layout_not_approved");
  }

  const nodeKnowledge = new Map(input.nodeKnowledge.map((item) => [item.nodeId, item]));
  const edgeKnowledge = new Map(input.edgeKnowledge.map((item) => [item.edgeId, item]));
  const allowedNodes = new Set(nodeKnowledge.keys());
  if (!allowedNodes.has(input.currentNodeId)) throw new Error("current_position_not_known");

  const nodes = input.nodes.filter((node) => allowedNodes.has(node.id)).map((node) => {
    const knowledge = nodeKnowledge.get(node.id)!;
    const position = input.layout.positions[node.id];
    if (!position) throw new Error(`map_layout_missing_position:${node.id}`);
    return {
      id: node.id, worldNodeId: node.id, title: node.title, shortLabel: node.shortLabel,
      iconKey: node.iconKey ?? iconForNode(node.nodeType), x: clamp(position.x), y: clamp(position.y),
      labelPriority: (node.id === input.currentNodeId ? 3 : 1) as 1 | 3,
      knowledgeState: knowledge.state, current: node.id === input.currentNodeId,
      selectable: true, hasKnownChildren: Boolean(node.hasChildren), visibleStatus: knowledge.visibleStatus
    };
  });

  const knownEdges = new Set(edgeKnowledge.keys());
  const edges: MapEdgeDTO[] = collapseEdges(input.edges, knownEdges)
    .filter(({ primary }) => allowedNodes.has(primary.source) && allowedNodes.has(primary.target))
    .map(({ primary, reverse }) => {
      const knowledge = edgeKnowledge.get(primary.id)!;
      const reverseKnowledge = reverse ? edgeKnowledge.get(reverse.id) : undefined;
      const styleKey = styleForEdge(primary.edgeType);
      return {
        id: primary.id, source: primary.source, target: primary.target, edgeType: primary.edgeType,
        styleKey, markerKey: markerForEdge(primary.edgeType), knowledgeState: knowledge.state,
        traversalState: knowledge.traversalState,
        bendPoints: input.layout.edgeGeometry?.[primary.id] ?? [], knownSummary: knowledge.knownSummary,
        directions: reverseKnowledge ? {
          forward: { traversalState: knowledge.traversalState, knownSummary: knowledge.knownSummary },
          reverse: { traversalState: reverseKnowledge.traversalState, knownSummary: reverseKnowledge.knownSummary }
        } : undefined
      };
    });

  const usedStyles = [...new Set(edges.map((edge) => edge.styleKey))];
  const view: MapViewDTO = {
    layout: { id: input.layout.id, level: input.level, parentNodeId: input.parentNodeId,
      version: input.layout.version, widthRatio: 1, heightRatio: 1 },
    breadcrumbs: input.breadcrumbs ?? [], currentPosition: { nodeId: input.currentNodeId }, nodes, edges,
    legend: usedStyles.map((key) => ({ key, label: EDGE_LABELS[key] ?? EDGE_LABELS.other!, kind: "edge" as const })),
    viewPermissions: { canZoomOut: input.level !== "G1", canOpenParent: input.level !== "G1",
      canOpenChildren: nodes.some((node) => node.hasKnownChildren) }
  };
  validateMapView(view);
  return Object.freeze(view);
}
