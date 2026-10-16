import assert from 'node:assert/strict';
import test from 'node:test';
import { assertPhase2LateExpansionRunProvenance,
  assertPhase2SceneRowsProvenance } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-2-late-expansion-provenance.js';
import { loadAuthoredStartLateExpansionState } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-2-authored-start.js';

const partyId = 'party:authored-start';

// The reader's authored-start v3 / state_version 0 / attached-session gate is
// exercised by the existing pinned arrival E2E. This file isolates the late
// expansion provenance decision consumed by that reader path.

function run(runId, changeSetId, { runKind = 'expansion', status = 'committed',
  createdRefs = [], trace = {} } = {}) {
  return {
    party_id: partyId,
    run_id: runId,
    run_kind: runKind,
    status,
    trace: { run_id: runId, party_id: partyId,
      created_change_set_id: changeSetId, ...trace },
    created_refs: createdRefs,
  };
}

function changeSet(id, party = partyId) {
  return { id, party_id: party, operation_kind: 'resolve_frontier' };
}

function createdRef(table, id) { return { table, id }; }

const priorRun = run('trace:prior-topology', 'change:prior-topology', {
  createdRefs: [createdRef('party_g5_sites', 'site:prior')],
  trace: { trigger: 'frontier_resolution' },
});
const currentRun = run('trace:current-expansion', 'change:current-expansion', {
  createdRefs: [createdRef('party_ordinary_materialization_aggregates',
    'party:authored-start:g6:g6:current')],
  trace: { trigger: 'frontier_resolution' },
});
const validRuns = [priorRun, currentRun];
const validChangeSets = [
  changeSet('change:prior-topology'),
  changeSet('change:current-expansion'),
];
const validConsumedRows = [
  { run_id: priorRun.run_id, party_id: partyId, table: 'party_g5_sites',
    id: 'site:prior', created_change_set_id: 'change:prior-topology',
    updated_change_set_id: 'change:prior-topology' },
  { run_id: currentRun.run_id, party_id: partyId,
    table: 'party_ordinary_materialization_aggregates',
    id: 'party:authored-start:g6:g6:current',
    created_change_set_id: 'change:current-expansion',
    updated_change_set_id: 'change:current-expansion',
    scope_kind: 'g6', scope_id: 'g6:current' },
];

function validate({ runs = validRuns, changeSets = validChangeSets,
  consumedRows = validConsumedRows } = {}) {
  return assertPhase2LateExpansionRunProvenance({
    partyId, runs, changeSets, consumedRows,
  });
}

test('Phase2 v0 authored-start admits both committed expansion runs and their exact created rows', () => {
  const admitted = validate();
  assert.deepEqual([...admitted.keys()].sort(), [
    'trace:current-expansion', 'trace:prior-topology',
  ]);
  assert.equal(admitted.get('trace:prior-topology').run_kind, 'expansion');
  assert.equal(admitted.get('trace:current-expansion').run_kind, 'expansion');
});

test('a repeated same-exit attempt with a reused frontier reads one committed run once', () => {
  const singleRunRows = validConsumedRows.filter(({ run_id }) =>
    run_id === priorRun.run_id);
  const admitted = validate({ runs: [priorRun],
    changeSets: [validChangeSets[0]], consumedRows: singleRunRows });
  assert.deepEqual([...admitted.keys()], [priorRun.run_id]);
  assert.equal(admitted.get(priorRun.run_id).consumed_rows.length, 1);
});

test('two committed runs do not read the same entity twice and preserve commit order', () => {
  const earlier = { ...priorRun, committed_at: '2026-01-01T00:00:00Z' };
  const later = { ...currentRun, committed_at: '2026-01-02T00:00:00Z' };
  const admitted = validate({ runs: [later, earlier] });
  assert.deepEqual([...admitted.keys()], [earlier.run_id, later.run_id]);
  const ids = [...admitted.values()].flatMap(({ consumed_rows }) =>
    consumed_rows.map(({ table, id }) => `${table}:${id}`));
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(JSON.stringify(validate({ runs: [earlier, later] })),
    JSON.stringify(admitted));
});

