import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import pg from 'pg';
import { computeSpatialV3CanonicalDigest } from '@rus/contracts/spatial-v3/registry';
import {
  applyOrdinaryAggregateTransition,
  canonicalDigest,
  createOrdinaryAggregate,
  validateOrdinaryBackgroundGroup
} from '@rus/materialization';
import {
  ordinaryWorldPropertyPlacementContextDigest,
  resolveOrdinaryWorldPropertyPlacement
} from '@rus/items-property';
import { buildCombinedWritePlan } from '../../packages/turn/src/spatial-v3-write-plan.js';
import {
  createSpatialV3CombinedAtomicCommitter,
  createSpatialV3PostgresCombinedAtomicCommitter
} from '../../apps/game-server/src/infrastructure/postgres/spatial-v3-combined-atomic-committer.js';
import {
  recheckSpatialV3PostgresFirstEntry
} from '../../apps/game-server/src/infrastructure/postgres/spatial-v3-first-entry-recheck.js';
import {
  applyOrdinaryMaterializationProjection,
  ordinaryPhysicalKeys
} from '../../apps/game-server/src/infrastructure/postgres/lower-dvina-trace-ordinary-p16.js';
import {
  createOrdinaryMaterializationAtomicWritePlan
} from '../../apps/game-server/src/infrastructure/postgres/ordinary-materialization-phase-6-commit.js';
import {
  createOrdinaryMaterializationFirstEntryProvisioner
} from '../../apps/game-server/src/infrastructure/postgres/ordinary-materialization-first-entry-provisioning.js';
import { loadLowerDvinaTraceOrdinaryMaterializationProfile } from '../../apps/game-server/src/internal/lower-dvina-trace-ordinary-materialization-profile.js';
import {
  createPostgresOrdinaryMaterializationEnablementRepository
} from '../../apps/game-server/src/infrastructure/postgres/ordinary-materialization-enablement.js';
import {
  createLowerDvinaTraceOrdinaryDiscoveryResolver
} from '../../apps/game-server/src/runtime/lower-dvina-trace-ordinary-discovery.js';
import { createLowerDvinaTraceTurnStepRuntimePorts } from
  '../../apps/game-server/src/runtime/lower-dvina-trace-turn-step-runtime-ports.js';
import { createLowerDvinaTracePlayerSafeWorkingProjectionAuthority } from
  '../../apps/game-server/src/runtime/lower-dvina-trace-player-safe-working.js';

const docker = (args, input) => spawnSync('docker', args, { input, encoding: 'utf8', timeout: 45_000 });
const name = `p16-node-${process.pid}`;
const hex = 'a'.repeat(64);
const later = new Date('2030-01-01T00:00:00.000Z');
const ordinaryScope = Object.freeze({ entity_kind: 'g6', entity_id: 'p16-ordinary-scope' });

function ordinaryPropertyPlacementContext() {
  return {
    scope_ref: { ...ordinaryScope }, item_kind: 'man_made',
    property_catalog_version_ref: 'property-catalog-v1',
    placement_catalog_version_ref: 'placement-catalog-v1',
    personal_communal_refs: [], occupied_site_refs: ['occupied-source'],
    unowned_cause_refs: [], placement_context_refs: ['placement-context'],
    property_catalog: [{ property_basis_ref: 'property', state: 'committed', scope_ref: { ...ordinaryScope }, basis_class: 'occupied_site_default', source_ref: 'occupied-source', unowned_cause_ref: null }],
    placement_catalog: [{ position_ref: 'position', state: 'committed', scope_ref: { ...ordinaryScope }, position_kind: 'scene_position', g6_ref: ordinaryScope.entity_id, containment_depth: 1, placement_context_ref: 'placement-context' }]
  };
}

function ordinaryPropertyPlacementDigest(context = ordinaryPropertyPlacementContext()) {
  return ordinaryWorldPropertyPlacementContextDigest({
    ...context, supporting_basis_ref: 'digest-only', causal_basis_refs: ['digest-only'],
    requested_position_ref: 'digest-only'
  });
}

function ordinarySeedGroup() {
  return validateOrdinaryBackgroundGroup({
    request: { schema: 'ordinary_materialization_request_v1', request_id: 'p16-seed', mode: 'seed_scope', scope_ref: { ...ordinaryScope }, candidate_query: null, context_refs: { function_refs: [], property_context_ref: 'property-a' }, policy_refs: { context_bound_permission_refs: [], allowed_admission_classes: ['common_mundane'], allowed_supporting_bases: [{ basis_ref: 'basis-a', basis_state: 'committed' }] } },
    group: { descriptor: 'ordinary household layer', functional_bucket: 'household', availability_class: 'common', allowed_admission_classes: ['common_mundane'], causal_basis: { basis_kind: 'household_use', basis_refs: ['basis-a'] }, property_basis_ref: 'property-a', permission_refs: [], disclosure_policy_ref: 'disclosure-a' },
    basis_catalog: [{ basis_ref: 'basis-a', state: 'committed', policy: { functional_buckets: ['household'], allowed_admission_classes: ['common_mundane'], permission_refs: [] } }],
    allowed_disclosure_policy_refs: ['disclosure-a']
  });
}

function makeSeededOrdinaryState() {
  const group = ordinarySeedGroup();
  const aggregate = applyOrdinaryAggregateTransition({
    aggregate: createOrdinaryAggregate({ scope_ref: ordinaryScope, resolution_record_cap: 8 }),
    transition: { kind: 'seed', request_identity: 'p16-seed', expected_state_version: 0, density_band: 'ordinary', identity_budget: 3, background_groups: [group] }
  });
  const basis = { basis_ref: group.group_ref, state: 'committed', scope_ref: { ...ordinaryScope }, prepared_seed_provenance: null, functional_buckets: ['household'], allowed_admission_classes: ['common_mundane'] };
  return { aggregate, basis, context: ordinaryPropertyPlacementContext() };
}

function makeOrdinaryPlan({ aggregate, basis, context, partyStateVersion, requestIdentity,
  enablementObjectiveDigest = null, runtimeAnchorId = 'ordinary-anchor' }) {
  const transition = { kind: 'resolve_presence', request_identity: requestIdentity, expected_state_version: aggregate.state_version, resolution_ref: `resolution-${requestIdentity}`, candidate_key: `candidate-${requestIdentity}`, coverage_key: `coverage-${requestIdentity}`, category_key: `category-${requestIdentity}`, context_version: 'ordinary_context_a', resolution: 'materialize', identity_key: `identity-${requestIdentity}` };
  const nextAggregate = applyOrdinaryAggregateTransition({ aggregate, transition });
  const evidence = structuredClone(resolveOrdinaryWorldPropertyPlacement({
    ...context, supporting_basis_ref: basis.basis_ref, causal_basis_refs: [basis.basis_ref], requested_position_ref: 'position'
  }).evidence);
  const mechanicsPolicyRef = `mechanics-${requestIdentity}`;
  const sourceRefs = [`candidate-${requestIdentity}`, `coverage-${requestIdentity}`, basis.basis_ref, 'property', 'position', mechanicsPolicyRef, evidence.property_source_ref, evidence.property_catalog_version_ref, evidence.placement_catalog_version_ref, evidence.placement_context_ref, evidence.property_placement_context_digest].sort();
  const item = {
    item_id: `ordinary_item_${canonicalDigest({ party_id: 'p', scope_ref: ordinaryScope, candidate_key: transition.candidate_key, coverage_key: transition.coverage_key, context_version: transition.context_version }).slice(0, 24)}`,
    candidate_key: transition.candidate_key, coverage_key: transition.coverage_key, context_version: transition.context_version,
    functional_bucket: 'household', admission_class: 'common_mundane', supporting_basis_ref: basis.basis_ref, causal_basis_refs: [basis.basis_ref], property_basis_ref: 'property', position_ref: 'position', runtime_placement: { anchor_id: runtimeAnchorId }, mechanics_policy_ref: mechanicsPolicyRef,
    item_proposal: { schema: 'ordinary_world_item_proposal_v1', request_id: requestIdentity, scope_ref: { ...ordinaryScope }, candidate_key: transition.candidate_key, coverage_key: transition.coverage_key, context_version: transition.context_version, semantic_descriptor: { semantic_type: 'household_tool', name: 'wooden spoon', facts: ['ordinary'] }, supporting_basis_ref: basis.basis_ref, property_basis_ref: 'property', property_placement_evidence: evidence, placement: { scope_ref: ordinaryScope.entity_id, position_ref: 'position' }, runtime_item_mechanics_policy_ref: mechanicsPolicyRef },
    mechanics_snapshot: { schema: 'rus.items.runtime_instance_mechanics_snapshot.v2', version: 2, provenance: { source_kind: 'ordinary_world_materialization', causal_ref: `cause-${requestIdentity}`, request_id: requestIdentity, candidate_key: transition.candidate_key, coverage_key: transition.coverage_key, context_version: transition.context_version, policy_ref: mechanicsPolicyRef, source_refs: sourceRefs }, mechanics: { mass_grams: 80, external_hand_cost: 0, carry_form: 'compact', packing_slot_cost: 1, quantity: { value: 1, unit: 'item' }, container: null } }
  };
  return createOrdinaryMaterializationAtomicWritePlan(JSON.parse(JSON.stringify({
    party_id: 'p', scope_ref: ordinaryScope, request_identity: requestIdentity,
    input_digest: `input-${requestIdentity}`,
    transition_digest: canonicalDigest(transition),
    expected_versions: { party_state_version: partyStateVersion, ordinary_state_version: aggregate.state_version, catalog_version: 1, property_version: 1, placement_version: 1, supporting_basis_catalog_version: 0, supporting_basis_catalog_digest: canonicalDigest({ domain: 'ordinary_supporting_basis_catalog_v1', supporting_bases: [basis] }), property_placement_context_digest: ordinaryPropertyPlacementDigest(context) },
    expected_supporting_basis_catalog: [basis], new_prepared_bases: [], next_supporting_basis_catalog: [basis], next_supporting_basis_catalog_version: 0, next_supporting_basis_catalog_digest: canonicalDigest({ domain: 'ordinary_supporting_basis_catalog_v1', supporting_bases: [basis] }),
    expected_property_placement_context: context,
    ...(enablementObjectiveDigest == null ? {} : {
      enablement_pin: { objective_digest: enablementObjectiveDigest, enabled: true }
    }),
    resolution: 'materialize', transitions: [transition], next_aggregate: nextAggregate, item
  })));
}
function firstEntryPhysicalRecheck(overrides = {}) {
  const value = {
    kind: 'physical',
    materialization_scope_key: 'party_runtime.party_scene_baselines:baseline-new',
    baseline_disposition: 'create',
    g4_id: 'g4-existing',
    preparation_snapshot_id: 'preparation-snapshot-1',
    preparation_member_ordinal: 0,
    preparation_snapshot_digest: hex,
    preparation_member_digest: hex,
    route_plan_id: 'route-plan-first-entry',
    route_plan_digest: hex,
    route_plan_execution_id: 'route-execution-first-entry',
    preparation_claim_id: 'preparation-claim-first-entry',
    scene_baseline_id: 'baseline-new',
    g5_site_id: 'g5-new',
    g6_instance_id: 'g6-new',
    position_id: 'position-new',
    ...overrides
  };
  return { ...value, digest: computeSpatialV3CanonicalDigest(value) };
}

