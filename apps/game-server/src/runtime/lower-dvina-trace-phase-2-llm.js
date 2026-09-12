import { isDeepStrictEqual } from 'node:util';
import { serverError } from '../errors.js';
import { SEMANTIC_RESOLVER_PROMPT, TURN_STEP_PLANNER_INSTRUCTIONS,
  TURN_STEP_COMPOUND_EXAMPLE } from './lower-dvina-trace-phase-2-llm-prompts.js';
import { observedEvidencePrompts } from
  './lower-dvina-trace-phase-2-turn-step-perception-prompt.js';
import { turnStepPlanMappings } from
  './lower-dvina-trace-turn-step-plan-mappings.js';
import { assembleNpcConversationPlan, assemblePlayerConversationPlan } from './lower-dvina-trace-conversation-assembly.js';
import { turnStepOperationChoices } from
  './lower-dvina-trace-turn-step-operation-choices.js';
import { assembleTurnStepPlan } from
  './lower-dvina-trace-turn-step-plan-assembly.js';
export { assembleTurnStepPlan } from
  './lower-dvina-trace-turn-step-plan-assembly.js';
import { turnStepRepairSpecificInstructions } from './lower-dvina-trace-turn-step-repair-prompt.js';
import { activeConversationChoiceExample, preparedFollowupPrompt,
  semanticTurnStepExample, visibleConversationChoiceExamples } from
  './lower-dvina-trace-turn-step-planner-prompt.js';
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
    const wireInput = plannerRequestWire(input);
    const repairing = repairContext != null;
    const payload = repairing
      ? {
          request: wireInput,
          original_output: structuredClone(repairContext.original_output ?? null),
          structural_errors:
            structuredClone(repairContext.structural_errors ?? [])
        }
      : wireInput;
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
            'Do not return schema, request_id, committed_state_version, working_revision, or step_index; the server assembles these identity fields. Use the matching semantic activity; determine goal_result and continuation from the entire remaining intent, not example defaults. semantic activity may add requested_duration_minutes only for an exact duration explicitly stated by the player.',
            'Return interpretation, resolution, activity, goal_result, direct_result_kind, assessment only for a supported player_safe_observation, utterance only for player_utterance, operation_family, operation_choice or operations, check, continuation, clarification, reason_code, reason. assessment has exactly text and support_refs; copy every support ref from world_knowledge facts or hard_constraints. For player_utterance include structured delivery: loudness 1 whisper, 2 normal, 3 raised, 4 shout; duration_class instant, brief, or sustained. No analysis or alternatives; if mistaken, emit corrected final JSON.',
            `A direct semantic example is:\n${semanticTurnStepExample()}`,
            'operation_choice is exactly one scalar supplied choice_id string or null, never an object, array, or wrapper. For a matching code-owned operation return that scalar choice_id and omit operations. The server restores the exact operation DTO. Otherwise set operation_choice to null and return only genuinely semantic operations.',
            'If an output format requires operations beside operation_choice, they must be empty or exactly copy that selected DTO; a different operation makes the choice invalid.',
            'For movement, never emit a hand-written request_movement: select its supplied operation_choice. In particular destination_ref is not a movement field and route_ref is code-owned.',
            'operation_family is the requested code-owned operation op (for example request_movement) or null when no code-owned operation covers intent. It must agree with operation_choice; never choose a different operation merely because it is the only supplied choice.',
            'Only when travel is the current earliest independently executable action, if a supplied request_movement reaches its location, select that movement choice. A later travel clause never outranks an earlier manipulation or other feasible action. Do not substitute inspecting, discovery, or a generic activity for current travel.',
            'Any explicitly grounded visible addressee overrides a different active interlocutor. If one speech action addresses several visible actors but no joint choice is supplied, select the first addressed actor with a matching choice and preserve the request to every other addressee in continuation.',
            'Mapping names below are reference labels outside JSON, never output keys, operation op values or operation_family values. Put the selected mapping fields at the top level of your single semantic object. Fill goal_result and continuation from the whole request: independent later intent stays pending with its exact unexecuted suffix, including its connective. Examples describe structure, not a closed vocabulary of player actions. Angle-bracket values mean copy from request, never emit them literally.',
            TURN_STEP_COMPOUND_EXAMPLE,
            ...TURN_STEP_PLANNER_INSTRUCTIONS,
            'Do not infer a fantastical referent from player intent: it is absent unless player-safe state identifies it as a visible entity or capability.',
            'Classify interpretation.adaptation by the stated goal, not whether the actor can pantomime it. First: an absent fantastical required referent means make_believe. Otherwise: real or ordinary referents with a physically limited action mean reality_limited. Otherwise: literal. An ordinary unknown or absent referent is not thereby fantastical; preserve existing discovery/domain flow.',
            'Process independent actions in their stated order. A supplied operation choice for a later action never outranks an earlier feasible action. Plan the earlier action through its existing semantic mapping and preserve every later action in continuation. When an operation choice covers the intent\'s current earliest action, select its choice_id; use action_production only when no supplied choice covers that earliest action.',
            'Adjacent current-scene looking, listening, smelling, or other player-safe perception clauses that require no code-owned operation and no check may form one direct player_safe_observation step. Speech is never perception: a call, shout, or spoken words cannot be covered by player_safe_observation and remain an independently consequential player_utterance continuation when they follow perception. Preserve later movement, manipulation, and other independently consequential actions too. A purpose, hope, manner, or expected-result clause belongs to the action it qualifies and is not a separate executable continuation.',
            'QUALITATIVE ASSESSMENT OVERRIDE: assessing, judging, comparing, or trying to understand whether already supplied sensory facts support a conclusion is one direct achieved player_safe_observation, not a discovery plus continuation. An introductory evidence phrase and its question form one assessment. A sensory detail remains supplied even without an entity ref; never substitute an unrelated carried item ref. When world_knowledge facts or hard_constraints support a useful conclusion, include assessment exactly as {"text":"<concise player-safe conclusion>","support_refs":["<exact supporting claim_ref>"]}. Answer the stated comparison or question rather than repeating a generic premise: apply the cited relationship only to named features already supplied by the current scene, while preserving any remaining uncertainty. A supported result may be that the visible evidence is insufficient because a supplied claim makes the answer depend on unmeasured conditions; do not invent a separate inspection unless the player actually asks to inspect a new condition or object. Qualify what remains unknown; world knowledge never proves current quantity, presence, condition, access, or an exact mechanical outcome. Never include assessment from model memory, reason, gaps, disputes, or unsupported refs.',
            'Select direct player_utterance only when speech is the current earliest independently executable action. A genuine look, listen, search, movement, manipulation, or other action stated before speech executes first, even in the same sentence; preserve the later utterance and every following action in continuation.',
            'Plan exactly one executable step. Sentence boundary is a continuation boundary. Plan only the first independently executable sentence. If request.remaining_intent has later non-empty sentences, always preserve all of them in continuation, use goal_result pending, and never let one selected operation consume them. Only clauses inside the same sentence may form one composite operation, and only when that operation explicitly represents their single event. One selected domain operation covers only its own grounded event; it may cover multiple verbs only when the selected operation explicitly represents every clause. Matching one clause, shared actor, place, time, or generic owner does not extend coverage. Preserve every independent uncovered clause in continuation, and use continuation null only when none remains. Every domain_request uses goal_result pending, including a complete composite with continuation null: pending means code-owned execution, not unhandled intent. If continuation is present, goal_result must be pending and continuation.remaining_intent must preserve every independent uncovered clause. Final continuation override for direct reality_limited or make_believe: a same-sentence clause whose stated action, purpose, manner, result, or qualifier depends on the same impossible or physically limited premise is covered by the same grounding, not continuation. Preserve only clauses independently executable without that premise and every later sentence; if none remain, set continuation to null.',
            'An observation possible only from an impossible height is dependent on that same impossible premise, so it is covered by the reality-limited step and is not a continuation.',
            'Before returning, enforce semantic consistency: anything your reason says is covered by the current reality-limited grounding must not also appear in continuation. If no independently executable intent remains, set continuation to null and goal_result to not_achieved.',
            'Request-specific choices and constraints follow:',
            `Code-owned exact operation choices are:\n${JSON.stringify(operationChoices)}`,
            ...(operationChoices.some((choice) => choice.player_safe_grounding
              ?.semantic_scope != null) ? [
              'When a choice has player_safe_grounding.semantic_scope, select it only when the current step matches that complete purpose and result scope; shared target words or a generic inspect verb are insufficient.'
            ] : []),
            ...(operationChoices.length === 0 ? [] : [
              `A valid domain choice is: ${JSON.stringify({
                resolution: 'domain_request',
                operation_choice: operationChoices[0].choice_id
              })}`
            ]),
            ...(activeConversationExample == null ? [] : [activeConversationExample]),
            ...visibleConversationExamples,
            ...Object.entries(JSON.parse(turnStepPlanMappings(request))).map(([label, mapping]) =>
              `\nMapping: ${label}\n${JSON.stringify(mapping)}\n`),
            ...observedEvidencePrompts(request, repairing),
            ...wkClosure(input),
            ...(request.prepared_followup_candidates?.length ? [
              preparedFollowupPrompt(request.prepared_followup_candidates)
            ] : []),
            repairing
              ? 'Repair original_output from supplied input. Re-plan fields named by structural_errors and their causally dependent fields; use supplied semantic mappings and existing refs, never invent refs. If operations must accompany operation_choice, they are empty or exactly that selected DTO; otherwise set operation_choice null and preserve only matching semantic operation. For empty domain_request restore the matching supplied semantic mapping (ordinary_material_prerequisite if applicable); never substitute a broad authored operation choice with a mismatched fixed query. Use direct without operations only when the current intent lawfully resolves directly; a missing ordinary material ref is a discovery prerequisite, not a missing-operation refusal. Repair the listed errors and their dependent causal fields; preserve unrelated intent. If the only error is $.activity.owner: action production requires semantic activity, keep domain_request and the original action_production operation. Select semantic duration_class and effort with owner: these fields depend on it. Never clear operations or switch to direct. For continuation_progress, preserve the original action order. If selected operation covers earliest owned action, keep it and remove only that covered event from continuation.remaining_intent; preserve independent uncovered actions. Never drop an earlier uncommitted utterance: plan explicit ownerless words first as direct player_utterance with exact utterance text and current speaker, then preserve later actions. If operation_semantic_grounding points to $.utterance because speech occurs after an unexecuted earlier action, discard the speech step, plan that earlier action through its matching supplied mapping, and preserve the utterance plus all later intent in continuation. An authored discovery with unchanged continuation cannot be repaired by deleting unrelated intent: verify that its semantic scope answers the requested question first. For direct no-operation observation or gesture, remove handled event and keep later independent intent; if none, return not_achieved with continuation null. Equality between continuation.remaining_intent and request.remaining_intent alone does not prove that the selected operation consumed none of the intent. Discard selected operation only when continuation contains an earlier uncovered action, then plan that earlier action through its existing semantic mapping; never return the discarded later operation in operations, with or without operation_choice. For operation_semantic_grounding at $.resolution on a literal direct denial, use ordinary_material_prerequisite, preserve literal adaptation and the complete original physical intent in continuation. For operation_semantic_grounding on operations, discard a choice that does not cover earliest action, plan only next action using matching supplied choice or existing semantic mapping, and preserve uncovered clauses in continuation. If earliest action requires an ordinary material prerequisite and eligible ordinary discovery is available, use ordinary_material_prerequisite first and preserve the intended transformation in continuation. Otherwise, if earliest action has no code-owned operation but is physically possible, use direct reality_limited and keep later actions; never skip it for a later supplied choice. Omit unstated requested_duration_minutes. For material_transformation_grounding, use action_production with a semantically matching supplied item ref; preserve later unsupported purpose or effect in continuation, and never erase earlier physical change for a later missing owner. For action_production_identity_grounding, keep grounded source and rebuild identity topology: in-place modification uses preserve_source; cut, tear, or detached result uses independent_outputs; partial separation uses direct_partition plus partial_transformation, qualitative minor, half, or major extent, output physical_form, and source_fact_delta. Preserve later output uses and independent actions in continuation. Keep action_production sources bound to player-safe material descriptors; never preserve a ref whose descriptors identify another object. Without matching material item ref use ordinary_material_prerequisite. For source_semantic_grounding, sensory-only ordinary material uses ordinary_material_prerequisite. When source_semantic_grounding and source_placement_grounding are both listed, semantic grounding wins: do not move the discarded ref. For source_placement_grounding alone, replace action_production with one direct move_entity using exactly {"op":"move_entity","entity_ref":"<grounded source ref>","placement":{"relation":"<allowed relation>","target_ref":"<player-safe target ref>"}}; preserve unexecuted transformation. Never combine move_entity and action_production in one plan. For domain_owner_unavailable, remove the unavailable domain operation and use a lawful direct reality_limited attempt constrained by supplied visible facts, preserving independent later intent. Owner absence does not establish physical impossibility or fantasy; code owns mechanics/state, so do not invent success, physical impossibility or an absent fantastical referent.'
              : 'Plan only the next executable semantic step and preserve any remaining intent.',
            ...(repairing ? [
              'For domain_owner_unavailable, owner absence does not change a physically plausible goal into reality_limited: use literal adaptation for the direct no-operation attempt.',
              'When operation_semantic_grounding rejects $.utterance, re-evaluate request.remaining_intent itself. Retain player_utterance only for actual speech or a vocal signal. Otherwise discard the invalid utterance and use the matching non-speech semantic mapping, preserving explicit duration. Typed first-person action prose is not speech.'
            ] : []),
            ...turnStepRepairSpecificInstructions(repairContext, request)
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
    const repairedOutput = repairing ? preserveUnrelatedOperationSelection(
      repairContext.original_output, response.output,
      repairContext.structural_errors, operationChoices) : response.output;
    const semanticOutput = repairing
      ? mergeRepairOutput(repairContext.original_output, repairedOutput,
          new Set(repairContext.structural_errors
            ?.filter(({ code }) => code === 'additional_property')
            .map(({ path }) => path) ?? []))
      : repairedOutput;
    if (repairing) for (const { path } of repairContext.structural_errors ?? []) {
      const key = /^\$\.([^.[\]]+)/u.exec(path)?.[1];
      if (key != null && !Object.hasOwn(repairedOutput, key)) delete semanticOutput[key];
    }
    if (repairing && Object.hasOwn(repairedOutput, 'direct_result_kind')
        && repairedOutput.direct_result_kind !== 'player_utterance') {
      delete semanticOutput.utterance;
    }
    const assembled = assembleTurnStepPlan(semanticOutput, input,
      operationChoices);
    return correctSupportedAssessment({ plan: assembled, input, roleRunner });
  };
  return model;
}

