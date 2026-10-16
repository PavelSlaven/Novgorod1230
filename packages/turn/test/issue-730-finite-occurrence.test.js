import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyOrdinaryAggregateTransition,
  canonicalDigest,
  createOrdinaryAggregate,
  createOrdinaryCandidateKey,
  createOrdinaryCategoryKey,
  createOrdinaryContextVersion,
  createOrdinaryCoverageKey
} from '@rus/materialization';
import { ORDINARY_MATERIALIZATION_REQUEST_V1_JSON_SCHEMA } from
  '@rus/contracts/ordinary-materialization-v1';
import { createOrdinaryMaterializationDiscoveryOwner } from '../src/index.js';

const scopeRef = { entity_kind: 'g6', entity_id: 'scope-730' };
const sourceRef = 'source-730';
const targetRef = 'target-730';
const query = 'inspect the visible source';
const quantity = { value: 1, unit: 'item' };
const policyRefs = {
  authority_policy_ref: 'authority-730',
  density_policy_ref: 'density-730',
  ordinary_presence_policy_ref: 'presence-730',
  runtime_item_mechanics_policy_ref: 'mechanics-730',
  allowed_admission_classes: ['common_mundane'],
  context_bound_permission_refs: [],
  allowed_supporting_bases: [{ basis_ref: sourceRef, basis_state: 'committed' }]
};
const contextRefs = {
  period_ref: 'period-730', region_ref: 'region-730', function_refs: [],
  environment_refs: [], occupation_household_refs: [],
  economic_context_ref: 'economy-730', occupancy_state_ref: 'occupied-730',
  material_culture_refs: [], property_context_ref: 'property-730'
};
const propertyPlacementContext = {
  scope_ref: scopeRef, item_kind: 'natural_resource_portion',
  property_catalog_version_ref: 'property-catalog-730',
  placement_catalog_version_ref: 'placement-catalog-730',
  personal_communal_refs: [], occupied_site_refs: ['site-730'],
  unowned_cause_refs: [], placement_context_refs: ['context-730'],
  property_catalog: [{ property_basis_ref: 'property-730', state: 'committed',
    scope_ref: scopeRef, basis_class: 'occupied_site_default', source_ref: 'site-730',
    unowned_cause_ref: null }],
  placement_catalog: [{ position_ref: 'position-730', state: 'committed',
    scope_ref: scopeRef, position_kind: 'scene_position', g6_ref: scopeRef.entity_id,
    containment_depth: 0, placement_context_ref: 'context-730' }]
};
const propertyContextDigest = canonicalDigest({
  domain: 'rus.items.ordinary_world_property_placement_context.v1',
  ...propertyPlacementContext
});
const zeroValueCandidateField = Object.entries(
ORDINARY_MATERIALIZATION_REQUEST_V1_JSON_SCHEMA.allOf[0].else
    .properties.candidate_query.properties)
  .find(([, schema]) => schema.const === 0)?.[0];
const baseCandidate = {
  target_ref: targetRef,
  normalizer_version: 'normalizer-730', semantic_type: 'ordinary_resource',
  functional_bucket: 'household', admission_class: 'common_mundane',
  availability_class: 'common', coverage_kind: 'source',
  coverage_ref: 'coverage-730', policy_version: 'presence-730'
};

function seededAggregate() {
  return applyOrdinaryAggregateTransition({
    aggregate: createOrdinaryAggregate({ scope_ref: scopeRef,
      resolution_record_cap: 8 }),
    transition: { kind: 'seed', request_identity: 'seed-730',
      expected_state_version: 0, density_band: 'ordinary', identity_budget: 1,
      background_groups: [] }
  });
}

function finiteProfile() {
  return { source_basis_ref: sourceRef, finite_source: {
    source_resource_node_id: sourceRef, state_version: 1,
    lifecycle_state: 'active', quantity: { numerator: 2, denominator: 1,
      unit: 'item' }, quantity_unit_ref: { kind: 'unit', id: 'item' },
    position_ref: 'position-730', property_basis_ref: 'property-730'
  } };
}

