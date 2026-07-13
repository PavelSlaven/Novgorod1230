import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPartyDbWritePlanCodePrecheck,
  validatePartyDatabaseSchemaSnapshot,
  validatePartyDbWritePlan,
  validateWorldBaseReferenceSnapshot
} from '../src/world/new-game-pipeline/stages/stage24-party-db-write-plan.js';
import { makeInput, makePartySchema, makePlan, makeWorldSnapshot } from './stage24-fixtures.mjs';

test('complete party database schema snapshot is mandatory', () => {
  const schema = makePartySchema();
  assert.deepEqual(validatePartyDatabaseSchemaSnapshot(schema), []);
  schema.tables = [];
  assert.ok(validatePartyDatabaseSchemaSnapshot(schema).some((item) => item.code === 'WRITE_PLAN_DATABASE_SCHEMA_INVALID'));
});

test('world base reference snapshot requires all allowlists and checksum', () => {
  const snapshot = makeWorldSnapshot();
  assert.deepEqual(validateWorldBaseReferenceSnapshot(snapshot), []);
  delete snapshot.allowed_graph_edge_ids;
  assert.ok(validateWorldBaseReferenceSnapshot(snapshot).length > 0);
});

test('plan validator rejects unknown table, unknown column and world_base mutation', () => {
  const input = makeInput();
  const plan = makePlan(input);
  plan.write_batches[0].target_table = 'world_base.graph_nodes';
  plan.write_batches[0].records[0].unknown_column = true;
  const issues = validatePartyDbWritePlan(plan, input, buildPartyDbWritePlanCodePrecheck(input));
  assert.ok(issues.some((item) => item.code === 'WRITE_PLAN_UNKNOWN_TABLE'));
  assert.ok(issues.some((item) => item.code === 'WRITE_PLAN_WORLD_BASE_MUTATION'));
});

test('knowledge projection must match Stage 18 projection exactly', () => {
  const input = makeInput();
  const plan = makePlan(input);
  plan.knowledge_projection_validation.planned_counts.known_nearby_paths = 1;
  plan.knowledge_projection_validation.planned_record_keys.push('extra_group');
  const issues = validatePartyDbWritePlan(plan, input, buildPartyDbWritePlanCodePrecheck(input));
  assert.ok(issues.some((item) => item.code === 'WRITE_PLAN_KNOWLEDGE_PROJECTION_INCOMPLETE'));
  assert.ok(issues.some((item) => item.code === 'WRITE_PLAN_KNOWLEDGE_PROJECTION_EXTRA'));
});

test('rollback and source trace are mandatory', () => {
  const input = makeInput();
  const plan = makePlan(input);
  plan.rollback_plan.covered_batch_ids = [];
  plan.source_trace = [];
  plan.write_batches[0].source_trace = [];
  const issues = validatePartyDbWritePlan(plan, input, buildPartyDbWritePlanCodePrecheck(input));
  assert.ok(issues.some((item) => item.code === 'WRITE_PLAN_ROLLBACK_INCOMPLETE'));
  assert.ok(issues.some((item) => item.code === 'WRITE_PLAN_SOURCE_TRACE_INCOMPLETE'));
});
