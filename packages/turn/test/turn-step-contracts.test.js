import assert from 'node:assert/strict';
import test from 'node:test';
import {
  TURN_STEP_PLAN_V1_SCHEMA,
  TURN_STEP_REQUEST_V1_SCHEMA,
  requestTurnStepPlan,
  validateTurnStepPlan,
  validateTurnStepRequest
} from '../src/turn-step-contracts.js';

function request(overrides = {}) {
  return {
    schema: 'turn_step_request_v1',
    request_id: 'turn-request-42',
    root_turn_id: 'turn-42',
    committed_state_version: 17,
    working_revision: 0,
    step_index: 1,
    max_internal_steps: 8,
    root_player_action: 'открываю сундук и беру меч',
    remaining_intent: 'открыть сундук и взять меч',
    completed_steps: [],
    actor: {
      actor_ref: 'actor_mikula',
      attributes: [{ attribute_ref: 'strength' }],
      skills: [{ skill_ref: 'athletics' }]
    },
    player_safe_state: {
      visible_entities: [
        { entity_ref: 'chest_1', kind: 'container' },
        { entity_ref: 'sand_bank', kind: 'environment' },
        { entity_ref: 'npc_1', kind: 'actor' }
      ],
      positions: [{ location_ref: 'shore' }]
    },
    ...overrides
  };
}

function plan(overrides = {}) {
  return {
    schema: 'turn_step_plan_v1',
    request_id: 'turn-request-42',
    committed_state_version: 17,
    working_revision: 0,
    step_index: 1,
    interpretation: {
      player_goal: 'открыть сундук и взять меч',
      grounded_attempt: 'открыть сундук',
      adaptation: 'literal'
    },
    resolution: 'domain_request',
    goal_result: 'pending',
    activity: { owner: 'domain', duration_class: null, effort: null },
    operations: [{
      op: 'request_container_access',
      actor_ref: 'actor_mikula',
      container_ref: 'chest_1',
      access_kind: 'open_and_view'
    }],
    check: null,
    continuation: {
      remaining_intent: 'взять меч, если он окажется внутри',
      depends_on_refs: ['chest_1']
    },
    clarification: null,
    reason_code: 'container_contents_not_visible',
    reason: 'содержимое закрытого сундука ещё неизвестно',
    ...overrides
  };
}

function directPlan(overrides = {}) {
  return plan({
    resolution: 'direct',
    goal_result: 'achieved',
    activity: { owner: 'semantic', duration_class: 'brief', effort: 'light' },
    operations: [],
    continuation: null,
    reason_code: 'direct_step',
    reason: 'шаг имеет непосредственный фактический результат',
    ...overrides
  });
}

function outcome(overrides = {}) {
  return {
    goal_result: 'achieved',
    additional_activity: null,
    operations: [],
    continuation: null,
    ...overrides
  };
}

function genericPlan(overrides = {}) {
  return directPlan({
    resolution: 'generic_check',
    goal_result: 'pending',
    check: {
      purpose: 'удалось ли удержаться на ногах',
      attribute_ref: 'strength',
      skill_ref: 'athletics',
      difficulty_id: 'risky',
      outcomes: {
        clean_success: outcome(),
        success: outcome(),
        success_with_cost: outcome({ additional_activity: { duration_class: 'brief', effort: 'light' } }),
        failure_with_consequence: outcome({ goal_result: 'not_achieved' }),
        severe_failure: outcome({ goal_result: 'not_achieved' })
      }
    },
    reason_code: 'generic_uncertainty',
    reason: 'исход возможной попытки не определён',
    ...overrides
  });
}

test('schemas are deeply frozen and expose strict v1 top-level contracts', () => {
  assert.equal(Object.isFrozen(TURN_STEP_REQUEST_V1_SCHEMA), true);
  assert.equal(Object.isFrozen(TURN_STEP_REQUEST_V1_SCHEMA.properties), true);
  assert.equal(TURN_STEP_REQUEST_V1_SCHEMA.additionalProperties, false);
  assert.equal(TURN_STEP_REQUEST_V1_SCHEMA.properties.max_internal_steps.const, 8);
  assert.equal(Object.isFrozen(TURN_STEP_PLAN_V1_SCHEMA.$defs.create_entity), true);
  assert.equal(TURN_STEP_PLAN_V1_SCHEMA.additionalProperties, false);
  assert.equal(TURN_STEP_PLAN_V1_SCHEMA.$defs.clarification.additionalProperties, false);
});

