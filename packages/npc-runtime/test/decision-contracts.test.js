import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildNpcDecisionBoundary,
  buildNpcDecisionSignal,
  evaluateNpcDecisionSignals,
  validateNpcDecisionBoundary,
  validateNpcDecisionSignal
} from '../src/decision-signals.js';
import {
  validateConversationContributionPlan,
  validateNpcConversationResponseRequest,
  validatePlayerConversationContributionPlan,
  validatePlayerConversationInput,
  validateSocialDeliveryResult
} from '../src/conversation-contracts.js';
import { validateNpcActionDecisionRequest } from '../src/semantic-decision-contracts.js';

const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const at = (whole_minutes = '10') => ({
  whole_minutes,
  subminute_numerator: '0',
  subminute_denominator: '1'
});
const copy = (value) => structuredClone(value);

const deliveryByOutcome = {
  clean_success: 'compelling',
  success: 'credible',
  success_with_cost: 'credible_with_visible_cost',
  failure_with_consequence: 'unconvincing',
  severe_failure: 'transparently_manipulative'
};

function checkOutcomes() {
  return Object.fromEntries(Object.entries(deliveryByOutcome).map(([outcome, delivery_quality]) => [
    outcome,
    { delivery_quality, observable_effects: [] }
  ]));
}

function speechBody(overrides = {}) {
  return {
    contribution_kind: 'speech',
    primary_addressee_ref: ref('npc', 'listener'),
    intended_addressee_refs: [ref('npc', 'listener')],
    affected_actor_refs: [],
    speech: {
      utterance_text: 'Слушай меня.',
      dominant_act: 'inform',
      interaction_tags: [],
      topic_refs: [],
      claims: [],
      response_expectation: { kind: 'none', target_refs: [] }
    },
    interpretation: {
      intent: 'сообщить сведения',
      grounded_contribution: 'обратиться к собеседнику',
      adaptation: 'literal'
    },
    resolution: 'automatic',
    activity: { duration_class: 'brief', effort: 'none' },
    supporting_operations: [{ op: 'emit_interaction', gesture: 'points' }],
    check: null,
    handoff: null,
    ...overrides
  };
}

test('decision boundary identity includes NPC, same-time batch and mode', () => {
  const input = {
    scheduled_at: at(),
    npc_ref: ref('npc', 'guard'),
    same_time_batch_ref: ref('temporal_batch', 'batch-1'),
    significance: 'material',
    categories: ['communication', 'self'],
    signal_refs: [
      ref('npc_decision_signal', 'signal-z'),
      ref('npc_decision_signal', 'signal-a')
    ],
    state_version: '4'
  };
  const autonomous = buildNpcDecisionBoundary({ decision_mode: 'autonomous', ...input });
  const conversation = buildNpcDecisionBoundary({ decision_mode: 'conversation', ...input });

  assert.equal(
    autonomous.boundary_id,
    'npc-decision:autonomous:batch-1:guard'
  );
  assert.notEqual(
    conversation.boundary_id,
    autonomous.boundary_id
  );
  assert.equal(
    conversation.boundary_id,
    'npc-decision:conversation:batch-1:guard'
  );
  assert.deepEqual(autonomous.categories, ['self', 'communication']);
  assert.deepEqual(autonomous.signal_refs.map(({ entity_id }) => entity_id), [
    'signal-a',
    'signal-z'
  ]);

  const nonCanonical = copy(autonomous);
  nonCanonical.signal_refs.reverse();
  assert.equal(validateNpcDecisionBoundary(nonCanonical), false);
});

test('decision signal evaluation is canonical for input order', () => {
  const npc = ref('npc', 'guard');
  const signal = (eventId, category) => buildNpcDecisionSignal({
    occurred_at: at(),
    category,
    significance: 'material',
    source_event_ref: ref('conversation_statement', eventId),
    subject_ref: npc,
    perception_required: false
  });
  const result = evaluateNpcDecisionSignals({
    npc_ref: npc,
    active_mode: 'conversation',
    current_intent: null,
    decision_capability: true,
    resolved_signals: [signal('z-event', 'communication'), signal('a-event', 'self')],
    consumed_signal_ids: [],
    same_time_batch_ref: ref('temporal_batch', 'batch-1'),
    state_version: '4'
  });

  assert.deepEqual(result.boundary.signal_refs.map(({ entity_id }) => entity_id), [
    'decision-signal:conversation_statement:a-event:guard:self',
    'decision-signal:conversation_statement:z-event:guard:communication'
  ]);
  assert.deepEqual(result.consumed_signal_ids, [
    'decision-signal:conversation_statement:a-event:guard:self',
    'decision-signal:conversation_statement:z-event:guard:communication'
  ]);
});

