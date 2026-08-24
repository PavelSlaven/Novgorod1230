import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSpatialV3WorldBaseReader } from '../../apps/game-server/src/infrastructure/postgres/spatial-v3-world-base-reader.js';
import { createSpatialV3PartyRepository } from '../../packages/party-store/src/spatial-v3-repository.js';
import { buildCombinedWritePlan } from '../../packages/turn/src/spatial-v3-write-plan.js';
import { createSpatialV3CombinedAtomicCommitter } from '../../apps/game-server/src/infrastructure/postgres/spatial-v3-combined-atomic-committer.js';
import { computeSpatialV3CanonicalDigest } from '@rus/contracts/spatial-v3/registry';
import { batchInput } from '../../apps/game-server/test/ordinary-materialization-container-batch-plan.test.js';
const digest = 'a'.repeat(64);
const approval = async () => ({ ok: true });
const firstEntryBindingFields = [
  'baseline_disposition',
  'g4_id',
  'preparation_snapshot_id',
  'preparation_member_ordinal',
  'preparation_snapshot_digest',
  'preparation_member_digest',
  'route_plan_id',
  'route_plan_digest',
  'route_plan_execution_id',
  'preparation_claim_id',
  'scene_baseline_id',
  'g5_site_id',
  'g6_instance_id',
  'position_id'
];
function firstEntryPhysicalRecheck(overrides = {}) {
  const value = {
    kind: 'physical',
    materialization_scope_key: 'party_runtime.party_scene_baselines:baseline-new',
    baseline_disposition: 'create',
    g4_id: 'g4-existing',
    preparation_snapshot_id: 'preparation-snapshot-1',
    preparation_member_ordinal: 0,
    preparation_snapshot_digest: digest,
    preparation_member_digest: digest,
    route_plan_id: 'route-plan-1',
    route_plan_digest: digest,
    route_plan_execution_id: 'route-execution-1',
    preparation_claim_id: 'preparation-claim-1',
    scene_baseline_id: 'baseline-new',
    g5_site_id: 'g5-new',
    g6_instance_id: 'g6-new',
    position_id: 'position-new',
    ...overrides
  };
  return { ...value, digest: computeSpatialV3CanonicalDigest(value) };
}
function firstEntryEvidence(check) {
  return Object.fromEntries(firstEntryBindingFields.map((field) => [field, check[field]]));
}
function input(overrides = {}) {
  const visible_payload = {
    schema: 'temporal_visible_package.v1',
    perceived_scene: 'Изменение зафиксировано.',
    perceived_changes: ['Состояние сохранено.'],
    sensory_details: [],
    visible_npcs: [],
    visible_objects: [],
    known_context: [],
    uncertainties: [],
    hypotheses: [],
    player_safe_interruption: null,
    allowed_action_affordances: []
  };
  const pins = [{ dependency_role: 'source_authoring', entity_ref: { entity_kind: 'world_revision', entity_id: 'temporal-v4' }, version_pin: { pin_kind: 'authoring_version', authoring_version: '4.3.0-target.1', state_version: null } }];
  return {
    plan_id: 'plan', party_id: 'p', write_plan_kind: 'semantic_commit', operation_kind: 'move', canonical_input_digest: `sha256:${digest}`, expected_state_versions: [], validation_report: { status: 'pass', digest: `sha256:${digest}` }, idempotency: { id: 'idem', key: 'key' }, change_set: { id: 'cs' },
    visible_package_envelope: { package_id: 'visible-cs', party_id: 'p', turn_id: 'turn-1', committed_state_version: '2', change_set_id: 'cs', package_digest: computeSpatialV3CanonicalDigest(visible_payload), visible_payload, presentation_status: 'pending', projection_policy_ref: { entity_ref: { entity_kind: 'visibility_modifier', entity_id: 'projection-v1' }, authoring_version: '4.3.0-target.1' }, dependency_pins: { pins, canonical_digest: computeSpatialV3CanonicalDigest(pins).replace('sha256:', '') }, idempotency_record_id: 'idem' },
    lock_context: { owner_keys: [], execution_keys: [], g4_keys: [], physical_keys: ['party_runtime.party_v3_change_sets:cs', 'party_runtime.party_route_plan_executions:e'] }, commit_rechecks: ['physical', 'state', 'pin', 'endpoint', 'route', 'capacity', 'time', 'change_set'].map((kind) => ({ kind, digest: `sha256:${digest}` })), approved_write_sets: [{ appends: [{ target_table: 'party_v3_change_sets', id: 'cs', record: { id: 'cs', party_id: 'p', operation_kind: 'move', idempotency_record_id: 'idem' } }], inserts: [], updates: [] }],
    ...overrides
  };
}

