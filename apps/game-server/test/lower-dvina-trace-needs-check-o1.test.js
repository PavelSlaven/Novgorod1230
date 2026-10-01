import assert from 'node:assert/strict';
import test from 'node:test';
import { applyOrdinaryAggregateTransition } from '@rus/materialization';
import { createLowerDvinaTraceOrdinaryDiscoveryResolver } from
  '../src/runtime/lower-dvina-trace-ordinary-discovery.js';
import { ordinaryDiscoveryActivity } from
  '../src/runtime/lower-dvina-trace-turn-step-generic-owners.js';
import { enabled, request as discoveryRequest } from
  './lower-dvina-trace-o1-fixture.js';

test('exact O1 blocker query returns ordinary no-change before model and ledger',
  async () => {
    let modelCalls = 0;
    let cutoverCalls = 0;
    const privateTrace = [];
    const model = Object.assign(async () => {
      modelCalls += 1;
      assert.fail('matched O1 query must not call the model');
    }, { verifyStageBCutover: async () => { cutoverCalls += 1; } });
    const resolve = createLowerDvinaTraceOrdinaryDiscoveryResolver({
      partyId: 'party-o1',
      inputDigest: () => 'unused',
      loadEnablement: async () => enabled(),
      ordinaryMaterializationModel: model,
      requestSubject: 'player',
      assertNeedsCheckAllowed: async ({ candidate, matchOnly }) => {
        assert.equal(matchOnly, true);
        assert.deepEqual(candidate, { name: 'Колёсная прялка',
          path: 'O1.request.query' });
        return [{ queue_id: 'needs_check.csv#HNT0024' }];
      },
      recordNeedsCheckFilter: async (record) => privateTrace.push(record)
    });
    const request = discoveryRequest('Колёсная прялка');
    request.schema = 'turn_step_ordinary_discovery_request_v1';
    request.operation.op = 'request_discovery';
    request.operation.actor_ref = 'actor-mikula';
    request.operation.discovery_kind = 'search';
    request.actor = { actor_id: 'actor-mikula' };
    request.request.step_index = 1;
    request.working_projection = { revision: 4 };

    const result = await resolve(request);

    assert.equal(modelCalls, 0);
    assert.equal(cutoverCalls, 0);
    assert.equal(result.consequence_fragment.visible_seed
      .ordinary_presence_seed.resolution, 'no_change');
    assert.deepEqual(result.known_resolution, { resolution: 'no_change' });
    assert.deepEqual(result.write_fragments, []);
    assert.equal(Object.hasOwn(result,
      'ordinary_materialization_atomic_write_plan'), false);
    assert.doesNotMatch(JSON.stringify(result), /HNT0024|queue_id/u);
    assert.deepEqual(privateTrace, [{ path: 'O1.request.query',
      queue_ids: ['needs_check.csv#HNT0024'] }]);
    assert.deepEqual(ordinaryDiscoveryActivity({ operation: request.operation,
      request: request.request, plan: { continuation: null },
      knownResolution: result.known_resolution }), {
      owner: 'semantic', duration_class: 'short', effort: 'light'
    });
  });

test('NPC O1 blocker query keeps typed operation refusal', async () => {
  let modelCalls = 0;
  const model = Object.assign(async () => {
    modelCalls += 1;
    assert.fail('blocked NPC operation must not call the model');
  }, { verifyStageBCutover: async () => {} });
  const resolve = createLowerDvinaTraceOrdinaryDiscoveryResolver({
    partyId: 'party-o1', inputDigest: () => 'unused',
    requestSubject: 'npc',
    loadEnablement: async () => enabled(),
    ordinaryMaterializationModel: model,
    assertNeedsCheckAllowed: async ({ matchOnly }) => {
      assert.equal(matchOnly, undefined,
        'NPC request must use the operation-rejection path');
      throw Object.assign(new Error('blocked NPC operation'), {
        code: 'TURN_MATERIALIZATION_NEEDS_CHECK_BLOCKED',
        details: { queue_id: 'needs_check.csv#HNT0024' }
      });
    }
  });
  const request = discoveryRequest('Колёсная прялка');
  request.schema = 'turn_step_ordinary_discovery_request_v1';
  request.operation.op = 'request_discovery';
  request.operation.actor_ref = 'npc-zhdanko';
  request.operation.discovery_kind = 'search';
  request.actor = { actor_id: 'npc-zhdanko' };
  request.request.step_index = 1;

  await assert.rejects(resolve(request), (error) => {
    assert.equal(error.code, 'TURN_MATERIALIZATION_NEEDS_CHECK_BLOCKED');
    assert.equal(error.details.queue_id, 'needs_check.csv#HNT0024');
    return true;
  });
  assert.equal(modelCalls, 0);
});

