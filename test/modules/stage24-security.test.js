import test from 'node:test';
import assert from 'node:assert/strict';
import * as stage24 from '@rus/new-game/stages/stage-24/compat';
import { makeStage24Fixture } from '../fixtures/stage24-fixtures.mjs';

test('Stage 24 rejects world_base writes', () => {
  const f = makeStage24Fixture();
  const plan = structuredClone(f.plan);
  plan.write_batches[0].target_table = 'world_base.locations';
  const concerns = stage24.validatePartyDbWritePlan(plan, f.input, stage24.buildPartyDbWritePlanCodePrecheck(f.input));
  assert.ok(concerns.some((item) => item.code === 'WRITE_PLAN_WORLD_BASE_MUTATION'));
});

test('Stage 24 rejects hidden fields in player-facing tables', () => {
  const f = makeStage24Fixture();
  const plan = structuredClone(f.plan);
  plan.write_batches[0].target_table = 'player_public_state';
  plan.write_batches[0].records[0].hidden_state = { secret: true };
  const schemaTable = f.input.party_database_schema.tables[0];
  schemaTable.name = 'player_public_state';
  schemaTable.columns.push({ name: 'hidden_state', nullable: true });
  f.input.party_database_schema_digest = stage24.computeStage24Digest(f.input.party_database_schema);
  plan.party_database_schema_digest = f.input.party_database_schema_digest;
  const concerns = stage24.validatePartyDbWritePlan(plan, f.input, stage24.buildPartyDbWritePlanCodePrecheck(f.input));
  assert.ok(concerns.some((item) => item.code === 'WRITE_PLAN_HIDDEN_PUBLIC_LEAK'));
});

test('Stage 24 rejects unapproved anchors', () => {
  const f = makeStage24Fixture();
  const plan = structuredClone(f.plan);
  plan.write_batches[0].records[0].anchor_id = 'anchor-not-approved';
  const concerns = stage24.validatePartyDbWritePlan(plan, f.input, stage24.buildPartyDbWritePlanCodePrecheck(f.input));
  assert.ok(concerns.some((item) => item.code === 'WRITE_PLAN_UNAPPROVED_ANCHOR'));
});

test('Stage 24 rejects incomplete rollback coverage', () => {
  const f = makeStage24Fixture();
  const plan = structuredClone(f.plan);
  plan.rollback_plan.covered_batch_ids = [];
  const concerns = stage24.validatePartyDbWritePlan(plan, f.input, stage24.buildPartyDbWritePlanCodePrecheck(f.input));
  assert.ok(concerns.some((item) => item.code === 'WRITE_PLAN_ROLLBACK_INCOMPLETE'));
});

test('Stage 24 rejects dependency cycles', () => {
  const f = makeStage24Fixture();
  const plan = structuredClone(f.plan);
  const second = structuredClone(plan.write_batches[0]);
  second.batch_id = 'batch-second';
  second.order = 2;
  second.depends_on_batches = ['batch-party-state'];
  plan.write_batches[0].depends_on_batches = ['batch-second'];
  plan.write_batches.push(second);
  plan.transaction.write_order.push('batch-second');
  plan.rollback_plan.covered_batch_ids.push('batch-second');
  const concerns = stage24.validatePartyDbWritePlan(plan, f.input, stage24.buildPartyDbWritePlanCodePrecheck(f.input));
  assert.ok(concerns.some((item) => item.code === 'WRITE_PLAN_DEPENDENCY_CYCLE'));
});

test('Stage 24 disallows weakened required policy', () => {
  assert.throws(() => stage24.normalizeStage24WritePolicy({ require_atomic_transaction: false }), /cannot weaken/u);
});
