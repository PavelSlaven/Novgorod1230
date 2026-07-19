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
  const persist = async ({ party_id } = {}) => failure('generated_schema_mismatch', 'party', party_id ?? 'unknown', { reason: 'P16 repositories are read-only; only CombinedAtomicCommitter writes.' });
  return Object.freeze({ load, persist, loadSpatialState: (input, context) => load({ ...input, resource: 'spatial_state' }, context), loadPlan: (input, context) => load({ ...input, resource: 'plans' }, context), loadExecution: (input, context) => load({ ...input, resource: 'executions' }, context), loadFrontier: (input, context) => load({ ...input, resource: 'frontiers' }, context), loadCarrier: (input, context) => load({ ...input, resource: 'carriers' }, context), loadHistory });
}
