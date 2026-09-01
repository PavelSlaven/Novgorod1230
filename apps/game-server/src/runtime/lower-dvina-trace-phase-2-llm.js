import { isDeepStrictEqual } from 'node:util';
import { serverError } from '../errors.js';
import { auditFreshNpcSpeech } from './lower-dvina-trace-npc-speech-grounding-audit.js';
import { auditTurnStepSourceGrounding } from './lower-dvina-trace-turn-step-grounding-audit.js';
import { SEMANTIC_RESOLVER_PROMPT, TURN_STEP_PLANNER_INSTRUCTIONS, TURN_STEP_PLAN_EXAMPLE, TURN_STEP_PLAN_MAPPINGS, npcConversationInstructions, playerConversationInstructions } from './lower-dvina-trace-phase-2-llm-prompts.js';
import { assembleNpcConversationPlan, assemblePlayerConversationPlan } from './lower-dvina-trace-conversation-assembly.js';
export { createLowerDvinaTraceNpcAutonomousModel } from './lower-dvina-trace-autonomous-llm.js';
export { createLowerDvinaTraceNpcCombatModel } from './lower-dvina-trace-combat-llm.js';
export { assembleNarrationRoleOutput, createLowerDvinaTraceNarrationService } from './lower-dvina-trace-narration-llm.js';
export { assembleNpcConversationPlan, assemblePlayerConversationPlan } from './lower-dvina-trace-conversation-assembly.js';
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
      overrides: { temperature: 0, maxTokens: 20_000 }
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
  const model = async function planTurnStep(request, repairContext = null) {
    const repairing = repairContext != null;
    const payload = repairing
      ? {
          request,
          original_output: structuredClone(repairContext.original_output ?? null),
          structural_errors:
            structuredClone(repairContext.structural_errors ?? [])
        }
      : request;
    const operationChoices = turnStepOperationChoices(request);
    const activeConversationExample = activeConversationChoiceExample(
      request, operationChoices);
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
            'Return interpretation, resolution, operation_family, semantic goal_result/activity when applicable, operation_choice or semantic operations, check, continuation, clarification, reason_code, and reason. reason is one short conclusion sentence, never analysis, alternatives, self-correction, or repeated deliberation. If you notice a mistake, emit only the corrected final JSON.',
            `A direct semantic example is:\n${semanticTurnStepExample()}`,
            `Code-owned exact operation choices are:\n${JSON.stringify(operationChoices.map(({ choice_id, operation }) => ({ choice_id, operation })))}`,
            'operation_choice is exactly one scalar supplied choice_id string or null, never an object, array, or wrapper. For a matching code-owned operation return that scalar choice_id and omit operations. The server restores the exact operation DTO. Otherwise set operation_choice to null and return only genuinely semantic operations.',
            'For movement, never emit a hand-written request_movement: select its supplied operation_choice. In particular destination_ref is not a movement field and route_ref is code-owned.',
            'operation_family is the requested code-owned operation op (for example request_movement) or null when no code-owned operation covers intent. It must agree with operation_choice; never choose a different operation merely because it is the only supplied choice.',
            'When player asks to travel to a location and a supplied request_movement reaches that location, select that movement choice. Do not substitute inspecting, discovery, or a generic activity for requested travel.',
            ...(operationChoices.length === 0 ? [] : [
              `A valid domain choice is: ${JSON.stringify({
                resolution: 'domain_request',
                operation_choice: operationChoices[0].choice_id
              })}`
            ]),
            ...(activeConversationExample == null ? [] : [activeConversationExample]),
            `Use these mappings for the matching cases; angle-bracket values mean copy from request and must never be emitted literally:\n${turnStepPlanMappings(request)}`,
            ...TURN_STEP_PLANNER_INSTRUCTIONS,
            'Do not infer a fantastical referent from player intent: it is absent unless player-safe state identifies it as a visible entity or capability.',
            'Classify interpretation.adaptation by the stated goal, not whether the actor can pantomime it. First: an absent fantastical required referent means make_believe. Otherwise: real or ordinary referents with a physically limited action mean reality_limited. Otherwise: literal. An ordinary unknown or absent referent is not thereby fantastical; preserve existing discovery/domain flow.',
            'When an operation choice covers the intent, select its choice_id; use action_production only when no supplied choice covers it.',
            ...(request.prepared_followup_candidates?.length ? [
              preparedFollowupPrompt(request.prepared_followup_candidates)
            ] : []),
            'Plan exactly one executable step. Sentence boundary is a continuation boundary. Plan only the first independently executable sentence. If request.remaining_intent has later non-empty sentences, always preserve all of them in continuation, use goal_result pending, and never let one selected operation consume them. Only clauses inside the same sentence may form one composite operation, and only when that operation explicitly represents their single event. One selected domain operation covers only its own grounded event; it may cover multiple verbs only when the selected operation explicitly represents every clause. Matching one clause, shared actor, place, time, or generic owner does not extend coverage. Preserve every independent uncovered clause in continuation, and use continuation null only when none remains. Every domain_request uses goal_result pending, including a complete composite with continuation null: pending means code-owned execution, not unhandled intent. If continuation is present, goal_result must be pending and continuation.remaining_intent must preserve every independent uncovered clause. Final continuation override for direct reality_limited or make_believe: a same-sentence clause whose stated action, purpose, manner, result, or qualifier depends on the same impossible or physically limited premise is covered by the same grounding, not continuation. Preserve only clauses independently executable without that premise and every later sentence; if none remain, set continuation to null.',
            repairing
              ? 'Repair original_output using only supplied request and exact code-owned choices. Do not re-plan or invent operations or refs. operation_choice must be one scalar supplied choice_id string or null; replace an invalid object wrapper such as {"choice_id":"<supplied choice_id>"} with its inner supplied ID string. operation_family must equal selected operation op, or null with operation_choice null. If no supplied choice matches, use a valid direct semantic plan with no operation. Repair only listed validation errors and preserve unrelated semantic fields. For source_semantic_grounding, discard the unsupported source and use ordinary_material_prerequisite when the named ordinary material is sensory-only. For source_placement_grounding, replace action production with one direct move_entity for the already selected source, and preserve every still-unexecuted transformation clause in continuation; do not combine move_entity and action production in one step. For domain_owner_unavailable, owner absence is not evidence of impossibility or fantasy: ordinary or unspecified intent stays literal. Do not invent a physical impossibility or absent fantastical referent; use a direct semantic plan limited to visible facts and physical reality unless an exact code-owned capability is available; code still owns exact mechanics and state.'
              : 'Plan only the next executable semantic step and preserve any remaining intent.',
          ].join(' ')
        }, {
          role: 'user',
          content: JSON.stringify(payload)
        }],
        overrides: {
          temperature: 0,
          maxTokens: 20_000
        }
      });
    } catch (error) {
      if (!repairing && error?.code === 'json_parse_failed') {
        return model(request, { original_output: null,
          structural_errors: [{ path: '$', code: 'json_parse_failed',
            message: 'Planner response was not valid JSON.' }] });
      }
      throw error;
    }
    if (!response?.output || typeof response.output !== 'object'
        || Array.isArray(response.output)) {
      throw dependencyError('Turn step planner returned no JSON object.');
    }
    return assembleTurnStepPlan(preserveGroundingPrerequisiteIntent({
      output: response.output, request, repairContext
    }), request, operationChoices);
  };
  model.validateSourceGrounding = (plan, request) =>
    auditTurnStepSourceGrounding({ roleRunner, plan, request });
  return model;
}