test('P16 reader requires exact id/version/revision/digest and uses typed projected reads', async () => {
  const calls = []; const reader = createSpatialV3WorldBaseReader({ query: async (sql, params) => { calls.push({ sql, params }); return { rows: [{ id: 'route', version: 3, world_revision_id: 'r', canonical_digest: digest }] }; } });
  assert.equal((await reader.readRoute({ id: 'route', version: 3, world_revision_id: 'r', canonical_digest: digest })).ok, true); assert.doesNotMatch(calls[0].sql, /SELECT \*/); assert.match(calls[0].sql, /canonical_digest=\$4/);
  assert.equal((await reader.readOrientationProfile({ id: 'o', version: 1, world_revision_id: 'r', canonical_digest: digest })).ok, true);
  assert.equal((await reader.readRoute({ id: 'route', version: 3, world_revision_id: 'r' })).error.code, 'authoring_dependency_pin_missing');
});

test('P16 reader loads approved closure from one exact pinned template header', async () => {
  const calls = [];
  const ref = { id: 'template', version: 1, world_revision_id: 'revision' };
  const header = { ...ref, canonical_digest: digest };
  const children = {
    spatial_v3_g6_template_slots: [{ scene_slot_key: 'g6', physical_class_id: 'open', primary_scene_role_id: 'role', vertical_context_id: 'surface', overhead_cover_id: 'none', intra_g6_visibility_mode: 'clear', default_visibility_distance_band: 'near', acoustic_uniformity: 'uniform' }],
    spatial_v3_scene_position_templates: [{ position_slot_key: 'position', g6_scene_slot_key: 'g6', position_type_id: 'standing', capacity: 1, access_class_id: 'public' }],
    spatial_v3_scene_movement_edge_templates: [{ edge_slot_key: 'edge', from_position_slot_key: 'position', to_position_slot_key: 'other', reverse_edge_slot_key: 'reverse', passage_type_id: 'passage', transition_environment_profile_id: null, transition_environment_profile_version: null, movement_orientation_profile_id: null, movement_orientation_profile_version: null, cost_kind: 'action', action_units: 1, baseline_movement_method_id: null, movement_method_cost_profile_id: null, movement_method_cost_profile_version: null, base_minutes: null, dynamic_recheck_policy_id: null, dynamic_recheck_policy_version: null, capacity: 1, portal_template_id: null, portal_template_version: null, availability_condition_set_id: null, availability_condition_set_version: null }],
    spatial_v3_visibility_link_templates: [{ link_slot_key: 'link', from_position_slot_key: 'position', to_position_slot_key: 'other', reverse_link_slot_key: 'reverse', quality: 'clear', distance_band: 'near', portal_template_id: null, portal_template_version: null, condition_profile_id: null, condition_profile_version: null }]
  };
  const reader = createSpatialV3WorldBaseReader({ query: async (sql, params) => {
    calls.push({ sql, params });
    const table = Object.keys(children).find((name) => sql.includes(name));
    const columns = sql.match(/^SELECT (.+) FROM /u)?.[1]?.split(',');
    return { rows: table ? children[table].map((row) => ({ ...row,
      scene_template_id: ref.id, scene_template_version: ref.version,
      identity: 'must-not-reach-materializer' })).map((row) =>
      Object.fromEntries(columns.map((column) => [column, row[column]]))) : [header] };
  } });
  const result = await reader.readPinnedSceneTemplateClosure(ref);
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.header, header);
  assert.deepEqual({ g6_slots: result.value.g6_slots, position_slots: result.value.position_slots,
    movement_edges: result.value.movement_edges, visibility_links: result.value.visibility_links }, {
    g6_slots: children.spatial_v3_g6_template_slots,
    position_slots: children.spatial_v3_scene_position_templates,
    movement_edges: children.spatial_v3_scene_movement_edge_templates,
    visibility_links: children.spatial_v3_visibility_link_templates
  });
  assert.deepEqual(calls[0].params, [ref.id, ref.version, ref.world_revision_id]);
  assert.match(calls[0].sql, /status='approved'/);
  assert.ok(calls.slice(1).every(({ sql }) => !/SELECT \*/u.test(sql)));
  assert.ok(calls.slice(1).every(({ params }) =>
    params[0] === ref.id && params[1] === ref.version));
});

