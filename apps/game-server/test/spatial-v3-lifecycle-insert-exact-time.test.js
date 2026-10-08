import assert from 'node:assert/strict';
import test from 'node:test';
import { applySealedLifecycleInsert } from '../src/infrastructure/postgres/spatial-v3-lifecycle-insert.js';

// D102 acceptance, expected red before the lifecycle fix for issue #597.
// This captures the SQL boundary; public PostgreSQL acceptance verifies real DDL.
function terminalRecord({ total = 2, elapsed = [1, 2], remaining = [3, 2],
  ended = ['100', '1', '2'], status = 'paused' } = {}) {
  return {
    id: 'activity:exact-lifecycle-test',
    route_plan_execution_id: 'route-execution:exact-lifecycle-test',
    plan_step_ordinal: 0,
    series_ordinal: 0,
    predecessor_activity_execution_id: null,
    activity_snapshot: { completion_model_snapshot: {
      kind: 'fixed_exact', fixed_duration: { numerator: String(total), denominator: '1' },
    } },
    original_total_minutes: total,
    cumulative_elapsed_numerator: elapsed[0],
    cumulative_elapsed_denominator: elapsed[1],
    remaining_time_numerator: remaining[0],
    remaining_time_denominator: remaining[1],
    next_attempt_ordinal: 1,
    status,
    state_version: 2,
    updated_change_set_id: 'change-set:exact-lifecycle-test',
    terminal_change_set_id: status === 'paused' ? null : 'change-set:exact-lifecycle-test',
    started_at_whole_minutes: '100',
    started_at_subminute_numerator: '0',
    started_at_subminute_denominator: '1',
    last_processed_at_whole_minutes: ended[0],
    last_processed_at_subminute_numerator: ended[1],
    last_processed_at_subminute_denominator: ended[2],
    next_boundary_at_whole_minutes: null,
    next_boundary_at_subminute_numerator: null,
    next_boundary_at_subminute_denominator: null,
    progress: {},
    terminal_reason_code: status === 'paused' ? 'interrupted' : 'completed',
  };
}

async function captureLifecycle(record) {
  const calls = [];
  const tx = { async query(sql, params) {
    calls.push({ sql, params: structuredClone(params) });
    return { rowCount: 1, rows: [] };
  } };
  const finalize = await applySealedLifecycleInsert(tx, {
    target_table: 'party_timed_activity_executions', record,
  });
  assert.equal(typeof finalize, 'function');
  const insertion = calls[0];
  const match = insertion.sql.match(/INSERT\s+INTO\s+party_runtime\."party_timed_activity_executions"\s*\(([^)]*)\)\s*VALUES\s*\(([^)]*)\)/u);
  assert.ok(match, 'capture the real activity INSERT');
  const columns = match[1].split(',').map((column) => column.trim().replaceAll('"', ''));
  const bindings = match[2].split(',').map((value) => value.trim());
  const initial = Object.fromEntries(columns.map((column, index) => {
    assert.match(bindings[index], /^\$\d+$/u);
    return [column, insertion.params[Number(bindings[index].slice(1)) - 1]];
  }));
  return { initial, async finish() {
    await finalize();
    const update = calls[1];
    assert.match(update.sql, /WHERE\s+id=\$1\s+AND\s+status='active'\s+AND\s+state_version=1/u,
      'the existing initial-state CAS stays in force');
    assert.equal(update.params[0], record.id);
    const set = update.sql.match(/\bSET\b([\s\S]+?)\bWHERE\b/u)?.[1];
    assert.ok(set, 'capture the real activity UPDATE');
    const assignments = Object.fromEntries([...set.matchAll(/"?(\w+)"?\s*=\s*\$(\d+)/gu)]
      .map((match) => [match[1], update.params[Number(match[2]) - 1]]));
    return { assignments, persisted: { ...initial, ...assignments } };
  } };
}

function assertTimePairs(actual, expected) {
  for (const field of ['cumulative_elapsed_numerator', 'cumulative_elapsed_denominator',
    'remaining_time_numerator', 'remaining_time_denominator']) {
    assert.ok(Object.hasOwn(actual, field), `final UPDATE must write ${field}, issue #597`);
    assert.equal(String(actual[field]), String(expected[field]), field);
  }
}

function assertTerminalBoundary(persisted, terminal) {
  for (const field of ['last_processed_at_whole_minutes', 'last_processed_at_subminute_numerator',
    'last_processed_at_subminute_denominator', 'next_boundary_at_whole_minutes',
    'next_boundary_at_subminute_numerator', 'next_boundary_at_subminute_denominator',
    'status', 'state_version', 'terminal_change_set_id']) {
    assert.equal(persisted[field], terminal[field], field);
  }
}

test('issue #597: integer completed lifecycle remains a positive control', async () => {
  const terminal = terminalRecord({ elapsed: [2, 1], remaining: [0, 1],
    ended: ['102', '0', '1'], status: 'completed' });
  const { initial, finish } = await captureLifecycle(terminal);
  assert.equal(initial.status, 'active');
  assert.equal(initial.state_version, 1);
  assert.equal(initial.next_attempt_ordinal, 0);
  assert.equal(initial.terminal_change_set_id, null);
  assert.equal(String(initial.cumulative_elapsed_numerator), '0');
  assert.equal(String(initial.cumulative_elapsed_denominator), '1');
  assert.equal(String(initial.remaining_time_numerator), '2');
  assert.equal(String(initial.remaining_time_denominator), '1');
  assert.equal(initial.last_processed_at_whole_minutes, '100');
  assert.equal(initial.next_boundary_at_whole_minutes, '102');
  const { persisted } = await finish();
  assertTimePairs(persisted, terminal);
  assertTerminalBoundary(persisted, terminal);
});

for (const [name, terminal] of [
  ['half minute', terminalRecord()],
  ['public wait denominator 312500', terminalRecord({ total: 1440,
    elapsed: [180000009, 312500], remaining: [269999991, 312500],
    ended: ['676', '9', '312500'] })],
]) {
  test(`expected red, issue #597: ${name} starts with reduced zero and full remaining`, async () => {
    const before = structuredClone(terminal);
    const { initial } = await captureLifecycle(terminal);
    assert.deepEqual(terminal, before, 'lifecycle projection must not rewrite its terminal input');
    assert.equal(String(initial.cumulative_elapsed_numerator), '0');
    assert.equal(String(initial.cumulative_elapsed_denominator), '1',
      'initial zero must be 0/1 to satisfy the real gcd CHECK');
    assert.equal(String(initial.remaining_time_numerator), String(terminal.original_total_minutes));
    assert.equal(String(initial.remaining_time_denominator), '1',
      'initial remaining represents the full integral duration');
    assert.equal(initial.last_processed_at_whole_minutes, terminal.started_at_whole_minutes);
    assert.equal(initial.last_processed_at_subminute_numerator, terminal.started_at_subminute_numerator);
    assert.equal(initial.last_processed_at_subminute_denominator, terminal.started_at_subminute_denominator);
    assert.equal(initial.next_boundary_at_whole_minutes, String(100 + terminal.original_total_minutes));
    assert.equal(initial.next_boundary_at_subminute_numerator, '0');
    assert.equal(initial.next_boundary_at_subminute_denominator, '1');
  });
  test(`expected red, issue #597: ${name} finalizer writes complete exact terminal pairs`, async () => {
    const { finish } = await captureLifecycle(terminal);
    const { assignments, persisted } = await finish();
    assertTimePairs(assignments, terminal);
    assertTimePairs(persisted, terminal);
    assertTerminalBoundary(persisted, terminal);
  });
}
