import { normalizeMixedScriptHomoglyphs } from '@rus/kernel';
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
import { findUnsafePlayerText } from '../public-boundary.js';

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
    const modelRequest = grounded;
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
          original_output: repair.original_output ?? null,
          validation_errors: repair.validation_errors ?? []
        } : modelRequest)
      }],
      overrides: { temperature: 0, maxTokens: 20_000 }
    });
    const plan = assemblePlayerConversationPlan(response.output, request);
    // F5: intent_paraphrase must not commit WK fact text as player speech.
    rejectIntentParaphraseWorldKnowledgeLeak(plan, grounded?.world_knowledge);
    return plan;
  };
}

function npcModelMemoryTimeProjection(request) {
  const projectMemory = (memory) => {
    if (!Array.isArray(memory?.records)) return memory;
    return { ...memory, records: memory.records.map((record) => {
      if (!Object.hasOwn(record, 'observed_at')) return record;
      const { observed_at: recordTimeReference, ...fact } = record;
      return { ...fact, record_time_reference: recordTimeReference };
    }) };
  };
  return {
    ...request,
    memory: projectMemory(request.memory),
    knowledge: request.knowledge?.memory == null ? request.knowledge : {
      ...request.knowledge,
      memory: projectMemory(request.knowledge.memory)
    }
  };
}