function preserveGroundingPrerequisiteIntent({ output, request,
  repairContext }) {
  const groundingRepair = repairContext?.structural_errors?.some(
    ({ code }) => code === 'source_semantic_grounding');
  const discovery = output?.resolution === 'domain_request'
    && output?.operations?.length === 1
    && output.operations[0]?.op === 'request_discovery';
  if (!groundingRepair || !discovery) return output;
  const grounded = structuredClone(output);
  grounded.interpretation = { ...grounded.interpretation,
    grounded_attempt: 'Осмотрен доступный обычный материал.' };
  return { ...grounded, continuation: {
    remaining_intent: request.remaining_intent,
    depends_on_refs: []
  } };
}

function semanticTurnStepExample() {
  const { schema, request_id, committed_state_version, working_revision,
    step_index, ...semantic } = JSON.parse(TURN_STEP_PLAN_EXAMPLE);
  return JSON.stringify({ ...semantic, operation_choice: null });
}

function turnStepPlanMappings(request) {
  const mappings = JSON.parse(TURN_STEP_PLAN_MAPPINGS);
  if (request.player_safe_state?.ordinary_resolution
      ?.scene_seed_available === true) delete mappings.visible_general_look;
  else delete mappings.ordinary_scene_seed;
  return JSON.stringify(mappings);
}

