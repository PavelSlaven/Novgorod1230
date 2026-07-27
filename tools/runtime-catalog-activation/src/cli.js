#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import pg from 'pg';
import { createRuntimeCatalogLoader } from '@rus/runtime-catalog';
import {
  buildActivationRequest,
  buildPartyPreflight,
  digestEnvelope
} from './artifact-contracts.js';
import { compileOverlaySemanticPayload } from './overlay-compiler.js';
import {
  classifyForwardMigrationState,
  readPostgresSchemaFingerprint
} from './forward-migration.js';
import {
  PARTY_RUNTIME_CATALOG_MIGRATION,
  buildWorldRuntimeCatalogMigrationPreflight,
  WORLD_LEGACY_SCHEMA_BRIDGE,
  WORLD_RUNTIME_CATALOG_MIGRATION,
  runPartyRuntimeCatalogMigration,
  runWorldRuntimeCatalogMigration
} from './forward-migrations.js';
import {
  activateApprovedCatalog,
  importApprovedCatalog,
  registerCatalogBaseline
} from './operator-executors.js';

const WRITE_MODES = new Set(['migrate', 'register-baseline', 'import', 'activate']);
const MODES = new Set([
  'preflight', 'migrate', 'register-baseline', 'compile-overlay',
  'import', 'readback', 'activation-request', 'activate'
]);

export async function runRuntimeCatalogOperatorCli(argv = process.argv.slice(2), dependencies = {}) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      confirm: { type: 'boolean', default: false },
      'expected-request-digest': { type: 'string' },
      input: { type: 'string' },
      output: { type: 'string' },
      'world-db-url': { type: 'string' },
      'party-db-url': { type: 'string' }
    }
  });
  const mode = positionals[0];
  if (!MODES.has(mode)) throw cliError('OPERATOR_MODE_INVALID', `Unknown operator mode: ${mode ?? '<missing>'}`);
  const input = values.input ? JSON.parse(await readFile(values.input, 'utf8')) : null;
  if (WRITE_MODES.has(mode) && values.confirm) {
    if (!values['expected-request-digest']) {
      throw cliError('OPERATOR_CONFIRMATION_INCOMPLETE', '--confirm requires --expected-request-digest.');
    }
    assertExpectedRequestDigest(mode, input, values['expected-request-digest']);
  }

  const pools = createPools({ values, dependencies });
  try {
    const result = await executeMode({ mode, values, input, pools });
    const artifact = {
      schema: 'rus.runtime_catalog_operator_result.v2',
      mode,
      write_confirmed: WRITE_MODES.has(mode) && values.confirm,
      result
    };
    const rendered = `${JSON.stringify(artifact, null, 2)}\n`;
    if (values.output) await writeFile(values.output, rendered, 'utf8');
    else dependencies.stdout?.write?.(rendered) ?? process.stdout.write(rendered);
    return artifact;
  } finally {
    await Promise.all(pools.ownedPools.map((pool) => pool.end()));
  }
}

