import assert from 'node:assert/strict';
import test from 'node:test';
import { SPATIAL_V3_TARGET_PRODUCTION_RELEASE } from
  '../apps/game-server/src/composition/production-spatial-v3-release-v17.js';
import { PARTY_RUNTIME_CATALOG_MIGRATION } from
  '../tools/runtime-catalog-activation/src/forward-migrations.js';

test('v17 production ledger pin literals match forward migration contract (no PG)', () => {
  const release = SPATIAL_V3_TARGET_PRODUCTION_RELEASE;
  assert.equal(
    release.party_runtime_catalog_migration_id,
    PARTY_RUNTIME_CATALOG_MIGRATION.migration_id,
  );
  assert.equal(
    release.party_runtime_catalog_migration_digest,
    PARTY_RUNTIME_CATALOG_MIGRATION.migration_digest,
  );
  assert.match(release.party_runtime_catalog_target_fingerprint, /^[a-f0-9]{64}$/u);
});
