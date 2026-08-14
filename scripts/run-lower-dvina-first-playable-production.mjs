#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import pg from 'pg';

import {
  LOWER_DVINA_BOUNDARY_V3_RELEASE
} from '../tools/runtime-catalog-activation/src/lower-dvina-boundary-v3-activation.js';
import {
  PARTY_RUNTIME_CATALOG_MIGRATION,
  WORLD_RUNTIME_CATALOG_MIGRATION
} from '../tools/runtime-catalog-activation/src/forward-migrations.js';
import {
  evaluateFirstPlayableProductionPreflight
} from '../tools/runtime-catalog-activation/src/production-preflight.js';
import {
  applyFreshLowerDvinaProductionSetup
} from './lower-dvina-first-playable-production-setup.mjs';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    confirm: { type: 'boolean', default: false },
    'expected-request-digest': { type: 'string' },
    'expected-world-database': { type: 'string' },
    'expected-party-database': { type: 'string' },
    'world-db-url': { type: 'string' },
    'party-db-url': { type: 'string' },
    'repository-root': { type: 'string' },
    'authorization-ref': { type: 'string' },
    output: { type: 'string' }
  }
});

const mode = positionals[0] ?? 'preflight';
if (!['preflight', 'rehearsal', 'apply'].includes(mode)) {
  fail('PRODUCTION_MODE_INVALID', `Unsupported mode: ${mode}`);
}
const repositoryRoot = resolve(values['repository-root'] ?? process.cwd());
const worldUrl = required(values['world-db-url'], 'world database URL');
const partyUrl = required(values['party-db-url'], 'party database URL');
const expectedWorldDatabase = required(
  values['expected-world-database'],
  'expected world database'
);
const expectedPartyDatabase = required(
  values['expected-party-database'],
  'expected party database'
);
const gitState = readCanonicalGitState(repositoryRoot);
const request = buildProductionRequest({
  gitState,
  expectedWorldDatabase,
  expectedPartyDatabase
});
const worldPool = new pg.Pool({ connectionString: worldUrl, max: 2 });
const partyPool = new pg.Pool({ connectionString: partyUrl, max: 2 });

try {
  const preflight = await readPreflight({
    worldPool,
    partyPool,
    expectedWorldDatabase,
    expectedPartyDatabase
  });
  if (mode === 'preflight') {
    await emit({
      schema: 'rus.lower_dvina_production_preflight.v1',
      status: preflight.ready ? 'ready' : 'blocked',
      request,
      preflight
    });
  } else {
    if (!values.confirm) {
      fail(
        'PRODUCTION_CONFIRMATION_REQUIRED',
        'apply requires --confirm and an exact request digest'
      );
    }
    if (values['expected-request-digest'] !== request.request_digest) {
      fail(
        'PRODUCTION_REQUEST_DIGEST_MISMATCH',
        'The expected production request digest does not match'
      );
    }
    if (mode === 'apply'
        && (!gitState.canonical_main_exact || !gitState.clean)) {
      fail(
        'PRODUCTION_CANONICAL_SOURCE_REQUIRED',
        'Production apply requires clean HEAD equal to updated origin/main'
      );
    }
    if (!preflight.ready || !preflight.fresh) {
      fail(
        'PRODUCTION_DATABASE_NOT_FRESH',
        'Initial production apply accepts only two exact empty databases'
      );
    }
    if (mode === 'rehearsal'
        && (
          !expectedWorldDatabase.startsWith('pr17_rehearsal_')
          || !expectedPartyDatabase.startsWith('lower_dvina_rehearsal_')
        )) {
      fail(
        'REHEARSAL_DATABASE_IDENTITY_REQUIRED',
        'Rehearsal accepts only explicitly named disposable databases'
      );
    }
    const setup = await applyFreshLowerDvinaProductionSetup({
      worldPool, partyPool, worldUrl, repositoryRoot,
      gitCommitSha: gitState.head,
      authorizationRef: required(values['authorization-ref'],
        'authorization reference')
    });
    await emit({
      schema: 'rus.lower_dvina_production_activation_result.v1',
      status: mode === 'apply'
        ? 'active'
        : 'validated_rehearsal_not_production',
      request,
      database_identity: {
        world_database: expectedWorldDatabase,
        party_database: expectedPartyDatabase
      },
      ...setup
    });
  }
} finally {
  await Promise.all([worldPool.end(), partyPool.end()]);
}

