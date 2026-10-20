import { isDeepStrictEqual } from 'node:util';
import { serverError } from '../errors.js';
import {
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
import { playerSafeSelfIntroductionName } from
  './lower-dvina-trace-player-safe-npc-details.js';

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
  const originalOutputs = new WeakMap();
  const model = async function planNpcConversationResponse(request, context = {}) {
    const repair = context.repair ?? null;
    const semanticRepair = repair?.kind === 'semantic';
    const modelRequest = worldKnowledgeGrounder == null ? request
      : await worldKnowledgeGrounder.ground(request, 'conversation');
    const response = await roleRunner.run({
      scope: 'turn_runtime',
      role_id: repair
        ? 'npc_conversation_responder_format_repair'
        : 'npc_conversation_responder',
      ...(repair ? { repair_kind: semanticRepair ? 'semantic' : 'format' } : {}),
      request_identity: request.request_id,
      messages: [{
        role: 'system',
        content: [npcConversationInstructions(repair, modelRequest),
          ...worldKnowledgeFactualClosure(modelRequest)].join(' ')
      }, {
        role: 'user',
        content: JSON.stringify(repair ? {
          request: modelRequest,
          ...(Object.hasOwn(repair, 'original_output_text')
            ? { original_output_text: repair.original_output_text }
            : { original_output: repair.original_output }),
          validation_errors: repair.validation_errors
        } : modelRequest)
      }],
      overrides: { temperature: 0, maxTokens: 1_000 }
    });
    if (repair && isDeepStrictEqual(response.output, { status: 'unrepairable' })) {
      throw conversationContractFailure(semanticRepair, [{
        code: 'repair_declared_unrepairable', category: 'format', path: '$',
        message: 'The repair declared the response unrepairable.' }]);
    }
    const changedAct = semanticRepair
      ? changedActPaths(response.output, repair.original_output) : [];
    if (changedAct.length > 0) {
      throw conversationContractFailure(true, changedAct.map((path) => ({
        code: 'semantic_repair_changed_act', category: 'semantic_grounding',
        path, message: 'A semantic repair must keep the contribution kind, speech act, addressees and intent.' })));
    }
    const plan = assembleNpcConversationPlan(response.output, request);
    if (plan !== null && typeof plan === 'object') {
      originalOutputs.set(plan, response.output);
    }
    return plan;
  };
  model.originalOutputOf = (plan) => plan !== null && typeof plan === 'object'
    ? originalOutputs.get(plan) : undefined;
  model.validateFreshPlan = async (plan, request) => {
    const presentation = validateRequiredNpcPresentation(plan, request);
    return presentation ?? auditFreshNpcSpeech({ roleRunner, plan, request });
  };
  return model;
}

const ACT_PATHS = Object.freeze([
  ['contribution_kind'], ['speech', 'dominant_act'], ['primary_addressee_ref'],
  ['intended_addressee_refs'], ['interpretation', 'intent']
]);

function changedActPaths(output, original) {
  return ACT_PATHS.filter((path) => !isDeepStrictEqual(
    valueAt(output, path), valueAt(original, path)))
    .map((path) => `$.${path.join('.')}`);
}

function valueAt(value, path) {
  return path.reduce((current, key) => current !== null
    && typeof current === 'object' ? current[key] : undefined, value);
}

function conversationContractFailure(semantic, validationErrors) {
  return serverError('TURN_NPC_CONVERSATION_CONTRACT_FAILURE',
    'NPC conversation repair cannot satisfy the conversation contract.', {
      status: 503,
      details: { category: semantic ? 'semantic' : 'format',
        validation_errors: validationErrors }
    });
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