test('P16 reader resolves one exact canonical G5 scene binding', async () => {
  const row = {
    id: 'g5', version: 1, world_revision_id: 'revision', spatial_level: 'G5',
    primary_class_id: 'spatial.g5.parcel', status: 'approved',
    canonical_digest: digest, parent_id: 'g4', parent_version: 4,
    materialization_profile_id: 'profile', materialization_profile_version: 1,
    materialization_profile_digest: digest, scene_template_id: 'scene',
    scene_template_version: 1
  };
  const calls = [];
  const reader = createSpatialV3WorldBaseReader({ query: async (sql, params) => {
    calls.push({ sql, params }); return { rows: [row] };
  } });
  assert.deepEqual((await reader.readPinnedCanonicalG5SceneBinding({
    id: 'g5', version: 1, world_revision_id: 'revision'
  })).value, row);
  assert.deepEqual(calls[0].params, ['g5', 1, 'revision']);
  assert.match(calls[0].sql, /source_kind='canonical_g5'/u);
  const ambiguous = createSpatialV3WorldBaseReader({ query: async () => ({
    rows: [row, row]
  }) });
  assert.equal((await ambiguous.readPinnedCanonicalG5SceneBinding({
    id: 'g5', version: 1, world_revision_id: 'revision'
  })).ok, false);
});

test('P16 repository models composite history identity without generic id ordering', async () => {
  const calls = []; const repository = createSpatialV3PartyRepository({ transaction: { query: async (sql) => { calls.push(sql); return { rows: [{ execution_id: 'e', event_ordinal: 1, party_id: 'p' }] }; } } });
  assert.equal((await repository.loadHistory({ party_id: 'p', execution_id: 'e', event_ordinal: 1 })).ok, true); assert.match(calls[0], /ORDER BY execution_id,event_ordinal/); assert.doesNotMatch(calls[0], /SELECT \*/);
});

test('P16 target repository reads perception, reaction and knowledge without a v2 mixed branch', async () => {
  const calls = [];
  const transaction = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('party_npc_knowledge_merge_states')) {
        return { rows: [{
          party_id: 'p',
          npc_id: 'npc',
          state_version: 5,
          last_proposal_id: 'proposal',
          last_result_digest: digest,
          updated_change_set_id: 'change'
        }] };
      }
      if (sql.includes('party_npc_knowledge') && !sql.includes('merge_results')) {
        return { rows: [{
          fact_id: 'fact',
          knowledge_ref_kind: 'knowledge_fact',
          knowledge_classification: 'fact'
        }] };
      }
      return { rows: [{ party_id: 'p' }] };
    }
  };
  const repository = createSpatialV3PartyRepository({ transaction });
  assert.equal((await repository.loadPerceptionReplay({
    party_id: 'p',
    perception_id: 'perception'
  })).ok, true);
  assert.equal((await repository.loadReactionConsequence({
    party_id: 'p',
    request_id: 'request'
  })).ok, true);
  assert.equal((await repository.loadReactionOptionProposal({
    party_id: 'p',
    request_id: 'request'
  })).ok, true);
  assert.equal((await repository.loadKnowledgeMergeResult({
    party_id: 'p',
    proposal_id: 'proposal'
  })).ok, true);
  const knowledge = await repository.loadKnowledgeState({
    party_id: 'p',
    npc_id: 'npc',
    expected_state_version: 5
  });
  assert.equal(knowledge.ok, true);
  assert.equal(knowledge.knowledge[0].knowledge_ref_kind, 'knowledge_fact');
  assert.equal(calls.every(({ sql }) => !/SELECT\s+\*/u.test(sql)), true);
  const targetKnowledgeQuery = calls.find(({ sql }) =>
    sql.includes("target_contract_version='4.4.0-target.1'"));
  assert.ok(targetKnowledgeQuery);
  assert.doesNotMatch(targetKnowledgeQuery.sql, /target_contract_version IS NULL/u);
});

