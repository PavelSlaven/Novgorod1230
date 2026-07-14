#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { createSquareLayout, importGraphDocument, projectRenderableGraph, renderGraphSvg } from './index.js';

const args = readArgs(process.argv.slice(2));
if (!args.input || !args.out) fail('usage: rus-map-maker --input graph.json --out output-dir [--source-id id]');
const inputPath = resolve(args.input);
const outDir = resolve(args.out);
assertSafeOutput(outDir);
const raw = JSON.parse(await readFile(inputPath, 'utf8'));
const imported = importGraphDocument(raw, { sourceId: args['source-id'] ?? inputPath });
const layout = imported.layout_sidecar.nodes.length === imported.game_graph.nodes.length
  ? imported.layout_sidecar
  : createSquareLayout(imported.game_graph);
const renderable = projectRenderableGraph(imported.game_graph, layout);
await mkdir(outDir, { recursive: true });
await writeFile(resolve(outDir, 'game-graph.json'), `${JSON.stringify(imported.game_graph, null, 2)}\n`, 'utf8');
await writeFile(resolve(outDir, 'layout.json'), `${JSON.stringify(layout, null, 2)}\n`, 'utf8');
await writeFile(resolve(outDir, 'preview.svg'), renderGraphSvg(renderable), 'utf8');
console.log(`map-maker export complete: ${outDir}`);

function assertSafeOutput(path) {
  const projectRoot = resolve(import.meta.dirname, '../../..');
  const rel = relative(projectRoot, path).replaceAll('\\', '/');
  if (!rel || rel.startsWith('..')) return;
  for (const prefix of ['apps/', 'packages/', 'legacy/', 'data/', 'schemas/']) if (rel.startsWith(prefix)) fail(`refusing to write tool output into ${prefix}`);
}
function readArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  return out;
}
function fail(message) { console.error(message); process.exit(1); }
