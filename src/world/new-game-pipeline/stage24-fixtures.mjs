import {
  buildApprovedPipelineManifest,
  buildStage24Input,
  computePartyDbWritePlanDigest,
  computeStage24Digest
} from '../src/world/new-game-pipeline/stages/stage24-party-db-write-plan.js';

export const REQUEST_ID = 'req-24';
export const PARTY_ID = 'party-24';
export const PC_ID = 'pc-24';

export function makeArtifacts() {
  const position = { region_id: 'region-1', place_id: 'place-1', location_id: 'location-1', minilocation_id: 'mini-1', anchor_id: 'anchor-1' };
  const passAudit = (schema) => ({ version: 1, schema, request_id: REQUEST_ID, pass: true, concerns: [], evidence: ['approved'] });
  const visible = { version: 1, schema: 'visible_context_package', request_id: REQUEST_ID, frame: { position } };
  const prose = { version: 1, schema: 'narrator_starting_prose', request_id: REQUEST_ID, prose_status: 'drafted', prose: 'Ты стоишь у ворот.', action_options: [], used_visible_context_refs: [] };
  return {
    historical_frame: { version: 1, schema: 'historical_frame', request_id: REQUEST_ID, region: { region_id: 'region-1' } },
    weather_state: { version: 1, schema: 'weather_state', request_id: REQUEST_ID, weather_id: 'weather-1' },
    selected_start_node: { version: 1, schema: 'selected_start_node', request_id: REQUEST_ID, selected_candidate_id: 'node-1' },
    start_place_audit: passAudit('start_place_audit'),
    player_character: { version: 1, schema: 'player_character_game_profile', request_id: REQUEST_ID, player_character_id: PC_ID },
    player_character_audit: passAudit('player_character_audit'),
    g5_scene_graph: {
      version: 1, schema: 'g5_scene_graph_draft', request_id: REQUEST_ID,
      player_start_position: position,
      g5_anchors: [{ g5_anchor_id: 'anchor-1', parent_minilocation_id: 'mini-1' }],
      g5_edges: [{ g5_edge_id: 'edge-1' }]
    },
    g5_scene_audit: passAudit('g5_scene_audit'),
    initial_npc_placement: { version: 1, schema: 'initial_npc_placement_draft', request_id: REQUEST_ID, npcs: [{ npc_instance_id: 'npc-1' }] },
    npc_placement_audit: passAudit('npc_placement_audit'),
    initial_item_placement: { version: 1, schema: 'initial_item_placement_draft', request_id: REQUEST_ID, items: [{ item_instance_id: 'item-1' }], containers: [{ container_instance_id: 'container-1' }] },
    item_placement_audit: passAudit('item_placement_audit'),
    time_light_consistency_audit: passAudit('time_light_consistency_audit'),
    character_knowledge_map: { version: 1, schema: 'character_knowledge_map', request_id: REQUEST_ID, knowledge_map_id: 'knowledge-1', current_position_ref: position },
    character_knowledge_map_audit: passAudit('character_knowledge_map_audit'),
    character_knowledge_write_projection: {
      version: 1, schema: 'character_knowledge_write_projection', request_id: REQUEST_ID,
      projection_manifest: {
        source_content_hash: 'sha256:knowledge',
        expected_counts: { known_nearby_paths: 0 },
        expected_record_keys: ['known_nearby_paths']
      }
    },
    full_hidden_scene_state: { version: 1, schema: 'full_hidden_scene_state', request_id: REQUEST_ID, hidden_state_id: 'hidden-1' },
    full_hidden_state_audit: passAudit('full_hidden_state_audit'),
    visible_context_package: visible,
    visible_context_audit_approval: {
      version: 1, schema: 'pipeline_stage_approval', stage_id: 21, request_id: REQUEST_ID, pass: true,
      artifact_digest: computeStage24Digest(visible), commit_permission: { can_send_to_narrator: true }
    },
    narrator_starting_prose: prose,
    narrator_prose_audit_approval: {
      version: 1, schema: 'pipeline_stage_approval', stage_id: 23, request_id: REQUEST_ID, pass: true,
      artifact_digest: computeStage24Digest(prose), commit_permission: { can_show_to_player: true }
    }
  };
}

export function makePartySchema() {
  const table = (name, columns, allowed = ['insert_only', 'update_only', 'upsert_with_idempotency', 'snapshot_insert']) => ({
    name, columns: columns.map((column) => typeof column === 'string' ? { name: column, nullable: true } : column), allowed_operations: allowed
  });
  return {
    version: 1,
    schema: 'party_database_schema_snapshot',
    schema_version: '1',
    readonly_checksum: 'sha256:party-schema-v1',
    tables: [
      table('party_state', ['id', 'player_character_id', 'status']),
      table('party_npcs', ['id', 'party_id', 'npc_instance_id']),
      table('party_items', ['id', 'party_id', 'item_instance_id', 'container_instance_id', 'anchor_id']),
      table('party_current_position', ['id', 'party_id', 'character_id', 'region_id', 'place_id', 'location_id', 'minilocation_id', 'anchor_id']),
      table('party_map_knowledge', ['id', 'party_id', 'character_id', 'knowledge_map_id'])
    ],
    foreign_keys: [], unique_constraints: [], check_constraints: [], enum_definitions: [], indexes: [],
    allowed_operations: ['insert_only', 'update_only', 'upsert_with_idempotency', 'snapshot_insert']
  };
}

