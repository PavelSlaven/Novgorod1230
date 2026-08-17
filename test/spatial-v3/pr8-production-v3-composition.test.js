import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  SPATIAL_V3_PRODUCTION_RELEASE,
  SPATIAL_V3_PRODUCTION_RELEASE_ID,
  assertSpatialV3ProductionReadiness,
  assertSpatialV3WorldReleaseReadiness,
  createSpatialV3ProductionRelease,
  createSpatialV3ProductionCompositionRoot,
  deriveActivatedReleaseFromReadback
} from '../../apps/game-server/src/composition/production-spatial-v3.js';
import {
  loadConfiguredComposition
} from '../../apps/game-server/src/runtime/load-composition.js';
import {
  runSpatialV3TargetMigrations,
  SPATIAL_V3_TARGET_MIGRATIONS,
  SPATIAL_V3_TARGET_MIGRATION_CHAIN_DIGEST
} from '../../apps/game-server/src/infrastructure/postgres/spatial-v3-target-migrations.js';
import {
  loadSpatialV3RuntimeBindings,
  SPATIAL_V3_PRODUCTION_BINDINGS_MODULE,
  validateSpatialV3RuntimeBindings
} from '../../apps/game-server/src/runtime/load-spatial-v3-bindings.js';
import {
  assertModularStartupConfig,
  readServerConfig
} from '../../apps/game-server/src/config.js';

const TEST_PIN_MANIFEST_DIGEST = 'e'.repeat(64);
const TEST_RELEASE = createSpatialV3ProductionRelease(
  TEST_PIN_MANIFEST_DIGEST
);
const TEST_RUNTIME_CATALOG_PIN = Object.freeze({
  schema: 'rus.runtime_catalog_pin.v2',
  catalog_scope: 'item_container_materialization_v2',
  catalog_revision_id: 'catalog-revision-v3',
  catalog_digest: 'a'.repeat(64),
  activation_event_id: 'activation-v3',
  import_id: 'import-v3',
  import_audit_digest: 'b'.repeat(64),
  record_registry_digest: 'c'.repeat(64),
  runtime_contract_digest:
    SPATIAL_V3_PRODUCTION_RELEASE.runtime_catalog_contract_digest,
  compatible_world_revision_id:
    SPATIAL_V3_PRODUCTION_RELEASE.world_revision_id,
  compatible_world_catalog_digest:
    SPATIAL_V3_PRODUCTION_RELEASE.world_catalog_digest,
  compatible_world_pin_manifest_digest: TEST_PIN_MANIFEST_DIGEST
});

test('production-v6 trace runtime wires canonical packing and semantic NPC models', async () => {
  const [traceRuntimeSource, releaseSource] = await Promise.all([
    readFile(new URL(
      '../../apps/game-server/src/runtime/releases/spatial-v3-production-trace-runtime.js',
      import.meta.url
    ), 'utf8'),
    readFile(new URL(
      '../../apps/game-server/src/runtime/releases/spatial-v3-production-v6-bindings.js',
      import.meta.url
    ), 'utf8')
  ]);
  assert.match(traceRuntimeSource,
    /turnStepPackingCalculator:\s*calculatePackingSlots/u);
  assert.match(traceRuntimeSource, /from '@rus\/items-property'/u);
  assert.match(
    traceRuntimeSource,
    /\.\.\.createNpcRuntimePorts\(\{ roleRunner \}\)/u
  );
  assert.match(
    releaseSource,
    /playerConversationModel:\s*createLowerDvinaTracePlayerConversationModel\(\{ roleRunner \}\)/u
  );
  assert.match(
    releaseSource,
    /npcSemanticModel:\s*createLowerDvinaTraceNpcSemanticModel\(\{ roleRunner \}\)/u
  );
  assert.match(
    releaseSource,
    /npcCombatModel:\s*createLowerDvinaTraceNpcCombatModel\(\{ roleRunner \}\)/u
  );
  assert.match(
    releaseSource,
    /npcAutonomousModel:\s*createLowerDvinaTraceNpcAutonomousModel\(\{ roleRunner \}\)/u
  );
  assert.doesNotMatch(releaseSource, /npcDecisionSelector/u);
});

