import assert from 'node:assert/strict';
import test from 'node:test';
import { buildNpcDecisionBoundary } from '@rus/npc-runtime';
import { requestNpcSemanticDecision } from '@rus/turn';
import { validateNarrationAudit } from '@rus/narration';
import { buildProviderRequestPayload } from '../../../packages/llm-runtime/src/provider-request.js';
import { assertPublicPayload, findUnsafePlayerText, findUnsafePublishedText } from '../src/public-boundary.js';
import { successEnvelope, errorEnvelope } from '../src/http/contracts.js';
import { projectVisibleContext, projectVisibleContextForPlayerPackage } from '../src/runtime/lower-dvina-trace-player-safe-visible-context.js';
import { resolveVisibleItemLabel } from '../src/runtime/lower-dvina-trace-visible-item-label.js';
import { projectTurnStepModelRequest } from '../src/runtime/lower-dvina-trace-turn-step-model-projection.js';
import { createLowerDvinaTraceTurnStepModel, createLowerDvinaTraceNpcSemanticModel } from '../src/runtime/lower-dvina-trace-phase-2-llm.js';
import { createLowerDvinaTraceNarrationService, narrationWire, assembleNarrationRoleOutput } from '../src/runtime/lower-dvina-trace-narration-llm.js';
import { narrationSources } from '../src/runtime/lower-dvina-trace-narration-audit-values.js';
import { enrichLowerDvinaTraceVisibleNpcCues } from '../src/runtime/lower-dvina-trace-turn-step-current-scene-npc-cues.js';
import { currentSceneObservationProjection } from '../src/runtime/lower-dvina-trace-m2-conversation-projections.js';
import { request as turnRequest, output as turnOutput } from './lower-dvina-trace-turn-step-llm-test-helpers.js';
import { reviewedNarration } from './narration-audit-fixture.js';

// D102: sol authors these tests before production changes. Pin this file and
// lower-dvina-trace-current-context.test.js; implementation must not edit them.
const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const timestamp = (minute) => ({
  whole_minutes: String(minute), subminute_numerator: '0', subminute_denominator: '1'
});
const scene = (extra = {}) => ({
  schema: 'visible_context_package', version: 1, visible_scene: 'Площадка у мельницы.',
  visible_changes: [], sensory_details: [], visible_npc: [], visible_objects: [],
  known_context: [], uncertainties: [], allowed_tensions: [], do_not_imply: [],
  ...extra
});
const narratorRequest = (visible_context) => ({
  version: 1, schema: 'narration_request', request_id: 'dot-acceptance',
  surface: 'turn', visible_context, context: {}
});

function providerPayload(call) {
  // Explicit test transport configuration; no live provider/settings/network.
  return buildProviderRequestPayload({
    model: 'acceptance-fixture', maxTokens: 20_000,
    responseFormat: { type: 'json_object' }, compatibility: 'openai_compatible',
    thinking: { type: 'disabled' }, temperature: 0, topP: 1, ...call.overrides
  }, call.messages);
}

function auditAll(wire, omit = () => false) {
  return reviewedNarration(wire.segments, Object.fromEntries([
    ...wire.required_current_beat.changes, ...wire.required_current_beat.uncertainties
  ].map((source) => [source.ref,
    omit(source) ? [] : [wire.segments[0].segment_id]])));
}

test('P2-1: quoted and punctuated identifiers are rejected at the public envelope', async (t) => {
  for (const marked of [
    '«npc:123»', '"npc:123"', '«npc:local_fisher_17»',
    '„item:17“', '—trace:7.', ',route/17;', '«baseline:g4_node_ab12»',
    '«npc-local-17»', '«pf_rural_yard»', '«cg4v3__gn_nov_g1_xp017»',
    '«npc_waiting»', '«TURN_STEP_PLAN_INVALID»'
  ]) await t.test(marked, () => {
    assert.ok(findUnsafePlayerText(marked, { generatedProse: true }), marked);
    assert.ok(findUnsafePublishedText({ main_prose: marked }), marked);
    assert.throws(() => successEnvelope({ main_prose: marked }), {
      code: 'PUBLIC_PAYLOAD_SERVICE_TEXT'
    });
    const envelope = errorEnvelope({ code: 'REQUEST_BODY_INVALID',
      status: 400, message: marked });
    assert.equal(envelope.status, 400);
    assert.equal(envelope.body.error.code, 'REQUEST_BODY_INVALID');
    assert.notEqual(envelope.body.error.message, marked);
    assert.equal(findUnsafePlayerText(envelope.body.error.message), null);
  });
});