function turnStepOperationChoices(request) {
  const operations = [
    ...(request.available_domain_operations ?? []),
    ...(request.player_safe_state?.local_world_process?.allowed ?? [])
  ];
  const seen = new Set();
  const unique = operations.filter((operation) => {
    const key = JSON.stringify(operation);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return unique.map((operation, index) => ({
    choice_id: operationChoiceId(operation, index, unique),
    operation: structuredClone(operation)
  }));
}
function operationChoiceId(operation,index,operations){const qualifier=operationQualifier(operation);const collision=operations.filter((candidate)=>candidate.op===operation.op&&operationQualifier(candidate)===qualifier).length>1;return['domain_operation',index+1,operation.op,qualifier,collision?semanticChoiceLabel(operation.description):null].filter((part)=>part!=null).join('_');}
function operationQualifier(operation){return operation.process_action??operation.discovery_kind??operation.access_kind??operation.movement_kind??operation.use_kind??operation.activity_kind??operation.interaction_kind;}
function semanticChoiceLabel(value){const label=typeof value==='string'?value.normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/[^\p{L}\p{N}]+/gu,'_').replace(/^_+|_+$/gu,''):'';return label||'variant';}
function activeConversationChoiceExample(request, choices) {
  const interlocutorId = request.player_safe_state?.active_interlocutor
    ?.entity_ref?.entity_id;
  const interaction = choices.find(({ operation }) => operation?.op === 'emit_interaction'
    && Array.isArray(operation.target_actor_refs)
    && operation.target_actor_refs.length === 1
    && operation.target_actor_refs[0] === interlocutorId
    && ['speech', 'request'].includes(operation.interaction_kind)
    && Array.isArray(operation.instrument_refs)
    && operation.instrument_refs.length === 0);
  if (interaction == null) return null;
  return `Active conversation contrast: ${JSON.stringify({ resolution: 'domain_request', operation_choice: interaction.choice_id })} is the required choice for a conversational question addressed to the active interlocutor, even when it asks where or how to find a place, object, or fact; that answer topic does not make it request_discovery. Conversely, an independent player intent to personally inspect, search, listen, remember, or dig for detail uses a matching supplied request_discovery.`;
}

export function assembleTurnStepPlan(choice, request,
  operationChoices = turnStepOperationChoices(request)) {
  const semantic = structuredClone(choice);
  const selected = selectedTurnStepOperation(semantic, operationChoices);
  const copiedChoice = semantic.operation_choice == null
    && semantic.operations?.some((raw) => operationChoices.some(
      ({ operation }) => isDeepStrictEqual(raw, operation)));
  const operations = bindActionProductionCarrierRefs(selected
    ? [structuredClone(selected.operation)]
    : semantic.operation_choice == null && !copiedChoice
      ? structuredClone(semantic.operations) : undefined);
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

function bindActionProductionCarrierRefs(operations) {
  if (!Array.isArray(operations)) return operations;
  return operations.map((operation) => {
    const production = operation?.op === 'request_item_use'
      ? operation.action_production : null;
    if (!Array.isArray(production?.source_refs)
        || production.source_refs.length === 0
        || !Array.isArray(production.tool_refs)) return operation;
    return { ...operation, item_ref: production.source_refs[0],
      target_refs: [...production.source_refs.slice(1),
        ...production.tool_refs] };
  });
}
function selectedTurnStepOperation(choice, operationChoices) {
  const selected = operationChoices.find(({ choice_id }) =>
    choice_id === choice.operation_choice);
  return selected != null && (choice.operation_family == null
      || choice.operation_family === selected.operation.op)
    ? selected : undefined;
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
      overrides: { temperature: 0, maxTokens: 20_000 }
    });
    return assemblePlayerConversationPlan(response.output, request);
  };
}

export function createLowerDvinaTraceNpcSemanticModel({
  roleRunner
} = {}) {
  requireRoleRunner(roleRunner);
  const model = async function planNpcConversationResponse(request, context = {}) {
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
      overrides: { temperature: 0, maxTokens: 20_000 }
    });
    return assembleNpcConversationPlan(response.output, request);
  };
  model.validateFreshPlan = (plan, request) => auditFreshNpcSpeech({
    roleRunner, plan, request
  });
  return model;
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
      overrides: { temperature: 0, maxTokens: 20_000 }
    });
    if (!response?.output || typeof response.output !== 'object') {
      throw dependencyError('NPC decision selector returned no JSON object.');
    }
    return response.output;
  };
}

function requireRoleRunner(roleRunner) { if (typeof roleRunner?.run !== 'function') throw dependencyError('Configured LLM role runner is required.'); }
function dependencyError(message) { return serverError('TRACE_PHASE_2_DEPENDENCY_MISSING', message, { status: 503 }); }
