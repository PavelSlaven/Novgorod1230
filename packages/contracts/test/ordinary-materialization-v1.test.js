import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ORDINARY_MATERIALIZATION_PLAN_V1_JSON_SCHEMA,
  ORDINARY_MATERIALIZATION_PLAN_V1_SCHEMA,
  ORDINARY_MATERIALIZATION_REQUEST_V1_JSON_SCHEMA,
  ORDINARY_MATERIALIZATION_REQUEST_V1_SCHEMA,
  validateOrdinaryMaterializationPlanV1,
  validateOrdinaryMaterializationRequestV1
} from '../src/ordinary-materialization-v1.js';
import * as rootContracts from '../src/index.js';
import * as schemaNames from '../src/schema-names.js';

function seedRequest() {
  return {
    schema: 'ordinary_materialization_request_v1', request_id: 'ordinary-request-1',
    mode: 'seed_scope', scope_ref: { entity_kind: 'g6', entity_id: 'g6-1' },
    context_refs: {
      period_ref: 'period-1', region_ref: 'region-1', function_refs: ['household-1'],
      environment_refs: ['river-1'], occupation_household_refs: ['household-1'],
      economic_context_ref: 'economy-1', occupancy_state_ref: 'occupied-1',
      material_culture_refs: ['culture-1'], property_context_ref: 'property-1'
    },
    policy_refs: {
      authority_policy_ref: 'authority-policy-1', density_policy_ref: 'density-policy-1',
      ordinary_presence_policy_ref: 'presence-policy-1', runtime_item_mechanics_policy_ref: 'mechanics-policy-1',
      allowed_admission_classes: ['common_mundane', 'container_capable'],
      context_bound_permission_refs: [],
      allowed_supporting_bases: [{ basis_ref: 'basis-1', basis_state: 'committed' }]
    },
    ordinary_state: {
      seeded: false, density_band: null, remaining_identity_budget: 0,
      background_groups: [], presence_resolutions: [], closed_observation_scopes: []
    },
    candidate_query: null,
    technical_limits: { max_new_entities: 2, max_new_background_groups: 3, max_resolution_records: 32 }
  };
}

function targetedRequest() {
  return {
    ...seedRequest(), mode: 'resolve_presence',
    candidate_query: { candidate_key: 'rope', candidate_hint: 'верёвка', coverage_key: 'visible_surface', evidence_weight: 0 }
  };
}

function entity(admissionClass = 'common_mundane') {
  return {
    semantic_descriptor: { semantic_type: 'hand_utensil', name: 'простая деревянная ложка', facts: [] },
    authority_class: 'ordinary', admission_class: admissionClass, availability_class: 'common',
    functional_bucket: 'household', presence_expectation: 'routine', supporting_basis_ref: 'basis-1',
    causal_basis: { basis_kind: 'household_use', basis_refs: ['basis-1'] },
    property_basis_ref: 'property-1', placement_proposal: { scope_ref: 'g6-1', position_ref: 'position-1' },
    mechanics_proposal: {
      mass_grams: 35, external_hand_cost: 1, carry_form: 'compact', packing_slot_cost: 1,
      quantity: { value: 1, unit: 'item' }, container: null
    }
  };
}

function materializePlan() {
  return {
    schema: 'ordinary_materialization_plan_v1', request_id: 'ordinary-request-1', resolution: 'materialize',
    density_band_proposal: null, background_groups: [], entities: [entity()], presence_resolutions: [], reason_code: 'supported_presence'
  };
}

