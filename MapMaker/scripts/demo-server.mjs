import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildMapView } from "../dist/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generatedRoot = path.join(root, "generated", "server");
const staticRoots = ["examples", "dist", "node_modules"];
const levels = new Set(["G1", "G2", "G3", "G4"]);
const types = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".map": "application/json; charset=utf-8"
};

let manifestCache;

async function loadManifest() {
  if (!manifestCache) {
    const manifest = JSON.parse(await readFile(path.join(generatedRoot, "manifest.json"), "utf8"));
    const layouts = manifest.layouts.map((item) => ({ ...item, key: `${item.level}:${item.parentNodeId}` }));
    manifestCache = {
      public: { formatVersion: manifest.formatVersion, generatedAt: manifest.generatedAt,
        layouts: layouts.map(({ key, file, ...item }) => item) },
      byKey: new Map(layouts.map((item) => [item.key, item]))
    };
  }
  return manifestCache;
}

function sendJson(response, status, value) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(value));
}

async function serveManifest(response) {
  try { sendJson(response, 200, (await loadManifest()).public); }
  catch { sendJson(response, 503, { error: "map_data_missing", hint: "Сначала выполните npm run compile:novgorod" }); }
}

async function serveView(url, response) {
  const level = url.searchParams.get("level");
  const parentNodeId = url.searchParams.get("parentNodeId");
  if (!level || !levels.has(level) || !parentNodeId) {
    sendJson(response, 400, { error: "invalid_map_request" });
    return;
  }
  try {
    const manifest = await loadManifest();
    const item = manifest.byKey.get(`${level}:${parentNodeId}`);
    if (!item) { sendJson(response, 404, { error: "local_map_not_found" }); return; }
    const file = path.resolve(generatedRoot, item.file);
    if (!file.startsWith(generatedRoot + path.sep)) throw new Error("unsafe_manifest_path");
    const chunk = JSON.parse(await readFile(file, "utf8"));
    const levelNumber = Number(level.slice(1));
    const nextLevel = levelNumber < 4 ? `G${levelNumber + 1}` : undefined;
    const nodes = chunk.nodes.map((node) => ({
      ...node,
      hasChildren: Boolean(nextLevel && manifest.byKey.has(`${nextLevel}:${node.id}`))
    }));
    if (nodes.length === 0) { sendJson(response, 422, { error: "empty_local_map" }); return; }
    const currentNodeId = url.searchParams.get("currentNodeId");
    const current = nodes.some((node) => node.id === currentNodeId) ? currentNodeId : nodes[0].id;
    const view = buildMapView({
      parentNodeId, level, nodes, edges: chunk.edges,
      layout: { ...chunk.layout, status: "approved" },
      currentNodeId: current,
      nodeKnowledge: nodes.map((node) => ({ nodeId: node.id, state: node.id === current ? "visited" : "known_exactly" })),
      edgeKnowledge: chunk.edges.map((edge) => ({ edgeId: edge.id, state: "known_exactly", traversalState: "open" })),
      breadcrumbs: []
    });
    sendJson(response, 200, view);
  } catch (error) {
    sendJson(response, 500, { error: "dev_view_failed", message: error instanceof Error ? error.message : String(error) });
  }
}

async function serveStatic(pathname, response) {
  const relative = pathname === "/" ? "examples/index.html" : decodeURIComponent(pathname.slice(1));
  const allowed = staticRoots.some((directory) => relative === directory || relative.startsWith(`${directory}/`));
  if (!allowed) { response.writeHead(404).end("Not found"); return; }
  const file = path.resolve(root, relative);
  if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error("not_file");
    response.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream" });
    createReadStream(file).pipe(response);
  } catch { response.writeHead(404).end("Not found"); }
}

createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (url.pathname === "/dev-api/manifest") { await serveManifest(response); return; }
  if (url.pathname === "/dev-api/view") { await serveView(url, response); return; }
  await serveStatic(url.pathname, response);
}).listen(4179, "127.0.0.1", () => {
  console.log("MapMaker G1-G4 explorer: http://127.0.0.1:4179");
  console.log("DEV ONLY: the explorer intentionally treats canonical chunk data as known.");
});
