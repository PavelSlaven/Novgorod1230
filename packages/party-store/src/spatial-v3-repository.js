import { computeSpatialV3CanonicalDigest, createSpatialV3TypedError } from '@rus/contracts/spatial-v3/registry';
import { deepFreeze } from '@rus/kernel';

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
  async function loadExpansionState({ party_id, g4_id } = {}, context = {}) {
    const tx = context.transaction ?? transaction;
    if (!text(party_id) || !text(g4_id) || !requireTransaction(tx)) {
      return failure('generated_schema_mismatch', 'party', party_id, {
        reason: 'party, G4 and active transaction are required'
      });
    }
    // One statement gives every normalized component the same MVCC snapshot.
    // Mutation callers hold the existing P16 party/G4 locks before this read.
    const result = await tx.query(`WITH sites AS (
        SELECT * FROM party_runtime.party_g5_sites WHERE party_id=$1 AND parent_g4_id=$2
      ), baselines AS (
        SELECT b.* FROM party_runtime.party_scene_baselines b
        JOIN sites s ON b.host_kind='g5_site' AND b.host_id=s.id WHERE b.party_id=$1
      ), g6 AS (
        SELECT g.* FROM party_runtime.party_g6_instances g
        JOIN baselines b ON b.id=g.scene_baseline_id WHERE g.party_id=$1
      ), positions AS (
        SELECT p.* FROM party_runtime.scene_position_nodes p
        JOIN g6 g ON g.id=p.g6_instance_id WHERE p.party_id=$1
      ), connections AS (
        SELECT c.* FROM party_runtime.g5_site_connections c
        JOIN sites s ON s.id=c.from_site_id WHERE c.party_id=$1
      ) SELECT
      COALESCE((SELECT jsonb_agg(r ORDER BY r.profile_ref_id)
        FROM party_runtime.party_g4_expansion_ledgers r
        WHERE r.party_id=$1 AND r.g4_id=$2), '[]'::jsonb) AS ledgers,
      COALESCE((SELECT jsonb_agg(r ORDER BY r.id)
        FROM sites r), '[]'::jsonb) AS sites,
      COALESCE((SELECT jsonb_agg(r ORDER BY r.id)
        FROM party_runtime.party_continuation_chains r
        WHERE r.party_id=$1 AND r.g4_id=$2), '[]'::jsonb) AS chains,
      COALESCE((SELECT jsonb_agg(r ORDER BY r.id)
        FROM party_runtime.expansion_frontiers r
        WHERE r.party_id=$1 AND r.g4_id=$2), '[]'::jsonb) AS frontiers,
      COALESCE((SELECT jsonb_agg(r ORDER BY r.id)
        FROM party_runtime.expansion_capacity_reservations r
        WHERE r.party_id=$1 AND r.g4_id=$2), '[]'::jsonb) AS reservations,
      COALESCE((SELECT jsonb_agg(r ORDER BY r.id)
        FROM party_runtime.scene_frontier_bindings r
        JOIN party_runtime.expansion_frontiers f ON f.id=r.frontier_id
        WHERE r.party_id=$1 AND f.party_id=$1 AND f.g4_id=$2), '[]'::jsonb) AS bindings,
      COALESCE((SELECT jsonb_agg(r ORDER BY r.id) FROM baselines r), '[]'::jsonb) AS scene_baselines,
      COALESCE((SELECT jsonb_agg(r ORDER BY r.id) FROM g6 r), '[]'::jsonb) AS g6_instances,
      COALESCE((SELECT jsonb_agg(r ORDER BY r.id) FROM positions r), '[]'::jsonb) AS scene_positions,
      COALESCE((SELECT jsonb_agg(r ORDER BY r.id)
        FROM party_runtime.portal_entities r JOIN baselines b ON b.id=r.scene_baseline_id
        WHERE r.party_id=$1), '[]'::jsonb) AS portals,
      COALESCE((SELECT jsonb_agg(r ORDER BY r.id)
        FROM party_runtime.scene_movement_edges r JOIN baselines b ON b.id=r.scene_baseline_id
        WHERE r.party_id=$1), '[]'::jsonb) AS movement_edges,
      COALESCE((SELECT jsonb_agg(r ORDER BY r.id)
        FROM party_runtime.visibility_links r JOIN baselines b ON b.id=r.scene_baseline_id
        WHERE r.party_id=$1), '[]'::jsonb) AS visibility_links,
      COALESCE((SELECT jsonb_agg(r ORDER BY r.g6_instance_id)
        FROM party_runtime.g6_acoustic_profiles r JOIN g6 g ON g.id=r.g6_instance_id
        WHERE r.party_id=$1), '[]'::jsonb) AS acoustic_profiles,
      COALESCE((SELECT jsonb_agg(r ORDER BY r.id)
        FROM party_runtime.acoustic_edges r JOIN baselines b ON b.id=r.scene_baseline_id
        WHERE r.party_id=$1), '[]'::jsonb) AS acoustic_edges,
      COALESCE((SELECT jsonb_agg(r ORDER BY r.entity_kind, r.entity_id)
        FROM party_runtime.entity_placements r JOIN positions p ON p.id=r.position_node_id
        WHERE r.party_id=$1 AND r.host_entity_ref IS NULL), '[]'::jsonb) AS placements,
      COALESCE((SELECT jsonb_agg(r ORDER BY r.id) FROM connections r), '[]'::jsonb) AS site_connections,
      COALESCE((SELECT jsonb_agg(r ORDER BY r.id)
        FROM party_runtime.party_site_connection_endpoint_bindings r
        JOIN connections c ON c.id=r.site_connection_id
        WHERE r.party_id=$1), '[]'::jsonb) AS endpoint_bindings,
      COALESCE((SELECT jsonb_agg(r ORDER BY r.id)
        FROM party_runtime.party_journey_locations r
        JOIN positions p ON p.id=r.scene_position_id
        WHERE r.party_id=$1 AND r.location_kind='scene'), '[]'::jsonb) AS journey_locations`,
    [party_id, g4_id]);
    return deepFreeze({ ok: true, snapshot: clone(result.rows[0]) });
  }
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
  async function loadVisibilityModifiers({ party_id } = {}, context = {}) {
    const tx = context.transaction ?? transaction;
    if (!text(party_id) || !requireTransaction(tx)) return failure('generated_schema_mismatch', 'party', party_id ?? 'unknown', { resource: 'visibility_modifiers' });
    // A party-wide read avoids treating an unknown or broader spatial scope as empty.
    const result = await tx.query(`SELECT id,party_id,source_entity_ref,affected_scope_ref,
      modifier_kind,condition_ref,source_dependency_pins,state_version,updated_change_set_id
      FROM party_runtime.visibility_modifiers WHERE party_id=$1 ORDER BY id`, [party_id]);
    return Object.freeze({ ok: true, complete: true,
      rows: Object.freeze(result.rows.map((row) => Object.freeze(clone(row)))) });
  }
  const persist = async ({ party_id } = {}) => failure('generated_schema_mismatch', 'party', party_id ?? 'unknown', { reason: 'P16 repositories are read-only; only CombinedAtomicCommitter writes.' });
  return Object.freeze({ load, persist, loadExpansionState, loadVisibilityModifiers, loadSpatialState: (input, context) => load({ ...input, resource: 'spatial_state' }, context), loadPlan: (input, context) => load({ ...input, resource: 'plans' }, context), loadExecution: (input, context) => load({ ...input, resource: 'executions' }, context), loadFrontier: (input, context) => load({ ...input, resource: 'frontiers' }, context), loadCarrier: (input, context) => load({ ...input, resource: 'carriers' }, context), loadHistory, loadPerceptionReplay, loadReactionOptionProposal, loadReactionConsequence, loadKnowledgeMergeResult, loadKnowledgeState });
}