test('request validation accepts JSON projections and enforces strict step lineage', () => {
  assert.deepEqual(validateTurnStepRequest(request()), { ok: true, errors: [] });
  const second = request({
    working_revision: 1,
    step_index: 2,
    completed_steps: [{ step_index: 1, summary: 'сундук открыт' }]
  });
  assert.equal(validateTurnStepRequest(second).ok, true);
  const invalid = request({
    max_internal_steps: 9,
    working_revision: 2,
    step_index: 2,
    completed_steps: [{ step_index: 2, summary: 'непоследовательный шаг', extra: true }],
    extra: true
  });
  const result = validateTurnStepRequest(invalid);
  assert.equal(result.ok, false);
  assert.deepEqual(new Set(result.errors.map(({ code }) => code)), new Set(['additional_property', 'const', 'sequence', 'lineage']));
  assert.equal(validateTurnStepRequest(request({ actor: { bad: undefined } })).ok, false);
  assert.equal(validateTurnStepRequest(request({ player_safe_state: { bad: Infinity } })).ok, false);
});

test('plan validation accepts every resolution and exact clarification shape', () => {
  assert.equal(validateTurnStepPlan(directPlan(), { request: request() }).ok, true);
  assert.equal(validateTurnStepPlan(plan(), { request: request() }).ok, true);
  assert.equal(validateTurnStepPlan(genericPlan(), { request: request() }).ok, true);
  const clarification = directPlan({
    resolution: 'clarification_required',
    goal_result: 'pending',
    operations: [],
    clarification: { question: 'Какой сундук открыть?', target_refs: ['chest_1'] },
    reason_code: 'material_ambiguity',
    reason: 'нужно выбрать один объект'
  });
  assert.equal(validateTurnStepPlan(clarification, { request: request() }).ok, true);
  clarification.clarification.extra = true;
  assert.equal(validateTurnStepPlan(clarification, { request: request() }).errors.some(({ code }) => code === 'additional_property'), true);
});

test('continuation rejects a reserved future domain operation', () => {
  const reserved = plan();
  reserved.continuation.next_domain_operation = {
    op: 'request_container_access',
    actor_ref: 'actor_mikula',
    container_ref: 'chest_1',
    access_kind: 'open_and_view'
  };
  const invalid = validateTurnStepPlan(reserved, { request: request() });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.errors.some(({ code }) =>
    code === 'additional_property'), true);
});

test('plan validation admits refs exposed through a plural ref array', () => {
  const source = request();
  source.player_safe_state.destination_refs = ['location:camp'];
  const movement = plan({
    operations: [{
      op: 'request_movement',
      actor_ref: 'actor_mikula',
      target_ref: 'location:camp',
      movement_kind: 'local'
    }],
    continuation: null
  });

  assert.deepEqual(validateTurnStepPlan(movement, { request: source }), {
    ok: true,
    errors: []
  });
});

test('plan validation admits an exact player combat intent request', () => {
  const source = request();
  source.player_safe_state.destination_refs = ['location:camp'];
  const combat = plan({
    operations: [{
      op: 'request_combat',
      actor_ref: 'actor_mikula',
      intent_kind: 'engage',
      target_refs: ['npc_1'],
      protected_refs: [],
      scope_ref: null,
      destination_ref: null,
      force_limit: 'nonlethal_if_possible',
      risk_posture: 'ordinary'
    }],
    continuation: null
  });
  assert.deepEqual(validateTurnStepPlan(combat, { request: source }), {
    ok: true,
    errors: []
  });

  combat.operations[0].destination_ref = 'location:camp';
  const invalid = validateTurnStepPlan(combat, { request: source });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.errors.some(({ code }) =>
    code === 'combat_intent_shape'), true);
});

