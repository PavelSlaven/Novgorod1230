import test from 'node:test';
import assert from 'node:assert/strict';
import {
  admitSpatialSemanticRemainder, prepareSpatialSemanticRemainder,
  normalizeSpatialSemanticEnvelope, validateSpatialSemanticCandidate
} from '../src/lower-dvina-trace-spatial-semantic.js';
import { runS1SpatialSemanticEval } from '../src/lower-dvina-trace-spatial-semantic-eval.js';
import { MaterializationError as MaterializationFailure } from '../src/core.js';

function request(overrides = {}) {
  return { schema: 'rus.s1_spatial_semantic_request.v1', request_id: 'request-a',
    causal_request_ref: 'turn-a', party_id: 'party-a', need: 'interaction',
    envelope: { envelope_ref: 'envelope-a', kind: 'ordinary_structure',
      scope_kind: 'current_position_local_reference', structural_variant: 'open_one_space',
      available_mechanics: [], required_semantic_requirements: ['interior_space'],
      baseline_ref: 'baseline-a', g5_ref: 'g5-a', g6_ref: 'g6-a', position_ref: 'position-a',
      topology: { baseline_ref: 'baseline-a', g5_ref: 'g5-a', position_ref: 'position-a',
        g6_instance_ref: 'g6-a', interior_position_ref: 'position-a',
        movement_edge_refs: ['edge-a-out', 'edge-a-back'],
        visibility_link_refs: ['visibility-a-out', 'visibility-a-back'] },
      property_ref: 'property-a', function_ref: 'function-a',
      environment_ref: 'environment-a', semantic_context: semanticContext('ordinary_structure'),
      profile_ref: 'profile-a', profile_version: 1,
      policy_ref: 'policy-a', policy_version: 1, baseline_state_version: 1,
      g5_state_version: 1, g6_state_version: 1, position_state_version: 1,
      capacity_total: 1, consumed_count: 0, state_version: 1 }, ...overrides };
}
function proposal(overrides = {}) {
  return { schema: 'rus.s1_spatial_semantic_proposal.v1', request_id: 'request-a',
    name: 'Рядовой навес', description: 'Невысокий навес у берега с грубым настилом.',
    semantic_requirements: ['interior_space'], ...overrides };
}
function code(error) { return error instanceof MaterializationFailure && error.code; }

test('S1 accepts open unseen local concretization inside code-owned envelope', () => {
  const prepared = prepareSpatialSemanticRemainder(request());
  assert.equal('reservation' in prepared, false);
  assert.equal(prepared.code_owned.envelope.scope_kind, 'current_position_local_reference');
  assert.equal(prepared.code_owned.envelope.structural_variant, 'open_one_space');
  const result = admitSpatialSemanticRemainder({ prepared, proposal: proposal({
    name: 'Плетёный заслон', description: 'Низкий заслон из прутьев у кромки воды.' }) });
  assert.equal(result.local_ref, 's1-local:request-a');
  assert.equal(result.envelope_ref, 'envelope-a');
  assert.equal(result.position_ref, 'position-a');
  assert.deepEqual(result.outcome, { name: 'Плетёный заслон',
    description: 'Низкий заслон из прутьев у кромки воды.', semantic_requirements: ['interior_space'] });
  assert.equal(result.materialized, true);
  assert.deepEqual(result.formal_spatial_refs, {
    schema: 'rus.s1_formal_spatial_refs.v1', status: 'materialized',
    structural_variant: 'open_one_space', local_ref: 's1-local:request-a',
    placement_ref: 'ordinary_structure:s1-local:request-a',
    g6_instance_ref: 'g6-a', position_ref: 'position-a', portal_ref: null,
    movement_edge_refs: ['edge-a-out', 'edge-a-back'],
    visibility_link_refs: ['visibility-a-out', 'visibility-a-back'] });
  assert.deepEqual(result.formal_spatial_proposal.rows.map(({ target_table }) => target_table),
    ['entity_placements']);
  assert.deepEqual(Object.keys(prepared.model_request.proposal_example).sort(),
    ['description', 'name', 'request_id', 'schema', 'semantic_requirements']);
  assert.deepEqual(prepared.model_request.semantic_context, semanticContext('ordinary_structure'));
  assert.deepEqual(prepared.model_request.approved_envelope, {
    kind: 'ordinary_structure', structural_variant: 'open_one_space', available_mechanics: [],
    required_semantic_requirements: ['interior_space']
  });
  assert.equal('envelope' in prepared.model_request, false);
  assert.equal('envelope_ref' in prepared.model_request, false);
  assert.equal('g5_ref' in prepared.model_request, false);
  assert.equal('g6_ref' in prepared.model_request, false);
  assert.equal('position_ref' in prepared.model_request, false);
  assert.equal('capacity_total' in prepared.model_request, false);
  assert.equal('state_version' in prepared.model_request, false);
  assert.equal('profile_ref' in prepared.model_request, false);
  assert.equal('topology' in prepared.model_request, false);
  assert.equal(Object.isFrozen(result), true);
});

