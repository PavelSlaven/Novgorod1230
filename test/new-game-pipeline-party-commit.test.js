import test from 'node:test';
import assert from 'node:assert/strict';
import {
  auditPartyDbWritePlan,
  createNewGamePipelineContext,
  executeAtomicPartyWritePlan,
  runCommitGate,
  runStage24PartyWritePlan,
  validatePartyDbWritePlan
} from '../src/world/new-game-pipeline/index.js';

test('stage 24 write plan plumbing accepts fixture plan and code audit', async () => {
  const context = createNewGamePipelineContext({ requestId: 'req_party_commit' });
  context.setStageOutput(21, { schema: 'visible_context_audit', pass: true });
  context.setStageOutput(23, { schema: 'narrator_prose_audit', pass: true });
  context.freezeArtifact({
    artifact_id: 'player_seed:req_party_commit',
    stage_id: 1401,
    schema: 'player_seed_contract',
    version: 1,
    hash: 'seed',
    frozen_paths: ['root.current_position.anchor_id'],
    produced_by: 'deterministic_composition',
    validation_status: 'passed',
    audit_status: 'not_required',
    dependency_status: 'passed',
    artifact: { current_position: { anchor_id: 'anchor_001' } }
  });
  const output = await runStage24PartyWritePlan(context, { writePlan: validWritePlan() });

  assert.equal(output.party_db_write_plan.schema, 'party_db_write_plan');
  assert.equal(output.party_db_write_plan.write_batches.at(-1).records[0].status, 'active');
  assert.equal(output.party_db_write_plan_audit.pass, true);
  assert.equal(context.getGateResult(24).pass, true);
});

test('write plan validation blocks missing idempotency and bad dependencies', () => {
  const plan = validWritePlan();
  delete plan.transaction.idempotency_key;
  plan.write_batches[1].depends_on_batches = ['missing_batch'];

  const result = validatePartyDbWritePlan(plan);

  assert.equal(result.pass, false);
  assert.deepEqual(result.concerns.map((item) => item.code), [
    'WRITE_PLAN_IDEMPOTENCY_KEY_MISSING',
    'WRITE_PLAN_DEPENDENCY_NOT_FOUND'
  ]);
});

test('write plan audit blocks hidden leaks and world_base mutations', () => {
  const plan = validWritePlan({
    write_batches: [
      ...validWritePlan().write_batches,
      {
        batch_id: 'batch_leak',
        order: 3,
        target_table: 'party_visible_context',
        operation_mode: 'snapshot_insert',
        depends_on_batches: ['batch_party_state'],
        records: [{ party_id: 'party_001', hidden_state: { private_motives: ['secret'] } }],
        on_error: { action: 'rollback_transaction', error_code: 'WRITE_BATCH_FAILED' }
      },
      {
        batch_id: 'batch_world_base',
        order: 4,
        target_table: 'world_base.graph_nodes',
        operation_mode: 'insert_only',
        depends_on_batches: [],
        records: [{ id: 'node_001' }],
        on_error: { action: 'rollback_transaction', error_code: 'WRITE_BATCH_FAILED' }
      }
    ]
  });
  plan.transaction.write_order = ['batch_party_state', 'batch_mark_party_ready', 'batch_leak', 'batch_world_base'];

  const audit = auditPartyDbWritePlan(plan);

  assert.equal(audit.pass, false);
  assert.equal(audit.commit_permission.can_execute_transaction, false);
  assert.ok(audit.concerns.some((item) => item.code === 'WRITE_PLAN_HIDDEN_STATE_PUBLIC_LEAK'));
  assert.ok(audit.concerns.some((item) => item.code === 'WRITE_PLAN_WORLD_BASE_MUTATION'));
});

test('commit gate uses ready adapter mapping for current party DDL', async () => {
  const result = await runCommitGate(validCommitGateInput(), { dryRun: async () => {} });

  assert.equal(result.pass, true);
  assert.equal(result.transaction_permission.can_execute_atomic_commit, true);
  const readyBatch = result.commit_execution_plan.adapted_write_plan.write_batches.at(-1);
  assert.equal(readyBatch.records[0].status, 'active');
  assert.equal(readyBatch.records[0].audit_state.is_ready_for_player, true);
  assert.equal(readyBatch.records[0].audit_state.current_phase, 'awaiting_player_input');
});

