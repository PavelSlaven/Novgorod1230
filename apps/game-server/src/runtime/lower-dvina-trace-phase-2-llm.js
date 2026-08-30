import { serverError } from '../errors.js';
import { SEMANTIC_RESOLVER_PROMPT, TURN_STEP_PLANNER_INSTRUCTIONS, TURN_STEP_PLAN_EXAMPLE, TURN_STEP_PLAN_MAPPINGS, npcConversationInstructions, playerConversationInstructions, requiredNpcConversationCandidate, requiredPlayerConversationCandidate } from './lower-dvina-trace-phase-2-llm-prompts.js';
export { createLowerDvinaTraceNpcAutonomousModel } from './lower-dvina-trace-autonomous-llm.js';
export { createLowerDvinaTraceNpcCombatModel } from './lower-dvina-trace-combat-llm.js';
export { assembleNarrationRoleOutput, createLowerDvinaTraceNarrationService } from './lower-dvina-trace-narration-llm.js';
export function createLowerDvinaTraceSemanticResolver({ roleRunner } = {}) {
  requireRoleRunner(roleRunner);
  return async function resolveSemanticIntent(request) {
    const response = await roleRunner.run({
      scope: 'turn_runtime',
      role_id: 'intent_router',
      messages: [{
        role: 'system',
        content: SEMANTIC_RESOLVER_PROMPT.join(' ')
      }, {
        role: 'user',
        content: JSON.stringify(request)
      }],
      overrides: { temperature: 0, maxTokens: 1200 }
    });
    if (!response?.output || typeof response.output !== 'object') {
      throw dependencyError('Semantic resolver returned no JSON object.');
    }
    return response.output;
  };
}
export function createLowerDvinaTraceTurnStepModel({
  roleRunner
} = {}) {
  requireRoleRunner(roleRunner);
  return async function planTurnStep(request, repairContext = null) {
    const repairing = repairContext != null;
    const payload = repairing
      ? {
          request,
          structural_errors:
            structuredClone(repairContext.structural_errors ?? [])
        }
      : request;
    const operationChoices = turnStepOperationChoices(request);
    let response;
    try {
      response = await roleRunner.run({
        scope: 'turn_runtime',
        role_id: repairing
          ? 'turn_step_planner_repair'
          : 'turn_step_planner',
        request_identity: request.request_id,
        messages: [{
          role: 'system',
          content: [
            'Return only one JSON object containing the semantic choice for one turn step.',
            'Do not add Markdown, prose outside JSON, or unknown fields.',
            'Do not return schema, request_id, committed_state_version, working_revision, step_index, goal_result pending, or code-owned domain activity; the server assembles them.',
            'Return interpretation, resolution, semantic goal_result/activity when applicable, operation_choice or semantic operations, check, continuation, clarification, reason_code, and reason.',
            `A direct semantic example is:\n${semanticTurnStepExample()}`,
            `Code-owned exact operation choices are:\n${JSON.stringify(operationChoices.map(({ choice_id, operation }) => ({ choice_id, operation })))}`,
            'For a matching code-owned operation return operation_choice with exactly one supplied choice_id and omit operations. The server restores the exact operation DTO. Otherwise set operation_choice to null and return only genuinely semantic operations.',
            `Use these mappings for the matching cases; angle-bracket values mean copy from request and must never be emitted literally:\n${TURN_STEP_PLAN_MAPPINGS}`,
            ...TURN_STEP_PLANNER_INSTRUCTIONS,
            'Do not infer a fantastical referent from player intent: it is absent unless player-safe state identifies it as a visible entity or capability.',
            'Classify interpretation.adaptation by the stated goal, not whether the actor can pantomime it. First: an absent fantastical required referent means make_believe. Otherwise: real or ordinary referents with a physically limited action mean reality_limited. Otherwise: literal. An ordinary unknown or absent referent is not thereby fantastical; preserve existing discovery/domain flow.',
            'When an operation choice covers the intent, select its choice_id; use action_production only when no supplied choice covers it.',
            ...(request.prepared_followup_candidates?.length ? [
              preparedFollowupPrompt(request.prepared_followup_candidates)
            ] : []),
            'Plan exactly one executable step. Sentence boundary is a continuation boundary. Plan only the first independently executable sentence. If request.remaining_intent has later non-empty sentences, always preserve all of them in continuation, use goal_result pending, and never let one selected operation consume them. Only clauses inside the same sentence may form one composite operation, and only when that operation explicitly represents their single event. One selected domain operation covers only its own grounded event; it may cover multiple verbs only when the selected operation explicitly represents every clause. Matching one clause, shared actor, place, time, or generic owner does not extend coverage. Preserve every independent uncovered clause in continuation, and use continuation null only when none remains. Every domain_request uses goal_result pending, including a complete composite with continuation null: pending means code-owned execution, not unhandled intent. If continuation is present, goal_result must be pending and continuation.remaining_intent must preserve every independent uncovered clause. Final continuation override for direct reality_limited or make_believe: a same-sentence clause whose stated action, purpose, manner, result, or qualifier depends on the same impossible or physically limited premise is covered by the same grounding, not continuation. Preserve only clauses independently executable without that premise and every later sentence; if none remain, set continuation to null.',
            repairing
              ? 'Repair only listed validation errors and preserve unrelated semantic fields. For domain_owner_unavailable, owner absence is not evidence of impossibility or fantasy: ordinary or unspecified intent stays literal. Do not invent a physical impossibility or absent fantastical referent; use a direct semantic plan limited to visible facts and physical reality unless an exact code-owned capability is available; code still owns exact mechanics and state.'
              : 'Plan only the next executable semantic step and preserve any remaining intent.'
          ].join(' ')
        }, {
          role: 'user',
          content: JSON.stringify(payload)
        }],
        overrides: {
          temperature: 0,
          maxTokens: repairing ? 4000 : 8000
        }
      });
    } catch (error) {
      if (!repairing && error?.code === 'json_parse_failed') return {};
      throw error;
    }
    if (!response?.output || typeof response.output !== 'object'
        || Array.isArray(response.output)) {
      throw dependencyError('Turn step planner returned no JSON object.');
    }
    return assembleTurnStepPlan(response.output, request, operationChoices);
  };
}

