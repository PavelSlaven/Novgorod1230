import type { MapViewDTO } from "../domain/types.js";

const forbiddenKeys = new Set(["hidden", "truth", "actualRisk", "secret", "canonicalDistance", "baseDistanceKm"]);

export function validateMapView(view: MapViewDTO): void {
  const nodeIds = new Set<string>();
  for (const node of view.nodes) {
    if (nodeIds.has(node.id)) throw new Error(`duplicate_visible_node:${node.id}`);
    nodeIds.add(node.id);
    if (node.x < 0 || node.x > 1 || node.y < 0 || node.y > 1) throw new Error(`position_outside_square:${node.id}`);
  }
  if (!nodeIds.has(view.currentPosition.nodeId)) throw new Error("current_position_not_visible");
  for (const edge of view.edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) throw new Error(`hidden_edge_endpoint:${edge.id}`);
    for (const point of edge.bendPoints) {
      if (point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) throw new Error(`bend_point_outside_square:${edge.id}`);
    }
  }
  const visit = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (forbiddenKeys.has(key)) throw new Error(`hidden_field_leak:${key}`);
      visit(child);
    }
  };
  visit(view);
}