test('ordinary materialization DTO schemas are strict and accept valid seed and targeted requests', () => {
  assert.equal(ORDINARY_MATERIALIZATION_REQUEST_V1_SCHEMA, 'ordinary_materialization_request_v1');
  assert.equal(ORDINARY_MATERIALIZATION_PLAN_V1_SCHEMA, 'ordinary_materialization_plan_v1');
  assert.equal(rootContracts.ORDINARY_MATERIALIZATION_REQUEST_V1_SCHEMA, schemaNames.ORDINARY_MATERIALIZATION_REQUEST_V1_SCHEMA);
  assert.equal(rootContracts.ORDINARY_MATERIALIZATION_PLAN_V1_SCHEMA, schemaNames.ORDINARY_MATERIALIZATION_PLAN_V1_SCHEMA);
  assert.equal(ORDINARY_MATERIALIZATION_REQUEST_V1_JSON_SCHEMA.additionalProperties, false);
  assert.equal(ORDINARY_MATERIALIZATION_PLAN_V1_JSON_SCHEMA.additionalProperties, false);
  assert.deepEqual(ORDINARY_MATERIALIZATION_PLAN_V1_JSON_SCHEMA.properties.entities.items.properties.authority_class, { const: 'ordinary' });
  assert.equal(ORDINARY_MATERIALIZATION_REQUEST_V1_JSON_SCHEMA.allOf[0].then.properties.candidate_query.type, 'null');
  assert.equal(ORDINARY_MATERIALIZATION_REQUEST_V1_JSON_SCHEMA.allOf[0].else.properties.candidate_query.type, 'object');
  assert.equal(ORDINARY_MATERIALIZATION_REQUEST_V1_JSON_SCHEMA.properties.ordinary_state.allOf[0].then.properties.remaining_identity_budget.const, 0);
  assert.equal(ORDINARY_MATERIALIZATION_PLAN_V1_JSON_SCHEMA.allOf[0].then.properties.entities.minItems, 1);
  const stringPattern = new RegExp(ORDINARY_MATERIALIZATION_REQUEST_V1_JSON_SCHEMA.properties.request_id.pattern, 'u');
  assert.equal(stringPattern.test('request-a'), true);
  assert.equal(stringPattern.test(' request-a'), false);
  assert.equal(stringPattern.test('request-a '), false);
  assert.deepEqual(validateOrdinaryMaterializationRequestV1(seedRequest()), []);
  assert.deepEqual(validateOrdinaryMaterializationRequestV1(targetedRequest()), []);
  assert.deepEqual(validateOrdinaryMaterializationPlanV1({ ...materializePlan(), resolution: 'seeded', entities: [] }, seedRequest()), []);
  assert.deepEqual(validateOrdinaryMaterializationPlanV1(materializePlan(), targetedRequest()), []);
});

test('ordinary materialization DTO rejects unknown properties and enum values', () => {
  assert.ok(validateOrdinaryMaterializationRequestV1({ ...seedRequest(), unexpected: true }).some((error) => error.code === 'additional_property'));
  assert.ok(validateOrdinaryMaterializationPlanV1({ ...materializePlan(), resolution: 'invented' }).some((error) => error.path === 'resolution' && error.code === 'enum'));
});

test('ordinary materialization request rejects a Stage A candidate and malformed targeted evidence', () => {
  assert.ok(validateOrdinaryMaterializationRequestV1({ ...seedRequest(), candidate_query: targetedRequest().candidate_query }).some((error) => error.path === 'candidate_query' && error.code === 'const'));
  assert.ok(validateOrdinaryMaterializationRequestV1({ ...targetedRequest(), candidate_query: { ...targetedRequest().candidate_query, evidence_weight: 1 } }).some((error) => error.path === 'candidate_query.evidence_weight' && error.code === 'const'));
});

test('ordinary materialization request rejects impossible unseeded and seeded state combinations', () => {
  for (const mutate of [
    (state) => { state.density_band = 'ordinary'; },
    (state) => { state.remaining_identity_budget = 1; },
    (state) => { state.background_groups = ['group-a']; },
    (state) => { state.presence_resolutions = ['resolution-a']; },
    (state) => { state.closed_observation_scopes = ['coverage-a']; }
  ]) {
    const request = seedRequest(); mutate(request.ordinary_state);
    assert.ok(validateOrdinaryMaterializationRequestV1(request).some((error) => error.path.startsWith('ordinary_state.')));
  }
  const seeded = seedRequest(); seeded.ordinary_state.seeded = true;
  assert.ok(validateOrdinaryMaterializationRequestV1(seeded).some((error) => error.path === 'ordinary_state.density_band'));
  seeded.ordinary_state.density_band = 'ordinary';
  assert.deepEqual(validateOrdinaryMaterializationRequestV1(seeded), []);
});

test('ordinary materialization plan rejects an unsupported positive proposal', () => {
  const missingBasis = materializePlan();
  delete missingBasis.entities[0].supporting_basis_ref;
  assert.ok(validateOrdinaryMaterializationPlanV1(missingBasis).some((error) => error.path === 'entities[0].supporting_basis_ref'));

  const finalId = materializePlan();
  finalId.entities[0].final_entity_id = 'entity-1';
  finalId.entities[0].row_id = 'db-row-1';
  assert.ok(validateOrdinaryMaterializationPlanV1(finalId).some((error) => error.path === 'entities[0].final_entity_id' && error.code === 'additional_property'));
  assert.ok(validateOrdinaryMaterializationPlanV1(finalId).some((error) => error.path === 'entities[0].row_id' && error.code === 'additional_property'));

  const permissions = materializePlan();
  permissions.entities[0].permission_refs = ['permission-a'];
  assert.ok(validateOrdinaryMaterializationPlanV1(permissions).some((error) => (
    error.path === 'entities[0].permission_refs'
      && error.code === 'additional_property'
  )));

  const capacity = materializePlan();
  capacity.identity_budget = 999;
  assert.ok(validateOrdinaryMaterializationPlanV1(capacity).some((error) => error.path === 'identity_budget' && error.code === 'additional_property'));
});