export function makeWorldSnapshot() {
  return {
    version: 1,
    schema: 'world_base_reference_snapshot',
    readonly_checksum: 'sha256:world-ref-v1',
    allowed_region_ids: ['region-1'],
    allowed_graph_node_ids: ['node-1', 'anchor-1'],
    allowed_graph_edge_ids: ['edge-1'],
    allowed_place_template_ids: [],
    allowed_npc_candidate_ids: ['npc-1'],
    allowed_item_profile_ids: ['item-1'],
    allowed_container_profile_ids: ['container-1'],
    allowed_property_rule_ids: [],
    allowed_source_ids: ['stage-3', 'stage-11', 'stage-13', 'stage-18', 'stage-23']
  };
}

export function makeInput(overrides = {}) {
  const artifacts = overrides.artifacts ?? makeArtifacts();
  const manifest = buildApprovedPipelineManifest({ request_id: REQUEST_ID, artifacts });
  return buildStage24Input({
    request_id: REQUEST_ID,
    party_creation_context: {
      party_id: PARTY_ID,
      player_character_id: PC_ID,
      campaign_id: 'campaign-1',
      created_at: '2026-07-11T00:00:00.000Z',
      schema_version: '1',
      idempotency_key: 'new-game:req-24:party-24'
    },
    approved_pipeline_outputs: artifacts,
    approved_pipeline_manifest: manifest,
    party_database_schema: overrides.partyDatabaseSchema ?? makePartySchema(),
    world_base_reference_snapshot: overrides.worldSnapshot ?? makeWorldSnapshot(),
    additional_write_policy: overrides.additionalWritePolicy ?? {}
  });
}

export function makePlan(input = makeInput()) {
  const auditSnapshots = [10, 12, 14, 15, 16, 17, 18, 19, 21, 23].map((stage_id) => ({ stage_id, pass: true }));
  return {
    version: 1,
    schema: 'party_db_write_plan',
    request_id: REQUEST_ID,
    plan_status: 'formed',
    source_input_digest: input.party_db_write_plan_input_digest,
    party_database_schema_digest: input.party_database_schema_digest,
    world_base_reference_digest: input.world_base_reference_digest,
    approved_pipeline_manifest_digest: input.approved_pipeline_manifest_digest,
    transaction: {
      transaction_id: 'tx-24',
      party_id: PARTY_ID,
      idempotency_key: 'new-game:req-24:party-24',
      is_atomic: true,
      is_dry_run_first: true,
      rollback_strategy: 'full_transaction_rollback',
      write_order: ['batch-state']
    },
    preconditions: [{ code: 'schema-current', on_fail: 'block' }],
    write_batches: [{
      batch_id: 'batch-state', order: 1, target_table: 'party_state', operation_mode: 'insert_only',
      depends_on_batches: [], source_trace: [{ stage_id: 11, artifact_key: 'player_character' }],
      records: [{ id: PARTY_ID, player_character_id: PC_ID, status: 'pending' }]
    }],
    postconditions: [{ code: 'party-created' }],
    forbidden_writes: ['world_base mutation', 'hidden state to public tables'],
    derived_indexes: [],
    audit_snapshots: auditSnapshots,
    rollback_plan: { strategy: 'full_transaction_rollback', covered_batch_ids: ['batch-state'] },
    source_trace: [{ stage_id: 11, artifact_key: 'player_character' }],
    knowledge_projection_validation: {
      source_content_hash: 'sha256:knowledge',
      expected_counts: { known_nearby_paths: 0 },
      expected_record_keys: ['known_nearby_paths'],
      planned_counts: { known_nearby_paths: 0 },
      planned_record_keys: ['known_nearby_paths']
    },
    self_audit: { pass: true, concerns: [], evidence: ['all approved inputs mapped'] }
  };
}

export const AUDIT_CHECK_KEYS = [
  'plan_schema', 'transaction_atomicity', 'database_schema_compliance', 'write_order', 'dependency_graph',
  'approved_entities_only', 'npc_projection', 'item_container_projection', 'position_projection', 'g5_projection',
  'knowledge_projection', 'hidden_visible_boundary', 'narrator_output_projection', 'source_trace', 'audit_snapshots',
  'forbidden_writes', 'world_base_immutability', 'rollback_completeness', 'idempotency', 'commit_readiness'
];

export function makeAudit(plan, pass = true, concern = null) {
  const checks = Object.fromEntries(AUDIT_CHECK_KEYS.map((key) => [key, { pass: true }]));
  if (!pass) checks.position_projection = { pass: false };
  const concerns = pass ? [] : [concern ?? { code: 'WRITE_PLAN_POSITION_MISMATCH', severity: 'repairable', message: 'position mismatch' }];
  return {
    version: 1,
    schema: 'party_db_write_plan_audit',
    request_id: REQUEST_ID,
    party_db_write_plan_digest: computePartyDbWritePlanDigest(plan),
    pass,
    checks,
    concerns,
    evidence: [pass ? 'plan matches approved pipeline' : 'position differs from approved G5 state'],
    proposed_repair_route: null,
    commit_permission: {
      can_send_to_commit_gate: pass,
      can_execute_transaction: pass,
      can_write_party_snapshots: pass
    }
  };
}

export function makeRoute(audit, route = 'party_db_write_plan_semantic_repair') {
  return {
    version: 1,
    schema: 'party_db_write_plan_repair_route',
    request_id: REQUEST_ID,
    return_to_stage: route,
    repair_kind: route.includes('format') ? 'fix_format_only' : 'repair_projection',
    reason: 'repair failed audit concerns',
    supporting_concern_codes: audit.concerns.map((item) => item.code),
    allowed_mutable_paths: ['write_batches', 'source_trace'],
    forbidden_mutable_paths: ['approved_pipeline_outputs', 'party_database_schema'],
    requires_reaudit_from_stage: 24
  };
}