function makeHarness({ finite, aggregate = seededAggregate(), model } = {}) {
  let committedAggregate = aggregate;
  let modelCalls = 0;
  let activeOperation = null;
  let refusalReason = null;
  const captured = [];
  const basisRef = finite ? sourceRef : 'basis-ordinary-730';
  const candidateContext = {
    ...baseCandidate,
    candidate_ref_namespace: finite ? sourceRef : 'ordinary-730',
    coverage_ref: finite ? sourceRef : 'coverage-ordinary-730',
    ...(finite ? { source_ref: sourceRef } : {})
  };
  const bases = [{ basis_ref: basisRef, state: 'committed', scope_ref: scopeRef,
    prepared_seed_provenance: null, functional_buckets: ['household'],
    allowed_admission_classes: ['common_mundane'], permission_refs: [],
    ...(finite ? { basis_kind: 'finite_source' } : { basis_kind: 'household_use' })
  }];
  const ordinaryMaterializationModel = async (request) => {
    modelCalls += 1;
    return model?.(request) ?? {
      schema: 'ordinary_materialization_plan_v1',
      request_id: request.request_id, resolution: 'absent',
      density_band_proposal: null, background_groups: [], entities: [],
      presence_resolutions: [{
        candidate_key: request.candidate_query.candidate_key,
        coverage_key: request.candidate_query.coverage_key,
        resolution: 'absent'
      }], reason_code: 'not_present'
    };
  };
  const resolver = createOrdinaryMaterializationDiscoveryOwner({
    loadDiscoveryContext: async () => {
      const ordinaryState = stateFor(committedAggregate);
      const allowedBases = bases.map(({ basis_ref, state }) => ({
        basis_ref, basis_state: state
      }));
      return {
        party_id: 'party-730', scope_ref: structuredClone(scopeRef),
        semantic_target_ref: targetRef, objective_digest: 'objective-730',
        objective_context: {
          request_id: 'objective-730', scope_ref: structuredClone(scopeRef),
          context_refs: structuredClone(contextRefs),
          policy_refs: { ...structuredClone(policyRefs),
            allowed_supporting_bases: allowedBases },
          ordinary_state: ordinaryState,
          technical_limits: { max_new_entities: 1,
            max_new_background_groups: 1, max_resolution_records: 8 }
        },
        execution_context: {
          candidate_context: structuredClone(candidateContext),
          supporting_bases: structuredClone(bases),
          scope_presence_enabled: true,
          stage_b_classification_eval: { profile_ref: 'classification-730' },
          allowed_disclosure_policy_refs: [], mechanics_policy: null,
          causal_ref: 'causal-730'
        },
        ordinary_aggregate: committedAggregate,
        expected_supporting_bases: structuredClone(bases),
        property_placement_context: structuredClone(propertyPlacementContext),
        ordinary_authority: { finite_source_profile:
          finite ? finiteProfile() : null },
        version_pins: { supporting_basis_catalog_version: 1 },
        code_owned_preflight_refusal: refusalReason != null,
        code_owned_reason_code: refusalReason
      };
    },
    ordinaryMaterializationModel,
    verifyStageBCutover: () => true,
    inputDigest: () => 'input-730',
    buildSeedRequest: () => ({}),
    buildPresenceRequest: ({ objective_context, candidate_context }) => {
      const identity = identityFor(candidate_context, objective_context);
      const request = {
        schema: 'ordinary_materialization_request_v1',
        request_id: objective_context.request_id, mode: 'resolve_presence',
        scope_ref: structuredClone(objective_context.scope_ref),
        context_refs: structuredClone(objective_context.context_refs),
        policy_refs: structuredClone(objective_context.policy_refs),
        ordinary_state: structuredClone(objective_context.ordinary_state),
        candidate_query: { candidate_key: identity.candidate_key,
          candidate_hint: candidate_context.candidate_hint,
          coverage_key: identity.coverage_key,
          [zeroValueCandidateField]: 0 },
        technical_limits: structuredClone(objective_context.technical_limits)
      };
      captured.push({ identity, requestId: request.request_id,
        query: activeOperation.query,
        quantity: structuredClone(activeOperation.quantity),
        targetRef: activeOperation.target_refs[0] });
      return { schema: 'ordinary_materialization_presence_envelope_v1',
        request, identity, ordinary_state_version:
          objective_context.ordinary_state_version,
        property_placement_context: structuredClone(propertyPlacementContext),
        property_placement_context_digest: propertyContextDigest };
    },
    sealAtomicWritePlan: (plan) => plan
  });
  return {
    get modelCalls() { return modelCalls; },
    get aggregate() { return committedAggregate; },
    captured,
    setRefusal(reason) { refusalReason = reason; },
    async resolve(rootTurnId, stepIndex = 0, { commit = true } = {}) {
      const operation = { op: 'request_discovery', discovery_kind: 'search',
        target_refs: [targetRef], query, quantity: structuredClone(quantity) };
      activeOperation = operation;
      const result = await resolver({
        operation,
        request: { root_turn_id: rootTurnId, step_index: stepIndex },
        actor: { actor_id: 'actor-730' },
        committed_state: { position: { position_id: 'position-730' } },
        working_projection: { revision: committedAggregate.state_version }
      });
      const plan = result.ordinary_materialization_atomic_write_plan;
      if (commit && plan?.next_aggregate != null) {
        committedAggregate = plan.next_aggregate;
      }
      return result;
    },
    commitClosure(previewPlan) {
      const previous = previewPlan.transitions.at(-1);
      committedAggregate = applyOrdinaryAggregateTransition({
        aggregate: committedAggregate,
        transition: { kind: 'close_coverage',
          request_identity: previous.request_identity,
          expected_state_version: committedAggregate.state_version,
          coverage_key: previous.coverage_key,
          category_key: previous.category_key,
          context_version: previous.context_version,
          resolution: previous.resolution }
      });
    }
  };
}

