#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import pg from 'pg';

import {
  applyLowerDvinaBoundaryV3ActivationBundle,
  buildLowerDvinaBoundaryV3ActivationBundle,
  LOWER_DVINA_BOUNDARY_V3_RELEASE
} from '../tools/runtime-catalog-activation/src/lower-dvina-boundary-v3-activation.js';
import {
  runPartyRuntimeCatalogMigration,
  runWorldRuntimeCatalogMigration
} from '../tools/runtime-catalog-activation/src/forward-migrations.js';
import {
  buildProductionCutoverPhaseEvent,
  deleteAuthorizedProductionParties,
  evaluateLowerDvinaV3ProductionCutover,
  recordProductionCutoverPhase
} from '../tools/runtime-catalog-activation/src/lower-dvina-v3-production-cutover.js';
import {
  buildLowerDvinaBoundaryV1ImportSql
} from '../tools/spatial-v3/lower-dvina-boundary-v1-importer.mjs';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    confirm: { type: 'boolean', default: false },
    'delete-existing-parties': { type: 'boolean', default: false },
    'expected-request-digest': { type: 'string' },
    'expected-previous-event-id': { type: 'string' },
    'expected-party-id': { type: 'string', multiple: true },
    'expected-world-database': { type: 'string' },
    'expected-party-database': { type: 'string' },
    'expected-world-principal': { type: 'string' },
    'expected-party-principal': { type: 'string' },
    'world-db-url': { type: 'string' },
    'party-db-url': { type: 'string' },
    'repository-root': { type: 'string' },
    'authorization-ref': { type: 'string' },
    output: { type: 'string' }
  }
});