test('sole turn plan boundary admits qualitative action production', () => {
  const source = request();
  source.player_safe_state.visible_objects = [
    { entity_ref: { entity_kind: 'item', entity_id: 'item:pole' } },
    { entity_ref: { entity_kind: 'item', entity_id: 'item:knife' } },
    { entity_ref: { entity_kind: 'item', entity_id: 'item:stone' } }
  ];
  const action = plan({
    operations: [{
      op: 'request_item_use', actor_ref: 'actor_mikula',
      item_ref: 'item:pole', use_kind: 'other',
      target_refs: ['item:knife', 'item:stone'],
      action_production: {
        source_refs: ['item:pole'],
        tool_refs: ['item:knife', 'item:stone'], output_count: 0,
        identity_mode: 'preserve_source', origin: null,
        result_class: 'partial_transformation',
        material_extent: null,
        result_descriptor: {
          display_name: 'заострённая жердь',
          physical_description: 'конец жерди физически заострён',
          qualitative_facts: ['на конце видны свежие срезы'],
          inscription_text: null,
          weapon_qualitative_class: 'improvised_puncture_light'
        },
        output_class: 'weapon_capable'
      }
    }],
    continuation: null
  });
  assert.deepEqual(validateTurnStepPlan(action, { request: source }), {
    ok: true, errors: []
  });

  action.operations[0].action_production.result_descriptor
    .weapon_qualitative_class = 'forged_weapon_class';
  assert.equal(validateTurnStepPlan(action, { request: source }).ok, false);

  const partition = structuredClone(action);
  partition.operations[0].action_production.result_descriptor
    .weapon_qualitative_class = 'improvised_puncture_light';
  partition.operations[0].action_production = {
    ...partition.operations[0].action_production,
    source_refs: ['item:pole', 'item:stone'], tool_refs: ['item:knife'],
    output_count: 2, identity_mode: 'independent_outputs',
    origin: 'crafted', material_extent: 'minor'
  };
  assert.equal(validateTurnStepPlan(partition, { request: source }).ok, true);
  partition.operations[0].action_production.result_descriptor.display_name =
    null;
  assert.equal(validateTurnStepPlan(partition, { request: source }).ok, false);
  partition.operations[0].action_production.result_descriptor.display_name =
    'деревянный клин';
  partition.operations[0].action_production.result_descriptor
    .physical_description = null;
  assert.equal(validateTurnStepPlan(partition, { request: source }).ok, true);
  partition.operations[0].action_production.tool_refs = ['item:stone'];
  assert.equal(validateTurnStepPlan(partition, { request: source }).ok, false);
});

test('relational validation fails closed on echoes, mixed resolutions and malformed checks', () => {
  const mixed = directPlan({
    request_id: 'wrong-request',
    operations: plan().operations,
    continuation: { remaining_intent: 'продолжить', depends_on_refs: [] },
    goal_result: 'achieved',
    check: genericPlan().check
  });
  const result = validateTurnStepPlan(mixed, { request: request() });
  const codes = new Set(result.errors.map(({ code }) => code));
  assert.equal(codes.has('echo_mismatch'), true);
  assert.equal(codes.has('resolution'), true);
  assert.equal(codes.has('continuation'), true);
  const missingBand = genericPlan();
  delete missingBand.check.outcomes.severe_failure;
  assert.equal(validateTurnStepPlan(missingBand, { request: request() }).errors.some(({ code }) => code === 'required'), true);
  const duplicateBranchTemp = genericPlan();
  const addFact = {
    op: 'change_entity_facts',
    entity_ref: 'chest_1',
    remove_fact_refs: [],
    add_facts: [{ temp_ref: 'shared_branch_fact', text: 'ветвевой факт' }]
  };
  duplicateBranchTemp.check.outcomes.clean_success.operations = [structuredClone(addFact)];
  duplicateBranchTemp.check.outcomes.success.operations = [structuredClone(addFact)];
  assert.equal(validateTurnStepPlan(duplicateBranchTemp, { request: request() }).errors.some(({ code }) => code === 'duplicate_temp_ref'), true);
  const unknownDependency = directPlan({
    goal_result: 'pending',
    continuation: { remaining_intent: 'продолжить', depends_on_refs: ['unknown_ref'] }
  });
  assert.equal(validateTurnStepPlan(unknownDependency, { request: request() }).errors.some(({ code }) => code === 'unknown_ref'), true);
  const extraField = directPlan({ interpretation: { ...directPlan().interpretation, invented: true } });
  assert.equal(validateTurnStepPlan(extraField, { request: request() }).errors.some(({ code }) => code === 'additional_property'), true);
});

test('generic check permits operations and continuation only in outcome branches', () => {
  const topLevelPayload = genericPlan({
    operations: [{
      op: 'change_entity_facts',
      entity_ref: 'chest_1',
      remove_fact_refs: [],
      add_facts: []
    }],
    continuation: {
      remaining_intent: 'продолжить после общей проверки',
      depends_on_refs: ['chest_1']
    }
  });

  const result = validateTurnStepPlan(topLevelPayload, {
    request: request()
  });
  assert.equal(result.ok, false);
  assert.deepEqual(
    result.errors.filter(({ code }) => code === 'resolution')
      .map(({ path }) => path),
    ['$.operations', '$.continuation']
  );
});