test('P2-1: Unicode words and ordinary quantities are not service identifiers', async (t) => {
  for (const ordinary of [
    'В 1230 году 2 человека починили 3 сети.',
    'У выхода стоят 2 человека.', 'За проход 2 человека успели выйти.',
    'словоnpc:123', 'словоitem/path', 'latinNpc:123',
    'словоnpc-123', 'npc-123слово', 'словоnpc_internal',
    'npc_internalслово', 'словоTURN_STEP_PLAN_INVALID', 'TURN_STEP_PLAN_INVALIDслово'
  ]) await t.test(ordinary, () => {
    assert.equal(findUnsafePlayerText(ordinary, { generatedProse: true }), null);
    assert.equal(successEnvelope({ main_prose: ordinary }).data.main_prose, ordinary);
  });
  const inputAndSelectors = {
    action_input: '«npc:123»', entity_ref: ref('npc', 'npc:123'),
    error: { code: 'TURN_STEP_PLAN_INVALID' }
  };
  assert.equal(assertPublicPayload(inputAndSelectors), inputAndSelectors);
});

test('P2-1: label projection and NPC/narrator inputs remove quoted service text', async () => {
  const projected = projectVisibleContext(scene({
    visible_changes: ['Виден «npc:123».', 'Вы поправили пояс.'],
    sensory_details: ['У воды «npc:123».', 'На земле лежит солома.'],
    visible_npc: [{ entity_ref: ref('npc', 'npc:selector'),
      display_label: '«npc:local_fisher_17»' }]
  }));
  assert.deepEqual(projected.visible_changes, ['Вы поправили пояс.']);
  assert.equal(projected.visible_npc[0].display_label, 'человек');
  assert.deepEqual(projected.visible_npc[0].entity_ref, ref('npc', 'npc:selector'));
  const input = npcRequest(), calls = [];
  input.memory.current_observations = currentSceneObservationProjection({
    party_state: { state_version: 1 }, clock: timestamp(1), current_visible_context: projected
  });
  const model = createLowerDvinaTraceNpcSemanticModel({ roleRunner: { async run(call) {
    calls.push(call);
    return { output: npcPlan(input, 'Не отвечу тебе.') };
  } } });
  await model(input);
  const npcWire = JSON.parse(providerPayload(calls[0]).messages[1].content);
  assert.deepEqual(npcWire.memory.current_observations.map(({ fact_text }) => fact_text),
    ['На земле лежит солома.']);
  assert.doesNotMatch(providerPayload(calls[0]).messages[1].content, /npc:123/u);
  const wire = narrationWire(narratorRequest(scene({
    visible_changes: ['Виден «npc:123».', 'Вы поправили пояс.']
  })));
  assert.deepEqual(wire.required_current_beat.changes.map(({ text }) => text),
    ['Вы поправили пояс.']);
  assert.doesNotMatch(JSON.stringify(wire), /npc:123/u);
});

function npcRequest() {
  return {
    schema: 'npc_conversation_response_request_v1', request_id: 'dot-npc',
    boundary_id: 'boundary-1', conversation_id: 'conversation-1', exchange_id: 'exchange-1',
    state_version: 1, requested_at: timestamp(1), npc_ref: ref('npc', 'npc-1'),
    decision_reasons: { significance: 'material', categories: ['communication'],
      signal_refs: [ref('npc_decision_signal', 'signal-1')], perceived_changes: ['Игрок задал вопрос.'] },
    npc: {}, perceived_message: {
      source_statement_ref: ref('conversation_statement', 'statement-1'),
      perception_result_ref: ref('perception_result', 'perception-1')
    }, public_conversation_history: [], knowledge: {}, memory: {},
    social_context: {}, available_resources: [],
    allowed_references: {
      actor_refs: [ref('npc', 'npc-1'), ref('player_character', 'player-1')],
      entity_refs: [], knowledge_refs: [], combat_target_refs: []
    }, decision_scope: {
      conversation_mode: true, action_handoff_available: false, combat_handoff_available: false,
      allowed_attribute_refs: ['influence'], allowed_skill_refs: ['conversation'],
      allowed_check_profile_refs: ['hard'], allowed_duration_classes: ['domain_owned'],
      operation_contract: { emit_interaction: {} }
    }
  };
}