test('a consumed spatial movement edge must belong to a committed expansion change set', () => {
  const runWithEdge = { ...priorRun, created_refs: [
    ...priorRun.created_refs, createdRef('scene_movement_edges', 'edge:late')
  ] };
  const edge = { run_id: runWithEdge.run_id, party_id: partyId,
    table: 'scene_movement_edges', id: 'edge:late',
    created_change_set_id: 'change:prior-topology',
    updated_change_set_id: 'change:prior-topology' };
  assert.equal(validate({ runs: [runWithEdge, currentRun],
    consumedRows: [...validConsumedRows, edge] }).has(runWithEdge.run_id), true);
  assert.throws(() => validate({ runs: [runWithEdge, currentRun],
    consumedRows: [...validConsumedRows, { ...edge, id: 'edge:unlisted' }] }),
  { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' });
  assert.throws(() => validate({ runs: [runWithEdge, currentRun],
    changeSets: [changeSet('change:prior-topology', partyId),
      { ...validChangeSets[1], operation_kind: 'other' }],
    consumedRows: [...validConsumedRows, edge] }),
  { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' });
});

test('spatial disclosure rows require exact baseline or expansion ownership', () => {
  const baselineRun = { party_id: partyId, run_id: 'trace:baseline',
    run_kind: 'baseline', status: 'committed',
    trace: { party_id: partyId, run_id: 'trace:baseline',
      created_change_set_id: 'change:baseline' },
    created_refs: [{ domain: 'g5_node', instance_id: 'node:baseline' }] };
  const baselineSceneRefs = [
    { table: 'scene_movement_edges', id: 'edge:baseline' },
    { table: 'entity_placements', id: 'item:baseline' },
    { table: 'party_actor_profile_bindings', id: 'player:actor' },
    { table: 'party_ownership', id: 'ownership:baseline' },
  ];
  const row = { party_id: partyId, table: 'scene_movement_edges', id: 'edge:late',
    created_change_set_id: 'change:prior-topology',
    updated_change_set_id: 'change:prior-topology' };
  const priorWithEdge = { ...priorRun, created_refs: [
    ...priorRun.created_refs, createdRef('scene_movement_edges', 'edge:late')
  ] };
  assert.equal(assertPhase2SceneRowsProvenance({ partyId, baselineRun,
    baselineChangeSetId: 'change:baseline', baselineSceneRefs,
    expansionRuns: [priorWithEdge, currentRun],
    changeSets: [...validChangeSets,
      { id: 'change:baseline', party_id: partyId, operation_kind: 'new_game' }],
    rows: [row, { ...row, id: 'edge:baseline',
      created_change_set_id: 'change:baseline',
      updated_change_set_id: 'change:baseline' }] }), true);
  for (const invalid of [
    { ...row, id: 'edge:unlisted' },
    { ...row, updated_change_set_id: 'change:foreign' },
    { ...row, created_change_set_id: 'change:foreign',
      updated_change_set_id: 'change:foreign' }
  ]) {
    assert.throws(() => assertPhase2SceneRowsProvenance({ partyId, baselineRun,
      baselineChangeSetId: 'change:baseline', baselineSceneRefs,
      expansionRuns: [priorWithEdge, currentRun],
      changeSets: [...validChangeSets,
        { id: 'change:baseline', party_id: partyId, operation_kind: 'new_game' }],
      rows: [invalid] }), { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' });
  }
  for (const child of [
    { table: 'entity_placements', id: 'item:baseline' },
    { table: 'party_actor_profile_bindings', id: 'player:actor' },
    { table: 'party_ownership', id: 'ownership:baseline' }
  ]) {
    assert.throws(() => assertPhase2SceneRowsProvenance({ partyId, baselineRun,
      baselineChangeSetId: 'change:baseline',
      expansionRuns: [priorWithEdge, currentRun],
      changeSets: [...validChangeSets,
        { id: 'change:baseline', party_id: partyId, operation_kind: 'new_game' }],
      rows: [{ party_id: partyId, ...child,
        created_change_set_id: 'change:baseline',
        updated_change_set_id: 'change:foreign' }] }),
    { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' });
  }
});

test('late visibility links and entity placements require the creating expansion run', () => {
  const link = { party_id: partyId, table: 'visibility_links', id: 'link:late',
    created_change_set_id: 'change:prior-topology', updated_change_set_id: 'change:prior-topology' };
  const placement = { party_id: partyId, table: 'entity_placements', id: 'npc:late',
    created_change_set_id: 'change:prior-topology', updated_change_set_id: 'change:prior-topology' };
  const runWithSceneRows = { ...priorRun, created_refs: [
    ...priorRun.created_refs,
    createdRef('visibility_links', 'link:late'),
    createdRef('entity_placements', 'npc:late')
  ] };
  const validateSceneRows = (rows) => assertPhase2SceneRowsProvenance({
    partyId,
    baselineRun: { party_id: partyId, run_id: 'trace:baseline',
      run_kind: 'baseline', status: 'committed',
      trace: { party_id: partyId, run_id: 'trace:baseline',
        created_change_set_id: 'change:baseline' },
      created_refs: [] },
    baselineChangeSetId: 'change:baseline', baselineSceneRefs: [],
    expansionRuns: [runWithSceneRows, currentRun],
    changeSets: [...validChangeSets,
      { id: 'change:baseline', party_id: partyId, operation_kind: 'new_game' }],
    rows
  });
  assert.equal(validateSceneRows([link, placement]), true);
  for (const invalid of [
    { ...link, id: 'link:foreign' },
    { ...placement, updated_change_set_id: 'change:foreign' },
  ]) {
    assert.throws(() => validateSceneRows([invalid]),
      { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' });
  }
});

test('baseline scene rows require exact refs returned by the Phase1A owner', () => {
  const baselineRun = run('trace:baseline', 'change:baseline', {
    runKind: 'baseline', createdRefs: [
      { domain: 'g5_node', instance_id: 'node:start' },
      { domain: 'npc', instance_id: 'npc:start' },
    ]
  });
  delete baselineRun.trace.party_id;
  delete baselineRun.trace.created_change_set_id;
  const baselineSceneRefs = [
    { table: 'party_g5_sites', id: 'g5:node:start' },
    { table: 'party_scene_baselines', id: 'baseline:node:start' },
    { table: 'party_g6_instances', id: 'g6:start' },
    { table: 'scene_position_nodes', id: 'position:start' },
    { table: 'visibility_links', id: 'link:start' },
    { table: 'entity_placements', id: 'npc:npc:start' },
  ];
  const changeSets = [...validChangeSets,
    { id: 'change:baseline', party_id: partyId, operation_kind: 'new_game' }];
  const rows = baselineSceneRefs.map((ref) => ({ ...ref,
    party_id: partyId, created_change_set_id: 'change:baseline',
    updated_change_set_id: 'change:baseline' }));
  const args = { partyId, rows, baselineRun,
    baselineChangeSetId: 'change:baseline',
    baselineSceneRefs,
    expansionRuns: [priorRun, currentRun], changeSets };
  assert.equal(assertPhase2SceneRowsProvenance(args), true);
  assert.throws(() => assertPhase2SceneRowsProvenance({ ...args,
    rows: [...rows, { party_id: partyId, table: 'visibility_links', id: 'link:foreign',
      created_change_set_id: 'change:baseline', updated_change_set_id: 'change:baseline' }]
  }), { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' });
});

test('empty modifiers pass; any modifier without exact run provenance fails closed', () => {
  const baselineRun = run('trace:baseline', 'change:baseline', {
    runKind: 'baseline', createdRefs: [{ domain: 'g5_node', instance_id: 'node:start' }]
  });
  delete baselineRun.trace.party_id;
  delete baselineRun.trace.created_change_set_id;
  const baselineSceneRefs = [{ table: 'party_g5_sites', id: 'g5:node:start' }];
  const args = { partyId, rows: [], baselineRun,
    baselineChangeSetId: 'change:baseline', baselineSceneRefs,
    expansionRuns: [priorRun, currentRun],
    changeSets: [...validChangeSets,
      { id: 'change:baseline', party_id: partyId, operation_kind: 'new_game' }] };
  assert.equal(assertPhase2SceneRowsProvenance(args), true);
  assert.throws(() => assertPhase2SceneRowsProvenance({ ...args, rows: [{
    party_id: partyId, table: 'visibility_modifiers', id: 'modifier:unowned',
    updated_change_set_id: 'change:baseline'
  }] }), { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' });
});

test('a late materialized item with missing placement or ownership fails before projection', async () => {
  const itemRun = run('trace:item-expansion', 'change:item-expansion', {
    createdRefs: [createdRef('party_items', 'item:late'),
      createdRef('party_item_placements', 'item:late'),
      createdRef('party_ownership', 'ownership:late')],
    trace: { trigger: 'frontier_resolution' },
  });
  const baselineRun = run('trace:baseline', 'change:baseline', {
    runKind: 'baseline', createdRefs: []
  });
  let itemSql;
  const transaction = { async query(sql) {
    if (/FROM party_runtime\.party_materialization_runs/u.test(sql)) {
      return { rows: [baselineRun, itemRun] };
    }
    if (/FROM party_runtime\.party_v3_change_sets/u.test(sql)) {
      return { rows: [changeSet('change:item-expansion')] };
    }
    if (/FROM party_runtime\.party_items i/u.test(sql)) {
      itemSql = sql;
      return { rows: [{ item_id: 'item:late', run_id: itemRun.run_id,
        template_id: 'template', profile_id: 'profile', category_id: 'category',
        quantity: 1, state_version: 0, condition_state: 'intact',
        legal_status: 'ordinary', state: {}, placement_item_id: 'item:late',
        ownership_id: null }] };
    }
    assert.fail(`unexpected SQL: ${sql}`);
  } };
  await assert.rejects(loadAuthoredStartLateExpansionState({
    transaction, partyId, baselineRunId: baselineRun.run_id
  }), { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' });
  assert.match(itemSql, /LEFT JOIN party_runtime\.party_item_placements/u);
  assert.match(itemSql, /LEFT JOIN party_runtime\.party_ownership/u);
});

test('Phase2 v0 authored-start fails closed on foreign party provenance', () => {
  const foreignRun = { ...priorRun, party_id: 'party:foreign' };
  assert.throws(() => validate({ runs: [foreignRun, currentRun] }),
    { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' });
});

test('Phase2 v0 authored-start fails closed unless run is committed expansion provenance', () => {
  for (const changes of [
    { status: 'planned' },
    { runKind: 'baseline' },
    { trace: { trigger: 'frontier_resolution', created_change_set_id: null } },
  ]) {
    const invalidRun = { ...priorRun, ...run(priorRun.run_id,
      'change:prior-topology', { ...changes,
        createdRefs: priorRun.created_refs }) };
    assert.throws(() => validate({ runs: [invalidRun, currentRun] }),
      { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' });
  }
});

test('Phase2 v0 authored-start fails closed on absent or mismatched change set', () => {
  assert.throws(() => validate({ changeSets: [validChangeSets[1]] }),
    { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' });
  const mismatched = [changeSet('change:other'), validChangeSets[1]];
  assert.throws(() => validate({ changeSets: mismatched }),
    { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' });
});

test('Phase2 v0 authored-start fails closed when consumed row is absent from its run created_refs', () => {
  const rows = structuredClone(validConsumedRows);
  rows[0].id = 'site:not-in-prior-run';
  assert.throws(() => validate({ consumedRows: rows }),
    { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' });
});

test('Phase2 v0 authored-start fails closed on a consumed row without a run owner', () => {
  const rows = structuredClone(validConsumedRows);
  delete rows[0].run_id;
  assert.throws(() => validate({ consumedRows: rows }),
    { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' });
});

test('Phase2 v0 authored-start fails closed on a late child with a foreign change set', () => {
  const rows = structuredClone(validConsumedRows);
  rows[0].updated_change_set_id = 'change:foreign';
  assert.throws(() => validate({ consumedRows: rows }),
    { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' });
});

test('Phase2 v0 authored-start fails closed when aggregate scope differs from its created ref', () => {
  const rows = structuredClone(validConsumedRows);
  rows[1].scope_id = 'g6:foreign';
  assert.throws(() => validate({ consumedRows: rows }),
    { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' });
});
