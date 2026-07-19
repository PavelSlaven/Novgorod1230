import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { buildGraphEdgeMigrationInventory, summarizeGraphEdgeMigrationInventory } from './p10-graph-edge-migration.mjs';

const archive = 'data/world-base-sources/rus13-base-v1.tar.gz';
const member = 'nov_region_audit/novgorod_full_graph_g1_g4_v6_game_ready_EXTRACTED/novgorod_full_graph_g1_g4_v6_game_ready/tsv_import/novgorod_graph_edges_g1_g4_full_v6.tsv';
const output = 'docs/migration/spatial-v3/p10-legacy-graph-edge-inventory.ndjson';
const summaryOutput = 'docs/migration/spatial-v3/p10-legacy-graph-edge-inventory.summary.json';
const sha256 = (text) => createHash('sha256').update(text).digest('hex');

export function buildActualLegacyGraphEdgeInventory({ tsv }) {
  const [header, ...lines] = tsv.trimEnd().split(/\r?\n/u);
  const columns = header.split('\t');
  for (const required of ['id', 'from_node_id', 'to_node_id', 'scale_level', 'edge_type', 'reverse_edge_id']) if (!columns.includes(required)) throw new Error(`legacy graph-edge source lacks ${required}`);
  const index = Object.fromEntries(columns.map((column, position) => [column, position]));
  const edges = lines.map((line) => { const row = line.split('\t'); return { id: row[index.id], from_node_id: row[index.from_node_id], to_node_id: row[index.to_node_id], scale_level: row[index.scale_level] || null, edge_type: row[index.edge_type] || null, reverse_edge_id: row[index.reverse_edge_id] || null }; });
  return buildGraphEdgeMigrationInventory({ graphEdges: edges });
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  const extracted = spawnSync('tar', ['-xOf', archive, member], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (extracted.status !== 0) throw new Error(extracted.stderr || 'could not extract pinned legacy graph-edge source');
  const rows = buildActualLegacyGraphEdgeInventory({ tsv: extracted.stdout });
  const summary = { source_archive: archive, source_member: member, source_sha256: sha256(extracted.stdout), ...summarizeGraphEdgeMigrationInventory(rows), policy: 'Every unreviewed legacy edge is a typed gap; no terrain/time/reverse field becomes authoritative v3 topology.' };
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8');
  await writeFile(summaryOutput, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(summary)}\n`);
}
