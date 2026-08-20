import assert from 'node:assert/strict';
import test from 'node:test';
import { admitActionProducedResult } from
  '@rus/items-property/action-produced-result';
import { sha256 } from '@rus/kernel';

function entity(entity_ref, role_membership) {
  const ownership = ownershipFor(entity_ref);
  return { entity_ref, state_version: '7', lifecycle_state: 'active',
    access_state: 'immediate', accessible_actor_ref: 'actor:mikula',
    holder_ref: 'actor:mikula', controller_ref: 'actor:mikula',
    role_membership, mechanics_state_ref: `mechanics:${entity_ref}:7`,
    property_state_ref: `property:${entity_ref}:7`,
    ownership_state_ref: `sha256:${sha256(ownership)}`,
    ownership_basis_ref: ownershipBasisRef(ownership),
    property_basis_ref: `sha256:${sha256(null)}`,
    placement_state_ref: `placement:${entity_ref}:7` };
}
function ownershipFor(entityRef) {
  return { ownership_id: `ownership:${entityRef}`,
    owner_npc_id: null, owner_character_id: 'actor:mikula',
    owner_party: false, controller_npc_id: null,
    controller_character_id: 'actor:mikula', claim_state: 'owned' };
}
function context() {
  return { schema: 'rus.items.action_produced_committed_context.v1',
    context_ref: 'context:party:7', state_version: '7',
    commit_state: 'committed', root_turn_id: 'turn:party-1:1',
    action_ref: 'action:turn-1:step-1', step_index: 1,
    actor_ref: 'actor:mikula', entities: [
      entity('item:pole', ['source']), entity('item:knife', ['tool']),
      entity('item:board', ['source']), entity('item:axe', ['tool']),
      entity('item:bark', ['source']), entity('item:charcoal', ['tool'])
    ] };
}
function profile() {
  return { schema: 'rus.items.action_produced_admission_profile.v1',
    profile_ref: 'profile:a1:test', profile_version: '1', status: 'committed',
    context_ref: 'context:party:7', context_state_version: '7',
    allowed_access_states: ['immediate'], allowed_identity_modes: [
      'preserve_source', 'independent_outputs', 'no_useful_result'],
    allowed_origins: ['direct_partition', 'crafted'], allowed_result_classes: [
      'ordinary_physical_result', 'partial_transformation',
      'nonworking_construction', 'waste', 'written_carrier',
      'no_useful_result'] };
}
function proposal(overrides = {}) {
  return { schema: 'action_produced_result_plan_v1',
    request_id: 'a1:turn-1:step-1', root_turn_id: 'turn:party-1:1',
    action_ref: 'action:turn-1:step-1', step_index: 1,
    committed_state_version: '7',
    context_ref: 'context:party:7', profile_ref: 'profile:a1:test',
    profile_version: '1',
    causal_mode: 'action_produced', actor_ref: 'actor:mikula',
    source_refs: ['item:pole'], tool_refs: ['item:knife'],
    identity_mode: 'preserve_source', origin: null,
    intended_transformation: 'заострить один конец жерди',
    result_class: 'ordinary_physical_result', result_descriptor: {
      display_name: 'заострённая жердь',
      physical_description: 'один конец жерди физически заострён',
      qualitative_facts: ['один конец заострён'], inscription_text: null },
    output_class: 'ordinary_mundane',
    ...overrides };
}
function input(plan = proposal()) {
  return { committed_context: context(), profile: profile(), proposal: plan };
}

test('pure admission returns only a frozen pending owner handoff', () => {
  const result = admitActionProducedResult(input());
  assert.equal(result.pass, true);
  assert.equal(result.handoff.status, 'pending_code_owned_mechanics');
  assert.equal(result.handoff.root_turn_id, 'turn:party-1:1');
  assert.equal(result.handoff.action_ref, 'action:turn-1:step-1');
  assert.equal(result.handoff.source_pins[0].entity_ref, 'item:pole');
  assert.equal(result.handoff.tool_pins[0].entity_ref, 'item:knife');
  assert.equal(Object.isFrozen(result.handoff.source_pins[0]), true);
  assert.equal('mechanics' in result.handoff, false);
  assert.equal('write_plan' in result.handoff, false);
});

test('preserve and no-result-only profile may have no output origins', () => {
  const value = input();
  value.profile.allowed_identity_modes = [
    'preserve_source', 'no_useful_result'
  ];
  value.profile.allowed_origins = [];
  value.profile.allowed_result_classes = [
    'partial_transformation', 'no_useful_result'
  ];
  value.proposal.result_class = 'partial_transformation';
  assert.equal(admitActionProducedResult(value).pass, true);
});

test('independent, impossible no-result and writing remain qualitative', () => {
  const independent = proposal({ source_refs: ['item:board'],
    tool_refs: ['item:axe'], identity_mode: 'independent_outputs',
    origin: 'direct_partition', intended_transformation: 'сделать клинья',
    result_descriptor: { display_name: 'деревянные клинья',
      physical_description: 'отделённые деревянные клинья',
      qualitative_facts: [], inscription_text: null } });
  const noResult = proposal({ identity_mode: 'no_useful_result', origin: null,
    intended_transformation:
      'make a self-moving precision mechanism from one wooden pole',
    output_class: null,
    result_class: 'no_useful_result', result_descriptor: {
      display_name: null, physical_description: null,
      qualitative_facts: [], inscription_text: null } });
  const writing = proposal({ source_refs: ['item:bark'],
    tool_refs: ['item:charcoal'], result_class: 'written_carrier',
    output_class: 'written_carrier',
    intended_transformation: 'написать на коре', result_descriptor: {
      display_name: 'кора с надписью',
      physical_description: 'на коре есть физическая надпись',
      qualitative_facts: ['носитель имеет рукописную надпись'],
      inscription_text: 'Жду у переправы.' } });
  for (const value of [independent, noResult, writing]) {
    assert.equal(admitActionProducedResult(input(value)).pass, true);
  }
  independent.result_descriptor.display_name = null;
  assert.equal(admitActionProducedResult(input(independent)).pass, false);
  const denied = admitActionProducedResult(input(noResult)).handoff;
  assert.equal(denied.identity_mode, 'no_useful_result');
  assert.equal(denied.result_class, 'no_useful_result');
  assert.equal('mechanics' in denied, false);
  assert.equal('working_mechanism' in denied, false);
});