function stateFor(aggregate) {
  return { seeded: aggregate.seeded, density_band: aggregate.density_band,
    remaining_identity_budget: aggregate.remaining_identity_budget,
    background_groups: aggregate.background_groups.map(({ group_ref }) => group_ref),
    presence_resolutions: aggregate.presence_resolutions.map(({ resolution_ref }) =>
      resolution_ref),
    closed_observation_scopes: aggregate.closed_observation_scopes.map(({ coverage_key }) =>
      coverage_key) };
}

function identityFor(candidate, objective) {
  const source = candidate.source_ref == null ? {} : {
    source_ref: candidate.source_ref
  };
  const identity = {
    normalized_candidate_ref: candidate.normalized_candidate_ref,
    normalizer_version: candidate.normalizer_version,
    semantic_type: candidate.semantic_type,
    coverage_kind: candidate.coverage_kind,
    coverage_ref: candidate.coverage_ref,
    policy_version: candidate.policy_version,
    functional_bucket: candidate.functional_bucket,
    admission_class: candidate.admission_class,
    availability_class: candidate.availability_class,
    ...(candidate.source_ref == null ? {} : { source_ref: candidate.source_ref }),
    ...(candidate.occurrence_ref == null ? {} : { occurrence_ref: candidate.occurrence_ref }),
    candidate_key: createOrdinaryCandidateKey({
      scope_ref: objective.scope_ref,
      normalized_candidate_ref: candidate.normalized_candidate_ref,
      normalizer_version: candidate.normalizer_version,
      functional_bucket: candidate.functional_bucket,
      admission_class: candidate.admission_class,
      availability_class: candidate.availability_class,
      policy_version: candidate.policy_version, ...source
    }),
    coverage_key: createOrdinaryCoverageKey({
      scope_ref: objective.scope_ref, coverage_kind: candidate.coverage_kind,
      coverage_ref: candidate.coverage_ref, policy_version: candidate.policy_version
    }),
    category_key: createOrdinaryCategoryKey({
      scope_ref: objective.scope_ref,
      functional_bucket: candidate.functional_bucket,
      admission_class: candidate.admission_class,
      availability_class: candidate.availability_class,
      policy_version: candidate.policy_version
    }),
    context_version: createOrdinaryContextVersion({
      scope_ref: objective.scope_ref, context_refs: objective.context_refs,
      ordinary_presence_policy_ref: objective.policy_refs.ordinary_presence_policy_ref,
      property_basis_ref: objective.context_refs.property_context_ref,
      property_placement_context_digest: propertyContextDigest, ...source,
      ...(candidate.occurrence_ref == null ? {} : { occurrence_ref: candidate.occurrence_ref })
    })
  };
  return identity;
}