test('builtin v6 binding constructs the production semantic runtime', async () => {
  const setup = fixture();
  const calls = [];
  const bindings = await loadSpatialV3RuntimeBindings(
    SPATIAL_V3_PRODUCTION_BINDINGS_MODULE,
    {
      config: { traceTurnDecisionSecret: 'test-decision-secret' },
      env: {},
      ports: {
        partyPool: setup.pools.partyPool,
        worldPool: setup.pools.worldPool
      },
      release: TEST_RELEASE
    }
  );
  const facade = await bindings.createPublicRuntimeFacade({
    technicalCore: {
      async executeReleaseOperation(method, ...args) {
        calls.push({ method, args });
        return { ok: true, method };
      }
    },
    committer: { commit: async () => ({ ok: true }) }
  });
  assert.deepEqual(await facade.submitTurn('party', { raw_text: 'ответ' }), {
    ok: true,
    method: 'submitTurn'
  });
  assert.deepEqual(calls.map(({ method }) => method), ['submitTurn']);
});

function fixture() {
  let closed = 0;
  const pool = {
    connect: async () => ({
      query: async (sql, params) => /^\s*(?:SELECT|WITH)\b/u.test(sql)
        ? pool.query(sql, params)
        : ({ rows: [] }),
      release() {}
    }),
    query: async (sql) => {
      if (/spatial_v3_world_revisions/u.test(sql)) {
        return {
          rows: [{
            id: SPATIAL_V3_PRODUCTION_RELEASE.world_revision_id,
            catalog_digest:
              SPATIAL_V3_PRODUCTION_RELEASE.world_catalog_digest,
            status: 'approved'
          }]
        };
      }
      if (/runtime_catalog_activation_events/u.test(sql)) {
        return {
          rows: [{
            event_id: TEST_RUNTIME_CATALOG_PIN.activation_event_id,
            ...TEST_RUNTIME_CATALOG_PIN
          }]
        };
      }
      if (/schema_migrations/u.test(sql)) {
        return {
          rows: [{
            migration_id:
              SPATIAL_V3_PRODUCTION_RELEASE
                .party_runtime_catalog_migration_id,
            migration_digest:
              SPATIAL_V3_PRODUCTION_RELEASE
                .party_runtime_catalog_migration_digest,
            target_schema_fingerprint:
              SPATIAL_V3_PRODUCTION_RELEASE
                .party_runtime_catalog_target_fingerprint
          }]
        };
      }
      if (/SELECT DISTINCT/u.test(sql)) {
        return { rows: [] };
      }
      if (/incompatible_party_count/u.test(sql)) {
        return {
          rows: [{
            party_count: 0,
            incompatible_party_count: 0
          }]
        };
      }
      return {
        rows: [{
          database_name: 'isolated',
          user_name: 'test',
          ok: 1
        }]
      };
    }
  };
  const pools = {
    worldPool: pool,
    partyPool: pool,
    close: async () => { closed += 1; }
  };
  let received;
  let receivedBindingContext;
  const targetRootFactory = (ports) => {
    received = ports;
    return {
      status: 'target_shadow_only',
      health: () => ({ status: 'ok' }),
      startNewGame: async () => ({ ok: true }),
      acknowledgeOpening: async () => ({ ok: true }),
      submitTurn: async () => ({ ok: true }),
      getPartyScreen: async () => ({ ok: true })
    };
  };
  const bindingsFactory = async (bindingContext) => {
    receivedBindingContext = bindingContext;
    const { release } = bindingContext;
    assert.equal(release.release_id, SPATIAL_V3_PRODUCTION_RELEASE_ID);
    return {
      targetCompositionPorts: { port_marker: 'v5-only' },
      commitRecheck: async () => ({ ok: true }),
      createPublicRuntimeFacade: async () => ({
        listScenarios: async () => ({ scenarios: [] }),
        startNewGame: async () => ({ ok: true, owner: 'v5' }),
        acknowledgeOpening: async () => ({ ok: true, owner: 'v5' }),
        submitTurn: async () => ({ ok: true, owner: 'v5' }),
        getPartyScreen: async () => ({ ok: true, owner: 'v5' })
      }),
      releaseBinding: { ...release },
      runtimeCatalogPin: { ...TEST_RUNTIME_CATALOG_PIN }
    };
  };
  return {
    pools,
    targetRootFactory,
    bindingsFactory,
    received: () => received,
    receivedBindingContext: () => receivedBindingContext,
    closed: () => closed
  };
}