test('commit gate blocks bundle with missing artifact', async () => {
  const input = validCommitGateInput();
  delete input.final_world_start_bundle.artifacts.hidden_state;

  const result = await runCommitGate(input, { dryRun: async () => {} });

  assert.equal(result.pass, false);
  assert.ok(result.concerns.some((item) => item.code === 'COMMIT_GATE_FINAL_BUNDLE_MISSING_ARTIFACT'));
});

test('commit gate blocks failed senior repair from diagnostics', async () => {
  const input = validCommitGateInput();
  input.pipeline_diagnostics = {
    terminal_failed_stage: 'visible_context',
    failed_gate: 'anti_regression',
    final_blocked_reason: 'senior repair exhausted',
    missing_dependency_references: []
  };

  const result = await runCommitGate(input, { dryRun: async () => {} });

  assert.equal(result.pass, false);
  assert.ok(result.concerns.some((item) => item.code === 'COMMIT_GATE_PIPELINE_NOT_CLEAN'));
});

test('atomic party transaction executes batches in validated order', async () => {
  const calls = [];
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
    }
  };

  const result = await executeAtomicPartyWritePlan(validWritePlan(), { client });

  assert.equal(result.schema, 'party_transaction_result');
  assert.deepEqual(calls.map((call) => commandKind(call.sql)), ['BEGIN', 'INSERT', 'UPDATE', 'COMMIT']);
  assert.match(calls[1].sql, /INSERT INTO party\."party_state"/u);
  assert.match(calls[2].sql, /UPDATE party\."party_state"/u);
  assert.deepEqual(result.executed_batches, ['batch_party_state', 'batch_mark_party_ready']);
});

function validCommitGateInput() {
  return {
    version: 1,
    schema: 'commit_gate_input',
    request_id: 'req_001',
    party_creation_context: {
      party_id: 'party_001',
      player_character_id: 'pc_001',
      campaign_id: null,
      schema_version: '1',
      idempotency_key: 'idem_001',
      payload_hash: 'hash_001'
    },
    party_db_write_plan: validWritePlan(),
    party_db_write_plan_audit: {
      version: 1,
      schema: 'party_db_write_plan_audit',
      pass: true,
      commit_permission: { can_execute_transaction: true }
    },
    approved_pipeline_outputs: Object.fromEntries(requiredAuditKeys().map((key) => [key, { pass: true }])),
    final_world_start_bundle: validFinalBundle(),
    pipeline_diagnostics: {
      terminal_failed_stage: null,
      failed_gate: null,
      final_blocked_reason: null,
      missing_dependency_references: []
    },
    party_database_schema: { version: 1, schema: 'party_database_schema_snapshot', tables: [] },
    world_base_reference_snapshot: { version: 1, schema: 'world_base_reference_snapshot', readonly_checksum: 'sha256:fixture' },
    commit_policy: { require_dry_run: true }
  };
}

