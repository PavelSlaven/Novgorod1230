import { serverError } from '../errors.js';
import {
  npcConversationCandidates,
  npcConversationInstructions,
  playerConversationInstructions
} from './lower-dvina-trace-phase-2-llm-prompts.js';
import {
  assembleNpcConversationPlan,
  assemblePlayerConversationPlan
} from './lower-dvina-trace-conversation-assembly.js';
import { auditFreshNpcSpeech } from
  './lower-dvina-trace-npc-speech-grounding-audit.js';
import { worldKnowledgeFactualClosure } from './world-knowledge-grounding.js';

export function createLowerDvinaTracePlayerConversationModel({ roleRunner } = {}) {
  requireRoleRunner(roleRunner);
  return async function interpretPlayerConversation(request, context = {}) {
    const repair = context.repair ?? null;
    const response = await roleRunner.run({
      scope: 'turn_runtime',
      role_id: repair
        ? 'player_conversation_interpreter_format_repair'
        : 'player_conversation_interpreter',
      request_identity: request.request_id,
      messages: [{
        role: 'system',
        content: playerConversationInstructions(repair, request)
      }, {
        role: 'user',
        content: JSON.stringify(repair ? {
          request,
          original_output: repair.original_output,
          validation_errors: repair.validation_errors
        } : request)
      }],
      overrides: { temperature: 0, maxTokens: 1_000 }
    });
    return assemblePlayerConversationPlan(response.output, request);
  };
}

export function createLowerDvinaTraceNpcSemanticModel({ roleRunner,
  worldKnowledgeGrounder = null } = {}) {
  requireRoleRunner(roleRunner);
  const model = async function planNpcConversationResponse(request, context = {}) {
    const repair = context.repair ?? null;
    const semanticRepair = repair?.validation_errors?.some(
      ({ category }) => category === 'semantic_grounding'
    ) === true;
    if (semanticRepair && npcConversationCandidates(request).some(
      (candidate) => candidate.contribution_kind === 'speech'
        && candidate.supporting_operations.length === 0
    )) return semanticGroundingFallback(repair.original_output, request);
    const modelRequest = worldKnowledgeGrounder == null ? request
      : await worldKnowledgeGrounder.ground(request, 'conversation');
    const response = await roleRunner.run({
      scope: 'turn_runtime',
      role_id: repair
        ? 'npc_conversation_responder_format_repair'
        : 'npc_conversation_responder',
      request_identity: request.request_id,
      messages: [{
        role: 'system',
        content: [npcConversationInstructions(repair, modelRequest),
          ...worldKnowledgeFactualClosure(modelRequest)].join(' ')
      }, {
        role: 'user',
        content: JSON.stringify(repair ? {
          request: modelRequest,
          ...(semanticRepair ? {} : {
            original_output: repair.original_output
          }),
          validation_errors: repair.validation_errors
        } : modelRequest)
      }],
      overrides: { temperature: 0, maxTokens: 1_000 }
    });
    return assembleNpcConversationPlan(response.output, request);
  };
  model.validateFreshPlan = (plan, request) => auditFreshNpcSpeech({
    roleRunner, plan, request
  });
  return model;
}

function semanticGroundingFallback(original, request) {
  const observations = new Map((request.memory?.current_observations ?? [])
    .map((entry) => [entry.observation_ref?.entity_id, entry]));
  const retained = new Map();
  for (const claim of original?.speech?.claims ?? []) {
    for (const reference of claim?.source_knowledge_refs ?? []) {
      const observation = reference?.entity_kind === 'perception_result'
        ? observations.get(reference.entity_id) : null;
      if (observation) retained.set(reference.entity_id, observation);
    }
  }
  const facts = [...retained.values()];
  const uncertainty = 'Остального я подтвердить не могу.';
  return assembleNpcConversationPlan({
    contribution_kind: 'speech',
    speech: {
      utterance_text: [...facts.map(({ fact_text }) => fact_text),
        uncertainty].join(' '),
      dominant_act: 'answer', interaction_tags: [], topic_refs: [],
      claims: facts.map((entry, index) => ({
        claim_id: `fallback-current-observation-${index + 1}`,
        content_summary: entry.fact_text, form: 'assertion',
        speaker_posture: 'believed_true',
        source_knowledge_refs: [structuredClone(entry.observation_ref)],
        mentioned_entity_refs: []
      })),
      response_expectation: { kind: 'none', target_refs: [] }
    },
    interpretation: {
      intent: 'Ответить только по подтверждённым сведениям.',
      grounded_contribution: [...facts.map(({ fact_text }) => fact_text),
        uncertainty].join(' '),
      adaptation: 'literal'
    },
    resolution: 'automatic',
    activity: { duration_class: 'domain_owned', effort: 'none' },
    supporting_operations: [], check: null, handoff: null,
    reason: 'Ответ ограничен точными текущими наблюдениями.'
  }, request);
}

export function createLowerDvinaTraceNpcDecisionSelector({ roleRunner } = {}) {
  requireRoleRunner(roleRunner);
  return async function selectNpcDecision(request) {
    const response = await roleRunner.run({
      scope: 'turn_runtime',
      role_id: 'npc_bounded_decision',
      messages: [{
        role: 'system',
        content: 'Choose exactly one option from the supplied closed NPC decision request. Return only {"request_id":"...","state_version":"...","option_id":"...","command_token":"..."}. Do not add facts, consequences, checks, prose, or writes.'
      }, {
        role: 'user', content: JSON.stringify(request)
      }],
      overrides: { temperature: 0, maxTokens: 20_000 }
    });
    if (!response?.output || typeof response.output !== 'object') {
      throw dependencyError('NPC decision selector returned no JSON object.');
    }
    return response.output;
  };
}

function requireRoleRunner(roleRunner) {
  if (typeof roleRunner?.run !== 'function') {
    throw dependencyError('Configured LLM role runner is required.');
  }
}

function dependencyError(message) {
  return serverError('TRACE_PHASE_2_DEPENDENCY_MISSING', message, { status: 503 });
}