async function executeMode({ mode, values, input, pools }) {
  if (mode === 'preflight') return migrationPreflight(pools);
  if (mode === 'migrate') {
    if (!values.confirm) return { status: 'dry_run', preflight: await migrationPreflight(pools) };
    return {
      world: await runWorldRuntimeCatalogMigration(requiredPool(pools.worldPool, 'world')),
      party: await runPartyRuntimeCatalogMigration(requiredPool(pools.partyPool, 'party'))
    };
  }
  if (mode === 'register-baseline') {
    requireInput(input, [
      'request', 'attestation', 'compatibility_manifest',
      'runtime_configuration_tuple', 'baseline_manifest'
    ]);
    if (!values.confirm) return { status: 'dry_run', request_digest: input.request.registration_request_digest };
    return registerCatalogBaseline({
      pool: requiredPool(pools.worldPool, 'world'),
      request: input.request,
      attestation: input.attestation,
      baselineManifest: input.baseline_manifest,
      compatibilityManifest: input.compatibility_manifest,
      runtimeConfigurationTuple: input.runtime_configuration_tuple,
      registrationId: input.registration_id,
      title: input.title
    });
  }
  if (mode === 'compile-overlay') {
    requireInput(input, [
      'registry', 'parentTuple', 'compatibleWorldTuple', 'targetRevisionId',
      'parentRowsByTable', 'candidateRowsByTable', 'dependencyLinks', 'g4Transitions'
    ]);
    return compileOverlaySemanticPayload(input);
  }
  if (mode === 'import') {
    requireInput(input, ['ledger', 'domain_revision', 'approval_attestation']);
    if (!values.confirm) return { status: 'dry_run', import_audit_digest: input.ledger.root.import_audit_digest };
    return importApprovedCatalog({
      pool: requiredPool(pools.worldPool, 'world'),
      ledger: input.ledger,
      domainRevision: input.domain_revision,
      approvalAttestation: input.approval_attestation
    });
  }
  if (mode === 'readback') {
    requireInput(input, ['pin', 'supported_runtime_contract_digests']);
    const loader = createRuntimeCatalogLoader({
      worldBaseReader: {
        read: (sql, parameters) => requiredPool(pools.worldPool, 'world').query(sql, parameters)
      },
      supportedRuntimeContractDigests: input.supported_runtime_contract_digests
    });
    const catalog = await loader.loadApprovedItemCatalog({ pin: input.pin });
    return {
      status: 'verified',
      import_id: catalog.pin.import_id,
      import_audit_digest: catalog.pin.import_audit_digest
    };
  }
  if (mode === 'activation-request') {
    requireInput(input, ['fields']);
    const counts = await readPartyPreflightCounts(requiredPool(pools.partyPool, 'party'));
    const preflight = buildPartyPreflight({
      ...counts,
      runtimeReleaseId: input.fields.runtime_release_id,
      runtimeContractDigest: input.fields.runtime_contract_digest
    });
    return {
      party_preflight: preflight,
      activation_request: buildActivationRequest({
        fields: input.fields,
        partyPreflight: preflight
      })
    };
  }
  if (mode === 'activate') {
    requireInput(input, ['request', 'attestation']);
    if (!values.confirm) return { status: 'dry_run', activation_request_digest: input.request.activation_request_digest };
    return activateApprovedCatalog({
      worldPool: requiredPool(pools.worldPool, 'world'),
      partyPool: requiredPool(pools.partyPool, 'party'),
      request: input.request,
      attestation: input.attestation
    });
  }
  throw cliError('OPERATOR_MODE_INVALID', mode);
}

async function migrationPreflight({ worldPool, partyPool }) {
  const world = requiredPool(worldPool, 'world');
  const worldFingerprint = await readPostgresSchemaFingerprint(world, 'world_base');
  const worldLedger = await readMigrationLedger(world, WORLD_RUNTIME_CATALOG_MIGRATION);
  const worldPreflight = buildWorldRuntimeCatalogMigrationPreflight({
    actualSchemaFingerprint: worldFingerprint,
    ledgerRow: worldLedger
  });

  const party = requiredPool(partyPool, 'party');
  const partyFingerprint = await readPostgresSchemaFingerprint(party, 'party_runtime');
  const partyLedger = await readMigrationLedger(party, PARTY_RUNTIME_CATALOG_MIGRATION);
  let partyState;
  try {
    partyState = classifyForwardMigrationState({
      migration: PARTY_RUNTIME_CATALOG_MIGRATION,
      actualSchemaFingerprint: partyFingerprint,
      ledgerRow: partyLedger
    }).status;
  } catch (error) {
    partyState = error.code;
  }
  const checks = [
    ...worldPreflight.checks,
    {
      migration_id: PARTY_RUNTIME_CATALOG_MIGRATION.migration_id,
      migration_digest: PARTY_RUNTIME_CATALOG_MIGRATION.migration_digest,
      actual_schema_fingerprint: partyFingerprint,
      target_schema_fingerprint: PARTY_RUNTIME_CATALOG_MIGRATION.target_schema_fingerprint,
      state: partyState
    }
  ];
  return {
    status: worldPreflight.status === 'ready'
      && ['ready', 'already_applied'].includes(partyState)
      ? 'ready'
      : 'blocked',
    checks
  };
}

