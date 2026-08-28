import { createNarrationService } from '@rus/narration';
import { serverError } from '../errors.js';
import { NARRATION_AUDIT_MAX_TOKENS, NARRATION_AUDIT_PROMPT, SEMANTIC_RESOLVER_PROMPT, TURN_STEP_PLANNER_INSTRUCTIONS, TURN_STEP_PLAN_EXAMPLE, TURN_STEP_PLAN_MAPPINGS, npcConversationInstructions, playerConversationInstructions } from './lower-dvina-trace-phase-2-llm-prompts.js';
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
            repairing
              ? 'Repair only listed validation errors; preserve echoed request identity and unrelated fields. For domain_owner_unavailable, preserve intent with a direct semantic plan limited to visible facts and physical reality unless an exact code-owned capability is available; code still owns exact mechanics and state.'
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
      messages: [{
        role: 'system',
        content: playerConversationInstructions(repair)
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
        'legacy.narrator.dossier',
        'Return only one JSON object. Required complete shape: {"version":1,"schema":"narration_output","output_id":"<request_id>","prose":"<visible-only prose>","action_options":[],"used_references":[],"self_check":{}}. Copy request_id exactly into output_id; do not emit angle brackets literally. Ground prose, action_options, used_references, and self_check exclusively in visible_context. An actionable object may be named only when it is already in the approved visible projection; narration never creates, discovers, or promotes an entity.',
        request
      )
    },
    auditor: {
      audit: (request) => runNarrationRole(
        roleRunner,
        'legacy.narrator.audit',
        NARRATION_AUDIT_PROMPT,
        request,
        NARRATION_AUDIT_MAX_TOKENS
      )
    },
    formatRepairer: {
      repair: (request) => runNarrationRole(
        roleRunner,
        'legacy.narrator.dossier_repair',
        'Return only one repaired JSON object. Required complete shape: {"version":1,"schema":"narration_output","output_id":"<request.request_id>","prose":"<visible-only prose>","action_options":[],"used_references":[],"self_check":{}}. Copy request.request_id exactly into output_id; do not emit angle brackets literally. Repair JSON shape only; prose, action_options, used_references, and self_check must remain grounded exclusively in request.visible_context.',
        request
      )
    },
    seniorWriter: {
      repair: (request) => runNarrationRole(
        roleRunner,
        'legacy.narrator.repair',
        'Return a corrected narration_output using only visible facts.',
        request
      )
    },
    seniorAuditor: {
      audit: (request) => runNarrationRole(
        roleRunner,
        'legacy.narrator.audit',
        NARRATION_AUDIT_PROMPT,
        request,
        NARRATION_AUDIT_MAX_TOKENS
      )
    },
    router: {
      async route(request) {
        return {
          version: 1,
          schema: 'narration_repair_route',
          route: request.repairs_remaining > 0
            ? 'semantic_rewrite'
            : 'block',
          reason: 'VISIBLE_ONLY_AUDIT_FAILED'
        };
      }
    }
  });
}
async function runNarrationRole(roleRunner, roleId, instruction, request, maxTokens) {
  const response = await roleRunner.run({
    scope: 'legacy_world',
    role_id: roleId,
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
