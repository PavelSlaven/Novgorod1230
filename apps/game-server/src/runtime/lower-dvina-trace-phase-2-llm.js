import { createNarrationService } from '@rus/narration';
import { serverError } from '../errors.js';

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
        content: [
          'Resolve the raw Russian player text against the complete closed',
          'option set. Return either {"status":"unknown","reason_code":',
          '"unknown_intent"} or exactly {"option_id":"<one offered option_id>"}.',
          'Never add consequences, time, checks, facts, writes or narration.'
        ].join(' ')
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

export function createLowerDvinaTraceNarrationService({
  roleRunner
} = {}) {
  requireRoleRunner(roleRunner);
  return createNarrationService({
    writer: {
      generate: (request) => runNarrationRole(
        roleRunner,
        'legacy.narrator.dossier',
        'Return only narration_output JSON grounded exclusively in visible_context.',
        request
      )
    },
    auditor: {
      audit: (request) => runNarrationRole(
        roleRunner,
        'legacy.narrator.audit',
        'Return only narration_audit JSON. Reject every unsupported fact.',
        request
      )
    },
    formatRepairer: {
      repair: (request) => runNarrationRole(
        roleRunner,
        'legacy.narrator.dossier_repair',
        'Repair only the JSON shape requested by the embedded contract.',
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
        'Return a strict narration_audit JSON for the supplied visible facts.',
        request
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

async function runNarrationRole(roleRunner, roleId, instruction, request) {
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
    overrides: { temperature: 0 }
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

function dependencyError(message) {
  return serverError(
    'TRACE_PHASE_2_DEPENDENCY_MISSING',
    message,
    { status: 503 }
  );
}
