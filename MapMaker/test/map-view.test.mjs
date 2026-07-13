import test from "node:test";
import assert from "node:assert/strict";
import { buildMapView, styleForEdge, validateMapView } from "../dist/index.js";

const base = {
  parentNodeId: "parent", level: "G4",
  nodes: [
    { id: "known-a", parentNodeId: "parent", level: "G4", title: "Двор", nodeType: "yard", hasChildren: false },
    { id: "known-b", parentNodeId: "parent", level: "G4", title: "Часовня", nodeType: "church", hasChildren: false },
    { id: "secret", parentNodeId: "parent", level: "G4", title: "Тайник", nodeType: "hidden_passage", hasChildren: false }
  ],
  edges: [
    { id: "road-ab", reverseEdgeId: "road-ba", source: "known-a", target: "known-b", edgeType: "road" },
    { id: "road-ba", reverseEdgeId: "road-ab", source: "known-b", target: "known-a", edgeType: "road" },
    { id: "secret-edge", source: "known-a", target: "secret", edgeType: "path" },
    { id: "contains", source: "known-a", target: "known-b", edgeType: "contains" }
  ],
  nodeKnowledge: [{ nodeId: "known-a", state: "visited" }, { nodeId: "known-b", state: "rumored" }],
  edgeKnowledge: [
    { edgeId: "road-ab", state: "traversed", traversalState: "open" },
    { edgeId: "road-ba", state: "known_exactly", traversalState: "restricted" },
    { edgeId: "secret-edge", state: "known_exactly", traversalState: "open" },
    { edgeId: "contains", state: "known_exactly", traversalState: "open" }
  ],
  layout: { id: "layout", parentNodeId: "parent", level: "G4", version: 1, status: "approved",
    positions: { "known-a": { x: .2, y: .3 }, "known-b": { x: .8, y: .7 }, secret: { x: .5, y: .5 } } },
  currentNodeId: "known-a"
};

test("projection removes unknown nodes and routes without leaking endpoints", () => {
  const view = buildMapView(base);
  assert.deepEqual(view.nodes.map((node) => node.id), ["known-a", "known-b"]);
  assert.equal(view.edges.length, 1);
  assert.equal(view.edges[0].directions.reverse.traversalState, "restricted");
  assert.ok(!JSON.stringify(view).includes("secret"));
});

test("contains is never rendered and positions remain stable", () => {
  const first = buildMapView(base), second = buildMapView(base);
  assert.deepEqual(first.nodes.map(({ id, x, y }) => ({ id, x, y })), second.nodes.map(({ id, x, y }) => ({ id, x, y })));
  assert.ok(first.edges.every((edge) => edge.edgeType !== "contains"));
});

test("validator rejects hidden endpoints and catalogs unknown styles safely", () => {
  const view = structuredClone(buildMapView(base));
  view.edges[0].target = "secret";
  assert.throws(() => validateMapView(view), /hidden_edge_endpoint/);
  assert.equal(styleForEdge("unregistered_route"), "other");
});
