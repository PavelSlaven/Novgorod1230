import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePhysicalWritePlan } from '../src/world/new-game-pipeline/stages/stage25-party-commit.js';

function schema() {
  return {
    version: 1,
    schema: 'party_database_schema_snapshot',
    schema_version: '1',
    readonly_checksum: 'sha256:schema',
    tables: [
      {
        name: 'party_state',
        columns: [
          { name: 'id', nullable: false, data_type: 'TEXT' },
          { name: 'status', nullable: false, data_type: 'TEXT' }
        ],
        allowed_operations: ['insert_only']
      },
      {
        name: 'party_player_characters',
        columns: [
          { name: 'id', nullable: false, data_type: 'TEXT' },
          { name: 'party_id', nullable: false, data_type: 'TEXT' }
        ],
        allowed_operations: ['insert_only']
      }
    ],
    columns: [],
    foreign_keys: [{ from_table: 'party_player_characters', from_column: 'party_id', to_table: 'party_state', to_column: 'id' }],
    unique_constraints: [{ table: 'party_state', columns: ['id'] }],
    check_constraints: [{ table: 'party_state', column: 'status', allowed_values: ['draft'] }],
    enum_definitions: [{ table: 'party_state', column: 'status', values: ['draft'] }],
    indexes: [],
    allowed_operations: ['insert_only']
  };
}

function plan() {
  return {
    version: 1,
    schema: 'party_physical_write_plan',
    request_id: 'req-25',
    transaction: {
      transaction_id: 'tx-25',
      party_id: 'party-25',
      write_order: ['state', 'child']
    },
    write_batches: [
      {
        batch_id: 'state',
        target_table: 'party_state',
        operation_mode: 'insert_only',
        depends_on_batches: [],
        source_trace: [{ stage_id: 24 }],
        records: [{ id: 'party-25', status: 'draft' }]
      },
      {
        batch_id: 'child',
        target_table: 'party_player_characters',
        operation_mode: 'insert_only',
        depends_on_batches: ['state'],
        source_trace: [{ stage_id: 24 }],
        records: [{ id: 'child-1', party_id: 'party-25' }]
      }
    ],
    postconditions: [{ code: 'party-created' }],
    source_trace: [{ stage_id: 24 }],
    rollback_plan: { strategy: 'full_transaction_rollback', covered_batch_ids: ['state', 'child'] },
    knowledge_projection_validation: {
      source_content_hash: 'sha256:knowledge',
      expected_counts: {},
      planned_counts: {},
      expected_record_keys: [],
      planned_record_keys: []
    }
  };
}

test('Stage 25 validates FK, enum, unique, check, not-null and data type constraints', () => {
  assert.deepEqual(validatePhysicalWritePlan(plan(), schema()), []);

  const duplicate = plan();
  duplicate.write_batches[0].records.push({ id: 'party-25', status: 'draft' });
  assert.ok(validatePhysicalWritePlan(duplicate, schema()).some((item) => item.code === 'STAGE25_UNIQUE_CONSTRAINT_INVALID'));

  const brokenFk = plan();
  brokenFk.write_batches[1].records[0].party_id = 'missing';
  assert.ok(validatePhysicalWritePlan(brokenFk, schema()).some((item) => item.code === 'STAGE25_FK_INVALID'));

  const badEnum = plan();
  badEnum.write_batches[0].records[0].status = 'invalid';
  const enumIssues = validatePhysicalWritePlan(badEnum, schema());
  assert.ok(enumIssues.some((item) => item.code === 'STAGE25_ENUM_INVALID'));
  assert.ok(enumIssues.some((item) => item.code === 'STAGE25_CHECK_CONSTRAINT_INVALID'));

  const missingRequired = plan();
  delete missingRequired.write_batches[0].records[0].id;
  assert.ok(validatePhysicalWritePlan(missingRequired, schema()).some((item) => item.code === 'STAGE25_CONSTRAINT_INVALID'));

  const wrongType = plan();
  wrongType.write_batches[0].records[0].id = 25;
  assert.ok(validatePhysicalWritePlan(wrongType, schema()).some((item) => item.code === 'STAGE25_TYPE_INVALID'));
});
