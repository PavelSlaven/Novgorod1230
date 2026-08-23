import { isDeepStrictEqual } from 'node:util';
import { createSpatialSemanticAtomicWritePlan, spatialSemanticRows } from './spatial-semantic-atomic-write-plan.js';
import { normalizeSpatialSemanticEnvelope } from
  '@rus/materialization/internal/lower-dvina-trace-s1';

export async function applySpatialSemanticAtomicWritePlanInTransaction({ client, input, p16ChangeSetId, partyStateVersionAfter, sealedWrites = null }) {
  const plan = createSpatialSemanticAtomicWritePlan(input);
  if (plan.change_set_id !== p16ChangeSetId
      || partyStateVersionAfter !== plan.base_party_state_version + 1) fail('SPATIAL_SEMANTIC_P16_BINDING_INVALID');
  if (sealedWrites != null && !formalWritesBound(plan, sealedWrites)) fail('SPATIAL_SEMANTIC_P16_BINDING_INVALID');
  const party = await client.query(`SELECT state_version FROM party_runtime.parties
    WHERE party_id=$1 FOR UPDATE`, [plan.party_id]);
  if (party.rowCount !== 1 || Number(party.rows[0].state_version)
      !== plan.base_party_state_version) fail('SPATIAL_SEMANTIC_PARTY_STALE');
  const prior = await client.query(`SELECT request_id,local_ref,p16_change_set_id
    FROM party_runtime.party_spatial_semantic_resolutions
    WHERE party_id=$1 AND request_id=$2 FOR UPDATE`, [plan.party_id, plan.causal_identity.request_id]);
  if (prior.rowCount) {
    if (prior.rowCount !== 1 || prior.rows[0].local_ref !== plan.resolution.local_ref
        || prior.rows[0].p16_change_set_id !== p16ChangeSetId) fail('SPATIAL_SEMANTIC_IDEMPOTENCY_CONFLICT');
    return Object.freeze({ replay: true });
  }
  const envelope = await client.query(`SELECT envelope,capacity_total,consumed_count,state_version,status
    FROM party_runtime.party_spatial_semantic_envelopes
    WHERE party_id=$1 AND envelope_ref=$2 FOR UPDATE`, [plan.party_id, plan.envelope_ref]);
  if (envelope.rowCount !== 1) fail('SPATIAL_SEMANTIC_AUTHORITY_STALE');
  let row;
  try { row = normalizeSpatialSemanticEnvelope(envelope.rows[0].envelope); }
  catch { fail('SPATIAL_SEMANTIC_AUTHORITY_STALE'); }
  if (envelope.rows[0].status !== 'committed' || Number(envelope.rows[0].state_version) !== plan.expected_envelope_state_version
      || Number(envelope.rows[0].capacity_total) !== row.capacity_total
      || Number(envelope.rows[0].consumed_count) !== row.consumed_count
      || Number(envelope.rows[0].state_version) !== row.state_version) fail('SPATIAL_SEMANTIC_AUTHORITY_STALE');
  if (plan.formal_spatial_context.baseline_ref !== row.baseline_ref
      || plan.formal_spatial_context.g5_ref !== row.g5_ref
      || plan.formal_spatial_context.kind !== row.kind
      || plan.formal_spatial_context.structural_variant !== row.structural_variant
      || JSON.stringify(plan.formal_spatial_context.available_mechanics)
        !== JSON.stringify(row.available_mechanics)
      || !isDeepStrictEqual(plan.formal_spatial_context.required_semantic_requirements,
        row.required_semantic_requirements)
      || !isDeepStrictEqual(plan.formal_spatial_context.topology, row.topology)
      || plan.resolution.position_ref !== row.position_ref) fail('SPATIAL_SEMANTIC_SCOPE_STALE');
  await lockExactSpatialScope(client, plan, row);
  if (row.consumed_count >= row.capacity_total) fail('SPATIAL_SEMANTIC_CAPACITY_EXHAUSTED');
  const next = { ...row, consumed_count: row.consumed_count + 1, state_version: row.state_version + 1 };
  const updated = await client.query(`UPDATE party_runtime.party_spatial_semantic_envelopes
    SET envelope=$1::jsonb,consumed_count=$2,state_version=$3
    WHERE party_id=$4 AND envelope_ref=$5 AND state_version=$6`, [JSON.stringify(next), next.consumed_count,
    next.state_version, plan.party_id, plan.envelope_ref, plan.expected_envelope_state_version]);
  if (updated.rowCount !== 1) fail('SPATIAL_SEMANTIC_AUTHORITY_STALE');
  await client.query(`INSERT INTO party_runtime.party_spatial_semantic_resolutions
    (party_id,request_id,local_ref,envelope_ref,position_ref,root_turn_id,step_index,semantics,
     formal_spatial_refs,from_party_state_version,to_party_state_version,p16_change_set_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11,$12)`, [plan.party_id,
    plan.resolution.request_id, plan.resolution.local_ref, plan.envelope_ref,
    plan.resolution.position_ref, plan.causal_identity.root_turn_id,
    plan.causal_identity.step_index, JSON.stringify({ kind: row.kind, ...plan.resolution.outcome }),
    JSON.stringify(plan.resolution.formal_spatial_refs), plan.base_party_state_version,
    partyStateVersionAfter, p16ChangeSetId]);
  return Object.freeze({ replay: false });
}

function formalWritesBound(plan, writes) {
  if (!Array.isArray(writes)) return false;
  const expectedWrites = spatialSemanticRows(plan);
  const actual = writes.filter((write) => expectedWrites.some((expected) =>
    expected.target_table === write.target_table && expected.id === write.id));
  return actual.length === expectedWrites.length
    && actual.every((write) => expectedWrites.some((expected) =>
      JSON.stringify(expected) === JSON.stringify({ target_table: write.target_table,
        id: write.id, record: write.record })));
}


async function lockExactSpatialScope(client, plan, envelope) {
  const result = await client.query(`SELECT b.state_version AS baseline_state_version,
      g5.state_version AS g5_state_version,g6.state_version AS g6_state_version,
      g6.source_scene_template_ref,p.state_version AS position_state_version
    FROM party_runtime.party_scene_baselines b
    JOIN party_runtime.party_g5_sites g5 ON g5.party_id=b.party_id AND b.host_kind='g5_site' AND b.host_id=g5.id
    JOIN party_runtime.party_g6_instances g6 ON g6.party_id=b.party_id AND g6.scene_baseline_id=b.id
    JOIN party_runtime.scene_position_nodes p ON p.party_id=b.party_id AND p.g6_instance_id=g6.id
    WHERE b.party_id=$1 AND b.id=$2 AND g5.id=$3 AND g6.id=$4 AND p.id=$5
      AND b.status='active' AND g5.status='active' AND g6.status='active' AND p.status='active'
    FOR UPDATE OF b,g5,g6,p`, [plan.party_id, envelope.baseline_ref, envelope.g5_ref,
    envelope.g6_ref, envelope.position_ref]);
  const row = result.rows[0];
  if (result.rowCount !== 1 || Number(row.baseline_state_version) !== envelope.baseline_state_version
      || Number(row.g5_state_version) !== envelope.g5_state_version
      || Number(row.g6_state_version) !== envelope.g6_state_version
      || Number(row.position_state_version) !== envelope.position_state_version) fail('SPATIAL_SEMANTIC_SCOPE_STALE');
}
function fail(code) { const error = new Error(code); error.code = code; throw error; }
