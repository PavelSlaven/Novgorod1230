import assert from 'node:assert/strict';
import test from 'node:test';
import { applyOrdinaryAggregateTransition } from '@rus/materialization';
import { createLowerDvinaTraceOrdinaryDiscoveryResolver } from
  '../src/runtime/lower-dvina-trace-ordinary-discovery.js';
import { enabled, request, verifyStageBCutover } from
  './lower-dvina-trace-o1-fixture.js';

function seededEnablement() {
  const value = enabled();
  const aggregate = applyOrdinaryAggregateTransition({
    aggregate: value.ordinary_aggregate,
    transition: { kind: 'seed', request_identity: 'seed',
      expected_state_version: 0, density_band: 'ordinary',
      identity_budget: 1, background_groups: [] }
  });
  value.ordinary_aggregate = aggregate;
  value.objective_context.ordinary_state = {
    seeded: true, density_band: 'ordinary', remaining_identity_budget: 1,
    background_groups: [], presence_resolutions: [],
    closed_observation_scopes: []
  };
  value.version_pins = { ...value.version_pins, ordinary_state_version: 1 };
  return value;
}

test('ordinary candidate v2 binds exact requested quantity to replay identity',
  async () => {
    async function key(query, quantity) {
      let candidateKey = null;
      const resolver = createLowerDvinaTraceOrdinaryDiscoveryResolver({
        partyId: 'party', inputDigest: 'quantity-identity',
        verifyStageBCutover, loadEnablement: async () => seededEnablement(),
        ordinaryMaterializationModel: async (modelRequest) => {
          candidateKey = modelRequest.candidate_query.candidate_key;
          return { schema: 'ordinary_materialization_plan_v1',
            request_id: modelRequest.request_id, resolution: 'absent',
            density_band_proposal: null, background_groups: [], entities: [],
            presence_resolutions: [{ candidate_key: candidateKey,
              coverage_key: modelRequest.candidate_query.coverage_key,
              resolution: 'absent' }], reason_code: 'absent' };
        }
      });
      const input = request(query);
      if (quantity !== undefined) input.operation.quantity = quantity;
      await resolver(input);
      return candidateKey;
    }
    const five = { value: 5, unit: 'item' };
    assert.equal(await key('сухие ветки', five),
      await key('  СУХИЕ   ветки ', five));
    assert.notEqual(await key('сухие ветки', five),
      await key('сухие ветки', { value: 3, unit: 'item' }));
    assert.notEqual(await key('сухие ветки'),
      await key('сухие ветки', { value: 1, unit: 'item' }),
    'unspecified quantity and explicit one are intentionally distinct');
  });

test('positive quantity replay reuses the committed item without model or write',
  async () => {
    let committed = null;
    let modelCalls = 0;
    const resolver = createLowerDvinaTraceOrdinaryDiscoveryResolver({
      partyId: 'party', inputDigest: 'positive-quantity-replay',
      verifyStageBCutover,
      loadEnablement: async () => {
        const value = seededEnablement();
        if (committed == null) return value;
        value.ordinary_aggregate = structuredClone(committed);
        value.objective_context.ordinary_state = {
          seeded: true, density_band: 'ordinary', remaining_identity_budget: 1,
          background_groups: [],
          presence_resolutions: committed.presence_resolutions.map(
            ({ resolution_ref: ref }) => ref), closed_observation_scopes: []
        };
        value.version_pins = { ...value.version_pins,
          party_state_version: 1,
          ordinary_state_version: committed.state_version };
        return value;
      },
      ordinaryMaterializationModel: async (modelRequest, context) => {
        modelCalls += 1;
        assert.deepEqual(context.required_quantity, { value: 5, unit: 'item' });
        return materializeFiveBranches(modelRequest);
      }
    });
    const firstRequest = request('сухие ветки');
    firstRequest.operation.quantity = { value: 5, unit: 'item' };
    const first = await resolver(firstRequest);
    const plan = first.ordinary_materialization_atomic_write_plan;
    committed = plan.next_aggregate;
    const replayRequest = request('  СУХИЕ   ветки ');
    replayRequest.request.root_turn_id = 'turn:party:2';
    replayRequest.request.player_safe_state = { items: [{
      item_id: plan.item.item_id, name: 'пять сухих веток',
      quantity: 5, quantity_unit_id: 'item'
    }] };
    replayRequest.operation.quantity = { value: 5, unit: 'item' };
    const replay = await resolver(replayRequest);
    assert.equal(modelCalls, 1);
    assert.deepEqual(replay.write_fragments, []);
    assert.equal(replay.ordinary_materialization_atomic_write_plan, undefined);
    assert.equal(replay.known_resolution.resolution, 'materialize');
    assert.deepEqual(replay.consequence_fragment.visible_seed
      .ordinary_presence_seed, { kind: 'ordinary_presence_seed',
      resolution: 'materialized', query: '  СУХИЕ   ветки ',
      display_name: 'пять сухих веток' });
  });

function materializeFiveBranches(request) {
  return { schema: 'ordinary_materialization_plan_v1',
    request_id: request.request_id, resolution: 'materialize',
    density_band_proposal: null, background_groups: [],
    entities: [{ semantic_descriptor: { semantic_type: 'dry_branch',
      name: 'пять сухих веток', facts: [] }, authority_class: 'ordinary',
    admission_class: 'common_mundane', availability_class: 'common',
    functional_bucket: 'other_ordinary', presence_expectation: 'routine',
    supporting_basis_ref: 'basis', causal_basis: {
      basis_kind: 'ordinary_presence', basis_refs: ['basis'] },
    property_basis_ref: 'property', placement_proposal: {
      scope_ref: 'shore', position_ref: 'bench' }, mechanics_proposal: {
      mass_grams: 500, external_hand_cost: 1, carry_form: 'compact',
      packing_slot_cost: 1, quantity: { value: 5, unit: 'item' },
      container: null } }], presence_resolutions: [],
    reason_code: 'ordinary_present' };
}