async function makePlan({
  planId, idempotencyId, idempotencyKey, changeSetId,
  canonicalInputDigest = `sha256:${hex}`,
  operationKind = 'move',
  expectedStateVersions = [],
  inserts = [],
  updates = [],
  extraAppends = [],
  physicalKeys = [],
  ownerKeys = [],
  executionKeys = [],
  g4Keys = [],
  commitRechecks = null,
  ordinaryMaterializationAtomicWritePlan = null,
  visibleObjects = []
}) {
  const visiblePayload = {
    schema: 'temporal_visible_package.v1',
    perceived_scene: 'Изменение зафиксировано.',
    perceived_changes: ['Состояние сохранено.'],
    sensory_details: [],
    visible_npcs: [],
    visible_objects: visibleObjects,
    known_context: [],
    uncertainties: [],
    hypotheses: [],
    player_safe_interruption: null,
    allowed_action_affordances: []
  };
  const dependencyPins = [{
    dependency_role: 'source_authoring',
    entity_ref: { entity_kind: 'world_revision', entity_id: 'temporal-v4' },
    version_pin: { pin_kind: 'authoring_version', authoring_version: '4.3.0-target.1', state_version: null }
  }];
  const appends = [{
    target_table: 'party_v3_change_sets', id: changeSetId,
    record: { id: changeSetId, party_id: 'p', operation_kind: operationKind, idempotency_record_id: idempotencyId, expected_state_version_set_digest: 'expected', expected_state_version_set: [], committed_state_version_set_digest: 'committed', write_plan_digest: `${changeSetId}-write`, created_at_turn: 0, committed_at_turn: 0 }
  }, ...extraAppends];
  const built = await buildCombinedWritePlan({
    plan_id: planId, party_id: 'p', write_plan_kind: 'semantic_commit', operation_kind: operationKind, canonical_input_digest: canonicalInputDigest,
    expected_state_versions: expectedStateVersions, validation_report: { status: 'pass', digest: `sha256:${hex}` },
    idempotency: { id: idempotencyId, key: idempotencyKey }, change_set: { id: changeSetId },
    visible_package_envelope: {
      package_id: `visible-${changeSetId}`,
      party_id: 'p',
      turn_id: `turn-${changeSetId}`,
      committed_state_version: '1',
      change_set_id: changeSetId,
      package_digest: computeSpatialV3CanonicalDigest(visiblePayload),
      visible_payload: visiblePayload,
      presentation_status: 'pending',
      projection_policy_ref: {
        entity_ref: { entity_kind: 'visibility_modifier', entity_id: 'projection-v1' },
        authoring_version: '4.3.0-target.1'
      },
      dependency_pins: {
        pins: dependencyPins,
        canonical_digest: computeSpatialV3CanonicalDigest(dependencyPins).replace('sha256:', '')
      },
      idempotency_record_id: idempotencyId
    },
    lock_context: { owner_keys: ownerKeys, execution_keys: executionKeys, g4_keys: g4Keys, physical_keys: [`party_runtime.party_v3_change_sets:${changeSetId}`, ...physicalKeys] },
    commit_rechecks: commitRechecks ?? ['physical', 'state', 'pin', 'endpoint', 'route', 'capacity', 'time', 'change_set'].map((kind) => ({ kind, digest: `sha256:${hex}` })),
    approved_write_sets: [{ inserts, updates, appends }],
    ordinary_materialization_atomic_write_plan: ordinaryMaterializationAtomicWritePlan
  }, { verifyApproval: async () => ({ ok: true }) });
  assert.equal(built.ok, true, JSON.stringify(built));
  return built.plan;
}

function transactionOwner(client, lockKeys, shouldFailSettle = () => false) {
  return async (work) => {
    await client.query('BEGIN');
    try {
      const result = await work({ query: async (sql, params) => {
        if (sql.includes('pg_advisory_xact_lock')) lockKeys.push(...params[0]);
        if (shouldFailSettle() && sql.startsWith('UPDATE party_runtime.party_command_idempotency SET status=')) {
          throw new Error('injected idempotency settlement failure');
        }
        return client.query(sql, params);
      } });
      await client.query('COMMIT');
      return result;
    } catch (cause) {
      await client.query('ROLLBACK');
      throw cause;
    }
  };
}

test('P16 releases a client acquired after gameplay deadline without SQL',
  async () => {
    const plan = await makePlan({
      planId: 'deadline-late', idempotencyId: 'deadline-late-idem',
      idempotencyKey: 'deadline-late-key', changeSetId: 'deadline-late-change'
    });
    let released = 0, queries = 0;
    const client = {
      query() { queries += 1; },
      release() { released += 1; }
    };
    const committer = createSpatialV3PostgresCombinedAtomicCommitter({
      pool: { connect(callback) {
        setTimeout(() => callback(null, client, () => client.release()), 10);
      } },
      recheck: async () => ({ ok: true })
    });
    const turnBudget = {
      assertWithinDeadline() {},
      remaining: () => ({ deadline_ms: 1, llm_budget_ms: 1 })
    };
    await assert.rejects(committer.commit({ plan, turnBudget }), (error) => {
      assert.equal(error.code, 'LLM_TURN_BUDGET_EXHAUSTED');
      assert.equal(error.deadline_exceeded, true);
      return true;
    });
    await new Promise((resolve) => setTimeout(resolve, 15));
    assert.equal(queries, 0);
    assert.equal(released, 1);
  });

test('P16 bounds advisory lock with remaining deadline then rolls back',
  async () => {
    const plan = await makePlan({
      planId: 'deadline-lock', idempotencyId: 'deadline-lock-idem',
      idempotencyKey: 'deadline-lock-key', changeSetId: 'deadline-lock-change'
    });
    const queries = [];
    const client = {
      async query(sql, values) {
        queries.push([sql, values]);
        if (sql.includes('pg_advisory_xact_lock')) {
          throw Object.assign(
            new Error('canceling statement due to lock timeout'),
            { code: '55P03' }
          );
        }
        return { rowCount: 0, rows: [] };
      },
      release() {}
    };
    const committer = createSpatialV3PostgresCombinedAtomicCommitter({
      pool: { connect(callback) { callback(null, client, () => client.release()); } },
      recheck: async () => ({ ok: true })
    });
    await assert.rejects(committer.commit({ plan, turnBudget: {
      assertWithinDeadline() {},
      remaining: () => ({ deadline_ms: 321.8, llm_budget_ms: 321.8 })
    } }), (error) => {
      assert.equal(error.code, 'LLM_TURN_BUDGET_EXHAUSTED');
      assert.equal(error.deadline_exceeded, true);
      return true;
    });
    assert.deepEqual(queries.slice(0, 3), [
      ['SET statement_timeout = 321', undefined], ['BEGIN', undefined],
      ["SELECT set_config('statement_timeout', $1, true), set_config('lock_timeout', $1, true)",
        ['321']]
    ]);
    assert.match(queries[3][0], /pg_advisory_xact_lock/u);
    assert.equal(queries.at(-2)[0], 'ROLLBACK');
    assert.equal(queries.at(-1)[0], 'RESET statement_timeout');
  });

