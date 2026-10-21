import { isDeepStrictEqual } from 'node:util';
import { diagnoseConversationPlan, respellMixedScriptHomoglyphs } from '@rus/npc-runtime';
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
  worldKnowledgeGrounder = null, requestWire = (value) => value } = {}) {
  requireRoleRunner(roleRunner);
  const originalOutputs = new WeakMap();
  const model = async function planNpcConversationResponse(request, context = {}) {
    const repair = context.repair ?? null;
    const semanticRepair = repair?.kind === 'semantic';
    const modelRequest = worldKnowledgeGrounder == null ? request
      : await worldKnowledgeGrounder.ground(request, 'conversation');
    const system = [npcConversationInstructions(repair, modelRequest),
      ...worldKnowledgeFactualClosure(modelRequest)].join(' ');
    const response = await roleRunner.run({
      scope: 'turn_runtime',
      role_id: repair
        ? 'npc_conversation_responder_format_repair'
        : 'npc_conversation_responder',
      ...(repair ? { repair_kind: semanticRepair ? 'semantic' : 'format' } : {}),
      request_identity: request.request_id,
      messages: [{
        role: 'system',
        content: system
      }, {
        role: 'user',
        content: JSON.stringify(repair ? {
          request: requestWire(modelRequest, system),
          ...(Object.hasOwn(repair, 'original_output_text')
            ? { original_output_text: repair.original_output_text }
            : { original_output: repair.original_output }),
          validation_errors: repair.validation_errors
        } : requestWire(modelRequest, system))
      }],
      overrides: { temperature: 0, maxTokens: 1_000 }
    });
    if (repair && isDeepStrictEqual(response.output, { status: 'unrepairable' })) {
      throw conversationContractFailure(semanticRepair, [{
        code: 'repair_declared_unrepairable', category: 'format', path: '$',
        message: 'The repair declared the response unrepairable.' }]);
    }
    const plan = assembleNpcConversationPlan(response.output, request);
    if (repair && (!Object.hasOwn(repair, 'original_output_text')
      || Object.hasOwn(repair, 'act_anchor'))
      && diagnoseConversationPlan(respellMixedScriptHomoglyphs(plan).output, request)
        .every(({ category }) => category !== 'format')) {
      const hasAnchor = Object.hasOwn(repair, 'act_anchor');
      const original = hasAnchor ? repair.act_anchor : repair.original_output;
      if (original !== null && typeof original === 'object' && !Array.isArray(original)
        && [Object.prototype, null].includes(Object.getPrototypeOf(original))) {
        const errors = Array.isArray(repair.validation_errors) ? repair.validation_errors : [];
        const changedAct = changedActPaths(response.output, original)
          .filter((path) => hasAnchor || semanticRepair || !errors.some(
            ({ path: errorPath }) => coversActPath(errorPath, path)));
        if (changedAct.length > 0) {
          throw conversationContractFailure(true, changedAct.map((path) => ({
            code: semanticRepair ? 'semantic_repair_changed_act' : 'format_repair_changed_act',
            category: 'semantic_grounding', path,
            message: semanticRepair
              ? 'A semantic repair must keep the contribution kind, speech act, addressees and intent.'
              : 'A format repair changed an act field outside its validation errors.'
          })));
        }
      }
    }
    if (semanticRepair) {
      const unresolved = unresolvedSemanticRepairQuotes(repair, plan, request);
      if (unresolved.length > 0) {
        throw conversationContractFailure(true, unresolved);
      }
    }
    if (plan !== null && typeof plan === 'object') {
      originalOutputs.set(plan, response.output);
    }
    return plan;
  };
  model.originalOutputOf = (plan) => plan !== null && typeof plan === 'object'
    ? originalOutputs.get(plan) : undefined;
  model.validateFreshPlan = async (plan, request) => {
    const presentation = validateRequiredNpcPresentation(plan, request);
    return presentation ?? auditFreshNpcSpeech({
      roleRunner, plan, request, requestWire
    });
  };
  return model;
}