function npcPlan(input, utterance_text) {
  return {
    schema: 'conversation_contribution_plan_v1', request_id: input.request_id,
    boundary_id: input.boundary_id, conversation_id: input.conversation_id,
    exchange_id: input.exchange_id, state_version: input.state_version,
    speaker_ref: input.npc_ref, contribution_kind: 'speech',
    primary_addressee_ref: ref('player_character', 'player-1'),
    intended_addressee_refs: [ref('player_character', 'player-1')], affected_actor_refs: [],
    speech: { utterance_text, dominant_act: 'refuse', interaction_tags: [], topic_refs: [],
      claims: [], response_expectation: { kind: 'none', target_refs: [] } },
    interpretation: { intent: 'отказать', grounded_contribution: 'отказать', adaptation: 'literal' },
    resolution: 'automatic', activity: { duration_class: 'domain_owned', effort: 'none' },
    supporting_operations: [], check: null, handoff: null, reason: 'Отказывается отвечать.'
  };
}

test('P2-1: quoted NPC output fails before the grounding auditor and repair preserves the speech act', async () => {
  const input = npcRequest(), calls = [];
  const model = createLowerDvinaTraceNpcSemanticModel({ roleRunner: { async run(call) {
    calls.push(call);
    if (call.role_id === 'npc_conversation_grounding_auditor') {
      return { output: { pass: true, concerns: [] } };
    }
    return { output: npcPlan(input, 'Не отвечу тебе.') };
  } } });
  const marked = npcPlan(input, 'Не отвечу «npc:123».');
  const rejection = await model.validateFreshPlan(marked, input);
  assert.equal(rejection.pass, false);
  assert.equal(rejection.errors[0].code, 'TRACE_NPC_SPEECH_SERVICE_TEXT');
  assert.equal(calls.length, 0);
  const repaired = await model(input, { repair: {
    original_output: marked, validation_errors: rejection.errors
  } });
  assert.equal(repaired.speech.dominant_act, marked.speech.dominant_act);
  assert.equal(repaired.speech.utterance_text, 'Не отвечу тебе.');
  const payload = providerPayload(calls[0]);
  assert.doesNotMatch(payload.messages[1].content, /npc:123|TRACE_NPC_SPEECH_SERVICE_TEXT/u);
  assert.equal(JSON.parse(payload.messages[1].content).original_output, undefined);
});

test('P2-1: repeated quoted NPC output fails closed before a proposal is planned', async () => {
  const input = npcRequest(), calls = [];
  const boundary = buildNpcDecisionBoundary({
    decision_mode: 'conversation', scheduled_at: input.requested_at, npc_ref: input.npc_ref,
    same_time_batch_ref: ref('temporal_batch', 'batch-1'),
    significance: input.decision_reasons.significance, categories: input.decision_reasons.categories,
    signal_refs: input.decision_reasons.signal_refs, state_version: String(input.state_version)
  });
  input.boundary_id = boundary.boundary_id;
  const model = createLowerDvinaTraceNpcSemanticModel({ roleRunner: { async run(call) {
    calls.push(call.role_id);
    return { output: call.role_id === 'npc_conversation_grounding_auditor'
      ? { pass: true, concerns: [] } : npcPlan(input, 'Не отвечу «npc:123».') };
  } } });
  await assert.rejects(requestNpcSemanticDecision({
    boundary, request: input, semanticModel: model,
    validateFreshPlan: model.validateFreshPlan,
    revalidateStateVersion: async () => input.state_version
  }), { code: 'TURN_NPC_PLAN_INVALID' });
  assert.deepEqual(calls, ['npc_conversation_responder', 'npc_conversation_responder_format_repair']);
  assert.equal(input.state_version, 1);
});

