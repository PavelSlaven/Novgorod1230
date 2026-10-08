import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCommonCatalogLookupRecords } from '@rus/runtime-catalog/common-lookups';
import { readServerConfig } from '../src/config.js';
import { createSpatialV3ProductionCompositionRoot } from
  '../src/composition/production-spatial-v3.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

test('issue #548 resolves project defaults from module location and preserves explicit root', {
  concurrency: false,
}, async (t) => {
  const originalCwd = process.cwd();
  const foreignCwd = await mkdtemp(join(tmpdir(), 'issue-548-project-root-cwd-'));
  t.after(async () => {
    process.chdir(originalCwd);
    await rm(foreignCwd, { recursive: true, force: true });
  });

  process.chdir(foreignCwd);
  assert.equal(resolve(readServerConfig({}).rootDir), repositoryRoot,
    'server config default root must resolve from its module under a foreign cwd');

  const approved = await loadCommonCatalogLookupRecords();
  const explicitRepositoryRoot = await loadCommonCatalogLookupRecords({ rootDir: repositoryRoot });
  assert.deepEqual(approved.inventory_archetypes, explicitRepositoryRoot.inventory_archetypes,
    'common catalog default and explicit repository root must load the same approved archetypes');
  assert.deepEqual(approved.inventory_archetypes.map(({ inventory_archetype_id }) => inventory_archetype_id),
    ['compact_zero_hand', 'long_bundle']);

  const missingRoot = await mkdtemp(join(tmpdir(), 'issue-548-common-catalog-root-'));
  t.after(() => rm(missingRoot, { recursive: true, force: true }));
  await assert.rejects(
    loadCommonCatalogLookupRecords({ rootDir: missingRoot }),
    { code: 'INVENTORY_ARCHETYPE_CATALOG_INVALID' },
    'explicit root must remain authoritative when its catalog is missing',
  );

  const compositionRoot = await mkdtemp(join(tmpdir(), 'issue-548-composition-root-'));
  t.after(() => rm(compositionRoot, { recursive: true, force: true }));
  await mkdir(join(compositionRoot, 'runtime'));
  await writeFile(join(compositionRoot, 'runtime', 'approvals.json'), '{}');
  let queries = 0;
  let closes = 0;
  const stubPool = {
    async query() {
      queries += 1;
      throw new Error('unexpected database query before activation approvals validate');
    },
  };

  await assert.rejects(
    createSpatialV3ProductionCompositionRoot({
      env: {},
      config: {
        spatialV3BindingsModule: 'builtin:spatial-v3-production-v17',
        rootDir: compositionRoot,
        targetCatalogActivationApprovalsPath: 'runtime/approvals.json',
        runtimeCatalogPinManifestDigest: 'a'.repeat(64),
      },
      pools: { worldPool: stubPool, partyPool: stubPool, async close() { closes += 1; } },
    }),
    { code: 'SPATIAL_V3_TARGET_ACTIVATION_APPROVAL_REQUIRED' },
    'composition must read the real relative approvals file beneath its explicit root',
  );
  assert.equal(queries, 0);
  assert.equal(closes, 1);
});
