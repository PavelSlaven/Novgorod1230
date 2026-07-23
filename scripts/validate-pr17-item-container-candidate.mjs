import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { validatePr17ItemContainerCandidateBundle } from '../tools/world-catalog-workflow/src/index.js';

const root = resolve(import.meta.dirname, '..');
const candidateRoot = resolve(root, 'data/knowledge-source/imports/item-container-120-v5/candidate');
const manifest = readJson('manifest.json');
const records = Object.fromEntries(manifest.datasets.map((dataset) => [dataset.table, readJson(dataset.path)]));
const compilation = readJson('reports/COMPILATION_REPORT.json');
const result = validatePr17ItemContainerCandidateBundle({
  manifest,
  records_by_table: records,
  reports: {
    compilation,
    editorial_readiness: readJson('reports/EDITORIAL_READINESS_REPORT.json'),
    g4_coverage: readJson('reports/G4_COVERAGE_REPORT.json')
  },
  external_ids: {
    regions: ['region_novgorod_land'],
    world_revisions: ['novgorod_1230_research_revision_001'],
    graph_nodes: compilation.graph_node_status_transitions.map((transition) => transition.graph_node_id),
    region_social_roles: ['nov_role_guard']
  }
});
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!result.pass) process.exitCode = 1;

function readJson(path) { return JSON.parse(readFileSync(resolve(candidateRoot, path), 'utf8')); }
