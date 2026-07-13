import {
  computePartyDbWritePlanDigest,
  computeStage24ArtifactDigest
} from '@rus/contracts';
import {
  STAGE25_DRY_RUN_SCHEMA,
  STAGE25_IDEMPOTENCY_SCHEMA,
  STAGE25_MAPPING_REPORT_SCHEMA,
  STAGE25_PHYSICAL_PLAN_SCHEMA,
  STAGE25_POSTCOMMIT_STATE_SCHEMA,
  STAGE25_TRANSACTION_SCHEMA,
  buildStage25CommitInput,
  computeStage25Digest
} from '@rus/new-game/stages/stage-25/compat';


const REQUIRED_DRY_RUN_CHECKS = [
  'schema_validation','required_columns','type_validation','enum_validation','not_null_validation',
  'foreign_key_validation','unique_constraint_validation','check_constraint_validation',
  'source_id_validation','candidate_id_validation','graph_reference_validation',
  'write_order_validation','dependency_validation','idempotency_validation',
  'world_base_immutability','hidden_public_boundary','rollback_simulation','postconditions_simulation'
];

const MANIFEST_KEYS = [
  'historical_frame','weather_state','selected_start_node','start_place_audit','player_character',
  'player_character_audit','g5_scene_graph','g5_scene_audit','initial_npc_placement',
  'npc_placement_audit','initial_item_placement','item_placement_audit',
  'time_light_consistency_audit','character_knowledge_map','character_knowledge_map_audit',
  'character_knowledge_write_projection','full_hidden_scene_state','full_hidden_state_audit',
  'visible_context_package','visible_context_audit_approval','narrator_starting_prose',
  'narrator_prose_audit_approval'
];

