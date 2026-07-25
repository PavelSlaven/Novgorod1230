import { computeSpatialV3CanonicalDigest, createSpatialV3TypedError } from '@rus/contracts/spatial-v3/registry';

const RESOURCE_SQL = Object.freeze({
  spatial_state: { table: 'party_runtime.party_journey_locations', id: 'id', order: 'id', versioned: true },
  plans: { table: 'party_runtime.party_route_plans', id: 'id', order: 'id', versioned: true },
  executions: { table: 'party_runtime.party_route_plan_executions', id: 'id', order: 'id', versioned: true },
  frontiers: { table: 'party_runtime.expansion_frontiers', id: 'id', order: 'id', versioned: true },
  carriers: { table: 'party_runtime.party_carrier_attachments', id: 'id', order: 'id', versioned: true },
  histories: { table: 'party_runtime.party_route_plan_execution_events', id: 'execution_id', order: 'execution_id, event_ordinal', versioned: false }
});
const clone = (value) => structuredClone(value);
const pins = (entity_id) => Object.freeze({ pins: Object.freeze([{ dependency_role: 'planning_context_dependency', entity_ref: { entity_kind: 'party_change_set', entity_id }, version_pin: { pin_kind: 'party_state_version', state_version: 1 } }]), canonical_digest: computeSpatialV3CanonicalDigest([{ dependency_role: 'planning_context_dependency', entity_ref: { entity_kind: 'party_change_set', entity_id }, version_pin: { pin_kind: 'party_state_version', state_version: 1 } }]).replace('sha256:', '') });
function failure(code, _entity_kind, entity_id, diagnostics = {}) { const id = entity_id || 'unknown'; return Object.freeze({ ok: false, error: createSpatialV3TypedError(code, { subject_ref: { entity_kind: 'party_change_set', entity_id: id }, dependency_pins: pins(id), diagnostics }) }); }
function requireTransaction(transaction) { return transaction && typeof transaction.query === 'function'; }
function text(value) { return typeof value === 'string' && value.trim() ? value.trim() : null; }

