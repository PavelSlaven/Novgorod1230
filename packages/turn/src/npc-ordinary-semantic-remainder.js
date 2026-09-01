import { deepFreeze } from '@rus/kernel';
import {
  validateNpcOrdinarySemanticRemainderProposal,
  validateNpcOrdinarySemanticRemainderRequest
} from '@rus/npc-runtime';
import { turnFailure } from './errors.js';

export async function resolveNpcOrdinarySemanticRemainder({ request,
  roleRunner } = {}) {
  const safeRequest = snapshot(request);
  if (!validateNpcOrdinarySemanticRemainderRequest(safeRequest)) fail(
    'TURN_NPC_ORDINARY_REMAINDER_REQUEST_INVALID');
  if (typeof roleRunner?.run !== 'function') fail(
    'TURN_NPC_ORDINARY_REMAINDER_MODEL_MISSING');
  let response;
  try {
    response = await roleRunner.run({ scope: 'turn_runtime',
      role_id: 'npc_ordinary_semantic_remainder',
      request_identity: safeRequest.request_id,
      messages: [{ role: 'system', content: [
        'Return only one JSON object with exactly schema, request_id, ordinary_descriptor, ordinary_activity.',
        'schema must be npc_ordinary_semantic_remainder_proposal_v1 and request_id must be copied exactly.',
        'Write concise natural Russian phrases about one ordinary person as currently observable in a XIII-century scene.',
        'Use only supplied player-safe observable_context. Do not infer meaning from IDs or invent a name, biography, motive, knowledge, relationship, possession, speech, injury, route, hidden fact, authority, schedule, mechanics, number, or new entity.',
        'ordinary_descriptor is one concrete visual human detail consistent with supplied cues; ordinary_activity is one visible ordinary action consistent with the display label and scene, without changing formal schedule or world state.'
      ].join(' ') }, { role: 'user', content: JSON.stringify(safeRequest) }],
      overrides: { temperature: 0, maxTokens: 20_000 }
    });
  } catch (error) {
    throw turnFailure('TURN_NPC_ORDINARY_REMAINDER_MODEL_FAILED',
      'NPC ordinary semantic remainder model failed.', {
        cause: error instanceof Error ? error.message : String(error) });
  }
  const proposal = snapshot(response?.output);
  if (!validateNpcOrdinarySemanticRemainderProposal(proposal, safeRequest)) {
    fail('TURN_NPC_ORDINARY_REMAINDER_PROPOSAL_INVALID');
  }
  return deepFreeze(proposal);
}

function snapshot(value) { try { return structuredClone(value); } catch { return null; } }
function fail(code) { throw turnFailure(code, code); }