test('P2-1: narrator admission permits one repair but repeated quoted output stays pending', async (t) => {
  for (const repairIsClean of [true, false]) await t.test(
    repairIsClean ? 'clean repair is approved' : 'repeated quoted output is blocked', async () => {
    const calls = [];
    const service = createLowerDvinaTraceNarrationService({ roleRunner: { async run(call) {
      calls.push(call.role_id);
      const wire = JSON.parse(providerPayload(call).messages[1].content);
      if (call.role_id === 'gameplay_narrator') return { output: { prose: 'Вы поправили пояс «npc:123».' } };
      if (call.role_id === 'gameplay_narrator_semantic_repair') return { output: {
        replacements: [{ prose: repairIsClean ? 'Вы поправили пояс.' : 'Вы поправили пояс «npc:123».' }]
      } };
      return { output: auditAll(wire) };
    } } });
    const result = await service.run(narratorRequest(scene({ visible_changes: ['Вы поправили пояс.'] })));
    assert.equal(result.status, repairIsClean ? 'approved' : 'blocked');
    assert.equal(calls.filter((role) => role === 'gameplay_narrator_semantic_repair').length, 1);
    if (repairIsClean) assert.equal(result.approved_output.prose, 'Вы поправили пояс.');
    else {
      assert.equal(result.approved_output, null);
      assert.equal(result.diagnostics.phase, 'generated_prose_admission_failed');
    }
  });
});

const namedItem = () => ({ entity_ref: ref('item', 'named-visible-item'), display_label: 'сосновое весло' });
const dirtyItemContext = (display_label = 'FACT: Топор') => ({
  visible_scene: 'На берегу.', visible_changes: [], sensory_details: [], visible_npc: [],
  visible_objects: [{ entity_ref: ref('item', 'private-gap-instance'), display_label }, namedItem()],
  known_context: [], uncertainties: []
});

test('P2-2: rejected item labels become typed gaps at the item owner and both visible projections', async (t) => {
  for (const display_label of ['FACT: Топор', '«item:123»']) await t.test(display_label, () => {
    assert.deepEqual(resolveVisibleItemLabel({ name: display_label }), {
      kind: 'gap', code: 'player_safe_item_label_required'
    });
    for (const strict of [false, true]) {
      const raw = dirtyItemContext(display_label), original = structuredClone(raw);
      const projected = projectVisibleContext(raw, { strict });
      assert.deepEqual(projected.visible_objects, [{
        entity_ref: ref('item', 'private-gap-instance'),
        label_gap: { code: 'player_safe_item_label_required' }
      }, namedItem()]);
      assert.deepEqual(raw, original);
    }
  });
});

test('P2-2: public omission diagnoses new gaps, preserves named items and tolerates callback failure', () => {
  const raw = dirtyItemContext(), original = structuredClone(raw), counts = [];
  const published = projectVisibleContextForPlayerPackage(raw, {
    onLabelGapsOmitted: (count) => counts.push(count)
  });
  assert.equal(published.omitted_label_gap_count, 1);
  assert.deepEqual(counts, [1]);
  assert.deepEqual(published.visible_context.visible_objects, [namedItem()]);
  assert.deepEqual(successEnvelope(published.visible_context).data.visible_objects, [namedItem()]);
  assert.deepEqual(raw, original);
  const failingDiagnostic = projectVisibleContextForPlayerPackage(raw, {
    onLabelGapsOmitted: () => { throw new Error('diagnostic callback failed'); }
  });
  assert.deepEqual(failingDiagnostic, published);
  const noObjects = projectVisibleContextForPlayerPackage({ visible_scene: 'На берегу.' });
  assert.equal(noObjects.omitted_label_gap_count, 0);
  assert.equal(Object.hasOwn(noObjects.visible_context, 'visible_objects'), false);
});