test('S1 proposal cannot set formal authority, IDs, topology, kind, mechanics, or numbers', () => {
  const prepared = prepareSpatialSemanticRemainder(request());
  for (const extra of [
    { kind: 'local_natural_feature' }, { local_ref: 'forged' }, { position_ref: 'new-position' },
    { topology: 'new-route' }, { mechanics_class: 'movement' }, { authority: 'canonical' },
    { capacity_total: 1 }, { state_version: 2 }, { g6_ref: 'forged' },
    { sql: 'INSERT INTO spatial_positions' }, { formal_spatial_refs: { route_ref: 'forged' } }
  ]) {
    assert.throws(() => admitSpatialSemanticRemainder({ prepared, proposal: proposal(extra) }),
      (error) => code(error) === 'S1_SPATIAL_PROPOSAL_INVALID');
  }
});

test('S1 requires profile-approved qualitative semantics for open space only', () => {
  const { required_semantic_requirements, ...withoutRequired } = request().envelope;
  assert.throws(() => prepareSpatialSemanticRemainder(request({ envelope: withoutRequired })),
    (error) => code(error) === 'S1_SPATIAL_ENVELOPE_INVALID');
  const prepared = prepareSpatialSemanticRemainder(request());
  assert.throws(() => admitSpatialSemanticRemainder({ prepared,
    proposal: proposal({ semantic_requirements: [] }) }),
  (error) => code(error) === 'S1_SPATIAL_REQUIRED_SEMANTICS_MISSING');
  const feature = prepareSpatialSemanticRemainder(request({ envelope: { ...request().envelope,
    kind: 'local_natural_feature', structural_variant: 'descriptive_local_reference',
    required_semantic_requirements: [], semantic_context: semanticContext('local_natural_feature'),
    topology: null } }));
  assert.deepEqual(admitSpatialSemanticRemainder({ prepared: feature,
    proposal: proposal({ semantic_requirements: [] }) }).outcome.semantic_requirements, []);
});

test('S1 recomposes model boundary from code-owned envelope', () => {
  const prepared = structuredClone(prepareSpatialSemanticRemainder(request()));
  prepared.model_request.approved_envelope.structural_variant = 'descriptive_local_reference';
  assert.throws(() => admitSpatialSemanticRemainder({ prepared, proposal: proposal() }),
    (error) => code(error) === 'S1_SPATIAL_PREPARED_INVALID');
});

test('S1 rejects controlled passages before model because no portal condition owner is approved', () => {
  const wreck = prepareSpatialSemanticRemainder(request());
  assert.deepEqual(admitSpatialSemanticRemainder({ prepared: wreck,
    proposal: proposal({ semantic_requirements: ['interior_space'] }) }).outcome.semantic_requirements,
  ['interior_space']);
  assert.throws(() => prepareSpatialSemanticRemainder(request({ envelope: { ...request().envelope,
    structural_variant: 'one_space_controlled_passage', available_mechanics: ['controlled_passage'] } })),
  (error) => code(error) === 'S1_SPATIAL_DATA_GAP');
  assert.throws(() => admitSpatialSemanticRemainder({ prepared: wreck,
    proposal: proposal({ semantic_requirements: ['hazard'] }) }),
  (error) => code(error) === 'S1_SPATIAL_MECHANICS_GAP');
  const feature = prepareSpatialSemanticRemainder(request({ envelope: { ...request().envelope,
    kind: 'local_natural_feature', structural_variant: 'descriptive_local_reference',
    required_semantic_requirements: [], semantic_context: semanticContext('local_natural_feature'), topology: null } }));
  const descriptive = admitSpatialSemanticRemainder({ prepared: feature,
    proposal: proposal({ semantic_requirements: [] }) });
  assert.deepEqual(descriptive.formal_spatial_refs, {
    schema: 'rus.s1_formal_spatial_refs.v1', status: 'materialized',
    structural_variant: 'descriptive_local_reference', local_ref: 's1-local:request-a',
    placement_ref: 'local_natural_feature:s1-local:request-a', g6_instance_ref: null,
    position_ref: null, portal_ref: null, movement_edge_refs: [], visibility_link_refs: [] });
  assert.deepEqual(descriptive.formal_spatial_proposal.rows.map(({ target_table }) => target_table),
    ['entity_placements']);
  assert.throws(() => admitSpatialSemanticRemainder({ prepared: feature,
    proposal: proposal({ semantic_requirements: ['interior_space'] }) }),
  (error) => code(error) === 'S1_SPATIAL_DATA_GAP');
  assert.throws(() => admitSpatialSemanticRemainder({ prepared: feature,
    proposal: proposal({ semantic_requirements: ['controlled_passage'] }) }),
  (error) => code(error) === 'S1_SPATIAL_DATA_GAP');
  for (const requirement of ['extractable_resource', 'hazard', 'movement_constraint']) {
    assert.throws(() => admitSpatialSemanticRemainder({ prepared: feature,
      proposal: proposal({ semantic_requirements: [requirement] }) }),
    (error) => code(error) === 'S1_SPATIAL_MECHANICS_GAP');
  }
});