test('P16 builder verifies approval, preserves three disjoint sets and rejects a foreign table', async () => {
  const good = await buildCombinedWritePlan(input(), { verifyApproval: approval });
  assert.equal(good.ok, true);
  assert.equal(good.plan.write_set_digest.startsWith('sha256:'), true);
  const visibleWrite = good.plan.appends.find(({ target_table }) => target_table === 'party_visible_packages');
  const narrationJob = good.plan.inserts.find(({ target_table }) => target_table === 'party_narration_jobs');
  assert.deepEqual(visibleWrite?.record.visible_payload, good.plan.visible_package_envelope.visible_payload);
  assert.equal(visibleWrite?.record.package_id, good.plan.visible_package_envelope.package_id);
  assert.equal(narrationJob?.record.package_id, good.plan.visible_package_envelope.package_id);
  assert.equal(narrationJob?.record.status, 'pending');
  assert.equal(narrationJob?.record.idempotency_key, `presentation:${good.plan.visible_package_envelope.package_id}:${good.plan.visible_package_envelope.package_digest}`);
  assert.ok(good.plan.physical_keys.includes(`party_runtime.party_visible_packages:${visibleWrite?.id}`));
  assert.ok(good.plan.physical_keys.includes(`party_runtime.party_narration_jobs:${narrationJob?.id}`));
  const bad = await buildCombinedWritePlan(input({ approved_write_sets: [{ inserts: [{ target_table: 'world_routes', id: 'x', record: { id: 'x', party_id: 'p' } }], updates: [], appends: [{ target_table: 'party_v3_change_sets', id: 'cs', record: { id: 'cs', party_id: 'p', operation_kind: 'move', idempotency_record_id: 'idem' } }] }] }), { verifyApproval: approval }); assert.equal(bad.error.code, 'generated_schema_mismatch');
  const forgedPresentationWrite = await buildCombinedWritePlan(input({
    approved_write_sets: [{
      inserts: [{
        target_table: 'party_narration_jobs',
        id: 'forged-job',
        record: { job_id: 'forged-job', party_id: 'p', package_id: 'foreign', status: 'pending', idempotency_key: 'forged' }
      }],
      updates: [],
      appends: [{
        target_table: 'party_v3_change_sets',
        id: 'cs',
        record: { id: 'cs', party_id: 'p', operation_kind: 'move', idempotency_record_id: 'idem' }
      }]
    }]
  }), { verifyApproval: approval });
  assert.equal(forgedPresentationWrite.error.code, 'visible_package_persistence_gap');
  const portraitProjection = input();
  portraitProjection.approved_write_sets[0].appends[0].record.audit = {
    nested: { portrait_spec_v1: { schema: 'portrait_spec_v1' } }
  };
  const forbiddenPortrait = await buildCombinedWritePlan(
    portraitProjection,
    { verifyApproval: approval }
  );
  assert.equal(forbiddenPortrait.error.code, 'generated_schema_mismatch');
});

test('P16 builder snapshots outer ordinary plan input without executing accessors', async () => {
  let reads=0,approvals=0;
  const accessor=input();
  Object.defineProperty(accessor,'ordinary_materialization_atomic_write_plan',{
    enumerable:true,get(){reads+=1;return batchInput({masses:[]});}});
  const rejected=await buildCombinedWritePlan(accessor,{verifyApproval:async()=>{
    approvals+=1;return {ok:true};}});
  assert.equal(rejected.error.code,'generated_schema_mismatch');
  assert.equal(reads,0);
  assert.equal(approvals,0);

  const hostile=[];
  const symbol=structuredClone(batchInput({masses:[]}));
  symbol[Symbol('hidden')]=true; hostile.push(symbol);
  const proto=structuredClone(batchInput({masses:[]}));
  Object.setPrototypeOf(proto,{inherited:true}); hostile.push(proto);
  const cycle=structuredClone(batchInput({masses:[]})); cycle.self=cycle;
  hostile.push(cycle);
  const alias=structuredClone(batchInput({masses:[80]}));
  alias.alias=alias.items[0]; hostile.push(alias);
  for(const ordinaryPlan of hostile) assert.equal((await buildCombinedWritePlan(
    input({ordinary_materialization_atomic_write_plan:ordinaryPlan}),
    {verifyApproval:approval})).error.code,'generated_schema_mismatch');

  const legacy=await buildCombinedWritePlan(input({
    ordinary_materialization_atomic_write_plan:null,
    action_production_atomic_write_plans:[]}),{verifyApproval:approval});
  assert.equal(legacy.ok,true);
  assert.equal(legacy.plan.write_set_digest,computeSpatialV3CanonicalDigest({
    inserts:legacy.plan.inserts,updates:legacy.plan.updates,
    appends:legacy.plan.appends,deletes:legacy.plan.deletes}));
  assert.equal(Object.hasOwn(legacy.plan,
    'action_production_atomic_write_plans'),false);
  const ordinary=batchInput({masses:[80]});
  const sealed=await buildCombinedWritePlan(input({
    ordinary_materialization_atomic_write_plan:ordinary}),
  {verifyApproval:approval});
  assert.equal(sealed.ok,true);
  assert.deepEqual(sealed.plan.ordinary_materialization_atomic_write_plan,
    ordinary);
  assert.notEqual(sealed.plan.write_set_digest,legacy.plan.write_set_digest);
  const mutable=structuredClone(ordinary);
  const originalDigest=mutable.write_plan_digest;
  const detached=await buildCombinedWritePlan(input({
    ordinary_materialization_atomic_write_plan:mutable}),{
    verifyApproval:async()=>{mutable.write_plan_digest='forged';return {ok:true};}});
  assert.equal(detached.ok,true);
  assert.equal(detached.plan.ordinary_materialization_atomic_write_plan
    .write_plan_digest,originalDigest);

  let actionReads=0,actionApprovals=0;
  const actionAccessor=input();
  Object.defineProperty(actionAccessor,'action_production_atomic_write_plans',{
    enumerable:true,get(){actionReads+=1;return [{}];}});
  const actionRejected=await buildCombinedWritePlan(actionAccessor,{
    verifyApproval:async()=>{actionApprovals+=1;return {ok:true};}});
  assert.equal(actionRejected.error.code,'generated_schema_mismatch');
  assert.equal(actionReads,0);
  assert.equal(actionApprovals,0);
});