export function makeStage25Fixture() {
  const requestId = 'req-stage25-001';
  const partyId = 'party-001';
  const transactionId = 'tx-stage25-001';
  const idempotencyKey = 'idem-stage25-001';
  const playerId = 'pc-001';

  const partyDatabaseSchema = {
    version: 1,
    schema: 'party_database_schema_snapshot',
    schema_version: 'test-1',
    readonly_checksum: 'schema-checksum',
    tables: [{
      name: 'party_state',
      columns: [
        { name: 'id', data_type: 'TEXT', nullable: false },
        { name: 'status', data_type: 'TEXT', nullable: false },
        { name: 'audit_state', data_type: 'JSONB', nullable: true }
      ],
      allowed_operations: ['upsert_with_idempotency']
    }],
    columns: [],
    foreign_keys: [],
    unique_constraints: [],
    check_constraints: [],
    enum_definitions: [],
    indexes: [],
    allowed_operations: ['upsert_with_idempotency']
  };

  const worldBaseReferenceSnapshot = {
    version: 1,
    schema: 'world_base_reference_snapshot',
    readonly_checksum: 'world-checksum',
    allowed_region_ids: [],
    allowed_graph_node_ids: [],
    allowed_graph_edge_ids: [],
    allowed_place_template_ids: [],
    allowed_npc_candidate_ids: [],
    allowed_item_profile_ids: [],
    allowed_container_profile_ids: [],
    allowed_property_rule_ids: [],
    allowed_source_ids: []
  };

  const manifest = {
    version: 1,
    schema: 'approved_pipeline_manifest',
    request_id: requestId,
    artifacts: MANIFEST_KEYS.map((artifact_key, index) => ({
      artifact_key,
      stage_id: 100 + index,
      artifact_schema: `fixture_schema_${index}`,
      artifact_digest: computeStage24ArtifactDigest({ artifact_key, index })
    }))
  };

  const logicalPlan = {
    version: 1,
    schema: 'party_db_write_plan',
    request_id: requestId,
    plan_status: 'formed',
    transaction: {
      transaction_id: transactionId,
      party_id: partyId,
      idempotency_key: idempotencyKey,
      is_atomic: true,
      is_dry_run_first: true,
      write_order: ['batch-party-state'],
      rollback_strategy: 'full_transaction_rollback'
    },
    write_batches: [{
      batch_id: 'batch-party-state',
      target_table: 'party_state',
      operation_mode: 'upsert_with_idempotency',
      depends_on_batches: [],
      records: [{ party_id: partyId, status: 'ready' }],
      source_trace: [{ source_id: 'fixture-source' }]
    }],
    postconditions: [{ check: 'party_ready' }],
    rollback_plan: { strategy: 'full_transaction_rollback', covered_batch_ids: ['batch-party-state'] },
    source_trace: [{ source_id: 'fixture-source' }],
    knowledge_projection_validation: {
      expected_counts: {},
      planned_counts: {},
      expected_record_keys: [],
      planned_record_keys: [],
      source_content_hash: computeStage24ArtifactDigest({ knowledge: true })
    }
  };

  const stage24Result = {
    version: 1,
    schema: 'stage24_party_db_write_plan_result',
    request_id: requestId,
    pass: true,
    party_db_write_plan: logicalPlan,
    party_db_write_plan_digest: computePartyDbWritePlanDigest(logicalPlan),
    party_database_schema_digest: computeStage24ArtifactDigest(partyDatabaseSchema),
    world_base_reference_digest: computeStage24ArtifactDigest(worldBaseReferenceSnapshot),
    approved_pipeline_manifest_digest: computeStage24ArtifactDigest(manifest),
    party_db_write_plan_code_precheck: {
      version: 1,
      schema: 'party_db_write_plan_code_precheck',
      request_id: requestId,
      pass: true
    },
    party_db_write_plan_audit: {
      version: 1,
      schema: 'party_db_write_plan_audit',
      request_id: requestId,
      party_db_write_plan_digest: computePartyDbWritePlanDigest(logicalPlan),
      pass: true
    },
    repair_route: null,
    handoff_permission: {
      can_send_to_commit_gate: true,
      can_execute_transaction: true,
      can_write_party_snapshots: true
    }
  };

  const partyCreationContext = {
    request_id: requestId,
    party_id: partyId,
    player_character_id: playerId,
    schema_version: 'test-1',
    idempotency_key: idempotencyKey
  };

  const input = buildStage25CommitInput({
    request_id: requestId,
    party_creation_context: partyCreationContext,
    stage24_result: stage24Result,
    party_database_schema: partyDatabaseSchema,
    world_base_reference_snapshot: worldBaseReferenceSnapshot,
    approved_pipeline_manifest: manifest
  });

  const physicalPlan = {
    version: 1,
    schema: STAGE25_PHYSICAL_PLAN_SCHEMA,
    request_id: requestId,
    logical_plan_schema: logicalPlan.schema,
    logical_plan_digest: stage24Result.party_db_write_plan_digest,
    transaction: {
      ...logicalPlan.transaction,
      write_order: ['batch-party-state']
    },
    write_batches: [{
      batch_id: 'batch-party-state',
      target_table: 'party_state',
      operation_mode: 'upsert_with_idempotency',
      depends_on_batches: [],
      records: [{ id: partyId, status: 'active', audit_state: {} }],
      source_trace: [{ source_id: 'fixture-source' }]
    }],
    postconditions: logicalPlan.postconditions,
    rollback_plan: logicalPlan.rollback_plan,
    source_trace: logicalPlan.source_trace,
    knowledge_projection_validation: logicalPlan.knowledge_projection_validation
  };
  const physicalDigest = computeStage25Digest(physicalPlan);

  const physicalPlanAdapter = () => ({
    physical_write_plan: structuredClone(physicalPlan),
    physical_write_plan_digest: physicalDigest,
    mapping_report: {
      version: 1,
      schema: STAGE25_MAPPING_REPORT_SCHEMA,
      logical_plan_digest: stage24Result.party_db_write_plan_digest,
      physical_plan_digest: physicalDigest,
      batch_count: 1,
      record_count: 1,
      mappings: [{
        batch_id: 'batch-party-state',
        spec_target_table: 'party_state',
        physical_target_table: 'party_state',
        adapter_version: 1
      }],
      concerns: []
    }
  });

  const idempotencyResult = {
    version: 1,
    schema: STAGE25_IDEMPOTENCY_SCHEMA,
    request_id: requestId,
    pass: true,
    status: 'new',
    idempotency_key: idempotencyKey,
    payload_hash: input.party_creation_context.payload_hash,
    physical_write_plan_digest: physicalDigest
  };

  const dryRunResult = {
    version: 1,
    schema: STAGE25_DRY_RUN_SCHEMA,
    request_id: requestId,
    physical_write_plan_digest: physicalDigest,
    pass: true,
    checks: Object.fromEntries(REQUIRED_DRY_RUN_CHECKS.map((key) => [key, { pass: true, evidence: [`${key}:ok`] }])),
    concerns: [],
    evidence: ['dry-run passed'],
    rollback_completed: true
  };

  const transactionResult = {
    version: 1,
    schema: STAGE25_TRANSACTION_SCHEMA,
    request_id: requestId,
    party_id: partyId,
    transaction_id: transactionId,
    physical_write_plan_digest: physicalDigest,
    pass: true,
    commit_status: 'committed',
    executed_batches: ['batch-party-state'],
    batch_results: [{
      batch_id: 'batch-party-state',
      operation: 'upsert_with_idempotency',
      attempted_rows: 1,
      affected_rows: 1
    }],
    postcondition_checks: [{ pass: true, evidence: ['party ready'] }],
    rollback: { attempted: false, completed: false }
  };

  const postcommitState = {
    version: 1,
    schema: STAGE25_POSTCOMMIT_STATE_SCHEMA,
    request_id: requestId,
    party_id: partyId,
    transaction_id: transactionId,
    physical_write_plan_digest: physicalDigest,
    party_state: {
      status: 'ready',
      is_ready_for_player: true,
      current_phase: 'awaiting_player_input',
      current_turn_number: 0
    },
    current_position: { region_id: 'region-test', node_id: 'node-test' },
    current_clock: { year: 1230, minute_of_day: 480 },
    player_character: { character_id: playerId },
    player_output_ref: { narrator_output_id: 'narrator-test', player_visible_message_ready: true },
    idempotency_record: {
      idempotency_key: idempotencyKey,
      payload_hash: input.party_creation_context.payload_hash,
      status: 'committed'
    },
    integrity: {
      anchors_match_plan: true,
      routes_match_plan: true,
      npcs_match_plan: true,
      items_match_plan: true,
      containers_match_plan: true,
      knowledge_hash_matches: true,
      knowledge_counts_match: true,
      single_current_knowledge_map: true,
      visible_context_digest_matches: true,
      narrator_prose_digest_matches: true,
      audit_snapshots_complete: true,
      source_trace_complete: true
    },
    party_public_state: {
      available_actions: [],
      known_exits: []
    }
  };

  const executors = {
    physicalPlanAdapter,
    idempotencyChecker: async () => structuredClone(idempotencyResult),
    dryRunExecutor: async () => structuredClone(dryRunResult),
    transactionExecutor: async () => structuredClone(transactionResult),
    postcommitReader: async () => structuredClone(postcommitState)
  };

  return {
    requestId,
    partyId,
    transactionId,
    idempotencyKey,
    playerId,
    partyDatabaseSchema,
    worldBaseReferenceSnapshot,
    manifest,
    logicalPlan,
    stage24Result,
    partyCreationContext,
    input,
    physicalPlan,
    physicalDigest,
    idempotencyResult,
    dryRunResult,
    transactionResult,
    postcommitState,
    executors
  };
}