test('P2-2: A-03 non-item behavior stays separate from item omission', () => {
  const nonItem = { entity_ref: ref('place', 'place'), label_gap: { code: 'player_safe_item_label_required' } };
  const raw = { visible_objects: [nonItem, namedItem()] }, counts = [];
  const published = projectVisibleContextForPlayerPackage(raw, {
    onLabelGapsOmitted: (count) => counts.push(count)
  });
  assert.equal(published.omitted_label_gap_count, 0);
  assert.deepEqual(counts, []);
  assert.deepEqual(published.visible_context.visible_objects, [nonItem, namedItem()]);
  assert.deepEqual(projectVisibleContext(published.visible_context).visible_objects,
    [{ entity_ref: nonItem.entity_ref }, namedItem()]);
});

test('P2-2: a newly rejected label removes item aliases and choices from main and repair provider payloads', async () => {
  const raw = dirtyItemContext(), normalized = projectVisibleContext(raw), calls = [];
  const named = { item_id: 'named-visible-item', name: 'сосновое весло', physical_facts: ['Весло сосновое.'] };
  const unsafeOperation = { op: 'request_item_use', item_ref: 'opaque-item-ref', description: 'GAP_OPERATION_SECRET' };
  const safeOperation = { op: 'request_item_use', item_ref: 'named-visible-item', description: 'Осмотреть весло.' };
  const input = turnRequest({
    available_domain_operations: [unsafeOperation, safeOperation],
    player_safe_state: {
      items: [{ item_id: 'opaque-item-ref', instance_id: 'private-gap-instance',
        name: 'GAP_ITEM_SECRET', physical_facts: ['GAP_PHYSICAL_SECRET'] }, named],
      inventory: { items: ['opaque-item-ref', {
        item_id: 'inventory-alias', instance_id: 'private-gap-instance', name: 'GAP_ALIAS_SECRET'
      }, named] }, current_visible_context: normalized,
      available_domain_operations: [unsafeOperation, safeOperation]
    }, prepared_followup_candidates: [
      { prepared_followup_ref: 'followup:gap', operation: unsafeOperation },
      { prepared_followup_ref: 'followup:named', operation: safeOperation }
    ]
  });
  const original = structuredClone(input);
  const model = createLowerDvinaTraceTurnStepModel({ roleRunner: { async run(call) {
    calls.push(call);
    return { output: turnOutput() };
  } } });
  await model(input);
  await model(input, {
    original_output: { ...turnOutput(), operations: [unsafeOperation] },
    structural_errors: [{ path: '$.operations', code: 'operation_semantic_grounding',
      rejected_operation: { ...unsafeOperation, description: 'GAP_REPAIR_SECRET' } }]
  });
  assert.deepEqual(calls.map(({ role_id }) => role_id),
    ['turn_step_planner', 'turn_step_planner_repair']);
  for (const call of calls) {
    const payload = providerPayload(call), body = JSON.parse(payload.messages[1].content);
    const projected = call.role_id.endsWith('_repair') ? body.request : body;
    assert.deepEqual(projected.player_safe_state.current_visible_context.visible_objects, [namedItem()]);
    assert.deepEqual(projected.player_safe_state.items, [named]);
    assert.deepEqual(projected.player_safe_state.inventory.items, [named]);
    assert.deepEqual(projected.available_domain_operations, [safeOperation]);
    assert.deepEqual(projected.player_safe_state.available_domain_operations, [safeOperation]);
    assert.match(JSON.stringify(payload.messages), /followup:named|Весло сосновое/u);
    assert.doesNotMatch(JSON.stringify(payload.messages),
      /private-gap-instance|opaque-item-ref|inventory-alias|GAP_[A-Z_]+|followup:gap|FACT:|label_gap|player_safe_item_label_required/u);
  }
  assert.deepEqual(new Set(projectTurnStepModelRequest(input).gapItemSecrets),
    new Set(['private-gap-instance', 'opaque-item-ref', 'inventory-alias']));
  assert.deepEqual(input, original);
  assert.deepEqual(raw, dirtyItemContext());
});

