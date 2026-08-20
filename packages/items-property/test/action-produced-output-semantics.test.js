import assert from 'node:assert/strict';
import test from 'node:test';
import { admitActionProducedOutputSemantics } from
  '@rus/items-property/action-produced-output-semantics';

test('weapon-capable output remains pending for the combat-owned boundary',
  () => {
    const result = admitActionProducedOutputSemantics(input(proposal({
      output_class: 'weapon_capable'
    })));
    assert.equal(result.pass, true);
    assert.equal(result.handoff.status,
      'non_authoritative_physical_classification');
    assert.deepEqual(result.handoff.context_pin, proposal().context_pin);
    assert.deepEqual(result.handoff.technical_policy_pin,
      proposal().technical_policy_pin);
    assert.deepEqual(result.handoff.class_semantics, {
      schema: 'rus.items.action_produced_weapon_capable_semantics.v1',
      domain_owner: 'combat',
      domain_classification_status: 'pending_domain_classification'
    });
    assert.equal('combat_handoff' in result.handoff.class_semantics, false);
    assert.equal('canonical_weapon_identity' in result.handoff, false);
    assert.equal(Object.isFrozen(result.handoff.class_semantics), true);
  });

test('weapon classification rejects arbitrary mechanics and authority fields',
  () => {
    for (const forbidden of [
      { combat_qualitative_class: 'damage_900' }, { damage: 900 },
      { canonical_weapon_identity: 'royal_spear' },
      { historical_identity: 'ancient_relic' }
    ]) {
      const hostile = proposal({ output_class: 'weapon_capable' });
      Object.assign(hostile.qualitative_result, forbidden);
      assert.equal(admitActionProducedOutputSemantics(input(hostile)).pass,
        false);
    }
  });

test('money-like token is structurally non-currency and non-official', () => {
  const token = proposal({ identity_mode: 'independent_outputs',
    origin: 'crafted', display_name: 'восьмиугольная счётная метка',
    output_class: 'money_like_token',
    physical_description: 'отдельная пластинка с насечками',
    identity_kind: 'independent_output', entity_ref: 'result:token',
    material_allocations: [{ source_ref: 'item:pole', quantity: {
      numerator: 1, denominator: 1, unit: 'portion' } }] });
  const result = admitActionProducedOutputSemantics(input(token));
  assert.equal(result.pass, true);
  assert.deepEqual(result.handoff.class_semantics, {
    schema: 'rus.items.action_produced_money_like_token_semantics.v1',
    currency_status: 'not_currency',
    legal_tender_status: 'not_legal_tender',
    official_status: 'not_official'
  });
  for (const forbidden of [
    { currency: true }, { legal_tender: true }, { official_seal: true }
  ]) {
    const hostile = structuredClone(token);
    Object.assign(hostile.qualitative_result, forbidden);
    assert.equal(admitActionProducedOutputSemantics(input(hostile)).pass,
      false);
  }
  assert.equal(admitActionProducedOutputSemantics(input(proposal({
    output_class: 'money_like_token'
  }))).pass, false);
});

test('crafted seal-shaped output remains mundane and never official', () => {
  const seal = proposal({ identity_mode: 'independent_outputs',
    identity_kind: 'independent_output', entity_ref: 'result:carved-mark',
    origin: 'crafted', output_class: 'ordinary_mundane',
    display_name: 'резная печатка с личным знаком',
    physical_description: 'отдельная резная заготовка без официального статуса',
    material_allocations: [{ source_ref: 'item:pole', quantity: {
      numerator: 1, denominator: 1, unit: 'portion' } }] });
  const result = admitActionProducedOutputSemantics(input(seal));

  assert.equal(result.pass, true);
  assert.deepEqual(result.handoff.class_semantics, {
    schema: 'rus.items.action_produced_ordinary_mundane_semantics.v1'
  });
  assert.equal(seal.results[0].output_authority.official_status,
    'not_official');
  assert.equal(seal.results[0].output_authority.canonical_identity_status,
    'absent');
  for (const forbidden of [
    { official_seal: true },
    { official_status: 'official' },
    { historical_identity: 'merchant-guild-seal' }
  ]) {
    const forged = structuredClone(seal);
    Object.assign(forged.qualitative_result, forbidden);
    assert.equal(admitActionProducedOutputSemantics(input(forged)).pass,
      false);
  }
});

test('written carrier projects only the physical inscription', () => {
  const written = proposal({ result_class: 'written_carrier',
    output_class: 'written_carrier',
    inscription_text: 'Встретимся у незнакомого оврага.',
    display_name: 'берестяная полоска с угольными знаками' });
  const result = admitActionProducedOutputSemantics(input(written));
  assert.equal(result.pass, true);
  assert.deepEqual(result.handoff.class_semantics, {
    schema: 'rus.items.action_produced_written_carrier_semantics.v1',
    physical_inscriptions: [{ carrier_ref: 'item:pole',
      inscription_text: 'Встретимся у незнакомого оврага.' }]
  });
  assert.equal('objective_truth' in result.handoff.class_semantics, false);
  assert.equal('knowledge' in result.handoff.class_semantics, false);

  for (const forbidden of [
    { objective_truth: true },
    { historical_fact: 'the writer is a prince' },
    { knowledge: ['the inscription is true'] }
  ]) {
    const forged = structuredClone(written);
    Object.assign(forged.results[0], forbidden);
    assert.equal(admitActionProducedOutputSemantics(input(forged)).pass,
      false);
  }
});

