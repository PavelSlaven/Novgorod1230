import {
  buildStage24Input,
  buildApprovedPipelineManifest,
  computePartyDbWritePlanDigest,
  computeStage24Digest,
  STAGE24_AUDIT_SCHEMA,
  STAGE24_PLAN_SCHEMA
} from '@rus/new-game/stages/stage-24/compat';

const AUDIT_KEYS = [
  'start_place_audit','player_character_audit','g5_scene_audit','npc_placement_audit',
  'item_placement_audit','time_light_consistency_audit','character_knowledge_map_audit',
  'full_hidden_state_audit','visible_context_audit_approval','narrator_prose_audit_approval'
];
const REQUIRED_CHECKS = [
  'plan_schema','transaction_atomicity','database_schema_compliance','write_order','dependency_graph',
  'approved_entities_only','npc_projection','item_container_projection','position_projection','g5_projection',
  'knowledge_projection','hidden_visible_boundary','narrator_output_projection','source_trace',
  'audit_snapshots','forbidden_writes','world_base_immutability','rollback_completeness','idempotency','commit_readiness'
];

export function makeStage24Fixture() {
  const requestId = 'req-stage24-001';
  const partyId = 'party-stage24-001';
  const playerId = 'pc-stage24-001';
  const anchorId = 'anchor-stage24-001';
  const position = {
    region_id: 'region-stage24-001',
    place_id: 'place-stage24-001',
    location_id: 'location-stage24-001',
    minilocation_id: 'mini-stage24-001',
    anchor_id: anchorId
  };
  const narrator = {
    version: 1,
    schema: 'narrator_starting_prose',
    request_id: requestId,
    prose: 'Начальная сцена.'
  };
  const knowledgeManifest = {
    source_content_hash: computeStage24Digest({ knowledge: requestId }),
    expected_counts: { facts: 0 },
    expected_record_keys: []
  };
  const approvedPipelineOutputs = {
    historical_frame: { version: 1, schema: 'historical_frame', request_id: requestId },
    weather_state: { version: 1, schema: 'weather_state', request_id: requestId },
    selected_start_node: { version: 1, schema: 'selected_start_node', request_id: requestId, selected_node_chain: { g4_node_id: position.location_id } },
    start_place_audit: { version: 1, schema: 'start_place_audit', request_id: requestId, pass: true },
    player_character: { version: 1, schema: 'player_character', request_id: requestId, player_character_id: playerId },
    player_character_audit: { version: 1, schema: 'player_character_audit', request_id: requestId, pass: true },
    g5_scene_graph: {
      version: 1, schema: 'g5_scene_graph', request_id: requestId,
      parent_location: { g4_node_id: position.location_id },
      player_start_position: position,
      g5_minilocations: [{ g5_minilocation_id: position.minilocation_id, parent_g4_node_id: position.location_id, template_id: 'g5-node-template-1', slot_key: 'main', state: {}, access: { access_state: 'open' }, visibility: { visibility_default: 'visible' } }],
      g5_anchors: [{ anchor_id: anchorId, minilocation_id: position.minilocation_id, anchor_template_id: 'g5-anchor-template-1', slot_key: 'entry', supports: { npc_capacity: 1, item_capacity: 2, container_capacity: 1 }, visibility: { visibility_default: 'visible' }, access: { access_state: 'open' } }],
      g5_edges: [], validation_report: { pass: true },
      materialization_run: { run_id: 'baseline-stage24-001', run_kind: 'baseline', occurrence: 0, world_revision_id: 'revision-1', seed_digest: 'seed-stage24-001', input_digest: 'input-stage24-001', catalog_digest: 'domain-catalog-digest', result_digest: 'result-stage24-001', materializer_version: 'code_materializer_v2', rng_version: 'mulberry32_v1', idempotency_key: 'materialization:party-stage24-001:baseline-stage24-001', seed_context: { party_id: partyId, g4_id: position.location_id }, choices: [], created_refs: [] }
    },
    g5_scene_audit: { version: 1, schema: 'g5_scene_audit', request_id: requestId, pass: true },
    initial_npc_placement: { version: 1, schema: 'initial_npc_placement', request_id: requestId, npcs: [] },
    npc_placement_audit: { version: 1, schema: 'npc_placement_audit', request_id: requestId, pass: true },
    initial_item_placement: { version: 1, schema: 'initial_item_placement', request_id: requestId, items: [], containers: [] },
    item_placement_audit: { version: 1, schema: 'item_placement_audit', request_id: requestId, pass: true },
    time_light_consistency_audit: { version: 1, schema: 'time_light_consistency_audit', request_id: requestId, pass: true },
    character_knowledge_map: { version: 1, schema: 'character_knowledge_map', request_id: requestId, current_position_ref: position },
    character_knowledge_map_audit: { version: 1, schema: 'character_knowledge_map_audit', request_id: requestId, pass: true },
    character_knowledge_write_projection: { version: 1, schema: 'character_knowledge_write_projection', request_id: requestId, projection_manifest: knowledgeManifest },
    full_hidden_scene_state: { version: 1, schema: 'full_hidden_scene_state', request_id: requestId },
    full_hidden_state_audit: { version: 1, schema: 'full_hidden_state_audit', request_id: requestId, pass: true },
    visible_context_package: { version: 1, schema: 'visible_context_package', request_id: requestId, frame: { position } },
    visible_context_audit_approval: { version: 1, schema: 'visible_context_audit_approval', request_id: requestId, pass: true },
    narrator_starting_prose: narrator,
    narrator_prose_audit_approval: {
      version: 1,
      schema: 'narrator_prose_audit_approval',
      request_id: requestId,
      pass: true,
      narrator_starting_prose_digest: computeStage24Digest(narrator)
    }
  };
  for (const key of AUDIT_KEYS) approvedPipelineOutputs[key].pass = true;

  const partyDatabaseSchema = {
    version: 1,
    schema: 'party_database_schema_snapshot',
    schema_version: 'party_runtime_v2',
    readonly_checksum: 'schema-stage24-checksum',
    tables: [{
      name: 'party_state',
      allowed_operations: ['upsert_with_idempotency'],
      columns: [
        { name: 'party_id', nullable: false },
        { name: 'player_character_id', nullable: false },
        { name: 'region_id', nullable: false },
        { name: 'place_id', nullable: false },
        { name: 'location_id', nullable: false },
        { name: 'minilocation_id', nullable: false },
        { name: 'anchor_id', nullable: false },
        { name: 'source_trace', nullable: false }
      ]
    }],
    foreign_keys: [], unique_constraints: [], check_constraints: [], enum_definitions: [], indexes: [],
    allowed_operations: ['upsert_with_idempotency']
  };
  const worldBaseReferenceSnapshot = {
    version: 1,
    schema: 'world_base_reference_snapshot',
    readonly_checksum: 'world-stage24-checksum',
    allowed_region_ids: [position.region_id],
    allowed_graph_node_ids: [anchorId],
    allowed_graph_edge_ids: [],
    allowed_place_template_ids: [],
    allowed_npc_candidate_ids: [],
    allowed_item_profile_ids: [],
    allowed_container_profile_ids: [],
    allowed_property_rule_ids: [],
    allowed_source_ids: ['fixture-source-stage24']
  };
  const partyCreationContext = {
    party_id: partyId,
    player_character_id: playerId,
    idempotency_key: 'idem-stage24-001',
    schema_version: 'party_runtime_v2',
    version_pins: { world_revision_id: 'revision-1', world_catalog_digest: 'catalog-digest', materializer_version: 'code_materializer_v2', rng_version: 'mulberry32_v1', command_catalog_digest: 'command-digest', profile_bundle_digest: 'profile-digest' },
    domain_catalog_pin: {
      schema: 'rus.runtime_catalog_pin.v2',
      catalog_scope: 'item_container_materialization_v2',
      catalog_revision_id: 'domain-revision-2',
      catalog_digest: 'domain-catalog-digest',
      import_id: 'import-2',
      import_audit_digest: 'import-audit-digest',
      record_registry_digest: 'registry-digest',
      runtime_contract_digest: 'runtime-contract-digest',
      compatible_world_revision_id: 'revision-1',
      compatible_world_catalog_digest: 'catalog-digest',
      compatible_world_pin_manifest_digest: 'world-pin-manifest-digest',
      activation_event_id: 'activation-2'
    }
  };
  const approvedPipelineManifest = buildApprovedPipelineManifest({ request_id: requestId, artifacts: approvedPipelineOutputs });
  const inputArgs = {
    request_id: requestId,
    party_creation_context: partyCreationContext,
    approved_pipeline_outputs: approvedPipelineOutputs,
    approved_pipeline_manifest: approvedPipelineManifest,
    party_database_schema: partyDatabaseSchema,
    world_base_reference_snapshot: worldBaseReferenceSnapshot
  };
  const input = buildStage24Input(inputArgs);
  const sourceTrace = [{ source_id: 'fixture-source-stage24' }];
  const plan = {
    version: 1,
    schema: STAGE24_PLAN_SCHEMA,
    request_id: requestId,
    plan_status: 'formed',
    source_input_digest: input.party_db_write_plan_input_digest,
    party_database_schema_digest: input.party_database_schema_digest,
    world_base_reference_digest: input.world_base_reference_digest,
    approved_pipeline_manifest_digest: input.approved_pipeline_manifest_digest,
    transaction: {
      transaction_id: 'tx-stage24-001',
      party_id: partyId,
      idempotency_key: partyCreationContext.idempotency_key,
      rollback_strategy: 'full_transaction_rollback',
      is_atomic: true,
      is_dry_run_first: true,
      write_order: ['batch-party-state']
    },
    preconditions: [{ check: 'all_approvals_passed' }],
    write_batches: [{
      batch_id: 'batch-party-state',
      order: 1,
      target_table: 'party_state',
      operation_mode: 'upsert_with_idempotency',
      depends_on_batches: [],
      records: [{ party_id: partyId, player_character_id: playerId, ...position, source_trace: sourceTrace }],
      source_trace: sourceTrace
    }],
    postconditions: [{ check: 'party_ready' }],
    forbidden_writes: ['world_base mutation forbidden', 'hidden data to public tables forbidden'],
    derived_indexes: [],
    audit_snapshots: [10,12,14,15,16,17,18,19,21,23].map((stage_id) => ({ stage_id, pass: true })),
    rollback_plan: { strategy: 'full_transaction_rollback', covered_batch_ids: ['batch-party-state'] },
    source_trace: sourceTrace,
    knowledge_projection_validation: {
      source_content_hash: knowledgeManifest.source_content_hash,
      expected_counts: knowledgeManifest.expected_counts,
      expected_record_keys: knowledgeManifest.expected_record_keys,
      planned_counts: knowledgeManifest.expected_counts,
      planned_record_keys: knowledgeManifest.expected_record_keys
    },
    self_audit: { pass: true, concerns: [], evidence: ['fixture checked'] }
  };
  const planDigest = computePartyDbWritePlanDigest(plan);
  const audit = {
    version: 1,
    schema: STAGE24_AUDIT_SCHEMA,
    request_id: requestId,
    party_db_write_plan_digest: planDigest,
    pass: true,
    checks: Object.fromEntries(REQUIRED_CHECKS.map((key) => [key, { pass: true }])),
    concerns: [],
    evidence: ['write plan approved'],
    proposed_repair_route: null,
    commit_permission: { can_send_to_commit_gate: true, can_execute_transaction: true, can_write_party_snapshots: true }
  };
  const executors = {
    builder: async () => structuredClone(plan),
    planFormatRepairer: async () => structuredClone(plan),
    auditor: async () => structuredClone(audit),
    auditFormatRepairer: async () => structuredClone(audit),
    router: async () => ({ version: 1, schema: 'party_db_write_plan_repair_route', request_id: requestId }),
    semanticRepairer: async () => structuredClone(plan),
    seniorSemanticRepairer: async () => structuredClone(plan),
    seniorBuilder: async () => structuredClone(plan),
    seniorAuditor: async () => structuredClone(audit)
  };
  return {
    requestId, partyId, playerId, anchorId, position, approvedPipelineOutputs, partyDatabaseSchema,
    worldBaseReferenceSnapshot, partyCreationContext, approvedPipelineManifest, inputArgs, input, plan, audit, executors
  };
}