async function readMigrationLedger(pool, migration) {
  const table = migration.schema_name === 'world_base'
    ? 'world_base.schema_migrations'
    : 'party_runtime.schema_migrations';
  const exists = await pool.query('SELECT to_regclass($1) IS NOT NULL AS present', [table]);
  if (!exists.rows[0]?.present) return null;
  const result = migration.schema_name === 'world_base'
    ? await pool.query(
      `SELECT migration_id,migration_digest,source_schema_fingerprint,target_schema_fingerprint
       FROM world_base.schema_migrations WHERE migration_id=$1`,
      [migration.migration_id]
    )
    : await pool.query(
      `SELECT migration_id,migration_digest,source_schema_fingerprint,target_schema_fingerprint
       FROM party_runtime.schema_migrations WHERE migration_id=$1`,
      [migration.migration_id]
    );
  return result.rows[0] ?? null;
}

function createPools({ values, dependencies }) {
  const Pool = dependencies.Pool ?? pg.Pool;
  const worldPool = dependencies.worldPool ?? (values['world-db-url']
    ? new Pool({ connectionString: values['world-db-url'] })
    : null);
  const partyPool = dependencies.partyPool ?? (values['party-db-url']
    ? new Pool({ connectionString: values['party-db-url'] })
    : null);
  return {
    worldPool,
    partyPool,
    ownedPools: [
      ...(worldPool && !dependencies.worldPool ? [worldPool] : []),
      ...(partyPool && !dependencies.partyPool ? [partyPool] : [])
    ]
  };
}

function assertExpectedRequestDigest(mode, input, expected) {
  const actual = mode === 'migrate'
    ? digestEnvelope({
      schema: 'rus.runtime_catalog_migration_request.v1',
      migrations: [
        WORLD_LEGACY_SCHEMA_BRIDGE.migration_digest,
        WORLD_RUNTIME_CATALOG_MIGRATION.migration_digest,
        PARTY_RUNTIME_CATALOG_MIGRATION.migration_digest
      ]
    })
    : mode === 'register-baseline'
      ? input?.request?.registration_request_digest
      : mode === 'import'
        ? input?.ledger?.root?.approval_request_digest
        : input?.request?.activation_request_digest;
  if (!actual || actual !== expected) {
    throw cliError('OPERATOR_EXPECTED_REQUEST_DIGEST_MISMATCH', 'Expected request digest does not match exact input.');
  }
}

async function readPartyPreflightCounts(pool) {
  const row = (await pool.query(
    `SELECT
       (SELECT count(*)::int FROM party_runtime.parties) AS party_count,
       (SELECT count(DISTINCT party_id)::int FROM party_runtime.party_catalog_pins
         WHERE catalog_scope = 'item_container_materialization_v2') AS pinned_party_count,
       (SELECT count(*)::int FROM party_runtime.parties p
          LEFT JOIN party_runtime.party_catalog_pins c ON c.party_id = p.party_id
           AND c.catalog_scope = 'item_container_materialization_v2'
         WHERE c.party_id IS NULL) AS missing_domain_pin_count,
       (SELECT count(*)::int FROM party_runtime.commit_idempotency
         WHERE status IN ('reserved','transaction_committed')) AS inflight_stage24_stage25_count`
  )).rows[0];
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [camel(key), Number(value)]));
}

function requireInput(input, fields) {
  if (!input || fields.some((field) => input[field] == null)) {
    throw cliError('OPERATOR_INPUT_INVALID', `Input requires: ${fields.join(', ')}.`);
  }
}

function requiredPool(pool, name) {
  if (!pool) throw cliError('OPERATOR_DEPENDENCY_MISSING', `${name} database URL/pool is required.`);
  return pool;
}

function camel(value) {
  return value.replace(/_([a-z])/gu, (_, letter) => letter.toUpperCase());
}

function cliError(code, message) {
  return Object.assign(new Error(message), { code });
}

const isCli = process.argv[1] && new URL(import.meta.url).pathname
  .replace(/^\/([A-Za-z]:)/u, '$1').replaceAll('/', '\\')
  .toLowerCase() === process.argv[1].toLowerCase();
if (isCli) {
  runRuntimeCatalogOperatorCli().catch((error) => {
    process.stderr.write(`${JSON.stringify({
      schema: 'rus.runtime_catalog_operator_error.v2',
      code: error.code ?? 'OPERATOR_FAILED',
      message: error.message
    })}\n`);
    process.exitCode = 1;
  });
}