test('v5 release requires exact committed activation readback', () => {
  assert.equal(
    SPATIAL_V3_PRODUCTION_RELEASE.release_status,
    'validated_candidate_not_active'
  );
  assert.equal(
    SPATIAL_V3_PRODUCTION_RELEASE.production_activation,
    false
  );
  assert.equal(
    SPATIAL_V3_PRODUCTION_RELEASE.boundary_crossing_capability,
    'ready_for_runtime_acceptance'
  );
  assert.equal(
    SPATIAL_V3_PRODUCTION_RELEASE.npc_conversation_capability,
    'ready_for_runtime_acceptance'
  );
  assert.throws(
    () => deriveActivatedReleaseFromReadback(
      TEST_RELEASE,
      {
        ...TEST_RUNTIME_CATALOG_PIN,
        activation_event_id: null
      }
    ),
    { code: 'SPATIAL_V3_RELEASE_NOT_ACTIVATED' }
  );
  const active = deriveActivatedReleaseFromReadback(
    TEST_RELEASE,
    TEST_RUNTIME_CATALOG_PIN
  );
  assert.equal(active.release_status, 'active');
  assert.equal(active.production_activation, true);
  assert.equal(
    active.runtime_selectable_in_canonical_production,
    true
  );
});

test('production-v11 root is sole owner with production-v10 rollback identity', async () => {
  const setup = fixture();
  const root = await createSpatialV3ProductionCompositionRoot({
    config: {
      runtimeCatalogPinManifestDigest: TEST_PIN_MANIFEST_DIGEST
    },
    pools: setup.pools,
    bindingsFactory: setup.bindingsFactory,
    targetRootFactory: setup.targetRootFactory
  });
  const health = root.health();
  assert.equal(root.status, 'production_sole_owner');
  assert.equal(health.composition, 'spatial_v3_production');
  assert.equal(health.activation, 'sole_owner');
  assert.equal(health.authoritative_reads, 'spatial_v3_only');
  assert.equal(health.authoritative_writes, 'spatial_v3_only');
  assert.equal(health.runtime_fallback, 'forbidden');
  assert.equal(
    health.npc_conversation_capability,
    'ready_for_runtime_acceptance'
  );
  assert.equal(
    health.npc_combat_capability,
    'ready_for_runtime_acceptance'
  );
  assert.equal(
    SPATIAL_V3_PRODUCTION_RELEASE.rollback_source_release_id,
    'spatial-v3-production-v10'
  );
  assert.equal(
    health.rollback_source_release_id,
    SPATIAL_V3_PRODUCTION_RELEASE.rollback_source_release_id
  );
  assert.equal(health.rollback_runtime_selectable, false);
  assert.equal(health.temporal_contract_id, 'temporal-world-v1.1');
  assert.equal(
    health.world_revision_id,
    SPATIAL_V3_PRODUCTION_RELEASE.world_revision_id
  );
  assert.match(health.world_catalog_manifest_sha256, /^[a-f0-9]{64}$/u);
  assert.equal(health.dependency_pin_mode, 'exact_only');
  assert.equal(
    health.runtime_catalog_pin_schema,
    'rus.runtime_catalog_pin.v2'
  );
  assert.equal(
    health.runtime_catalog_scope,
    'item_container_materialization_v2'
  );
  assert.equal(
    health.runtime_catalog_resolution,
    'active_for_new_party_persisted_for_existing_party'
  );
  assert.equal(
    health.runtime_catalog_pin.activation_event_id,
    TEST_RUNTIME_CATALOG_PIN.activation_event_id
  );
  assert.equal(
    SPATIAL_V3_PRODUCTION_RELEASE.target_migration_count,
    SPATIAL_V3_TARGET_MIGRATIONS.length
  );
  assert.equal(
    SPATIAL_V3_PRODUCTION_RELEASE.target_migration_chain_digest,
    SPATIAL_V3_TARGET_MIGRATION_CHAIN_DIGEST
  );
  assert.equal(health.migration_count, SPATIAL_V3_TARGET_MIGRATIONS.length);
  assert.equal(
    health.migration_chain_digest,
    SPATIAL_V3_TARGET_MIGRATION_CHAIN_DIGEST
  );
  assert.deepEqual(health.migration_readiness, {
    party_count: 0,
    incompatible_party_count: 0,
    historical_pin_count: 0,
    status: 'ready'
  });
  assert.equal(health.release_id, SPATIAL_V3_PRODUCTION_RELEASE_ID);
  assert.equal(SPATIAL_V3_PRODUCTION_RELEASE.composition_id, 'builtin:production-spatial-v3');
  assert.equal(setup.received().port_marker, 'v5-only');
  assert.equal(setup.receivedBindingContext().actionProductionProfile.schema,
    'rus.lower_dvina_trace_a1_loaded_profile.v1');
  assert.equal(setup.receivedBindingContext().actionProductionProfile.profile
    .status, 'approved');
  assert.equal(setup.receivedBindingContext().actionProductionProfile.profile
    .profile_id, 'lower_dvina_trace_a1_personal_tool_profile_v1');
  assert.equal(setup.receivedBindingContext().localFireProfile.profile
    .profile_id, 'lower_dvina_trace_f1_local_exact_fire_profile_v1');
  assert.equal(typeof setup.received().committer.commit, 'function');
  assert.equal((await root.getPartyScreen()).owner, 'v5');
  await root.close();
  assert.equal(setup.closed(), 1);
});

