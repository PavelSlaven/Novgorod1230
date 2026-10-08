import { createPostgresOrdinaryMaterializationAggregateStore } from
  './ordinary-materialization-aggregate-store.js';
import { loadLowerDvinaTraceItems } from
  '@rus/party-store/internal/lower-dvina-trace-phase-1a';
import { assertPhase2LateExpansionRunProvenance, assertPhase2SceneRowsProvenance,
  phase2IntegrityError } from
  './lower-dvina-trace-phase-2-late-expansion-provenance.js';
import { canonicalDigest } from '@rus/materialization';
import { createLowerDvinaTracePhase1ARepository } from
  '@rus/party-store/internal/lower-dvina-trace-phase-1a';

const AUTHORED_START_SNAPSHOT_FIELDS = [
  'party_state_version', 'world_revision_id', 'world_catalog_digest',
  'session_party_id', 'session_state_version', 'turn_number', 'last_turn_id',
  'delivery_ack_result', 'stage26_result', 'screen', 'state_payload',
  'state_digest', 'body_state_version', 'body_health', 'body_energy',
  'body_satiety', 'body_updated_change_set_id', 'clock_state_version'
];

export function assertAuthoredStartV0SessionSnapshot({ partyId, row, current } = {}) {
  if (typeof partyId !== 'string' || !row || !current
      || row.session_party_id !== partyId || current.session_party_id !== partyId
      || Number(row.party_state_version) !== 0
      || Number(current.party_state_version) !== 0
      || Number(row.turn_number) !== 0 || Number(current.turn_number) !== 0
      || row.last_turn_id != null || current.last_turn_id != null
      || row.delivery_ack_result?.pass !== true
      || current.delivery_ack_result?.pass !== true
      || AUTHORED_START_SNAPSHOT_FIELDS.some((field) =>
        canonicalDigest({ value: row[field] })
          !== canonicalDigest({ value: current[field] }))) {
    throw phase2IntegrityError();
  }
  return true;
}

export async function loadAuthoredStartLateExpansionState({
  transaction, partyId, baselineRunId
} = {}) {
  if (typeof transaction?.query !== 'function') throw phase2IntegrityError();
  if (typeof baselineRunId !== 'string' || baselineRunId === '') {
    throw phase2IntegrityError();
  }
  const allRuns = (await transaction.query(
    `SELECT party_id,run_id,run_kind,status,trace,created_refs,created_at,committed_at
       FROM party_runtime.party_materialization_runs
      WHERE party_id=$1
      ORDER BY committed_at NULLS FIRST,created_at,run_id`, [partyId]
  )).rows;
  const baselineRuns = allRuns.filter(({ run_id }) => run_id === baselineRunId);
  if (baselineRuns.length !== 1 || baselineRuns[0].run_kind !== 'baseline'
      || baselineRuns[0].status !== 'committed') throw phase2IntegrityError();
  const baselineRun = baselineRuns[0];
  const runs = allRuns.filter(({ run_id }) => run_id !== baselineRunId);
  const items = await loadLowerDvinaTraceItems(transaction.query.bind(transaction),
    partyId, runs.map(({ run_id }) => run_id));
  if (items.some((item) => item.placement_item_id !== item.item_id
      || typeof item.ownership_id !== 'string' || item.ownership_id === '')) {
    throw phase2IntegrityError();
  }
  const baselineScene = await createLowerDvinaTracePhase1ARepository({
    query: transaction.query.bind(transaction)
  }).loadSceneRefs(partyId);
  if (!Array.isArray(baselineScene?.refs)
      || typeof baselineScene.change_set_id !== 'string') throw phase2IntegrityError();
  const changeSetIds = [...allRuns.map((run) => run?.trace?.created_change_set_id),
    baselineScene.change_set_id]
    .filter((id) => typeof id === 'string');
  const changeSets = changeSetIds.length === 0 ? [] : (await transaction.query(
    `SELECT id,party_id,operation_kind
       FROM party_runtime.party_v3_change_sets
      WHERE party_id=$1 AND id=ANY($2::text[]) ORDER BY id`,
    [partyId, [...new Set(changeSetIds)]]
  )).rows;
  const consumedRows = [];
  for (const item of items) {
    consumedRows.push({ run_id: item.run_id, party_id: partyId,
      table: 'party_items', id: item.item_id,
      created_change_set_id: item.item_created_change_set_id,
      updated_change_set_id: item.item_updated_change_set_id });
    consumedRows.push({ run_id: item.run_id, party_id: partyId,
      table: 'party_item_placements', id: item.item_id,
      created_change_set_id: item.placement_created_change_set_id,
      updated_change_set_id: item.placement_updated_change_set_id });
    consumedRows.push({ run_id: item.run_id, party_id: partyId,
      table: 'party_ownership', id: item.ownership_id,
      created_change_set_id: item.ownership_created_change_set_id,
      updated_change_set_id: item.ownership_updated_change_set_id });
  }
  const aggregateStore = createPostgresOrdinaryMaterializationAggregateStore();
  for (const run of runs) {
    for (const ref of run.created_refs ?? []) {
      if (ref?.table !== 'party_ordinary_materialization_aggregates') continue;
      const scope = parseAggregateScope(partyId, ref.id);
      if (!scope) throw phase2IntegrityError();
      const loaded = await aggregateStore.load({ transaction, party_id: partyId,
        scope_ref: scope });
      if (loaded.status !== 'present') throw phase2IntegrityError();
      consumedRows.push({ run_id: run.run_id, party_id: partyId,
        table: ref.table, id: ref.id, scope_kind: scope.entity_kind,
        scope_id: scope.entity_id });
    }
  }
  return Object.freeze({ baselineRun, runs, changeSets, items,
    validate(extraRows = []) {
      return assertPhase2LateExpansionRunProvenance({ partyId, runs, changeSets,
        consumedRows: [...consumedRows, ...extraRows] });
    },
    validateSceneRows(rows = []) {
      return assertPhase2SceneRowsProvenance({ partyId, rows, baselineRun,
        baselineChangeSetId: baselineScene.change_set_id,
        baselineSceneRefs: baselineScene.refs, expansionRuns: runs, changeSets });
    }
  });
}

function parseAggregateScope(partyId, refId) {
  const prefix = `${partyId}:`;
  if (typeof refId !== 'string' || !refId.startsWith(prefix)) return null;
  const rest = refId.slice(prefix.length);
  const separator = rest.indexOf(':');
  if (separator < 1 || separator === rest.length - 1) return null;
  return { entity_kind: rest.slice(0, separator), entity_id: rest.slice(separator + 1) };
}
