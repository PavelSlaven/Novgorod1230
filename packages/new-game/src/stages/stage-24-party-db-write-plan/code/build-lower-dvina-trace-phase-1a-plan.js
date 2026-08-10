import {
  computeMaterializationEnvelopeDigest,
  STAGE24_PLAN_SCHEMA,
} from '@rus/contracts';
import { sha256 } from '@rus/kernel';
import {
  assertMaterializationRuntimeCatalogPins,
  assertPartyRuntimeCatalogPins,
  buildMaterializationRunCatalogPinRecord,
  buildPartyCatalogPinRecord
} from './runtime-catalog-pins.js';
import {
  buildLowerDvinaTracePersistedProjection
} from './lower-dvina-trace-persisted-projection.js';

export function buildLowerDvinaTracePhase1AWritePlan(input = {}) {
  assertInput(input);
  const request_id = input.request_id;
  const party_creation_context = input.party_creation_context;
  const pins = party_creation_context.version_pins;
  const domainPin = party_creation_context.domain_catalog_pin;
  const result = input.approved_pipeline_outputs.materialization_result;
  const semantic_validation = input.approved_pipeline_outputs.player_character_audit;
  const sealedClosure = input.approved_pipeline_outputs.sealed_selection_closure;
  const partyId = result.party_id;
  const player = result.immediate.player;
  const playerId = player.instance_id;
  const runId = result.run_id;
  const { preparedScenes, preparedNpcs, preparedContainers } = phase3PreparedInputs(result);
  const changeSetId = `change_${sha256([partyId, runId, 'phase_1a']).slice(0, 24)}`;
  const sourceTrace = [{
    source_id: result.request_identity.scenario_id,
    source_kind: 'lower_dvina_trace_phase_1a_materialization',
    digest: result.trace.result_digest
  }];
  assertPartyRuntimeCatalogPins(party_creation_context);
  assertMaterializationRuntimeCatalogPins({ trace: result.trace, pins, domainPin });
  const runRecord = {
    party_id: partyId,
    run_id: runId,
    g4_id: result.immediate.spatial.position.g4_id,
    run_kind: 'baseline',
    occurrence: result.request_identity.occurrence,
    seed_digest: result.trace.seed_digest,
    input_digest: result.trace.input_digest,
    catalog_digest: result.trace.catalog_digest,
    materializer_version: result.request_identity.materializer_version,
    rng_version: result.request_identity.rng_algorithm_id,
    result_digest: result.trace.result_digest,
    supersedes_run_id: null,
    repair_reason: null,
    idempotency_key: result.request_identity.idempotency_key,
    status: 'committed',
    validation_report: { materialization: result.validation_report, semantic: semantic_validation },
    trace: result.trace,
    created_refs: [
      { domain: 'player_character', instance_id: playerId },
      { domain: 'g5_node', instance_id: result.immediate.spatial.node.instance_id },
      { domain: 'g5_anchor', instance_id: result.immediate.spatial.anchor.instance_id },
      ...preparedScenes.flatMap((scene) => [
        { domain: 'g5_node', instance_id: scene.node.instance_id },
        { domain: 'g5_anchor', instance_id: scene.anchor.instance_id }
      ]),
      ...preparedNpcs.map((npc) => ({ domain: 'npc', instance_id: npc.instance_id })),
      ...preparedContainers.map((container) => ({ domain: 'container', instance_id: container.instance_id })),
      ...result.immediate.items.map((item) => ({ domain: 'item', instance_id: item.instance_id }))
    ]
  };
  const choiceRecords = result.trace.choices.map((choice) => ({
    party_id: partyId,
    run_id: runId,
    choice_ordinal: choice.choice_ordinal,
    slot_key: choice.slot_key,
    candidate_set_digest: choice.candidate_set_digest,
    candidate_ids: choice.candidate_ids,
    selected_id: choice.selected_id,
    rng_draw: choice.rng_draw
  }));
  const batches = [];
  addBatch(batches, 'parties', [{
    party_id: partyId,
    schema_version: 3,
    world_revision_id: result.request_identity.world_revision_id,
    world_catalog_digest: result.request_identity.world_catalog_digest,
    materializer_version: result.request_identity.materializer_version,
    rng_version: result.request_identity.rng_algorithm_id,
    command_catalog_digest: result.request_identity.scenario_manifest_digest,
    profile_bundle_digest: sha256(result.policy_profile_pins),
    state_version: 0,
    status: 'active'
  }], [], sourceTrace);
  addBatch(
    batches,
    'party_catalog_pins',
    [buildPartyCatalogPinRecord(partyId, domainPin)],
    ['parties'],
    sourceTrace
  );
  addBatch(batches, 'party_v3_change_sets', [{
    id: changeSetId,
    party_id: partyId,
    operation_kind: 'new_game',
    expected_state_version_set_digest: sha256([]),
    expected_state_version_set: [],
    committed_state_version_set_digest: sha256([{ party_id: partyId, state_version: 0 }]),
    write_plan_digest: result.trace.result_digest,
    parent_change_set_id: null,
    created_at_turn: 0,
    committed_at_turn: 0
  }], ['parties'], sourceTrace);
  addBatch(batches, 'party_materialization_runs', [runRecord], ['parties'], sourceTrace);
  addBatch(
    batches,
    'party_materialization_run_catalog_pins',
    [buildMaterializationRunCatalogPinRecord({ partyId, runId, domainPin })],
    ['party_catalog_pins', 'party_materialization_runs'],
    sourceTrace
  );
  addBatch(batches, 'party_materialization_choices', choiceRecords, ['party_materialization_runs'], sourceTrace);
  addBatch(batches, 'party_g5_nodes', [{
    party_id: partyId,
    g5_node_id: result.immediate.spatial.node.instance_id,
    run_id: runId,
    parent_g4_id: result.immediate.spatial.node.parent_g4_id,
    template_id: result.immediate.spatial.node.template_id,
    slot_key: result.immediate.spatial.node.slot_key,
    state: result.immediate.spatial.node.state
  }, ...preparedScenes.map((scene) => ({
    party_id: partyId,
    g5_node_id: scene.node.instance_id,
    run_id: runId,
    parent_g4_id: scene.node.parent_g4_id,
    template_id: scene.node.template_id,
    slot_key: scene.node.slot_key,
    state: scene.node.state
  }))], ['party_materialization_runs'], sourceTrace);
  addBatch(batches, 'party_g5_anchors', [{
    party_id: partyId,
    anchor_id: result.immediate.spatial.anchor.instance_id,
    g5_node_id: result.immediate.spatial.anchor.node_id,
    template_id: result.immediate.spatial.anchor.template_id,
    slot_key: result.immediate.spatial.anchor.slot_key,
    npc_capacity: result.immediate.spatial.anchor.npc_capacity,
    item_capacity: result.immediate.spatial.anchor.item_capacity,
    container_capacity: result.immediate.spatial.anchor.container_capacity,
    state: result.immediate.spatial.anchor.state
  }, ...preparedScenes.map((scene) => ({
    party_id: partyId,
    anchor_id: scene.anchor.instance_id,
    g5_node_id: scene.anchor.node_id,
    template_id: scene.anchor.template_id,
    slot_key: scene.anchor.slot_key,
    npc_capacity: scene.anchor.npc_capacity,
    item_capacity: scene.anchor.item_capacity,
    container_capacity: scene.anchor.container_capacity,
    state: scene.anchor.state
  }))], ['party_g5_nodes'], sourceTrace);
  addBatch(batches, 'party_npcs', preparedNpcs.map((npc) => ({
    party_id: partyId,
    npc_id: npc.instance_id,
    run_id: runId,
    profile_set_id: npc.profile_id,
    profile_level: npc.profile_level,
    anchor_id: npc.anchor_id,
    identity_state: npc.identity_state,
    machine_state: npc.machine_state,
    semantic_state: {
      ...npc.semantic_state,
      participant_slot_ref: npc.participant_slot_ref,
      location_profile_ref: npc.location_profile_ref,
      zone_ref: npc.zone_ref,
      profile_revision: npc.profile_revision,
      profile_record_digest: npc.profile_record_digest
    }
  })), ['party_materialization_runs', 'party_g5_anchors'], sourceTrace);
  addBatch(batches, 'party_containers', preparedContainers.map((container) => ({
    party_id: partyId,
    container_id: container.instance_id,
    run_id: runId,
    template_id: container.template_id,
    anchor_id: container.anchor_id ?? null,
    parent_container_id: null,
    holder_npc_id: container.holder_npc_id ?? null,
    holder_character_id: null,
    physical_position: null,
    equipment_slot_category_id: null,
    condition_state: container.state?.physical_condition?.overall ?? null,
    closure_state: container.closure_state,
    state: {
      ...structuredClone(container.state),
      owner_external_ref: container.owner_external_ref,
      controller_npc_id: container.controller_npc_id
    }
  })), ['party_materialization_runs', 'party_npcs'], sourceTrace);
  addBatch(batches, 'party_positions', [{
    party_id: partyId,
    g4_id: result.immediate.spatial.position.g4_id,
    g5_node_id: result.immediate.spatial.position.g5_node_id,
    g5_anchor_id: result.immediate.spatial.position.g5_anchor_id
  }], ['party_g5_anchors'], sourceTrace);
  addBatch(batches, 'party_player_characters', [{
    party_id: partyId,
    character_id: playerId,
    profile: player.dossier
  }], ['parties'], sourceTrace);
  addBatch(batches, 'party_actor_profile_bindings', [{
    party_id: partyId,
    actor_kind: 'player_character',
    actor_id: playerId,
    role_ref: { id: player.dossier.social_status.social_role_id, source: 'approved_scenario_profile' },
    occupation_ref: { id: player.dossier.social_status.occupation_id, source: 'approved_scenario_profile' },
    skill_profile_snapshot: player.dossier.skills,
    name_profile_snapshot: player.dossier.identity,
    language_profile_snapshot: {},
    knowledge_profile_snapshot: player.dossier.knowledge,
    profile_candidate_set_digest: result.trace.choices.find((choice) => choice.choice_key === 'player_profile').candidate_set_digest,
    state_version: 1,
    created_change_set_id: changeSetId,
    updated_change_set_id: changeSetId
  }, ...preparedNpcs.map((npc) => ({
    party_id: partyId,
    actor_kind: 'npc',
    actor_id: npc.instance_id,
    role_ref: npc.role_ref,
    occupation_ref: npc.occupation_ref,
    skill_profile_snapshot: {},
    name_profile_snapshot: npc.identity_state,
    language_profile_snapshot: {},
    knowledge_profile_snapshot: npc.knowledge_profile_snapshot,
    profile_candidate_set_digest: npc.profile_candidate_set_digest,
    state_version: 1,
    created_change_set_id: changeSetId,
    updated_change_set_id: changeSetId
  }))], ['party_player_characters', 'party_npcs', 'party_v3_change_sets'], sourceTrace);
  addBatch(batches, 'party_actor_body_states', [{
    party_id: partyId,
    actor_kind: 'player_character',
    actor_id: playerId,
    body_profile_ref: {
      id: result.immediate.body.profile_id,
      schema: result.immediate.body.schema,
      revision: result.immediate.body.version,
      digest: result.immediate.body.record_digest
    },
    health: result.immediate.body.values.health,
    energy: result.immediate.body.values.energy,
    satiety: result.immediate.body.values.satiety,
    state_version: 1,
    updated_change_set_id: changeSetId
  }], ['party_player_characters', 'party_v3_change_sets'], sourceTrace);
  addBatch(batches, 'party_actor_active_conditions', result.immediate.body.condition_bindings.map((condition) => ({
    party_id: partyId,
    actor_kind: 'player_character',
    actor_id: playerId,
    condition_id: `condition_${sha256([partyId, playerId, condition.state]).slice(0, 24)}`,
    condition_profile_ref: condition,
    status: 'active',
    state_version: 1,
    created_change_set_id: changeSetId,
    terminal_change_set_id: null
  })), ['party_actor_body_states', 'party_v3_change_sets'], sourceTrace);
  addBatch(batches, 'party_items', result.immediate.items.map((item) => ({
    party_id: partyId,
    item_id: item.instance_id,
    run_id: runId,
    template_id: item.template_id,
    profile_id: item.profile_id,
    category_id: item.category_id,
    quantity: item.quantity,
    condition_state: item.condition_state,
    legal_status: item.legal_status,
    state: item.state
  })), ['party_materialization_runs'], sourceTrace);
  addBatch(batches, 'party_item_placements', result.immediate.items.map((item) => ({
    party_id: partyId,
    item_id: item.instance_id,
    anchor_id: item.anchor_id ?? null,
    container_id: null,
    holder_npc_id: item.holder_npc_id ?? null,
    holder_character_id: item.holder_character_id ?? null,
    physical_position: item.physical_position,
    equipment_slot_category_id: null
  })), ['party_items', 'party_player_characters', 'party_npcs', 'party_g5_anchors'], sourceTrace);
  addBatch(batches, 'party_ownership', result.immediate.items.map((item) => ({
    party_id: partyId,
    ownership_id: `ownership_${item.instance_id}`,
    item_id: item.instance_id,
    container_id: null,
    owner_npc_id: item.owner_npc_id ?? null,
    owner_character_id: item.owner_character_id ?? null,
    owner_party: false,
    owner_external_ref: null,
    controller_npc_id: item.controller_npc_id ?? null,
    controller_character_id: item.controller_character_id ?? null,
    claim_state: item.claim_state
  })), ['party_items', 'party_player_characters', 'party_npcs'], sourceTrace);
  addBatch(batches, 'party_obligations', (result.immediate.promise_instances ?? []).map(
    (promise) => ({
      obligation_id: promise.instance_id,
      party_id: partyId,
      policy_ref: promise.policy_ref,
      policy_version: String(promise.policy_ref.revision),
      promisor_ref: {
        entity_kind: 'player_character',
        entity_id: promise.promisor_actor_id
      },
      beneficiary_ref: {
        entity_kind: 'npc',
        entity_id: promise.beneficiary_actor_id
      },
      witness_refs: promise.witness_actor_ids.map((actorId) => ({
        entity_kind: 'npc',
        entity_id: actorId
      })),
      scope_snapshot: promise.scope_snapshot,
      current_state: promise.current_state,
      current_state_fact: promise.current_state_fact,
      state_version: promise.state_version,
      created_change_set_id: changeSetId,
      last_change_set_id: changeSetId
    })
  ), ['party_player_characters', 'party_npcs', 'party_v3_change_sets'], sourceTrace);
  addBatch(batches, 'party_clocks', [{
    party_id: partyId,
    whole_minutes: Number(result.immediate.timestamp.whole_minutes),
    subminute_numerator: Number(result.immediate.timestamp.subminute_numerator),
    subminute_denominator: Number(result.immediate.timestamp.subminute_denominator),
    clock_owner_kind: 'party',
    clock_owner_id: null,
    state_version: 1,
    updated_change_set_id: changeSetId
  }], ['parties', 'party_v3_change_sets'], sourceTrace);
  const persistedProjection = buildLowerDvinaTracePersistedProjection({
    result,
    changeSetId,
    runRecord,
    choiceRecords
  });
  const snapshotPayload = {
    schema: 'rus.lower_dvina_trace_initial_party_snapshot.v2',
    version: 2,
    request_identity: result.request_identity,
    immediate: result.immediate,
    hidden_truth: result.hidden_truth,
    sealed_selections: result.sealed_selections,
    policy_profile_pins: result.policy_profile_pins,
    materialization_trace: result.trace,
    semantic_validation,
    persisted_projection: persistedProjection,
    persisted_projection_digest: sha256(persistedProjection)
  };
  addBatch(batches, 'party_state_snapshots', [{
    party_id: partyId,
    state_version: 0,
    state_payload: snapshotPayload,
    state_digest: sha256(snapshotPayload)
  }], ['parties', 'party_materialization_runs'], sourceTrace);

  const writeOrder = batches.map((batch) => batch.batch_id);
  const plan = {
    version: 1,
    schema: STAGE24_PLAN_SCHEMA,
    request_id,
    plan_status: 'formed',
    source_input_digest: input.party_db_write_plan_input_digest,
    party_database_schema_digest: input.party_database_schema_digest,
    world_base_reference_digest: input.world_base_reference_digest,
    approved_pipeline_manifest_digest: input.approved_pipeline_manifest_digest,
    transaction: {
      transaction_id: `tx_${sha256([partyId, request_id]).slice(0, 24)}`,
      party_id: partyId,
      idempotency_key: party_creation_context.idempotency_key,
      rollback_strategy: 'full_transaction_rollback',
      is_atomic: true,
      is_dry_run_first: true,
      write_order: writeOrder
    },
    preconditions: [{ check: 'phase_1a_materialization_validated' }, { check: 'stage_11_12_semantic_validation_passed' }],
    write_batches: batches,
    postconditions: [{ check: 'phase_1a_internal_round_trip' }, { check: 'no_visible_projection_created' }],
    forbidden_writes: ['world_base mutation forbidden', 'hidden state to public tables forbidden', 'API/UI publication forbidden'],
    derived_indexes: [],
    audit_snapshots: [
      { stage_id: 12, digest: sha256(semantic_validation), pass: true },
      { stage_id: 13, digest: sha256(sealedClosure), pass: true }
    ],
    rollback_plan: { strategy: 'full_transaction_rollback', covered_batch_ids: writeOrder },
    source_trace: sourceTrace,
    knowledge_projection_validation: { source_content_hash: sha256([]), expected_counts: {}, expected_record_keys: [], planned_counts: {}, planned_record_keys: [] },
    self_audit: { pass: true, concerns: [], evidence: ['Phase 1A plan is code-owned, atomic, internal and contains no player-visible write.'] }
  };
  return plan;
}

