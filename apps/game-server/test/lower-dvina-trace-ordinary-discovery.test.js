import assert from 'node:assert/strict';
import test from 'node:test';
import { applyOrdinaryAggregateTransition, createOrdinaryAggregate,
  canonicalDigest } from '@rus/materialization';
import { enabled, group, request, verifyStageBCutover } from
  './lower-dvina-trace-o1-fixture.js';
import { createLowerDvinaTraceOrdinaryDiscoveryResolver } from
  '../src/runtime/lower-dvina-trace-ordinary-discovery.js';
import { projectLowerDvinaTracePlayerSafeState } from
  '../src/runtime/lower-dvina-trace-player-safe-state.js';
import { applyOrdinaryMaterializationProjection } from
  '../src/infrastructure/postgres/lower-dvina-trace-ordinary-p16.js';

test('unseeded ordinary discovery keeps Stage A candidate-free and candidate identity code-owned', async () => {
  const calls = [];
  const resolver = createLowerDvinaTraceOrdinaryDiscoveryResolver({ partyId: 'party', inputDigest: 'input',
    verifyStageBCutover,
    loadEnablement: async () => enabled(), ordinaryMaterializationModel: async (modelRequest) => {
      calls.push(modelRequest);
      if (modelRequest.mode === 'seed_scope') return { schema: 'ordinary_materialization_plan_v1',
        request_id: modelRequest.request_id, resolution: 'seeded', density_band_proposal: 'ordinary',
        background_groups: [group()], entities: [], presence_resolutions: [], reason_code: 'seed' };
      return { schema: 'ordinary_materialization_plan_v1', request_id: modelRequest.request_id,
        resolution: 'absent', density_band_proposal: null, background_groups: [], entities: [],
        presence_resolutions: [{ candidate_key: modelRequest.candidate_query.candidate_key,
          coverage_key: modelRequest.candidate_query.coverage_key, resolution: 'absent' }], reason_code: 'absent' };
    } });
  const first = await resolver(request('  Найти   ЛОЖКУ '));
  assert.equal(calls[0].candidate_query, null);
  assert.equal(calls[1].candidate_query.evidence_weight, 0);
  assert.equal(calls[1].candidate_query.candidate_hint, 'найти ложку');
  assert.equal(calls.length, 2, 'unseeded targeted discovery costs at most Stage A + Stage B');
  const firstCoverageKey = calls[1].candidate_query.coverage_key;
  assert.equal(first.ordinary_materialization_atomic_write_plan.transitions[0]
    .background_groups[0].group_ref.startsWith('ordinary_group_'), true);
  assert.equal(first.ordinary_materialization_atomic_write_plan.new_prepared_bases[0].basis_ref,
    first.ordinary_materialization_atomic_write_plan.transitions[0].background_groups[0].group_ref);
  calls.length = 0;
  await resolver(request('найти верёвку'));
  assert.equal(calls[1].candidate_query.coverage_key, firstCoverageKey);
  assert.notEqual(calls[1].candidate_query.candidate_key,
    first.ordinary_materialization_atomic_write_plan.transitions[1].candidate_key,
    'different normalized queries receive different code-owned identities');
});

test('unseeded structural repair shares the two-call Stage A plus Stage B budget',
  async () => {
    let modelCalls = 0;
    const resolver = createLowerDvinaTraceOrdinaryDiscoveryResolver({
      partyId: 'party', inputDigest: 'repair-budget', verifyStageBCutover,
      loadEnablement: async () => enabled(),
      ordinaryMaterializationModel: async (modelRequest, context) => {
        modelCalls += 1;
        if (modelCalls === 1) return {};
        if (modelRequest.mode === 'seed_scope' && context.repair != null) {
          return { schema: 'ordinary_materialization_plan_v1',
            request_id: modelRequest.request_id, resolution: 'seeded',
            density_band_proposal: 'ordinary', background_groups: [group()],
            entities: [], presence_resolutions: [], reason_code: 'seed_repaired' };
        }
        return {};
      }
    });
    const result = await resolver(request('найти ложку'));
    assert.equal(modelCalls, 2,
      'Stage A repair consumes the remaining semantic-call budget');
    assert.deepEqual(result.ordinary_materialization_atomic_write_plan
      .transitions.map(({ kind }) => kind), ['seed']);
    assert.equal(result.ordinary_materialization_atomic_write_plan.resolution,
      'no_change');
  });