function readCanonicalGitState(root) {
  const git = (...args) => execFileSync(
    'git',
    args,
    { cwd: root, encoding: 'utf8' }
  ).trim();
  execFileSync('git', ['fetch', '--prune', 'origin'], {
    cwd: root,
    stdio: 'ignore'
  });
  const head = git('rev-parse', 'HEAD');
  const originMain = git('rev-parse', 'origin/main');
  return {
    head,
    origin_main: originMain,
    canonical_main_exact: head === originMain,
    clean: git('status', '--porcelain') === ''
  };
}

function buildProductionRequest({
  gitState,
  expectedWorldDatabase,
  expectedPartyDatabase
}) {
  const payload = {
    schema: 'rus.lower_dvina_production_activation_request.v1',
    git_commit_sha: gitState.head,
    origin_main_sha: gitState.origin_main,
    release_id: LOWER_DVINA_BOUNDARY_V3_RELEASE.releaseId,
    world_revision_id:
      LOWER_DVINA_BOUNDARY_V3_RELEASE.worldRevision,
    world_catalog_digest:
      LOWER_DVINA_BOUNDARY_V3_RELEASE.worldCatalogDigest,
    world_catalog_manifest_sha256:
      LOWER_DVINA_BOUNDARY_V3_RELEASE.worldManifestSha256,
    target_migration_chain_digest:
      'b7a9eb899b5d302dc27bff6797f1bb6abf31b245ace3e7c285f94543e3039d45',
    world_runtime_catalog_migration_digest:
      WORLD_RUNTIME_CATALOG_MIGRATION.migration_digest,
    party_runtime_catalog_migration_digest:
      PARTY_RUNTIME_CATALOG_MIGRATION.migration_digest,
    expected_world_database: expectedWorldDatabase,
    expected_party_database: expectedPartyDatabase,
    production_activation: true
  };
  return {
    ...payload,
    request_digest: digest(payload)
  };
}

async function readPreflight({
  worldPool,
  partyPool,
  expectedWorldDatabase,
  expectedPartyDatabase
}) {
  const [world, party] = await Promise.all([
    databaseInventory(worldPool),
    databaseInventory(partyPool)
  ]);
  return evaluateFirstPlayableProductionPreflight({
    world,
    party,
    expectedWorldDatabase,
    expectedPartyDatabase
  });
}

async function databaseInventory(pool) {
  const row = (await pool.query(
    `SELECT
       current_database() AS database,
       current_user AS principal,
       (
         SELECT count(*)::int
         FROM information_schema.tables
         WHERE table_schema NOT IN (
           'pg_catalog',
           'information_schema'
         )
       ) AS user_table_count`
  )).rows[0];
  return {
    database: row.database,
    principal: row.principal,
    user_table_count: Number(row.user_table_count)
  };
}

async function emit(value) {
  const rendered = `${JSON.stringify(value, null, 2)}\n`;
  if (values.output) {
    if (!isAbsolute(values.output)) {
      fail('PRODUCTION_EVIDENCE_PATH_INVALID', 'Evidence path must be absolute');
    }
    const output = resolve(values.output);
    await writeFile(output, rendered, 'utf8');
  } else {
    process.stdout.write(rendered);
  }
}

function digest(value) {
  return createHash('sha256')
    .update(JSON.stringify(value))
    .digest('hex');
}

function required(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized) fail('PRODUCTION_INPUT_REQUIRED', `${label} is required`);
  return normalized;
}

function fail(code, message) {
  throw Object.assign(new Error(message), { code });
}
