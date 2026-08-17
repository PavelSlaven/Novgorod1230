import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalDigest } from '@rus/materialization';
import { admitSpatialSemanticRemainder,
  prepareSpatialSemanticRemainder } from
  '@rus/materialization/internal/lower-dvina-trace-s1';
import { createSpatialSemanticAtomicWritePlan,
  spatialSemanticPhysicalKeys, spatialSemanticReservationRef } from
  '../../apps/game-server/src/infrastructure/postgres/spatial-semantic-atomic-write-plan.js';
import { createSpatialSemanticAuthorityRepository } from
  '../../apps/game-server/src/infrastructure/postgres/spatial-semantic-authority-repository.js';

function fixture({ reservationRef = null } = {}) {
  const envelope = {
    envelope_ref: 'envelope-a', kind: 'ordinary_structure',
    baseline_ref: 'baseline-a', g5_ref: 'g5-a', g6_ref: 'g6-a',
    position_ref: 'position-a',
    template_ref: `sha256:${canonicalDigest({ entity_id: 'template-a' })}`,
    property_ref: 'property-a', function_ref: 'function-a',
    environment_ref: 'environment-a',
    structural_primitive: 'party_scoped_ordinary_structure',
    profile_ref: 'profile-a', profile_version: 1,
    profile_digest: `sha256:${'a'.repeat(64)}`,
    policy_ref: 'policy-a', policy_version: 1,
    baseline_state_version: 1, g5_state_version: 1,
    g6_state_version: 1, position_state_version: 1,
    allowed_descriptors: [{ descriptor_ref: 'descriptor-a',
      description: 'Небольшой хозяйственный навес.',
      variant: 'work shelter' }]
  };
  const capacity = { total: 1, reserved: 1, remaining: 0 };
  const reservationUnsigned = { reservation_ref: reservationRef
    ?? spatialSemanticReservationRef({
    partyId: 'party-a', rootTurnId: 'turn-a', stepIndex: 1,
    envelopeRef: envelope.envelope_ref }),
    state_version: 1, status: 'committed_reserved', capacity, envelope };
  const reservation = { ...reservationUnsigned,
    reservation_digest: `sha256:${canonicalDigest(reservationUnsigned)}` };
  const causal = { request_id: 'request-a', root_turn_id: 'turn-a',
    action_ref: 'action-a', step_index: 1, actor_ref: 'actor-a',
    operation_digest: `sha256:${canonicalDigest({ op: 'request_discovery' })}` };
  const prepared = prepareSpatialSemanticRemainder({
    schema: 'rus.s1_spatial_semantic_request.v1', request_id: causal.request_id,
    causal_request_ref: causal.action_ref, party_id: 'party-a',
    need: 'interaction', reservation });
  const resolution = admitSpatialSemanticRemainder({ prepared, proposal: {
    schema: 'rus.s1_spatial_semantic_proposal.v1', request_id: causal.request_id,
    kind: envelope.kind, descriptor_ref: 'descriptor-a',
    movement_effect: 'none', hazard_effect: 'none' } });
  const authorityRow = { party_id: 'party-a', envelope_ref: envelope.envelope_ref,
    envelope: structuredClone(envelope), capacity: structuredClone(capacity),
    authority_state_version: 2, status: 'committed' };
  const reservationRow = { party_id: 'party-a',
    reservation_ref: reservation.reservation_ref,
    envelope_ref: envelope.envelope_ref, state_version: 1,
    status: 'committed_reserved', capacity: structuredClone(capacity) };
  return { schema: 'spatial_semantic_atomic_write_request_v1',
    party_id: 'party-a', base_party_state_version: 4,
    change_set_id: 'change-a', causal_identity: causal,
    envelope_pin: { row: authorityRow,
      authority_digest: `sha256:${canonicalDigest(authorityRow)}` },
    reservation_pin: { row: reservationRow,
      reservation_digest: reservation.reservation_digest }, resolution };
}

