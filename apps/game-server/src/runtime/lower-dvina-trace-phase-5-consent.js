import { computeSpatialV3CanonicalDigest } from
  '@rus/contracts/spatial-v3/registry';
import { decideBoundedNpcAction } from '@rus/npc-runtime';

export function resolveTracePhase5Consent({ state, contracts, inputDigest }) {
  const optionId = 'accept_first_aid';
  const policyRef = versioned('action_contract',
    contracts.consentPolicy.policy_id);
  const commandRef = versioned('decision_command',
    contracts.consentExecution.execution_binding_id);
  const consequenceRef = versioned('action_contract',
    contracts.consentExecution.execution_kind);
  const pins = [
    ['profile', policyRef],
    ['action_contract', commandRef],
    ['consequence_rule', consequenceRef]
  ].map(([dependency_role, ref]) => ({
    dependency_role,
    entity_ref: ref.entity_ref,
    version_pin: {
      pin_kind: 'authoring_version',
      authoring_version: ref.authoring_version
    }
  }));
  const option = {
    option_id: optionId,
    command_ref: commandRef,
    command_token: `npc-command:${inputDigest.slice(0, 32)}:${optionId}`,
    canonical_ordinal: 0,
    preconditions_digest: computeSpatialV3CanonicalDigest({
      state_version: state.party_state.state_version,
      option_id: optionId,
      helper_present: true,
      resources_present: true
    }),
    consequence_policy_ref: consequenceRef
  };
  const request = {
    request_id: `npc-decision:${inputDigest.slice(0, 32)}:onisim-consent`,
    npc_ref: {
      entity_kind: 'npc',
      entity_id: contracts.actors.onisim_boatman.instance_id
    },
    requested_at: structuredClone(state.clock),
    state_version: String(state.party_state.state_version),
    decision_policy_ref: policyRef,
    options_digest: computeSpatialV3CanonicalDigest([option]),
    dependency_pins: {
      pins,
      canonical_digest: computeSpatialV3CanonicalDigest({ pins })
    },
    options: [option]
  };
  const resolved = decideBoundedNpcAction({
    request,
    current_state_version: request.state_version,
    observed_preconditions_digest: option.preconditions_digest,
    validated_at: state.clock
  });
  if (!resolved.ok || resolved.trace.option_id !== optionId) {
    fail('TRACE_PHASE_5_CONSENT_REJECTED');
  }
  return Object.freeze({
    option_id: optionId,
    elapsed_minutes: 0,
    request: structuredClone(request),
    trace: structuredClone(resolved.trace)
  });
}

function versioned(kind, id) {
  return {
    entity_ref: { entity_kind: kind, entity_id: id },
    authoring_version: '1'
  };
}

function fail(code) {
  const error = new Error('Phase 5 consent failed closed.');
  error.code = code;
  throw error;
}