const mode = positionals[0] ?? 'preflight';
if (!['preflight', 'apply'].includes(mode)) {
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
const expectedWorldPrincipal = required(
  values['expected-world-principal'],
  'expected world principal'
);
const expectedPartyPrincipal = required(
  values['expected-party-principal'],
  'expected party principal'
);
const expectedPreviousEventId = required(
  values['expected-previous-event-id'],
  'expected previous activation event ID'
);
const expectedPartyIds = [...new Set(
  values['expected-party-id'] ?? []
)].sort();
if (expectedPartyIds.length === 0) {
  fail(
    'PRODUCTION_PARTY_DELETE_SCOPE_REQUIRED',
    'At least one --expected-party-id is required.'
  );
}
const authorizationRef = required(
  values['authorization-ref'],
  'authorization reference'
);
const gitState = readCanonicalGitState(repositoryRoot);
const request = buildCutoverRequest({
  gitState,
  expectedWorldDatabase,
  expectedPartyDatabase,
  expectedWorldPrincipal,
  expectedPartyPrincipal,
  expectedPreviousEventId,
  expectedPartyIds,
  authorizationRef
});
const worldPool = new pg.Pool({ connectionString: worldUrl, max: 2 });
const partyPool = new pg.Pool({ connectionString: partyUrl, max: 2 });

try {
  const inventory = await readCutoverInventory({
    worldPool,
    partyPool
  });
  if (inventory.world.principal !== expectedWorldPrincipal
      || inventory.party.principal !== expectedPartyPrincipal) {
    fail(
      'PRODUCTION_PRINCIPAL_MISMATCH',
      'Connected database principals differ from the exact expected operators.'
    );
  }
  const expectedPreparedEvent = buildProductionCutoverPhaseEvent({
    request,
    phase: 'prepared'
  });
  const preflight = evaluateLowerDvinaV3ProductionCutover({
    ...inventory,
    expectedWorldDatabase,
    expectedPartyDatabase,
    expectedPreviousEventId,
    expectedPartyIds,
    requestDigest: request.request_digest,
    expectedPreparedEvent
  });
  if (mode === 'preflight') {
    await emit({
      schema: 'rus.lower_dvina_v3_production_cutover_preflight.v1',
      status: preflight.status,
      request,
      preflight
    });
  } else if (preflight.already_active) {
    await emit({
      schema: 'rus.lower_dvina_v3_production_cutover_result.v1',
      status: 'already_active_no_mutation',
      request,
      preflight
    });
  } else {
    assertApplyAuthority({
      gitState,
      request,
      preflight
    });
    await worldPool.query(await readFile(
      resolve(repositoryRoot, 'infra/world-base/schema/20.sql'),
      'utf8'
    ));
    const migrations = {
      world: await runWorldRuntimeCatalogMigration(worldPool),
      party: await runPartyRuntimeCatalogMigration(partyPool)
    };
    await worldPool.query(await buildLowerDvinaBoundaryV1ImportSql({
      root: repositoryRoot
    }));
    await worldPool.query(await readFile(
      resolve(
        repositoryRoot,
        'infra/operator-control/001_lower_dvina_v3_cutover_events.sql'
      ),
      'utf8'
    ));
    const prepared = await recordProductionCutoverPhase({
      worldPool,
      event: expectedPreparedEvent
    });
    const destructiveInventory = await readCutoverInventory({
      worldPool,
      partyPool
    });
    const destructivePreflight = evaluateLowerDvinaV3ProductionCutover({
      ...destructiveInventory,
      expectedWorldDatabase,
      expectedPartyDatabase,
      expectedPreviousEventId,
      expectedPartyIds,
      requestDigest: request.request_digest,
      expectedPreparedEvent
    });
    if (!destructivePreflight.ready) {
      fail(
        'PRODUCTION_CUTOVER_DESTRUCTIVE_RECHECK_BLOCKED',
        'Fresh exact world and party recheck failed before party cleanup.'
      );
    }
    const cleanup = destructivePreflight.ready_with_party
      ? await deleteAuthorizedProductionParties({
          partyPool,
          expectedPartyIds
        })
      : Object.freeze({
          status: 'observed_empty_after_exact_prepared_event',
          party_ids: expectedPartyIds,
          remaining_party_count: 0
        });
    const cleanupCommitted =
      destructivePreflight.exact_cleanup_committed_event
      ? Object.freeze({
          status: 'already_recorded_from_preflight',
          request_digest: request.request_digest,
          phase: 'party_cleanup_committed'
        })
      : await recordProductionCutoverPhase({
          worldPool,
          event: buildProductionCutoverPhaseEvent({
            request,
            phase: 'party_cleanup_committed',
            partyCleanupResult: cleanup
          })
        });
    const bundle = await buildLowerDvinaBoundaryV3ActivationBundle({
      worldPool,
      partyPool,
      repositoryRoot,
      gitCommitSha: gitState.head,
      authorizationRef
    });
    const activation = await applyLowerDvinaBoundaryV3ActivationBundle({
      worldPool,
      partyPool,
      bundle
    });
    const readback = await readExactReadback({
      worldPool,
      partyPool,
      bundle
    });
    await emit({
      schema: 'rus.lower_dvina_v3_production_cutover_result.v1',
      status: 'active',
      request,
      prepared,
      destructive_preflight: destructivePreflight,
      cleanup,
      cleanup_committed: cleanupCommitted,
      migrations,
      bundle_digest: bundle.bundle_digest,
      activation,
      readback
    });
  }
} finally {
  await Promise.all([worldPool.end(), partyPool.end()]);
}

function assertApplyAuthority({ gitState, request, preflight }) {
  if (!values.confirm || !values['delete-existing-parties']) {
    fail(
      'PRODUCTION_CUTOVER_CONFIRMATION_REQUIRED',
      'Apply requires --confirm and --delete-existing-parties.'
    );
  }
  if (values['expected-request-digest'] !== request.request_digest) {
    fail(
      'PRODUCTION_REQUEST_DIGEST_MISMATCH',
      'The expected production request digest does not match.'
    );
  }
  if (!gitState.canonical_main_exact || !gitState.clean) {
    fail(
      'PRODUCTION_CANONICAL_SOURCE_REQUIRED',
      'Production apply requires clean HEAD equal to updated origin/main.'
    );
  }
  if (!preflight.ready) {
    fail(
      'PRODUCTION_CUTOVER_PREFLIGHT_BLOCKED',
      'Exact predecessor, party scope, database identity, or idle-state check failed.'
    );
  }
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

function buildCutoverRequest({
  gitState,
  expectedWorldDatabase,
  expectedPartyDatabase,
  expectedWorldPrincipal,
  expectedPartyPrincipal,
  expectedPreviousEventId,
  expectedPartyIds,
  authorizationRef
}) {
  const payload = {
    schema: 'rus.lower_dvina_v3_production_cutover_request.v1',
    git_commit_sha: gitState.head,
    origin_main_sha: gitState.origin_main,
    release_id: LOWER_DVINA_BOUNDARY_V3_RELEASE.releaseId,
    world_revision_id: LOWER_DVINA_BOUNDARY_V3_RELEASE.worldRevision,
    world_catalog_digest:
      LOWER_DVINA_BOUNDARY_V3_RELEASE.worldCatalogDigest,
    world_catalog_manifest_sha256:
      LOWER_DVINA_BOUNDARY_V3_RELEASE.worldManifestSha256,
    expected_world_database: expectedWorldDatabase,
    expected_party_database: expectedPartyDatabase,
    expected_world_principal: expectedWorldPrincipal,
    expected_party_principal: expectedPartyPrincipal,
    expected_previous_event_id: expectedPreviousEventId,
    expected_party_ids: expectedPartyIds,
    party_deletion_authorized: true,
    authorization_ref: authorizationRef
  };
  return Object.freeze({
    ...payload,
    request_digest: digest(payload)
  });
}

async function readCutoverInventory({ worldPool, partyPool }) {
  const [worldIdentity, partyIdentity, activeEvent, parties, inflight,
    cutoverTable] =
    await Promise.all([
      identity(worldPool),
      identity(partyPool),
      worldPool.query(
        `SELECT event_id, event_sequence, catalog_revision_id,
                catalog_digest, compatible_world_revision_id,
                compatible_world_catalog_digest,
                compatible_world_pin_manifest_digest
           FROM world_base.runtime_catalog_activation_events
          WHERE catalog_scope = 'item_container_materialization_v2'
          ORDER BY event_sequence DESC
          LIMIT 1`
      ),
      partyPool.query(
        `SELECT party_id, world_revision_id, world_catalog_digest,
                state_version, status
           FROM party_runtime.parties
          ORDER BY party_id`
      ),
      partyPool.query(
        `SELECT count(*)::int AS count
           FROM party_runtime.commit_idempotency
          WHERE status IN ('reserved','transaction_committed')`
      ),
      worldPool.query(
        `SELECT to_regclass(
           'operator_control.lower_dvina_v3_cutover_events'
         ) AS relation`
      )
    ]);
  const cutoverEvents = cutoverTable.rows[0].relation == null
    ? []
    : (await worldPool.query(
        `SELECT request_digest,phase,event_digest,
                release_id,world_revision_id,world_catalog_digest,
                expected_previous_event_id,expected_party_ids,
                expected_party_set_digest,authorization_digest,
                party_database,party_principal,
                party_cleanup_result_digest
           FROM operator_control.lower_dvina_v3_cutover_events
          ORDER BY created_at,phase`
      )).rows;
  return {
    world: {
      ...worldIdentity,
      active_event: activeEvent.rows[0] ?? null,
      cutover_events: cutoverEvents
    },
    party: {
      ...partyIdentity,
      parties: parties.rows,
      inflight_count: Number(inflight.rows[0].count)
    }
  };
}

async function identity(pool) {
  return (await pool.query(
    'SELECT current_database() AS database, current_user AS principal'
  )).rows[0];
}

async function readExactReadback({ worldPool, partyPool, bundle }) {
  const active = (await worldPool.query(
    `SELECT event_id,event_sequence,catalog_scope,catalog_revision_id,
            catalog_digest,runtime_contract_digest,
            compatible_world_revision_id,
            compatible_world_catalog_digest,
            compatible_world_pin_manifest_digest,request_digest
       FROM world_base.runtime_catalog_activation_events
      WHERE catalog_scope = 'item_container_materialization_v2'
      ORDER BY event_sequence DESC
      LIMIT 1`
  )).rows[0];
  const partyCount = Number((await partyPool.query(
    'SELECT count(*)::int AS count FROM party_runtime.parties'
  )).rows[0].count);
  if (!active
      || active.request_digest
        !== bundle.activation_request.activation_request_digest
      || active.compatible_world_revision_id
        !== LOWER_DVINA_BOUNDARY_V3_RELEASE.worldRevision
      || active.compatible_world_catalog_digest
        !== LOWER_DVINA_BOUNDARY_V3_RELEASE.worldCatalogDigest
      || partyCount !== 0) {
    fail(
      'PRODUCTION_CUTOVER_READBACK_FAILED',
      'Exact v3 active event and empty pre-smoke party state were not observed.'
    );
  }
  return {
    active_event: active,
    party_count_before_smoke: partyCount,
    release_status: 'active',
    production_activation: true,
    runtime_selectable_in_canonical_production: true
  };
}

async function emit(value) {
  const rendered = `${JSON.stringify(value, null, 2)}\n`;
  if (values.output) {
    if (!isAbsolute(values.output)) {
      fail(
        'PRODUCTION_EVIDENCE_PATH_INVALID',
        'Evidence output path must be absolute.'
      );
    }
    await writeFile(resolve(values.output), rendered, 'utf8');
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
  if (!normalized) {
    fail('PRODUCTION_INPUT_REQUIRED', `${label} is required.`);
  }
  return normalized;
}

function fail(code, message, details = {}) {
  throw Object.assign(new Error(message), { code, details });
}