async function correctSupportedAssessment({ plan, input, roleRunner }) {
  const operation = plan?.resolution === 'domain_request'
    && plan.operations?.length === 1
    && plan.operations[0]?.op === 'request_discovery'
    ? plan.operations[0] : null;
  const claims = ['hard_constraints', 'facts'].flatMap((field) =>
    input?.world_knowledge?.[field] ?? []).filter((claim) =>
      typeof claim?.claim_ref === 'string'
      && typeof claim.runtime_text === 'string' && claim.runtime_text.trim());
  if (operation == null || claims.length === 0) return plan;
  const response = await roleRunner.run({
    scope: 'turn_runtime', role_id: 'turn_step_grounding_auditor',
    request_identity: input.request_id,
    messages: [{ role: 'system', content: [
      'Return only JSON with exactly mode and support_refs.',
      'mode is assessment or discovery. support_refs is an array.',
      'Choose assessment only when the whole remaining_intent is one qualitative judgment or comparison of facts already present in supplied_sensory_facts. It must request no new inspection, search, handling, movement, speech, or later independent action.',
      'For assessment, copy one or more claim_ref values whose runtime_text establishes a useful relationship or an explicit limit on the conclusion. For discovery, return an empty array.',
      'Prefer claims about the requested function, assembly, or material relation over generic care, inspection, storage, or unrelated historical use when both are available.',
      'Never use model memory or treat the proposed discovery as proof that new detail is needed.'
    ].join(' ') }, { role: 'user', content: JSON.stringify({
      remaining_intent: input.remaining_intent,
      supplied_sensory_facts:
        input.player_safe_state?.current_visible_context?.sensory_details ?? [],
      proposed_discovery: { discovery_kind: operation.discovery_kind,
        query: operation.query },
      world_knowledge: claims.map(({ claim_ref, runtime_text }) =>
        ({ claim_ref, runtime_text }))
    }) }],
    overrides: { temperature: 0 }
  });
  const choice = response?.output;
  const allowed = new Map(claims.map((claim) => [claim.claim_ref, claim]));
  if (choice?.constructor !== Object
      || Object.keys(choice).length !== 2
      || choice.mode !== 'assessment'
      || !Array.isArray(choice.support_refs) || choice.support_refs.length === 0
      || new Set(choice.support_refs).size !== choice.support_refs.length
      || choice.support_refs.some((ref) => !allowed.has(ref))) return plan;
  const selected = choice.support_refs.map((ref) => allowed.get(ref));
  return {
    ...plan,
    resolution: 'direct', goal_result: 'achieved',
    activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' },
    operations: [], check: null, continuation: null, clarification: null,
    direct_result_kind: 'player_safe_observation',
    assessment: { text: selected.map(({ runtime_text: text }) => text).join(' '),
      support_refs: [...choice.support_refs] },
    reason_code: 'supported_assessment',
    reason: 'Supplied sensory facts were assessed only through cited World Knowledge.'
  };
}

