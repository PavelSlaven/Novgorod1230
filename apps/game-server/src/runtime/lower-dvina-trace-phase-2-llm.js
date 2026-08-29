import { createNarrationService } from '@rus/narration';
import { serverError } from '../errors.js';
import { SEMANTIC_RESOLVER_PROMPT, TURN_STEP_PLANNER_INSTRUCTIONS, TURN_STEP_PLAN_EXAMPLE, TURN_STEP_PLAN_MAPPINGS, npcConversationInstructions, playerConversationInstructions } from './lower-dvina-trace-phase-2-llm-prompts.js';
export { createLowerDvinaTraceNpcAutonomousModel } from './lower-dvina-trace-autonomous-llm.js';
export { createLowerDvinaTraceNpcCombatModel } from './lower-dvina-trace-combat-llm.js';
export function createLowerDvinaTraceSemanticResolver({
  roleRunner
} = {}) {
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
            'Return only one JSON object with schema turn_step_plan_v1.',
            'Do not add Markdown, prose outside JSON, or unknown fields.',
             `Use this full valid shape (echo request_id, committed_state_version, working_revision, and step_index exactly from request):\n${TURN_STEP_PLAN_EXAMPLE}`,
            `Use these mappings for the matching cases; angle-bracket values mean copy from request and must never be emitted literally:\n${TURN_STEP_PLAN_MAPPINGS}`,
            ...TURN_STEP_PLANNER_INSTRUCTIONS,
            'Do not infer a fantastical referent from player intent: it is absent unless player-safe state identifies it as a visible entity or capability.',
            'Classify interpretation.adaptation by the stated goal, not whether the actor can pantomime it. First: an absent fantastical required referent means make_believe. Otherwise: real or ordinary referents with a physically limited action mean reality_limited. Otherwise: literal. An ordinary unknown or absent referent is not thereby fantastical; preserve existing discovery/domain flow.',
            'When available_domain_operations contains an operation that covers the intent, use that operation unchanged; use action_production only when no supplied operation covers it.',
            ...(request.prepared_followup_candidates?.length ? [
              preparedFollowupPrompt(request.prepared_followup_candidates)
            ] : []),
            'Plan exactly one executable step. Sentence boundary is a continuation boundary. Plan only the first independently executable sentence. If request.remaining_intent has later non-empty sentences, always preserve all of them in continuation, use goal_result pending, and never let one selected operation consume them. Only clauses inside the same sentence may form one composite operation, and only when that operation explicitly represents their single event. One selected domain operation covers only its own grounded event; it may cover multiple verbs only when the selected operation explicitly represents every clause. Matching one clause, shared actor, place, time, or generic owner does not extend coverage. Preserve every independent uncovered clause in continuation, and use continuation null only when none remains. Every domain_request uses goal_result pending, including a complete composite with continuation null: pending means code-owned execution, not unhandled intent. If continuation is present, goal_result must be pending and continuation.remaining_intent must preserve every independent uncovered clause. Final continuation override for direct reality_limited or make_believe: a same-sentence clause whose stated action, purpose, manner, result, or qualifier depends on the same impossible or physically limited premise is covered by the same grounding, not continuation. Preserve only clauses independently executable without that premise and every later sentence; if none remain, set continuation to null.',
            repairing
              ? 'Repair only listed validation errors; preserve echoed request identity and unrelated fields. For domain_owner_unavailable, owner absence is not evidence of impossibility or fantasy: ordinary or unspecified intent stays literal. Do not invent a physical impossibility or absent fantastical referent; use a direct semantic plan limited to visible facts and physical reality unless an exact code-owned capability is available; code still owns exact mechanics and state.'
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
    return response.output;
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
    return response.output;
  };
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
    return response.output;
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

export function createLowerDvinaTraceNarrationService({
  roleRunner
} = {}) {
  requireRoleRunner(roleRunner);
  return createNarrationService({
    writer: {
      generate: (request) => runNarrationRole(
        roleRunner,
        'gameplay_narrator',
        'Return only one JSON object. Required complete shape: {"version":1,"schema":"narration_output","output_id":"<request_id>","prose":"<visible-only prose>","action_options":[],"used_references":[],"self_check":{}}. Copy request_id exactly into output_id; do not emit angle brackets literally. Use context.player_input only to understand attempted action or speech. It is never evidence of success or a new world fact. Ground every factual or result claim, action_options, used_references, and self_check exclusively in visible_context. An actionable object may be named only when it is already in the approved visible projection; narration never creates, discovers, or promotes an entity.',
        request
      )
    },
    formatRepairer: {
      repair: (request) => runNarrationRole(
        roleRunner,
        'gameplay_narrator_format_repair',
        'Return only one repaired JSON object. Required complete shape: {"version":1,"schema":"narration_output","output_id":"<request.request_id>","prose":"<visible-only prose>","action_options":[],"used_references":[],"self_check":{}}. Copy request.request_id exactly into output_id; do not emit angle brackets literally. Repair JSON shape only; prose, action_options, used_references, and self_check must remain grounded exclusively in request.visible_context.',
        request
      )
    },
    auditor: {
      audit: (request) => runNarrationRole(
        roleRunner,
        'gameplay_narrator_auditor',
        'Return only one narration_audit JSON object. Audit only the supplied full narration output against the same player-safe visible_context, style_policy, and segments. PASS exactly: {"version":1,"schema":"narration_audit","pass":true,"concerns":[],"evidence":["visible facts only"]}. FAIL exactly: {"version":1,"schema":"narration_audit","pass":false,"concerns":[{"segment_id":"<supplied segment_id>","kind":"unsupported_fact","reason":"<brief reason>"}],"evidence":["<brief visible-context evidence>"]}. Do not use hidden state, infer world facts, rewrite prose, add a fallback, or call any other role.',
        request
      )
    },
    semanticRepairer: {
      repair: (request) => runNarrationRole(
        roleRunner,
        'gameplay_narrator_semantic_repair',
        'Return only one narration_semantic_repair JSON object. Repair only supplied flagged segments using their concerns, read-only nearby_context, and player-safe visible_context. Return exactly {"version":1,"schema":"narration_semantic_repair","replacements":[{"segment_id":"<supplied flagged segment_id>","prose":"<replacement>"}]}. Keep every supplied segment_id immutable; return one replacement for each flagged segment and no others. Do not use hidden state, change neighboring segments, infer facts, add a fallback, or call any other role.',
        request
      )
    }
  });
}
async function runNarrationRole(roleRunner, roleId, instruction, request, maxTokens) {
  const response = await roleRunner.run({
    scope: 'turn_runtime',
    role_id: roleId,
    request_identity: request.request_id ?? request.request?.request_id,
    messages: [{
      role: 'system',
      content: instruction
    }, {
      role: 'user',
      content: JSON.stringify(request)
    }],
    overrides: { temperature: 0, ...(maxTokens ? { maxTokens } : {}) }
  });
  if (!response?.output || typeof response.output !== 'object') {
    throw dependencyError(`Narration role ${roleId} returned no JSON object.`);
  }
  return response.output;
}

function requireRoleRunner(roleRunner) {
  if (typeof roleRunner?.run !== 'function') {
    throw dependencyError('Configured LLM role runner is required.');
  }
}
function dependencyError(message) { return serverError('TRACE_PHASE_2_DEPENDENCY_MISSING', message, { status: 503 }); }