test('O1 filters blocked model candidate and admits remaining candidate',
  async () => {
    const catalog = enabled();
    catalog.ordinary_aggregate = applyOrdinaryAggregateTransition({
      aggregate: catalog.ordinary_aggregate,
      transition: { kind: 'seed', request_identity: 'fixture-seed',
        expected_state_version: 0, density_band: 'ordinary',
        identity_budget: 1, background_groups: [] }
    });
    catalog.version_pins.ordinary_state_version =
      catalog.ordinary_aggregate.state_version;
    catalog.objective_context.ordinary_state = {
      ...catalog.objective_context.ordinary_state,
      seeded: true, density_band: 'ordinary', remaining_identity_budget: 1
    };
    let modelCalls = 0;
    const privateTrace = [];
    const model = Object.assign(async (request) => {
      modelCalls += 1;
      const accepted = { semantic_descriptor: {
        semantic_type: 'household_tool', name: 'нейтральная деталь',
        facts: ['Колёсная прялка'] }, authority_class: 'ordinary',
        admission_class: 'common_mundane', availability_class: 'common',
        functional_bucket: 'other_ordinary',
        presence_expectation: 'plausible', supporting_basis_ref: 'basis',
        causal_basis: { basis_kind: 'household_use', basis_refs: ['basis'] },
        property_basis_ref: 'property',
        placement_proposal: { scope_ref: 'shore', position_ref: 'bench' },
        mechanics_proposal: { mass_grams: 100, external_hand_cost: 0,
          carry_form: 'bulky', packing_slot_cost: 1,
          quantity: { value: 1, unit: 'item' }, container: null } };
      return { schema: 'ordinary_materialization_plan_v1',
        request_id: request.request_id, resolution: 'materialize',
        density_band_proposal: null, background_groups: [],
        entities: [{ ...structuredClone(accepted), semantic_descriptor: {
          semantic_type: 'household_tool', name: 'Колёсная прялка',
          facts: ['Колёсная прялка'] } }, accepted],
        presence_resolutions: [], reason_code: 'materialize' };
    }, { verifyStageBCutover: async () => {} });
    const resolve = createLowerDvinaTraceOrdinaryDiscoveryResolver({
      partyId: 'party-o1', inputDigest: () => 'unused',
      requestSubject: 'player',
      loadEnablement: async () => catalog,
      ordinaryMaterializationModel: model,
      assertNeedsCheckAllowed: async ({ candidate, matchOnly }) => {
        assert.equal(matchOnly, true);
        return candidate.path === 'O1.proposed_entity.semantic_descriptor'
          && candidate.name === 'Колёсная прялка'
          ? [{ queue_id: 'needs_check.csv#HNT0024' }] : [];
      },
      recordNeedsCheckFilter: async (record) => privateTrace.push(record)
    });
    const request = discoveryRequest('деревянная деталь');
    request.operation.op = 'request_discovery';
    request.operation.actor_ref = 'actor-mikula';
    request.operation.discovery_kind = 'search';
    request.actor = { actor_id: 'actor-mikula' };
    request.schema = 'turn_step_ordinary_discovery_request_v1';
    request.request.step_index = 1;

    const result = await resolve(request);

    assert.equal(modelCalls, 1);
    assert.equal(result.consequence_fragment.visible_seed
      .ordinary_presence_seed.resolution, 'materialized');
    assert.ok(result.ordinary_materialization_atomic_write_plan);
    assert.equal(result.ordinary_materialization_atomic_write_plan.next_aggregate
      .presence_resolutions.some(({ resolution }) => resolution === 'absent'),
    false);
    assert.deepEqual(privateTrace, [{ path:
      'O1.proposed_entity.semantic_descriptor',
    queue_ids: ['needs_check.csv#HNT0024'] }]);
  });

