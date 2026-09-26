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
import { omitWorldKnowledgeContextText } from '@rus/turn';
import { playerSafeSelfIntroductionName } from
  './lower-dvina-trace-player-safe-npc-details.js';

export function createLowerDvinaTracePlayerConversationModel({ roleRunner,
  worldKnowledgeGrounder = null } = {}) {
  requireRoleRunner(roleRunner);
  return async function interpretPlayerConversation(request, context = {}) {
    const repair = context.repair ?? null;
    // D16: interpreter uses semantic_resolution (same family as turn-step parsers).
    const historicalEvents = Array.isArray(context.historical_events)
      ? context.historical_events : [];
    const grounded = worldKnowledgeGrounder == null ? request
      : await worldKnowledgeGrounder.ground(request, 'semantic_resolution', {
        clock: context.clock
          ?? request.player_safe_context?.current_game_timestamp
          ?? null,
        historical_events: historicalEvents,
        actor_facets: context.actor_facets ?? {}
      });
    const modelRequest = omitWorldKnowledgeContextText(grounded);
    const response = await roleRunner.run({
      scope: 'turn_runtime',
      role_id: repair
        ? 'player_conversation_interpreter_format_repair'
        : 'player_conversation_interpreter',
      request_identity: request.request_id,
      messages: [{
        role: 'system',
        content: [playerConversationInstructions(repair, grounded),
          ...worldKnowledgeFactualClosure(grounded)].join(' ')
      }, {
        role: 'user',
        content: JSON.stringify(repair ? {
          request: modelRequest,
          original_output: repair.original_output,
          validation_errors: repair.validation_errors
        } : modelRequest)
      }],
      overrides: { temperature: 0, maxTokens: 1_000 }
    });
    const plan = assemblePlayerConversationPlan(response.output, request);
    // F5: intent_paraphrase must not commit WK fact text as player speech.
    rejectIntentParaphraseWorldKnowledgeLeak(plan, grounded?.world_knowledge);
    return plan;
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
    // Explicit party events from model-call context / exchange wrap (F1).
    const historicalEvents = Array.isArray(context.historical_events)
      ? context.historical_events
      : [];
    const grounded = worldKnowledgeGrounder == null ? request
      : await worldKnowledgeGrounder.ground(request, 'conversation', {
        clock: request.requested_at
          ?? request.player_safe_state?.clock
          ?? null,
        historical_events: historicalEvents
      });
    const modelRequest = omitWorldKnowledgeContextText(grounded);
    const response = await roleRunner.run({
      scope: 'turn_runtime',
      role_id: repair
        ? 'npc_conversation_responder_format_repair'
        : 'npc_conversation_responder',
      request_identity: request.request_id,
      messages: [{
        role: 'system',
        content: [npcConversationInstructions(repair, grounded),
          ...worldKnowledgeFactualClosure(grounded)].join(' ')
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
  model.validateFreshPlan = async (plan, request) => {
    const presentation = validateRequiredNpcPresentation(plan, request);
    return presentation ?? auditFreshNpcSpeech({ roleRunner, plan, request });
  };
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
  const introducedName = requiredFirstContactName(request)
    ?? playerSafeSelfIntroductionName(original?.speech?.utterance_text);
  const introduction = introducedName ? `Я ${introducedName}.` : null;
  const requiredTag = request.social_context?.npc_behavior
    ?.required_interaction_tag;
  const uncertainty = facts.length === 0
    ? 'Об этом я ничего подтвердить не могу.'
    : 'Остального я подтвердить не могу.';
  const utterance = [introduction, ...facts.map(({ fact_text }) => fact_text),
    uncertainty].filter(Boolean).join(' ');
  return assembleNpcConversationPlan({
    contribution_kind: 'speech',
    speech: {
      utterance_text: utterance,
      dominant_act: 'answer',
      interaction_tags: typeof requiredTag === 'string' && requiredTag
        ? [requiredTag] : [],
      topic_refs: [],
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
      grounded_contribution: utterance,
      adaptation: 'literal'
    },
    resolution: 'automatic',
    activity: { duration_class: 'domain_owned', effort: 'none' },
    supporting_operations: [], check: null, handoff: null,
    reason: 'Ответ ограничен точными текущими наблюдениями.'
  }, request);
}

function validateRequiredNpcPresentation(plan, request) {
  const requiredName = requiredFirstContactName(request);
  const requiredTag = request.social_context?.npc_behavior
    ?.required_interaction_tag;
  const errors = [
    ...(requiredName !== null
        && playerSafeSelfIntroductionName(plan?.speech?.utterance_text)
          !== requiredName
      ? ['first_contact_introduction_missing'] : []),
    ...(typeof requiredTag === 'string' && requiredTag
        && !plan?.speech?.interaction_tags?.includes(requiredTag)
      ? ['required_npc_behavior_missing'] : [])
  ];
  return errors.length === 0 ? null : {
    pass: false,
    errors: errors.map((kind) => ({
      code: 'TRACE_NPC_REQUIRED_PRESENTATION_MISSING',
      category: 'semantic_grounding',
      retryable: true,
      concern_kinds: [kind],
      message: 'Rewrite the response with the required first-contact presentation.'
    }))
  };
}

function requiredFirstContactName(request) {
  const name = request?.social_context?.first_contact_introduction
    ?.canonical_name;
  return typeof name === 'string' && name.trim()
      && name.trim() === request?.npc?.identity_state?.canonical_name
    ? name.trim() : null;
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

/** F5: reject intent_paraphrase that copies WK fact text into committed speech. */
export function rejectIntentParaphraseWorldKnowledgeLeak(plan, slice) {
  if (plan?.input_mode !== 'intent_paraphrase') return;
  const utterance = plan?.speech?.utterance_text;
  if (typeof utterance !== 'string' || !utterance.trim() || slice == null) return;
  const normalized = normalizeLeakText(utterance);
  for (const fact of [...(slice.facts ?? []), ...(slice.hard_constraints ?? [])]) {
    const text = normalizeLeakText(fact?.runtime_text);
    if (text.length >= 12 && normalized.includes(text)) {
      throw serverError(
        'PLAYER_CONVERSATION_WK_UTTERANCE_LEAK',
        'intent_paraphrase utterance must not copy World Knowledge fact text.',
        { status: 422, details: { claim_ref: fact?.claim_ref ?? null } }
      );
    }
  }
}

function normalizeLeakText(value) {
  return String(value ?? '').toLowerCase().replace(/\s+/gu, ' ').trim();
}
