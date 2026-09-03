import { isDeepStrictEqual } from 'node:util';
import { serverError } from '../errors.js';
import { SEMANTIC_RESOLVER_PROMPT, TURN_STEP_PLANNER_INSTRUCTIONS, TURN_STEP_PLAN_EXAMPLE, TURN_STEP_PLAN_MAPPINGS } from './lower-dvina-trace-phase-2-llm-prompts.js';
import { assembleNpcConversationPlan, assemblePlayerConversationPlan } from './lower-dvina-trace-conversation-assembly.js';
import { groundTurnRequest, wkClosure } from './world-knowledge-grounding.js';
export { createLowerDvinaTraceNpcAutonomousModel } from './lower-dvina-trace-autonomous-llm.js';
export { createLowerDvinaTraceNpcCombatModel } from './lower-dvina-trace-combat-llm.js';
export { assembleNarrationRoleOutput, createLowerDvinaTraceNarrationService } from './lower-dvina-trace-narration-llm.js';
export { assembleNpcConversationPlan, assemblePlayerConversationPlan } from './lower-dvina-trace-conversation-assembly.js';
export {
  createLowerDvinaTraceNpcDecisionSelector,
  createLowerDvinaTraceNpcSemanticModel,
  createLowerDvinaTracePlayerConversationModel
} from './lower-dvina-trace-conversation-llm.js';
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
export function createLowerDvinaTraceTurnStepModel({ roleRunner,
  worldKnowledgeGrounder = null } = {}) {
  requireRoleRunner(roleRunner);
  const model = async function planTurnStep(request, repairContext = null) {
    const input = await groundTurnRequest(worldKnowledgeGrounder, request);
    const repairing = repairContext != null;
    const payload = repairing
      ? {
          request: input,
          original_output: structuredClone(repairContext.original_output ?? null),
          structural_errors:
            structuredClone(repairContext.structural_errors ?? [])
        }
      : input;
    const operationChoices = turnStepOperationChoices(request);
    const activeConversationExample = activeConversationChoiceExample(
      request, operationChoices);
    const visibleConversationExamples = visibleConversationChoiceExamples(
      request, operationChoices);
    const response = await roleRunner.run({
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
            'Do not return schema, request_id, committed_state_version, working_revision, step_index, goal_result pending, or code-owned domain activity; the server assembles them. semantic activity may add requested_duration_minutes only for an exact duration explicitly stated by the player.',
            'Return interpretation, resolution, operation_family, semantic goal_result/activity when applicable, operation_choice or semantic operations, check, continuation, clarification, reason_code, and reason. reason is one short conclusion sentence, never analysis, alternatives, self-correction, or repeated deliberation. If you notice a mistake, emit only the corrected final JSON.',
            `A direct semantic example is:\n${semanticTurnStepExample()}`,
            `Code-owned exact operation choices are:\n${JSON.stringify(operationChoices)}`,
            'operation_choice is exactly one scalar supplied choice_id string or null, never an object, array, or wrapper. For a matching code-owned operation return that scalar choice_id and omit operations. The server restores the exact operation DTO. Otherwise set operation_choice to null and return only genuinely semantic operations.',
            'For movement, never emit a hand-written request_movement: select its supplied operation_choice. In particular destination_ref is not a movement field and route_ref is code-owned.',
            'operation_family is the requested code-owned operation op (for example request_movement) or null when no code-owned operation covers intent. It must agree with operation_choice; never choose a different operation merely because it is the only supplied choice.',
            'Only when travel is the current earliest independently executable action, if a supplied request_movement reaches its location, select that movement choice. A later travel clause never outranks an earlier manipulation or other feasible action. Do not substitute inspecting, discovery, or a generic activity for current travel.',
            ...(operationChoices.length === 0 ? [] : [
              `A valid domain choice is: ${JSON.stringify({
                resolution: 'domain_request',
                operation_choice: operationChoices[0].choice_id
              })}`
            ]),
            ...(activeConversationExample == null ? [] : [activeConversationExample]),
            'Any explicitly grounded visible addressee overrides a different active interlocutor. If one speech action addresses several visible actors but no joint choice is supplied, select the first addressed actor with a matching choice and preserve the request to every other addressee in continuation.',
            ...visibleConversationExamples,
            `Use these mappings for the matching cases; angle-bracket values mean copy from request and must never be emitted literally:\n${turnStepPlanMappings(request)}`,
            ...TURN_STEP_PLANNER_INSTRUCTIONS,
            ...wkClosure(input),
            'Do not infer a fantastical referent from player intent: it is absent unless player-safe state identifies it as a visible entity or capability.',
            'Classify interpretation.adaptation by the stated goal, not whether the actor can pantomime it. First: an absent fantastical required referent means make_believe. Otherwise: real or ordinary referents with a physically limited action mean reality_limited. Otherwise: literal. An ordinary unknown or absent referent is not thereby fantastical; preserve existing discovery/domain flow.',
            'Process independent actions in their stated order. A supplied operation choice for a later action never outranks an earlier feasible action. Plan the earlier action through its existing semantic mapping and preserve every later action in continuation. When an operation choice covers the intent\'s current earliest action, select its choice_id; use action_production only when no supplied choice covers that earliest action.',
            ...(request.prepared_followup_candidates?.length ? [
              preparedFollowupPrompt(request.prepared_followup_candidates)
            ] : []),
            'Plan exactly one executable step. Sentence boundary is a continuation boundary. Plan only the first independently executable sentence. If request.remaining_intent has later non-empty sentences, always preserve all of them in continuation, use goal_result pending, and never let one selected operation consume them. Only clauses inside the same sentence may form one composite operation, and only when that operation explicitly represents their single event. One selected domain operation covers only its own grounded event; it may cover multiple verbs only when the selected operation explicitly represents every clause. Matching one clause, shared actor, place, time, or generic owner does not extend coverage. Preserve every independent uncovered clause in continuation, and use continuation null only when none remains. Every domain_request uses goal_result pending, including a complete composite with continuation null: pending means code-owned execution, not unhandled intent. If continuation is present, goal_result must be pending and continuation.remaining_intent must preserve every independent uncovered clause. Final continuation override for direct reality_limited or make_believe: a same-sentence clause whose stated action, purpose, manner, result, or qualifier depends on the same impossible or physically limited premise is covered by the same grounding, not continuation. Preserve only clauses independently executable without that premise and every later sentence; if none remain, set continuation to null.',
            repairing
              ? 'Repair original_output using only supplied request and exact code-owned choices. Re-plan only fields named by structural_errors; do not invent operations or refs. operation_choice must be one scalar supplied choice_id string or null; replace an invalid object wrapper such as {"choice_id":"<supplied choice_id>"} with its inner supplied ID string. When original_output contains one domain operation exactly equal to a supplied code-owned choice, preserve it by returning that supplied choice_id and omitting operations, even when the listed error is in another field. operation_family must equal selected operation op, or null with operation_choice null. If an empty domain_request caused the error, restore the matching supplied semantic mapping, including ordinary_material_prerequisite when applicable; never substitute a broad authored operation choice whose fixed query does not match the attempted action. If no supplied choice or semantic mapping matches, use a valid direct semantic plan with no operation. Repair only listed validation errors and preserve unrelated semantic fields. For continuation_progress, preserve the original action order. If the selected operation covers the current earliest owned action, keep it and remove that covered event plus any preceding ownerless ambient utterance from continuation.remaining_intent; preserve only independent actions after it. For a direct no-operation observation or gesture, remove the event that direct step actually handles and keep only later independent intent; if it handles nothing, return not_achieved with continuation null instead of repeating the whole request. Equality between continuation.remaining_intent and request.remaining_intent alone does not prove that the selected operation consumed none of the intent. Discard a selected operation only when continuation contains an earlier uncovered action, then plan that earlier action through its existing semantic mapping; never return the discarded later operation in operations, with or without operation_choice. For operation_semantic_grounding, follow the error message: discard a choice that does not cover the earliest action, plan only that actual next action using an actually matching supplied choice or existing semantic mapping, and preserve every uncovered clause in continuation. If that earliest action has no code-owned operation but is a physically possible attempt, use a direct reality_limited attempt and keep later actions in continuation; never skip it in favor of a later supplied choice. For duration_semantic_grounding, copy requested_duration_minutes only when the request explicitly states that exact duration; otherwise omit it without changing unrelated activity fields. For material_transformation_grounding, plan the earliest feasible transformation through action_production using only a semantically matching supplied item ref, and preserve every later unsupported purpose or effect in continuation; a missing owner for the later effect never erases the earlier physical change. For action_production_identity_grounding, keep the grounded source but rebuild the physical identity topology: an in-place modification uses preserve_source; a cut, tear, or other detached result uses independent_outputs, and a partial one-source separation uses direct_partition plus partial_transformation, a qualitative minor, half, or major extent, output physical_form, and source_fact_delta. Preserve every later use of the new result and every later independent action in continuation so a subsequent step can ground the committed output ref. Every retained action_production must still bind each source to the material named by its own player-safe descriptors; never preserve a ref whose descriptors identify another object. If the named ordinary material has no matching item ref, use ordinary_material_prerequisite. For source_semantic_grounding, discard the unsupported source and use ordinary_material_prerequisite when the named ordinary material is sensory-only. When source_semantic_grounding and source_placement_grounding are both listed, semantic grounding wins: do not move the discarded ref. For source_placement_grounding alone, replace the current action_production with one direct move_entity using exactly {"op":"move_entity","entity_ref":"<grounded source ref>","placement":{"relation":"<allowed relation>","target_ref":"<player-safe target ref>"}} and preserve only the still-unexecuted transformation in continuation. Never combine move_entity and action_production in one plan. For domain_owner_unavailable, remove the unavailable domain operation instead of preserving it; owner absence is not evidence of impossibility or fantasy, so ordinary or unspecified intent stays literal as a direct semantic plan limited to supplied visible facts. Do not invent a physical impossibility or absent fantastical referent; code still owns exact mechanics and state.'
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
    if (!response?.output || typeof response.output !== 'object'
        || Array.isArray(response.output)) {
      throw dependencyError('Turn step planner returned no JSON object.');
    }
    return assembleTurnStepPlan(response.output, request, operationChoices);
  };
  return model;
}

function semanticTurnStepExample() {
  const { schema, request_id, committed_state_version, working_revision,
    step_index, ...semantic } = JSON.parse(TURN_STEP_PLAN_EXAMPLE);
  return JSON.stringify({ ...semantic, operation_choice: null });
}

function turnStepPlanMappings(request) {
  const mappings = JSON.parse(TURN_STEP_PLAN_MAPPINGS);
  if (request.player_safe_state?.ordinary_resolution
      ?.discovery_available !== true) {
    delete mappings.focused_ordinary_discovery;
    delete mappings.ordinary_material_prerequisite;
  }
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
    operation: structuredClone(operation),
    ...operationChoiceGrounding(operation, request)
  }));
}
function operationChoiceGrounding(operation, request) {
  if (operation?.op !== 'emit_interaction'
      || operation.target_actor_refs?.length !== 1) return {};
  const target = request.player_safe_state?.current_visible_context
    ?.visible_npc?.find(({ entity_ref: reference }) =>
      reference?.entity_kind === 'npc'
        && reference.entity_id === operation.target_actor_refs[0]);
  return target == null ? {} : {
    player_safe_grounding: { target_actor: structuredClone(target) }
  };
}
function operationChoiceId(operation,index,operations){const qualifier=operationQualifier(operation);const collision=operations.filter((candidate)=>candidate.op===operation.op&&operationQualifier(candidate)===qualifier).length>1;return['domain_operation',index+1,operation.op,qualifier,collision?semanticChoiceLabel(operation.description):null].filter((part)=>part!=null).join('_');}
function operationQualifier(operation){return operation.process_action??operation.discovery_kind??operation.access_kind??operation.movement_kind??operation.use_kind??operation.activity_kind??operation.interaction_kind;}
function semanticChoiceLabel(value){const label=typeof value==='string'?value.normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/[^\p{L}\p{N}]+/gu,'_').replace(/^_+|_+$/gu,''):'';return label||'variant';}
function activeConversationChoiceExample(request, choices) {
  const interlocutorId = request.player_safe_state?.active_interlocutor
    ?.entity_ref?.entity_id;
  const interactions = choices.filter(({ operation }) => operation?.op === 'emit_interaction'
    && Array.isArray(operation.target_actor_refs)
    && operation.target_actor_refs.length === 1
    && operation.target_actor_refs[0] === interlocutorId
    && ['speech', 'request'].includes(operation.interaction_kind)
    && Array.isArray(operation.instrument_refs)
    && operation.instrument_refs.length === 0);
  const interaction = interactions.find(({ operation }) =>
    operation.interaction_kind === 'request') ?? interactions[0];
  if (interaction == null) return null;
  return `Active conversation contrast: ${JSON.stringify({ resolution: 'domain_request', operation_choice: interaction.choice_id })} is the required choice when the current earliest owned boundary is speech or a request addressed to the active interlocutor. This includes asking that person to permit, oppose, or help with a physical intervention for which no physical domain operation is supplied; the interaction owner decides the response and does not confirm the intervention. Preserve every later independent action in continuation. A question remains conversation even when it asks where or how to find a place, object, or fact; that answer topic does not make it request_discovery. Conversely, an independent player intent to personally inspect, search, listen, remember, or dig for detail uses a matching supplied request_discovery.`;
}