test('P16 Node committer executes sealed plans against isolated PostgreSQL', async (t) => {
  if (docker(['version']).status !== 0) return t.skip('Docker required');
  let client;
  let pool;
  const ordinaryProfile = await loadLowerDvinaTraceOrdinaryMaterializationProfile();
  t.after(async () => {
    if (pool) await pool.end();
    if (client) await client.end();
    docker(['rm', '-f', name]);
  });
  assert.equal(docker(['run', '-d', '-p', '127.0.0.1::5432', '--name', name, '-e', 'POSTGRES_PASSWORD=p16', '-e', 'POSTGRES_USER=p16', '-e', 'POSTGRES_DB=p16', 'postgres:16-alpine']).status, 0);
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await new Promise((done) => setTimeout(done, 300));
    if (docker(['exec', name, 'pg_isready', '-U', 'p16', '-d', 'p16']).status === 0) { ready = true; break; }
  }
  assert.equal(ready, true, 'isolated PostgreSQL must become ready');
  await new Promise((done) => setTimeout(done, 500));
  const port = Number(docker(['port', name, '5432']).stdout.match(/:(\d+)/)?.[1]);
  client = new pg.Client({ host: '127.0.0.1', port, user: 'p16', password: 'p16', database: 'p16' });
  await client.connect();
  for (const file of ['001_party_runtime.sql', '002_party_runtime_v3.sql', '003_party_runtime_v3_planning.sql', '004_party_runtime_v3_journeys.sql', '005_party_runtime_v3_domain.sql', '006_party_runtime_v3_migration.sql', '007_party_runtime_temporal_world.sql', '008_party_runtime_pr8_first_entry.sql', '009_party_runtime_pr8_reaction_knowledge.sql', '010_party_runtime_pr8_reaction_options.sql', '011_party_runtime_first_playable.sql', '012_party_runtime_external_ownership.sql', '013_party_runtime_obligations.sql', '014_party_runtime_activity_resume_terminal.sql', '015_party_runtime_turn_step_items.sql', '016_party_runtime_npc_semantic_conversation.sql', '017_party_runtime_conversation_transcript.sql', '018_party_runtime_phase7_container_state.sql', '019_party_runtime_combat_sessions.sql', '020_party_runtime_actor_equipment.sql', '021_party_runtime_ordinary_materialization.sql', '022_party_runtime_ordinary_materialization_commit.sql', '023_party_runtime_ordinary_materialization_enablement.sql', '024_party_runtime_ordinary_world_items.sql', '025_party_runtime_finite_resource_transitions.sql', '026_party_runtime_existing_container_ordinary_contents.sql']) await client.query(await readFile(`schemas/party-db/${file}`, 'utf8'));
  await client.query("INSERT INTO party_runtime.parties(party_id,schema_version,world_revision_id,world_catalog_digest,materializer_version,rng_version,command_catalog_digest,profile_bundle_digest) VALUES ('p',3,'w','d','m','r','c','b'); INSERT INTO party_runtime.party_clocks(party_id,whole_minutes,subminute_numerator,subminute_denominator,clock_owner_kind,state_version,updated_change_set_id) VALUES ('p',0,0,1,'party',1,'old');");
  await client.query(`INSERT INTO party_runtime.party_player_characters
    (party_id,character_id,profile) VALUES ('p','actor-1','{}'::jsonb)`);
  await client.query(`
    INSERT INTO party_runtime.party_materialization_runs
      (party_id,run_id,g4_id,run_kind,seed_digest,input_digest,catalog_digest,
       materializer_version,rng_version,result_digest,idempotency_key,status)
    VALUES ('p','ordinary-run','g4-existing','baseline','s','i','c','m','r',
      'z','ordinary-run-key','committed');
    INSERT INTO party_runtime.party_g5_nodes
      (party_id,g5_node_id,run_id,parent_g4_id,template_id,slot_key)
    VALUES ('p','ordinary-node','ordinary-run','g4-existing',
      'ordinary-node-template','main');
    INSERT INTO party_runtime.party_g5_anchors
      (party_id,anchor_id,g5_node_id,template_id,slot_key,item_capacity)
    VALUES ('p','ordinary-anchor','ordinary-node','ordinary-anchor-template',
      'main',16);
    INSERT INTO party_runtime.party_positions
      (party_id,g4_id,g5_node_id,g5_anchor_id)
    VALUES ('p','g4-existing','ordinary-node','ordinary-anchor');
  `);
  await client.query(await readFile(
    'schemas/party-db/024_party_runtime_ordinary_world_items.sql', 'utf8'));
  await assert.rejects(client.query(`INSERT INTO party_runtime.party_items
    (party_id,item_id,run_id,template_id,profile_id,category_id,quantity,
     condition_state,legal_status,state)
    VALUES ('p','forged-o1',NULL,NULL,NULL,NULL,1,'ordinary_runtime_instance',
      'ordinary_world_property_bound',$1::jsonb)`, [JSON.stringify({
    runtime_instance_mechanics_snapshot: {
      schema: 'rus.items.runtime_instance_mechanics_snapshot.v2', version: 2,
      provenance: { source_kind: 'ordinary_direct_action_result' },
      mechanics: {}
    }
  })]), /party_items_mechanics_source_check/u,
  'reapplied migration must keep forged v2 provenance outside party_items');
  const validO1Snapshot = {
    schema: 'rus.items.runtime_instance_mechanics_snapshot.v2', version: 2,
    provenance: { source_kind: 'ordinary_world_materialization',
      causal_ref: 'cause', request_id: 'request', candidate_key: 'candidate',
      coverage_key: 'coverage', context_version: 'context',
      policy_ref: 'policy', source_refs: ['source'] },
    mechanics: { mass_grams: 1, external_hand_cost: 0,
      carry_form: 'compact', packing_slot_cost: 0,
      quantity: { value: 1, unit: 'item' }, container: null }
  };
  for (const [suffix, mutate] of [
    ['schema', (snapshot) => { snapshot.schema = null; }],
    ['source-kind', (snapshot) => { snapshot.provenance.source_kind = null; }],
    ['carry-form', (snapshot) => { snapshot.mechanics.carry_form = null; }],
    ['quantity-unit', (snapshot) => {
      snapshot.mechanics.quantity.unit = null;
    }]
  ]) {
    const snapshot = structuredClone(validO1Snapshot);
    mutate(snapshot);
    await assert.rejects(client.query(`INSERT INTO party_runtime.party_items
      (party_id,item_id,run_id,template_id,profile_id,category_id,quantity,
       condition_state,legal_status,state)
      VALUES ('p',$1,NULL,NULL,NULL,NULL,1,'ordinary_runtime_instance',
        'ordinary_world_property_bound',$2::jsonb)`,
    [`forged-o1-null-${suffix}`, JSON.stringify({
      runtime_instance_mechanics_snapshot: snapshot
    })]), /party_items_mechanics_source_check/u,
    `JSON null ${suffix} must not bypass the O1 v2 DDL validator`);
  }
  await client.query(
    `INSERT INTO party_runtime.preparation_snapshots
       (id,party_id,planning_request_id,planning_request_digest,immutable_members_digest,canonical_digest,created_at_turn,created_change_set_id)
     VALUES ('branch-check','p','branch-request','digest','members','snapshot',0,'seed')`
  );
  await assert.rejects(
    client.query(
      `INSERT INTO party_runtime.preparation_snapshot_members
         (preparation_snapshot_id,ordinal,member_kind,source_authoring_ref,dependency_pins,share_mode,member_digest)
       VALUES ('branch-check',0,'transfer_scene','{}','{}','execution_exclusive','none')`
    ),
    /preparation_snapshot_members_branch_check/u
  );
  await assert.rejects(
    client.query(
      `INSERT INTO party_runtime.preparation_snapshot_members
         (preparation_snapshot_id,ordinal,member_kind,source_authoring_ref,prepared_scene_materialization,dependency_pins,share_mode,member_digest)
       VALUES ('branch-check',1,'transfer_scene','{}','"not-an-object"','{}','execution_exclusive','bad-json')`
    ),
    /preparation_snapshot_members_prepared_object_check/u
  );

  const locks = [];
  let rechecks = 0;
  let failSettle = false;
  const fullRecheck = async (input) => {
    rechecks += 1;
    if (input.check.materialization_scope_key) {
      return recheckSpatialV3PostgresFirstEntry(input);
    }
    return { ok: true };
  };
  const committer = createSpatialV3CombinedAtomicCommitter({
    now: () => later,
    recheck: fullRecheck,
    withTransaction: transactionOwner(client, locks, () => failSettle)
  });

  const first = await makePlan({
    planId: 'p1', idempotencyId: 'idem', idempotencyKey: 'key', changeSetId: 'cs',
    expectedStateVersions: [{ target_table: 'party_clocks', id: 'p', state_version: 1 }],
    updates: [{ target_table: 'party_clocks', id: 'p', record: { party_id: 'p', whole_minutes: 0, subminute_numerator: 0, subminute_denominator: 1, clock_owner_kind: 'party', clock_owner_id: null, updated_change_set_id: 'cs' } }],
    physicalKeys: ['party_runtime.party_clocks:p']
  });
  assert.equal((await committer.commit({ plan: first })).ok, true);
  assert.equal((await client.query("SELECT count(*) FROM party_runtime.party_visible_packages WHERE package_id='visible-cs'")).rows[0].count, '1');
  assert.equal((await client.query("SELECT count(*) FROM party_runtime.party_narration_jobs WHERE package_id='visible-cs' AND status='pending'")).rows[0].count, '1');
  assert.equal((await client.query("SELECT state_version FROM party_runtime.party_clocks WHERE party_id='p' ")).rows[0].state_version, '2');
  assert.deepEqual(locks, [...locks].sort(), 'lock phases are globally sorted');

  const seededOrdinary = makeSeededOrdinaryState();
  const ordinaryBasisDigest = canonicalDigest({
    domain: 'ordinary_supporting_basis_catalog_v1',
    supporting_bases: [seededOrdinary.basis]
  });
  await client.query(
    `INSERT INTO party_runtime.party_ordinary_materialization_aggregates
       (party_id,scope_kind,scope_id,state_version,aggregate_payload)
     VALUES ('p',$1,$2,$3,$4::jsonb)`,
    [ordinaryScope.entity_kind, ordinaryScope.entity_id,
      seededOrdinary.aggregate.state_version, JSON.stringify(seededOrdinary.aggregate)]
  );
  await client.query(
    `INSERT INTO party_runtime.party_ordinary_materialization_contexts
       (party_id,scope_kind,scope_id,catalog_version,property_version,placement_version,
        supporting_basis_catalog_version,supporting_basis_catalog_digest,
        property_placement_context_digest,property_placement_base_snapshot)
     VALUES ('p',$1,$2,1,1,1,0,$3,$4,$5::jsonb)`,
    [ordinaryScope.entity_kind, ordinaryScope.entity_id, ordinaryBasisDigest,
      ordinaryPropertyPlacementDigest(seededOrdinary.context), JSON.stringify(seededOrdinary.context)]
  );
  await client.query(
    `INSERT INTO party_runtime.party_ordinary_materialization_basis_catalog
       (party_id,scope_kind,scope_id,basis_ref,origin_request_identity,basis_snapshot)
     VALUES ('p',$1,$2,$3,NULL,$4::jsonb)`,
    [ordinaryScope.entity_kind, ordinaryScope.entity_id, seededOrdinary.basis.basis_ref,
      JSON.stringify(seededOrdinary.basis)]
  );
  const ordinaryEnablementObjective = { scope_ref: { ...ordinaryScope } };
  const ordinaryEnablementDigest = canonicalDigest(ordinaryEnablementObjective);
  await client.query(
    `INSERT INTO party_runtime.party_ordinary_materialization_enablements
       (party_id,scope_kind,scope_id,objective_snapshot,objective_digest,enabled)
     VALUES ('p',$1,$2,$3::jsonb,$4,true)`,
    [ordinaryScope.entity_kind, ordinaryScope.entity_id,
      JSON.stringify(ordinaryEnablementObjective), ordinaryEnablementDigest]
  );
  const partyBeforeOrdinary = Number((await client.query(
    "SELECT state_version FROM party_runtime.parties WHERE party_id='p'"
  )).rows[0].state_version);
  const ordinaryEnablementStale = makeOrdinaryPlan({
    ...seededOrdinary, partyStateVersion: partyBeforeOrdinary,
    requestIdentity: 'p16-ordinary-enablement-stale',
    enablementObjectiveDigest: ordinaryEnablementDigest
  });
  const staleProjection = applyOrdinaryMaterializationProjection({
    next: { items: [] }, visibleContext: { visible_objects: [] },
    ordinaryPlan: ordinaryEnablementStale
  });
  const staleEnablementCommit = await makePlan({
    planId: 'p16-ordinary-enablement-stale-plan', idempotencyId: 'p16-ordinary-enablement-stale-idem',
    idempotencyKey: 'p16-ordinary-enablement-stale-key', changeSetId: 'p16-ordinary-enablement-stale-cs',
    expectedStateVersions: [{ target_table: 'parties', id: 'p', state_version: partyBeforeOrdinary }],
    updates: [{ target_table: 'parties', id: 'p', record: { party_id: 'p', profile_bundle_digest: 'b' } }],
    physicalKeys: ['party_runtime.parties:p', ...ordinaryPhysicalKeys(ordinaryEnablementStale)],
    ordinaryMaterializationAtomicWritePlan: ordinaryEnablementStale,
    visibleObjects: staleProjection.visible_objects
  });
  await client.query(`UPDATE party_runtime.party_ordinary_materialization_enablements
    SET enabled=false WHERE party_id='p' AND scope_kind=$1 AND scope_id=$2`,
  [ordinaryScope.entity_kind, ordinaryScope.entity_id]);
  const staleEnablementResult = await committer.commit({ plan: staleEnablementCommit });
  assert.equal(staleEnablementResult.ok, false);
  assert.equal(staleEnablementResult.error.code, 'state_version_conflict');
  assert.match(staleEnablementResult.error.diagnostics.reason,
    /ORDINARY_PHASE6_ENABLEMENT_STALE/u);
  assert.equal((await client.query(
    "SELECT count(*) FROM party_runtime.party_ordinary_materialization_commits WHERE party_id='p' AND request_identity='p16-ordinary-enablement-stale'"
  )).rows[0].count, '0');
  assert.equal((await client.query(
    'SELECT count(*) FROM party_runtime.party_ordinary_materialization_items WHERE party_id=$1 AND item_id=$2',
    ['p', ordinaryEnablementStale.item.item_id]
  )).rows[0].count, '0');
  assert.equal((await client.query(
    'SELECT count(*) FROM party_runtime.party_items WHERE party_id=$1 AND item_id=$2',
    ['p', ordinaryEnablementStale.item.item_id]
  )).rows[0].count, '0');
  assert.equal((await client.query(
    "SELECT count(*) FROM party_runtime.party_visible_packages WHERE package_id='visible-p16-ordinary-enablement-stale-cs'"
  )).rows[0].count, '0');
  assert.equal(Number((await client.query(
    "SELECT state_version FROM party_runtime.parties WHERE party_id='p'"
  )).rows[0].state_version), partyBeforeOrdinary);
  await client.query(`UPDATE party_runtime.party_ordinary_materialization_enablements
    SET enabled=true WHERE party_id='p' AND scope_kind=$1 AND scope_id=$2`,
  [ordinaryScope.entity_kind, ordinaryScope.entity_id]);

  const ordinaryPositive = makeOrdinaryPlan({
    ...seededOrdinary, partyStateVersion: partyBeforeOrdinary,
    requestIdentity: 'p16-ordinary-positive',
    enablementObjectiveDigest: ordinaryEnablementDigest
  });
  const ordinaryProjection = applyOrdinaryMaterializationProjection({
    next: { items: [] },
    visibleContext: { visible_objects: [] },
    ordinaryPlan: ordinaryPositive
  });
  const ordinaryCommit = await makePlan({
    planId: 'p16-ordinary-positive-plan', idempotencyId: 'p16-ordinary-positive-idem',
    idempotencyKey: 'p16-ordinary-positive-key', changeSetId: 'p16-ordinary-positive-cs',
    expectedStateVersions: [{ target_table: 'parties', id: 'p', state_version: partyBeforeOrdinary }],
    updates: [{ target_table: 'parties', id: 'p', record: { party_id: 'p', profile_bundle_digest: 'b' } }],
    physicalKeys: ['party_runtime.parties:p', ...ordinaryPhysicalKeys(ordinaryPositive)],
    ordinaryMaterializationAtomicWritePlan: ordinaryPositive,
    visibleObjects: ordinaryProjection.visible_objects
  });
  assert.equal((await committer.commit({ plan: ordinaryCommit })).ok, true);
  assert.deepEqual((await client.query(
    `SELECT item_id,from_party_state_version,to_party_state_version,from_ordinary_state_version,to_ordinary_state_version
       FROM party_runtime.party_ordinary_materialization_commits
      WHERE party_id='p' AND request_identity='p16-ordinary-positive'`
  )).rows[0], {
    item_id: ordinaryPositive.item.item_id,
    from_party_state_version: String(partyBeforeOrdinary),
    to_party_state_version: String(partyBeforeOrdinary + 1),
    from_ordinary_state_version: '1', to_ordinary_state_version: '2'
  });
  assert.deepEqual((await client.query(
    `SELECT item_id,request_identity,supporting_basis_ref FROM party_runtime.party_ordinary_materialization_items
      WHERE party_id='p' AND item_id=$1`, [ordinaryPositive.item.item_id]
  )).rows[0], {
    item_id: ordinaryPositive.item.item_id,
    request_identity: 'p16-ordinary-positive',
    supporting_basis_ref: seededOrdinary.basis.basis_ref
  });
  assert.equal((await client.query(
    `SELECT count(*) FROM party_runtime.party_ordinary_materialization_item_basis_refs
      WHERE party_id='p' AND item_id=$1 AND basis_ref=$2`,
    [ordinaryPositive.item.item_id, seededOrdinary.basis.basis_ref]
  )).rows[0].count, '1');
  assert.deepEqual((await client.query(
    "SELECT visible_payload->'visible_objects' AS objects FROM party_runtime.party_visible_packages WHERE package_id='visible-p16-ordinary-positive-cs'"
  )).rows[0].objects, ordinaryProjection.visible_objects);
  assert.equal(Number((await client.query(
    "SELECT state_version FROM party_runtime.parties WHERE party_id='p'"
  )).rows[0].state_version), partyBeforeOrdinary + 1, 'ordinary P16 commit bumps the party exactly once');

  const ordinaryRollback = makeOrdinaryPlan({
    aggregate: ordinaryPositive.next_aggregate, basis: seededOrdinary.basis,
    context: seededOrdinary.context, partyStateVersion: partyBeforeOrdinary + 1,
    requestIdentity: 'p16-ordinary-rollback',
    enablementObjectiveDigest: ordinaryEnablementDigest
  });
  const rollbackProjection = applyOrdinaryMaterializationProjection({
    next: { items: [] }, visibleContext: { visible_objects: [] }, ordinaryPlan: ordinaryRollback
  });
  const ordinaryRollbackCommit = await makePlan({
    planId: 'p16-ordinary-rollback-plan', idempotencyId: 'p16-ordinary-rollback-idem',
    idempotencyKey: 'p16-ordinary-rollback-key', changeSetId: 'p16-ordinary-rollback-cs',
    expectedStateVersions: [{ target_table: 'parties', id: 'p', state_version: partyBeforeOrdinary + 1 }],
    updates: [{ target_table: 'parties', id: 'p', record: { party_id: 'p', profile_bundle_digest: 'b' } }],
    physicalKeys: ['party_runtime.parties:p', ...ordinaryPhysicalKeys(ordinaryRollback)],
    ordinaryMaterializationAtomicWritePlan: ordinaryRollback,
    visibleObjects: rollbackProjection.visible_objects
  });
  failSettle = true;
  assert.equal((await committer.commit({ plan: ordinaryRollbackCommit })).ok, false);
  failSettle = false;
  assert.equal((await client.query(
    "SELECT count(*) FROM party_runtime.party_ordinary_materialization_commits WHERE party_id='p' AND request_identity='p16-ordinary-rollback'"
  )).rows[0].count, '0');
  assert.equal((await client.query(
    'SELECT count(*) FROM party_runtime.party_ordinary_materialization_items WHERE party_id=$1 AND item_id=$2',
    ['p', ordinaryRollback.item.item_id]
  )).rows[0].count, '0');
  assert.equal((await client.query(
    'SELECT count(*) FROM party_runtime.party_items WHERE party_id=$1 AND item_id=$2',
    ['p', ordinaryRollback.item.item_id]
  )).rows[0].count, '0');
  assert.equal((await client.query(
    'SELECT count(*) FROM party_runtime.party_item_placements WHERE party_id=$1 AND item_id=$2',
    ['p', ordinaryRollback.item.item_id]
  )).rows[0].count, '0');
  assert.equal((await client.query(
    "SELECT count(*) FROM party_runtime.party_visible_packages WHERE package_id='visible-p16-ordinary-rollback-cs'"
  )).rows[0].count, '0');
  assert.equal(Number((await client.query(
    "SELECT state_version FROM party_runtime.parties WHERE party_id='p'"
  )).rows[0].state_version), partyBeforeOrdinary + 1, 'late failure rolls back the ordinary party bump');

  rechecks = 0;
  assert.equal((await committer.commit({ plan: first })).replay, true);
  assert.equal(rechecks, 0, 'committed replay resolves before recheck');
  const conflict = { ...first, canonical_input_digest: `sha256:${'b'.repeat(64)}` };
  assert.equal((await committer.commit({ plan: conflict })).error.code, 'generated_schema_mismatch', 'unsealed digest alteration is rejected');
  const digestConflict = await makePlan({ planId: 'conflict-plan', idempotencyId: 'idem', idempotencyKey: 'key', changeSetId: 'conflict-cs', canonicalInputDigest: `sha256:${'b'.repeat(64)}` });
  assert.equal((await committer.commit({ plan: digestConflict })).error.code, 'idempotency_conflict', 'same idempotency key cannot change the persisted digest');
  assert.equal((await client.query("SELECT count(*) FROM party_runtime.party_v3_change_sets WHERE id='conflict-cs'")).rows[0].count, '0');
  const replayWriteSetConflict = await makePlan({ planId: 'replay-conflict-plan', idempotencyId: 'idem', idempotencyKey: 'key', changeSetId: 'different-cs' });
  assert.equal((await committer.commit({ plan: replayWriteSetConflict })).error.code, 'idempotency_conflict', 'replay must match the exact persisted change set and write-set digest');
  assert.equal((await client.query("SELECT count(*) FROM party_runtime.party_v3_change_sets WHERE id='different-cs'")).rows[0].count, '0');

  const expired = await makePlan({ planId: 'reclaim-plan', idempotencyId: 'reclaim-idem', idempotencyKey: 'reclaim-key', changeSetId: 'reclaim-cs' });
  await client.query("INSERT INTO party_runtime.party_command_idempotency(id,party_id,operation_kind,idempotency_key,canonical_input_digest,expected_state_version_set_digest,status,lease_token,lease_expires_at,created_at_turn) VALUES ('reclaim-idem','p','move','reclaim-key',$1,$2,'leased','old lease','2000-01-01T00:00:00Z',0)", [hex, expired.expected_state_versions_digest.replace('sha256:', '')]);
  const reclaimed = await committer.commit({ plan: expired });
  assert.equal(reclaimed.ok, true, JSON.stringify(reclaimed));
  assert.deepEqual((await client.query("SELECT status,state_version,lease_token,result_change_set_id FROM party_runtime.party_command_idempotency WHERE id='reclaim-idem'")).rows[0], { status: 'committed', state_version: '3', lease_token: null, result_change_set_id: 'reclaim-cs' }, 'reclaim uses versioned CAS then terminal settlement');

  const terminal = await makePlan({ planId: 'terminal-plan', idempotencyId: 'terminal-idem', idempotencyKey: 'terminal-key', changeSetId: 'terminal-cs' });
  await client.query("INSERT INTO party_runtime.party_command_idempotency(id,party_id,operation_kind,idempotency_key,canonical_input_digest,expected_state_version_set_digest,status,terminal_failure_code,terminal_failure_digest,created_at_turn,finalized_at_turn) VALUES ('terminal-idem','p','move','terminal-key',$1,$2,'failed_terminal','state_version_conflict','terminal-digest',0,1)", [hex, terminal.expected_state_versions_digest.replace('sha256:', '')]);
  rechecks = 0;
  const failedReplay = await committer.commit({ plan: terminal });
  assert.equal(failedReplay.terminal, true, JSON.stringify(failedReplay));
  assert.equal(failedReplay.error.code, 'state_version_conflict');
  assert.equal(rechecks, 0, 'terminal failure replay resolves before recheck');
  assert.equal((await client.query("SELECT count(*) FROM party_runtime.party_v3_change_sets WHERE id='terminal-cs'")).rows[0].count, '0');

  await client.query("BEGIN; INSERT INTO party_runtime.party_route_plans(id,party_id,journey_owner_ref,journey_scope,request_kind,planning_request_id,path_query_digest,option_id,knowledge_scope,source_endpoint_snapshot,target_request,resolved_factual_target_ref,target_resolution_dependency_pins,world_revision_id,catalog_digest,planning_algorithm_version,planning_state_version,planning_context_dependency_pins,canonical_serialization_digest,created_change_set_id,lifecycle_change_set_id,created_at_turn) VALUES ('history-plan','p','{\"entity_kind\":\"actor\",\"entity_id\":\"a\"}','world_travel','ordinary','request','digest','option','factual','{\"endpoint_kind\":\"scene_position\",\"endpoint_id\":\"pos\"}','{\"spatial_kind\":\"canonical_g5\",\"spatial_id\":\"g5\"}','{\"spatial_kind\":\"canonical_g5\",\"spatial_id\":\"g5\"}','{}','w','d','algorithm',1,'{}','history-plan-digest','cs','cs',0); INSERT INTO party_runtime.party_route_plan_steps(route_plan_id,ordinal,step_kind,departure_endpoint_snapshot,arrival_endpoint_snapshot,static_contract_snapshot) VALUES ('history-plan',0,'immediate_action','{\"endpoint_kind\":\"scene_position\",\"endpoint_id\":\"pos\"}','{\"endpoint_kind\":\"scene_position\",\"endpoint_id\":\"pos\"}','{\"snapshot_kind\":\"immediate_action\"}'); INSERT INTO party_runtime.party_route_plan_executions(id,party_id,route_plan_id,journey_owner_ref,journey_scope,status,current_step_ordinal,current_endpoint_ref,updated_change_set_id) VALUES ('history-exec','p','history-plan','{\"entity_kind\":\"actor\",\"entity_id\":\"a\"}','world_travel','planned',0,'{\"endpoint_kind\":\"scene_position\",\"endpoint_id\":\"pos\"}','cs'); INSERT INTO party_runtime.party_route_plan_execution_events(execution_id,event_ordinal,event_kind,to_status,step_ordinal,location_snapshot,change_set_id,idempotency_record_id,occurred_at_turn) VALUES ('history-exec',0,'planned','planned',0,'{}','cs','idem',0); COMMIT;");
  const history = await makePlan({
    planId: 'history-plan-commit', idempotencyId: 'history-idem', idempotencyKey: 'history-key', changeSetId: 'history-cs',
    expectedStateVersions: [{ target_table: 'party_route_plan_executions', id: 'history-exec', state_version: 1 }],
    updates: [{ target_table: 'party_route_plan_executions', id: 'history-exec', record: { id: 'history-exec', party_id: 'p', status: 'active', started_at_turn: 0, updated_change_set_id: 'history-cs' } }],
    extraAppends: [{ target_table: 'party_route_plan_execution_events', id: 'history-exec:1', record: { execution_id: 'history-exec', event_ordinal: 1, event_kind: 'activated', from_status: 'planned', to_status: 'active', step_ordinal: 0, location_snapshot: { location: { location_kind: 'scene' } }, change_set_id: 'history-cs', idempotency_record_id: 'history-idem', occurred_at_turn: 0 } }],
    physicalKeys: ['party_runtime.party_route_plan_executions:history-exec', 'party_runtime.party_route_plan_execution_events:history-exec:1']
  });
  assert.equal((await committer.commit({ plan: history })).ok, true);
  assert.deepEqual((await client.query("SELECT execution_id,event_ordinal,event_kind,to_status,change_set_id,idempotency_record_id FROM party_runtime.party_route_plan_execution_events WHERE execution_id='history-exec' AND event_ordinal=1")).rows[0], { execution_id: 'history-exec', event_ordinal: 1, event_kind: 'activated', to_status: 'active', change_set_id: 'history-cs', idempotency_record_id: 'history-idem' }, 'committer persists composite execution history identity');

  const rollback = await makePlan({
    planId: 'rollback-plan', idempotencyId: 'rollback-idem', idempotencyKey: 'rollback-key', changeSetId: 'rollback-cs'
  });
  failSettle = true;
  assert.equal((await committer.commit({ plan: rollback })).ok, false, 'late persistence failure is returned by the real committer');
  failSettle = false;
  assert.equal((await client.query("SELECT count(*) FROM party_runtime.party_v3_change_sets WHERE id='rollback-cs'")).rows[0].count, '0');
  assert.equal((await client.query("SELECT count(*) FROM party_runtime.party_command_idempotency WHERE id='rollback-idem'")).rows[0].count, '0', 'failed write rolls back both change set and leased idempotency row');
  assert.equal((await client.query("SELECT count(*) FROM party_runtime.party_visible_packages WHERE package_id='visible-rollback-cs'")).rows[0].count, '0', 'failed write rolls back the factual presentation package');
  assert.equal((await client.query("SELECT count(*) FROM party_runtime.party_narration_jobs WHERE package_id='visible-rollback-cs'")).rows[0].count, '0', 'failed write rolls back its narration job');

  pool = new pg.Pool({
    host: '127.0.0.1',
    port,
    user: 'p16',
    password: 'p16',
    database: 'p16',
    max: 2
  });
  const concurrentCommitter = createSpatialV3PostgresCombinedAtomicCommitter({
    pool,
    now: () => later,
    recheck: async () => ({ ok: true })
  });
  await client.query(`INSERT INTO party_runtime.party_npcs
    (party_id,npc_id,run_id,profile_set_id,profile_level,anchor_id,
     identity_state,machine_state,semantic_state)
    VALUES ('p','npc:n1','ordinary-run','trace_ld_v1_background_fisher_v1',
      'background','ordinary-anchor',$1::jsonb,$2::jsonb,$3::jsonb)`, [
    JSON.stringify({ appearance_profile_ref: 'appearance:fisher' }),
    JSON.stringify({ schedule_state: 'working' }),
    JSON.stringify({ profile_revision: 2, participant_slot_ref: 'slot:fisher',
      location_profile_ref: 'shore', zone_ref: 'water' })
  ]);
  const n1SemanticState = { profile_revision: 2,
    participant_slot_ref: 'slot:fisher', location_profile_ref: 'shore',
    zone_ref: 'water', n1_remainder: {
      schema: 'npc_ordinary_semantic_remainder_v1', npc_ref: 'npc:n1',
      profile_ref: 'lower_dvina_trace_n1_background_npc_v1@1',
      ordinary_descriptor: 'Коренастый мужчина в мокрой рубахе.',
      ordinary_activity: 'Он перебирает край сети.' } };
  const n1Persistence = await makePlan({
    planId: 'n1-persistence-plan', idempotencyId: 'n1-persistence-idem',
    idempotencyKey: 'n1-persistence-key', changeSetId: 'n1-persistence-cs',
    updates: [{ target_table: 'party_npcs', id: 'npc:n1', record: {
      party_id: 'p', npc_id: 'npc:n1', semantic_state: n1SemanticState,
      updated_change_set_id: 'n1-persistence-cs' } }],
    physicalKeys: ['party_runtime.party_npcs:npc:n1']
  });
  assert.equal((await concurrentCommitter.commit({ plan: n1Persistence })).ok,
    true);
  const n1Reload = (await client.query(`SELECT identity_state,machine_state,
      semantic_state FROM party_runtime.party_npcs
    WHERE party_id='p' AND npc_id='npc:n1'`)).rows[0];
  assert.deepEqual(n1Reload, {
    identity_state: { appearance_profile_ref: 'appearance:fisher' },
    machine_state: { schedule_state: 'working' },
    semantic_state: n1SemanticState
  });
  assert.equal((await concurrentCommitter.commit({ plan: n1Persistence })).replay,
    true, 'committed N1 retry replays without a second write');
  const concurrentA = await makePlan({
    planId: 'concurrent-plan-a',
    idempotencyId: 'concurrent-idem-a',
    idempotencyKey: 'concurrent-key',
    changeSetId: 'concurrent-cs-a'
  });
  const concurrentB = await makePlan({
    planId: 'concurrent-plan-b',
    idempotencyId: 'concurrent-idem-b',
    idempotencyKey: 'concurrent-key',
    changeSetId: 'concurrent-cs-b'
  });
  const concurrentResults = await Promise.all([
    concurrentCommitter.commit({ plan: concurrentA }),
    concurrentCommitter.commit({ plan: concurrentB })
  ]);
  assert.equal(concurrentResults.filter((result) => result.ok).length, 1);
  assert.equal(
    concurrentResults.filter((result) => result.error?.code === 'idempotency_conflict').length,
    1
  );
  assert.equal(
    (await client.query(
      "SELECT count(*) FROM party_runtime.party_command_idempotency WHERE party_id='p' AND operation_kind='move' AND idempotency_key='concurrent-key'"
    )).rows[0].count,
    '1'
  );

  await client.query(`
    INSERT INTO party_runtime.party_g5_sites
      (id,party_id,origin,parent_g4_id,canonical_g5_ref,status,state_version,created_change_set_id,updated_change_set_id)
    VALUES
      ('g5-old','p','canonical','g4-existing','{"entity_kind":"canonical_g5","entity_id":"canonical-old"}','active',0,'seed','seed');
    INSERT INTO party_runtime.party_scene_baselines
      (id,party_id,host_kind,host_id,source_kind,scene_template_ref,materialization_trace_id,materializer_version,catalog_digest,status,state_version,created_change_set_id,updated_change_set_id)
    VALUES
      ('baseline-old','p','g5_site','g5-old','canonical_template','{"entity_ref":{"entity_kind":"scene_template","entity_id":"template-old"},"authoring_version":"v1"}','trace-old','v1','${hex}','active',0,'seed','seed');
    INSERT INTO party_runtime.party_g6_instances
      (id,party_id,scene_baseline_id,source_scene_template_ref,scene_slot_key,host_kind,host_id,physical_class_id,primary_scene_role_id,vertical_context_id,overhead_cover_id,intra_g6_visibility_mode,default_visibility_distance_band,acoustic_uniformity,status,state_version,created_change_set_id,updated_change_set_id)
    VALUES
      ('g6-old','p','baseline-old','{"entity_ref":{"entity_kind":"scene_template","entity_id":"template-old"},"authoring_version":"v1"}','entry','g5_site','g5-old','spatial.g6.open','entry','surface','none','default_clear','near','uniform','active',0,'seed','seed');
    INSERT INTO party_runtime.scene_position_nodes
      (id,party_id,g6_instance_id,position_type_id,template_slot_key,template_instance_ordinal,capacity,access_class_id,status,state_version,created_change_set_id,updated_change_set_id)
    VALUES
      ('position-old','p','g6-old','scene_position.central','arrival',0,10,'open','active',0,'seed','seed');
    INSERT INTO party_runtime.party_journey_locations
      (id,party_id,owner_kind,owner_id,location_kind,scene_position_id,state_version,updated_change_set_id)
    VALUES
      ('location-actor','p','actor','actor-1','scene','position-old',0,'seed');
  `);
  const preparedScene = {
    g4_id: 'g4-existing',
    g5_site_id: 'g5-new',
    g5_origin: 'generated',
    scene_baseline_id: 'baseline-new',
    g6_instance_id: 'g6-new',
    position_id: 'position-new',
    scene_template_ref: { entity_ref: { entity_kind: 'scene_template', entity_id: 'scene-new' }, authoring_version: 'v1' },
    materialization_profile_ref: { entity_ref: { entity_kind: 'scene_materialization_profile', entity_id: 'profile-new' }, authoring_version: 'v1' },
    catalog_digest: hex,
    materializer_version: 'v1',
    dependency_pins: {},
    canonical_digest: hex
  };
  await client.query(
    `INSERT INTO party_runtime.preparation_snapshots
       (id,party_id,planning_request_id,planning_request_digest,immutable_members_digest,canonical_digest,created_at_turn,created_change_set_id)
     VALUES ('preparation-snapshot-1','p','planning-request-1',$1,$1,$1,0,'seed')`,
    [hex]
  );
  await client.query(
    `INSERT INTO party_runtime.preparation_snapshot_members
       (preparation_snapshot_id,ordinal,member_kind,source_authoring_ref,prepared_scene_materialization,dependency_pins,share_mode,member_digest)
     VALUES ('preparation-snapshot-1',0,'transfer_scene','{}',$2,'{}','execution_exclusive',$1)`,
    [hex, JSON.stringify(preparedScene)]
  );
  await client.query('BEGIN');
  await client.query(
    `INSERT INTO party_runtime.party_route_plans
       (id,party_id,journey_owner_ref,journey_scope,request_kind,planning_request_id,path_query_digest,option_id,
        knowledge_scope,source_endpoint_snapshot,target_request,resolved_factual_target_ref,target_resolution_dependency_pins,
        world_revision_id,catalog_digest,planning_algorithm_version,planning_state_version,planning_context_dependency_pins,
        preparation_snapshot_id,preparation_snapshot_digest,canonical_serialization_digest,status,lifecycle_state_version,
        created_change_set_id,lifecycle_change_set_id,created_at_turn)
     VALUES
       ('route-plan-first-entry','p','{}','world_travel','ordinary','planning-request-1',$1,'option-1',
        'factual','{}','{}','{}','{}','w',$1,'v1',0,'{}',
        'preparation-snapshot-1',$1,$1,'ready',1,'seed','seed',0)`,
    [hex]
  );
  await client.query(
    `INSERT INTO party_runtime.party_route_plan_steps
       (route_plan_id,ordinal,step_kind,departure_endpoint_snapshot,arrival_endpoint_snapshot,static_contract_snapshot)
     VALUES ('route-plan-first-entry',0,'timed_traversal','{}','{}','{"snapshot_kind":"timed_traversal"}')`
  );
  await client.query(
    `INSERT INTO party_runtime.party_route_plan_executions
       (id,party_id,route_plan_id,journey_owner_ref,journey_scope,status,current_step_ordinal,current_endpoint_ref,state_version,updated_change_set_id)
     VALUES ('route-execution-first-entry','p','route-plan-first-entry','{}','world_travel','planned',0,'{}',1,'seed')`
  );
  await client.query(
    `INSERT INTO party_runtime.preparation_claims
       (id,preparation_snapshot_id,preparation_member_ordinal,route_plan_execution_id,claim_status,state_version,reserved_change_set_id)
     VALUES ('preparation-claim-first-entry','preparation-snapshot-1',0,'route-execution-first-entry','reserved',1,'seed')`
  );
  await client.query(
    `INSERT INTO party_runtime.party_route_plan_execution_events
       (execution_id,event_ordinal,event_kind,to_status,step_ordinal,location_snapshot,causal_result_ref,change_set_id,idempotency_record_id,occurred_at_turn)
     VALUES ('route-execution-first-entry',0,'planned','planned',0,'{}',NULL,'seed','seed-idempotency',0)`
  );
  await client.query('COMMIT');
  const generatedSceneInserts = [
    {
      target_table: 'party_g5_sites',
      id: 'g5-new',
      record: {
        id: 'g5-new', party_id: 'p', origin: 'generated',
        parent_g4_id: 'g4-existing', canonical_g5_ref: null,
        generated_template_ref: { entity_ref: { entity_kind: 'g5_template', entity_id: 'generated-site' }, authoring_version: 'v1' },
        expansion_slot_ref: { entity_ref: { entity_kind: 'expansion_slot', entity_id: 'slot-1' }, authoring_version: 'v1' },
        source_frontier_id: 'frontier-1', generation_ordinal: 0,
        direction_context_id: null, continuation_chain_id: null,
        continuation_ordinal: null, status: 'active', state_version: 0,
        created_change_set_id: 'first-entry-cs', updated_change_set_id: 'first-entry-cs',
        terminal_change_set_id: null, superseded_by_site_id: null
      }
    },
    {
      target_table: 'party_scene_baselines',
      id: 'baseline-new',
      record: {
        id: 'baseline-new', party_id: 'p', host_kind: 'g5_site',
        host_id: 'g5-new', source_kind: 'generated_template',
        scene_template_ref: { entity_ref: { entity_kind: 'scene_template', entity_id: 'scene-new' }, authoring_version: 'v1' },
        materialization_trace_id: 'trace-new', materializer_version: 'v1',
        catalog_digest: hex, status: 'active', state_version: 0,
        created_change_set_id: 'first-entry-cs', updated_change_set_id: 'first-entry-cs',
        terminal_change_set_id: null
      }
    },
    {
      target_table: 'party_g6_instances',
      id: 'g6-new',
      record: {
        id: 'g6-new', party_id: 'p', scene_baseline_id: 'baseline-new',
        source_scene_template_ref: { entity_ref: { entity_kind: 'scene_template', entity_id: 'scene-new' }, authoring_version: 'v1' },
        scene_slot_key: 'entry', enclosing_stable_structure_id: null,
        host_kind: 'g5_site', host_id: 'g5-new',
        physical_class_id: 'spatial.g6.open', primary_scene_role_id: 'entry',
        vertical_context_id: 'surface', overhead_cover_id: 'none',
        intra_g6_visibility_mode: 'default_clear',
        default_visibility_distance_band: 'near',
        acoustic_uniformity: 'uniform', status: 'active', state_version: 0,
        created_change_set_id: 'first-entry-cs', updated_change_set_id: 'first-entry-cs',
        terminal_change_set_id: null
      }
    },
    {
      target_table: 'scene_position_nodes',
      id: 'position-new',
      record: {
        id: 'position-new', party_id: 'p', g6_instance_id: 'g6-new',
        position_type_id: 'scene_position.central', template_slot_key: 'arrival',
        template_instance_ordinal: 0, stable_basis_ref: null, capacity: 10,
        access_class_id: 'open', light_profile_ref: null, hazard_profile_ref: null,
        status: 'active', state_version: 0,
        created_change_set_id: 'first-entry-cs', updated_change_set_id: 'first-entry-cs',
        terminal_change_set_id: null
      }
    }
  ];
  const generatedSceneInsertsFor = (changeSetId) => generatedSceneInserts.map((write) => ({
    ...write,
    record: {
      ...write.record,
      created_change_set_id: changeSetId,
      updated_change_set_id: changeSetId
    }
  }));
  const materializationScopeKey = 'party_runtime.party_scene_baselines:baseline-new';
  const physicalFirstEntryRecheck = firstEntryPhysicalRecheck();
  const firstEntryRechecks = ['physical', 'state', 'pin', 'endpoint', 'route', 'capacity', 'time', 'change_set']
    .map((kind) => ({
      kind,
      digest: `sha256:${hex}`,
      ...(kind === 'physical' ? physicalFirstEntryRecheck : {})
    }));
  const firstEntry = await makePlan({
    planId: 'first-entry-plan',
    idempotencyId: 'first-entry-idem',
    idempotencyKey: 'first-entry-key',
    changeSetId: 'first-entry-cs',
    operationKind: 'first_entry',
    inserts: generatedSceneInserts,
    updates: [
      {
        target_table: 'party_journey_locations',
        id: 'location-actor',
        record: {
          id: 'location-actor', party_id: 'p', owner_kind: 'actor',
          owner_id: 'actor-1', location_kind: 'scene',
          scene_position_id: 'position-new', transit_anchor_id: null,
          travel_state_id: null, updated_change_set_id: 'first-entry-cs'
        }
      },
      {
        target_table: 'preparation_claims',
        id: 'preparation-claim-first-entry',
        record: {
          id: 'preparation-claim-first-entry',
          claim_status: 'consumed',
          terminal_change_set_id: 'first-entry-cs'
        }
      }
    ],
    expectedStateVersions: [
      {
        target_table: 'party_journey_locations',
        id: 'location-actor',
        state_version: 0
      },
      {
        target_table: 'preparation_claims',
        id: 'preparation-claim-first-entry',
        state_version: 1
      }
    ],
    ownerKeys: ['actor:actor-1'],
    executionKeys: ['route-execution:first-entry'],
    g4Keys: ['p:g4-existing'],
    physicalKeys: [
      ...generatedSceneInserts.map((write) => `party_runtime.${write.target_table}:${write.id}`),
      'party_runtime.party_journey_locations:location-actor',
      'party_runtime.preparation_claims:preparation-claim-first-entry'
    ],
    commitRechecks: firstEntryRechecks
  });
  const firstEntryB = await makePlan({
    planId: 'first-entry-plan-b',
    idempotencyId: 'first-entry-idem-b',
    idempotencyKey: 'first-entry-key-b',
    changeSetId: 'first-entry-cs-b',
    operationKind: 'first_entry',
    inserts: generatedSceneInsertsFor('first-entry-cs-b'),
    updates: [
      {
        target_table: 'party_journey_locations',
        id: 'location-actor',
        record: {
          id: 'location-actor', party_id: 'p', owner_kind: 'actor',
          owner_id: 'actor-1', location_kind: 'scene',
          scene_position_id: 'position-new', transit_anchor_id: null,
          travel_state_id: null, updated_change_set_id: 'first-entry-cs-b'
        }
      },
      {
        target_table: 'preparation_claims',
        id: 'preparation-claim-first-entry',
        record: {
          id: 'preparation-claim-first-entry',
          claim_status: 'consumed',
          terminal_change_set_id: 'first-entry-cs-b'
        }
      }
    ],
    expectedStateVersions: [
      {
        target_table: 'party_journey_locations',
        id: 'location-actor',
        state_version: 0
      },
      {
        target_table: 'preparation_claims',
        id: 'preparation-claim-first-entry',
        state_version: 1
      }
    ],
    ownerKeys: ['actor:actor-1'],
    executionKeys: ['route-execution:first-entry'],
    g4Keys: ['p:g4-existing'],
    physicalKeys: [
      ...generatedSceneInserts.map((write) => `party_runtime.${write.target_table}:${write.id}`),
      'party_runtime.party_journey_locations:location-actor',
      'party_runtime.preparation_claims:preparation-claim-first-entry'
    ],
    commitRechecks: firstEntryRechecks
  });
  const firstEntryConcurrentCommitter = createSpatialV3PostgresCombinedAtomicCommitter({
    pool,
    now: () => later,
    recheck: fullRecheck,
    ordinaryFirstEntryProvisioner:
      createOrdinaryMaterializationFirstEntryProvisioner({
        profile: ordinaryProfile
      })
  });
  const partyBeforeFirstEntry = (await client.query(
    "SELECT state_version FROM party_runtime.parties WHERE party_id='p'"
  )).rows[0].state_version;
  assert.equal((await client.query(`SELECT count(*) FROM party_runtime.party_ordinary_materialization_enablements
    WHERE party_id='p' AND scope_kind='g6' AND scope_id='g6-new'`)).rows[0].count, '0');
  const concurrentFirstEntryResults = await Promise.all([
    firstEntryConcurrentCommitter.commit({ plan: firstEntry }),
    firstEntryConcurrentCommitter.commit({ plan: firstEntryB })
  ]);
  const successfulFirstEntries = concurrentFirstEntryResults
    .map((result, index) => ({
      result,
      plan: index === 0 ? firstEntry : firstEntryB,
      idempotencyKey: index === 0 ? 'first-entry-key' : 'first-entry-key-b',
      changeSetId: index === 0 ? 'first-entry-cs' : 'first-entry-cs-b'
    }))
    .filter(({ result }) => result.ok);
  const rejectedFirstEntries = concurrentFirstEntryResults.filter((result) => !result.ok);
  assert.equal(successfulFirstEntries.length, 1, JSON.stringify(concurrentFirstEntryResults));
  assert.equal(rejectedFirstEntries.length, 1, JSON.stringify(concurrentFirstEntryResults));
  assert.ok(
    ['target_preparation_failed', 'state_version_conflict'].includes(rejectedFirstEntries[0].error.code),
    JSON.stringify(rejectedFirstEntries[0])
  );
  const [{
    result: firstEntryResult,
    plan: winningFirstEntryPlan,
    idempotencyKey: winningFirstEntryKey,
    changeSetId: winningFirstEntryChangeSetId
  }] = successfulFirstEntries;
  assert.ok(firstEntryResult.lock_keys.includes('04:g4:p:g4-existing'));
  assert.ok(firstEntryResult.lock_keys.includes(`05:physical:${materializationScopeKey}`));
  assert.ok(firstEntryResult.lock_keys.includes(
    `06:idempotency:p:first_entry:${winningFirstEntryKey}`
  ));
  assert.deepEqual(
    (await client.query("SELECT location_kind,scene_position_id,state_version FROM party_runtime.party_journey_locations WHERE id='location-actor'")).rows[0],
    { location_kind: 'scene', scene_position_id: 'position-new', state_version: '1' }
  );
  assert.equal((await client.query("SELECT count(*) FROM party_runtime.party_scene_baselines WHERE id='baseline-new'")).rows[0].count, '1');
  assert.equal((await client.query("SELECT count(*) FROM party_runtime.party_g6_instances WHERE id='g6-new'")).rows[0].count, '1');
  assert.equal((await client.query("SELECT count(*) FROM party_runtime.scene_position_nodes WHERE id='position-new'")).rows[0].count, '1');
  const ordinaryProvisioned = await client.query(`SELECT
      (SELECT count(*)::int FROM party_runtime.party_ordinary_materialization_aggregates
       WHERE party_id='p' AND scope_kind='g6' AND scope_id='g6-new') AS aggregates,
      (SELECT count(*)::int FROM party_runtime.party_ordinary_materialization_contexts
       WHERE party_id='p' AND scope_kind='g6' AND scope_id='g6-new') AS contexts,
      (SELECT count(*)::int FROM party_runtime.party_ordinary_materialization_enablements
       WHERE party_id='p' AND scope_kind='g6' AND scope_id='g6-new' AND enabled) AS enablements,
      (SELECT count(*)::int FROM party_runtime.party_ordinary_materialization_basis_catalog
       WHERE party_id='p' AND scope_kind='g6' AND scope_id='g6-new') AS bases,
      (SELECT count(*)::int FROM party_runtime.party_resource_nodes
       WHERE party_id='p') AS finite_sources,
      (SELECT state_version FROM party_runtime.parties WHERE party_id='p') AS party_state_version`);
  assert.deepEqual(ordinaryProvisioned.rows[0], {
    aggregates: 1, contexts: 1, enablements: 1, bases: 2, finite_sources: 1,
    party_state_version: partyBeforeFirstEntry
  }, 'first-entry O1 provisioning is atomic and does not add a party bump');
  const enablements = createPostgresOrdinaryMaterializationEnablementRepository({ pool });
  const loadedEnablement = await enablements.load({ partyId: 'p',
    scopeRef: { entity_kind: 'g6', entity_id: 'g6-new' } });
  assert.ok(loadedEnablement, 'the exact newly entered G6 exposes the O1 marker');
  assert.equal(loadedEnablement.execution_context.context_bound_capabilities.length, 1);
  assert.equal(loadedEnablement.execution_context.committed_finite_source.lifecycle_state,
    'active');
  assert.equal(await enablements.load({ partyId: 'p',
    scopeRef: { entity_kind: 'g6', entity_id: 'g6-old' } }), null,
  'other G6 scopes remain unavailable');
  const [finiteCapability] = loadedEnablement.execution_context
    .context_bound_capabilities;
  const finiteBasis = finiteCapability.supporting_bases[0];
  assert.equal(finiteCapability.source_ref, finiteBasis.basis_ref);
  assert.equal(finiteCapability.candidate_context.target_ref,
    finiteCapability.source_ref);
  let finiteCalls = 0;
  const finiteResolver = createLowerDvinaTraceOrdinaryDiscoveryResolver({
    partyId: 'p', inputDigest: 'first-entry-o2a-finite',
    loadEnablement: (value) => enablements.load(value),
    verifyStageBCutover: async () => ({ pass: true }),
    ordinaryMaterializationModel: async (request) => {
      finiteCalls += 1;
      if (request.mode === 'seed_scope') return {
        schema: 'ordinary_materialization_plan_v1', request_id: request.request_id,
        resolution: 'seeded', density_band_proposal: 'ordinary',
        background_groups: [], entities: [], presence_resolutions: [],
        reason_code: 'seed' };
      return { schema: 'ordinary_materialization_plan_v1',
        request_id: request.request_id, resolution: 'materialize',
        density_band_proposal: null, background_groups: [],
        presence_resolutions: [], reason_code: 'finite-present', entities: [{
          semantic_descriptor: { semantic_type: 'hand_formed_clay_blank',
            name: 'небольшая заготовка из глины', facts: [] },
          authority_class: 'ordinary', admission_class: 'specialized_or_valuable',
          availability_class: 'context_bound', functional_bucket: 'other_ordinary',
          presence_expectation: 'routine', supporting_basis_ref: finiteBasis.basis_ref,
          causal_basis: { basis_kind: 'finite_source',
            basis_refs: [finiteBasis.basis_ref] },
          property_basis_ref:
            finiteCapability.context_refs.property_context_ref,
          placement_proposal: { scope_ref: 'g6-new', position_ref: 'position-new' },
          mechanics_proposal: { mass_grams: 300, external_hand_cost: 1,
            carry_form: 'regular', packing_slot_cost: 1,
            quantity: { value: 1, unit: 'item' }, container: null } }] };
    }
  });
  const finiteAvailable = await finiteResolver({
    request: { root_turn_id: 'first-entry-o2a-finite' },
    committed_state: { position: { g6_id: 'g6-new',
      g5_anchor_id: 'ordinary-anchor' } },
    operation: { target_refs: [finiteCapability.source_ref],
      query: 'взять порцию подготовленной глины' }, working_projection: {} });
  const finitePlan = finiteAvailable.ordinary_materialization_atomic_write_plan;
  assert.ok(finitePlan, JSON.stringify(finiteAvailable));
  assert.equal(finiteCalls, 2, JSON.stringify(finiteAvailable));
  assert.equal(finitePlan.item.admission_class, 'specialized_or_valuable');
  assert.deepEqual(finitePlan.item.item_proposal.semantic_descriptor, {
    semantic_type: 'prepared_clay_portion',
    name: 'запас подготовленной глины', facts: [] });
  assert.deepEqual(finitePlan.finite_resource_transition.before_quantity,
    { numerator: 2, denominator: 1, unit: 'item' });
  assert.deepEqual(finitePlan.finite_resource_transition.after_quantity,
    { numerator: 1, denominator: 1, unit: 'item' });
  const calls = [];
  const provisionedBasis = loadedEnablement.execution_context.supporting_bases[0];
  const provisionedProperty = loadedEnablement.property_placement_context;
  let preparedProductionBasisRef = null;
  const ordinaryResolver = createLowerDvinaTraceOrdinaryDiscoveryResolver({
    partyId: 'p', inputDigest: 'first-entry-o1',
    loadEnablement: (value) => enablements.load(value),
    verifyStageBCutover: async () => ({ pass: true }),
    ordinaryMaterializationModel: async (request) => {
      calls.push(request);
      if (request.mode === 'seed_scope') return {
        schema: 'ordinary_materialization_plan_v1', request_id: request.request_id,
        resolution: 'seeded', density_band_proposal: 'ordinary',
        background_groups: [{ descriptor: 'ordinary work layer',
          functional_bucket: 'other_ordinary', availability_class: 'common',
          allowed_admission_classes: ['common_mundane'],
          causal_basis: { basis_kind: 'ordinary_presence',
            basis_refs: [provisionedBasis.basis_ref] },
          property_basis_ref:
            ordinaryProfile.context_refs.property_context_ref,
          permission_refs: [], disclosure_policy_ref:
            loadedEnablement.execution_context
              .allowed_disclosure_policy_refs[0] }],
        entities: [], presence_resolutions: [], reason_code: 'seed'
      };
      preparedProductionBasisRef = request.policy_refs
        .allowed_supporting_bases.find(({ basis_state: state }) =>
          state === 'prepared_seed')?.basis_ref ?? null;
      assert.ok(preparedProductionBasisRef,
        'production Stage B can use only its validated Stage A basis');
      return {
        schema: 'ordinary_materialization_plan_v1', request_id: request.request_id,
        resolution: 'materialize', density_band_proposal: null,
        background_groups: [], entities: [{ semantic_descriptor: {
          semantic_type: 'cordage', name: 'простая верёвка', facts: [] },
        authority_class: 'ordinary', admission_class: 'common_mundane',
        availability_class: 'common', functional_bucket: 'other_ordinary',
        presence_expectation: 'routine',
        supporting_basis_ref: preparedProductionBasisRef,
        causal_basis: { basis_kind: 'ordinary_presence',
          basis_refs: [preparedProductionBasisRef] },
        property_basis_ref: ordinaryProfile.context_refs.property_context_ref,
        placement_proposal: { scope_ref: 'g6-new',
          position_ref: provisionedProperty.placement_catalog[0].position_ref },
        mechanics_proposal: { mass_grams: 350, external_hand_cost: 0,
          carry_form: 'compact', packing_slot_cost: 1,
          quantity: { value: 1, unit: 'item' }, container: null } }],
        presence_resolutions: [], reason_code: 'ordinary_present'
      };
    }
  });
  const ordinaryAvailable = await ordinaryResolver({ request: { root_turn_id: 'first-entry-o1' },
    committed_state: { position: { g6_id: 'g6-new',
      g5_anchor_id: 'ordinary-anchor' } },
    operation: { target_refs: ['g6-new'], query: ' найти вещь ' }, working_projection: {} });
  assert.ok(ordinaryAvailable.ordinary_materialization_atomic_write_plan,
    `the production resolver can use only the provisioned exact scope: calls=${calls.length} ${JSON.stringify(ordinaryAvailable)}`);
  assert.equal(calls.length, 2);
  const productionOrdinaryPlan =
    ordinaryAvailable.ordinary_materialization_atomic_write_plan;
  const productionOrdinaryState = { items: [] };
  const productionOrdinaryProjection = applyOrdinaryMaterializationProjection({
    next: productionOrdinaryState, visibleContext: { visible_objects: [] },
    ordinaryPlan: productionOrdinaryPlan
  });
  const partyBeforeProductionOrdinary = Number((await client.query(
    "SELECT state_version FROM party_runtime.parties WHERE party_id='p'"
  )).rows[0].state_version);
  const committedOrdinaryState = {
    party_id: 'p', actor_id: 'actor-1',
    party_state: { state_version: partyBeforeProductionOrdinary + 1 },
    position: { g5_anchor_id: 'ordinary-anchor', g6_id: 'g6-new',
      location_ref: 'g6-new' },
    player_profile: { attributes: { strength: { value: 9 } },
      inventory: { items: [], total_weight: { grams: 0 },
        load_category: 'light', occupied_hands: 0 } },
    items: productionOrdinaryState.items, containers: [],
    container_placements: [], container_profiles: [], knowledge: []
  };
  const productionOrdinaryCommit = await makePlan({
    planId: 'production-o1-positive-plan',
    idempotencyId: 'production-o1-positive-idem',
    idempotencyKey: 'production-o1-positive-key',
    changeSetId: 'production-o1-positive-cs',
    expectedStateVersions: [{ target_table: 'parties', id: 'p',
      state_version: partyBeforeProductionOrdinary }],
    inserts: [{ target_table: 'party_state_snapshots',
      id: `p:${partyBeforeProductionOrdinary + 1}`, record: {
        party_id: 'p', state_version: partyBeforeProductionOrdinary + 1,
        state_payload: committedOrdinaryState,
        state_digest: canonicalDigest(committedOrdinaryState)
      } }],
    updates: [{ target_table: 'parties', id: 'p', record: { party_id: 'p',
      profile_bundle_digest: 'b' } }],
    physicalKeys: ['party_runtime.parties:p',
      `party_runtime.party_state_snapshots:p:${partyBeforeProductionOrdinary + 1}`,
      ...ordinaryPhysicalKeys(productionOrdinaryPlan)],
    ordinaryMaterializationAtomicWritePlan: productionOrdinaryPlan,
    visibleObjects: productionOrdinaryProjection.visible_objects
  });
  assert.equal((await firstEntryConcurrentCommitter.commit({
    plan: productionOrdinaryCommit })).ok, true);
  assert.deepEqual((await client.query(`SELECT
      item_proposal->'semantic_descriptor'->>'name' AS name,
      mechanics_snapshot->'mechanics' AS mechanics
    FROM party_runtime.party_ordinary_materialization_items
    WHERE party_id='p' AND item_id=$1`,
  [productionOrdinaryPlan.item.item_id])).rows[0], {
    name: 'простая верёвка',
    mechanics: productionOrdinaryPlan.item.mechanics_snapshot.mechanics
  });
  const normalizedOrdinary = (await client.query(`SELECT
      i.template_id,i.state->'runtime_instance_mechanics_snapshot' AS mechanics,
      p.anchor_id,p.container_id,p.holder_character_id
    FROM party_runtime.party_items i
    JOIN party_runtime.party_item_placements p
      ON p.party_id=i.party_id AND p.item_id=i.item_id
    WHERE i.party_id='p' AND i.item_id=$1`,
  [productionOrdinaryPlan.item.item_id])).rows[0];
  assert.deepEqual(normalizedOrdinary, {
    template_id: null,
    mechanics: productionOrdinaryPlan.item.mechanics_snapshot,
    anchor_id: 'ordinary-anchor', container_id: null,
    holder_character_id: null
  });
  const reloadedOrdinaryState = (await client.query(`SELECT state_payload
    FROM party_runtime.party_state_snapshots
    WHERE party_id='p' AND state_version=$1`,
  [partyBeforeProductionOrdinary + 1])).rows[0].state_payload;
  const runtimePorts = createLowerDvinaTraceTurnStepRuntimePorts({
    committedState: reloadedOrdinaryState,
    workingProjectionAuthority:
      createLowerDvinaTracePlayerSafeWorkingProjectionAuthority()
  });
  const discoveredItem = reloadedOrdinaryState.items[0];
  const moveOperation = { op: 'move_entity',
    entity_ref: discoveredItem.item_id,
    placement: { relation: 'held_by', target_ref: 'actor-1' } };
  const movedOrdinary = await runtimePorts.executionRegistry
    .direct(moveOperation)({ plan: {}, operation: moveOperation,
      working_projection: {
        actor_id: 'actor-1', position: reloadedOrdinaryState.position,
        inventory: reloadedOrdinaryState.player_profile.inventory,
        items: reloadedOrdinaryState.items, knowledge: []
      }, check_result: null,
      request: { root_turn_id: 'next-ordinary-turn', step_index: 1,
        actor: { actor_id: 'actor-1',
          attributes: { strength: { value: 9, bonus: 0 } } } } });
  const movedSnapshot = movedOrdinary.working_projection.items.find(
    ({ item_id: itemId }) => itemId === discoveredItem.item_id)
    .runtime_instance_mechanics_snapshot;
  assert.equal(movedSnapshot.schema,
  'rus.items.runtime_instance_mechanics_snapshot.v2');
  assert.deepEqual(movedSnapshot.mechanics,
  productionOrdinaryPlan.item.mechanics_snapshot.mechanics);
  assert.equal(movedOrdinary.write_fragments[0].value.payload
    .placement.holder_character_id, 'actor-1');
  assert.deepEqual((await client.query(
    "SELECT visible_payload->'visible_objects' AS objects FROM party_runtime.party_visible_packages WHERE package_id='visible-production-o1-positive-cs'"
  )).rows[0].objects, productionOrdinaryProjection.visible_objects);
  const afterReload = await enablements.load({ partyId: 'p',
    scopeRef: { entity_kind: 'g6', entity_id: 'g6-new' } });
  assert.equal(afterReload.ordinary_aggregate.presence_resolutions.length, 1);
  assert.equal(afterReload.execution_context.supporting_bases.some((basis) =>
    basis.basis_ref === preparedProductionBasisRef
      && basis.state === 'prepared_seed'), true,
  'the Stage A basis is persisted and reloadable for later Stage B requests');
  let reloadModelCalls = 0;
  const reloadResolver = createLowerDvinaTraceOrdinaryDiscoveryResolver({
    partyId: 'p', inputDigest: 'first-entry-o1-reload',
    loadEnablement: (value) => enablements.load(value),
    verifyStageBCutover: async () => {
      throw new Error('committed identity must preflight before cutover');
    },
    ordinaryMaterializationModel: async () => {
      reloadModelCalls += 1;
      throw new Error('committed identity must not reroll');
    }
  });
  const replayedOrdinary = await reloadResolver({
    request: { root_turn_id: 'first-entry-o1-reload' },
    committed_state: { position: { g6_id: 'g6-new',
      g5_anchor_id: 'ordinary-anchor' } },
    operation: { target_refs: ['g6-new'], query: '  НАЙТИ   ВЕЩЬ  ' },
    working_projection: {} });
  assert.equal(reloadModelCalls, 0);
  assert.equal(replayedOrdinary.ordinary_materialization_atomic_write_plan,
    undefined);
  let saturatedAggregate = structuredClone(afterReload.ordinary_aggregate);
  saturatedAggregate.identity_budget = 4;
  saturatedAggregate.remaining_identity_budget = 3;
  for (let ordinal = 2; ordinal <= 4; ordinal += 1) {
    saturatedAggregate = applyOrdinaryAggregateTransition({
      aggregate: saturatedAggregate, transition: {
        kind: 'resolve_presence',
        request_identity: `cap-presence-${ordinal}`,
        expected_state_version: saturatedAggregate.state_version,
        resolution_ref: `cap-resolution-${ordinal}`,
        candidate_key: `cap-candidate-${ordinal}`,
        coverage_key: `cap-coverage-${ordinal}`,
        category_key: `cap-category-${ordinal}`,
        context_version: `cap-context-${ordinal}`,
        resolution: 'no_change'
      }
    });
  }
  await client.query(`UPDATE party_runtime.party_ordinary_materialization_aggregates
    SET state_version=$4,aggregate_payload=$5::jsonb
    WHERE party_id=$1 AND scope_kind=$2 AND scope_id=$3`,
  ['p', 'g6', 'g6-new', saturatedAggregate.state_version,
    JSON.stringify(saturatedAggregate)]);
  let capModelCalls = 0;
  const cappedResolver = createLowerDvinaTraceOrdinaryDiscoveryResolver({
    partyId: 'p', inputDigest: 'first-entry-o1-cap',
    loadEnablement: (value) => enablements.load(value),
    verifyStageBCutover: async () => {
      throw new Error('full cap must preflight before cutover');
    },
    ordinaryMaterializationModel: async () => {
      capModelCalls += 1;
      throw new Error('full cap must not invoke the model');
    }
  });
  const capped = await cappedResolver({
    request: { root_turn_id: 'first-entry-o1-cap' },
    committed_state: { position: { g6_id: 'g6-new',
      g5_anchor_id: 'ordinary-anchor' } },
    operation: { target_refs: ['g6-new'], query: 'найти другую вещь' },
    working_projection: {}
  });
  assert.equal(capModelCalls, 0);
  assert.equal(capped.ordinary_materialization_atomic_write_plan, undefined);
  const cappedReadback = (await client.query(`SELECT aggregate_payload
    FROM party_runtime.party_ordinary_materialization_aggregates
    WHERE party_id='p' AND scope_kind='g6' AND scope_id='g6-new'`))
    .rows[0].aggregate_payload;
  assert.equal(cappedReadback.presence_resolutions.length, 4);
  assert.equal(cappedReadback.state_version, 5,
  'a new capped query adds no granular resolution record');
  assert.deepEqual(
    (await client.query("SELECT claim_status,state_version,terminal_change_set_id FROM party_runtime.preparation_claims WHERE id='preparation-claim-first-entry'")).rows[0],
    {
      claim_status: 'consumed',
      state_version: '2',
      terminal_change_set_id: winningFirstEntryChangeSetId
    }
  );
  assert.equal(
    (await firstEntryConcurrentCommitter.commit({ plan: winningFirstEntryPlan })).replay,
    true
  );
});