export function createLowerDvinaTraceNpcSemanticModel({ roleRunner,
  worldKnowledgeGrounder = null, telemetry = null } = {}) {
  requireRoleRunner(roleRunner);
  const typedDecisionsByPlan = new WeakMap();
  const modelPlansByAssembledPlan = new WeakMap();
  const semanticRepairDecisions = new WeakMap();
  const nonApplicableRepairPlans = new WeakSet();
  const repairDecisionsByRequest = new WeakMap();
  const groundedRequestsByRequest = new WeakMap();
  const prepareRequest = async (request, context = {}) => {
    const cached = groundedRequestsByRequest.get(request);
    if (cached) return cached;
    const historicalEvents = Array.isArray(context.historical_events)
      ? context.historical_events : [];
    const grounded = worldKnowledgeGrounder == null ? request
      : await worldKnowledgeGrounder.ground(request, 'conversation', {
        clock: request.requested_at
          ?? request.player_safe_state?.clock
          ?? null,
        historical_events: historicalEvents,
        actor_facets: context.actor_facets ?? {}
      });
    const slice = grounded.world_knowledge;
    const claimRefs = [...(slice?.hard_constraints ?? []),
      ...(slice?.facts ?? [])].flatMap(({ claim_ref: claimRef }) =>
      typeof claimRef === 'string' && claimRef.trim() === claimRef
        && claimRef.length > 0
        ? [{ entity_kind: 'knowledge_record', entity_id: claimRef }]
        : []);
    const knowledgeRefs = new Map([
      ...(request.allowed_references?.knowledge_refs ?? []),
      ...claimRefs
    ].map((reference) => [
      `${reference.entity_kind}\u0000${reference.entity_id}`,
      structuredClone(reference)
    ]));
    const preparedRequest = {
      ...request,
      allowed_references: {
        ...request.allowed_references,
        knowledge_refs: [...knowledgeRefs.values()].sort((left, right) =>
          `${left.entity_kind}\u0000${left.entity_id}`
            < `${right.entity_kind}\u0000${right.entity_id}` ? -1
            : `${left.entity_kind}\u0000${left.entity_id}`
              > `${right.entity_kind}\u0000${right.entity_id}` ? 1 : 0)
      }
    };
    const promptRequest = npcModelMemoryTimeProjection({ ...grounded,
      allowed_references: preparedRequest.allowed_references });
    const preparedContext = { grounded_request: promptRequest,
      audit_request: promptRequest };
    const prepared = { request: preparedRequest, context: preparedContext };
    groundedRequestsByRequest.set(request, prepared);
    groundedRequestsByRequest.set(preparedRequest, prepared);
    return prepared;
  };
  const model = async function planNpcConversationResponse(request, context = {}) {
    const repair = context.repair ?? null;
    const semanticRepair = repair?.validation_errors?.some(
      ({ category }) => category === 'semantic_grounding'
    ) === true;
    const repairServiceText = repair?.validation_errors?.some(
      ({ code }) => code === 'TRACE_NPC_SPEECH_SERVICE_TEXT') === true;
    const prepared = context.prepared_request_context
      ? { request, context: context.prepared_request_context }
      : await prepareRequest(request, context);
    const requestForPlan = prepared.request;
    const savedDecision = repair?.original_output != null
      ? repairDecisionsByRequest.get(requestForPlan) : null;
    repairDecisionsByRequest.delete(requestForPlan);
    const originalRepairPlan = semanticRepair && repair.original_output != null
      ? originalPlanForRepair(repair.original_output, savedDecision) : null;
    const { grounded_request: promptRequest,
      audit_request: modelRequest } =
      prepared.context;
    const response = await roleRunner.run({
      scope: 'turn_runtime',
      role_id: repair
        ? 'npc_conversation_responder_format_repair'
        : 'npc_conversation_responder',
      request_identity: request.request_id,
      messages: [{
        role: 'system',
        content: [npcConversationInstructions(repair, promptRequest),
          ...worldKnowledgeFactualClosure(promptRequest)].join(' ')
      }, {
        role: 'user',
        content: JSON.stringify(repair ? {
          request: modelRequest,
          ...(semanticRepair ? repairServiceText ? {
            marker_safe_decision: decisionForRepair(repair.original_output,
              requestForPlan, savedDecision)
          } : {
            original_speech: originalRepairPlan?.speech ?? null,
            preserved_decision: decisionForRepair(repair.original_output,
              requestForPlan, savedDecision)
          } : {
            original_output: repair.original_output ?? null
          }),
          validation_errors: semanticRepair
            ? npcRepairErrorsForModel(repair.validation_errors)
            : repair.validation_errors ?? []
        } : modelRequest)
      }],
      overrides: { temperature: 0, maxTokens: 20_000 }
    });
    const compactRepair = originalRepairPlan != null && !repairServiceText;
    const markerRepairOutput = originalRepairPlan != null && repairServiceText
      ? restoreMarkerRepairClaimIds(
        resolveNpcClaimReferenceIds(response.output, requestForPlan),
        originalRepairPlan)
      : response.output;
    if (markerRepairOutput === null) {
      const rejectedPlan = structuredClone(repair.original_output);
      nonApplicableRepairPlans.add(rejectedPlan);
      return rejectedPlan;
    }
    const repairOutput = compactRepair
      ? applyNpcSemanticRepair(originalRepairPlan, response.output,
        requestForPlan, repair.validation_errors)
      : markerRepairOutput;
    if (compactRepair && repairOutput === null) {
      const rejectedPlan = structuredClone(repair.original_output);
      nonApplicableRepairPlans.add(rejectedPlan);
      return rejectedPlan;
    }
    const resolvedOutput = resolveNpcClaimReferenceIds(repairOutput,
      requestForPlan);
    const normalizedSpeech = normalizeMixedScriptHomoglyphs(
      resolvedOutput?.speech?.utterance_text);
    const normalizedOutput = normalizedSpeech.replacedCharacterCount === 0
      ? resolvedOutput : {
        ...resolvedOutput,
        speech: { ...resolvedOutput.speech,
          utterance_text: normalizedSpeech.text }
      };
    try {
      telemetry?.onDetail?.({
        event: 'npc_conversation_speech_normalization',
        scope: 'turn_runtime',
        role_id: repair
          ? 'npc_conversation_responder_format_repair'
          : 'npc_conversation_responder',
        request_identity: request.request_id,
        replaced_character_count: normalizedSpeech.replacedCharacterCount
      });
    } catch { /* diagnostics must not affect gameplay */ }
    const repairConcernKinds = semanticRepair
      ? (repair.validation_errors ?? []).flatMap(({ concern_kinds: kinds }) =>
        Array.isArray(kinds) ? kinds.filter((kind) => typeof kind === 'string') : [])
      : [];
    const typedDecision = npcTypedDecisionProjection(normalizedOutput,
      requestForPlan);
    const assembled = assembleNpcConversationPlan(normalizedOutput,
      requestForPlan);
    const modelPlan = npcPlanWithCodeEnvelope(normalizedOutput, assembled);
    if (originalRepairPlan != null
        && !preservesSemanticRepairDecision(originalRepairPlan, modelPlan,
          requestForPlan, repairConcernKinds)) {
      const rejectedPlan = structuredClone(repair.original_output);
      nonApplicableRepairPlans.add(rejectedPlan);
      return rejectedPlan;
    }
    modelPlansByAssembledPlan.set(assembled, modelPlan);
    typedDecisionsByPlan.set(assembled, typedDecision);
    if (originalRepairPlan != null) {
      semanticRepairDecisions.set(assembled, {
        original: originalRepairPlan,
        concernKinds: repairConcernKinds,
        initialAuditFeedback: (repair.validation_errors ?? []).flatMap(
          ({ audit_feedback: feedback }) => Array.isArray(feedback)
            ? feedback.map(({ kind, reason, quote }) =>
              ({ kind, reason, quote })) : [])
      });
    }
    return assembled;
  };
  model.prepareRequest = prepareRequest;
  model.validateFreshPlan = async (plan, request, context = {}) => {
    if (plan != null && typeof plan === 'object'
        && nonApplicableRepairPlans.has(plan)) {
      return semanticRepairNotApplicable();
    }
    const presentation = validateRequiredNpcPresentation(plan, request);
    const marker = plan?.contribution_kind === 'speech'
      ? findUnsafePlayerText(plan.speech?.utterance_text, {
        label: true, generatedProse: true }) : null;
    if (marker != null) {
      if (!semanticRepairDecisions.has(plan)) {
        rememberRepairDecision(plan, request, typedDecisionsByPlan.get(plan));
      }
      return { pass: false, errors: [{
        code: 'TRACE_NPC_SPEECH_SERVICE_TEXT',
        category: 'semantic_grounding', retryable: true,
        concern_kinds: ['service_text_marker'],
        message: 'Rewrite the reply without service labels or technical markers.'
      }, ...(presentation?.errors ?? [])] };
    }
    const originalDecision = plan != null && typeof plan === 'object'
      ? semanticRepairDecisions.get(plan) : null;
    const repairedDecision = plan != null && typeof plan === 'object'
      ? modelPlansByAssembledPlan.get(plan) ?? plan : null;
    if (originalDecision != null
        && !preservesSemanticRepairDecision(originalDecision.original,
          repairedDecision, request, originalDecision.concernKinds)) {
      return semanticRepairNotApplicable();
    }
    const preparedContext = context.prepared_request_context
      ?? groundedRequestsByRequest.get(request);
    if (presentation != null) {
      rememberRepairDecision(plan, request, typedDecisionsByPlan.get(plan));
      return presentation;
    }
    const audit = await auditFreshNpcSpeech({ roleRunner, plan,
      originalSpeech: originalDecision?.original?.speech,
      initialAuditFeedback: originalDecision?.initialAuditFeedback,
      request: preparedContext?.audit_request
        ?? preparedContext?.context?.audit_request ?? request });
    if (audit?.errors?.some(({ category }) => category === 'semantic_grounding')) {
      if (!semanticRepairDecisions.has(plan)) {
        rememberRepairDecision(plan, request, typedDecisionsByPlan.get(plan));
      }
    }
    return audit;
  };
  function decisionForRepair(originalOutput, request, savedDecision) {
    if (originalOutput != null && typeof originalOutput === 'object') {
      if (savedDecision?.markerSafeDecision !== undefined) {
        return structuredClone(savedDecision.markerSafeDecision);
      }
      const byIdentity = semanticRepairDecisions.get(originalOutput);
      if (byIdentity !== undefined) {
        return npcTypedDecisionProjection(byIdentity.original, request);
      }
    }
    return npcTypedDecisionProjection(originalOutput, request);
  }
  function originalPlanForRepair(originalOutput, savedDecision) {
    if (originalOutput != null && typeof originalOutput === 'object') {
      if (savedDecision?.originalPlan !== undefined) {
        return structuredClone(savedDecision.originalPlan);
      }
      const byIdentity = semanticRepairDecisions.get(originalOutput);
      if (byIdentity !== undefined) return structuredClone(byIdentity.original);
      return structuredClone(originalOutput);
    }
    return originalOutput;
  }
  function rememberRepairDecision(plan, request, decision) {
    if (plan != null && typeof plan === 'object' && decision != null) {
      repairDecisionsByRequest.set(request, {
        markerSafeDecision: structuredClone(decision),
        originalPlan: structuredClone(modelPlansByAssembledPlan.get(plan) ?? plan)
      });
    }
  }
  return model;
}

