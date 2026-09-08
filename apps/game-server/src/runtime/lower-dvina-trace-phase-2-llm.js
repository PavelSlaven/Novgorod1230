import { isDeepStrictEqual } from 'node:util';
import { serverError } from '../errors.js';
import { SEMANTIC_RESOLVER_PROMPT, TURN_STEP_PLANNER_INSTRUCTIONS, TURN_STEP_PLAN_EXAMPLE, TURN_STEP_PLAN_MAPPINGS } from './lower-dvina-trace-phase-2-llm-prompts.js';
import { assembleNpcConversationPlan, assemblePlayerConversationPlan } from './lower-dvina-trace-conversation-assembly.js';
import { turnStepOperationChoices } from
  './lower-dvina-trace-turn-step-operation-choices.js';
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
    const operationChoices = turnStepOperationChoices(request, repairContext);
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
            ...(operationChoices.some((choice) => choice.player_safe_grounding
              ?.semantic_scope != null) ? [
              'When a choice has player_safe_grounding.semantic_scope, select it only when the current step matches that complete purpose and result scope; shared target words or a generic inspect verb are insufficient.'
            ] : []),
            'operation_choice is exactly one scalar supplied choice_id string or null, never an object, array, or wrapper. For a matching code-owned operation return that scalar choice_id and omit operations. The server restores the exact operation DTO. Otherwise set operation_choice to null and return only genuinely semantic operations.',
            'If an output format requires operations beside operation_choice, they must be empty or exactly copy that selected DTO; a different operation makes the choice invalid.',
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
              ? 'Repair original_output from supplied input. Re-plan only fields named by structural_errors; do not invent operations or refs. operation_choice must be a supplied choice_id string or null; replace an invalid object wrapper such as {"choice_id":"<supplied choice_id>"} with its inner supplied ID string. For one domain operation exactly equal to a supplied code-owned choice, return its choice_id without operations; preserve it when another field is invalid. If operations must accompany operation_choice, they are empty or exactly that selected DTO; otherwise set operation_choice null and preserve only matching semantic operation. For empty domain_request restore the matching supplied semantic mapping (ordinary_material_prerequisite if applicable); never substitute a broad authored operation choice with a mismatched fixed query. Otherwise use direct without operations. Repair only listed validation errors and preserve unrelated semantic fields. If the only error is $.activity.owner: action production requires semantic activity, keep domain_request and the original action_production operation. Select semantic duration_class and effort with owner: these fields depend on it. Never clear operations or switch to direct. For continuation_progress, preserve the original action order. If selected operation covers earliest owned action, keep it and remove that covered event plus any preceding ownerless ambient utterance from continuation.remaining_intent; preserve only independent actions after it. For direct no-operation observation or gesture, remove handled event and keep later independent intent; if none, return not_achieved with continuation null. Equality between continuation.remaining_intent and request.remaining_intent alone does not prove that the selected operation consumed none of the intent. Discard selected operation only when continuation contains an earlier uncovered action, then plan that earlier action through its existing semantic mapping; never return the discarded later operation in operations, with or without operation_choice. For operation_semantic_grounding, discard a choice that does not cover earliest action, plan only next action using matching supplied choice or existing semantic mapping, and preserve uncovered clauses in continuation. If earliest action has no code-owned operation but is physically possible, use direct reality_limited and keep later actions; never skip it for a later supplied choice. Omit unstated requested_duration_minutes. For material_transformation_grounding, use action_production with a semantically matching supplied item ref; preserve later unsupported purpose or effect in continuation, and never erase earlier physical change for a later missing owner. For action_production_identity_grounding, keep grounded source and rebuild identity topology: in-place modification uses preserve_source; cut, tear, or detached result uses independent_outputs; partial separation uses direct_partition plus partial_transformation, qualitative minor, half, or major extent, output physical_form, and source_fact_delta. Preserve later output uses and independent actions in continuation. Keep action_production sources bound to player-safe material descriptors; never preserve a ref whose descriptors identify another object. Without matching material item ref use ordinary_material_prerequisite. For source_semantic_grounding, sensory-only ordinary material uses ordinary_material_prerequisite. When source_semantic_grounding and source_placement_grounding are both listed, semantic grounding wins: do not move the discarded ref. For source_placement_grounding alone, replace action_production with one direct move_entity using exactly {"op":"move_entity","entity_ref":"<grounded source ref>","placement":{"relation":"<allowed relation>","target_ref":"<player-safe target ref>"}}; preserve unexecuted transformation. Never combine move_entity and action_production in one plan. For domain_owner_unavailable on request_discovery with multiple target_refs, keep exactly one visible target in this step and preserve inspection of the remaining targets plus the comparison in continuation. For other domain_owner_unavailable, remove the unavailable domain operation instead of preserving it; owner absence is not evidence of impossibility or fantasy, so ordinary or unspecified intent stays literal as direct semantic plan limited to supplied visible facts. Code owns mechanics/state; do not invent physical impossibility or absent fantastical referent.'
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
    const semanticOutput = repairing
      ? mergeRepairOutput(repairContext.original_output, response.output,
          new Set(repairContext.structural_errors
            ?.filter(({ code }) => code === 'additional_property')
            .map(({ path }) => path) ?? []))
      : response.output;
    return assembleTurnStepPlan(semanticOutput, request, operationChoices);
  };
  return model;
}

function mergeRepairOutput(original, repaired, rejectedPaths, path = '$') {
  if (!original || typeof original !== 'object' || Array.isArray(original)
      || !repaired || typeof repaired !== 'object' || Array.isArray(repaired)) {
    return repaired;
  }
  return Object.fromEntries([...new Set([
    ...Object.keys(original), ...Object.keys(repaired)
  ])].filter((key) => !rejectedPaths.has(`${path}.${key}`))
    .map((key) => [key, key in repaired
    ? mergeRepairOutput(original[key], repaired[key], rejectedPaths,
        `${path}.${key}`)
    : structuredClone(original[key])]));
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
  const mismatchedSelectedOperations = selected != null
    && Array.isArray(semantic.operations)
    && semantic.operations.length > 0
    && (semantic.operations.length !== 1
      || !isDeepStrictEqual(semantic.operations[0], selected.operation));
  const copiedExactOperation = semantic.operation_choice == null
    && semantic.operations?.some((operation) => operationChoices.some(
      (choice) => isDeepStrictEqual(operation, choice.operation)));
  const operations = bindActionProductionCarrierRefs(mismatchedSelectedOperations
    ? structuredClone(semantic.operations)
    : selected
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
    check: semantic.check ?? null,
    continuation: semantic.continuation ?? null,
    clarification: semantic.clarification ?? null,
    reason_code: semantic.reason_code,
    reason: semantic.reason,
    ...(mismatchedSelectedOperations ? {
      operation_choice: semantic.operation_choice
    } : {})
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