test('production cutover fails closed while any persisted party remains v2', async () => {
  await assert.rejects(
    assertSpatialV3ProductionReadiness({
      query: async (sql) => /schema_migrations/u.test(sql)
        ? {
            rows: [{
              migration_id:
                SPATIAL_V3_PRODUCTION_RELEASE
                  .party_runtime_catalog_migration_id,
              migration_digest:
                SPATIAL_V3_PRODUCTION_RELEASE
                  .party_runtime_catalog_migration_digest,
              target_schema_fingerprint:
                SPATIAL_V3_PRODUCTION_RELEASE
                  .party_runtime_catalog_target_fingerprint
            }]
          }
        : {
            rows: [{ party_count: 2, incompatible_party_count: 1 }]
          }
    }, TEST_RUNTIME_CATALOG_PIN),
    (error) => error.code === 'SPATIAL_V3_PARTY_MIGRATION_REQUIRED'
  );
});

test('configured composition loader selects only the activated v6 release', async () => {
  const setup = fixture();
  const root = await loadConfiguredComposition(
    'builtin:production-spatial-v3',
    {
      config: {
        runtimeCatalogPinManifestDigest: TEST_PIN_MANIFEST_DIGEST
      },
      pools: setup.pools,
      bindingsFactory: setup.bindingsFactory,
      targetRootFactory: setup.targetRootFactory
    }
  );
  assert.equal(root.health().composition, 'spatial_v3_production');
  await root.close();
  await assert.rejects(
    loadConfiguredComposition('builtin:production'),
    (error) => error.code === 'COMPOSITION_MODULE_INACTIVE'
  );
  await assert.rejects(
    loadConfiguredComposition(
      './apps/game-server/src/composition/production-spatial-v3.js'
    ),
    (error) => error.code === 'COMPOSITION_MODULE_INACTIVE'
  );
});

test('production composition rejects every binding except builtin v6', async () => {
  const setup = fixture();
  await assert.rejects(
    createSpatialV3ProductionCompositionRoot({
      config: {
        spatialV3BindingsModule: 'builtin:spatial-v3-production-v3',
        runtimeCatalogPinManifestDigest: TEST_PIN_MANIFEST_DIGEST
      },
      pools: setup.pools,
      targetRootFactory: setup.targetRootFactory
    }),
    (error) => error.code === 'RUNTIME_BINDINGS_MODULE_INACTIVE'
  );
  assert.equal(setup.closed(), 1);
});

