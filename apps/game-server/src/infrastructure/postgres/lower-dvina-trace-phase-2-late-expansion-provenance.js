import { phase2IntegrityError } from './lower-dvina-trace-phase-2-read.js';

export { phase2IntegrityError };

/** Validate lineage for every late row admitted into the authored-start v0 read. */
export function assertPhase2LateExpansionRunProvenance({
  partyId, runs = [], changeSets = [], consumedRows = []
} = {}) {
  const fail = () => { throw phase2IntegrityError(); };
  if (typeof partyId !== 'string' || !Array.isArray(runs)
      || !Array.isArray(changeSets) || !Array.isArray(consumedRows)) fail();
  const changeSetById = new Map();
  for (const changeSet of changeSets) {
    if (!changeSet || typeof changeSet.id !== 'string'
        || changeSetById.has(changeSet.id)) fail();
    changeSetById.set(changeSet.id, changeSet);
  }
  const byRun = new Map();
  const invalidRunIds = new Set();
  const orderedRuns = [...runs].sort((left, right) =>
    String(left?.committed_at ?? left?.created_at ?? '').localeCompare(
      String(right?.committed_at ?? right?.created_at ?? ''))
      || String(left?.run_id ?? '').localeCompare(String(right?.run_id ?? '')));
  for (const run of orderedRuns) {
    if (run?.run_kind !== 'expansion' || run.status !== 'committed') {
      if (typeof run?.run_id === 'string') invalidRunIds.add(run.run_id);
      continue;
    }
    const changeSetId = run?.trace?.created_change_set_id;
    const changeSet = changeSetById.get(changeSetId);
    if (run?.party_id !== partyId || typeof run.run_id !== 'string'
        || run.run_kind !== 'expansion' || run.status !== 'committed'
        || run.trace?.party_id !== partyId || run.trace?.run_id !== run.run_id
        || typeof changeSetId !== 'string' || changeSetId.length === 0
        || !changeSet || changeSet.party_id !== partyId
        || changeSet.operation_kind !== 'resolve_frontier'
        || !Array.isArray(run.created_refs) || byRun.has(run.run_id)) fail();
    const refs = new Set();
    for (const ref of run.created_refs) {
      if (typeof ref?.table !== 'string' || typeof ref.id !== 'string') fail();
      const key = `${ref.table}\0${ref.id}`;
      if (refs.has(key)) fail();
      refs.add(key);
    }
    byRun.set(run.run_id, { run, change_set_id: changeSetId, refs,
      consumed_rows: [] });
  }
  const consumed = new Set();
  for (const row of consumedRows) {
    if (typeof row?.run_id !== 'string' || row.party_id !== partyId
        || typeof row.table !== 'string' || typeof row.id !== 'string') fail();
    const owner = byRun.get(row.run_id);
    const rowKey = `${row.table}\0${row.id}`;
    if (invalidRunIds.has(row.run_id) || !owner || !owner.refs.has(rowKey) || consumed.has(rowKey)
        || (row.created_change_set_id != null
          && row.created_change_set_id !== owner.change_set_id)
        || (row.updated_change_set_id != null
          && row.updated_change_set_id !== owner.change_set_id)) fail();
    if (row.table === 'party_ordinary_materialization_aggregates') {
      if (row.scope_kind == null || row.scope_id == null
          || row.id !== `${partyId}:${row.scope_kind}:${row.scope_id}`) fail();
    }
    consumed.add(rowKey);
    owner.consumed_rows.push(row);
  }
  return new Map([...byRun].map(([runId, value]) => [runId, Object.freeze({
    ...value.run,
    created_change_set_id: value.change_set_id,
    consumed_rows: Object.freeze([...value.consumed_rows])
  })]));
}

/** Validate scene rows read for movement disclosure against their exact writer. */
export function assertPhase2SceneRowsProvenance({ partyId, rows = [],
  baselineRun, baselineChangeSetId, baselineSceneRefs = [],
  expansionRuns = [], changeSets = [] } = {}) {
  const fail = () => { throw phase2IntegrityError(); };
  if (typeof partyId !== 'string' || !Array.isArray(rows)
      || !baselineRun || baselineRun.party_id !== partyId
      || baselineRun.run_kind !== 'baseline' || baselineRun.status !== 'committed'
      || baselineRun.trace?.run_id !== baselineRun.run_id
      || !Array.isArray(baselineRun.created_refs)) fail();
  if (typeof baselineChangeSetId !== 'string' || baselineChangeSetId === '') fail();
  const baselineChangeSets = changeSets.filter(({ id }) => id === baselineChangeSetId);
  if (baselineChangeSets.length !== 1
      || baselineChangeSets[0].party_id !== partyId
      || baselineChangeSets[0].operation_kind !== 'new_game') fail();
  if (!Array.isArray(baselineSceneRefs)) fail();
  const baselineRefs = new Set(baselineSceneRefs.map((ref) => {
    if (typeof ref?.table !== 'string' || typeof ref.id !== 'string') fail();
    return `${ref.table}\0${ref.id}`;
  }));
  if (baselineRefs.size !== baselineSceneRefs.length) fail();
  const runByChangeSet = new Map();
  for (const run of expansionRuns) {
    const changeSetId = run?.trace?.created_change_set_id;
    if (typeof changeSetId !== 'string' || runByChangeSet.has(changeSetId)) fail();
    runByChangeSet.set(changeSetId, run);
  }
  const seen = new Set();
  const lateRows = [];
  for (const row of rows) {
    if (row?.party_id !== partyId || typeof row.table !== 'string'
        || typeof row.id !== 'string' || typeof row.created_change_set_id !== 'string'
        || row.updated_change_set_id !== row.created_change_set_id) fail();
    const key = `${row.table}\0${row.id}`;
    if (seen.has(key)) fail();
    seen.add(key);
    const run = runByChangeSet.get(row.created_change_set_id);
    if (run) {
      lateRows.push({ ...row, run_id: run.run_id });
    } else if (row.created_change_set_id !== baselineChangeSetId
        || !baselineRefs.has(key)) fail();
  }
  assertPhase2LateExpansionRunProvenance({ partyId, runs: expansionRuns,
    changeSets,
    consumedRows: lateRows });
  return true;
}
