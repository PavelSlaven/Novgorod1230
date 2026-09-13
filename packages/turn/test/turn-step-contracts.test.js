import assert from 'node:assert/strict';
import test from 'node:test';
import {
  TURN_STEP_PLAN_V1_SCHEMA,
  TURN_STEP_REQUEST_V1_SCHEMA,
  requestTurnStepPlan,
  validateTurnStepPlan,
  validateTurnStepRequest
} from '../src/turn-step-contracts.js';
import { directPlan, genericPlan, plan, request } from './turn-step-contracts-fixture.js';

test('schemas are deeply frozen and expose strict v1 top-level contracts', () => {
  assert.equal(Object.isFrozen(TURN_STEP_REQUEST_V1_SCHEMA), true);
  assert.equal(Object.isFrozen(TURN_STEP_REQUEST_V1_SCHEMA.properties), true);
  assert.equal(TURN_STEP_REQUEST_V1_SCHEMA.additionalProperties, false);
  assert.equal(TURN_STEP_REQUEST_V1_SCHEMA.properties.max_internal_steps.const, 8);
  assert.equal(Object.isFrozen(TURN_STEP_PLAN_V1_SCHEMA.$defs.create_entity), true);
  assert.equal(TURN_STEP_PLAN_V1_SCHEMA.additionalProperties, false);
  assert.equal(TURN_STEP_PLAN_V1_SCHEMA.$defs.clarification.additionalProperties, false);
  assert.deepEqual(TURN_STEP_PLAN_V1_SCHEMA.$defs.request_movement
    .properties.description, { type: 'string', minLength: 1 });
  assert.equal(TURN_STEP_PLAN_V1_SCHEMA.$defs.request_movement
    .required.includes('description'), false);
});

test('structured-output schema represents exact start and affect fire branches',
  async () => {
    const branches = TURN_STEP_PLAN_V1_SCHEMA.$defs.request_world_process.oneOf;
    assert.equal(branches.length, 2);
    const start = branches.find(({ properties }) =>
      properties.process_action.const === 'start');
    const affect = branches.find(({ properties }) =>
      properties.process_action.const === 'affect');
    assert.equal(start.additionalProperties, false);
    assert.equal(start.properties.process_ref.type, 'null');
    assert.equal(start.properties.target_refs.minItems, 1);
    assert.equal(affect.additionalProperties, false);
    assert.equal(affect.properties.process_ref.minLength, 1);
    assert.equal(affect.properties.target_refs.minItems, 0);
    assert.equal(affect.properties.target_refs.maxItems, 0);

    const source = request();
    source.player_safe_state.visible_entities.push(
      { entity_ref: 'fuel_1', kind: 'item' },
      { entity_ref: 'fire_1', kind: 'local_world_process' }
    );
    const structured = plan({ operations: [{
      op: 'request_world_process', actor_ref: 'actor_mikula',
      process_action: 'affect', process_ref: 'fire_1', process_kind: 'fire',
      source_refs: ['fuel_1'], target_refs: [], description: 'Добавить топливо.'
    }], continuation: null });
    const sealed = await requestTurnStepPlan({ request: source,
      turnStepModel: async () => structured });
    assert.deepEqual(sealed.operations[0].target_refs, []);
    structured.operations[0].target_refs = ['fuel_1'];
    assert.equal(validateTurnStepPlan(structured, { request: source }).ok,
      false);
  });