test('production-v6 binding validation fails closed without every sole-owner port', () => {
  assert.throws(
    () => validateSpatialV3RuntimeBindings({
      targetCompositionPorts: {},
      commitRecheck: async () => ({ ok: true }),
      releaseBinding: { ...TEST_RELEASE },
      runtimeCatalogPin: { ...TEST_RUNTIME_CATALOG_PIN }
    }, TEST_RELEASE),
    /createPublicRuntimeFacade/
  );
});

test('production-v6 bindings reject release and runtime-catalog pin drift', () => {
  const valid = {
    targetCompositionPorts: {},
    commitRecheck: async () => ({ ok: true }),
    createPublicRuntimeFacade: async () => ({}),
    releaseBinding: { ...TEST_RELEASE },
    runtimeCatalogPin: { ...TEST_RUNTIME_CATALOG_PIN }
  };
  assert.throws(
    () => validateSpatialV3RuntimeBindings({
      ...valid,
      releaseBinding: {
        ...valid.releaseBinding,
        temporal_contract_id: 'temporal-world-v1'
      }
    }, TEST_RELEASE),
    (error) => error.code === 'RUNTIME_BINDINGS_RELEASE_MISMATCH'
  );
  assert.throws(
    () => validateSpatialV3RuntimeBindings({
      ...valid,
      runtimeCatalogPin: {
        ...valid.runtimeCatalogPin,
        compatible_world_catalog_digest: 'f'.repeat(64)
      }
    }, TEST_RELEASE),
    (error) => error.code === 'RUNTIME_BINDINGS_CATALOG_PIN_MISMATCH'
  );
  const incompleteRelease = { ...valid.releaseBinding };
  for (const field of [
    'party_runtime_catalog_migration_id',
    'party_runtime_catalog_migration_digest',
    'party_runtime_catalog_target_fingerprint',
    'target_migration_count',
    'target_migration_chain_digest'
  ]) delete incompleteRelease[field];
  assert.throws(
    () => validateSpatialV3RuntimeBindings({
      ...valid,
      releaseBinding: incompleteRelease
    }, TEST_RELEASE),
    (error) => error.code === 'RUNTIME_BINDINGS_RELEASE_MISMATCH'
  );
});

test('production-v6 world readiness rejects active catalog pin drift', async () => {
  await assert.rejects(
    assertSpatialV3WorldReleaseReadiness({
      query: async (sql) => /spatial_v3_world_revisions/u.test(sql)
        ? {
            rows: [{
              id: SPATIAL_V3_PRODUCTION_RELEASE.world_revision_id,
              catalog_digest:
                SPATIAL_V3_PRODUCTION_RELEASE.world_catalog_digest
            }]
          }
        : {
            rows: [{
              event_id: TEST_RUNTIME_CATALOG_PIN.activation_event_id,
              ...TEST_RUNTIME_CATALOG_PIN,
              catalog_digest: 'f'.repeat(64)
            }]
          }
    }, TEST_RUNTIME_CATALOG_PIN),
    (error) => error.code === 'SPATIAL_V3_WORLD_RELEASE_PIN_MISMATCH'
  );
});

test('persisted historical catalog pins survive a later active activation', async () => {
  const historicalPin = Object.freeze({
    ...TEST_RUNTIME_CATALOG_PIN,
    catalog_revision_id: 'catalog-revision-v2',
    catalog_digest: '1'.repeat(64),
    activation_event_id: 'activation-v2',
    import_id: 'import-v2',
    import_audit_digest: '2'.repeat(64),
    record_registry_digest: '3'.repeat(64),
    runtime_contract_digest: '4'.repeat(64)
  });
  const partyReadiness = await assertSpatialV3ProductionReadiness({
    query: async (sql) => {
      if (/schema_migrations/u.test(sql)) {
        return {
          rows: [{
            migration_id:
              TEST_RELEASE.party_runtime_catalog_migration_id,
            migration_digest:
              TEST_RELEASE.party_runtime_catalog_migration_digest,
            target_schema_fingerprint:
              TEST_RELEASE.party_runtime_catalog_target_fingerprint
          }]
        };
      }
      if (/SELECT DISTINCT/u.test(sql)) {
        return { rows: [{ ...historicalPin }] };
      }
      return {
        rows: [{ party_count: 1, incompatible_party_count: 0 }]
      };
    }
  }, TEST_RUNTIME_CATALOG_PIN);
  assert.equal(partyReadiness.historical_pin_count, 1);

  const activationQueries = [];
  const worldReadiness = await assertSpatialV3WorldReleaseReadiness({
    query: async (sql, params) => {
      if (/spatial_v3_world_revisions/u.test(sql)) {
        return {
          rows: [{
            id: TEST_RELEASE.world_revision_id,
            catalog_digest: TEST_RELEASE.world_catalog_digest
          }]
        };
      }
      activationQueries.push({ sql, params });
      return {
        rows: [{
          event_id: params.length === 2
            ? historicalPin.activation_event_id
            : TEST_RUNTIME_CATALOG_PIN.activation_event_id,
          ...(params.length === 2
            ? historicalPin
            : TEST_RUNTIME_CATALOG_PIN)
        }]
      };
    }
  }, TEST_RUNTIME_CATALOG_PIN, partyReadiness.historical_pins);
  assert.equal(worldReadiness.historical_activation_count, 1);
  assert.match(activationQueries[0].sql, /LIMIT 1/u);
  assert.equal(activationQueries[1].params[1], 'activation-v2');
});