test('P16 admits one exact non-versioned party position update without a fabricated state version', async () => {
  const positionWrite = {
    target_table: 'party_positions',
    id: 'p',
    record: {
      party_id: 'p',
      g4_id: 'g4-camp',
      g5_node_id: 'g5-camp',
      g5_anchor_id: 'anchor-camp',
      updated_at: '2030-01-01T00:00:00.000Z'
    }
  };
  const approved_write_sets = [{
    inserts: [],
    updates: [positionWrite],
    appends: [{
      target_table: 'party_v3_change_sets',
      id: 'cs',
      record: {
        id: 'cs',
        party_id: 'p',
        operation_kind: 'move',
        idempotency_record_id: 'idem'
      }
    }]
  }];
  const built = await buildCombinedWritePlan(input({
    lock_context: {
      owner_keys: [],
      execution_keys: [],
      g4_keys: [],
      physical_keys: [
        'party_runtime.party_v3_change_sets:cs',
        'party_runtime.party_route_plan_executions:e',
        'party_runtime.party_positions:p'
      ]
    },
    approved_write_sets
  }), { verifyApproval: approval });
  assert.equal(built.ok, true);
  assert.deepEqual(built.plan.expected_state_versions, []);

  const fabricatedVersion = await buildCombinedWritePlan(input({
    expected_state_versions: [{
      target_table: 'party_positions',
      id: 'p',
      state_version: 0
    }],
    lock_context: {
      owner_keys: [],
      execution_keys: [],
      g4_keys: [],
      physical_keys: [
        'party_runtime.party_v3_change_sets:cs',
        'party_runtime.party_route_plan_executions:e',
        'party_runtime.party_positions:p'
      ]
    },
    approved_write_sets
  }), { verifyApproval: approval });
  assert.equal(fabricatedVersion.ok, false);
  assert.equal(fabricatedVersion.error.code, 'state_version_conflict');
});

test('P16 committer locks ordered phases, rejects stale update before writes and never trusts foreign table', async () => {
  const built = await buildCombinedWritePlan(input({ expected_state_versions: [{ target_table: 'party_route_plan_executions', id: 'e', state_version: 2 }], approved_write_sets: [{ inserts: [], appends: [{ target_table: 'party_v3_change_sets', id: 'cs', record: { id: 'cs', party_id: 'p', operation_kind: 'move', idempotency_record_id: 'idem' } }], updates: [{ target_table: 'party_route_plan_executions', id: 'e', record: { id: 'e', party_id: 'p', status: 'active' } }] }] }), { verifyApproval: approval });
  const calls = []; const committer = createSpatialV3CombinedAtomicCommitter({ recheck: async () => ({ ok: true }), withTransaction: async (work) => work({ query: async (sql) => { calls.push(sql); if (sql.includes('party_command_idempotency') && sql.startsWith('SELECT')) return { rows: [] }; if (sql.startsWith('UPDATE party_runtime.') && sql.includes('party_route_plan_executions')) return { rowCount: 0, rows: [] }; return { rowCount: 1, rows: [] }; } }) });
  const result = await committer.commit({ plan: built.plan }); assert.equal(result.error.code, 'state_version_conflict'); assert.match(calls[0], /pg_advisory_xact_lock/);
});