test('committed O1 resolution wins before an exact blocker query guard', async () => {
  const catalog = enabled();
  catalog.ordinary_aggregate = applyOrdinaryAggregateTransition({
    aggregate: catalog.ordinary_aggregate,
    transition: { kind: 'seed', request_identity: 'fixture-seed',
      expected_state_version: 0, density_band: 'ordinary',
      identity_budget: 1, background_groups: [] }
  });
  catalog.version_pins.ordinary_state_version =
    catalog.ordinary_aggregate.state_version;
  catalog.objective_context.ordinary_state = {
    ...catalog.objective_context.ordinary_state,
    seeded: true, density_band: 'ordinary', remaining_identity_budget: 1
  };
  let modelCalls = 0;
  let guardCalls = 0;
  const model = Object.assign(async (request) => {
    modelCalls += 1;
    return { schema: 'ordinary_materialization_plan_v1',
      request_id: request.request_id, resolution: 'no_change',
      density_band_proposal: null, background_groups: [], entities: [],
      presence_resolutions: [{ candidate_key:
        request.candidate_query.candidate_key, coverage_key:
        request.candidate_query.coverage_key, resolution: 'no_change' }],
      reason_code: 'observed' };
  }, { verifyStageBCutover: async () => {} });
  const resolve = createLowerDvinaTraceOrdinaryDiscoveryResolver({
    partyId: 'party-o1', inputDigest: () => 'unused',
    requestSubject: 'player',
    loadEnablement: async () => catalog,
    ordinaryMaterializationModel: model,
    assertNeedsCheckAllowed: async ({ matchOnly }) => {
      guardCalls += 1;
      assert.equal(matchOnly, true);
      return guardCalls === 1 ? [] : [{ queue_id: 'needs_check.csv#HNT0024' }];
    }
  });
  const request = discoveryRequest('Колёсная прялка');
  request.operation.op = 'request_discovery';
  request.operation.actor_ref = 'actor-mikula';
  request.operation.discovery_kind = 'search';
  request.actor = { actor_id: 'actor-mikula' };
  request.request.step_index = 1;

  const first = await resolve(request);
  assert.ok(first.ordinary_materialization_atomic_write_plan);
  catalog.ordinary_aggregate = structuredClone(
    first.ordinary_materialization_atomic_write_plan.next_aggregate);

  const replay = await resolve(request);

  assert.equal(replay.known_resolution.resolution, 'no_change');
  assert.equal(modelCalls, 1);
  assert.equal(guardCalls, 1,
    'committed resolution is returned before matching current blocker query');
});

test('exact visible O1 item skips query filtering and remains reusable', async () => {
  const catalog = enabled();
  catalog.ordinary_aggregate = applyOrdinaryAggregateTransition({
    aggregate: catalog.ordinary_aggregate,
    transition: { kind: 'seed', request_identity: 'fixture-seed',
      expected_state_version: 0, density_band: 'ordinary',
      identity_budget: 1, background_groups: [] }
  });
  catalog.version_pins.ordinary_state_version =
    catalog.ordinary_aggregate.state_version;
  catalog.objective_context.ordinary_state = {
    ...catalog.objective_context.ordinary_state,
    seeded: true, density_band: 'ordinary', remaining_identity_budget: 1
  };
  let modelCalls = 0;
  let traceCalls = 0;
  const model = Object.assign(async (request) => {
    modelCalls += 1;
    return { schema: 'ordinary_materialization_plan_v1',
      request_id: request.request_id, resolution: 'materialize',
      density_band_proposal: null, background_groups: [],
      entities: [{ semantic_descriptor: {
        semantic_type: 'ordinary_object_candidate', name: 'Колёсная прялка',
        facts: ['Колёсная прялка'] }, authority_class: 'ordinary',
        admission_class: 'common_mundane', availability_class: 'common',
        functional_bucket: 'other_ordinary',
        presence_expectation: 'plausible', supporting_basis_ref: 'basis',
        causal_basis: { basis_kind: 'household_use', basis_refs: ['basis'] },
        property_basis_ref: 'property',
        placement_proposal: { scope_ref: 'shore', position_ref: 'bench' },
        mechanics_proposal: { mass_grams: 100, external_hand_cost: 0,
          carry_form: 'bulky', packing_slot_cost: 1,
          quantity: { value: 1, unit: 'item' }, container: null }
      }], presence_resolutions: [], reason_code: 'materialize' };
  }, { verifyStageBCutover: async () => {} });
  const resolve = createLowerDvinaTraceOrdinaryDiscoveryResolver({
    partyId: 'party-o1', inputDigest: () => 'unused',
    requestSubject: 'player',
    loadEnablement: async () => catalog,
    ordinaryMaterializationModel: model,
    assertNeedsCheckAllowed: async () => {
      assert.fail('exact visible equivalent must bypass query and proposal filter');
    },
    recordNeedsCheckFilter: async () => { traceCalls += 1; }
  });
  const request = discoveryRequest('Колёсная прялка');
  request.operation.op = 'request_discovery';
  request.operation.actor_ref = 'actor-mikula';
  request.operation.discovery_kind = 'search';
  request.actor = { actor_id: 'actor-mikula' };
  request.request.step_index = 1;
  request.request.player_safe_state = { items: [{ item_id: 'saved-wheel',
    name: 'Колёсная прялка', semantic_type: 'ordinary_object_candidate' }] };

  const result = await resolve(request);

  assert.equal(modelCalls, 1,
    'query guard is bypassed, proposal resolves to visible-item reuse');
  assert.equal(traceCalls, 0);
  assert.equal(result.known_resolution.resolution, 'materialize');
  assert.equal(result.summary, 'ordinary discovery resolved');
  assert.equal(Object.hasOwn(result,
    'ordinary_materialization_atomic_write_plan'), false);
});