function restoreMarkerRepairClaimIds(output, original) {
  if (output?.speech == null || !Array.isArray(output.speech.claims)
      || !Array.isArray(original?.speech?.claims)) return output;
  const used = new Set();
  const claims = [];
  for (const claim of output.speech.claims) {
    if (claim == null || typeof claim !== 'object'
        || Array.isArray(claim)) return null;
    const matches = original.speech.claims.filter((originalClaim) =>
      isDeepStrictEqual({ ...claim, claim_id: originalClaim.claim_id },
        originalClaim));
    if (matches.length !== 1 || used.has(matches[0].claim_id)) return null;
    used.add(matches[0].claim_id);
    claims.push(structuredClone(matches[0]));
  }
  return { ...output, speech: { ...output.speech, claims } };
}

function npcRepairErrorsForModel(errors) {
  return (errors ?? []).map((error) => error?.category === 'semantic_grounding'
    ? { category: 'semantic_grounding', concern_kinds:
      Array.isArray(error.concern_kinds)
        ? error.concern_kinds.filter((kind) => typeof kind === 'string') : [],
      ...(Array.isArray(error.audit_feedback) && error.audit_feedback.length > 0
        ? { audit_feedback: error.audit_feedback.map(({ kind, reason, quote }) =>
          ({ kind, reason, quote })) } : {}) }
    : { category: 'format',
      message: 'Return the required response shape using only values from the request.' });
}

