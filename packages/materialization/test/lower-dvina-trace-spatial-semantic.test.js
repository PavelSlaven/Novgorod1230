import test from 'node:test';
import assert from 'node:assert/strict';
import {
  admitSpatialSemanticRemainder,
  prepareSpatialSemanticRemainder, resolveAuthoredSpatialSemanticRemainder
} from '../src/lower-dvina-trace-spatial-semantic.js';
import { canonicalDigest, MaterializationError as MaterializationFailure } from '../src/core.js';

function request(overrides = {}) {
  const envelope = { envelope_ref: 'envelope-a', kind: 'ordinary_structure',
    baseline_ref: 'baseline-a', g5_ref: 'g5-a', g6_ref: 'g6-a',
    position_ref: 'position-a', template_ref: 'template-a', property_ref: 'property-a',
    function_ref: 'function-a', environment_ref: 'environment-a',
    structural_primitive: 'party_scoped_ordinary_structure',
    profile_ref: 'profile-a', profile_version: 1,
    profile_digest: `sha256:${'a'.repeat(64)}`,
    policy_ref: 'policy-a', policy_version: 1,
    baseline_state_version: 1, g5_state_version: 1, g6_state_version: 1,
    position_state_version: 1,
    allowed_descriptors: [
      { descriptor_ref: 'descriptor:work-enclosure',
        description: 'Небольшой хозяйственный навес с открытым рабочим местом.',
        variant: 'seasonal work enclosure' },
      { descriptor_ref: 'descriptor:quiet-work-corner',
        description: 'Тихий хозяйственный уголок с грубой кровлей и местом для труда.',
        variant: 'riverside seasonal shelter' }
    ] };
  const unsigned = { reservation_ref: 'reserve-a', state_version: 4,
    status: 'committed_reserved', capacity: { total: 2, reserved: 1, remaining: 1 },
    envelope };
  const reservation = { ...unsigned,
    reservation_digest: `sha256:${canonicalDigest(unsigned)}` };
  return { schema: 'rus.s1_spatial_semantic_request.v1', request_id: 'request-a',
    causal_request_ref: 'turn-a', party_id: 'party-a', need: 'interaction',
    reservation, ...overrides };
}
function proposal(overrides = {}) { return { schema: 'rus.s1_spatial_semantic_proposal.v1',
  request_id: 'request-a', kind: 'ordinary_structure',
  descriptor_ref: 'descriptor:work-enclosure', movement_effect: 'none', hazard_effect: 'none', ...overrides }; }
function code(error) { return error instanceof MaterializationFailure && error.code; }

test('S1 admits broad ordinary semantic descriptions only after a finite reservation', () => {
  const prepared = prepareSpatialSemanticRemainder(request());
  assert.equal(prepared.model_request.qualitative_need, 'interaction');
  assert.equal('reservation_ref' in prepared.model_request, false);
  assert.equal('capacity' in prepared.model_request, false);
  const result = admitSpatialSemanticRemainder({ prepared, proposal: proposal() });
  const differentWords = admitSpatialSemanticRemainder({ prepared, proposal: proposal({
    descriptor_ref: 'descriptor:quiet-work-corner' }) });
  assert.equal(result.structural.structural_identity, differentWords.structural.structural_identity);
  assert.notEqual(result.resolution_digest, differentWords.resolution_digest);
  assert.ok(Object.isFrozen(result));
});

test('S1 rejects exhausted/stale reservation and unsupported structural authority fields', () => {
  const exhausted = request().reservation;
  exhausted.capacity = { total: 1, reserved: 0, remaining: 1 };
  exhausted.reservation_digest = `sha256:${canonicalDigest({ reservation_ref: exhausted.reservation_ref,
    state_version: exhausted.state_version, status: exhausted.status,
    capacity: exhausted.capacity, envelope: exhausted.envelope })}`;
  assert.throws(() => prepareSpatialSemanticRemainder(request({ reservation: exhausted })),
  (error) => code(error) === 'S1_SPATIAL_CAPACITY_INVALID');
  const stale = request().reservation; stale.status = 'prepared';
  assert.throws(() => prepareSpatialSemanticRemainder(request({ reservation: stale })),
  (error) => code(error) === 'S1_SPATIAL_RESERVATION_REQUIRED');
  assert.throws(() => admitSpatialSemanticRemainder({ prepared: prepareSpatialSemanticRemainder(request()),
    proposal: proposal({ position_ref: 'new-position' }) }),
  (error) => code(error) === 'S1_SPATIAL_PROPOSAL_INVALID');
});