test('ordinary mundane classification is open-world and noun-independent', () => {
  for (const [name, description] of [
    ['плетёный распорный ус', 'гибкая отделённая распорка для корзины'],
    ['костяной навойный штифт', 'обработанная физическая деталь без статуса']
  ]) {
    const mundane = proposal({ display_name: name,
      physical_description: description, output_class: 'ordinary_mundane' });
    const result = admitActionProducedOutputSemantics(input(mundane));
    assert.equal(result.pass, true);
    assert.deepEqual(result.handoff.class_semantics, {
      schema: 'rus.items.action_produced_ordinary_mundane_semantics.v1'
    });
    assert.equal('recipe_ref' in result.handoff, false);
    assert.equal('noun_class' in result.handoff, false);
  }
});

test('output semantics boundary rejects hostile descriptors without reads',
  () => {
    let reads = 0;
    const accessor = input();
    Object.defineProperty(accessor.transition_proposal.qualitative_result,
      'output_class', {
      enumerable: true,
      get() { reads += 1; return 'weapon_capable'; }
    });
    assert.equal(admitActionProducedOutputSemantics(accessor).pass, false);
    assert.equal(reads, 0);

    const symbol = input();
    symbol.transition_proposal.qualitative_result[Symbol('authority')] = true;
    const custom = input();
    custom.transition_proposal.qualitative_result = Object.assign(
      Object.create({ official: true }),
      custom.transition_proposal.qualitative_result);
    const cycle = input(); cycle.loop = cycle;
    const alias = input(); alias.transition_proposal.qualitative_result =
      alias.transition_proposal.context_pin;
    for (const hostile of [symbol, custom, cycle, alias]) {
      assert.equal(admitActionProducedOutputSemantics(hostile).pass, false);
    }
  });

function input(transitionProposal = proposal()) {
  return { transition_proposal: transitionProposal };
}
function proposal(overrides = {}) {
  const identityMode = overrides.identity_mode ?? 'preserve_source';
  const identityKind = overrides.identity_kind ?? 'preserved_source';
  const entityRef = overrides.entity_ref ?? 'item:pole';
  const inscriptionText = overrides.inscription_text ?? null;
  const result = {
    entity_ref: entityRef, identity_kind: identityKind,
    source_ref: 'item:pole', mechanics_snapshot: { schema: 'mechanics.v1' },
    property_state_ref: 'property:item:pole:7',
    placement_state_ref: 'placement:item:pole:7',
    holder_ref: 'actor:mikula', controller_ref: 'actor:mikula',
    physical_facts: ['физически обработан'],
    inscription_text: inscriptionText,
    output_authority: identityKind === 'preserved_source'
      ? { schema: 'rus.items.action_produced_output_authority.v1',
        mode: 'preserve_existing' }
      : { schema: 'rus.items.action_produced_output_authority.v1',
        mode: 'new_non_authoritative', canonical_identity_status: 'absent',
        currency_status: 'not_currency',
        legal_tender_status: 'not_legal_tender',
        official_status: 'not_official',
        objective_truth_status: 'not_projected',
        knowledge_status: 'not_projected' },
    ...(identityKind === 'independent_output' ? {
      material_allocations: structuredClone(
        overrides.material_allocations ?? [])
    } : {})
  };
  return {
    schema: 'rus.items.action_produced_transition_proposal.v1', version: 1,
    status: 'sealed', causal_identity: { request_id: 'request:a1',
      root_turn_id: 'turn:a1', action_ref: 'action:a1', step_index: 1 },
    context_pin: { context_ref: 'context:a1', context_state_version: '7',
      profile_ref: 'profile:a1', profile_version: '1' },
    technical_policy_pin: { policy_ref: 'policy:a1', version: 1,
      max_new_entities: 4 },
    identity_mode: identityMode, origin: overrides.origin ?? null,
    result_class: overrides.result_class ?? 'ordinary_physical_result',
    source_transitions: [], tool_state_pins: [], results: [result],
    known_waste: [], qualitative_result: {
      intended_transformation: 'выполнить физическое преобразование',
      material_extent: identityMode === 'independent_outputs' ? 'whole' : null,
      output_class: overrides.output_class ?? 'ordinary_mundane',
      result_descriptor: {
        display_name: overrides.display_name ?? 'необычная физическая деталь',
        physical_description: overrides.physical_description
          ?? 'материал получил новую физическую форму',
        qualitative_facts: ['физически обработан'],
        inscription_text: inscriptionText
      }
    }
  };
}