test('one factual event may create two decision signal categories for one NPC', () => {
  const npc = ref('npc', 'guard');
  const event = ref('temporal_event', 'arrival-1');
  const signal = (category) => buildNpcDecisionSignal({
    occurred_at: at(),
    category,
    significance: 'material',
    source_event_ref: event,
    subject_ref: npc,
    perception_required: false
  });
  const others = signal('others');
  const objective = signal('objective');

  assert.notEqual(others.signal_id, objective.signal_id);
  const result = evaluateNpcDecisionSignals({
    npc_ref: npc,
    active_mode: 'conversation',
    current_intent: null,
    decision_capability: true,
    resolved_signals: [objective, others],
    consumed_signal_ids: [],
    same_time_batch_ref: ref('temporal_batch', 'batch-1'),
    state_version: '4'
  });
  assert.deepEqual(result.boundary.categories, ['others', 'objective']);
  assert.equal(result.boundary.signal_refs.length, 2);
});

test('decision signal validation rejects the pre-cutover legacy identity', () => {
  const generated = buildNpcDecisionSignal({
    occurred_at: at(),
    category: 'environment',
    significance: 'material',
    source_event_ref: ref('world_event', 'event-17'),
    subject_ref: ref('npc', 'guard'),
    perception_required: false
  });
  const legacyId = 'decision-signal:event-17:guard';
  const legacy = {
    ...structuredClone(generated),
    signal_id: legacyId,
    idempotency_key: legacyId
  };

  assert.equal(validateNpcDecisionSignal(legacy), false);
  assert.notEqual(generated.signal_id, legacyId);
});

test('player conversation supporting operations are closed by the request operation contract', () => {
  const request = {
    schema: 'player_conversation_input_v1',
    request_id: 'request-1',
    conversation_id: 'conversation-1',
    state_version: 1,
    speaker_ref: ref('player_character', 'player'),
    raw_text: 'Показываю на лодку.',
    received_at: 'system-time-1',
    player_safe_context: {},
    operation_contract: { emit_interaction: {} }
  };
  const plan = {
    schema: 'player_conversation_contribution_plan_v1',
    request_id: request.request_id,
    conversation_id: request.conversation_id,
    state_version: request.state_version,
    speaker_ref: request.speaker_ref,
    input_mode: 'intent_paraphrase',
    ...speechBody()
  };

  assert.equal(validatePlayerConversationInput(request), true);
  assert.equal(validatePlayerConversationContributionPlan(plan, request), true);
  assert.equal(validatePlayerConversationContributionPlan(plan, {
    ...request,
    operation_contract: {}
  }), false);
});

function npcConversationRequest() {
  return {
    schema: 'npc_conversation_response_request_v1',
    request_id: 'request-2',
    boundary_id: 'boundary-2',
    conversation_id: 'conversation-1',
    exchange_id: 'exchange-1',
    state_version: 2,
    requested_at: at(),
    npc_ref: ref('npc', 'speaker'),
    decision_reasons: {
      significance: 'critical',
      categories: ['self', 'communication'],
      signal_refs: [
        ref('npc_decision_signal', 'signal-a'),
        ref('npc_decision_signal', 'signal-z')
      ],
      perceived_changes: ['Услышан прямой вопрос.']
    },
    npc: {},
    perceived_message: {
      source_statement_ref: ref('conversation_statement', 'statement-1'),
      perception_result_ref: ref('perception_result', 'perception-1')
    },
    public_conversation_history: [],
    knowledge: {},
    memory: {},
    social_context: {},
    available_resources: [],
    allowed_references: {
      actor_refs: [
        ref('npc', 'listener'),
        ref('npc', 'speaker'),
        ref('player_character', 'player')
      ],
      entity_refs: [],
      knowledge_refs: [],
      combat_target_refs: []
    },
    decision_scope: {
      conversation_mode: true,
      action_handoff_available: true,
      combat_handoff_available: false,
      allowed_attribute_refs: ['influence'],
      allowed_skill_refs: ['communication'],
      operation_contract: { emit_interaction: {} }
    }
  };
}