function applyNpcSemanticRepair(original, output, request, errors) {
  if (original?.interpretation == null
      || typeof original.interpretation !== 'object') return null;
  const speech = original.speech != null;
  const keys = speech
    ? ['utterance_text', 'claims', 'interpretation', 'reason']
    : ['interpretation', 'reason'];
  if (!hasExactKeys(output, keys)
      || !hasExactKeys(output.interpretation,
        ['intent', 'grounded_contribution'])
      || typeof output.interpretation.intent !== 'string'
      || typeof output.interpretation.grounded_contribution !== 'string'
      || typeof output.reason !== 'string'
      || (speech && (typeof output.utterance_text !== 'string'
        || !Array.isArray(output.claims)))) return null;
  const repaired = structuredClone(original);
  repaired.interpretation.intent = output.interpretation.intent;
  repaired.interpretation.grounded_contribution =
    output.interpretation.grounded_contribution;
  repaired.reason = output.reason;
  if (speech) {
    repaired.speech.utterance_text = output.utterance_text;
    repaired.speech.claims = structuredClone(output.claims);
    const requiredTag = request.social_context?.npc_behavior
      ?.required_interaction_tag;
    if (typeof requiredTag === 'string' && requiredTag.length > 0
        && errors.some(({ concern_kinds: kinds }) =>
          Array.isArray(kinds)
            && kinds.includes('required_npc_behavior_missing'))
        && !repaired.speech.interaction_tags.includes(requiredTag)) {
      repaired.speech.interaction_tags.push(requiredTag);
    }
  }
  return repaired;
}