test('committed exact identity survives reload and only normalized wording reuses it', async () => {
  let committed = null;
  let committedBases = null;
  let modelCalls = 0;
  let cutoverCalls = 0;
  let reloadedPreparedBasis = null;
  const resolver = createLowerDvinaTraceOrdinaryDiscoveryResolver({
    partyId: 'party', inputDigest: 'input',
    verifyStageBCutover: async (input) => { cutoverCalls += 1;
      assert.deepEqual(Object.keys(input), ['eval_contract']);
      return { pass: true }; },
    loadEnablement: async () => {
      const value = enabled();
      if (committed === null) return value;
      const aggregate = structuredClone(committed);
      value.execution_context.supporting_bases =
        structuredClone(committedBases);
      value.ordinary_aggregate = aggregate;
      value.objective_context.ordinary_state = {
        seeded: aggregate.seeded, density_band: aggregate.density_band,
        remaining_identity_budget: aggregate.remaining_identity_budget,
        background_groups: aggregate.background_groups.map(({ group_ref }) => group_ref),
        presence_resolutions: aggregate.presence_resolutions.map(({ resolution_ref }) => resolution_ref),
        closed_observation_scopes: aggregate.closed_observation_scopes.map(({ coverage_key }) => coverage_key)
      };
      value.version_pins = { ...value.version_pins, party_state_version: 1,
        ordinary_state_version: aggregate.state_version,
        supporting_basis_catalog_version: 2,
        supporting_basis_catalog_digest: canonicalDigest({
          domain: 'ordinary_supporting_basis_catalog_v1',
          supporting_bases: committedBases
        }) };
      return value;
    },
    ordinaryMaterializationModel: async (modelRequest) => {
      modelCalls += 1;
      if (modelRequest.mode === 'seed_scope') return { schema: 'ordinary_materialization_plan_v1',
        request_id: modelRequest.request_id, resolution: 'seeded', density_band_proposal: 'ordinary',
        background_groups: [group()], entities: [], presence_resolutions: [], reason_code: 'seed' };
      reloadedPreparedBasis = modelRequest.policy_refs.allowed_supporting_bases
        .find(({ basis_state: state }) => state === 'prepared_seed') ?? null;
      return { schema: 'ordinary_materialization_plan_v1', request_id: modelRequest.request_id,
        resolution: 'absent', density_band_proposal: null, background_groups: [], entities: [],
        presence_resolutions: [{ candidate_key: modelRequest.candidate_query.candidate_key,
          coverage_key: modelRequest.candidate_query.coverage_key, resolution: 'absent' }], reason_code: 'absent' };
    }
  });
  const first = await resolver(request('найти ложку'));
  committed = first.ordinary_materialization_atomic_write_plan.next_aggregate;
  committedBases = first.ordinary_materialization_atomic_write_plan
    .next_supporting_basis_catalog;
  assert.equal(modelCalls, 2);
  assert.equal(cutoverCalls, 1);
  await resolver({ ...request('  НАЙТИ   ложку  '), request: { root_turn_id: 'turn:party:2' } });
  assert.equal(modelCalls, 2, 'case/whitespace normalization maps to the committed identity');
  assert.equal(cutoverCalls, 1,
    'known resolution short-circuits before the local receipt check');
  await resolver({ ...request('отыскать ложку'), request: { root_turn_id: 'turn:party:3' } });
  assert.equal(modelCalls, 3,
    'a semantically different normalized query receives a new candidate identity');
  assert.equal(cutoverCalls, 2);
  assert.equal(reloadedPreparedBasis?.basis_ref,
    first.ordinary_materialization_atomic_write_plan
      .new_prepared_bases[0].basis_ref,
  'the persisted prepared basis remains admitted after reload');
});