function semanticTurnStepExample() {
  const { schema, request_id, committed_state_version, working_revision,
    step_index, ...semantic } = JSON.parse(TURN_STEP_PLAN_EXAMPLE);
  return JSON.stringify({ ...semantic, operation_choice: null });
}

function turnStepOperationChoices(request) {
  const operations = [
    ...(request.available_domain_operations ?? []),
    ...(request.player_safe_state?.local_world_process?.allowed ?? [])
  ];
  const seen = new Set();
  return operations.filter((operation) => {
    const key = JSON.stringify(operation);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((operation, index) => ({
    choice_id: `domain_operation_${index + 1}`,
    operation: structuredClone(operation)
  }));
}

export function assembleTurnStepPlan(choice, request,
  operationChoices = turnStepOperationChoices(request)) {
  const semantic = structuredClone(choice);
  const selected = operationChoices.find(({ choice_id }) =>
    choice_id === semantic.operation_choice);
  const operations = semantic.operation_choice == null
    ? structuredClone(semantic.operations)
    : selected ? [structuredClone(selected.operation)] : undefined;
  const domainRequest = semantic.resolution === 'domain_request';
  const actionProduction = Array.isArray(operations) && operations.some((operation) =>
    operation?.op === 'request_item_use'
      && operation.action_production != null);
  return {
    schema: 'turn_step_plan_v1',
    request_id: request.request_id,
    committed_state_version: request.committed_state_version,
    working_revision: request.working_revision,
    step_index: request.step_index,
    interpretation: semantic.interpretation,
    resolution: semantic.resolution,
    goal_result: domainRequest || semantic.resolution === 'generic_check'
      || semantic.resolution === 'clarification_required'
      || semantic.continuation != null
      ? 'pending'
      : semantic.goal_result,
    activity: domainRequest && !actionProduction
      ? { owner: 'domain', duration_class: null, effort: null }
      : semantic.activity,
    operations,
    check: semantic.check,
    continuation: semantic.continuation,
    clarification: semantic.clarification,
    reason_code: semantic.reason_code,
    reason: semantic.reason
  };
}
function preparedFollowupPrompt(candidates) {
  return [
    'prepared_followup_candidates is a closed code-owned mapping:',
    JSON.stringify(candidates),
    'Select a candidate only if the plan current operation matches its precursor_operation and its operation semantically covers all continuation.remaining_intent, including every later clause or sentence; if any intent remains uncovered, prepared_followup_ref is null.',
    'When selected, copy its prepared_followup_ref exactly alongside remaining_intent and depends_on_refs in the complete continuation object:',
    JSON.stringify(candidates.map(({ prepared_followup_ref }) => ({
      remaining_intent: '<copy next uncovered intent>',
      depends_on_refs: ['<copy only required player-safe refs>'],
      prepared_followup_ref
    }))),
    'This marker preserves only this exact candidate for a later current-state admission; it neither reserves nor executes it. Never invent a marker.'
  ].join(' ');
}
/** Server-only O1 role: its request is built from committed enablement data. */
export { createOrdinaryMaterializationModel } from './ordinary-materialization-llm.js';
export function createLowerDvinaTracePlayerConversationModel({
  roleRunner
} = {}) {
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
      overrides: { temperature: 0, maxTokens: 8000 }
    });
    return assemblePlayerConversationPlan(response.output, request);
  };
}