function npcConversationPlan(request = npcConversationRequest()) {
  return {
    schema: 'conversation_contribution_plan_v1',
    request_id: request.request_id,
    boundary_id: request.boundary_id,
    conversation_id: request.conversation_id,
    exchange_id: request.exchange_id,
    state_version: request.state_version,
    speaker_ref: request.npc_ref,
    ...speechBody({
      resolution: 'check_required',
      check: {
        purpose: 'говорить убедительно',
        attribute_ref: 'influence',
        skill_ref: 'communication',
        difficulty_band: 'risky',
        outcomes: checkOutcomes()
      }
    }),
    reason: 'NPC решил ответить.'
  };
}

function npcCombatPlan(request, targetRef) {
  return {
    schema: 'conversation_contribution_plan_v1',
    request_id: request.request_id,
    boundary_id: request.boundary_id,
    conversation_id: request.conversation_id,
    exchange_id: request.exchange_id,
    state_version: request.state_version,
    speaker_ref: request.npc_ref,
    contribution_kind: 'combat_handoff',
    primary_addressee_ref: null,
    intended_addressee_refs: [],
    affected_actor_refs: [],
    speech: null,
    interpretation: {
      intent: 'передать управление бою',
      grounded_contribution: 'начать конфликт',
      adaptation: 'literal'
    },
    resolution: 'automatic',
    activity: { duration_class: 'brief', effort: 'none' },
    supporting_operations: [],
    check: null,
    handoff: {
      kind: 'combat',
      intent: 'transfer control to the combat owner',
      target_actor_refs: [targetRef]
    },
    reason: 'NPC выбирает боевую передачу управления.'
  };
}

test('NPC conversation reasons, supporting operations and check refs are closed and canonical', () => {
  const request = npcConversationRequest();
  const plan = npcConversationPlan(request);
  assert.equal(validateNpcConversationResponseRequest(request), true);
  assert.equal(validateConversationContributionPlan(plan, request), true);

  const nonCanonicalReasons = copy(request);
  nonCanonicalReasons.decision_reasons.signal_refs.reverse();
  assert.equal(validateNpcConversationResponseRequest(nonCanonicalReasons), false);

  const nonCanonicalCategories = copy(request);
  nonCanonicalCategories.decision_reasons.categories.reverse();
  assert.equal(validateNpcConversationResponseRequest(nonCanonicalCategories), false);

  const environmentRequest = copy(request);
  environmentRequest.decision_reasons.categories = ['environment'];
  environmentRequest.perceived_message = null;
  assert.equal(validateNpcConversationResponseRequest(environmentRequest), true);

  const communicationWithoutMessage = copy(request);
  communicationWithoutMessage.perceived_message = null;
  assert.equal(
    validateNpcConversationResponseRequest(communicationWithoutMessage),
    false
  );

  const environmentWithMessage = copy(environmentRequest);
  environmentWithMessage.perceived_message = request.perceived_message;
  assert.equal(
    validateNpcConversationResponseRequest(environmentWithMessage),
    false
  );

  assert.equal(validateNpcConversationResponseRequest({
    ...request,
    conversation_trigger: 'direct_question'
  }), false);

  const disallowedOperation = copy(request);
  disallowedOperation.decision_scope.operation_contract = {};
  assert.equal(validateConversationContributionPlan(plan, disallowedOperation), false);

  const disallowedCheck = copy(plan);
  disallowedCheck.check.attribute_ref = 'strength';
  assert.equal(validateConversationContributionPlan(disallowedCheck, request), false);

  const mismatchedDelivery = copy(plan);
  mismatchedDelivery.check.outcomes.severe_failure.delivery_quality = 'compelling';
  assert.equal(validateConversationContributionPlan(mismatchedDelivery, request), false);
});