test('P16 first-entry locks the prepared baseline scope before absence recheck and atomically admits G5/G6/position/location writes', async () => {
  const materializationScopeKey = 'party_runtime.party_scene_baselines:baseline-new';
  const inserts = [
    {
      target_table: 'party_g5_sites',
      id: 'g5-new',
      record: {
        id: 'g5-new', party_id: 'p', origin: 'generated',
        parent_g4_id: 'g4-existing', status: 'active'
      }
    },
    {
      target_table: 'party_scene_baselines',
      id: 'baseline-new',
      record: {
        id: 'baseline-new', party_id: 'p', host_kind: 'g5_site',
        host_id: 'g5-new', source_kind: 'generated_template',
        status: 'active'
      }
    },
    {
      target_table: 'party_g6_instances',
      id: 'g6-new',
      record: {
        id: 'g6-new', party_id: 'p', scene_baseline_id: 'baseline-new',
        scene_slot_key: 'entry', host_kind: 'g5_site', host_id: 'g5-new',
        status: 'active'
      }
    },
    {
      target_table: 'scene_position_nodes',
      id: 'position-new',
      record: {
        id: 'position-new', party_id: 'p', g6_instance_id: 'g6-new',
        template_slot_key: 'arrival', status: 'active'
      }
    }
  ];
  const location = {
    target_table: 'party_journey_locations',
    id: 'journey-location',
    record: {
      id: 'journey-location', party_id: 'p', owner_kind: 'actor',
      owner_id: 'actor-1', location_kind: 'scene',
      scene_position_id: 'position-new'
    }
  };
  const consumedClaim = {
    target_table: 'preparation_claims',
    id: 'preparation-claim-1',
    record: {
      id: 'preparation-claim-1',
      claim_status: 'consumed',
      terminal_change_set_id: 'cs'
    }
  };
  const physicalKeys = [
    'party_runtime.party_v3_change_sets:cs',
    ...inserts.map((write) => `party_runtime.${write.target_table}:${write.id}`),
    'party_runtime.party_journey_locations:journey-location',
    'party_runtime.preparation_claims:preparation-claim-1'
  ];
  const physicalRecheck = firstEntryPhysicalRecheck();
  const commitRechecks = ['physical', 'state', 'pin', 'endpoint', 'route', 'capacity', 'time', 'change_set']
    .map((kind) => ({
      kind,
      digest: `sha256:${digest}`,
      ...(kind === 'physical' ? physicalRecheck : {})
    }));
  const built = await buildCombinedWritePlan(input({
    operation_kind: 'first_entry',
    expected_state_versions: [{
      target_table: 'party_journey_locations',
      id: 'journey-location',
      state_version: 4
    }, {
      target_table: 'preparation_claims',
      id: 'preparation-claim-1',
      state_version: 1
    }],
    lock_context: {
      owner_keys: ['actor:actor-1'],
      execution_keys: ['route-execution-1'],
      g4_keys: ['p:g4-existing'],
      physical_keys: physicalKeys
    },
    commit_rechecks: commitRechecks,
    approved_write_sets: [{
      inserts,
      updates: [location, consumedClaim],
      appends: [{
        target_table: 'party_v3_change_sets',
        id: 'cs',
        record: {
          id: 'cs', party_id: 'p', operation_kind: 'first_entry',
          idempotency_record_id: 'idem'
        }
      }]
    }]
  }), { verifyApproval: approval });
  assert.equal(built.ok, true, JSON.stringify(built));

  const sceneTemplate = {
    entity_ref: { entity_kind: 'scene_template', entity_id: 'template-1' },
    authoring_version: '1'
  };
  const s1Inserts = structuredClone(inserts);
  s1Inserts.find(({ id }) => id === 'baseline-new').record.scene_template_ref = sceneTemplate;
  s1Inserts.find(({ id }) => id === 'g6-new').record.source_scene_template_ref = sceneTemplate;
  s1Inserts.push(
    {
      target_table: 'party_g6_instances', id: 'g6-slot',
      record: { id: 'g6-slot', party_id: 'p', scene_baseline_id: 'baseline-new',
        source_scene_template_ref: sceneTemplate, status: 'active' }
    },
    {
      target_table: 'scene_position_nodes', id: 'position-slot',
      record: { id: 'position-slot', party_id: 'p', g6_instance_id: 'g6-slot',
        status: 'active' }
    },
    ...['scene_movement_edges', 'visibility_links'].flatMap((target_table) => [
      {
        target_table, id: `${target_table}-out`,
        record: { id: `${target_table}-out`, party_id: 'p',
          scene_baseline_id: 'baseline-new', source_scene_template_ref: sceneTemplate,
          from_position_id: 'position-new', to_position_id: 'position-slot',
          [target_table === 'scene_movement_edges' ? 'reverse_edge_id' : 'reverse_link_id']:
            `${target_table}-back` }
      },
      {
        target_table, id: `${target_table}-back`,
        record: { id: `${target_table}-back`, party_id: 'p',
          scene_baseline_id: 'baseline-new', source_scene_template_ref: sceneTemplate,
          from_position_id: 'position-slot', to_position_id: 'position-new',
          [target_table === 'scene_movement_edges' ? 'reverse_edge_id' : 'reverse_link_id']:
            `${target_table}-out` }
      }
    ])
  );
  const buildS1 = (candidate) => buildCombinedWritePlan(input({
    operation_kind: 'first_entry',
    expected_state_versions: [
      { target_table: 'party_journey_locations', id: 'journey-location', state_version: 4 },
      { target_table: 'preparation_claims', id: 'preparation-claim-1', state_version: 1 }
    ],
    lock_context: {
      owner_keys: ['actor:actor-1'], execution_keys: ['route-execution-1'],
      g4_keys: ['p:g4-existing'],
      physical_keys: [
        'party_runtime.party_v3_change_sets:cs',
        ...candidate.map((write) => `party_runtime.${write.target_table}:${write.id}`),
        'party_runtime.party_journey_locations:journey-location',
        'party_runtime.preparation_claims:preparation-claim-1'
      ]
    },
    commit_rechecks: commitRechecks,
    approved_write_sets: [{
      inserts: candidate, updates: [location, consumedClaim],
      appends: [{ target_table: 'party_v3_change_sets', id: 'cs',
        record: { id: 'cs', party_id: 'p', operation_kind: 'first_entry',
          idempotency_record_id: 'idem' } }]
    }]
  }), { verifyApproval: approval });
  assert.equal((await buildS1(s1Inserts)).ok, true);
  const reorderedS1 = structuredClone(s1Inserts);
  for (const write of reorderedS1) {
    if (write.record.source_scene_template_ref) {
      write.record.source_scene_template_ref = { authoring_version: '1',
        entity_ref: { entity_id: 'template-1', entity_kind: 'scene_template' } };
    }
  }
  const reorderedS1Plan = await buildS1(reorderedS1);
  assert.equal(reorderedS1Plan.ok, true);
  assert.equal((await buildS1(s1Inserts.slice(0, -1))).error.code,
    'target_preparation_failed');
  const forgedS1 = structuredClone(s1Inserts);
  forgedS1.find(({ id }) => id === 'scene_movement_edges-back')
    .record.reverse_edge_id = 'forged';
  assert.equal((await buildS1(forgedS1)).error.code, 'target_preparation_failed');
  for (const ref of [
    { ...sceneTemplate, extra: true },
    { entity_ref: { entity_kind: 'scene_template' }, authoring_version: '1' },
    { ...sceneTemplate, authoring_version: '2' }
  ]) {
    const forged = structuredClone(s1Inserts);
    forged.find(({ id }) => id === 'g6-slot').record.source_scene_template_ref = ref;
    assert.equal((await buildS1(forged)).error.code, 'target_preparation_failed');
  }

  const calls = [];
  const committer = createSpatialV3CombinedAtomicCommitter({
    recheck: async ({ transaction, check }) => {
      calls.push(`recheck:${check.kind}`);
      if (check.kind === 'physical') {
        assert.equal(check.materialization_scope_key, materializationScopeKey);
        await transaction.query(
          `SELECT s.canonical_digest,m.member_digest,p.canonical_serialization_digest,
                  e.id,c.id
             FROM party_runtime.preparation_snapshots s
             JOIN party_runtime.preparation_snapshot_members m
               ON m.preparation_snapshot_id=s.id AND m.ordinal=$2
             JOIN party_runtime.party_route_plans p
               ON p.id=$3 AND p.preparation_snapshot_id=s.id
             JOIN party_runtime.party_route_plan_executions e
               ON e.id=$4 AND e.route_plan_id=p.id
             JOIN party_runtime.preparation_claims c
               ON c.id=$5 AND c.preparation_snapshot_id=s.id
              AND c.preparation_member_ordinal=m.ordinal
              AND c.route_plan_execution_id=e.id
            WHERE s.id=$1 AND c.claim_status='reserved'`,
          [
            check.preparation_snapshot_id,
            check.preparation_member_ordinal,
            check.route_plan_id,
            check.route_plan_execution_id,
            check.preparation_claim_id
          ]
        );
        return {
          ok: true,
          first_entry_binding: firstEntryEvidence(check)
        };
      }
      return { ok: true };
    },
    withTransaction: async (work) => work({
      query: async (sql, params = []) => {
        if (sql.includes('pg_advisory_xact_lock')) calls.push(`lock:${params[0]}`);
        else if (sql.includes('FROM party_runtime.preparation_snapshots')) calls.push('preparation-read');
        else if (sql.includes('party_command_idempotency') && sql.startsWith('SELECT')) return { rows: [] };
        else if ((sql.startsWith('INSERT INTO party_runtime.') || sql.startsWith('UPDATE party_runtime.'))
          && !sql.includes('party_command_idempotency')) calls.push('domain-write');
        return { rowCount: 1, rows: [] };
      }
    })
  });
  const committed = await committer.commit({ plan: reorderedS1Plan.plan });

  assert.equal(committed.ok, true, JSON.stringify(committed));
  const baselineLockIndex = calls.indexOf(`lock:05:physical:${materializationScopeKey}`);
  const baselineReadIndex = calls.indexOf('preparation-read');
  const firstWriteIndex = calls.indexOf('domain-write');
  assert.ok(baselineLockIndex >= 0);
  assert.ok(baselineReadIndex > baselineLockIndex);
  assert.ok(firstWriteIndex > baselineReadIndex);
  assert.ok(committed.lock_keys.includes('06:idempotency:p:first_entry:key'));
  assert.ok(!committed.lock_keys.includes('06:idempotency:idem'));

  const unrelatedBinding = firstEntryPhysicalRecheck({
    position_id: 'unrelated-position'
  });
  const rejected = await buildCombinedWritePlan(input({
    operation_kind: 'first_entry',
    expected_state_versions: [{
      target_table: 'party_journey_locations',
      id: 'journey-location',
      state_version: 4
    }, {
      target_table: 'preparation_claims',
      id: 'preparation-claim-1',
      state_version: 1
    }],
    lock_context: {
      owner_keys: ['actor:actor-1'],
      execution_keys: ['route-execution-1'],
      g4_keys: ['p:g4-existing'],
      physical_keys: physicalKeys
    },
    commit_rechecks: commitRechecks.map((check) => (
      check.kind === 'physical' ? unrelatedBinding : check
    )),
    approved_write_sets: [{
      inserts,
      updates: [location, consumedClaim],
      appends: [{
        target_table: 'party_v3_change_sets',
        id: 'cs',
        record: {
          id: 'cs', party_id: 'p', operation_kind: 'first_entry',
          idempotency_record_id: 'idem'
        }
      }]
    }]
  }), { verifyApproval: approval });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error.code, 'target_preparation_failed');

  const wrongG4Lock = await buildCombinedWritePlan(input({
    operation_kind: 'first_entry',
    expected_state_versions: [
      { target_table: 'party_journey_locations', id: 'journey-location', state_version: 4 },
      { target_table: 'preparation_claims', id: 'preparation-claim-1', state_version: 1 }
    ],
    lock_context: {
      owner_keys: ['actor:actor-1'],
      execution_keys: ['route-execution-1'],
      g4_keys: ['g4-existing'],
      physical_keys: physicalKeys
    },
    commit_rechecks: commitRechecks,
    approved_write_sets: [{
      inserts,
      updates: [location, consumedClaim],
      appends: [{
        target_table: 'party_v3_change_sets',
        id: 'cs',
        record: { id: 'cs', party_id: 'p', operation_kind: 'first_entry', idempotency_record_id: 'idem' }
      }]
    }]
  }), { verifyApproval: approval });
  assert.equal(wrongG4Lock.ok, false);
  assert.equal(wrongG4Lock.error.code, 'lock_order_violation');
});