test('a pre-commit resolver result is not visible or durable and can be modelled after restart', async () => {
  let modelCalls = 0;
  const resolver = createLowerDvinaTraceOrdinaryDiscoveryResolver({ partyId: 'party', inputDigest: 'input',
    verifyStageBCutover,
    loadEnablement: async () => enabled(), ordinaryMaterializationModel: async (modelRequest) => {
      modelCalls += 1;
      if (modelRequest.mode === 'seed_scope') return { schema: 'ordinary_materialization_plan_v1',
        request_id: modelRequest.request_id, resolution: 'seeded', density_band_proposal: 'ordinary',
        background_groups: [group()], entities: [], presence_resolutions: [], reason_code: 'seed' };
      return { schema: 'ordinary_materialization_plan_v1', request_id: modelRequest.request_id,
        resolution: 'absent', density_band_proposal: null, background_groups: [], entities: [],
        presence_resolutions: [{ candidate_key: modelRequest.candidate_query.candidate_key,
          coverage_key: modelRequest.candidate_query.coverage_key, resolution: 'absent' }], reason_code: 'absent' };
    } });
  const beforeCommit = await resolver(request('найти ложку'));
  assert.deepEqual(beforeCommit.write_fragments, []);
  assert.equal(Object.hasOwn(beforeCommit.working_projection, 'items'), false);
  await resolver(request('найти ложку'));
  assert.equal(modelCalls, 4, 'uncommitted state is not reused after a restart');
});

test('Stage A sparse density is mapped by code to a zero persisted identity budget', async () => {
  let modelCalls = 0;
  const resolver = createLowerDvinaTraceOrdinaryDiscoveryResolver({
    partyId: 'party', inputDigest: 'input', loadEnablement: async () => enabled(),
    verifyStageBCutover,
    ordinaryMaterializationModel: async (modelRequest) => {
      modelCalls += 1;
      assert.equal(modelRequest.mode, 'seed_scope');
      return { schema: 'ordinary_materialization_plan_v1',
        request_id: modelRequest.request_id, resolution: 'seeded',
        density_band_proposal: 'sparse', background_groups: [], entities: [],
        presence_resolutions: [], reason_code: 'sparse' };
    }
  });
  const result = await resolver(request('найти ложку'));
  assert.equal(modelCalls, 1, 'zero budget prevents a Stage B model call');
  assert.equal(result.ordinary_materialization_atomic_write_plan
    .next_aggregate.density_band, 'sparse');
  assert.equal(result.ordinary_materialization_atomic_write_plan
    .next_aggregate.identity_budget, 0);
  assert.equal(result.ordinary_materialization_atomic_write_plan
    .next_aggregate.remaining_identity_budget, 0);
  assert.deepEqual(result.ordinary_materialization_atomic_write_plan
    .transitions.map(({ kind }) => kind), ['seed']);
  assert.equal(result.ordinary_materialization_atomic_write_plan
    .next_aggregate.presence_resolutions.length, 0,
  'transient zero-budget no_change does not fabricate a granular record');
});

test('full resolution cap returns no_change without a write or granular record',
  async () => {
    let aggregate = createOrdinaryAggregate({ scope_ref: { entity_kind: 'g6', entity_id: 'shore' },
      resolution_record_cap: 1 });
    aggregate = applyOrdinaryAggregateTransition({ aggregate, transition: {
      kind: 'seed', request_identity: 'seed', expected_state_version: 0,
      density_band: 'ordinary', identity_budget: 1, background_groups: []
    } });
    aggregate = applyOrdinaryAggregateTransition({ aggregate, transition: {
      kind: 'resolve_presence', request_identity: 'presence-one',
      expected_state_version: 1, resolution_ref: 'resolution-one',
      candidate_key: 'candidate-one', coverage_key: 'coverage-one',
      category_key: 'category-one', context_version: 'context-one',
      resolution: 'absent'
    } });
    let modelCalls = 0;
    const resolver = createLowerDvinaTraceOrdinaryDiscoveryResolver({
      partyId: 'party', inputDigest: 'cap', verifyStageBCutover,
      loadEnablement: async () => {
        const value = enabled();
        value.ordinary_aggregate = structuredClone(aggregate);
        value.objective_context.ordinary_state = {
          seeded: true, density_band: 'ordinary', remaining_identity_budget: 1,
          background_groups: [], presence_resolutions: ['resolution-one'],
          closed_observation_scopes: []
        };
        value.version_pins.ordinary_state_version = 2;
        return value;
      },
      ordinaryMaterializationModel: async () => { modelCalls += 1; return {}; }
    });
    const result = await resolver(request('найти другую вещь'));
    assert.equal(modelCalls, 0);
    assert.equal(Object.hasOwn(result,
      'ordinary_materialization_atomic_write_plan'), false);
    assert.equal(aggregate.presence_resolutions.length, 1);
    assert.equal(aggregate.state_version, 2);
  });