test('target DDL rolls back when the in-transaction release gate fails', async () => {
  const statements = [];
  const committedTables = new Set();
  let transactionalTables = new Set();
  const expected = new Error('release pin mismatch');
  await assert.rejects(
    runSpatialV3TargetMigrations({
      connect: async () => ({
        query: async (sql) => {
          statements.push(sql);
          if (sql === 'BEGIN') {
            transactionalTables = new Set(committedTables);
          } else if (sql.includes(
            'CREATE TABLE IF NOT EXISTS party_runtime.party_conversation_contributions'
          )) {
            transactionalTables.add(
              'party_runtime.party_conversation_contributions'
            );
            if (/\bCOMMIT\s*;/u.test(sql)) {
              committedTables.clear();
              for (const table of transactionalTables) {
                committedTables.add(table);
              }
            }
          } else if (sql === 'ROLLBACK') {
            transactionalTables = new Set(committedTables);
          }
          return { rows: [] };
        },
        release() {}
      })
    }, {
      beforeCommit: async () => {
        throw expected;
      }
    }),
    expected
  );
  assert.equal(statements[0], 'BEGIN');
  assert.equal(statements.at(-1), 'ROLLBACK');
  assert.equal(statements.includes('COMMIT'), false);
  assert.equal(
    committedTables.has('party_runtime.party_conversation_contributions'),
    false
  );
});

test('restart extends the exact immutable catalog ledger with migrations 012 through 027', async () => {
  const statements = [];
  const migration = {
    migration_id:
      SPATIAL_V3_PRODUCTION_RELEASE.party_runtime_catalog_migration_id,
    migration_digest:
      SPATIAL_V3_PRODUCTION_RELEASE.party_runtime_catalog_migration_digest,
    target_schema_fingerprint:
      SPATIAL_V3_PRODUCTION_RELEASE
        .party_runtime_catalog_target_fingerprint
  };
  const result = await runSpatialV3TargetMigrations({
    connect: async () => ({
      query: async (sql) => {
        statements.push(sql);
        if (sql.includes('to_regclass')) {
          return { rows: [{ present: true }] };
        }
        if (sql.includes('FROM party_runtime.schema_migrations')) {
          return { rows: [{ ...migration }] };
        }
        return { rows: [] };
      },
      release() {}
    })
  }, {
    exactAppliedMigration: migration,
    beforeCommit: async () => ({ status: 'ready' })
  });
  assert.equal(result.execution_mode, 'extended_existing');
  assert.equal(result.newly_applied, 16);
  assert.equal(
    statements.some((sql) =>
      sql.includes('CREATE SCHEMA IF NOT EXISTS party_runtime')),
    false
  );
  assert.equal(
    statements.filter((sql) => sql.includes('owner_external_ref')).length,
    1
  );
  for (const marker of [
    'party_obligations',
    'terminal activity execution does not match its append-only attempt',
    'CREATE TABLE IF NOT EXISTS party_runtime.party_conversation_sessions',
    'CREATE TABLE IF NOT EXISTS party_runtime.party_conversation_contributions',
    'CREATE TABLE IF NOT EXISTS party_runtime.party_combat_sessions',
    'CREATE TABLE IF NOT EXISTS party_runtime.party_ordinary_materialization_aggregates',
    'CREATE TABLE IF NOT EXISTS party_runtime.party_ordinary_materialization_commits',
    'CREATE TABLE IF NOT EXISTS party_runtime.party_ordinary_materialization_enablements',
    'approved_initial_amounts jsonb',
    'CREATE TABLE IF NOT EXISTS party_runtime.party_ordinary_materialization_commit_items'
  ]) {
    assert.equal(
      statements.filter((sql) => sql.includes(marker)).length,
      1,
      marker
    );
  }
  assert.equal(statements.filter((sql) =>
    sql.includes('runtime_instance_mechanics_snapshot_valid')).length,3);
  assert.equal(statements.at(-1), 'COMMIT');
});

