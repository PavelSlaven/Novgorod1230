import assert from 'node:assert/strict';
import test from 'node:test';
import { assertAuthoredStartV0SessionSnapshot } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-2-authored-start.js';
import { createLowerDvinaTracePhase2PostgresRepository } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-2.js';

const snapshot = () => ({
  party_state_version: 0,
  world_revision_id: 'world:revision',
  world_catalog_digest: 'catalog:digest',
  session_party_id: 'party:authored',
  session_state_version: 1,
  turn_number: 0,
  last_turn_id: null,
  delivery_ack_result: { pass: true },
  stage26_result: { scenario_id: 'scenario:start', runtime_binding: { id: 'binding' },
    opening_screen_digest: 'screen:digest' },
  screen: { schema: 'screen', text: 'Начало.' },
  state_payload: { schema: 'rus.authored_start_initial_party_snapshot.v3', value: 1 },
  state_digest: 'state:digest',
  body_state_version: 1,
  body_health: '100',
  body_energy: '100',
  body_satiety: '100',
  body_updated_change_set_id: 'change:start',
  clock_state_version: 1
});

test('authored-start v0 session rejects a nonzero turn and last-turn identity', () => {
  const row = snapshot();
  assert.throws(() => assertAuthoredStartV0SessionSnapshot({
    partyId: 'party:authored', row,
    current: { ...row, turn_number: 1, last_turn_id: 'turn:1' }
  }), { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' });
});

test('authored-start v0 session accepts only an unchanged session snapshot', () => {
  const row = snapshot();
  assert.equal(assertAuthoredStartV0SessionSnapshot({
    partyId: 'party:authored', row, current: snapshot()
  }), true);
  for (const [field, value] of [
    ['screen', { schema: 'screen', text: 'Изменённый экран.' }],
    ['state_payload', { schema: 'rus.authored_start_initial_party_snapshot.v3', value: 2 }],
    ['state_digest', 'state:changed'],
    ['delivery_ack_result', { pass: false }],
    ['world_revision_id', 'world:changed'],
    ['world_catalog_digest', 'catalog:changed'],
    ['body_state_version', 2],
    ['body_health', '99'],
    ['body_updated_change_set_id', 'change:changed'],
    ['clock_state_version', 2],
    ['stage26_result', { ...row.stage26_result, opening_screen_digest: 'screen:changed' }]
  ]) {
    assert.throws(() => assertAuthoredStartV0SessionSnapshot({
      partyId: 'party:authored', row, current: { ...row, [field]: value }
    }), { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' }, field);
  }
});

test('authored-start reader rejects a changed transactional screen before Phase1A read',
  async () => {
    const initial = snapshot();
    const transactional = { ...initial,
      screen: { schema: 'screen', text: 'Экран изменился после первой выборки.' } };
    const statements = [];
    const pool = {
      async query(sql) {
        assert.match(sql, /party_runtime\.party_server_sessions/u);
        return { rowCount: 1, rows: [initial] };
      },
      async connect() {
        return { async query(sql) {
          statements.push(sql);
          if (sql === 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY') return {};
          if (/FROM party_runtime\.party_server_sessions/u.test(sql)) {
            return { rowCount: 1, rows: [transactional] };
          }
          return {};
        }, release() {} };
      }
    };
    const repository = createLowerDvinaTracePhase2PostgresRepository({
      partyPool: pool, committer: { async commit() {} },
      authoredRuntimeBindingResolver: () => ({
        snapshot_schema: 'rus.authored_start_initial_party_snapshot.v3'
      })
    });

    await assert.rejects(repository.loadPhase2State('party:authored'), {
      code: 'TRACE_PHASE_2_SESSION_READ_INVALID'
    });
    assert.equal(statements.filter((sql) =>
      /party_runtime\.party_materialization_runs/u.test(sql)).length, 0);
    assert.equal(statements.at(-1), 'ROLLBACK');
  });