function addBatch(batches, table, records, dependencies, sourceTrace) {
  if (records.length === 0) return;
  batches.push({
    batch_id: `batch-${table}`,
    order: batches.length + 1,
    target_table: table,
    operation_mode: 'insert_only',
    depends_on_batches: dependencies.filter((dependency) => batches.some((batch) => batch.target_table === dependency)).map((dependency) => `batch-${dependency}`),
    records,
    source_trace: sourceTrace
  });
}

function phase3PreparedInputs(result) {
  if (![8, 9, 10, 11, 12, 13, 14, 15, 16].includes(
    result.request_identity.scenario_definition_revision
  )) {
    return { preparedScenes: [], preparedNpcs: [], preparedContainers: [] };
  }
  const preparedScenes = result.immediate.prepared_scenes;
  const preparedNpcs = result.immediate.npcs;
  const preparedContainers = result.immediate.containers ?? [];
  const phase4 = [10, 11, 12, 13, 14].includes(
    result.request_identity.scenario_definition_revision
  );
  const phase7 = [15, 16].includes(
    result.request_identity.scenario_definition_revision
  );
  if (!Array.isArray(preparedScenes)
    || preparedScenes.length !== (phase7 ? 3 : phase4 ? 2 : 1)
    || !Array.isArray(preparedNpcs)
    || preparedNpcs.length !== (phase7 ? 6 : phase4 ? 5 : 3)
    || !Array.isArray(preparedContainers)
    || preparedContainers.length !== (phase7 ? 1 : 0)) {
    const error = new Error(
      'Lower Dvina trace prepared scene and NPC inventory is incomplete.'
    );
    error.code = 'LOWER_DVINA_TRACE_PHASE_3_PREPARED_STATE_INVALID';
    throw error;
  }
  return { preparedScenes, preparedNpcs, preparedContainers };
}

function assertInput(input) {
  const result = input?.approved_pipeline_outputs?.materialization_result;
  const semantic = input?.approved_pipeline_outputs?.player_character_audit;
  if (!input?.request_id || !input.party_creation_context?.idempotency_key || result?.validation_report?.pass !== true
    || semantic?.pass !== true || result?.party_id !== input.party_creation_context.party_id
    || result?.trace?.result_digest !== computeMaterializationEnvelopeDigest(result)
    || input.party_db_write_plan_input_digest == null) {
    const error = new Error('Lower Dvina trace Phase 1A requires one validated materialization result bound to the party.');
    error.code = 'LOWER_DVINA_TRACE_PHASE_1A_PLAN_INPUT_INVALID';
    throw error;
  }
}