function validFinalBundle() {
  return {
    version: 1,
    schema: 'final_world_start_bundle',
    artifacts: {
      player_seed: {
        schema: 'player_seed_contract',
        current_position: {
          region_id: 'region_novgorod_land',
          place_id: 'place_001',
          location_id: 'location_001',
          minilocation_id: 'mini_001',
          anchor_id: 'anchor_001'
        }
      },
      g5_scene: { schema: 'g5_scene_graph_draft' },
      actor_profiles: { schema: 'initial_npc_placement_draft' },
      items: { schema: 'initial_item_placement_draft' },
      hidden_state: { schema: 'full_hidden_scene_state' },
      visible_context: { schema: 'visible_context_package' },
      narrator_prose: { schema: 'narrator_starting_prose' },
      save_plan: { schema: 'party_db_write_plan' }
    },
    frozen_artifact_refs: [
      { artifact_id: 'player_seed:req_001', schema: 'player_seed_contract', stage_id: 1401, hash: 'abc' },
      { artifact_id: 'g5:req_001', schema: 'g5_scene_graph_draft', stage_id: 13, hash: 'g5' },
      { artifact_id: 'npc:req_001', schema: 'initial_npc_placement_draft', stage_id: 15, hash: 'npc' },
      { artifact_id: 'item:req_001', schema: 'initial_item_placement_draft', stage_id: 16, hash: 'item' },
      { artifact_id: 'visible:req_001', schema: 'visible_context_package', stage_id: 20, hash: 'visible' },
      { artifact_id: 'narrator:req_001', schema: 'narrator_starting_prose', stage_id: 22, hash: 'narrator' },
      { artifact_id: 'write:req_001', schema: 'party_db_write_plan_stage_output', stage_id: 24, hash: 'write' }
    ]
  };
}

function validWritePlan(overrides = {}) {
  const plan = {
    version: 1,
    schema: 'party_db_write_plan',
    request_id: 'req_001',
    plan_status: 'formed',
    transaction: {
      transaction_id: 'tx_001',
      party_id: 'party_001',
      idempotency_key: 'idem_001',
      is_atomic: true,
      is_dry_run_first: true,
      rollback_strategy: 'full_transaction_rollback',
      write_order: ['batch_party_state', 'batch_mark_party_ready']
    },
    preconditions: [
      {
        precondition_id: 'precond_all_audits',
        check_type: 'audit_passed',
        expected: true,
        on_fail: { action: 'block_transaction', error_code: 'WRITE_PLAN_PRECONDITION_FAILED' }
      }
    ],
    write_batches: [
      {
        batch_id: 'batch_party_state',
        order: 1,
        target_table: 'party_state',
        operation_mode: 'insert_only',
        depends_on_batches: [],
        records: [{
          party_id: 'party_001',
          save_slot: 'slot_001',
          status: 'initializing',
          start_year: 1237,
          current_year: 1237,
          current_day_index: 0,
          current_minute_of_day: 225,
          world_base_region_id: 'region_novgorod_land',
          player_character_id: 'pc_001',
          is_ready_for_player: false,
          current_phase: 'opening_commit'
        }],
        on_error: { action: 'rollback_transaction', error_code: 'WRITE_BATCH_FAILED' }
      },
      {
        batch_id: 'batch_mark_party_ready',
        order: 2,
        target_table: 'party_state',
        operation_mode: 'update_only',
        depends_on_batches: ['batch_party_state'],
        records: [{
          party_id: 'party_001',
          status: 'ready',
          is_ready_for_player: true,
          current_phase: 'awaiting_player_input',
          opening_scene_presented: false
        }],
        on_error: { action: 'rollback_transaction', error_code: 'WRITE_BATCH_FAILED' }
      }
    ],
    postconditions: [
      { postcondition_id: 'postcond_ready', check_type: 'party_ready_flag', expected: true }
    ],
    forbidden_writes: [
      { target: 'world_base.*', reason: 'party initialization cannot mutate canonical base' }
    ],
    rollback_plan: {
      strategy: 'full_transaction_rollback',
      rollback_order: ['reverse_write_order'],
      preserve_diagnostics: true
    },
    source_trace: [
      { record_table: 'party_state', record_id: 'party_001', source_schema: 'party_db_write_plan' }
    ],
    self_audit: {
      pass: true,
      concerns: [],
      evidence: ['fixture write plan has atomic transaction, rollback, source trace and ready final batch']
    }
  };
  return { ...plan, ...overrides };
}

function requiredAuditKeys() {
  return [
    'start_place_audit',
    'player_character_audit',
    'g5_scene_audit',
    'npc_placement_audit',
    'item_placement_audit',
    'time_light_consistency_audit',
    'character_knowledge_map_audit',
    'full_hidden_state_audit',
    'visible_context_audit',
    'narrator_prose_audit'
  ];
}

function commandKind(sql) {
  return String(sql).split(/\s+/u)[0];
}
