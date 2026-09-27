import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { SPATIAL_V3_TARGET_MIGRATION_CHAIN_DIGEST } from
  '../../apps/game-server/src/infrastructure/postgres/spatial-v3-target-migrations.js';
import {
  buildFreshSchemaRequest,
  renderFreshSchemaRequest
} from '../../scripts/build-live-world-v17-fresh-schema-request.mjs';

const REQUEST_PATH = resolve(
  'data/world-catalogs/novgorod/live-world-runtime-v17/fresh-schema-request.json'
);

test('fresh-schema-request rebuild equals committed file and pins chain_digest', () => {
  const committed = readFileSync(REQUEST_PATH, 'utf8');
  const parsed = JSON.parse(committed);
  const rebuilt = buildFreshSchemaRequest({
    source_commit: parsed.source_commit
  });
  assert.equal(
    rebuilt.party_schema.chain_digest,
    SPATIAL_V3_TARGET_MIGRATION_CHAIN_DIGEST
  );
  assert.equal(rebuilt.party_schema.ordered_migrations.length, 37);
  assert.equal(rebuilt.world_schema.ordered_parts.length, 27);
  assert.equal(rebuilt.world_schema.expected_world_base_tables, 217);
  assert.equal(
    renderFreshSchemaRequest(rebuilt),
    committed,
    'fresh-schema-request.json must be rebuilt by scripts/build-live-world-v17-fresh-schema-request.mjs'
  );
});