function assertSameCandidateInputs(left, right) {
  assert.equal(left.query, right.query);
  assert.deepEqual(left.quantity, right.quantity);
  assert.equal(left.targetRef, right.targetRef);
  assert.equal(left.identity.coverage_key, right.identity.coverage_key);
}

test('same root and step retry reuses committed identity without another provider call',
  async () => {
    const harness = makeHarness({ finite: true });
    const first = await harness.resolve('root-retry-730', 3);
    const firstIdentity = harness.captured.at(-1);
    assert.ok(first.ordinary_materialization_atomic_write_plan);
    const callsAfterFirst = harness.modelCalls;

    const retry = await harness.resolve('root-retry-730', 3);
    const retryIdentity = harness.captured.at(-1);

    assertSameCandidateInputs(firstIdentity, retryIdentity);
    assert.equal(retryIdentity.requestId, firstIdentity.requestId);
    assert.equal(retryIdentity.identity.candidate_key,
      firstIdentity.identity.candidate_key);
    assert.equal(retryIdentity.identity.context_version, firstIdentity.identity.context_version);
    assert.equal(retry.known_resolution.request_identity,
      firstIdentity.requestId);
    assert.equal(harness.modelCalls, callsAfterFirst);
    assert.equal(harness.aggregate.presence_resolutions.length, 1);
  });

test('finite source fresh root receives a distinct known-resolution identity',
  async () => {
    const harness = makeHarness({ finite: true });
    await harness.resolve('root-old-730', 3);
    const oldRequest = harness.captured.at(-1);
    await harness.resolve('root-new-730', 3);
    const newRequest = harness.captured.at(-1);

    assertSameCandidateInputs(oldRequest, newRequest);
    assert.notEqual(newRequest.identity.candidate_key,
      oldRequest.identity.candidate_key,
    'a finite-source occurrence under a fresh root must not reuse a known candidate identity');
    assert.notEqual(newRequest.identity.context_version, oldRequest.identity.context_version);
  });

test('finite source fresh root is not absorbed by a committed coverage closure',
  async () => {
    const harness = makeHarness({ finite: true });
    const oldRoot = 'root-old-after-closure-730';
    const oldStep = 3;
    const preview = await harness.resolve(oldRoot, oldStep, { commit: false });
    const previewPlan = preview.ordinary_materialization_atomic_write_plan;
    const oldRequest = harness.captured.at(-1);
    const providerCallsAfterPreview = harness.modelCalls;
    assert.ok(previewPlan?.transitions.at(-1),
      'common owner preview must produce the prior coverage identity');
    harness.commitClosure(previewPlan);

    const replay = await harness.resolve(oldRoot, oldStep);
    const replayRequest = harness.captured.at(-1);
    assertSameCandidateInputs(oldRequest, replayRequest);
    assert.equal(replay.known_resolution.request_identity, oldRequest.requestId);
    assert.equal(replayRequest.identity.context_version, oldRequest.identity.context_version);
    assert.equal(harness.modelCalls, providerCallsAfterPreview);

    await harness.resolve('root-new-after-closure-730', oldStep);
    const newRequest = harness.captured.at(-1);

    assertSameCandidateInputs(oldRequest, newRequest);
    assert.notEqual(newRequest.requestId, oldRequest.requestId);
    assert.equal(harness.modelCalls, providerCallsAfterPreview + 1,
      'a finite-source occurrence under a fresh root must reach the provider after closure');
    assert.equal(harness.aggregate.closed_observation_scopes.length, 1);
  });