test('request validation accepts JSON projections and enforces strict step lineage', () => {
  assert.deepEqual(validateTurnStepRequest(request()), { ok: true, errors: [] });
  const second = request({
    working_revision: 1,
    step_index: 2,
    completed_steps: [{ step_index: 1, summary: 'сундук открыт' }]
  });
  assert.equal(validateTurnStepRequest(second).ok, true);
  const prepared = request({ prepared_followup_candidates: [{
    prepared_followup_ref: 'continue-work',
    precursor_operation: { op: 'request_activity', description: 'prepare' },
    operation: { op: 'request_activity', description: 'continue' }
  }] });
  assert.equal(validateTurnStepRequest(prepared).ok, true);
  delete prepared.prepared_followup_candidates[0].precursor_operation;
  assert.equal(validateTurnStepRequest(prepared).ok, false);
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

test('continuation cannot repeat intent after a non-discovery domain step', () => {
  const source = request();
  const repeated = plan({ continuation: {
    remaining_intent: source.remaining_intent, depends_on_refs: []
  } });
  const invalid = validateTurnStepPlan(repeated, { request: source });
  assert.equal(invalid.errors.some(({ code }) =>
    code === 'continuation_progress'), true);

  repeated.operations = [{ op: 'request_discovery',
    actor_ref: 'actor_mikula', discovery_kind: 'inspect',
    target_refs: ['sand_bank'], query: 'осмотреть берег' }];
  assert.equal(validateTurnStepPlan(repeated, { request: source }).ok, true);
});

test('ordinary discovery carries only a bounded exact item quantity', () => {
  const source = request();
  const discovery = plan({ operations: [{ op: 'request_discovery',
    actor_ref: 'actor_mikula', discovery_kind: 'inspect',
    target_refs: ['sand_bank'], query: 'сухие ветки',
    quantity: { value: 5, unit: 'item' } }],
  continuation: { remaining_intent: source.remaining_intent,
    depends_on_refs: [] } });
  assert.equal(validateTurnStepPlan(discovery, { request: source }).ok, true);
  discovery.operations[0].quantity.value = 17;
  assert.equal(validateTurnStepPlan(discovery, { request: source }).ok, false);
});

test('pending discovery is a strict single-target code carrier', () => {
  const source = request();
  const discovery = plan({ operations: [{ op: 'request_discovery',
    actor_ref: 'actor_mikula', discovery_kind: 'inspect',
    target_refs: ['sand_bank'], query: source.remaining_intent }],
  continuation: { remaining_intent: source.remaining_intent,
    depends_on_refs: [], pending_discovery: {
      remaining_target_refs: ['chest_1'], after: {
        remaining_intent: 'взять меч', depends_on_refs: ['chest_1']
      }
    } } });
  assert.equal(validateTurnStepPlan(discovery, { request: source }).ok, true);

  discovery.continuation.depends_on_refs = ['chest_1'];
  assert.equal(validateTurnStepPlan(discovery, { request: source }).errors.some(
    ({ code }) => code === 'carrier'), true);
  discovery.continuation.depends_on_refs = [];
  discovery.continuation.pending_discovery.after.pending_discovery = {};
  assert.equal(validateTurnStepPlan(discovery, { request: source }).errors.some(
    ({ code }) => code === 'additional_property'), true);
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
  movement.operations[0].description = 'Follow the marked path.';
  assert.deepEqual(validateTurnStepPlan(movement, { request: source }), {
    ok: true,
    errors: []
  });
});

test('plan validation admits only refs supplied by available domain operations', () => {
  const source = request({ available_domain_operations: [{
    op: 'request_movement', actor_ref: 'actor_mikula', movement_kind: 'route',
    target_ref: 'location:admitted-only'
  }] });
  const movement = plan({ operations: [{
    op: 'request_movement', actor_ref: 'actor_mikula', movement_kind: 'route',
    target_ref: 'location:admitted-only'
  }], continuation: null });

  assert.equal(validateTurnStepPlan(movement, { request: source }).ok, true);
  movement.operations[0].target_ref = 'location:invented';
  assert.equal(validateTurnStepPlan(movement, { request: source }).errors.some(
    ({ path, code }) => path === '$.operations[0].target_ref'
      && code === 'unknown_ref'), true);
});

test('continuation admits refs supplied by prepared followup candidates', () => {
  const source = request({ prepared_followup_candidates: [{
    prepared_followup_ref: 'continue-conversation',
    precursor_operation: { op: 'request_activity', target_refs: ['fire_1'] },
    operation: { op: 'emit_interaction', target_actor_refs: ['npc_fisher'] }
  }] });
  const continued = plan({ continuation: {
    remaining_intent: 'попросить рыбака идти дальше',
    depends_on_refs: ['npc_fisher']
  } });

  assert.equal(validateTurnStepPlan(continued, { request: source }).ok, true);
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
  const stalledDirect = directPlan({
    goal_result: 'pending',
    continuation: {
      remaining_intent: request().remaining_intent,
      depends_on_refs: []
    }
  });
  assert.equal(validateTurnStepPlan(stalledDirect, { request: request() })
    .errors.some(({ code }) => code === 'continuation_progress'), true);
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

  const exactWait = directPlan({ activity: { owner: 'semantic',
    duration_class: 'brief', effort: 'none',
    requested_duration_minutes: 10 } });
  assert.equal(validateTurnStepPlan(exactWait, { request: request() }).ok,
    true);
  exactWait.activity.requested_duration_minutes = 0;
  assert.equal(validateTurnStepPlan(exactWait, { request: request() }).ok,
    false);

  const actorIsNotAContainer = directPlan({ operations: [{
    op: 'move_entity', entity_ref: 'chest_1', placement: {
      relation: 'inside', target_ref: 'actor_mikula' }
  }] });
  assert.equal(validateTurnStepPlan(actorIsNotAContainer, {
    request: request()
  }).errors.some(({ code }) => code === 'placement_target_kind'), true);

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