test('container_capable remains structurally valid without activating production admission', () => {
  const plan = materializePlan();
  plan.entities[0] = entity('container_capable');
  assert.deepEqual(validateOrdinaryMaterializationPlanV1(plan, targetedRequest()), []);
});

test('ordinary entity proposals reject every nonordinary authority class', () => {
  for (const authority_class of ['significant', 'hidden', 'informational', 'authored_canonical']) {
    const plan = materializePlan();
    plan.entities[0].authority_class = authority_class;
    assert.ok(validateOrdinaryMaterializationPlanV1(plan).some((error) => (
      error.path === 'entities[0].authority_class' && error.code === 'const'
    )), authority_class);
  }
});

test('ordinary materialization binds seed and targeted outcomes to their request mode', () => {
  const seedMaterialize = materializePlan();
  assert.ok(validateOrdinaryMaterializationPlanV1(seedMaterialize, seedRequest()).some((error) => error.path === 'resolution'));

  const targetedSeeded = { ...materializePlan(), resolution: 'seeded', entities: [] };
  assert.ok(validateOrdinaryMaterializationPlanV1(targetedSeeded, targetedRequest()).some((error) => error.path === 'resolution'));

  const seedPresence = { ...materializePlan(), resolution: 'seeded', entities: [], presence_resolutions: [{ candidate_key: 'rope', coverage_key: 'visible_surface', resolution: 'absent' }] };
  assert.ok(validateOrdinaryMaterializationPlanV1(seedPresence, seedRequest()).some((error) => error.path === 'presence_resolutions'));

  const seedNoChange = { ...materializePlan(), resolution: 'no_change', entities: [], background_groups: [], density_band_proposal: 'ordinary' };
  assert.ok(validateOrdinaryMaterializationPlanV1(seedNoChange, seedRequest()).some((error) => error.path === 'density_band_proposal'));
});

test('ordinary materialization binds targeted outcomes to the exact candidate resolution', () => {
  const materializeWithRecord = materializePlan();
  materializeWithRecord.presence_resolutions = [{ candidate_key: 'rope', coverage_key: 'visible_surface', resolution: 'absent' }];
  assert.ok(validateOrdinaryMaterializationPlanV1(materializeWithRecord, targetedRequest()).some((error) => error.path === 'presence_resolutions'));

  const absent = { ...materializePlan(), resolution: 'absent', entities: [], presence_resolutions: [{ candidate_key: 'other', coverage_key: 'other_scope', resolution: 'no_change' }] };
  const absentErrors = validateOrdinaryMaterializationPlanV1(absent, targetedRequest());
  assert.ok(absentErrors.some((error) => error.path === 'presence_resolutions[0].candidate_key'));
  assert.ok(absentErrors.some((error) => error.path === 'presence_resolutions[0].coverage_key'));
  assert.ok(absentErrors.some((error) => error.path === 'presence_resolutions[0].resolution'));

  const absentWithEntity = { ...absent, presence_resolutions: [{ candidate_key: 'rope', coverage_key: 'visible_surface', resolution: 'absent' }], entities: [entity()] };
  assert.ok(validateOrdinaryMaterializationPlanV1(absentWithEntity, targetedRequest()).some((error) => error.path === 'entities'));
});

test('ordinary materialization keeps density and background groups in candidate-free seed_scope', () => {
  const group = {
    descriptor: 'обычная кухонная утварь', functional_bucket: 'household', availability_class: 'common',
    allowed_admission_classes: ['common_mundane'], causal_basis: { basis_kind: 'household_use', basis_refs: ['basis-1'] },
    property_basis_ref: 'property-1', permission_refs: [], disclosure_policy_ref: 'disclosure-1'
  };
  const targetedMaterialize = materializePlan();
  targetedMaterialize.density_band_proposal = 'ordinary';
  targetedMaterialize.background_groups = [group];
  const materializeErrors = validateOrdinaryMaterializationPlanV1(targetedMaterialize, targetedRequest());
  assert.ok(materializeErrors.some((error) => error.path === 'density_band_proposal'));
  assert.ok(materializeErrors.some((error) => error.path === 'background_groups'));

  const targetedAbsent = {
    ...materializePlan(), resolution: 'absent', entities: [], density_band_proposal: 'sparse', background_groups: [group],
    presence_resolutions: [{ candidate_key: 'rope', coverage_key: 'visible_surface', resolution: 'absent' }]
  };
  const absentErrors = validateOrdinaryMaterializationPlanV1(targetedAbsent, targetedRequest());
  assert.ok(absentErrors.some((error) => error.path === 'density_band_proposal'));
  assert.ok(absentErrors.some((error) => error.path === 'background_groups'));
});