function hasExactKeys(value, keys) {
  return value !== null && typeof value === 'object'
    && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function npcTypedDecisionProjection(plan, request, includeBindingIdentity = false) {
  if (plan == null || typeof plan !== 'object') return null;
  const allowedRefs = new Set([
    ...(request.allowed_references?.actor_refs ?? []),
    ...(request.allowed_references?.entity_refs ?? []),
    ...(request.allowed_references?.combat_target_refs ?? [])
  ].filter((reference) => typeof reference?.entity_kind === 'string'
    && typeof reference.entity_id === 'string')
    .map((reference) => `${reference.entity_kind}\u0000${reference.entity_id}`));
  const projectRef = (reference) => reference != null
      && allowedRefs.has(`${reference.entity_kind}\u0000${reference.entity_id}`)
    ? structuredClone(reference) : null;
  const projectRefs = (references) => (Array.isArray(references)
    ? references : []).map(projectRef).filter(Boolean);
  const speech = plan.speech;
  const speechDecision = speech == null ? null : {
    dominant_act: speech.dominant_act,
    interaction_tags: [...new Set(Array.isArray(speech.interaction_tags)
      ? speech.interaction_tags : [])].sort(),
    ...(includeBindingIdentity ? { topic_refs: [...new Set(
      Array.isArray(speech.topic_refs) ? speech.topic_refs : [])].sort() } : {}),
    response_expectation: speech.response_expectation == null ? null : {
      kind: speech.response_expectation.kind,
      target_refs: projectRefs(speech.response_expectation.target_refs)
    },
  };
  const projection = {
    contribution_kind: plan.contribution_kind,
    primary_addressee_ref: projectRef(plan.primary_addressee_ref),
    intended_addressee_refs: projectRefs(plan.intended_addressee_refs),
    affected_actor_refs: projectRefs(plan.affected_actor_refs),
    speech: speechDecision,
    resolution: plan.resolution,
    activity: plan.activity == null ? null : {
      duration_class: plan.activity.duration_class,
      effort: plan.activity.effort
    },
    supporting_operations: projectSupportingOperations(plan.supporting_operations,
      request, projectRef, includeBindingIdentity),
    check: projectTypedCheck(plan.check,
      request.decision_scope ?? {}, includeBindingIdentity),
    handoff: plan.handoff == null ? null : {
      kind: plan.handoff.kind,
      target_actor_refs: projectRefs(plan.handoff.target_actor_refs)
    }
  };
  return projection;
}

const conversationRelationSetKeys = new Set([
  'affected_actor_refs', 'claims', 'interaction_tags', 'intended_addressee_refs',
  'mentioned_entity_refs', 'observable_effects', 'supporting_operations',
  'target_refs', 'topic_refs'
]);

function preservesSemanticRepairDecision(original, repaired, request,
  concernKinds) {
  const originalDecision = npcTypedDecisionProjection(original, request, true);
  const repairedDecision = npcTypedDecisionProjection(repaired, request, true);
  if (originalDecision == null || repairedDecision == null) {
    return deepEqualConversationValues(repairedDecision, originalDecision);
  }
  if (originalDecision.speech == null || repairedDecision.speech == null) {
    return deepEqualConversationValues(repairedDecision, originalDecision);
  }
  const originalClaims = original?.speech?.claims;
  const repairedClaims = repaired?.speech?.claims;
  if (!Array.isArray(originalClaims) || !Array.isArray(repairedClaims)
      || !isRelationSetSubset(repairedClaims, originalClaims)) return false;
  const originalTags = new Set(originalDecision.speech.interaction_tags);
  const repairedTags = new Set(repairedDecision.speech.interaction_tags);
  const requiredTag = request.social_context?.npc_behavior
    ?.required_interaction_tag;
  const mayAddRequiredTag = typeof requiredTag === 'string'
    && requiredTag.length > 0
    && !originalTags.has(requiredTag)
    && concernKinds.includes('required_npc_behavior_missing');
  const onlyRequiredTagAdded = mayAddRequiredTag
    && repairedTags.size === originalTags.size + 1
    && repairedTags.has(requiredTag)
    && [...originalTags].every((tag) => repairedTags.has(tag));
  const sameTags = onlyRequiredTagAdded
    || (originalTags.size === repairedTags.size
      && [...originalTags].every((tag) => repairedTags.has(tag)));
  if (!sameTags) return false;
  if (onlyRequiredTagAdded) {
    repairedDecision.speech.interaction_tags =
      originalDecision.speech.interaction_tags;
  }
  return deepEqualConversationValues(repairedDecision, originalDecision);
}

function isRelationSetSubset(subset, superset) {
  const values = new Set(superset.map((value) => stableConversationValue(
    normalizeConversationRelationSets(value))));
  return subset.every((value) => values.has(stableConversationValue(
    normalizeConversationRelationSets(value))));
}

function npcPlanWithCodeEnvelope(modelOutput, assembledPlan) {
  return {
    ...structuredClone(modelOutput),
    schema: assembledPlan.schema,
    request_id: assembledPlan.request_id,
    boundary_id: assembledPlan.boundary_id,
    conversation_id: assembledPlan.conversation_id,
    exchange_id: assembledPlan.exchange_id,
    state_version: assembledPlan.state_version,
    speaker_ref: structuredClone(assembledPlan.speaker_ref)
  };
}

function semanticRepairNotApplicable() {
  return {
    pass: false,
    errors: [{
      code: 'TURN_NPC_PLAN_NOT_APPLICABLE', category: 'applicability',
      retryable: false,
      message: 'Semantic repair must preserve the original typed contribution decision.'
    }]
  };
}

function deepEqualConversationValues(left, right) {
  return isDeepStrictEqual(normalizeConversationRelationSets(left),
    normalizeConversationRelationSets(right));
}

function normalizeConversationRelationSets(value, key = null) {
  if (Array.isArray(value)) {
    const normalized = value.map((item) => normalizeConversationRelationSets(item));
    return key != null && (conversationRelationSetKeys.has(key)
      || key.endsWith('_refs'))
      ? normalized.sort((left, right) => {
        const leftKey = stableConversationValue(left);
        const rightKey = stableConversationValue(right);
        return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
      })
      : normalized;
  }
  if (value == null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([childKey, child]) =>
    [childKey, normalizeConversationRelationSets(child, childKey)]));
}