test('production-shaped bounded mechanics admits one positive ordinary item',
  async () => {
    let preparedBasisRef = null;
    const resolver = createLowerDvinaTraceOrdinaryDiscoveryResolver({
      partyId: 'party', inputDigest: 'positive-o1',
      loadEnablement: async () => enabled(), verifyStageBCutover,
      ordinaryMaterializationModel: async (modelRequest) => {
        if (modelRequest.mode === 'seed_scope') return {
          schema: 'ordinary_materialization_plan_v1',
          request_id: modelRequest.request_id, resolution: 'seeded',
          density_band_proposal: 'ordinary', background_groups: [group()],
          entities: [], presence_resolutions: [], reason_code: 'seed'
        };
        preparedBasisRef = modelRequest.policy_refs.allowed_supporting_bases
          .find(({ basis_state: state }) => state === 'prepared_seed')?.basis_ref;
        assert.ok(preparedBasisRef,
          'Stage B must allow the validated basis prepared by Stage A');
        return { schema: 'ordinary_materialization_plan_v1',
          request_id: modelRequest.request_id, resolution: 'materialize',
          density_band_proposal: null, background_groups: [],
          entities: [{ semantic_descriptor: {
            semantic_type: 'cordage', name: 'простая верёвка', facts: [] },
          authority_class: 'ordinary', admission_class: 'common_mundane',
          availability_class: 'common', functional_bucket: 'other_ordinary',
          presence_expectation: 'routine',
          supporting_basis_ref: preparedBasisRef,
          causal_basis: { basis_kind: 'ordinary_presence',
            basis_refs: [preparedBasisRef] }, property_basis_ref: 'property',
          placement_proposal: { scope_ref: 'shore', position_ref: 'bench' },
          mechanics_proposal: { mass_grams: 350, external_hand_cost: 0,
            carry_form: 'compact', packing_slot_cost: 1,
            quantity: { value: 1, unit: 'item' }, container: null } }],
          presence_resolutions: [], reason_code: 'ordinary_present' };
      }
    });
    const result = await resolver(request('найти простую верёвку'));
    const plan = result.ordinary_materialization_atomic_write_plan;
    assert.equal(plan.resolution, 'materialize');
    assert.equal(plan.item.supporting_basis_ref, plan.new_prepared_bases[0].basis_ref);
    assert.deepEqual(plan.item.runtime_placement,
      { anchor_id: 'shore-anchor' });
    assert.equal(plan.item.item_proposal.semantic_descriptor.name,
      'простая верёвка');
    assert.deepEqual(plan.item.mechanics_snapshot.mechanics, {
      mass_grams: 350, external_hand_cost: 0, carry_form: 'compact',
      packing_slot_cost: 1, quantity: { value: 1, unit: 'item' },
      container: null
    });
  });

test('visible target without a committed G6 never calls the ordinary model', async () => {
  let modelCalls = 0;
  let enablementCalls = 0;
  const resolver = createLowerDvinaTraceOrdinaryDiscoveryResolver({
    partyId: 'party', inputDigest: 'input',
    verifyStageBCutover,
    loadEnablement: async () => { enablementCalls += 1; return enabled(); },
    ordinaryMaterializationModel: async () => { modelCalls += 1; return {}; }
  });

  const result = await resolver({
    request: { root_turn_id: 'turn:party:no-g6' },
    committed_state: { position: { location_ref: 'visible-shore' } },
    operation: { target_refs: ['visible-shore'], query: 'найти ложку' },
    working_projection: {}
  });

  assert.equal(modelCalls, 0);
  assert.equal(enablementCalls, 0);
  assert.equal(result.summary, 'ordinary discovery unavailable');
});