test('ordinary DTO preflight rejects hostile non-JSON data without invoking getters', () => {
  let reads = 0;
  const topRequest = {};
  Object.defineProperty(topRequest, 'schema', { enumerable: true, get() { reads += 1; return 'ordinary_materialization_request_v1'; } });
  assert.ok(Object.isFrozen(validateOrdinaryMaterializationRequestV1(topRequest)));
  const nestedRequest = seedRequest();
  Object.defineProperty(nestedRequest.context_refs, 'period_ref', { enumerable: true, get() { reads += 1; return 'period-1'; } });
  const topPlan = {};
  Object.defineProperty(topPlan, 'schema', { enumerable: true, get() { reads += 1; return 'ordinary_materialization_plan_v1'; } });
  const nestedPlan = materializePlan();
  Object.defineProperty(nestedPlan.entities[0].semantic_descriptor, 'name', { enumerable: true, get() { reads += 1; return 'ложка'; } });
  for (const value of [topRequest, nestedRequest, topPlan, nestedPlan]) {
    const errors = value === topPlan || value === nestedPlan
      ? validateOrdinaryMaterializationPlanV1(value)
      : validateOrdinaryMaterializationRequestV1(value);
    assert.ok(errors.some((error) => error.code === 'data_boundary'));
    assert.ok(Object.isFrozen(errors));
  }
  assert.equal(reads, 0);
  const cyclic = seedRequest(); cyclic.context_refs.self = cyclic;
  assert.ok(validateOrdinaryMaterializationRequestV1(cyclic).some((error) => error.code === 'data_boundary'));
  const custom = Object.assign(Object.create({ inherited: true }), seedRequest());
  assert.ok(validateOrdinaryMaterializationRequestV1(custom).some((error) => error.code === 'data_boundary'));
  const symbol = seedRequest(); symbol[Symbol('x')] = true;
  assert.ok(validateOrdinaryMaterializationRequestV1(symbol).some((error) => error.code === 'data_boundary'));
  const nonfinite = materializePlan(); nonfinite.entities[0].mechanics_proposal.mass_grams = Infinity;
  assert.ok(validateOrdinaryMaterializationPlanV1(nonfinite).some((error) => error.code === 'data_boundary'));
  const sparse = materializePlan(); sparse.entities = new Array(1); sparse.entities.foo = 'x';
  assert.ok(validateOrdinaryMaterializationPlanV1(sparse).some((error) => error.code === 'data_boundary'));
  const outOfRange = materializePlan(); outOfRange.entities[3] = entity();
  assert.ok(validateOrdinaryMaterializationPlanV1(outOfRange).some((error) => error.code === 'data_boundary'));
  const namedAccessor = materializePlan();
  Object.defineProperty(namedAccessor.entities, 'foo', { enumerable: true, get() { reads += 1; return 'x'; } });
  assert.ok(validateOrdinaryMaterializationPlanV1(namedAccessor).some((error) => error.code === 'data_boundary'));
  assert.equal(reads, 0);
});

test('targeted handoff owns opaque candidate identity while semantic naming remains eval-owned', () => {
  const request = targetedRequest();
  const spoonPlan = materializePlan();
  // §13.5 makes rope opaque code-owned identity; §13.3 deliberately leaves
  // spoon-vs-rope semantic classification to profile-specific model eval.
  assert.deepEqual(validateOrdinaryMaterializationPlanV1(spoonPlan, request), []);
  const redirect = materializePlan();
  redirect.entities[0].candidate_key = 'spoon';
  assert.ok(validateOrdinaryMaterializationPlanV1(redirect, request).some((error) => error.path === 'entities[0].candidate_key' && error.code === 'additional_property'));
  const batch = materializePlan(); batch.entities.push(structuredClone(batch.entities[0]));
  assert.ok(validateOrdinaryMaterializationPlanV1(batch, request).some((error) => error.path === 'entities' && error.code === 'items'));
  const redirectedNegative = { ...materializePlan(), resolution: 'absent', entities: [], presence_resolutions: [{ candidate_key: 'spoon', coverage_key: request.candidate_query.coverage_key, resolution: 'absent' }] };
  assert.ok(validateOrdinaryMaterializationPlanV1(redirectedNegative, request).some((error) => error.path === 'presence_resolutions[0].candidate_key'));
});