function stableConversationValue(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableConversationValue).join(',')}]`;
  }
  if (value == null || typeof value !== 'object') return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${stableConversationValue(value[key])}`).join(',')}}`;
}

function projectSupportingOperations(operations, request, projectRef,
  includeBindingIdentity) {
  if (!Array.isArray(operations)) return [];
  const operationContract = request.decision_scope?.operation_contract ?? {};
  const allowedReferenceIds = new Set(Object.values(
    request.allowed_references ?? {}).flatMap((references) => Array.isArray(references)
    ? references.map(({ entity_id: id }) => id).filter((id) => typeof id === 'string')
    : []));
  const referenceField = (key) => key.endsWith('_ref') || key.endsWith('_refs');
  const enumFields = new Set(['kind', 'interaction_kind', 'operation_kind',
    'relation', 'mode', 'status', 'resolution', 'action', 'role',
    'protected_actor_slot']);
  return operations.flatMap((operation) => {
    if (operation == null || typeof operation !== 'object'
        || typeof operation.op !== 'string'
        || !Object.hasOwn(operationContract, operation.op)) return [];
    const projected = { op: operation.op };
    const requiredOperation = request.decision_scope
      ?.required_supporting_operation;
    const exactRequired = requiredOperation?.op === operation.op
      && isDeepStrictEqual(operation, requiredOperation);
    const binding = (operationContract[operation.op]?.allowed_bindings ?? [])
      .find((candidate) => {
        if (candidate == null || typeof candidate !== 'object') return false;
        const expected = { op: operation.op, ...candidate };
        return isDeepStrictEqual(operation, expected);
      });
    const approvedBinding = exactRequired || binding !== undefined;
    if (includeBindingIdentity && approvedBinding
        && typeof operation.execution_binding_ref === 'string') {
      projected.execution_binding_ref = operation.execution_binding_ref;
    }
    for (const [key, value] of Object.entries(operation)) {
      if (key === 'op') continue;
      if (referenceField(key)) {
        if (Array.isArray(value)) projected[key] = value.map(projectRef)
          .filter(Boolean);
        else if (typeof value === 'string'
            && allowedReferenceIds.has(value)) projected[key] = value;
        else {
          const reference = projectRef(value);
          if (reference !== null) projected[key] = reference;
        }
      } else if (enumFields.has(key)
          && (typeof value === 'string' || typeof value === 'number'
            || typeof value === 'boolean')
          && (approvedBinding || typeof value === 'string'
            && !['role', 'protected_actor_slot'].includes(key))) {
        projected[key] = value;
      }
    }
    return [projected];
  });
}

function projectTypedCheck(check, decisionScope, includeBindingIdentity) {
  if (check == null) return null;
  const attributes = decisionScope.allowed_attribute_refs ?? [];
  const skills = decisionScope.allowed_skill_refs ?? [];
  const projectAllowed = (value, allowed) => typeof value === 'string'
      && allowed.includes(value) ? value : null;
  return {
    ...(includeBindingIdentity ? { purpose: check.purpose } : {}),
    attribute_ref: projectAllowed(check.attribute_ref, attributes),
    skill_ref: projectAllowed(check.skill_ref, skills),
    difficulty_band: check.difficulty_band,
    outcomes: check.outcomes == null ? null : Object.fromEntries(
      Object.entries(check.outcomes).map(([key, outcome]) => [key, {
        delivery_quality: outcome?.delivery_quality,
        observable_effects: Array.isArray(outcome?.observable_effects)
          ? [...outcome.observable_effects] : []
      }])
    )
  };
}

function resolveNpcClaimReferenceIds(output, request) {
  const referencesById = new Map();
  for (const reference of request.allowed_references?.knowledge_refs ?? []) {
    if (typeof reference?.entity_id !== 'string') continue;
    const matches = referencesById.get(reference.entity_id) ?? [];
    matches.push(reference);
    referencesById.set(reference.entity_id, matches);
  }
  const resolved = structuredClone(output);
  const claims = resolved?.speech?.claims;
  if (!Array.isArray(claims)) return resolved;
  for (const claim of claims) {
    if (claim === null || typeof claim !== 'object' || Array.isArray(claim)) {
      continue;
    }
    if (!Array.isArray(claim.source_knowledge_refs)) {
      claim.source_knowledge_refs = [null];
      continue;
    }
    claim.source_knowledge_refs = claim.source_knowledge_refs.map((wireRef) => {
      const id = typeof wireRef === 'string' ? wireRef
        : typeof wireRef?.entity_id === 'string' ? wireRef.entity_id : null;
      if (id === null) return wireRef;
      const matches = referencesById.get(id) ?? [];
      return matches.length === 1 ? structuredClone(matches[0]) : id;
    });
  }
  return resolved;
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
  // N5: ignore punctuation and ё/е so lightly disguised WK copy still fails.
  return String(value ?? '')
    .toLowerCase()
    .replace(/ё/gu, 'е')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}