export function assemblePlayerConversationPlan(choice, request) {
  return assembleConversationPlan(choice,
    requiredPlayerConversationCandidate(request), {
      schema: 'player_conversation_contribution_plan_v1',
      request_id: request.request_id,
      conversation_id: request.conversation_id,
      state_version: request.state_version,
      speaker_ref: structuredClone(request.speaker_ref)
    });
}

export function assembleNpcConversationPlan(choice, request) {
  return assembleConversationPlan(choice,
    requiredNpcConversationCandidate(request), {
      schema: 'conversation_contribution_plan_v1',
      request_id: request.request_id,
      boundary_id: request.boundary_id,
      conversation_id: request.conversation_id,
      exchange_id: request.exchange_id,
      state_version: request.state_version,
      speaker_ref: structuredClone(request.npc_ref)
    });
}

function assembleConversationPlan(choice, requiredCandidate, envelope) {
  const semantic = structuredClone(choice);
  const bound = requiredCandidate == null
    ? semantic
    : bindKnownConversationValues(requiredCandidate, semantic);
  return { ...bound, ...envelope };
}

function bindKnownConversationValues(template, semantic) {
  if (typeof template === 'string' && template.startsWith('<')) {
    return semantic;
  }
  if (Array.isArray(template)) {
    if (template.length === 0) return [];
    return template.map((value, index) =>
      bindKnownConversationValues(value, semantic?.[index]));
  }
  if (template !== null && typeof template === 'object') {
    return Object.fromEntries(Object.entries(template).map(([key, value]) => [
      key, bindKnownConversationValues(value, semantic?.[key])
    ]));
  }
  return structuredClone(template);
}
export function createLowerDvinaTraceNpcSemanticModel({
  roleRunner
} = {}) {
  requireRoleRunner(roleRunner);
  return async function planNpcConversationResponse(request, context = {}) {
    const repair = context.repair ?? null;
    const response = await roleRunner.run({
      scope: 'turn_runtime',
      role_id: repair
        ? 'npc_conversation_responder_format_repair'
        : 'npc_conversation_responder',
      request_identity: request.request_id,
      messages: [{
        role: 'system',
        content: npcConversationInstructions(repair, request)
      }, {
        role: 'user',
        content: JSON.stringify(repair ? {
          request,
          original_output: repair.original_output,
          validation_errors: repair.validation_errors
        } : request)
      }],
      overrides: { temperature: 0, maxTokens: 8000 }
    });
    return assembleNpcConversationPlan(response.output, request);
  };
}

export function createLowerDvinaTraceNpcDecisionSelector({
  roleRunner
} = {}) {
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
      overrides: { temperature: 0, maxTokens: 800 }
    });
    if (!response?.output || typeof response.output !== 'object') {
      throw dependencyError('NPC decision selector returned no JSON object.');
    }
    return response.output;
  };
}

function requireRoleRunner(roleRunner) { if (typeof roleRunner?.run !== 'function') throw dependencyError('Configured LLM role runner is required.'); }
function dependencyError(message) { return serverError('TRACE_PHASE_2_DEPENDENCY_MISSING', message, { status: 503 }); }