const ACT_PATHS = Object.freeze([
  ['contribution_kind'], ['speech', 'dominant_act'], ['primary_addressee_ref'],
  ['intended_addressee_refs'], ['interpretation', 'intent']
]);

function unresolvedSemanticRepairQuotes(repair, plan, request) {
  const originalText = repair.original_output?.speech?.utterance_text;
  if (typeof originalText !== 'string') return [];
  const originalVisible = normalizeVisibleText(originalText);
  const repairedVisible = normalizeVisibleText(plan?.speech?.utterance_text);
  return (Array.isArray(repair.validation_errors) ? repair.validation_errors : [])
    .flatMap((error) => {
      if (error?.category !== 'semantic_grounding'
        || typeof error.quote !== 'string') return [];
      const quote = normalizeVisibleText(error.quote);
      if (!quote.trim() || !originalVisible.includes(quote)
        || !repairedVisible.includes(quote)) return [];
      const claimIndex = claimIndexAtPath(error.path);
      const originalClaim = repair.original_output?.speech?.claims?.[claimIndex];
      const repairedClaim = plan?.speech?.claims?.[claimIndex];
      if (claimIndex !== null && claimRecord(originalClaim)
        && claimRecord(repairedClaim)
        && hasNewAllowedKnowledgeRef(originalClaim, repairedClaim, request)) {
        return [];
      }
      return [{ code: 'semantic_repair_unresolved_quote',
        category: 'semantic_grounding', path: error.path, quote: error.quote,
        message: 'A semantic repair retained an unsupported quote without a new allowed claim reference.' }];
    });
}

function normalizeVisibleText(value) {
  return typeof value === 'string'
    ? value.normalize('NFC').replace(/\p{White_Space}+/gu, ' ').trim() : '';
}

function claimIndexAtPath(path) {
  if (typeof path !== 'string') return null;
  const match = /^\$\.speech\.claims\[(0|[1-9]\d*)\](?=\.|\[|$)/u.exec(path);
  return match === null ? null : Number(match[1]);
}

function claimRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasNewAllowedKnowledgeRef(originalClaim, repairedClaim, request) {
  const originalRefs = Array.isArray(originalClaim.source_knowledge_refs)
    ? originalClaim.source_knowledge_refs : [];
  const repairedRefs = Array.isArray(repairedClaim.source_knowledge_refs)
    ? repairedClaim.source_knowledge_refs : [];
  const allowedRefs = request.allowed_references?.knowledge_refs;
  return Array.isArray(allowedRefs) && repairedRefs.some((ref) =>
    typeof ref?.entity_kind === 'string' && typeof ref?.entity_id === 'string'
    && !originalRefs.some((original) => sameKnowledgeRef(ref, original))
    && allowedRefs.some((allowed) => sameKnowledgeRef(ref, allowed)));
}

function sameKnowledgeRef(left, right) {
  return left?.entity_kind === right?.entity_kind
    && left?.entity_id === right?.entity_id;
}

function changedActPaths(output, original) {
  return ACT_PATHS.filter((path) => !isDeepStrictEqual(
    valueAt(output, path), valueAt(original, path)))
    .map((path) => `$.${path.join('.')}`);
}

function coversActPath(errorPath, actPath) {
  if (typeof errorPath !== 'string' || errorPath === '$') return false;
  return errorPath === actPath
    || errorPath.startsWith(`${actPath}.`)
    || errorPath.startsWith(`${actPath}[`)
    || actPath.startsWith(`${errorPath}.`)
    || actPath.startsWith(`${errorPath}[`);
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
  if (request?.social_context?.first_contact_introduction == null) return null;
  const name = request?.npc?.identity?.name_or_label;
  return typeof name === 'string' && name.trim() ? name.trim() : null;
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