test('current visible location maps to its already pinned G6 discovery context', async () => {
  let modelCalls = 0;
  const resolver = createLowerDvinaTraceOrdinaryDiscoveryResolver({
    partyId: 'party', inputDigest: 'visible-location', verifyStageBCutover,
    loadEnablement: async () => enabled(),
    ordinaryMaterializationModel: async (modelRequest) => {
      modelCalls += 1;
      assert.equal(modelRequest.mode, 'seed_scope');
      return { schema: 'ordinary_materialization_plan_v1',
        request_id: modelRequest.request_id, resolution: 'seeded',
        density_band_proposal: 'sparse', background_groups: [], entities: [],
        presence_resolutions: [], reason_code: 'sparse' };
    }
  });

  await resolver({
    ...request('найти ложку'),
    committed_state: { position: { g6_id: 'shore',
      location_ref: 'trace_ld_v1_loc_fishing_camp', g5_anchor_id: 'shore-anchor' } },
    operation: { target_refs: ['trace_ld_v1_loc_fishing_camp'], query: 'найти ложку' }
  });

  assert.equal(modelCalls, 1);
});

test('projects a committed ordinary item without its materialization internals', () => {
  const committedState = {
    party_id: 'party', actor_id: 'mikula', player_profile: {},
    position: { location_ref: 'shed', g5_anchor_id: 'shed-anchor' },
    items: [], visible_context: { visible_objects: [] },
    ordinary_materialization: { remaining_identity_budget: 0,
      background_groups: ['group-private'], supporting_basis_catalog: ['basis-private'],
      negative_presence_record: 'negative-presence' }
  };
  const ordinaryPlan = { party_id: 'party', item: { item_id: 'ordinary-spoon',
    property_basis_ref: 'basis-private', supporting_basis_ref: 'basis-private',
    runtime_placement: { anchor_id: 'shed-anchor' },
    item_proposal: { scope_ref: { entity_kind: 'g6', entity_id: 'shed' },
      semantic_descriptor: { semantic_type: 'household_tool', name: 'wooden spoon' },
      placement: { scope_ref: 'shed', position_ref: 'bench' },
      property_placement_evidence: { permission_ref: 'permission-private' } },
    mechanics_snapshot: {
      schema: 'rus.items.runtime_instance_mechanics_snapshot.v2', version: 2,
      provenance: { source_kind: 'ordinary_world_materialization',
        causal_ref: 'cause', request_id: 'request', candidate_key: 'candidate',
        coverage_key: 'coverage', context_version: 'context',
        policy_ref: 'policy', source_refs: ['basis-private'] },
      mechanics: { mass_grams: 80, external_hand_cost: 0,
        carry_form: 'compact', packing_slot_cost: 1,
        quantity: { value: 1, unit: 'item' }, container: null }
    } } };
  committedState.visible_context = applyOrdinaryMaterializationProjection({
    next: committedState, visibleContext: committedState.visible_context, ordinaryPlan
  });

  const result = projectLowerDvinaTracePlayerSafeState({
    committed_state: committedState, actor_id: 'mikula' });
  assert.deepEqual(result.player_safe_state.items, [{
    item_id: 'ordinary-spoon', name: 'wooden spoon',
    quantity: 1, condition_state: 'ordinary_runtime_instance',
    legal_status: 'ordinary_world_property_bound',
    placement: { anchor_id: 'shed-anchor' },
    state: { semantic_category: 'household_tool' }
  }]);
  const playerSafe = JSON.stringify(result.player_safe_state);
  for (const privateValue of ['remaining_identity_budget', 'background_groups',
    'basis-private', 'permission-private', 'negative-presence']) {
    assert.equal(playerSafe.includes(privateValue), false);
  }
});
