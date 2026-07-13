import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPartyDbWritePlanCodePrecheck,
  buildStage24Input,
  computePartyDbWritePlanDigest,
  normalizeStage24WritePolicy,
  runStage24PartyDbWritePlanBlock,
  validatePartyDbWritePlan,
  validatePartyDbWritePlanAudit,
  validateStage24Input,
  validateStage24RepairRoute
} from '../src/world/new-game-pipeline/stages/stage24-party-db-write-plan.js';
import { makeArtifacts, makeAudit, makeInput, makePartySchema, makePlan, makeRoute, makeWorldSnapshot } from './stage24-fixtures.mjs';

test('Stage 24 exact input and code precheck pass with complete immutable snapshots', () => {
  const input = makeInput();
  assert.deepEqual(validateStage24Input(input), []);
  const precheck = buildPartyDbWritePlanCodePrecheck(input);
  assert.equal(precheck.pass, true);
  assert.equal(precheck.schema, 'party_db_write_plan_code_precheck');
});

test('Stage 24 rejects weakened mandatory write policy', () => {
  assert.throws(() => normalizeStage24WritePolicy({ require_atomic_transaction: false }), /cannot weaken/);
});

test('Stage 24 rejects empty party DB schema and missing world reference snapshot', () => {
  const artifacts = makeArtifacts();
  assert.throws(() => buildStage24Input({
    request_id: 'req-24',
    party_creation_context: { party_id: 'p', player_character_id: 'pc', schema_version: '1', idempotency_key: 'i' },
    approved_pipeline_outputs: artifacts,
    party_database_schema: { version: 1, schema: 'party_database_schema_snapshot', schema_version: '1', readonly_checksum: 'x', tables: [], foreign_keys: [], unique_constraints: [], check_constraints: [], enum_definitions: [], indexes: [], allowed_operations: [] },
    world_base_reference_snapshot: null
  }), /world_base_reference_snapshot|requires artifacts/);
});

test('strict plan validator accepts approved plan and rejects unapproved NPC', () => {
  const input = makeInput();
  const precheck = buildPartyDbWritePlanCodePrecheck(input);
  const plan = makePlan(input);
  assert.deepEqual(validatePartyDbWritePlan(plan, input, precheck), []);

  const schema = makePartySchema();
  const npcTable = schema.tables.find((item) => item.name === 'party_npcs');
  npcTable.columns.push({ name: 'source_trace', nullable: true });
  const input2 = makeInput({ partyDatabaseSchema: schema });
  const plan2 = makePlan(input2);
  plan2.transaction.write_order.push('batch-npc');
  plan2.write_batches.push({
    batch_id: 'batch-npc', order: 2, target_table: 'party_npcs', operation_mode: 'insert_only', depends_on_batches: ['batch-state'],
    source_trace: [{ stage_id: 15 }], records: [{ id: 'row-npc', party_id: 'party-24', npc_instance_id: 'npc-unknown' }]
  });
  plan2.rollback_plan.covered_batch_ids.push('batch-npc');
  const issues = validatePartyDbWritePlan(plan2, input2, buildPartyDbWritePlanCodePrecheck(input2));
  assert.ok(issues.some((item) => item.code === 'WRITE_PLAN_UNAPPROVED_NPC'));
});

test('strict audit validator binds audit to plan digest and forbids embedded plan', () => {
  const input = makeInput();
  const plan = makePlan(input);
  const audit = makeAudit(plan, true);
  assert.deepEqual(validatePartyDbWritePlanAudit(audit, input, plan), []);
  audit.party_db_write_plan_digest = 'sha256:stale';
  audit.party_db_write_plan = plan;
  const issues = validatePartyDbWritePlanAudit(audit, input, plan);
  assert.ok(issues.some((item) => item.code === 'WRITE_PLAN_AUDIT_DIGEST_MISMATCH'));
  assert.ok(issues.some((item) => item.code === 'WRITE_PLAN_AUDIT_INVALID'));
});

test('route compatibility rejects format repair for semantic concern', () => {
  const plan = makePlan(makeInput());
  const audit = makeAudit(plan, false);
  const route = makeRoute(audit, 'party_db_write_plan_format_repair');
  assert.ok(validateStage24RepairRoute(route, audit).some((item) => item.code === 'WRITE_PLAN_AUDIT_INVALID'));
});

test('isolated block gives roles safe input and returns digest-bound result bundle', async () => {
  const input = makeInput();
  const plan = makePlan(input);
  let builderPayload;
  let auditorPayload;
  const result = await runStage24PartyDbWritePlanBlock({
    input,
    builder: async (payload) => { builderPayload = payload; return plan; },
    planFormatRepairer: async ({ parsed_builder_response }) => parsed_builder_response,
    auditor: async (payload) => { auditorPayload = payload; return makeAudit(plan, true); },
    auditFormatRepairer: async ({ parsed_audit_response }) => parsed_audit_response,
    router: async () => { throw new Error('router must not run'); },
    semanticRepairer: async () => plan,
    seniorSemanticRepairer: async () => plan,
    seniorBuilder: async () => plan,
    seniorAuditor: async () => makeAudit(plan, true)
  });
  assert.equal('context' in builderPayload, false);
  assert.equal('context' in auditorPayload, false);
  assert.equal(result.schema, 'stage24_party_db_write_plan_result');
  assert.equal(result.pass, true);
  assert.equal(result.party_db_write_plan_digest, computePartyDbWritePlanDigest(plan));
  assert.equal(result.party_db_write_plan_audit.party_db_write_plan_digest, result.party_db_write_plan_digest);
});
