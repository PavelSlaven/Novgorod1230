import { npcAuditReport } from './support/npc-audit-report.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildNpcDecisionBoundary } from '@rus/npc-runtime';
import { requestNpcSemanticDecision } from '@rus/turn';
import { createLowerDvinaTraceNpcSemanticModel } from
  '../src/runtime/lower-dvina-trace-phase-2-llm.js';

const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });

function npcRequest(id) {
  return {
    schema: 'npc_conversation_response_request_v1', request_id: id,
    boundary_id: `boundary-${id}`, conversation_id: 'conversation-1',
    exchange_id: `exchange-${id}`, state_version: 1,
    requested_at: { whole_minutes: '1', subminute_numerator: '0',
      subminute_denominator: '1' }, npc_ref: ref('npc', 'npc-1'),
    decision_reasons: { significance: 'material', categories: ['communication'],
      signal_refs: [ref('npc_decision_signal', `signal-${id}`)],
      perceived_changes: ['Игрок обратился к NPC.'] },
    npc: {}, perceived_message: {
      source_statement_ref: ref('conversation_statement', 'statement-1'),
      perception_result_ref: ref('perception_result', 'perception-1')
    }, public_conversation_history: [{
      speaker_ref: ref('player_character', 'player-1'), utterance_text: 'Ответь.'
    }], knowledge: {}, memory: {}, social_context: {}, available_resources: [],
    allowed_references: {
      actor_refs: [ref('npc', 'npc-1'), ref('player_character', 'player-1')],
      entity_refs: [], knowledge_refs: [], combat_target_refs: []
    },
    decision_scope: { conversation_mode: true,
      action_handoff_available: false, combat_handoff_available: false,
      allowed_attribute_refs: ['influence'], allowed_skill_refs: ['conversation'],
      allowed_check_profile_refs: ['hard'],
      allowed_duration_classes: ['domain_owned'], operation_contract: {} }
  };
}

function npcSpeechPlan(request, utteranceText) {
  const addressee = ref('player_character', 'player-1');
  return {
    schema: 'conversation_contribution_plan_v1',
    request_id: request.request_id, boundary_id: request.boundary_id,
    conversation_id: request.conversation_id, exchange_id: request.exchange_id,
    state_version: request.state_version, speaker_ref: request.npc_ref,
    contribution_kind: 'speech', primary_addressee_ref: addressee,
    intended_addressee_refs: [addressee], affected_actor_refs: [],
    speech: { utterance_text: utteranceText, dominant_act: 'answer',
      interaction_tags: [], topic_refs: [], claims: [],
      response_expectation: { kind: 'none', target_refs: [] } },
    interpretation: { intent: 'ответить', grounded_contribution: 'дать ответ',
      adaptation: 'literal' }, resolution: 'automatic',
    activity: { duration_class: 'domain_owned', effort: 'none' },
    supporting_operations: [], check: null, handoff: null,
    reason: 'NPC answers the player.'
  };
}

async function runNpcReply(id, initialUtterance, repairedUtterance = initialUtterance) {
  const request = npcRequest(id);
  const boundary = buildNpcDecisionBoundary({
    decision_mode: 'conversation', scheduled_at: request.requested_at,
    npc_ref: request.npc_ref,
    same_time_batch_ref: ref('temporal_batch', `batch-${id}`),
    significance: request.decision_reasons.significance,
    categories: request.decision_reasons.categories,
    signal_refs: request.decision_reasons.signal_refs,
    state_version: String(request.state_version)
  });
  request.boundary_id = boundary.boundary_id;
  const calls = [];
  const diagnostics = [];
  const semanticModel = createLowerDvinaTraceNpcSemanticModel({
    telemetry: { onDetail: (detail) => diagnostics.push(detail) },
    roleRunner: { async run(call) {
      calls.push(structuredClone(call));
      if (call.role_id === 'npc_conversation_grounding_auditor') {
        return { output: npcAuditReport(call) };
      }
      const payload = JSON.parse(call.messages[1].content);
      return { output: npcSpeechPlan(payload.request ?? payload,
        call.role_id.endsWith('_format_repair')
          ? repairedUtterance : initialUtterance) };
    } }
  });
  const proposal = await requestNpcSemanticDecision({
    boundary, request, semanticModel,
    validateFreshPlan: semanticModel.validateFreshPlan,
    revalidateStateVersion: async () => request.state_version
  });
  return { calls, diagnostics, proposal };
}

const roleIds = ({ calls }) => calls.map(({ role_id }) => role_id);
const repairRoleIds = [
  'npc_conversation_responder',
  'npc_conversation_responder_format_repair',
  'npc_conversation_grounding_auditor'
];
const ordinaryRoleIds = [
  'npc_conversation_responder', 'npc_conversation_grounding_auditor'
];

test('NPC mixed-script word «протoku» reaches existing format repair', async () => {
  const result = await runNpcReply('mixed-protoku', 'По протoku.', 'По протоку.');
  assert.deepEqual(roleIds(result), repairRoleIds);
  const repairInput = JSON.parse(result.calls[1].messages[1].content);
  assert.equal(repairInput.original_output.speech.utterance_text, 'По протoku.');
  assert.equal(result.proposal.plan.speech.utterance_text, 'По протоку.');
});

test('a homoglyph-only mixed word is normalized without format repair', async () => {
  const result = await runNpcReply('mixed-derevo', 'За дeревом.', 'За деревом.');
  assert.deepEqual(roleIds(result), ordinaryRoleIds);
  assert.equal(result.proposal.plan.speech.utterance_text, 'За деревом.');
  assert.deepEqual(result.diagnostics, [{
    event: 'npc_conversation_speech_normalization',
    scope: 'turn_runtime',
    role_id: 'npc_conversation_responder',
    request_identity: 'mixed-derevo',
    replaced_character_count: 1
  }]);
  assert.ok(result.calls.slice(1).every((call) =>
    !JSON.stringify(call.messages).includes('дeревом')));
});

test('clean Cyrillic NPC speech skips format repair', async () => {
  const result = await runNpcReply('clean-cyrillic', 'Река течёт к заливу.');
  assert.deepEqual(roleIds(result), ordinaryRoleIds);
  assert.equal(result.proposal.plan.speech.utterance_text, 'Река течёт к заливу.');
  assert.equal(result.diagnostics[0].replaced_character_count, 0);
});

test('whole Latin word and English response keys do not trigger repair', async () => {
  const result = await runNpcReply('whole-latin', 'Да, okay.');
  assert.deepEqual(roleIds(result), ordinaryRoleIds);
  assert.equal(result.proposal.plan.speech.utterance_text, 'Да, okay.');
  assert.equal(result.proposal.plan.contribution_kind, 'speech');
});

test('NPC format repair receives mixed-script path and offending word', async () => {
  const result = await runNpcReply('diagnostic-protoku', 'По протoku.', 'По протоку.');
  const repairInput = JSON.parse(result.calls[1].messages[1].content);
  assert.deepEqual(repairInput.validation_errors, [{
    code: 'utterance_mixed_script',
    path: '$.speech.utterance_text',
    word: 'протoku',
    message: 'Speech contains a mixed Latin/Cyrillic word: протoku.'
  }]);
});
