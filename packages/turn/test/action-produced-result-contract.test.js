import assert from 'node:assert/strict';
import test from 'node:test';
import {
  requireActionProducedResultPlan,
  validateActionProducedResultPlan,
  validateActionProducedResultRequest
} from '@rus/turn/action-produced-result';

function request(overrides = {}) {
  return {
    schema: 'action_produced_result_request_v1',
    request_id: 'a1:turn-1:step-1',
    root_turn_id: 'turn:party-1:1',
    action_ref: 'action:turn-1:step-1',
    step_index: 1,
    committed_state_version: '7',
    context_ref: 'context:party:7',
    profile_ref: 'profile:a1:test',
    profile_version: '1',
    causal_mode: 'action_produced',
    actor_ref: 'actor:mikula',
    source_refs: ['item:pole'],
    tool_refs: ['item:knife'],
    intended_transformation: 'заострить один конец жерди',
    material_extent: null,
    output_class: 'ordinary_mundane',
    ...overrides
  };
}

function plan(overrides = {}) {
  const input = request();
  return {
    schema: 'action_produced_result_plan_v1',
    request_id: input.request_id,
    root_turn_id: input.root_turn_id,
    action_ref: input.action_ref,
    step_index: input.step_index,
    committed_state_version: input.committed_state_version,
    context_ref: input.context_ref,
    profile_ref: input.profile_ref,
    profile_version: input.profile_version,
    causal_mode: input.causal_mode,
    actor_ref: input.actor_ref,
    source_refs: input.source_refs,
    tool_refs: input.tool_refs,
    identity_mode: 'preserve_source',
    origin: null,
    intended_transformation: input.intended_transformation,
    material_extent: input.material_extent,
    result_class: 'ordinary_physical_result',
    result_descriptor: {
      display_name: 'заострённая жердь',
      physical_description: 'один конец жерди физически заострён',
      qualitative_facts: ['один конец заострён'],
      inscription_text: null, physical_form: 'long', source_fact_delta: null
    },
    output_class: input.output_class,
    ...overrides
  };
}

test('A1 contract admits same identity, independent outputs and no result', () => {
  const same = requireActionProducedResultPlan(plan(), { request: request() });
  assert.equal(same.identity_mode, 'preserve_source');
  assert.equal(Object.isFrozen(same.result_descriptor), true);

  const splitRequest = request({ source_refs: ['item:board'],
    tool_refs: ['item:axe'], intended_transformation: 'разделить доску на клинья',
    material_extent: 'whole' });
  const split = plan({ request_id: splitRequest.request_id,
    source_refs: splitRequest.source_refs, tool_refs: splitRequest.tool_refs,
    intended_transformation: splitRequest.intended_transformation,
    material_extent: splitRequest.material_extent,
    identity_mode: 'independent_outputs', origin: 'direct_partition',
    result_descriptor: { display_name: 'деревянные клинья',
      physical_description: 'отделённые от доски деревянные клинья',
      qualitative_facts: [], inscription_text: null,
      physical_form: 'compact', source_fact_delta: null } });
  assert.equal(validateActionProducedResultPlan(split,
    { request: splitRequest }).ok, true);
  assert.equal(validateActionProducedResultPlan({ ...split,
    result_descriptor: { ...split.result_descriptor,
      display_name: null, physical_description: null }
  }, { request: splitRequest }).ok, false);
  assert.equal(validateActionProducedResultPlan({ ...split,
    result_descriptor: { ...split.result_descriptor,
      physical_description: null }
  }, { request: splitRequest }).ok, true);

  const failedRequest = request({ output_class: null });
  const failed = plan({ identity_mode: 'no_useful_result', origin: null,
    output_class: null,
    result_class: 'no_useful_result', result_descriptor: {
      display_name: null, physical_description: null,
      qualitative_facts: [], inscription_text: null, physical_form: null,
      source_fact_delta: null } });
  assert.equal(validateActionProducedResultPlan(failed,
    { request: failedRequest }).ok, true);
});

test('written carrier is qualitative and preserves its physical identity', () => {
  const writingRequest = request({ source_refs: ['item:bark'],
    tool_refs: ['item:charcoal'], intended_transformation: 'написать записку',
    output_class: 'written_carrier' });
  const writingPlan = plan({ source_refs: writingRequest.source_refs,
    tool_refs: writingRequest.tool_refs,
    intended_transformation: writingRequest.intended_transformation,
    output_class: writingRequest.output_class,
    result_class: 'written_carrier', result_descriptor: {
      display_name: 'кусок коры с надписью',
      physical_description: 'на коре оставлена видимая надпись',
      qualitative_facts: ['носитель имеет рукописную надпись'],
      inscription_text: 'Жду у переправы.', physical_form: null,
      source_fact_delta: null } });
  assert.equal(validateActionProducedResultPlan(writingPlan,
    { request: writingRequest }).ok, true);
});

test('preserved identity may consume additional material sources', () => {
  const combinedRequest = request({
    source_refs: ['item:handle', 'item:wrap'], tool_refs: ['item:knife'],
    intended_transformation: 'обмотать рукоять полоской материала',
    material_extent: 'whole'
  });
  const combined = plan({ source_refs: combinedRequest.source_refs,
    tool_refs: combinedRequest.tool_refs,
    intended_transformation: combinedRequest.intended_transformation,
    material_extent: combinedRequest.material_extent });

  assert.equal(validateActionProducedResultPlan(combined,
    { request: combinedRequest }).ok, true);
});