/** A deliberately non-semantic repository: it only loads or persists declared rows. */
export function createSpatialV3PartyRepository({ transaction } = {}) {
  async function load({ resource, party_id, id = null, expected_state_version = null } = {}, context = {}) {
    const tx = context.transaction ?? transaction;
    if (!RESOURCE_SQL[resource] || !text(party_id)) return failure('generated_schema_mismatch', 'party', text(party_id) ?? 'unknown', { resource });
    if (!requireTransaction(tx)) return failure('generated_schema_mismatch', 'party', party_id, { reason: 'active transaction is required' });
    const definition = RESOURCE_SQL[resource]; const params = [party_id];
    const where = ['party_id = $1'];
    if (id != null) { if (!text(id)) return failure('generated_schema_mismatch', 'party', party_id, { id }); params.push(id); where.push(`${definition.id} = $${params.length}`); }
    if (expected_state_version != null) { if (!definition.versioned || !Number.isInteger(expected_state_version) || expected_state_version < 0) return failure('state_version_conflict', 'party', party_id, { expected_state_version }); params.push(expected_state_version); where.push(`state_version = $${params.length}`); }
    const result = await tx.query(`SELECT * FROM ${definition.table} WHERE ${where.join(' AND ')} ORDER BY ${definition.order} ASC`, params);
    if (id != null && result.rows.length !== 1) return failure(expected_state_version == null ? 'route_plan_snapshot_missing' : 'state_version_conflict', 'party', party_id, { resource, id });
    return Object.freeze({ ok: true, rows: Object.freeze(result.rows.map((row) => Object.freeze(clone(row)))) });
  }
  async function persistKnownShapeForbidden({ resource, party_id, record } = {}, context = {}) {
    const tx = context.transaction ?? transaction;
    if (!RESOURCE_SQL[resource] || !text(party_id) || !record || typeof record !== 'object' || Array.isArray(record)) return failure('generated_schema_mismatch', 'party', text(party_id) ?? 'unknown', { resource });
    if (!requireTransaction(tx)) return failure('generated_schema_mismatch', 'party', party_id, { reason: 'active transaction is required' });
    if (record.party_id !== party_id || !text(record[RESOURCE_SQL[resource].id])) return failure('journey_location_ownership_mismatch', 'party', party_id, { resource });
    const entries = Object.entries(record); const columns = entries.map(([key]) => key); const values = entries.map(([, value]) => value);
    const sql = `INSERT INTO ${RESOURCE_SQL[resource].table} (${columns.join(', ')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})`;
    await tx.query(sql, values);
    return Object.freeze({ ok: true, record: Object.freeze(clone(record)) });
  }
  async function loadHistory({ party_id, execution_id, event_ordinal = null } = {}, context = {}) {
    const tx = context.transaction ?? transaction;
    if (!text(party_id) || !text(execution_id) || !requireTransaction(tx) || (event_ordinal != null && (!Number.isInteger(event_ordinal) || event_ordinal < 0))) return failure('generated_schema_mismatch', 'party', party_id ?? 'unknown', { resource: 'histories' });
    const params = [party_id, execution_id]; const where = ['party_id=$1', 'execution_id=$2']; if (event_ordinal != null) { params.push(event_ordinal); where.push('event_ordinal=$3'); }
    const result = await tx.query(`SELECT execution_id,event_ordinal,event_kind,from_status,to_status,step_ordinal,location_snapshot,causal_result_ref,change_set_id,idempotency_record_id,occurred_at_turn FROM party_runtime.party_route_plan_execution_events WHERE ${where.join(' AND ')} ORDER BY execution_id,event_ordinal`, params);
    if (event_ordinal != null && result.rows.length !== 1) return failure('route_plan_snapshot_missing', 'party', party_id, { execution_id, event_ordinal });
    return Object.freeze({ ok: true, rows: Object.freeze(result.rows.map((row) => Object.freeze(clone(row)))) });
  }
  async function exactRead({ party_id, id, sql, params, missing = 'route_plan_snapshot_missing' } = {}, context = {}) {
    const tx = context.transaction ?? transaction;
    if (!text(party_id) || !text(id) || !requireTransaction(tx)) {
      return failure('generated_schema_mismatch', 'party', party_id ?? 'unknown', { id });
    }
    const result = await tx.query(sql, params);
    if (result.rows.length !== 1) return failure(missing, 'party', party_id, { id });
    return Object.freeze({ ok: true, row: Object.freeze(clone(result.rows[0])) });
  }
  const loadPerceptionReplay = ({ party_id, perception_id } = {}, context = {}) =>
    exactRead({
      party_id,
      id: perception_id,
      params: [party_id, perception_id],
      sql: `SELECT
        p.perception_id,p.party_id,p.event_id,p.perceiver_kind,p.perceiver_id,p.result_kind,
        p.perceived_at_whole_minutes,p.perceived_at_subminute_numerator,p.perceived_at_subminute_denominator,
        p.recognition_policy_ref,p.visibility_policy_ref,p.canonical_digest AS perception_digest,
        p.signal_refs,p.knowledge_update_refs,p.change_set_id,p.idempotency_record_id,
        r.canonical_input_digest,r.expected_state_versions_digest,r.dependency_pins_digest,
        r.policy_versions_digest,r.idempotency_key,r.canonical_digest AS replay_digest
      FROM party_runtime.party_perception_records p
      JOIN party_runtime.party_perception_replay_evidence r
        ON r.party_id=p.party_id AND r.perception_id=p.perception_id
      WHERE p.party_id=$1 AND p.perception_id=$2`
    }, context);
  const loadReactionConsequence = ({ party_id, request_id } = {}, context = {}) =>
    exactRead({
      party_id,
      id: request_id,
      params: [party_id, request_id],
      sql: `SELECT
        request_id,party_id,npc_id,perception_id,option_id,command_ref,handler_id,
        consequence_contract_name,consequence_payload,state_version,
        proposed_at_whole_minutes,proposed_at_subminute_numerator,proposed_at_subminute_denominator,
        dependency_pins,canonical_input_digest,canonical_digest,change_set_id,idempotency_key
      FROM party_runtime.party_npc_reaction_consequences
      WHERE party_id=$1 AND request_id=$2`
    }, context);
  const loadReactionOptionProposal = ({ party_id, request_id } = {}, context = {}) =>
    exactRead({
      party_id,
      id: request_id,
      params: [party_id, request_id],
      sql: `SELECT
        request_id,party_id,npc_id,source_perception_id,state_version,
        options_digest,proposal,dependency_pins,canonical_digest,
        idempotency_key,change_set_id
      FROM party_runtime.party_npc_reaction_option_proposals
      WHERE party_id=$1 AND request_id=$2`
    }, context);
  const loadKnowledgeMergeResult = ({ party_id, proposal_id } = {}, context = {}) =>
    exactRead({
      party_id,
      id: proposal_id,
      params: [party_id, proposal_id],
      sql: `SELECT
        proposal_id,party_id,npc_id,source_perception_id,state_version_before,
        state_version_after,state_changed,proposal,state_before_fact_refs,
        state_before_hypothesis_refs,accepted_fact_refs,accepted_hypothesis_refs,
        dependency_pins,result_digest,change_set_id,idempotency_key
      FROM party_runtime.party_npc_knowledge_merge_results
      WHERE party_id=$1 AND proposal_id=$2`
    }, context);
  async function loadKnowledgeState({ party_id, npc_id, expected_state_version = null } = {}, context = {}) {
    const tx = context.transaction ?? transaction;
    if (!text(party_id) || !text(npc_id) || !requireTransaction(tx)
      || (expected_state_version != null
        && (!Number.isInteger(expected_state_version) || expected_state_version < 1))) {
      return failure('generated_schema_mismatch', 'party', party_id ?? 'unknown', { npc_id });
    }
    const params = [party_id, npc_id];
    const versionClause = expected_state_version == null
      ? ''
      : ` AND state_version=$${params.push(expected_state_version)}`;
    const state = await tx.query(`SELECT
      party_id,npc_id,state_version,last_proposal_id,last_result_digest,updated_change_set_id
      FROM party_runtime.party_npc_knowledge_merge_states
      WHERE party_id=$1 AND npc_id=$2${versionClause}`, params);
    if (state.rows.length !== 1) {
      return failure(
        expected_state_version == null ? 'route_plan_snapshot_missing' : 'state_version_conflict',
        'party',
        party_id,
        { npc_id, expected_state_version }
      );
    }
    const knowledge = await tx.query(`SELECT
      fact_id,knowledge_ref_kind,knowledge_classification,source_perception_id,
      proposal_id,merge_state_version,result_digest,dependency_pins,updated_change_set_id
      FROM party_runtime.party_npc_knowledge
      WHERE party_id=$1 AND npc_id=$2 AND target_contract_version='4.4.0-target.1'
      ORDER BY knowledge_ref_kind,fact_id`, [party_id, npc_id]);
    return Object.freeze({
      ok: true,
      state: Object.freeze(clone(state.rows[0])),
      knowledge: Object.freeze(knowledge.rows.map((row) => Object.freeze(clone(row))))
    });
  }
  const persist = async ({ party_id } = {}) => failure('generated_schema_mismatch', 'party', party_id ?? 'unknown', { reason: 'P16 repositories are read-only; only CombinedAtomicCommitter writes.' });
  return Object.freeze({ load, persist, loadSpatialState: (input, context) => load({ ...input, resource: 'spatial_state' }, context), loadPlan: (input, context) => load({ ...input, resource: 'plans' }, context), loadExecution: (input, context) => load({ ...input, resource: 'executions' }, context), loadFrontier: (input, context) => load({ ...input, resource: 'frontiers' }, context), loadCarrier: (input, context) => load({ ...input, resource: 'carriers' }, context), loadHistory, loadPerceptionReplay, loadReactionOptionProposal, loadReactionConsequence, loadKnowledgeMergeResult, loadKnowledgeState });
}