test('non-finite candidates retain known-resolution and closed-scope deduplication',
  async () => {
    const knownHarness = makeHarness({ finite: false });
    await knownHarness.resolve('root-old-ordinary-730', 3);
    const oldRequest = knownHarness.captured.at(-1);
    const callsAfterFirst = knownHarness.modelCalls;
    const replay = await knownHarness.resolve('root-new-ordinary-730', 3);
    const newRequest = knownHarness.captured.at(-1);

    assertSameCandidateInputs(oldRequest, newRequest);
    assert.equal(newRequest.identity.candidate_key,
      oldRequest.identity.candidate_key);
    assert.equal(newRequest.identity.context_version, oldRequest.identity.context_version);
    assert.equal(replay.known_resolution.request_identity, oldRequest.requestId);
    assert.equal(knownHarness.modelCalls, callsAfterFirst);
    assert.equal(knownHarness.aggregate.presence_resolutions.length, 1);

    const closedHarness = makeHarness({ finite: false });
    const closedRoot = 'root-old-closed-ordinary-730';
    const closedStep = 3;
    const closedPreview = await closedHarness.resolve(closedRoot, closedStep,
      { commit: false });
    const closedPreviewPlan = closedPreview.ordinary_materialization_atomic_write_plan;
    const oldClosedRequest = closedHarness.captured.at(-1);
    const closedCallsAfterPreview = closedHarness.modelCalls;
    assert.ok(closedPreviewPlan?.transitions.at(-1),
      'common owner preview must produce the prior ordinary coverage identity');
    closedHarness.commitClosure(closedPreviewPlan);
    const closed = await closedHarness.resolve(closedRoot, closedStep);
    const replayClosedRequest = closedHarness.captured.at(-1);
    assertSameCandidateInputs(oldClosedRequest, replayClosedRequest);
    const newClosed = await closedHarness.resolve('root-new-closed-ordinary-730', 3);
    const newClosedRequest = closedHarness.captured.at(-1);
    assertSameCandidateInputs(oldClosedRequest, newClosedRequest);
    assert.equal(newClosedRequest.identity.candidate_key,
      oldClosedRequest.identity.candidate_key);
    assert.equal(closedHarness.modelCalls, closedCallsAfterPreview);
    assert.equal(closedHarness.aggregate.presence_resolutions.length, 0);
    assert.equal(closedHarness.aggregate.closed_observation_scopes.length, 1);
    assert.equal(closed.known_resolution.request_identity, oldClosedRequest.requestId);
    assert.equal(closed.known_resolution.resolution, 'absent');
    assert.equal(newClosed.known_resolution.request_identity, oldClosedRequest.requestId);
  });

test('committed authority answer replays before a newly visible refusal', async () => {
  const harness = makeHarness({ finite: true, model: (request) => ({
    schema: 'ordinary_materialization_plan_v1', request_id: request.request_id,
    resolution: 'authority_required', density_band_proposal: null,
    background_groups: [], entities: [], presence_resolutions: [{
      candidate_key: request.candidate_query.candidate_key,
      coverage_key: request.candidate_query.coverage_key,
      resolution: 'authority_required'
    }], reason_code: 'permission'
  }) });
  const first = await harness.resolve('root-prior-authority-730', 3);
  const committed = first.ordinary_materialization_atomic_write_plan
    .next_aggregate.presence_resolutions.at(-1);
  const modelCalls = harness.modelCalls;
  harness.setRefusal('source_depleted');
  const replay = await harness.resolve('root-prior-authority-730', 3);
  assert.deepEqual(replay.known_resolution, committed);
  assert.equal(replay.consequence_fragment.visible_seed.ordinary_presence_seed.reason_code,
    undefined, 'current depletion must not rewrite a committed answer');
  assert.equal(replay.ordinary_materialization_atomic_write_plan, undefined);
  assert.equal(harness.modelCalls, modelCalls);
});