test('S1 natural feature is party-scoped and movement/hazard effects require a mechanics owner', () => {
  const naturalReservation = request().reservation;
  naturalReservation.envelope.kind = 'local_natural_feature';
  naturalReservation.envelope.structural_primitive = 'party_scoped_local_natural_feature';
  naturalReservation.reservation_digest = `sha256:${canonicalDigest({
    reservation_ref: naturalReservation.reservation_ref,
    state_version: naturalReservation.state_version, status: naturalReservation.status,
    capacity: naturalReservation.capacity, envelope: naturalReservation.envelope })}`;
  const natural = request({ reservation: naturalReservation });
  const prepared = prepareSpatialSemanticRemainder(natural);
  const result = admitSpatialSemanticRemainder({ prepared, proposal: proposal({
    kind: 'local_natural_feature' }) });
  assert.equal(result.structural.containment.parent_g6_ref, 'g6-a');
  assert.throws(() => admitSpatialSemanticRemainder({ prepared, proposal: proposal({
    kind: 'local_natural_feature', movement_effect: 'blocks' }) }),
  (error) => code(error) === 'S1_SPATIAL_MECHANICS_GAP');
  const unsupported = structuredClone(natural.reservation);
  unsupported.envelope.structural_primitive = 'unapproved';
  unsupported.reservation_digest = `sha256:${canonicalDigest({
    reservation_ref: unsupported.reservation_ref, state_version: unsupported.state_version,
    status: unsupported.status, capacity: unsupported.capacity, envelope: unsupported.envelope })}`;
  assert.throws(() => prepareSpatialSemanticRemainder(request({ reservation: unsupported })),
  (error) => code(error) === 'S1_SPATIAL_MECHANICS_GAP');
});

test('S1 rejects hostile non-JSON values before getters can read state', () => {
  let reads = 0;
  const getter = request(); Object.defineProperty(getter, 'party_id', { enumerable: true,
    get() { reads += 1; return 'party-a'; } });
  const cycle = request(); cycle.self = cycle;
  const symbol = request(); symbol[Symbol('hostile')] = true;
  const proto = Object.assign(Object.create({ inherited: true }), request());
  const alias = request(); alias.reservation.capacity.other = alias.reservation.capacity;
  for (const hostile of [getter, cycle, symbol, proto, alias]) {
    assert.throws(() => prepareSpatialSemanticRemainder(hostile),
      (error) => code(error) === 'S1_SPATIAL_INPUT_INVALID');
  }
  assert.equal(reads, 0);
});

test('fully authored S1 envelope resolves without a model call and is detached', () => {
  const prepared = prepareSpatialSemanticRemainder(request());
  const result = resolveAuthoredSpatialSemanticRemainder({ prepared,
    authored_semantics: { kind: 'ordinary_structure',
      descriptor_ref: 'descriptor:work-enclosure' } });
  assert.equal(result.model_calls, 0);
  assert.equal(result.resolution_digest.startsWith('sha256:'), true);
});

test('S1 identity is stable across requests and arbitrary authority text cannot enter the proposal', () => {
  const first = prepareSpatialSemanticRemainder(request());
  const second = prepareSpatialSemanticRemainder(request({ request_id: 'request-b',
    causal_request_ref: 'turn-b' }));
  assert.equal(first.code_owned.structural_identity,
    second.code_owned.structural_identity);
  assert.throws(() => admitSpatialSemanticRemainder({ prepared: first,
    proposal: proposal({ description: 'Новая каноническая крепость и резиденция князя',
      variant: 'monastery' }) }),
  (error) => code(error) === 'S1_SPATIAL_PROPOSAL_INVALID');
  assert.throws(() => admitSpatialSemanticRemainder({ prepared: first,
    proposal: proposal({ descriptor_ref: 'descriptor:canonical-fortress' }) }),
  (error) => code(error) === 'S1_SPATIAL_AUTHORITY_REQUIRED');
});

test('S1 rejects reservation proof drift and prepared recomposition', () => {
  const reservation = request().reservation;
  reservation.envelope.position_ref = 'position-forged';
  assert.throws(() => prepareSpatialSemanticRemainder(request({ reservation })),
    (error) => code(error) === 'S1_SPATIAL_RESERVATION_INVALID');
  const prepared = prepareSpatialSemanticRemainder(request());
  const forged = structuredClone(prepared);
  forged.code_owned.structural_identity = 'forged';
  assert.throws(() => admitSpatialSemanticRemainder({ prepared: forged,
    proposal: proposal() }),
  (error) => code(error) === 'S1_SPATIAL_PREPARED_INVALID');
});
