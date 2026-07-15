import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { validateSupplementalCatalogBundle } from '../tools/world-catalog-workflow/src/index.js';

const root = resolve(import.meta.dirname, '..');
const bundleRoot = resolve(root, 'data/knowledge-source/imports/universal-category-classification-2026-07-15/stage-3b1/bundle');
const manifest = readJson('manifest.json');
const recordsByTable = Object.fromEntries(manifest.datasets.map((dataset) => [dataset.table, readJson(dataset.path)]));
const result = validateSupplementalCatalogBundle(manifest, recordsByTable, {
  externalIds: {
    regions: new Set(['region_novgorod_land']),
    world_revisions: new Set(['novgorod_1230_research_revision_001']),
    region_social_roles: new Set(['nov_role_guard'])
  }
});
if (result.errors.length > 0) {
  process.stderr.write(`${JSON.stringify({ pass: false, errors: result.errors }, null, 2)}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`${JSON.stringify({ pass: true, mode: 'dry-run', bundle_id: manifest.bundle_id, records: Object.fromEntries(Object.entries(recordsByTable).map(([table, records]) => [table, records.length])) }, null, 2)}\n`);
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(resolve(bundleRoot, relativePath), 'utf8'));
}