test('S1 atomic plan seals a detached code-owned resolution and stable keys', () => {
  const input = structuredClone(fixture());
  const plan = createSpatialSemanticAtomicWritePlan(input);
  input.resolution.semantics.description = 'forged';
  assert.equal(plan.resolution.semantics.description,
    'Небольшой хозяйственный навес.');
  assert.equal(plan.write_plan_digest.startsWith('sha256:'), true);
  assert.deepEqual(spatialSemanticPhysicalKeys(plan), [
    'party_runtime.party_g5_sites:g5-a',
    'party_runtime.party_scene_baselines:baseline-a',
    'party_runtime.party_g6_instances:g6-a',
    'party_runtime.scene_position_nodes:position-a',
    'party_runtime.party_spatial_semantic_envelopes:party-a:envelope-a',
    `party_runtime.party_spatial_semantic_reservations:party-a:${
      plan.resolution.reservation.reservation_ref}`,
    `party_runtime.party_spatial_semantic_resolutions:party-a:${
      plan.resolution.structural.structural_identity}`
  ]);
});

test('S1 atomic plan rejects forged semantics and embedded reservation', () => {
  for (const mutate of [
    (input) => { input.resolution.semantics.description = 'Каноническая крепость'; },
    (input) => { input.resolution.structural.structural_identity = 'fortress'; },
    (input) => { input.resolution.reservation.capacity.remaining = 1; }
  ]) {
    const input = structuredClone(fixture());
    mutate(input);
    const unsigned = { ...input.resolution };
    delete unsigned.resolution_digest;
    input.resolution.resolution_digest = `sha256:${canonicalDigest(unsigned)}`;
    assert.throws(() => createSpatialSemanticAtomicWritePlan(input),
      { code: 'SPATIAL_SEMANTIC_PLAN_INVALID' });
  }
});

test('S1 atomic plan rejects a jointly resealed arbitrary reservation identity', () => {
  assert.throws(() => createSpatialSemanticAtomicWritePlan(fixture({
    reservationRef: 'reservation:attacker-selected'
  })), { code: 'SPATIAL_SEMANTIC_PLAN_INVALID' });
});

test('S1 atomic plan rejects hostile descriptors before getter execution', () => {
  let reads = 0;
  const input = fixture();
  Object.defineProperty(input, 'resolution', { enumerable: true,
    get() { reads += 1; return fixture().resolution; } });
  assert.throws(() => createSpatialSemanticAtomicWritePlan(input),
    { code: 'SPATIAL_SEMANTIC_PLAN_INVALID' });
  assert.equal(reads, 0);
});

test('S1 reservation retry uses the envelope-reservation-scope lock order',
  async () => {
    const input = fixture();
    const envelope = input.resolution.reservation.envelope;
    const capacity = input.resolution.reservation.capacity;
    const authorityRow = { party_id: input.party_id,
      envelope_ref: envelope.envelope_ref, envelope, capacity,
      authority_state_version: 2, status: 'committed' };
    const calls = [];
    const client = { release() {}, query: async (sql) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
        return { rows: [] };
      }
      if (sql.includes('party_spatial_semantic_envelopes')) {
        calls.push('envelope');
        return { rows: [{ envelope, capacity, authority_state_version: 2,
          status: 'committed', authority_digest:
            `sha256:${canonicalDigest(authorityRow)}` }] };
      }
      if (sql.includes('party_spatial_semantic_reservations')) {
        calls.push('reservation');
        return { rows: [{ reservation_ref:
          input.reservation_pin.row.reservation_ref,
        envelope_ref: envelope.envelope_ref, reservation_state_version: 1,
        capacity, reservation_digest: input.resolution.reservation
          .reservation_digest, status: 'committed_reserved' }] };
      }
      if (sql.includes('party_scene_baselines')) {
        calls.push('scope');
        return { rows: [{ baseline_state_version: envelope.baseline_state_version,
          g5_state_version: envelope.g5_state_version,
          g6_state_version: envelope.g6_state_version,
          position_state_version: envelope.position_state_version,
          source_scene_template_ref: { entity_id: 'template-a' } }] };
      }
      throw new Error(`unexpected SQL: ${sql}`);
    } };
    const repository = createSpatialSemanticAuthorityRepository({
      pool: { connect: async () => client } });
    await repository.acquireOrReuseReservation({ party_id: input.party_id,
      envelope_ref: envelope.envelope_ref,
      reservation_ref: input.reservation_pin.row.reservation_ref,
      change_set_id: null });
    assert.deepEqual(calls, ['envelope','reservation','scope']);
  });