test('S1 model context comes from envelope profile data without leaking server refs', () => {
  const envelope = request().envelope;
  const prepared = prepareSpatialSemanticRemainder(request({ envelope: { ...envelope,
    envelope_ref: 'lower_dvina_trace:s1:wreck_shore:local_natural_feature',
    kind: 'local_natural_feature',
    property_ref: 'lower_dvina_trace:s1:shore_property_context_v1',
    function_ref: 'lower_dvina_trace:s1:formal_spatial_owner_v1',
    environment_ref: 'lower_dvina_trace:s1:late_summer_open_water_v1',
    semantic_context: semanticContext('local_natural_feature'),
    structural_variant: 'descriptive_local_reference',
    required_semantic_requirements: [],
    topology: null,
    profile_ref: 'lower_dvina_trace_s1_spatial_semantic_profile_v1' } }));
  assert.deepEqual(prepared.model_request.semantic_context, {
    allowed_kind: 'local_natural_feature', period: '1230, Rus', region: 'Lower Dvina',
    place_type: 'open river shore at a boat-wreck site',
    environment: 'late summer open water; wet sand, driftwood, reeds, riverbank stones and timber',
    material_culture: 'early thirteenth-century Rus: wood, bark, rope, woven wattle, clay and stone; no modern technology or later institutions',
    ordinary_boundary: 'ordinary detail only'
  });
  assert.equal(JSON.stringify(prepared.model_request).includes('lower_dvina_trace:s1:'), false);
});

test('S1 model eval calls injected provider six times and scores camp-structure outputs', async () => {
  let calls = 0;
  const good = await runS1SpatialSemanticEval({ semantic_context: semanticContext('ordinary_structure'),
    model: async ({ case_id }) => { calls += 1; return ({
      anachronism: { name: 'ordinary bank feature', description: 'ordinary reeds' },
      'canonical-significant-evidence-ownership-leakage': { name: 'ordinary bank feature', description: 'ordinary reeds' },
      'unseen-ordinary-structure': { name: 'windbreak', description: 'reeds' },
      'unseen-ordinary-shelter': { name: 'shelter', description: 'driftwood' },
      'incompatible-mechanics': { name: 'ordinary bank feature', description: 'ordinary reeds' },
      'unseen-ordinary-camp-structure': { name: 'net shed', description: 'wattle shed for fishing nets' }
    })[case_id]; } });
  assert.equal(calls, 6);
  assert.equal(good.pass, true);
  const bad = await runS1SpatialSemanticEval({ semantic_context: semanticContext('ordinary_structure'),
    model: async () => ({ name: 'Arkhangelsk lighthouse', description: 'electric concrete' }) });
  assert.equal(bad.pass, false);
  assert.equal(bad.cases[0].pass, false);
});

test('S1 rejects exhausted envelope and validates only code-owned result shape', () => {
  assert.throws(() => prepareSpatialSemanticRemainder(request({ envelope: { ...request().envelope,
    kind: 'local_natural_feature' } })),
  (error) => code(error) === 'S1_SPATIAL_ENVELOPE_INVALID');
  assert.throws(() => prepareSpatialSemanticRemainder(request({ envelope: {
    ...request().envelope, consumed_count: 1 } })),
  (error) => code(error) === 'S1_SPATIAL_CAPACITY_INVALID');
  assert.throws(() => normalizeSpatialSemanticEnvelope({ ...request().envelope,
    consumed_count: 2 }, { allowExhausted: true }),
  (error) => code(error) === 'S1_SPATIAL_CAPACITY_INVALID');
  const result = admitSpatialSemanticRemainder({ prepared: prepareSpatialSemanticRemainder(request()),
    proposal: proposal() });
  assert.deepEqual(validateSpatialSemanticCandidate(result), result);
  assert.equal('resolution_digest' in result, false);
});

function semanticContext(allowed_kind) {
  return { allowed_kind, period: '1230, Rus', region: 'Lower Dvina',
    place_type: 'open river shore at a boat-wreck site',
    environment: 'late summer open water; wet sand, driftwood, reeds, riverbank stones and timber',
    material_culture: 'early thirteenth-century Rus: wood, bark, rope, woven wattle, clay and stone; no modern technology or later institutions',
    ordinary_boundary: 'ordinary detail only' };
}