function visibleConversationChoiceExamples(request, choices) {
  const visible = request.player_safe_state?.current_visible_context
    ?.visible_npc ?? [];
  return visible.flatMap(({ entity_ref: ref, display_label: label }) => {
    if (ref?.entity_kind !== 'npc' || typeof ref.entity_id !== 'string'
        || typeof label !== 'string' || !label.trim()) return [];
    const matches = choices.filter(({ operation }) =>
      operation?.op === 'emit_interaction'
      && Array.isArray(operation.target_actor_refs)
      && operation.target_actor_refs.length === 1
      && operation.target_actor_refs[0] === ref.entity_id
      && Array.isArray(operation.instrument_refs)
      && operation.instrument_refs.length === 0);
    if (matches.length === 0) return [];
    return [`Visible conversation routing for ${JSON.stringify(label)}: choose exactly one matching supplied choice from ${JSON.stringify(matches.map(({ choice_id: operation_choice, operation }) => ({ interaction_kind: operation.interaction_kind, operation_choice })))}. Each choice's player_safe_grounding places this label and its observable cues beside the opaque target ref; use those cues to resolve natural descriptions of the addressee. Use speech for a statement, request when asking the person to answer, act, permit, oppose, or help, and offer for a proposed exchange. The supplied operation content is a capability label, not the utterance and not a phrase restriction; the raw player text remains the utterance and semantic input. A momentary look at that already visible person leading into speech is contextual and MUST select this conversation before visible_general_look, including first/then wording; a genuine earlier search, manipulation, movement, or other action with its own supplied owner still executes first. An unsupported physical intervention does not become a direct failure merely because no physical operation is supplied when the text also reaches a visible person whose response is the next owned boundary. A proposal to perform that intervention followed by a direct address, imperative, or request for this person to help is one interaction boundary, not an earlier completed physical attempt plus optional speech. Never reason that the addressed request is not a separate action: select the matching interaction and let its owner decide the response. A player-safe role or name established by current visible context or committed conversation history can identify this actor even when the words differ from display_label; that grounded address overrides another active interlocutor. When visible_scene introduces one unnamed person by position or relation and the player repeats that description, bind it to the corresponding generic visible label, never to a separately named person who also happens to be present. Do not use these choices for another NPC or invent a completed physical result.`];
  });
}

export function assembleTurnStepPlan(choice, request,
  operationChoices = turnStepOperationChoices(request)) {
  const semantic = structuredClone(choice);
  const selected = selectedTurnStepOperation(semantic, operationChoices);
  const copiedExactOperation = semantic.operation_choice == null
    && semantic.operations?.some((operation) => operationChoices.some(
      (choice) => isDeepStrictEqual(operation, choice.operation)));
  const operations = bindActionProductionCarrierRefs(selected
    ? [structuredClone(selected.operation)]
    : semantic.operation_choice == null && !copiedExactOperation
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
function requireRoleRunner(roleRunner) { if (typeof roleRunner?.run !== 'function') throw dependencyError('Configured LLM role runner is required.'); }
function dependencyError(message) { return serverError('TRACE_PHASE_2_DEPENDENCY_MISSING', message, { status: 503 }); }