const restSummary = 'Прерывает работу для короткого отдыха.';
const resumeSummary = 'Возвращается к работе.';
function transition(npc_id, summary = restSummary, minute = 1) {
  return { npc_routine_transition: {
    npc_id, occurred_at: timestamp(minute), proposal: { factual_transition: { summary } },
    after: { npc_id, causal_state_ref: { routine_state: { status: 'inactive' } },
      npc_snapshot: { machine_state: { current_activity: { summary } } } }
  } };
}
function npcScene({ labels = ['рыбак', 'рыбак'], proposals = null,
  beforeIds = null, afterIds = null } = {}) {
  const visible = labels.map((display_label, index) => ({
    entity_ref: ref('npc', 'npc:observed-' + (index + 1)), display_label
  }));
  const visibleBefore = visible.filter((row) => beforeIds == null || beforeIds.includes(row.entity_ref.entity_id));
  const visibleAfter = visible.filter((row) => afterIds == null || afterIds.includes(row.entity_ref.entity_id));
  return enrichLowerDvinaTraceVisibleNpcCues({
    visibleContext: scene({ visible_npc: visibleAfter, visible_changes: ['Вы поправили пояс.'] }),
    committedState: {
      current_visible_context: scene({ visible_npc: visibleBefore }),
      npcs: visible.map(({ entity_ref }) => ({
        instance_id: entity_ref.entity_id, machine_state: { current_activity: { summary: 'Чинит сети.' } }
      }))
    }, temporalResults: [{ combined_change_set: { proposals: proposals
      ?? visible.map(({ entity_ref }) => transition(entity_ref.entity_id)) } }]
  });
}

function assertNpcChange(text, count, summary = /короткого отдыха/iu) {
  assert.match(text, /рыбак/iu);
  assert.match(text, summary);
  const counts = {
    1: /(?:^|[^\p{L}\p{N}_])(?:1|один|одного|одному)(?![\p{L}\p{N}_])/iu,
    2: /(?:^|[^\p{L}\p{N}_])(?:2|два|двое|двух|двоих)(?![\p{L}\p{N}_])/iu,
    3: /(?:^|[^\p{L}\p{N}_])(?:3|три|трое|трёх|трех|троих)(?![\p{L}\p{N}_])/iu
  };
  assert.match(text, counts[count], 'observed participant count must be conveyed');
  assert.doesNotMatch(text, /npc:|occurred_at|рыбак\s*\(\d+\)|человек\s*\(\d+\)/iu);
  assert.equal(findUnsafePlayerText(text, { generatedProse: true }), null);
}

test('P2-3: indistinguishable NPC actions reach the writer and remain mandatory audit sources beside a player event', async () => {
  const visible = npcScene(), calls = [];
  const service = createLowerDvinaTraceNarrationService({ roleRunner: { async run(call) {
    calls.push(call.role_id);
    const wire = JSON.parse(providerPayload(call).messages[1].content);
    assert.equal(wire.required_current_beat.changes.length, 2);
    assert.equal(wire.required_current_beat.changes[0].text, 'Вы поправили пояс.');
    assertNpcChange(wire.required_current_beat.changes[1].text, 2);
    assert.deepEqual(wire.optional_support, { visible_scene: visible.visible_scene });
    assert.doesNotMatch(JSON.stringify(wire), /npc:observed|occurred_at|whole_minutes/u);
    if (call.role_id === 'gameplay_narrator') return { output: {
      prose: 'Вы поправили пояс, а двое рыбаков прервали работу для короткого отдыха.'
    } };
    return { output: auditAll(wire) };
  } } });
  const result = await service.run(narratorRequest(visible));
  assert.equal(result.status, 'approved');
  assert.deepEqual(calls, ['gameplay_narrator', 'gameplay_narrator_auditor']);
  const sources = narrationSources({ visible_context: visible });
  assert.equal(sources.length, 2);
  assert.equal(sources[1].key, 'visible_change_2');
  const segments = [{ segment_id: 's1' }], request = { visible_context: visible, segments };
  const raw = reviewedNarration(segments, { visible_change_1: ['s1'], visible_change_2: [] });
  const assembled = assembleNarrationRoleOutput('gameplay_narrator_auditor', raw, request);
  assert.equal(assembled.pass, false);
  assert.deepEqual(assembled.coverage.visible_changes[1].segment_ids, []);
  assert.ok(assembled.concerns.some(({ kind }) => kind === 'missing_visible_change'));
  assert.equal(validateNarrationAudit(assembled, ['s1'], {
    visible_changes: 2, uncertainties: 0
  }).ok, true);
});

