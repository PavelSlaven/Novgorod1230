import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ELK from "elkjs/lib/elk.bundled.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, "..");
const defaultSource = path.resolve(packageRoot, "..", "DOCUMENTS", "documents-kg", "corpus", "DOCUMENTS", "novgorod_graphify_g1_g4_full", "source_tsv");
const sourceDir = path.resolve(process.argv.find((arg) => arg.startsWith("--source="))?.slice(9) ?? defaultSource);
const outputDir = path.resolve(process.argv.find((arg) => arg.startsWith("--output="))?.slice(9) ?? path.join(packageRoot, "generated", "server"));
const useElk = !process.argv.includes("--fast");
const elk = new ELK();

function parseTsv(text) {
  const [headerLine, ...lines] = text.replace(/^\uFEFF/, "").trimEnd().split(/\r?\n/);
  const headers = headerLine.split("\t");
  return lines.filter(Boolean).map((line) => Object.fromEntries(line.split("\t").map((value, index) => [headers[index], value])));
}

function safeName(value) { return value.replace(/[^a-zA-Z0-9_.-]/g, "_"); }
function clamp(value) { return Math.min(.95, Math.max(.05, value)); }

function g1Layout(nodes) {
  const cells = nodes.map((node) => ({ node, coordinates: node.id.match(/_(\d+)_(\d+)$/) })).filter((item) => item.coordinates);
  const xs = cells.map((item) => Number(item.coordinates[1]));
  const ys = cells.map((item) => Number(item.coordinates[2]));
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  return Object.fromEntries(cells.map(({ node, coordinates }) => [node.id, {
    x: .05 + .9 * (Number(coordinates[2]) - minY) / Math.max(1, maxY - minY),
    y: .05 + .9 * (Number(coordinates[1]) - minX) / Math.max(1, maxX - minX)
  }]));
}

function fastLayout(nodes) {
  const columns = Math.ceil(Math.sqrt(nodes.length));
  return Object.fromEntries(nodes.map((node, index) => [node.id, {
    x: .08 + .84 * ((index % columns) / Math.max(1, columns - 1)),
    y: .08 + .84 * (Math.floor(index / columns) / Math.max(1, Math.ceil(nodes.length / columns) - 1))
  }]));
}

async function elkLayout(nodes, edges) {
  const result = await elk.layout({ id: "root", layoutOptions: {
    "elk.algorithm": "layered", "elk.direction": "DOWN", "elk.edgeRouting": "ORTHOGONAL",
    "elk.aspectRatio": "1.0", "elk.spacing.nodeNode": "40", "elk.layered.spacing.nodeNodeBetweenLayers": "55",
    "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP"
  }, children: nodes.map((node) => ({ id: node.id, width: 44, height: 44 })),
  edges: edges.map((edge) => ({ id: edge.id, sources: [edge.from_node_id], targets: [edge.to_node_id] })) });
  const children = result.children ?? [];
  const minX = Math.min(...children.map((node) => node.x ?? 0));
  const maxX = Math.max(...children.map((node) => (node.x ?? 0) + (node.width ?? 0)));
  const minY = Math.min(...children.map((node) => node.y ?? 0));
  const maxY = Math.max(...children.map((node) => (node.y ?? 0) + (node.height ?? 0)));
  const positions = Object.fromEntries(children.map((node) => [node.id, {
    x: clamp(.05 + .9 * (((node.x ?? 0) + 22 - minX) / Math.max(1, maxX - minX))),
    y: clamp(.05 + .9 * (((node.y ?? 0) + 22 - minY) / Math.max(1, maxY - minY)))
  }]));
  const edgeGeometry = {};
  for (const edge of result.edges ?? []) {
    const points = (edge.sections ?? []).flatMap((section) => [section.startPoint, ...(section.bendPoints ?? []), section.endPoint]);
    edgeGeometry[edge.id] = points.map((point) => ({
      x: clamp(.05 + .9 * ((point.x - minX) / Math.max(1, maxX - minX))),
      y: clamp(.05 + .9 * ((point.y - minY) / Math.max(1, maxY - minY)))
    }));
  }
  return { positions, edgeGeometry };
}

const nodesPath = path.join(sourceDir, "novgorod_graph_nodes_g1_g4_full_v6.tsv");
const edgesPath = path.join(sourceDir, "novgorod_graph_edges_g1_g4_full_v6.tsv");
const [nodes, allEdges] = await Promise.all([readFile(nodesPath, "utf8").then(parseTsv), readFile(edgesPath, "utf8").then(parseTsv)]);
const edges = allEdges.filter((edge) => edge.edge_type !== "contains");
const nodeById = new Map(nodes.map((node) => [node.id, node]));
const groups = new Map();
for (const node of nodes) {
  const parent = node.scale_level === "G1" ? "novgorod-region" : node.parent_node_id;
  if (!parent) continue;
  const key = `${node.scale_level}:${parent}`;
  if (!groups.has(key)) groups.set(key, { parent, level: node.scale_level, nodes: [] });
  groups.get(key).nodes.push(node);
}

await mkdir(outputDir, { recursive: true });
const manifest = { formatVersion: 1, source: path.basename(sourceDir), generatedAt: new Date().toISOString(), layouts: [] };
let completed = 0;
for (const group of [...groups.values()].sort((a, b) => `${a.level}:${a.parent}`.localeCompare(`${b.level}:${b.parent}`))) {
  const ids = new Set(group.nodes.map((node) => node.id));
  const localEdges = edges.filter((edge) => ids.has(edge.from_node_id) && ids.has(edge.to_node_id));
  const layout = group.level === "G1"
    ? { positions: g1Layout(group.nodes), edgeGeometry: {} }
    : useElk ? await elkLayout(group.nodes, localEdges) : { positions: fastLayout(group.nodes), edgeGeometry: {} };
  const payload = {
    parentNodeId: group.parent, level: group.level,
    nodes: group.nodes.map((node) => ({ id: node.id, parentNodeId: group.parent, level: node.scale_level, title: node.title, nodeType: node.node_type })),
    edges: localEdges.map((edge) => ({ id: edge.id, reverseEdgeId: edge.reverse_edge_id || undefined, source: edge.from_node_id, target: edge.to_node_id, edgeType: edge.edge_type })),
    layout: { id: `novgorod:${group.level}:${group.parent}:v1`, parentNodeId: group.parent, level: group.level,
      version: 1,
      status: localEdges.some((edge) => ["river", "bridge", "ford", "ferry"].includes(edge.edge_type))
        ? "needs_semantic_review" : "auto_validated",
      positions: layout.positions, edgeGeometry: layout.edgeGeometry }
  };
  const relative = path.join(group.level, `${safeName(group.parent)}.json`);
  await mkdir(path.join(outputDir, group.level), { recursive: true });
  await writeFile(path.join(outputDir, relative), JSON.stringify(payload));
  manifest.layouts.push({
    parentNodeId: group.parent,
    parentTitle: group.parent === "novgorod-region" ? "Новгородская земля" : (nodeById.get(group.parent)?.title ?? group.parent),
    level: group.level,
    file: relative.replaceAll("\\", "/"),
    nodeCount: group.nodes.length,
    edgeCount: localEdges.length
  });
  completed += 1;
  if (completed % 100 === 0) process.stdout.write(`Compiled ${completed}/${groups.size}\r`);
}
await writeFile(path.join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`Compiled ${groups.size} local maps (${nodes.length} nodes, ${edges.length} physical edges) into ${outputDir}`);
console.log("Security: keep generated/server outside public web roots; expose only filtered MapViewDTO responses.");
