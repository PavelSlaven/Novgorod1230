import { npcAuditReport } from './support/npc-audit-report.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildNpcDecisionBoundary } from '@rus/npc-runtime';
import { requestNpcSemanticDecision } from '@rus/turn';
import { errorEnvelope } from '../src/http/contracts.js';
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

test('repeated NPC mixed-script speech after one repair returns a safe unsaved-turn response',
  async () => {
    const request = npcRequest('mixed-public-failure');
    const boundary = buildNpcDecisionBoundary({
      decision_mode: 'conversation', scheduled_at: request.requested_at,
      npc_ref: request.npc_ref,
      same_time_batch_ref: ref('temporal_batch', 'batch-mixed-public-failure'),
      significance: request.decision_reasons.significance,
      categories: request.decision_reasons.categories,
      signal_refs: request.decision_reasons.signal_refs,
      state_version: String(request.state_version)
    });
    request.boundary_id = boundary.boundary_id;
    const worldState = { turn_number: 7, state_version: 12,
      npc_speech: 'Прежнее состояние мира.' };
    const before = structuredClone(worldState);
    const calls = [];
    const semanticModel = createLowerDvinaTraceNpcSemanticModel({
      roleRunner: { async run(call) {
        calls.push(structuredClone(call));
        if (call.role_id === 'npc_conversation_grounding_auditor') {
          return { output: npcAuditReport(call) };
        }
        const payload = JSON.parse(call.messages[1].content);
        return { output: npcSpeechPlan(payload.request ?? payload,
          'По протoku.') };
      } }
    });

    let failure;
    try {
      await requestNpcSemanticDecision({
        boundary, request, semanticModel,
        validateFreshPlan: semanticModel.validateFreshPlan,
        revalidateStateVersion: async () => request.state_version
      });
      assert.fail('the second mixed-script response must fail closed');
    } catch (error) {
      failure = error;
    }

    assert.equal(failure?.code, 'TURN_NPC_PLAN_INVALID');
    assert.deepEqual(calls.map(({ role_id }) => role_id), [
      'npc_conversation_responder',
      'npc_conversation_responder_format_repair'
    ], 'the NPC receives exactly one repair attempt');
    failure.turn_commit_status = 'not_started';
    const response = errorEnvelope(failure);
    assert.equal(response.status, 409);
    assert.deepEqual(response.body.error, {
      code: 'TURN_NOT_SAVED',
      message: 'Ход не сохранён. Попробуйте ещё раз.',
      turn_commit_status: 'not_started'
    });
    assert.deepEqual(worldState, before);

    const existingTurnStepFailure = errorEnvelope(Object.assign(new Error('private'), {
      code: 'TURN_STEP_PLAN_INVALID', status: 500,
      turn_commit_status: 'not_started'
    }));
    assert.deepEqual(existingTurnStepFailure.body.error, {
      code: 'TURN_NOT_SAVED',
      message: 'Ход не сохранён. Попробуйте сформулировать действие иначе.',
      turn_commit_status: 'not_started'
    });
    const unknownFailure = errorEnvelope(Object.assign(new Error('private'), {
      code: 'UNKNOWN_DOMAIN_FAILURE', status: 500,
      turn_commit_status: 'not_started'
    }));
    assert.equal(unknownFailure.status, 500);
    assert.equal(unknownFailure.body.error.code, 'TEMPORARY_ACTION_UNAVAILABLE');
  });