test('P2-3: omission of a grouped NPC source blocks the actual narration flow', async () => {
  const calls = [];
  const service = createLowerDvinaTraceNarrationService({ roleRunner: { async run(call) {
    calls.push(call.role_id);
    const wire = JSON.parse(providerPayload(call).messages[1].content);
    if (call.role_id === 'gameplay_narrator') return { output: { prose: 'Вы поправили пояс.' } };
    if (call.role_id === 'gameplay_narrator_semantic_repair') return { output: {
      replacements: [{ prose: 'Вы поправили пояс.' }]
    } };
    return { output: auditAll(wire, ({ text }) => /короткого отдыха/iu.test(text)) };
  } } });
  const result = await service.run(narratorRequest(npcScene()));
  assert.equal(result.status, 'blocked');
  assert.equal(result.diagnostics.phase, 'final_audit_failed');
  assert.deepEqual(calls, ['gameplay_narrator', 'gameplay_narrator_auditor',
    'gameplay_narrator_semantic_repair', 'gameplay_narrator_auditor']);
});

test('P2-3: grouping counts observed participants, not label population or duplicate proposals', async (t) => {
  const cases = [
    { name: 'three people', labels: ['рыбак', 'рыбак', 'рыбак'], count: 3 },
    { name: 'one of two people acts', proposals: [transition('npc:observed-1')], count: 1 },
    { name: 'same participant repeated', proposals: [
      transition('npc:observed-1'), transition('npc:observed-1')
    ], count: 1 },
    { name: 'second person was not previously visible', beforeIds: ['npc:observed-1'], count: 1 },
    { name: 'second person is no longer visible', afterIds: ['npc:observed-1'], count: 1 }
  ];
  for (const sample of cases) await t.test(sample.name, () => {
    const projected = npcScene(sample);
    assert.equal(projected.visible_changes.length, 2);
    // A sole visible, distinctly labelled NPC keeps the pre-existing path.
    if (sample.afterIds) assert.match(projected.visible_changes[1], /рыбак прерывает работу/iu);
    else assertNpcChange(projected.visible_changes[1], sample.count);
  });
  const hidden = npcScene({ beforeIds: [] });
  assert.deepEqual(hidden.visible_changes, ['Вы поправили пояс.']);
  const unique = npcScene({ labels: ['знакомый рыбак'] });
  assert.deepEqual(unique.visible_changes, ['Вы поправили пояс.',
    'знакомый рыбак прерывает работу для короткого отдыха.']);
});

test('P2-3: different actions and chronological boundaries are not merged', async (t) => {
  await t.test('different actions at the same time remain separate', () => {
    const different = npcScene({ proposals: [
      transition('npc:observed-1'), transition('npc:observed-2', resumeSummary)
    ] });
    assert.equal(different.visible_changes.length, 3);
    assertNpcChange(different.visible_changes[1], 1);
    assertNpcChange(different.visible_changes[2], 1, /возвращается к работе/iu);
  });
  await t.test('one combined change set retains two chronological boundaries', () => {
    const sequential = npcScene({
      labels: ['рыбак', 'рыбак', 'рыбак'], proposals: [
        transition('npc:observed-1', restSummary, 1),
        transition('npc:observed-2', restSummary, 1),
        transition('npc:observed-3', restSummary, 2)
      ]
    });
    assert.equal(sequential.visible_changes.length, 3);
    assertNpcChange(sequential.visible_changes[1], 2);
    assertNpcChange(sequential.visible_changes[2], 1);
    const wire = narrationWire(narratorRequest(sequential));
    assert.deepEqual(wire.required_current_beat.changes.map(({ text }) => text),
      sequential.visible_changes);
    assert.doesNotMatch(JSON.stringify(wire), /occurred_at|whole_minutes|npc:observed/u);
  });
});