test('NPC contribution refs are closed to the request safe context', () => {
  const request = npcConversationRequest();

  const unknownActor = npcConversationPlan(request);
  unknownActor.primary_addressee_ref = ref('npc', 'unknown-actor');
  unknownActor.intended_addressee_refs = [ref('npc', 'unknown-actor')];
  assert.equal(validateConversationContributionPlan(unknownActor, request), false);

  const foreignKnowledge = npcConversationPlan(request);
  foreignKnowledge.speech.claims = [{
    claim_id: 'foreign-knowledge-claim',
    content_summary: 'Чужое знание.',
    form: 'assertion',
    speaker_posture: 'believed_true',
    source_knowledge_refs: [ref('knowledge_scope', 'foreign-knowledge')],
    mentioned_entity_refs: []
  }];
  assert.equal(validateConversationContributionPlan(foreignKnowledge, request),
    false);

  const hiddenEntity = npcConversationPlan(request);
  hiddenEntity.speech.claims = [{
    claim_id: 'hidden-entity-claim',
    content_summary: 'Скрытая вещь.',
    form: 'assertion',
    speaker_posture: 'believed_true',
    source_knowledge_refs: [],
    mentioned_entity_refs: [ref('item', 'hidden-item')]
  }];
  assert.equal(validateConversationContributionPlan(hiddenEntity, request),
    false);

  const combatRequest = copy(request);
  combatRequest.decision_scope.combat_handoff_available = true;
  combatRequest.allowed_references.combat_target_refs = [
    ref('player_character', 'player')
  ];
  assert.equal(validateConversationContributionPlan(npcCombatPlan(
    combatRequest, ref('player_character', 'player')), combatRequest), true);
  assert.equal(validateConversationContributionPlan(npcCombatPlan(
    combatRequest, ref('npc', 'unknown-combat-target')), combatRequest), false);
});

test('social delivery result accepts only the matching five-band delivery quality', () => {
  for (const [outcome_band, delivery_quality] of Object.entries(deliveryByOutcome)) {
    assert.equal(validateSocialDeliveryResult({
      schema: 'social_delivery_result_v1',
      check_resolution_id: `resolution-${outcome_band}`,
      outcome_band,
      delivery_quality,
      observable_effects: []
    }), true);
  }

  assert.equal(validateSocialDeliveryResult({
    schema: 'social_delivery_result_v1',
    check_resolution_id: 'resolution-invalid',
    outcome_band: 'severe_failure',
    delivery_quality: 'compelling',
    observable_effects: []
  }), false);
});

function npcActionRequest() {
  const emptyPerception = {
    visible_scene: [],
    perceived_changes: [],
    heard: [],
    felt: [],
    present_actors: [],
    visible_objects: [],
    known_routes_and_exits: [],
    uncertainties: []
  };
  return {
    schema: 'npc_action_decision_request_v1',
    request_id: 'request-3',
    root_turn_id: 'turn-1',
    boundary_id: 'boundary-3',
    committed_state_version: 1,
    working_revision: 0,
    decision_index: 1,
    occurred_at: at(),
    npc_ref: 'speaker',
    decision_reasons: {
      significance: 'material',
      categories: ['self', 'objective'],
      signal_refs: [
        ref('npc_decision_signal', 'signal-a'),
        ref('npc_decision_signal', 'signal-z')
      ],
      perceived_changes: ['Изменилось положение дел.']
    },
    historical_context: {
      year: 1230,
      season: 'summer',
      region: 'Новгород',
      applicable_norms: [],
      known_local_customs: []
    },
    npc: {
      profile_level: 'scene',
      identity: { name_or_label: 'Страж', age_range: 'adult', origin: null },
      social_role: { role_ref: 'guard', status: 'служилый', authority: [], dependencies: [] },
      attributes: [],
      skills: [],
      body_state: { summary: 'здоров', conditions: [] },
      mood: { state: 'спокоен', intensity: 'low' },
      temperament: [],
      values: [],
      goals: [],
      fears: [],
      obligations: [],
      relationships: [],
      current_activity: {
        activity_ref: null,
        summary: null,
        status: 'idle',
        can_continue_automatically: false
      },
      available_resources: []
    },
    perception: emptyPerception,
    knowledge: { known_facts: [], beliefs: [], hypotheses: [] },
    memory: { recent_events: [], relevant_long_term_events: [], previous_decisions: [] },
    decision_scope: {
      mode: 'autonomous_action',
      allowed_attribute_refs: [],
      allowed_skill_refs: [],
      operation_contract: {}
    }
  };
}

test('autonomous decision reasons require canonical common categories and signal refs', () => {
  const request = npcActionRequest();
  assert.equal(validateNpcActionDecisionRequest(request), true);

  const categoriesOutOfOrder = copy(request);
  categoriesOutOfOrder.decision_reasons.categories.reverse();
  assert.equal(validateNpcActionDecisionRequest(categoriesOutOfOrder), false);

  const signalsOutOfOrder = copy(request);
  signalsOutOfOrder.decision_reasons.signal_refs.reverse();
  assert.equal(validateNpcActionDecisionRequest(signalsOutOfOrder), false);
});