test('P16 idempotency replay compares input and expected-version digests', async () => {
  const built = await buildCombinedWritePlan(input(), { verifyApproval: approval }); const committer = createSpatialV3CombinedAtomicCommitter({ recheck: async () => ({ ok: true }), withTransaction: async (work) => work({ query: async (sql) => sql.startsWith('SELECT') && sql.includes('idempotency') ? { rows: [{ canonical_input_digest: 'b'.repeat(64), expected_state_version_set_digest: digest, status: 'committed', result_change_set_id: 'old' }] } : { rows: [], rowCount: 1 } }) });
  assert.equal((await committer.commit({ plan: built.plan })).error.code, 'idempotency_conflict');
});

test('P16 sole-writer architecture forbids direct target-v3 party mutations outside CombinedAtomicCommitter', async () => {
  const source = await readFile(new URL('../../apps/game-server/src/infrastructure/postgres/spatial-v3-p23-domain-repository.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\b(?:INSERT|UPDATE|DELETE)\s+INTO?\s+party_runtime\.|\bUPDATE\s+party_runtime\./iu);
  assert.doesNotMatch(source, /\b(?:BEGIN|COMMIT|ROLLBACK)\b|pool\.connect\(/u);
  const committer = await readFile(new URL('../../apps/game-server/src/infrastructure/postgres/spatial-v3-combined-atomic-committer.js', import.meta.url), 'utf8');
  assert.match(committer, /createSpatialV3PostgresCombinedAtomicCommitter/u);
});
