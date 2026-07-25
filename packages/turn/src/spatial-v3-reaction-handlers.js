import {
  SPATIAL_V3_NPC_REACTION_HANDLER_BINDINGS,
  computeSpatialV3CanonicalDigest,
  validateSpatialV3Contract
} from '@rus/contracts/spatial-v3/registry';
import { deepFreeze } from '@rus/kernel';

const fail = (code, message) => deepFreeze({
  ok: false,
  error: { code, message },
  effect: null,
  proposal: null
});

const perceptionRef = (request) => ({
  entity_kind: 'perception_result',
  entity_id: request.consequence_input_snapshot.source_perception.perception_id
});

const HANDLERS = Object.freeze({
  'npc.reaction.investigate-signal.v1': (request) => ({
    target_ref: request.consequence_input_snapshot.reaction_scope_ref,
    source_perception_ref: perceptionRef(request),
    observed_preconditions_digest:
      request.consequence_input_snapshot.observed_preconditions_digest
  }),
  'npc.reaction.report-to-authority.v1': (request) => ({
    report_scope_ref: request.consequence_input_snapshot.reaction_scope_ref,
    subject_event_ref:
      request.consequence_input_snapshot.source_perception.event_ref,
    source_perception_ref: perceptionRef(request),
    observed_preconditions_digest:
      request.consequence_input_snapshot.observed_preconditions_digest
  }),
  'npc.reaction.seek-safety.v1': (request) => ({
    safe_target_ref: request.consequence_input_snapshot.reaction_scope_ref,
    source_perception_ref: perceptionRef(request),
    observed_preconditions_digest:
      request.consequence_input_snapshot.observed_preconditions_digest
  })
});

function buildEffect(request, binding, handler) {
  const payload = {
    effect_kind: binding.effect_kind,
    source_perception_ref: perceptionRef(request),
    successor_command_kind: binding.successor_command_kind,
    successor_command_payload: handler(request),
    effective_at: request.executed_at
  };
  return deepFreeze({
    ...payload,
    canonical_digest: computeSpatialV3CanonicalDigest(payload)
  });
}

function buildProposal(request, effect) {
  const payload = {
    request_id: request.request_id,
    npc_ref: request.npc_ref,
    option_id: request.selected_option.option_id,
    command_ref: request.command_record.command_ref,
    handler_id: request.command_record.handler_id,
    consequence_contract_name: request.command_record.consequence_contract_name,
    consequence_payload: effect,
    state_version: request.current_state_version,
    proposed_at: request.executed_at,
    dependency_pins: request.dependency_pins,
    canonical_input_digest: request.canonical_input_digest,
    request_snapshot: request
  };
  return deepFreeze({
    ...payload,
    canonical_digest: computeSpatialV3CanonicalDigest(payload)
  });
}

export function resolveSpatialV3NpcReaction({
  request,
  persisted_proposal = null
} = {}) {
  const requestErrors = validateSpatialV3Contract(
    'npc_reaction_consequence_request',
    request
  );
  if (requestErrors.length > 0) {
    return fail(
      requestErrors[0].code,
      'reaction request is not a complete current-state approved command input'
    );
  }
  const commandId = request.command_record.command_ref.entity_ref.entity_id;
  const binding = SPATIAL_V3_NPC_REACTION_HANDLER_BINDINGS[commandId];
  const handler = HANDLERS[request.command_record.handler_id];
  if (!binding || !handler || binding.handler_id !== request.command_record.handler_id) {
    return fail(
      'npc_decision_policy_gap',
      'approved reaction command has no single registered code-owned handler'
    );
  }

  const effect = buildEffect(request, binding, handler);
  const effectErrors = validateSpatialV3Contract(
    request.command_record.consequence_contract_name,
    effect
  );
  if (effectErrors.length > 0) {
    return fail(
      effectErrors[0].code,
      'registered reaction handler produced a non-formal effect'
    );
  }
  const proposal = buildProposal(request, effect);
  const proposalErrors = validateSpatialV3Contract(
    'npc_reaction_consequence_proposal',
    proposal
  );
  if (proposalErrors.length > 0) {
    return fail(
      proposalErrors[0].code,
      'registered reaction handler produced a request-unbound proposal'
    );
  }

  if (persisted_proposal !== null) {
    const persistedErrors = validateSpatialV3Contract(
      'npc_reaction_consequence_proposal',
      persisted_proposal
    );
    if (persistedErrors.length > 0
      || persisted_proposal.request_id !== request.request_id
      || persisted_proposal.canonical_input_digest !== request.canonical_input_digest
      || persisted_proposal.canonical_digest !== proposal.canonical_digest) {
      return fail(
        'idempotency_conflict',
        'persisted reaction proposal does not match the complete sealed request'
      );
    }
    return deepFreeze({
      ok: true,
      error: null,
      effect: persisted_proposal.consequence_payload,
      proposal: persisted_proposal,
      replay_status: 'already_committed'
    });
  }

  return deepFreeze({
    ok: true,
    error: null,
    effect,
    proposal,
    replay_status: 'new'
  });
}
