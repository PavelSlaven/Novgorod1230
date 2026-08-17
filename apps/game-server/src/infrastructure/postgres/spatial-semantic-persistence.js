import { canonicalDigest } from '@rus/materialization';
import { createSpatialSemanticAtomicWritePlan } from './spatial-semantic-atomic-write-plan.js';

export async function applySpatialSemanticAtomicWritePlanInTransaction({ client, input, p16ChangeSetId, partyStateVersionAfter }) {
  const plan = createSpatialSemanticAtomicWritePlan(input);
  if (plan.change_set_id !== p16ChangeSetId || partyStateVersionAfter !== plan.base_party_state_version + 1) fail('SPATIAL_SEMANTIC_P16_BINDING_INVALID');
  const requestId = plan.causal_identity.request_id;
  const prior = await client.query(`SELECT write_plan_digest,p16_change_set_id FROM party_runtime.party_spatial_semantic_resolutions WHERE party_id=$1 AND request_id=$2 FOR UPDATE`, [plan.party_id, requestId]);
  if (prior.rows.length) {
    if (prior.rows.length !== 1 || prior.rows[0].write_plan_digest !== hex(plan.write_plan_digest) || prior.rows[0].p16_change_set_id !== p16ChangeSetId) fail('SPATIAL_SEMANTIC_IDEMPOTENCY_CONFLICT');
    return Object.freeze({ replay: true });
  }
  const envelope = await client.query(`SELECT envelope,capacity,authority_state_version,authority_digest,status FROM party_runtime.party_spatial_semantic_envelopes WHERE party_id=$1 AND envelope_ref=$2 FOR UPDATE`, [plan.party_id, plan.envelope_pin.row.envelope_ref]);
  const reservation = await client.query(`SELECT reservation_ref,envelope_ref,reservation_state_version,capacity,reservation_digest,status FROM party_runtime.party_spatial_semantic_reservations WHERE party_id=$1 AND reservation_ref=$2 FOR UPDATE`, [plan.party_id, plan.reservation_pin.row.reservation_ref]);
  if (envelope.rows.length !== 1 || reservation.rows.length !== 1) fail('SPATIAL_SEMANTIC_AUTHORITY_STALE');
  const envelopeRow = { party_id: plan.party_id, envelope_ref: plan.envelope_pin.row.envelope_ref, envelope: envelope.rows[0].envelope, capacity: envelope.rows[0].capacity, authority_state_version: Number(envelope.rows[0].authority_state_version), status: envelope.rows[0].status };
  const reservationRow = { party_id: plan.party_id, reservation_ref: reservation.rows[0].reservation_ref, envelope_ref: reservation.rows[0].envelope_ref, state_version: Number(reservation.rows[0].reservation_state_version), status: reservation.rows[0].status, capacity: reservation.rows[0].capacity };
  if (envelope.rows[0].authority_digest !== plan.envelope_pin.authority_digest || canonicalDigest(envelopeRow) !== canonicalDigest(plan.envelope_pin.row) || reservation.rows[0].reservation_digest !== plan.reservation_pin.reservation_digest || canonicalDigest(reservationRow) !== canonicalDigest(plan.reservation_pin.row) || reservationRow.status !== 'committed_reserved') fail('SPATIAL_SEMANTIC_AUTHORITY_STALE');
  if (reservationRow.envelope_ref !== envelopeRow.envelope_ref || reservationRow.capacity.reserved < 1) fail('SPATIAL_SEMANTIC_RESERVATION_STALE');
  const lockedProof = { reservation_ref: reservationRow.reservation_ref,
    state_version: reservationRow.state_version, status: reservationRow.status,
    capacity: reservationRow.capacity, envelope: envelopeRow.envelope };
  const { reservation_digest: _digest, ...sealedProof } =
    plan.resolution.reservation;
  if (canonicalDigest(sealedProof) !== canonicalDigest(lockedProof)
      || plan.resolution.reservation.reservation_digest
        !== `sha256:${canonicalDigest(lockedProof)}`
      || plan.reservation_pin.reservation_digest
        !== `sha256:${canonicalDigest(lockedProof)}`) {
    fail('SPATIAL_SEMANTIC_RESERVATION_STALE');
  }
  await lockExactSpatialScope(client, plan, envelopeRow.envelope);
  const consumed = await client.query(`UPDATE party_runtime.party_spatial_semantic_reservations SET status='committed_consumed',consumed_at_change_set_id=$1,reservation_state_version=reservation_state_version+1 WHERE party_id=$2 AND reservation_ref=$3 AND status='committed_reserved'`, [p16ChangeSetId, plan.party_id, reservationRow.reservation_ref]);
  if (consumed.rowCount !== 1) fail('SPATIAL_SEMANTIC_RESERVATION_STALE');
  await client.query(`INSERT INTO party_runtime.party_spatial_semantic_resolutions (party_id,request_id,reservation_ref,structural_identity,causal_request_ref,root_turn_id,action_ref,step_index,sealed_resolution,resolution_digest,from_party_state_version,to_party_state_version,p16_change_set_id,write_plan_digest) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14)`, [plan.party_id, requestId, reservationRow.reservation_ref, plan.resolution.structural.structural_identity, plan.resolution.causal_request_ref, plan.causal_identity.root_turn_id, plan.causal_identity.action_ref, plan.causal_identity.step_index, JSON.stringify(plan.resolution), plan.resolution.resolution_digest, plan.base_party_state_version, partyStateVersionAfter, p16ChangeSetId, hex(plan.write_plan_digest)]);
  return Object.freeze({ replay: false });
}
function hex(value) { return value.replace(/^sha256:/u, ''); }
async function lockExactSpatialScope(client, plan, envelope) {
  const result = await client.query(
    `SELECT b.id AS baseline_id,b.state_version AS baseline_state_version,
            g5.id AS g5_id,g5.state_version AS g5_state_version,
            g6.id AS g6_id,g6.state_version AS g6_state_version,
            g6.source_scene_template_ref,p.id AS position_id,
            p.state_version AS position_state_version
       FROM party_runtime.party_scene_baselines b
       JOIN party_runtime.party_g5_sites g5 ON g5.party_id=b.party_id
         AND b.host_kind='g5_site' AND b.host_id=g5.id
       JOIN party_runtime.party_g6_instances g6 ON g6.party_id=b.party_id
         AND g6.scene_baseline_id=b.id
       JOIN party_runtime.scene_position_nodes p ON p.party_id=b.party_id
         AND p.g6_instance_id=g6.id
      WHERE b.party_id=$1 AND b.id=$2 AND g5.id=$3 AND g6.id=$4 AND p.id=$5
        AND b.status='active' AND g5.status='active' AND g6.status='active'
        AND p.status='active' FOR UPDATE OF b,g5,g6,p`,
    [plan.party_id, envelope.baseline_ref, envelope.g5_ref,
      envelope.g6_ref, envelope.position_ref]);
  const row = result.rows[0];
  if (result.rows.length !== 1
      || Number(row.baseline_state_version) !== envelope.baseline_state_version
      || Number(row.g5_state_version) !== envelope.g5_state_version
      || Number(row.g6_state_version) !== envelope.g6_state_version
      || Number(row.position_state_version) !== envelope.position_state_version
      || envelope.template_ref !== `sha256:${canonicalDigest(row.source_scene_template_ref)}`) {
    fail('SPATIAL_SEMANTIC_SCOPE_STALE');
  }
}
function fail(code) { const error = new Error(code); error.code = code; throw error; }