test('cutover config defaults to builtin v6 and rejects every other binding', () => {
  const configured = readServerConfig({
    RUS_SPATIAL_V3_RUNTIME_CATALOG_PIN_MANIFEST_DIGEST:
      TEST_PIN_MANIFEST_DIGEST
  });
  assert.equal(
    configured.compositionModule,
    'builtin:production-spatial-v3'
  );
  assert.equal(
    configured.spatialV3BindingsModule,
    SPATIAL_V3_PRODUCTION_BINDINGS_MODULE
  );
  assert.equal(assertModularStartupConfig(configured), configured);
  assert.throws(
    () => assertModularStartupConfig(readServerConfig({
      RUS_SPATIAL_V3_BINDINGS_MODULE:
        'builtin:spatial-v3-production-v3',
      RUS_SPATIAL_V3_RUNTIME_CATALOG_PIN_MANIFEST_DIGEST:
        TEST_PIN_MANIFEST_DIGEST
    })),
    (error) => error.code === 'RUNTIME_BINDINGS_MODULE_INACTIVE'
  );
  assert.throws(
    () => assertModularStartupConfig(readServerConfig({
      RUS_SPATIAL_V3_BINDINGS_MODULE:
        SPATIAL_V3_PRODUCTION_BINDINGS_MODULE
    })),
    (error) =>
      error.code === 'RUNTIME_CATALOG_PIN_MANIFEST_DIGEST_REQUIRED'
  );
  assert.throws(
    () => assertModularStartupConfig(readServerConfig({
      RUS_COMPOSITION_MODULE: 'builtin:production',
      RUS_SPATIAL_V3_BINDINGS_MODULE:
        SPATIAL_V3_PRODUCTION_BINDINGS_MODULE,
      RUS_SPATIAL_V3_RUNTIME_CATALOG_PIN_MANIFEST_DIGEST:
        TEST_PIN_MANIFEST_DIGEST
    })),
    (error) => error.code === 'COMPOSITION_MODULE_INACTIVE'
  );
  assert.throws(
    () => assertModularStartupConfig(readServerConfig({
      RUS_CUTOVER_STAGE: '12',
      RUS_SPATIAL_V3_BINDINGS_MODULE:
        SPATIAL_V3_PRODUCTION_BINDINGS_MODULE,
      RUS_SPATIAL_V3_RUNTIME_CATALOG_PIN_MANIFEST_DIGEST:
        TEST_PIN_MANIFEST_DIGEST
    })),
    (error) => error.code === 'CUTOVER_STAGE_INCOMPLETE'
  );
  for (const invalidStage of ['14', '999', 'garbage']) {
    assert.throws(
      () => assertModularStartupConfig(readServerConfig({
        RUS_CUTOVER_STAGE: invalidStage,
        RUS_SPATIAL_V3_BINDINGS_MODULE:
          SPATIAL_V3_PRODUCTION_BINDINGS_MODULE,
        RUS_SPATIAL_V3_RUNTIME_CATALOG_PIN_MANIFEST_DIGEST:
          TEST_PIN_MANIFEST_DIGEST
      })),
      (error) => error.code === 'CUTOVER_STAGE_INCOMPLETE',
      `RUS_CUTOVER_STAGE=${invalidStage} must fail closed`
    );
  }
});