test('canonical attribute and skill map keys are refs without admitting arbitrary map keys', () => {
  const canonicalRequest = request({
    actor: {
      actor_id: 'actor_mikula',
      attributes: { strength: { value: 9 } },
      skills: { athletics: { bonus: 1 } },
      arbitrary: { forged_ref: { value: true } }
    }
  });
  assert.equal(validateTurnStepPlan(genericPlan(), {
    request: canonicalRequest
  }).ok, true);

  const forged = genericPlan();
  forged.check.attribute_ref = 'forged_ref';
  const result = validateTurnStepPlan(forged, {
    request: canonicalRequest
  });
  assert.equal(result.errors.some(({ path, code }) =>
    path === '$.check.attribute_ref' && code === 'unknown_ref'), true);
});

test('manual plan validation rejects a step beyond the loop cap', () => {
  const beyondCap = directPlan({ step_index: 9 });
  const result = validateTurnStepPlan(beyondCap);

  assert.equal(result.ok, false);
  assert.equal(result.errors.some(({ path, code }) =>
    path === '$.step_index' && code === 'maximum'), true);
});

test('operation validation enforces known and ordered refs, retirement, placements and container cycles', () => {
  const mechanics = {
    mass_grams: 300,
    external_hand_cost: 1,
    carry_form: 'compact',
    packing_slot_cost: 1,
    quantity: { value: 1, unit: 'handful' },
    container: null
  };
  const valid = directPlan({
    operations: [{
      op: 'create_entity',
      temp_ref: 'sand_1',
      semantic_type: 'material_portion',
      name: 'горсть песка',
      origin: { kind: 'direct_partition', source_refs: ['sand_bank'] },
      facts: [{ temp_ref: 'sand_fact_1', text: 'мокрый речной песок' }],
      mechanics,
      placement: { relation: 'held_by', target_ref: 'actor_mikula' }
    }, {
      op: 'change_entity_facts',
      entity_ref: 'sand_1',
      remove_fact_refs: ['sand_fact_1'],
      add_facts: [{ temp_ref: 'sand_fact_2', text: 'песок сжат в ладони' }]
    }]
  });
  assert.equal(validateTurnStepPlan(valid, { request: request() }).ok, true);

  const invalid = directPlan({
    operations: [{
      op: 'create_entity', temp_ref: 'box_a', semantic_type: 'container', name: 'короб A',
      origin: { kind: 'crafted', source_refs: ['sand_bank'] }, facts: [], mechanics,
      placement: { relation: 'inside', target_ref: 'chest_1' }
    }, {
      op: 'create_entity', temp_ref: 'box_b', semantic_type: 'container', name: 'короб B',
      origin: { kind: 'crafted', source_refs: ['sand_bank'] }, facts: [], mechanics,
      placement: { relation: 'inside', target_ref: 'box_a' }
    }, {
      op: 'move_entity', entity_ref: 'box_a',
      placement: { relation: 'inside', target_ref: 'box_b' }
    }, {
      op: 'retire_entity', entity_ref: 'box_b', reason: 'уничтожен'
    }, {
      op: 'set_entity_mechanics', entity_ref: 'box_b', mechanics, reason: 'невозможное изменение после удаления'
    }, {
      op: 'move_entity', entity_ref: 'missing', placement: { relation: 'located_at', target_ref: 'shore' }
    }]
  });
  const codes = new Set(validateTurnStepPlan(invalid, { request: request() }).errors.map(({ code }) => code));
  assert.equal(codes.has('duplicate_placement'), true);
  assert.equal(codes.has('container_cycle'), true);
  assert.equal(codes.has('retired_ref'), true);
  assert.equal(codes.has('unknown_ref'), true);
});

test('model helper exposes one validated frozen seam and rejects invalid dependencies or output', async () => {
  let seen;
  const output = await requestTurnStepPlan({
    request: request(),
    turnStepModel: async (input) => {
      seen = input;
      assert.equal(Object.isFrozen(input), true);
      assert.equal(Object.isFrozen(input.actor), true);
      return directPlan();
    }
  });
  assert.equal(Object.isFrozen(output), true);
  assert.equal(Object.isFrozen(output.interpretation), true);
  assert.equal(seen.schema, 'turn_step_request_v1');
  await assert.rejects(() => requestTurnStepPlan({ request: request() }), { code: 'TURN_STEP_MODEL_MISSING' });
  await assert.rejects(() => requestTurnStepPlan({
    request: request(),
    turnStepModel: async () => ({ ...directPlan(), request_id: 'forged' })
  }), { code: 'TURN_STEP_PLAN_INVALID' });
  await assert.rejects(() => requestTurnStepPlan({
    request: request({ max_internal_steps: 9 }),
    turnStepModel: async () => directPlan()
  }), { code: 'TURN_STEP_REQUEST_INVALID' });
});