function ownershipBasisRef(value) {
  const { ownership_id: ignored, ...basis } = value;
  void ignored;
  return `sha256:${sha256(basis)}`;
}

test('physical weapon-like and token-like labels cannot assert authority', () => {
  for (const display_name of ['заострённая жердь', 'похожий на монету жетон']) {
    assert.equal(admitActionProducedResult(input(proposal({
      result_descriptor: { display_name,
        physical_description: 'обычная физическая форма без статуса',
        qualitative_facts: [], inscription_text: null }
    }))).pass, true);
  }
  for (const forbidden of [
    { authority: 'canonical_weapon' }, { legal_status: 'currency' },
    { evidence: true }, { history: 'authentic' }, { damage: 4 },
    { mass_grams: 100 }, { quantity_delta: 2 }, { output_count: 3 },
    { difficulty_class: 12 }, { success_probability: 0.5 }
  ]) {
    assert.equal(admitActionProducedResult(input({
      ...proposal(), ...forbidden })).pass, false);
  }
});

test('source, tool, access and version membership are exact', () => {
  const cases = [
    (value) => { value.proposal.source_refs = ['item:missing']; },
    (value) => { value.proposal.source_refs = ['item:knife'];
      value.proposal.tool_refs = []; },
    (value) => { value.committed_context.entities[0].access_state = 'restricted'; },
    (value) => { value.committed_context.entities[0].state_version = '6'; },
    (value) => { value.proposal.committed_state_version = '6'; },
    (value) => { value.profile.context_state_version = '6'; }
  ];
  for (const mutate of cases) {
    const value = input(); mutate(value);
    assert.equal(admitActionProducedResult(value).pass, false);
  }
});

test('context, profile and causal pins cannot be drifted or jointly swapped', () => {
  const individual = [
    (value) => { value.proposal.context_ref = 'context:other'; },
    (value) => { value.proposal.profile_ref = 'profile:a1:other'; },
    (value) => { value.proposal.profile_version = '2'; },
    (value) => { value.proposal.root_turn_id = 'turn:party-1:other'; },
    (value) => { value.proposal.action_ref = 'action:other'; }
  ];
  for (const mutate of individual) {
    const value = input(); mutate(value);
    assert.equal(admitActionProducedResult(value).pass, false);
  }

  const swapped = input();
  swapped.committed_context.context_ref = 'context:party:B';
  swapped.profile.context_ref = 'context:party:B';
  swapped.profile.profile_ref = 'profile:a1:B';
  swapped.profile.profile_version = 'B';
  assert.equal(admitActionProducedResult(swapped).pass, false);
});

test('admission carries one exact bounded server step pin', () => {
  const value = input();
  const admitted = admitActionProducedResult(value);
  assert.equal(admitted.pass, true);
  assert.equal(admitted.handoff.step_index, 1);

  for (const stepIndex of [undefined, 0, 9, 1.5]) {
    const invalid = input();
    invalid.committed_context.step_index = stepIndex;
    invalid.proposal.step_index = stepIndex;
    assert.equal(admitActionProducedResult(invalid).pass, false);
  }
  const drift = input();
  drift.committed_context.step_index = 1;
  drift.proposal.step_index = 2;
  assert.equal(admitActionProducedResult(drift).pass, false);

  let reads = 0;
  const accessor = input();
  Object.defineProperty(accessor.committed_context, 'step_index', {
    enumerable: true,
    get() { reads += 1; return 1; }
  });
  assert.equal(admitActionProducedResult(accessor).pass, false);
  assert.equal(reads, 0);
});

test('presence/query shape and hostile descriptor graphs fail without getter reads', () => {
  assert.equal(admitActionProducedResult(input({ ...proposal(),
    causal_mode: 'pre_existing_presence', query: 'Здесь лежит меч?' })).pass,
  false);
  let reads = 0;
  const getter = input();
  Object.defineProperty(getter.committed_context.entities[0],
    'mechanics_state_ref', { enumerable: true,
      get() { reads += 1; return 'mechanics:item:pole:7'; } });
  assert.equal(admitActionProducedResult(getter).pass, false);
  assert.equal(reads, 0);

  const symbol = input(); symbol.profile[Symbol('forged')] = true;
  const custom = input(); custom.proposal.result_descriptor = Object.assign(
    Object.create({ authority: 'hidden' }),
    custom.proposal.result_descriptor);
  const cycle = input(); cycle.proposal.result_descriptor.loop =
    cycle.proposal.result_descriptor;
  const alias = input(); alias.proposal.result_descriptor.qualitative_facts =
    alias.proposal.source_refs;
  const extra = input(); extra.committed_context.entities[0].secret = true;
  for (const value of [symbol, custom, cycle, alias, extra]) {
    assert.equal(admitActionProducedResult(value).pass, false);
  }
});