test('partial independent output has one surviving source with its own form',
  () => {
    const partialRequest = request({ source_refs: ['item:board'],
      tool_refs: ['item:knife'], material_extent: 'minor' });
    const partial = plan({ source_refs: partialRequest.source_refs,
      tool_refs: partialRequest.tool_refs, material_extent: 'minor',
      identity_mode: 'independent_outputs', origin: 'direct_partition',
      result_class: 'partial_transformation', result_descriptor: {
        display_name: 'деревянный клин', physical_description: 'отделённый клин',
        qualitative_facts: [], inscription_text: null,
        physical_form: 'compact', source_fact_delta: {
          physical_description: 'с края доски срезана часть',
          qualitative_facts: [], removed_physical_fact_refs: [],
          physical_form: 'regular' } } });
    assert.equal(validateActionProducedResultPlan(partial,
      { request: partialRequest }).ok, true);

    const multiRequest = request({ source_refs: ['item:board', 'item:rope'],
      tool_refs: ['item:knife'], material_extent: 'minor' });
    assert.equal(validateActionProducedResultPlan({ ...partial,
      source_refs: multiRequest.source_refs }, { request: multiRequest }).ok,
    false);
  });

test('weapon-capable A1 result carries no combat-owned classification',
  () => {
    const weaponRequest = request({ output_class: 'weapon_capable' });
    const weaponPlan = plan({ output_class: 'weapon_capable' });
    assert.equal(validateActionProducedResultPlan(weaponPlan,
      { request: weaponRequest }).ok, true);
    weaponPlan.result_descriptor.weapon_danger = 2;
    assert.equal(validateActionProducedResultPlan(weaponPlan,
      { request: weaponRequest }).ok, false);
  });

test('request, context, profile and causal identity pins echo exactly', () => {
  for (const drift of [
    { root_turn_id: 'turn:party-1:other' },
    { action_ref: 'action:other' },
    { context_ref: 'context:other' },
    { profile_ref: 'profile:a1:other' },
    { profile_version: '2' }
  ]) {
    assert.equal(validateActionProducedResultPlan({ ...plan(), ...drift },
      { request: request() }).ok, false);
  }
});

test('step index is an exact bounded request and plan echo', () => {
  const pinnedRequest = request();
  const pinnedPlan = plan();
  assert.equal(validateActionProducedResultRequest(pinnedRequest).ok, true);
  assert.equal(validateActionProducedResultPlan(pinnedPlan, {
    request: pinnedRequest
  }).ok, true);
  for (const stepIndex of [undefined, 0, 9, 1.5]) {
    assert.equal(validateActionProducedResultRequest({
      ...request(), step_index: stepIndex
    }).ok, false);
  }
  assert.equal(validateActionProducedResultPlan({
    ...pinnedPlan, step_index: 2
  }, { request: pinnedRequest }).ok, false);
});

test('presence questions, authority claims and arbitrary numeric mechanics are outside A1', () => {
  assert.equal(validateActionProducedResultRequest({ ...request(),
    causal_mode: 'pre_existing_presence', query: 'Здесь лежит меч?' }).ok,
  false);
  for (const forbidden of [
    { authority: 'canonical_weapon' },
    { legal_status: 'currency' },
    { evidence: true },
    { historical_identity: 'ancient_relic' },
    { mass_grams: 100 },
    { quantity_delta: 2 },
    { output_count: 4 },
    { damage: 10 },
    { difficulty_class: 12 },
    { success_probability: 0.8 }
  ]) {
    assert.equal(validateActionProducedResultPlan({ ...plan(), ...forbidden },
      { request: request() }).ok, false);
  }
});

test('contract rejects getters, symbols, prototypes, cycles and aliases without reads', () => {
  let reads = 0;
  const accessor = request();
  Object.defineProperty(accessor, 'actor_ref', { enumerable: true,
    get() { reads += 1; return 'actor:mikula'; } });
  assert.equal(validateActionProducedResultRequest(accessor).ok, false);
  assert.equal(reads, 0);

  const symbol = request();
  symbol[Symbol('forged')] = true;
  const custom = Object.assign(Object.create({ forged: true }), request());
  const cycle = request(); cycle.loop = cycle;
  const alias = plan(); alias.result_descriptor.qualitative_facts =
    alias.source_refs;
  for (const value of [symbol, custom, cycle]) {
    assert.equal(validateActionProducedResultRequest(value).ok, false);
  }
  assert.equal(validateActionProducedResultPlan(alias).ok, false);
});

test('plan options are descriptor-safe and reject malformed envelopes', () => {
  let reads = 0;
  const accessor = {};
  Object.defineProperty(accessor, 'request', { enumerable: true,
    get() { reads += 1; return request(); } });
  assert.equal(validateActionProducedResultPlan(plan(), accessor).ok, false);
  assert.equal(reads, 0);

  const symbol = { request: request() };
  symbol[Symbol('forged')] = true;
  const custom = Object.assign(Object.create({ forged: true }),
    { request: request() });
  for (const options of [null, { extra: true }, symbol, custom]) {
    assert.equal(validateActionProducedResultPlan(plan(), options).ok, false);
  }
  assert.equal(validateActionProducedResultPlan(plan()).ok, true);
  assert.equal(validateActionProducedResultPlan(plan(), {}).ok, true);
});