function plannerRequestWire(input) {
  const knowledge = input.world_knowledge;
  if (knowledge?.schema !== 'world_knowledge_slice_v1'
      || !['coverage', 'hard_constraints', 'facts', 'disputes', 'gaps']
        .every((field) => Array.isArray(knowledge[field]))) return input;
  // The WK owner renders context_text from these same structured fields.
  // Keep the grounded slice and its telemetry intact; omit only its wire duplicate.
  const { context_text, ...structured } = knowledge;
  return { ...input, world_knowledge: structured };
}

function preserveUnrelatedOperationSelection(original, repaired, errors,
  operationChoices) {
  if (!original || typeof original !== 'object' || Array.isArray(original)
      || !repaired || typeof repaired !== 'object' || Array.isArray(repaired)
      || !Array.isArray(errors) || errors.length === 0
      || errors.some(operationSelectionRepair)) return repaired;
  const result = { ...repaired };
  for (const key of ['operation_choice', 'operation_family', 'operations']) {
    if (Object.hasOwn(original, key)) result[key] = structuredClone(original[key]);
    else delete result[key];
  }
  if (result.operation_choice == null && result.operations?.length === 1) {
    const matches = operationChoices.filter(({ operation }) =>
      isDeepStrictEqual(operation, result.operations[0]));
    if (matches.length === 1) result.operation_choice = matches[0].choice_id;
  }
  return result;
}

function operationSelectionRepair({ path, code } = {}) {
  return typeof path === 'string' && [
    '$.operations', '$.operation_choice', '$.operation_family', '$.resolution'
  ].some((prefix) => path === prefix || path.startsWith(`${prefix}.`)
    || path.startsWith(`${prefix}[`))
    || ['json_parse_failed', 'continuation_progress',
      'operation_semantic_grounding']
      .includes(code);
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

/** Server-only O1 role: its request is built from committed enablement data. */
export { createOrdinaryMaterializationModel } from './ordinary-materialization-llm.js';
function requireRoleRunner(roleRunner) { if (typeof roleRunner?.run !== 'function') throw dependencyError('Configured LLM role runner is required.'); }
function dependencyError(message) { return serverError('TRACE_PHASE_2_DEPENDENCY_MISSING', message, { status: 503 }); }
